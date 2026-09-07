// @ts-check

/**
 * Persistence boundary. Uses IndexedDB in browsers and an in-memory fallback in
 * environments without IndexedDB (including the Node test runner).
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
 * @property {string[]} [trmMonthsLoaded]
 */

const DB_NAME = "colombian-contractor";
const DB_VERSION = 1;
const STORE_MONTHS = "months";
const STORE_YEAR_PARAMS = "yearParams";
const STORE_TRMS = "trms";
const STORE_TRM_MONTHS = "trmMonths";

/** @type {Map<string, MonthRecord>} */
const memoryMonths = new Map();
/** @type {Map<number, YearParams>} */
const memoryYearParams = new Map();
/** @type {Map<string, TrmQuote>} */
const memoryTrms = new Map();
/** @type {Set<string>} */
const memoryTrmMonthsLoaded = new Set();

/** @type {Promise<IDBDatabase | null> | null} */
let dbPromise = null;

function hasIndexedDb() {
  return typeof globalThis.indexedDB !== "undefined";
}

/** @returns {Promise<"indexeddb" | "memory">} */
export async function storageMode() {
  return (await getDb()) ? "indexeddb" : "memory";
}

/** @returns {Promise<IDBDatabase | null>} */
function getDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_MONTHS)) {
          db.createObjectStore(STORE_MONTHS, { keyPath: "yearMonth" });
        }
        if (!db.objectStoreNames.contains(STORE_YEAR_PARAMS)) {
          db.createObjectStore(STORE_YEAR_PARAMS, { keyPath: "year" });
        }
        if (!db.objectStoreNames.contains(STORE_TRMS)) {
          db.createObjectStore(STORE_TRMS, { keyPath: "date" });
        }
        if (!db.objectStoreNames.contains(STORE_TRM_MONTHS)) {
          db.createObjectStore(STORE_TRM_MONTHS, { keyPath: "yearMonth" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

/**
 * @template T
 * @param {string} storeName
 * @param {"readonly" | "readwrite"} mode
 * @param {(store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void} action
 * @returns {Promise<T | null>}
 */
function withStore(storeName, mode, action) {
  return getDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let settled = false;
      const finish = (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      transaction.onerror = () => {
        if (!settled) {
          settled = true;
          reject(transaction.error);
        }
      };
      transaction.onabort = () => {
        if (!settled) {
          settled = true;
          reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
        }
      };
      try {
        action(store, finish, reject);
      } catch (error) {
        reject(error);
      }
    });
  });
}

/** @param {unknown} value */
function clone(value) {
  return structuredClone(value);
}

/** @returns {Promise<MonthSummary[]>} */
export async function listMonths() {
  const rows = await withStore(STORE_MONTHS, "readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const records = rows ?? [...memoryMonths.values()];
  return records
    .map((record) => ({
      yearMonth: record.yearMonth,
      ibcFinal: record.result?.ibcFinal ?? 0,
      totalContributions: record.result?.totalContributions ?? 0,
    }))
    .sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : a.yearMonth > b.yearMonth ? -1 : 0));
}

/** @param {string} yearMonth @returns {Promise<MonthRecord | null>} */
export async function getMonth(yearMonth) {
  const row = await withStore(STORE_MONTHS, "readonly", (store, resolve, reject) => {
    const request = store.get(yearMonth);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  if (row !== null) return row ? clone(row) : null;
  const record = memoryMonths.get(yearMonth);
  return record ? clone(record) : null;
}

/** @param {string} yearMonth @param {MonthRecord} data @returns {Promise<void>} */
export async function saveMonth(yearMonth, data) {
  const record = clone({ ...data, yearMonth });
  const result = await withStore(STORE_MONTHS, "readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
  if (result === null) memoryMonths.set(yearMonth, record);
}

/** @param {string} yearMonth @returns {Promise<void>} */
export async function deleteMonth(yearMonth) {
  const result = await withStore(STORE_MONTHS, "readwrite", (store, resolve, reject) => {
    const request = store.delete(yearMonth);
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
  if (result === null) memoryMonths.delete(yearMonth);
}

/** @returns {Promise<ExportPayload>} */
export async function exportAll() {
  const [months, yearParams, trms, trmMonthsLoaded] = await Promise.all([
    allFrom(STORE_MONTHS),
    allFrom(STORE_YEAR_PARAMS),
    allFrom(STORE_TRMS),
    allFrom(STORE_TRM_MONTHS),
  ]);
  return {
    version: 1,
    months: /** @type {MonthRecord[]} */ (months ?? [...memoryMonths.values()]).map(clone),
    yearParams: /** @type {YearParams[]} */ (yearParams ?? [...memoryYearParams.values()]).map(clone),
    trms: /** @type {TrmQuote[]} */ (trms ?? [...memoryTrms.values()]).map(clone),
    trmMonthsLoaded: /** @type {{yearMonth: string}[]} */ (trmMonthsLoaded ?? [...memoryTrmMonthsLoaded].map((yearMonth) => ({ yearMonth }))).map((row) => row.yearMonth),
  };
}

/** @param {string} storeName @returns {Promise<unknown[] | null>} */
function allFrom(storeName) {
  return withStore(storeName, "readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** @param {ExportPayload} payload @returns {Promise<void>} */
export async function importAll(payload) {
  await clearAll();
  if (!payload) return;
  const db = await getDb();
  if (!db) {
    for (const record of payload.months ?? []) if (record?.yearMonth) memoryMonths.set(record.yearMonth, clone(record));
    for (const row of payload.yearParams ?? []) if (Number.isFinite(row?.year)) memoryYearParams.set(row.year, clone(row));
    for (const quote of payload.trms ?? []) if (quote?.date) memoryTrms.set(quote.date, clone(quote));
    for (const yearMonth of payload.trmMonthsLoaded ?? []) memoryTrmMonthsLoaded.add(yearMonth);
    return;
  }
  await Promise.all([
    putMany(STORE_MONTHS, payload.months ?? []),
    putMany(STORE_YEAR_PARAMS, payload.yearParams ?? []),
    putMany(STORE_TRMS, payload.trms ?? []),
    putMany(STORE_TRM_MONTHS, (payload.trmMonthsLoaded ?? []).map((yearMonth) => ({ yearMonth }))),
  ]);
}

/** @param {string} storeName @param {unknown[]} rows @returns {Promise<void>} */
function putMany(storeName, rows) {
  return withStore(storeName, "readwrite", (store, resolve, reject) => {
    let pending = rows.length;
    if (!pending) {
      resolve(undefined);
      return;
    }
    for (const row of rows) {
      const request = store.put(clone(row));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        pending -= 1;
        if (pending === 0) resolve(undefined);
      };
    }
  }).then(() => undefined);
}

/** @returns {Promise<void>} */
export async function clearAll() {
  const db = await getDb();
  if (db) {
    await Promise.all([STORE_MONTHS, STORE_YEAR_PARAMS, STORE_TRMS, STORE_TRM_MONTHS].map((name) =>
      withStore(name, "readwrite", (store, resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve(undefined);
        request.onerror = () => reject(request.error);
      }),
    ));
  }
  memoryMonths.clear();
  memoryYearParams.clear();
  memoryTrms.clear();
  memoryTrmMonthsLoaded.clear();
}

/** @param {number} year @returns {Promise<YearParams | null>} */
export async function getYearParams(year) {
  const row = await withStore(STORE_YEAR_PARAMS, "readonly", (store, resolve, reject) => {
    const request = store.get(year);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  if (row !== null) return row ? clone(row) : null;
  const value = memoryYearParams.get(year);
  return value ? clone(value) : null;
}

/** @param {number} year @param {YearParams} params @returns {Promise<void>} */
export async function saveYearParams(year, params) {
  const row = clone({ ...params, year });
  const result = await withStore(STORE_YEAR_PARAMS, "readwrite", (store, resolve, reject) => {
    const request = store.put(row);
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
  if (result === null) memoryYearParams.set(year, row);
}

/** @param {string} isoDate @returns {Promise<TrmQuote | null>} */
export async function getCachedTrm(isoDate) {
  const row = await withStore(STORE_TRMS, "readonly", (store, resolve, reject) => {
    const request = store.get(isoDate);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  if (row !== null) return row ? clone(row) : null;
  const quote = memoryTrms.get(isoDate);
  return quote ? clone(quote) : null;
}

/** @param {TrmQuote[]} quotes @returns {Promise<void>} */
export async function putTrms(quotes) {
  await putMany(STORE_TRMS, quotes);
  if (!(await getDb())) {
    for (const quote of quotes) if (quote?.date) memoryTrms.set(quote.date, clone(quote));
  }
}

/** @param {string} yearMonth @returns {Promise<boolean>} */
export async function isTrmMonthLoaded(yearMonth) {
  const row = await withStore(STORE_TRM_MONTHS, "readonly", (store, resolve, reject) => {
    const request = store.get(yearMonth);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  if (row !== null) return Boolean(row);
  return memoryTrmMonthsLoaded.has(yearMonth);
}

/** @param {string} yearMonth @returns {Promise<void>} */
export async function markTrmMonthLoaded(yearMonth) {
  const result = await withStore(STORE_TRM_MONTHS, "readwrite", (store, resolve, reject) => {
    const request = store.put({ yearMonth });
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
  if (result === null) memoryTrmMonthsLoaded.add(yearMonth);
}

/** @param {string} yearMonth @returns {Promise<TrmQuote[]>} */
export async function listTrmsForMonth(yearMonth) {
  const prefix = `${yearMonth}-`;
  const rows = await allFrom(STORE_TRMS);
  const quotes = rows ?? [...memoryTrms.values()];
  return /** @type {TrmQuote[]} */ (quotes).filter((quote) => quote.date.startsWith(prefix)).map(clone);
}
