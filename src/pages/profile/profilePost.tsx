import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { Layout } from "../../components/Layout.tsx";
import db from "../../db.ts";
import {
  type Account,
  type AccountOwner,
  accountOwners,
  type Medium,
  type Poll,
  type PollOption,
  type Post,
  posts,
} from "../../schema.ts";
import { renderCustomEmojis } from "../../text.ts";
import { isUuid } from "../../uuid.ts";

const profilePost = new Hono();

type ThreadPost = Post & {
  account: Account;
  media: Medium[];
  poll: (Poll & { options: PollOption[] }) | null;
};

profilePost.get<"/:handle{@[^/]+}/:id{[-a-f0-9]+}">(async (c) => {
  let handle = c.req.param("handle");
  const postId = c.req.param("id");
  if (!isUuid(postId)) return c.notFound();
  if (handle.startsWith("@")) handle = handle.substring(1);
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();

  // Fetch all user posts so we can flatten this post's full
  // descendant tree (replies of replies, etc.).
  const allUserPosts = await db.query.posts.findMany({
    where: and(
      eq(posts.accountId, accountOwner.id),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
    ),
    orderBy: desc(posts.id),
    with: {
      account: true,
      media: true,
      poll: { with: { options: true } },
    },
  });

  const root = allUserPosts.find((p) => p.id === postId);
  if (root == null) return c.notFound();

  // Build parent → children map, sort children chronologically
  const childrenMap = new Map<string, ThreadPost[]>();
  for (const p of allUserPosts) {
    if (p.replyTargetId != null) {
      const bucket = childrenMap.get(p.replyTargetId) ?? [];
      bucket.push(p);
      childrenMap.set(p.replyTargetId, bucket);
    }
  }
  for (const bucket of childrenMap.values()) {
    bucket.sort((a, b) => a.id.localeCompare(b.id));
  }

  // DFS flatten descendants (chronological at each level)
  const descendants: ThreadPost[] = [];
  const walk = (node: ThreadPost) => {
    const kids = childrenMap.get(node.id) ?? [];
    for (const kid of kids) {
      descendants.push(kid);
      walk(kid);
    }
  };
  walk(root);

  return c.html(
    <PostPage
      root={root}
      descendants={descendants}
      accountOwner={accountOwner}
    />,
  );
});

interface PostPageProps {
  readonly accountOwner: AccountOwner & { account: Account };
  readonly root: ThreadPost;
  readonly descendants: ThreadPost[];
}

function PostPage({ root, descendants, accountOwner }: PostPageProps) {
  const summary =
    root.summary ??
    ((root.content ?? "").length > 30
      ? `${(root.content ?? "").substring(0, 30)}…`
      : (root.content ?? ""));
  const hasTitle = root.summary != null && root.summary.trim() !== "";
  const publishedAt = root.published ?? root.updated;
  const thread: ThreadPost[] = [root, ...descendants];
  return (
    <Layout
      title={`${summary} — ${root.account.name}`}
      shortTitle={summary}
      description={root.summary ?? root.content}
      imageUrl={root.account.avatarUrl}
      url={root.url ?? root.iri}
      links={[
        { rel: "alternate", type: "application/activity+json", href: root.iri },
      ]}
      themeColor={accountOwner.themeColor}
    >
      <div class="article-page">
        <p class="article-back">
          <a href={`/@${accountOwner.handle}`}>&larr; Back to posts</a>
        </p>
        {hasTitle && <h1 class="article-title">{root.summary}</h1>}
        <p class="article-meta">
          <a href={root.url ?? root.iri}>
            <time dateTime={publishedAt.toISOString()}>
              {publishedAt.toLocaleString("en", { dateStyle: "long" })}
            </time>
          </a>
          {" · "}
          <a href={root.account.url ?? root.account.iri}>{root.account.name}</a>
        </p>
        <article class="article-body">
          {thread.map((post) => (
            <ThreadSegment post={post} />
          ))}
        </article>
      </div>
    </Layout>
  );
}

interface ThreadSegmentProps {
  readonly post: ThreadPost;
}

function ThreadSegment({ post }: ThreadSegmentProps) {
  const html = renderCustomEmojis(post.contentHtml ?? "", post.emojis);
  return (
    <>
      {post.contentHtml && (
        <div
          class="article-segment markdown-content"
          dangerouslySetInnerHTML={{ __html: html }}
          lang={post.language ?? undefined}
        />
      )}
      {post.media.map((medium) => (
        <div class="article-media">
          <a href={medium.url}>
            <img
              src={medium.thumbnailUrl}
              alt={medium.description ?? ""}
              width={medium.thumbnailWidth ?? undefined}
              height={medium.thumbnailHeight ?? undefined}
            />
          </a>
        </div>
      ))}
    </>
  );
}

export default profilePost;
