import type { SmsBowerActionParamsMap, SmsBowerEndpointAction } from "./contracts.js";
import type { ActionParams, HttpRequest, ResolvedSmsBowerClientConfig } from "./types.js";

export const buildActionRequest = <TAction extends SmsBowerEndpointAction>(
  config: ResolvedSmsBowerClientConfig,
  action: TAction,
  params: SmsBowerActionParamsMap[TAction],
): HttpRequest => {
  const normalizedAction = action.trim();
  if (!normalizedAction) {
    throw new TypeError("SMSBower request action must be a non-empty string.");
  }

  const queryParams = new URLSearchParams();
  queryParams.set("api_key", config.apiKey);
  queryParams.set("action", normalizedAction);

  for (const [key, value] of Object.entries(params as ActionParams)) {
    if (value !== undefined) {
      queryParams.set(key, String(value));
    }
  }

  const requestUrl = new URL(config.baseUrl);
  queryParams.forEach((value, key) => {
    requestUrl.searchParams.set(key, value);
  });

  return {
    url: requestUrl.toString(),
    method: "GET",
    headers: {
      "user-agent": config.userAgent,
    },
  };
};
