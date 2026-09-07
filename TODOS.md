# TODOs — persistence and future backends

**Current state:** Supabase Auth/Postgres is the authenticated source of truth. The static frontend uses `store.js` with Supabase, JSON backups, and an IndexedDB fallback for local migration/tests.

Keep the static frontend architecture. Supabase provides the hosted backend and RLS provides per-user isolation.

---

## 1. JSON export / import (personal archive)

Supabase provides cross-device persistence, but a JSON file remains the independent long-term backup and migration format.

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

UI and `rules.js` must not call IndexedDB, Supabase, or any future database directly. The store boundary keeps the calculation engine independent from the persistence backend.

**Status:** Implemented.

- [x] `js/store.js` as the only persistence boundary
- [x] Minimum API:
  - `listMonths()`
  - `getMonth(yearMonth)`
  - `saveMonth(yearMonth, data)`
  - `deleteMonth(yearMonth)`
  - `exportAll()` / `importAll()`
- [x] Supabase adapter behind that API
- [x] IndexedDB fallback/local migration path
- [x] No storage calls from `app.js`

---

## 4. Supabase hosted persistence

**Status:** Implemented in the frontend and database migration files.

- [x] Supabase Auth client and sign-in/sign-up UI
- [x] Supabase Postgres adapter behind `store.js`
- [x] Per-user RLS policies
- [x] Database baseline migration (`supabase/migrations/001_initial.sql`)
- [x] Atomic JSON archive replacement RPC (`002_replace_archive.sql`)
- [x] JSON export/import preserved
- [ ] Run/verify the RPC in the hosted project
- [ ] Test two authenticated users for RLS isolation
- [ ] Add explicit sync failure/last-saved UI
- [ ] Add Supabase integration tests against a non-production project

---

## 5. SQLite / local server — deferred

SQLite, WASM SQLite, PocketBase, and a local Node/Python process remain out of scope. Supabase currently provides the hosted Postgres backend while keeping the frontend static.

If Supabase is ever replaced, implement another adapter behind the existing `store` API and keep JSON export/import as the portable backup.
