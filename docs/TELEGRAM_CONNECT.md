# Telegram V3 — connected

## Current result, 2026-10-30

The owner explicitly authorized configuring the existing @QazFuelServiceBot, replacing its menu target with V3, installing the webhook and enabling manager notifications. Main and the previous production website code remain unchanged.

- Telegram getMe verified the supplied credential belongs to QazFuelServiceBot. The credential is saved only as BOT_TOKEN in the separate Render API's secret environment, never in source or this report.
- Name, description, short description, commands /start, /app, /help and menu button 'Открыть QAZFUEL V3' were configured. The menu opens https://qazfuel-v3-preview.onrender.com/.
- An exact one-use pairing challenge arrived in a private Telegram update from the approved qazfuel account (case-insensitive username). The sender/chat numeric IDs were obtained directly from Telegram, verified and stored in configuration/PostgreSQL. They are not guessed from a username or supplied by browser JavaScript, and are not published here. Unrelated update contents were not logged or dropped.
- The approved webhook is https://qazfuel-v3-api.onrender.com/telegram/webhook, authenticated with a private Telegram secret_token header. Only message and callback_query update types are needed. Pending updates were preserved. Telegram getWebhookInfo reports this endpoint, zero pending updates and no last error.
- Two explicitly labelled **server_test** fixtures were created once under the verified manager's identity and delivered by the real persistent outbox. The manager actually pressed confirmation for one and rejection for the other in Telegram. Both decisions are recorded as manager audit events in PostgreSQL; browser simulation cannot satisfy these checks. The original 24-hour deadline is unchanged. These records do not create a real fuel reservation.
- After both real decisions and deliveries passed, ORDER_INTAKE_ENABLED=true was applied. /api/config reports mode=live, database=true, telegramConfigured=true, managerBound=true, delivered=2, confirmPassed=true, rejectPassed=true.
- VERIFY_ON_BIND=false and the pairing secret was cleared after binding. The used challenge cannot bind another manager. The webhook secret remains private.

Actual public evidence: TELEGRAM_LIVE_RESULTS.json. The original setup instructions and earlier stage reports describe previous states; this document records the new authorized connection.

## Authorization and operation

Real orders require server-verified raw Telegram initData. A normal browser, arbitrary telegramId field or forged signature cannot create an authenticated live session. Guest sessions from the earlier test phase are upgraded when legitimate Telegram initData becomes available. Reopen the Mini App from the bot menu after activation, rather than continuing an old test window.

Orders are stored persistently, notification outbox retries are bounded, and statuses are owner-protected. Confirmation/rejection callbacks require the bound numeric manager and private chat, plus the webhook secret. Delivery is recorded only after Telegram accepts sendMessage. Duplicate callbacks and retries do not create duplicate orders. Test fixtures require their expected manager action; regular browser test simulation cannot change them.

The client distinguishes live intake, ordinary server tests and service verification records. Live UI copy no longer describes normal requests as demos. Prices without a verified regional feed still say 'Цена уточняется'; no market prices are fabricated.

## Validation and limits

- Server security/PostgreSQL/HTTP/Telegram transport tests pass, including fixture delivery/decision checks and rejection of non-manager or incorrect actions. Transport in these unit/integration tests is mocked; the real manager checks above are separate actual Telegram events.
- 9 core tests passed. Local WebKit stage-2 checks increased to 81, including old guest-session upgrade to server-verified Telegram identity and live UI state. Public live smoke is read-only and rejects anonymous and forged identities.
- Real Telegram delivery and actual manager button decisions are verified. A client-originated signed Mini App order on the owner's physical phone is not represented as tested by these service fixtures. The owner can now reopen the Mini App and submit a clearly labelled check order to verify that final device-specific path.
- The current free PostgreSQL expires on **2026-11-29**, has no managed backups and remains test infrastructure. A permanent storage/backup decision is needed for ongoing commercial operation. No paid resource was created.

## Rotate the disclosed bot credential

After setup, revoke the credential shared in conversation through BotFather and enter the replacement directly into the API service's BOT_TOKEN environment variable. Update every other service that uses this bot as well. Wait for the Render redeploy and reopen the Mini App before checking again. Do not put replacement credentials in GitHub, frontend, reports or logs. Changing a bot token temporarily interrupts outbound calls until the deployed environment is updated.
