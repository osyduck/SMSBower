import type {
  ActivationLifecycleStatus,
  GetBalanceParams,
  GetBalanceResponse,
  GetNumberParams,
  GetNumberResponse,
  GetNumberV2Params,
  GetPricesV3Params,
  GetStatusResponse,
  SetStatusParams,
  SmsBowerActionContractMap,
  SmsBowerEndpointAction,
  SmsBowerEndpointContracts,
  SmsBowerNoParams,
  WalletAddressValue,
} from "../../src/index.js";

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsExact<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

type _GetBalanceParamsAreStrict = Assert<IsExact<GetBalanceParams, SmsBowerNoParams>>;
type _GetBalanceResponseMapped = Assert<IsExact<SmsBowerActionContractMap["getBalance"]["response"], GetBalanceResponse>>;
type _GetNumberResponseMapped = Assert<IsExact<SmsBowerActionContractMap["getNumber"]["response"], GetNumberResponse>>;
type _WalletAddressShape = Assert<IsExact<WalletAddressValue, { wallet_address: string }>>;

type _NoAnyGetNumberParams = Assert<IsAny<GetNumberParams> extends false ? true : false>;
type _NoAnyGetNumberV2Params = Assert<IsAny<GetNumberV2Params> extends false ? true : false>;
type _NoAnySetStatusParams = Assert<IsAny<SetStatusParams> extends false ? true : false>;
type _NoAnyGetStatusResponse = Assert<IsAny<GetStatusResponse> extends false ? true : false>;

const validNumberParams: GetNumberParams = {
  service: "ot",
  country: 6,
  providerIds: [2295, "3027"],
};

const validNumberV2Params: GetNumberV2Params = {
  ...validNumberParams,
  operator: "any",
  ref: "campaign-a",
  maxPrice: 1.5,
  verification: true,
};

const validPricesV3Params: GetPricesV3Params = {
  country: "6",
  service: "ot",
  providerIds: "2295,3027,1507",
};

const validSetStatusParams: SetStatusParams = {
  activationId: 12345,
  status: 6,
};

const lifecycleStatus: ActivationLifecycleStatus = validSetStatusParams.status;

const endpointAction: SmsBowerEndpointAction = "getPricesV3";

type _EndpointContractHasSetStatus = Assert<
  IsExact<
    SmsBowerEndpointContracts["setStatus"],
    (params: SetStatusParams) => Promise<SmsBowerActionContractMap["setStatus"]["response"]>
  >
>;

// @ts-expect-error getBalance does not accept endpoint parameters.
const invalidBalanceParams: GetBalanceParams = { service: "ot" };

// @ts-expect-error country must be a number or numeric string.
const invalidNumberParams: GetNumberParams = { service: "ot", country: { code: 6 } };

// @ts-expect-error status must be one of 1 | 3 | 6 | 8.
const invalidSetStatusParams: SetStatusParams = { activationId: "123", status: 2 };

// @ts-expect-error action must be one of the exported endpoint action names.
const invalidEndpointAction: SmsBowerEndpointAction = "deleteActivation";

void validNumberV2Params;
void validPricesV3Params;
void lifecycleStatus;
void endpointAction;
void invalidBalanceParams;
void invalidNumberParams;
void invalidSetStatusParams;
void invalidEndpointAction;
