import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance, AxiosResponse } from "axios";

import {
  createSmsBowerActivationEndpoints,
  createSmsBowerClient,
  SmsBowerApiError,
  SmsBowerParseError,
  type SetStatusParams,
} from "../../src/core/index.ts";

interface MockCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

const createMockAxiosInstance = (
  ...bodyResponses: string[]
): {
  calls: MockCall[];
  instance: AxiosInstance;
} => {
  const calls: MockCall[] = [];
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

const getRequestParams = (call: MockCall | undefined): URLSearchParams => {
  if (!call) {
    return new URLSearchParams();
  }

  const parsedUrl = new URL(call.url);
  return parsedUrl.searchParams;
};

describe("createSmsBowerActivationEndpoints", () => {
  it("maps getNumber ACCESS_NUMBER responses and serializes request params", async () => {
    const { calls, instance } = createMockAxiosInstance("ACCESS_NUMBER:12345:+15551230000");
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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

    const body = getRequestParams(calls[0]);
    expect(body.get("action")).toBe("getNumber");
    expect(body.get("service")).toBe("ot");
    expect(body.get("country")).toBe("6");
    expect(body.get("providerIds")).toBe("2295,3027");
  });

  it("maps getNumberV2 ACCESS_NUMBER responses and serializes v2 filters", async () => {
    const { calls, instance } = createMockAxiosInstance("ACCESS_NUMBER:67890:+447700900123");
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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

    const body = getRequestParams(calls[0]);
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

  it("maps getNumberV2 JSON responses to full response shape with extra fields", async () => {
    const { instance } = createMockAxiosInstance(
      '{"activationId":252210263,"phoneNumber":"6285136944176","activationCost":"0.01","countryCode":"6","canGetAnotherSms":1,"activationTime":"2026-04-21 12:00:00","activationOperator":"telkomsel"}',
    );
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const result = await endpoints.getNumberV2({
      service: "ot",
      country: 6,
    });

    expect(result).toEqual({
      format: "json",
      activationId: "252210263",
      phoneNumber: "6285136944176",
      activationCost: "0.01",
      countryCode: "6",
      canGetAnotherSms: 1,
      activationTime: "2026-04-21 12:00:00",
      activationOperator: "telkomsel",
      rawResponse:
        '{"activationId":252210263,"phoneNumber":"6285136944176","activationCost":"0.01","countryCode":"6","canGetAnotherSms":1,"activationTime":"2026-04-21 12:00:00","activationOperator":"telkomsel"}',
    });
  });

  it("throws SmsBowerParseError when getNumberV2 JSON misses required fields", async () => {
    const { instance } = createMockAxiosInstance('{"activationId":252210263}');
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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
    const { calls, instance } = createMockAxiosInstance(response);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const result = await endpoints.getStatus({ activationId: "12345" });

    expect(result).toEqual(expected);

    const body = getRequestParams(calls[0]);
    expect(body.get("action")).toBe("getStatus");
    expect(body.get("id")).toBe("12345");
  });

  it("setStatus supports only lifecycle statuses 1, 3, 6, and 8", async () => {
    const { calls, instance } = createMockAxiosInstance(
      "STATUS_WAIT_CODE",
      "STATUS_WAIT_RETRY:7788",
      "STATUS_OK:4321",
      "STATUS_CANCEL",
    );
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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

    const sentStatuses = calls.map((_, index) => getRequestParams(calls[index]).get("status"));
    expect(sentStatuses).toEqual(["1", "3", "6", "8"]);
  });

  it.each([
    "ACCESS_READY",
    "ACCESS_RETRY_GET",
    "ACCESS_ACTIVATION",
    "ACCESS_CANCEL",
  ] as const)("maps setStatus %s token responses", async (responseToken) => {
    const { instance } = createMockAxiosInstance(responseToken);
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const result = await endpoints.setStatus({ activationId: "998877", status: 6 });

    expect(result).toEqual({
      format: "token",
      token: responseToken,
      rawResponse: responseToken,
    });
  });

  it("throws for unsupported setStatus values at runtime", async () => {
    const { instance } = createMockAxiosInstance("STATUS_WAIT_CODE");
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    await expect(
      endpoints.setStatus({
        activationId: "998877",
        status: 2 as unknown as SetStatusParams["status"],
      }),
    ).rejects.toThrowError(TypeError);
  });

  it("maps EARLY_CANCEL_DENIED from setStatus to SmsBowerApiError", async () => {
    const { instance } = createMockAxiosInstance("EARLY_CANCEL_DENIED");
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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
    const { instance } = createMockAxiosInstance("EARLY_CANCEL_DENIED");
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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
    const { instance } = createMockAxiosInstance("NO_NUMBERS");
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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
    const { instance } = createMockAxiosInstance("STATUS_UNKNOWN_X");
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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
    const { instance } = createMockAxiosInstance("STATUS_OK:1234");
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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
    const { instance } = createMockAxiosInstance('{"status":');
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
    const endpoints = createSmsBowerActivationEndpoints(coreClient);

    const request = endpoints.getStatus({ activationId: "12345" });

    await expect(request).rejects.toBeInstanceOf(SmsBowerParseError);
    await expect(request).rejects.toMatchObject({
      code: "MALFORMED_JSON",
      rawResponse: '{"status":',
    });
  });

  it("throws SmsBowerParseError when setStatus receives JSON instead of lifecycle token", async () => {
    const { instance } = createMockAxiosInstance('{"ok":true}');
    const coreClient = createSmsBowerClient({ apiKey: "test-key" }, { axios: instance });
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
