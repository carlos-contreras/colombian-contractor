# ARCHITECTURE — Colombian Contractor

How the app is structured. Product scope and phases stay in [PLAN.md](./PLAN.md); deferred persistence in [TODOS.md](./TODOS.md).

**Decision:** vanilla **ES modules** + **JSDoc**. CSS: **Pico.css** (vendored) + a thin `css/style.css`. No bundler, no TypeScript compiler, no UI framework.

---

## Why this shape

The work is a monthly calculator with a replaceable store, not a component tree.

| Layer | Lives in | Framework / TS value |
| --- | --- | --- |
| IBC + contribution math | `js/rules.js` | None — pure functions |
| Persistence | `js/store.js` | None — IndexedDB behind an API |
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
  index.html          # shell; Pico + style.css + one module entry
  css/
    pico.min.css      # later — vendored Pico release (do not edit)
    style.css         # later — layout and project overrides only
  js/
    app.js            # UI; the only module that touches the DOM
    rules.js          # IBC + contributions (pure)
    store.js          # persistence API + IndexedDB adapter
    format.js         # COP, year-month, display strings
```

Later, optional: `js/rules.test.html` (or console asserts) importing `rules.js`. No test runner in v1.

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
            ├── store.js
            └── format.js
```

Rules:

1. **`rules.js` imports nothing** in this project (no `store`, no `format`, no DOM).
2. **`store.js` does not import `rules.js`.** It persists inputs (and optional snapshots). Recalculation is `app` calling `rules`.
3. **`format.js` imports nothing** from `rules` / `store`.
4. **`app.js` is the only module that** queries the DOM, calls `store.*`, and calls `rules.*`.
5. No IndexedDB (or any storage API) outside `store.js`.

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
- Union strings for closed sets (`"honorarios" | "salario" | "otro"`), not free text, except user-facing `label`.

Sketch (names can tighten when research lands; fields should not fork in `app.js`):

```js
/**
 * @typedef {"honorarios" | "salario" | "otro"} SourceType
 *
 * @typedef {object} IncomeSource
 * @property {string} id
 * @property {SourceType} type
 * @property {string} label
 * @property {number} amount  COP pesos (integer)
 * @property {number} factor  1 for salario, 0.4 for honorarios, custom for otro
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
 * @property {number} fsp
 * @property {number} totalContributions
 * @property {number} cashAfter
 * @property {string[]} warnings
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

Default factors: honorarios `0.4`, salario `1.0`, otro = user factor (default `independentFactor`).

Every figure shown in the UI must be traceable to an input and a named value on `MonthResult` (or a per-line `SourceIbc`). Warnings (floor, ceiling, missing ARL class, year mismatch) are data on `MonthResult.warnings`, not ad-hoc strings only in the DOM.

---

## `store.js` — persistence boundary

v1 working storage: **IndexedDB**. The rest of the app never sees that.

Minimum API (Phase 2; implement the interface with the first IndexedDB code — [TODOS.md](./TODOS.md) item 3):

| Function | Role |
| --- | --- |
| `listMonths()` | Summaries for history (`yearMonth`, IBC, totals) |
| `getMonth(yearMonth)` | Full `MonthRecord` or `null` |
| `saveMonth(yearMonth, data)` | Upsert record |
| `deleteMonth(yearMonth)` | If the UI needs it |
| `exportAll()` / `importAll()` | JSON archive (Phase 2) |

**Source of truth for a month** is `sources` + `params`. If `result` is stored, it is a cache; opening a month may recompute with stored `params` so old months do not jump when the *current* year’s SMMLV preset changes.

`yearMonth` is `'YYYY-MM'`.

Phase 1 can keep state in memory (and lose it on refresh). Do not call IndexedDB from `app.js` as a shortcut around this API.

---

## `app.js` — UI

Single-page, two conceptual views (can be sections on one page):

1. **Month** — year/month selector, source list (add/edit/delete), parameters panel, results + short explanations.
2. **History** — saved months; copy previous month’s sources.

Behavior:

- Changing sources or params re-runs `rules` and refreshes results immediately (Phase 1).
- Save is explicit once `store` exists (Phase 2).
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

## GitHub Pages (optional deploy)

The v1 stack is a static site. GitHub Pages can host it **without changing modules, JSDoc, or IndexedDB.** No Action build is required: publish the repo (or `/docs`) as-is.

### What carries over

| Piece | On Pages |
| --- | --- |
| `index.html` + vendored Pico + `css/style.css` + `js/*.js` ES modules | Works over HTTPS |
| Relative imports (`./rules.js`, `src="js/app.js"`) | Works |
| IndexedDB via `store.js` | Works in each visitor’s browser |
| JSON export/import | Works (download/upload) |

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
- Tailwind, Bootstrap, or a second CSS framework (Pico is the base)
- `rules.js` depending on storage or the DOM
- SQLite, WASM SQLite, PocketBase, or any local app server
- Network calls for money math or records

JSON export, a different `store` adapter, and a public backend are persistence evolutions behind `store.js`, not a new UI architecture. See [TODOS.md](./TODOS.md).
