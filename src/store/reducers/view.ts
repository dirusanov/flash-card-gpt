// src/store/reducers/view.ts
export type ViewMode = 'sidebar' | 'float';

export interface ViewState {
  preferredModeByTab: Record<number, ViewMode>;
  visibleByTab: Record<number, boolean>;
}

export const VIEW_STORAGE_KEY = 'anki_view_prefs_v1';

// action types
export const VIEW_HYDRATE   = 'view/HYDRATE';
export const VIEW_SET_MODE  = 'view/SET_MODE';
export const VIEW_SET_VIS   = 'view/SET_VISIBILITY';

const initialState: ViewState = {
  preferredModeByTab: {},
  visibleByTab: {},
};

export type ViewActions =
  | { type: typeof VIEW_HYDRATE; payload: ViewState }
  | { type: typeof VIEW_SET_MODE; payload: { tabId: number; mode: ViewMode } }
  | { type: typeof VIEW_SET_VIS; payload: { tabId: number; visible: boolean } };

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
    default:
      return state;
  }
};

// helpers / selectors
export const selectPreferredMode = (s: any, tabId: number): ViewMode =>
  (s.view?.preferredModeByTab?.[tabId] as ViewMode) ?? 'sidebar';

export const selectVisible = (s: any, tabId: number): boolean =>
  !!(s.view?.visibleByTab?.[tabId]);
