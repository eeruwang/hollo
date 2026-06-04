Syncing with upstream Hollo
===========================

This fork (`eeruwang/hollo`) tracks the upstream [`fedify-dev/hollo`]
project but adds custom features (eeruwang theme, webhook notifications,
Filter v2 API, archive backup, dashboard social tab).  This file
documents the conventions we follow so that future upstream syncs stay
manageable.

[`fedify-dev/hollo`]: https://github.com/fedify-dev/hollo


Migration numbering
-------------------

Drizzle migrations are named `NNNN_short_description.sql` where `NNNN`
is a monotonically increasing four-digit number.  Upstream allocates
new numbers as soon as a PR ships; fork-specific migrations are
allocated on top of whatever upstream has *already merged at the time
of the fork's last sync*.

The fork's custom migrations live at:

| Index | Name                              |
| ----- | --------------------------------- |
| 0080  | `0080_add_eeruwang_theme`         |
| 0081  | `0081_add_webhooks`               |
| 0082  | `0082_add_filters`                |
| 0083  | `0083_add_custom_emoji_aliases`   |
| 0084  | `0084_quote_controls`             |
| 0085  | `0085_passkeys`                   |
| 0086  | `0086_passkey_login_challenges`   |

Indices 0084–0086 are *upstream features ported into the fork's
numbering*: their SQL bodies match upstream's 0086 / 0088 / 0089
respectively, but they are committed to disk and to the journal under
the next-available fork numbers so the production `__drizzle_migrations`
table sees a contiguous sequence.

Future fork-only migrations should continue this sequence: the next
available number is `0087`.


Pulling new upstream changes
----------------------------

When the next upstream PR adds migrations 0090+, they collide with
nothing the fork has shipped, so the immediate file-level conflict is
limited to the journal.  The fork-side workflow:

 1. Fetch and merge upstream into a dedicated `sync-*` branch.

 2. For every new migration upstream contributed
    (`drizzle/NNNN_<name>.sql` and its `drizzle/meta/NNNN_snapshot.json`),
    *renumber* the file pair to the next fork index:

    ~~~~ bash
    # upstream contributed `0090_<name>.sql`; fork's next idx is 0087.
    git mv drizzle/0090_<name>.sql drizzle/0087_<name>.sql
    git mv drizzle/meta/0090_snapshot.json drizzle/meta/0087_snapshot.json
    ~~~~

 3. In `drizzle/meta/_journal.json`, replace upstream's incoming
    `{ idx: 90, …, tag: "0090_<name>" }` entry with
    `{ idx: 87, …, tag: "0087_<name>" }` at the *end* of the entries
    array.  Keep the original `when` timestamp so the ordering remains
    chronologically meaningful for debugging.

 4. If two upstream migrations modify the same row (the way upstream's
    own 0086 / 0087 did with `quote_approval_policy`), keep only the
    final effective change — the snapshot squash in step 2 already
    captures the end state.

 5. Run `pnpm migrate:test` against a clean test database to verify
    that the renumbered sequence applies cleanly.

 6. Commit the renumbered files and the journal edit as a single
    "Renumber upstream migrations onto fork sequence" commit, so the
    intent is obvious in `git log -- drizzle/`.


Drizzle ORM major upgrades
--------------------------

Stay on the latest *stable* drizzle-orm release.  Do **not** upgrade to
1.0.0-rc.x while it remains an RC: the RC's migration-tracking schema
is not yet forward-compatible with the 0.31.x layout the fork's
production database is on, and the production `__drizzle_migrations`
rows cannot be reconciled on the fly.  When 1.0.0 ships a stable
release, follow its documented migration path (it likely includes a
one-shot reconciliation step that wasn't available in the RC).


Restoring a deploy after a botched migration
--------------------------------------------

If `pnpm run migrate` fails at startup, the healthcheck times out and
Railway rolls deploys forward without surfacing the migration error.
To diagnose:

 1. Re-run the failing migrate locally against a copy of the prod DB:

    ~~~~ bash
    DATABASE_URL=postgres://… pnpm migrate
    ~~~~

 2. Compare `drizzle/meta/_journal.json` against the tags listed in
    `__drizzle_migrations`:

    ~~~~ sql
    SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY id;
    ~~~~

 3. If the journal lists a tag that isn't in `__drizzle_migrations` and
    the SQL file is missing from disk, restore the SQL file from
    history (`git log -- drizzle/NNNN_<name>.sql`).  If the SQL file is
    present but the journal entry is missing, restore the journal from
    the last good commit (in practice, that's the commit of the most
    recent successful deploy).
