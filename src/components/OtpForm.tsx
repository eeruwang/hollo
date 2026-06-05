export interface OtpFormProps {
  method?: "get" | "post" | "dialog";
  action: string;
  next?: string;
  errors?: {
    token?: string;
  };
}

export function OtpForm(props: OtpFormProps) {
  return (
    <form
      method={props.method ?? "post"}
      action={props.action}
      style="max-width:380px;"
    >
      <div style="display:flex; gap:8px;">
        <input
          type="text"
          name="token"
          inputMode="numeric"
          pattern="^[0-9]+$"
          required
          placeholder="123456"
          aria-invalid={props.errors?.token == null ? undefined : true}
          style="flex:1; background:transparent; border:1px solid var(--bd); padding:8px 11px; color:var(--fgs); font-family:var(--mono); font-size:16px; outline:none; letter-spacing:.15em; text-align:center;"
        />
        <button type="submit" class="btn pri">
          verify ↵
        </button>
      </div>
      {props.errors?.token && (
        <small style="display:block; color:var(--red); margin-top:6px;">
          {props.errors.token}
        </small>
      )}
      {props.next && <input type="hidden" name="next" value={props.next} />}
    </form>
  );
}
