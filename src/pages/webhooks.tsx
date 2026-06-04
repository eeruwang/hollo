import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import {
  accountOwners,
  type WebhookEvent,
  webhooks,
} from "../schema.ts";
import { uuidv7 } from "../uuid.ts";

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
      title="Webhooks — Hollo"
      selectedMenu="settings"
      themeColor={owner.themeColor}
    >
      <hgroup>
        <h1>Webhooks</h1>
        <p>Send notifications to external services when events occur.</p>
      </hgroup>

      <form method="post" action="/webhooks">
        <fieldset>
          <label>
            Webhook URL
            <input
              type="url"
              name="url"
              placeholder="https://discord.com/api/webhooks/..."
              required
            />
          </label>
          <fieldset>
            <legend>Events</legend>
            {ALL_EVENTS.map((event) => (
              <label>
                <input type="checkbox" name="events" value={event} checked />{" "}
                {event}
              </label>
            ))}
          </fieldset>
          <button type="submit">Add Webhook</button>
        </fieldset>
      </form>

      {hooks.length > 0 && <h2>Configured Webhooks</h2>}
      {hooks.map((hook) => (
        <article>
          <header>
            <strong>{hook.url}</strong>
            {hook.active ? (
              <small style="color: green;"> (active)</small>
            ) : (
              <small style="color: red;"> (inactive)</small>
            )}
          </header>
          <p>
            Events:{" "}
            {(hook.events as WebhookEvent[]).join(", ")}
          </p>
          <footer>
            <form
              method="post"
              action={`/webhooks/delete/${hook.id}`}
              style="display: inline;"
            >
              <button type="submit" class="secondary">
                Delete
              </button>
            </form>
          </footer>
        </article>
      ))}
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
  const id = c.req.param("id");
  await db.delete(webhooks).where(eq(webhooks.id, id));
  return c.redirect("/webhooks");
});

export default webhookPages;
