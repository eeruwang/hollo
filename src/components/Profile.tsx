import { escape } from "es-toolkit";
import type { Account, AccountOwner } from "../schema";
import { renderCustomEmojis } from "../text";

export interface ProfileProps {
  accountOwner: AccountOwner & { account: Account };
  baseUrl?: URL | string;
  isOwner?: boolean;
}

export function Profile({ accountOwner, isOwner }: ProfileProps) {
  const account = accountOwner.account;
  const nameHtml = renderCustomEmojis(escape(account.name), account.emojis);
  const bioHtml =
    account.bioHtml != null && account.bioHtml !== ""
      ? renderCustomEmojis(account.bioHtml, account.emojis)
      : null;
  const url = account.url ?? account.iri;
  const initial =
    account.name.trim().charAt(0).toUpperCase() ||
    account.handle.replace(/^@/, "").charAt(0).toUpperCase();
  const fields = account.fieldHtmls ?? {};
  const fieldEntries = Object.entries(fields);
  const joined =
    account.published != null
      ? new Date(account.published).toLocaleDateString("en", {
          year: "numeric",
          month: "2-digit",
        })
      : null;
  const posts = (account.postsCount ?? 0).toLocaleString();
  const following = (account.followingCount ?? 0).toLocaleString();
  const followers = (account.followersCount ?? 0).toLocaleString();

  return (
    <>
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

      <div class="kv">
        <span class="k">handle</span>
        <span class="v" style="user-select:all;">
          {account.handle}
        </span>
        {bioHtml && (
          <>
            <span class="k">bio</span>
            <span class="v" dangerouslySetInnerHTML={{ __html: bioHtml }} />
          </>
        )}
        {fieldEntries.map(([key, value]) => (
          <>
            <span class="k">{key.toLowerCase()}</span>
            <span class="v" dangerouslySetInnerHTML={{ __html: value }} />
          </>
        ))}
        {joined && (
          <>
            <span class="k">joined</span>
            <span class="v">{joined}</span>
          </>
        )}
        <span class="k">stats</span>
        <span class="v">
          <span class="gn">{posts}</span> posts · {following} following ·{" "}
          <span class="am">{followers}</span> followers
        </span>
      </div>

      <div class="btnrow">
        {isOwner ? (
          <>
            <a class="btn pri" href="/accounts">
              ✎ edit profile
            </a>
            <a class="btn" href={url} target="_blank" rel="noreferrer">
              open in fediverse ↗
            </a>
            <a class="btn" href={`/@${accountOwner.handle}.atom`}>
              atom
            </a>
          </>
        ) : (
          <>
            <a class="btn pri" href={url}>
              ＋ Follow
            </a>
            <a class="btn" href={`/@${accountOwner.handle}.atom`}>
              atom
            </a>
          </>
        )}
      </div>
    </>
  );
}
