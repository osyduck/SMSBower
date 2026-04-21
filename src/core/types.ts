export type ActionParamValue = string | number | boolean;
export type ActionParams = Record<string, ActionParamValue | undefined>;

export interface SmsBowerClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface ResolvedSmsBowerClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  userAgent: string;
}

export interface HttpRequest {
  url: string;
  method: "GET";
  headers: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  bodyText: string;
}
