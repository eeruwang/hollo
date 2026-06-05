import { and, asc, eq, inArray, or } from "drizzle-orm";
import { escape } from "es-toolkit";
import { Hono } from "hono";
import { DashboardLayout } from "../../components/DashboardLayout.tsx";
import db from "../../db.ts";
import {
  type Account,
  accountOwners,
  customEmojis,
  type Medium,
  type Poll,
  type PollOption,
  type Post,
  posts,
  type Reaction,
} from "../../schema.ts";
import { renderCustomEmojis } from "../../text.ts";
import { isUuid, type Uuid } from "../../uuid.ts";

const profilePost = new Hono();

type FullPost = Post & {
  account: Account;
  media: Medium[];
  poll: (Poll & { options: PollOption[] }) | null;
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

  const root = (await db.query.posts.findFirst({
    where: and(
      eq(posts.id, postId),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
    ),
    with: {
      account: true,
      media: true,
      poll: { with: { options: true } },
      reactions: true,
    },
  })) as FullPost | undefined;
  if (root == null) return c.notFound();

  // Walk up the parent chain (any account) up to a small limit
  const ancestors: FullPost[] = [];
  let cursor: Uuid | null = root.replyTargetId ?? null;
  while (cursor != null && ancestors.length < 8) {
    const parent = (await db.query.posts.findFirst({
      where: eq(posts.id, cursor),
      with: {
        account: true,
        media: true,
        poll: { with: { options: true } },
        reactions: true,
      },
    })) as FullPost | undefined;
    if (parent == null) break;
    ancestors.unshift(parent);
    cursor = parent.replyTargetId ?? null;
  }

  // Direct + nested replies (any account, public+unlisted)
  const allDescendants = (await db.query.posts.findMany({
    where: and(
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
    ),
    orderBy: asc(posts.published),
    with: {
      account: true,
      media: true,
      poll: { with: { options: true } },
      reactions: true,
    },
  })) as FullPost[];
  // Build parent → children map, then DFS from root
  const childrenOf = new Map<string, FullPost[]>();
  for (const p of allDescendants) {
    if (p.replyTargetId != null) {
      const bucket = childrenOf.get(p.replyTargetId) ?? [];
      bucket.push(p);
      childrenOf.set(p.replyTargetId, bucket);
    }
  }
  type ReplyNode = { post: FullPost; children: ReplyNode[] };
  const buildTree = (parentId: Uuid, depth: number): ReplyNode[] => {
    if (depth > 4) return [];
    return (childrenOf.get(parentId) ?? []).map((post) => ({
      post,
      children: buildTree(post.id, depth + 1),
    }));
  };
  const replyTree = buildTree(root.id, 0);

  // Aggregate reactions on the root + collect "who fav/boosted"
  const favWho = await db.query.likes.findMany({
    where: eq(posts.id, root.id), // placeholder — Hollo's "likes" relation is on posts
    limit: 0, // disabled until likes schema is wired here; keep stub
  });
  void favWho;

  // Locally-mirrored custom emoji map for reaction rendering
  const usedShortcodes = new Set<string>();
  const collectCodes = (list: readonly Reaction[]) => {
    for (const r of list) {
      if (r.emoji.startsWith(":") && r.emoji.endsWith(":")) {
        usedShortcodes.add(r.emoji.replace(/^:|:$/g, ""));
      }
    }
  };
  collectCodes(root.reactions);
  const localEmojiMap = new Map<string, string>();
  if (usedShortcodes.size > 0) {
    const localEmojis = await db.query.customEmojis.findMany({
      where: inArray(customEmojis.shortcode, [...usedShortcodes]),
      columns: { shortcode: true, url: true },
    });
    for (const row of localEmojis) {
      localEmojiMap.set(row.shortcode, row.url);
    }
  }

  const replyCount = countReplies(replyTree);

  return c.html(
    <DashboardLayout
      title={`~/post/${root.id.slice(0, 8)} · ${accountOwner.account.name}`}
      selectedMenu="home"
      shellPath={`post/${root.id.slice(0, 8)}`}
      shellMode="FOCUS"
      shellStatus={`${root.id.slice(0, 8)} · ${replyCount} repl${
        replyCount === 1 ? "y" : "ies"
      }`}
      shellHints={[
        { key: "u", label: "parent" },
        { key: "r", label: "reply" },
        { key: "f", label: "fav" },
        { key: "o", label: "open author" },
      ]}
      themeColor={accountOwner.themeColor}
      description={root.summary ?? root.content ?? undefined}
      imageUrl={accountOwner.account.avatarUrl}
      url={root.url ?? root.iri}
      links={[
        { rel: "alternate", type: "application/activity+json", href: root.iri },
      ]}
    >
      <div class="cmdline">
        <span class="u">{accountOwner.handle}@hollo</span>:~${" "}
        <span class="cmd">post open {root.id.slice(0, 4)}</span>{" "}
        <span class="arg">--context</span>
      </div>

      {ancestors.length > 0 && (
        <>
          <div class="ctxhead">
            ↑ context · {ancestors.length} earlier —{" "}
            <span class="gn">[u] expand</span>
          </div>
          {ancestors.map((p, idx) => (
            <CtxLine post={p} depth={idx} />
          ))}
        </>
      )}

      <FocusBlock post={root} localEmojiMap={localEmojiMap} />

      {replyCount > 0 && (
        <div class="rephead">
          ↓ {replyCount} repl{replyCount === 1 ? "y" : "ies"}
        </div>
      )}
      {replyTree.map((node) => (
        <ReplyBlock node={node} />
      ))}

      <div class="endcap">
        — end of conversation · <span class="gn">[r]</span> reply ·{" "}
        {ancestors.length > 0 && (
          <>
            <span class="gn">[u]</span> jump to parent
          </>
        )}{" "}
        —
      </div>
    </DashboardLayout>,
  );
});

function countReplies(tree: { children: any[] }[]): number {
  let n = 0;
  const walk = (nodes: { children: any[] }[]) => {
    for (const n2 of nodes) {
      n++;
      walk(n2.children);
    }
  };
  walk(tree);
  return n;
}

function CtxLine({ post, depth }: { post: FullPost; depth: number }) {
  const handle = post.account.handle;
  const shortHandle = handle.startsWith("@")
    ? handle.split("@")[1] ?? handle
    : handle;
  const indent = " ".repeat(depth);
  const text = stripHtmlInline(post.contentHtml ?? "");
  return (
    <div class="ctx">
      <span class="dimc">{indent}╰</span>{" "}
      <span class="au">{shortHandle}</span>{" "}
      <span class="muted">{text.slice(0, 80)}</span>
    </div>
  );
}

function FocusBlock({
  post,
  localEmojiMap,
}: {
  post: FullPost;
  localEmojiMap: ReadonlyMap<string, string>;
}) {
  const html = renderCustomEmojis(post.contentHtml ?? "", post.emojis);
  const account = post.account;
  const nameHtml = renderCustomEmojis(escape(account.name), account.emojis);
  const initial =
    account.name.trim().charAt(0).toUpperCase() ||
    account.handle.replace(/^@/, "").charAt(0).toUpperCase();
  const handleStr = account.handle.startsWith("@")
    ? account.handle
    : `@${account.handle}`;
  const published = post.published ?? post.updated;
  const grouped = groupReactions(post.reactions, localEmojiMap);
  return (
    <div class="focus">
      <div class="ph">
        {account.avatarUrl ? (
          <img
            src={account.avatarUrl}
            alt=""
            class="av"
            width={30}
            height={30}
            style="object-fit:cover;"
          />
        ) : (
          <span class="av">{initial}</span>
        )}
        <span
          class="au"
          dangerouslySetInnerHTML={{ __html: nameHtml }}
        />{" "}
        <span class="hn">{handleStr}</span>
      </div>
      <div class="bigtx" dangerouslySetInnerHTML={{ __html: html }} />
      <div class="acts">
        <span class="a reply">
          ↩ <b>{post.repliesCount ?? 0}</b>
        </span>
        <span class="a boost">
          ↻ <b>{post.sharesCount ?? 0}</b>
        </span>
        <span class="a fav">
          ♥ <b>{post.likesCount ?? 0}</b>
        </span>
        <span class="muted">
          ⌗ bookmark ·{" "}
          {published.toLocaleString("en", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      {Object.keys(grouped).length > 0 && (
        <div class="reactions">
          <div class="rxn-chips">
            {Object.entries(grouped).map(([emoji, { count, src }]) => (
              <span class="rxn-chip">
                {src ? (
                  <img
                    class="em"
                    src={src}
                    alt={emoji}
                    style="width:13px;height:13px;object-fit:contain;"
                  />
                ) : (
                  <span class="em">{emoji}</span>
                )}
                <span class="n">{count}</span>
              </span>
            ))}
            <span class="rxn-chip add">
              <span class="em">＋</span>
              <span class="n">react</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ReplyBlock({
  node,
}: {
  node: { post: FullPost; children: { post: FullPost; children: any[] }[] };
}) {
  const post = node.post;
  const account = post.account;
  const handleStr = account.handle.startsWith("@")
    ? account.handle
    : `@${account.handle}`;
  const published = post.published ?? post.updated;
  const html = renderCustomEmojis(post.contentHtml ?? "", post.emojis);
  return (
    <div class="reply">
      <div>
        <span
          class="au"
          dangerouslySetInnerHTML={{
            __html: renderCustomEmojis(escape(account.name), account.emojis),
          }}
        />{" "}
        <span class="hn">
          {handleStr} ·{" "}
          {published.toLocaleString("en", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div class="txt" dangerouslySetInnerHTML={{ __html: html }} />
      <div class="acts">
        <span class="a reply">↩ {post.repliesCount ?? 0}</span>
        <span class="a fav">♥ {post.likesCount ?? 0}</span>
      </div>
      {node.children.map((child) => (
        <ReplyBlock node={child} />
      ))}
    </div>
  );
}

function groupReactions(
  reactionList: Reaction[],
  localEmojiMap: ReadonlyMap<string, string>,
): Record<string, { count: number; src?: string }> {
  const result: Record<string, { count: number; src?: string }> = {};
  for (const r of reactionList) {
    let src = r.customEmoji ?? undefined;
    if (r.emoji.startsWith(":") && r.emoji.endsWith(":")) {
      const code = r.emoji.slice(1, -1);
      const localUrl = localEmojiMap.get(code);
      if (localUrl != null) src = localUrl;
    }
    if (result[r.emoji] == null) {
      result[r.emoji] = { count: 1, src };
    } else {
      result[r.emoji].count++;
    }
  }
  return result;
}

function stripHtmlInline(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default profilePost;
