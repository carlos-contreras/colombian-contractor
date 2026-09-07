// @ts-check

/**
 * Supabase persistence implementation. This module only receives an already
 * authenticated context from store.js; RLS remains the final authorization
 * boundary in the database.
 *
 * @typedef {import("./store.js").MonthRecord} MonthRecord
 * @typedef {import("./store.js").MonthSummary} MonthSummary
 * @typedef {import("./store.js").ExportPayload} ExportPayload
 * @typedef {import("./rules.js").YearParams} YearParams
 * @typedef {import("./trm.js").TrmQuote} TrmQuote
 */

/** @param {any} context @returns {any} */
function clientOf(context) {
  return context.client;
}

/** @param {any} error */
function throwIfError(error) {
  if (error) throw error;
}

/** @param {any} row @returns {MonthRecord} */
function monthFromRow(row) {
  return {
    yearMonth: row.year_month,
    sources: row.sources ?? [],
    params: row.params ?? {},
    ...(row.result == null ? {} : { result: row.result }),
  };
}

/** @param {any} row @returns {YearParams} */
function yearParamsFromRow(row) {
  return { ...(row.params ?? {}), year: row.year };
}

/** @param {any} context @returns {Promise<MonthSummary[]>} */
export async function listMonths(context) {
  const { data, error } = await clientOf(context)
    .from("months")
    .select("year_month, ibc_final, total_contributions")
    .order("year_month", { ascending: false });
  throwIfError(error);
  return (data ?? []).map((row) => ({
    yearMonth: row.year_month,
    ibcFinal: Number(row.ibc_final ?? 0),
    totalContributions: Number(row.total_contributions ?? 0),
  }));
}

/** @param {any} context @param {string} yearMonth @returns {Promise<MonthRecord | null>} */
export async function getMonth(context, yearMonth) {
  const { data, error } = await clientOf(context)
    .from("months")
    .select("year_month, sources, params, result")
    .eq("year_month", yearMonth)
    .maybeSingle();
  throwIfError(error);
  return data ? monthFromRow(data) : null;
}

/** @param {any} context @param {string} yearMonth @param {MonthRecord} record @returns {Promise<void>} */
export async function saveMonth(context, yearMonth, record) {
  const result = record.result;
  const { error } = await clientOf(context).from("months").upsert({
    user_id: context.userId,
    year_month: yearMonth,
    sources: record.sources,
    params: record.params,
    result: result ?? null,
    ibc_final: result?.ibcFinal ?? 0,
    total_contributions: result?.totalContributions ?? 0,
  }, { onConflict: "user_id,year_month" });
  throwIfError(error);
}

/** @param {any} context @param {string} yearMonth @returns {Promise<void>} */
export async function deleteMonth(context, yearMonth) {
  const { error } = await clientOf(context).from("months")
    .delete().eq("user_id", context.userId).eq("year_month", yearMonth);
  throwIfError(error);
}

/** @param {any} context @returns {Promise<ExportPayload>} */
export async function exportAll(context) {
  const client = clientOf(context);
  const [months, yearParams, trms, trmMonths] = await Promise.all([
    client.from("months").select("year_month, sources, params, result"),
    client.from("year_params").select("year, params"),
    client.from("trm_quotes").select("quote_date, quote"),
    client.from("trm_months").select("year_month"),
  ]);
  for (const response of [months, yearParams, trms, trmMonths]) throwIfError(response.error);
  return {
    version: 1,
    months: (months.data ?? []).map(monthFromRow),
    yearParams: (yearParams.data ?? []).map(yearParamsFromRow),
    trms: (trms.data ?? []).map((row) => ({ ...(row.quote ?? {}), date: row.quote_date })),
    trmMonthsLoaded: (trmMonths.data ?? []).map((row) => row.year_month),
  };
}

/** @param {any} context @param {ExportPayload} payload @returns {Promise<void>} */
export async function importAll(context, payload) {
  const { error } = await clientOf(context).rpc("replace_archive", { p_payload: payload });
  throwIfError(error);
}

/** @param {any} context @returns {Promise<void>} */
export async function clearAll(context) {
  const client = clientOf(context);
  for (const table of ["months", "year_params", "trm_quotes", "trm_months"]) {
    const { error } = await client.from(table).delete().eq("user_id", context.userId);
    throwIfError(error);
  }
}

/** @param {any} context @param {number} year @returns {Promise<YearParams | null>} */
export async function getYearParams(context, year) {
  const { data, error } = await clientOf(context).from("year_params")
    .select("year, params").eq("year", year).maybeSingle();
  throwIfError(error);
  return data ? yearParamsFromRow(data) : null;
}

/** @param {any} context @param {number} year @param {YearParams} params @returns {Promise<void>} */
export async function saveYearParams(context, year, params) {
  const { error } = await clientOf(context).from("year_params").upsert({
    user_id: context.userId,
    year,
    params: { ...params, year },
  }, { onConflict: "user_id,year" });
  throwIfError(error);
}

/** @param {any} context @param {string} isoDate @returns {Promise<TrmQuote | null>} */
export async function getCachedTrm(context, isoDate) {
  const { data, error } = await clientOf(context).from("trm_quotes")
    .select("quote_date, quote").eq("quote_date", isoDate).maybeSingle();
  throwIfError(error);
  return data ? { ...(data.quote ?? {}), date: data.quote_date } : null;
}

/** @param {any} context @param {TrmQuote[]} quotes @returns {Promise<void>} */
export async function putTrms(context, quotes) {
  const rows = quotes.filter((quote) => quote?.date).map((quote) => ({
    user_id: context.userId,
    quote_date: quote.date,
    quote,
  }));
  if (rows.length === 0) return;
  const { error } = await clientOf(context).from("trm_quotes").upsert(rows, { onConflict: "user_id,quote_date" });
  throwIfError(error);
}

/** @param {any} context @param {string} yearMonth @returns {Promise<boolean>} */
export async function isTrmMonthLoaded(context, yearMonth) {
  const { data, error } = await clientOf(context).from("trm_months")
    .select("year_month").eq("year_month", yearMonth).maybeSingle();
  throwIfError(error);
  return Boolean(data);
}

/** @param {any} context @param {string} yearMonth @returns {Promise<void>} */
export async function markTrmMonthLoaded(context, yearMonth) {
  const { error } = await clientOf(context).from("trm_months").upsert({
    user_id: context.userId,
    year_month: yearMonth,
  }, { onConflict: "user_id,year_month" });
  throwIfError(error);
}

/** @param {any} context @param {string} yearMonth @returns {Promise<TrmQuote[]>} */
export async function listTrmsForMonth(context, yearMonth) {
  const { data, error } = await clientOf(context).from("trm_quotes")
    .select("quote_date, quote").gte("quote_date", `${yearMonth}-01`).lt("quote_date", nextMonth(yearMonth));
  throwIfError(error);
  return (data ?? []).map((row) => ({ ...(row.quote ?? {}), date: row.quote_date }));
}

/** @param {string} yearMonth @returns {string} */
function nextMonth(yearMonth) {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
