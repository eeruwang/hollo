import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { Layout } from "../../components/Layout.tsx";
import { Profile } from "../../components/Profile.tsx";
import db from "../../db.ts";
import {
  type Account,
  type AccountOwner,
  accountOwners,
  type Medium,
  type Poll,
  type PollOption,
  type Post,
  posts,
} from "../../schema.ts";
import { renderCustomEmojis } from "../../text.ts";
import { isUuid } from "../../uuid.ts";

const profilePost = new Hono();

type ThreadPost = Post & {
  account: Account;
  media: Medium[];
  poll: (Poll & { options: PollOption[] }) | null;
};

profilePost.get<"/:handle{@[^/]+}/:id{[-a-f0-9]+}">(async (c) => {
  let handle = c.req.param("handle");
  const postId = c.req.param("id");
  if (!isUuid(postId)) return c.notFound();
  if (handle.startsWith("@")) handle = handle.substring(1);
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();

  // Fetch all user posts so we can flatten this post's full
  // descendant tree (replies of replies, etc.).
  const allUserPosts = await db.query.posts.findMany({
    where: and(
      eq(posts.accountId, accountOwner.id),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
    ),
    orderBy: desc(posts.id),
    with: {
      account: true,
      media: true,
      poll: { with: { options: true } },
    },
  });

  const root = allUserPosts.find((p) => p.id === postId);
  if (root == null) return c.notFound();

  // Build parent → children map, sort children chronologically
  const childrenMap = new Map<string, ThreadPost[]>();
  for (const p of allUserPosts) {
    if (p.replyTargetId != null) {
      const bucket = childrenMap.get(p.replyTargetId) ?? [];
      bucket.push(p);
      childrenMap.set(p.replyTargetId, bucket);
    }
  }
  for (const bucket of childrenMap.values()) {
    bucket.sort((a, b) => a.id.localeCompare(b.id));
  }

  // DFS flatten descendants (chronological at each level)
  const descendants: ThreadPost[] = [];
  const walk = (node: ThreadPost) => {
    const kids = childrenMap.get(node.id) ?? [];
    for (const kid of kids) {
      descendants.push(kid);
      walk(kid);
    }
  };
  walk(root);

  return c.html(
    <PostPage
      root={root}
      descendants={descendants}
      accountOwner={accountOwner}
    />,
  );
});

interface PostPageProps {
  readonly accountOwner: AccountOwner & { account: Account };
  readonly root: ThreadPost;
  readonly descendants: ThreadPost[];
}

function PostPage({ root, descendants, accountOwner }: PostPageProps) {
  const publishedAt = root.published ?? root.updated;
  const thread: ThreadPost[] = [root, ...descendants];
  const { title, bodyHtml } = deriveTitleAndBody(root);
  const rootBodyHtml = renderCustomEmojis(bodyHtml, root.emojis);
  const metaTitle =
    title ??
    ((root.content ?? "").length > 30
      ? `${(root.content ?? "").substring(0, 30)}…`
      : (root.content ?? ""));
  return (
    <Layout
      title={`${metaTitle} — ${root.account.name}`}
      shortTitle={metaTitle}
      description={root.summary ?? root.content}
      imageUrl={root.account.avatarUrl}
      url={root.url ?? root.iri}
      links={[
        { rel: "alternate", type: "application/activity+json", href: root.iri },
      ]}
      themeColor={accountOwner.themeColor}
    >
      <Profile accountOwner={accountOwner} />
      <div class="article-page">
        <header class="article-hero">
          {title && <h1 class="article-title">{title}</h1>}
          <div class="article-byline">
            <span class="byline-authors">
              {root.account.avatarUrl && (
                <button
                  type="button"
                  class="byline-avatar-btn"
                  aria-label={`View ${root.account.name}'s profile`}
                  {...({ popovertarget: "profile-popup" } as Record<
                    string,
                    string
                  >)}
                >
                  <img
                    src={root.account.avatarUrl}
                    alt=""
                    class="byline-avatar"
                    width={28}
                    height={28}
                  />
                </button>
              )}
              <a href={root.account.url ?? root.account.iri}>
                {root.account.name}
              </a>
            </span>
            <span class="byline-date">
              <a href={root.url ?? root.iri}>
                <time dateTime={publishedAt.toISOString()}>
                  {publishedAt.toLocaleString("en", { dateStyle: "long" })}
                </time>
              </a>
            </span>
          </div>
        </header>
        <ProfilePopup accountOwner={accountOwner} />
        <article class="article-body">
          {rootBodyHtml && (
            <div
              class="article-segment markdown-content"
              dangerouslySetInnerHTML={{ __html: rootBodyHtml }}
              lang={root.language ?? undefined}
            />
          )}
          {root.media.map((medium) => (
            <ThreadMedia medium={medium} />
          ))}
          {descendants.map((post) => (
            <ThreadSegment post={post} />
          ))}
        </article>
      </div>
    </Layout>
  );
}

// If a post has no explicit summary, promote its first paragraph to
// the article title and drop it from the body so content doesn't
// repeat. Otherwise use summary as title and keep body intact.
function deriveTitleAndBody(post: ThreadPost): {
  title: string | null;
  bodyHtml: string;
} {
  if (post.summary != null && post.summary.trim() !== "") {
    return { title: post.summary.trim(), bodyHtml: post.contentHtml ?? "" };
  }
  const html = post.contentHtml ?? "";
  const firstParagraph = html.match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*/i);
  if (firstParagraph) {
    const titleText = firstParagraph[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (titleText !== "") {
      return {
        title: titleText,
        bodyHtml: html.substring(firstParagraph[0].length),
      };
    }
  }
  return { title: null, bodyHtml: html };
}

interface ThreadMediaProps {
  readonly medium: Medium;
}

function ThreadMedia({ medium }: ThreadMediaProps) {
  return (
    <div class="article-media">
      <a href={medium.url}>
        <img
          src={medium.thumbnailUrl}
          alt={medium.description ?? ""}
          width={medium.thumbnailWidth ?? undefined}
          height={medium.thumbnailHeight ?? undefined}
        />
      </a>
    </div>
  );
}

interface ThreadSegmentProps {
  readonly post: ThreadPost;
}

function ThreadSegment({ post }: ThreadSegmentProps) {
  const html = renderCustomEmojis(post.contentHtml ?? "", post.emojis);
  return (
    <>
      {post.contentHtml && (
        <div
          class="article-segment markdown-content"
          dangerouslySetInnerHTML={{ __html: html }}
          lang={post.language ?? undefined}
        />
      )}
      {post.media.map((medium) => (
        <ThreadMedia medium={medium} />
      ))}
    </>
  );
}

interface ProfilePopupProps {
  readonly accountOwner: AccountOwner & { account: Account };
}

function ProfilePopup({ accountOwner }: ProfilePopupProps) {
  return (
    <>
      <div
        id="profile-popup"
        class="profile-popup"
        {...({ popover: "auto" } as Record<string, string>)}
      >
        <button
          type="button"
          class="profile-popup-close"
          aria-label="Close profile"
          {...({
            popovertarget: "profile-popup",
            popovertargetaction: "hide",
          } as Record<string, string>)}
        >
          &times;
        </button>
        <div class="profile-popup-body">
          <Profile accountOwner={accountOwner} />
        </div>
      </div>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: inline positioning script
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const popup = document.getElementById('profile-popup');
  if (!popup) return;
  const place = () => {
    const btn = document.querySelector('[popovertarget="profile-popup"]');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pw = popup.offsetWidth || 340;
    const ph = popup.offsetHeight || 200;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let top = r.bottom + 8;
    let left = r.left;
    if (top + ph > vh - 12) top = Math.max(12, r.top - ph - 8);
    if (left + pw > vw - 12) left = Math.max(12, vw - pw - 12);
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  };
  popup.addEventListener('toggle', (e) => {
    if (e.newState === 'open') requestAnimationFrame(place);
  });
  window.addEventListener('resize', () => {
    if (popup.matches(':popover-open')) place();
  });
})();`,
        }}
      />
    </>
  );
}

export default profilePost;
