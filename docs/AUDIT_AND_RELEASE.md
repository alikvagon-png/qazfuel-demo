# QAZFUEL V3: audit and release scope

## Baseline audit, 30 October 2026

Inspected branch qazfuel-v3 at 868e4b1 and all seven screens of https://qazfuel-v3-preview.onrender.com. The previous preview was a single-file prototype. Findings, in priority order:

- P1: no interactive map; Yandex links placed a pin instead of calculating a route.
- P1: delivery phone validation accepted any nonempty text. localStorage writes had no failure recovery or duplicate protection.
- P1: reservation records never transitioned to expired; no countdown, detail screen, repeat or confirmation simulation. Original 24-hour invariant was untested.
- P2: delivery slider scrolled away; full-tank checkbox was easy to miss. No optional comment/geolocation.
- P2: no saved truck, Telegram SDK, safe-area/keyboard handling, map failure fallback, focus management or responsive tests.
- P2: no verified usable regional pricing source. Placeholder discount selector did not calculate anything.
- P3: inconsistent type, cards and control sizes; sparse home and about screens.

## Release implementation

Only v3/ and documentation/tests added/changed on qazfuel-v3. public/, main, production Render service and working bot settings are out of scope and untouched.

New mobile navy/graphite/gold UI. Four primary screens plus booking, delivery and pricing. Accessible native controls, dialogs, explicit focus and status announcements, safe areas, reduced motion and large touch targets. Delivery volume control remains pinned while scrolling. Local Leaflet 1.9.4, exact nine supplied coordinates, Yandex driving route destination links and textual fallback.

Shared core business rules in v3/core.js. Truck requests only diesel; validation, saved vehicle, review before save, duplicate guard, immutable original creation + 24h, countdown and expiration. Confirmation is explicitly LOCAL DEMO simulation, never real manager confirmation. Delivery has mandatory address and validated +7 phone, optional comment/geolocation, full-tank mode without invented liters/total. History, details, category filters, cancellation and repeat. Storage failures retain form values and report errors; corrupted saved state is preserved rather than silently overwritten.

Telegram SDK is asynchronous so its network failure cannot block the app. SDK initialization/theme/viewport/back/safe-area hooks enhance the browser demo. No trusted authentication from initDataUnsafe; no server authentication is claimed. Proposed server architecture lives in SERVER_ARCHITECTURE.md.

Real price-source HTTP testing documented in PRICE_SOURCES.md. Automatic regional price is explicitly unavailable. The customer calculator was removed after owner clarification: a verified current regional API quote will always receive the fixed launch discount of 3 RUB/l. No cost/profit calculations.

## Limits

LocalStorage is a demo store, not a backend, secure multi-user account or backup. Device clock drives demo expiry; production must enforce PostgreSQL/server time. Browser data is available to other users of the same browser. No actual submission, real availability, payments, dispatch, manager admin or real reservation. Geolocation is requested only by an explicit user action, kept in the session draft and stored durably only if a test delivery is saved. Map tiles require internet and disclose ordinary map network requests to OSM; textual points/routes work without tiles. A live iOS Telegram/device check remains necessary before real rollout.

## Reproduce checks

- Business rules: `node --test tests/core.test.cjs`
- Syntax: `node --check v3/app.js && node --check v3/core.js`
- User journeys: `ENGINE=webkit node tests/e2e.cjs` (install Playwright + WebKit dependencies first; suite hosts local v3 itself).
- Remote smoke: `BASE_URL=https://qazfuel-v3-preview.onrender.com ENGINE=webkit node tests/e2e.cjs`

Final execution evidence and deployment verification are recorded separately after checks complete.
