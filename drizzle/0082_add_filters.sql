CREATE TYPE "public"."filter_action" AS ENUM('warn', 'hide');
CREATE TYPE "public"."filter_context" AS ENUM('home', 'notifications', 'public', 'thread', 'account');

CREATE TABLE "filters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_owner_id" uuid NOT NULL REFERENCES "account_owners"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "context" jsonb NOT NULL,
  "filter_action" "filter_action" NOT NULL DEFAULT 'warn',
  "expires_at" timestamp with time zone,
  "created" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "filter_keywords" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "filter_id" uuid NOT NULL REFERENCES "filters"("id") ON DELETE CASCADE,
  "keyword" text NOT NULL,
  "whole_word" boolean NOT NULL DEFAULT false,
  "created" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
