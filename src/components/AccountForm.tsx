import { capitalize } from "es-toolkit";
import iso6391 from "iso-639-1";
import { type PostVisibility, THEME_COLORS, type ThemeColor } from "../schema";

export interface AccountFormProps {
  method?: "get" | "post" | "dialog";
  action: string;
  readOnly?: {
    username?: boolean;
  };
  values?: {
    username?: string;
    name?: string;
    bio?: string;
    protected?: boolean;
    discoverable?: boolean;
    expandSpoilers?: boolean;
    language?: string;
    visibility?: PostVisibility;
    themeColor?: ThemeColor;
    news?: boolean;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    fields?: Array<{ name: string; value: string }>;
  };
  errors?: {
    username?: string;
    name?: string;
    bio?: string;
    avatar?: string;
    header?: string;
  };
  officialAccount: string;
  submitLabel: string;
  host?: string;
}

export function AccountForm(props: AccountFormProps) {
  return (
    <form
      method={props.method ?? "post"}
      action={props.action}
      class="ac-b"
      style="border:1px solid var(--bd); max-width:600px;"
    >
      <div class="sb-h" style="padding:8px 12px;">
        [ identity ]
      </div>

      <div class="field">
        <label htmlFor="acc-username">
          username <span class="req">*</span>
          {props.readOnly?.username ? (
            <span class="dimc"> (cannot change)</span>
          ) : null}
        </label>
        <input
          id="acc-username"
          type="text"
          name="username"
          required={true}
          placeholder="john"
          readOnly={props.readOnly?.username}
          value={props.values?.username}
          aria-invalid={props.errors?.username != null ? true : undefined}
          pattern="^[\p{L}\p{N}._\-]+$"
        />
        <span
          class="desc"
          style={props.errors?.username ? "color:var(--red);" : undefined}
        >
          {props.errors?.username ??
            "your username becomes part of your fediverse handle."}
        </span>
      </div>

      <div class="field">
        <label htmlFor="acc-name">
          display name <span class="req">*</span>
        </label>
        <input
          id="acc-name"
          type="text"
          name="name"
          required={true}
          placeholder="John Doe"
          value={props.values?.name}
          aria-invalid={props.errors?.name != null ? true : undefined}
        />
        <span
          class="desc"
          style={props.errors?.name ? "color:var(--red);" : undefined}
        >
          {props.errors?.name ?? "shown on your profile."}
        </span>
      </div>

      <div class="field">
        <label htmlFor="acc-bio">bio</label>
        <textarea
          id="acc-bio"
          name="bio"
          rows={4}
          placeholder="A short description of yourself."
          aria-invalid={props.errors?.bio != null ? true : undefined}
        >
          {props.values?.bio}
        </textarea>
        <span
          class="desc"
          style={props.errors?.bio ? "color:var(--red);" : undefined}
        >
          {props.errors?.bio ?? "markdown is supported."}
        </span>
      </div>

      <div class="field">
        <label
          style="display:flex; align-items:center; gap:8px; cursor:pointer;"
        >
          <input
            type="checkbox"
            name="protected"
            value="true"
            checked={props.values?.protected}
          />{" "}
          protect this account — only approved followers see posts
        </label>
      </div>

      <div class="sb-h" style="padding:8px 12px;">
        [ discovery ]
      </div>

      <div class="field">
        <label
          style="display:flex; align-items:center; gap:8px; cursor:pointer;"
        >
          <input
            type="checkbox"
            name="discoverable"
            value="true"
            checked={props.values?.discoverable}
          />{" "}
          allow discovery in the public directory
        </label>
      </div>

      <div class="field">
        <label
          style="display:flex; align-items:center; gap:8px; cursor:pointer;"
        >
          <input
            type="checkbox"
            name="expandSpoilers"
            value="true"
            checked={props.values?.expandSpoilers}
          />{" "}
          expand content warnings by default
        </label>
        <span class="desc">
          some clients (e.g. Phanpy) honor this server preference.
        </span>
      </div>

      <div class="sb-h" style="padding:8px 12px;">
        [ defaults ]
      </div>

      <div class="field">
        <label htmlFor="acc-language">default language</label>
        <select id="acc-language" name="language">
          {iso6391
            .getAllCodes()
            .map((code) => [code, iso6391.getNativeName(code)])
            .sort(([_, nameA], [__, nameB]) => nameA.localeCompare(nameB))
            .map(([code, nativeName]) => (
              <option value={code} selected={props.values?.language === code}>
                {nativeName} ({iso6391.getName(code)})
              </option>
            ))}
        </select>
      </div>

      <div class="field">
        <label htmlFor="acc-visibility">default post visibility</label>
        <select id="acc-visibility" name="visibility">
          <option
            value="public"
            selected={props.values?.visibility === "public"}
          >
            public
          </option>
          <option
            value="unlisted"
            selected={props.values?.visibility === "unlisted"}
          >
            unlisted
          </option>
          <option
            value="private"
            selected={props.values?.visibility === "private"}
          >
            followers only
          </option>
          <option
            value="direct"
            selected={props.values?.visibility === "direct"}
          >
            direct message
          </option>
        </select>
      </div>

      <div class="field">
        <label htmlFor="acc-theme">theme color</label>
        <select id="acc-theme" name="themeColor">
          {THEME_COLORS.map((color) => (
            <option
              value={color}
              selected={props.values?.themeColor === color}
            >
              {capitalize(color)}
            </option>
          ))}
        </select>
        <span class="desc">
          mapped to a phosphor swatch (green / amber / cyan / magenta) on
          the terminal UI.
        </span>
      </div>

      <div class="field">
        <label
          style="display:flex; align-items:center; gap:8px; cursor:pointer;"
        >
          <input
            type="checkbox"
            name="news"
            value="true"
            checked={props.values?.news}
          />{" "}
          follow <code>{props.officialAccount}</code> for Hollo news
        </label>
      </div>

      <div class="formfoot">
        <a class="btn-line" href="/accounts" style="text-decoration:none;">
          cancel
        </a>
        <span class="sp" />
        <button class="btn-pri" type="submit">
          {props.submitLabel} →
        </button>
      </div>
    </form>
  );
}
