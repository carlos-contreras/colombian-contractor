// @ts-check

/**
 * IBC + contribution math. COP pesos only. Rates are a working model — see PLAN.md
 * research checkpoint. Do not treat defaults as legal advice.
 *
 * Working decisions (pending confirmation):
 * 1. 40% is applied **per source line**, then summed (not 40% of the grand total).
 * 2. Mixed salary + honorarios: still one combined IBC; no special “already covered” rule yet.
 * 3. IVA: caller should pass honorarios **net of IVA**.
 * 4. Floor (1 SMMLV) applies when ibc_raw > 0, even if small.
 * 5. SMMLV / rates: YEAR_PRESETS below — edit in the UI.
 * 6. FSP: computed only if fspRate > 0; default 0 until brackets are confirmed.
 *
 * @typedef {"honorarios" | "salario" | "otro"} SourceType
 *
 * @typedef {"floor" | "ceiling" | "missing_arl"} WarningCode
 *
 * @typedef {object} IncomeSource
 * @property {string} id
 * @property {SourceType} type
 * @property {string} label
 * @property {number} amount  Integer COP pesos (rules ignore USD fields)
 * @property {number} factor  1 for salario, independentFactor for honorarios, custom for otro
 * @property {"COP" | "USD"} [currency]
 * @property {number} [usd]
 * @property {string} [trmDate]
 * @property {number} [trm]
 *
 * @typedef {object} YearParams
 * @property {number} year
 * @property {number} smmlv
 * @property {number} independentFactor
 * @property {number} saludRate
 * @property {number} pensionRate
 * @property {string} arlClass
 * @property {Record<string, number>} arlRates
 * @property {number} [fspThresholdSmmlv]
 * @property {number} [fspRate]
 *
 * @typedef {object} SourceIbc
 * @property {string} id
 * @property {number} amount
 * @property {number} factor
 * @property {number} ibc
 *
 * @typedef {object} MonthResult
 * @property {number} grossTotal
 * @property {SourceIbc[]} perSource
 * @property {number} ibcRaw
 * @property {number} ibcCapped
 * @property {number} ibcFinal
 * @property {number} salud
 * @property {number} pension
 * @property {number} arl
 * @property {number} fsp
 * @property {number} totalContributions
 * @property {number} cashAfter
 * @property {WarningCode[]} warnings
 */

/** @type {Record<string, number>} */
const ARL_RATES_ASSUMED = {
  I: 0.00522,
  II: 0.01044,
  III: 0.02436,
  IV: 0.0435,
  V: 0.0696,
};

/**
 * Presets to edit in the UI. 2025 SMMLV is the known legal figure; 2026 SMMLV
 * starts as a copy — change it when you confirm the year’s wage.
 *
 * @type {Record<number, YearParams>}
 */
export const YEAR_PRESETS = {
  2025: {
    year: 2025,
    smmlv: 1_423_500,
    independentFactor: 0.4,
    saludRate: 0.125,
    pensionRate: 0.16,
    arlClass: "I",
    arlRates: { ...ARL_RATES_ASSUMED },
    fspThresholdSmmlv: 4,
    fspRate: 0,
  },
  2026: {
    year: 2026,
    smmlv: 1_423_500,
    independentFactor: 0.4,
    saludRate: 0.125,
    pensionRate: 0.16,
    arlClass: "I",
    arlRates: { ...ARL_RATES_ASSUMED },
    fspThresholdSmmlv: 4,
    fspRate: 0,
  },
};

/**
 * @param {number} year
 * @returns {YearParams}
 */
export function paramsForYear(year) {
  const preset = YEAR_PRESETS[year] ?? YEAR_PRESETS[2026];
  return {
    ...preset,
    year,
    arlRates: { ...preset.arlRates },
  };
}

/**
 * @param {SourceType} type
 * @param {YearParams} params
 * @returns {number}
 */
export function factorForType(type, params) {
  if (type === "salario") return 1;
  return params.independentFactor;
}

/**
 * @param {IncomeSource[]} sources
 * @param {YearParams} params
 * @returns {MonthResult}
 */
export function computeMonth(sources, params) {
  /** @type {SourceIbc[]} */
  const perSource = sources.map((source) => {
    const amount = Number.isFinite(source.amount) ? Math.trunc(source.amount) : 0;
    const factor = Number.isFinite(source.factor) ? source.factor : 0;
    return {
      id: source.id,
      amount,
      factor,
      ibc: Math.round(amount * factor),
    };
  });

  const grossTotal = perSource.reduce((sum, line) => sum + line.amount, 0);
  const ibcRaw = perSource.reduce((sum, line) => sum + line.ibc, 0);
  const ceiling = 25 * params.smmlv;
  const floor = params.smmlv;
  const ibcCapped = Math.min(ibcRaw, ceiling);
  const ibcFinal = ibcRaw === 0 ? 0 : Math.max(ibcCapped, floor);

  const arlRate = params.arlRates[params.arlClass];
  /** @type {WarningCode[]} */
  const warnings = [];
  const hasArl = Number.isFinite(arlRate);
  const arl = hasArl ? Math.round(ibcFinal * /** @type {number} */ (arlRate)) : 0;
  if (!hasArl) warnings.push("missing_arl");
  if (ibcRaw > 0 && ibcFinal === floor && ibcRaw < floor) warnings.push("floor");
  if (ibcRaw > ceiling) warnings.push("ceiling");

  const salud = Math.round(ibcFinal * params.saludRate);
  const pension = Math.round(ibcFinal * params.pensionRate);
  const fsp = fspAmount(ibcFinal, params);
  const totalContributions = salud + pension + arl + fsp;

  return {
    grossTotal,
    perSource,
    ibcRaw,
    ibcCapped,
    ibcFinal,
    salud,
    pension,
    arl,
    fsp,
    totalContributions,
    cashAfter: grossTotal - totalContributions,
    warnings,
  };
}

/**
 * @param {number} ibcFinal
 * @param {YearParams} params
 * @returns {number}
 */
function fspAmount(ibcFinal, params) {
  const rate = params.fspRate ?? 0;
  if (!(rate > 0)) return 0;
  const thresholdSmmlv = params.fspThresholdSmmlv ?? 0;
  const threshold = thresholdSmmlv * params.smmlv;
  if (ibcFinal < threshold) return 0;
  return Math.round(ibcFinal * rate);
}
