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
}

const fieldStyle =
  "width:100%; background:transparent; border:1px solid var(--bd); padding:8px 11px; color:var(--fgs); font-family:var(--mono); font-size:14px; outline:none; margin-top:5px;";

export function LoginForm(props: LoginFormProps) {
  return (
    <form
      method={props.method ?? "post"}
      action={props.action}
      style="max-width:380px;"
    >
      <label
        style="display:block; color:var(--dim); font-size:12px; margin-bottom:14px;"
      >
        email
        <input
          type="email"
          name="email"
          required={true}
          placeholder="you@example.com"
          value={props.values?.email}
          aria-invalid={props.errors?.email != null ? true : undefined}
          style={fieldStyle}
        />
        {props.errors?.email && (
          <small style="display:block; color:var(--red); margin-top:4px;">
            {props.errors.email}
          </small>
        )}
      </label>
      <label
        style="display:block; color:var(--dim); font-size:12px; margin-bottom:14px;"
      >
        password
        <input
          type="password"
          name="password"
          required={true}
          minLength={6}
          aria-invalid={props.errors?.password != null ? true : undefined}
          style={fieldStyle}
        />
        {props.errors?.password && (
          <small style="display:block; color:var(--red); margin-top:4px;">
            {props.errors.password}
          </small>
        )}
      </label>
      {props.next && <input type="hidden" name="next" value={props.next} />}
      <button type="submit" class="btn pri">
        sign in ↵
      </button>
    </form>
  );
}
