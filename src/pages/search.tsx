import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import { TimelineEntry } from "../components/TimelineEntry.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { accounts, posts } from "../schema.ts";

const searchPage = new Hono();

searchPage.use(loginRequired);

searchPage.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");
  const q = (c.req.query("q") ?? "").trim();
  const scope = (c.req.query("scope") ?? "all") as
    | "all"
    | "people"
    | "posts"
    | "tags";

  let people: Awaited<ReturnType<typeof searchAccounts>> = [];
  let postsHits: Awaited<ReturnType<typeof searchPosts>> = [];
  let tagHits: string[] = [];

  if (q.length > 0) {
    if (scope === "all" || scope === "people") {
      people = await searchAccounts(q);
    }
    if (scope === "all" || scope === "posts") {
      postsHits = await searchPosts(q);
    }
    if (scope === "all" || scope === "tags") {
      tagHits = await searchTags(q);
    }
  }

  const totals = {
    people: people.length,
    posts: postsHits.length,
    tags: tagHits.length,
  };

  return c.html(
    <DashboardLayout
      title={q ? `~/search · "${q}"` : "~/search · Hollo"}
      selectedMenu="settings"
      shellPath="search"
      shellMode="SEARCH"
      shellStatus={q ? `"${q}"` : "search"}
      shellHints={[
        { key: "Tab", label: "scope" },
        { key: "j/k", label: "move" },
        { key: "Enter", label: "open" },
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">search</span>{" "}
        {q ? <span class="arg">"{q}"</span> : <span class="dimc">— enter a query</span>}
      </div>

      <form
        method="get"
        action="/search"
        class="field"
        style="border:1px solid var(--bd); padding:0;"
      >
        <div class="row2" style="padding:9px 11px;">
          <span class="dimc">⌕</span>
          <input
            type="text"
            name="q"
            value={q}
            placeholder="search people · posts · #tags"
            spellcheck={false}
            autofocus
            style="border:none; background:transparent; padding:0;"
          />
          <button type="submit" class="btn-line" style="padding:5px 12px;">
            go →
          </button>
        </div>
      </form>

      {q.length > 0 && (
        <nav class="tabs" style="margin-top:16px;">
          {(["all", "people", "posts", "tags"] as const).map((s) => (
            <a
              class={scope === s ? "on" : undefined}
              href={`?q=${encodeURIComponent(q)}&scope=${s}`}
            >
              {s}
              {s !== "all" && (
                <span class="muted"> ·{totals[s as keyof typeof totals]}</span>
              )}
            </a>
          ))}
        </nav>
      )}

      {q.length === 0 ? (
        <div class="state">
          <div class="glyph">⌕</div>
          <div class="ttl">search Hollo</div>
          <div class="msg">
            find people you've seen, posts you've boosted, hashtags you've
            followed. remote accounts can also be looked up by full handle
            (<code>@user@host</code>).
          </div>
        </div>
      ) : (
        <>
          {(scope === "all" || scope === "people") && people.length > 0 && (
            <>
              <div class="h-sec">▸ people</div>
              <div class="ac-drop" style="position:static; border-color:var(--bd);">
                {people.map((p) => (
                  <a class="ar" href={p.url ?? p.iri}>
                    <span class="av">
                      {(p.name?.[0] ?? p.handle?.[1] ?? "?").toUpperCase()}
                    </span>
                    <span style="flex:1;">
                      <span class="nm">{p.name ?? p.handle}</span>{" "}
                      <span class="hn">{p.handle}</span>
                      {p.bioSnippet && (
                        <div class="muted" style="font-size:11.5px;">
                          {p.bioSnippet}
                        </div>
                      )}
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}

          {(scope === "all" || scope === "tags") && tagHits.length > 0 && (
            <>
              <div class="h-sec">▸ tags</div>
              <div class="ttable">
                {tagHits.map((tag) => (
                  <a
                    class="tr"
                    href={`/tags/${encodeURIComponent(tag.replace(/^#/, ""))}`}
                    style="grid-template-columns:1fr auto;"
                  >
                    <span class="tag" style="font-size:14px;">
                      #{tag.replace(/^#/, "")}
                    </span>
                    <span class="muted">open →</span>
                  </a>
                ))}
              </div>
            </>
          )}

          {(scope === "all" || scope === "posts") && postsHits.length > 0 && (
            <>
              <div class="h-sec">▸ posts</div>
              {postsHits.map((post) => (
                <TimelineEntry
                  post={post}
                  mine={post.accountId === owner.id}
                  openHref={`/@${post.account.handle.replace(/^@/, "")}/${post.id}`}
                />
              ))}
            </>
          )}

          {totals.people === 0 &&
            totals.posts === 0 &&
            totals.tags === 0 && (
              <div class="state">
                <div class="glyph">⌕</div>
                <div class="ttl">no results for «{q}»</div>
                <div class="msg">
                  try a different phrasing, a full <code>@user@host</code>
                  handle, or a <code>#tag</code>.
                </div>
              </div>
            )}

          <div class="endcap">
            — {totals.posts} posts · {totals.people} people · {totals.tags}{" "}
            tags · <span class="gn">[/]</span> refine —
          </div>
        </>
      )}
    </DashboardLayout>,
  );
});

async function searchAccounts(q: string) {
  const trimmed = q.replace(/^@/, "").trim();
  const like = `%${trimmed}%`;
  const rows = await db.query.accounts.findMany({
    where: or(
      ilike(accounts.handle, like),
      ilike(accounts.name, like),
      ilike(accounts.bioHtml, like),
    ),
    limit: 12,
    orderBy: desc(accounts.followersCount),
  });
  return rows.map((r) => ({
    iri: r.iri,
    url: r.url,
    handle: r.handle,
    name: r.name,
    bioSnippet: r.bioHtml
      ? r.bioHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
      : null,
  }));
}

async function searchPosts(q: string) {
  const like = `%${q}%`;
  return await db.query.posts.findMany({
    where: or(
      ilike(posts.content, like),
      ilike(posts.contentHtml, like),
    ),
    with: {
      account: true,
      media: true,
      poll: { with: { options: true } },
      reactions: true,
    },
    orderBy: desc(posts.published),
    limit: 25,
  });
}

async function searchTags(q: string) {
  const trimmed = q.replace(/^#/, "").trim();
  if (trimmed.length === 0) return [];
  // Postgres JSONB key search: find any post whose `tags` jsonb has a
  // key matching the query. Hollo stores tags as `{ "#tag": "url" }`.
  const rows = await db.execute(
    sql`SELECT DISTINCT jsonb_object_keys(${posts.tags}) AS k
        FROM ${posts}
        WHERE jsonb_object_keys(${posts.tags})::text ILIKE ${`%${trimmed}%`}
        LIMIT 20`,
  );
  return (rows as unknown as Array<{ k: string }>).map((r) => r.k);
}

// Unused import workaround for the (potential) future use of eq below
void eq;

export default searchPage;
