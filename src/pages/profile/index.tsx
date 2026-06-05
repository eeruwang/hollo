import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import xss from "xss";
import { DashboardLayout } from "../../components/DashboardLayout.tsx";
import { Profile } from "../../components/Profile.tsx";
import { PublicProfile } from "../../components/PublicProfile.tsx";
import { db } from "../../db.ts";
import { isLoggedIn } from "../../login.ts";
import {
  type Account,
  type AccountOwner,
  accountOwners,
  type FeaturedTag,
  featuredTags,
  type Medium,
  type Poll,
  type PollOption,
  type Post,
  pinnedPosts,
  posts,
  type Reaction,
} from "../../schema.ts";
import { isUuid } from "../../uuid.ts";
import profilePost from "./profilePost.tsx";

const profile = new Hono();

profile.route("/:id{[-a-f0-9]+}", profilePost);

const PAGE_SIZE = 30;

profile.get<"/:handle">(async (c) => {
  let handle = c.req.param("handle");
  if (handle.startsWith("@")) handle = handle.substring(1);
  const owner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
    with: { account: true },
  });
  if (owner == null) return c.notFound();
  const contStr = c.req.query("cont");
  const cont = contStr == null || contStr.trim() === "" ? undefined : contStr;
  if (cont != null && !isUuid(cont)) return c.notFound();
  const pageStr = c.req.query("page");
  if (
    pageStr !== undefined &&
    (Number.isNaN(Number.parseInt(pageStr, 10)) ||
      Number.parseInt(pageStr, 10) < 1)
  ) {
    return c.notFound();
  }
  const page =
    pageStr !== undefined && !Number.isNaN(Number.parseInt(pageStr, 10))
      ? Number.parseInt(pageStr, 10)
      : 1;
  // Fetch ALL user's posts (root + replies at any depth) with full relations
  const allUserPosts = await db.query.posts.findMany({
    where: and(
      eq(posts.accountId, owner.id),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
    ),
    orderBy: desc(posts.id),
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
  });

  // Build parent → children map and find root posts (no parent in user's set)
  const childrenMap = new Map<string, typeof allUserPosts>();
  const postsById = new Map(allUserPosts.map((p) => [p.id, p]));
  for (const post of allUserPosts) {
    if (post.replyTargetId != null) {
      if (!childrenMap.has(post.replyTargetId)) {
        childrenMap.set(post.replyTargetId, []);
      }
      childrenMap.get(post.replyTargetId)?.push(post);
    }
  }
  // Sort each children list chronologically (id ASC)
  for (const children of childrenMap.values()) {
    children.sort((a, b) => a.id.localeCompare(b.id));
  }

  // Recursively flatten a root post's entire reply tree (DFS, chronological)
  const flattenDescendants = (root: (typeof allUserPosts)[number]) => {
    const out: typeof allUserPosts = [];
    const walk = (node: (typeof allUserPosts)[number]) => {
      const kids = childrenMap.get(node.id) ?? [];
      for (const kid of kids) {
        out.push(kid);
        walk(kid);
      }
    };
    walk(root);
    return out;
  };

  // Root posts: no replyTargetId OR replyTarget is not in user's set
  const rootPosts = allUserPosts.filter(
    (p) => p.replyTargetId == null || !postsById.has(p.replyTargetId),
  );

  // Pagination guard (404 on invalid page)
  const maxPage = Math.max(1, Math.ceil(rootPosts.length / PAGE_SIZE));
  if (page > maxPage && !(page <= 1 && rootPosts.length < 1)) {
    return c.notFound();
  }

  // Paginate root posts
  const pagedRoots = rootPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Attach flattened descendants as `replies` for each root
  const postList = pagedRoots.map((root) => ({
    ...root,
    replies: flattenDescendants(root),
  }));
  const pinnedPostList =
    cont == null
      ? await db.query.pinnedPosts.findMany({
          where: and(eq(pinnedPosts.accountId, owner.id)),
          orderBy: desc(pinnedPosts.index),
          with: {
            post: {
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
            },
          },
        })
      : [];
  const featuredTagList = await db.query.featuredTags.findMany({
    where: eq(featuredTags.accountOwnerId, owner.id),
  });
  const atomUrl = new URL(c.req.url);
  atomUrl.pathname += "/atom.xml";
  atomUrl.search = "";
  const newerUrl = page > 1 ? `?page=${page - 1}` : undefined;
  const olderUrl =
    postList.length === PAGE_SIZE ? `?page=${page + 1}` : undefined;

  const loggedIn = await isLoggedIn(c);
  const pinnedVisible = pinnedPostList
    .map((p) => p.post)
    .filter((p) => p.visibility === "public" || p.visibility === "unlisted");

  if (!loggedIn) {
    const instanceHost = new URL(c.req.url).host;
    return c.html(
      <PublicProfile
        accountOwner={owner}
        instanceHost={instanceHost}
        visiblePostCount={owner.account.postsCount ?? undefined}
        selectedTab="posts"
      >
        <div class="feedhead">▸ latest · public</div>
        {pinnedVisible.map((post) => (
          <ProfilePostEntry
            post={post}
            ownerHandle={owner.handle}
            pinned={true}
          />
        ))}
        {postList
          .slice(0, PAGE_SIZE)
          .map((post) => (
            <ProfilePostEntry post={post} ownerHandle={owner.handle} />
          ))}
        <div
          class="feedhead"
          style="text-align:center;margin-top:20px;"
        >
          —{" "}
          {`${postList.length} of ${(
            owner.account.postsCount ?? postList.length
          ).toLocaleString()} public posts`}{" "}
          ·{" "}
          <a href={atomUrl.href} style="color:var(--lnk);text-decoration:underline;">
            follow for more
          </a>{" "}
          —
        </div>
      </PublicProfile>,
    );
  }

  return c.html(
    <ProfilePage
      accountOwner={owner}
      posts={postList.slice(0, PAGE_SIZE)}
      pinnedPosts={pinnedVisible}
      featuredTags={featuredTagList}
      atomUrl={atomUrl.href}
      olderUrl={olderUrl}
      newerUrl={newerUrl}
    />,
  );
});

profile.get("/tagged/:tag", async (c) => {
  let handle = c.req.param("handle");
  const tag = c.req.param("tag");
  if (handle == null || tag == null) return c.notFound();
  if (handle.startsWith("@")) handle = handle.substring(1);
  const owner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
    with: { account: true },
  });
  if (owner == null) return c.notFound();
  const hashtag = `${tag.startsWith("#") ? tag : `#${tag}`}`.toLowerCase();
  const pageStr = c.req.query("page");
  if (
    pageStr !== undefined &&
    (Number.isNaN(Number.parseInt(pageStr, 10)) ||
      Number.parseInt(pageStr, 10) < 1)
  ) {
    return c.notFound();
  }
  const page =
    pageStr !== undefined && !Number.isNaN(Number.parseInt(pageStr, 10))
      ? Number.parseInt(pageStr, 10)
      : 1;
  const [{ totalPosts }] = await db
    .select({ totalPosts: count() })
    .from(posts)
    .where(
      and(
        eq(posts.accountId, owner.id),
        or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
        sql`${posts.tags} ? ${hashtag}`,
      ),
    );
  const maxPage = Math.ceil(totalPosts / PAGE_SIZE);
  if (page > maxPage && !(page <= 1 && totalPosts < 1)) {
    return c.notFound();
  }
  const postList = await db.query.posts.findMany({
    where: and(
      eq(posts.accountId, owner.id),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
      sql`${posts.tags} ? ${hashtag}`,
    ),
    orderBy: desc(posts.id),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    with: {
      account: true,
      media: true,
      poll: { with: { options: true } },
      replies: {
        where: or(
          eq(posts.visibility, "public"),
          eq(posts.visibility, "unlisted"),
        ),
        orderBy: posts.id,
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
        },
      },
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
  });
  const featuredTagList = await db.query.featuredTags.findMany({
    where: eq(featuredTags.accountOwnerId, owner.id),
  });
  const newerUrl = page > 1 ? `?page=${page - 1}` : undefined;
  const olderUrl =
    postList.length === PAGE_SIZE ? `?page=${page + 1}` : undefined;
  return c.html(
    <ProfilePage
      accountOwner={owner}
      tag={tag}
      posts={postList.slice(0, PAGE_SIZE)}
      pinnedPosts={[]}
      featuredTags={featuredTagList}
      olderUrl={olderUrl}
      newerUrl={newerUrl}
    />,
  );
});

type PostWithDetails = Post & {
  account: Account;
  media: Medium[];
  poll: (Poll & { options: PollOption[] }) | null;
  sharing:
    | (Post & {
        account: Account;
        media: Medium[];
        poll: (Poll & { options: PollOption[] }) | null;
        replyTarget: (Post & { account: Account }) | null;
        quoteTarget:
          | (Post & {
              account: Account;
              media: Medium[];
              poll: (Poll & { options: PollOption[] }) | null;
              replyTarget: (Post & { account: Account }) | null;
              reactions: Reaction[];
            })
          | null;
        reactions: Reaction[];
      })
    | null;
  replyTarget: (Post & { account: Account }) | null;
  quoteTarget:
    | (Post & {
        account: Account;
        media: Medium[];
        poll: (Poll & { options: PollOption[] }) | null;
        replyTarget: (Post & { account: Account }) | null;
        reactions: Reaction[];
      })
    | null;
  reactions: Reaction[];
};

// biome-ignore lint/correctness/noUnusedFunctionParameters: kept for future grouped view
// @ts-expect-error: unused for now
function _groupByMonth<T extends { published: Date | null; updated: Date }>(
  items: T[],
): { label: string; posts: T[] }[] {
  const groups: { label: string; posts: T[] }[] = [];
  let currentKey: string | null = null;
  for (const item of items) {
    const date = item.published ?? item.updated;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (key !== currentKey) {
      groups.push({
        label: date.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
        posts: [],
      });
      currentKey = key;
    }
    groups[groups.length - 1].posts.push(item);
  }
  return groups;
}

// Posts whose combined (root + flattened descendants) character count
// exceeds this limit render as a truncated preview card that links to
// the blog-style full post page. Truncation cuts at the last sentence
// boundary (., !, ?, 。, ？, ！) within the limit.
const LONG_POST_THRESHOLD_CHARS = 130;

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateToChars(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;

  // Hard character-count boundary first
  const hardCut = trimmed.substring(0, maxChars);

  // Prefer the last sentence-ending punctuation followed by whitespace
  // or end-of-string (avoids breaking inside decimals like "v2.0")
  const sentenceEnd = /[.!?。！？]/g;
  let bestEnd = -1;
  let match: RegExpExecArray | null = sentenceEnd.exec(hardCut);
  while (match !== null) {
    const next = hardCut.charAt(match.index + 1);
    if (next === "" || /\s/.test(next)) {
      bestEnd = match.index + 1;
    }
    match = sentenceEnd.exec(hardCut);
  }

  // Require the boundary to land past 30% so the preview isn't a
  // single teaser sentence when the rest of the content has no breaks.
  if (bestEnd > hardCut.length * 0.3) {
    return hardCut.substring(0, bestEnd).trim();
  }

  // Fallback: word boundary with ellipsis (keeps CJK text whole)
  const lastSpace = hardCut.lastIndexOf(" ");
  const sliced =
    lastSpace > maxChars * 0.6 ? hardCut.substring(0, lastSpace) : hardCut;
  return `${sliced.trim()}…`;
}

// @ts-expect-error: unused for now
function _makePreview(
  post: { contentHtml: string | null },
  maxChars = LONG_POST_THRESHOLD_CHARS,
): string {
  return truncateToChars(stripHtml(post.contentHtml), maxChars);
}

interface ProfilePageProps {
  readonly accountOwner: AccountOwner & { account: Account };
  readonly tag?: string;
  readonly posts: (PostWithDetails & {
    replies: PostWithDetails[];
  })[];
  readonly pinnedPosts: (Post & {
    account: Account;
    media: Medium[];
    poll: (Poll & { options: PollOption[] }) | null;
    sharing:
      | (Post & {
          account: Account;
          media: Medium[];
          poll: (Poll & { options: PollOption[] }) | null;
          replyTarget: (Post & { account: Account }) | null;
          quoteTarget:
            | (Post & {
                account: Account;
                media: Medium[];
                poll: (Poll & { options: PollOption[] }) | null;
                replyTarget: (Post & { account: Account }) | null;
                reactions: Reaction[];
              })
            | null;
          reactions: Reaction[];
        })
      | null;
    replyTarget: (Post & { account: Account }) | null;
    quoteTarget:
      | (Post & {
          account: Account;
          media: Medium[];
          poll: (Poll & { options: PollOption[] }) | null;
          replyTarget: (Post & { account: Account }) | null;
          reactions: Reaction[];
        })
      | null;
    reactions: Reaction[];
  })[];
  readonly featuredTags: FeaturedTag[];
  readonly atomUrl?: string;
  readonly olderUrl?: string;
  readonly newerUrl?: string;
}

// Using `any` for the post type because pinned posts and regular posts
// have subtly different field sets (pinned posts include an extra
// `pinned` boolean) — we only consume a handful of fields here, so it
// isn't worth the type gymnastics.
// biome-ignore lint/suspicious/noExplicitAny: see comment above
function ProfilePostEntry({
  post,
  ownerHandle,
  pinned,
}: {
  post: any;
  ownerHandle: string;
  pinned?: boolean;
}) {
  const url = `/@${ownerHandle}/${post.id}`;
  const text = stripHtml(post.contentHtml);
  const replyText = (post.replies as Array<{ contentHtml: string | null }>)
    .map((r) => stripHtml(r.contentHtml))
    .filter((t: string) => t !== "")
    .join(" · ");
  const isLong = text.length > LONG_POST_THRESHOLD_CHARS;
  const body = isLong ? truncateToChars(text, LONG_POST_THRESHOLD_CHARS) : text;
  const ts = (post.published ?? post.updated) as Date;
  return (
    <article class="entry mine" data-open={url}>
      <div class="meta">
        {pinned && <span class="badge">PINNED</span>}
        <span class="ts">
          {ts.toLocaleDateString("en", { month: "2-digit", day: "2-digit" })}
        </span>
        {post.replies.length > 0 && (
          <span class="dimc">· {post.replies.length} repl{post.replies.length === 1 ? "y" : "ies"}</span>
        )}
      </div>
      <div class="txt">
        <a href={url} style="color:inherit;">
          <strong>{body}</strong>
          {replyText && !isLong && (
            <span class="dimc"> · {replyText.slice(0, 80)}…</span>
          )}
        </a>
      </div>
      <div class="acts">
        <span class="a reply">↩ <b>{post.repliesCount ?? 0}</b></span>
        <span class="a boost">↻ <b>{post.sharesCount ?? 0}</b></span>
        <span class="a fav">♥ <b>{post.likesCount ?? 0}</b></span>
      </div>
    </article>
  );
}

async function ProfilePage({
  accountOwner,
  tag,
  posts,
  pinnedPosts,
  featuredTags,
  atomUrl,
  olderUrl,
  newerUrl,
}: ProfilePageProps) {
  const totalPosts = (
    accountOwner.account.postsCount ?? posts.length
  ).toLocaleString();
  return (
    <DashboardLayout
      title={
        tag == null
          ? accountOwner.account.name
          : `#${tag} - ${accountOwner.account.name}`
      }
      url={
        tag == null
          ? (accountOwner.account.url ?? accountOwner.account.iri)
          : undefined
      }
      description={accountOwner.bio}
      imageUrl={accountOwner.account.avatarUrl}
      links={[
        ...(atomUrl == null
          ? []
          : [
              { rel: "alternate", type: "application/atom+xml", href: atomUrl },
            ]),
        {
          rel: "alternate",
          type: "application/activity+json",
          href: `/@${accountOwner.handle}`,
        },
      ]}
      themeColor={accountOwner.themeColor}
      selectedMenu="profile"
      shellPath={tag == null ? "profile" : `profile/#${tag}`}
      shellStatus={`@${accountOwner.handle} · ${totalPosts} posts`}
      shellHints={[
        { key: "j/k", label: "move" },
        { key: "Enter", label: "open" },
        { key: "e", label: "edit profile" },
        { key: "c", label: "compose" },
      ]}
    >
      <div class="cmdline">
        <span class="u">{accountOwner.handle}@hollo</span>:~${" "}
        <span class="cmd">whoami</span> <span class="arg">--profile</span>
      </div>

      <Profile accountOwner={accountOwner} isOwner={true} />

      <div class="rule">
        ──────────────────────────────────────────────────────────────
      </div>

      <nav class="tabs">
        <a
          class={tag == null ? "on" : ""}
          href={`/@${accountOwner.handle}`}
        >
          posts
        </a>
        <a href={`/@${accountOwner.handle}/with_replies`}>posts &amp; replies</a>
        <a href={`/@${accountOwner.handle}/media`}>media</a>
        <a href={`/@${accountOwner.handle}/about`}>about</a>
      </nav>

      {featuredTags.length > 0 && (
        <p style="margin-top:10px;">
          <span class="dimc">featured: </span>
          {featuredTags.map((featured) => (
            <>
              <a
                class="tag"
                href={`/@${accountOwner.handle}/tagged/${encodeURIComponent(featured.name)}`}
              >
                #{featured.name}
              </a>{" "}
            </>
          ))}
        </p>
      )}

      {tag == null &&
        pinnedPosts.map((post) => (
          <ProfilePostEntry
            post={post}
            ownerHandle={accountOwner.handle}
            pinned={true}
          />
        ))}
      {posts.map((post) => (
        <ProfilePostEntry post={post} ownerHandle={accountOwner.handle} />
      ))}

      {(newerUrl || olderUrl) && (
        <div
          style="display:flex; justify-content:space-between; margin-top:18px;"
        >
          <div>
            {newerUrl && (
              <a class="btn" href={newerUrl}>
                ← newer
              </a>
            )}
          </div>
          <div>
            {olderUrl && (
              <a class="btn" href={olderUrl}>
                older →
              </a>
            )}
          </div>
        </div>
      )}

      <div class="endcap">
        — {totalPosts} posts ·{" "}
        {olderUrl ? (
          <>
            load more with <span class="gn">[m]</span>
          </>
        ) : (
          "end of feed"
        )}{" "}
        —
      </div>
    </DashboardLayout>
  );
}

profile.get("/atom.xml", async (c) => {
  let handle = c.req.param("handle");
  if (handle == null) return c.notFound();
  if (handle.startsWith("@")) handle = handle.substring(1);
  const owner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
    with: { account: true },
  });
  if (owner == null) return c.notFound();
  const postList = await db.query.posts.findMany({
    with: { account: true },
    where: eq(posts.accountId, owner.id),
    orderBy: desc(posts.published),
    limit: 100,
  });
  const canonicalUrl = new URL(c.req.url);
  canonicalUrl.search = "";
  const response = await c.html(
    <feed xmlns="http://www.w3.org/2005/Atom">
      <id>urn:uuid:{owner.id}</id>
      <title>{owner.account.name}</title>
      <link rel="self" type="application/atom+xml" href={canonicalUrl.href} />
      <link
        rel="alternate"
        type="text/html"
        href={owner.account.url ?? owner.account.iri}
      />
      <link
        rel="alternate"
        type="application/activity+json"
        href={owner.account.iri}
      />
      <author>
        <name>{owner.account.name}</name>
        <uri>{owner.account.url ?? owner.account.iri}</uri>
      </author>
      <updated>
        {(postList[0]?.updated ?? owner.account.updated).toISOString()}
      </updated>
      {postList.map((post) => {
        const title = xss(post.contentHtml ?? "", {
          allowCommentTag: false,
          whiteList: {},
          stripIgnoreTag: true,
          stripBlankChar: false,
        })
          .trimStart()
          .replace(/\r?\n.*$/, "");
        return (
          <entry>
            <id>urn:uuid:{post.id}</id>
            <title dangerouslySetInnerHTML={{ __html: title }} />
            <link
              rel="alternate"
              type="text/html"
              href={post.url ?? post.iri}
            />
            <link
              rel="alternate"
              type="application/activity+json"
              href={post.iri}
            />
            <author>
              <name>{post.account.name}</name>
              <uri>{post.account.url ?? post.account.iri}</uri>
            </author>
            <content type="html">{post.contentHtml}</content>
            {post.published && (
              <published>{post.published.toISOString()}</published>
            )}
            <updated>{post.updated.toISOString()}</updated>
          </entry>
        );
      })}
    </feed>,
  );
  response.headers.set("Content-Type", "application/atom+xml");
  return response;
});

export default profile;
