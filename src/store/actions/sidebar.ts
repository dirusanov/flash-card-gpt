// Определение типов действий и экспорт констант
export const TOGGLE_SIDEBAR = 'TOGGLE_SIDEBAR';
export const SET_SIDEBAR_VISIBILITY = 'SET_SIDEBAR_VISIBILITY';
export const SET_GLOBAL_SIDEBAR_STATE = 'SET_GLOBAL_SIDEBAR_STATE';
export const INHERIT_SIDEBAR_STATE = 'INHERIT_SIDEBAR_STATE';

// Определение интерфейсов для действий
export interface ToggleSidebarAction {
  type: typeof TOGGLE_SIDEBAR;
  payload?: {
    tabId?: number;
    persist?: boolean; // сохранять ли как глобальное состояние
  };
}

export interface SetSidebarVisibilityAction {
  type: typeof SET_SIDEBAR_VISIBILITY;
  payload: {
    isVisible: boolean;
    tabId?: number;
    persist?: boolean;
  };
}

export interface SetGlobalSidebarStateAction {
  type: typeof SET_GLOBAL_SIDEBAR_STATE;
  payload: {
    isVisible: boolean;
    lastActiveTabId?: number;
  };
}

export interface InheritSidebarStateAction {
  type: typeof INHERIT_SIDEBAR_STATE;
  payload: {
    fromTabId?: number;
    toTabId: number;
  };
}

// Функции для создания действий
export const toggleSidebar = (tabId?: number, persist: boolean = true): ToggleSidebarAction => ({
  type: TOGGLE_SIDEBAR,
  payload: { tabId, persist },
});

export const setSidebarVisibility = (
  isVisible: boolean, 
  tabId?: number, 
  persist: boolean = true
): SetSidebarVisibilityAction => ({
  type: SET_SIDEBAR_VISIBILITY,
  payload: { isVisible, tabId, persist },
});

export const setGlobalSidebarState = (
  isVisible: boolean, 
  lastActiveTabId?: number
): SetGlobalSidebarStateAction => ({
  type: SET_GLOBAL_SIDEBAR_STATE,
  payload: { isVisible, lastActiveTabId },
});

export const inheritSidebarState = (
  toTabId: number, 
  fromTabId?: number
): InheritSidebarStateAction => ({
  type: INHERIT_SIDEBAR_STATE,
  payload: { fromTabId, toTabId },
});

// Тип для всех возможных действий
export type SidebarActionTypes = 
  | ToggleSidebarAction 
  | SetSidebarVisibilityAction 
  | SetGlobalSidebarStateAction 
  | InheritSidebarStateAction;
