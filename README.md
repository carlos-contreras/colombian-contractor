# Colombian Contractor

A local web app to calculate **IBC (Ingreso Base de Cotización)** each month from all sources of income, so Colombian independent contractors can see what they should report and contribute for social security.

This is a personal planning-stage project. There is no application UI yet.

## Goal

Answer, for a given month:

- What is my IBC across every income source?
- How does each source contribute to that IBC?
- What are the resulting contribution amounts (salud, pensión, ARL, and related items)?
- Am I below the legal minimum or above the legal maximum IBC?

## Stack

Vanilla **HTML**, **Pico.css** + `css/style.css`, and **JavaScript ES modules** with **JSDoc**. No backend, no JS framework, no bundler, no TypeScript compile. v1 working data: **IndexedDB**. USD honorarios are converted with the official **TRM** (`js/trm.js`) before IBC math in COP. How modules fit together: [ARCHITECTURE.md](./ARCHITECTURE.md). Later persistence (JSON backups, `store` API, SQLite, public backend) is listed in [TODOS.md](./TODOS.md).

## Status

Planning only. See [PLAN.md](./PLAN.md) for scope and phases, [ARCHITECTURE.md](./ARCHITECTURE.md) for module layout, and [TODOS.md](./TODOS.md) for deferred persistence work.

## Run (later)

ES modules cannot load from `file://`. From this folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. That is a static file server, not an application backend.

The same files can be served as a **GitHub Pages** site later (no bundler). IndexedDB will not follow you from localhost onto `*.github.io` — use JSON export/import. Details: [ARCHITECTURE.md](./ARCHITECTURE.md#github-pages-optional-deploy).

## Legal note

IBC rules change (SMMLV, contribution rates, 40% rule, floors and ceilings). This tool will be an aid, not legal or accounting advice. Always confirm with current DIAN / MinTrabajo / UGPP guidance or a contador.
