import type { PropsWithChildren } from "hono/jsx";
import metadata from "../../package.json";
import { Layout, type LayoutProps } from "./Layout";

export type Menu = "social" | "accounts" | "emojis" | "federation" | "settings";

export interface DashboardLayoutProps extends LayoutProps {
  selectedMenu?: Menu;
}

export function DashboardLayout(
  props: PropsWithChildren<DashboardLayoutProps>,
) {
  return (
    <Layout {...props}>
      <header>
        <nav>
          <ul>
            <li>
              <picture>
                <source
                  srcset="https://cdn.jsdelivr.net/gh/fedify-dev/hollo@main/logo-white.svg"
                  media="(prefers-color-scheme: dark)"
                />
                <img
                  src="https://cdn.jsdelivr.net/gh/fedify-dev/hollo@main/logo-black.svg"
                  width={50}
                  height={50}
                  alt=""
                />
              </picture>
              Hollo
            </li>
          </ul>
          <ul>
            <li>
              {props.selectedMenu === "social" ? (
                <a href="/social" class="contrast">
                  <strong>Social</strong>
                </a>
              ) : (
                <a href="/social">Social</a>
              )}
            </li>
            <li>
              {props.selectedMenu === "accounts" ? (
                <a href="/accounts" class="contrast">
                  <strong>Accounts</strong>
                </a>
              ) : (
                <a href="/accounts">Accounts</a>
              )}
            </li>
            <li>
              {props.selectedMenu === "emojis" ? (
                <a href="/emojis" class="contrast">
                  <strong>Emojis</strong>
                </a>
              ) : (
                <a href="/emojis">Emojis</a>
              )}
            </li>
            <li>
              {props.selectedMenu === "federation" ? (
                <a href="/federation" class="contrast">
                  <strong>Federation</strong>
                </a>
              ) : (
                <a href="/federation">Federation</a>
              )}
            </li>
            <li>
              {props.selectedMenu === "settings" ? (
                <a href="/settings" class="contrast">
                  <strong>Settings</strong>
                </a>
              ) : (
                <a href="/settings">Settings</a>
              )}
            </li>
            <li>
              <form method="post" action="/logout" class="logout-form">
                <button type="submit" class="secondary logout-btn">
                  Logout
                </button>
              </form>
            </li>
          </ul>
        </nav>
      </header>
      {props.children}
      <footer>
        <p>
          <strong>Hollo</strong>
          <br />
          Version {metadata.version}
        </p>
      </footer>
    </Layout>
  );
}
