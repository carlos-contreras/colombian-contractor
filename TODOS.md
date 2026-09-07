# TODOs — persistence and future backends

**Current state:** Phase 2 local persistence is implemented. The app uses IndexedDB with JSON backups and an in-memory fallback when IndexedDB is unavailable.

Keep the static, single-user architecture until a real need for a server or multi-user accounts appears.

---

## 1. JSON export / import (personal archive)

IndexedDB dies with site data, another browser, or a new machine. A JSON file the owner keeps is the long-term record.

**Status:** Implemented. Import replaces all existing data.

- [x] `exportAll()` — download one JSON file (year parameters, months, TRMs)
- [x] `importAll()` — restore from that file (replace)
- [x] UI: export / import controls on the history view
- [x] Document backup habit in README (download after saving important months)

Not in this item: silent writes to a disk path, File System Access API, or splitting one file per year (add later only if a single file becomes annoying).

---

## 2. Local persistence hardening

**Status:** Partially implemented.

- [x] Auto-save edited sources and notes after a short debounce
- [x] Show whether IndexedDB is active or unavailable
- [ ] Test IndexedDB manually in supported browsers and private browsing modes
- [ ] Validate imported JSON structure and backup version before replacing data
- [ ] Add IndexedDB schema migrations for future database versions
- [ ] Add a visible last-saved timestamp

---

## 3. `store` interface (replaceable engine)

UI and `rules.js` must not call IndexedDB (or any future DB) directly. One adapter keeps a future SQLite/API swap from becoming a rewrite.

**Status:** Implemented.

- [x] `js/store.js` as the only persistence boundary
- [x] Minimum API:
  - `listMonths()`
  - `getMonth(yearMonth)`
  - `saveMonth(yearMonth, data)`
  - `deleteMonth(yearMonth)`
  - `exportAll()` / `importAll()`
- [x] IndexedDB as the first implementation behind that API
- [x] No IndexedDB calls from `app.js`

---

## 4. SQLite / local server — deferred

Do **not** add SQLite, WASM SQLite, PocketBase, or a local Node/Python process while the app is a static page.

**Trigger:** owner wants a real file on disk more than “just open `index.html`,” or we start work on a public backend (item 5).

- [ ] Keep v1 free of SQLite and extra processes
- [ ] When triggered: new adapter in `store.js` (same API), SQLite file as source of truth
- [ ] Keep JSON export as portable backup even after SQLite exists

---

## 5. Public internet

Going public is auth + a server, not a faster browser DB.

**Trigger:** we actually want other people to have accounts.

- [ ] Small backend behind the same `store` API
- [ ] First database: **SQLite**
- [ ] Auth and per-user isolation
- [ ] HTTPS, backups, migrations
- [ ] Postgres only if multi-user load requires it

Out of scope until this trigger: WASM SQLite, PocketBase, hosted Postgres “just in case.”
