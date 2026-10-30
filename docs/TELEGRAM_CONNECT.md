# Telegram V3 connection — 2026-10-30

The owner explicitly authorized switching the existing @QazFuelServiceBot to V3 and configuring manager delivery. Main and production website code remain unchanged.

Telegram getMe verified the provided credential belongs to QazFuelServiceBot. The token was saved only as BOT_TOKEN in the separate API service's secret environment. Never commit or print its value. The credential shared in conversation should be rotated after setup; the replacement must be applied to every service using this bot.

Bot name, description and short description now describe QAZFUEL V3 and explicitly state the current test launch. The menu button 'Открыть QAZFUEL V3' now points to https://qazfuel-v3-preview.onrender.com/. Registered commands: /start, /app, /help. The webhook handler supports these with an app button, manager contact and truthful live/test wording. Private messages are not treated as manager authorization.

Initial getWebhookInfo returned an empty URL and no pending updates. This alone does not prove there was no polling consumer. A webhook has not yet been installed in this step: a verified numeric manager ID is still required. ORDER_INTAKE_ENABLED and WEBHOOK_ENABLED remain false. Commands registered with Telegram require the webhook to be connected before the server can reply.

A one-use manager pairing secret was prepared in Render. It is never stored in this document. The approved @qazfuel account must privately send the exact pairing command supplied to the owner. With no webhook installed, retrieve updates without acknowledging or dropping unrelated updates; inspect only the exact pairing challenge, private-chat condition, Telegram-supplied sender username and numeric sender/chat IDs. Do not derive IDs from a username or accept a numeric ID from client JavaScript. If sender identity differs from the approved manager, ask the owner to resolve it.

After verification: configure MANAGER_TELEGRAM_ID, generate TELEGRAM_WEBHOOK_SECRET, enable WEBHOOK_ENABLED with intake still disabled, deploy and verify health. Register the explicitly approved webhook with its secret_token and only message/callback_query updates; do not drop pending updates. The matching private pairing update then binds the actual manager ID/chat in PostgreSQL. Verify managerBound and a real Telegram delivery before enabling live intake. A test order and both decision buttons must be checked; do not claim delivery from mocked tests. Finally remove the pairing secret, update the bot's test description only after live operation is actually verified, and rotate the exposed bot token.

The free test database expires on 2026-11-29. Commercial readiness still requires durable storage/backups and actual regional fuel-price data. Current missing/stale prices remain 'Цена уточняется'. No paid resource is authorized.

## Verified manager setup and decision checks

The owner reported sending the one-use pairing command. A read-only getUpdates request found the exact command in a private chat, with Telegram-supplied username matching qazfuel case-insensitively and numeric sender/chat IDs. IDs are stored only in configuration/database, not inferred from a username or published here. Unrelated update contents were not logged or acknowledged.

The manager ID, webhook secret and temporary VERIFY_ON_BIND setting were prepared in Render, with order intake still disabled. On first successful binding, the server creates exactly two idempotent **server_test** verification orders under the verified manager's Telegram identity and enqueues them through the same transactional notification outbox as ordinary intake. These messages explicitly say 'СЛУЖЕБНЫЙ ТЕСТ — НЕ ВЫПОЛНЯТЬ. РЕАЛЬНОЙ БРОНИ НЕТ'. Normal client test orders never enter this outbox. The two fixtures require the expected confirm/reject action, and only the verified manager can make these decisions. Browser test simulation cannot satisfy the check.

/api/config exposes only delivery/decision booleans for these fixtures, never the private manager ID, message contents or secrets. Successful decision checks require actual manager audit events, not just an edited status. The original 24-hour deadline is unchanged. Real intake remains off until both decisions and delivery have been verified.

The client upgrades an old guest session when verified Telegram initData becomes available; raw initData is still HMAC-checked on the server. UTF-8 JSON bodies are decoded after complete byte collection to preserve Cyrillic across chunk boundaries. Tests passed: server integration groups, 9 core tests and 79 WebKit stage-2 checks, including guest-to-verified-session transition. Live Telegram delivery and actual decision buttons are evaluated separately from these mocked transport tests.
