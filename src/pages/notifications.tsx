import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { notifications } from "../schema.ts";
import { renderCustomEmojis } from "../text.ts";

const notificationsPage = new Hono();

notificationsPage.use(loginRequired);

notificationsPage.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  const rows = await db.query.notifications.findMany({
    where: eq(notifications.accountOwnerId, owner.id),
    with: {
      actorAccount: true,
      targetPost: true,
      targetAccount: true,
    },
    orderBy: [desc(notifications.created)],
    limit: 100,
  });

  const unreadCount = rows.filter((r) => r.readAt == null).length;
  const today: typeof rows = [];
  const earlier: typeof rows = [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const row of rows) {
    if (row.created.getTime() >= cutoff) today.push(row);
    else earlier.push(row);
  }

  return c.html(
    <DashboardLayout
      title="~/notifications · Hollo"
      selectedMenu="notifications"
      shellPath="notifications"
      shellMode={unreadCount > 0 ? `${unreadCount} NEW` : "NORMAL"}
      shellModeAlt={unreadCount > 0}
      shellStatus={`notifications · ${rows.length} total`}
      shellHints={[
        { key: "j/k", label: "move" },
        { key: "Enter", label: "open" },
        { key: "a/m/f", label: "filter" },
      ]}
      themeColor={owner.themeColor}
    >
      <div class="cmdline">
        <span class="u">{owner.handle}@hollo</span>:~${" "}
        <span class="cmd">notifications</span>{" "}
        <span class="arg">--all</span>
      </div>

      {today.length > 0 && <div class="h-sec">▸ today</div>}
      {today.map((row) => (
        <NotificationRow row={row} unread={row.readAt == null} />
      ))}

      {earlier.length > 0 && <div class="h-sec">▸ earlier</div>}
      {earlier.map((row) => (
        <NotificationRow row={row} unread={row.readAt == null} />
      ))}

      {rows.length === 0 && (
        <p class="muted">
          — no notifications yet · activity from federated peers shows up here
          —
        </p>
      )}

      {rows.length > 0 && (
        <div class="endcap">
          — caught up · federated via ActivityPub —
        </div>
      )}
    </DashboardLayout>,
  );
});

interface NotificationRowProps {
  readonly row: {
    type: string;
    created: Date;
    actorAccount: { name: string; handle: string; emojis: Record<string, string> } | null;
    targetPost: { id: string; contentHtml: string | null } | null;
    targetAccount: { name: string; handle: string } | null;
  };
  readonly unread: boolean;
}

function NotificationRow({ row, unread }: NotificationRowProps) {
  if (row.type === "admin_warning") {
    return (
      <div class="notif banner alert">
        <div class="bh">⚠ moderation notice · from your instance admin</div>
        <div class="bb">
          {stripHtml(row.targetPost?.contentHtml ?? "").slice(0, 280) ||
            "A moderation action was taken on your instance."}
        </div>
        <div class="bf">
          <span class="gn">view report</span>
          <span class="gn">dismiss</span>
        </div>
      </div>
    );
  }
  const meta = describeNotification(row.type);
  const actorName = row.actorAccount?.name ?? "someone";
  const actorHandle = row.actorAccount?.handle ?? "";
  const actorNameHtml = row.actorAccount
    ? renderCustomEmojis(actorName, row.actorAccount.emojis)
    : actorName;
  const openHref = row.targetPost != null ? `/post/${row.targetPost.id}` : undefined;
  const snippet =
    row.targetPost != null
      ? stripHtml(row.targetPost.contentHtml ?? "").slice(0, 140)
      : null;
  return (
    <div class={`notif${unread ? " sel" : ""}`} data-open={openHref}>
      <div
        class={`ic ${meta.iconClass}`}
        style={meta.iconStyle}
      >
        {meta.glyph}
      </div>
      <div class="body2">
        <div class="who">
          <span
            class="au"
            dangerouslySetInnerHTML={{ __html: actorNameHtml }}
          />{" "}
          {meta.verb}
          {actorHandle && (
            <span class="hn muted"> {actorHandle}</span>
          )}
        </div>
        {snippet && (
          <div class="snip">
            <span class="q">"{snippet}"</span>
          </div>
        )}
      </div>
      <div class="t">{relativeTime(row.created)}</div>
    </div>
  );
}

function describeNotification(type: string): {
  iconClass: string;
  glyph: string;
  verb: string;
  /** Inline style override for the glyph color (when not encoded by class). */
  iconStyle?: string;
} {
  switch (type) {
    case "mention":
      return { iconClass: "mention", glyph: "＠", verb: "mentioned you" };
    case "reblog":
      return { iconClass: "boost", glyph: "↻", verb: "boosted" };
    case "favourite":
      return { iconClass: "fav", glyph: "♥", verb: "favourited" };
    case "follow":
      return { iconClass: "follow", glyph: "＋", verb: "followed you" };
    case "follow_request":
      return { iconClass: "follow", glyph: "＋", verb: "requested to follow" };
    case "emoji_reaction":
      return { iconClass: "fav", glyph: "♥", verb: "reacted" };
    case "status":
      return { iconClass: "reply", glyph: "↩", verb: "replied" };
    case "poll":
      return {
        iconClass: "mention",
        glyph: "▤",
        verb: "a poll you voted in ended",
        iconStyle: "color:var(--am)",
      };
    case "update":
      return {
        iconClass: "mention",
        glyph: "✎",
        verb: "edited a post you boosted",
        iconStyle: "color:var(--dim)",
      };
    case "quote":
      return {
        iconClass: "mention",
        glyph: "❝",
        verb: "quoted your post",
        iconStyle: "color:var(--am)",
      };
    case "move":
      return {
        iconClass: "mention",
        glyph: "↪",
        verb: "moved",
        iconStyle: "color:var(--blue)",
      };
    default:
      return { iconClass: "mention", glyph: "•", verb: type };
  }
}

function relativeTime(value: Date | null | undefined): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `+${Math.floor(diff / 60)}m`;
  if (diff < 86_400) return `+${Math.floor(diff / 3600)}h`;
  if (diff < 86_400 * 7) return `${Math.floor(diff / 86_400)}d`;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default notificationsPage;
