# Colombian Contractor

A local web app to calculate **IBC (Ingreso Base de Cotización)** each month from all sources of income, so Colombian independent contractors can see what they should report and contribute for social security.

Cloud persistence: the static page uses Supabase Auth and Postgres for saved data; JSON export/import remains the portable backup format.

## Goal

Answer, for a given month:

- What is my IBC across every income source?
- How does each source contribute to that IBC?
- What are the resulting contribution amounts (salud, pensión, ARL, and related items)?
- Am I below the legal minimum or above the legal maximum IBC?

## Stack

Vanilla **HTML**, **Pico.css** + `css/style.css`, and **JavaScript ES modules** with **JSDoc**. The frontend is static, with Supabase Auth/Postgres as the cloud backend. JSON export/import remains an independent backup. USD honorarios are converted with the official **TRM** (`js/trm.js`) before IBC math in COP. How modules fit together: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Status

Supabase persistence (authentication + cloud store) with JSON backups preserved. See [PLAN.md](./PLAN.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [TODOS.md](./TODOS.md).

## Run

ES modules cannot load from `file://`. From this folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. The page is static, but it connects to the configured Supabase project for authentication and persistence.

## Test

Node’s built-in runner (no extra packages):

```bash
node --test
```

The same files can be served as a **GitHub Pages** site (no bundler). Saved data is associated with the authenticated Supabase account and can be used across browsers and devices. JSON export/import remains the independent backup and migration path. Do not expose a Supabase service-role key; the browser uses only the publishable key and RLS.

## Legal note

IBC rules change (SMMLV, contribution rates, 40% rule, floors and ceilings). This tool will be an aid, not legal or accounting advice. Always confirm with current DIAN / MinTrabajo / UGPP guidance or a contador.
