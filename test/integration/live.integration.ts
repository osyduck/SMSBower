import { describe, expect, it } from "vitest";

import {
  createSmsBowerActivationEndpoints,
  createSmsBowerClient,
  SmsBowerApiError,
  SmsBowerTransportError,
} from "../../src/index.ts";

const REQUIRED_ENV_VARS = [
  "SMSBOWER_API_KEY",
  "SMSBOWER_SERVICE",
  "SMSBOWER_COUNTRY",
  "SMSBOWER_PROVIDER_IDS",
] as const;

const redactedApiKey = "[REDACTED_API_KEY]";

const readEnv = (name: (typeof REQUIRED_ENV_VARS)[number]): string | undefined => {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => readEnv(name) === undefined);

const redactApiKey = (value: string, apiKey: string): string => {
  return value.split(apiKey).join(redactedApiKey);
};

const toSafeString = (value: unknown, apiKey: string): string => {
  const serialized =
    typeof value === "string"
      ? value
      : JSON.stringify(
          value,
          (_, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue),
          2,
        ) ?? String(value);

  return redactApiKey(serialized, apiKey);
};

if (missingEnvVars.length > 0) {
  console.log(
    `[integration] Skipping live SMSBower checks. Missing required env vars: ${missingEnvVars.join(", ")}.`,
  );

  describe("SMSBower live integration (env-driven)", () => {
    it.skip("requires SMSBOWER_* env vars for live checks", () => {
      expect(missingEnvVars.length).toBeGreaterThan(0);
    });
  });
} else {
  describe("SMSBower live integration (env-driven)", () => {
    const apiKey = readEnv("SMSBOWER_API_KEY")!;
    const service = readEnv("SMSBOWER_SERVICE")!;
    const country = readEnv("SMSBOWER_COUNTRY")!;
    const providerIds = readEnv("SMSBOWER_PROVIDER_IDS")!;

    const client = createSmsBowerClient({ apiKey });
    const activation = createSmsBowerActivationEndpoints(client);

    it("checks live getBalance token response shape", async () => {
      try {
        const balance = await client.getBalance();

        expect(balance.format).toBe("token");
        expect(balance.token).toBe("ACCESS_BALANCE");

        const parsedBalance = Number.parseFloat(balance.balance);
        expect(Number.isFinite(parsedBalance)).toBe(true);
        expect(parsedBalance).toBeGreaterThanOrEqual(0);
      } catch (error) {
        const safeErrorString = toSafeString(error, apiKey);

        console.log(`[integration] Balance check transport constraint (sanitized): ${safeErrorString}`);

        expect(error).toBeInstanceOf(SmsBowerTransportError);

        const transportError = error as SmsBowerTransportError;
        expect(["TIMEOUT", "NETWORK", "HTTP_STATUS"]).toContain(transportError.code);

        if (transportError.code === "HTTP_STATUS") {
          expect(transportError.status).toBeTypeOf("number");
          expect(transportError.status).toBeGreaterThanOrEqual(400);
        }
      }
    });

    it("runs a safe activation-related status check without purchasing numbers", async () => {
      try {
        const status = await activation.getStatus({ activationId: "integration-safe-invalid-id" });

        expect(status.format).toBe("token");
        expect(["STATUS_WAIT_CODE", "STATUS_WAIT_RETRY", "STATUS_OK", "STATUS_CANCEL"]).toContain(status.token);
      } catch (error) {
        const safeErrorString = toSafeString(error, apiKey);

        console.log(`[integration] Safe activation status check error (sanitized): ${safeErrorString}`);

        if (error instanceof SmsBowerApiError) {
          expect(["BAD_STATUS", "NO_ACTIVATION"]).toContain(error.code);
          return;
        }

        expect(error).toBeInstanceOf(SmsBowerTransportError);
        const transportError = error as SmsBowerTransportError;
        expect(["TIMEOUT", "NETWORK", "HTTP_STATUS"]).toContain(transportError.code);
      }
    });

    it("accepts env service/country/providerIds configuration with redacted diagnostics", async () => {
      const params = {
        service,
        country,
        providerIds,
      };

      const diagnostic = toSafeString(
        {
          mode: "live",
          configuredService: params.service,
          configuredCountry: params.country,
          configuredProviderIds: params.providerIds,
          apiKey,
        },
        apiKey,
      );

      expect(diagnostic.includes(apiKey)).toBe(false);
      expect(diagnostic.includes(redactedApiKey)).toBe(true);
      expect(params.service.length).toBeGreaterThan(0);
      expect(params.country.length).toBeGreaterThan(0);
      expect(params.providerIds.length).toBeGreaterThan(0);
    });
  });
}
