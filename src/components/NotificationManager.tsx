import React, { useState, useEffect } from 'react';
import ErrorNotification from './ErrorNotification';
import { NotificationType } from './useErrorHandler';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

interface NotificationManagerProps {
  notifications: Notification[];
  onClose: (id: string) => void;
}

/**
 * Component for managing and displaying multiple notifications
 */
const NotificationManager: React.FC<NotificationManagerProps> = ({ notifications, onClose }) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        width: '320px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
    >
      {notifications.map((notification) => (
        <ErrorNotification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => onClose(notification.id)}
        />
      ))}
    </div>
  );
};

export const useNotificationManager = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Function to add a notification
  const addNotification = (message: string, type: NotificationType = 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Auto-remove after 6 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 6000);
    
    return id;
  };

  // Function to remove a notification
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  // Helper functions for specific notification types
  const showSuccess = (message: string) => addNotification(message, 'success');
  const showError = (message: string) => addNotification(message, 'error');
  const showWarning = (message: string) => addNotification(message, 'warning');
  const showInfo = (message: string) => addNotification(message, 'info');

  // Component to render notifications
  const NotificationsDisplay = () => (
    <NotificationManager 
      notifications={notifications} 
      onClose={removeNotification} 
    />
  );

  return {
    notifications,
    addNotification,
    removeNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    NotificationsDisplay
  };
};

export default NotificationManager; 