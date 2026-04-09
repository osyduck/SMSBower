import { describe, expect, it } from "vitest";

import {
  parseSmsBowerResponse,
  SmsBowerApiError,
  SmsBowerParseError,
  type SmsBowerApiErrorCode,
} from "../../src/core/index.ts";

const assertThrowsApiError = (response: string, code: SmsBowerApiErrorCode): void => {
  try {
    parseSmsBowerResponse(response);
    throw new Error("Expected an SmsBowerApiError to be thrown.");
  } catch (error) {
    expect(error).toBeInstanceOf(SmsBowerApiError);
    expect(error).toMatchObject({
      code,
      token: code,
    });
  }
};

describe("parseSmsBowerResponse", () => {
  it.each([
    "BAD_KEY",
    "BAD_ACTION",
    "BAD_SERVICE",
    "BAD_STATUS",
    "NO_ACTIVATION",
    "EARLY_CANCEL_DENIED",
    "BAD_COUNTRY",
  ] satisfies SmsBowerApiErrorCode[])("maps %s to SmsBowerApiError", (token) => {
    assertThrowsApiError(token, token);
  });

  it("parses ACCESS_BALANCE token responses", () => {
    expect(parseSmsBowerResponse("ACCESS_BALANCE:12.50")).toEqual({
      format: "token",
      token: "ACCESS_BALANCE",
      balance: "12.50",
      rawResponse: "ACCESS_BALANCE:12.50",
    });
  });

  it("parses ACCESS_NUMBER token responses", () => {
    expect(parseSmsBowerResponse("ACCESS_NUMBER:12345:+15551230000")).toEqual({
      format: "token",
      token: "ACCESS_NUMBER",
      activationId: "12345",
      phoneNumber: "+15551230000",
      rawResponse: "ACCESS_NUMBER:12345:+15551230000",
    });
  });

  it("parses STATUS_WAIT_CODE token responses", () => {
    expect(parseSmsBowerResponse("STATUS_WAIT_CODE")).toEqual({
      format: "token",
      token: "STATUS_WAIT_CODE",
      rawResponse: "STATUS_WAIT_CODE",
    });
  });

  it("parses STATUS_WAIT_RETRY token responses", () => {
    expect(parseSmsBowerResponse("STATUS_WAIT_RETRY:7788")).toEqual({
      format: "token",
      token: "STATUS_WAIT_RETRY",
      code: "7788",
      rawResponse: "STATUS_WAIT_RETRY:7788",
    });
  });

  it("parses STATUS_OK token responses", () => {
    expect(parseSmsBowerResponse("STATUS_OK:4321")).toEqual({
      format: "token",
      token: "STATUS_OK",
      code: "4321",
      rawResponse: "STATUS_OK:4321",
    });
  });

  it("parses STATUS_CANCEL token responses", () => {
    expect(parseSmsBowerResponse("STATUS_CANCEL")).toEqual({
      format: "token",
      token: "STATUS_CANCEL",
      rawResponse: "STATUS_CANCEL",
    });
  });

  it.each(["ACCESS_READY", "ACCESS_RETRY_GET", "ACCESS_ACTIVATION", "ACCESS_CANCEL"] as const)(
    "parses %s token responses",
    (token) => {
      expect(parseSmsBowerResponse(token)).toEqual({
        format: "token",
        token,
        rawResponse: token,
      });
    },
  );

  it("parses JSON payload responses", () => {
    expect(parseSmsBowerResponse('{"wallet_address":"0xabc123"}')).toEqual({
      format: "json",
      rawResponse: '{"wallet_address":"0xabc123"}',
      value: {
        wallet_address: "0xabc123",
      },
    });
  });

  it("throws SmsBowerParseError for unknown tokens", () => {
    expect(() => parseSmsBowerResponse("STATUS_UNKNOWN_X")).toThrowError(SmsBowerParseError);

    try {
      parseSmsBowerResponse("STATUS_UNKNOWN_X");
      throw new Error("Expected an SmsBowerParseError to be thrown.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "UNKNOWN_TOKEN",
        token: "STATUS_UNKNOWN_X",
      });
    }
  });

  it("throws SmsBowerParseError for unknown payloads with missing token head", () => {
    expect(() => parseSmsBowerResponse("  ")).toThrowError(SmsBowerParseError);

    try {
      parseSmsBowerResponse("  ");
      throw new Error("Expected an SmsBowerParseError to be thrown.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "UNKNOWN_TOKEN",
        token: undefined,
        rawResponse: "",
      });
    }
  });

  it("throws SmsBowerParseError for malformed ACCESS_NUMBER token payloads", () => {
    expect(() => parseSmsBowerResponse("ACCESS_NUMBER:12345")).toThrowError(SmsBowerParseError);

    try {
      parseSmsBowerResponse("ACCESS_NUMBER:12345");
      throw new Error("Expected an SmsBowerParseError to be thrown.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "UNKNOWN_TOKEN",
        token: "ACCESS_NUMBER",
        rawResponse: "ACCESS_NUMBER:12345",
      });
    }
  });

  it("throws SmsBowerParseError for malformed STATUS_WAIT_CODE payloads", () => {
    expect(() => parseSmsBowerResponse("STATUS_WAIT_CODE:unexpected")).toThrowError(SmsBowerParseError);

    try {
      parseSmsBowerResponse("STATUS_WAIT_CODE:unexpected");
      throw new Error("Expected an SmsBowerParseError to be thrown.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "UNKNOWN_TOKEN",
        token: "STATUS_WAIT_CODE",
        rawResponse: "STATUS_WAIT_CODE:unexpected",
      });
    }
  });

  it("throws SmsBowerParseError for malformed JSON payloads", () => {
    expect(() => parseSmsBowerResponse('{"wallet_address":')).toThrowError(SmsBowerParseError);

    try {
      parseSmsBowerResponse('{"wallet_address":');
      throw new Error("Expected an SmsBowerParseError to be thrown.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "MALFORMED_JSON",
      });
    }
  });
});
