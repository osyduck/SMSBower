import { SmsBowerApiError, SmsBowerParseError, resolveApiErrorCodeFromToken } from "./response-errors.js";

interface SmsBowerTokenResponseBase {
  format: "token";
  token: string;
  rawResponse: string;
}

export interface AccessBalanceResponse extends SmsBowerTokenResponseBase {
  token: "ACCESS_BALANCE";
  balance: string;
}

export interface AccessNumberResponse extends SmsBowerTokenResponseBase {
  token: "ACCESS_NUMBER";
  activationId: string;
  phoneNumber: string;
}

export interface StatusWaitCodeResponse extends SmsBowerTokenResponseBase {
  token: "STATUS_WAIT_CODE";
}

export interface StatusWaitRetryResponse extends SmsBowerTokenResponseBase {
  token: "STATUS_WAIT_RETRY";
  code: string;
}

export interface StatusOkResponse extends SmsBowerTokenResponseBase {
  token: "STATUS_OK";
  code: string;
}

export interface StatusCancelResponse extends SmsBowerTokenResponseBase {
  token: "STATUS_CANCEL";
}

export interface AccessReadyResponse extends SmsBowerTokenResponseBase {
  token: "ACCESS_READY";
}

export interface AccessRetryGetResponse extends SmsBowerTokenResponseBase {
  token: "ACCESS_RETRY_GET";
}

export interface AccessActivationResponse extends SmsBowerTokenResponseBase {
  token: "ACCESS_ACTIVATION";
}

export interface AccessCancelResponse extends SmsBowerTokenResponseBase {
  token: "ACCESS_CANCEL";
}

export type SmsBowerTokenResponse =
  | AccessBalanceResponse
  | AccessNumberResponse
  | StatusWaitCodeResponse
  | StatusWaitRetryResponse
  | StatusOkResponse
  | StatusCancelResponse
  | AccessReadyResponse
  | AccessRetryGetResponse
  | AccessActivationResponse
  | AccessCancelResponse;

export interface SmsBowerJsonResponse {
  format: "json";
  rawResponse: string;
  value: unknown;
}

export type SmsBowerParsedResponse = SmsBowerTokenResponse | SmsBowerJsonResponse;

const isLikelyJsonPayload = (responseBody: string): boolean => {
  return responseBody.startsWith("{") || responseBody.startsWith("[");
};

const throwUnknownToken = (rawResponse: string, token?: string): never => {
  const message = token
    ? `SMSBower returned an unknown response token \"${token}\".`
    : "SMSBower returned an unknown response payload.";

  throw new SmsBowerParseError("UNKNOWN_TOKEN", message, rawResponse, {
    token,
  });
};

const requireJoinedValue = (token: string, valueParts: string[], rawResponse: string): string => {
  const value = valueParts.join(":").trim();
  if (!value) {
    throwUnknownToken(rawResponse, token);
  }

  return value;
};

const parseTokenResponse = (rawResponse: string): SmsBowerTokenResponse => {
  const [tokenPart, ...valueParts] = rawResponse.split(":");
  const token = tokenPart?.trim();
  if (!token) {
    throwUnknownToken(rawResponse);
  }

  const apiErrorCode = resolveApiErrorCodeFromToken(token);
  if (apiErrorCode) {
    throw new SmsBowerApiError(apiErrorCode, rawResponse, { token });
  }

  switch (token) {
    case "ACCESS_BALANCE": {
      const balance = requireJoinedValue(token, valueParts, rawResponse);
      return {
        format: "token",
        token,
        balance,
        rawResponse,
      };
    }
    case "ACCESS_NUMBER": {
      if (valueParts.length < 2) {
        throwUnknownToken(rawResponse, token);
      }

      const activationId = valueParts[0]?.trim();
      const phoneNumber = valueParts.slice(1).join(":").trim();
      if (!activationId || !phoneNumber) {
        throwUnknownToken(rawResponse, token);
      }

      return {
        format: "token",
        token,
        activationId,
        phoneNumber,
        rawResponse,
      };
    }
    case "STATUS_WAIT_CODE": {
      if (valueParts.length > 0 && valueParts.join(":").trim()) {
        throwUnknownToken(rawResponse, token);
      }

      return {
        format: "token",
        token,
        rawResponse,
      };
    }
    case "STATUS_WAIT_RETRY": {
      const code = requireJoinedValue(token, valueParts, rawResponse);
      return {
        format: "token",
        token,
        code,
        rawResponse,
      };
    }
    case "STATUS_OK": {
      const code = requireJoinedValue(token, valueParts, rawResponse);
      return {
        format: "token",
        token,
        code,
        rawResponse,
      };
    }
    case "STATUS_CANCEL": {
      if (valueParts.length > 0 && valueParts.join(":").trim()) {
        throwUnknownToken(rawResponse, token);
      }

      return {
        format: "token",
        token,
        rawResponse,
      };
    }
    case "ACCESS_READY":
    case "ACCESS_RETRY_GET":
    case "ACCESS_ACTIVATION":
    case "ACCESS_CANCEL": {
      if (valueParts.length > 0 && valueParts.join(":").trim()) {
        throwUnknownToken(rawResponse, token);
      }

      return {
        format: "token",
        token,
        rawResponse,
      };
    }
    default:
      throwUnknownToken(rawResponse, token);
  }

  return throwUnknownToken(rawResponse, token);
};

export const parseSmsBowerResponse = (responseBody: string): SmsBowerParsedResponse => {
  const rawResponse = responseBody.trim();

  if (!rawResponse) {
    throwUnknownToken(rawResponse);
  }

  if (isLikelyJsonPayload(rawResponse)) {
    try {
      return {
        format: "json",
        rawResponse,
        value: JSON.parse(rawResponse),
      };
    } catch (error) {
      throw new SmsBowerParseError("MALFORMED_JSON", "SMSBower returned malformed JSON.", rawResponse, {
        cause: error,
      });
    }
  }

  return parseTokenResponse(rawResponse);
};
