import {
  SMSBOWER_DEFAULT_BASE_URL,
  SMSBOWER_DEFAULT_TIMEOUT_MS,
  SMSBOWER_DEFAULT_USER_AGENT,
} from "./constants.js";
import type { ResolvedSmsBowerClientConfig, SmsBowerClientConfig } from "./types.js";

const assertNonEmptyString = (value: string | undefined, fieldName: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new TypeError(`SMSBower client config requires a non-empty ${fieldName}.`);
  }

  return normalized;
};

const normalizeTimeoutMs = (timeoutMs: number | undefined): number => {
  if (timeoutMs === undefined) {
    return SMSBOWER_DEFAULT_TIMEOUT_MS;
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("SMSBower client config timeoutMs must be a finite number greater than 0.");
  }

  return timeoutMs;
};

export const resolveClientConfig = (config: SmsBowerClientConfig): ResolvedSmsBowerClientConfig => {
  return {
    apiKey: assertNonEmptyString(config.apiKey, "apiKey"),
    baseUrl: assertNonEmptyString(config.baseUrl ?? SMSBOWER_DEFAULT_BASE_URL, "baseUrl"),
    timeoutMs: normalizeTimeoutMs(config.timeoutMs),
    userAgent: assertNonEmptyString(config.userAgent ?? SMSBOWER_DEFAULT_USER_AGENT, "userAgent"),
  };
};
