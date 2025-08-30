import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setFront, setBack, setText, setImageUrl, setCurrentCardId, saveCardToStorage } from '../store/actions/cards';
import { getAIService, getApiKeyForProvider } from '../services/aiServiceFactory';
import { ModelProvider } from '../store/reducers/settings';
import { Modes } from '../constants';
import { StoredCard } from '../store/reducers/cards';
import { FaLightbulb, FaCode, FaImage, FaMagic, FaTimes, FaList, FaFont, FaBrain, FaCheck, FaArrowRight, FaClock } from 'react-icons/fa';
import useErrorNotification from './useErrorHandler';
import Loader from './Loader';
import {
  LOADING_MESSAGES,
  getLoadingMessage,
  getDetailedLoadingMessage,
  LoadingProgressTracker,
  type LoadingMessage,
  type DetailedLoadingMessage
} from '../services/loadingMessages';
import { setGlobalProgressCallback, getGlobalApiTracker } from '../services/apiTracker';

// Интерфейс для типов общих карточек
interface GeneralCardTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    prompt: string;
    color: string;
}

// Шаблоны для создания общих карточек
const GENERAL_CARD_TEMPLATES: GeneralCardTemplate[] = [
    {
        id: 'qa',
        name: 'Q&A',
        description: 'Question and answer format',
        icon: '❓',
        prompt: 'Create a concise question and answer based on this text. Format as: Front: [question], Back: [answer]',
        color: '#3B82F6'
    },
    {
        id: 'definition',
        name: 'Definition',
        description: 'Key term and definition',
        icon: '📖',
        prompt: 'Extract the main concept and provide a clear definition. Format as: Front: [term], Back: [definition]',
        color: '#10B981'
    },
    {
        id: 'summary',
        name: 'Summary',
        description: 'Key points summary',
        icon: '📝',
        prompt: 'Create a summary card. Format as: Front: [topic], Back: [key points in bullet format]',
        color: '#8B5CF6'
    },
    {
        id: 'facts',
        name: 'Facts',
        description: 'Important facts and details',
        icon: '💡',
        prompt: 'Extract important facts. Format as: Front: [fact topic], Back: [detailed facts]',
        color: '#F59E0B'
    },
    {
        id: 'process',
        name: 'Process',
        description: 'Step-by-step explanation',
        icon: '🔄',
        prompt: 'Break down any process into steps. Format as: Front: [process name], Back: [numbered steps]',
        color: '#EF4444'
    },
    {
        id: 'concept',
        name: 'Concept',
        description: 'Explain the concept',
        icon: '🧠',
        prompt: 'Explain the concept simply. Format as: Front: [concept name], Back: [explanation with examples]',
        color: '#6366F1'
    }
];

interface UniversalCardCreatorProps {
    inputText: string;
    onCardCreated?: (card: StoredCard) => void;
    onCancel?: () => void;
}

const UniversalCardCreator: React.FC<UniversalCardCreatorProps> = ({ 
    inputText, 
    onCardCreated, 
    onCancel 
}) => {
    const dispatch = useDispatch();
    const { showError } = useErrorNotification();
    
    const [selectedTemplate, setSelectedTemplate] = useState<GeneralCardTemplate | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedCard, setGeneratedCard] = useState<{ front: string; back: string } | null>(null);
    const [customPrompt, setCustomPrompt] = useState('');
    const [showCustomPrompt, setShowCustomPrompt] = useState(false);
    const [currentLoadingMessage, setCurrentLoadingMessage] = useState<DetailedLoadingMessage | null>(null);
    const [generationStep, setGenerationStep] = useState<string>('');
    const [currentProgress, setCurrentProgress] = useState({ completed: 0, total: 0 });
    const [elapsedTime, setElapsedTime] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Redux selectors
    const modelProvider = useSelector((state: RootState) => state.settings.modelProvider);
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
    const groqApiKey = useSelector((state: RootState) => state.settings.groqApiKey);
    const shouldGenerateImage = useSelector((state: RootState) => state.settings.shouldGenerateImage);
    const imageGenerationMode = useSelector((state: RootState) => state.settings.imageGenerationMode);
    const imageInstructions = useSelector((state: RootState) => state.settings.imageInstructions);

    // Get AI service and API key
    const aiService = useMemo(() => getAIService(modelProvider as ModelProvider), [modelProvider]);
    const apiKey = useMemo(() => getApiKeyForProvider(
        modelProvider as ModelProvider,
        openAiKey,
        groqApiKey
    ), [modelProvider, openAiKey, groqApiKey]);

    // Timer effect
    useEffect(() => {
        if (isGenerating) {
            setElapsedTime(0);
            timerRef.current = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isGenerating]);

    // Format elapsed time
    const formatElapsedTime = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    // Smart image generation function
    const shouldGenerateImageForText = useCallback(async (text: string): Promise<{ shouldGenerate: boolean; reason: string }> => {
        if (!text || text.trim().length === 0) {
            return { shouldGenerate: false, reason: "No text provided" };
        }

        try {
            const prompt = `Analyze this word/phrase and determine if a visual image would be helpful for language learning: "${text}"

Consider these criteria:
- Concrete objects, animals, places, foods, tools, vehicles = YES
- Abstract concepts, emotions, actions, grammar terms = NO
- People, professions, activities that can be visualized = YES
- Numbers, prepositions, conjunctions, abstract ideas = NO

Respond with ONLY "YES" or "NO" followed by a brief reason (max 10 words).
Format: "YES - concrete object that can be visualized" or "NO - abstract concept"`;

            const response = await aiService.createChatCompletion(apiKey, [
                { role: "user", content: prompt }
            ]);

            if (response && response.content) {
                const result = response.content.trim();
                const shouldGenerate = result.toUpperCase().startsWith('YES');
                const reason = result.includes(' - ') ? result.split(' - ')[1] : 'AI analysis';
                
                return { shouldGenerate, reason };
            }

            return { shouldGenerate: false, reason: "AI analysis failed" };
        } catch (error) {
            console.error('Error analyzing text for image generation:', error);
            return { shouldGenerate: false, reason: "Analysis error" };
        }
    }, [aiService, apiKey]);

    // Function to generate a card from template
    const generateCard = useCallback(async (template: GeneralCardTemplate, customPrompt?: string) => {
        if (!inputText.trim()) {
            showError('Please provide some text to create a card from');
            return;
        }

        setIsGenerating(true);
        setCurrentLoadingMessage(null);
        setGenerationStep('');

        // Reset global API tracker and set progress callback
        const globalTracker = getGlobalApiTracker();
        globalTracker.reset();

        setGlobalProgressCallback((update) => {
            setCurrentLoadingMessage(update.message);
            setGenerationStep(`${update.completed} of ${update.total} requests`);
            setCurrentProgress({ completed: update.completed, total: update.total });
        });
        
                        try {
            const finalPrompt = customPrompt || template.prompt;
            const fullPrompt = `${finalPrompt}\n\nText: "${inputText}"\n\nProvide a clear, educational response that would work well as flashcard content. Be concise but informative.`;

            // Generate the card content (API tracker will handle progress automatically)
            const response = await aiService.translateText(fullPrompt, 'en');
            
            if (!response) {
                throw new Error('Failed to generate card content');
            }

            // Parse the response to extract front and back
            let front = '';
            let back = '';
            
            // Try to parse the structured response
            if (response.includes('Front:') && response.includes('Back:')) {
                const frontMatch = response.match(/Front:\s*(.+?)(?=Back:|$)/s);
                const backMatch = response.match(/Back:\s*(.+?)$/s);
                
                if (frontMatch && backMatch) {
                    front = frontMatch[1].trim();
                    back = backMatch[1].trim();
                }
            } else {
                // Fallback parsing based on template type
                if (template.id === 'qa') {
                    // Look for Q: and A: pattern
                    const qMatch = response.match(/Q:\s*(.+?)(?=A:|$)/s);
                    const aMatch = response.match(/A:\s*(.+?)$/s);
                    
                    if (qMatch && aMatch) {
                        front = qMatch[1].trim();
                        back = aMatch[1].trim();
                    } else {
                        // Create a question from the text
                        const excerpt = inputText.length > 60 ? inputText.substring(0, 60) + '...' : inputText;
                        front = `What is the main point about: ${excerpt}`;
                        back = response;
                    }
                } else if (template.id === 'definition') {
                    // Try to extract term and definition
                    const colonIndex = response.indexOf(':');
                    if (colonIndex !== -1) {
                        front = response.substring(0, colonIndex).trim();
                        back = response.substring(colonIndex + 1).trim();
                    } else {
                        // Extract key terms from the original text
                        const words = inputText.split(' ').filter(word => word.length > 4);
                        front = words.slice(0, 2).join(' ');
                        back = response;
                    }
                } else {
                    // For other templates, create a front from the template and text
                    const excerpt = inputText.length > 50 ? inputText.substring(0, 50) + '...' : inputText;
                    front = `${template.name}: ${excerpt}`;
                    back = response;
                }
            }

            // Generate image if enabled (API tracker will handle progress automatically)
            let imageUrl = null;
            if (shouldGenerateImage && imageGenerationMode !== 'off' && modelProvider !== ModelProvider.Groq) {
                try {
                    let shouldGenerate = imageGenerationMode === 'always';
                    let analysisReason = '';

                    // For smart mode, check if image would be helpful
                    if (imageGenerationMode === 'smart') {
                        const analysis = await shouldGenerateImageForText(inputText);
                        shouldGenerate = analysis.shouldGenerate;
                        analysisReason = analysis.reason;
                        
                        console.log(`🤖 Smart image analysis for "${inputText}": ${shouldGenerate ? 'YES' : 'NO'} - ${analysisReason}`);
                    }

                    if (shouldGenerate) {
                        console.log('🖼️ Starting image generation...');
                        const imageDescription = await aiService.getDescriptionImage(apiKey, inputText, imageInstructions);
                        if (imageDescription && aiService.getImageUrl) {
                            imageUrl = await aiService.getImageUrl(apiKey, imageDescription);
                            console.log('🖼️ Image generation completed');
                        }
                    } else if (imageGenerationMode === 'smart') {
                        console.log(`🚫 No image needed for "${inputText}": ${analysisReason}`);
                    }
                } catch (imageError) {
                    console.warn('Failed to generate image:', imageError);
                    // Continue without image
                }
            }

            const cardData = { front, back };
            setGeneratedCard(cardData);

            // Update Redux state
            dispatch(setFront(front));
            dispatch(setBack(back));
            dispatch(setText(inputText));
            if (imageUrl) {
                dispatch(setImageUrl(imageUrl));
            }
            
        } catch (error) {
            console.error('Error generating card:', error);
            showError(`Failed to generate card: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            console.log('🎯 Universal card creator finally block reached');
            // Don't immediately reset everything to prevent window disappearing
            setTimeout(() => {
                console.log('✅ Universal card creator hiding loader');
                setIsGenerating(false);
                setCurrentLoadingMessage(null);
                setGenerationStep('');
                setCurrentProgress({ completed: 0, total: 0 });
            }, 500); // Small delay to ensure smooth transition
        }
    }, [inputText, aiService, showError, dispatch, shouldGenerateImage, imageGenerationMode, imageInstructions, modelProvider]);

    // Function to save the generated card
    const saveCard = useCallback(async () => {
        if (!generatedCard) return;

        try {
            const cardId = `general_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const card: StoredCard = {
                id: cardId,
                mode: Modes.GeneralTopic,
                front: generatedCard.front,
                back: generatedCard.back,
                text: inputText,
                createdAt: new Date(),
                exportStatus: 'not_exported'
            };

            dispatch(saveCardToStorage(card));
            dispatch(setCurrentCardId(cardId));
            
            if (onCardCreated) {
                onCardCreated(card);
            }
            
                            // showError('Card saved successfully!', 'success'); // Убрали уведомление
            
        } catch (error) {
            console.error('Error saving card:', error);
            showError('Failed to save card', 'error');
        }
    }, [generatedCard, inputText, dispatch, onCardCreated, showError]);

    // Function to handle template selection
    const handleTemplateSelect = useCallback((template: GeneralCardTemplate) => {
        setSelectedTemplate(template);
        generateCard(template);
    }, [generateCard]);

    // Function to handle custom prompt submission
    const handleCustomPromptSubmit = useCallback(async () => {
        if (!customPrompt.trim()) {
            showError('Please enter a custom prompt', 'error');
            return;
        }

        const customTemplate: GeneralCardTemplate = {
            id: 'custom',
            name: 'Custom',
            description: 'Custom prompt',
            icon: '⚡',
            prompt: customPrompt,
            color: '#6B7280'
        };

        setSelectedTemplate(customTemplate);
        await generateCard(customTemplate, customPrompt);
        setShowCustomPrompt(false);
    }, [customPrompt, generateCard, showError]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            padding: '20px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            maxWidth: '500px',
            width: '100%'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px'
            }}>
                <h3 style={{
                    fontSize: '18px',
                    fontWeight: '700',
                    color: '#111827',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <FaBrain style={{ color: '#6366F1' }} />
                    Create Universal Card
                </h3>
                {onCancel && (
                    <button
                        onClick={onCancel}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#6B7280',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                            transition: 'color 0.2s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#374151'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#6B7280'}
                    >
                        <FaTimes />
                    </button>
                )}
            </div>

            {/* Input text preview */}
            <div style={{
                backgroundColor: '#F9FAFB',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #E5E7EB'
            }}>
                <p style={{
                    fontSize: '12px',
                    color: '#6B7280',
                    margin: '0 0 4px 0',
                    fontWeight: '500'
                }}>
                    Selected Text:
                </p>
                <p style={{
                    fontSize: '14px',
                    color: '#374151',
                    margin: 0,
                    lineHeight: '1.4',
                    maxHeight: '80px',
                    overflow: 'auto'
                }}>
                    {inputText.length > 200 ? inputText.substring(0, 200) + '...' : inputText}
                </p>
            </div>

            {/* Template selection */}
            {!selectedTemplate && !isGenerating && (
                <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '12px'
                    }}>
                        {GENERAL_CARD_TEMPLATES.map((template) => (
                            <button
                                key={template.id}
                                onClick={() => handleTemplateSelect(template)}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '16px 12px',
                                    backgroundColor: '#ffffff',
                                    border: `2px solid ${template.color}20`,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    textAlign: 'center'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = `${template.color}10`;
                                    e.currentTarget.style.borderColor = `${template.color}40`;
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = '#ffffff';
                                    e.currentTarget.style.borderColor = `${template.color}20`;
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                <div style={{
                                    fontSize: '24px',
                                    filter: 'grayscale(0.2)'
                                }}>
                                    {template.icon}
                                </div>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: template.color
                                }}>
                                    {template.name}
                                </div>
                                <div style={{
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    lineHeight: '1.3'
                                }}>
                                    {template.description}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Custom prompt option */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginTop: '8px'
                    }}>
                        <button
                            onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '10px 16px',
                                backgroundColor: '#F3F4F6',
                                border: '1px solid #E5E7EB',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#374151',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#E5E7EB';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#F3F4F6';
                            }}
                        >
                            <FaMagic />
                            {showCustomPrompt ? 'Hide Custom Prompt' : 'Use Custom Prompt'}
                        </button>

                        {showCustomPrompt && (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                padding: '12px',
                                backgroundColor: '#F9FAFB',
                                borderRadius: '6px',
                                border: '1px solid #E5E7EB'
                            }}>
                                <textarea
                                    value={customPrompt}
                                    onChange={(e) => setCustomPrompt(e.target.value)}
                                    placeholder="Enter your custom prompt for card generation..."
                                    style={{
                                        width: '100%',
                                        minHeight: '60px',
                                        padding: '8px 12px',
                                        border: '1px solid #E5E7EB',
                                        borderRadius: '4px',
                                        fontSize: '14px',
                                        resize: 'vertical',
                                        outline: 'none'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#6366F1'}
                                    onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                                />
                                <button
                                    onClick={handleCustomPromptSubmit}
                                    disabled={!customPrompt.trim()}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: customPrompt.trim() ? '#6366F1' : '#E5E7EB',
                                        color: customPrompt.trim() ? '#ffffff' : '#9CA3AF',
                                        border: 'none',
                                        borderRadius: '4px',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        cursor: customPrompt.trim() ? 'pointer' : 'not-allowed',
                                        transition: 'background-color 0.2s ease'
                                    }}
                                >
                                    Generate Card
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Loading state */}
            {isGenerating && (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '20px',
                    padding: '40px 20px',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <Loader
                            type="spinner"
                            size="large"
                            color={currentLoadingMessage?.color || '#3B82F6'}
                        />
                        {currentLoadingMessage && (
                            <div style={{
                                fontSize: '24px',
                                opacity: 0.8
                            }}>
                                {currentLoadingMessage.icon}
                            </div>
                        )}
                    </div>

                    <div style={{
                        textAlign: 'center',
                        color: '#374151',
                        maxWidth: '400px'
                    }}>
                        <div style={{
                            fontSize: '18px',
                            fontWeight: '600',
                            marginBottom: '8px',
                            color: currentLoadingMessage?.color || '#1f2937'
                        }}>
                            {currentLoadingMessage?.currentStepTitle || currentLoadingMessage?.title || 'Generating your card...'}
                        </div>
                        <div style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            lineHeight: '1.5'
                        }}>
                            {currentLoadingMessage?.currentStepSubtitle || currentLoadingMessage?.subtitle || 'AI is analyzing your text and creating the perfect flashcard'}
                        </div>
                        {generationStep && (
                            <div style={{
                                fontSize: '12px',
                                color: '#9ca3af',
                                marginTop: '8px',
                                fontStyle: 'italic'
                            }}>
                                {generationStep}
                            </div>
                        )}

                        {/* Timer display */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            marginTop: '12px',
                            padding: '8px 16px',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '20px',
                            border: `1px solid ${currentLoadingMessage?.color || '#3B82F6'}20`,
                            boxShadow: `0 0 15px ${currentLoadingMessage?.color || '#3B82F6'}20`
                        }}>
                            <FaClock style={{
                                color: currentLoadingMessage?.color || '#3B82F6',
                                fontSize: '14px',
                                animation: 'pulse 2s ease-in-out infinite'
                            }} />
                            <span style={{
                                fontSize: '16px',
                                fontWeight: '600',
                                color: currentLoadingMessage?.color || '#3B82F6',
                                fontFamily: 'monospace',
                                letterSpacing: '1px'
                            }}>
                                {formatElapsedTime(elapsedTime)}
                            </span>
                        </div>
                    </div>

                    {/* Progress indicator */}
                    <div style={{
                        width: '240px',
                        height: '8px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginTop: '12px',
                        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${currentProgress.total > 0 ? Math.max(5, (currentProgress.completed / currentProgress.total) * 100) : 10}%`, // Real progress
                            background: `linear-gradient(90deg, ${currentLoadingMessage?.color || '#3B82F6'} 0%, ${currentLoadingMessage?.color || '#3B82F6'}dd 50%, ${currentLoadingMessage?.color || '#3B82F6'} 100%)`,
                            borderRadius: '4px',
                            transition: 'width 0.6s ease-out, background 0.3s ease-in-out',
                            boxShadow: `0 0 10px ${currentLoadingMessage?.color || '#3B82F6'}40`,
                            position: 'relative' as const,
                            overflow: 'hidden' as const
                        }}>
                            {/* Shimmer effect */}
                            <div style={{
                                position: 'absolute' as const,
                                top: 0,
                                left: '-100%',
                                width: '100%',
                                height: '100%',
                                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                                animation: 'shimmer 2s infinite'
                            }} />
                        </div>
                    </div>
                </div>
            )}

            <style>
                {`
                    @keyframes progressPulse {
                        0% { width: 20%; }
                        50% { width: 80%; }
                        100% { width: 20%; }
                    }

                    @keyframes pulse {
                        0%, 100% {
                            opacity: 1;
                            transform: scale(1);
                        }
                        50% {
                            opacity: 0.7;
                            transform: scale(1.05);
                        }
                    }
                `}
            </style>

            {/* Generated card preview */}
            {generatedCard && !isGenerating && (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px'
                    }}>
                        <FaCheck style={{ color: '#10B981' }} />
                        <span style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#111827'
                        }}>
                            Card Generated
                        </span>
                        {selectedTemplate && (
                            <span style={{
                                fontSize: '12px',
                                color: '#6B7280',
                                backgroundColor: '#F3F4F6',
                                padding: '2px 6px',
                                borderRadius: '4px'
                            }}>
                                {selectedTemplate.name}
                            </span>
                        )}
                    </div>

                    {/* Card preview */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        padding: '16px',
                        backgroundColor: '#F9FAFB',
                        borderRadius: '8px',
                        border: '1px solid #E5E7EB'
                    }}>
                        <div>
                            <div style={{
                                fontSize: '12px',
                                fontWeight: '600',
                                color: '#6B7280',
                                marginBottom: '6px'
                            }}>
                                FRONT:
                            </div>
                            <div style={{
                                fontSize: '14px',
                                color: '#111827',
                                lineHeight: '1.4',
                                padding: '8px',
                                backgroundColor: '#ffffff',
                                borderRadius: '4px',
                                border: '1px solid #E5E7EB'
                            }}>
                                {generatedCard.front}
                            </div>
                        </div>
                        
                        <div>
                            <div style={{
                                fontSize: '12px',
                                fontWeight: '600',
                                color: '#6B7280',
                                marginBottom: '6px'
                            }}>
                                BACK:
                            </div>
                            <div style={{
                                fontSize: '14px',
                                color: '#111827',
                                lineHeight: '1.4',
                                padding: '8px',
                                backgroundColor: '#ffffff',
                                borderRadius: '4px',
                                border: '1px solid #E5E7EB',
                                whiteSpace: 'pre-wrap'
                            }}>
                                {generatedCard.back}
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{
                        display: 'flex',
                        gap: '12px',
                        marginTop: '8px'
                    }}>
                        <button
                            onClick={saveCard}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '12px 16px',
                                backgroundColor: '#10B981',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s ease'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10B981'}
                        >
                            <FaCheck />
                            Save Card
                        </button>
                        
                        <button
                            onClick={() => {
                                setGeneratedCard(null);
                                setSelectedTemplate(null);
                            }}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '12px 16px',
                                backgroundColor: '#F3F4F6',
                                color: '#374151',
                                border: '1px solid #E5E7EB',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#E5E7EB';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#F3F4F6';
                            }}
                        >
                            <FaArrowRight style={{ transform: 'rotate(180deg)' }} />
                            Try Another
                        </button>
                    </div>
                </div>
            )}
            <style>
                {`
                    @keyframes shimmer {
                        0% {
                            left: -100%;
                        }
                        100% {
                            left: 100%;
                        }
                    }
                `}
            </style>
        </div>
    );
};

export default UniversalCardCreator; 