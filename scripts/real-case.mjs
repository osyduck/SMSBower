import {
  SmsBowerApiError,
  SmsBowerParseError,
  SmsBowerTransportError,
  createSmsBowerActivationEndpoints,
  createSmsBowerClient,
} from "../dist/index.js";

const REQUIRED_ENV_KEYS = ["SMSBOWER_API_KEY", "SMSBOWER_SERVICE", "SMSBOWER_COUNTRY"];
const ALLOWED_FINAL_STATUSES = new Set([1, 3, 6, 8]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseBoolean = (value, defaultValue) => {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
};

const parseInteger = (value, defaultValue) => {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Invalid integer value: ${value}`);
  }

  return parsed;
};


const toCountryValue = (value) => {
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return value;
};

const parseProviderIds = (value) => {
  if (!value) {
    return undefined;
  }

  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return parts.length === 0 ? undefined : parts;
};

const getMissingRequiredEnv = () => {
  return REQUIRED_ENV_KEYS.filter((key) => !process.env[key] || process.env[key].trim() === "");
};

const printUsageAndExit = (missingKeys) => {
  console.error("[real-case] Missing required env vars:", missingKeys.join(", "));
  console.error("[real-case] Example (PowerShell):");
  console.error('$env:SMSBOWER_API_KEY="<api-key>"');
  console.error('$env:SMSBOWER_SERVICE="ot"');
  console.error('$env:SMSBOWER_COUNTRY="6"');
  console.error('$env:SMSBOWER_PROVIDER_IDS="2295,3027,1507"');
  console.error("npm run build && npm run test:real");
  process.exit(1);
};

const normalizeLifecycleResult = (status) => {
  if (status.token === "STATUS_OK") {
    return `STATUS_OK (${status.code})`;
  }

  if (status.token === "STATUS_WAIT_RETRY") {
    return `STATUS_WAIT_RETRY (${status.code})`;
  }

  return status.token;
};

const run = async () => {
  const missing = getMissingRequiredEnv();
  if (missing.length > 0) {
    printUsageAndExit(missing);
  }

  const apiKey = process.env.SMSBOWER_API_KEY;
  const service = process.env.SMSBOWER_SERVICE;
  const countryRaw = process.env.SMSBOWER_COUNTRY;
  const providerIdsRaw = process.env.SMSBOWER_PROVIDER_IDS;
  const baseUrl = process.env.SMSBOWER_BASE_URL;
  const operator = process.env.SMSBOWER_OPERATOR;

  const timeoutMs = parseInteger(process.env.SMSBOWER_TIMEOUT_MS, 20_000);
  const pollIntervalMs = parseInteger(process.env.SMSBOWER_POLL_INTERVAL_MS, 5_000);
  const maxAttempts = parseInteger(process.env.SMSBOWER_POLL_MAX_ATTEMPTS, 24);
  const finalStatus = parseInteger(process.env.SMSBOWER_FINAL_STATUS, 6);
  const cancelOnTimeout = parseBoolean(process.env.SMSBOWER_CANCEL_ON_TIMEOUT, true);

  if (!ALLOWED_FINAL_STATUSES.has(finalStatus)) {
    throw new RangeError("SMSBOWER_FINAL_STATUS must be one of: 1, 3, 6, 8");
  }

  const country = toCountryValue(countryRaw);
  const providerIds = parseProviderIds(providerIdsRaw);

  const client = createSmsBowerClient({
    apiKey,
    baseUrl,
    timeoutMs,
    userAgent: "smsbower-real-case-script/1.0.0",
  });
  const activation = createSmsBowerActivationEndpoints(client);

  console.log("[real-case] Starting live test...");
  console.log("[real-case] Base URL:", client.config.baseUrl);
  console.log("[real-case] Service/Country:", service, country);
  if (providerIds?.length) {
    console.log("[real-case] Provider IDs:", providerIds.join(","));
  }

  const balance = await client.getBalance();
  console.log("[real-case] Balance:", balance.balance);

  const number = await activation.getNumberV2({
    service,
    country,
    providerIds,
    operator,
  });

  const activationId = number.activationId;
  console.log("[real-case] Number acquired:", {
    activationId,
    phoneNumber: number.phoneNumber,
  });

  let latestStatus;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    latestStatus = await activation.getStatus({ activationId });
    console.log(`[real-case] Poll #${attempt}:`, normalizeLifecycleResult(latestStatus));

    if (latestStatus.token === "STATUS_OK") {
      break;
    }

    if (latestStatus.token === "STATUS_CANCEL") {
      break;
    }

    await sleep(pollIntervalMs);
  }

  if (!latestStatus || (latestStatus.token !== "STATUS_OK" && latestStatus.token !== "STATUS_CANCEL")) {
    console.warn("[real-case] Polling timed out before terminal status.");

    if (cancelOnTimeout) {
      const canceled = await activation.setStatus({ activationId, status: 8 });
      console.log("[real-case] Timeout cancellation result:", normalizeLifecycleResult(canceled));
    }

    return;
  }

  if (latestStatus.token === "STATUS_OK") {
    console.log("[real-case] OTP code:", latestStatus.code);
    const finalized = await activation.setStatus({ activationId, status: finalStatus });
    console.log("[real-case] Finalize result:", normalizeLifecycleResult(finalized));
    return;
  }

  console.warn("[real-case] Activation already canceled by provider.");
};

run().catch((error) => {
  if (error instanceof SmsBowerApiError) {
    console.error("[real-case] API error:", { code: error.code, token: error.token, raw: error.rawResponse });
    process.exitCode = 1;
    return;
  }

  if (error instanceof SmsBowerParseError) {
    console.error("[real-case] Parse error:", { code: error.code, token: error.token, raw: error.rawResponse });
    process.exitCode = 1;
    return;
  }

  if (error instanceof SmsBowerTransportError) {
    console.error("[real-case] Transport error:", { code: error.code, status: error.status });
    if (error.code === "HTTP_STATUS" && error.status === 405) {
      console.error(
        "[real-case] Hint: endpoint/host may still be restricted. Verify SMSBOWER_BASE_URL points to your active handler URL.",
      );
    }
    process.exitCode = 1;
    return;
  }

  console.error("[real-case] Unexpected error:", error);
  process.exitCode = 1;
});
