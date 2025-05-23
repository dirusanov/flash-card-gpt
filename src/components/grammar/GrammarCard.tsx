import React from 'react';
import { FaEdit } from 'react-icons/fa';
import '../../styles/grammarStyles.css';

interface GrammarCardProps {
  content: string;
  isEditable?: boolean;
  onEditClick?: () => void;
}

const GrammarCard: React.FC<GrammarCardProps> = ({ 
  content, 
  isEditable = false, 
  onEditClick 
}) => {
  // Функция для предотвращения всплытия клика
  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращает всплытие события клика
  };

  return (
    <div 
      className="grammar-card-container" 
      style={{ position: 'relative' }}
      onClick={handleCardClick} // Обработчик клика, который предотвращает всплытие
    >
      <div 
        className="grammar-card grammar-reference"
        dangerouslySetInnerHTML={{ __html: content || '' }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      />
      
      {isEditable && onEditClick && (
        <button
          onClick={(e) => {
            e.stopPropagation(); // Предотвращаем всплытие для кнопки
            onEditClick(); // Вызываем переданный обработчик
          }}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'rgba(255, 255, 255, 0.8)',
            border: '1px solid #E5E7EB',
            color: '#3B82F6',
            fontSize: '12px',
            padding: '4px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            borderRadius: '4px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
          }}
        >
          <FaEdit size={12} />
          Edit
        </button>
      )}
    </div>
  );
};

export default GrammarCard; 