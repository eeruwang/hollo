import { isActor } from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { count, sql } from "drizzle-orm";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { DashboardLayout } from "../components/DashboardLayout";
import db from "../db";
import federation from "../federation";
import {
  AccountHandleConflictError,
  persistAccount,
} from "../federation/account";
import { isPost, persistPost } from "../federation/post";
import { loginRequired } from "../login";

const logger = getLogger(["hollo", "pages", "federation"]);

const data = new Hono();

data.use(csrf());
data.use(loginRequired);

data.get("/", async (c) => {
  const done = c.req.query("done");
  const error = c.req.query("error");

  let queueMessages: { type: string; number: number }[];
  try {
    queueMessages = await db
      .select({
        type: sql<string>`fedify_message_v2.message ->> 'type'`,
        number: count(),
      })
      .from(sql`fedify_message_v2`)
      .groupBy(sql`fedify_message_v2.message ->> 'type'`)
      .execute();
  } catch {
    queueMessages = [];
  }

  const totalQueue = queueMessages.reduce((sum, m) => sum + m.number, 0);

  return c.html(
    <DashboardLayout
      title="~/federation · Hollo"
      selectedMenu="federation"
      shellPath="federation"
      shellHints={[
        { key: "Tab", label: "field" },
        { key: "Enter", label: "refresh" },
      ]}
      shellStatus={`federation · ${totalQueue} queued`}
    >
      <div class="cmdline">
        <span class="u">root@hollo</span>:~${" "}
        <span class="cmd">federation</span>{" "}
        <span class="arg">--moderate</span>
      </div>

      <div class="setblock">
        <div class="sb-h">[ force-refresh remote actor / post ]</div>
        {done === "refresh:account" && (
          <div class="field">
            <span class="desc gn">✓ account refreshed.</span>
          </div>
        )}
        {done === "refresh:post" && (
          <div class="field">
            <span class="desc gn">✓ post refreshed.</span>
          </div>
        )}
        {error === "refresh:account-conflict" && (
          <div class="field">
            <span class="desc" style="color:var(--red);">
              ⚠ refresh blocked by a canonical handle conflict — the cached
              row still owns that handle.
            </span>
          </div>
        )}
        <form method="post" action="/federation/refresh" class="ac-b">
          <div class="field">
            <label htmlFor="fed-uri">handle or object URI</label>
            <input
              id="fed-uri"
              type="text"
              name="uri"
              placeholder="@hollo@hollo.social"
              required
              spellcheck={false}
              aria-invalid={
                error === "refresh" || error === "refresh:account-conflict"
                  ? "true"
                  : undefined
              }
            />
            <span
              class="desc"
              style={error === "refresh" ? "color:var(--red);" : undefined}
            >
              {error === "refresh"
                ? "the given handle or URI is invalid or not found."
                : "fediverse handle (@user@host) or post/actor URI."}
            </span>
          </div>
          <div class="formfoot">
            <span class="sp" />
            <button class="btn-pri" type="submit">
              refresh →
            </button>
          </div>
        </form>
      </div>

      <div class="setblock">
        <div class="sb-h">[ task queue ]</div>
        {queueMessages.length === 0 ? (
          <div class="field">
            <span class="desc">queue empty.</span>
          </div>
        ) : (
          <div class="ttable" style="grid-template-columns: 1fr auto;">
            <div class="tr th">
              <span>type</span>
              <span style="text-align:right;">messages</span>
            </div>
            {queueMessages.map((q) => (
              <div class="tr">
                <span>{q.type}</span>
                <span style="text-align:right;">
                  {q.number.toLocaleString("en")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="setblock">
        <div class="sb-h">[ instance shutdown ]</div>
        <div class="field">
          <label>self-destruct</label>
          <span class="desc">
            Hollo doesn't ship a one-button shutdown. To wind the instance
            down, delete every account from{" "}
            <a class="gn" href="/accounts">
              /accounts
            </a>{" "}
            — federation peers will see the deletes and stop delivering.
          </span>
        </div>
      </div>
    </DashboardLayout>,
  );
});

data.post("/refresh", async (c) => {
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const form = await c.req.formData();
  const uri = form.get("uri");
  const owner = await db.query.accountOwners.findFirst({});
  if (owner != null && typeof uri === "string") {
    const documentLoader = await fedCtx.getDocumentLoader({
      username: owner.handle,
    });
    try {
      const object = await fedCtx.lookupObject(uri, { documentLoader });
      if (isActor(object)) {
        await persistAccount(db, object, c.req.url, {
          ...fedCtx,
          documentLoader,
        });
        return c.redirect("/federation?done=refresh:account");
      }
      if (isPost(object)) {
        await persistPost(db, object, c.req.url, { ...fedCtx, documentLoader });
        return c.redirect("/federation?done=refresh:post");
      }
    } catch (error) {
      if (error instanceof AccountHandleConflictError) {
        logger.warning(
          "Canonical handle conflict while force-refreshing actor {actorIri}: handle {handle} is still occupied by {conflictingIri}.",
          {
            actorIri: error.actorIri,
            handle: error.handle,
            conflictingIri: error.conflictingAccount.iri,
          },
        );
        return c.redirect("/federation?error=refresh:account-conflict");
      }
      logger.error("Failed to refresh: {error}", { error });
    }
  }
  return c.redirect("/federation?error=refresh");
});

export default data;
