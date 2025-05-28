export const SHOW_NOTIFICATION = 'SHOW_NOTIFICATION';
export const HIDE_NOTIFICATION = 'HIDE_NOTIFICATION';

export interface ShowNotificationAction {
  type: typeof SHOW_NOTIFICATION;
  payload: {
    message: string;
    type: 'error' | 'success' | 'warning' | 'info';
    id: string;
  };
}

export interface HideNotificationAction {
  type: typeof HIDE_NOTIFICATION;
  payload: {
    id: string;
  };
}

export type NotificationActionTypes = ShowNotificationAction | HideNotificationAction;

export const showNotification = (message: string, type: 'error' | 'success' | 'warning' | 'info' = 'error'): ShowNotificationAction => ({
  type: SHOW_NOTIFICATION,
  payload: {
    message,
    type,
    id: Date.now().toString()
  },
});

export const hideNotification = (id: string): HideNotificationAction => ({
  type: HIDE_NOTIFICATION,
  payload: {
    id,
  },
}); 