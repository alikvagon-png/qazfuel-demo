# QAZFUEL bot experience

The existing bot and V3 application remain connected to the same verified manager. Work is scoped to qazfuel-v3 and its API/preview services; main is unchanged.

## Customer experience

- /start and /menu show a concise welcome, service areas and six buttons: refuelling, delivery, map, orders, help and manager.
- Service buttons use **inline Web App buttons** (not reply-keyboard Web App launches) so the existing server-verified Telegram authorization can be used. Query parameter `screen` opens the requested internal app view. Valid navigation hashes take priority; Telegram launch parameters do not become screen names.
- /app, /booking, /delivery, /points, /orders, /prices and /help have distinct useful responses. FAQ buttons explain the original 24-hour reservation deadline, delivery fields, cash payment, unavailable prices and contact details.
- Prices are never fabricated; the fixed 3 RUB/litre policy is described together with 'Цена уточняется' when no reliable quote exists. Free-form chat messages do not silently create an order. The bot directs these users to the app or manager.
- Public informational callbacks are private-chat and sender-checked and never mutate order data. Manager confirmation/rejection keeps its existing authorization. An expired callback acknowledgement does not prevent delivery of the requested information.
- Existing QAZFUEL vector branding is exported as a static JPG avatar suitable for Telegram's documented profile-photo API.

## Server-managed presentation

`bot-profile.js` uses the current BOT_TOKEN from the existing secret environment; no new token is requested or embedded in source. getMe checks the expected bot username before any changes. Commands, description, short description, global app menu and avatar are applied through Telegram Bot API. The avatar uses multipart InputProfilePhotoStatic with an uploaded JPG.

A hash of the public presentation is saved in qf_bot_profiles only after Telegram accepts all changes. This avoids rewriting bot settings on every free-service wake. Presentation errors are logged with generic codes and do not stop order intake. `/api/config.botPresentation` exposes only whether configuration has been applied and its timestamp. It never exposes credentials. This setup preserves webhook, manager binding, live-intake flags and existing orders.

Raw Telegram launch data can be retained in memory if the external SDK loads late. It is still untrusted client input until the backend validates its HMAC and freshness; no ordinary user-ID field authenticates a customer.

## Verification

- Server tests cover all command/button actions, profile identity checks and caching, JPG multipart upload, private callback restrictions, manager decision isolation, and existing order flows. Telegram transport is mocked in these tests.
- Core tests cover route allowlisting and Telegram-hash/query precedence.
- Mobile WebKit navigation checks load all seven destination views with Telegram launch parameters, enforce a single visible screen and no horizontal overflow, and check browser Back navigation. No orders are submitted by this check.
- Actual metadata configuration is verified separately after the Render deployment by the persisted `botPresentation` success marker. Customer conversations should be opened with /start or /menu; previous messages in Telegram are not retroactively edited.

Official reference: https://core.telegram.org/bots/api (setMyProfilePhoto, InputProfilePhotoStatic, InlineKeyboardButton, setMyCommands).
