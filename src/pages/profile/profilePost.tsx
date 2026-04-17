import { and, eq, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { Layout } from "../../components/Layout.tsx";
import { Post as PostView } from "../../components/Post.tsx";
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
  type Reaction,
} from "../../schema.ts";
import { isUuid } from "../../uuid.ts";

const profilePost = new Hono();

profilePost.get<"/:handle{@[^/]+}/:id{[-a-f0-9]+}">(async (c) => {
  let handle = c.req.param("handle");
  const postId = c.req.param("id");
  if (!isUuid(postId)) return c.notFound();
  if (handle.startsWith("@")) handle = handle.substring(1);
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
  });
  if (accountOwner == null) return c.notFound();
  const post = await db.query.posts.findFirst({
    where: and(
      eq(posts.accountId, accountOwner.id),
      eq(posts.id, postId),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
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
      replies: {
        where: inArray(posts.visibility, ["public", "unlisted"]),
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
      reactions: true,
    },
  });
  if (post == null) return c.notFound();
  return c.html(<PostPage post={post} accountOwner={accountOwner} />);
});

interface PostPageProps {
  readonly accountOwner: AccountOwner;
  readonly post: Post & {
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
    replies: (Post & {
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
    reactions: Reaction[];
  };
}

function PostPage({ post, accountOwner }: PostPageProps) {
  const summary =
    post.summary ??
    ((post.content ?? "").length > 30
      ? `${(post.content ?? "").substring(0, 30)}…`
      : (post.content ?? ""));
  const hasTitle = post.summary != null && post.summary.trim() !== "";
  const publishedAt = post.published ?? post.updated;
  return (
    <Layout
      title={`${summary} — ${post.account.name}`}
      shortTitle={summary}
      description={post.summary ?? post.content}
      imageUrl={post.account.avatarUrl}
      url={post.url ?? post.iri}
      links={[
        { rel: "alternate", type: "application/activity+json", href: post.iri },
      ]}
      themeColor={accountOwner.themeColor}
    >
      <div class="article-page">
        <p class="article-back">
          <a href={`/@${accountOwner.handle}`}>&larr; Back to posts</a>
        </p>
        {hasTitle && <h1 class="article-title">{post.summary}</h1>}
        <p class="article-meta">
          <a href={post.url ?? post.iri}>
            <time dateTime={publishedAt.toISOString()}>
              {publishedAt.toLocaleString("en", {
                dateStyle: "long",
              })}
            </time>
          </a>
          {" · "}
          <a href={post.account.url ?? post.account.iri}>
            {post.account.name}
          </a>
        </p>
        <PostView post={post} />
        {post.replies.map((reply) => (
          <PostView post={reply} />
        ))}
      </div>
    </Layout>
  );
}

export default profilePost;
