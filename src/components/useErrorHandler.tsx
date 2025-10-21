import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaTimesCircle, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimes } from 'react-icons/fa';

// Type for error notification types
export type ErrorType = 'error' | 'success' | 'warning' | 'info';

// Enhanced error notification hook
const useErrorNotification = () => {
  const [notification, setNotification] = useState<{ id: number; message: string; type: ErrorType } | null>(null);
  const [visible, setVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show error notification
  const hideNotification = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }

    setIsAnimating(false);
    if (hideAnimationTimerRef.current) {
      clearTimeout(hideAnimationTimerRef.current);
      hideAnimationTimerRef.current = null;
    }

    hideAnimationTimerRef.current = setTimeout(() => {
      setVisible(false);
      setNotification(null);
      hideAnimationTimerRef.current = null;
    }, 300); // Match animation duration
  }, []);

  const showError = useCallback((message: string | null, errorType: ErrorType = 'error') => {
    if (!message) {
      hideNotification();
      return;
    }

    const id = Date.now();
    setNotification({ id, message, type: errorType });
    setVisible(true);

    if (hideAnimationTimerRef.current) {
      clearTimeout(hideAnimationTimerRef.current);
      hideAnimationTimerRef.current = null;
    }

    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }

    setIsAnimating(false);
    animationTimerRef.current = setTimeout(() => {
      setIsAnimating(true);
      animationTimerRef.current = null;
    }, 40);

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      hideNotification();
      hideTimerRef.current = null;
    }, 5000);
  }, [hideNotification]);

  // Hide notification with animation
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
      if (hideAnimationTimerRef.current) {
        clearTimeout(hideAnimationTimerRef.current);
        hideAnimationTimerRef.current = null;
      }
    };
  }, []);
  
  // Format API error messages to be more user-friendly
  const formatApiErrorMessage = (message: string): string => {
    const normalized = message.toLowerCase();

    // Check for common API error patterns
    if (
      normalized.includes('401') ||
      normalized.includes('unauthorized') ||
      normalized.includes('authentication failed') ||
      normalized.includes('authorization failed') ||
      normalized.includes('invalid api key') ||
      normalized.includes('api key is invalid') ||
      normalized.includes('api key provided is incorrect') ||
      normalized.includes('bearer token is invalid') ||
      normalized.includes('invalid credentials') ||
      normalized.includes('invalid token')
    ) {
      return 'Authorization failed: your API key is invalid or no longer active.\n\nOpen the extension settings and paste a working key.';
    } 
    if (normalized.includes('429') || normalized.includes('rate limit') || normalized.includes('quota')) {
      return 'Quota exhausted: your OpenAI plan or monthly budget has been reached.\n\nOpen the OpenAI Platform → Usage limits to raise the quota or update billing, then try again.';
    }
    if (
      normalized.includes('500') ||
      normalized.includes('502') ||
      normalized.includes('503') ||
      normalized.includes('504')
    ) {
      return 'The AI service is temporarily unavailable. Please try again later.';
    }
    if (normalized.includes('openai')) {
      return `OpenAI error: ${message.split('OpenAI').pop()}`;
    }
    if (normalized.includes('groq')) {
      return `Groq error: ${message.split('Groq').pop()}`;
    }
    
    // Return the original message if no patterns match
    return message;
  };
  
  // Render the notification component
  const renderErrorNotification = () => {
    if (!visible || !notification) return null;

    const getIconAndColor = () => {
      switch (notification.type) {
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

    const { icon, color, bgColor, borderColor } = getIconAndColor();
    const formattedMessage = formatApiErrorMessage(notification.message);

    return (
      <div 
        key={notification.id}
        style={{
          transform: isAnimating ? 'translateX(0)' : 'translateX(100%)',
          opacity: isAnimating ? 1 : 0,
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
          gap: '12px',
          marginBottom: '8px'
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
            {formattedMessage}
          </p>
        </div>
        
        {/* Close button */}
        <button
          onClick={hideNotification}
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
        
        {/* Progress bar for auto-dismiss notifications */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '3px',
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          borderRadius: '0 0 12px 12px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            backgroundColor: borderColor,
            width: '100%',
            transition: 'width 5s linear',
            transformOrigin: 'left'
          }} />
        </div>
      </div>
    );
  };
  
  return { showError, renderErrorNotification };
};

export default useErrorNotification;
