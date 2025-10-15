const BACKGROUND_FETCH_ACTION = 'proxyFetch';
const BACKGROUND_FETCH_ABORT_ACTION = 'proxyFetchAbort';

export interface BackgroundFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: RequestRedirect;
  credentials?: RequestCredentials;
}

interface BackgroundFetchResponsePayload {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  aborted?: boolean;
  error?: string;
}

class BackgroundFetchResponse {
  private readonly payload: BackgroundFetchResponsePayload;

  constructor(payload: BackgroundFetchResponsePayload) {
    this.payload = payload;
  }

  get ok(): boolean {
    return this.payload.ok;
  }

  get status(): number {
    return this.payload.status;
  }

  get statusText(): string {
    return this.payload.statusText;
  }

  get headers(): Record<string, string> {
    return this.payload.headers;
  }

  async text(): Promise<string> {
    return this.payload.body;
  }

  async json<T = any>(): Promise<T> {
    const raw = await this.text();
    if (!raw) {
      return {} as T;
    }
    return JSON.parse(raw) as T;
  }
}

const createAbortError = (): DOMException => new DOMException('The user aborted a request.', 'AbortError');

export async function backgroundFetch(
  url: string,
  options: BackgroundFetchOptions = {},
  abortSignal?: AbortSignal
): Promise<BackgroundFetchResponse> {
  if (abortSignal?.aborted) {
    throw createAbortError();
  }

  const requestId = `fetch_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return new Promise<BackgroundFetchResponse>((resolve, reject) => {
    const cleanupAbort = () => {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      chrome.runtime.sendMessage({ action: BACKGROUND_FETCH_ABORT_ACTION, requestId });
      cleanupAbort();
      reject(createAbortError());
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    chrome.runtime.sendMessage(
      {
        action: BACKGROUND_FETCH_ACTION,
        requestId,
        url,
        options: {
          method: options.method || 'GET',
          headers: options.headers || {},
          body: options.body ?? null,
          redirect: options.redirect,
          credentials: options.credentials,
        },
      },
      (response: BackgroundFetchResponsePayload | undefined) => {
        cleanupAbort();

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error('No response from background fetch'));
          return;
        }

        if (response.error && !response.ok) {
          if (response.aborted) {
            reject(createAbortError());
            return;
          }
          reject(new Error(response.error));
          return;
        }

        resolve(new BackgroundFetchResponse(response));
      }
    );
  });
}

export type BackgroundFetchResponseType = BackgroundFetchResponse;
