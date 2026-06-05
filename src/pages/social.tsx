import { Note } from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import mime from "mime";
import sharp from "sharp";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import { TimelineEntry } from "../components/TimelineEntry.tsx";
import db from "../db.ts";
import fedi from "../federation";
import { loginRequired } from "../login.ts";
import { makeVideoScreenshot, uploadThumbnail } from "../media.ts";
import { media, posts, timelinePosts } from "../schema.ts";
import { drive } from "../storage.ts";
import { formatPostContent } from "../text.ts";
import { type Uuid, uuidv7 } from "../uuid.ts";

const logger = getLogger(["hollo", "pages", "social"]);

const social = new Hono();

social.use(loginRequired);

social.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  const timeline = await db.query.posts.findMany({
    where: and(
      inArray(
        posts.id,
        db
          .select({ id: timelinePosts.postId })
          .from(timelinePosts)
          .where(eq(timelinePosts.accountId, owner.id))
          .orderBy(desc(timelinePosts.postId))
          .limit(40),
      ),
      lte(posts.published, sql`NOW() + INTERVAL '5 minutes'`),
    ),
    with: {
      account: true,
      media: true,
      poll: { with: { options: true } },
      sharing: {
        with: {
          account: true,
          media: true,
          poll: { with: { options: true } },
          replyTarget: { with: { account: true } },
          reactions: true,
        },
      },
      replyTarget: { with: { account: true } },
      reactions: true,
    },
    orderBy: [desc(posts.published)],
    limit: 40,
  });

  return c.html(
    <DashboardLayout
      title="~/timeline · Hollo"
      selectedMenu="home"
      shellPath="timeline"
      shellStatus={`home · ${timeline.length} posts`}
      shellHints={[
        { key: "j/k", label: "move" },
        { key: "f", label: "fav" },
        { key: "b", label: "boost" },
        { key: "Enter", label: "open" },
        { key: "c", label: "compose" },
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">timeline</span> <span class="arg">--home</span>
      </div>

      {timeline.length === 0 ? (
        <div class="state">
          <div class="glyph">⌂</div>
          <div class="ttl">your timeline is quiet</div>
          <div class="msg">
            follow accounts on the fediverse and their posts will land here.
          </div>
          <a class="cta btn pri" href="/compose">
            ＋ write your first post
          </a>
        </div>
      ) : (
        timeline.map((post) => (
          <TimelineEntry
            post={post}
            mine={post.accountId === owner.id}
            openHref={
              post.sharing != null
                ? `/@${post.sharing.account.handle.replace(/^@/, "")}/${post.sharing.id}`
                : `/@${owner.handle}/${post.id}`
            }
          />
        ))
      )}

      {timeline.length > 0 && (
        <div class="endcap">
          — end of recent · <span class="gn">[r]</span> refresh · federated via
          ActivityPub —
        </div>
      )}
    </DashboardLayout>,
  );
});

social.post("/compose", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  const form = await c.req.formData();
  const content = form.get("content")?.toString()?.trim();
  const visibility =
    (form.get("visibility")?.toString() as
      | "public"
      | "unlisted"
      | "private"
      | "direct") ?? "public";
  const spoilerText = form.get("spoiler_text")?.toString()?.trim() || null;
  const sensitive = form.get("sensitive") === "true";
  const languageRaw = form.get("language")?.toString()?.trim();
  const language =
    languageRaw && languageRaw.length > 0 ? languageRaw : owner.language;
  const mediaFiles = form
    .getAll("media")
    .filter((v): v is File => v instanceof File && v.size > 0);
  const mediaDescription =
    form.get("media_description")?.toString()?.trim() || undefined;

  if (!content && mediaFiles.length === 0) return c.redirect("/social");

  const id = uuidv7();
  const handle = owner.handle;
  const fedCtx = fedi.createContext(c.req.raw, undefined);
  const url = fedCtx.getObjectUri(Note, { username: handle, id });
  const documentLoader = await fedCtx.getDocumentLoader({
    identifier: owner.id,
  });

  const fmtResult = await formatPostContent(db, content ?? "", owner.language, {
    url: fedCtx.getActorUri(owner.id),
    documentLoader,
  });

  const hashtags = fmtResult.hashtags;
  const tags = Object.fromEntries(
    hashtags.map((tag) => [
      tag.toLowerCase(),
      new URL(`/tags/${encodeURIComponent(tag.substring(1))}`, c.req.url).href,
    ]),
  );

  await db.insert(posts).values({
    id,
    iri: url.href,
    type: "Note",
    accountId: owner.id,
    visibility,
    summary: spoilerText,
    contentHtml: fmtResult.html,
    content: content ?? "",
    language,
    tags,
    emojis: fmtResult.emojis,
    sensitive: sensitive || spoilerText != null,
    url: url.href,
    published: sql`CURRENT_TIMESTAMP`,
  });

  // Process uploaded media after the post row is in place so the FK
  // on media.postId is satisfied. One bad file shouldn't kill the
  // post — log and skip, keep going for the rest.
  for (const file of mediaFiles) {
    try {
      await attachMediumToPost(file, id, mediaDescription);
    } catch (error) {
      logger.warning(
        "Failed to attach uploaded medium {name} to post {id}: {error}",
        { name: file.name, id, error },
      );
    }
  }

  return c.redirect("/social");
});

async function attachMediumToPost(
  file: File,
  postId: Uuid,
  description: string | undefined,
): Promise<void> {
  const disk = drive.use();
  const mediumId = uuidv7();
  const imageData = new Uint8Array(await file.arrayBuffer());
  const isVideo = file.type.startsWith("video/");
  const imageBytes = isVideo ? await makeVideoScreenshot(imageData) : imageData;
  const image = sharp(imageBytes).rotate();
  const rmMetaImage = await image.keepIccProfile().toBuffer();
  const fileMetadata = await sharp(rmMetaImage).metadata();
  const content = isVideo
    ? new Uint8Array(imageData)
    : new Uint8Array(rmMetaImage);

  const extension = mime.getExtension(file.type);
  if (extension == null) {
    throw new Error(`Unsupported media type: ${file.type}`);
  }
  const sanitizedExt = extension.replace(/[/\\]/g, "");
  const path = `media/${mediumId}/original.${sanitizedExt}`;
  await disk.put(path, content, {
    contentType: file.type,
    contentLength: content.byteLength,
    visibility: "public",
  });
  const url = await disk.getUrl(path);
  await db.insert(media).values({
    id: mediumId,
    postId,
    type: file.type,
    url,
    width: fileMetadata.width!,
    height: fileMetadata.height!,
    description,
    ...(await uploadThumbnail(mediumId, image)),
  });
}

social.post("/delete/:id", async (c) => {
  const postId = c.req.param("id") as Uuid;
  const owner = await db.query.accountOwners.findFirst();
  if (owner == null) return c.redirect("/accounts");

  await db.delete(posts).where(eq(posts.id, postId));

  return c.redirect("/social");
});

export default social;
