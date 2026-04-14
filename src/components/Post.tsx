import type {
  Account,
  Medium as DbMedium,
  Poll as DbPoll,
  Post as DbPost,
  PollOption,
  Reaction,
} from "../schema";
import { renderCustomEmojis } from "../text";

export interface PostProps {
  readonly post: DbPost & {
    account: Account;
    media: DbMedium[];
    poll: (DbPoll & { options: PollOption[] }) | null;
    sharing:
      | (DbPost & {
          account: Account;
          media: DbMedium[];
          poll: (DbPoll & { options: PollOption[] }) | null;
          replyTarget: (DbPost & { account: Account }) | null;
          quoteTarget:
            | (DbPost & {
                account: Account;
                media: DbMedium[];
                poll: (DbPoll & { options: PollOption[] }) | null;
                replyTarget: (DbPost & { account: Account }) | null;
                reactions: Reaction[];
              })
            | null;
          reactions: Reaction[];
        })
      | null;
    replyTarget: (DbPost & { account: Account }) | null;
    quoteTarget:
      | (DbPost & {
          account: Account;
          media: DbMedium[];
          poll: (DbPoll & { options: PollOption[] }) | null;
          replyTarget: (DbPost & { account: Account }) | null;
          reactions: Reaction[];
        })
      | null;
    reactions: Reaction[];
  };
  readonly shared?: Date;
  readonly pinned?: boolean;
  readonly quoted?: boolean;
}

export function Post({ post, shared, pinned, quoted }: PostProps) {
  if (post.sharing != null)
    return (
      <Post
        post={{ ...post.sharing, sharing: null }}
        shared={post.published ?? undefined}
      />
    );
  const account = post.account;
  const authorNameHtml = renderCustomEmojis(account.name, account.emojis);
  const authorUrl = account.url ?? account.iri;
  return (
    <article
      className={`post ${pinned ? "post-pinned" : ""} ${quoted ? "post-quoted" : ""}`}
    >
      <div className="post-author">
        {account.avatarUrl && (
          <img
            src={account.avatarUrl}
            alt={`${account.name}'s avatar`}
            className="post-avatar"
            width={quoted ? 32 : 40}
            height={quoted ? 32 : 40}
          />
        )}
        <div className="post-author-info">
          <span className="post-author-name">
            <a
              dangerouslySetInnerHTML={{ __html: authorNameHtml }}
              href={authorUrl}
            />
          </span>
          <span className="post-author-handle">{account.handle}</span>
        </div>
      </div>
      {post.replyTarget != null && (
        <div className="post-reply-info">
          Reply to{" "}
          <a href={post.replyTarget.url ?? post.replyTarget.iri}>
            {post.replyTarget.account.name}'s post
          </a>
        </div>
      )}
      <div className="post-body">
        {post.summary == null || post.summary.trim() === "" ? (
          <PostContent post={post} />
        ) : (
          <details>
            <summary lang={post.language ?? undefined}>{post.summary}</summary>
            <PostContent post={post} />
          </details>
        )}
      </div>
      <div className="post-footer">
        {shared != null && (
          <span className="post-meta">
            Shared{" "}
            <time dateTime={shared.toISOString()}>
              {shared.toLocaleString("en", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
            {" · "}
          </span>
        )}
        <a href={post.url ?? post.iri} className="post-time">
          <time dateTime={(post.published ?? post.updated).toISOString()}>
            {(post.published ?? post.updated).toLocaleString("en", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </a>
        {post.likesCount != null && post.likesCount > 0 && (
          <span className="post-meta">
            {" · "}
            {post.likesCount} {post.likesCount < 2 ? "like" : "likes"}
          </span>
        )}
        {post.reactions.length > 0 && (
          <span className="post-reactions">
            {" · "}
            {Object.entries(groupByEmojis(post.reactions)).map(
              ([emoji, { src, count }]) =>
                src == null ? (
                  <span title={`${emoji} × ${count}`}>{emoji}</span>
                ) : (
                  <img
                    src={src}
                    alt={emoji}
                    title={`${emoji} × ${count}`}
                    className="post-reaction-emoji"
                  />
                ),
            )}
          </span>
        )}
        {post.sharesCount != null && post.sharesCount > 0 && (
          <span className="post-meta">
            {" · "}
            {post.sharesCount} {post.sharesCount < 2 ? "share" : "shares"}
          </span>
        )}
        {pinned && <span className="post-meta"> · Pinned</span>}
      </div>
    </article>
  );
}

function groupByEmojis(
  reactions: Reaction[],
): Record<string, { src?: string; count: number }> {
  const result: Record<string, { src?: string; count: number }> = {};
  for (const reaction of reactions) {
    if (result[reaction.emoji] == null) {
      result[reaction.emoji] = {
        src: reaction.customEmoji ?? undefined,
        count: 1,
      };
    } else {
      result[reaction.emoji].count++;
    }
  }
  return result;
}

interface PostContentProps {
  readonly post: DbPost & {
    media: DbMedium[];
    poll: (DbPoll & { options: PollOption[] }) | null;
    quoteTarget:
      | (DbPost & {
          account: Account;
          media: DbMedium[];
          poll: (DbPoll & { options: PollOption[] }) | null;
          replyTarget: (DbPost & { account: Account }) | null;
          reactions: Reaction[];
        })
      | null;
  };
}

function PostContent({ post }: PostContentProps) {
  const contentHtml = renderCustomEmojis(post.contentHtml, post.emojis);
  return (
    <>
      {post.contentHtml && (
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: xss
          dangerouslySetInnerHTML={{ __html: contentHtml ?? "" }}
          lang={post.language ?? undefined}
          className="post-content"
        />
      )}
      {post.poll != null && <Poll poll={post.poll} />}
      {post.media.length > 0 && (
        <div className="post-media">
          {post.media.map((medium) => (
            <div className="post-media-item">
              <Medium medium={medium} />
              {medium.description && medium.description.trim() !== "" && (
                <details className="post-alt">
                  <summary>ALT</summary>
                  {medium.description}
                </details>
              )}
            </div>
          ))}
        </div>
      )}
      {post.quoteTarget != null && (
        <Post
          post={{ ...post.quoteTarget, sharing: null, quoteTarget: null }}
          quoted={true}
        />
      )}
    </>
  );
}

interface PollProps {
  readonly poll: DbPoll & { options: PollOption[] };
}

function Poll({ poll }: PollProps) {
  const options = poll.options;
  options.sort((a, b) => (a.index < b.index ? -1 : 1));
  const totalVotes = options.reduce(
    (acc, option) => acc + option.votesCount,
    0,
  );
  return (
    <div className="post-poll">
      {options.map((option) => {
        const percent =
          option.votesCount <= 0
            ? 0
            : Math.round((option.votesCount / totalVotes) * 100);
        return (
          <div className="poll-option" key={option.index}>
            <div className="poll-bar" style={`width: ${percent}%`} />
            <span className="poll-label">{option.title}</span>
            <span className="poll-count">
              {option.votesCount} ({percent}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface MediumProps {
  readonly medium: DbMedium;
}

function Medium({ medium }: MediumProps) {
  return (
    <a href={medium.url}>
      <img
        key={medium.id}
        src={medium.thumbnailUrl}
        alt={medium.description ?? ""}
        width={medium.thumbnailWidth}
        height={medium.thumbnailHeight}
        className="post-media-img"
      />
    </a>
  );
}
