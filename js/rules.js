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
 * 6. FSP: Ley 100 table on IBC de pensión (ibc_final). ≥ 4 SMMLV. Not part of the 16 % pensión.
 *
 * @typedef {"honorarios" | "salario" | "renta_capital" | "otro"} SourceType
 *
 * @typedef {"floor" | "ceiling" | "missing_arl" | "missing_ugpp_activity"} WarningCode
 *
 * @typedef {object} IncomeSource
 * @property {string} id
 * @property {SourceType} type
 * @property {string} label
 * @property {number} amount  Integer COP pesos (rules ignore USD fields)
 * @property {number} factor  1 salario; 0.4 honorarios sin presunción; 1−costos UGPP; custom otro
 * @property {"COP" | "USD"} [currency]
 * @property {number} [usd]
 * @property {string} [trmDate]
 * @property {number} [trm]
 * @property {"sin" | "ugpp"} [presuncion]  Honorarios only
 * @property {string} [ugppActivity]  CIIU section id when presuncion is ugpp
 * @property {"arrendamiento" | "dividendos" | "intereses" | "otra"} [rentaKind]
 * @property {"real" | "presunto"} [costMode]
 * @property {number} [costAmount]  Real costs, integer COP
 * @property {"accrued" | "cash"} [rentaTiming]
 * @property {string} [arlClass]  I–V or undefined (no ARL for this line)
 * @property {0 | 0.006 | 0.02 | 0.6 | 2} [ccfRate]  Honorarios CCF rate for this contract
 * @property {string} [note]  Free-text note for the income source
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
 * @property {number} ccf  CCF amount for this honorarios line
 * @property {number} [net]  Capital: gross − costs
 *
 * @typedef {object} MonthResult
 * @property {number} grossTotal
 * @property {SourceIbc[]} perSource
 * @property {number} ibcHonorarios
 * @property {number} ibcCapital
 * @property {number} ibcSalario
 * @property {number} ibcRaw
 * @property {number} ibcCapped
 * @property {number} ibcFinal
 * @property {number} salud
 * @property {number} pension
 * @property {number} arl
 * @property {number} fspSolidaridad
 * @property {number} fspSubsistencia
 * @property {number} fsp
 * @property {number} ccf
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
    smmlv: 1_750_905,
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
  if (type === "renta_capital") return 0;
  return params.independentFactor;
}

/** Rentista presumed costs (UGPP Res. 532/2024 last row). Not a CIIU section. */
export const CAPITAL_PRESUMED_COST_RATE = 0.2808;

/** IBC as a share of **net** capital income. */
export const CAPITAL_NET_TO_IBC = 0.4;

/**
 * @param {IncomeSource} source
 * @returns {number}
 */
export function capitalCosts(source) {
  const gross = Math.max(0, Number.isFinite(source.amount) ? Math.trunc(source.amount) : 0);
  if (source.costMode === "real") {
    const raw = Number.isFinite(source.costAmount) ? Math.trunc(/** @type {number} */ (source.costAmount)) : 0;
    return Math.min(Math.max(0, raw), gross);
  }
  return Math.round(gross * CAPITAL_PRESUMED_COST_RATE);
}

/**
 * @param {IncomeSource} source
 * @returns {number}
 */
export function capitalNet(source) {
  const gross = Math.max(0, Number.isFinite(source.amount) ? Math.trunc(source.amount) : 0);
  return Math.max(0, gross - capitalCosts(source));
}

/**
 * @param {IncomeSource[]} sources
 * @param {YearParams} params
 * @returns {MonthResult}
 */
export function computeMonth(sources, params) {
  /** @type {SourceIbc[]} */
  const perSource = sources.map((source) => lineIbc(source));

  const grossTotal = perSource.reduce((sum, line) => sum + line.amount, 0);
  const ibcHonorarios = ibcSumFor(sources, perSource, (source) => source.type === "honorarios" || source.type === "otro");
  const ibcCapital = ibcSumFor(sources, perSource, (source) => source.type === "renta_capital");
  const ibcSalario = ibcSumFor(sources, perSource, (source) => source.type === "salario");
  const ibcRaw = ibcHonorarios + ibcCapital + ibcSalario;
  const ceiling = 25 * params.smmlv;
  const floor = params.smmlv;
  const ibcCapped = Math.min(ibcRaw, ceiling);
  const ibcFinal = ibcRaw === 0 ? 0 : Math.max(ibcCapped, floor);

  /** @type {WarningCode[]} */
  const warnings = [];
  if (
    sources.some(
      (source) => source.type === "honorarios" && source.presuncion === "ugpp" && !source.ugppActivity,
    )
  ) {
    warnings.push("missing_ugpp_activity");
  }

  // Effective ARL class: first source that specifies one, else year default
  const effectiveArlClass =
    sources.find((s) => s.arlClass)?.arlClass ?? params.arlClass;
  const arlRate = params.arlRates[effectiveArlClass];
  const hasArl = Number.isFinite(arlRate);
  const arl = hasArl ? Math.round(ibcFinal * /** @type {number} */ (arlRate)) : 0;
  if (!hasArl && effectiveArlClass) warnings.push("missing_arl");
  if (ibcRaw > 0 && ibcFinal === floor && ibcRaw < floor) warnings.push("floor");
  if (ibcRaw > ceiling) warnings.push("ceiling");

  const salud = Math.round(ibcFinal * params.saludRate);
  const pension = Math.round(ibcFinal * params.pensionRate);
  const fspParts = fspBreakdown(ibcFinal, params.smmlv);
  const ccf = perSource.reduce(
    (sum, line) => sum + (Number.isFinite(line.ccf) ? line.ccf : 0),
    0,
  );
  const totalContributions = salud + pension + arl + fspParts.total + ccf;

  return {
    grossTotal,
    perSource,
    ibcHonorarios,
    ibcCapital,
    ibcSalario,
    ibcRaw,
    ibcCapped,
    ibcFinal,
    salud,
    pension,
    arl,
    fspSolidaridad: fspParts.solidaridad,
    fspSubsistencia: fspParts.subsistencia,
    fsp: fspParts.total,
    ccf,
    totalContributions,
    cashAfter: grossTotal - totalContributions,
    warnings,
  };
}

/**
/**
 * Normalizes CCF input from the UI or stored archives.
 * Accepts fractions (0.006 / 0.02) and legacy percentages (0.6 / 2).
 *
 * @param {unknown} value
 * @returns {0 | 0.006 | 0.02}
 */
function normalizeCcfRate(value) {
  const rate = Number(typeof value === "string" ? value.replaceAll(",", ".") : value);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (rate === 0.006 || rate === 0.02) return rate;
  if (rate === 0.6) return 0.006;
  if (rate === 2) return 0.02;
  if (rate > 1) {
    const normalized = rate / 100;
    if (normalized === 0.006 || normalized === 0.02) return normalized;
  }
  return 0;
}

/**
 * @param {IncomeSource} source
 * @returns {SourceIbc}
 */
function lineIbc(source) {
  const amount = Number.isFinite(source.amount) ? Math.trunc(source.amount) : 0;
  if (source.type === "renta_capital") {
    const net = capitalNet(source);
    const ibc = Math.round(net * CAPITAL_NET_TO_IBC);
    const factor = amount > 0 ? ibc / amount : 0;
    return { id: source.id, amount, factor, ibc, ccf: 0, net };
  }
  const factor = Number.isFinite(source.factor) ? source.factor : 0;
  const ibc = Math.round(amount * factor);
  const ccfRate = source.type === "salario" || source.type === "renta_capital"
    ? 0
    : normalizeCcfRate(source.ccfRate);
  return {
    id: source.id,
    amount,
    factor,
    ibc,
    ccf: Math.round(ibc * ccfRate),
  };
}

/**
 * @param {IncomeSource[]} sources
 * @param {SourceIbc[]} lines
 * @param {(source: IncomeSource) => boolean} match
 * @returns {number}
 */
function ibcSumFor(sources, lines, match) {
  let sum = 0;
  for (let i = 0; i < sources.length; i += 1) {
    if (match(sources[i])) sum += lines[i].ibc;
  }
  return sum;
}

/**
 * FSP on pensión IBC (Ley 100 arts. 25–27; Dec. 1833/2016). Ley 2381 scale not used yet.
 *
 * @param {number} ibcFinal
 * @param {number} smmlv
 * @returns {{ solidaridad: number, subsistencia: number, total: number, solidaridadRate: number, subsistenciaRate: number }}
 */
export function fspBreakdown(ibcFinal, smmlv) {
  const empty = {
    solidaridad: 0,
    subsistencia: 0,
    total: 0,
    solidaridadRate: 0,
    subsistenciaRate: 0,
  };
  if (!(ibcFinal > 0) || !(smmlv > 0)) return empty;
  const k = ibcFinal / smmlv;
  let solidaridadRate = 0;
  let subsistenciaRate = 0;
  if (k < 4) {
    solidaridadRate = 0;
    subsistenciaRate = 0;
  } else if (k < 16) {
    solidaridadRate = 0.005;
    subsistenciaRate = 0.005;
  } else if (k <= 17) {
    solidaridadRate = 0.005;
    subsistenciaRate = 0.007;
  } else if (k <= 18) {
    solidaridadRate = 0.005;
    subsistenciaRate = 0.009;
  } else if (k <= 19) {
    solidaridadRate = 0.005;
    subsistenciaRate = 0.011;
  } else if (k <= 20) {
    solidaridadRate = 0.005;
    subsistenciaRate = 0.013;
  } else {
    solidaridadRate = 0.005;
    subsistenciaRate = 0.015;
  }
  const solidaridad = Math.round(ibcFinal * solidaridadRate);
  const subsistencia = Math.round(ibcFinal * subsistenciaRate);
  return {
    solidaridad,
    subsistencia,
    total: solidaridad + subsistencia,
    solidaridadRate,
    subsistenciaRate,
  };
}
