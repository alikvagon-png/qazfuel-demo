# QAZFUEL V3 — stage 2 release

Date: 2026-10-30. Scope: qazfuel-v3 only. Existing graphite/navy/gold design preserved.

## Implemented

- All nine Leaflet markers activate their exact point card, smoothly scroll to it, focus accessibly without an extra jump, and show a gold selection. Reduced-motion preference disables smooth scrolling. Route uses exact latitude/longitude in Yandex driving directions. Booking receives the same point ID.
- Regional price panel (Moscow / Moscow Oblast), three separate grades, source status, source observation date, check time, one-hour server cache. Strict 24-hour freshness and a fixed 3 RUB/litre discount. No customer discount input, no invented AI-98 or national-to-regional substitutions.
- Separate free Node API and PostgreSQL on Render Frankfurt. Persistent orders, audit history, original 24h deadline, row-locked status transitions, idempotency constraint and owner authorization. Profiles and guest sessions persist; histories reload from server. Existing local demo records stay local and are clearly differentiated.
- Explicit server-test versus live mode. Current release is **SERVER TEST**: records are actually stored in PostgreSQL, but are not a commercial reservation and are not sent to a manager. No silent success/fallback when the configured server is unreachable.
- Protected Telegram initData authentication, numeric manager binding, secret webhook validation, manager-only confirm/reject handlers and transactional notification outbox implemented. Secrets remain in server environment, not client or repository. Integration remains disabled until separate bot approval, credentials and manager binding.
- Client preserves request idempotency key across unknown network outcome and retry. Server updates are polled every 20 seconds while the app is visible. Server time is used for countdown offset. Address/phone and optional saved truck profile are stored on the server.

## Verification

- `node --test tests/core.test.cjs`: 9 tests passed.
- `npm test --prefix server`: security, validation/price and PostgreSQL/HTTP/Telegram test groups. Uses actual PostgreSQL engine via PGlite for schema, transactions, persistence after closing/reopening database, immutable origin, owner isolation, replay/idempotency, transitions and already-expired fixture. Telegram transport is **mocked**, not actual delivery.
- `ENGINE=webkit node tests/e2e.cjs`: 16 scenarios / 208 assertions passed, including 320/390/430/768px layouts, sticky delivery slider, all screens, forms, local legacy data, map fallback, countdown and mocked Telegram WebView lifecycle.
- `node tests/stage2.e2e.cjs`: 77 checks passed on WebKit at 390x844 with real local HTTP API and PostgreSQL engine. Covers all nine markers by keyboard and pointer (zoomed to separate close markers), scroll/card highlight, routes, booking transfer, server history/reload, double click, full tank, absent prices, and a deliberately lost POST response followed by a duplicate-safe retry. No uncaught JS errors.
- Public API HTTP: 12 successful checks recorded in STAGE2_HTTP_RESULTS.json. PostgreSQL connected, actual synthetic server order created and confirmed in test mode, same-key retry returns same UUID, different payload rejected 409, another guest gets 404, unauthenticated history gets 401, expiry is exactly 86400 seconds, audit events and profile read/write work. Real price source responses are included in the evidence.
- `npm audit --prefix server --omit=dev`: no vulnerabilities in production dependencies.
- Physical iPhone Safari and actual Telegram WebView are **not** directly verified. WebKit mobile rendering and Telegram lifecycle mocks cover the available approximation.

Test environment note: browser libraries were unpacked locally because this container cannot install system packages. Playwright's OS package-name precheck was skipped; the actual WebKit binary ran with required libraries and all tests above executed. No browser security/TLS validation was disabled.

## Unfinished external connections

No suitable complete free regional fuel-price API was established. Both requested sources were actually requested; available results fail grade/region/freshness eligibility. Prices correctly say 'Цена уточняется'. See STAGE2_PRICES.md for URLs, actual fields and alternatives.

No real Telegram message was delivered, no bot token was supplied, and no existing bot webhook/settings were changed. Manager identity/chat ID is not guessed from @qazfuel. Setup and exact remaining actions: STAGE2_SETUP.md.

The free test PostgreSQL expires **2026-11-29**, has no managed backups and must not be treated as permanent commercial infrastructure. No paid resource was created. Free web service can sleep; forms and retry keys survive timeout.

Production and main remain outside this release. Main SHA verified before release: 296ed4c660d686b70d390d20b028551bcc3186ce.
