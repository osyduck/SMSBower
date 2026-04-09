import { resolveClientConfig } from "./config.js";
import { buildActionRequest } from "./request-builder.js";
import {
  type CountriesListValue,
  type GetBalanceParams,
  type GetBalanceResponse,
  type GetCountriesParams,
  type GetCountriesResponse,
  type GetPricesParams,
  type GetPricesResponse,
  type GetPricesV2Params,
  type GetPricesV2Response,
  type GetPricesV3Params,
  type GetPricesV3Response,
  type GetServicesListParams,
  type GetServicesListResponse,
  type GetWalletAddressParams,
  type GetWalletAddressResponse,
  type PriceQuote,
  type PricesV1Value,
  type PricesV2Value,
  type PricesV3ProviderValue,
  type PricesV3ServiceValue,
  type PricesV3Value,
  type ServicesListValue,
  type SmsBowerActionParamsMap,
  type SmsBowerAccountEndpointContracts,
  type SmsBowerCatalogEndpointContracts,
  type SmsBowerEndpointAction,
  type SmsBowerJsonContract,
  type SmsBowerNoParams,
  type SmsBowerPriceEndpointContracts,
  type SmsBowerProviderIds,
  type WalletAddressValue,
} from "./contracts.js";
import { SmsBowerParseError } from "./response-errors.js";
import { parseSmsBowerResponse, type SmsBowerTokenResponse } from "./response-parser.js";
import { sendHttpRequest } from "./transport.js";
import type { FetchLike, ResolvedSmsBowerClientConfig, SmsBowerClientConfig } from "./types.js";

interface CreateSmsBowerClientOptions {
  fetch?: FetchLike;
}

type ActionParamsFor<TAction extends SmsBowerEndpointAction> = SmsBowerActionParamsMap[TAction];
type RequestActionArgs<TAction extends SmsBowerEndpointAction> = ActionParamsFor<TAction> extends SmsBowerNoParams
  ? [params?: ActionParamsFor<TAction>]
  : [params: ActionParamsFor<TAction>];

export interface SmsBowerCoreClient
  extends SmsBowerAccountEndpointContracts,
    SmsBowerCatalogEndpointContracts,
    SmsBowerPriceEndpointContracts {
  readonly config: ResolvedSmsBowerClientConfig;
  requestAction<TAction extends SmsBowerEndpointAction>(action: TAction, ...[params]: RequestActionArgs<TAction>): Promise<string>;
}

const isJsonScalar = (value: unknown): value is string | number | boolean => {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isWalletAddressValue = (value: unknown): value is WalletAddressValue => {
  return isRecord(value) && typeof value.wallet_address === "string";
};

const isServicesListValue = (value: unknown): value is ServicesListValue => {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
};

const isCountryCatalogEntry = (value: unknown): value is CountriesListValue[string] => {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.rus === "string" &&
    typeof value.eng === "string" &&
    Object.values(value).every((entry) => isJsonScalar(entry))
  );
};

const isCountriesListValue = (value: unknown): value is CountriesListValue => {
  return isRecord(value) && Object.values(value).every((entry) => isCountryCatalogEntry(entry));
};

const isPriceQuote = (value: unknown): value is PriceQuote => {
  return (
    isRecord(value) &&
    typeof value.cost === "string" &&
    (typeof value.count === "string" || typeof value.count === "number") &&
    Object.values(value).every((entry) => isJsonScalar(entry))
  );
};

const isPricesV1Value = (value: unknown): value is PricesV1Value => {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (serviceQuotes) =>
        isRecord(serviceQuotes) &&
        Object.values(serviceQuotes).every((price) => typeof price === "string"),
    )
  );
};

const isPricesV2Value = (value: unknown): value is PricesV2Value => {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (serviceQuotes) =>
        isRecord(serviceQuotes) && Object.values(serviceQuotes).every((quote) => isPriceQuote(quote)),
    )
  );
};

const isPricesV3ServiceValue = (value: unknown): value is PricesV3ServiceValue => {
  return isRecord(value) && Object.values(value).every((quote) => isPriceQuote(quote));
};

const isPricesV3ProviderValue = (value: unknown): value is PricesV3ProviderValue => {
  return isRecord(value) && Object.values(value).every((serviceQuotes) => isPricesV3ServiceValue(serviceQuotes));
};

const isPricesV3Value = (value: unknown): value is PricesV3Value => {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entry) => isPricesV3ServiceValue(entry) || isPricesV3ProviderValue(entry),
    )
  );
};

const parseTokenActionResponse = <TToken extends SmsBowerTokenResponse["token"]>(
  responseBody: string,
  action: string,
  expectedToken: TToken,
): Extract<SmsBowerTokenResponse, { token: TToken }> => {
  const parsed = parseSmsBowerResponse(responseBody);
  if (parsed.format !== "token" || parsed.token !== expectedToken) {
    throw new SmsBowerParseError(
      "UNKNOWN_TOKEN",
      `SMSBower returned an unexpected response format for action "${action}".`,
      parsed.rawResponse,
      {
        token: parsed.format === "token" ? parsed.token : undefined,
      },
    );
  }

  return parsed as Extract<SmsBowerTokenResponse, { token: TToken }>;
};

const parseJsonActionResponse = <TValue>(
  responseBody: string,
  action: string,
  isExpectedValue: (value: unknown) => value is TValue,
): SmsBowerJsonContract<TValue> => {
  const parsed = parseSmsBowerResponse(responseBody);
  if (parsed.format !== "json") {
    throw new SmsBowerParseError(
      "UNKNOWN_TOKEN",
      `SMSBower returned an unexpected response format for action "${action}".`,
      parsed.rawResponse,
      {
        token: parsed.token,
      },
    );
  }

  if (!isExpectedValue(parsed.value)) {
    throw new SmsBowerParseError(
      "MALFORMED_JSON",
      `SMSBower returned JSON payload with an unexpected shape for action "${action}".`,
      parsed.rawResponse,
    );
  }

  return {
    ...parsed,
    value: parsed.value,
  };
};

const serializeProviderIds = (providerIds: SmsBowerProviderIds | undefined): string | undefined => {
  if (providerIds === undefined) {
    return undefined;
  }

  if (typeof providerIds === "string") {
    return providerIds;
  }

  return providerIds.map((providerId) => String(providerId)).join(",");
};

export const createSmsBowerClient = (
  config: SmsBowerClientConfig,
  options: CreateSmsBowerClientOptions = {},
): SmsBowerCoreClient => {
  const resolvedConfig = resolveClientConfig(config);

  return {
    config: resolvedConfig,
    async requestAction<TAction extends SmsBowerEndpointAction>(
      action: TAction,
      ...[params]: RequestActionArgs<TAction>
    ): Promise<string> {
      const request = buildActionRequest(
        resolvedConfig,
        action,
        (params ?? ({} as ActionParamsFor<TAction>)) as ActionParamsFor<TAction>,
      );
      const response = await sendHttpRequest(request, {
        timeoutMs: resolvedConfig.timeoutMs,
        fetch: options.fetch,
      });

      return response.bodyText;
    },
    async getBalance(params: GetBalanceParams = {}): Promise<GetBalanceResponse> {
      const responseBody = await this.requestAction("getBalance", params);
      return parseTokenActionResponse(responseBody, "getBalance", "ACCESS_BALANCE");
    },
    async getWalletAddress(params: GetWalletAddressParams = {}): Promise<GetWalletAddressResponse> {
      const responseBody = await this.requestAction("getWalletAddress", params);
      return parseJsonActionResponse(responseBody, "getWalletAddress", isWalletAddressValue);
    },
    async getServicesList(params: GetServicesListParams = {}): Promise<GetServicesListResponse> {
      const responseBody = await this.requestAction("getServicesList", params);
      return parseJsonActionResponse(responseBody, "getServicesList", isServicesListValue);
    },
    async getCountries(params: GetCountriesParams = {}): Promise<GetCountriesResponse> {
      const responseBody = await this.requestAction("getCountries", params);
      return parseJsonActionResponse(responseBody, "getCountries", isCountriesListValue);
    },
    async getPrices(params: GetPricesParams): Promise<GetPricesResponse> {
      const responseBody = await this.requestAction("getPrices", {
        service: params.service,
        country: params.country,
      });
      return parseJsonActionResponse(responseBody, "getPrices", isPricesV1Value);
    },
    async getPricesV2(params: GetPricesV2Params): Promise<GetPricesV2Response> {
      const responseBody = await this.requestAction("getPricesV2", {
        service: params.service,
        country: params.country,
      });
      return parseJsonActionResponse(responseBody, "getPricesV2", isPricesV2Value);
    },
    async getPricesV3(params: GetPricesV3Params): Promise<GetPricesV3Response> {
      const responseBody = await this.requestAction("getPricesV3", {
        country: params.country,
        service: params.service,
        providerIds: serializeProviderIds(params.providerIds),
      });
      return parseJsonActionResponse(responseBody, "getPricesV3", isPricesV3Value);
    },
  };
};
