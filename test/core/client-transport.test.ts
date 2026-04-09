import { describe, expect, it, vi } from "vitest";

import {
  createSmsBowerClient,
  sendHttpRequest,
  SmsBowerApiError,
  SmsBowerParseError,
  SmsBowerTransportError,
  type FetchLike,
} from "../../src/core/index.ts";

const createSequencedFetchMock = (...bodyResponses: string[]): {
  calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }>;
  fetch: FetchLike;
} => {
  const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
  const queue = [...bodyResponses];

  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });

      const bodyText = queue.shift();
      if (bodyText === undefined) {
        throw new Error("No mock response available for fetch call.");
      }

      return {
        ok: true,
        status: 200,
        text: async () => bodyText,
      };
    },
  };
};

const getRequestParams = (call: { url: string; init?: Parameters<FetchLike>[1] } | undefined): URLSearchParams => {
  if (!call) {
    return new URLSearchParams();
  }

  const parsedUrl = new URL(call.url);
  if (parsedUrl.searchParams.toString().length > 0) {
    return parsedUrl.searchParams;
  }

  return new URLSearchParams(typeof call.init?.body === "string" ? call.init.body : "");
};

describe("createSmsBowerClient", () => {
  it("uses a custom baseUrl override for action requests", async () => {
    const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
    const fetchMock: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => "ACCESS_BALANCE:12.00",
      };
    };

    const client = createSmsBowerClient(
      {
        apiKey: "custom-key",
        baseUrl: "https://example.com/custom-handler.php",
        userAgent: "smsbower-tests/1.0",
      },
      { fetch: fetchMock },
    );

    await client.requestAction("getBalance");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.startsWith("https://example.com/custom-handler.php")).toBe(true);

    const params = getRequestParams(calls[0]);
    expect(params.get("api_key")).toBe("custom-key");
    expect(params.get("action")).toBe("getBalance");
    expect(calls[0]?.init?.method).toBe("GET");
  });

  it("maps getBalance to token parsing", async () => {
    const { calls, fetch } = createSequencedFetchMock("ACCESS_BALANCE:12.00");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
    const { calls, fetch } = createSequencedFetchMock('{"ot":"Example Service"}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
    const { fetch } = createSequencedFetchMock(
      '{"status":"success","services":[{"code":"ot","name":"WhatsApp"}]}',
    );

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
    const { fetch } = createSequencedFetchMock(
      '{"status":"success","services":[{"code":"ot","name":"WhatsApp"},{"code":"ot","name":"WhatsApp Business"}]}',
    );

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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

  it("normalizes empty wrapped getServicesList services array to empty map", async () => {
    const { fetch } = createSequencedFetchMock('{"status":"success","services":[]}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
      const { fetch } = createSequencedFetchMock(responseBody);

      const client = createSmsBowerClient(
        {
          apiKey: "api-key",
        },
        { fetch },
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
    const { calls, fetch } = createSequencedFetchMock('{"6":{"id":"6","eng":"Russia","rus":"Россия"}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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

  it("maps getPrices to JSON parsing", async () => {
    const { calls, fetch } = createSequencedFetchMock('{"ot":{"6":"12.50"}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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

  it("maps getPricesV2 to JSON parsing", async () => {
    const { calls, fetch } = createSequencedFetchMock('{"ot":{"6":{"cost":"11.00","count":3}}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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

  it("maps getPricesV3 to JSON parsing with optional filters", async () => {
    const { calls, fetch } = createSequencedFetchMock('{"2295":{"ot":{"cost":"10.00","count":"4"}}}');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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

  it("maps BAD_COUNTRY for getPricesV3 to SmsBowerApiError", async () => {
    const { fetch } = createSequencedFetchMock("BAD_COUNTRY");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
    const { fetch } = createSequencedFetchMock("BAD_KEY");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
    const { fetch } = createSequencedFetchMock('{"ot":');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
    );

    const requestPromise = client.getServicesList();

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "MALFORMED_JSON",
      rawResponse: '{"ot":',
    });
  });

  it("throws SmsBowerParseError for unexpected token format in JSON endpoint wrappers", async () => {
    const { fetch } = createSequencedFetchMock("ACCESS_BALANCE:12.00");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
    const { fetch } = createSequencedFetchMock("BAD_COUNTRY");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
    const { fetch } = createSequencedFetchMock("BAD_COUNTRY");

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
    const { fetch } = createSequencedFetchMock('{"ot":');

    const client = createSmsBowerClient(
      {
        apiKey: "api-key",
      },
      { fetch },
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
    const successFetch: FetchLike = async () => {
      return {
        ok: true,
        status: 201,
        text: async () => "ACCESS_BALANCE:99.50",
      };
    };

    const response = await sendHttpRequest(
      {
        url: "https://example.com/handler.php",
        method: "GET",
        headers: {},
      },
      {
        timeoutMs: 250,
        fetch: successFetch,
      },
    );

    expect(response).toEqual({
      status: 201,
      bodyText: "ACCESS_BALANCE:99.50",
    });
  });

  it("maps non-ok HTTP responses to typed HTTP_STATUS transport errors", async () => {
    const nonOkFetch: FetchLike = async () => {
      return {
        ok: false,
        status: 403,
        text: async () => "BAD_KEY",
      };
    };

    const requestPromise = sendHttpRequest(
      {
        url: "https://example.com/handler.php",
        method: "GET",
        headers: {},
      },
      {
        timeoutMs: 250,
        fetch: nonOkFetch,
      },
    );

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerTransportError);
    await expect(requestPromise).rejects.toMatchObject({
      code: "HTTP_STATUS",
      status: 403,
    });
  });

  it("throws NETWORK transport errors when no fetch implementation is available", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", undefined);

    try {
      const requestPromise = sendHttpRequest(
        {
          url: "https://example.com/handler.php",
          method: "GET",
          headers: {},
        },
        {
          timeoutMs: 250,
        },
      );

      await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerTransportError);
      await expect(requestPromise).rejects.toMatchObject({
        code: "NETWORK",
      });
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("maps timeout failures to typed transport timeout errors", async () => {
    const timeoutDrivenFetch: FetchLike = async (_url, init) => {
      return await new Promise((_, reject) => {
        const abortError = Object.assign(new Error("Request aborted"), { name: "AbortError" });

        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(abortError);
          },
          { once: true },
        );
      });
    };

    const requestPromise = sendHttpRequest(
      {
        url: "https://example.com/handler.php",
        method: "GET",
        headers: {},
      },
      {
        timeoutMs: 1,
        fetch: timeoutDrivenFetch,
      },
    );

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerTransportError);
    await expect(requestPromise).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("maps network failures to typed transport network errors", async () => {
    const networkFailingFetch: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };

    const requestPromise = sendHttpRequest(
      {
        url: "https://example.com/handler.php",
        method: "GET",
        headers: {},
      },
      {
        timeoutMs: 250,
        fetch: networkFailingFetch,
      },
    );

    await expect(requestPromise).rejects.toBeInstanceOf(SmsBowerTransportError);
    await expect(requestPromise).rejects.toMatchObject({ code: "NETWORK" });
  });
});
