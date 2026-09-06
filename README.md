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

Vanilla **HTML**, **CSS**, and **JavaScript**. No backend, no framework, no build step. Data stays in the browser (planned: `localStorage`).

## Status

Planning only. See [PLAN.md](./PLAN.md) for scope, calculation rules to implement, and delivery phases.

## Run (later)

Once the app exists, open `index.html` in a browser. No server required.

## Legal note

IBC rules change (SMMLV, contribution rates, 40% rule, floors and ceilings). This tool will be an aid, not legal or accounting advice. Always confirm with current DIAN / MinTrabajo / UGPP guidance or a contador.
