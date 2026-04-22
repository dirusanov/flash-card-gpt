import { backgroundFetch } from './backgroundFetch';

type ImageFields = {
  image?: string | null;
  imageUrl?: string | null;
};

export type NormalizeImageResult<T extends ImageFields> = {
  normalizedValue: T;
  changed: boolean;
  error: Error | null;
};

const IMAGE_FETCH_TIMEOUT_MS = 15_000;

const normalizeImageValue = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

export const isDataImageUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.startsWith('data:image/');

export const isRemoteImageUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' &&
  (value.startsWith('http://') || value.startsWith('https://'));

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });

const fetchImageAsDataUrl = async (url: string): Promise<string> => {
  const response = await withTimeout(
    backgroundFetch(url, { method: 'GET', responseType: 'dataUrl' }),
    IMAGE_FETCH_TIMEOUT_MS,
    'Image fetch'
  );

  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status} ${response.statusText}`);
  }

  const dataUrl = (await response.text()).trim();
  if (!isDataImageUrl(dataUrl)) {
    throw new Error('Image fetch returned a non-image data URL');
  }

  return dataUrl;
};

export const normalizeCardImageFields = async <T extends ImageFields>(
  value: T
): Promise<NormalizeImageResult<T>> => {
  const initialImage = normalizeImageValue(value.image);
  const initialImageUrl = normalizeImageValue(value.imageUrl);

  let nextImage = initialImage;
  let nextImageUrl = initialImageUrl;

  if (isDataImageUrl(nextImageUrl) && !isDataImageUrl(nextImage)) {
    nextImage = nextImageUrl;
    nextImageUrl = null;
  }

  if (isDataImageUrl(nextImage)) {
    nextImageUrl = null;
  }

  const changedWithoutFetch =
    nextImage !== initialImage || nextImageUrl !== initialImageUrl;

  if (isDataImageUrl(nextImage)) {
    return {
      normalizedValue: {
        ...value,
        image: nextImage,
        imageUrl: nextImageUrl,
      } as T,
      changed: changedWithoutFetch,
      error: null,
    };
  }

  const remoteCandidate =
    (isRemoteImageUrl(nextImage) && nextImage) ||
    (isRemoteImageUrl(nextImageUrl) && nextImageUrl) ||
    null;

  if (!remoteCandidate) {
    return {
      normalizedValue: {
        ...value,
        image: nextImage,
        imageUrl: nextImageUrl,
      } as T,
      changed: changedWithoutFetch,
      error: null,
    };
  }

  try {
    const dataUrl = await fetchImageAsDataUrl(remoteCandidate);
    return {
      normalizedValue: {
        ...value,
        image: dataUrl,
        imageUrl: null,
      } as T,
      changed: true,
      error: null,
    };
  } catch (error) {
    return {
      normalizedValue: {
        ...value,
        image: nextImage,
        imageUrl: nextImageUrl,
      } as T,
      changed: changedWithoutFetch,
      error: error instanceof Error ? error : new Error(String(error || 'Unknown image normalization error')),
    };
  }
};

export const normalizeCardImageList = async <T extends ImageFields>(
  values: T[]
): Promise<{
  normalizedValues: T[];
  changed: boolean;
  errors: Error[];
}> => {
  const normalizedValues: T[] = [];
  const errors: Error[] = [];
  let changed = false;

  for (const value of values) {
    const result = await normalizeCardImageFields(value);
    normalizedValues.push(result.normalizedValue);
    changed = changed || result.changed;
    if (result.error) {
      errors.push(result.error);
    }
  }

  return {
    normalizedValues,
    changed,
    errors,
  };
};
