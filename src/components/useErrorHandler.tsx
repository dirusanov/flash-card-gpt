import React, { useState } from 'react';
import ErrorNotification from './ErrorNotification';

const useErrorNotification = () => {
  const [error, setError] = useState<string | null>(null);

  const showError = (message: string | null) => {
    setError(message);
  };

  const renderErrorNotification = () =>
    error ? <ErrorNotification message={error} onClose={() => setError(null)} /> : null;

  return {
    showError,
    renderErrorNotification,
  };
};

export default useErrorNotification;
