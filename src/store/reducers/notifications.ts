import { SHOW_NOTIFICATION, HIDE_NOTIFICATION, NotificationActionTypes } from '../actions/notifications';

export interface Notification {
  id: string;
  message: string;
  type: 'error' | 'success' | 'warning' | 'info';
}

export interface NotificationState {
  notifications: Notification[];
}

const initialState: NotificationState = {
  notifications: []
};

const notificationsReducer = (state = initialState, action: NotificationActionTypes): NotificationState => {
  switch (action.type) {
    case SHOW_NOTIFICATION:
      return {
        ...state,
        notifications: [...state.notifications, action.payload]
      };
    case HIDE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter(notification => notification.id !== action.payload.id)
      };
    default:
      return state;
  }
};

export default notificationsReducer; 