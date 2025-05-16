import React, {useEffect, useState} from 'react';
import { FaCheckCircle, FaTimesCircle, FaTimes, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';

interface NotificationProps {
  message: string;
  type?: 'error' | 'success' | 'warning' | 'info';
  onClose: () => void;
  autoClose?: boolean;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A toast-style notification component with multiple status types and animations
 */
const ErrorNotification: React.FC<NotificationProps> = ({ 
  message, 
  type = 'error', 
  onClose,
  autoClose = true,
  duration = 5000,
  className = '',
  style = {} 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Entrance animation on mount
  useEffect(() => {
    // Small delay for entrance animation
    const entranceTimer = setTimeout(() => {
      setIsVisible(true);
    }, 10);

    return () => clearTimeout(entranceTimer);
  }, []);

  // Handle automatic dismissal
  useEffect(() => {
    if (!autoClose) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [autoClose, duration]);

  // Handle smooth exit animation
  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 300); // Match this with CSS transition duration
  };

  // Determine style based on type
  const getNotificationStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: <FaCheckCircle size={18} />,
          bgColor: '#ECFDF5',
          borderColor: '#A7F3D0',
          textColor: '#064E3B',
          iconColor: '#059669'
        };
      case 'error':
        return {
          icon: <FaTimesCircle size={18} />,
          bgColor: '#FEF2F2',
          borderColor: '#FECDD3',
          textColor: '#7F1D1D',
          iconColor: '#EF4444'
        };
      case 'warning':
        return {
          icon: <FaExclamationTriangle size={18} />,
          bgColor: '#FFFBEB',
          borderColor: '#FEF3C7',
          textColor: '#78350F',
          iconColor: '#F59E0B'
        };
      case 'info':
      default:
        return {
          icon: <FaInfoCircle size={18} />,
          bgColor: '#EFF6FF',
          borderColor: '#BFDBFE',
          textColor: '#1E3A8A',
          iconColor: '#3B82F6'
        };
    }
  };

  const styles = getNotificationStyles();

  // Combined styles
  const combinedStyles: React.CSSProperties = {
    backgroundColor: styles.bgColor,
    color: styles.textColor,
    borderLeft: `4px solid ${styles.iconColor}`,
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'flex-start',
    position: 'relative',
    opacity: isExiting ? 0 : (isVisible ? 1 : 0),
    transform: isExiting ? 'translateX(20px)' : (isVisible ? 'translateX(0)' : 'translateX(20px)'),
    transition: 'all 0.3s ease',
    maxHeight: '100px',
    overflow: 'hidden',
    marginBottom: '8px',
    ...style
  };

  return (
    <div
      className={`notification ${className}`}
      style={combinedStyles}
      role="alert"
    >
      <div style={{ 
        color: styles.iconColor, 
        marginRight: '12px',
        marginTop: '2px',
        flexShrink: 0
      }}>
        {styles.icon}
      </div>
      <div style={{ 
        flex: 1,
        fontSize: '14px', 
        lineHeight: '1.5',
        fontWeight: 500,
        paddingRight: '20px'
      }}>
        {message}
      </div>
      <button
        onClick={handleDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '2px',
          marginLeft: '8px',
          cursor: 'pointer',
          color: styles.textColor,
          opacity: 0.7,
          fontSize: '18px',
          position: 'absolute',
          top: '8px',
          right: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
        onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
        aria-label="Close notification"
      >
        <FaTimes size={14} />
      </button>
    </div>
  );
};

export default ErrorNotification;