import type { PropsWithChildren } from "hono/jsx";
import { Layout, type LayoutProps } from "./Layout";

export interface PublicShellLayoutProps extends LayoutProps {
  /** Shell-prompt path shown in the title bar (e.g. "login"). */
  shellPath?: string;
  /** Right-side status text in the title bar. */
  shellStatus?: string;
  /** Status-bar mode chip.  Defaults to NORMAL. */
  shellMode?: string;
  /** When true, the mode chip uses the amber `.alt` color. */
  shellModeAlt?: boolean;
  /** Keybind hints in the status bar (optional — empty by default). */
  shellHints?: { key: string; label: string }[];
  /** Bottom-right status context label. */
  shellContext?: string;
  /** Prefix shown before `:` in the prompt; defaults to `hollo`. */
  shellUser?: string;
}

/**
 * Window-chrome layout for pages that aren't gated behind a login —
 * login, setup, oauth, the public instance home, public profile views,
 * etc.  Uses the same `.win` titlebar / status bar as DashboardLayout
 * but without the rail sidebar (since the rail's nav targets all
 * require auth).
 */
export function PublicShellLayout(
  props: PropsWithChildren<PublicShellLayoutProps>,
) {
  const user = props.shellUser ?? "hollo";
  const path = props.shellPath ?? "";
  const mode = props.shellMode ?? "NORMAL";
  const status = props.shellStatus ?? "● federated";
  return (
    <Layout {...props}>
      <div class="win">
        <div class="titlebar">
          <div class="dots">
            <i />
            <i />
            <i />
          </div>
          <div class="path">
            <b>{user}@hollo</b>
            <span>: </span>
            <span class="ac">~/{path}</span>
          </div>
          <div class="tright">
            <span>{status}</span>
            <span class="led" />
            <span data-clock>00:00</span>
          </div>
        </div>
        <div class="mid" style="grid-template-columns: 1fr;">
          <main class="page">
            <div class="wrap">{props.children}</div>
          </main>
        </div>
        <div class="statusbar">
          <span class={`mode${props.shellModeAlt ? " alt" : ""}`}>{mode}</span>
          {props.shellHints?.map((h) => (
            <span class="k">
              [<b>{h.key}</b>] {h.label}
            </span>
          ))}
          <span class="sp" />
          <span>{props.shellContext ?? props.title}</span>
        </div>
      </div>
    </Layout>
  );
}
