import { escape } from "es-toolkit";
import type { Account, AccountOwner } from "../schema";
import { renderCustomEmojis } from "../text";

export interface ProfileProps {
  accountOwner: AccountOwner & { account: Account };
}

export function Profile({ accountOwner }: ProfileProps) {
  const account = accountOwner.account;
  const nameHtml = renderCustomEmojis(escape(account.name), account.emojis);
  const bioHtml = renderCustomEmojis(account.bioHtml ?? "", account.emojis);
  const url = account.url ?? account.iri;
  return (
    <div>
      {account.coverUrl && (
        <img
          src={account.coverUrl}
          alt=""
          class="profile-cover"
        />
      )}
      <div class="profile-header">
        {account.avatarUrl && (
          <img
            src={account.avatarUrl}
            alt={`${account.name}'s avatar`}
            class="profile-avatar"
            width={72}
            height={72}
          />
        )}
        <div>
          <h1 class="profile-name">
            <a dangerouslySetInnerHTML={{ __html: nameHtml }} href={url} />
          </h1>
          <p class="profile-handle">
            {account.handle}
            <span class="profile-stats">
              {` · ${account.followingCount} following · `}
              {account.followersCount === 1
                ? "1 follower"
                : `${account.followersCount} followers`}
            </span>
          </p>
        </div>
      </div>
      {bioHtml && (
        <div
          class="profile-bio"
          dangerouslySetInnerHTML={{ __html: bioHtml }}
        />
      )}
      {account.fieldHtmls && Object.keys(account.fieldHtmls).length > 0 && (
        <div class="profile-fields">
          {Object.entries(account.fieldHtmls).map(([key, value]) => (
            <div class="profile-field">
              <span class="profile-field-key">{key}</span>
              <span
                class="profile-field-value"
                dangerouslySetInnerHTML={{ __html: value }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
