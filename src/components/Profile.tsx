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
    <div className="profile">
      {account.coverUrl && (
        <div className="profile-cover">
          <img src={account.coverUrl} alt="" />
        </div>
      )}
      <div className="profile-header">
        {account.avatarUrl && (
          <img
            src={account.avatarUrl}
            alt={`${account.name}'s avatar`}
            className="profile-avatar"
            width={80}
            height={80}
          />
        )}
        <div className="profile-info">
          <h1 className="profile-name">
            <a dangerouslySetInnerHTML={{ __html: nameHtml }} href={url} />
          </h1>
          <p className="profile-handle">
            <span
              data-tooltip="Use this handle to reach out to this account on your fediverse server!"
              data-placement="bottom"
            >
              {account.handle}
            </span>
            <span className="profile-stats">
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
          className="profile-bio"
          dangerouslySetInnerHTML={{ __html: bioHtml }}
        />
      )}
      {account.fieldHtmls && Object.keys(account.fieldHtmls).length > 0 && (
        <div className="profile-fields">
          {Object.entries(account.fieldHtmls).map(([key, value]) => (
            <div className="profile-field">
              <span className="profile-field-key">{key}</span>
              <span
                className="profile-field-value"
                dangerouslySetInnerHTML={{ __html: value }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
