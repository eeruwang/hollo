import { and, eq, isNull, or, gt } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import {
  scopeRequired,
  tokenRequired,
  type Variables,
} from "../../oauth/middleware";
import {
  type FilterContext,
  filterKeywords,
  filters,
} from "../../schema";
import { uuidv7 } from "../../uuid";

const app = new Hono<{ Variables: Variables }>();

function serializeFilter(
  filter: typeof filters.$inferSelect & {
    keywords: (typeof filterKeywords.$inferSelect)[];
  },
) {
  return {
    id: filter.id,
    title: filter.title,
    context: filter.context as FilterContext[],
    expires_at: filter.expiresAt?.toISOString() ?? null,
    filter_action: filter.filterAction,
    keywords: filter.keywords.map((kw) => ({
      id: kw.id,
      keyword: kw.keyword,
      whole_word: kw.wholeWord,
    })),
    statuses: [],
  };
}

// GET /api/v2/filters — List all filters
app.get(
  "/",
  tokenRequired,
  scopeRequired(["read:filters"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }

    const result = await db.query.filters.findMany({
      where: and(
        eq(filters.accountOwnerId, owner.id),
        or(
          isNull(filters.expiresAt),
          gt(filters.expiresAt, new Date()),
        ),
      ),
      with: { keywords: true },
    });

    return c.json(result.map(serializeFilter));
  },
);

// GET /api/v2/filters/:id — Get a single filter
app.get(
  "/:id",
  tokenRequired,
  scopeRequired(["read:filters"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }

    const filter = await db.query.filters.findFirst({
      where: and(
        eq(filters.id, c.req.param("id")),
        eq(filters.accountOwnerId, owner.id),
      ),
      with: { keywords: true },
    });

    if (filter == null) return c.json({ error: "Not found" }, 404);
    return c.json(serializeFilter(filter));
  },
);

// POST /api/v2/filters — Create a filter
app.post(
  "/",
  tokenRequired,
  scopeRequired(["write:filters"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }

    const body = await c.req.json();
    const title = body.title;
    const context = body.context as FilterContext[];
    const filterAction = body.filter_action ?? "warn";
    const expiresIn = body.expires_in
      ? Number(body.expires_in)
      : null;
    const keywordsData = body.keywords_attributes ?? [];

    const filterId = uuidv7();
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    await db.insert(filters).values({
      id: filterId,
      accountOwnerId: owner.id,
      title,
      context,
      filterAction,
      expiresAt,
    });

    for (const kw of keywordsData) {
      await db.insert(filterKeywords).values({
        id: uuidv7(),
        filterId,
        keyword: kw.keyword,
        wholeWord: kw.whole_word ?? false,
      });
    }

    const filter = await db.query.filters.findFirst({
      where: eq(filters.id, filterId),
      with: { keywords: true },
    });

    return c.json(serializeFilter(filter!), 200);
  },
);

// PUT /api/v2/filters/:id — Update a filter
app.put(
  "/:id",
  tokenRequired,
  scopeRequired(["write:filters"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }

    const filterId = c.req.param("id");
    const existing = await db.query.filters.findFirst({
      where: and(
        eq(filters.id, filterId),
        eq(filters.accountOwnerId, owner.id),
      ),
    });
    if (existing == null) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json();
    const expiresIn = body.expires_in
      ? Number(body.expires_in)
      : undefined;
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;

    await db
      .update(filters)
      .set({
        ...(body.title != null ? { title: body.title } : {}),
        ...(body.context != null ? { context: body.context } : {}),
        ...(body.filter_action != null
          ? { filterAction: body.filter_action }
          : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      })
      .where(eq(filters.id, filterId));

    // Handle keywords_attributes updates
    if (body.keywords_attributes != null) {
      for (const kw of body.keywords_attributes) {
        if (kw._destroy) {
          await db
            .delete(filterKeywords)
            .where(eq(filterKeywords.id, kw.id));
        } else if (kw.id) {
          await db
            .update(filterKeywords)
            .set({
              keyword: kw.keyword,
              wholeWord: kw.whole_word ?? false,
            })
            .where(eq(filterKeywords.id, kw.id));
        } else {
          await db.insert(filterKeywords).values({
            id: uuidv7(),
            filterId,
            keyword: kw.keyword,
            wholeWord: kw.whole_word ?? false,
          });
        }
      }
    }

    const filter = await db.query.filters.findFirst({
      where: eq(filters.id, filterId),
      with: { keywords: true },
    });

    return c.json(serializeFilter(filter!));
  },
);

// DELETE /api/v2/filters/:id — Delete a filter
app.delete(
  "/:id",
  tokenRequired,
  scopeRequired(["write:filters"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }

    const result = await db
      .delete(filters)
      .where(
        and(
          eq(filters.id, c.req.param("id")),
          eq(filters.accountOwnerId, owner.id),
        ),
      )
      .returning();

    if (result.length === 0) return c.json({ error: "Not found" }, 404);
    return c.json({});
  },
);

export default app;
