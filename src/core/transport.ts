import axios, { type AxiosInstance, type AxiosError } from "axios";
import { SmsBowerTransportError } from "./errors.js";
import type { HttpRequest, HttpResponse } from "./types.js";

interface SendHttpRequestOptions {
  timeoutMs: number;
  axios?: AxiosInstance;
}

const resolveAxios = (axiosOverride: AxiosInstance | undefined): AxiosInstance => {
  return axiosOverride ?? axios;
};

export const sendHttpRequest = async (
  request: HttpRequest,
  options: SendHttpRequestOptions,
): Promise<HttpResponse> => {
  const client = resolveAxios(options.axios);

  try {
    const response = await client.request({
      url: request.url,
      method: request.method,
      headers: request.headers,
      timeout: options.timeoutMs,
      // Force text response to match previous behavior
      responseType: "text",
      // Prevent axios from throwing on non-2xx (we handle it ourselves)
      validateStatus: () => true,
    });

    const status: number = response.status;
    const bodyText: string = typeof response.data === "string" ? response.data : JSON.stringify(response.data);

    if (status < 200 || status >= 300) {
      throw new SmsBowerTransportError(
        `SMSBower request failed with HTTP status ${status}.`,
        "HTTP_STATUS",
        { status, responseBody: bodyText },
      );
    }

    return { status, bodyText };
  } catch (error) {
    if (error instanceof SmsBowerTransportError) {
      throw error;
    }

    const axiosError = error as AxiosError;

    if (axiosError.code === "ECONNABORTED" || axiosError.code === "ERR_CANCELED") {
      throw new SmsBowerTransportError("SMSBower request timed out.", "TIMEOUT", {
        cause: error,
      });
    }

    throw new SmsBowerTransportError("SMSBower network request failed.", "NETWORK", {
      cause: error,
    });
  }
};
