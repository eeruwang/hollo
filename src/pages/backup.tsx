import { Buffer } from "node:buffer";
import { getLogger } from "@logtape/logtape";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import { loginRequired } from "../login.ts";
import {
  accountOwners,
  follows,
  likes,
  media,
  posts,
  reactions,
  bookmarks,
  blocks,
  mutes,
  customEmojis,
  filters,
  filterKeywords,
  webhooks,
} from "../schema.ts";
import { drive } from "../storage.ts";

const logger = getLogger(["hollo", "backup"]);

const backup = new Hono();

backup.use(loginRequired);

backup.get("/", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.redirect("/accounts");

  const postCount = await db.query.posts.findMany({
    where: eq(posts.accountId, owner.id),
    columns: { id: true },
  });

  return c.html(
    <DashboardLayout
      title="Backup — Hollo"
      selectedMenu="accounts"
      themeColor={owner.themeColor}
    >
      <hgroup>
        <h1>Backup</h1>
        <p>Export your data for archival or migration.</p>
      </hgroup>

      <h2>Archive Backup</h2>
      <p>
        Download your posts as human-readable JSON. Includes post content,
        timestamps, media URLs, and metadata.
        Currently {postCount.length} posts.
      </p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <a role="button" href="/backup/archive/json">
          Download as JSON
        </a>
        <a role="button" href="/backup/archive/markdown" class="secondary">
          Download as Markdown
        </a>
      </div>

      <h2>Hollo Backup</h2>
      <p>
        Full database export for migrating to another Hollo instance.
        Includes posts, followers, likes, reactions, filters, webhooks,
        and account settings.
      </p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <a role="button" href="/backup/full">
          Download Full Backup (JSON)
        </a>
        <a role="button" href="/backup/full-with-media" class="secondary">
          Download with Media (large file)
        </a>
      </div>
      <small>
        Media backup includes all images as base64 data.
        This may take a while and produce a large file.
      </small>
    </DashboardLayout>,
  );
});

// Helper: read media file as base64
async function readMediaBase64(
  url: string,
): Promise<{ data: string; type: string } | null> {
  try {
    const urlObj = new URL(url);
    const key = urlObj.pathname.replace(/^\/assets\//, "");
    const disk = drive.use();
    const bytes = await disk.getBytes(key);
    const ext = key.split(".").pop()?.toLowerCase() ?? "bin";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      webm: "video/webm",
    };
    return {
      data: Buffer.from(bytes).toString("base64"),
      type: mimeMap[ext] ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

// Archive backup — JSON (with media)
backup.get("/archive/json", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.json({ error: "No account" }, 404);

  const allPosts = await db.query.posts.findMany({
    where: eq(posts.accountId, owner.id),
    with: {
      media: true,
      poll: { with: { options: true } },
      reactions: true,
      replyTarget: { with: { account: true } },
    },
    orderBy: [desc(posts.published)],
  });

  // Read all media files
  const mediaCache = new Map<string, { data: string; type: string }>();
  for (const post of allPosts) {
    for (const m of post.media) {
      if (!mediaCache.has(m.url)) {
        const result = await readMediaBase64(m.url);
        if (result) mediaCache.set(m.url, result);
      }
    }
  }

  const archive = {
    exported_at: new Date().toISOString(),
    account: {
      handle: owner.account.handle,
      name: owner.account.name,
      bio: owner.account.bioHtml,
      avatar: owner.account.avatarUrl,
      cover: owner.account.coverUrl,
    },
    posts_count: allPosts.length,
    media_count: mediaCache.size,
    posts: allPosts.map((post) => ({
      id: post.id,
      type: post.type,
      content: post.content,
      content_html: post.contentHtml,
      summary: post.summary,
      visibility: post.visibility,
      language: post.language,
      published: post.published?.toISOString(),
      updated: post.updated?.toISOString(),
      url: post.url ?? post.iri,
      tags: post.tags,
      media: post.media.map((m) => {
        const cached = mediaCache.get(m.url);
        return {
          url: m.url,
          description: m.description,
          width: m.width,
          height: m.height,
          data: cached?.data ?? null,
          data_type: cached?.type ?? null,
        };
      }),
      poll: post.poll
        ? {
            options: post.poll.options.map((o) => ({
              title: o.title,
              votes: o.votesCount,
            })),
            multiple: post.poll.multiple,
            expires: post.poll.expires?.toISOString(),
          }
        : null,
      reactions: post.reactions.map((r) => ({
        emoji: r.emoji,
        count: 1,
      })),
      likes_count: post.likesCount,
      shares_count: post.sharesCount,
      replies_count: post.repliesCount,
      reply_to: post.replyTarget
        ? {
            url: post.replyTarget.url ?? post.replyTarget.iri,
            author: post.replyTarget.account?.handle,
          }
        : null,
    })),
  };

  const filename = `hollo-archive-${new Date().toISOString().slice(0, 10)}.json`;
  return c.json(archive, 200, {
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

// Archive backup — Markdown (with embedded images as data URIs)
backup.get("/archive/markdown", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.text("No account", 404);

  const allPosts = await db.query.posts.findMany({
    where: eq(posts.accountId, owner.id),
    with: {
      media: true,
      replyTarget: { with: { account: true } },
    },
    orderBy: [desc(posts.published)],
  });

  // Pre-load all media
  const mediaCache = new Map<string, { data: string; type: string }>();
  for (const post of allPosts) {
    for (const m of post.media) {
      if (!mediaCache.has(m.url)) {
        const result = await readMediaBase64(m.url);
        if (result) mediaCache.set(m.url, result);
      }
    }
  }

  let md = `# ${owner.account.name} — Hollo Archive\n\n`;
  md += `Exported: ${new Date().toISOString()}\n`;
  md += `Handle: ${owner.account.handle}\n`;
  md += `Total posts: ${allPosts.length}\n`;
  md += `Total media: ${mediaCache.size}\n\n---\n\n`;

  for (const post of allPosts) {
    const date = post.published ?? post.updated;
    md += `## ${date?.toISOString().slice(0, 16).replace("T", " ")}\n\n`;

    if (post.summary) {
      md += `> **CW:** ${post.summary}\n\n`;
    }

    md += `${post.content ?? ""}\n\n`;

    if (post.media.length > 0) {
      for (const m of post.media) {
        const cached = mediaCache.get(m.url);
        if (cached) {
          md += `![${m.description ?? ""}](data:${cached.type};base64,${cached.data})\n\n`;
        } else {
          md += `![${m.description ?? ""}](${m.url})\n\n`;
        }
      }
    }

    if (post.replyTarget) {
      md += `*Reply to ${post.replyTarget.account?.handle ?? "unknown"}*\n\n`;
    }

    md += `Visibility: ${post.visibility} | Likes: ${post.likesCount ?? 0} | Shares: ${post.sharesCount ?? 0}\n`;
    md += `URL: ${post.url ?? post.iri}\n\n`;
    md += `---\n\n`;
  }

  const filename = `hollo-archive-${new Date().toISOString().slice(0, 10)}.md`;
  return c.text(md, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

// Full Hollo backup — JSON
backup.get("/full", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.json({ error: "No account" }, 404);

  const [
    allPosts,
    allFollows,
    allLikes,
    allReactions,
    allBookmarks,
    allBlocks,
    allMutes,
    allEmojis,
    allFilters,
    allWebhooks,
  ] = await Promise.all([
    db.query.posts.findMany({
      where: eq(posts.accountId, owner.id),
      with: {
        media: true,
        poll: { with: { options: true } },
        reactions: true,
        mentions: true,
      },
      orderBy: [desc(posts.published)],
    }),
    db.query.follows.findMany({
      where: eq(follows.followingId, owner.id),
      with: { follower: true },
    }),
    db.query.likes.findMany({
      with: { post: true, account: true },
    }),
    db.query.reactions.findMany(),
    db.query.bookmarks.findMany({
      where: eq(bookmarks.accountOwnerId, owner.id),
    }),
    db.query.blocks.findMany({
      where: eq(blocks.accountId, owner.id),
    }),
    db.query.mutes.findMany({
      where: eq(mutes.accountId, owner.id),
    }),
    db.query.customEmojis.findMany(),
    db.query.filters.findMany({
      where: eq(filters.accountOwnerId, owner.id),
      with: { keywords: true },
    }),
    db.query.webhooks.findMany({
      where: eq(webhooks.accountOwnerId, owner.id),
    }),
  ]);

  const fullBackup = {
    version: "1.0",
    type: "hollo-backup",
    exported_at: new Date().toISOString(),
    account: {
      id: owner.id,
      handle: owner.account.handle,
      name: owner.account.name,
      bio: owner.account.bioHtml,
      language: owner.account.language,
      visibility: owner.visibility,
      themeColor: owner.themeColor,
      avatarUrl: owner.account.avatarUrl,
      coverUrl: owner.account.coverUrl,
      fields: owner.account.fieldHtmls,
    },
    posts: allPosts,
    follows: allFollows.map((f) => ({
      followerHandle: f.follower.handle,
      approved: f.approved?.toISOString(),
      created: f.created.toISOString(),
    })),
    likes: allLikes.length,
    reactions: allReactions.length,
    bookmarks: allBookmarks.length,
    blocks: allBlocks.length,
    mutes: allMutes.length,
    custom_emojis: allEmojis.map((e) => ({
      shortcode: e.shortcode,
      url: e.url,
      category: e.category,
    })),
    filters: allFilters.map((f) => ({
      title: f.title,
      context: f.context,
      action: f.filterAction,
      keywords: f.keywords.map((kw) => ({
        keyword: kw.keyword,
        whole_word: kw.wholeWord,
      })),
    })),
    webhooks: allWebhooks.map((w) => ({
      url: w.url,
      events: w.events,
      active: w.active,
    })),
  };

  const filename = `hollo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return c.json(fullBackup, 200, {
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

// Full backup with media files
backup.get("/full-with-media", async (c) => {
  const owner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (owner == null) return c.json({ error: "No account" }, 404);

  const allPosts = await db.query.posts.findMany({
    where: eq(posts.accountId, owner.id),
    with: {
      media: true,
      poll: { with: { options: true } },
      reactions: true,
      mentions: true,
    },
    orderBy: [desc(posts.published)],
  });

  // Collect all media from posts
  const allMedia = allPosts.flatMap((post) => post.media);

  // Download media files and encode as base64
  const disk = drive.use();
  const mediaFiles: Record<
    string,
    { type: string; filename: string; data: string }
  > = {};

  for (const m of allMedia) {
    try {
      // Extract the storage key from the URL (part after /assets/)
      const urlObj = new URL(m.url);
      const key = urlObj.pathname.replace(/^\/assets\//, "");
      const bytes = await disk.getBytes(key);
      mediaFiles[m.id] = {
        type: m.type,
        filename: key,
        data: Buffer.from(bytes).toString("base64"),
      };
      // Also get thumbnail
      if (m.thumbnailUrl && m.thumbnailUrl !== m.url) {
        const thumbUrl = new URL(m.thumbnailUrl);
        const thumbKey = thumbUrl.pathname.replace(/^\/assets\//, "");
        try {
          const thumbBytes = await disk.getBytes(thumbKey);
          mediaFiles[`${m.id}_thumb`] = {
            type: m.thumbnailType,
            filename: thumbKey,
            data: Buffer.from(thumbBytes).toString("base64"),
          };
        } catch {
          // Thumbnail might not exist separately
        }
      }
    } catch (error) {
      logger.warn("Failed to read media {id}: {error}", {
        id: m.id,
        error,
      });
    }
  }

  // Also backup avatar and cover if they exist
  const avatarUrl = owner.account.avatarUrl;
  const coverUrl = owner.account.coverUrl;
  for (const [label, url] of [
    ["avatar", avatarUrl],
    ["cover", coverUrl],
  ] as const) {
    if (url) {
      try {
        const urlObj = new URL(url);
        const key = urlObj.pathname.replace(/^\/assets\//, "");
        const bytes = await disk.getBytes(key);
        mediaFiles[label] = {
          type: "image",
          filename: key,
          data: Buffer.from(bytes).toString("base64"),
        };
      } catch {
        // External URL or missing file
      }
    }
  }

  const fullBackup = {
    version: "1.0",
    type: "hollo-backup-with-media",
    exported_at: new Date().toISOString(),
    account: {
      id: owner.id,
      handle: owner.account.handle,
      name: owner.account.name,
      bio: owner.account.bioHtml,
      language: owner.account.language,
      visibility: owner.visibility,
      themeColor: owner.themeColor,
      avatarUrl: owner.account.avatarUrl,
      coverUrl: owner.account.coverUrl,
      fields: owner.account.fieldHtmls,
    },
    posts: allPosts,
    media_files: mediaFiles,
    media_count: Object.keys(mediaFiles).length,
  };

  const filename = `hollo-backup-media-${new Date().toISOString().slice(0, 10)}.json`;
  return c.json(fullBackup, 200, {
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

export default backup;
