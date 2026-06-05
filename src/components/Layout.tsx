import type { PropsWithChildren } from "hono/jsx";
import { getPhosphorColor } from "../phosphor";
import type { ThemeColor } from "../schema";

export interface LayoutProps {
  title: string;
  shortTitle?: string | null;
  url?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  links?: { href: string | URL; rel: string; type?: string }[];
  themeColor?: ThemeColor;
}

const ASSET_VERSION = "400";

export function Layout(props: PropsWithChildren<LayoutProps>) {
  const phosphor = getPhosphorColor(props.themeColor);
  return (
    <html lang="en" data-phosphor={phosphor}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <meta property="og:title" content={props.shortTitle ?? props.title} />
        {props.description && (
          <>
            <meta name="description" content={props.description} />
            <meta property="og:description" content={props.description} />
          </>
        )}
        {props.url && (
          <>
            <link rel="canonical" href={props.url} />
            <meta property="og:url" content={props.url} />
          </>
        )}
        {props.imageUrl && (
          <meta property="og:image" content={props.imageUrl} />
        )}
        {props.links?.map((link) => (
          <link
            rel={link.rel}
            href={link.href instanceof URL ? link.href.href : link.href}
            type={link.type}
          />
        ))}
        <link
          rel="stylesheet"
          href={`/public/terminal.css?v=${ASSET_VERSION}`}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="500x500"
          href="/public/favicon.png"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="500x500"
          href="/public/favicon-white.png"
          media="(prefers-color-scheme: dark)"
        />
        <script src={`/public/terminal.js?v=${ASSET_VERSION}`} defer />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
