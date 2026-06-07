import type { PropsWithChildren } from "hono/jsx";
import { getPhosphorColor } from "../phosphor";
import type { Account, AccountOwner } from "../schema";

const ASSET_VERSION = "413";

export interface PublicShellProps {
  title: string;
  shortTitle?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  links?: { href: string | URL; rel: string; type?: string }[];
  /** Owner account + handle — needed for the .pubtop instance label
   * and the RSS link. */
  accountOwner: AccountOwner & { account: Account };
  /** Instance host shown in the .pubtop bar. */
  instanceHost: string;
  /** Override the breadcrumb path next to the instance mark. */
  breadcrumb?: string;
}

/**
 * Shell B minimal — used for public viewing of individual posts /
 * threads. Same `.pubtop` instance bar as `@eeruwang.html`, then a
 * plain content area below (no `.pubmain` two-pane, no rail, no
 * vim-style statusbar). Visitors get the public look + a clear
 * route back to the owner's public profile.
 */
export function PublicShell(props: PropsWithChildren<PublicShellProps>) {
  const phosphor = getPhosphorColor(props.accountOwner.themeColor);
  const handle = `@${props.accountOwner.handle}`;
  const rssHref = `/@${props.accountOwner.handle}.atom`;
  const description =
    props.description ?? `${props.accountOwner.account.name} on the fediverse.`;
  return (
    <html lang="en" data-phosphor={phosphor}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <meta property="og:title" content={props.shortTitle ?? props.title} />
        <meta name="description" content={description} />
        <meta property="og:description" content={description} />
        {props.imageUrl && (
          <meta property="og:image" content={props.imageUrl} />
        )}
        {props.url && (
          <>
            <link rel="canonical" href={props.url} />
            <meta property="og:url" content={props.url} />
          </>
        )}
        {props.links?.map((link) => (
          <link
            rel={link.rel}
            href={link.href instanceof URL ? link.href.href : link.href}
            type={link.type}
          />
        ))}
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
          src={`/public/terminal.js?v=${ASSET_VERSION}`}
          defer
        />
      </head>
      <body
        style="background:var(--page-bg); min-height:100vh; display:flex; flex-direction:column;"
      >
        <div class="pubtop">
          <span class="inst">
            <span class="dot" />
            <a
              class="mk"
              href={`/@${props.accountOwner.handle}`}
              style="color:var(--ac);"
            >
              ▌ {props.instanceHost}
            </a>
            <span class="ssub">
              ·{" "}
              {props.breadcrumb ?? `viewing ${handle}'s post`}
            </span>
          </span>
          <span class="sp" />
          <a class="rss" href={rssHref}>
            RSS
          </a>
          <a class="web" href={`/@${props.accountOwner.handle}`}>
            ← {handle}
          </a>
          <a class="login" href="/login">
            log in
          </a>
        </div>
        <main
          style="flex:1; padding:22px clamp(18px,4vw,40px); max-width:760px; width:100%; margin:0 auto;"
        >
          {props.children}
        </main>
      </body>
    </html>
  );
}
