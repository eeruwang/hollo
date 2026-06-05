import { escape } from "es-toolkit";
import type { Account, AccountOwner } from "../schema";
import { renderCustomEmojis } from "../text";
import { sanitizeHtml } from "../xss";

export interface AccountListProps {
  accountOwners: (AccountOwner & { account: Account })[];
  baseUrl?: URL | string;
}

export function AccountList({ accountOwners }: AccountListProps) {
  return (
    <>
      {accountOwners.map((account) => (
        <AccountItem accountOwner={account} />
      ))}
    </>
  );
}

interface AccountItemProps {
  accountOwner: AccountOwner & { account: Account };
}

function AccountItem({ accountOwner: { account } }: AccountItemProps) {
  const nameHtml = renderCustomEmojis(escape(account.name), account.emojis);
  const bioHtml = renderCustomEmojis(
    sanitizeHtml(account.bioHtml ?? ""),
    account.emojis,
  );
  const href = account.url ?? account.iri;
  return (
    <article class="entry mine" style="margin-bottom:14px;">
      <div class="meta">
        <span
          class="au"
          dangerouslySetInnerHTML={{ __html: nameHtml }}
        />
        <span class="ts" style="user-select:all;">
          {account.handle}
        </span>
        <span class="dimc" style="margin-left:auto;">
          {account.published ? (
            <>
              created{" "}
              <time dateTime={account.published.toISOString()}>
                {account.published.toLocaleDateString()}
              </time>
            </>
          ) : (
            <>
              fetched{" "}
              <time dateTime={account.updated.toISOString()}>
                {account.updated.toLocaleDateString()}
              </time>
            </>
          )}
        </span>
      </div>
      {bioHtml && (
        <div
          class="txt"
          style="max-width:60ch;"
          dangerouslySetInnerHTML={{ __html: bioHtml }}
        />
      )}
      <div class="acts" style="margin-top:10px;">
        <a class="btn-pri" href={`/accounts/${account.id}`}>
          ✎ edit
        </a>
        <a class="btn-line" href={`/accounts/${account.id}/migrate`}>
          ↪ migrate
        </a>
        <a class="btn-line" href={href} target="_blank" rel="noreferrer">
          open ↗
        </a>
        <span class="sp" style="margin-left:auto;" />
        <form
          action={`/accounts/${account.id}/delete`}
          method="post"
          onsubmit="return confirm('Delete this account? This is irreversible.')"
          style="display:inline; margin:0;"
        >
          <button
            type="submit"
            class="btn-line"
            style="color:var(--red); border-color:var(--bd);"
          >
            delete
          </button>
        </form>
      </div>
    </article>
  );
}
