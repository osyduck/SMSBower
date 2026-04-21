import { SmsBowerParseError } from "./response-errors.js";
import { parseSmsBowerResponse, type SmsBowerParsedResponse, type SmsBowerTokenResponse } from "./response-parser.js";
import type {
  ActivationLifecycleResponse,
  ActivationLifecycleStatus,
  GetNumberParams,
  GetNumberResponse,
  GetNumberV2Params,
  GetNumberV2Response,
  GetStatusParams,
  GetStatusResponse,
  SetStatusParams,
  SetStatusResponse,
  SmsBowerActionParamsMap,
  SmsBowerLifecycleEndpointContracts,
  SmsBowerNumberEndpointContracts,
  SmsBowerProviderIds,
} from "./contracts.js";
import type { SmsBowerCoreClient } from "./client.js";

export type SmsBowerActivationEndpoints = SmsBowerNumberEndpointContracts & SmsBowerLifecycleEndpointContracts;

const normalizeProviderIds = (providerIds?: SmsBowerProviderIds): string | undefined => {
  if (providerIds === undefined) {
    return undefined;
  }

  if (typeof providerIds === "string") {
    return providerIds;
  }

  return providerIds.map((providerId) => String(providerId)).join(",");
};

const normalizeFlag = (value: boolean | 0 | 1 | undefined): 0 | 1 | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return value;
};

const isActivationLifecycleStatus = (value: number): value is ActivationLifecycleStatus => {
  return value === 1 || value === 3 || value === 6 || value === 8;
};

const throwUnexpectedResponse = (parsed: SmsBowerParsedResponse): never => {
  const token = parsed.format === "token" ? parsed.token : undefined;

  throw new SmsBowerParseError(
    "UNKNOWN_TOKEN",
    token
      ? `SMSBower returned unexpected token \"${token}\" for this endpoint.`
      : "SMSBower returned unexpected response format for this endpoint.",
    parsed.rawResponse,
    { token },
  );
};

const expectToken = <TToken extends SmsBowerTokenResponse["token"]>(
  parsed: SmsBowerParsedResponse,
  expectedTokens: readonly TToken[],
): Extract<SmsBowerTokenResponse, { token: TToken }> => {
  if (parsed.format !== "token") {
    throwUnexpectedResponse(parsed);
  }

  const tokenResponse = parsed as SmsBowerTokenResponse;
  const token = tokenResponse.token;
  const expectedSet = new Set<SmsBowerTokenResponse["token"]>(expectedTokens);
  if (!expectedSet.has(token)) {
    throwUnexpectedResponse(tokenResponse);
  }

  return tokenResponse as Extract<SmsBowerTokenResponse, { token: TToken }>;
};

interface GetNumberV2JsonPayload {
  activationId: string | number;
  phoneNumber: string;
  activationCost?: string | number;
  countryCode?: string | number;
  canGetAnotherSms?: boolean | number;
  activationTime?: string;
  activationOperator?: string;
}

const isGetNumberV2JsonValue = (value: unknown): value is GetNumberV2JsonPayload => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const activationId = record.activationId;
  const phoneNumber = record.phoneNumber;

  const hasActivationId = typeof activationId === "string" || typeof activationId === "number";
  const hasPhoneNumber = typeof phoneNumber === "string" && phoneNumber.trim().length > 0;

  return hasActivationId && hasPhoneNumber;
};

const parseGetNumberV2Response = (parsed: SmsBowerParsedResponse): GetNumberV2Response => {
  if (parsed.format === "token") {
    return expectToken(parsed, ["ACCESS_NUMBER"]);
  }

  if (!isGetNumberV2JsonValue(parsed.value)) {
    throw new SmsBowerParseError(
      "UNKNOWN_TOKEN",
      "SMSBower returned unexpected response format for getNumberV2.",
      parsed.rawResponse,
    );
  }

  const payload = parsed.value;

  return {
    format: "json",
    activationId: String(payload.activationId),
    phoneNumber: payload.phoneNumber,
    activationCost: payload.activationCost !== undefined ? String(payload.activationCost) : undefined,
    countryCode: payload.countryCode !== undefined ? String(payload.countryCode) : undefined,
    canGetAnotherSms: payload.canGetAnotherSms,
    activationTime: payload.activationTime,
    activationOperator: payload.activationOperator,
    rawResponse: parsed.rawResponse,
  };
};

const parseActionToken = async <TToken extends SmsBowerTokenResponse["token"]>(
  client: SmsBowerCoreClient,
  action: "getNumber" | "getNumberV2" | "getStatus" | "setStatus",
  params:
    | SmsBowerActionParamsMap["getNumber"]
    | SmsBowerActionParamsMap["getNumberV2"]
    | SmsBowerActionParamsMap["getStatus"]
    | SmsBowerActionParamsMap["setStatus"],
  expectedTokens: readonly TToken[],
): Promise<Extract<SmsBowerTokenResponse, { token: TToken }>> => {
  const responseBody = await client.requestAction(action, params);
  const parsed = parseSmsBowerResponse(responseBody);
  return expectToken(parsed, expectedTokens);
};

const toGetNumberParams = (params: GetNumberParams): SmsBowerActionParamsMap["getNumber"] => {
  return {
    service: params.service,
    country: params.country,
    providerIds: normalizeProviderIds(params.providerIds),
    exceptProviderIds: normalizeProviderIds(params.exceptProviderIds),
    maxPrice: params.maxPrice,
    minPrice: params.minPrice,
    phoneException: params.phoneException,
    ref: params.ref,
    userID: params.userID,
  };
};

const toGetNumberV2Params = (
  params: GetNumberV2Params,
): SmsBowerActionParamsMap["getNumberV2"] => {
  return {
    ...toGetNumberParams(params),
    operator: params.operator,
    verification: normalizeFlag(params.verification),
    forward: normalizeFlag(params.forward),
  };
};

const toGetStatusParams = (params: GetStatusParams): SmsBowerActionParamsMap["getStatus"] => {
  return {
    id: params.activationId,
  };
};

const toSetStatusParams = (params: SetStatusParams): SmsBowerActionParamsMap["setStatus"] => {
  if (!isActivationLifecycleStatus(params.status)) {
    throw new TypeError("SMSBower setStatus supports only lifecycle statuses 1, 3, 6, or 8.");
  }

  return {
    ...toGetStatusParams(params),
    status: params.status,
  };
};

export const createSmsBowerActivationEndpoints = (client: SmsBowerCoreClient): SmsBowerActivationEndpoints => {
  return {
    async getNumber(params: GetNumberParams): Promise<GetNumberResponse> {
      return parseActionToken(client, "getNumber", toGetNumberParams(params), ["ACCESS_NUMBER"]);
    },
    async getNumberV2(params: GetNumberV2Params): Promise<GetNumberV2Response> {
      const responseBody = await client.requestAction("getNumberV2", toGetNumberV2Params(params));
      const parsed = parseSmsBowerResponse(responseBody);
      return parseGetNumberV2Response(parsed);
    },
    async getStatus(params: GetStatusParams): Promise<GetStatusResponse> {
      return parseActionToken(client, "getStatus", toGetStatusParams(params), [
        "STATUS_WAIT_CODE",
        "STATUS_WAIT_RETRY",
        "STATUS_OK",
        "STATUS_CANCEL",
      ]);
    },
    async setStatus(params: SetStatusParams): Promise<SetStatusResponse> {
      return parseActionToken(client, "setStatus", toSetStatusParams(params), [
        "STATUS_WAIT_CODE",
        "STATUS_WAIT_RETRY",
        "STATUS_OK",
        "STATUS_CANCEL",
        "ACCESS_READY",
        "ACCESS_RETRY_GET",
        "ACCESS_ACTIVATION",
        "ACCESS_CANCEL",
      ]);
    },
  };
};
