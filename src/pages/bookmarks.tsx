import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import { TimelineEntry } from "../components/TimelineEntry.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { bookmarks } from "../schema.ts";

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
          reactions: true,
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
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">bookmarks</span>{" "}
        <span class="arg">--list</span>{" "}
        <span class="dimc">· {rows.length} saved · private to you</span>
      </div>

      {rows.length === 0 ? (
        <p class="muted">
          — no bookmarks yet · save a post from its conversation view —
        </p>
      ) : (
        rows.map((bookmark) => {
          const post = bookmark.post;
          if (post == null) return null;
          const isMine = post.accountId === owner.id;
          return (
            <TimelineEntry
              post={post as Parameters<typeof TimelineEntry>[0]["post"]}
              mine={isMine}
              openHref={`/@${post.account.handle.replace(/^@/, "")}/${post.id}`}
            />
          );
        })
      )}

      {rows.length > 0 && (
        <div class="endcap">
          — {rows.length} bookmark{rows.length === 1 ? "" : "s"} · only you
          can see this —
        </div>
      )}
    </DashboardLayout>,
  );
});

export default bookmarksPage;
