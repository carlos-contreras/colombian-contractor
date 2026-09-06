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
 */

/** @type {Map<string, MonthRecord>} */
const months = new Map();

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
  };
}

/**
 * @param {ExportPayload} payload
 * @returns {Promise<void>}
 */
export async function importAll(payload) {
  months.clear();
  if (!payload || !Array.isArray(payload.months)) return;
  for (const record of payload.months) {
    if (record && typeof record.yearMonth === "string") {
      months.set(record.yearMonth, cloneRecord(record));
    }
  }
}

export async function clearAll() {
  months.clear();
}

/**
 * @param {MonthRecord} record
 * @returns {MonthRecord}
 */
function cloneRecord(record) {
  return structuredClone(record);
}
