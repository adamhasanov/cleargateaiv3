/**
 * Database migrations, applied in order on first database use (see db.ts) or
 * with `npm run db:migrate`. Plain PostgreSQL, so the same SQL runs on the
 * embedded local database (PGlite) and on any hosted Postgres (DATABASE_URL).
 *
 * Never edit a migration that has shipped; add a new one.
 *
 * Privacy (F9a): no table stores uploaded files. `checks.extractions` holds
 * only the values read from each document and the file names.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_accounts_billing_checks_advisor",
    sql: `
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  name          text NOT NULL DEFAULT '' CHECK (char_length(name) <= 120),
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  locale        text NOT NULL DEFAULT 'az' CHECK (locale IN ('az', 'ru', 'en')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- Only a SHA-256 hash of the session token is stored; the token lives in an httpOnly cookie.
CREATE TABLE sessions (
  id           text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- Plan catalogue. Rows are synced from src/lib/billing/plans.ts on startup;
-- prices come from environment variables and stay NULL until approved.
CREATE TABLE plans (
  code                text PRIMARY KEY,
  sort_order          integer NOT NULL,
  monthly_check_limit integer CHECK (monthly_check_limit IS NULL OR monthly_check_limit >= 0),
  advisor_access      boolean NOT NULL,
  risk_score_access   boolean NOT NULL,
  history_days        integer CHECK (history_days IS NULL OR history_days >= 0),
  max_users           integer NOT NULL CHECK (max_users >= 1),
  advanced_reports    boolean NOT NULL,
  support_level       text NOT NULL,
  price_monthly_minor integer CHECK (price_monthly_minor IS NULL OR price_monthly_minor > 0),
  price_annual_minor  integer CHECK (price_annual_minor IS NULL OR price_annual_minor > 0),
  currency            text NOT NULL DEFAULT 'AZN',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan_code            text NOT NULL REFERENCES plans (code),
  billing_period       text NOT NULL CHECK (billing_period IN ('monthly', 'annual')),
  status               text NOT NULL CHECK (status IN ('active', 'canceled', 'expired')),
  current_period_start timestamptz NOT NULL,
  current_period_end   timestamptz NOT NULL CHECK (current_period_end > current_period_start),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
-- At most one active subscription per user.
CREATE UNIQUE INDEX subscriptions_one_active_per_user ON subscriptions (user_id) WHERE status = 'active';
CREATE INDEX subscriptions_user_idx ON subscriptions (user_id, created_at DESC);

-- No card data is ever stored: the provider's hosted page collects it.
CREATE TABLE payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose              text NOT NULL CHECK (purpose IN ('check_credit', 'subscription')),
  plan_code            text REFERENCES plans (code),
  billing_period       text CHECK (billing_period IN ('monthly', 'annual')),
  amount_minor         integer NOT NULL CHECK (amount_minor > 0),
  currency             text NOT NULL,
  status               text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  provider             text NOT NULL,
  order_id             text NOT NULL UNIQUE,
  provider_transaction text UNIQUE,
  idempotency_key      text NOT NULL,
  failure_reason       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,
  CHECK ((purpose = 'subscription') = (plan_code IS NOT NULL AND billing_period IS NOT NULL))
);
CREATE UNIQUE INDEX payments_user_idempotency_key ON payments (user_id, idempotency_key);
CREATE INDEX payments_user_idx ON payments (user_id, created_at DESC);

-- Audit trail of provider notifications (no card data; signature result only).
CREATE TABLE payment_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      uuid REFERENCES payments (id) ON DELETE CASCADE,
  provider        text NOT NULL,
  source          text NOT NULL CHECK (source IN ('callback', 'status_check')),
  provider_status text,
  signature_valid boolean NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_events_payment_idx ON payment_events (payment_id);

CREATE TABLE checks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status           text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  funding          text NOT NULL CHECK (funding IN ('plan', 'credit')),
  document_names   jsonb NOT NULL DEFAULT '{}'::jsonb,
  extractions      jsonb NOT NULL DEFAULT '{}'::jsonb,
  result           jsonb,
  result_class     text,
  rule_set_version text,
  risk_score       integer CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100),
  risk_level       text CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high')),
  risk_reasons     jsonb,
  risk_version     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);
CREATE INDEX checks_user_created_idx ON checks (user_id, created_at DESC);

-- A paid single check: created by a succeeded payment, consumed by one check.
CREATE TABLE check_credits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  payment_id       uuid NOT NULL UNIQUE REFERENCES payments (id) ON DELETE CASCADE,
  used_by_check_id uuid UNIQUE REFERENCES checks (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  used_at          timestamptz
);
CREATE INDEX check_credits_user_idx ON check_credits (user_id) WHERE used_by_check_id IS NULL;

CREATE TABLE chat_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  check_id   uuid REFERENCES checks (id) ON DELETE SET NULL,
  title      text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_conversations_user_idx ON chat_conversations (user_id, updated_at DESC);

CREATE TABLE chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 12000),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_conversation_idx ON chat_messages (conversation_id, created_at);
`,
  },
  {
    id: "0002_payment_checkout_url",
    sql: `
-- The provider's hosted checkout URL for a pending payment, so a repeated click reuses it instead of creating a second charge.
ALTER TABLE payments ADD COLUMN checkout_url text;
`,
  },
];
