import type {
  Account,
  Medium as DbMedium,
  Poll as DbPoll,
  Post as DbPost,
  PollOption,
  Reaction,
} from "../schema";
import { renderCustomEmojis } from "../text";

type PostLite = DbPost & {
  account: Account;
  media: DbMedium[];
  poll: (DbPoll & { options: PollOption[] }) | null;
  reactions: Reaction[];
  sharing?:
    | (DbPost & {
        account: Account;
        media: DbMedium[];
        poll: (DbPoll & { options: PollOption[] }) | null;
        reactions: Reaction[];
      })
    | null;
};

export interface TimelineEntryProps {
  readonly post: PostLite;
  /** Renders the entry with the green spine reserved for the owner's
   * own posts.  Defaults to true (the social/home page is the owner's
   * own timeline). */
  readonly mine?: boolean;
  /** Pre-rendered HTML link, mounted via `data-open` so `terminal.js`
   * can navigate to it on Enter / click. */
  readonly openHref?: string;
  /** When set, render the 🧵 self-thread CTA underneath the body
   * pointing at `/@<handle>/<id>/thread`. Indicates the post is the
   * head of a same-author reply chain. */
  readonly threadPartCount?: number;
  /** Owner handle used to build the self-thread CTA href. */
  readonly threadHandle?: string;
  /** Show the PINNED badge before other meta. */
  readonly pinned?: boolean;
}

export function TimelineEntry(props: TimelineEntryProps) {
  const { post } = props;
  const isBoost = post.sharing != null;
  const subject = isBoost ? post.sharing! : post;
  const account = subject.account;
  const mine = props.mine ?? !isBoost;
  const nameHtml = renderCustomEmojis(account.name, account.emojis);
  const className = isBoost ? "entry other" : mine ? "entry mine" : "entry";

  const threadHref =
    props.threadPartCount && props.threadHandle
      ? `/@${props.threadHandle}/${subject.id}/thread`
      : undefined;
  return (
    <article class={className} data-open={threadHref ?? props.openHref}>
      <div class="meta">
        {props.pinned && <span class="badge">PINNED</span>}
        {isBoost && <span class="badge out">BOOST</span>}
        <span class="au" dangerouslySetInnerHTML={{ __html: nameHtml }} />
        <span class="ts">
          {account.handle} · {formatTimestamp(subject.published)}
        </span>
      </div>
      {subject.contentHtml != null && subject.contentHtml !== "" && (
        <div
          class={isBoost ? "quote" : "txt"}
          dangerouslySetInnerHTML={{ __html: subject.contentHtml }}
        />
      )}
      {threadHref && (
        <a class="threadcta" href={threadHref}>
          <span class="ic">🧵</span>
          <span class="lab">
            self-thread · <b>{props.threadPartCount} posts</b> → read as one
            article
          </span>
          <span class="mini">
            {Array.from({ length: Math.min(props.threadPartCount ?? 0, 8) }).map(
              () => (
                <i />
              ),
            )}
          </span>
          <span class="go">[↵] ▸</span>
        </a>
      )}
      {subject.media.length > 0 && (
        <div class="media">
          [ {subject.media.length} attachment
          {subject.media.length === 1 ? "" : "s"} ]
        </div>
      )}
      {subject.poll != null && <PollBlock poll={subject.poll} />}
      <div class="acts">
        <span class="a reply">
          ↩ <b>{subject.repliesCount ?? 0}</b>
        </span>
        <span class={`a boost${isBoost ? " on" : ""}`}>
          ↻ <b>{subject.sharesCount ?? 0}</b>
        </span>
        <span class="a fav">
          ♥ <b>{subject.likesCount ?? 0}</b>
        </span>
        {subject.reactions.length > 0 && (
          <>
            <span class="rsep">·</span>
            <span class="rxn-mini">
              {Object.entries(groupReactions(subject.reactions)).map(
                ([emoji, { count, src }]) => (
                  <span class="chip">
                    <span class="em">
                      {src ? (
                        <img
                          src={src}
                          alt={emoji}
                          style="width:14px; height:14px; object-fit:contain; vertical-align:middle;"
                        />
                      ) : (
                        emoji
                      )}
                    </span>
                    <span class="n">{count}</span>
                  </span>
                ),
              )}
              <span class="chip add">
                <span class="em">＋</span>
              </span>
            </span>
          </>
        )}
      </div>
    </article>
  );
}

function PollBlock({
  poll,
}: { poll: DbPoll & { options: PollOption[] } }) {
  const total = poll.options.reduce(
    (sum, option) => sum + (option.votesCount ?? 0),
    0,
  );
  const lead = Math.max(
    ...poll.options.map((option) => option.votesCount ?? 0),
  );
  return (
    <div class="poll">
      {poll.options.map((option) => {
        const count = option.votesCount ?? 0;
        const pct = total === 0 ? 0 : Math.round((count / total) * 100);
        const filled = Math.max(0, Math.min(18, Math.round((count / Math.max(1, lead)) * 18)));
        const empty = 18 - filled;
        const isLead = count === lead && lead > 0;
        return (
          <div class={`o${isLead ? " lead" : ""}`}>
            <span class="lbl">{option.title}</span>
            <span class="bar">
              <span class="fb">{"█".repeat(filled)}</span>
              <span class="eb">{"░".repeat(empty)}</span>
            </span>
            <span class="pc">{pct}%</span>
          </div>
        );
      })}
      <div class="pm">
        {total} vote{total === 1 ? "" : "s"}
        {poll.expires != null
          ? ` · expires ${formatTimestamp(poll.expires)}`
          : ""}
      </div>
    </div>
  );
}

function groupReactions(
  reactions: Reaction[],
): Record<string, { count: number; src?: string }> {
  const result: Record<string, { count: number; src?: string }> = {};
  for (const r of reactions) {
    // `customEmoji` is the image URL when the reaction is a custom
    // (shortcoded) emoji; for unicode emoji it's null and we just
    // render the glyph as text.
    const src = r.customEmoji ?? undefined;
    if (result[r.emoji] == null) {
      result[r.emoji] = { count: 1, src };
    } else {
      result[r.emoji].count++;
      if (src && !result[r.emoji].src) result[r.emoji].src = src;
    }
  }
  return result;
}

function formatTimestamp(value: Date | null | undefined): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86_400 * 7) return `${Math.floor(diff / 86_400)}d`;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}
