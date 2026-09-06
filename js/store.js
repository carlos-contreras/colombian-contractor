// @ts-check

/**
 * Persistence boundary. v1 scaffold: in-memory Map (lost on refresh).
 * IndexedDB is the Phase 2 adapter behind this same API — no calls from app.js
 * to IndexedDB / localStorage.
 *
 * Runtime import of `rules.js` is forbidden. JSDoc `import()` types only.
 *
 * @typedef {import("./rules.js").IncomeSource} IncomeSource
 * @typedef {import("./rules.js").YearParams} YearParams
 * @typedef {import("./rules.js").MonthResult} MonthResult
 * @typedef {import("./trm.js").TrmQuote} TrmQuote
 *
 * @typedef {object} MonthRecord
 * @property {string} yearMonth
 * @property {IncomeSource[]} sources
 * @property {YearParams} params
 * @property {MonthResult} [result]
 *
 * @typedef {object} MonthSummary
 * @property {string} yearMonth
 * @property {number} ibcFinal
 * @property {number} totalContributions
 *
 * @typedef {object} ExportPayload
 * @property {number} version
 * @property {MonthRecord[]} months
 * @property {YearParams[]} yearParams
 * @property {TrmQuote[]} trms
 */

/** @type {Map<string, MonthRecord>} */
const months = new Map();
/** @type {Map<number, YearParams>} */
const yearParams = new Map();
/** @type {Map<string, TrmQuote>} */
const trms = new Map();
/** @type {Set<string>} */
const trmMonthsLoaded = new Set();

/**
 * @returns {Promise<MonthSummary[]>}
 */
export async function listMonths() {
  return [...months.values()]
    .map((record) => ({
      yearMonth: record.yearMonth,
      ibcFinal: record.result?.ibcFinal ?? 0,
      totalContributions: record.result?.totalContributions ?? 0,
    }))
    .sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : a.yearMonth > b.yearMonth ? -1 : 0));
}

/**
 * @param {string} yearMonth
 * @returns {Promise<MonthRecord | null>}
 */
export async function getMonth(yearMonth) {
  const record = months.get(yearMonth);
  return record ? cloneRecord(record) : null;
}

/**
 * @param {string} yearMonth
 * @param {MonthRecord} data
 * @returns {Promise<void>}
 */
export async function saveMonth(yearMonth, data) {
  months.set(yearMonth, cloneRecord({ ...data, yearMonth }));
}

/**
 * @param {string} yearMonth
 * @returns {Promise<void>}
 */
export async function deleteMonth(yearMonth) {
  months.delete(yearMonth);
}

/**
 * @returns {Promise<ExportPayload>}
 */
export async function exportAll() {
  return {
    version: 1,
    months: [...months.values()].map(cloneRecord),
    yearParams: [...yearParams.values()].map((row) => structuredClone(row)),
    trms: [...trms.values()].map((row) => structuredClone(row)),
  };
}

/**
 * @param {ExportPayload} payload
 * @returns {Promise<void>}
 */
export async function importAll(payload) {
  months.clear();
  yearParams.clear();
  trms.clear();
  trmMonthsLoaded.clear();
  if (!payload) return;
  if (Array.isArray(payload.months)) {
    for (const record of payload.months) {
      if (record && typeof record.yearMonth === "string") {
        months.set(record.yearMonth, cloneRecord(record));
      }
    }
  }
  if (Array.isArray(payload.yearParams)) {
    for (const row of payload.yearParams) {
      if (row && Number.isFinite(row.year)) yearParams.set(row.year, structuredClone(row));
    }
  }
  if (Array.isArray(payload.trms)) {
    for (const quote of payload.trms) {
      if (quote && typeof quote.date === "string") trms.set(quote.date, structuredClone(quote));
    }
  }
}

export async function clearAll() {
  months.clear();
  yearParams.clear();
  trms.clear();
  trmMonthsLoaded.clear();
}

/**
 * @param {number} year
 * @returns {Promise<YearParams | null>}
 */
export async function getYearParams(year) {
  const row = yearParams.get(year);
  return row ? structuredClone(row) : null;
}

/**
 * @param {number} year
 * @param {YearParams} params
 * @returns {Promise<void>}
 */
export async function saveYearParams(year, params) {
  yearParams.set(year, structuredClone({ ...params, year }));
}

/**
 * @param {string} isoDate
 * @returns {Promise<TrmQuote | null>}
 */
export async function getCachedTrm(isoDate) {
  const quote = trms.get(isoDate);
  return quote ? structuredClone(quote) : null;
}

/**
 * @param {TrmQuote[]} quotes
 * @returns {Promise<void>}
 */
export async function putTrms(quotes) {
  for (const quote of quotes) {
    if (quote && typeof quote.date === "string") trms.set(quote.date, structuredClone(quote));
  }
}

/**
 * @param {string} yearMonth
 * @returns {Promise<boolean>}
 */
export async function isTrmMonthLoaded(yearMonth) {
  return trmMonthsLoaded.has(yearMonth);
}

/**
 * @param {string} yearMonth
 * @returns {Promise<void>}
 */
export async function markTrmMonthLoaded(yearMonth) {
  trmMonthsLoaded.add(yearMonth);
}

/**
 * @param {string} yearMonth
 * @returns {Promise<TrmQuote[]>}
 */
export async function listTrmsForMonth(yearMonth) {
  const prefix = `${yearMonth}-`;
  return [...trms.values()]
    .filter((quote) => quote.date.startsWith(prefix))
    .map((quote) => structuredClone(quote));
}

/**
 * @param {MonthRecord} record
 * @returns {MonthRecord}
 */
function cloneRecord(record) {
  return structuredClone(record);
}
