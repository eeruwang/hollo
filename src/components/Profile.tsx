import { escape } from "es-toolkit";
import type { Account, AccountOwner } from "../schema";
import { renderCustomEmojis } from "../text";

export interface ProfileProps {
  accountOwner: AccountOwner & { account: Account };
  baseUrl?: URL | string;
}

export function Profile({ accountOwner }: ProfileProps) {
  const account = accountOwner.account;
  const nameHtml = renderCustomEmojis(escape(account.name), account.emojis);
  const bioHtml = renderCustomEmojis(account.bioHtml ?? "", account.emojis);
  const url = account.url ?? account.iri;
  const avatarLetter =
    account.name.trim().charAt(0).toUpperCase() ||
    account.handle.replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <div>
      <div class="pname">
        <span class="ava">{avatarLetter}</span>
        <a
          dangerouslySetInnerHTML={{ __html: nameHtml }}
          href={url}
          style="color:inherit;"
        />
      </div>
      <div class="kv">
        <span class="k">handle</span>
        <span class="v" style="user-select: all;">
          {account.handle}
        </span>
        <span class="k">following</span>
        <span class="v">{account.followingCount}</span>
        <span class="k">followers</span>
        <span class="v">
          {account.followersCount === 1
            ? "1 follower"
            : `${account.followersCount} followers`}
        </span>
      </div>
      {account.bioHtml != null && account.bioHtml !== "" && (
        <div
          class="txt"
          style="margin-top:14px; color:var(--fg); max-width:60ch;"
          dangerouslySetInnerHTML={{ __html: bioHtml }}
        />
      )}
      {account.fieldHtmls &&
        Object.keys(account.fieldHtmls).length > 0 && (
          <div class="kv" style="margin-top:13px;">
            {Object.entries(account.fieldHtmls).map(([key, value]) => (
              <>
                <span class="k">{key}</span>
                <span
                  class="v"
                  dangerouslySetInnerHTML={{ __html: value }}
                />
              </>
            ))}
          </div>
        )}
      <div class="btnrow">
        <a class="btn pri" href={url}>
          follow
        </a>
        <a class="btn" href={`/@${accountOwner.handle}.atom`}>
          atom
        </a>
      </div>
    </div>
  );
}
