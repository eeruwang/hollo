import { hash } from "argon2";
import { count } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { csrf } from "hono/csrf";
import { AuthLayout } from "../../components/AuthLayout.tsx";
import { SetupForm } from "../../components/SetupForm.tsx";
import db from "../../db.ts";
import { credentials } from "../../schema.ts";

const setup = new Hono();

setup.use(csrf());

function showsProxyWarning(c: Context): boolean {
  const url = new URL(c.req.url);
  return (
    url.protocol === "http:" &&
    url.hostname !== "localhost" &&
    !url.hostname.startsWith("127.") &&
    // biome-ignore lint/complexity/useLiteralKeys: tsc rants about this (TS4111)
    process.env["BEHIND_PROXY"] !== "true"
  );
}

setup.get("/", async (c) => {
  const [{ value: exist }] = await db
    .select({ value: count() })
    .from(credentials);
  if (exist > 0) return c.redirect("/accounts");
  return c.html(<SetupPage proxyWarning={showsProxyWarning(c)} />);
});

setup.post("/", async (c) => {
  const [{ value: exist }] = await db
    .select({ value: count() })
    .from(credentials);
  if (exist > 0) return c.redirect("/accounts");
  const form = await c.req.formData();
  const email = form.get("email")?.toString();
  const password = form.get("password")?.toString();
  const passwordConfirm = form.get("password_confirm")?.toString();
  if (
    email == null ||
    password == null ||
    passwordConfirm == null ||
    password !== passwordConfirm
  ) {
    return c.html(
      <SetupPage
        proxyWarning={showsProxyWarning(c)}
        values={{ email }}
        errors={{
          email: email == null ? "Email is required." : undefined,
          password: password == null ? "Password is required." : undefined,
          passwordConfirm:
            password !== passwordConfirm
              ? "Passwords do not match."
              : undefined,
        }}
      />,
      400,
    );
  }
  await db.insert(credentials).values({
    email,
    passwordHash: await hash(password),
  });
  return c.redirect("/accounts");
});

interface SetupPageProps {
  proxyWarning?: boolean;
  values?: {
    email?: string;
  };
  errors?: {
    email?: string;
    password?: string;
    passwordConfirm?: string;
  };
}

function SetupPage(props: SetupPageProps) {
  return (
    <AuthLayout
      title="setup · Hollo"
      cardSubtitle="first-run setup"
      promptUser="root"
      promptCommand="setup --init"
    >
      <div class="stepper">
        <span class="st on">
          <span class="dot">1</span>identity
        </span>
        <span class="bar" />
        <span class="st">
          <span class="dot">2</span>done
        </span>
      </div>
      {props.proxyWarning && (
        <div
          style="margin:11px 14px; padding:11px 12px; border:1px solid var(--red); color:var(--red); font-size:12.5px;"
        >
          <strong>warning:</strong> your Hollo server runs behind a reverse
          proxy or L7 load balancer. set{" "}
          <a
            href="https://docs.hollo.social/install/env/#behind_proxy-"
            class="gn"
          >
            <code>BEHIND_PROXY=true</code>
          </a>{" "}
          to avoid federation issues.
        </div>
      )}
      <SetupForm action="/setup" values={props.values} errors={props.errors} />
    </AuthLayout>
  );
}

export default setup;
