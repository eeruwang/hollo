import { getLogger } from "@logtape/logtape";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { alias, union } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { db } from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { getPostRelations, serializePost } from "../../entities/status";
import {
  scopeRequired,
  tokenRequired,
  type Variables,
} from "../../oauth/middleware";
import {
  accounts,
  blocks,
  follows,
  likes,
  mentions,
  mutes,
  polls,
  pollVotes,
  posts,
  reactions,
} from "../../schema";
import type { Uuid } from "../../uuid";

const logger = getLogger(["hollo", "v2", "notifications"]);

type NotificationType =
  | "mention"
  | "status"
  | "reblog"
  | "follow"
  | "follow_request"
  | "favourite"
  | "emoji_reaction"
  | "poll"
  | "update"
  | "admin.sign_up"
  | "admin.report";

const GROUPABLE_TYPES: NotificationType[] = [
  "favourite",
  "reblog",
  "follow",
  "emoji_reaction",
];

const app = new Hono<{ Variables: Variables }>();

app.get(
  "/",
  tokenRequired,
  scopeRequired(["read:notifications"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    let types = c.req.queries("types[]") as NotificationType[];
    const excludeTypes = c.req.queries(
      "exclude_types[]",
    ) as NotificationType[];
    const olderThanStr = c.req.query("older_than");
    const olderThan = olderThanStr == null ? null : new Date(olderThanStr);
    const limit = Number.parseInt(c.req.query("limit") ?? "40", 10);
    if (types == null || types.length < 1) {
      types = [
        "mention",
        "status",
        "reblog",
        "follow",
        "follow_request",
        "favourite",
        "emoji_reaction",
        "poll",
        "update",
        "admin.sign_up",
        "admin.report",
      ];
    }
    types = types.filter((t) => !excludeTypes?.includes(t));

    // Reuse v1 query structure
    const sharingPosts = alias(posts, "sharingPosts");
    const muteFilter = (accountId: ReturnType<typeof eq>) =>
      notInArray(
        accountId,
        db
          .select({ accountId: mutes.mutedAccountId })
          .from(mutes)
          .where(
            and(
              eq(mutes.accountId, owner.id),
              or(
                isNull(mutes.duration),
                gt(
                  sql`${mutes.created} + ${mutes.duration}`,
                  sql`CURRENT_TIMESTAMP`,
                ),
              ),
            ),
          ),
      );
    const blockFilter = (accountIdCol: ReturnType<typeof eq>) => [
      notInArray(
        accountIdCol,
        db
          .select({ accountId: blocks.blockedAccountId })
          .from(blocks)
          .where(eq(blocks.accountId, owner.id)),
      ),
      notInArray(
        accountIdCol,
        db
          .select({ accountId: blocks.accountId })
          .from(blocks)
          .where(eq(blocks.blockedAccountId, owner.id)),
      ),
    ];

    const fetchLimit = limit * 3; // fetch more to allow grouping
    const queries = {
      mention: db
        .select({
          id: sql`${posts.id}::text`,
          type: sql<NotificationType>`'mention'`,
          created: sql<Date>`coalesce(${posts.published}, ${posts.updated})`,
          accountId: posts.accountId,
          postId: sql<Uuid | null>`${posts.id}`,
          emoji: sql<string | null>`null`,
          customEmoji: sql<string | null>`null`,
        })
        .from(posts)
        .where(
          and(
            or(
              inArray(
                posts.replyTargetId,
                db
                  .select({ postId: posts.id })
                  .from(posts)
                  .where(eq(posts.accountId, owner.id)),
              ),
              inArray(
                posts.id,
                db
                  .select({ postId: mentions.postId })
                  .from(mentions)
                  .where(eq(mentions.accountId, owner.id)),
              ),
            ),
            olderThan == null ? undefined : lt(posts.published, olderThan),
            ne(posts.accountId, owner.id),
            muteFilter(posts.accountId),
            ...blockFilter(posts.accountId),
          ),
        )
        .orderBy(desc(posts.published))
        .limit(fetchLimit),
      reblog: db
        .select({
          id: sql`${posts.id}::text`,
          type: sql<NotificationType>`'reblog'`,
          created: sql<Date>`coalesce(${posts.published}, ${posts.updated})`,
          accountId: posts.accountId,
          postId: sql<Uuid | null>`${sharingPosts.id}`,
          emoji: sql<string | null>`null`,
          customEmoji: sql<string | null>`null`,
        })
        .from(posts)
        .leftJoin(sharingPosts, eq(posts.sharingId, sharingPosts.id))
        .where(
          and(
            eq(sharingPosts.accountId, owner.id),
            olderThan == null ? undefined : lt(posts.published, olderThan),
            ne(posts.accountId, owner.id),
            muteFilter(posts.accountId),
            ...blockFilter(posts.accountId),
          ),
        )
        .orderBy(desc(posts.published))
        .limit(fetchLimit),
      follow: db
        .select({
          id: sql<string>`${follows.followerId}::text`,
          type: sql<NotificationType>`'follow'`,
          created: sql<Date>`${follows.approved}`,
          accountId: follows.followerId,
          postId: sql<Uuid | null>`null::uuid`,
          emoji: sql<string | null>`null`,
          customEmoji: sql<string | null>`null`,
        })
        .from(follows)
        .where(
          and(
            eq(follows.followingId, owner.id),
            isNotNull(follows.approved),
            olderThan == null ? undefined : lt(follows.approved, olderThan),
            muteFilter(follows.followerId),
            ...blockFilter(follows.followerId),
          ),
        )
        .orderBy(desc(follows.approved))
        .limit(fetchLimit),
      follow_request: db
        .select({
          id: sql<string>`${follows.followerId}::text`,
          type: sql<NotificationType>`'follow_request'`,
          created: follows.created,
          accountId: follows.followerId,
          postId: sql<Uuid | null>`null::uuid`,
          emoji: sql<string | null>`null`,
          customEmoji: sql<string | null>`null`,
        })
        .from(follows)
        .where(
          and(
            eq(follows.followingId, owner.id),
            isNull(follows.approved),
            olderThan == null ? undefined : lt(follows.created, olderThan),
            muteFilter(follows.followerId),
            ...blockFilter(follows.followerId),
          ),
        )
        .orderBy(desc(follows.created))
        .limit(fetchLimit),
      favourite: db
        .select({
          id: sql<string>`${likes.postId} || ':' || ${likes.accountId}`,
          type: sql<NotificationType>`'favourite'`,
          created: likes.created,
          accountId: likes.accountId,
          postId: sql<Uuid | null>`${likes.postId}`,
          emoji: sql<string | null>`null`,
          customEmoji: sql<string | null>`null`,
        })
        .from(likes)
        .leftJoin(posts, eq(likes.postId, posts.id))
        .where(
          and(
            eq(posts.accountId, owner.id),
            olderThan == null ? undefined : lt(likes.created, olderThan),
            ne(likes.accountId, owner.id),
            muteFilter(likes.accountId),
            ...blockFilter(likes.accountId),
          ),
        )
        .orderBy(desc(likes.created))
        .limit(fetchLimit),
      emoji_reaction: db
        .select({
          id: sql<string>`${reactions.postId} || ':' || ${reactions.accountId} || ':' || ${reactions.emoji}`,
          type: sql<NotificationType>`'emoji_reaction'`,
          created: reactions.created,
          accountId: reactions.accountId,
          postId: sql<Uuid | null>`${reactions.postId}`,
          emoji: sql<string | null>`${reactions.emoji}`,
          customEmoji: sql<string | null>`${reactions.customEmoji}`,
        })
        .from(reactions)
        .leftJoin(posts, eq(reactions.postId, posts.id))
        .where(
          and(
            eq(posts.accountId, owner.id),
            olderThan == null ? undefined : lt(reactions.created, olderThan),
            ne(reactions.accountId, owner.id),
            muteFilter(reactions.accountId),
            ...blockFilter(reactions.accountId),
          ),
        )
        .orderBy(desc(reactions.created))
        .limit(fetchLimit),
      poll: db
        .select({
          id: sql<string>`${polls.id}::text`,
          type: sql<NotificationType>`'poll'`,
          created: polls.expires,
          accountId: posts.accountId,
          postId: posts.id,
          emoji: sql<string | null>`null`,
          customEmoji: sql<string | null>`null`,
        })
        .from(polls)
        .leftJoin(posts, eq(polls.id, posts.pollId))
        .where(
          and(
            or(
              inArray(
                polls.id,
                db
                  .select({ id: posts.pollId })
                  .from(posts)
                  .where(eq(posts.accountId, owner.id)),
              ),
              inArray(
                polls.id,
                db
                  .select({ id: pollVotes.pollId })
                  .from(pollVotes)
                  .where(eq(pollVotes.accountId, owner.id)),
              ),
            ),
            lte(polls.expires, sql`current_timestamp`),
            olderThan == null ? undefined : lt(polls.expires, olderThan),
            ne(posts.accountId, owner.id),
            muteFilter(posts.accountId),
            ...blockFilter(posts.accountId),
          ),
        )
        .orderBy(desc(polls.expires))
        .limit(fetchLimit),
    };

    const qs = Object.entries(queries)
      .filter(([t]) => types.includes(t as NotificationType))
      .map(([, q]) => q);
    if (qs.length < 1) {
      return c.json({
        notification_groups: [],
        accounts: [],
        statuses: [],
      });
    }
    // biome-ignore lint/suspicious/noExplicitAny: union requires any
    let q: any = qs[0];
    for (let i = 1; i < qs.length; i++) {
      // biome-ignore lint/suspicious/noExplicitAny: union requires any
      q = union(q, qs[i] as any);
    }
    const notifications = (await db
      .select({
        id: sql<string>`q.id`,
        type: sql<NotificationType>`q."type"`,
        created: sql<Date>`q.created`,
        accountId: sql<Uuid>`q.accountId`,
        postId: sql<Uuid | null>`q.postId`,
        emoji: sql<string | null>`q.emoji`,
        customEmoji: sql<string | null>`q.customEmoji`,
      })
      .from(
        sql`${q} AS q (id, "type", created, accountId, postId, emoji, customEmoji)`,
      )
      .orderBy(desc(sql`q.created`))
      .limit(fetchLimit)) as {
      id: Uuid;
      type: NotificationType;
      created: Date | string;
      accountId: Uuid;
      postId: Uuid | null;
      emoji: string | null;
      customEmoji: string | null;
    }[];

    // Group notifications: same type + same postId (for groupable types)
    interface NotificationGroup {
      group_key: string;
      type: NotificationType;
      most_recent_notification_id: string;
      latest_page_notification_at: string;
      sample_account_ids: Uuid[];
      status_id: Uuid | null;
      notifications_count: number;
    }

    const groupMap = new Map<string, NotificationGroup>();
    for (const n of notifications) {
      const createdAt =
        n.created instanceof Date
          ? n.created.toISOString()
          : new Date(n.created).toISOString();
      const notifId = `${createdAt}/${n.type}/${n.id}`;

      let groupKey: string;
      if (GROUPABLE_TYPES.includes(n.type) && n.postId != null) {
        groupKey = `${n.type}:${n.postId}`;
      } else if (n.type === "follow" || n.type === "follow_request") {
        groupKey = n.type;
      } else {
        groupKey = `${n.type}:${notifId}`;
      }

      const existing = groupMap.get(groupKey);
      if (existing != null) {
        existing.notifications_count++;
        if (!existing.sample_account_ids.includes(n.accountId)) {
          existing.sample_account_ids.push(n.accountId);
        }
      } else {
        groupMap.set(groupKey, {
          group_key: groupKey,
          type: n.type,
          most_recent_notification_id: notifId,
          latest_page_notification_at: createdAt,
          sample_account_ids: [n.accountId],
          status_id: n.postId,
          notifications_count: 1,
        });
      }
    }

    const groups = [...groupMap.values()].slice(0, limit);

    // Collect unique account IDs and post IDs
    const allAccountIds = [
      ...new Set(groups.flatMap((g) => g.sample_account_ids)),
    ];
    const allPostIds = [
      ...new Set(
        groups.filter((g) => g.status_id != null).map((g) => g.status_id!),
      ),
    ];

    const accountMap = Object.fromEntries(
      (allAccountIds.length > 0
        ? await db.query.accounts.findMany({
            where: inArray(accounts.id, allAccountIds),
            with: { owner: true, successor: true },
          })
        : []
      ).map((a) => [a.id, a]),
    );
    const postMap = Object.fromEntries(
      (allPostIds.length > 0
        ? await db.query.posts.findMany({
            where: inArray(posts.id, allPostIds),
            with: getPostRelations(owner.id),
          })
        : []
      ).map((p) => [p.id, p]),
    );

    // Pagination
    let nextLink: URL | null = null;
    if (notifications.length >= limit) {
      const oldest = notifications[notifications.length - 1].created;
      nextLink = new URL(c.req.url);
      nextLink.searchParams.set(
        "older_than",
        oldest instanceof Date ? oldest.toISOString() : oldest,
      );
    }

    return c.json(
      {
        notification_groups: groups.map((g) => ({
          group_key: g.group_key,
          notifications_count: g.notifications_count,
          type: g.type,
          most_recent_notification_id: g.most_recent_notification_id,
          page_min_id: g.most_recent_notification_id,
          page_max_id: g.most_recent_notification_id,
          latest_page_notification_at: g.latest_page_notification_at,
          sample_account_ids: g.sample_account_ids.map(String),
          status_id: g.status_id ? String(g.status_id) : null,
        })),
        accounts: Object.values(accountMap).map((a) =>
          a.owner == null
            ? serializeAccount(a, c.req.url)
            : serializeAccountOwner(
                { ...a.owner, account: a },
                c.req.url,
              ),
        ),
        statuses: Object.values(postMap).map((p) =>
          serializePost(p, owner, c.req.url),
        ),
      },
      {
        headers:
          nextLink == null ? {} : { Link: `<${nextLink.href}>; rel="next"` },
      },
    );
  },
);

// Unread count endpoint
app.get(
  "/unread_count",
  tokenRequired,
  scopeRequired(["read:notifications"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    // Return count of recent notifications (last 24 hours)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const mentionCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(posts)
      .where(
        and(
          or(
            inArray(
              posts.replyTargetId,
              db
                .select({ postId: posts.id })
                .from(posts)
                .where(eq(posts.accountId, owner.id)),
            ),
            inArray(
              posts.id,
              db
                .select({ postId: mentions.postId })
                .from(mentions)
                .where(eq(mentions.accountId, owner.id)),
            ),
          ),
          gt(posts.published, since),
          ne(posts.accountId, owner.id),
        ),
      );
    const likeCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(likes)
      .leftJoin(posts, eq(likes.postId, posts.id))
      .where(
        and(
          eq(posts.accountId, owner.id),
          gt(likes.created, since),
          ne(likes.accountId, owner.id),
        ),
      );
    const followCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(
        and(
          eq(follows.followingId, owner.id),
          isNotNull(follows.approved),
          gt(follows.approved, since),
        ),
      );
    const total =
      Number(mentionCount[0]?.count ?? 0) +
      Number(likeCount[0]?.count ?? 0) +
      Number(followCount[0]?.count ?? 0);
    return c.json({ count: total });
  },
);

export default app;
