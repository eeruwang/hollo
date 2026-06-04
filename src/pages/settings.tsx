import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { accountOwners } from "../schema.ts";

const settings = new Hono();

settings.use(loginRequired);

settings.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  return c.html(
    <DashboardLayout
      title="Settings — Hollo"
      selectedMenu="settings"
      themeColor={owner.themeColor}
    >
      <hgroup>
        <h1>Settings</h1>
        <p>Manage webhooks, backups, and authentication.</p>
      </hgroup>

      <article>
        <header>
          <h3>Webhooks</h3>
        </header>
        <p>
          Send notifications to external services (Discord, Slack, etc.)
          when events occur.
        </p>
        <a href="/webhooks" role="button">
          Manage Webhooks
        </a>
      </article>

      <article>
        <header>
          <h3>Backup</h3>
        </header>
        <p>
          Export your data for archival or migration. Download posts,
          media, and account settings.
        </p>
        <a href="/backup" role="button">
          Manage Backups
        </a>
      </article>

      <article>
        <header>
          <h3>Auth</h3>
        </header>
        <p>
          Manage OAuth applications and authentication settings.
        </p>
        <a href="/auth" role="button">
          Manage Auth
        </a>
      </article>
    </DashboardLayout>,
  );
});

export default settings;
