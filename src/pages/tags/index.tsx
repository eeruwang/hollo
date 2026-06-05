import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../../components/DashboardLayout.tsx";
import { TimelineEntry } from "../../components/TimelineEntry.tsx";
import { db } from "../../db.ts";
import { isLoggedIn } from "../../login.ts";
import { accountOwners, posts } from "../../schema.ts";

const tags = new Hono().basePath("/:tag");

tags.get(async (c) => {
  const rawTag = c.req.param("tag");
  const tag = rawTag.replace(/^#/, "").toLowerCase();
  const hashtag = `#${tag}`;
  const handleFilter = c.req.query("handle");
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/setup");

  const tagPosts = await db.query.posts.findMany({
    where: and(
      sql`${posts.tags} ? ${hashtag}`,
      eq(posts.visibility, "public"),
      handleFilter == null
        ? undefined
        : eq(
            posts.accountId,
            db
              .select({ id: accountOwners.id })
              .from(accountOwners)
              .where(eq(accountOwners.handle, handleFilter)),
          ),
    ),
    orderBy: desc(posts.id),
    limit: 40,
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
  });

  const recent = tagPosts.filter(
    (p) =>
      (p.published ?? p.updated).getTime() >
      Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).length;
  const loggedIn = await isLoggedIn(c);

  // Logged-out visitors get a stripped-down view (no rail) reusing the
  // same DashboardLayout markup for now; if they hit an action it'll
  // route them through login. A full PublicTag view can come later.
  void loggedIn;

  return c.html(
    <DashboardLayout
      title={`#${tag} · Hollo`}
      selectedMenu="settings"
      shellPath={`tags/${tag}`}
      shellStatus={`#${tag} · ${tagPosts.length} posts`}
      themeColor={owner.themeColor}
      shellHints={[
        { key: "j/k", label: "move" },
        { key: "Enter", label: "open" },
        { key: "f", label: "follow tag" },
      ]}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">tag</span> <span class="arg">#{tag}</span>
      </div>

      <div class="taghero" style="margin-bottom:18px;">
        <h1
          class="tag"
          style="font-family:var(--mono); font-size:30px; margin:0 0 5px;"
        >
          #{tag}
        </h1>
        <div class="muted">
          {tagPosts.length} posts · {recent} this week
        </div>
      </div>

      {tagPosts.length === 0 ? (
        <div class="state">
          <div class="glyph">#</div>
          <div class="ttl">no posts with #{tag} yet</div>
          <div class="msg">
            once someone you follow uses this hashtag it'll show up here.
          </div>
        </div>
      ) : (
        tagPosts.map((post) => (
          <TimelineEntry
            post={post}
            mine={post.accountId === owner.id}
            openHref={`/@${post.account.handle.replace(/^@/, "")}/${post.id}`}
          />
        ))
      )}

      {tagPosts.length > 0 && (
        <div class="endcap">
          — {tagPosts.length} of all #{tag} posts ·{" "}
          <span class="gn">[/]</span> search · <span class="gn">[r]</span>{" "}
          refresh —
        </div>
      )}
    </DashboardLayout>,
  );
});

export default tags;
