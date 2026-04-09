import { describe, expect, it } from "vitest";

import { buildActionRequest, resolveClientConfig } from "../../src/core/index.ts";

describe("buildActionRequest", () => {
  it("serializes action requests with api_key and action fields", () => {
    const config = resolveClientConfig({
      apiKey: "test-api-key",
      userAgent: "smsbower-tests/1.0",
    });

    const request = buildActionRequest(config, "getNumber", {
      service: "ot",
      country: 6,
    });

    const query = new URL(request.url).searchParams;
    expect(query.get("api_key")).toBe("test-api-key");
    expect(query.get("action")).toBe("getNumber");
    expect(query.get("service")).toBe("ot");
    expect(query.get("country")).toBe("6");
    expect(request.method).toBe("GET");
    expect(request.headers["user-agent"]).toBe("smsbower-tests/1.0");
  });
});
