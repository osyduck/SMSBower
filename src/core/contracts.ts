import type {
  AccessActivationResponse,
  AccessCancelResponse,
  AccessReadyResponse,
  AccessRetryGetResponse,
  AccessBalanceResponse,
  AccessNumberResponse,
  SmsBowerJsonResponse,
  StatusCancelResponse,
  StatusOkResponse,
  StatusWaitCodeResponse,
  StatusWaitRetryResponse,
} from "./response-parser.js";

export type SmsBowerNoParams = { readonly [key: string]: never };
export type SmsBowerCountryCode = number | `${number}`;
export type SmsBowerActivationId = number | `${number}`;
export type SmsBowerProviderId = number | `${number}`;
export type SmsBowerProviderIds = readonly SmsBowerProviderId[] | string;

export interface ServiceCountryParams {
  service: string;
  country: SmsBowerCountryCode;
}

export interface ProviderFilterParams {
  providerIds?: SmsBowerProviderIds;
}

export type GetBalanceParams = SmsBowerNoParams;
export type GetServicesListParams = SmsBowerNoParams;
export type GetCountriesParams = SmsBowerNoParams;

export interface GetPricesParams extends ServiceCountryParams {}

export interface GetPricesV2Params extends ServiceCountryParams {}

export interface GetPricesV3Params extends ProviderFilterParams {
  country: SmsBowerCountryCode;
  service?: string;
}

export interface NumberRequestFilters {
  operator?: string;
  ref?: string;
  maxPrice?: number | `${number}`;
  verification?: boolean | 0 | 1;
  forward?: boolean | 0 | 1;
  phoneException?: string;
}

export interface GetNumberParams extends ServiceCountryParams, ProviderFilterParams {}

export interface GetNumberV2Params extends GetNumberParams, NumberRequestFilters {}

export interface GetStatusParams {
  activationId: SmsBowerActivationId;
}

export type ActivationLifecycleStatus = 1 | 3 | 6 | 8;

export interface SetStatusParams extends GetStatusParams {
  status: ActivationLifecycleStatus;
}

export interface SmsBowerJsonContract<TValue> extends Omit<SmsBowerJsonResponse, "value"> {
  value: TValue;
}

export type ServicesListValue = Record<string, string>;

export interface CountryCatalogEntry {
  id: string;
  rus: string;
  eng: string;
  [field: string]: string | number | boolean | undefined;
}

export type CountriesListValue = Record<string, CountryCatalogEntry>;

type PriceQuoteBase = {
  count: number | `${number}`;
  [field: string]: string | number | boolean | undefined;
};

export type PriceQuote =
  | (PriceQuoteBase & {
      cost: string | `${number}`;
      price?: string | `${number}`;
    })
  | (PriceQuoteBase & {
      price: string | `${number}`;
      cost?: string | `${number}`;
    });

export type PricesV1Value = Record<string, Record<string, string>>;
export type PricesV2LegacyValue = Record<string, Record<string, PriceQuote>>;
export type PricesV2BucketsValue = Record<string, Record<string, Record<string, number | `${number}`>>>;
export type PricesV2Value = PricesV2LegacyValue | PricesV2BucketsValue;
export type PricesV3ServiceValue = Record<string, PriceQuote>;
export type PricesV3ProviderValue = Record<string, PricesV3ServiceValue>;
export type PricesV3Value = Record<string, PricesV3ServiceValue | PricesV3ProviderValue>;

export type GetBalanceResponse = AccessBalanceResponse;
export type GetServicesListCanonicalResponse = SmsBowerJsonContract<ServicesListValue>;
export type GetServicesListResponse = GetServicesListCanonicalResponse;
export type GetCountriesResponse = SmsBowerJsonContract<CountriesListValue>;
export type GetPricesResponse = SmsBowerJsonContract<PricesV1Value>;
export type GetPricesV2Response = SmsBowerJsonContract<PricesV2Value>;
export type GetPricesV3Response = SmsBowerJsonContract<PricesV3Value>;
export type GetNumberResponse = AccessNumberResponse;
export type GetNumberV2Response = AccessNumberResponse;

export type ActivationLifecycleResponse =
  | StatusWaitCodeResponse
  | StatusWaitRetryResponse
  | StatusOkResponse
  | StatusCancelResponse;

export type ActivationSetStatusResponse =
  | ActivationLifecycleResponse
  | AccessReadyResponse
  | AccessRetryGetResponse
  | AccessActivationResponse
  | AccessCancelResponse;

export type GetStatusResponse = ActivationLifecycleResponse;
export type SetStatusResponse = ActivationSetStatusResponse;

export interface SmsBowerAccountEndpointContracts {
  getBalance(params?: GetBalanceParams): Promise<GetBalanceResponse>;
}

export interface SmsBowerCatalogEndpointContracts {
  getServicesList(params?: GetServicesListParams): Promise<GetServicesListCanonicalResponse>;
  getCountries(params?: GetCountriesParams): Promise<GetCountriesResponse>;
}

export interface SmsBowerPriceEndpointContracts {
  getPrices(params: GetPricesParams): Promise<GetPricesResponse>;
  getPricesV2(params: GetPricesV2Params): Promise<GetPricesV2Response>;
  getPricesV3(params: GetPricesV3Params): Promise<GetPricesV3Response>;
}

export interface SmsBowerNumberEndpointContracts {
  getNumber(params: GetNumberParams): Promise<GetNumberResponse>;
  getNumberV2(params: GetNumberV2Params): Promise<GetNumberV2Response>;
}

export interface SmsBowerLifecycleEndpointContracts {
  getStatus(params: GetStatusParams): Promise<GetStatusResponse>;
  setStatus(params: SetStatusParams): Promise<SetStatusResponse>;
}

export interface SmsBowerEndpointContracts
  extends SmsBowerAccountEndpointContracts,
    SmsBowerCatalogEndpointContracts,
    SmsBowerPriceEndpointContracts,
    SmsBowerNumberEndpointContracts,
    SmsBowerLifecycleEndpointContracts {}

export interface SmsBowerActionParamsMap {
  getBalance: GetBalanceParams;
  getServicesList: GetServicesListParams;
  getCountries: GetCountriesParams;
  getPrices: GetPricesParams;
  getPricesV2: GetPricesV2Params;
  getPricesV3: {
    country: SmsBowerCountryCode;
    service?: string;
    providerIds?: string;
  };
  getNumber: {
    service: string;
    country: SmsBowerCountryCode;
    providerIds?: string;
  };
  getNumberV2: {
    service: string;
    country: SmsBowerCountryCode;
    providerIds?: string;
    operator?: string;
    ref?: string;
    maxPrice?: number | `${number}`;
    verification?: 0 | 1;
    forward?: 0 | 1;
    phoneException?: string;
  };
  getStatus: {
    id: SmsBowerActivationId;
  };
  setStatus: {
    id: SmsBowerActivationId;
    status: ActivationLifecycleStatus;
  };
}

export interface SmsBowerActionContractMap {
  getBalance: { params: GetBalanceParams; response: GetBalanceResponse };
  getServicesList: { params: GetServicesListParams; response: GetServicesListCanonicalResponse };
  getCountries: { params: GetCountriesParams; response: GetCountriesResponse };
  getPrices: { params: GetPricesParams; response: GetPricesResponse };
  getPricesV2: { params: GetPricesV2Params; response: GetPricesV2Response };
  getPricesV3: { params: GetPricesV3Params; response: GetPricesV3Response };
  getNumber: { params: GetNumberParams; response: GetNumberResponse };
  getNumberV2: { params: GetNumberV2Params; response: GetNumberV2Response };
  getStatus: { params: GetStatusParams; response: GetStatusResponse };
  setStatus: { params: SetStatusParams; response: SetStatusResponse };
}

export type SmsBowerEndpointAction = keyof SmsBowerActionContractMap;
