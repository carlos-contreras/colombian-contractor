// @ts-check

/**
 * Yearly figures used when the user picks a **year**.
 *
 * There is no CORS-open JSON on MinTrabajo / BanRep / datos.gov.co for SMMLV,
 * the 40% independent IBC factor, salud 12.5%, or pensión 16% (unlike TRM).
 * Those rates are **ley vigente**, not a daily series. SMMLV is the annual
 * decreto salarial, stored here so choosing a year does not hard-code the form
 * by hand. Snapshots are cached in `store.js` and not rebuilt until the year
 * is new (or the user edits them).
 *
 * @typedef {import("./rules.js").YearParams} YearParams
 */

import { paramsForYear } from "./rules.js";

/**
 * SMMLV from the salario mínimo decree for that year (COP, integer pesos).
 * 2026 is omitted until the decree figure is confirmed in this table.
 *
 * @type {Record<number, number>}
 */
export const OFFICIAL_SMMLV = {
  2020: 877_803,
  2021: 908_526,
  2022: 1_000_000,
  2023: 1_160_000,
  2024: 1_300_000,
  2025: 1_423_500,
};

/** Statutory independent-contractor rates (not an annual open dataset). */
export const STATUTORY_RATES = {
  independentFactor: 0.4,
  saludRate: 0.125,
  pensionRate: 0.16,
};

export const YEAR_PARAMS_SOURCE =
  "SMMLV: decreto salarial (tabla). Factor 40%, salud 12,5 %, pensión 16 %: ley vigente, no hay API abierta.";

/**
 * @param {number} year
 * @returns {YearParams}
 */
export function loadYearParams(year) {
  const base = paramsForYear(year);
  const smmlv = OFFICIAL_SMMLV[year] ?? base.smmlv;
  return {
    ...base,
    year,
    smmlv,
    independentFactor: STATUTORY_RATES.independentFactor,
    saludRate: STATUTORY_RATES.saludRate,
    pensionRate: STATUTORY_RATES.pensionRate,
  };
}

/**
 * @param {number} year
 * @returns {boolean}
 */
export function hasOfficialSmmlv(year) {
  return Object.prototype.hasOwnProperty.call(OFFICIAL_SMMLV, year);
}
