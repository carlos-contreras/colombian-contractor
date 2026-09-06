import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  TrmError,
  clearTrmCache,
  getTrm,
  quoteFromPayload,
  toIsoDateBogota,
  trmQueryUrl,
  usdToCopPesos,
} from "../js/trm.js";

afterEach(() => {
  clearTrmCache();
});

test("toIsoDateBogota passes through a valid calendar day", () => {
  assert.equal(toIsoDateBogota("2026-03-20"), "2026-03-20");
});

test("toIsoDateBogota rejects impossible dates", () => {
  assert.throws(() => toIsoDateBogota("2026-02-30"), (err) => {
    return err instanceof TrmError && err.code === "bad_date";
  });
  assert.throws(() => toIsoDateBogota("nope"), (err) => {
    return err instanceof TrmError && err.code === "bad_date";
  });
});

test("toIsoDateBogota uses America/Bogotá for Date instants", () => {
  assert.equal(toIsoDateBogota(new Date("2026-09-07T04:00:00.000Z")), "2026-09-06");
});

test("quoteFromPayload reads a weekend vigencia span", () => {
  const quote = quoteFromPayload(
    [
      {
        valor: "3126.08",
        unidad: "COP",
        vigenciadesde: "2026-09-05T00:00:00.000",
        vigenciahasta: "2026-09-08T00:00:00.000",
      },
    ],
    "2026-09-06",
  );
  assert.equal(quote.value, 3126.08);
  assert.equal(quote.validFrom, "2026-09-05");
  assert.equal(quote.validTo, "2026-09-08");
  assert.equal(quote.date, "2026-09-06");
});

test("quoteFromPayload maps an empty series to not_found", () => {
  assert.throws(() => quoteFromPayload([], "2026-12-01"), (err) => {
    return err instanceof TrmError && err.code === "not_found";
  });
});

test("quoteFromPayload rejects a non-positive valor", () => {
  assert.throws(
    () =>
      quoteFromPayload(
        [
          {
            valor: "0",
            unidad: "COP",
            vigenciadesde: "2026-03-20T00:00:00.000",
            vigenciahasta: "2026-03-20T00:00:00.000",
          },
        ],
        "2026-03-20",
      ),
    (err) => err instanceof TrmError && err.code === "bad_response",
  );
});

test("usdToCopPesos rounds to integer pesos", () => {
  assert.equal(usdToCopPesos(100, 3126.08), 312608);
  assert.equal(usdToCopPesos(1, 3692.48), 3692);
});

test("usdToCopPesos rejects a bad TRM", () => {
  assert.throws(() => usdToCopPesos(100, 0), (err) => {
    return err instanceof TrmError && err.code === "bad_amount";
  });
});

test("trmQueryUrl asks for the vigencia covering the day", () => {
  const url = trmQueryUrl("2026-09-06");
  assert.match(url, /32sa-8pi3\.json/);
  assert.match(url, /2026-09-06T00%3A00%3A00\.000/);
});

test("getTrm uses injected fetch and caches by date", async () => {
  const row = {
    valor: "3692.48",
    unidad: "COP",
    vigenciadesde: "2026-03-20T00:00:00.000",
    vigenciahasta: "2026-03-20T00:00:00.000",
  };
  let calls = 0;
  /** @type {typeof fetch} */
  const fakeFetch = async () => {
    calls += 1;
    return new Response(JSON.stringify([row]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const first = await getTrm("2026-03-20", { fetch: fakeFetch });
  const second = await getTrm("2026-03-20", { fetch: fakeFetch });
  assert.equal(first.value, 3692.48);
  assert.equal(second, first);
  assert.equal(calls, 1);
});

test("getTrm maps HTTP failure to network", async () => {
  /** @type {typeof fetch} */
  const fakeFetch = async () => new Response("nope", { status: 503 });

  await assert.rejects(() => getTrm("2026-03-20", { fetch: fakeFetch }), (err) => {
    return err instanceof TrmError && err.code === "network";
  });
});
