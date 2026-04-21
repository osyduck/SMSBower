import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance, AxiosResponse } from "axios";

import {
  createSmsBowerClient,
  sendHttpRequest,
  SmsBowerApiError,
  SmsBowerParseError,
  SmsBowerTransportError,
} from "../../src/core/index.ts";

vi.mock("axios", () => {
  const mockRequest = vi.fn();
  return {
    default: { request: mockRequest },
    __mockRequest: mockRequest,
  };
});

const createMockAxiosInstance = (
  ...bodyResponses: string[]
): {
  calls: Array<{ url: string; method: string; headers: Record<string, string> }>;
  instance: AxiosInstance;
} => {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const queue = [...bodyResponses];

  const instance = {
    request: vi.fn(async (config: any) => {
      calls.push({ url: config.url, method: config.method, headers: config.headers });
      const bodyText = queue.shift();
      if (bodyText === undefined) {
        throw new Error("No mock response available.");
      }
      return { status: 200, data: bodyText } as AxiosResponse;
    }),
  } as unknown as AxiosInstance;

  return { calls, instance };
};

const getRequestParams = (
  call: { url: string; method: string; headers: Record<string, string> } | undefined,
): URLSearchParams => {
  if (!call) {
    return new URLSearchParams();
  }

  const parsedUrl = new URL(call.url);
  return parsedUrl.searchParams;
};

describe("createSmsBowerClient", () => {
  it("uses a custom baseUrl override for action requests", async () => {
    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const instance = {
      request: vi.fn(async (config: any) => {
        calls.push({ url: config.url, method: config.method, headers: config.headers });
        return { status: 200, data: "ACCESS_BALANCE:12.00" } as AxiosResponse;
      }),
    } as unknown as AxiosInstance;

    const client = createSmsBowerClient(
      {
        apiKey: "custom-key",
        baseUrl: "https://example.com/custom-handler.php",
        userAgent: "smsbower-tests/1.0",
      },
      { axios: instance },
    );

    await client.requestAction("getBalance");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.startsWith("https://example.com/custom-handler.php")).toBe(true);

    const params = getRequestParams(calls[0]);
    expect(params.get("api_key")).toBe("custom-key");
    expect(params.get("action")).toBe("getBalance");
    expect(calls[0]?.method).toBe("GET");
  });

  it("maps getBalance to token parsing", async () => {
    const { calls, instance } = createMockAxiosInstance("ACCESS_BALANCE:12.00");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getBalance();

    expect(result).toEqual({
      format: "token",
      token: "ACCESS_BALANCE",
      balance: "12.00",
      rawResponse: "ACCESS_BALANCE:12.00",
    });

    const params = getRequestParams(calls[0]);
    expect(params.get("action")).toBe("getBalance");
  });

  it("maps getServicesList to JSON parsing", async () => {
    const { calls, instance } = createMockAxiosInstance('{"ot":"Example Service"}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getServicesList();

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"ot":"Example Service"}',
      value: {
        ot: "Example Service",
      },
    });

    const params = getRequestParams(calls[0]);
    expect(params.get("action")).toBe("getServicesList");
  });

  it("normalizes wrapped getServicesList payload to canonical map", async () => {
    const { instance } = createMockAxiosInstance(
      '{"status":"success","services":[{"code":"ot","name":"WhatsApp"}]}',
    );

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getServicesList();

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"status":"success","services":[{"code":"ot","name":"WhatsApp"}]}',
      value: {
        ot: "WhatsApp",
      },
    });
  });

  it("uses last code wins when wrapped getServicesList has duplicate codes", async () => {
    const { instance } = createMockAxiosInstance(
      '{"status":"success","services":[{"code":"ot","name":"WhatsApp"},{"code":"ot","name":"WhatsApp Business"}]}',
    );

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getServicesList();

    expect(result).toEqual({
      format: "json",
      rawResponse:
        '{"status":"success","services":[{"code":"ot","name":"WhatsApp"},{"code":"ot","name":"WhatsApp Business"}]}',
      value: {
        ot: "WhatsApp Business",
      },
    });
  });

  it("ignores wrapped getServicesList entries with invalid code or name when valid entries exist", async () => {
    const { instance } = createMockAxiosInstance(
      '{"status":"success","services":[{"code":"ot","name":"WhatsApp"},{"code":null,"name":"BP - club"},{"code":"wa","name":"WhatsApp Business"},{"code":"","name":"Empty code"},{"code":"ig","name":null}]}',
    );

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getServicesList();

    expect(result).toEqual({
      format: "json",
      rawResponse:
        '{"status":"success","services":[{"code":"ot","name":"WhatsApp"},{"code":null,"name":"BP - club"},{"code":"wa","name":"WhatsApp Business"},{"code":"","name":"Empty code"},{"code":"ig","name":null}]}',
      value: {
        ot: "WhatsApp",
        wa: "WhatsApp Business",
      },
    });
  });

  it("normalizes empty wrapped getServicesList services array to empty map", async () => {
    const { instance } = createMockAxiosInstance('{"status":"success","services":[]}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getServicesList();

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"status":"success","services":[]}',
      value: {},
    });
  });

  it("throws MALFORMED_JSON for malformed wrapped getServicesList items", async () => {
    const malformedResponses = [
      '{"status":"success","services":[{"name":"WhatsApp"}]}',
      '{"status":"success","services":[{"code":"ot"}]}',
    ];

    for (const responseBody of malformedResponses) {
      const { instance } = createMockAxiosInstance(responseBody);

      const client = createSmsBowerClient(
        {
          apiKey: "api-key",
        },
        { axios: instance },
      );

      const requestPromise = client.getServicesList();

      await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerParseError);
      await expect(requestPromise).rejects.toMatchObject({
        code: "MALFORMED_JSON",
        rawResponse: responseBody,
      });
    }
  });

  it("maps getCountries to JSON parsing", async () => {
    const { calls, instance } = createMockAxiosInstance('{"6":{"id":"6","eng":"Russia","rus":"Россия"}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getCountries();

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"6":{"id":"6","eng":"Russia","rus":"Россия"}}',
      value: {
        6: {
          id: "6",
          eng: "Russia",
          rus: "Россия",
        },
      },
    });

    const params = getRequestParams(calls[0]);
    expect(params.get("action")).toBe("getCountries");
  });

  it("ignores malformed getCountries entries when valid entries exist", async () => {
    const { instance } = createMockAxiosInstance(
      '{"6":{"id":"6","eng":"Indonesia","rus":"Индонезия","chn":"印度尼西亚"},"":{"id":null,"eng":"Faroe Islands","rus":"Фарерские острова"}}',
    );

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getCountries();

    expect(result).toEqual({
      format: "json",
      rawResponse:
        '{"6":{"id":"6","eng":"Indonesia","rus":"Индонезия","chn":"印度尼西亚"},"":{"id":null,"eng":"Faroe Islands","rus":"Фарерские острова"}}',
      value: {
        6: {
          id: "6",
          eng: "Indonesia",
          rus: "Индонезия",
          chn: "印度尼西亚",
        },
      },
    });
  });

  it("maps getPrices to JSON parsing", async () => {
    const { calls, instance } = createMockAxiosInstance('{"ot":{"6":"12.50"}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getPrices({
      service: "ot",
      country: 6,
    });

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"ot":{"6":"12.50"}}',
      value: {
        ot: {
          6: "12.50",
        },
      },
    });

    const params = getRequestParams(calls[0]);
    expect(params.get("action")).toBe("getPrices");
    expect(params.get("service")).toBe("ot");
    expect(params.get("country")).toBe("6");
  });

  it("normalizes getPrices when upstream returns country-first quote shape", async () => {
    const { instance } = createMockAxiosInstance('{"6":{"ot":{"cost":0.21,"count":53097}}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getPrices({
      service: "ot",
      country: 6,
    });

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"6":{"ot":{"cost":0.21,"count":53097}}}',
      value: {
        ot: {
          6: "0.21",
        },
      },
    });
  });

  it("maps getPricesV2 to JSON parsing", async () => {
    const { calls, instance } = createMockAxiosInstance('{"ot":{"6":{"cost":"11.00","count":3}}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getPricesV2({
      service: "ot",
      country: 6,
    });

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"ot":{"6":{"cost":"11.00","count":3}}}',
      value: {
        ot: {
          6: {
            cost: "11.00",
            count: 3,
          },
        },
      },
    });

    const params = getRequestParams(calls[0]);
    expect(params.get("action")).toBe("getPricesV2");
    expect(params.get("service")).toBe("ot");
    expect(params.get("country")).toBe("6");
  });

  it("accepts getPricesV2 country-first bucket payload from live API", async () => {
    const { instance } = createMockAxiosInstance('{"6":{"ot":{"0.004":90,"0.21":919}}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getPricesV2({
      service: "ot",
      country: 6,
    });

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"6":{"ot":{"0.004":90,"0.21":919}}}',
      value: {
        6: {
          ot: {
            "0.004": 90,
            "0.21": 919,
          },
        },
      },
    });
  });

  it("maps getPricesV3 to JSON parsing with optional filters", async () => {
    const { calls, instance } = createMockAxiosInstance('{"2295":{"ot":{"cost":"10.00","count":"4"}}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getPricesV3({
      country: 6,
      service: "ot",
      providerIds: [2295, 3027, 1507],
    });

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"2295":{"ot":{"cost":"10.00","count":"4"}}}',
      value: {
        2295: {
          ot: {
            cost: "10.00",
            count: "4",
          },
        },
      },
    });

    const params = getRequestParams(calls[0]);
    expect(params.get("action")).toBe("getPricesV3");
    expect(params.get("country")).toBe("6");
    expect(params.get("service")).toBe("ot");
    expect(params.get("providerIds")).toBe("2295,3027,1507");
  });

  it("accepts getPricesV3 provider objects that use price key", async () => {
    const { instance } = createMockAxiosInstance(
      '{"6":{"ot":{"2295":{"count":3677,"price":0.01,"provider_id":2295}}}}',
    );

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const result = await client.getPricesV3({
      country: 6,
      service: "ot",
      providerIds: [2295],
    });

    expect(result).toEqual({
      format: "json",
      rawResponse: '{"6":{"ot":{"2295":{"count":3677,"price":0.01,"provider_id":2295}}}}',
      value: {
        6: {
          ot: {
            2295: {
              count: 3677,
              price: 0.01,
              provider_id: 2295,
            },
          },
        },
      },
    });
  });

  it("maps BAD_COUNTRY for getPricesV3 to SmsBowerApiError", async () => {
    const { instance } = createMockAxiosInstance("BAD_COUNTRY");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const requestPromise = client.getPricesV3({
      country: 6,
    });

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerApiError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "BAD_COUNTRY",
      token: "BAD_COUNTRY",
    });
  });

  it("maps BAD_KEY tokens to SmsBowerApiError for account endpoints", async () => {
    const { instance } = createMockAxiosInstance("BAD_KEY");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const requestPromise = client.getBalance();

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerApiError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "BAD_KEY",
      token: "BAD_KEY",
      rawResponse: "BAD_KEY",
    });
  });

  it("throws SmsBowerParseError for malformed JSON in catalog JSON endpoint wrappers", async () => {
    const { instance } = createMockAxiosInstance('{"ot":');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const requestPromise = client.getServicesList();

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "MALFORMED_JSON",
      rawResponse: '{"ot":',
    });
  });

  it("throws SmsBowerParseError for unexpected token format in JSON endpoint wrappers", async () => {
    const { instance } = createMockAxiosInstance("ACCESS_BALANCE:12.00");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const requestPromise = client.getServicesList();

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "UNKNOWN_TOKEN",
      token: "ACCESS_BALANCE",
      rawResponse: "ACCESS_BALANCE:12.00",
    });
  });

  it("maps BAD_COUNTRY for getPrices to SmsBowerApiError", async () => {
    const { instance } = createMockAxiosInstance("BAD_COUNTRY");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const requestPromise = client.getPrices({
      service: "ot",
      country: 6,
    });

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerApiError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "BAD_COUNTRY",
      token: "BAD_COUNTRY",
      rawResponse: "BAD_COUNTRY",
    });
  });

  it("maps BAD_COUNTRY for getPricesV2 to SmsBowerApiError", async () => {
    const { instance } = createMockAxiosInstance("BAD_COUNTRY");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const requestPromise = client.getPricesV2({
      service: "ot",
      country: 6,
    });

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerApiError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "BAD_COUNTRY",
      token: "BAD_COUNTRY",
      rawResponse: "BAD_COUNTRY",
    });
  });

  it("throws SmsBowerParseError for malformed JSON in price endpoint wrappers", async () => {
    const { instance } = createMockAxiosInstance('{"ot":');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { axios: instance },
    );

    const requestPromise = client.getPricesV3({
      country: 6,
    });

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "MALFORMED_JSON",
      rawResponse: '{"ot":',
    });
  });
});

describe("sendHttpRequest", () => {
  it("returns status and body text for successful requests", async () => {
    const { instance } = createMockAxiosInstance();
    const mockRequest = instance.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({ status: 201, data: "ACCESS_BALANCE:99.50" } as AxiosResponse);

    const response = await sendHttpRequest(
      {
        url: "https://example.com/handler.php",
        method: "GET",
        headers: {},
      },
      {
        timeoutMs: 250,
        axios: instance,
      },
    );

    expect(response).toEqual({
      status: 201,
      bodyText: "ACCESS_BALANCE:99.50",
    });
  });

  it("maps non-ok HTTP responses to typed HTTP_STATUS transport errors", async () => {
    const { instance } = createMockAxiosInstance();
    const mockRequest = instance.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({ status: 403, data: "BAD_KEY" } as AxiosResponse);

    const requestPromise = sendHttpRequest(
      {
        url: "https://example.com/handler.php",
        method: "GET",
        headers: {},
      },
      {
        timeoutMs: 250,
        axios: instance,
      },
    );

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerTransportError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "HTTP_STATUS",
      status: 403,
      responseBody: "BAD_KEY",
    });
  });

  it("maps timeout failures to typed transport timeout errors", async () => {
    const { instance } = createMockAxiosInstance();
    const mockRequest = instance.request as ReturnType<typeof vi.fn>;
    const timeoutError = Object.assign(new Error("timeout of 1ms exceeded"), {
      code: "ECONNABORTED",
      isAxiosError: true,
    });
    mockRequest.mockRejectedValueOnce(timeoutError);

    const requestPromise = sendHttpRequest(
      {
        url: "https://example.com/handler.php",
        method: "GET",
        headers: {},
      },
      {
        timeoutMs: 1,
        axios: instance,
      },
    );

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerTransportError);
    await expect(requestPromise).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("maps network failures to typed transport network errors", async () => {
    const { instance } = createMockAxiosInstance();
    const mockRequest = instance.request as ReturnType<typeof vi.fn>;
    mockRequest.mockRejectedValueOnce(new Error("Network Error"));

    const requestPromise = sendHttpRequest(
      {
        url: "https://example.com/handler.php",
        method: "GET",
        headers: {},
      },
      {
        timeoutMs: 250,
        axios: instance,
      },
    );

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerTransportError);
    await expect(requestPromise).rejects.toMatchObject({ code: "NETWORK" });
  });
});
