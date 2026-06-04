import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";

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

  return c.html(
    <DashboardLayout
      title="~/compose · Hollo"
      selectedMenu="compose"
      shellPath="compose"
      shellMode="INSERT"
      shellModeAlt={true}
      shellStatus="draft"
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
        <span class="arg">--new</span>
      </div>

      <form
        method="post"
        action="/social/compose"
        enctype="multipart/form-data"
        class="composer"
      >
        <div class="ce-head">
          writing as <span class="au">@{owner.handle}</span>{" "}
          <span class="dimc">·</span> federated via ActivityPub
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
            <b>500</b> left
          </span>
          <button type="submit" class="send">
            post ↵
          </button>
        </div>
      </form>

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
  if (!ta || !counter) return;
  const max = 500;
  const update = () => {
    const left = max - ta.value.length;
    counter.textContent = String(left);
    counter.style.color = left < 0 ? 'var(--red)' : 'var(--ac)';
  };
  ta.addEventListener('input', update);
  update();
  // Cmd/Ctrl + Enter submits
  ta.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      form.requestSubmit();
    }
  });
  // Highlight CW tool when checkbox is checked
  const cw = form.querySelector('input[name="sensitive"]');
  const cwTool = cw && cw.closest('.tool');
  if (cw && cwTool) {
    cw.addEventListener('change', () => {
      cwTool.style.borderColor = cw.checked ? 'var(--am)' : '';
      cwTool.style.color = cw.checked ? 'var(--am)' : '';
    });
  }
  // Show attached file count on the image tool
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
})();`,
        }}
      />
    </DashboardLayout>,
  );
});

export default composePage;
