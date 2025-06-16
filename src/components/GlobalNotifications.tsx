import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { hideNotification } from '../store/actions/notifications';
import { Notification } from '../store/reducers/notifications';
import { FaTimesCircle, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimes } from 'react-icons/fa';

const GlobalNotifications: React.FC = () => {
  const notifications = useSelector((state: RootState) => state.notifications.notifications);
  const dispatch = useDispatch();

  // Auto-hide notifications
  useEffect(() => {
    notifications.forEach((notification: Notification) => {
      const { id, type } = notification;
      
      let timeout = 0;
      if (type === 'success' || type === 'info') {
        timeout = 5000;
      } else if (type === 'warning') {
        timeout = 6000;
      }
      // errors don't auto-hide
      
      if (timeout > 0) {
        setTimeout(() => {
          dispatch(hideNotification(id));
        }, timeout);
      }
    });
  }, [notifications, dispatch]);

  const handleClose = (id: string) => {
    dispatch(hideNotification(id));
  };

  const getIconAndColors = (type: string) => {
    switch (type) {
      case 'success':
        return { 
          icon: <FaCheckCircle size={16} />, 
          color: '#059669', 
          bgColor: '#ECFDF5', 
          borderColor: '#10B981' 
        };
      case 'warning':
        return { 
          icon: <FaExclamationTriangle size={16} />, 
          color: '#D97706', 
          bgColor: '#FFFBEB', 
          borderColor: '#F59E0B' 
        };
      case 'info':
        return { 
          icon: <FaInfoCircle size={16} />, 
          color: '#2563EB', 
          bgColor: '#EFF6FF', 
          borderColor: '#3B82F6' 
        };
      case 'error':
      default:
        return { 
          icon: <FaTimesCircle size={16} />, 
          color: '#DC2626', 
          bgColor: '#FEF2F2', 
          borderColor: '#EF4444' 
        };
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '16px',
      right: '16px',
      zIndex: 9999,
      maxWidth: '300px',
      width: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      {notifications.map((notification: Notification) => {
        const { icon, color, bgColor, borderColor } = getIconAndColors(notification.type);
        
        return (
          <div 
            key={notification.id}
            style={{
              transform: 'translateX(0)',
              opacity: 1,
              transition: 'all 0.3s ease-out',
              backgroundColor: bgColor,
              border: `1px solid ${borderColor}`,
              borderRadius: '12px',
              padding: '16px',
              minWidth: '280px',
              maxWidth: '320px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}
            role="alert"
            aria-live="polite"
          >
            {/* Icon */}
            <div style={{ 
              color: color, 
              marginTop: '2px',
              flexShrink: 0
            }}>
              {icon}
            </div>
            
            {/* Content */}
            <div style={{ 
              flex: 1,
              paddingRight: '8px'
            }}>
              <p style={{ 
                color: '#374151', 
                margin: 0, 
                fontSize: '14px',
                lineHeight: '1.5',
                fontWeight: 500
              }}>
                {notification.message}
              </p>
            </div>
            
            {/* Close button */}
            <button
              onClick={() => handleClose(notification.id)}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: '#9CA3AF',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.color = '#374151';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#9CA3AF';
              }}
              aria-label="Close notification"
            >
              <FaTimes size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default GlobalNotifications; 