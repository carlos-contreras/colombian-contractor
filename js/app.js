// @ts-check

/**
 * @typedef {import("./rules.js").IncomeSource} IncomeSource
 * @typedef {import("./rules.js").YearParams} YearParams
 * @typedef {import("./rules.js").MonthResult} MonthResult
 * @typedef {import("./rules.js").SourceIbc} SourceIbc
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
import { computeMonth } from "./rules.js";
import {
  DEFAULT_UGPP_ACTIVITY,
  UGPP_ACTIVITIES,
  activityExplain,
  getUgppActivity,
  syncSourceFactor,
} from "./ugpp.js";
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
  missing_ugpp_activity: "Elegiste presunción de costos: falta la actividad UGPP.",
};

/** @type {Set<string>} */
const trmCachedDates = new Set();

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
  salud: /** @type {HTMLInputElement} */ (document.querySelector("#param-salud")),
  pension: /** @type {HTMLInputElement} */ (document.querySelector("#param-pension")),
  fspRate: /** @type {HTMLInputElement} */ (document.querySelector("#param-fsp-rate")),
  warnings: /** @type {HTMLElement} */ (document.querySelector("#warnings")),
  results: /** @type {HTMLElement} */ (document.querySelector("#results")),
  save: /** @type {HTMLButtonElement} */ (document.querySelector("#save-month")),
  copyPrevious: /** @type {HTMLButtonElement} */ (document.querySelector("#copy-previous")),
  history: /** @type {HTMLElement} */ (document.querySelector("#history")),
  exportData: /** @type {HTMLButtonElement} */ (document.querySelector("#export-data")),
  importData: /** @type {HTMLButtonElement} */ (document.querySelector("#import-data")),
  importFile: /** @type {HTMLInputElement} */ (document.querySelector("#import-file")),
};

init();

async function init() {
  fillYearMonthSelects();
  bindPeriodAndParams();
  if (!els.addSource.dataset.listener) {
    els.addSource.dataset.listener = "1";
    els.addSource.addEventListener("click", () => {
      sources.push(blankSource("honorarios"));
      renderSources();
      renderResults();
    });
  }

  const resetBtn = document.querySelector("#reset-data");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (confirm("¿Limpiar todos los datos de esta sesión?")) {
        await store.clearAll();
        trmCachedDates.clear();
        yearMonth = previousYearMonth();
        els.year.value = yearMonth.slice(0, 4);
        els.month.value = yearMonth.slice(5, 7);
        sources = [blankSource("honorarios")];
        params = loadYearParams(Number(yearMonth.slice(0, 4)));
        fillParamsForm();
        renderSources();
        renderResults();
        renderHistory();
        setGovStatus("");
      }
    });
  }
  const toggleParamsBtn = document.querySelector("#toggle-params");
  const paramsSection = document.querySelector("#params-section");
  if (toggleParamsBtn && paramsSection) {
    toggleParamsBtn.addEventListener("click", () => {
      if (paramsSection.hasAttribute("hidden")) {
        paramsSection.removeAttribute("hidden");
        toggleParamsBtn.textContent = "Guardar parámetros del año";
      } else {
        paramsSection.setAttribute("hidden", "");
        toggleParamsBtn.textContent = "Editar parámetros del año";
      }
      updateParamsSummary();
    });
  }

  els.save.addEventListener("click", onSave);
  els.copyPrevious.addEventListener("click", onCopyPrevious);
  els.exportData.addEventListener("click", onExportData);
  els.importData.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", onImportData);
  els.sources.addEventListener("click", onSourcesClick);
  els.sources.addEventListener("change", onSourcesChange);
  els.sources.addEventListener("input", onSourcesInput);
  els.sources.addEventListener("blur", onSourcesBlur, true);

  els.history.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-load]");
    if (btn) {
      await loadMonth(btn.dataset.load);
    }
  });

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
  els.salud.addEventListener("input", () => {
    params.saludRate = (Number(els.salud.value) || 0) / 100;
    void persistYearParams();
    renderResults();
  });
  els.pension.addEventListener("input", () => {
    params.pensionRate = (Number(els.pension.value) || 0) / 100;
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
  if (sources.length === 0) {
    sources = [blankSource("honorarios")];
  }
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
  const loaded = loadYearParams(year);
  const cached = await store.getYearParams(year);
  if (cached) {
    const next = {
      ...cached,
      arlClass: params.arlClass,
      fspRate: params.fspRate,
      arlRates: cached.arlRates,
    };
    if (hasOfficialSmmlv(year)) next.smmlv = loaded.smmlv;
    await store.saveYearParams(year, next);
    return next;
  }
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
    for (const quote of existing) trmCachedDates.add(quote.date);
    return existing.length;
  }
  const byDate = await getTrmMonth(monthKey);
  await store.putTrms(Object.values(byDate));
  await store.markTrmMonthLoaded(monthKey);
  for (const day of Object.keys(byDate)) trmCachedDates.add(day);
  return Object.keys(byDate).length;
}

async function applyCachedTrmToSources() {
  for (const source of sources) {
    if (source.currency !== "USD") continue;
    if (!source.trmDate) source.trmDate = defaultTrmDate(yearMonth);
    const quote = await store.getCachedTrm(source.trmDate);
    if (!quote) continue;
    trmCachedDates.add(source.trmDate);
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
  showToast("Mes guardado");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.removeAttribute("hidden");
  setTimeout(() => {
    toast.setAttribute("hidden", "");
  }, 2200);
}

async function onExportData() {
  const payload = await store.exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `colombian-contractor-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Respaldo exportado");
}

/** @param {Event} event */
async function onImportData(event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  if (!file) return;
  input.value = "";
  if (!confirm("¿Reemplazar todos los datos actuales con este respaldo?")) return;
  try {
    const payload = JSON.parse(await file.text());
    await store.importAll(payload);
    trmCachedDates.clear();
    await loadPeriod({ resetSources: true });
    await renderHistory();
    showToast("Respaldo importado");
  } catch (error) {
    console.error(error);
    alert("No se pudo importar el respaldo. Verifica que sea un archivo JSON válido.");
  }
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
    if (!confirm("¿Eliminar esta fuente de ingreso?")) return;
    sources = sources.filter((row) => row.id !== id);
    if (sources.length === 0) sources.push(blankSource("honorarios"));
    renderSources();
    renderResults();
    return;
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
    if (source.type === "salario") {
      source.currency = "COP";
      source.presuncion = undefined;
      source.ugppActivity = undefined;
    }
    if (source.type === "honorarios") {
      if (!source.currency) source.currency = "USD";
      source.presuncion = source.presuncion ?? "sin";
      source.costMode = undefined;
      // ARL stays undefined by default (optional per source)
    }
    if (source.type === "renta_capital") {
      source.presuncion = undefined;
      source.ugppActivity = undefined;
      source.currency = "COP";
      source.usd = undefined;
      source.rentaKind = source.rentaKind ?? "arrendamiento";
      source.costMode = source.costMode ?? "presunto";
      source.rentaTiming = source.rentaTiming ?? "cash";
    }
    syncSourceFactor(source);
    renderSources();
    renderResults();
    return;
  }
  if (target.matches("[data-field=presuncion]") && target instanceof HTMLSelectElement) {
    source.presuncion = /** @type {"sin" | "ugpp"} */ (target.value);
    if (source.presuncion === "ugpp" && !source.ugppActivity) {
      source.ugppActivity = DEFAULT_UGPP_ACTIVITY;
    }
    if (source.presuncion === "sin") source.ugppActivity = undefined;
    syncSourceFactor(source);
    renderSources();
    renderResults();
    return;
  }
  if (target.matches("[data-field=ugppActivity]") && target instanceof HTMLSelectElement) {
    source.ugppActivity = target.value;
    syncSourceFactor(source);
    renderSources();
    renderResults();
    return;
  }
  if (target.matches("[data-field=arlClass]") && target instanceof HTMLSelectElement) {
    source.arlClass = target.value || undefined;
    renderResults();
    return;
  }
  if (target.matches("[data-field=rentaKind]") && target instanceof HTMLSelectElement) {
    source.rentaKind = /** @type {NonNullable<IncomeSource["rentaKind"]>} */ (target.value);
    renderResults();
    return;
  }
  if (target.matches("[data-field=costMode]") && target instanceof HTMLSelectElement) {
    source.costMode = /** @type {"real" | "presunto"} */ (target.value);
    renderSources();
    renderResults();
    return;
  }
  if (target.matches("[data-field=rentaTiming]") && target instanceof HTMLSelectElement) {
    source.rentaTiming = /** @type {"accrued" | "cash"} */ (target.value);
    renderResults();
    return;
  }
  if (target.matches("[data-field=currency]") && target instanceof HTMLSelectElement) {
    source.currency = /** @type {"COP" | "USD"} */ (target.value);
    if (source.currency === "COP") {
      source.usd = undefined;
      renderSources();
      renderResults();
      return;
    }
    if (!source.trmDate) source.trmDate = defaultTrmDate(yearMonth);
    renderSources();
    const usdArticle = els.sources.querySelector(`[data-id="${source.id}"]`);
    if (usdArticle) void applyTrmDate(source, usdArticle);
    else renderResults();
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
  if (field === "costAmount") source.costAmount = parseCop(target.value);
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
    source.trm = parseUsd(target.value);
    if (source.usd != null && source.trm > 0) {
      source.amount = usdToCopPesos(source.usd, source.trm);
    }
    updateCopHint(article, source);
  }
  renderResults();
}

/**
 * @param {FocusEvent} event
 */
function onSourcesBlur(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  if (!(target instanceof HTMLInputElement)) return;

  const field = target.dataset.field;
  if (field !== "amount" && field !== "usd" && field !== "trm" && field !== "costAmount") return;

  const article = target.closest("article");
  if (!article || !article.dataset.id) return;
  const source = sources.find((row) => row.id === article.dataset.id);
  if (!source) return;

  if (field === "amount" && source.amount > 0) {
    target.value = formatCop(source.amount);
  }
  if (field === "usd" && source.usd != null) {
    target.value = formatUsd(source.usd);
  }
  if (field === "trm" && source.trm != null) {
    target.value = formatUsd(source.trm);
  }
  if (field === "costAmount" && source.costAmount != null && source.costAmount > 0) {
    target.value = formatCop(source.costAmount);
  }
}

/**
 * @param {IncomeSource} source
 * @param {Element} article
 */
async function applyTrmDate(source, article) {
  if (!source.trmDate) return;
  const status = article.querySelector(".trm-status");
  let quote = await store.getCachedTrm(source.trmDate);
  if (!quote) {
    if (status) status.textContent = "Buscando TRM…";
    try {
      quote = await getTrm(source.trmDate);
      await store.putTrms([quote]);
    } catch (err) {
      const message =
        err instanceof TrmError
          ? trmErrorText(err)
          : "No hay TRM en caché. Escríbela a mano.";
      if (status) status.textContent = message;
      const trmInput = article.querySelector("[data-field=trm]");
      if (trmInput instanceof HTMLInputElement) {
        trmInput.readOnly = false;
        trmInput.removeAttribute("aria-readonly");
        trmInput.removeAttribute("title");
      }
      return;
    }
  }
  trmCachedDates.add(source.trmDate);
  source.trm = quote.value;
  const trmInput = article.querySelector("[data-field=trm]");
  if (trmInput instanceof HTMLInputElement) {
    trmInput.value = formatUsd(quote.value);
    trmInput.readOnly = true;
    trmInput.setAttribute("aria-readonly", "true");
    trmInput.title = "TRM oficial cargada; cambia la fecha para consultar otra tasa";
  }
  if (source.usd != null && source.trm > 0) {
    source.amount = usdToCopPesos(source.usd, source.trm);
  }
  updateCopHint(/** @type {HTMLElement} */ (article), source);
  if (status) status.textContent = `TRM ${quote.validFrom} – ${quote.validTo}`;
  renderResults();
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

function updateParamsSummary() {
  const summaryEl = document.querySelector("#params-summary");
  if (!summaryEl) return;
  const paramsSection = document.querySelector("#params-section");
  const isHidden = paramsSection && paramsSection.hasAttribute("hidden");
  if (isHidden) {
    summaryEl.textContent = `SMMLV ${formatCop(params.smmlv)} · Salud ${(params.saludRate * 100).toFixed(1)}% · Pensión ${(params.pensionRate * 100).toFixed(1)}%`;
  } else {
    summaryEl.textContent = "";
  }
}

function fillParamsForm() {
  els.smmlv.value = formatCop(params.smmlv);
  els.salud.value = String(params.saludRate * 100);
  els.pension.value = String(params.pensionRate * 100);
  // els.arl removed (now per-source)
  updateParamsSummary();
}

function renderSources() {
  if (sources.length === 0) {
    els.sources.innerHTML = '<p class="muted">No hay fuentes de ingreso. Agrega una para comenzar.</p>';
    return;
  }
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
  const trmLocked = trmFieldLocked(source);
  article.innerHTML = `
    <header>
      <h3>${escapeHtml(source.label || labelForType(source.type))}</h3>
      <button type="button" data-delete class="secondary" aria-label="Eliminar fuente">×</button>
    </header>
    <div class="grid-2">
      <label>
        Tipo
        <select data-field="type">
          <option value="honorarios"${sel(source.type === "honorarios")}>Honorarios / servicios</option>
          <option value="renta_capital"${sel(source.type === "renta_capital")}>Renta de capital</option>
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
        <input data-field="usd" type="text" inputmode="decimal" value="${source.usd != null ? escapeAttr(formatUsd(source.usd)) : ""}" autocomplete="off">
      </label>
      <label>
        Fecha TRM
        <input data-field="trmDate" type="date" value="${escapeAttr(source.trmDate || "")}">
      </label>
      <label>
        TRM (COP por USD)
        <input data-field="trm" type="text" inputmode="decimal" value="${source.trm != null ? escapeAttr(formatUsd(source.trm)) : ""}"${trmLocked ? " readonly aria-readonly=\"true\" title=\"TRM oficial cargada; cambia la fecha para consultar otra tasa\"" : ""}>
        ${trmLocked ? '<small class="muted">TRM oficial cargada; no editable.</small>' : ""}
      </label>
      `
          : `
      <label>
        Monto COP
        <input data-field="amount" type="text" inputmode="numeric" value="${source.amount ? escapeAttr(formatCop(source.amount)) : ""}" autocomplete="off">
      </label>
      `
      }
      ${honorariosFields(source)}
      ${capitalFields(source)}
      ${
        source.type === "otro"
          ? `<label>
        Factor IBC
        <input data-field="factor" type="number" min="0" max="1" step="0.01" value="${source.factor}">
      </label>`
          : ""
      }
    </div>
    ${
      usd
        ? `<p class="explain cop-hint">${copHint(source)}</p>
           <p class="trm-status muted"></p>`
        : ""
    }
    ${honorariosExplain(source)}
    ${capitalExplain(source)}
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
/**
 * @param {IncomeSource | undefined} source
 * @param {SourceIbc} line
 */
function lineExplain(source, line) {
  if (source?.type === "renta_capital") {
    return `40 % del neto ${formatCop(line.net ?? 0)} = ${formatCop(line.ibc)}`;
  }
  const pct = Math.round(line.factor * 1000) / 10;
  return `${pct} % de ${formatCop(line.amount)} = ${formatCop(line.ibc)}`;
}

function copHint(source) {
  if (!source.trm || source.usd == null) {
    return "COP equivalente: la TRM sale de la fecha (caché). Si no hay valor, escríbela a mano.";
  }
  return `COP equivalente: ${formatCop(source.amount)} (${formatUsd(source.usd)} × ${source.trm})`;
}

/**
 * @param {IncomeSource} source
 */
function trmFieldLocked(source) {
  return Boolean(
    source.trm != null &&
      source.trmDate &&
      trmCachedDates.has(source.trmDate),
  );
}

function renderResults() {
  for (const source of sources) syncSourceFactor(source);
  const result = computeMonth(sources, params);

  // Disable save button if no positive amounts
  const hasData = sources.some((s) => (s.amount || 0) > 0);
  if (els.save) els.save.disabled = !hasData;
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
      <tr><td colspan="4" class="explain">${escapeHtml(lineExplain(source, line))}</td></tr>`;
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
        <tr><th>IBC honorarios</th><td class="money">${formatCop(result.ibcHonorarios)}</td></tr>
        <tr><th>IBC rentas de capital</th><td class="money">${formatCop(result.ibcCapital)}</td></tr>
        <tr><th>IBC salario</th><td class="money">${formatCop(result.ibcSalario)}</td></tr>
        <tr><th>IBC crudo (suma)</th><td class="money">${formatCop(result.ibcRaw)}</td></tr>
        <tr><th>IBC techo (25 SMMLV)</th><td class="money">${formatCop(result.ibcCapped)}</td></tr>
        <tr><th>IBC final</th><td class="money">${formatCop(result.ibcFinal)}</td></tr>
        <tr><th>Salud</th><td class="money">${formatCop(result.salud)}</td></tr>
        <tr><th>Pensión</th><td class="money">${formatCop(result.pension)}</td></tr>
        <tr><th>ARL</th><td class="money">${formatCop(result.arl)}</td></tr>
        <tr><th>FSP Solidaridad</th><td class="money">${formatCop(result.fspSolidaridad)}</td></tr>
        <tr><th>FSP Subsistencia</th><td class="money">${formatCop(result.fspSubsistencia)}</td></tr>
        <tr><th>FSP total</th><td class="money">${formatCop(result.fsp)}</td></tr>
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
    <thead><tr><th>Mes</th><th>IBC</th><th>Aportes</th><th></th></tr></thead>
    <tbody>
      ${summaries
        .map(
          (row) => `<tr>
            <td>${escapeHtml(formatYearMonth(row.yearMonth))}</td>
            <td class="money">${formatCop(row.ibcFinal)}</td>
            <td class="money">${formatCop(row.totalContributions)}</td>
            <td><button type="button" class="secondary" data-load="${row.yearMonth}">Cargar</button></td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

async function loadMonth(yearMonthToLoad) {
  const record = await store.getMonth(yearMonthToLoad);
  if (!record) return;
  yearMonth = yearMonthToLoad;
  sources = record.sources.map((row) => structuredClone(row));
  params = structuredClone(record.params);
  els.year.value = yearMonth.slice(0, 4);
  els.month.value = yearMonth.slice(5, 7);
  fillParamsForm();
  renderSources();
  renderResults();
  updateParamsSummary();
}

/**
 * @param {SourceType} type
 * @returns {IncomeSource}
 */
function blankSource(type) {
  /** @type {IncomeSource} */
  const source = {
    id: crypto.randomUUID(),
    type,
    label: "",
    amount: 0,
    factor: type === "salario" ? 1 : 0.4,
    currency: type === "honorarios" ? "USD" : "COP",
    usd: type === "honorarios" ? 0 : undefined,
    trmDate: defaultTrmDate(yearMonth),
    presuncion: type === "honorarios" ? "sin" : undefined,
    arlClass: type === "honorarios" ? undefined : undefined,
    rentaKind: type === "renta_capital" ? "arrendamiento" : undefined,
    costMode: type === "renta_capital" ? "presunto" : undefined,
    rentaTiming: type === "renta_capital" ? "cash" : undefined,
  };
  syncSourceFactor(source);
  return source;
}

/**
 * @param {IncomeSource} source
 */
function honorariosFields(source) {
  if (source.type !== "honorarios") return "";
  const mode = source.presuncion === "ugpp" ? "ugpp" : "sin";
  const activityOptions = UGPP_ACTIVITIES.map(
    (row) =>
      `<option value="${row.id}"${sel(source.ugppActivity === row.id)}>${escapeHtml(row.label)}</option>`,
  ).join("");
  return `
      <label>
        Presunción de costos
        <select data-field="presuncion">
          <option value="sin"${sel(mode === "sin")}>Sin presunción (IBC 40&nbsp;%)</option>
          <option value="ugpp"${sel(mode === "ugpp")}>Con presunción de costos (UGPP)</option>
        </select>
      </label>
      ${
        mode === "ugpp"
          ? `<label>
        Actividad UGPP
        <select data-field="ugppActivity">
          ${activityOptions}
        </select>
      </label>`
          : ""
      }
      <div class="legend">
        <p><strong>Sin presunción:</strong> regla general del independiente que no subcontrata o que no arrienda espacios, maquinaria o equipos. El IBC es el <strong>40&nbsp;%</strong> del ingreso (el 60&nbsp;% se trata como costo). Úsala si no aplicas tabla UGPP.</p>
        <p><strong>Con presunción (UGPP):</strong> la UGPP presume un porcentaje de costos según la <strong>actividad</strong>. cuendo el independiente acarrea costos como arriendos, empleados, equipos, materias primas, etc. El IBC es lo que queda (100&nbsp;% − costos). Elige esto solo si vas a cotizar con esa tabla; después aparece la actividad.</p>
      </div>
      <label>
        Clase ARL (opcional)
        <select data-field="arlClass">
          <option value=""${sel(!source.arlClass)}>Ninguna</option>
          <option value="I"${sel(source.arlClass === "I")}>I — Riesgo mínimo (oficina, software) · 0,522&nbsp;%</option>
          <option value="II"${sel(source.arlClass === "II")}>II — Riesgo bajo · 1,044&nbsp;%</option>
          <option value="III"${sel(source.arlClass === "III")}>III — Riesgo medio · 2,436&nbsp;%</option>
          <option value="IV"${sel(source.arlClass === "IV")}>IV — Riesgo alto · 4,350&nbsp;%</option>
          <option value="V"${sel(source.arlClass === "V")}>V — Riesgo máximo · 6,960&nbsp;%</option>
        </select>
      </label>`;
}

/**
 * @param {IncomeSource} source
 */
function honorariosExplain(source) {
  if (source.type !== "honorarios") return "";
  if (source.presuncion === "ugpp") {
    const activity = source.ugppActivity ? getUgppActivity(source.ugppActivity) : undefined;
    if (!activity) {
      return `<p class="explain">Elige la actividad para aplicar costos presuntos UGPP.</p>`;
    }
    return `<p class="explain">${escapeHtml(activityExplain(activity))}</p>`;
  }
  return `<p class="explain">Aplicando la regla general: IBC = 40&nbsp;% de este ingreso.</p>`;
}

/**
 * @param {SourceType} type
 */
function capitalFields(source) {
  if (source.type !== "renta_capital") return "";
  const kind = source.rentaKind ?? "arrendamiento";
  const mode = source.costMode === "real" ? "real" : "presunto";
  const timing = source.rentaTiming === "accrued" ? "accrued" : "cash";
  return `
      <label>
        Clase de renta
        <select data-field="rentaKind">
          <option value="arrendamiento"${sel(kind === "arrendamiento")}>Arrendamiento</option>
          <option value="dividendos"${sel(kind === "dividendos")}>Dividendos / participaciones</option>
          <option value="intereses"${sel(kind === "intereses")}>Intereses / CDT / fondos</option>
          <option value="otra"${sel(kind === "otra")}>Otra renta de capital</option>
        </select>
      </label>
      <label>
        Costos
        <select data-field="costMode">
          <option value="presunto"${sel(mode === "presunto")}>Presuntos 28,08&nbsp;% (UGPP rentista)</option>
          <option value="real"${sel(mode === "real")}>Costos reales (ET 107)</option>
        </select>
      </label>
      ${
        mode === "real"
          ? `<label>
        Costos reales (COP)
        <input data-field="costAmount" type="text" inputmode="numeric" value="${source.costAmount ? escapeAttr(formatCop(source.costAmount)) : ""}" autocomplete="off">
      </label>`
          : ""
      }
      <label>
        Momento del ingreso
        <select data-field="rentaTiming">
          <option value="cash"${sel(timing === "cash")}>Recibido (sin contabilidad)</option>
          <option value="accrued"${sel(timing === "accrued")}>Causado (con libros)</option>
        </select>
      </label>
      <div class="legend">
        <p>IBC de capital = <strong>40&nbsp;% del neto</strong>. Neto = bruto − costos reales, o bruto × (1 − 28,08&nbsp;%). No uses la tabla CIIU de honorarios.</p>
      </div>`;
}

/**
 * @param {IncomeSource} source
 */
function capitalExplain(source) {
  if (source.type !== "renta_capital") return "";
  if (source.costMode === "real") {
    return `<p class="explain">Costos reales sobre el bruto en COP; IBC = 40&nbsp;% del neto.</p>`;
  }
  return `<p class="explain">Costos presuntos 28,08&nbsp;% del bruto → IBC = 40&nbsp;% del neto.</p>`;
}

function labelForType(type) {
  if (type === "honorarios") return "Honorarios";
  if (type === "renta_capital") return "Renta de capital";
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
