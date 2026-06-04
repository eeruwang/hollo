import { Note } from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import mime from "mime";
import sharp from "sharp";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import { TimelineEntry } from "../components/TimelineEntry.tsx";
import db from "../db.ts";
import fedi from "../federation";
import { loginRequired } from "../login.ts";
import { makeVideoScreenshot, uploadThumbnail } from "../media.ts";
import { media, posts } from "../schema.ts";
import { drive } from "../storage.ts";
import { formatPostContent } from "../text.ts";
import { type Uuid, uuidv7 } from "../uuid.ts";

const logger = getLogger(["hollo", "pages", "social"]);

// A small curated language list shown in the composer on top of the
// owner's configured account language. Values are ISO 639-1 codes.
const LANGUAGE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "ko", label: "Korean" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ru", label: "Russian" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
];

const social = new Hono();

social.use(loginRequired);

social.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  const timeline = await db.query.posts.findMany({
    where: eq(posts.accountId, owner.id),
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
          quoteTarget: {
            with: {
              account: true,
              media: true,
              poll: { with: { options: true } },
              replyTarget: { with: { account: true } },
              reactions: true,
            },
          },
          reactions: true,
        },
      },
      replyTarget: { with: { account: true } },
      quoteTarget: {
        with: {
          account: true,
          media: true,
          poll: { with: { options: true } },
          replyTarget: { with: { account: true } },
          reactions: true,
        },
      },
      reactions: true,
    },
    orderBy: [desc(posts.published)],
    limit: 30,
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
        <span class="cmd">timeline</span>{" "}
        <span class="arg">--home</span>
      </div>

      <details
        style="border:1px solid var(--bd); padding:9px 12px; margin-bottom:14px;"
      >
        <summary style="cursor:pointer; color:var(--ac);">
          ＋ quick compose
        </summary>
        <form
          method="post"
          action="/social/compose"
          enctype="multipart/form-data"
          style="margin-top:11px;"
        >
          <textarea
            name="content"
            placeholder="$ post --message ..."
            required
            rows={3}
            style="width:100%; background:transparent; border:1px solid var(--bd); padding:8px; color:var(--fgs); font-family:var(--mono); font-size:13.5px; line-height:1.65; resize:vertical; outline:none;"
          />
          <input
            type="text"
            name="spoiler_text"
            placeholder="content warning (optional)"
            style="width:100%; margin-top:7px; background:transparent; border:1px solid var(--bd); padding:6px 8px; color:var(--fg); font-family:var(--mono); font-size:12.5px; outline:none;"
          />
          <div
            style="display:flex; align-items:center; gap:10px; margin-top:9px; flex-wrap:wrap;"
          >
            <label class="muted" style="font-size:12px;">
              <input type="checkbox" name="sensitive" value="true" /> sensitive
            </label>
            <label class="muted" style="font-size:12px;">
              <input
                type="file"
                name="media"
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm"
              />
            </label>
            <select
              name="visibility"
              style="background:var(--bg2); border:1px solid var(--bd); color:var(--fg); font-family:var(--mono); font-size:12px; padding:5px 8px;"
            >
              <option value="public">public</option>
              <option value="unlisted">unlisted</option>
              <option value="private">followers</option>
              <option value="direct">direct</option>
            </select>
            <select
              name="language"
              style="background:var(--bg2); border:1px solid var(--bd); color:var(--fg); font-family:var(--mono); font-size:12px; padding:5px 8px;"
            >
              <option value="">{owner.language}</option>
              {LANGUAGE_OPTIONS.map((opt) => (
                <option value={opt.code}>{opt.code}</option>
              ))}
            </select>
            <button
              type="submit"
              class="btn pri"
              style="margin-left:auto; padding:5px 14px; font-size:12.5px;"
            >
              post ↵
            </button>
          </div>
        </form>
      </details>

      {timeline.length === 0 ? (
        <p class="muted">
          — empty timeline · use <span class="gn">[c]</span> to compose —
        </p>
      ) : (
        timeline.map((post) => (
          <TimelineEntry post={post} mine={true} openHref={`/@${owner.handle}/${post.id}`} />
        ))
      )}

      <div class="endcap">
        — end of recent · <span class="gn">[r]</span> refresh · federated via
        ActivityPub —
      </div>
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
    class: null,
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
  const postId = c.req.param("id");
  const owner = await db.query.accountOwners.findFirst();
  if (owner == null) return c.redirect("/accounts");

  await db.delete(posts).where(eq(posts.id, postId));

  return c.redirect("/social");
});

export default social;
