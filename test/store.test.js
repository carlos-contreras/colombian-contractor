import test from "node:test";
import assert from "node:assert/strict";
import * as store from "../js/store.js";

const params = {
  year: 2026,
  smmlv: 1_750_905,
  independentFactor: 0.4,
  saludRate: 0.125,
  pensionRate: 0.16,
  arlClass: "I",
  arlRates: { I: 0.00522 },
};

const record = {
  yearMonth: "2026-01",
  sources: [{ id: "one", type: "honorarios", label: "Cliente", amount: 1_000_000, factor: 0.4 }],
  params,
  result: { ibcFinal: 400_000, totalContributions: 114_600 },
};

test("store saves and retrieves month records", async () => {
  await store.clearAll();
  await store.saveMonth(record.yearMonth, record);

  assert.deepEqual(await store.getMonth(record.yearMonth), record);
  assert.deepEqual(await store.listMonths(), [
    { yearMonth: "2026-01", ibcFinal: 400_000, totalContributions: 114_600 },
  ]);
});

test("store export/import replaces data", async () => {
  await store.saveYearParams(2026, params);
  await store.putTrms([
    {
      date: "2026-01-30",
      value: 4_000,
      validFrom: "2026-01-30",
      validTo: "2026-02-02",
      unit: "COP por USD",
      source: "test",
    },
  ]);
  await store.markTrmMonthLoaded("2026-01");

  const payload = await store.exportAll();
  await store.clearAll();
  assert.equal(await store.getMonth("2026-01"), null);

  await store.importAll(payload);
  assert.deepEqual(await store.getMonth("2026-01"), record);
  assert.deepEqual(await store.getYearParams(2026), params);
  assert.equal((await store.getCachedTrm("2026-01-30")).value, 4_000);
  assert.equal(await store.isTrmMonthLoaded("2026-01"), true);
});
