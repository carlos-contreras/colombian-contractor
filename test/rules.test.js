import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMonth, factorForType, paramsForYear } from "../js/rules.js";

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
  assert.equal(result.fsp, 0);
  assert.equal(
    result.totalContributions,
    result.salud + result.pension + result.arl + result.fsp,
  );
  assert.equal(result.cashAfter, result.grossTotal - result.totalContributions);
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
