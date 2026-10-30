# QAZFUEL V3 — server and Telegram setup

Only `qazfuel-v3`, `qazfuel-v3-preview`, `qazfuel-v3-api` and `qazfuel-v3-test-db` belong to this release. Do not change main, production service or the current bot webhook.

## Running

```
npm ci --prefix server
npm test --prefix server
node server/index.js
```

Use Node 22+. `/health` checks PostgreSQL when configured. Without DATABASE_URL, order endpoints return 503; the public price proxy remains available. Apply `server/schema.sql` on startup, with the service's private database account. No SQLite or ephemeral files are used for server orders.

## Test infrastructure

- API: https://qazfuel-v3-api.onrender.com
- Dashboard: https://dashboard.render.com/web/srv-dbi7skmc6qcc73bg0ih0
- PostgreSQL: https://dashboard.render.com/d/dpg-dbi7kumi0phs73d39jl0-a
- Both are free, Frankfurt. Database external connections are blocked. DATABASE_URL is the **internal** URL stored only in the API service's secret environment.
- DATABASE_EXPIRES_AT: 2026-11-29T11:07:38.400926Z. The free database expires after 30 days and has no managed backups. It is suitable for disposable test records, not commercial intake. Export/migrate before expiry; do not upgrade automatically or create a paid resource without owner approval.
- The free API sleeps after inactivity. First request can take 50+ seconds. The app retains forms and idempotency keys on timeout and allows retry.
- ALLOWED_ORIGINS = https://qazfuel-v3-preview.onrender.com
- ORDER_INTAKE_ENABLED=false; WEBHOOK_ENABLED=false. Do not enable real intake before an end-to-end Telegram test and a durable production storage/backup decision.

## Modes and ownership

`local_demo`: no server database. Existing browser-only records remain explicitly local. Configured but unavailable API never reports a browser fallback as a sent order.

`server_test`: real PostgreSQL persistence, guest sessions, owner-only history, test confirmation/rejection. No manager notification, no real reservation. User's random bearer token persists on this device and only its SHA-256 digest is stored in PostgreSQL; expires in 30 days. Losing the token means guest history cannot be restored on another device. Existing browser orders are never silently uploaded.

`live`: requires ORDER_INTAKE_ENABLED=true, enabled Telegram integration and a bound numeric manager ID. Only verified Telegram identities may submit. HMAC verification of raw initData is server-side; raw initData is never stored, repeated signatures are rejected, freshness limit 5 minutes. Subsequent API requests use a random session credential. A normal browser `telegramId` field never authenticates anyone. Verified Telegram re-entry can recover that Telegram user's history.

Order creation uses an Idempotency-Key and payload digest under a database unique constraint. Updates lock rows, enforce transitions and append audit events. SQL trigger prevents changing creation, deadline, payload or owner. Server checks expiry on every history/details/status request and every 60 seconds while running. During a free-service sleep, expiry is applied at the first request/wake; an elapsed order cannot be confirmed. Deadline is always created_at + exactly 24h, not confirmation time.

## Connect Telegram only after separate owner approval

No setWebhook, deleteWebhook or getUpdates calls were made. No bot token has been provided to this release. No real manager message has been sent.

1. Prefer an **independent test bot** for integration testing. If using @QazFuelServiceBot, inspect its current backend/webhook and obtain separate permission before changing it. Do not replace a functioning webhook. The existing bot handler can instead explicitly forward the permitted updates to this server, preserving other bot functions.
2. Set BOT_TOKEN in the API's Render secret environment. Never put it in GitHub, frontend, URLs shown to clients, logs or chat.
3. Obtain the manager's **verified numeric Telegram user ID**, with their participation through the existing trusted bot/backend or Telegram account tooling. A username is not a chat ID; do not guess @qazfuel's numeric ID or sendMessage to the username.
4. Set MANAGER_TELEGRAM_ID to that verified numeric ID. Generate separate high-entropy secrets TELEGRAM_WEBHOOK_SECRET and MANAGER_PAIRING_TOKEN (at least 32 random bytes) and save them only in Render secret environment.
5. After explicit permission and compatibility review, connect the approved bot webhook to `https://qazfuel-v3-api.onrender.com/telegram/webhook`, providing Telegram's secret_token matching TELEGRAM_WEBHOOK_SECRET. Set WEBHOOK_ENABLED=true. Keep ORDER_INTAKE_ENABLED=false initially. The code itself never registers a webhook.
6. The approved manager opens the bot privately and sends `/start manager_<pairing secret>`. It accepts only the preconfigured numeric sender ID, private chat and exact pairing secret. It records the chat ID from Telegram's signed-secret webhook update, never from client form fields. Remove MANAGER_PAIRING_TOKEN after binding; no username-based authorization.
7. Confirm `/api/config` shows telegramConfigured=true and managerBound=true. On an isolated test bot, verify notification contents and both callback buttons with synthetic data. Unauthorized numeric sender/chat, wrong webhook secret, expired order and repeat callbacks must not change data.
8. To test real intake, enable ORDER_INTAKE_ENABLED only with the approved test bot and open the Mini App via Telegram. Valid raw initData is required. Observe pending -> confirmed/rejected through the client's 20-second polling or reopening; compare the unchanged original deadline. A notification is labelled delivered only after Telegram returns success and the outbox commits `sent`.
9. Do not claim real commercial readiness until storage, backup/retention, operations, contact/privacy terms and real Telegram delivery tests are complete. Switch ORDER_INTAKE_ENABLED=false to stop live submissions immediately. The test status endpoint is disabled in live mode and cannot operate on live orders.

## Notification reliability

Transactional outbox with up to five attempts and five-minute retry spacing. Telegram outage does not undo a saved order. Callback status writes are idempotent and manager-only. Like any network delivery, a lost acknowledgement can cause a duplicate notification; the order UUID and guarded callbacks prevent a duplicate order/decision. Monitor failed outbox attempts; operational administration and failed-message alerts are future work. Webhook update IDs are deduplicated. The current handler claims the update before action: operators should inspect/replay failed updates through a controlled internal tool after resolving an outage, rather than exposing a public retry endpoint.

## Prices

See STAGE2_PRICES.md. The proxy contains only documented, actually requested source URLs. The client has no price or discount input. It uses Moscow or Moscow Oblast explicitly and never applies a national quote or Moscow price to highway points. Booking/delivery total stays 'Уточняется' until an applicable verified quote is present and the commercial price can be confirmed. All current source responses fail eligibility, so no fabricated values are rendered.
