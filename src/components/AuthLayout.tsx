import type { PropsWithChildren } from "hono/jsx";
import { Layout, type LayoutProps } from "./Layout";

export interface AuthLayoutProps extends LayoutProps {
  /** Right-aligned subtitle in the card header (e.g. "sign in"). */
  cardSubtitle?: string;
  /** Instance host shown in the card header. */
  instanceHost?: string;
  /** Optional prompt shown above the form ("eeru@hollo:~$ login"). */
  promptUser?: string;
  promptCommand?: string;
}

/**
 * Shell C — centered single-card layout used for login, setup, password
 * reset, and OAuth consent.  Drops the window-chrome (.win/titlebar/
 * statusbar) in favour of a simple centered card with a terminal-style
 * header strip + form body.
 */
export function AuthLayout(props: PropsWithChildren<AuthLayoutProps>) {
  const host = props.instanceHost ?? "hollo";
  const sub = props.cardSubtitle ?? "";
  return (
    <Layout {...props}>
      <div class="authwrap">
        <div class="authcard">
          <div class="ac-h">
            <span class="dots" style="display:flex;gap:6px;">
              <i style="width:11px;height:11px;border-radius:50%;background:#ff5f57;display:block;" />
              <i style="width:11px;height:11px;border-radius:50%;background:#febc2e;display:block;" />
              <i style="width:11px;height:11px;border-radius:50%;background:#28c840;display:block;" />
            </span>
            <span class="mk">▌ {host}</span>
            {sub && <span class="sub">{sub}</span>}
          </div>
          {props.promptCommand && (
            <div class="prompt">
              <span class="u">{props.promptUser ?? "eeru"}@hollo</span>:~${" "}
              <span style="color:var(--fgs)">{props.promptCommand}</span>
            </div>
          )}
          {props.children}
        </div>
      </div>
    </Layout>
  );
}
