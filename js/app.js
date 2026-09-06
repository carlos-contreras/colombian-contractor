// @ts-check

/**
 * @typedef {import("./rules.js").IncomeSource} IncomeSource
 * @typedef {import("./rules.js").YearParams} YearParams
 * @typedef {import("./rules.js").MonthResult} MonthResult
 * @typedef {import("./rules.js").SourceType} SourceType
 * @typedef {import("./rules.js").WarningCode} WarningCode
 */

import {
  TrmError,
  getTrm,
  getTrmMonth,
  toIsoDateBogota,
  usdToCopPesos,
} from "./trm.js";
import { computeMonth, factorForType } from "./rules.js";
import {
  MONTHS_ES,
  formatCop,
  formatUsd,
  formatYearMonth,
  lastIsoOfMonth,
  parseCop,
  parseUsd,
  previousYearMonth,
} from "./format.js";
import { hasOfficialSmmlv, loadYearParams } from "./gov.js";
import * as store from "./store.js";

/** @type {Record<WarningCode, string>} */
const WARNING_TEXT = {
  floor: "El IBC quedó en el mínimo (1 SMMLV). Confirma si aplica en tu caso.",
  ceiling: "El IBC quedó en el máximo (25 SMMLV).",
  missing_arl: "No hay tarifa ARL para la clase elegida.",
};

/** @type {string} */
let yearMonth = previousYearMonth();
/** @type {YearParams} */
let params = loadYearParams(Number(yearMonth.slice(0, 4)));
/** @type {IncomeSource[]} */
let sources = [blankSource("honorarios")];

const els = {
  year: /** @type {HTMLSelectElement} */ (document.querySelector("#year")),
  month: /** @type {HTMLSelectElement} */ (document.querySelector("#month")),
  govStatus: /** @type {HTMLElement} */ (document.querySelector("#gov-status")),
  sources: /** @type {HTMLElement} */ (document.querySelector("#sources")),
  addSource: /** @type {HTMLButtonElement} */ (document.querySelector("#add-source")),
  smmlv: /** @type {HTMLInputElement} */ (document.querySelector("#param-smmlv")),
  factor: /** @type {HTMLInputElement} */ (document.querySelector("#param-factor")),
  salud: /** @type {HTMLInputElement} */ (document.querySelector("#param-salud")),
  pension: /** @type {HTMLInputElement} */ (document.querySelector("#param-pension")),
  arl: /** @type {HTMLSelectElement} */ (document.querySelector("#param-arl")),
  fspRate: /** @type {HTMLInputElement} */ (document.querySelector("#param-fsp-rate")),
  warnings: /** @type {HTMLElement} */ (document.querySelector("#warnings")),
  results: /** @type {HTMLElement} */ (document.querySelector("#results")),
  save: /** @type {HTMLButtonElement} */ (document.querySelector("#save-month")),
  copyPrevious: /** @type {HTMLButtonElement} */ (document.querySelector("#copy-previous")),
  history: /** @type {HTMLElement} */ (document.querySelector("#history")),
};

init();

async function init() {
  fillYearMonthSelects();
  bindPeriodAndParams();
  els.addSource.addEventListener("click", () => {
    sources.push(blankSource("honorarios"));
    renderSources();
    renderResults();
  });
  els.save.addEventListener("click", onSave);
  els.copyPrevious.addEventListener("click", onCopyPrevious);
  els.sources.addEventListener("click", onSourcesClick);
  els.sources.addEventListener("change", onSourcesChange);
  els.sources.addEventListener("input", onSourcesInput);
  await loadPeriod({ resetSources: true });
  await renderHistory();
}

function bindPeriodAndParams() {
  els.year.addEventListener("change", () => void onPeriodChange());
  els.month.addEventListener("change", () => void onPeriodChange());
  els.smmlv.addEventListener("change", () => {
    params.smmlv = parseCop(els.smmlv.value);
    els.smmlv.value = formatCop(params.smmlv);
    void persistYearParams();
    renderResults();
  });
  els.factor.addEventListener("input", () => {
    params.independentFactor = Number(els.factor.value) || 0;
    for (const source of sources) {
      if (source.type !== "otro") source.factor = factorForType(source.type, params);
    }
    for (const article of els.sources.querySelectorAll("article")) {
      const source = sources.find((row) => row.id === article.dataset.id);
      const input = article.querySelector("[data-field=factor]");
      if (source && source.type !== "otro" && input instanceof HTMLInputElement) {
        input.value = String(source.factor);
      }
    }
    void persistYearParams();
    renderResults();
  });
  els.salud.addEventListener("input", () => {
    params.saludRate = Number(els.salud.value) || 0;
    void persistYearParams();
    renderResults();
  });
  els.pension.addEventListener("input", () => {
    params.pensionRate = Number(els.pension.value) || 0;
    void persistYearParams();
    renderResults();
  });
  els.arl.addEventListener("change", () => {
    params.arlClass = els.arl.value;
    void persistYearParams();
    renderResults();
  });
  els.fspRate.addEventListener("input", () => {
    params.fspRate = Number(els.fspRate.value) || 0;
    void persistYearParams();
    renderResults();
  });
}

function fillYearMonthSelects() {
  const today = toIsoDateBogota(new Date());
  const currentYear = Number(today.slice(0, 4));
  const prevYear = Number(yearMonth.slice(0, 4));
  const maxYear = Math.max(currentYear, prevYear);
  els.year.replaceChildren();
  for (let year = 2020; year <= maxYear; year += 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    els.year.append(option);
  }
  els.month.replaceChildren();
  for (const month of MONTHS_ES) {
    const option = document.createElement("option");
    option.value = month.value;
    option.textContent = month.label;
    els.month.append(option);
  }
  els.year.value = yearMonth.slice(0, 4);
  els.month.value = yearMonth.slice(5, 7);
}

function readYearMonthFromSelects() {
  return `${els.year.value}-${els.month.value}`;
}

async function onPeriodChange() {
  yearMonth = readYearMonthFromSelects();
  await loadPeriod({ resetSources: true });
}

/**
 * @param {{ resetSources: boolean }} options
 */
async function loadPeriod(options) {
  const year = Number(yearMonth.slice(0, 4));
  setGovStatus("Cargando parámetros del año…");
  if (options.resetSources) {
    const saved = await store.getMonth(yearMonth);
    if (saved) {
      sources = saved.sources.map((row) => structuredClone(row));
      params = structuredClone(saved.params);
    } else {
      params = await ensureYearParams(year);
      sources = [blankSource("honorarios")];
    }
  } else {
    params = await ensureYearParams(year);
  }
  fillParamsForm();
  renderSources();
  renderResults();

  setGovStatus("Descargando TRM del mes…");
  try {
    const days = await ensureTrmMonth(yearMonth);
    await applyCachedTrmToSources();
    renderSources();
    renderResults();
    const smmlvNote = hasOfficialSmmlv(year)
      ? `SMMLV ${year} de decreto`
      : `SMMLV ${year} (sin decreto en tabla; edítalo)`;
    setGovStatus(`${smmlvNote}. ${days} día(s) de TRM en caché.`);
  } catch (err) {
    const extra = err instanceof TrmError ? ` ${trmErrorText(err)}` : "";
    setGovStatus(`Parámetros del año en caché. No se pudo bajar la TRM del mes.${extra}`);
  }
}

/**
 * @param {number} year
 * @returns {Promise<YearParams>}
 */
async function ensureYearParams(year) {
  const cached = await store.getYearParams(year);
  if (cached) {
    return {
      ...cached,
      arlClass: params.arlClass,
      fspRate: params.fspRate,
      arlRates: cached.arlRates,
    };
  }
  const loaded = loadYearParams(year);
  loaded.arlClass = params.arlClass;
  loaded.fspRate = params.fspRate;
  await store.saveYearParams(year, loaded);
  return loaded;
}

async function persistYearParams() {
  params.year = Number(yearMonth.slice(0, 4));
  await store.saveYearParams(params.year, params);
}

/**
 * @param {string} monthKey
 * @returns {Promise<number>}
 */
async function ensureTrmMonth(monthKey) {
  const todayMonth = toIsoDateBogota(new Date()).slice(0, 7);
  const already = await store.isTrmMonthLoaded(monthKey);
  if (already && monthKey !== todayMonth) {
    const existing = await store.listTrmsForMonth(monthKey);
    return existing.length;
  }
  const byDate = await getTrmMonth(monthKey);
  await store.putTrms(Object.values(byDate));
  await store.markTrmMonthLoaded(monthKey);
  return Object.keys(byDate).length;
}

async function applyCachedTrmToSources() {
  for (const source of sources) {
    if (source.currency !== "USD") continue;
    if (!source.trmDate) source.trmDate = defaultTrmDate(yearMonth);
    const quote = await store.getCachedTrm(source.trmDate);
    if (!quote) continue;
    source.trm = quote.value;
    if (source.usd != null && source.trm > 0) {
      source.amount = usdToCopPesos(source.usd, source.trm);
    }
  }
}

/**
 * @param {string} monthKey
 */
function defaultTrmDate(monthKey) {
  const today = toIsoDateBogota(new Date());
  if (today.startsWith(`${monthKey}-`)) return today;
  return lastIsoOfMonth(monthKey);
}

/** @param {string} text */
function setGovStatus(text) {
  els.govStatus.textContent = text;
}

async function onSave() {
  const result = computeMonth(sources, params);
  await store.saveMonth(yearMonth, {
    yearMonth,
    sources: sources.map((row) => structuredClone(row)),
    params: structuredClone(params),
    result,
  });
  await renderHistory();
}

async function onCopyPrevious() {
  const summaries = await store.listMonths();
  const previous = summaries.find((row) => row.yearMonth < yearMonth);
  if (!previous) return;
  const record = await store.getMonth(previous.yearMonth);
  if (!record) return;
  sources = record.sources.map((row) => ({
    ...structuredClone(row),
    id: crypto.randomUUID(),
  }));
  renderSources();
  renderResults();
}

/**
 * @param {MouseEvent} event
 */
function onSourcesClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const article = target.closest("article");
  if (!article) return;
  const id = article.dataset.id;
  if (!id) return;
  if (target.matches("[data-delete]")) {
    sources = sources.filter((row) => row.id !== id);
    if (sources.length === 0) sources.push(blankSource("honorarios"));
    renderSources();
    renderResults();
    return;
  }
  if (target.matches("[data-trm]")) {
    void fetchTrm(id);
  }
}

/**
 * @param {Event} event
 */
function onSourcesChange(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const article = target.closest("article");
  if (!article || !article.dataset.id) return;
  const source = sources.find((row) => row.id === article.dataset.id);
  if (!source) return;

  if (target.matches("[data-field=type]") && target instanceof HTMLSelectElement) {
    source.type = /** @type {SourceType} */ (target.value);
    if (source.type !== "otro") source.factor = factorForType(source.type, params);
    if (source.type === "salario") source.currency = "COP";
    if (source.type === "honorarios" && !source.currency) source.currency = "USD";
    renderSources();
    renderResults();
    return;
  }
  if (target.matches("[data-field=currency]") && target instanceof HTMLSelectElement) {
    source.currency = /** @type {"COP" | "USD"} */ (target.value);
    if (source.currency === "COP") {
      source.usd = undefined;
    } else if (source.trm && source.usd) {
      source.amount = usdToCopPesos(source.usd, source.trm);
    }
    renderSources();
    renderResults();
  }
}

/**
 * @param {Event} event
 */
function onSourcesInput(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const article = target.closest("article");
  if (!article || !article.dataset.id) return;
  const source = sources.find((row) => row.id === article.dataset.id);
  if (!source || !(target instanceof HTMLInputElement)) return;

  const field = target.dataset.field;
  if (field === "label") source.label = target.value;
  if (field === "amount") source.amount = parseCop(target.value);
  if (field === "factor") source.factor = Number(target.value) || 0;
  if (field === "usd") {
    source.usd = parseUsd(target.value);
    if (source.trm) source.amount = usdToCopPesos(source.usd, source.trm);
    updateCopHint(article, source);
  }
  if (field === "trmDate") {
    source.trmDate = target.value;
    void applyTrmDate(source, article);
  }
  if (field === "trm") {
    source.trm = Number(target.value) || 0;
    if (source.usd != null && source.trm > 0) {
      source.amount = usdToCopPesos(source.usd, source.trm);
    }
    updateCopHint(article, source);
  }
  renderResults();
}

/**
 * @param {string} id
 */
/**
 * @param {IncomeSource} source
 * @param {Element} article
 */
async function applyTrmDate(source, article) {
  if (!source.trmDate) return;
  const quote = await store.getCachedTrm(source.trmDate);
  if (!quote) return;
  source.trm = quote.value;
  const trmInput = article.querySelector("[data-field=trm]");
  if (trmInput instanceof HTMLInputElement) trmInput.value = String(quote.value);
  if (source.usd != null && source.trm > 0) {
    source.amount = usdToCopPesos(source.usd, source.trm);
  }
  updateCopHint(/** @type {HTMLElement} */ (article), source);
  const status = article.querySelector(".trm-status");
  if (status) status.textContent = `Caché ${quote.validFrom} – ${quote.validTo}`;
  renderResults();
}

async function fetchTrm(id) {
  const source = sources.find((row) => row.id === id);
  const article = els.sources.querySelector(`[data-id="${id}"]`);
  if (!source || !article) return;
  const status = article.querySelector(".trm-status");
  const date = source.trmDate || defaultTrmDate(yearMonth);
  source.trmDate = date;
  const dateInput = article.querySelector("[data-field=trmDate]");
  if (dateInput instanceof HTMLInputElement) dateInput.value = date;
  const cached = await store.getCachedTrm(date);
  if (cached) {
    source.trm = cached.value;
    const trmInput = article.querySelector("[data-field=trm]");
    if (trmInput instanceof HTMLInputElement) trmInput.value = String(cached.value);
    if (source.usd != null) source.amount = usdToCopPesos(source.usd, source.trm);
    updateCopHint(article, source);
    if (status) status.textContent = `Caché ${cached.validFrom} – ${cached.validTo}`;
    renderResults();
    return;
  }
  if (status) status.textContent = "Consultando TRM…";
  try {
    const quote = await getTrm(date);
    await store.putTrms([quote]);
    source.trm = quote.value;
    const trmInput = article.querySelector("[data-field=trm]");
    if (trmInput instanceof HTMLInputElement) trmInput.value = String(quote.value);
    if (source.usd != null) source.amount = usdToCopPesos(source.usd, source.trm);
    updateCopHint(article, source);
    if (status) {
      status.textContent = `Vigente ${quote.validFrom} – ${quote.validTo}`;
    }
    renderResults();
  } catch (err) {
    const message =
      err instanceof TrmError
        ? trmErrorText(err)
        : "No se pudo consultar la TRM. Escríbela a mano.";
    if (status) status.textContent = message;
  }
}

/**
 * @param {TrmError} err
 */
function trmErrorText(err) {
  if (err.code === "not_found") return "No hay TRM publicada para esa fecha. Escríbela a mano.";
  if (err.code === "network") return "Sin red o datos.gov.co no respondió. Escríbela a mano.";
  if (err.code === "bad_date") return "Fecha TRM inválida.";
  return "No se pudo leer la TRM. Escríbela a mano.";
}

function fillParamsForm() {
  els.smmlv.value = formatCop(params.smmlv);
  els.factor.value = String(params.independentFactor);
  els.salud.value = String(params.saludRate);
  els.pension.value = String(params.pensionRate);
  els.arl.value = params.arlClass;
  els.fspRate.value = String(params.fspRate ?? 0);
}

function renderSources() {
  els.sources.replaceChildren(...sources.map(sourceArticle));
}

/**
 * @param {IncomeSource} source
 */
function sourceArticle(source) {
  const article = document.createElement("article");
  article.className = "source";
  article.dataset.id = source.id;
  const usd = source.currency === "USD";
  const factorLocked = source.type !== "otro";
  article.innerHTML = `
    <header>
      <h3>${escapeHtml(source.label || labelForType(source.type))}</h3>
      <button type="button" data-delete class="secondary">Eliminar</button>
    </header>
    <div class="grid-2">
      <label>
        Tipo
        <select data-field="type">
          <option value="honorarios"${sel(source.type === "honorarios")}>Honorarios / servicios</option>
          <option value="salario"${sel(source.type === "salario")}>Salario</option>
          <option value="otro"${sel(source.type === "otro")}>Otro</option>
        </select>
      </label>
      <label>
        Etiqueta
        <input data-field="label" type="text" value="${escapeAttr(source.label)}" placeholder="Cliente, contrato…">
      </label>
      <label>
        Moneda
        <select data-field="currency">
          <option value="COP"${sel(!usd)}>COP</option>
          <option value="USD"${sel(usd)}>USD</option>
        </select>
      </label>
      ${
        usd
          ? `
      <label>
        Monto USD
        <input data-field="usd" type="text" inputmode="decimal" value="${escapeAttr(source.usd ? String(source.usd) : "")}" autocomplete="off">
      </label>
      <label>
        Fecha TRM
        <input data-field="trmDate" type="date" value="${escapeAttr(source.trmDate || "")}">
      </label>
      <label>
        TRM (COP por USD)
        <input data-field="trm" type="number" min="0" step="0.01" value="${source.trm ?? ""}">
      </label>
      `
          : `
      <label>
        Monto COP
        <input data-field="amount" type="text" inputmode="numeric" value="${escapeAttr(source.amount ? String(source.amount) : "")}" autocomplete="off">
      </label>
      `
      }
      <label>
        Factor IBC
        <input data-field="factor" type="number" min="0" max="1" step="0.01" value="${source.factor}" ${factorLocked ? "readonly" : ""}>
      </label>
    </div>
    ${
      usd
        ? `<p class="toolbar"><button type="button" data-trm>Consultar TRM</button>
           <span class="trm-status muted"></span></p>
           <p class="explain cop-hint">${copHint(source)}</p>`
        : ""
    }
  `;
  return article;
}

/**
 * @param {HTMLElement} article
 * @param {IncomeSource} source
 */
function updateCopHint(article, source) {
  const hint = article.querySelector(".cop-hint");
  if (hint) hint.textContent = copHint(source);
}

/**
 * @param {IncomeSource} source
 */
function copHint(source) {
  if (!source.trm || source.usd == null) {
    return "COP equivalente: consulta o escribe la TRM.";
  }
  return `COP equivalente: ${formatCop(source.amount)} (${formatUsd(source.usd)} × ${source.trm})`;
}

function renderResults() {
  const result = computeMonth(sources, params);
  if (result.warnings.length > 0) {
    els.warnings.className = "warnings";
    els.warnings.innerHTML = result.warnings
      .map((code) => `<p>${escapeHtml(WARNING_TEXT[code])}</p>`)
      .join("");
  } else {
    els.warnings.className = "";
    els.warnings.replaceChildren();
  }

  const lines = result.perSource
    .map((line) => {
      const source = sources.find((row) => row.id === line.id);
      const name = escapeHtml(source?.label || labelForType(source?.type ?? "otro"));
      const pct = Math.round(line.factor * 1000) / 10;
      return `<tr>
        <td>${name}</td>
        <td class="money">${formatCop(line.amount)}</td>
        <td>${pct} %</td>
        <td class="money">${formatCop(line.ibc)}</td>
      </tr>
      <tr><td colspan="4" class="explain">${pct} % de ${formatCop(line.amount)} = ${formatCop(line.ibc)}</td></tr>`;
    })
    .join("");

  els.results.innerHTML = `
    <table>
      <thead>
        <tr><th>Fuente</th><th>Bruto</th><th>Factor</th><th>IBC</th></tr>
      </thead>
      <tbody>${lines}</tbody>
    </table>
    <table>
      <tbody>
        <tr><th>Ingreso bruto</th><td class="money">${formatCop(result.grossTotal)}</td></tr>
        <tr><th>IBC crudo</th><td class="money">${formatCop(result.ibcRaw)}</td></tr>
        <tr><th>IBC techo (25 SMMLV)</th><td class="money">${formatCop(result.ibcCapped)}</td></tr>
        <tr><th>IBC final</th><td class="money">${formatCop(result.ibcFinal)}</td></tr>
        <tr><th>Salud</th><td class="money">${formatCop(result.salud)}</td></tr>
        <tr><th>Pensión</th><td class="money">${formatCop(result.pension)}</td></tr>
        <tr><th>ARL</th><td class="money">${formatCop(result.arl)}</td></tr>
        <tr><th>FSP</th><td class="money">${formatCop(result.fsp)}</td></tr>
        <tr><th>Total aportes</th><td class="money">${formatCop(result.totalContributions)}</td></tr>
        <tr><th>Queda después de aportes</th><td class="money">${formatCop(result.cashAfter)}</td></tr>
      </tbody>
    </table>
    <p class="explain">Piso 1 SMMLV = ${formatCop(params.smmlv)}. Techo 25 SMMLV = ${formatCop(25 * params.smmlv)}.</p>
  `;
}

async function renderHistory() {
  const summaries = await store.listMonths();
  if (summaries.length === 0) {
    els.history.innerHTML = "<p class=\"muted\">Aún no hay meses guardados en esta sesión.</p>";
    return;
  }
  els.history.innerHTML = `<table>
    <thead><tr><th>Mes</th><th>IBC</th><th>Aportes</th></tr></thead>
    <tbody>
      ${summaries
        .map(
          (row) => `<tr>
            <td>${escapeHtml(formatYearMonth(row.yearMonth))}</td>
            <td class="money">${formatCop(row.ibcFinal)}</td>
            <td class="money">${formatCop(row.totalContributions)}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

/**
 * @param {SourceType} type
 * @returns {IncomeSource}
 */
function blankSource(type) {
  return {
    id: crypto.randomUUID(),
    type,
    label: "",
    amount: 0,
    factor: factorForType(type, params),
    currency: type === "honorarios" ? "USD" : "COP",
    usd: type === "honorarios" ? 0 : undefined,
    trmDate: defaultTrmDate(yearMonth),
  };
}

/**
 * @param {SourceType} type
 */
function labelForType(type) {
  if (type === "honorarios") return "Honorarios";
  if (type === "salario") return "Salario";
  return "Otro";
}

/**
 * @param {boolean} on
 */
function sel(on) {
  return on ? " selected" : "";
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * @param {string} value
 */
function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
