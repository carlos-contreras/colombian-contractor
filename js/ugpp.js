// @ts-check

/**
 * Honorarios IBC factor and UGPP-style presunción de costos.
 *
 * Without presunción: IBC is **40%** of the honorarios (legal constant for
 * independientes, not a field on the card).
 *
 * With presunción: IBC factor = 1 − presumed cost share for the activity.
 * The activity list is **CIIU sections** with working cost rates (not the
 * full official UGPP 4-digit anexo). Confirm before PILA.
 *
 * `rules.js` stays free of this module; `app.js` writes `source.factor`.
 *
 * @typedef {import("./rules.js").IncomeSource} IncomeSource
 *
 * @typedef {object} UgppActivity
 * @property {string} id  CIIU section letter
 * @property {string} label
 * @property {number} costRate  Presumed costs as a fraction of gross (0–1)
 */

/** IBC factor when there is no presunción de costos. */
export const INDEPENDENT_IBC_FACTOR = 0.4;

/**
 * @type {readonly UgppActivity[]}
 */
export const UGPP_ACTIVITIES = [
  { id: "A", label: "A — Agricultura, ganadería, silvicultura y pesca", costRate: 0.7 },
  { id: "B", label: "B — Explotación de minas y canteras", costRate: 0.7 },
  { id: "C", label: "C — Industrias manufactureras", costRate: 0.75 },
  { id: "D", label: "D — Electricidad, gas, vapor y aire acondicionado", costRate: 0.7 },
  { id: "E", label: "E — Agua y saneamiento", costRate: 0.7 },
  { id: "F", label: "F — Construcción", costRate: 0.8 },
  { id: "G", label: "G — Comercio al por mayor y al por menor", costRate: 0.75 },
  { id: "H", label: "H — Transporte y almacenamiento", costRate: 0.75 },
  { id: "I", label: "I — Alojamiento y servicios de comida", costRate: 0.7 },
  { id: "J", label: "J — Información y comunicaciones (software)", costRate: 0.6 },
  { id: "K", label: "K — Actividades financieras y de seguros", costRate: 0.6 },
  { id: "L", label: "L — Actividades inmobiliarias", costRate: 0.7 },
  { id: "M", label: "M — Profesionales, científicas y técnicas", costRate: 0.6 },
  { id: "N", label: "N — Servicios administrativos y de apoyo", costRate: 0.6 },
  { id: "P", label: "P — Educación", costRate: 0.6 },
  { id: "Q", label: "Q — Salud humana y asistencia social", costRate: 0.6 },
  { id: "R", label: "R — Artísticas, de entretenimiento y recreación", costRate: 0.6 },
  { id: "S", label: "S — Otras actividades de servicios", costRate: 0.6 },
];

export const DEFAULT_UGPP_ACTIVITY = "J";

/**
 * @param {string} id
 * @returns {UgppActivity | undefined}
 */
export function getUgppActivity(id) {
  return UGPP_ACTIVITIES.find((row) => row.id === id);
}

/**
 * @param {number} costRate
 * @returns {number}
 */
export function ibcFactorFromCostRate(costRate) {
  if (!Number.isFinite(costRate) || costRate < 0 || costRate >= 1) {
    return INDEPENDENT_IBC_FACTOR;
  }
  return Math.round((1 - costRate) * 1000) / 1000;
}

/**
 * @param {IncomeSource} source
 * @returns {number}
 */
export function honorariosIbcFactor(source) {
  if (source.presuncion !== "ugpp") return INDEPENDENT_IBC_FACTOR;
  const activity = source.ugppActivity ? getUgppActivity(source.ugppActivity) : undefined;
  if (!activity) return INDEPENDENT_IBC_FACTOR;
  return ibcFactorFromCostRate(activity.costRate);
}

/**
 * Writes `source.factor` for salario / honorarios. Leaves `otro` as entered.
 *
 * @param {IncomeSource} source
 * @returns {number}
 */
export function syncSourceFactor(source) {
  if (source.type === "salario") source.factor = 1;
  else if (source.type === "honorarios") source.factor = honorariosIbcFactor(source);
  return source.factor;
}

/**
 * @param {UgppActivity} activity
 * @returns {string}
 */
export function activityExplain(activity) {
  const costPct = Math.round(activity.costRate * 1000) / 10;
  const ibcPct = Math.round(ibcFactorFromCostRate(activity.costRate) * 1000) / 10;
  return `Costos presuntos ${costPct} % → IBC ${ibcPct} % del ingreso. Confirma el anexo UGPP vigente.`;
}
