import { getLogger } from "@logtape/logtape";
import { desc, inArray, isNotNull, ne } from "drizzle-orm";
import { Hono } from "hono";
import mime from "mime";
import { DashboardLayout } from "../components/DashboardLayout";
import db from "../db";
import { loginRequired } from "../login";
import { accounts, customEmojis, posts, reactions } from "../schema";
import { drive } from "../storage";

const logger = getLogger(["hollo", "pages", "emojis"]);

const emojis = new Hono();

emojis.use(loginRequired);

emojis.get("/", async (c) => {
  const emojis = await db.query.customEmojis.findMany({
    orderBy: [customEmojis.category, desc(customEmojis.created)],
  });

  return c.html(
    <DashboardLayout title="Hollo: Custom emojis" selectedMenu="emojis">
      <hgroup>
        <h1>Custom emojis</h1>
        <p>You can register custom emojis for your Hollo accounts.</p>
      </hgroup>
      <form
        method="post"
        action="/emojis/delete"
        onsubmit="const cnt = this.querySelectorAll('input[name=emoji]:checked').length; return window.confirm('Are you sure you want to delete the selected ' + (cnt > 1 ? cnt + ' emojis' : cnt + ' emoji') + '?');"
      >
        {emojis.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Category</th>
                <th>Short code</th>
                <th>Image</th>
              </tr>
            </thead>
            <tbody>
              {emojis.map((emoji) => (
                <tr>
                  <td>
                    <input
                      type="checkbox"
                      id={`emoji-${emoji.shortcode}`}
                      name="emoji"
                      value={emoji.shortcode}
                      onchange="this.form.querySelector('button[type=submit]').disabled = !this.form.querySelectorAll('input[name=emoji]:checked').length"
                    />
                  </td>
                  <td>
                    <label for={`emoji-${emoji.shortcode}`}>
                      {emoji.category}
                    </label>
                  </td>
                  <td>
                    <tt>
                      <label for={`emoji-${emoji.shortcode}`}>
                        :{emoji.shortcode}:
                      </label>
                    </tt>
                  </td>
                  <td>
                    <label for={`emoji-${emoji.shortcode}`}>
                      <img
                        src={emoji.url}
                        alt={`:${emoji.shortcode}:`}
                        style="height: 24px"
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div role="group">
          <a role="button" href="/emojis/new">
            Add a custom emoji
          </a>
          <a role="button" href="/emojis/import" class="secondary">
            Import custom emojis
          </a>
          <button type="submit" class="contrast" disabled>
            Delete selected emojis
          </button>
        </div>
      </form>
    </DashboardLayout>,
  );
});

emojis.get("/new", async (c) => {
  const categories = await db
    .select({ category: customEmojis.category })
    .from(customEmojis)
    .where(isNotNull(customEmojis.category))
    .groupBy(customEmojis.category);
  return c.html(
    <DashboardLayout title="Hollo: Add custom emoji" selectedMenu="emojis">
      <hgroup>
        <h1>Add custom emoji</h1>
        <p>You can add a custom emoji to your Hollo server.</p>
      </hgroup>
      <form method="post" action="/emojis" enctype="multipart/form-data">
        <fieldset class="grid">
          <label>
            Category
            <select
              name="category"
              onchange="this.form.new.disabled = this.value != 'new'"
            >
              <option>None</option>
              <option value="new">New category</option>
              <hr />
              {categories.map(({ category }) => (
                <option value={`category:${category}`}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            New category
            <input type="text" name="new" disabled={true} />
          </label>
        </fieldset>
        <label>
          <span>Short code</span>
          <input
            type="text"
            name="shortcode"
            required
            pattern="^:(-|[a-z0-9_])+:$"
            placeholder=":shortcode:"
          />
        </label>
        <label>
          <span>Image</span>
          <input
            type="file"
            name="image"
            required
            accept="image/png, image/jpeg, image/gif, image/webp"
          />
        </label>
        <button type="submit">Add</button>
      </form>
    </DashboardLayout>,
  );
});

emojis.post("/", async (c) => {
  const disk = drive.use();
  const form = await c.req.formData();
  const categoryValue = form.get("category")?.toString();
  const category = categoryValue?.startsWith("category:")
    ? categoryValue.slice(9)
    : categoryValue === "new"
      ? (form.get("new")?.toString() ?? "")
      : null;
  let shortcode = form.get("shortcode")?.toString();
  if (shortcode == null) {
    return c.text("No shortcode provided", 400);
  }
  if (!/^:(-|[a-z0-9_])+:$/.test(shortcode)) {
    return c.text("Invalid shortcode format", 400);
  }
  shortcode = shortcode.replace(/^:|:$/g, "");
  const image = form.get("image");
  if (image == null || !(image instanceof File)) {
    return c.text("No image provided", 400);
  }
  const content = new Uint8Array(await image.arrayBuffer());
  const extension = mime.getExtension(image.type);
  if (!extension) {
    return c.text("Unsupported image type", 400);
  }
  const path = `emojis/${shortcode}.${extension}`;
  try {
    await disk.put(path, content, {
      contentType: image.type,
      contentLength: content.byteLength,
      visibility: "public",
    });
  } catch (error) {
    logger.error("Failed to store emoji image", {
      error,
      path,
      contentLength: content.byteLength,
    });
    return c.text("Failed to store emoji image", 500);
  }
  const url = await disk.getUrl(path);
  await db.insert(customEmojis).values({
    category,
    shortcode,
    url,
  });
  return c.redirect("/emojis");
});

emojis.post("/delete", async (c) => {
  const form = await c.req.formData();
  const shortcodes = form.getAll("emoji");
  if (shortcodes.length === 0) {
    return c.redirect("/emojis");
  }
  await db.delete(customEmojis).where(
    inArray(
      customEmojis.shortcode,
      shortcodes.map((s) => s.toString()),
    ),
  );
  return c.redirect("/emojis");
});

emojis.get("/import", async (c) => {
  const postList = await db.query.posts.findMany({
    with: { account: true },
    where: ne(posts.emojis, {}),
    orderBy: desc(posts.updated),
    limit: 500,
  });
  const reactionList = await db.query.reactions.findMany({
    with: { account: true },
    where: isNotNull(reactions.customEmoji),
    orderBy: desc(reactions.created),
    limit: 500,
  });
  const accountList = await db.query.accounts.findMany({
    where: ne(accounts.emojis, {}),
    orderBy: desc(accounts.updated),
    limit: 500,
  });
  const customEmojis = await db.query.customEmojis.findMany();
  const customEmojiCodes = new Set<string>();
  const customEmojiUrls = new Set<string>();
  const categories = new Set<string>();
  for (const customEmoji of customEmojis) {
    customEmojiCodes.add(customEmoji.shortcode);
    customEmojiUrls.add(customEmoji.url);
    if (customEmoji.category != null) categories.add(customEmoji.category);
  }
  const emojis: Record<
    string,
    { id: string; shortcode: string; url: string; domain: string }
  > = {};
  for (const post of postList) {
    for (let shortcode in post.emojis) {
      const url = post.emojis[shortcode];
      shortcode = shortcode.replace(/^:|:$/g, "");
      if (customEmojiCodes.has(shortcode)) continue;
      if (customEmojiUrls.has(url)) continue;
      const domain = post.account.handle.replace(/^@?[^@]+@/, "");
      const id = `${shortcode}@${domain}`;
      emojis[id] = {
        id,
        shortcode,
        url,
        domain,
      };
    }
  }
  for (const reaction of reactionList) {
    if (reaction.customEmoji == null) continue;
    const shortcode = reaction.emoji.replace(/^:|:$/g, "");
    if (customEmojiCodes.has(shortcode)) continue;
    if (customEmojiUrls.has(reaction.customEmoji)) continue;
    const domain = reaction.account.handle.replace(/^@?[^@]+@/, "");
    const id = `${shortcode}@${domain}`;
    emojis[id] = {
      id,
      shortcode,
      url: reaction.customEmoji,
      domain,
    };
  }
  for (const account of accountList) {
    for (let shortcode in account.emojis) {
      const url = account.emojis[shortcode];
      shortcode = shortcode.replace(/^:|:$/g, "");
      if (customEmojiCodes.has(shortcode)) continue;
      if (customEmojiUrls.has(url)) continue;
      const domain = account.handle.replace(/^@?[^@]+@/, "");
      const id = `${shortcode}@${domain}`;
      emojis[id] = {
        id,
        shortcode,
        url,
        domain,
      };
    }
  }
  return c.html(
    <DashboardLayout title="Hollo: Import custom emojis" selectedMenu="emojis">
      <hgroup>
        <h1>Import custom emojis</h1>
        <p>You can import custom emojis from your peer servers.</p>
      </hgroup>
      <form method="post">
        <fieldset class="grid emoji-import-filters">
          <label>
            Search shortcode
            <input
              type="search"
              id="emoji-import-search"
              placeholder=":shortcode..."
              autocomplete="off"
            />
          </label>
          <label>
            Domain
            <select id="emoji-import-domain">
              <option value="">All domains</option>
              {[...new Set(Object.values(emojis).map((e) => e.domain))]
                .sort()
                .map((domain) => (
                  <option value={domain}>{domain}</option>
                ))}
            </select>
          </label>
        </fieldset>
        <p class="emoji-import-status">
          <span id="emoji-import-count">
            Showing {Object.keys(emojis).length} of{" "}
            {Object.keys(emojis).length}
          </span>
          <span>
            {" "}
            &middot;{" "}
            <button
              type="button"
              class="secondary emoji-import-bulk"
              id="emoji-import-select-visible"
            >
              Select visible
            </button>{" "}
            <button
              type="button"
              class="secondary emoji-import-bulk"
              id="emoji-import-clear"
            >
              Clear selection
            </button>
          </span>
        </p>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Short code</th>
              <th>Domain</th>
              <th>Image</th>
            </tr>
          </thead>
          <tbody id="emoji-import-rows">
            {Object.values(emojis).map(({ id, shortcode, url, domain }) => (
              <tr data-domain={domain} data-shortcode={shortcode.toLowerCase()}>
                <td>
                  <input
                    type="checkbox"
                    id={id}
                    name="import"
                    value={JSON.stringify({ shortcode, url })}
                  />
                </td>
                <td>
                  <label for={id}>
                    <tt>:{shortcode}:</tt>
                  </label>
                </td>
                <td>
                  <label for={id}>{domain}</label>
                </td>
                <td>
                  <label for={id}>
                    <img
                      src={url}
                      alt={`:${shortcode}:`}
                      style="height: 24px"
                      loading="lazy"
                    />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <fieldset class="grid">
          <label>
            Category
            <select
              name="category"
              onchange="this.form.new.disabled = this.value != 'new'"
            >
              <option>None</option>
              <option value="new">New category</option>
              <hr />
              {[...categories].map((category) => (
                <option value={`category:${category}`}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            New category
            <input type="text" name="new" disabled={true} />
          </label>
        </fieldset>
        <label>
          <input type="checkbox" name="mirror" value="true" checked />
          Mirror emoji images to local storage (recommended — keeps
          the emoji working even if the source instance disappears)
        </label>
        <button type="submit">Import selected custom emojis</button>
      </form>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: client-side filter helper
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const search = document.getElementById('emoji-import-search');
  const dom = document.getElementById('emoji-import-domain');
  const rows = Array.from(
    document.querySelectorAll('#emoji-import-rows tr[data-shortcode]')
  );
  const count = document.getElementById('emoji-import-count');
  const selectVisible = document.getElementById('emoji-import-select-visible');
  const clearSel = document.getElementById('emoji-import-clear');
  const total = rows.length;
  let visibleRows = rows.slice();
  const apply = () => {
    const q = (search.value || '').toLowerCase().trim();
    const d = dom.value;
    visibleRows = [];
    for (const row of rows) {
      const okQ = !q || row.dataset.shortcode.indexOf(q) !== -1;
      const okD = !d || row.dataset.domain === d;
      const show = okQ && okD;
      row.style.display = show ? '' : 'none';
      if (show) visibleRows.push(row);
    }
    count.textContent = 'Showing ' + visibleRows.length + ' of ' + total;
  };
  search.addEventListener('input', apply);
  dom.addEventListener('change', apply);
  selectVisible.addEventListener('click', () => {
    for (const row of visibleRows) {
      const cb = row.querySelector('input[type=checkbox]');
      if (cb) cb.checked = true;
    }
  });
  clearSel.addEventListener('click', () => {
    for (const row of rows) {
      const cb = row.querySelector('input[type=checkbox]');
      if (cb) cb.checked = false;
    }
  });
  apply();
})();`,
        }}
      />
    </DashboardLayout>,
  );
});

emojis.post("/import", async (c) => {
  const disk = drive.use();
  const form = await c.req.formData();
  const categoryValue = form.get("category")?.toString();
  const category = categoryValue?.startsWith("category:")
    ? categoryValue.slice(9)
    : categoryValue === "new"
      ? (form.get("new")?.toString() ?? "")
      : null;
  const mirror = form.get("mirror") === "true";
  const imports = form.getAll("import").map((i) => JSON.parse(i.toString()));
  for (const { shortcode, url } of imports) {
    let finalUrl: string = url;
    if (mirror) {
      try {
        const localUrl = await mirrorEmojiImage(disk, shortcode, url);
        if (localUrl != null) finalUrl = localUrl;
      } catch (error) {
        logger.warning(
          "Failed to mirror emoji {shortcode} from {url}: {error} — keeping remote URL.",
          { shortcode, url, error },
        );
      }
    }
    try {
      await db
        .insert(customEmojis)
        .values({ category, shortcode, url: finalUrl });
    } catch (error) {
      logger.error(
        "Failed to import emoji {shortcode} to {category}: {error}",
        { category, shortcode, error },
      );
    }
  }
  return c.redirect("/emojis");
});

const ALLOWED_EMOJI_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_EMOJI_BYTES = 1024 * 1024; // 1 MB

async function mirrorEmojiImage(
  disk: ReturnType<typeof drive.use>,
  shortcode: string,
  remoteUrl: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(remoteUrl, {
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    logger.warning(
      "Emoji mirror skipped: status {status} from {url}",
      { status: response.status, url: remoteUrl },
    );
    return null;
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!ALLOWED_EMOJI_MIME.has(contentType)) {
    logger.warning(
      "Emoji mirror skipped: unsupported content type {contentType} for {url}",
      { contentType, url: remoteUrl },
    );
    return null;
  }
  const extension = mime.getExtension(contentType);
  if (extension == null) return null;
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_EMOJI_BYTES) {
    logger.warning(
      "Emoji mirror skipped: size {bytes}B out of range for {url}",
      { bytes: buffer.byteLength, url: remoteUrl },
    );
    return null;
  }
  const path = `emojis/${shortcode}.${extension}`;
  await disk.put(path, buffer, {
    contentType,
    contentLength: buffer.byteLength,
    visibility: "public",
  });
  return await disk.getUrl(path);
}

export default emojis;
