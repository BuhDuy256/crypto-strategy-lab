// Small transport seam for Binance REST calls. Tests replace it with an offline fake.
export interface BinanceHttpResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

export interface BinanceHttpClient {
  get(url: URL): Promise<BinanceHttpResponse>;
}

function parseBody(text: string): unknown {
  if (text === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class FetchBinanceHttpClient implements BinanceHttpClient {
  async get(url: URL): Promise<BinanceHttpResponse> {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return {
      status: response.status,
      headers: response.headers,
      body: parseBody(await response.text())
    };
  }
}
