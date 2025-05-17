import React from 'react';

interface LoaderProps {
  size?: 'small' | 'medium' | 'large';
  type?: 'spinner' | 'pulse' | 'dots';
  color?: string;
  text?: string;
  fullScreen?: boolean;
  overlay?: boolean;
  inline?: boolean;
}

const Loader: React.FC<LoaderProps> = ({
  size = 'medium',
  type = 'spinner',
  color = '#3B82F6',
  text,
  fullScreen = false,
  overlay = false,
  inline = false,
}) => {
  // Size mapping for different loader components
  const sizeMap = {
    small: { container: '16px', fontSize: '12px', spacing: '8px' },
    medium: { container: '24px', fontSize: '14px', spacing: '12px' },
    large: { container: '32px', fontSize: '16px', spacing: '16px' },
  };

  // Get current size values
  const currentSize = sizeMap[size];

  // Animation keyframes as CSS objects
  const spinKeyframes = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  const pulseKeyframes = `
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }
  `;

  const dotsKeyframes = `
    @keyframes dots1 {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
    @keyframes dots2 {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
      animation-delay: 0.2s;
    }
    @keyframes dots3 {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
      animation-delay: 0.4s;
    }
  `;

  // Render appropriate loader based on type
  const renderLoader = () => {
    switch (type) {
      case 'spinner':
        return (
          <div 
            style={{
              width: currentSize.container,
              height: currentSize.container,
              border: `2px solid ${color}`,
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        );
      case 'pulse':
        return (
          <div 
            style={{
              width: currentSize.container,
              height: currentSize.container,
              backgroundColor: color,
              borderRadius: '50%',
              animation: 'pulse 1.2s ease-in-out infinite',
            }}
          />
        );
      case 'dots':
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}>
            {[1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  width: `calc(${currentSize.container} / 3)`,
                  height: `calc(${currentSize.container} / 3)`,
                  backgroundColor: color,
                  borderRadius: '50%',
                  animation: `dots${i} 1.4s infinite ease-in-out both`,
                  animationDelay: `${(i - 1) * 0.2}s`,
                }}
              />
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  // Container styles based on fullScreen and overlay props
  const containerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: currentSize.spacing,
    zIndex: 1000,
  };

  if (fullScreen) {
    containerStyles.position = 'fixed';
    containerStyles.top = 0;
    containerStyles.left = 0;
    containerStyles.right = 0;
    containerStyles.bottom = 0;
  }

  if (overlay) {
    containerStyles.position = 'absolute';
    containerStyles.top = 0;
    containerStyles.left = 0;
    containerStyles.right = 0;
    containerStyles.bottom = 0;
    containerStyles.backgroundColor = 'rgba(255, 255, 255, 0.8)';
  }

  if (inline) {
    containerStyles.display = 'inline-flex';
    containerStyles.flexDirection = 'row';
    containerStyles.marginLeft = '8px';
    containerStyles.marginRight = '8px';
  }

  return (
    <>
      <style>
        {spinKeyframes}
        {pulseKeyframes}
        {dotsKeyframes}
      </style>
      <div style={containerStyles}>
        {renderLoader()}
        {text && (
          <div style={{
            color: color,
            fontSize: currentSize.fontSize,
            fontWeight: 500,
            textAlign: 'center',
          }}>
            {text}
          </div>
        )}
      </div>
    </>
  );
};

export default Loader; 