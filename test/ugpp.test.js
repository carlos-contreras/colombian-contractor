import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMonth, paramsForYear } from "../js/rules.js";
import {
  DEFAULT_UGPP_ACTIVITY,
  INDEPENDENT_IBC_FACTOR,
  getUgppActivity,
  honorariosIbcFactor,
  ibcFactorFromCostRate,
  syncSourceFactor,
} from "../js/ugpp.js";

test("without presunción honorarios IBC factor is the 40% constant", () => {
  assert.equal(INDEPENDENT_IBC_FACTOR, 0.4);
  assert.equal(
    honorariosIbcFactor({
      id: "a",
      type: "honorarios",
      label: "",
      amount: 0,
      factor: 0,
      presuncion: "sin",
    }),
    0.4,
  );
});

test("UGPP software section J is 60% costs → 40% IBC", () => {
  const activity = getUgppActivity(DEFAULT_UGPP_ACTIVITY);
  assert.ok(activity);
  assert.equal(activity.costRate, 0.6);
  assert.equal(ibcFactorFromCostRate(activity.costRate), 0.4);
});

test("construction section F uses a higher cost share", () => {
  const activity = getUgppActivity("F");
  assert.ok(activity);
  assert.equal(ibcFactorFromCostRate(activity.costRate), 0.2);
});

test("syncSourceFactor writes honorarios factor from UGPP activity", () => {
  const source = {
    id: "a",
    type: /** @type {const} */ ("honorarios"),
    label: "",
    amount: 10_000_000,
    factor: 0,
    presuncion: /** @type {const} */ ("ugpp"),
    ugppActivity: "F",
  };
  syncSourceFactor(source);
  assert.equal(source.factor, 0.2);
  const result = computeMonth([source], paramsForYear(2026));
  assert.equal(result.perSource[0].ibc, 2_000_000);
});

test("missing UGPP activity warns", () => {
  const result = computeMonth(
    [
      {
        id: "a",
        type: "honorarios",
        label: "",
        amount: 10_000_000,
        factor: 0.4,
        presuncion: "ugpp",
      },
    ],
    paramsForYear(2026),
  );
  assert.equal(result.warnings.includes("missing_ugpp_activity"), true);
});
