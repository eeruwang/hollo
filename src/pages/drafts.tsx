import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";

const draftsPage = new Hono();

draftsPage.use(loginRequired);

draftsPage.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  // Drafts live in localStorage on the user's device — the design says
  // "only on this device". The server renders the shell + an empty
  // container that the inline script populates from
  // localStorage['hollo-drafts'].
  return c.html(
    <DashboardLayout
      title="~/drafts · Hollo"
      selectedMenu="compose"
      shellPath="drafts"
      shellStatus="autosaved"
      shellHints={[
        { key: "Enter", label: "resume" },
        { key: "d", label: "delete" },
        { key: "c", label: "new" },
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">drafts</span> <span class="arg">--list</span>{" "}
        <span class="dimc">
          · autosaved locally · <span data-draft-count>0</span> draft
          <span data-draft-plural />
        </span>
      </div>

      <div data-draft-list />

      <div
        data-draft-empty
        class="state"
        style="display:none;"
      >
        <div class="glyph">✎</div>
        <div class="ttl">no drafts yet</div>
        <div class="msg">
          compose pages autosave to your browser every few seconds. drafts
          are cleared once posted.
        </div>
        <a class="cta btn pri" href="/compose">
          ＋ start writing
        </a>
      </div>

      <div class="endcap">
        — drafts autosave from compose · cleared on post · only on this
        device —
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `(() => {
  function read(){
    try { return JSON.parse(localStorage.getItem('hollo-drafts') || '[]') || []; }
    catch(e){ return []; }
  }
  function write(list){
    try { localStorage.setItem('hollo-drafts', JSON.stringify(list)); } catch(e){}
  }
  function rel(when){
    var s = (Date.now() - when) / 1000;
    if (s < 60) return 'saved ' + Math.max(1, Math.floor(s)) + 's ago';
    if (s < 3600) return 'saved ' + Math.floor(s/60) + 'm ago';
    if (s < 86400) return 'saved ' + Math.floor(s/3600) + 'h ago';
    return 'saved ' + Math.floor(s/86400) + 'd ago';
  }
  function esc(s){
    var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
  }
  function render(){
    var drafts = read().filter(function(d){ return d && d.content && d.content.trim().length > 0; });
    drafts.sort(function(a,b){ return (b.updated||0) - (a.updated||0); });
    var list = document.querySelector('[data-draft-list]');
    var empty = document.querySelector('[data-draft-empty]');
    var count = document.querySelector('[data-draft-count]');
    var plural = document.querySelector('[data-draft-plural]');
    if (!list || !empty) return;
    list.innerHTML = '';
    if (count) count.textContent = drafts.length;
    if (plural) plural.textContent = drafts.length === 1 ? '' : 's';
    if (drafts.length === 0){ empty.style.display = ''; return; }
    empty.style.display = 'none';
    drafts.forEach(function(d){
      var snip = d.content.replace(/\\s+/g, ' ').trim();
      if (snip.length > 200) snip = snip.slice(0,200) + '…';
      var meta = '<span class="ts">' + rel(d.updated || Date.now()) + '</span>';
      var badges = '';
      if (d.replyToId) badges = '<span class="badge out">🧵 continuation</span> ';
      if (d.spoiler) meta += ' <span class="muted">· CW</span>';
      var art = document.createElement('article');
      art.className = 'entry mine';
      var resumeHref = '/compose?draft=' + encodeURIComponent(d.id);
      art.setAttribute('data-open', resumeHref);
      art.innerHTML = '<div class="meta">' + badges + meta + '</div>' +
        '<div class="txt">' + esc(snip) + '</div>' +
        '<div class="acts">' +
          '<a class="a" href="' + resumeHref + '">▸ resume</a>' +
          '<span class="a" data-delete="' + esc(d.id) + '" style="cursor:pointer;">⌫ delete</span>' +
        '</div>';
      list.appendChild(art);
    });
    list.querySelectorAll('[data-delete]').forEach(function(btn){
      btn.addEventListener('click', function(ev){
        ev.preventDefault(); ev.stopPropagation();
        var id = btn.getAttribute('data-delete');
        write(read().filter(function(x){ return x.id !== id; }));
        render();
      });
    });
  }
  render();
  window.addEventListener('storage', function(ev){
    if (ev.key === 'hollo-drafts') render();
  });
})();`,
        }}
      />
    </DashboardLayout>,
  );
});

export default draftsPage;
