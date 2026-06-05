import { escape } from "es-toolkit";
import { PublicShellLayout } from "../../components/PublicShellLayout";
import type { Account, AccountOwner, Application, Scope } from "../../schema";
import { renderCustomEmojis } from "../../text";

interface AuthorizationPageProps {
  accountOwners: (AccountOwner & { account: Account })[];
  application: Application;
  redirectUri: string;
  scopes: Scope[];
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

export function AuthorizationPage(props: AuthorizationPageProps) {
  return (
    <PublicShellLayout
      title={`~/oauth · authorize ${props.application.name}`}
      shellPath="oauth/authorize"
      shellStatus="oauth grant"
      shellHints={[
        { key: "↵", label: "allow" },
        { key: "esc", label: "deny" },
      ]}
      shellContext={`oauth · ${props.application.name}`}
    >
      <div class="cmdline">
        <span class="u">hollo</span>:~$ <span class="cmd">oauth</span>{" "}
        <span class="arg">--grant {props.application.name}</span>
      </div>
      <h2 class="h-sec">Authorize {props.application.name}?</h2>
      <p class="muted" style="margin-bottom:14px;">
        The application is requesting access to:
      </p>
      <div
        style="border:1px solid var(--bd); padding:10px 14px; margin-bottom:18px; max-width:560px;"
      >
        {props.scopes.map((scope) => (
          <div class="ctx" style="color:var(--fg);">
            <span class="dimc">·</span>
            <code class="gn">{scope}</code>
          </div>
        ))}
      </div>
      <form action="/oauth/authorize" method="post" style="max-width:560px;">
        <p class="dimc" style="margin-bottom:9px;">choose an account:</p>
        {props.accountOwners.map((accountOwner, i) => {
          const accountName = renderCustomEmojis(
            escape(accountOwner.account.name),
            accountOwner.account.emojis,
          );
          return (
            <label
              style="display:flex; gap:11px; align-items:flex-start; padding:11px 12px; border:1px solid var(--bd); margin-bottom:7px; cursor:pointer;"
            >
              <input
                type="radio"
                name="account_id"
                value={accountOwner.id}
                checked={i === 0}
                style="margin-top:2px;"
              />
              <div>
                <strong
                  class="gn"
                  dangerouslySetInnerHTML={{ __html: accountName }}
                />
                <div class="muted" style="font-size:12px; margin-top:2px;">
                  {accountOwner.account.handle}
                </div>
              </div>
            </label>
          );
        })}
        <input
          type="hidden"
          name="application_id"
          value={props.application.id}
        />
        <input type="hidden" name="redirect_uri" value={props.redirectUri} />
        <input type="hidden" name="scopes" value={props.scopes.join(" ")} />
        {props.state != null && (
          <input type="hidden" name="state" value={props.state} />
        )}
        {typeof props.codeChallenge === "string" && (
          <>
            <input
              type="hidden"
              name="code_challenge"
              value={props.codeChallenge}
            />
            <input
              type="hidden"
              name="code_challenge_method"
              value={props.codeChallengeMethod}
            />
          </>
        )}
        <div style="display:flex; gap:9px; margin-top:14px;">
          {props.redirectUri !== "urn:ietf:wg:oauth:2.0:oob" && (
            <button
              type="submit"
              class="btn"
              name="decision"
              value="deny"
              style="color:var(--red);"
            >
              deny
            </button>
          )}
          <button type="submit" class="btn pri" name="decision" value="allow">
            allow ↵
          </button>
        </div>
      </form>
    </PublicShellLayout>
  );
}
