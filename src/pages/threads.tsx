import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";

const threadsPage = new Hono();

threadsPage.use(loginRequired);

threadsPage.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  return c.html(
    <DashboardLayout
      title="~/threads · Hollo"
      selectedMenu="threads"
      shellPath="threads"
      shellStatus="threads · self-thread reader"
      shellHints={[
        { key: "j/k", label: "move" },
        { key: "Enter", label: "read" },
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">threads</span>{" "}
        <span class="arg">--list</span>
      </div>

      <p class="muted" style="margin-top:14px;">
        — self-threads stitch a chain of your own follow-up posts into a
        single readable article.
        <br />
        <br />
        backend support is still in progress: detection of
        self-reply chains and the reader route (
        <span class="gn">/thread/:id</span>) ship in a follow-up.
        <br />
        <br />
        in the meantime, find your posts on the{" "}
        <a class="gn" href={`/@${owner.handle}`}>
          public profile
        </a>{" "}
        or the{" "}
        <a class="gn" href="/social">
          home timeline
        </a>
        .
      </p>

      <div class="endcap">— self-thread detection · queued —</div>
    </DashboardLayout>,
  );
});

export default threadsPage;
