# QAZFUEL V3 preview

Modern, local-only Telegram Mini App demo. No build tooling or runtime npm dependencies.

Local: `python3 -m http.server 8000 --directory v3`, open http://localhost:8000.

Existing Render service: qazfuel-v3-preview, branch qazfuel-v3, publish directory v3, build command `test -f v3/index.html`. Pushing this branch auto-deploys preview only. Do not change main, public/, the production service or bot menu settings.

- `core.js`: validated coordinates, reservation/expiry, phone/form/pricing rules.
- `app.js`: local state, UI, forms, map, Telegram enhancements.
- `styles.css`: mobile layout, safe areas, persistent delivery controls.
- `assets/`: vendored Leaflet 1.9.4 and its license. Tile data © OpenStreetMap contributors.
- `../docs/`: audit, price-source test, server architecture and release evidence.
- `../tests/`: pure business rules and automated browser journeys.

No API keys/bot tokens belong in this directory. Test data remains in the local browser. Each order, confirmation and countdown is explicitly marked demo. No actual customer order or fuel reservation is sent.
