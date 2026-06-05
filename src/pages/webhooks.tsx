import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { type WebhookEvent, webhooks } from "../schema.ts";
import { type Uuid, uuidv7 } from "../uuid.ts";

const webhookPages = new Hono();

webhookPages.use(loginRequired);

const ALL_EVENTS: WebhookEvent[] = [
  "mention",
  "reblog",
  "follow",
  "favourite",
  "emoji_reaction",
  "poll",
  "status",
];

webhookPages.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  const hooks = await db.query.webhooks.findMany({
    where: eq(webhooks.accountOwnerId, owner.id),
  });

  return c.html(
    <DashboardLayout
      title="~/webhooks · Hollo"
      selectedMenu="settings"
      shellPath="settings/webhooks"
      shellMode="CONFIG"
      shellStatus={`${hooks.length} configured`}
      shellHints={[{ key: "Enter", label: "add" }]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">webhooks</span>{" "}
        <span class="arg">--list</span>
      </div>

      <div class="setblock">
        <div class="sb-h">[ add webhook ]</div>
        <form method="post" action="/webhooks">
          <div class="setrow">
            <div class="lab" style="flex:1;">
              webhook URL
              <div class="d">Discord, Slack, generic JSON endpoint…</div>
              <input
                type="url"
                name="url"
                placeholder="https://discord.com/api/webhooks/..."
                required
                style="margin-top:8px; width:100%; background:transparent; border:1px solid var(--bd); padding:7px 10px; color:var(--fgs); font-family:var(--mono); font-size:13px; outline:none;"
              />
            </div>
          </div>
          <div class="setrow">
            <div class="lab" style="flex:1;">
              events
              <div
                style="margin-top:8px; display:flex; gap:14px; flex-wrap:wrap;"
              >
                {ALL_EVENTS.map((event) => (
                  <label
                    style="display:inline-flex; align-items:center; gap:5px; font-size:12.5px;"
                  >
                    <input
                      type="checkbox"
                      name="events"
                      value={event}
                      checked
                    />
                    <span class="gn">{event}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div class="setrow">
            <div class="lab" />
            <div class="val">
              <button type="submit" class="btn pri">
                add webhook ↵
              </button>
            </div>
          </div>
        </form>
      </div>

      {hooks.length > 0 && (
        <div class="setblock">
          <div class="sb-h">[ configured webhooks ]</div>
          {hooks.map((hook) => (
            <div class="setrow">
              <div class="lab" style="flex:1; min-width:0;">
                <code
                  class="gn"
                  style="word-break:break-all; font-size:12.5px;"
                >
                  {hook.url}
                </code>
                <div class="d" style="margin-top:4px;">
                  {hook.active ? (
                    <span class="gn">● active</span>
                  ) : (
                    <span style="color:var(--red)">○ inactive</span>
                  )}
                  {" · "}
                  {(hook.events as WebhookEvent[]).join(", ")}
                </div>
              </div>
              <div class="val">
                <form
                  method="post"
                  action={`/webhooks/delete/${hook.id}`}
                  style="display:inline; margin:0;"
                >
                  <button
                    type="submit"
                    class="btn"
                    style="color:var(--red);"
                  >
                    [ delete ]
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>,
  );
});

webhookPages.post("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst();
  if (owner == null) return c.redirect("/accounts");

  const form = await c.req.formData();
  const url = form.get("url")?.toString()?.trim();
  const events = form.getAll("events").map((e) => e.toString()) as WebhookEvent[];

  if (!url || events.length === 0) return c.redirect("/webhooks");

  await db.insert(webhooks).values({
    id: uuidv7(),
    accountOwnerId: owner.id,
    url,
    events,
    active: true,
  });

  return c.redirect("/webhooks");
});

webhookPages.post("/delete/:id", async (c) => {
  const id = c.req.param("id") as Uuid;
  await db.delete(webhooks).where(eq(webhooks.id, id));
  return c.redirect("/webhooks");
});

export default webhookPages;
