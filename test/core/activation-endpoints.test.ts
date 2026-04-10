import { describe, expect, it } from "vitest";

import {
  createSmsBowerActivationEndpoints,
  createSmsBowerClient,
  SmsBowerApiError,
  SmsBowerParseError,
  type FetchLike,
  type SetStatusParams,
} from "../../src/core/index.ts";

interface FetchCall {
  url: string;
  init?: Parameters<FetchLike>[1];
}

const createQueuedFetchMock = (responses: readonly string[]): { fetchMock: FetchLike; calls: FetchCall[] } => {
  const queue = [...responses];
  const calls: FetchCall[] = [];

  const fetchMock: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const body = queue.shift();
    if (body === undefined) {
      throw new Error("No queued response for fetch mock call.");
    }

    return {
      ok: true,
      status: 200,
      text: async () => body,
    };
  };

  return { fetchMock, calls };
};

const expectActionBody = (calls: readonly FetchCall[], index: number): URLSearchParams => {
  const requestUrl = calls[index]?.url;
  if (requestUrl) {
    return new URL(requestUrl).searchParams;
  }

  const body = calls[index]?.init?.body;
  return new URLSearchParams(typeof body === "string" ? body : "");
};

describe("createSmsBowerActivationEndpoints", () => {
  it("maps getNumber ACCESS_NUMBER responses and serializes request params", async () => {
    const { fetchMock, calls } = createQueuedFetchMock(["ACCESS_NUMBER:12345:+15551230000"]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const result = await endpoints.getNumber({
      service: "ot",
      country: 6,
      providerIds: [2295, "3027"],
    });

    expect(result).toEqual({
      format: "token",
      token: "ACCESS_NUMBER",
      activationId: "12345",
      phoneNumber: "+15551230000",
      rawResponse: "ACCESS_NUMBER:12345:+15551230000",
    });

    const body = expectActionBody(calls, 0);
    expect(body.get("action")).toBe("getNumber");
    expect(body.get("service")).toBe("ot");
    expect(body.get("country")).toBe("6");
    expect(body.get("providerIds")).toBe("2295,3027");
  });

  it("maps getNumberV2 ACCESS_NUMBER responses and serializes v2 filters", async () => {
    const { fetchMock, calls } = createQueuedFetchMock(["ACCESS_NUMBER:67890:+447700900123"]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const result = await endpoints.getNumberV2({
      service: "ot",
      country: "6",
      providerIds: "2295,3027,1507",
      operator: "any",
      ref: "campaign-a",
      maxPrice: 1.5,
      verification: true,
      forward: false,
      phoneException: "+15551239999",
    });

    expect(result).toEqual({
      format: "token",
      token: "ACCESS_NUMBER",
      activationId: "67890",
      phoneNumber: "+447700900123",
      rawResponse: "ACCESS_NUMBER:67890:+447700900123",
    });

    const body = expectActionBody(calls, 0);
    expect(body.get("action")).toBe("getNumberV2");
    expect(body.get("service")).toBe("ot");
    expect(body.get("country")).toBe("6");
    expect(body.get("providerIds")).toBe("2295,3027,1507");
    expect(body.get("operator")).toBe("any");
    expect(body.get("ref")).toBe("campaign-a");
    expect(body.get("maxPrice")).toBe("1.5");
    expect(body.get("verification")).toBe("1");
    expect(body.get("forward")).toBe("0");
    expect(body.get("phoneException")).toBe("+15551239999");
  });

  it("maps getNumberV2 JSON responses to normalized ACCESS_NUMBER shape", async () => {
    const { fetchMock } = createQueuedFetchMock([
      '{"activationId":252210263,"phoneNumber":"6285136944176","activationCost":"0.01","countryCode":"6"}',
    ]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const result = await endpoints.getNumberV2({
      service: "ot",
      country: 6,
    });

    expect(result).toEqual({
      format: "token",
      token: "ACCESS_NUMBER",
      activationId: "252210263",
      phoneNumber: "6285136944176",
      rawResponse:
        '{"activationId":252210263,"phoneNumber":"6285136944176","activationCost":"0.01","countryCode":"6"}',
    });
  });

  it("throws SmsBowerParseError when getNumberV2 JSON misses required fields", async () => {
    const { fetchMock } = createQueuedFetchMock(['{"activationId":252210263}']);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const request = endpoints.getNumberV2({
      service: "ot",
      country: 6,
    });

    await expect(request).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(request).rejects.toMatchObject({
      code: "UNKNOWN_TOKEN",
      rawResponse: '{"activationId":252210263}',
    });
  });

  it.each([
    {
      response: "STATUS_WAIT_CODE",
      expected: {
        format: "token",
        token: "STATUS_WAIT_CODE",
        rawResponse: "STATUS_WAIT_CODE",
      },
    },
    {
      response: "STATUS_WAIT_RETRY:7788",
      expected: {
        format: "token",
        token: "STATUS_WAIT_RETRY",
        code: "7788",
        rawResponse: "STATUS_WAIT_RETRY:7788",
      },
    },
    {
      response: "STATUS_OK:4321",
      expected: {
        format: "token",
        token: "STATUS_OK",
        code: "4321",
        rawResponse: "STATUS_OK:4321",
      },
    },
    {
      response: "STATUS_CANCEL",
      expected: {
        format: "token",
        token: "STATUS_CANCEL",
        rawResponse: "STATUS_CANCEL",
      },
    },
  ])("maps getStatus lifecycle token $response", async ({ response, expected }) => {
    const { fetchMock, calls } = createQueuedFetchMock([response]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const result = await endpoints.getStatus({ activationId: "12345" });

    expect(result).toEqual(expected);

    const body = expectActionBody(calls, 0);
    expect(body.get("action")).toBe("getStatus");
    expect(body.get("id")).toBe("12345");
  });

  it("setStatus supports only lifecycle statuses 1, 3, 6, and 8", async () => {
    const { fetchMock, calls } = createQueuedFetchMock([
      "STATUS_WAIT_CODE",
      "STATUS_WAIT_RETRY:7788",
      "STATUS_OK:4321",
      "STATUS_CANCEL",
    ]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const statuses: ReadonlyArray<SetStatusParams["status"]> = [1, 3, 6, 8];
    const results = await Promise.all(
      statuses.map((status) =>
        endpoints.setStatus({
          activationId: "998877",
          status,
        }),
      ),
    );

    expect(results).toEqual([
      {
        format: "token",
        token: "STATUS_WAIT_CODE",
        rawResponse: "STATUS_WAIT_CODE",
      },
      {
        format: "token",
        token: "STATUS_WAIT_RETRY",
        code: "7788",
        rawResponse: "STATUS_WAIT_RETRY:7788",
      },
      {
        format: "token",
        token: "STATUS_OK",
        code: "4321",
        rawResponse: "STATUS_OK:4321",
      },
      {
        format: "token",
        token: "STATUS_CANCEL",
        rawResponse: "STATUS_CANCEL",
      },
    ]);

    const sentStatuses = calls.map((_, index) => expectActionBody(calls, index).get("status"));
    expect(sentStatuses).toEqual(["1", "3", "6", "8"]);
  });

  it.each([
    "ACCESS_READY",
    "ACCESS_RETRY_GET",
    "ACCESS_ACTIVATION",
    "ACCESS_CANCEL",
  ] as const)("maps setStatus %s token responses", async (responseToken) => {
    const { fetchMock } = createQueuedFetchMock([responseToken]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const result = await endpoints.setStatus({ activationId: "998877", status: 6 });

    expect(result).toEqual({
      format: "token",
      token: responseToken,
      rawResponse: responseToken,
    });
  });

  it("throws for unsupported setStatus values at runtime", async () => {
    const { fetchMock } = createQueuedFetchMock(["STATUS_WAIT_CODE"]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    await expect(
      endpoints.setStatus({
        activationId: "998877",
        status: 2 as unknown as SetStatusParams["status"],
      }),
    ).rejects.toThrowError(TypeError);
  });

  it("maps EARLY_CANCEL_DENIED from setStatus to SmsBowerApiError", async () => {
    const { fetchMock } = createQueuedFetchMock(["EARLY_CANCEL_DENIED"]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const request = endpoints.setStatus({ activationId: "12345", status: 8 });

    await expect(request).rejects.toBeInstanceOf(SmsBowerApiError);
    await expect(request).rejects.toMatchObject({
      code: "EARLY_CANCEL_DENIED",
      token: "EARLY_CANCEL_DENIED",
      rawResponse: "EARLY_CANCEL_DENIED",
    });
  });

  it("maps EARLY_CANCEL_DENIED from getStatus to SmsBowerApiError", async () => {
    const { fetchMock } = createQueuedFetchMock(["EARLY_CANCEL_DENIED"]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const request = endpoints.getStatus({ activationId: "12345" });

    await expect(request).rejects.toBeInstanceOf(SmsBowerApiError);
    await expect(request).rejects.toMatchObject({
      code: "EARLY_CANCEL_DENIED",
      token: "EARLY_CANCEL_DENIED",
      rawResponse: "EARLY_CANCEL_DENIED",
    });
  });

  it.each(["getNumber", "getNumberV2"] as const)("maps NO_NUMBERS from %s to SmsBowerApiError", async (method) => {
    const { fetchMock } = createQueuedFetchMock(["NO_NUMBERS"]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const request = endpoints[method]({
      service: "ot",
      country: 6,
    });

    await expect(request).rejects.toBeInstanceOf(SmsBowerApiError);
    await expect(request).rejects.toMatchObject({
      code: "NO_NUMBERS",
      token: "NO_NUMBERS",
      rawResponse: "NO_NUMBERS",
    });
  });

  it("throws SmsBowerParseError when getStatus receives an unknown lifecycle token", async () => {
    const { fetchMock } = createQueuedFetchMock(["STATUS_UNKNOWN_X"]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const request = endpoints.getStatus({ activationId: "12345" });

    await expect(request).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(request).rejects.toMatchObject({
      code: "UNKNOWN_TOKEN",
      token: "STATUS_UNKNOWN_X",
      rawResponse: "STATUS_UNKNOWN_X",
    });
  });

  it("throws SmsBowerParseError when getNumber receives an unexpected lifecycle token", async () => {
    const { fetchMock } = createQueuedFetchMock(["STATUS_OK:1234"]);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const request = endpoints.getNumber({
      service: "ot",
      country: 6,
    });

    await expect(request).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(request).rejects.toMatchObject({
      code: "UNKNOWN_TOKEN",
      token: "STATUS_OK",
      rawResponse: "STATUS_OK:1234",
    });
  });

  it("throws SmsBowerParseError when getStatus receives malformed JSON", async () => {
    const { fetchMock } = createQueuedFetchMock(['{"status":']);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const request = endpoints.getStatus({ activationId: "12345" });

    await expect(request).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(request).rejects.toMatchObject({
      code: "MALFORMED_JSON",
      rawResponse: '{"status":',
    });
  });

  it("throws SmsBowerParseError when setStatus receives JSON instead of lifecycle token", async () => {
    const { fetchMock } = createQueuedFetchMock(['{"ok":true}']);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { fetch: fetchMock });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const request = endpoints.setStatus({ activationId: "12345", status: 1 });

    await expect(request).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(request).rejects.toMatchObject({
      code: "UNKNOWN_TOKEN",
      token: undefined,
      rawResponse: '{"ok":true}',
    });
  });
});
