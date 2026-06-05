import { escape } from "es-toolkit";
import { AuthLayout } from "../../components/AuthLayout";
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
    <AuthLayout
      title={`authorize ${props.application.name} · Hollo`}
      cardSubtitle="authorize app"
      promptCommand={`oauth --grant ${props.application.name}`}
    >
      <form action="/oauth/authorize" method="post" class="ac-b">
        <div class="field">
          <label>application</label>
          <div style="color:var(--fgs); font-weight:600;">
            {props.application.name}
          </div>
          <span class="desc">requests access to your Hollo account.</span>
        </div>

        <div class="field">
          <label>requested permissions</label>
          <div
            style="display:flex; flex-direction:column; gap:5px; margin-top:3px;"
          >
            {props.scopes.map((scope) => (
              <div style="display:flex; align-items:center; gap:9px;">
                <code class="gn">{scope}</code>
                <span class="desc" style="margin-left:auto;">
                  {scopeDescription(scope)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {props.accountOwners.length > 1 && (
          <div class="field">
            <label>account</label>
            <div style="display:flex; flex-direction:column; gap:6px;">
              {props.accountOwners.map((accountOwner, i) => {
                const accountName = renderCustomEmojis(
                  escape(accountOwner.account.name),
                  accountOwner.account.emojis,
                );
                return (
                  <label
                    style="display:flex; gap:10px; align-items:flex-start; padding:8px 10px; border:1px solid var(--bd); cursor:pointer;"
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
                      <div class="desc">{accountOwner.account.handle}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {props.accountOwners.length === 1 && (
          <input
            type="hidden"
            name="account_id"
            value={props.accountOwners[0].id}
          />
        )}

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

        <div class="formfoot">
          {props.redirectUri !== "urn:ietf:wg:oauth:2.0:oob" && (
            <button
              type="submit"
              class="btn-line"
              name="decision"
              value="deny"
              style="color:var(--red); border-color:var(--bd);"
            >
              deny
            </button>
          )}
          <span class="sp" />
          <button
            type="submit"
            class="btn-pri"
            name="decision"
            value="allow"
          >
            allow →
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

function scopeDescription(scope: Scope): string {
  switch (scope) {
    case "read":
      return "read your account, timelines, and posts";
    case "write":
      return "create, edit, and delete posts on your behalf";
    case "follow":
      return "manage who you follow / block / mute";
    case "push":
      return "deliver push notifications";
    case "profile":
      return "read your profile and identity";
    default:
      if (typeof scope === "string") {
        if (scope.startsWith("read:")) {
          return `read access to ${scope.split(":")[1]}`;
        }
        if (scope.startsWith("write:")) {
          return `write access to ${scope.split(":")[1]}`;
        }
      }
      return "";
  }
}
