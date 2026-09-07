# ARCHITECTURE — Colombian Contractor

How the app is structured. Product scope and completed persistence work stay in [PLAN.md](./PLAN.md); deferred backend work stays in [TODOS.md](./TODOS.md).

**Decision:** vanilla **ES modules** + **JSDoc**. CSS: **Pico.css** (vendored) + a thin `css/style.css`. No bundler, no TypeScript compiler, no UI framework.

---

## Why this shape

The work is a monthly calculator with a replaceable store, not a component tree.

| Layer | Lives in | Framework / TS value |
| --- | --- | --- |
| IBC + contribution math | `js/rules.js` | None — pure functions, **COP only** |
| Honorarios factor | `js/ugpp.js` | 40% constant or 1 − UGPP costos |
| Year figures | `js/gov.js` | SMMLV table + statutory salud/pensión |
| USD → COP | `js/trm.js` | Official TRM lookup + `usdToCopPesos` |
| Persistence | `js/store.js` | IndexedDB adapter with in-memory fallback; JSON export/import |
| COP / dates | `js/format.js` | None |
| Month form + results | `js/app.js` | Low for v1 (one view + history) |
| Look and form chrome | Pico.css + `css/style.css` | Pico is the base; we do not add Tailwind/Bootstrap |

ES modules give the file split in PLAN real boundaries (`import` / `export`) without npm. JSDoc records the data shapes so a later TypeScript pass is a compile step, not a redesign.

Revisit Vue/Svelte/React or `tsc` only if the DOM layer or the type surface actually hurts. Do not add them “just in case.”

---

## Runtime constraints

- **No build.** Browsers load `js/*.js` as written.
- **No npm required for v1.**
- **ES modules need HTTP.** `file://` blocks `import`. Locally, serve the folder (for example `python -m http.server`) and open `http://localhost:8000`. That is a static file server, not an application backend. **GitHub Pages** (HTTPS) satisfies the same requirement.
- **UI language:** Spanish (Colombia). This file stays in English.
- **Money:** integer **COP pesos** in logic and storage. Format only at the edge (`format.js`). Do not round through `Number` floats for pesos.

---

## Folder map

```
colombian-contractor/
  README.md
  PLAN.md
  TODOS.md
  ARCHITECTURE.md     # this file
  package.json        # { "type": "module" }; no runtime dependencies
  test/
    trm.test.js
    rules.test.js
    format.test.js
    gov.test.js
    ugpp.test.js
  index.html          # shell; Pico + style.css + one module entry
  css/
    pico.min.css      # later — vendored Pico release (do not edit)
    style.css         # later — layout and project overrides only
  js/
    app.js            # UI; the only module that touches the DOM
    rules.js          # IBC + contributions (pure, COP)
    trm.js            # official TRM for a date or a whole month; USD → integer COP
    gov.js            # year params (SMMLV table + statutory rates); no extra hosts
    ugpp.js           # honorarios 40% constant + UGPP presunción de costos
    store.js          # persistence API + IndexedDB adapter
    format.js         # COP, year-month, display strings
```

`index.html` loads CSS then a single JS entry (relative URLs):

```html
<link rel="stylesheet" href="css/pico.min.css">
<link rel="stylesheet" href="css/style.css">
<script type="module" src="js/app.js"></script>
```

---

## Dependency direction

```
index.html
    └── app.js
            ├── rules.js
            ├── trm.js
            ├── gov.js → rules.js  (paramsForYear only)
            ├── ugpp.js            # types only from rules.js (JSDoc)
            ├── store.js
            └── format.js
```

Rules:

1. **`rules.js` imports nothing** in this project (no `store`, no `format`, no `trm`, no DOM). It never sees USD.
2. **`trm.js` imports nothing** from `rules` / `store` / `format`. It may `fetch` **only** the official TRM dataset. Module cache + `store` (via `app.js`) hold month TRMs so picking a month is one request.
2b. **`gov.js`** may import `rules.js` for `paramsForYear`. It does **not** fetch MinTrabajo/BanRep (no CORS JSON for SMMLV or IBC rates). Year snapshots go through `store`.
3. **`store.js` does not import `rules.js` or `trm.js`.** It persists inputs (and optional snapshots). Recalculation is `app` calling `rules` (and `trm` when a line is in USD).
4. **`format.js` imports nothing** from `rules` / `store` / `trm`.
5. **`app.js` is the only module that** queries the DOM, calls `store.*`, `rules.*`, `gov.*`, `ugpp.*`, and `trm.*`.
   Default period is the **previous** Bogotá month (PILA on last month’s income). Year dropdown loads/caches year params; month dropdown downloads that month’s TRMs once.
6. No IndexedDB (or any storage API) outside `store.js`.
7. Convert USD → COP **before** `rules`. Persist the TRM date, TRM value used, USD amount, and resulting COP when that lands in `MonthRecord` — do not re-fetch TRM to rewrite old months.

If a new file appears, it must sit on this graph without cycles. Shared constants that are not rules (e.g. `YYYY-MM` regex) can live in `format.js` or a tiny `js/ids.js` later — not in `app.js` copies.

---

## JSDoc

No `.ts` files and no `tsc` in v1. Types are comments the editor can check (`// @ts-check` at the top of each `js/*.js` file).

Conventions:

- `@typedef` for every persisted or computed object, **in the module that owns it**.
- `rules.js` owns calculation types (`YearParams`, `MonthResult`, …).
- `store.js` owns record types (`MonthRecord`, export payload).
- `app.js` does not invent parallel shapes; it imports typedefs via JSDoc (`@import` or a `typedef` re-export comment).
- Prefer `@param` / `@returns` on exported functions.
- Union strings for closed sets (`"honorarios" | "salario" | "renta_capital" | "otro"`), not free text, except user-facing `label`.

Sketch (names can tighten when research lands; fields should not fork in `app.js`):

```js
/**
 * @typedef {"honorarios" | "salario" | "renta_capital" | "otro"} SourceType
 *
 * @typedef {object} IncomeSource
 * @property {string} id
 * @property {SourceType} type
 * @property {string} label
 * @property {number} amount  COP pesos (integer)
 * @property {number} factor  written by app (`ugpp.syncSourceFactor`)
 * @property {"COP" | "USD"} [currency]
 * @property {number} [usd]
 * @property {string} [trmDate]
 * @property {number} [trm]
 * @property {"sin" | "ugpp"} [presuncion]
 * @property {string} [ugppActivity]
 * @property {"arrendamiento" | "dividendos" | "intereses" | "otra"} [rentaKind]
 * @property {"real" | "presunto"} [costMode]  Capital: ET 107 vs 28.08%
 * @property {number} [costAmount]  Real costs, integer COP (option A)
 * @property {"accrued" | "cash"} [rentaTiming]
 *
 * @typedef {object} YearParams
 * @property {number} year
 * @property {number} smmlv
 * @property {number} independentFactor
 * @property {number} saludRate
 * @property {number} pensionRate
 * @property {string} arlClass
 * @property {Record<string, number>} arlRates
 * @property {number} [fspThresholdSmmlv]
 *
 * @typedef {object} SourceIbc
 * @property {string} id
 * @property {number} amount
 * @property {number} factor
 * @property {number} ibc
 * @property {number} [net]  Capital only
 *
 * @typedef {object} MonthResult
 * @property {number} grossTotal
 * @property {SourceIbc[]} perSource
 * @property {number} ibcRaw
 * @property {number} ibcCapped
 * @property {number} ibcFinal
 * @property {number} salud
 * @property {number} pension
 * @property {number} arl
 * @property {number} fspSolidaridad
 * @property {number} fspSubsistencia
 * @property {number} fsp
 * @property {number} totalContributions
 * @property {number} cashAfter
 * @property {("floor"|"ceiling"|"missing_arl"|"missing_ugpp_activity")[]} warnings
 *
 * @typedef {object} MonthRecord
 * @property {string} yearMonth  YYYY-MM
 * @property {IncomeSource[]} sources
 * @property {YearParams} params  snapshot at save time
 * @property {MonthResult} [result]  optional cache; not source of truth
 */
```

Legal rates and the 40% rule are still **research-open** ([PLAN.md](./PLAN.md)). Types stay; numeric defaults live in one place in `rules.js` with comments pointing at the decision.

---

## `trm.js` — official TRM (USD → COP)

Honorarios paid in USD still feed IBC in **COP**. This module is the only allowed network call in v1.

| Export | Role |
| --- | --- |
| `getTrm(date)` | TRM that applies on that **America/Bogotá** calendar day |
| `getTrmMonth(yearMonth)` | All quotes covering that month (one request) |
| `usdToCopPesos(usd, trm)` | `Math.round(usd * trm)` → integer pesos |
| `toIsoDateBogota(input)` | `YYYY-MM-DD` from a string or `Date` |
| `TrmError` | `bad_date` / `not_found` / `network` / `bad_response` / `bad_amount` |

- Dataset: `https://www.datos.gov.co/resource/32sa-8pi3.json` (CORS `*`, fine on Pages).
- TRM rows have `vigenciadesde`–`vigenciahasta` (weekends/holidays reuse the last published rate).
- `not_found` if the series has no row yet (future date, lag). The month form allows a **manual TRM** when fetch fails or the user is offline.
- Which date (invoice vs payment vs other) is **not** decided here; the caller passes it.
- This is a data lookup, not tax advice.

---

## `ugpp.js` — honorarios factor

`app.js` calls `syncSourceFactor` before `computeMonth`. `rules.js` does not import this file.

- **Sin presunción:** `INDEPENDENT_IBC_FACTOR` = `0.4` (not a form field).
- **Con presunción:** activity = CIIU **section**; IBC factor = `1 - costRate`. Working table, not the official 4-digit UGPP anexo.
- Type **otro** still has a manual factor; **salario** is `1`.

---

## `rules.js` — calculation pipeline

Exported functions should be pure: `(sources, params) → MonthResult` (plus small helpers if tests want them).

Working formulas (verify before locking numbers):

```
ibc_i        = amount_i * factor_i
ibc_raw      = sum(ibc_i)
ibc_capped   = min(ibc_raw, 25 * SMMLV)
ibc_final    = ibc_raw == 0 ? 0 : max(ibc_capped, 1 * SMMLV)
salud        = ibc_final * salud_rate
pension      = ibc_final * pension_rate
arl          = ibc_final * arl_rate[class]
fsp          = fsp_rule(ibc_final, SMMLV)   # if in scope
total        = salud + pension + arl + fsp
cashAfter    = grossTotal - total
```

Default factors: honorarios **40% of gross** unless UGPP presunción (`js/ugpp.js`, IBC = 1 − costos). **Rentas de capital:** IBC = **40% of net**; net = gross − real costs or gross × (1 − **0.2808**) (rentista line, not CIIU). FSP uses the Ley 100 table on the final pensión IBC (no manual rate). Salario `1.0`. Otro = user factor.

Every figure shown in the UI must be traceable to an input and a named value on `MonthResult` (or a per-line `SourceIbc`). Warnings (floor, ceiling, missing ARL class, year mismatch) are data on `MonthResult.warnings`, not ad-hoc strings only in the DOM.

---

## `store.js` — persistence boundary

Storage uses **IndexedDB** in browsers, with an in-memory fallback for environments without IndexedDB (such as the Node test runner). The rest of the app never sees the engine.

Also caches **year params** and **TRM by date** so year/month changes do not refetch.

Minimum store API:

| Function | Role |
| --- | --- |
| `listMonths()` | Summaries for history (`yearMonth`, IBC, totals) |
| `getMonth(yearMonth)` | Full `MonthRecord` or `null` |
| `saveMonth(yearMonth, data)` | Upsert record |
| `deleteMonth(yearMonth)` | If the UI needs it |
| `exportAll()` / `importAll()` | JSON archive (Phase 2) |

**Source of truth for a month** is `sources` + `params`. If `result` is stored, it is a cache; opening a month may recompute with stored `params` so old months do not jump when the *current* year’s SMMLV preset changes.

`yearMonth` is `'YYYY-MM'`.

The app calls this API for all persistence. Do not call IndexedDB from `app.js` as a shortcut around this API.

---

## `app.js` — UI

Single-page, two conceptual views (can be sections on one page):

1. **Month** — year/month selector, source list (add/edit/delete), parameters panel, results + short explanations.
2. **History** — saved months; copy previous month’s sources.

Behavior:

- Changing sources or params re-runs `rules` and refreshes results immediately (Phase 1).
- Save is explicit; IndexedDB persists saved months across refreshes.
- No direct `indexedDB` / `localStorage` here.

DOM: plain `document` APIs or small helpers in `app.js`. No Vue/React/Alpine.

---

## `format.js`

- COP display: `$ 1.234.567` (period thousands, no decimals for pesos).
- Parse user input into integer pesos (reject or strip separators in one function).
- Year-month labels for the selector and history.

---

## CSS — Pico.css + `style.css`

**Pico.css** is the open-source base (classless / semantic HTML). **`css/style.css`** is the only project stylesheet.

Rules:

1. **Vendor** a Pico **release** as `css/pico.min.css` (and note version + license in a short comment or `css/PICO-LICENSE`). Do not load Pico from a CDN as the source of truth — local use and GitHub Pages both work offline from the repo.
2. **Do not edit** `pico.min.css`. Overrides go in `style.css`.
3. **Semantic HTML** first (`header`, `main`, `form`, `label`, `table`, `button`) so Pico styles the calculator without a class system.
4. Pico utility classes (`container`, `grid`, …) only when semantic markup is not enough. No BEM, no Tailwind-style utility strings in `app.js`.
5. Default **light** theme (money + later print/PDF). Do not chase a custom design system.
6. `style.css` holds: page width, month toolbar, results/explanations, warning callouts, COP table tweaks. Keep it small.

Pico does not replace `format.js` or any JS module.

---

## Tests

**Runner:** Node’s built-in `node --test` (`node:test` + `node:assert/strict`). No Jest, Vitest, or other npm packages.

`package.json` exists only so ES modules resolve (`"type": "module"`) and so `npm test` runs `node --test`. It is not an application manifest and does not add a bundler.

```bash
node --test
```

Rules:

1. Tests live in `test/*.test.js` and **import** `js/*.js`. Do not duplicate logic in the test tree.
2. Unit tests **must not** call datos.gov.co. `getTrm` accepts `options.fetch` for a fake.
3. Do not live-fetch TRM in the default suite (flaky, needs network). Integration against the real API is optional and separate if we add it later.
4. `rules.js` tests (when that file exists) are the important ones — money math.
5. Do not link `test/` from `index.html`. GitHub Pages must not run the suite.

---

## GitHub Pages (optional deploy)

The v1 stack is a static site. GitHub Pages can host it **without changing modules, JSDoc, or IndexedDB.** No Action build is required: publish the repo (or `/docs`) as-is.

### What carries over

| Piece | On Pages |
| --- | --- |
| `index.html` + vendored Pico + `css/style.css` + `js/*.js` ES modules | Works over HTTPS |
| Relative imports (`./rules.js`, `src="js/app.js"`) | Works |
| IndexedDB via `store.js` | Works in each visitor’s browser |
| JSON export/import | Works (download/upload) |
| `getTrm()` → datos.gov.co | Works (CORS `*`); fails offline — manual TRM still required |

### What does not magically carry over

- **IndexedDB is per origin**, not per git repo. `http://localhost:8000` and `https://<user>.github.io` are different databases. Shipping the code does not ship months you entered locally.
- **Project site origin** is `https://<user>.github.io` (path `/<repo>/` is not part of the origin). Name the database after this app (e.g. `colombian-contractor`) so another Pages project on the same user site cannot collide.
- **Custom domain** = another origin = empty DB until import.
- **Clearing site data / another browser / phone** = empty DB. JSON export remains the archive ([TODOS.md](./TODOS.md) item 2).
- Pages cannot run SQLite, PocketBase, or any `store` adapter that needs a server. Public multi-user accounts are still TODOS item 5, not Pages.

### Rules so Pages keeps working

1. **Relative URLs only** in HTML and JS (`css/pico.min.css`, `css/style.css`, `js/app.js`, `./store.js`). Never `/js/app.js` — project Pages live under `/<repo>/`.
2. **No client routes.** Stay on `index.html` (sections or hash if needed). Pages has no fallback to `index.html` for `/history`.
3. **Add an empty `.nojekyll`** at the site root when we first deploy, so GitHub does not run Jekyll on the tree.
4. **Do not commit export JSON** with real income. The repo can be public; the records must not.
5. A public Pages URL is still an **aid**, not advice (README legal note). Other people’s data never hits GitHub — only their browser.

Local-first remains the default. Pages is the same artifacts on HTTPS, not a second architecture.

---

## Out of v1 (architecture)

Do not add these without updating this file:

- Bundler (Vite, esbuild, webpack)
- TypeScript compilation
- UI framework
- Jest, Vitest, Mocha, or any npm test runner (`node --test` only)
- Tailwind, Bootstrap, or a second CSS framework (Pico is the base)
- `rules.js` depending on storage or the DOM
- SQLite, WASM SQLite, PocketBase, or any local app server
- Network calls **other than** official TRM in `js/trm.js`
- Feeding USD into `rules.js` without converting via TRM (or a manual rate) first

JSON export, a different `store` adapter, and a public backend are persistence evolutions behind `store.js`, not a new UI architecture. See [TODOS.md](./TODOS.md).
