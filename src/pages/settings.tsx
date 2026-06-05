import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { getPhosphorColor } from "../phosphor.ts";
import { accountOwners, type ThemeColor } from "../schema.ts";

const settings = new Hono();

settings.use(loginRequired);

settings.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  const currentPhosphor = getPhosphorColor(owner.themeColor);

  return c.html(
    <DashboardLayout
      title="~/settings · Hollo"
      selectedMenu="settings"
      shellPath="settings"
      shellMode="CONFIG"
      shellStatus="settings · single-user"
      shellHints={[
        { key: "j/k", label: "row" },
        { key: "Enter", label: "edit" },
        { key: "w", label: "save" },
        { key: "q", label: "back" },
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">config</span>{" "}
        <span class="arg">--edit</span>
      </div>

      <div class="setblock">
        <div class="sb-h">[ identity ]</div>
        <div class="setrow">
          <div class="lab">
            display name
            <div class="d">shown on your profile</div>
          </div>
          <div class="val">{owner.account.name}</div>
        </div>
        <div class="setrow">
          <div class="lab">handle</div>
          <div class="val">{owner.account.handle}</div>
        </div>
        <div class="setrow">
          <div class="lab">bio</div>
          <div class="val muted">
            {owner.bio ? truncate(owner.bio, 64) : "—"}
          </div>
        </div>
        <div class="setrow">
          <div class="lab">edit profile</div>
          <div class="val">
            <a class="btn" href="/accounts">
              [ open editor ]
            </a>
          </div>
        </div>
      </div>

      <div class="setblock">
        <div class="sb-h">[ appearance ]</div>
        <div class="setrow">
          <div class="lab">
            phosphor color
            <div class="d">terminal accent</div>
          </div>
          <div class="val">
            <div class="swatches" data-phosphor-swatches>
              <Swatch color="green" current={currentPhosphor} hex="#7ee787" />
              <Swatch color="amber" current={currentPhosphor} hex="#e3b341" />
              <Swatch color="cyan" current={currentPhosphor} hex="#67d4de" />
              <Swatch
                color="magenta"
                current={currentPhosphor}
                hex="#d875ff"
              />
            </div>
          </div>
        </div>
        <div class="setrow">
          <div class="lab">
            CRT glow + scanlines
            <div class="d">amber tube vibes (per device)</div>
          </div>
          <div class="val">
            <span
              class="toggle"
              role="switch"
              tabindex={0}
              data-hollo-toggle="crt"
            >
              [<span class="kn" />]<span class="ln" />
            </span>
          </div>
        </div>
        <div class="setrow">
          <div class="lab">
            light mode
            <div class="d">paper terminal</div>
          </div>
          <div class="val">
            <span
              class="toggle"
              role="switch"
              tabindex={0}
              data-hollo-toggle="theme"
            >
              [<span class="kn" />]<span class="ln" />
            </span>
          </div>
        </div>
        <div class="setrow">
          <div class="lab">density</div>
          <div class="val">
            <span class="seg" data-hollo-density>
              <a href="#" data-val="compact">
                compact
              </a>
              <a href="#" class="on" data-val="cozy">
                regular
              </a>
              <a href="#" data-val="comfy">
                comfy
              </a>
            </span>
          </div>
        </div>
        <div class="setrow">
          <div class="lab">
            self-thread default
            <div class="d">how 🧵 threads open</div>
          </div>
          <div class="val">
            <span class="seg" data-hollo-thread-default>
              <a href="#" class="on" data-val="article">
                article
              </a>
              <a href="#" data-val="parts">
                parts
              </a>
            </span>
          </div>
        </div>
        <div class="setrow">
          <div class="lab">
            default post visibility
            <div class="d">{owner.visibility}</div>
          </div>
          <div class="val">
            <a class="btn" href="/accounts">
              [ edit ]
            </a>
          </div>
        </div>
        <div class="setrow">
          <div class="lab">
            language
            <div class="d">default post language</div>
          </div>
          <div class="val">{owner.language}</div>
        </div>
      </div>

      <div class="setblock">
        <div class="sb-h">[ federation ]</div>
        <div class="setrow">
          <div class="lab">software</div>
          <div class="val">Hollo · eeruwang fork</div>
        </div>
        <div class="setrow">
          <div class="lab">protocol</div>
          <div class="val">ActivityPub · Fedify</div>
        </div>
        <div class="setrow">
          <div class="lab">federation dashboard</div>
          <div class="val">
            <a class="btn" href="/federation">
              [ open ]
            </a>
          </div>
        </div>
        <div class="setrow">
          <div class="lab">custom emojis</div>
          <div class="val">
            <a class="btn" href="/emojis">
              [ manage ]
            </a>
          </div>
        </div>
      </div>

      <div class="setblock">
        <div class="sb-h">[ integrations ]</div>
        <div class="setrow">
          <div class="lab">
            webhooks
            <div class="d">post notifications to Discord, Slack, …</div>
          </div>
          <div class="val">
            <a class="btn" href="/webhooks">
              [ manage ]
            </a>
          </div>
        </div>
        <div class="setrow">
          <div class="lab">
            OAuth apps
            <div class="d">app passwords / API tokens</div>
          </div>
          <div class="val">
            <a class="btn" href="/auth">
              [ manage ]
            </a>
          </div>
        </div>
      </div>

      <div class="setblock">
        <div class="sb-h">[ account ]</div>
        <div class="setrow">
          <div class="lab">
            export archive
            <div class="d">all posts + media (.zip)</div>
          </div>
          <div class="val">
            <a class="btn" href="/backup">
              [ download ]
            </a>
          </div>
        </div>
        <div class="setrow">
          <div class="lab">sign out</div>
          <div class="val">
            <form
              method="post"
              action="/logout"
              style="display:inline; margin:0;"
            >
              <button type="submit" class="btn" style="color:var(--red);">
                [ logout ]
              </button>
            </form>
          </div>
        </div>
      </div>

      <div class="endcap">— config written to ~/.hollo/config —</div>

      <script
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const HTML = document.documentElement;

  // ---------- two-state toggles (CRT, theme=paper) ----------
  function applyToggle(key){
    const t = document.querySelector('[data-hollo-toggle="' + key + '"]');
    if (!t) return;
    const stored = localStorage.getItem('hollo-' + key);
    const isOn = key === 'theme' ? stored === 'paper' : stored === 'on';
    const knob = t.querySelector('.kn');
    const lbl = t.querySelector('.ln');
    if (knob) knob.textContent = isOn ? 'x' : ' ';
    if (lbl) lbl.textContent = isOn ? ' on' : ' off';
    knob && (knob.style.color = isOn ? 'var(--ac)' : 'var(--faint)');
  }
  function applyAttrs(){
    HTML.setAttribute('data-crt', localStorage.getItem('hollo-crt') === 'on' ? 'on' : '');
    const theme = localStorage.getItem('hollo-theme');
    if (theme === 'paper') HTML.setAttribute('data-theme', 'paper');
    else HTML.removeAttribute('data-theme');
    const dens = localStorage.getItem('hollo-density') || 'cozy';
    HTML.setAttribute('data-density', dens);
  }
  document.querySelectorAll('[data-hollo-toggle]').forEach((el) => {
    const key = el.getAttribute('data-hollo-toggle');
    applyToggle(key);
    el.addEventListener('click', () => {
      const cur = localStorage.getItem('hollo-' + key);
      const on = key === 'theme'
        ? (cur !== 'paper' ? 'paper' : 'dark')
        : (cur === 'on' ? 'off' : 'on');
      localStorage.setItem('hollo-' + key, on);
      applyToggle(key);
      applyAttrs();
    });
  });

  // ---------- segmented controls (density, thread default) ----------
  function bindSeg(selector, key, defVal){
    const root = document.querySelector(selector);
    if (!root) return;
    const cur = localStorage.getItem(key) || defVal;
    root.querySelectorAll('a').forEach((a) => {
      a.classList.toggle('on', a.getAttribute('data-val') === cur);
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const v = a.getAttribute('data-val');
        localStorage.setItem(key, v);
        root.querySelectorAll('a').forEach((x) => x.classList.toggle('on', x === a));
        applyAttrs();
      });
    });
  }
  bindSeg('[data-hollo-density]', 'hollo-density', 'cozy');
  bindSeg('[data-hollo-thread-default]', 'hollo-thread-default', 'article');

  applyAttrs();

  // ---------- phosphor swatches (POSTs to settings/phosphor) ----------
  document.querySelectorAll('[data-phosphor-swatches] i').forEach((i) => {
    i.style.cursor = 'pointer';
    i.addEventListener('click', () => {
      const color = i.getAttribute('title');
      fetch('/settings/phosphor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'color=' + encodeURIComponent(color),
      }).then(() => {
        HTML.setAttribute('data-phosphor', color);
        document.querySelectorAll('[data-phosphor-swatches] i').forEach((x) => {
          x.classList.toggle('on', x === i);
        });
      });
    });
  });
})();`,
        }}
      />
    </DashboardLayout>,
  );
});

settings.post("/phosphor", async (c) => {
  const owner = await db.query.accountOwners.findFirst();
  if (owner == null) return c.body(null, 401);
  const form = await c.req.formData();
  const color = form.get("color")?.toString() ?? "";
  // Map the 4 phosphor swatches to the closest DB ThemeColor so legacy
  // Pico-rendered surfaces also pick up the change at the next render.
  const mapping: Record<string, ThemeColor> = {
    green: "lime",
    amber: "yellow",
    cyan: "cyan",
    magenta: "fuchsia",
  };
  const newTheme = mapping[color];
  if (newTheme == null) return c.body(null, 400);
  await db
    .update(accountOwners)
    .set({ themeColor: newTheme })
    .where(eq(accountOwners.id, owner.id));
  return c.body(null, 204);
});

function Swatch({
  color,
  current,
  hex,
}: { color: string; current: string; hex: string }) {
  return (
    <i
      class={color === current ? "on" : undefined}
      style={`background:${hex}`}
      title={color}
    />
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export default settings;
