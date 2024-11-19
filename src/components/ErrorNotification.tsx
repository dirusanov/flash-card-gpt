import React, {useEffect} from 'react';

interface ErrorAlertProps {
  message: string;
  onClose: () => void;
}

const ErrorNotification: React.FC<ErrorAlertProps> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 10000); // 10 seconds

    // Cleanup the timer if the component is unmounted before 10 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="fixed top-4 right-4 border border-black rounded shadow-lg z-50 p-3"
      style={{
        backgroundColor: '#f89f9d',
        color: 'black',
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