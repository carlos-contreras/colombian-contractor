import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCop,
  formatUsd,
  formatYearMonth,
  lastIsoOfMonth,
  parseCop,
  parseUsd,
  previousYearMonth,
} from "../js/format.js";

test("formatCop uses period thousands", () => {
  assert.equal(formatCop(1234567), "$ 1.234.567");
  assert.equal(formatCop(-50), "-$ 50");
  assert.equal(formatCop(0), "$ 0");
});

test("parseCop strips separators", () => {
  assert.equal(parseCop("$ 1.234.567"), 1234567);
  assert.equal(parseCop("5000000"), 5_000_000);
  assert.equal(parseCop(""), 0);
});

test("parseUsd treats point as decimal", () => {
  assert.equal(parseUsd("1,234.50"), 1234.5);
  assert.equal(parseUsd("3500"), 3500);
});

test("formatUsd has two fraction digits", () => {
  assert.equal(formatUsd(3500), "3,500.00");
});

test("formatYearMonth is Spanish", () => {
  assert.match(formatYearMonth("2026-09"), /septiembre/i);
  assert.match(formatYearMonth("2026-09"), /2026/);
});

test("previousYearMonth steps back one calendar month", () => {
  assert.equal(previousYearMonth("2026-09"), "2026-08");
  assert.equal(previousYearMonth("2026-01-15"), "2025-12");
});

test("lastIsoOfMonth", () => {
  assert.equal(lastIsoOfMonth("2026-08"), "2026-08-31");
  assert.equal(lastIsoOfMonth("2026-02"), "2026-02-28");
});
