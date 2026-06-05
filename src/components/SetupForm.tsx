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

const fieldStyle =
  "width:100%; background:transparent; border:1px solid var(--bd); padding:8px 11px; color:var(--fgs); font-family:var(--mono); font-size:14px; outline:none; margin-top:5px;";
const labelStyle =
  "display:block; color:var(--dim); font-size:12px; margin-bottom:14px;";
const hintStyle = "display:block; color:var(--faint); margin-top:4px;";
const errorStyle = "display:block; color:var(--red); margin-top:4px;";

export function SetupForm(props: SetupFormProps) {
  return (
    <form
      method={props.method ?? "post"}
      action={props.action}
      style="max-width:440px;"
    >
      <label style={labelStyle}>
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
        <small style={props.errors?.email ? errorStyle : hintStyle}>
          {props.errors?.email ?? "used to sign in"}
        </small>
      </label>
      <label style={labelStyle}>
        password
        <input
          type="password"
          name="password"
          required={true}
          minLength={6}
          aria-invalid={props.errors?.password != null ? true : undefined}
          style={fieldStyle}
        />
        <small style={props.errors?.password ? errorStyle : hintStyle}>
          {props.errors?.password ?? "at least 6 characters"}
        </small>
      </label>
      <label style={labelStyle}>
        password (again)
        <input
          type="password"
          name="password_confirm"
          required={true}
          minLength={6}
          aria-invalid={
            props.errors?.passwordConfirm != null ? true : undefined
          }
          style={fieldStyle}
        />
        <small
          style={props.errors?.passwordConfirm ? errorStyle : hintStyle}
        >
          {props.errors?.passwordConfirm ?? "confirm above"}
        </small>
      </label>
      <button type="submit" class="btn pri">
        start using Hollo ↵
      </button>
    </form>
  );
}
