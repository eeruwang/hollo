export interface SetupFormProps {
  method?: "get" | "post" | "dialog";
  action: string;
  values?: {
    email?: string;
  };
  errors?: {
    email?: string;
    password?: string;
    passwordConfirm?: string;
  };
}

export function SetupForm(props: SetupFormProps) {
  return (
    <form
      method={props.method ?? "post"}
      action={props.action}
      class="ac-b"
    >
      <div class="field">
        <label htmlFor="setup-email">
          email <span class="req">*</span>
        </label>
        <input
          id="setup-email"
          type="email"
          name="email"
          required={true}
          placeholder="you@example.com"
          autocomplete="username"
          value={props.values?.email}
          aria-invalid={props.errors?.email != null ? true : undefined}
        />
        <span
          class="desc"
          style={props.errors?.email ? "color:var(--red);" : undefined}
        >
          {props.errors?.email ?? "used to sign in"}
        </span>
      </div>
      <div class="field">
        <label htmlFor="setup-password">
          password <span class="req">*</span>
        </label>
        <input
          id="setup-password"
          type="password"
          name="password"
          required={true}
          minLength={6}
          autocomplete="new-password"
          aria-invalid={props.errors?.password != null ? true : undefined}
        />
        <span
          class="desc"
          style={props.errors?.password ? "color:var(--red);" : undefined}
        >
          {props.errors?.password ?? "at least 6 characters"}
        </span>
      </div>
      <div class="field">
        <label htmlFor="setup-password-confirm">
          confirm password <span class="req">*</span>
        </label>
        <input
          id="setup-password-confirm"
          type="password"
          name="password_confirm"
          required={true}
          minLength={6}
          autocomplete="new-password"
          aria-invalid={
            props.errors?.passwordConfirm != null ? true : undefined
          }
        />
        <span
          class="desc"
          style={
            props.errors?.passwordConfirm ? "color:var(--red);" : undefined
          }
        >
          {props.errors?.passwordConfirm ?? "must match"}
        </span>
      </div>
      <div class="formfoot">
        <span class="sp" />
        <button type="submit" class="btn-pri">
          start using Hollo →
        </button>
      </div>
    </form>
  );
}
