import { Hono } from "hono";
import db from "../../db.ts";

const homePage = new Hono().basePath("/");

homePage.get("/", async (c) => {
  const credential = await db.query.credentials.findFirst();
  if (credential == null) return c.redirect("/setup");
  const owners = await db.query.accountOwners.findMany({
    with: { account: true },
  });
  if (owners.length < 1) return c.redirect("/accounts");
  if (
    "HOME_URL" in process.env &&
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    process.env["HOME_URL"] != null &&
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    process.env["HOME_URL"].trim() !== ""
  ) {
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    return c.redirect(process.env["HOME_URL"]);
  }
  // Hollo is single-user: send visitors to the owner's public profile
  // (which content-negotiates between the public Shell B and the
  // ActivityPub actor representation).
  return c.redirect(`/@${owners[0].handle}`);
});

export default homePage;
