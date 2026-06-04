import { getLogger } from "@logtape/logtape";
import { eq } from "drizzle-orm";
import db from "./db";
import { type WebhookEvent, webhooks } from "./schema";

const logger = getLogger(["hollo", "webhook"]);

export async function dispatchWebhook(
  accountOwnerId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = await db.query.webhooks.findMany({
    where: eq(webhooks.accountOwnerId, accountOwnerId),
  });

  for (const hook of hooks) {
    if (!hook.active) continue;
    const events = hook.events as WebhookEvent[];
    if (!events.includes(event)) continue;

    try {
      await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          created_at: new Date().toISOString(),
          ...payload,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      logger.info("Webhook dispatched: {event} to {url}", {
        event,
        url: hook.url,
      });
    } catch (error) {
      logger.error("Webhook failed: {event} to {url}: {error}", {
        event,
        url: hook.url,
        error,
      });
    }
  }
}
