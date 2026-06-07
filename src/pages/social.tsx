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

  // For each owner-authored post in the timeline, mark whether it's
  // the head of a self-thread (has at least one same-author reply that
  // is itself NOT replying to another owner post — i.e. the post is
  // the chain's root). Single batched query so we don't do N+1 work.
  const ownPostIds = timeline
    .filter((p) => p.accountId === owner.id && p.replyTargetId == null)
    .map((p) => p.id);
  let threadHeads = new Map<string, number>();
  if (ownPostIds.length > 0) {
    const replyRows = await db
      .select({ replyTargetId: posts.replyTargetId })
      .from(posts)
      .where(
        and(
          eq(posts.accountId, owner.id),
          inArray(posts.replyTargetId, ownPostIds),
        ),
      );
    const counts = new Map<string, number>();
    for (const row of replyRows) {
      if (row.replyTargetId == null) continue;
      counts.set(
        row.replyTargetId,
        (counts.get(row.replyTargetId) ?? 0) + 1,
      );
    }
    threadHeads = counts;
  }

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

      <form
        method="post"
        action="/social/compose"
        enctype="multipart/form-data"
        class="mini-compose"
        data-mini-compose
      >
        <div class="mc-row">
          <textarea
            name="content"
            spellcheck={false}
            rows={1}
            placeholder="✎ what's happening?  ·  ⌘↵ post  ·  [c] full editor"
            data-mini-compose-ta
          />
          <button type="submit" class="send" data-mini-compose-send>
            post ↵
          </button>
        </div>
        <div class="mc-tools" data-mini-compose-tools>
          <label class="tool" title="content warning">
            ⚠
            <input
              type="checkbox"
              name="sensitive"
              value="true"
              style="display:none;"
            />
          </label>
          <label class="tool" title="attach image/video">
            🖼
            <input
              type="file"
              name="media"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm"
              style="display:none;"
            />
          </label>
          <select name="visibility" class="vis">
            <option value="public">▾ public</option>
            <option value="unlisted">▾ unlisted</option>
            <option value="private">▾ followers</option>
            <option value="direct">▾ direct</option>
          </select>
          <input
            type="text"
            name="spoiler_text"
            placeholder="content warning…"
            class="mc-cw"
          />
          <span class="sp" />
          <span class="count" data-mini-compose-count>
            <b>500</b> left
          </span>
        </div>
      </form>

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
        timeline.map((post) => {
          const partCount = threadHeads.get(post.id);
          return (
            <TimelineEntry
              post={post}
              mine={post.accountId === owner.id}
              openHref={
                post.sharing != null
                  ? `/@${post.sharing.account.handle.replace(/^@/, "")}/${post.sharing.id}`
                  : `/@${owner.handle}/${post.id}`
              }
              threadPartCount={
                partCount != null ? partCount + 1 : undefined
              }
              threadHandle={owner.handle}
            />
          );
        })
      )}

      {timeline.length > 0 && (
        <div class="endcap">
          — end of recent · <span class="gn">[r]</span> refresh · federated via
          ActivityPub —
        </div>
      )}

      <script
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const form = document.querySelector('[data-mini-compose]');
  if (!form) return;
  const ta = form.querySelector('[data-mini-compose-ta]');
  const counter = form.querySelector('[data-mini-compose-count] b');
  const tools = form.querySelector('[data-mini-compose-tools]');
  const cw = form.querySelector('input[name="sensitive"]');
  const cwTool = cw && cw.closest('.tool');
  const attach = form.querySelector('input[name="media"]');
  const attachTool = attach && attach.closest('.tool');
  const max = 500;

  // Expand on focus or any input; collapse if empty and blurred.
  function expand(){ form.classList.add('open'); }
  function maybeCollapse(){
    if (document.activeElement && form.contains(document.activeElement)) return;
    if (ta.value.trim() === '' && !cw.checked && (!attach.files || attach.files.length === 0)) {
      form.classList.remove('open');
    }
  }
  ta.addEventListener('focus', expand);
  ta.addEventListener('input', () => {
    expand();
    // Auto-grow textarea while expanded.
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
    // Update counter.
    const left = max - ta.value.length;
    if (counter){
      counter.textContent = String(left);
      counter.style.color = left < 0 ? 'var(--red)' : 'var(--ac)';
    }
  });
  form.addEventListener('focusout', () => setTimeout(maybeCollapse, 50));
  // Cmd/Ctrl+Enter submits.
  ta.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      form.requestSubmit();
    }
  });
  // Highlight CW tool when checkbox is checked.
  if (cw && cwTool) {
    cw.addEventListener('change', () => {
      cwTool.style.borderColor = cw.checked ? 'var(--am)' : '';
      cwTool.style.color = cw.checked ? 'var(--am)' : '';
      expand();
    });
  }
  // Show attached file count on the image tool.
  if (attach && attachTool) {
    attach.addEventListener('change', () => {
      const n = attach.files ? attach.files.length : 0;
      if (n > 0) {
        attachTool.style.borderColor = 'var(--ac)';
        attachTool.style.color = 'var(--ac)';
        attachTool.title = n + ' file' + (n > 1 ? 's' : '') + ' attached';
        expand();
      } else {
        attachTool.style.borderColor = '';
        attachTool.style.color = '';
      }
    });
  }
})();`,
        }}
      />
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
  const inReplyToRaw = form.get("in_reply_to_id")?.toString()?.trim();
  // Accept only an owner-authored target so the value can't be used to
  // smuggle a forged reply context.
  let inReplyToId: Uuid | null = null;
  if (inReplyToRaw && inReplyToRaw.length === 36) {
    const target = await db.query.posts.findFirst({
      where: eq(posts.id, inReplyToRaw as Uuid),
      columns: { id: true, accountId: true, iri: true },
    });
    if (target != null && target.accountId === owner.id) {
      inReplyToId = target.id;
    }
  }

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
    replyTargetId: inReplyToId,
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
