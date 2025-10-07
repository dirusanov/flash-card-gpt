// src/store/reducers/view.ts
export type ViewMode = 'sidebar' | 'float';

export interface FloatGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewState {
  preferredModeByTab: Record<number, ViewMode>;
  visibleByTab: Record<number, boolean>;
  floatGeometryByTab: Record<number, FloatGeometry>;
  globalMode: ViewMode;
  globalVisible: boolean;
}

export const VIEW_STORAGE_KEY = 'anki_view_prefs_v1';

// action types
export const VIEW_HYDRATE   = 'view/HYDRATE';
export const VIEW_SET_MODE       = 'view/SET_MODE';
export const VIEW_SET_VIS        = 'view/SET_VISIBILITY';
export const VIEW_SET_GEOMETRY   = 'view/SET_FLOAT_GEOMETRY';

const initialState: ViewState = {
  preferredModeByTab: {},
  visibleByTab: {},
  floatGeometryByTab: {},
  globalMode: 'sidebar',
  globalVisible: true,
};

export type ViewActions =
  | { type: typeof VIEW_HYDRATE; payload: ViewState }
  | { type: typeof VIEW_SET_MODE; payload: { tabId: number; mode: ViewMode } }
  | { type: typeof VIEW_SET_VIS; payload: { tabId: number; visible: boolean } }
  | { type: typeof VIEW_SET_GEOMETRY; payload: { tabId: number; geometry: FloatGeometry } };

export const viewReducer = (state = initialState, action: ViewActions): ViewState => {
  switch (action.type) {
    case VIEW_HYDRATE:
      return {
        ...state,
        ...action.payload,
        globalMode: action.payload.globalMode ?? state.globalMode ?? 'sidebar',
        globalVisible: typeof action.payload.globalVisible === 'boolean'
          ? action.payload.globalVisible
          : (typeof state.globalVisible === 'boolean' ? state.globalVisible : true),
      };
    case VIEW_SET_MODE: {
      const { tabId, mode } = action.payload;
      return {
        ...state,
        preferredModeByTab: { ...state.preferredModeByTab, [tabId]: mode },
        globalMode: mode,
      };
    }
    case VIEW_SET_VIS: {
      const { tabId, visible } = action.payload;
      return {
        ...state,
        visibleByTab: { ...state.visibleByTab, [tabId]: visible },
        globalVisible: visible,
      };
    }
    case VIEW_SET_GEOMETRY: {
      const { tabId, geometry } = action.payload;
      return {
        ...state,
        floatGeometryByTab: { ...state.floatGeometryByTab, [tabId]: geometry },
      };
    }
    default:
      return state;
  }
};

// helpers / selectors
export const selectPreferredMode = (s: any, tabId: number): ViewMode => {
  const fallback = (s.view?.globalMode as ViewMode) ?? 'sidebar';
  return (s.view?.preferredModeByTab?.[tabId] as ViewMode) ?? fallback;
};

export const selectVisible = (s: any, tabId: number): boolean => {
  const value = s.view?.visibleByTab?.[tabId];
  if (typeof value === 'boolean') return value;
  const global = s.view?.globalVisible;
  return typeof global === 'boolean' ? global : true;
};

export const selectFloatGeometry = (s: any, tabId: number): FloatGeometry | null =>
  s.view?.floatGeometryByTab?.[tabId] ?? null;
