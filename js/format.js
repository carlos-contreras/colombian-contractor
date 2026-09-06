// @ts-check

const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

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
