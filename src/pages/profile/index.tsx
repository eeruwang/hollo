import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import xss from "xss";
import { Layout } from "../../components/Layout.tsx";
import { Post as PostView } from "../../components/Post.tsx";
import { Profile } from "../../components/Profile.tsx";
import { db } from "../../db.ts";
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
  return c.html(
    <ProfilePage
      accountOwner={owner}
      posts={postList.slice(0, PAGE_SIZE)}
      pinnedPosts={pinnedPostList
        .map((p) => p.post)
        .filter(
          (p) => p.visibility === "public" || p.visibility === "unlisted",
        )}
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

function groupByMonth<T extends { published: Date | null; updated: Date }>(
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

// Posts over this many plain-text characters render as a truncated
// preview card linking to the full post page. Truncation cuts at the
// last sentence boundary (., !, ?, 。, ？, ！) within the threshold.
// Value matches the blog reference (cards max out around 300-310 chars).
const LONG_POST_THRESHOLD = 310;

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLongPost(post: { contentHtml: string | null }): boolean {
  return stripHtml(post.contentHtml).length > LONG_POST_THRESHOLD;
}

function makePreview(
  post: { contentHtml: string | null },
  maxLen = LONG_POST_THRESHOLD,
): string {
  const text = stripHtml(post.contentHtml);
  if (text.length <= maxLen) return text;

  // Find the last sentence-ending punctuation within maxLen
  const sentenceEnd = /[.!?。！？]/g;
  let bestEnd = -1;
  let match: RegExpExecArray | null = sentenceEnd.exec(text);
  while (match !== null) {
    const end = match.index + 1;
    if (end > maxLen) break;
    // Require the punctuation to be followed by whitespace or end
    // (avoids cutting inside decimals like "v2.0")
    const next = text.charAt(end);
    if (next === "" || /\s/.test(next)) bestEnd = end;
    match = sentenceEnd.exec(text);
  }

  if (bestEnd > maxLen * 0.3) {
    return text.substring(0, bestEnd).trim();
  }

  // Fallback: word boundary with ellipsis
  const cut = text.substring(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const sliced =
    lastSpace > maxLen * 0.6 ? cut.substring(0, lastSpace) : cut;
  return `${sliced}…`;
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

function ProfilePage({
  accountOwner,
  tag,
  posts,
  pinnedPosts,
  featuredTags,
  atomUrl,
  olderUrl,
  newerUrl,
}: ProfilePageProps) {
  return (
    <Layout
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
    >
      <Profile accountOwner={accountOwner} />
      <section class="profile-timeline">
        <h2>{tag != null ? `Posts tagged #${tag}` : "Posts"}</h2>
        {featuredTags.length > 0 && (
          <p>
            Featured tags:{" "}
            {featuredTags.map((tag) => (
              <>
                <a
                  href={`/@${accountOwner.handle}/tagged/${encodeURIComponent(tag.name)}`}
                >
                  #{tag.name}
                </a>{" "}
              </>
            ))}
          </p>
        )}
        {tag == null &&
          pinnedPosts.map((post) => <PostView post={post} pinned={true} />)}
        {groupByMonth(posts).map((group) => (
          <>
            <div class="date-group">{group.label}</div>
            {group.posts.map((post) => {
              if (isLongPost(post)) {
                const postUrl = `/@${accountOwner.handle}/${post.id}`;
                return (
                  <article class="post-preview">
                    <a href={postUrl}>{makePreview(post)}</a>
                  </article>
                );
              }
              return post.replies.length > 0 ? (
                <div class="thread">
                  <PostView post={post} />
                  {post.replies.map((reply) => (
                    <PostView post={reply} />
                  ))}
                </div>
              ) : (
                <PostView post={post} />
              );
            })}
          </>
        ))}
      </section>
      {(newerUrl || olderUrl) && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>{newerUrl && <a href={newerUrl}>&larr; Newer</a>}</div>
          <div>{olderUrl && <a href={olderUrl}>Older &rarr;</a>}</div>
        </div>
      )}
      <footer class="profile-footer">
        <h3>Contact</h3>
        <div class="contact-grid">
          <div class="contact-item">
            <label>Handle</label>
            <div class="handle-with-avatar">
              {accountOwner.account.avatarUrl && (
                <img
                  src={accountOwner.account.avatarUrl}
                  alt=""
                  width={16}
                  height={16}
                />
              )}
              <span style="user-select: all;">@{accountOwner.handle}</span>
            </div>
          </div>
          <div class="contact-item">
            <label>Following</label>
            <p>{accountOwner.account.followingCount}</p>
          </div>
          <div class="contact-item">
            <label>Followers</label>
            <p>{accountOwner.account.followersCount}</p>
          </div>
        </div>
        {accountOwner.account.fieldHtmls != null &&
          Object.keys(accountOwner.account.fieldHtmls).length > 0 && (
            <>
              <h3>Links</h3>
              <div class="contact-grid">
                {Object.entries(accountOwner.account.fieldHtmls).map(
                  ([key, value]) => (
                    <div class="contact-item">
                      <label>{key}</label>
                      <div dangerouslySetInnerHTML={{ __html: value }} />
                    </div>
                  ),
                )}
              </div>
            </>
          )}
      </footer>
    </Layout>
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
