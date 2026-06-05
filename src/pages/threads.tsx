import { and, desc, eq, exists, sql } from "drizzle-orm";
import { Hono } from "hono";
import { alias } from "drizzle-orm/pg-core";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { posts } from "../schema.ts";

const threadsPage = new Hono();

threadsPage.use(loginRequired);

threadsPage.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  // A self-thread "head" is a post by the owner that:
  // - isn't a reply to another of the owner's posts (so it's the chain
  //   root), and
  // - HAS at least one same-author reply (so the chain has length ≥ 2).
  const reply = alias(posts, "reply");
  const ownerId = owner.id;

  // Heads of self-threads. We pull a generous limit and filter.
  const candidates = await db.query.posts.findMany({
    where: and(
      eq(posts.accountId, ownerId),
      // root: replyTargetId is NULL OR replyTargetId points to a post
      // that isn't the owner's.
      sql`(${posts.replyTargetId} IS NULL OR NOT EXISTS (SELECT 1 FROM ${posts} parent WHERE parent.id = ${posts.replyTargetId} AND parent.account_id = ${ownerId}))`,
    ),
    with: {
      account: true,
      media: true,
      poll: { with: { options: true } },
      reactions: true,
    },
    orderBy: desc(posts.published),
    limit: 100,
  });

  // For each candidate, count how many same-author replies exist in
  // the chain forward (single follow-up depth is enough to qualify;
  // the reader computes the full chain at read time).
  const headsWithChain: { head: typeof candidates[number]; partCount: number }[] = [];
  for (const head of candidates) {
    // Walk forward up to 20 hops counting same-author replies. Cheap
    // enough at small chain depths; bail early on the first non-match.
    let cursor: string | null = head.id;
    let count = 0;
    const seen = new Set<string>();
    while (cursor != null && !seen.has(cursor)) {
      seen.add(cursor);
      const next: { id: string } | undefined =
        await db.query.posts.findFirst({
          where: and(
            eq(posts.replyTargetId, cursor as never),
            eq(posts.accountId, ownerId),
          ),
          columns: { id: true },
        });
      if (next == null) break;
      cursor = next.id;
      count++;
      if (count >= 50) break;
    }
    if (count >= 1) {
      headsWithChain.push({ head, partCount: count + 1 });
    }
  }
  // Reference to keep `exists` and `reply` (and `alias` import) used
  void exists;
  void reply;

  return c.html(
    <DashboardLayout
      title="~/threads · Hollo"
      selectedMenu="threads"
      shellPath="threads"
      shellStatus={`threads · ${headsWithChain.length} threads`}
      shellHints={[
        { key: "j/k", label: "move" },
        { key: "Enter", label: "read" },
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">thread list</span> <span class="arg">--mine</span>
      </div>

      {headsWithChain.length === 0 ? (
        <div class="state">
          <div class="glyph">🧵</div>
          <div class="ttl">no self-threads yet</div>
          <div class="msg">
            reply to one of your own posts to start a chain. Hollo stitches
            consecutive self-replies into a readable article.
          </div>
        </div>
      ) : (
        headsWithChain.map(({ head, partCount }) => {
          const title = pickHeadTitle(head);
          const snippet = (head.content ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 160);
          const wordCount = (head.content ?? "")
            .replace(/<[^>]+>/g, " ")
            .split(/\s+/)
            .filter(Boolean).length;
          const readMin = Math.max(1, Math.round((wordCount * partCount) / 200));
          const date = (head.published ?? head.updated).toLocaleDateString(
            "en",
            { month: "short", day: "numeric", year: "numeric" },
          );
          return (
            <article
              class="entry mine"
              data-open={`/@${owner.handle}/${head.id}/thread`}
            >
              <div class="meta">
                <span class="badge out">🧵 THREAD</span>{" "}
                <span class="ts">
                  {date} · {partCount} parts · {readMin} min read
                </span>
              </div>
              <div
                class="thr-title"
                style="font-family:var(--serif); font-size:18px; color:var(--fgs); margin:5px 0 3px;"
              >
                {title}
              </div>
              <div class="thr-snip muted" style="font-size:13px;">
                {snippet}
              </div>
              <div class="acts">
                <span class="a fav">♥ {head.likesCount ?? 0}</span>
                <span class="a boost">↻ {head.sharesCount ?? 0}</span>
                <a
                  class="threadcta"
                  href={`/@${owner.handle}/${head.id}/thread`}
                  style="margin-left:auto;"
                >
                  <span class="ic">🧵</span>
                  <span class="lab">read as article</span>
                  <span class="go">▸</span>
                </a>
              </div>
            </article>
          );
        })
      )}

      {headsWithChain.length > 0 && (
        <div class="endcap">
          — {headsWithChain.length} self-thread
          {headsWithChain.length === 1 ? "" : "s"} ·{" "}
          <span class="gn">[r]</span> refresh —
        </div>
      )}
    </DashboardLayout>,
  );
});

function pickHeadTitle(p: {
  summary: string | null;
  content: string | null;
}): string {
  if (p.summary != null && p.summary.trim() !== "") return p.summary.trim();
  const text = (p.content ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m = text.match(/^([^.!?。！？]+)[.!?。！？]/);
  if (m) return m[1].trim();
  return text.length > 80 ? `${text.slice(0, 80).trim()}…` : text;
}

export default threadsPage;
