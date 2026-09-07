// @ts-check

/**
 * Supabase browser client.
 *
 * The publishable key is intentionally client-side. Database access is
 * protected by Supabase Auth and Row Level Security; never put a service-role
 * key in this file.
 */
export const SUPABASE_URL = "https://tzbaxvkayrihzxbxzroc.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_DWm4GRLXdVBmYb8Ytbn5PQ_Pqelvi6D";

/** @type {Promise<any> | null} */
let clientPromise = null;

/** @returns {Promise<any>} */
export function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2?bundle").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY),
    );
  }
  return clientPromise;
}

/**
 * Returns the authenticated client context. Node tests deliberately receive
 * null because they must continue using the local in-memory adapter.
 *
 * @returns {Promise<{client: any, userId: string} | null>}
 */
export async function getSupabaseContext() {
  if (typeof window === "undefined") return null;
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user?.id;
  return userId ? { client, userId } : null;
}

/** @returns {Promise<any | null>} */
export async function getAuthSession() {
  if (typeof window === "undefined") return null;
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

/** @param {string} email @param {string} password @returns {Promise<any>} */
export async function signIn(email, password) {
  const client = await getSupabaseClient();
  return client.auth.signInWithPassword({ email, password });
}

/** @param {string} email @param {string} password @returns {Promise<any>} */
export async function signUp(email, password) {
  const client = await getSupabaseClient();
  return client.auth.signUp({ email, password });
}

/** @returns {Promise<any>} */
export async function signOut() {
  const client = await getSupabaseClient();
  return client.auth.signOut();
}
