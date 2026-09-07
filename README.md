# Colombian Contractor

A local web app to calculate **IBC (Ingreso Base de Cotización)** each month from all sources of income, so Colombian independent contractors can see what they should report and contribute for social security.

Phase 2 persistence: open the static page locally (see Run). Saved months and year parameters use IndexedDB; JSON export/import provides portable backups.

## Goal

Answer, for a given month:

- What is my IBC across every income source?
- How does each source contribute to that IBC?
- What are the resulting contribution amounts (salud, pensión, ARL, and related items)?
- Am I below the legal minimum or above the legal maximum IBC?

## Stack

Vanilla **HTML**, **Pico.css** + `css/style.css`, and **JavaScript ES modules** with **JSDoc**. No backend, no JS framework, no bundler, no TypeScript compile. Working data: **IndexedDB**, with JSON export/import backups. USD honorarios are converted with the official **TRM** (`js/trm.js`) before IBC math in COP. How modules fit together: [ARCHITECTURE.md](./ARCHITECTURE.md). SQLite and a public backend remain deferred in [TODOS.md](./TODOS.md).

## Status

Phase 2 persistence (calculator UI + IndexedDB store + JSON backups). See [PLAN.md](./PLAN.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [TODOS.md](./TODOS.md).

## Run

ES modules cannot load from `file://`. From this folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. That is a static file server, not an application backend.

## Test

Node’s built-in runner (no extra packages):

```bash
node --test
```

The same files can be served as a **GitHub Pages** site later (no bundler). IndexedDB is origin-specific and will not follow you from localhost onto `*.github.io` or another browser — export a JSON backup and import it there. Download a backup after saving important months.

## Legal note

IBC rules change (SMMLV, contribution rates, 40% rule, floors and ceilings). This tool will be an aid, not legal or accounting advice. Always confirm with current DIAN / MinTrabajo / UGPP guidance or a contador.
