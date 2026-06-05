import { escape } from "es-toolkit";
import type { Account, AccountOwner } from "../schema";
import { renderCustomEmojis } from "../text";

export interface ProfileProps {
  accountOwner: AccountOwner & { account: Account };
  baseUrl?: URL | string;
  isOwner?: boolean;
}

/**
 * In-app profile body (Shell A).
 * Markup matches design/profile.html exactly:
 *   <div class="pname"><span class="ava">e</span>name</div>
 *   <div class="kv">handle / bio / fields / joined / stats</div>
 *   <div class="btnrow">＋ Follow / ✉ Message / ⋯</div>
 *
 * No cover image, no <img> avatar in .pname — the design uses a single
 * mono initial inside the .ava box. (Cover + the bigger banner are
 * reserved for the public Shell B in @eeruwang.html.)
 */
export function Profile({ accountOwner, isOwner }: ProfileProps) {
  const account = accountOwner.account;
  const nameHtml = renderCustomEmojis(escape(account.name), account.emojis);
  const bioHtml =
    account.bioHtml != null && account.bioHtml !== ""
      ? renderCustomEmojis(account.bioHtml, account.emojis)
      : null;
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
      <div class="pname">
        <span class="ava">{initial.toLowerCase()}</span>
        <span dangerouslySetInnerHTML={{ __html: nameHtml }} />
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
            <button type="button" class="btn pri" onclick="location.href='/accounts'">
              ＋ Edit
            </button>
            <button type="button" class="btn" onclick="location.href='/compose'">
              ✉ Compose
            </button>
            <button type="button" class="btn" onclick="location.href='/settings'">
              ⋯
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              class="btn pri"
              onclick={`location.href='${account.url ?? account.iri}'`}
            >
              ＋ Follow
            </button>
            <button
              type="button"
              class="btn"
              onclick={`location.href='${account.url ?? account.iri}'`}
            >
              ✉ Message
            </button>
            <button type="button" class="btn">
              ⋯
            </button>
          </>
        )}
      </div>
    </>
  );
}
