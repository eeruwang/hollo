import { zValidator } from "@hono/zod-validator";
import { getLogger } from "@logtape/logtape";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { HOTP, Secret, TOTP, URI } from "otpauth";
import { toDataURL } from "qrcode";
import { z } from "zod";
import { DashboardLayout } from "../components/DashboardLayout";
import db from "../db";
import { SECRET_KEY } from "../env";
import { loginRequired } from "../login";
import {
  buildRegistrationOptions,
  encodePublicKey,
  getRpInfo,
  nicknameFromUserAgent,
  verifyRegistration,
} from "../passkey";
import { type Passkey, passkeys, type Totp, totps } from "../schema";

const logger = getLogger(["hollo", "pages", "auth"]);

const PASSKEY_REG_COOKIE = "passkey_reg";
const PASSKEY_REG_MAX_AGE_SECONDS = 5 * 60;

const auth = new Hono();

auth.use(csrf());
auth.use(loginRequired);

auth.get("/", async (c) => {
  const totp = await db.query.totps.findFirst();
  const passkeysList = await db.query.passkeys.findMany({
    orderBy: (p, { desc }) => [desc(p.created)],
  });
  const open = c.req.query("open");
  if (totp == null && open === "2fa") {
    const credential = await db.query.credentials.findFirst();
    if (credential == null) return c.redirect("/setup");
    const totp = new TOTP({
      issuer: "Hollo",
      label: credential.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: new Secret({ size: 20 }),
    });
    logger.debug("The TOTP token: {token}", { token: totp.generate() });
    return c.html(<AuthPage tfa={{ totp }} passkeys={passkeysList} />);
  }
  return c.html(<AuthPage totp={totp} passkeys={passkeysList} />);
});

auth.post(
  "/2fa",
  zValidator(
    "form",
    z.object({ totp: z.url(), token: z.string().regex(/^\d+$/) }),
  ),
  async (c) => {
    const form = c.req.valid("form");
    const totp = URI.parse(form.totp);
    const passkeysList = await db.query.passkeys.findMany({
      orderBy: (p, { desc }) => [desc(p.created)],
    });
    if (totp instanceof HOTP) {
      return c.html(
        <AuthPage
          tfa={{ totp, error: "HOTP is not supported." }}
          passkeys={passkeysList}
        />,
      );
    }
    const validated = totp.validate({
      token: form.token,
      window: 2,
    });
    if (validated == null) {
      return c.html(
        <AuthPage
          tfa={{ totp, error: "The code you entered is invalid." }}
          passkeys={passkeysList}
        />,
      );
    }
    await db.insert(totps).values({
      ...totp,
      secret: totp.secret.base32,
    });
    return c.redirect("/auth");
  },
);

auth.post("/2fa/disable", async (c) => {
  await db.delete(totps);
  return c.redirect("/auth");
});

auth.post("/passkeys/registration/begin", async (c) => {
  const login = await getSignedCookie(c, SECRET_KEY, "login");
  // loginRequired ran already, but TypeScript can't narrow that, and the
  // double check costs nothing.
  if (login == null || login === false) {
    return c.redirect(`/login?next=${encodeURIComponent(c.req.url)}`);
  }
  const credential = await db.query.credentials.findFirst();
  if (credential == null) return c.redirect("/setup");
  const enrolled = await db.query.passkeys.findMany({
    columns: { id: true, transports: true },
  });
  const rpInfo = getRpInfo(c.req.url);
  const { options, challenge } = await buildRegistrationOptions({
    rpInfo,
    email: credential.email,
    existingCredentials: enrolled.map((p) => ({
      id: p.id,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
  });
  const expiresAt = Date.now() + PASSKEY_REG_MAX_AGE_SECONDS * 1000;
  // The signed cookie binds the challenge to (a) the current login
  // session and (b) a server-enforced expiry, so a captured cookie
  // can't be replayed after logout or after the TTL even though
  // Max-Age is only a browser hint.  The pipe character is not part
  // of base64url (the challenge encoding), so it's safe as a
  // separator.
  const value = `${challenge}|${expiresAt.toString()}|${login}`;
  await setSignedCookie(c, PASSKEY_REG_COOKIE, value, SECRET_KEY, {
    httpOnly: true,
    secure: rpInfo.origin.startsWith("https://"),
    sameSite: "Strict",
    path: "/auth/passkeys",
    maxAge: PASSKEY_REG_MAX_AGE_SECONDS,
  });
  return c.json(options);
});

const finishBodySchema = z.object({
  nickname: z.string().trim().max(80).optional(),
  registrationResponse: z.object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
    clientExtensionResults: z.record(z.string(), z.unknown()),
    authenticatorAttachment: z.string().optional(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
      authenticatorData: z.string().optional(),
      publicKey: z.string().optional(),
      publicKeyAlgorithm: z.number().optional(),
      transports: z.array(z.string()).optional(),
    }),
  }),
});

auth.post("/passkeys/registration/finish", async (c) => {
  const login = await getSignedCookie(c, SECRET_KEY, "login");
  if (login == null || login === false) {
    return c.redirect(`/login?next=${encodeURIComponent(c.req.url)}`);
  }
  // Consume the registration challenge cookie up front, before any body
  // parsing or schema validation, so a malformed first request still
  // burns the cookie.  Otherwise zValidator would short-circuit on a bad
  // payload and leave passkey_reg replayable until its TTL.
  const cookieValue = await getSignedCookie(c, SECRET_KEY, PASSKEY_REG_COOKIE);
  deleteCookie(c, PASSKEY_REG_COOKIE, { path: "/auth/passkeys" });
  if (cookieValue == null || cookieValue === false) {
    return c.json({ error: "Missing or invalid challenge cookie." }, 400);
  }
  const parts = cookieValue.split("|");
  if (parts.length !== 3) {
    return c.json({ error: "Malformed challenge cookie." }, 400);
  }
  const [challenge, expiresAtStr, boundLogin] = parts;
  const expiresAt = Number.parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return c.json({ error: "Challenge has expired." }, 400);
  }
  if (boundLogin !== login) {
    return c.json(
      { error: "Challenge is bound to a different login session." },
      400,
    );
  }
  const credential = await db.query.credentials.findFirst();
  if (credential == null) return c.redirect("/setup");

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }
  const parsed = finishBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body." }, 400);
  }
  const body = parsed.data;
  const rpInfo = getRpInfo(c.req.url);
  const verified = await verifyRegistration({
    rpInfo,
    // SimpleWebAuthn validates the inner shape; the Zod schema above
    // just rejects obviously wrong payloads.
    // oxlint-disable-next-line typescript/no-explicit-any
    response: body.registrationResponse as any,
    expectedChallenge: challenge,
  });
  if (verified == null) {
    return c.json({ error: "Registration could not be verified." }, 400);
  }
  // body.nickname has already been .trim()'d by finishBodySchema, so it's
  // either a non-empty trimmed string, an empty string, or undefined.
  const nickname =
    body.nickname != null && body.nickname !== ""
      ? body.nickname
      : nicknameFromUserAgent(c.req.header("user-agent"));
  const inserted = await db
    .insert(passkeys)
    .values({
      id: verified.credentialId,
      credentialEmail: credential.email,
      publicKey: encodePublicKey(verified.publicKey),
      counter: verified.counter,
      transports: verified.transports,
      deviceType: verified.deviceType,
      backedUp: verified.backedUp,
      nickname,
    })
    .onConflictDoNothing()
    .returning({ id: passkeys.id });
  if (inserted.length === 0) {
    return c.json(
      { error: "This passkey is already enrolled on this account." },
      409,
    );
  }
  return c.body(null, 204);
});

auth.post("/passkeys/:id/delete", async (c) => {
  const id = c.req.param("id");
  await db.delete(passkeys).where(eq(passkeys.id, id));
  return c.redirect("/auth");
});

interface AuthPageProps {
  totp?: Totp;
  tfa?: {
    totp: TOTP | HOTP;
    error?: string;
  };
  passkeys: Passkey[];
}

async function AuthPage({ totp, tfa, passkeys }: AuthPageProps) {
  return (
    <DashboardLayout
      title="~/auth · Hollo"
      selectedMenu="auth"
      shellPath="settings/auth"
      shellMode="CONFIG"
      shellStatus="auth · security"
      shellHints={[
        { key: "j/k", label: "row" },
        { key: "Enter", label: "edit" },
        { key: "q", label: "back" },
      ]}
    >
      <div class="cmdline">
        <span class="u">root@hollo</span>:~${" "}
        <span class="cmd">auth</span> <span class="arg">--security</span>
      </div>

      <div class="setblock">
        <div class="sb-h">[ two-factor authentication ]</div>
        {totp == null ? (
          tfa == null ? (
            <div class="setrow">
              <div class="lab">
                TOTP
                <div class="d">authenticator app · 6-digit code</div>
              </div>
              <div class="val">
                <a class="btn-pri" href="?open=2fa">
                  enable →
                </a>
              </div>
            </div>
          ) : (
            <form method="post" action="/auth/2fa" class="ac-b">
              <div class="field">
                <label>scan QR with your authenticator app</label>
                <div style="display:flex; justify-content:center; padding:14px 0;">
                  <img
                    src={await qrCode(tfa.totp.toString())}
                    alt=""
                    style="background:var(--bg2); padding:9px; border:1px solid var(--bd);"
                  />
                </div>
                <span class="desc">
                  or copy this URL into the app:
                </span>
                <input
                  type="text"
                  value={tfa.totp.toString()}
                  readonly
                  style="user-select:all; margin-top:4px;"
                />
              </div>
              <div class="field">
                <label htmlFor="auth-totp-token">
                  verification code <span class="req">*</span>
                </label>
                <input
                  type="hidden"
                  name="totp"
                  value={tfa.totp.toString()}
                />
                <input
                  id="auth-totp-token"
                  type="text"
                  name="token"
                  inputmode="numeric"
                  pattern="^[0-9]+$"
                  required
                  placeholder="123456"
                  autocomplete="one-time-code"
                  style="letter-spacing:.15em; text-align:center;"
                  aria-invalid={tfa.error == null ? undefined : "true"}
                />
                {tfa.error && (
                  <span class="desc" style="color:var(--red);">
                    {tfa.error}
                  </span>
                )}
              </div>
              <div class="formfoot">
                <a class="btn-line" href="/auth">
                  ← cancel
                </a>
                <span class="sp" />
                <button class="btn-pri" type="submit">
                  verify →
                </button>
              </div>
            </form>
          )
        ) : (
          <div class="setrow">
            <div class="lab">
              TOTP
              <div class="d gn">✓ enabled · second factor required at sign-in</div>
            </div>
            <div class="val">
              <form
                method="post"
                action="/auth/2fa/disable"
                onsubmit="return window.confirm('Disable two-factor authentication?');"
                style="display:inline; margin:0;"
              >
                <button class="btn-line" type="submit" style="color:var(--red); border-color:var(--bd);">
                  disable
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div class="setblock">
        <div class="sb-h">[ passkeys ]</div>
        {passkeys.length === 0 ? (
          <div class="field">
            <span class="desc">
              No passkeys are enrolled yet. Enrolling one lets you sign in
              from this browser without typing your password — and counts
              as multi-factor on its own.
            </span>
          </div>
        ) : (
          <div class="ttable" style="grid-template-columns: 1fr auto auto;">
            <div class="tr th">
              <span>nickname</span>
              <span>added · last used</span>
              <span />
            </div>
            {passkeys.map((p) => (
              <div class="tr">
                <span>
                  <strong>{p.nickname}</strong>
                </span>
                <span class="desc">
                  {formatDate(p.created)}
                  {p.lastUsed != null
                    ? ` · ${formatDate(p.lastUsed)}`
                    : " · never used"}
                </span>
                <span>
                  <form
                    method="post"
                    action={`/auth/passkeys/${encodeURIComponent(p.id)}/delete`}
                    onsubmit="return window.confirm('Remove this passkey? You will not be able to sign in with it after this.');"
                    style="display:inline; margin:0;"
                  >
                    <button
                      type="submit"
                      class="btn-line"
                      style="color:var(--red); border-color:var(--bd); padding:5px 11px; font-size:12px;"
                    >
                      remove
                    </button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        )}

        <form id="passkey-enroll-form" class="ac-b">
          <div class="field">
            <label htmlFor="passkey-nickname">nickname (optional)</label>
            <input
              id="passkey-nickname"
              name="nickname"
              type="text"
              maxLength={80}
              placeholder="e.g. iPhone, work laptop, YubiKey"
            />
            <p id="passkey-enroll-status" class="desc" aria-live="polite" />
          </div>
          <div class="formfoot">
            <span class="sp" />
            <button type="submit" class="btn-pri">
              ＋ add passkey
            </button>
          </div>
        </form>
      </div>

      <script src="/public/simplewebauthn-browser.umd.js" defer />
      <script src="/public/passkey.js" defer />
    </DashboardLayout>
  );
}

function formatDate(value: Date): string {
  // Server-side rendering uses the server's locale, which inside a typical
  // Hollo container is UTC; the wrapping <time dateTime> attribute carries
  // the canonical ISO instant so a browser-side enhancement could re-render
  // it in the visitor's locale.  Same pattern as src/components/AccountList.tsx.
  return value.toLocaleDateString();
}

function qrCode(data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    toDataURL(data, (err, url) => {
      if (err != null) return reject(err);
      resolve(url);
    });
  });
}

export default auth;
