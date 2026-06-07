import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { posts } from "../schema.ts";
import { isUuid, type Uuid } from "../uuid.ts";

const LANGUAGE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "ko", label: "Korean" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ru", label: "Russian" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
];

const composePage = new Hono();

composePage.use(loginRequired);

composePage.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  // ?reply_to=<postId> mode: when set, the editor renders the .chain
  // block listing the existing thread the new post will continue. The
  // POSTed status sets in_reply_to_id so federation stitches it onto
  // the chain.
  const replyToParam = c.req.query("reply_to");
  let replyTo: Uuid | null = null;
  let chain: { id: Uuid; content: string | null; published: Date | null }[] = [];
  if (replyToParam != null && isUuid(replyToParam)) {
    // Resolve the chain head and walk the whole same-author chain so
    // we can show every previous part.
    let cursor: Uuid | null = replyToParam as Uuid;
    let head: Uuid = cursor;
    const seen = new Set<string>();
    while (cursor != null && !seen.has(cursor)) {
      seen.add(cursor);
      const row: { id: Uuid; accountId: Uuid; replyTargetId: Uuid | null } | undefined =
        await db.query.posts.findFirst({
          where: eq(posts.id, cursor),
          columns: { id: true, accountId: true, replyTargetId: true },
        });
      if (row == null || row.accountId !== owner.id) break;
      head = row.id;
      cursor = row.replyTargetId ?? null;
    }
    // Walk forward from head
    let nextId: Uuid | null = head;
    const forwardSeen = new Set<string>();
    while (nextId != null && !forwardSeen.has(nextId)) {
      forwardSeen.add(nextId);
      const node: {
        id: Uuid;
        content: string | null;
        published: Date | null;
      } | undefined = await db.query.posts.findFirst({
        where: eq(posts.id, nextId),
        columns: { id: true, content: true, published: true },
      });
      if (node == null) break;
      chain.push(node);
      const reply: { id: Uuid } | undefined = await db.query.posts.findFirst({
        where: and(
          eq(posts.replyTargetId, node.id),
          eq(posts.accountId, owner.id),
        ),
        orderBy: [asc(posts.published)],
        columns: { id: true },
      });
      nextId = reply?.id ?? null;
    }
    // replyTo is the LEAF of the existing chain (the post we're
    // continuing) — that's the last entry in chain[].
    replyTo = chain.length > 0 ? chain[chain.length - 1].id : null;
  }

  return c.html(
    <DashboardLayout
      title="~/compose · Hollo"
      selectedMenu="compose"
      shellPath={replyTo ? "compose --continue" : "compose"}
      shellMode="INSERT"
      shellModeAlt={true}
      shellStatus={replyTo ? `continuing 🧵 (part ${chain.length + 1})` : "draft"}
      shellHints={[
        { key: "⌘↵", label: "post" },
        { key: "⌃w", label: "cw" },
        { key: "esc", label: "discard" },
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">compose</span>{" "}
        <span class="arg">
          {replyTo ? `--reply-to ${replyTo.slice(0, 4)}` : "--new"}
        </span>
      </div>

      <form
        method="post"
        action="/social/compose"
        enctype="multipart/form-data"
        class="composer"
        data-draft-id={c.req.query("draft") ?? ""}
        data-draft-reply-to={replyTo ?? ""}
      >
        {replyTo && (
          <input type="hidden" name="in_reply_to_id" value={replyTo} />
        )}
        <div class="ce-head">
          writing as <span class="au">@{owner.handle}</span>{" "}
          <span class="dimc">·</span>{" "}
          {replyTo ? (
            <>
              continuing 🧵 self-thread{" "}
              <span class="dimc">(part {chain.length + 1})</span>
            </>
          ) : (
            <>federated via ActivityPub</>
          )}
        </div>
        <div class="ce-body">
          <textarea
            name="content"
            spellcheck={false}
            placeholder="type your post… markdown ok · #hashtags · @mentions"
            required
            rows={6}
          />
        </div>
        <div class="ce-foot">
          <label class="tool" title="content warning" style="cursor:pointer;">
            ⚠
            <input
              type="checkbox"
              name="sensitive"
              value="true"
              style="display:none;"
            />
          </label>
          <label
            class="tool"
            title="attach image / video"
            style="cursor:pointer;"
          >
            🖼
            <input
              type="file"
              name="media"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm"
              style="display:none;"
            />
          </label>
          <select name="visibility" class="vis">
            <option value="public">▾ public</option>
            <option value="unlisted">▾ unlisted</option>
            <option value="private">▾ followers</option>
            <option value="direct">▾ direct</option>
          </select>
          <select name="language" class="vis">
            <option value="">{owner.language}</option>
            {LANGUAGE_OPTIONS.map((opt) => (
              <option value={opt.code}>{opt.code}</option>
            ))}
          </select>
          <input
            type="text"
            name="spoiler_text"
            placeholder="content warning…"
            style="background:transparent; border:1px solid var(--bd); padding:5px 9px; color:var(--fg); font-family:var(--mono); font-size:12px; flex:1; min-width:120px; outline:none;"
          />
          <span class="count" data-compose-count>
            <b>10000</b> left
          </span>
          <button type="submit" class="send">
            post ↵
          </button>
        </div>
      </form>

      {chain.length > 0 && (
        <div class="chain">
          <div class="ch-h">
            ▸ this continues your thread — readers see it stitched into the
            article:
          </div>
          {chain.map((part, idx) => {
            const snippet = (part.content ?? "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            return (
              <div class="prev">
                <span class="n">
                  {idx + 1}/{chain.length} ·
                </span>{" "}
                {snippet.length > 120
                  ? `${snippet.slice(0, 120)}…`
                  : snippet}
              </div>
            );
          })}
          <div
            class="prev"
            style="border-left-color:var(--ac); color:var(--fgs);"
          >
            <span class="n" style="color:var(--ac);">
              {chain.length + 1}/{chain.length + 1} ·
            </span>{" "}
            <span class="dimc">draft</span>
            <span class="cursor" />
          </div>
        </div>
      )}

      {!replyTo && (
        <p
          style="margin-top:12px; color:var(--faint); font-size:12px;"
        >
          continuing an existing thread? open one of your posts and the{" "}
          <span class="gn">🧵 read as one article</span> CTA will offer a
          "continue" link.
        </p>
      )}

      <div class="endcap">
        ⌘↵ to post · federated via ActivityPub · drafts saved client-side
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const form = document.querySelector('.composer');
  if (!form) return;
  const ta = form.querySelector('textarea[name="content"]');
  const counter = form.querySelector('[data-compose-count] b');
  const spoiler = form.querySelector('input[name="spoiler_text"]');
  if (!ta || !counter) return;
  const max = 10000;
  const update = () => {
    const left = max - ta.value.length;
    counter.textContent = String(left);
    counter.style.color = left < 0 ? 'var(--red)' : 'var(--ac)';
  };
  ta.addEventListener('input', update);
  update();
  ta.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      form.requestSubmit();
    }
  });
  const cw = form.querySelector('input[name="sensitive"]');
  const cwTool = cw && cw.closest('.tool');
  if (cw && cwTool) {
    cw.addEventListener('change', () => {
      cwTool.style.borderColor = cw.checked ? 'var(--am)' : '';
      cwTool.style.color = cw.checked ? 'var(--am)' : '';
    });
  }
  const attach = form.querySelector('input[name="media"]');
  const attachTool = attach && attach.closest('.tool');
  if (attach && attachTool) {
    attach.addEventListener('change', () => {
      const n = attach.files ? attach.files.length : 0;
      if (n > 0) {
        attachTool.style.borderColor = 'var(--ac)';
        attachTool.style.color = 'var(--ac)';
        attachTool.title = n + ' file' + (n > 1 ? 's' : '') + ' attached';
      } else {
        attachTool.style.borderColor = '';
        attachTool.style.color = '';
      }
    });
  }

  // ---------- Draft autosave ----------
  function readDrafts(){
    try { return JSON.parse(localStorage.getItem('hollo-drafts') || '[]') || []; }
    catch(e){ return []; }
  }
  function writeDrafts(list){
    try { localStorage.setItem('hollo-drafts', JSON.stringify(list)); } catch(e){}
  }
  function uuid(){
    return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  }
  let draftId = form.getAttribute('data-draft-id') || '';
  const replyToHint = form.getAttribute('data-draft-reply-to') || '';

  // Hydrate from existing draft on load
  if (draftId) {
    const existing = readDrafts().find(d => d.id === draftId);
    if (existing) {
      ta.value = existing.content || '';
      if (spoiler && existing.spoiler) spoiler.value = existing.spoiler;
      if (cw && existing.sensitive) { cw.checked = true; cw.dispatchEvent(new Event('change')); }
      update();
    }
  }

  let savePending = null;
  function persist(){
    const content = ta.value || '';
    if (content.trim().length === 0) return; // don't save empties
    if (!draftId) draftId = uuid();
    const list = readDrafts().filter(d => d.id !== draftId);
    list.push({
      id: draftId,
      content,
      spoiler: spoiler ? spoiler.value : '',
      sensitive: cw ? cw.checked : false,
      replyToId: replyToHint || null,
      updated: Date.now(),
    });
    // Cap stored drafts at 25 to avoid runaway localStorage growth.
    list.sort((a,b) => (b.updated||0) - (a.updated||0));
    writeDrafts(list.slice(0, 25));
  }
  function schedule(){
    if (savePending) clearTimeout(savePending);
    savePending = setTimeout(persist, 1500);
  }
  ta.addEventListener('input', schedule);
  if (spoiler) spoiler.addEventListener('input', schedule);
  if (cw) cw.addEventListener('change', schedule);

  // Clear the matching draft when the form actually submits.
  form.addEventListener('submit', () => {
    if (draftId) writeDrafts(readDrafts().filter(d => d.id !== draftId));
  });
})();`,
        }}
      />
    </DashboardLayout>,
  );
});

export default composePage;
