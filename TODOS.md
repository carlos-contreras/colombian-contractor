# TODOs — persistence beyond v1

**v1 (decided):** vanilla HTML/CSS/JS with **IndexedDB** as the working store. No extra process, no server.

These items are the rest of the persistence recommendation. Do them when the trigger in each section is true — not before.

---

## 2. JSON export / import (personal archive)

IndexedDB dies with site data, another browser, or a new machine. A JSON file the owner keeps is the long-term record.

**Trigger:** Phase 2 (persistence and history), as soon as months are saved.

- [ ] `exportAll()` — download one JSON file (`parametersByYear` + all months)
- [ ] `importAll()` — restore from that file (replace or merge; pick one and document it)
- [ ] UI: export / import controls on the history view
- [ ] Document backup habit in README (download after each month, optional git copy)

Not in this item: silent writes to a disk path, File System Access API, or splitting one file per year (add later only if a single file becomes annoying).

---

## 3. `store` interface (replaceable engine)

UI and `rules.js` must not call IndexedDB (or any future DB) directly. One adapter keeps a future SQLite/API swap from becoming a rewrite.

**Trigger:** first persistence code (Phase 2). This is not optional later — implement it *with* IndexedDB.

- [ ] `js/store.js` as the only persistence boundary
- [ ] Minimum API:
  - `listMonths()`
  - `getMonth(yearMonth)`
  - `saveMonth(yearMonth, data)`
  - `deleteMonth(yearMonth)` (if needed)
  - `exportAll()` / `importAll()`
- [ ] IndexedDB as the first implementation behind that API
- [ ] No IndexedDB calls from `app.js`

---

## 4. SQLite / local server — not in v1

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
