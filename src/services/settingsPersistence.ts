import type { Store } from 'redux';
import type { RootState } from '../store';
import { hydrateSettings } from '../store/actions/settings';
import { ModelProvider } from '../store/reducers/settings';

const STORAGE_KEY = 'vaulto_extension_settings_v1';

type PersistedSettings = Partial<Pick<
  RootState['settings'],
  | 'translateToLanguage'
  | 'ankiConnectUrl'
  | 'useAnkiConnect'
  | 'visibleSideBar'
  | 'shouldGenerateImage'
  | 'imageGenerationMode'
  | 'translationPrompt'
  | 'examplesPrompt'
  | 'aiInstructions'
  | 'imageInstructions'
  | 'modelProvider'
  | 'sourceLanguage'
  | 'authApiUrl'
  | 'syncApiUrl'
  | 'autoSaveToServer'
  | 'selectedBackendDeckId'
  | 'selectedAnkiDeckName'
>>;

const IMAGE_MODES = new Set(['off', 'smart', 'always']);

const getChromeStorage = () => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      return chrome.storage.local;
    }
  } catch (error) {
    console.error('Unable to access chrome.storage.local for settings:', error);
  }
  return null;
};

const normalizeSettings = (raw: unknown): PersistedSettings => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const record = raw as Record<string, unknown>;
  const result: PersistedSettings = {};

  if (typeof record.translateToLanguage === 'string') result.translateToLanguage = record.translateToLanguage;
  if (typeof record.ankiConnectUrl === 'string') result.ankiConnectUrl = record.ankiConnectUrl;
  if (typeof record.useAnkiConnect === 'boolean') result.useAnkiConnect = record.useAnkiConnect;
  if (typeof record.visibleSideBar === 'boolean') result.visibleSideBar = record.visibleSideBar;
  if (typeof record.shouldGenerateImage === 'boolean') result.shouldGenerateImage = record.shouldGenerateImage;
  if (typeof record.imageGenerationMode === 'string' && IMAGE_MODES.has(record.imageGenerationMode)) {
    result.imageGenerationMode = record.imageGenerationMode as RootState['settings']['imageGenerationMode'];
  }
  if (typeof record.translationPrompt === 'string') result.translationPrompt = record.translationPrompt;
  if (typeof record.examplesPrompt === 'string') result.examplesPrompt = record.examplesPrompt;
  if (typeof record.aiInstructions === 'string') result.aiInstructions = record.aiInstructions;
  if (typeof record.imageInstructions === 'string') result.imageInstructions = record.imageInstructions;
  if (record.modelProvider === ModelProvider.OpenAI) result.modelProvider = ModelProvider.OpenAI;
  if (typeof record.sourceLanguage === 'string') result.sourceLanguage = record.sourceLanguage;
  if (typeof record.authApiUrl === 'string') result.authApiUrl = record.authApiUrl;
  if (typeof record.syncApiUrl === 'string') result.syncApiUrl = record.syncApiUrl;
  if (typeof record.autoSaveToServer === 'boolean') result.autoSaveToServer = record.autoSaveToServer;
  if (typeof record.selectedBackendDeckId === 'string' || record.selectedBackendDeckId === null) {
    result.selectedBackendDeckId = record.selectedBackendDeckId as string | null;
  }
  if (typeof record.selectedAnkiDeckName === 'string' || record.selectedAnkiDeckName === null) {
    result.selectedAnkiDeckName = record.selectedAnkiDeckName as string | null;
  }

  return result;
};

const readFallback = (): PersistedSettings => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return normalizeSettings(JSON.parse(raw));
      }
    }
  } catch (error) {
    console.error('Failed to read settings from localStorage:', error);
  }
  return {};
};

const writeFallback = (settings: PersistedSettings) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch (error) {
    console.error('Failed to write settings to localStorage:', error);
  }
};

const snapshotSettings = (state: RootState): PersistedSettings => ({
  translateToLanguage: state.settings.translateToLanguage,
  ankiConnectUrl: state.settings.ankiConnectUrl,
  useAnkiConnect: state.settings.useAnkiConnect,
  visibleSideBar: state.settings.visibleSideBar,
  shouldGenerateImage: state.settings.shouldGenerateImage,
  imageGenerationMode: state.settings.imageGenerationMode,
  translationPrompt: state.settings.translationPrompt,
  examplesPrompt: state.settings.examplesPrompt,
  aiInstructions: state.settings.aiInstructions,
  imageInstructions: state.settings.imageInstructions,
  modelProvider: state.settings.modelProvider,
  sourceLanguage: state.settings.sourceLanguage,
  authApiUrl: state.settings.authApiUrl,
  syncApiUrl: state.settings.syncApiUrl,
  autoSaveToServer: state.settings.autoSaveToServer,
  selectedBackendDeckId: state.settings.selectedBackendDeckId,
  selectedAnkiDeckName: state.settings.selectedAnkiDeckName,
});

const snapshotsEqual = (a: PersistedSettings, b: PersistedSettings) =>
  JSON.stringify(a) === JSON.stringify(b);

const loadSettings = async (): Promise<PersistedSettings> => {
  const storage = getChromeStorage();
  if (!storage) {
    return readFallback();
  }

  const loaded = await new Promise<PersistedSettings>((resolve) => {
    try {
      storage.get([STORAGE_KEY], (items) => {
        const lastError = chrome?.runtime?.lastError;
        if (lastError) {
          console.error('Failed to load settings from chrome storage:', lastError);
          resolve(readFallback());
          return;
        }
        resolve(normalizeSettings(items?.[STORAGE_KEY]));
      });
    } catch (error) {
      console.error('Failed to access chrome storage for settings:', error);
      resolve(readFallback());
    }
  });

  writeFallback(loaded);
  return loaded;
};

const saveSettings = async (settings: PersistedSettings) => {
  writeFallback(settings);

  const storage = getChromeStorage();
  if (!storage) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      storage.set({ [STORAGE_KEY]: settings }, () => {
        const lastError = chrome?.runtime?.lastError;
        if (lastError) {
          console.error('Failed to save settings to chrome storage:', lastError);
        }
        resolve();
      });
    } catch (error) {
      console.error('Failed to access chrome storage while saving settings:', error);
      resolve();
    }
  });
};

export const initializeSettingsPersistence = async (store: Store<RootState>) => {
  const storedSettings = await loadSettings();
  if (Object.keys(storedSettings).length > 0) {
    store.dispatch(hydrateSettings(storedSettings));
  }

  let lastSnapshot = snapshotSettings(store.getState());
  await saveSettings(lastSnapshot);

  let pending: Promise<void> = Promise.resolve();

  const queueSave = (snapshot: PersistedSettings) => {
    pending = pending.then(() => saveSettings(snapshot)).catch((error) => {
      console.error('Failed to persist settings:', error);
    });
  };

  const unsubscribe = store.subscribe(() => {
    const nextSnapshot = snapshotSettings(store.getState());
    if (!snapshotsEqual(nextSnapshot, lastSnapshot)) {
      lastSnapshot = nextSnapshot;
      queueSave(nextSnapshot);
    }
  });

  return () => {
    unsubscribe();
  };
};
