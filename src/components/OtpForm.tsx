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
    <form method={props.method ?? "post"} action={props.action} class="ac-b">
      <div class="field">
        <label htmlFor="otp-token">
          one-time code <span class="req">*</span>
        </label>
        <input
          id="otp-token"
          type="text"
          name="token"
          inputMode="numeric"
          pattern="^[0-9]+$"
          required
          placeholder="123456"
          autocomplete="one-time-code"
          aria-invalid={props.errors?.token == null ? undefined : true}
          style="letter-spacing:.15em; text-align:center;"
        />
        {props.errors?.token && (
          <small class="desc" style="color:var(--red);">
            {props.errors.token}
          </small>
        )}
      </div>
      {props.next && <input type="hidden" name="next" value={props.next} />}
      <div class="formfoot">
        <span class="sp" />
        <button type="submit" class="btn-pri">
          verify →
        </button>
      </div>
    </form>
  );
}
