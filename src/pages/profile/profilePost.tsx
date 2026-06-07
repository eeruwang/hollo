import { and, asc, eq, inArray, or } from "drizzle-orm";
import { escape } from "es-toolkit";
import { Hono } from "hono";
import { DashboardLayout } from "../../components/DashboardLayout.tsx";
import { PublicShell } from "../../components/PublicShell.tsx";
import db from "../../db.ts";
import { isLoggedIn } from "../../login.ts";
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

/** Walk back from `postId` to the root of the self-thread chain.
 * A self-thread is the maximal chain where each post's `replyTargetId`
 * points to another post by the SAME account. Returns the chain
 * root → leaf, ordered. Returns just `[startPost]` if startPost has
 * no self-reply chain context. */
async function resolveSelfThread(startPostId: Uuid): Promise<FullPost[]> {
  // Walk backward to root
  let cursor: Uuid | null = startPostId;
  let rootId: Uuid = startPostId;
  let accountId: Uuid | null = null;
  const seen = new Set<string>();
  while (cursor != null && !seen.has(cursor)) {
    seen.add(cursor);
    const row: { id: Uuid; accountId: Uuid; replyTargetId: Uuid | null } | undefined =
      await db.query.posts.findFirst({
        where: eq(posts.id, cursor),
        columns: { id: true, accountId: true, replyTargetId: true },
      });
    if (row == null) break;
    if (accountId == null) accountId = row.accountId;
    if (row.accountId !== accountId) break;
    rootId = row.id;
    cursor = row.replyTargetId ?? null;
  }
  if (accountId == null) return [];

  // Walk forward, gathering same-author replies. Breadth-first so we
  // pick the canonical chain (first reply at each branch) rather than
  // an exploded tree.
  const chain: FullPost[] = [];
  let nextId: Uuid | null = rootId;
  const seenForward = new Set<string>();
  while (nextId != null && !seenForward.has(nextId)) {
    seenForward.add(nextId);
    const node = (await db.query.posts.findFirst({
      where: eq(posts.id, nextId),
      with: {
        account: true,
        media: true,
        poll: { with: { options: true } },
        reactions: true,
      },
    })) as FullPost | undefined;
    if (node == null || node.accountId !== accountId) break;
    chain.push(node);
    // First same-author reply
    const reply = await db.query.posts.findFirst({
      where: and(
        eq(posts.replyTargetId, node.id),
        eq(posts.accountId, accountId),
      ),
      orderBy: [asc(posts.published)],
      columns: { id: true },
    });
    nextId = reply?.id ?? null;
  }
  return chain;
}

type FullPost = Post & {
  account: Account;
  media: Medium[];
  poll: (Poll & { options: PollOption[] }) | null;
  reactions: Reaction[];
};

/* /@:handle/:id/thread — render the self-thread reader (article ↔ parts). */
profilePost.get("/thread", async (c) => {
  let handle = c.req.param("handle") ?? "";
  const postId = c.req.param("id") ?? "";
  if (!isUuid(postId)) return c.notFound();
  if (handle.startsWith("@")) handle = handle.substring(1);
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();

  const chain = await resolveSelfThread(postId);
  if (chain.length === 0) return c.notFound();
  // If the chain has only one post, it's just a regular post — fall back.
  if (chain.length === 1) {
    return c.redirect(`/@${handle}/${chain[0].id}`);
  }

  const head = chain[0];
  const title = pickTitle(head);
  const byline = (head.published ?? head.updated).toLocaleDateString("en", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
  const totalLikes = chain.reduce((sum, p) => sum + (p.likesCount ?? 0), 0);
  const totalBoosts = chain.reduce((sum, p) => sum + (p.sharesCount ?? 0), 0);
  const totalReplies = chain.reduce(
    (sum, p) => sum + (p.repliesCount ?? 0),
    0,
  );
  // Estimate read time (200 wpm)
  const wordCount = chain.reduce(
    (n, p) =>
      n +
      (p.content ?? "")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean).length,
    0,
  );
  const readMin = Math.max(1, Math.round(wordCount / 200));
  const threadLoggedIn = await isLoggedIn(c);

  const threadBody = (
    <>
      <div class="cmdline">
        <span class="u">{accountOwner.handle}@hollo</span>:~${" "}
        <span class="cmd">thread read {head.id.slice(0, 4)}</span>{" "}
        <span class="arg">--as-article</span>
      </div>

      <div class="arthead">
        <div class="kicker">
          🧵 self-thread · stitched from {chain.length} posts
        </div>
        <div class="title">{title}</div>
        <div class="byline">
          <span class="au">{accountOwner.handle}</span>{" "}
          {accountOwner.account.handle} <span class="sep">·</span> {byline}{" "}
          <span class="sep">·</span> {readMin} min read
        </div>
      </div>

      <hr class="artrule" />

      <div class="thread-toolbar">
        <span class="seg">
          <a
            href={`/@${handle}/${postId}/thread`}
            class="on"
            data-thread-view="article"
          >
            article
          </a>
          <a
            href={`/@${handle}/${postId}/thread?view=parts`}
            data-thread-view="parts"
          >
            parts
          </a>
        </span>
        <span class="meta-r">
          {chain.length} parts · ♥ {totalLikes} · ↻ {totalBoosts} · ↩{" "}
          {totalReplies}
        </span>
      </div>

      <article id="art" class="pg-article">
        <div class="doc seamless">
          {chain.map((part, idx) => (
            <p class={idx === 0 ? "lede" : undefined}>
              <span class="seam">
                {(idx + 1).toString().padStart(2, "0")}
              </span>{" "}
              <span
                dangerouslySetInnerHTML={{
                  __html: renderCustomEmojis(
                    part.contentHtml ?? "",
                    part.emojis,
                  ),
                }}
              />
            </p>
          ))}
          <div class="endmark">─── /end ───</div>
        </div>

        <div class="doc parts">
          {chain.map((part, idx) => (
            <div class={`part${idx === 0 ? " first" : ""}`}>
              <div class="mg">
                <div class="no">{(idx + 1).toString().padStart(2, "0")}</div>
                <div class="node" />
              </div>
              <div class="ct">
                <p
                  dangerouslySetInnerHTML={{
                    __html: renderCustomEmojis(
                      part.contentHtml ?? "",
                      part.emojis,
                    ),
                  }}
                />
                <div class="pm">
                  {(part.published ?? part.updated).toLocaleString("en", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · ♥ {part.likesCount ?? 0}
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>

      <div class="artfoot">
        <span>
          ♥ <b>{totalLikes}</b> across thread
        </span>
        <span>
          ↻ <b>{totalBoosts}</b>
        </span>
        <span>
          ↩ <b>{totalReplies}</b>
        </span>
        <span class="sp" style="margin-left:auto;" />
        {threadLoggedIn ? (
          <>
            <a
              class="gn"
              href={`/compose?reply_to=${chain[chain.length - 1].id}`}
            >
              ＋ continue thread →
            </a>
            <span class="gn">[s] save .md</span>
            <span class="gn">[r] reply</span>
          </>
        ) : (
          <a class="gn" href={`/@${handle}`}>
            ← back to @{handle}
          </a>
        )}
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const art = document.getElementById('art');
  if (!art) return;
  function setView(v){
    if (v === 'parts') art.classList.add('show-parts');
    else art.classList.remove('show-parts');
    document.querySelectorAll('[data-thread-view]').forEach((a) => {
      a.classList.toggle('on', a.dataset.threadView === v);
    });
  }
  document.querySelectorAll('[data-thread-view]').forEach((a) => {
    a.addEventListener('click', (ev) => { ev.preventDefault(); setView(a.dataset.threadView); });
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
    if (ev.key === 'a') setView('article');
    else if (ev.key === 'p') setView('parts');
  });
  if (new URLSearchParams(location.search).get('view') === 'parts') setView('parts');
  const def = localStorage.getItem('hollo-thread-default');
  if (def && new URLSearchParams(location.search).get('view') == null) setView(def);
})();`,
        }}
      />
    </>
  );

  if (!threadLoggedIn) {
    const instanceHost = new URL(c.req.url).host;
    return c.html(
      <PublicShell
        title={`${title} · ${accountOwner.account.name}`}
        shortTitle={title}
        description={head.summary ?? head.content ?? undefined}
        imageUrl={accountOwner.account.avatarUrl}
        url={head.url ?? head.iri}
        accountOwner={accountOwner}
        instanceHost={instanceHost}
        breadcrumb={`thread · ${chain.length} posts`}
      >
        {threadBody}
      </PublicShell>,
    );
  }

  return c.html(
    <DashboardLayout
      title={`${title} · ${accountOwner.account.name}`}
      selectedMenu="threads"
      shellPath={`thread/${head.id.slice(0, 8)}`}
      shellMode="ARTICLE"
      shellStatus={`${chain.length} posts · ${readMin} min`}
      shellHints={[
        { key: "a/p", label: "article/parts" },
        { key: "s", label: "save .md" },
        { key: "r", label: "reply" },
      ]}
      themeColor={accountOwner.themeColor}
    >
      {threadBody}
    </DashboardLayout>,
  );
});

function pickTitle(p: FullPost): string {
  if (p.summary != null && p.summary.trim() !== "") return p.summary.trim();
  const text = (p.content ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // First sentence boundary
  const m = text.match(/^([^.!?。！？]+)[.!?。！？]/);
  if (m) return m[1].trim();
  return text.length > 80 ? `${text.slice(0, 80).trim()}…` : text;
}

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
  const loggedIn = await isLoggedIn(c);

  const conversationBody = (
    <>
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
        — end of conversation ·{" "}
        {loggedIn ? (
          <>
            <span class="gn">[r]</span> reply
          </>
        ) : (
          <a class="gn" href={`/@${handle}`}>
            back to @{handle}
          </a>
        )}{" "}
        —
      </div>
    </>
  );

  if (!loggedIn) {
    const instanceHost = new URL(c.req.url).host;
    return c.html(
      <PublicShell
        title={`${accountOwner.account.name}: post · ${instanceHost}`}
        shortTitle={`${accountOwner.account.name}: post`}
        description={root.summary ?? root.content ?? undefined}
        imageUrl={accountOwner.account.avatarUrl}
        url={root.url ?? root.iri}
        links={[
          {
            rel: "alternate",
            type: "application/activity+json",
            href: root.iri,
          },
        ]}
        accountOwner={accountOwner}
        instanceHost={instanceHost}
        breadcrumb={`post · ${replyCount} ${
          replyCount === 1 ? "reply" : "replies"
        }`}
      >
        {conversationBody}
      </PublicShell>,
    );
  }

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
      {conversationBody}
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
