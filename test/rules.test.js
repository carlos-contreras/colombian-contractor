import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMonth, factorForType, fspBreakdown, paramsForYear } from "../js/rules.js";

/** @param {Partial<import("../js/rules.js").IncomeSource> & { id: string }} extra */
function source(extra) {
  return {
    type: /** @type {const} */ ("honorarios"),
    label: "",
    amount: 0,
    factor: 0.4,
    ...extra,
  };
}

test("factorForType uses 1 for salario and the independent factor otherwise", () => {
  const params = paramsForYear(2026);
  assert.equal(factorForType("salario", params), 1);
  assert.equal(factorForType("honorarios", params), 0.4);
  assert.equal(factorForType("otro", params), 0.4);
});

test("empty month is all zeros", () => {
  const result = computeMonth([], paramsForYear(2026));
  assert.equal(result.grossTotal, 0);
  assert.equal(result.ibcFinal, 0);
  assert.equal(result.totalContributions, 0);
  assert.deepEqual(result.warnings, []);
});

test("honorarios apply 40% per line then sum", () => {
  const params = paramsForYear(2026);
  const result = computeMonth(
    [
      source({ id: "a", amount: 10_000_000, factor: 0.4 }),
      source({ id: "b", amount: 5_000_000, factor: 0.4 }),
    ],
    params,
  );
  assert.equal(result.grossTotal, 15_000_000);
  assert.equal(result.ibcRaw, 6_000_000);
  assert.equal(result.perSource[0].ibc, 4_000_000);
  assert.equal(result.perSource[1].ibc, 2_000_000);
});

test("floor raises IBC to 1 SMMLV when there is activity", () => {
  const params = paramsForYear(2026);
  const result = computeMonth(
    [source({ id: "a", amount: 1_000_000, factor: 0.4 })],
    params,
  );
  assert.equal(result.ibcRaw, 400_000);
  assert.equal(result.ibcFinal, params.smmlv);
  assert.equal(result.warnings.includes("floor"), true);
});

test("ceiling caps IBC at 25 SMMLV", () => {
  const params = paramsForYear(2026);
  const ceiling = 25 * params.smmlv;
  const result = computeMonth(
    [source({ id: "a", type: "salario", amount: ceiling * 2, factor: 1 })],
    params,
  );
  assert.equal(result.ibcCapped, ceiling);
  assert.equal(result.ibcFinal, ceiling);
  assert.equal(result.warnings.includes("ceiling"), true);
});

test("CCF independent contribution uses the selected rate", () => {
  const params = paramsForYear(2026);
  const sourceLine = [source({ id: "a", amount: 5_000_000, factor: 0.4 })];

  sourceLine[0].ccfRate = /** @type {any} */ ("0.006");
  const basic = computeMonth(sourceLine, params);
  assert.equal(basic.ibcFinal, 2_000_000);
  assert.equal(basic.ccf, 12_000);

  sourceLine[0].ccfRate = /** @type {any} */ ("0.02");
  const full = computeMonth(sourceLine, params);
  assert.equal(full.ccf, 40_000);
  assert.equal(full.totalContributions - basic.totalContributions, 28_000);

  sourceLine[0].ccfRate = /** @type {any} */ ("0.6");
  assert.equal(computeMonth(sourceLine, params).ccf, 12_000);

  sourceLine[0].ccfRate = /** @type {any} */ ("0,6");
  assert.equal(computeMonth(sourceLine, params).ccf, 12_000);

  sourceLine[0].ccfRate = /** @type {any} */ ("2");
  assert.equal(computeMonth(sourceLine, params).ccf, 40_000);

  sourceLine[0].ccfRate = 0;
  assert.equal(computeMonth(sourceLine, params).ccf, 0);

  assert.equal(
    computeMonth([source({ id: "salary", type: "salario", amount: 5_000_000, factor: 1, ccfRate: 0.02 })], params).ccf,
    0,
  );

  assert.equal(
    computeMonth([source({ id: "other", type: "otro", amount: 5_000_000, factor: 0.4, ccfRate: 0.02 })], params).ccf,
    40_000,
  );
});

test("contributions are rounded pesos from IBC final", () => {
  const params = paramsForYear(2026);
  params.arlClass = "I";
  const result = computeMonth(
    [source({ id: "a", type: "salario", amount: 10_000_000, factor: 1 })],
    params,
  );
  assert.equal(result.ibcFinal, 10_000_000);
  assert.equal(result.salud, Math.round(10_000_000 * params.saludRate));
  assert.equal(result.pension, Math.round(10_000_000 * params.pensionRate));
  assert.equal(result.arl, Math.round(10_000_000 * params.arlRates.I));
  const fspParts = fspBreakdown(10_000_000, params.smmlv);
  assert.equal(result.fspSolidaridad, fspParts.solidaridad);
  assert.equal(result.fspSubsistencia, fspParts.subsistencia);
  assert.equal(result.fsp, fspParts.total);
  assert.equal(
    result.totalContributions,
    result.salud + result.pension + result.arl + result.fsp,
  );
  assert.equal(result.cashAfter, result.grossTotal - result.totalContributions);
});

test("capital IBC is 40% of net after 28.08% presumed costs", () => {
  const result = computeMonth(
    [
      source({
        id: "c",
        type: "renta_capital",
        amount: 10_000_000,
        factor: 0,
        costMode: "presunto",
      }),
    ],
    paramsForYear(2026),
  );
  assert.equal(result.perSource[0].net, 7_192_000);
  assert.equal(result.ibcCapital, 2_876_800);
  assert.equal(result.ibcHonorarios, 0);
  assert.equal(result.ibcRaw, 2_876_800);
});

test("capital real costs then 40% of net", () => {
  const result = computeMonth(
    [
      source({
        id: "c",
        type: "renta_capital",
        amount: 10_000_000,
        factor: 0,
        costMode: "real",
        costAmount: 3_000_000,
      }),
    ],
    paramsForYear(2026),
  );
  assert.equal(result.perSource[0].net, 7_000_000);
  assert.equal(result.ibcCapital, 2_800_000);
});

test("FSP on 4.57 SMLMV", () => {
  const smmlv = paramsForYear(2026).smmlv;
  const ibc = Math.round(4.57 * smmlv);
  const result = computeMonth(
    [source({ id: "h", type: "salario", amount: ibc, factor: 1 })],
    paramsForYear(2026),
  );
  assert.equal(result.ibcFinal, ibc);
  assert.equal(result.fspSolidaridad, Math.round(ibc * 0.005));
  assert.equal(result.fspSubsistencia, Math.round(ibc * 0.005));
  assert.equal(result.fsp, result.fspSolidaridad + result.fspSubsistencia);
});

test("PILA uses honorarios IBC plus capital IBC", () => {
  const params = paramsForYear(2026);
  const result = computeMonth(
    [
      source({ id: "h", amount: 10_000_000, factor: 0.4 }),
      source({
        id: "c",
        type: "renta_capital",
        amount: 10_000_000,
        factor: 0,
        costMode: "presunto",
      }),
    ],
    params,
  );
  assert.equal(result.ibcHonorarios, 4_000_000);
  assert.equal(result.ibcCapital, 2_876_800);
  assert.equal(result.ibcRaw, 6_876_800);
  assert.equal(result.salud, Math.round(result.ibcFinal * params.saludRate));
});

test("missing ARL class warns and charges 0 ARL", () => {
  const params = paramsForYear(2026);
  params.arlClass = "Z";
  const result = computeMonth(
    [source({ id: "a", type: "salario", amount: 2_000_000, factor: 1 })],
    params,
  );
  assert.equal(result.arl, 0);
  assert.equal(result.warnings.includes("missing_arl"), true);
});
