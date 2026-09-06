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
| Independent services / honorarios | IBC = **40%** of monthly honorarios (net of IVA if invoiced with IVA) |
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

The UI must make **year parameters** explicit (SMMLV, rates, 40% factor) so they can be updated without rewriting logic.

## Income sources (v1)

Each source has a type, a label, and a monthly amount.

1. **Honorarios / prestación de servicios** — 40% rule.
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

- Selector: year + month.
- List of income sources for that month (add / edit / delete).
- Parameters panel: SMMLV, IBC factor, contribution rates, ARL class, FSP threshold.
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

**Persistence**

- `localStorage` JSON: `{ parametersByYear, months: { "2026-03": { sources: [...] } } }`
- Export / import JSON (backup).

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

Until those are answered, the code should keep rules in a single `rules.js` (or equivalent) with comments pointing at the decision.

## UX / UI notes

- Language: **Spanish (Colombia)** in the UI; this PLAN/README can stay in English.
- Format money as `$ 1.234.567` (COP, period thousands).
- Mobile-friendly: phone use while invoicing is likely.
- No dark-pattern chrome; a simple form + results table is enough.
- Show warnings: IBC at floor, IBC at ceiling, missing ARL class, rates year mismatch.

## Technical plan

```
colombian-contractor/
  README.md
  PLAN.md
  index.html          # later
  css/style.css       # later
  js/
    app.js            # later — UI
    rules.js          # later — IBC + contributions
    store.js          # later — localStorage
    format.js         # later — COP / dates
```

- No bundler, no npm required for v1.
- Small functions, testable by hand; optional later: a few pure-function checks in a `js/rules.test.html` or console asserts.
- Accessibility: labels on inputs, keyboard-usable.

## Phases

### Phase 0 — Planning (this folder)

- [x] Local git repo
- [x] README.md
- [x] PLAN.md
- [ ] Research checkpoint: answer the six open questions and write them into `rules` notes

### Phase 1 — Static calculator

- Month + sources form
- IBC and contribution results
- Hard-coded year parameters (editable in the UI)

### Phase 2 — Persistence and history

- Save months
- Duplicate previous month
- JSON export/import
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

## Next step

After this PLAN is accepted:

1. Fill the research checkpoint (even as “assumed, pending accountant review”).
2. Scaffold `index.html` + CSS + `rules.js` with the formula above and a tiny demo dataset.
