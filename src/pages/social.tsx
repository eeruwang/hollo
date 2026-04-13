import { Note } from "@fedify/fedify";
import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import { Post as PostView } from "../components/Post.tsx";
import db from "../db.ts";
import fedi from "../federation";
import { loginRequired } from "../login.ts";
import { accountOwners, posts } from "../schema.ts";
import { formatPostContent } from "../text.ts";
import { uuidv7 } from "../uuid.ts";

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

      <form method="post" action="/social/compose">
        <fieldset>
          <textarea
            name="content"
            placeholder="What's on your mind?"
            required
            rows={4}
            style="resize: vertical;"
          />
          <div
            style="display: flex; gap: 8px; align-items: center; margin-top: 8px;"
          >
            <select name="visibility" style="width: auto; margin: 0;">
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Followers only</option>
              <option value="direct">Direct</option>
            </select>
            <input
              type="text"
              name="spoiler_text"
              placeholder="Content warning (optional)"
              style="flex: 1; margin: 0;"
            />
            <button type="submit">Post</button>
          </div>
        </fieldset>
      </form>

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

  if (!content) return c.redirect("/social");

  const id = uuidv7();
  const handle = owner.handle;
  const fedCtx = fedi.createContext(c.req.raw, undefined);
  const url = fedCtx.getObjectUri(Note, { username: handle, id });
  const documentLoader = await fedCtx.getDocumentLoader({
    identifier: owner.id,
  });

  const fmtResult = await formatPostContent(db, content, owner.account.language, {
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
    content,
    language: owner.account.language,
    tags,
    emojis: fmtResult.emojis,
    sensitive: false,
    url: url.href,
    published: sql`CURRENT_TIMESTAMP`,
  });

  return c.redirect("/social");
});

social.post("/delete/:id", async (c) => {
  const postId = c.req.param("id");
  const owner = await db.query.accountOwners.findFirst();
  if (owner == null) return c.redirect("/accounts");

  await db
    .delete(posts)
    .where(eq(posts.id, postId));

  return c.redirect("/social");
});

export default social;
