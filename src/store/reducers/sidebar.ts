import { 
  SidebarActionTypes, 
  TOGGLE_SIDEBAR, 
  SET_SIDEBAR_VISIBILITY,
  SET_GLOBAL_SIDEBAR_STATE,
  INHERIT_SIDEBAR_STATE
} from '../actions/sidebar';

interface TabSidebarState {
  isVisible: boolean;
  inheritedFrom?: number; // от какой вкладки унаследовано состояние
  lastToggleTime?: number; // время последнего переключения
}

interface SidebarState {
  // Глобальное состояние - "предпочтение" пользователя
  globalState: {
    isVisible: boolean;
    lastActiveTabId?: number;
    lastToggleTime?: number;
  };
  
  // Состояние для каждой вкладки
  tabStates: { [tabId: number]: TabSidebarState };
  
  // Настройки наследования
  inheritanceSettings: {
    enabled: boolean; // включено ли наследование
    mode: 'global' | 'lastActive'; // режим наследования
  };
}

const initialState: SidebarState = {
  globalState: {
    isVisible: false,
    lastToggleTime: Date.now()
  },
  tabStates: {},
  inheritanceSettings: {
    enabled: true,
    mode: 'global' // по умолчанию наследуем от глобального состояния
  }
};

// Помощник для получения состояния вкладки
const getTabState = (state: SidebarState, tabId: number): TabSidebarState => {
  return state.tabStates[tabId] || {
    isVisible: state.globalState.isVisible,
    lastToggleTime: Date.now()
  };
};

// Помощник для получения состояния наследования
const getInheritedState = (state: SidebarState, tabId: number): boolean => {
  if (!state.inheritanceSettings.enabled) {
    return false; // по умолчанию закрыто, если наследование отключено
  }

  switch (state.inheritanceSettings.mode) {
    case 'global':
      return state.globalState.isVisible;
    
    case 'lastActive':
      if (state.globalState.lastActiveTabId && 
          state.tabStates[state.globalState.lastActiveTabId]) {
        return state.tabStates[state.globalState.lastActiveTabId].isVisible;
      }
      return state.globalState.isVisible;
    
    default:
      return state.globalState.isVisible;
  }
};

const sidebarReducer = (
  state: SidebarState = initialState,
  action: SidebarActionTypes
): SidebarState => {
  switch (action.type) {
    case TOGGLE_SIDEBAR: {
      const { tabId, persist = true } = action.payload || {};
      const currentTime = Date.now();
      
      if (tabId) {
        // Переключение для конкретной вкладки
        const currentTabState = getTabState(state, tabId);
        const newVisibility = !currentTabState.isVisible;
        
        const newState = {
          ...state,
          tabStates: {
            ...state.tabStates,
            [tabId]: {
              ...currentTabState,
              isVisible: newVisibility,
              lastToggleTime: currentTime
            }
          }
        };

        // Обновляем глобальное состояние если нужно
        if (persist) {
          newState.globalState = {
            ...state.globalState,
            isVisible: newVisibility,
            lastActiveTabId: tabId,
            lastToggleTime: currentTime
          };
        }

        return newState;
      } else {
        // Глобальное переключение
        return {
          ...state,
          globalState: {
            ...state.globalState,
            isVisible: !state.globalState.isVisible,
            lastToggleTime: currentTime
          }
        };
      }
    }

    case SET_SIDEBAR_VISIBILITY: {
      const { isVisible, tabId, persist = true } = action.payload;
      const currentTime = Date.now();

      if (tabId) {
        // Установка для конкретной вкладки
        const currentTabState = getTabState(state, tabId);
        
        const newState = {
          ...state,
          tabStates: {
            ...state.tabStates,
            [tabId]: {
              ...currentTabState,
              isVisible,
              lastToggleTime: currentTime
            }
          }
        };

        // Обновляем глобальное состояние если нужно
        if (persist) {
          newState.globalState = {
            ...state.globalState,
            isVisible,
            lastActiveTabId: tabId,
            lastToggleTime: currentTime
          };
        }

        return newState;
      } else {
        // Глобальная установка
        return {
          ...state,
          globalState: {
            ...state.globalState,
            isVisible,
            lastToggleTime: currentTime
          }
        };
      }
    }

    case SET_GLOBAL_SIDEBAR_STATE: {
      const { isVisible, lastActiveTabId } = action.payload;
      return {
        ...state,
        globalState: {
          ...state.globalState,
          isVisible,
          lastActiveTabId: lastActiveTabId || state.globalState.lastActiveTabId,
          lastToggleTime: Date.now()
        }
      };
    }

    case INHERIT_SIDEBAR_STATE: {
      const { fromTabId, toTabId } = action.payload;
      let inheritedVisibility: boolean;
      let inheritedFrom: number | undefined;

      if (fromTabId && state.tabStates[fromTabId]) {
        // Наследование от конкретной вкладки
        inheritedVisibility = state.tabStates[fromTabId].isVisible;
        inheritedFrom = fromTabId;
      } else {
        // Наследование по умолчанию
        inheritedVisibility = getInheritedState(state, toTabId);
        inheritedFrom = state.globalState.lastActiveTabId;
      }

      return {
        ...state,
        tabStates: {
          ...state.tabStates,
          [toTabId]: {
            isVisible: inheritedVisibility,
            inheritedFrom,
            lastToggleTime: Date.now()
          }
        }
      };
    }

    default:
      return state;
  }
};

export default sidebarReducer;
