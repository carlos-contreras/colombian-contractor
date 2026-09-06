# PLAN — Colombian Contractor (IBC calculator)

## Problem

In Colombia, independent contractors pay social security on **IBC (Ingreso Base de Cotización)**, not on the full invoice. With several contracts, mixed income types, and a legal floor/ceiling, it is easy to under- or over-report.

This project is a **monthly IBC calculator** for all income sources, so the user can:

1. Enter income for a calendar month.
2. See IBC per source and a combined IBC.
3. See implied contributions.
4. Keep a simple month-by-month history locally.

## Users and constraints

- Single user (the project owner), running locally in a browser.
- Spanish Colombia money (COP), monthly cadence.
- Must stay understandable: show the math, not only a final number.
- No accounts, no server, no sensitive data leaving the machine.

## What “IBC” means here (working model)

Rules must be confirmed against current law before coding numbers. The **model** we will implement:

| Concept | Working rule (to verify) |
| --- | --- |
| Independent services / honorarios | **Sin** presunción de costos: IBC = **40%** (legal constant). **Con** presunción UGPP: IBC = 1 − costos presuntos of the chosen CIIU section (`js/ugpp.js`). Net of IVA if invoiced with IVA. |
| Employment salary | IBC ≈ monthly salarial income (with extras that count as salarial) |
| Mixed (salary + contracts) | Combine according to current rules; avoid double-counting; respect one IBC for the month |
| Floor | IBC cannot be below **1 SMMLV** if contributions are due |
| Ceiling | IBC cannot exceed **25 SMMLV** |
| Month | Calendar month; contracts paid or accrued in that month (user chooses one convention and we document it) |

**Contributions derived from IBC** (rates to confirm for the year):

- Salud (independent): typically 12.5% of IBC
- Pensión: typically 16% of IBC
- ARL: rate by risk class (I–V) × IBC
- Optional later: caja de compensación, FSP (fondo de solidaridad pensional) above a threshold

The UI must make **year parameters** explicit (SMMLV, salud, pensión, ARL) so they can be updated without rewriting logic. The 40% honorarios factor is **not** a year field; it is a constant unless a source uses UGPP presunción.

## Income sources (v1)

Each source has a type, a label, and a monthly amount **in COP** (IBC math never sees USD).

1. **Honorarios / prestación de servicios** — dropdown: sin presunción (IBC 40%) or con presunción de costos (activity dropdown, UGPP working table). Amount may be entered in **USD**; the UI converts with the official **TRM** (`js/trm.js`) and then stores integer COP.
2. **Salario** — 100% of salarial base (simple; no full nómina engine in v1).
3. **Other independent income** — user-selectable IBC factor (default 40%), for cases that do not fit (1).

Out of v1 (document, do not build yet):

- Rentas de capital / dividends as IBC (usually not)
- Full prestaciones, auxilio de transporte, non-salarial benefits
- PILA form filling / operator integration
- Multi-year tax projection
- Automatic invoice import

## Product shape

Single-page app.

**Month view**

- Separate **year** and **month** dropdowns. Default = **previous** Bogotá month (PILA on last month’s income).
- Choosing a year loads/caches SMMLV + statutory rates (`js/gov.js`). Choosing a month prefetches that month’s TRMs once.
- List of income sources for that month (add / edit / delete).
- Parameters panel: SMMLV, salud, pensión, ARL class, FSP (no IBC factor here).
- Results:
  - Gross income total
  - IBC per line
  - Raw combined IBC
  - IBC after floor/ceiling
  - Breakdown of salud, pensión, ARL, FSP (if applicable)
  - Total to pay vs cash left after contributions
- Short explanation under each figure (“40% of $X = $Y”).

**History**

- List of saved months with IBC and total contributions.
- Copy last month’s sources into the current month.

**Persistence (v1, decided):** IndexedDB via a `store` API. JSON export/import, SQLite, and a public backend are deferred — see [TODOS.md](./TODOS.md).

## Calculation sketch (v1)

For each source `i`:

```
ibc_i = amount_i * factor_i
```

Then:

```
ibc_raw      = sum(ibc_i)
ibc_capped   = min(ibc_raw, 25 * SMMLV)
ibc_final    = ibc_raw == 0 ? 0 : max(ibc_capped, 1 * SMMLV)   # confirm: floor when there is activity
salud        = ibc_final * salud_rate
pension      = ibc_final * pension_rate
arl          = ibc_final * arl_rate[class]
fsp          = fsp_rule(ibc_final, SMMLV)   # if in scope
total        = salud + pension + arl + fsp
```

Open questions to resolve before locking formulas (research checkpoint):

1. Is the 40% applied per contract or on the sum of independent income?
2. If there is a full-time salary that already covers salud/pensión, how do additional contratos report IBC?
3. Is IVA excluded from the honorarios base?
4. Does the 1 SMMLV floor apply when independent income is very small but salary already exists?
5. Current SMMLV and rates for the target year (start with 2026, keep 2025 as a preset if useful).
6. FSP brackets and whether to include them in v1.
7. Confirm UGPP presunción percentages against the official 4-digit anexo (v1 uses CIIU **sections** as a working table).

Until those are answered, the code should keep rules in a single `rules.js` with comments pointing at the decision. Types for those values live as JSDoc in the same file ([ARCHITECTURE.md](./ARCHITECTURE.md)).

## UX / UI notes

- Language: **Spanish (Colombia)** in the UI; this PLAN/README can stay in English.
- Format money as `$ 1.234.567` (COP, period thousands).
- Mobile-friendly: phone use while invoicing is likely.
- No dark-pattern chrome; a simple form + results table is enough.
- CSS: **Pico.css** (vendored) + thin `css/style.css`. Semantic HTML; see [ARCHITECTURE.md](./ARCHITECTURE.md).
- Show warnings: IBC at floor, IBC at ceiling, missing ARL class, missing UGPP activity.

## Technical plan

Vanilla **ES modules** + **JSDoc**. Details and dependency rules: [ARCHITECTURE.md](./ARCHITECTURE.md).

```
colombian-contractor/
  README.md
  PLAN.md
  TODOS.md            # deferred persistence (JSON archive, store API, SQLite, public)
  ARCHITECTURE.md     # modules, types, store boundary
  package.json        # { "type": "module" }; node --test — no runtime deps
  test/*.test.js
  index.html
  css/pico.min.css    # Pico 2.1.1 classless, vendored
  css/style.css
  js/
    app.js            # UI (no direct IndexedDB)
    rules.js          # IBC + contributions (pure, COP)
    trm.js            # TRM for a date or a whole month
    gov.js            # SMMLV decree table + statutory rates
    ugpp.js           # 40% constant + presunción de costos
    store.js          # in-memory now; IndexedDB in Phase 2
    format.js         # COP / dates
```

- No bundler, no npm packages, no UI framework, no `tsc` for v1.
- ES modules need HTTP (`python -m http.server`), not `file://`.
- Unit tests: `node --test` (see [ARCHITECTURE.md](./ARCHITECTURE.md)).
- Accessibility: labels on inputs, keyboard-usable.

## Phases

### Phase 0 — Planning (this folder)

- [x] Local git repo
- [x] README.md
- [x] PLAN.md
- [x] Persistence: v1 = IndexedDB; later work in TODOS.md
- [x] TODOS.md (JSON archive, store API, no SQLite in v1, public SQLite/Postgres)
- [x] ARCHITECTURE.md (ES modules + JSDoc, Pico.css)
- [x] Unit tests: `node --test` (`test/trm.test.js`)
- [ ] Research checkpoint: answer the six open questions and write them into `rules` notes

### Phase 1 — Static calculator

- [x] Scaffold: `index.html`, Pico, `app.js` / `rules.js` / `format.js` / in-memory `store.js`
- [x] Month + sources form (USD + TRM or COP)
- [x] IBC and contribution results
- [x] Hard-coded / table year parameters (editable in the UI)
- [x] Honorarios: 40% constant or UGPP presunción de costos
- [x] Previous month default; monthly TRM prefetch
- [ ] Confirm research checkpoint before trusting the numbers
- [ ] Replace UGPP section table with official anexo if required

### Phase 2 — Persistence and history

- `store.js` API + IndexedDB adapter (TODOS items 2–3 start here)
- Save months
- Duplicate previous month
- JSON export/import (personal archive)
- Year parameter presets (2025, 2026, …)

### Phase 3 — Hardening

- Warnings (floor/ceiling, mixed income)
- Print/PDF-friendly month summary
- Clarify mixed salary + honorarios once research is done

## Success criteria (v1)

- User can enter ≥3 sources for a month and get a combined IBC in under a minute.
- Changing SMMLV or the 40% factor updates results immediately.
- Refreshing the browser restores the last month (once Phase 2 exists).
- Every number on screen can be traced to an input and a named rule.

## Persistence — comparison and recommendation

Long-term records matter more than the calculator itself. **v1 is decided** (below). This section remains as the decision brief.

### How much data is this, really?

Personal use for 20 years is still tiny:

- 12 months × 20 years × ~10 income lines ≈ **2 400 rows**
- Plus year parameters and a few calculated snapshots

At that size, JSON, IndexedDB, and SQLite are all instant. “JSON search will be inefficient” is true for millions of documents, not for a contractor’s IBC history. **Do not pick a database because of search performance.** Pick it because of durability, backup, and a future public product.

### What “long term” actually requires

| Need | Browser storage alone | A file you own (JSON or SQLite) | A server DB |
| --- | --- | --- | --- |
| Survives refresh | Yes | Yes | Yes |
| Survives clearing site data / new browser | No | Yes | Yes |
| Survives new laptop | No (unless you export) | Yes if you copy the file | Yes |
| Multi-device without extra work | No | Only if the file is in Drive/git | Yes |
| Open to the public internet | No (each visitor has empty data) | No (file locking, no users) | Yes |

So: **working memory** can live in the browser. **Source of truth** for years of IBC should be a file you can copy, or a server if there are many users.

### Options

**1. `localStorage` (JSON string)**

- Fits current stack: open `index.html`, no process.
- Quota ~5 MB, synchronous, easy to wipe, no indexes.
- Fine as a prototype, weak as an archive.

**2. IndexedDB (browser database)**

- Still no extra process. Built for structured data; quota is much larger.
- Can index by year/month if we ever need it.
- Same fatal limit as all browser storage: **tied to origin + profile**. Clearing site data, some browser “privacy” wipes, or another machine = data gone unless we export.
- Does not become a public multi-user backend later.

**3. JSON file(s) on disk**

- Human-readable, git-friendly, trivial backups (`ibc-2026.json`).
- Search/filter in JS over the whole history is negligible at our size.
- Browser cannot silently write a path; needs download/upload, File System Access API (Chromium), or a tiny local server.
- Bad for a public multi-user app (concurrent writes, no auth, no isolation).
- Scales as an **export format** forever, even if the live engine changes.

**4. SQLite as a local file (recommended *file* format if we want SQL)**

- One file, ACID, real SQL, standard backup (`cp app.db`).
- Does **not** run inside a normal web page. Needs one of:
  - a small local backend (Node `better-sqlite3`, Python, etc.), or
  - SQLite-in-WASM (`sql.js`) persisted to IndexedDB/OPFS — SQL without a server, still browser-bound unless we export the `.db`.
- Excellent for a **single-user** app that should last decades.
- For a **public** app, SQLite on one VPS is enough for a long time (hundreds to low thousands of users) if we add auth. Past that, Postgres.
- Heavier than we need for v1 if we only open `index.html`.

**5. PocketBase / similar single binary**

- Local process: one binary, SQLite inside, REST + admin UI.
- Later the same binary can sit on a VPS for the public internet.
- This *is* another process to run. Overkill until we actually want users and auth.

**6. Hosted SQL (Postgres, etc.)**

- Right answer only when there is a public product with accounts.
- Wrong for “runs on my machine, no deployment.”

### Public internet later — what actually has to change

Going public is not “JSON too slow, switch to SQL.” It is:

1. Authentication and per-user isolation
2. A server that accepts writes
3. Backups and migrations
4. HTTPS, rate limits, not trusting the client for money math display vs stored inputs

JSON-on-disk will not scale to that. IndexedDB will not either. SQLite *can* be that first server database. Postgres is the usual next step.

The way to avoid a rewrite: **all UI code talks to `store.js`** (`listMonths`, `getMonth`, `saveMonth`, `exportAll`, `importAll`). Swap the adapter; keep `rules.js`.

### Recommendation (accepted)

1. **v1:** IndexedDB as working storage; static HTML/CSS/JS; no extra process.
2. **JSON export/import** as the long-term personal archive.
3. **`store` interface** so the engine is replaceable.
4. **No SQLite or local server in v1.**
5. **If/when public:** small backend, SQLite first, Postgres only if load requires it.

Items 2–5 are tracked in [TODOS.md](./TODOS.md).

**Do not do this yet:** WASM SQLite, PocketBase, or Postgres.

### Decision

- [x] Owner choice: **v1 IndexedDB** (recommendation item 1). Items 2–5 deferred in TODOS.md.

## Next step

After this PLAN is accepted:

1. Fill the research checkpoint (even as “assumed, pending accountant review”).
2. Scaffold `index.html` + CSS + `rules.js` with the formula above and a tiny demo dataset.
