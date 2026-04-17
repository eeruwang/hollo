import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { escape } from "es-toolkit";
import { Hono } from "hono";
import { Layout } from "../../components/Layout.tsx";
import { Profile } from "../../components/Profile.tsx";
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
  reactions,
} from "../../schema.ts";
import { renderCustomEmojis } from "../../text.ts";
import { isUuid } from "../../uuid.ts";

const profilePost = new Hono();

type ThreadPost = Post & {
  account: Account;
  media: Medium[];
  poll: (Poll & { options: PollOption[] }) | null;
};

type CommentPost = Post & {
  account: Account;
  media: Medium[];
  reactions: Reaction[];
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

  // Reactions (emoji reactions) on the root post
  const rootReactions = await db.query.reactions.findMany({
    where: eq(reactions.postId, root.id),
    orderBy: asc(reactions.created),
  });

  // Non-author replies to any post in the author's thread — these
  // are the "comments" from other people on the fediverse.
  const threadPostIds = [root.id, ...descendants.map((d) => d.id)];
  const comments = (await db.query.posts.findMany({
    where: and(
      inArray(posts.replyTargetId, threadPostIds),
      ne(posts.accountId, accountOwner.id),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
    ),
    orderBy: asc(posts.published),
    with: {
      account: true,
      media: true,
      reactions: true,
    },
  })) as CommentPost[];

  return c.html(
    <PostPage
      root={root}
      descendants={descendants}
      accountOwner={accountOwner}
      rootReactions={rootReactions}
      comments={comments}
    />,
  );
});

interface PostPageProps {
  readonly accountOwner: AccountOwner & { account: Account };
  readonly root: ThreadPost;
  readonly descendants: ThreadPost[];
  readonly rootReactions: Reaction[];
  readonly comments: CommentPost[];
}

function PostPage({
  root,
  descendants,
  accountOwner,
  rootReactions,
  comments,
}: PostPageProps) {
  const publishedAt = root.published ?? root.updated;
  const { title, bodyHtml } = deriveTitleAndBody(root);
  const rootBodyHtml = renderCustomEmojis(bodyHtml, root.emojis);
  const metaTitle =
    title ??
    ((root.content ?? "").length > 30
      ? `${(root.content ?? "").substring(0, 30)}…`
      : (root.content ?? ""));
  return (
    <Layout
      title={`${metaTitle} — ${root.account.name}`}
      shortTitle={metaTitle}
      description={root.summary ?? root.content}
      imageUrl={root.account.avatarUrl}
      url={root.url ?? root.iri}
      links={[
        { rel: "alternate", type: "application/activity+json", href: root.iri },
      ]}
      themeColor={accountOwner.themeColor}
    >
      <Profile accountOwner={accountOwner} />
      <div class="article-page">
        <header class="article-hero">
          {title && <h1 class="article-title">{title}</h1>}
          <div class="article-byline">
            <span class="byline-authors">
              {root.account.avatarUrl && (
                <button
                  type="button"
                  class="byline-avatar-btn"
                  aria-label={`View ${root.account.name}'s profile`}
                  {...({ popovertarget: "profile-popup" } as Record<
                    string,
                    string
                  >)}
                >
                  <img
                    src={root.account.avatarUrl}
                    alt=""
                    class="byline-avatar"
                    width={28}
                    height={28}
                  />
                </button>
              )}
              <a href={root.account.url ?? root.account.iri}>
                {root.account.name}
              </a>
            </span>
            <span class="byline-date">
              <a href={root.url ?? root.iri}>
                <time dateTime={publishedAt.toISOString()}>
                  {publishedAt.toLocaleString("en", { dateStyle: "long" })}
                </time>
              </a>
            </span>
          </div>
        </header>
        <ProfilePopup accountOwner={accountOwner} />
        <article class="article-body">
          {rootBodyHtml && (
            <div
              class="article-segment markdown-content"
              dangerouslySetInnerHTML={{ __html: rootBodyHtml }}
              lang={root.language ?? undefined}
            />
          )}
          {root.media.map((medium) => (
            <ThreadMedia medium={medium} />
          ))}
          {descendants.map((post) => (
            <ThreadSegment post={post} />
          ))}
        </article>
        <ArticleEngagement
          post={root}
          reactions={rootReactions}
          commentCount={comments.length}
        />
        {comments.length > 0 && (
          <CommentList comments={comments} accountOwner={accountOwner} />
        )}
      </div>
    </Layout>
  );
}

// If a post has no explicit summary, promote its first paragraph to
// the article title and drop it from the body so content doesn't
// repeat. Otherwise use summary as title and keep body intact.
function deriveTitleAndBody(post: ThreadPost): {
  title: string | null;
  bodyHtml: string;
} {
  if (post.summary != null && post.summary.trim() !== "") {
    return { title: post.summary.trim(), bodyHtml: post.contentHtml ?? "" };
  }
  const html = post.contentHtml ?? "";
  const firstParagraph = html.match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*/i);
  if (firstParagraph) {
    const titleText = firstParagraph[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (titleText !== "") {
      return {
        title: titleText,
        bodyHtml: html.substring(firstParagraph[0].length),
      };
    }
  }
  return { title: null, bodyHtml: html };
}

interface ArticleEngagementProps {
  readonly post: ThreadPost;
  readonly reactions: Reaction[];
  readonly commentCount: number;
}

function ArticleEngagement({
  post,
  reactions,
  commentCount,
}: ArticleEngagementProps) {
  const grouped = groupByEmojis(reactions);
  const likes = post.likesCount ?? 0;
  const shares = post.sharesCount ?? 0;
  const hasAny =
    likes > 0 ||
    shares > 0 ||
    reactions.length > 0 ||
    commentCount > 0;
  if (!hasAny) return null;
  return (
    <aside class="article-engagement">
      <div class="engagement-stats">
        {likes > 0 && (
          <span class="engagement-stat">
            <span class="engagement-icon" aria-hidden="true">
              &#9829;
            </span>
            {likes} {likes === 1 ? "like" : "likes"}
          </span>
        )}
        {shares > 0 && (
          <span class="engagement-stat">
            <span class="engagement-icon" aria-hidden="true">
              &#8634;
            </span>
            {shares} {shares === 1 ? "share" : "shares"}
          </span>
        )}
        {commentCount > 0 && (
          <a href="#comments" class="engagement-stat">
            <span class="engagement-icon" aria-hidden="true">
              &#128172;
            </span>
            {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </a>
        )}
      </div>
      {Object.keys(grouped).length > 0 && (
        <div class="engagement-reactions">
          {Object.entries(grouped).map(([emoji, { src, count }]) => (
            <span class="reaction-chip" title={`${emoji} × ${count}`}>
              {src == null ? (
                <span class="reaction-emoji">{emoji}</span>
              ) : (
                <img class="reaction-emoji" src={src} alt={emoji} />
              )}
              <span class="reaction-count">{count}</span>
            </span>
          ))}
        </div>
      )}
    </aside>
  );
}

function groupByEmojis(
  reactionList: Reaction[],
): Record<string, { src?: string; count: number }> {
  const result: Record<string, { src?: string; count: number }> = {};
  for (const r of reactionList) {
    if (result[r.emoji] == null) {
      result[r.emoji] = {
        src: r.customEmoji ?? undefined,
        count: 1,
      };
    } else {
      result[r.emoji].count++;
    }
  }
  return result;
}

interface CommentListProps {
  readonly comments: CommentPost[];
  readonly accountOwner: AccountOwner & { account: Account };
}

function CommentList({ comments, accountOwner }: CommentListProps) {
  return (
    <section class="article-comments" id="comments">
      <h2 class="article-comments-heading">
        {comments.length === 1
          ? "1 comment"
          : `${comments.length} comments`}
      </h2>
      <ul class="comment-list">
        {comments.map((c) => (
          <Comment comment={c} accountOwner={accountOwner} />
        ))}
      </ul>
    </section>
  );
}

interface CommentProps {
  readonly comment: CommentPost;
  readonly accountOwner: AccountOwner & { account: Account };
}

function Comment({ comment, accountOwner }: CommentProps) {
  const published = comment.published ?? comment.updated;
  const contentHtml = renderCustomEmojis(
    comment.contentHtml ?? "",
    comment.emojis,
  );
  const grouped = groupByEmojis(comment.reactions);
  const account = comment.account;
  const accountUrl = account.url ?? account.iri;
  const isOwner = comment.accountId === accountOwner.id;
  return (
    <li class={`comment${isOwner ? " comment-owner" : ""}`}>
      <a class="comment-avatar-link" href={accountUrl}>
        {account.avatarUrl ? (
          <img
            class="comment-avatar"
            src={account.avatarUrl}
            alt=""
            width={36}
            height={36}
          />
        ) : (
          <span class="comment-avatar comment-avatar-placeholder">
            {account.name?.[0] ?? "?"}
          </span>
        )}
      </a>
      <div class="comment-body">
        <div class="comment-meta">
          <a
            class="comment-name"
            href={accountUrl}
            dangerouslySetInnerHTML={{
              __html: renderCustomEmojis(escape(account.name), account.emojis),
            }}
          />
          <span class="comment-handle">
            {account.handle.startsWith("@")
              ? account.handle
              : `@${account.handle}`}
          </span>
          <a
            class="comment-date"
            href={comment.url ?? comment.iri}
            title={published.toISOString()}
          >
            <time dateTime={published.toISOString()}>
              {published.toLocaleString("en", { dateStyle: "medium" })}
            </time>
          </a>
        </div>
        {comment.contentHtml && (
          <div
            class="comment-content markdown-content"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
            lang={comment.language ?? undefined}
          />
        )}
        {comment.media.length > 0 && (
          <div class="comment-media">
            {comment.media.map((m) => (
              <a href={m.url}>
                <img
                  src={m.thumbnailUrl}
                  alt={m.description ?? ""}
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
        {Object.keys(grouped).length > 0 && (
          <div class="comment-reactions">
            {Object.entries(grouped).map(([emoji, { src, count }]) => (
              <span class="reaction-chip" title={`${emoji} × ${count}`}>
                {src == null ? (
                  <span class="reaction-emoji">{emoji}</span>
                ) : (
                  <img class="reaction-emoji" src={src} alt={emoji} />
                )}
                {count > 1 && <span class="reaction-count">{count}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

interface ThreadMediaProps {
  readonly medium: Medium;
}

function ThreadMedia({ medium }: ThreadMediaProps) {
  return (
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
        <ThreadMedia medium={medium} />
      ))}
    </>
  );
}

interface ProfilePopupProps {
  readonly accountOwner: AccountOwner & { account: Account };
}

function ProfilePopup({ accountOwner }: ProfilePopupProps) {
  const account = accountOwner.account;
  const nameHtml = renderCustomEmojis(escape(account.name), account.emojis);
  const bioHtml = renderCustomEmojis(account.bioHtml ?? "", account.emojis);
  const url = account.url ?? account.iri;
  return (
    <>
      <div
        id="profile-popup"
        class="profile-popup"
        {...({ popover: "auto" } as Record<string, string>)}
      >
        <button
          type="button"
          class="profile-popup-close"
          aria-label="Close profile"
          {...({
            popovertarget: "profile-popup",
            popovertargetaction: "hide",
          } as Record<string, string>)}
        >
          &times;
        </button>
        {account.coverUrl && (
          <div class="profile-popup-cover">
            <img src={account.coverUrl} alt="" />
          </div>
        )}
        <div class="profile-popup-body">
          <div class="profile-popup-ident">
            {account.avatarUrl && (
              <img
                class="profile-popup-avatar"
                src={account.avatarUrl}
                alt=""
                width={48}
                height={48}
              />
            )}
            <div class="profile-popup-ident-text">
              <a
                class="profile-popup-name"
                href={url}
                dangerouslySetInnerHTML={{ __html: nameHtml }}
              />
              <div class="profile-popup-handle">{account.handle}</div>
              <div class="profile-popup-stats">
                {account.followingCount} following &middot;{" "}
                {account.followersCount === 1
                  ? "1 follower"
                  : `${account.followersCount} followers`}
              </div>
            </div>
          </div>
          {account.bioHtml && (
            <div
              class="profile-popup-bio"
              dangerouslySetInnerHTML={{ __html: bioHtml }}
            />
          )}
          {account.fieldHtmls &&
            Object.keys(account.fieldHtmls).length > 0 && (
              <dl class="profile-popup-fields">
                {Object.entries(account.fieldHtmls).map(([key, value]) => (
                  <>
                    <dt>{key}</dt>
                    <dd dangerouslySetInnerHTML={{ __html: value }} />
                  </>
                ))}
              </dl>
            )}
        </div>
      </div>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: inline positioning script
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const popup = document.getElementById('profile-popup');
  if (!popup) return;
  const place = () => {
    const btn = document.querySelector('[popovertarget="profile-popup"]');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pw = popup.offsetWidth || 340;
    const ph = popup.offsetHeight || 200;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let top = r.bottom + 8;
    let left = r.left;
    if (top + ph > vh - 12) top = Math.max(12, r.top - ph - 8);
    if (left + pw > vw - 12) left = Math.max(12, vw - pw - 12);
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  };
  popup.addEventListener('toggle', (e) => {
    if (e.newState === 'open') requestAnimationFrame(place);
  });
  window.addEventListener('resize', () => {
    if (popup.matches(':popover-open')) place();
  });
})();`,
        }}
      />
    </>
  );
}

export default profilePost;
