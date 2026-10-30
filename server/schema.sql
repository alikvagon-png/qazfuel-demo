CREATE TABLE IF NOT EXISTS qf_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_id bigint UNIQUE, profile jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS qf_sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES qf_users(id), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days');
CREATE TABLE IF NOT EXISTS qf_auth_replays (fingerprint text PRIMARY KEY, user_id uuid NOT NULL REFERENCES qf_users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS qf_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES qf_users(id),
 kind text NOT NULL CHECK(kind IN ('truck','delivery')), payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','expired','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 idempotency_key text NOT NULL, payload_hash text NOT NULL, mode text NOT NULL CHECK(mode IN ('server_test','live')),
 UNIQUE(owner_id,idempotency_key), CHECK((kind='truck' AND expires_at IS NOT NULL AND expires_at=created_at+interval '24 hours') OR (kind='delivery' AND expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS qf_orders_owner_created ON qf_orders(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS qf_orders_expiry ON qf_orders(expires_at) WHERE status IN ('pending','confirmed');
CREATE TABLE IF NOT EXISTS qf_order_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id uuid NOT NULL REFERENCES qf_orders(id), status text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS qf_manager (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),telegram_id bigint NOT NULL, chat_id bigint NOT NULL, bound_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS qf_outbox (order_id uuid PRIMARY KEY REFERENCES qf_orders(id), state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent')), attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), message_id bigint, last_error text);
CREATE TABLE IF NOT EXISTS qf_webhook_updates (update_id bigint PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION qf_keep_order_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.mode IS DISTINCT FROM OLD.mode THEN
 RAISE EXCEPTION 'Order origin is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS qf_order_origin ON qf_orders;
CREATE TRIGGER qf_order_origin BEFORE UPDATE ON qf_orders FOR EACH ROW EXECUTE FUNCTION qf_keep_order_origin();
