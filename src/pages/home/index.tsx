import { escape } from "es-toolkit";
import { Hono } from "hono";
import { PublicShellLayout } from "../../components/PublicShellLayout.tsx";
import db from "../../db.ts";
import { getInstanceHost } from "../../instance-host.ts";
import { renderCustomEmojis } from "../../text.ts";

const homePage = new Hono().basePath("/");

homePage.get("/", async (c) => {
  const credential = await db.query.credentials.findFirst();
  if (credential == null) return c.redirect("/setup");
  const owners = await db.query.accountOwners.findMany({
    with: { account: true },
  });
  if (owners.length < 1) return c.redirect("/accounts");
  if (
    "HOME_URL" in process.env &&
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    process.env["HOME_URL"] != null &&
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    process.env["HOME_URL"].trim() !== ""
  ) {
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    return c.redirect(process.env["HOME_URL"]);
  }
  const host = getInstanceHost(new URL(c.req.url));
  return c.html(
    <PublicShellLayout
      title={host}
      shellPath=""
      shellUser={host}
      shellStatus="● federated"
      shellHints={[{ key: "Enter", label: "open" }]}
      shellContext={`${host} · ${owners.length} account${owners.length === 1 ? "" : "s"}`}
    >
      <div class="cmdline">
        <span class="u">{host}</span>:~${" "}
        <span class="cmd">whois</span>{" "}
        <span class="arg">--instance</span>
      </div>
      <h2 class="h-sec">accounts on this instance</h2>
      {owners.map((owner) => {
        const url = owner.account.url ?? owner.account.iri;
        const nameHtml = renderCustomEmojis(
          escape(owner.account.name),
          owner.account.emojis,
        );
        const bioHtml = renderCustomEmojis(
          owner.account.bioHtml ?? "",
          owner.account.emojis,
        );
        const avatarLetter =
          owner.account.name.trim().charAt(0).toUpperCase() ||
          owner.handle.charAt(0).toUpperCase();
        return (
          <article class="entry mine" style="margin-bottom:12px;">
            <div class="meta">
              <span
                class="au"
                dangerouslySetInnerHTML={{ __html: nameHtml }}
              />
              <span class="ts">@{owner.handle}</span>
            </div>
            {owner.account.bioHtml && (
              <div
                class="txt"
                style="max-width:60ch;"
                dangerouslySetInnerHTML={{ __html: bioHtml }}
              />
            )}
            <div class="acts">
              <a class="a" href={url}>
                profile →
              </a>
            </div>
          </article>
        );
      })}
      <div style="margin-top:24px;">
        <a class="btn pri" href="/accounts">
          [ admin dashboard · sign in ]
        </a>
      </div>
    </PublicShellLayout>,
  );
});

export default homePage;
