const BACKGROUND_FETCH_ACTION = 'proxyFetch';
const BACKGROUND_FETCH_ABORT_ACTION = 'proxyFetchAbort';

export interface BackgroundFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: RequestRedirect;
  credentials?: RequestCredentials;
  responseType?: 'text' | 'dataUrl';
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

// The side panel, options and popup are extension pages: they can fetch cross-origin directly
// for hosts in host_permissions, with no page CSP in the way. Routing through the service
// worker there is not just unnecessary, it breaks long requests — an OpenAI call outlives the
// worker, Chrome tears the worker down, and the reply arrives as "The message port closed
// before a response was received". Only a content script, sandboxed by the page's origin,
// still needs the worker to make the request for it.
const isExtensionPage = (): boolean => {
  try {
    return typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
  } catch {
    return false;
  }
};

const directFetch = async (
  url: string,
  options: BackgroundFetchOptions,
  abortSignal?: AbortSignal
): Promise<BackgroundFetchResponse> => {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body ?? null,
    redirect: options.redirect,
    credentials: options.credentials,
    signal: abortSignal,
  });

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body = '';
  if (options.responseType === 'dataUrl' && response.ok) {
    const blob = await response.blob();
    body = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read response blob'));
      reader.readAsDataURL(blob);
    });
  } else {
    body = await response.text();
  }

  return new BackgroundFetchResponse({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers,
    body,
  });
};

export async function backgroundFetch(
  url: string,
  options: BackgroundFetchOptions = {},
  abortSignal?: AbortSignal
): Promise<BackgroundFetchResponse> {
  if (abortSignal?.aborted) {
    throw createAbortError();
  }

  if (isExtensionPage()) {
    try {
      return await directFetch(url, options, abortSignal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw createAbortError();
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
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
          responseType: options.responseType || 'text',
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
