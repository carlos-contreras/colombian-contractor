import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCop,
  formatUsd,
  formatYearMonth,
  parseCop,
  parseUsd,
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
