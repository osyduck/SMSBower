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

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponseLike>;

export interface HttpResponse {
  status: number;
  bodyText: string;
}
