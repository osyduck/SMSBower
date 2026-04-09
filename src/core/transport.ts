import { SmsBowerTransportError, isAbortError } from "./errors.js";
import type { FetchLike, HttpRequest, HttpResponse } from "./types.js";

interface SendHttpRequestOptions {
  timeoutMs: number;
  fetch?: FetchLike;
}

const resolveFetch = (fetchOverride: FetchLike | undefined): FetchLike => {
  if (fetchOverride) {
    return fetchOverride;
  }

  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch as FetchLike;
  }

  throw new SmsBowerTransportError("No fetch implementation available for SMSBower transport.", "NETWORK");
};

export const sendHttpRequest = async (
  request: HttpRequest,
  options: SendHttpRequestOptions,
): Promise<HttpResponse> => {
  const fetchImpl = resolveFetch(options.fetch);
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, options.timeoutMs);

  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      signal: abortController.signal,
    });

    const bodyText = await response.text();

    if (!response.ok) {
      throw new SmsBowerTransportError(
        `SMSBower request failed with HTTP status ${response.status}.`,
        "HTTP_STATUS",
        { status: response.status },
      );
    }

    return {
      status: response.status,
      bodyText,
    };
  } catch (error) {
    if (error instanceof SmsBowerTransportError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new SmsBowerTransportError("SMSBower request timed out.", "TIMEOUT", {
        cause: error,
      });
    }

    throw new SmsBowerTransportError("SMSBower network request failed.", "NETWORK", {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
};
