CREATE TYPE "public"."webhook_event" AS ENUM('mention', 'reblog', 'follow', 'favourite', 'emoji_reaction', 'poll', 'status');

CREATE TABLE "webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_owner_id" uuid NOT NULL REFERENCES "account_owners"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "events" jsonb NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
