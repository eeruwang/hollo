import { escape } from "es-toolkit";
import { getPhosphorColor } from "../phosphor";
import type { Account, AccountOwner } from "../schema";
import { renderCustomEmojis } from "../text";

const ASSET_VERSION = "405";

export interface PublicProfileProps {
  accountOwner: AccountOwner & { account: Account };
  /** Total public + unlisted post count visible to non-owners. */
  visiblePostCount?: number;
  /** Children render inside `.pubfeed > .feedinner` so each route owns
   * its own tab layout (posts / threads / media / about). */
  children?: unknown;
  /** Which tab is active. Defaults to "posts". */
  selectedTab?: "posts" | "threads" | "media" | "about";
  /** Set when the visitor is the owner viewing this URL while
   * authenticated; the in-app `/social` link replaces "log in". */
  ownerAuthenticated?: boolean;
  /** Server's instance host (e.g. "hollo.eeruwang.me"). */
  instanceHost: string;
}

export function PublicProfile({
  accountOwner,
  visiblePostCount,
  children,
  selectedTab,
  ownerAuthenticated,
  instanceHost,
}: PublicProfileProps) {
  const account = accountOwner.account;
  const phosphor = getPhosphorColor(accountOwner.themeColor);
  const nameHtml = renderCustomEmojis(escape(account.name), account.emojis);
  const bioHtml =
    account.bioHtml != null && account.bioHtml !== ""
      ? renderCustomEmojis(account.bioHtml, account.emojis)
      : null;
  const handle = `@${accountOwner.handle}@${instanceHost}`;
  const initial =
    account.name.trim().charAt(0).toUpperCase() ||
    accountOwner.handle.charAt(0).toUpperCase();
  const fields = account.fieldHtmls ?? {};
  const fieldEntries = Object.entries(fields);
  const joined = account.published
    ? new Date(account.published).toLocaleDateString("en", {
        year: "numeric",
        month: "long",
      })
    : null;
  const posts = (visiblePostCount ?? account.postsCount ?? 0).toLocaleString();
  const following = (account.followingCount ?? 0).toLocaleString();
  const followers = (account.followersCount ?? 0).toLocaleString();
  const title = `${account.name} (${handle})`;
  const description =
    (bioHtml && stripHtml(bioHtml)) ||
    `${account.name} on the fediverse · ${instanceHost}`;
  const rssHref = `/@${accountOwner.handle}.atom`;
  const tabHref = (tab: string) =>
    tab === "posts" ? `/@${accountOwner.handle}` : `/@${accountOwner.handle}/${tab}`;
  const active = (tab: string) => (selectedTab ?? "posts") === tab;

  return (
    <html lang="en" data-phosphor={phosphor}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="profile" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {account.avatarUrl && (
          <meta property="og:image" content={account.avatarUrl} />
        )}
        <meta property="profile:username" content={accountOwner.handle} />
        <link
          rel="alternate"
          type="application/atom+xml"
          title={`${account.name} · posts`}
          href={rssHref}
        />
        <link
          rel="alternate"
          type="application/activity+json"
          href={`/@${accountOwner.handle}`}
        />
        {account.url && <link rel="me" href={account.url} />}
        <link
          rel="icon"
          type="image/svg+xml"
          href={`/public/favicon.svg?v=${ASSET_VERSION}`}
        />
        <link
          rel="stylesheet"
          href={`/public/terminal.css?v=${ASSET_VERSION}`}
        />
        <script
          src={`/public/public-profile.js?v=${ASSET_VERSION}`}
          defer
        />
      </head>
      <body class="pubpage">
        <div class="pubtop">
          <span class="inst">
            <span class="dot" />
            <span class="mk">▌ {instanceHost}</span>
            <span class="ssub">· single-user instance</span>
          </span>
          <span class="sp" />
          <a class="rss" href={rssHref}>
            RSS
          </a>
          {account.url && (
            <a class="web" href={account.url}>
              {hostname(account.url)} ↗
            </a>
          )}
          {ownerAuthenticated ? (
            <a class="login" href="/social">
              dashboard ↗
            </a>
          ) : (
            <a class="login" href="/login">
              log in
            </a>
          )}
        </div>

        <div class="pubmain">
          <aside class="pubaside">
            <div
              class={`banner${account.coverUrl ? " has-image" : ""}`}
              style={
                account.coverUrl
                  ? `background-image:url("${account.coverUrl}");`
                  : undefined
              }
            >
              {!account.coverUrl && (
                <span class="tagfile">~/public · {accountOwner.handle}</span>
              )}
            </div>
            <div class="asidewrap">
              <div class="ava">
                {account.avatarUrl ? (
                  <img src={account.avatarUrl} alt="" />
                ) : (
                  initial
                )}
              </div>
              <div
                class="pname2"
                dangerouslySetInnerHTML={{ __html: nameHtml }}
              />
              <div class="phandle2">
                <span style="user-select:all;">{handle}</span>
                <span class="copy" id="copyHandle" data-handle={handle}>
                  ⌘ copy
                </span>
              </div>

              {bioHtml && (
                <p
                  class="pbio2"
                  dangerouslySetInnerHTML={{ __html: bioHtml }}
                />
              )}

              <div class="stats2">
                <span>
                  <b>{posts}</b>posts
                </span>
                <span>
                  <b>{following}</b>following
                </span>
                <span>
                  <b>{followers}</b>followers
                </span>
              </div>

              {fieldEntries.length > 0 && (
                <div class="fields">
                  {fieldEntries.map(([key, value]) => (
                    <div class="f">
                      <span class="fk">{key.toLowerCase()}</span>
                      <span
                        class="fv"
                        dangerouslySetInnerHTML={{ __html: value }}
                      />
                    </div>
                  ))}
                  {joined && (
                    <div class="f">
                      <span class="fk">joined</span>
                      <span class="fv">{joined}</span>
                    </div>
                  )}
                </div>
              )}
              {fieldEntries.length === 0 && joined && (
                <div class="fields">
                  <div class="f">
                    <span class="fk">joined</span>
                    <span class="fv">{joined}</span>
                  </div>
                </div>
              )}

              {!ownerAuthenticated && (
                <div class="followbox">
                  <div class="fb-h">⌁ follow from the fediverse</div>
                  <div class="fb-b">
                    <div class="actions">
                      <button
                        type="button"
                        class="btn-follow"
                        id="followBtn"
                      >
                        ＋ Follow
                      </button>
                      <button
                        type="button"
                        class="btn-ghost"
                        id="moreBtn"
                      >
                        ⋯
                      </button>
                    </div>
                    <p>
                      Follow <span style="color:var(--am)">{handle}</span> from
                      any ActivityPub server — Mastodon, Misskey, another
                      Hollo. Enter your handle to confirm on your home
                      instance.
                    </p>
                    <div class="remote">
                      <input
                        type="text"
                        id="remoteInput"
                        placeholder="you@instance.social"
                        spellcheck={false}
                        autocomplete="off"
                      />
                      <button
                        type="button"
                        class="go"
                        id="remoteFollow"
                      >
                        →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div class="asidefoot">
                <span class="mk">▌ Hollo</span> · eeruwang fork ·{" "}
                federated via ActivityPub.
                <br />
                <a href={`/@${accountOwner.handle}`}>ActivityPub</a> ·{" "}
                <a href={rssHref}>RSS</a>
                {account.url && (
                  <>
                    {" "}
                    · <a href={account.url}>{hostname(account.url)}</a>
                  </>
                )}
                <br />
                <span style="color:var(--dim)">
                  Public posts, operated by their owner.
                </span>
              </div>
            </div>
          </aside>

          <section class="pubfeed">
            <nav class="pubtabs">
              <a class={active("posts") ? "on" : undefined} href={tabHref("posts")}>
                Posts
              </a>
              <a class={active("threads") ? "on" : undefined} href={tabHref("threads")}>
                Threads
              </a>
              <a class={active("media") ? "on" : undefined} href={tabHref("media")}>
                Media
              </a>
              <a class={active("about") ? "on" : undefined} href={tabHref("about")}>
                About
              </a>
              <span class="sp">public only</span>
            </nav>
            <div class="feedinner">{children}</div>
          </section>
        </div>

        <div class="ri-back" id="riBack" data-handle={handle}>
          <div class="ri">
            <div class="ri-h">
              ⌁ interact from your instance{" "}
              <span class="x" id="riClose">
                esc ✕
              </span>
            </div>
            <div class="ri-b">
              <p id="riMsg">
                To reply, boost, or favourite this post, follow{" "}
                <span style="color:var(--am)">{handle}</span> from your own
                fediverse account.
              </p>
              <div class="remote">
                <input
                  type="text"
                  id="riInput"
                  placeholder="you@your-instance.social"
                  spellcheck={false}
                  autocomplete="off"
                />
                <button type="button" class="btn2" id="riGo">
                  Take me there →
                </button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
