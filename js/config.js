// @ts-check

/**
 * Reads a boolean configuration value from a build-injected environment,
 * runtime configuration, or a global fallback. The latter two keep the app
 * usable when deployed as plain static files without a bundler.
 *
 * Sign-up is closed by default. A static host can inject this before app.js
 * loads to open it for new users:
 *   window.__APP_CONFIG__ = { DISABLE_SIGN_ON: "false" };
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function asBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const buildEnv = import.meta.env ?? {};
const runtimeEnv = globalThis.__APP_CONFIG__ ?? {};
const configuredValue = buildEnv.DISABLE_SIGN_ON ?? runtimeEnv.DISABLE_SIGN_ON ?? globalThis.DISABLE_SIGN_ON;

/** @type {boolean} */
export const DISABLE_SIGN_ON = configuredValue === undefined ? true : asBoolean(configuredValue);
