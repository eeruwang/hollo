import { and, count, eq, isNull, ne } from "drizzle-orm";
import type { PropsWithChildren } from "hono/jsx";
import db from "../db";
import { instances, notifications } from "../schema";
import { Layout, type LayoutProps } from "./Layout";

export type Menu =
  | "home"
  | "profile"
  | "notifications"
  | "bookmarks"
  | "threads"
  | "compose"
  | "settings"
  /* legacy menu values kept so existing pages compile; the rail
   * collapses them into the closest terminal counterpart. */
  | "social"
  | "accounts"
  | "emojis"
  | "federation"
  | "auth"
  | "thumbnail_cleanup";

export interface DashboardLayoutProps extends LayoutProps {
  selectedMenu?: Menu;
  /** Shown in the title-bar prompt (`eeru@hollo: ~/<path>`). */
  shellPath?: string;
  /** Vim-style mode label rendered in the status bar.  Defaults to NORMAL. */
  shellMode?: string;
  /** When true, render the mode chip in the amber `alt` color. */
  shellModeAlt?: boolean;
  /** Keybind hints rendered after the mode chip. */
  shellHints?: { key: string; label: string }[];
  /** Right-aligned status context label. */
  shellStatus?: string;
}

const DEFAULT_HINTS: { key: string; label: string }[] = [
  { key: "j/k", label: "move" },
  { key: "Enter", label: "open" },
  { key: "f", label: "fav" },
  { key: "b", label: "boost" },
  { key: "c", label: "compose" },
];

export async function DashboardLayout(
  props: PropsWithChildren<DashboardLayoutProps>,
) {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  const themeColor = props.themeColor ?? owner?.themeColor ?? "azure";
  const handle = owner?.handle;
  const postsCount = owner?.account.postsCount ?? 0;

  const [unreadRow] = owner
    ? await db
        .select({ n: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.accountOwnerId, owner.id),
            isNull(notifications.readAt),
          ),
        )
    : [{ n: 0 }];
  const unread = Number(unreadRow?.n ?? 0);

  const [peerRow] = await db
    .select({ n: count() })
    .from(instances)
    .where(
      owner?.account.instanceHost
        ? ne(instances.host, owner.account.instanceHost)
        : undefined,
    );
  const peers = Number(peerRow?.n ?? 0);

  const promptUser = handle ?? "eeru";
  const promptPath = props.shellPath ?? menuToPath(props.selectedMenu);
  const mode = props.shellMode ?? "NORMAL";
  const hints = props.shellHints ?? DEFAULT_HINTS;
  const status = props.shellStatus ?? "federated";

  return (
    <Layout {...props} themeColor={themeColor}>
      <div class="win has-bottomnav">
        <div class="titlebar">
          <div class="dots">
            <i />
            <i />
            <i />
          </div>
          <div class="path">
            <b>{promptUser}@hollo</b>
            <span>: </span>
            <span class="ac">~/{promptPath}</span>
          </div>
          <div class="tright">
            <span class="led" />
            <span>{status} · </span>
            <span data-clock>00:00</span>
          </div>
        </div>
        <div class="mid">
          <aside class="rail">
            <div class="node">
              <div class="mk">▌ HOLLO</div>
              <div class="sub">eeruwang fork · 0.9.x</div>
            </div>
            <nav>
              <RailLink
                href="/social"
                kb="1"
                label="home"
                on={
                  props.selectedMenu === "home" ||
                  props.selectedMenu === "social"
                }
              />
              <RailLink
                href="/accounts"
                kb="2"
                label="profile"
                on={
                  props.selectedMenu === "profile" ||
                  props.selectedMenu === "accounts"
                }
              />
              <RailLink
                href="/notifications"
                kb="3"
                label="notifications"
                on={props.selectedMenu === "notifications"}
                count={unread > 0 ? String(unread) : undefined}
              />
              <RailLink
                href="/bookmarks"
                kb="4"
                label="bookmarks"
                on={props.selectedMenu === "bookmarks"}
              />
              <RailLink
                href="/threads"
                kb="5"
                label="threads"
                on={props.selectedMenu === "threads"}
              />
              <div class="div" />
              <a
                href="/compose"
                class={`cta${props.selectedMenu === "compose" ? " on" : ""}`}
              >
                <span class="kb">c</span>
                <span class="lbl">compose</span>
              </a>
              <RailLink
                href="/settings"
                kb=","
                label="settings"
                on={
                  props.selectedMenu === "settings" ||
                  props.selectedMenu === "auth" ||
                  props.selectedMenu === "emojis" ||
                  props.selectedMenu === "federation" ||
                  props.selectedMenu === "thumbnail_cleanup"
                }
              />
            </nav>
            <div class="foot">
              <span class="ok">●</span> federating
              <br />
              {peers.toLocaleString()} peers · {postsCount.toLocaleString()}{" "}
              posts
            </div>
          </aside>
          <main class="page">
            <div class="wrap">{props.children}</div>
          </main>
        </div>
        <div class="statusbar">
          <span class={`mode${props.shellModeAlt ? " alt" : ""}`}>{mode}</span>
          {hints.map((h) => (
            <span class="k">
              [<b>{h.key}</b>] {h.label}
            </span>
          ))}
          <span class="sp" />
          <span>{props.title}</span>
        </div>
        <nav class="bottomnav">
          <BottomNav
            href="/social"
            glyph="⌂"
            label="home"
            on={props.selectedMenu === "home" || props.selectedMenu === "social"}
          />
          <BottomNav
            href="/search"
            glyph="⌕"
            label="search"
            on={false}
          />
          <BottomNav
            href="/compose"
            glyph="✎"
            label="compose"
            cta
            on={props.selectedMenu === "compose"}
          />
          <BottomNav
            href="/notifications"
            glyph="◔"
            label={`notifs${unread > 0 ? ` ${unread}` : ""}`}
            on={props.selectedMenu === "notifications"}
          />
          <BottomNav
            href={handle ? `/@${handle}` : "/accounts"}
            glyph="@"
            label="profile"
            on={
              props.selectedMenu === "profile" ||
              props.selectedMenu === "accounts"
            }
          />
        </nav>
      </div>
    </Layout>
  );
}

function BottomNav({
  href,
  glyph,
  label,
  on,
  cta,
}: {
  href: string;
  glyph: string;
  label: string;
  on?: boolean;
  cta?: boolean;
}) {
  return (
    <a
      href={href}
      class={`bn${on ? " on" : ""}${cta ? " cta" : ""}`}
    >
      <span class="gl">{glyph}</span>
      <span class="lbl">{label}</span>
    </a>
  );
}

function RailLink({
  href,
  kb,
  label,
  on,
  count,
}: {
  href: string;
  kb: string;
  label: string;
  on?: boolean;
  count?: string;
}) {
  return (
    <a href={href} class={on ? "on" : undefined}>
      <span class="kb">{kb}</span>
      <span class="lbl">{label}</span>
      {count != null && <span class="ct">{count}</span>}
    </a>
  );
}

function menuToPath(menu?: Menu): string {
  switch (menu) {
    case "home":
    case "social":
      return "timeline";
    case "profile":
    case "accounts":
      return "profile";
    case "notifications":
      return "notifications";
    case "bookmarks":
      return "bookmarks";
    case "threads":
      return "threads";
    case "compose":
      return "compose";
    case "settings":
      return "settings";
    case "auth":
      return "settings/auth";
    case "emojis":
      return "emojis";
    case "federation":
      return "federation";
    case "thumbnail_cleanup":
      return "settings/cleanup";
    default:
      return "";
  }
}
