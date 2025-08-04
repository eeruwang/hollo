import { escape } from "es-toolkit";
import type { Account, AccountOwner } from "../schema";
import { renderCustomEmojis } from "../text";
import { useEffect } from "react";


export interface ProfileProps {
  accountOwner: AccountOwner & { account: Account };
}

export function Profile({ accountOwner }: ProfileProps) {
  const account = accountOwner.account;
  const nameHtml = renderCustomEmojis(escape(account.name), account.emojis);
  const bioHtml = renderCustomEmojis(account.bioHtml ?? "", account.emojis);
  const url = account.url ?? account.iri;

  useEffect(() => {
    const handleEl = document.getElementById("handle");
    const msgEl = document.getElementById("copied-message");

    if (!handleEl || !msgEl) return;

    const copy = () => {
      navigator.clipboard.writeText(handleEl.textContent ?? "").then(() => {
        msgEl.style.opacity = "1";
        setTimeout(() => {
          msgEl.style.opacity = "0";
        }, 1500);
      });
    };

    handleEl.addEventListener("click", copy);
    return () => handleEl.removeEventListener("click", copy);
  }, []);

  return (
    <div>
      {account.coverUrl && (
        <img
          src={account.coverUrl}
          alt=""
          style="margin-bottom: 1em; width: 100%;"
        />
      )}
      <hgroup>
        {account.avatarUrl && (
          <img
            src={account.avatarUrl}
            alt={`${account.name}'s avatar`}
            width={72}
            height={72}
            style="float: left; margin-right: 1em; border-radius: 50%;" // 원형 아바타
          />
        )}
        <h1>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: xss protected */}
          <a dangerouslySetInnerHTML={{ __html: nameHtml }} href={url} />
        </h1>
        <p style={{ position: "relative" }}>
          <span
            id="handle"
            style={{
              userSelect: "all",
              cursor: "pointer",
            }}
          >
            {account.handle}
          </span>{" "}
          &middot; {`${account.followingCount} following `}
          &middot;{" "}
          {account.followersCount === 1
            ? "1 follower"
            : `${account.followersCount} followers`}

          <span
            id="copied-message"
            style={{
              position: "absolute",
              top: "-1.5em",
              left: "0",
              fontSize: "0.75rem",
              color: "#888",
              background: "#fff",
              padding: "0.2em 0.5em",
              border: "1px solid #ccc",
              borderRadius: "4px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              opacity: "0",
              pointerEvents: "none",
              transition: "opacity 0.3s ease",
            }}
          >
            Copied!
          </span>
        </p>
      </hgroup>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: no xss */}
      <div dangerouslySetInnerHTML={{ __html: bioHtml }} />
      {account.fieldHtmls && (
        <div class="overflow-auto">
          <table>
            <thead>
              <tr>
                {Object.keys(account.fieldHtmls).map((key) => (
                  <th>{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {Object.values(account.fieldHtmls).map((value) => (
                  <td
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: no xss
                    dangerouslySetInnerHTML={{ __html: value }}
                  />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
