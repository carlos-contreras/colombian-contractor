// @ts-check

/**
 * Official TRM (Tasa Representativa del Mercado, COP per USD) for a calendar date.
 *
 * Source: Superintendencia Financiera series on datos.gov.co (dataset 32sa-8pi3).
 * CORS is `*`, so this works from localhost and GitHub Pages without a backend.
 *
 * `rules.js` stays in integer COP. Convert USD → COP here (or in the UI) *before*
 * IBC math. Which date to use (invoice, payment, month-end) is the caller’s choice.
 *
 * @typedef {object} TrmQuote
 * @property {string} date  Requested calendar date `YYYY-MM-DD` (America/Bogotá)
 * @property {number} value  COP per 1 USD
 * @property {string} validFrom  Inclusive `YYYY-MM-DD`
 * @property {string} validTo  Inclusive `YYYY-MM-DD` (weekends/holidays often span)
 * @property {string} unit
 * @property {string} source
 *
 * @typedef {object} GetTrmOptions
 * @property {AbortSignal} [signal]
 * @property {boolean} [skipCache]
 * @property {typeof fetch} [fetch]  Injected for tests; default `globalThis.fetch`
 */

export const TRM_DATASET_URL = "https://www.datos.gov.co/resource/32sa-8pi3.json";
export const TRM_SOURCE = "datos.gov.co/resource/32sa-8pi3";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @type {Map<string, TrmQuote>} */
const cache = new Map();

export class TrmError extends Error {
  /**
   * @param {"bad_date" | "not_found" | "network" | "bad_response" | "bad_amount"} code
   * @param {string} message
   * @param {ErrorOptions} [options]
   */
  constructor(code, message, options) {
    super(message, options);
    this.name = "TrmError";
    this.code = code;
  }
}

/**
 * Calendar date in Colombia for a `Date`, or pass through `YYYY-MM-DD`.
 *
 * @param {string | Date} input
 * @returns {string}
 */
export function toIsoDateBogota(input) {
  if (typeof input === "string") {
    const trimmed = input.trim().slice(0, 10);
    if (!isIsoDate(trimmed)) {
      throw new TrmError("bad_date", `Expected YYYY-MM-DD, got ${JSON.stringify(input)}`);
    }
    return trimmed;
  }
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    const iso = input.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    if (!isIsoDate(iso)) {
      throw new TrmError("bad_date", `Could not format date as YYYY-MM-DD: ${input.toISOString()}`);
    }
    return iso;
  }
  throw new TrmError("bad_date", "Expected YYYY-MM-DD string or Date");
}

/**
 * @param {string} isoDate
 * @returns {string}
 */
export function trmQueryUrl(isoDate) {
  const day = `${toIsoDateBogota(isoDate)}T00:00:00.000`;
  const url = new URL(TRM_DATASET_URL);
  url.searchParams.set("$where", `vigenciadesde <= '${day}' AND vigenciahasta >= '${day}'`);
  url.searchParams.set("$limit", "1");
  url.searchParams.set("$order", "vigenciadesde DESC");
  return url.href;
}

/**
 * @param {unknown} payload
 * @param {string} isoDate
 * @returns {TrmQuote}
 */
export function quoteFromPayload(payload, isoDate) {
  if (!Array.isArray(payload)) {
    throw new TrmError("bad_response", "TRM response was not a JSON array");
  }
  if (payload.length === 0) {
    throw new TrmError("not_found", `No TRM published for ${isoDate}`);
  }
  return quoteFromRow(payload[0], isoDate);
}

/**
 * @param {string} yearMonth `YYYY-MM`
 * @returns {{ start: string, end: string }}
 */
export function monthBounds(yearMonth) {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  if (!/^\d{4}-\d{2}$/.test(yearMonth) || month < 1 || month > 12) {
    throw new TrmError("bad_date", `Expected YYYY-MM, got ${JSON.stringify(yearMonth)}`);
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(last).padStart(2, "0")}`,
  };
}

/**
 * @param {string} yearMonth
 * @returns {string}
 */
export function trmMonthQueryUrl(yearMonth) {
  const { start, end } = monthBounds(yearMonth);
  const url = new URL(TRM_DATASET_URL);
  url.searchParams.set(
    "$where",
    `vigenciahasta >= '${start}T00:00:00.000' AND vigenciadesde <= '${end}T00:00:00.000'`,
  );
  url.searchParams.set("$limit", "50");
  url.searchParams.set("$order", "vigenciadesde ASC");
  return url.href;
}

/**
 * @param {unknown} payload
 * @returns {TrmQuote[]}
 */
export function quotesFromMonthPayload(payload) {
  if (!Array.isArray(payload)) {
    throw new TrmError("bad_response", "TRM month response was not a JSON array");
  }
  return payload.map((row) => {
    const quote = quoteFromRow(row, "2000-01-01");
    return { ...quote, date: quote.validFrom };
  });
}

/**
 * One quote per calendar day in `yearMonth` using vigencia spans.
 *
 * @param {TrmQuote[]} quotes
 * @param {string} yearMonth
 * @returns {Record<string, TrmQuote>}
 */
export function trmByDateForMonth(quotes, yearMonth) {
  const { start, end } = monthBounds(yearMonth);
  /** @type {Record<string, TrmQuote>} */
  const byDate = {};
  for (const day of eachIsoDay(start, end)) {
    const covering = quotes.find((quote) => quote.validFrom <= day && quote.validTo >= day);
    if (covering) byDate[day] = { ...covering, date: day };
  }
  return byDate;
}

/**
 * Download every TRM that covers days in `yearMonth` (one request).
 *
 * @param {string} yearMonth
 * @param {GetTrmOptions} [options]
 * @returns {Promise<Record<string, TrmQuote>>}
 */
export async function getTrmMonth(yearMonth, options = {}) {
  const fetchFn = options.fetch ?? globalThis.fetch;
  let response;
  try {
    response = await fetchFn(trmMonthQueryUrl(yearMonth), {
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof TrmError) throw err;
    const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
    if (name === "AbortError") throw err;
    throw new TrmError("network", "Could not reach datos.gov.co for monthly TRM", {
      cause: err instanceof Error ? err : undefined,
    });
  }
  if (!response.ok) {
    throw new TrmError("network", `TRM month request failed (${response.status})`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new TrmError("bad_response", "TRM month response was not JSON");
  }
  const quotes = quotesFromMonthPayload(payload);
  const byDate = trmByDateForMonth(quotes, yearMonth);
  if (!options.skipCache) {
    for (const [day, quote] of Object.entries(byDate)) cache.set(day, quote);
  }
  return byDate;
}

/**
 * Look up the official TRM that applies on `date`.
 *
 * @param {string | Date} date
 * @param {GetTrmOptions} [options]
 * @returns {Promise<TrmQuote>}
 */
export async function getTrm(date, options = {}) {
  const isoDate = toIsoDateBogota(date);
  if (!options.skipCache && cache.has(isoDate)) {
    return /** @type {TrmQuote} */ (cache.get(isoDate));
  }

  const fetchFn = options.fetch ?? globalThis.fetch;
  let response;
  try {
    response = await fetchFn(trmQueryUrl(isoDate), {
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof TrmError) throw err;
    const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
    if (name === "AbortError") throw err;
    throw new TrmError("network", "Could not reach datos.gov.co for TRM", {
      cause: err instanceof Error ? err : undefined,
    });
  }

  if (!response.ok) {
    throw new TrmError("network", `TRM request failed (${response.status})`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new TrmError("bad_response", "TRM response was not JSON");
  }

  const quote = quoteFromPayload(payload, isoDate);
  cache.set(isoDate, quote);
  return quote;
}

/**
 * USD × TRM, rounded to integer COP pesos.
 *
 * @param {number} usd
 * @param {number} trm  COP per 1 USD
 * @returns {number}
 */
export function usdToCopPesos(usd, trm) {
  if (!Number.isFinite(usd)) {
    throw new TrmError("bad_amount", "USD amount must be a finite number");
  }
  if (!Number.isFinite(trm) || trm <= 0) {
    throw new TrmError("bad_amount", "TRM must be a finite number > 0");
  }
  return Math.round(usd * trm);
}

export function clearTrmCache() {
  cache.clear();
}

/**
 * @param {unknown} row
 * @param {string} isoDate
 * @returns {TrmQuote}
 */
function quoteFromRow(row, isoDate) {
  if (row === null || typeof row !== "object") {
    throw new TrmError("bad_response", "TRM row was not an object");
  }
  const record = /** @type {Record<string, unknown>} */ (row);
  const value = Number(record.valor);
  if (!Number.isFinite(value) || value <= 0) {
    throw new TrmError("bad_response", `Invalid TRM valor: ${String(record.valor)}`);
  }
  const unit = typeof record.unidad === "string" && record.unidad ? record.unidad : "COP";
  return {
    date: isoDate,
    value,
    validFrom: timestampToIsoDate(record.vigenciadesde),
    validTo: timestampToIsoDate(record.vigenciahasta),
    unit,
    source: TRM_SOURCE,
  };
}

/**
 * @param {string} start inclusive YYYY-MM-DD
 * @param {string} end inclusive YYYY-MM-DD
 * @returns {string[]}
 */
function eachIsoDay(start, end) {
  const days = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * @param {string} iso
 * @returns {boolean}
 */
function isIsoDate(iso) {
  const match = ISO_DATE.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function timestampToIsoDate(value) {
  if (typeof value !== "string" || value.length < 10) {
    throw new TrmError("bad_response", `Invalid TRM timestamp: ${String(value)}`);
  }
  const iso = value.slice(0, 10);
  if (!isIsoDate(iso)) {
    throw new TrmError("bad_response", `Invalid TRM timestamp: ${value}`);
  }
  return iso;
}
