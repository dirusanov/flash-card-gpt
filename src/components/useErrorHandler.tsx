import React, { useState } from 'react';
import ErrorNotification from './ErrorNotification';

// Type for notification types
export type NotificationType = 'error' | 'success' | 'warning' | 'info';

interface NotificationState {
  message: string;
  type: NotificationType;
}

/**
 * Hook for displaying notifications in the application
 * @returns Methods for showing and rendering notifications 
 */
const useErrorNotification = () => {
  const [notification, setNotification] = useState<NotificationState | null>(null);

  /**
   * Show a notification message
   * @param message The message to display (null to clear)
   * @param type The type of notification (error, success, warning, info)
   */
  const showError = (message: string | null, type: NotificationType = 'error') => {
    if (message) {
      setNotification({ message, type });
    } else {
      setNotification(null);
    }
  };

  /**
   * Show a success notification
   * @param message The message to display
   */
  const showSuccess = (message: string) => {
    setNotification({ message, type: 'success' });
  };

  /**
   * Show a warning notification
   * @param message The message to display
   */
  const showWarning = (message: string) => {
    setNotification({ message, type: 'warning' });
  };
  
  /**
   * Show an info notification
   * @param message The message to display
   */
  const showInfo = (message: string) => {
    setNotification({ message, type: 'info' });
  };

  /**
   * Render the notification component
   */
  const renderErrorNotification = () =>
    notification ? (
      <ErrorNotification 
        message={notification.message} 
        type={notification.type} 
        onClose={() => setNotification(null)} 
      />
    ) : null;

  return {
    showError,
    showSuccess,
    showWarning,
    showInfo,
    renderErrorNotification,
  };
};

export default useErrorNotification;
