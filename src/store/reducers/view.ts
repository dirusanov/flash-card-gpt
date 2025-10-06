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
};

export type ViewActions =
  | { type: typeof VIEW_HYDRATE; payload: ViewState }
  | { type: typeof VIEW_SET_MODE; payload: { tabId: number; mode: ViewMode } }
  | { type: typeof VIEW_SET_VIS; payload: { tabId: number; visible: boolean } }
  | { type: typeof VIEW_SET_GEOMETRY; payload: { tabId: number; geometry: FloatGeometry } };

export const viewReducer = (state = initialState, action: ViewActions): ViewState => {
  switch (action.type) {
    case VIEW_HYDRATE:
      return { ...state, ...action.payload };
    case VIEW_SET_MODE: {
      const { tabId, mode } = action.payload;
      return {
        ...state,
        preferredModeByTab: { ...state.preferredModeByTab, [tabId]: mode },
      };
    }
    case VIEW_SET_VIS: {
      const { tabId, visible } = action.payload;
      return {
        ...state,
        visibleByTab: { ...state.visibleByTab, [tabId]: visible },
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
export const selectPreferredMode = (s: any, tabId: number): ViewMode =>
  (s.view?.preferredModeByTab?.[tabId] as ViewMode) ?? 'sidebar';

export const selectVisible = (s: any, tabId: number): boolean => {
  const value = s.view?.visibleByTab?.[tabId];
  return typeof value === 'boolean' ? value : true;
};

export const selectFloatGeometry = (s: any, tabId: number): FloatGeometry | null =>
  s.view?.floatGeometryByTab?.[tabId] ?? null;
