import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFICIAL_SMMLV,
  STATUTORY_RATES,
  hasOfficialSmmlv,
  loadYearParams,
} from "../js/gov.js";
import * as store from "../js/store.js";

test("loadYearParams uses decree SMMLV and statutory rates for 2025", () => {
  const params = loadYearParams(2025);
  assert.equal(params.smmlv, OFFICIAL_SMMLV[2025]);
  assert.equal(params.independentFactor, STATUTORY_RATES.independentFactor);
  assert.equal(params.saludRate, STATUTORY_RATES.saludRate);
  assert.equal(params.pensionRate, STATUTORY_RATES.pensionRate);
  assert.equal(hasOfficialSmmlv(2025), true);
});

test("loadYearParams uses 2026 SMMLV 1.750.905 not auxilio-inclusive 2.000.000", () => {
  assert.equal(hasOfficialSmmlv(2026), true);
  assert.equal(loadYearParams(2026).smmlv, 1_750_905);
});

test("loadYearParams keeps a fallback SMMLV when the year is missing", () => {
  assert.equal(hasOfficialSmmlv(2027), false);
  const params = loadYearParams(2027);
  assert.equal(params.year, 2027);
  assert.ok(params.smmlv > 0);
});

test("store caches year params and monthly TRMs", async () => {
  await store.clearAll();
  const params = loadYearParams(2025);
  await store.saveYearParams(2025, params);
  const cached = await store.getYearParams(2025);
  assert.equal(cached?.smmlv, params.smmlv);

  await store.putTrms([
    {
      date: "2026-08-02",
      value: 3144.14,
      validFrom: "2026-08-01",
      validTo: "2026-08-03",
      unit: "COP",
      source: "test",
    },
  ]);
  const quote = await store.getCachedTrm("2026-08-02");
  assert.equal(quote?.value, 3144.14);
  const month = await store.listTrmsForMonth("2026-08");
  assert.equal(month.length, 1);
  await store.clearAll();
});
