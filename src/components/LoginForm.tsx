export interface LoginFormProps {
  method?: "get" | "post" | "dialog";
  action: string;
  next?: string;
  values?: {
    email?: string;
  };
  errors?: {
    email?: string;
    password?: string;
  };
  /** Shown under the email field as helper text. */
  hint?: string;
  /** Optional URL for the "forgot?" link in the form footer. */
  resetUrl?: string;
}

export function LoginForm(props: LoginFormProps) {
  return (
    <form
      method={props.method ?? "post"}
      action={props.action}
      class="ac-b"
    >
      <div class="field">
        <label htmlFor="login-email">
          email <span class="req">*</span>
        </label>
        <input
          id="login-email"
          type="email"
          name="email"
          required={true}
          placeholder="you@example.com"
          spellcheck={false}
          autocomplete="username"
          value={props.values?.email}
          aria-invalid={props.errors?.email != null ? true : undefined}
        />
        {props.errors?.email ? (
          <small class="desc" style="color:var(--red);">
            {props.errors.email}
          </small>
        ) : (
          props.hint && <span class="desc">{props.hint}</span>
        )}
      </div>
      <div class="field">
        <label htmlFor="login-password">
          password <span class="req">*</span>
        </label>
        <input
          id="login-password"
          type="password"
          name="password"
          required={true}
          minLength={6}
          autocomplete="current-password"
          aria-invalid={props.errors?.password != null ? true : undefined}
        />
        {props.errors?.password && (
          <small class="desc" style="color:var(--red);">
            {props.errors.password}
          </small>
        )}
      </div>
      {props.next && <input type="hidden" name="next" value={props.next} />}
      <div class="formfoot">
        {props.resetUrl && (
          <a class="btn-line" href={props.resetUrl} style="text-decoration:none;">
            forgot?
          </a>
        )}
        <span class="sp" />
        <button type="submit" class="btn-pri">
          sign in →
        </button>
      </div>
    </form>
  );
}
