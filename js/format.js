// @ts-check

const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

/** @type {readonly { value: string, label: string }[]} */
export const MONTHS_ES = [
  { value: "01", label: "Enero" },
  { value: "02", label: "Febrero" },
  { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Mayo" },
  { value: "06", label: "Junio" },
  { value: "07", label: "Julio" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

/**
 * @param {number} pesos
 * @returns {string}
 */
export function formatCop(pesos) {
  const n = Math.trunc(pesos);
  const sign = n < 0 ? "-" : "";
  const grouped = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$ ${grouped}`;
}

/**
 * Digits and optional thousand separators (`.`). No decimals.
 *
 * @param {string} input
 * @returns {number}
 */
export function parseCop(input) {
  const digits = String(input).replace(/[^\d-]/g, "");
  if (digits === "" || digits === "-") return 0;
  const n = Number(digits);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/**
 * @param {number} usd
 * @returns {string}
 */
export function formatUsd(usd) {
  if (!Number.isFinite(usd)) return "0.00";
  return usd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Point decimals, optional comma thousands (`1,234.56`).
 *
 * @param {string} input
 * @returns {number}
 */
export function parseUsd(input) {
  const s = String(input).trim().replace(/\$/g, "").replace(/\s/g, "").replace(/,/g, "");
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return n;
}

/**
 * @param {string} yearMonth
 * @returns {string}
 */
export function formatYearMonth(yearMonth) {
  const match = YEAR_MONTH.exec(yearMonth);
  if (!match) return yearMonth;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * @param {string} yearMonth
 * @returns {boolean}
 */
export function isYearMonth(yearMonth) {
  const match = YEAR_MONTH.exec(yearMonth);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

/**
 * @param {number} rate  0.125 → "12,5 %"
 * @returns {string}
 */
export function formatRate(rate) {
  const pct = rate * 100;
  return `${pct.toLocaleString("es-CO", { maximumFractionDigits: 3 })} %`;
}

/**
 * Calendar month before `from` (Bogotá if `from` is a Date).
 * A `YYYY-MM` or `YYYY-MM-DD` string is treated as that calendar month.
 *
 * @param {string | Date} [from]
 * @returns {string}
 */
export function previousYearMonth(from = new Date()) {
  let year;
  let month;
  if (typeof from === "string" && /^\d{4}-\d{2}/.test(from)) {
    year = Number(from.slice(0, 4));
    month = Number(from.slice(5, 7));
  } else {
    const date = from instanceof Date ? from : new Date();
    const iso = date.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    year = Number(iso.slice(0, 4));
    month = Number(iso.slice(5, 7));
  }
  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * @param {string} yearMonth
 * @returns {string} YYYY-MM-DD last day of that month
 */
export function lastIsoOfMonth(yearMonth) {
  if (!isYearMonth(yearMonth)) return `${yearMonth}-01`;
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearMonth}-${String(last).padStart(2, "0")}`;
}
