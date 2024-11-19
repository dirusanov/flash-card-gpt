// Определение типа действия и экспорт константы
export const TOGGLE_SIDEBAR = 'TOGGLE_SIDEBAR';

// Определение интерфейса для действия
export interface ToggleSidebarAction {
  type: typeof TOGGLE_SIDEBAR;
}

// Функция для создания действия
export const toggleSidebar = (): ToggleSidebarAction => ({
  type: TOGGLE_SIDEBAR,
});

// Тип для всех возможных действий
export type SidebarActionTypes = ToggleSidebarAction;
