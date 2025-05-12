import React, {useEffect} from 'react';

interface NotificationProps {
  message: string;
  type?: 'error' | 'success';
  onClose: () => void;
}

const ErrorNotification: React.FC<NotificationProps> = ({ message, type = 'error', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // 5 seconds

    // Cleanup the timer if the component is unmounted before 5 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'error' ? '#f89f9d' : '#9df8b1';
  const textColor = 'black';

  return (
    <div
      className="fixed top-4 right-4 border border-black rounded shadow-lg z-50 p-3"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        boxSizing: 'border-box',
        width: '300px', // Hardcoded width
      }}
    >
      <div className="flex justify-between items-center py-2 overflow-hidden">
        <span
          style={{
            paddingLeft: '6px',
            paddingRight: '6px',
            wordBreak: 'break-word',
            whiteSpace: 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          className="flex-grow"
        >
          {message}
        </span>
        <button onClick={onClose} className="text-2xl font-bold flex-shrink-0">&times;</button>
      </div>
    </div>
  );
};

export default ErrorNotification;