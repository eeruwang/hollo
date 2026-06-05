import { and, desc, eq } from "drizzle-orm";
import { escape } from "es-toolkit";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { bookmarks } from "../schema.ts";
import { renderCustomEmojis } from "../text.ts";
import type { Uuid } from "../uuid.ts";

const bookmarksPage = new Hono();

bookmarksPage.use(loginRequired);

bookmarksPage.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  const rows = await db.query.bookmarks.findMany({
    where: eq(bookmarks.accountOwnerId, owner.id),
    with: {
      post: {
        with: {
          account: true,
          media: true,
          poll: { with: { options: true } },
        },
      },
    },
    orderBy: [desc(bookmarks.created)],
    limit: 100,
  });

  return c.html(
    <DashboardLayout
      title="~/bookmarks · Hollo"
      selectedMenu="bookmarks"
      shellPath="bookmarks"
      shellStatus={`bookmarks · ${rows.length} saved`}
      shellHints={[
        { key: "j/k", label: "move" },
        { key: "Enter", label: "open" },
        { key: "x", label: "remove" },
        { key: "/", label: "search" },
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">bookmarks</span> <span class="arg">--list</span>{" "}
        <span class="dimc">
          · {rows.length} saved · private to you
        </span>
      </div>

      {rows.length === 0 ? (
        <div class="state">
          <div class="glyph">⌗</div>
          <div class="ttl">nothing saved yet</div>
          <div class="msg">
            save a post from its conversation view to find it again here.
          </div>
        </div>
      ) : (
        rows.map((bookmark) => (
          <BookmarkEntry
            bookmark={bookmark}
            isMine={bookmark.post?.accountId === owner.id}
          />
        ))
      )}

      {rows.length > 0 && (
        <div class="endcap">
          — {rows.length} bookmark{rows.length === 1 ? "" : "s"} ·{" "}
          <span class="gn">[/]</span> search ·{" "}
          <span class="gn">[x]</span> remove · only you can see this —
        </div>
      )}
    </DashboardLayout>,
  );
});

bookmarksPage.post("/:postId/remove", async (c) => {
  const owner = await db.query.accountOwners.findFirst();
  if (owner == null) return c.redirect("/accounts");
  const postId = c.req.param("postId") as Uuid;
  await db
    .delete(bookmarks)
    .where(
      and(
        eq(bookmarks.accountOwnerId, owner.id),
        eq(bookmarks.postId, postId),
      ),
    );
  return c.redirect("/bookmarks");
});

function BookmarkEntry({
  bookmark,
  isMine,
}: {
  bookmark: {
    created: Date;
    post: {
      id: string;
      accountId: string;
      contentHtml: string | null;
      summary: string | null;
      likesCount: number | null;
      account: {
        name: string;
        handle: string;
        emojis: Record<string, string>;
      };
      emojis: Record<string, string>;
    } | null;
  };
  isMine: boolean;
}) {
  const post = bookmark.post;
  if (post == null) return null;
  const openHref = `/@${post.account.handle.replace(/^@/, "")}/${post.id}`;
  const html = renderCustomEmojis(post.contentHtml ?? "", post.emojis);
  const nameHtml = renderCustomEmojis(
    escape(post.account.name),
    post.account.emojis,
  );
  const saved = bookmark.created.toLocaleDateString("en", {
    month: "2-digit",
    day: "2-digit",
  });
  return (
    <article
      class={`entry${isMine ? " mine" : ""}`}
      data-open={openHref}
    >
      <div class="meta">
        <span class="au" dangerouslySetInnerHTML={{ __html: nameHtml }} />{" "}
        <span class="ts">{post.account.handle}</span>
      </div>
      {post.contentHtml != null && (
        <div class="txt" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      <div class="acts">
        <span class="muted">saved {saved} · </span>
        <span class="a fav">
          ♥ <b>{post.likesCount ?? 0}</b>
        </span>
        <form
          method="post"
          action={`/bookmarks/${post.id}/remove`}
          style="display:inline;"
        >
          <button
            type="submit"
            class="muted"
            style="background:none;border:none;cursor:pointer;color:inherit;font:inherit;padding:0;"
          >
            ⌗ remove
          </button>
        </form>
      </div>
    </article>
  );
}

export default bookmarksPage;
