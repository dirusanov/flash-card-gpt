import { SidebarActionTypes, TOGGLE_SIDEBAR } from '../actions/sidebar';

interface SidebarState {
  isSidebarVisible: boolean;
}

const initialState: SidebarState = {
  isSidebarVisible: false,
};

// Редюсер с типизацией для состояния и действия
const sidebarReducer = (
  state: SidebarState = initialState,
  action: SidebarActionTypes
): SidebarState => {
  switch (action.type) {
    case TOGGLE_SIDEBAR:
      return {
        ...state,
        isSidebarVisible: !state.isSidebarVisible,
      };
    default:
      return state;
  }
};

export default sidebarReducer;
