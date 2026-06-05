import { hash, verify } from "argon2";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { AuthLayout } from "../components/AuthLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import { credentials } from "../schema.ts";

const passwordPage = new Hono();

passwordPage.use(csrf());
passwordPage.use(loginRequired);

interface PasswordFormProps {
  errors?: {
    current?: string;
    next?: string;
    confirm?: string;
  };
  done?: boolean;
}

function PasswordResetPage(props: PasswordFormProps) {
  return (
    <AuthLayout
      title="change password · Hollo"
      cardSubtitle="change password"
      promptCommand="passwd"
    >
      {props.done ? (
        <div class="ac-b">
          <div class="field">
            <span class="desc gn">✓ password updated.</span>
            <span class="desc">
              You'll need the new password the next time you sign in.
            </span>
          </div>
          <div class="formfoot">
            <span class="sp" />
            <a class="btn-pri" href="/social">
              back to Hollo →
            </a>
          </div>
        </div>
      ) : (
        <form method="post" action="/password" class="ac-b">
          <div class="field">
            <label htmlFor="pw-current">
              current password <span class="req">*</span>
            </label>
            <input
              id="pw-current"
              type="password"
              name="current"
              required
              autocomplete="current-password"
              aria-invalid={props.errors?.current != null ? true : undefined}
            />
            {props.errors?.current && (
              <span class="desc" style="color:var(--red);">
                ✗ {props.errors.current}
              </span>
            )}
          </div>
          <div class="field">
            <label htmlFor="pw-next">
              new password <span class="req">*</span>
            </label>
            <input
              id="pw-next"
              type="password"
              name="next"
              required
              minLength={12}
              autocomplete="new-password"
              aria-invalid={props.errors?.next != null ? true : undefined}
            />
            <span
              class="desc"
              style={props.errors?.next ? "color:var(--red);" : undefined}
            >
              {props.errors?.next
                ? `✗ ${props.errors.next}`
                : "min 12 chars · a passphrase is fine"}
            </span>
          </div>
          <div class="field">
            <label htmlFor="pw-confirm">
              confirm new password <span class="req">*</span>
            </label>
            <input
              id="pw-confirm"
              type="password"
              name="confirm"
              required
              minLength={12}
              autocomplete="new-password"
              style={
                props.errors?.confirm
                  ? "border-color:color-mix(in oklab,var(--red) 45%,var(--bd));"
                  : undefined
              }
              aria-invalid={props.errors?.confirm != null ? true : undefined}
            />
            {props.errors?.confirm && (
              <div
                class="state err"
                style="padding:8px 10px;text-align:left;margin:0;border:none;"
              >
                <span style="color:var(--red);font-size:12px;">
                  ✗ {props.errors.confirm}
                </span>
              </div>
            )}
          </div>
          <div class="formfoot">
            <a class="btn-line" href="/auth" style="text-decoration:none;">
              cancel
            </a>
            <span class="sp" />
            <button class="btn-pri" type="submit">
              update password
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

passwordPage.get("/", (c) => c.html(<PasswordResetPage />));

passwordPage.post("/", async (c) => {
  const form = await c.req.formData();
  const current = form.get("current")?.toString() ?? "";
  const next = form.get("next")?.toString() ?? "";
  const confirm = form.get("confirm")?.toString() ?? "";

  if (next.length < 12) {
    return c.html(
      <PasswordResetPage
        errors={{ next: "new password must be at least 12 characters." }}
      />,
      400,
    );
  }
  if (next !== confirm) {
    return c.html(
      <PasswordResetPage errors={{ confirm: "passwords don't match." }} />,
      400,
    );
  }

  const credential = await db.query.credentials.findFirst();
  if (credential == null) return c.redirect("/setup");

  let ok = false;
  try {
    ok = await verify(credential.passwordHash, current);
  } catch {
    ok = false;
  }
  if (!ok) {
    return c.html(
      <PasswordResetPage
        errors={{ current: "current password is incorrect." }}
      />,
      400,
    );
  }

  const newHash = await hash(next);
  await db
    .update(credentials)
    .set({ passwordHash: newHash })
    .where(eq(credentials.email, credential.email));

  return c.html(<PasswordResetPage done={true} />);
});

export default passwordPage;
