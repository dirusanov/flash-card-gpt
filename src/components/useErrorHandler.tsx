import React, { useState, useEffect } from 'react';
import { FaTimesCircle, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimes } from 'react-icons/fa';

// Type for error notification types
export type ErrorType = 'error' | 'success' | 'warning' | 'info';

// Enhanced error notification hook
const useErrorNotification = () => {
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<ErrorType>('error');
  const [visible, setVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Show error notification
  const showError = (message: string | null, errorType: ErrorType = 'error') => {
    console.log('showError called:', { message, errorType, visible, isAnimating });
    
    if (message) {
      setError(message);
      setType(errorType);
      setVisible(true);
      
      // Небольшая задержка для плавной анимации
      setTimeout(() => {
        setIsAnimating(true);
      }, 50);
      
      // Auto-hide successful and info messages after 4 seconds
      if (errorType === 'success' || errorType === 'info') {
        setTimeout(() => {
          hideNotification();
        }, 4000);
      }
      // Auto-hide warnings after 6 seconds
      else if (errorType === 'warning') {
        setTimeout(() => {
          hideNotification();
        }, 6000);
      }
      // Errors stay until manually dismissed
    } else {
      hideNotification();
    }
  };
  
  // Hide notification with animation
  const hideNotification = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setVisible(false);
      setError(null);
    }, 300); // Match animation duration
  };
  
  // Format API error messages to be more user-friendly
  const formatApiErrorMessage = (message: string): string => {
    // Check for common API error patterns
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('Authentication')) {
      return 'API Authentication failed: Please check your API key in Settings.';
    } 
    else if (message.includes('429') || message.includes('Rate limit')) {
      return 'API rate limit exceeded: Please try again in a few minutes.';
    }
    else if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return 'AI service is currently unavailable. Please try again later.';
    }
    else if (message.includes('key is missing') || message.includes('API key')) {
      return 'API key is missing or invalid. Please check your settings.';
    }
    
    // For model-specific errors
    if (message.includes('OpenAI')) {
      return `OpenAI API error: ${message.split('OpenAI').pop()}`;
    }
    else if (message.includes('Groq')) {
      return `Groq API error: ${message.split('Groq').pop()}`;
    }
    
    // Return the original message if no patterns match
    return message;
  };
  
  // Render the notification component
  const renderErrorNotification = () => {
    console.log('renderErrorNotification called:', { visible, error, isAnimating, type });
    
    if (!visible || !error) return null;
    
    const getIconAndColor = () => {
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
    
    const { icon, color, bgColor, borderColor } = getIconAndColor();
    const formattedMessage = formatApiErrorMessage(error);
    
    return (
      <div 
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
        {(type === 'success' || type === 'info' || type === 'warning') && (
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
              transition: `width ${type === 'warning' ? '6s' : '4s'} linear`,
              transformOrigin: 'left'
            }} />
          </div>
        )}
      </div>
    );
  };
  
  return { showError, renderErrorNotification };
};

export default useErrorNotification;
