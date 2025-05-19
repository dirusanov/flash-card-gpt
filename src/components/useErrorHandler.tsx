import React, { useState, useEffect } from 'react';
import { FaTimesCircle, FaCheckCircle, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';

// Type for error notification types
export type ErrorType = 'error' | 'success' | 'warning' | 'info';

// Enhanced error notification hook
const useErrorNotification = () => {
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<ErrorType>('error');
  const [visible, setVisible] = useState(false);
  
  // Show error notification
  const showError = (message: string | null, errorType: ErrorType = 'error') => {
    setError(message);
    setType(errorType);
    
    if (message) {
      setVisible(true);
      // Auto-hide successful messages after 3 seconds
      if (errorType === 'success') {
        setTimeout(() => {
          setVisible(false);
        }, 3000);
      }
    } else {
      setVisible(false);
    }
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
    if (!visible || !error) return null;
    
    const getIconAndColor = () => {
      switch (type) {
        case 'success':
          return { icon: <FaCheckCircle size={18} />, color: '#10B981', bgColor: '#ECFDF5', borderColor: '#A7F3D0' };
        case 'warning':
          return { icon: <FaExclamationTriangle size={18} />, color: '#F59E0B', bgColor: '#FFFBEB', borderColor: '#FCD34D' };
        case 'info':
          return { icon: <FaInfoCircle size={18} />, color: '#3B82F6', bgColor: '#EFF6FF', borderColor: '#93C5FD' };
        case 'error':
        default:
          return { icon: <FaTimesCircle size={18} />, color: '#EF4444', bgColor: '#FEF2F2', borderColor: '#FCA5A5' };
      }
    };
    
    const { icon, color, bgColor, borderColor } = getIconAndColor();
    const formattedMessage = formatApiErrorMessage(error);
    
    return (
      <div style={{
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor: bgColor,
        borderLeft: `4px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        marginBottom: '16px',
        position: 'relative',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ color: color, marginTop: '2px' }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ 
            color: '#374151', 
            margin: 0, 
            fontSize: '14px',
            lineHeight: '1.4'
          }}>
            {formattedMessage}
          </p>
        </div>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9CA3AF',
            cursor: 'pointer',
            padding: '0',
            marginLeft: '8px',
            marginTop: '2px'
          }}
          aria-label="Close notification"
        >
          <FaTimesCircle size={16} />
        </button>
      </div>
    );
  };
  
  return { showError, renderErrorNotification };
};

export default useErrorNotification;
