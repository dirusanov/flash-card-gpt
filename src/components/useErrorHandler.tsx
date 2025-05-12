import React, { useState } from 'react';
import ErrorNotification from './ErrorNotification';

interface NotificationState {
  message: string;
  type: 'error' | 'success';
}

const useErrorNotification = () => {
  const [notification, setNotification] = useState<NotificationState | null>(null);

  const showError = (message: string | null, type: 'error' | 'success' = 'error') => {
    if (message) {
      setNotification({ message, type });
    } else {
      setNotification(null);
    }
  };

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
    renderErrorNotification,
  };
};

export default useErrorNotification;
