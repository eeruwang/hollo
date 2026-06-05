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
  const initial =
    account.name.trim().charAt(0).toUpperCase() ||
    account.handle.replace(/^@/, "").charAt(0).toUpperCase();

  return (
    <div>
      {account.coverUrl && (
        <div
          style={`
            margin: -6px -6px 16px;
            border: 1px solid var(--bds);
            aspect-ratio: 3 / 1;
            background-image: url("${account.coverUrl}");
            background-size: cover;
            background-position: center;
          `}
        />
      )}
      <div class="pname">
        {account.avatarUrl ? (
          <img
            src={account.avatarUrl}
            alt=""
            width={48}
            height={48}
            class="ava"
            style="padding:0; width:48px; height:48px; object-fit:cover;"
          />
        ) : (
          <span class="ava">{initial}</span>
        )}
        <a
          dangerouslySetInnerHTML={{ __html: nameHtml }}
          href={url}
          style="color:inherit;"
        />
      </div>
      <div class="kv" style="margin-top:8px;">
        <span class="k">handle</span>
        <span class="v" style="user-select: all;">
          {account.handle}
        </span>
        <span class="k">posts</span>
        <span class="v">{account.postsCount ?? 0}</span>
        <span class="k">following</span>
        <span class="v">{account.followingCount ?? 0}</span>
        <span class="k">followers</span>
        <span class="v">{account.followersCount ?? 0}</span>
        {account.published != null && (
          <>
            <span class="k">joined</span>
            <span class="v">
              {new Date(account.published).toLocaleDateString("en", {
                year: "numeric",
                month: "long",
              })}
            </span>
          </>
        )}
      </div>
      {account.bioHtml != null && account.bioHtml !== "" && (
        <div
          class="txt"
          style="margin-top:18px; color:var(--fg); max-width:60ch; line-height:1.65;"
          dangerouslySetInnerHTML={{ __html: bioHtml }}
        />
      )}
      {account.fieldHtmls &&
        Object.keys(account.fieldHtmls).length > 0 && (
          <div
            class="kv"
            style="margin-top:14px; padding-top:12px; border-top:1px solid var(--bds);"
          >
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
          open in fediverse ↗
        </a>
        <a class="btn" href={`/@${accountOwner.handle}.atom`}>
          atom
        </a>
      </div>
    </div>
  );
}
