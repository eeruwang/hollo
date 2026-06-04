import { Note } from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import mime from "mime";
import sharp from "sharp";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import { Post as PostView } from "../components/Post.tsx";
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
      title="Social — Hollo"
      selectedMenu="social"
      themeColor={owner.themeColor}
    >
      <hgroup>
        <h1>Social</h1>
        <p>Compose and view your posts.</p>
      </hgroup>

      <form
        method="post"
        action="/social/compose"
        enctype="multipart/form-data"
        class="social-composer"
      >
        <div class="social-composer-card">
          <textarea
            name="content"
            placeholder="What's on your mind?"
            required
            rows={4}
            class="social-composer-text"
          />
          <div class="social-composer-divider" />
          <div class="social-composer-row">
            <input
              type="text"
              name="spoiler_text"
              placeholder="Content warning (optional)"
              class="social-composer-field"
            />
            <label class="social-composer-chip">
              <input type="checkbox" name="sensitive" value="true" />
              <span>Sensitive</span>
            </label>
          </div>
          <div class="social-composer-row">
            <label class="social-composer-attach">
              <input
                type="file"
                name="media"
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm"
              />
              <span class="social-composer-attach-label">&#43; Attach</span>
              <span class="social-composer-attach-count" />
            </label>
            <input
              type="text"
              name="media_description"
              placeholder="Alt text for attachments"
              class="social-composer-field"
            />
          </div>
          <div class="social-composer-divider" />
          <div class="social-composer-bottom">
            <div class="social-composer-selects">
              <select name="visibility" class="social-composer-select">
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Followers only</option>
                <option value="direct">Direct</option>
              </select>
              <select name="language" class="social-composer-select">
                <option value="">Default ({owner.language})</option>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option value={opt.code}>
                    {opt.label} ({opt.code})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" class="social-composer-submit">
              Post
            </button>
          </div>
        </div>
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const attach = document.querySelector('.social-composer-attach');
  if (!attach) return;
  const input = attach.querySelector('input[type="file"]');
  const count = attach.querySelector('.social-composer-attach-count');
  if (!input || !count) return;
  input.addEventListener('change', () => {
    const n = input.files ? input.files.length : 0;
    if (n === 0) { count.textContent = ''; attach.classList.remove('has-files'); return; }
    count.textContent = n + ' file' + (n > 1 ? 's' : '');
    attach.classList.add('has-files');
  });
})();`,
        }}
      />

      <h2>Recent Posts</h2>
      {timeline.length === 0 ? (
        <p>No posts yet. Write your first post above!</p>
      ) : (
        timeline.map((post) => <PostView post={post} />)
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
