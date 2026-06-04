import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { getPhosphorColor } from "../phosphor.ts";

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
            <div class="swatches">
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
    </DashboardLayout>,
  );
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
