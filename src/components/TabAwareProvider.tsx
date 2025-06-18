import React, { createContext, useContext, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { 
    setTabText, 
    setTabTranslation, 
    setTabExamples, 
    setTabImage, 
    setTabImageUrl, 
    setTabFront, 
    setTabBack, 
    setTabLinguisticInfo, 
    setTabTranscription, 
    setTabIsGeneratingCard, 
    setTabCurrentCardId,
    setTabCurrentPage
} from '../store/actions/tabState';
import { 
    setText, 
    setTranslation, 
    setExamples, 
    setImage, 
    setImageUrl, 
    setFront, 
    setBack, 
    setLinguisticInfo, 
    setTranscription, 
    setIsGeneratingCard, 
    setCurrentCardId,
    saveCardToStorage,
    updateStoredCard,
    deleteStoredCard,
    updateCardExportStatus
} from '../store/actions/cards';
import { setCurrentPage } from '../store/actions/page';
import { StoredCard } from '../store/reducers/cards';
import { Modes } from '../constants';

interface TabAwareContextType {
    // Card data
    text: string;
    translation: string;
    examples: Array<[string, string | null]>;
    image: string | null;
    imageUrl: string | null;
    front: string;
    back: string | null;
    linguisticInfo: string;
    transcription: string;
    isGeneratingCard: boolean;
    currentCardId: string | null;
    storedCards: StoredCard[];
    fieldIdPrefix: string;
    currentPage: string;
    
    // Action dispatchers
    setText: (text: string) => void;
    setTranslation: (translation: string) => void;
    setExamples: (examples: Array<[string, string | null]>) => void;
    setImage: (image: string | null) => void;
    setImageUrl: (imageUrl: string | null) => void;
    setFront: (front: string) => void;
    setBack: (back: string | null) => void;
    setLinguisticInfo: (linguisticInfo: string) => void;
    setTranscription: (transcription: string) => void;
    setIsGeneratingCard: (isGenerating: boolean) => void;
    setCurrentCardId: (cardId: string | null) => void;
    saveCardToStorage: (card: any) => void;
    updateStoredCard: (card: StoredCard) => void;
    deleteStoredCard: (cardId: string) => void;
    updateCardExportStatus: (cardId: string, status: any) => void;
    setCurrentPage: (page: string) => void;
    
    // Mass update function for easier migration
    updateCard: (updates: Partial<{
        text: string;
        translation: string;
        examples: Array<[string, string | null]>;
        image: string | null;
        imageUrl: string | null;
        front: string;
        back: string | null;
        linguisticInfo: string;
        transcription: string;
        isGeneratingCard: boolean;
        currentCardId: string | null;
    }>) => void;
}

const TabAwareContext = createContext<TabAwareContextType | null>(null);

interface TabAwareProviderProps {
    tabId: number;
    children: React.ReactNode;
}

export const TabAwareProvider: React.FC<TabAwareProviderProps> = ({ tabId, children }) => {
    const dispatch = useDispatch();
    
    // Get tab-specific state
    const tabState = useSelector((state: RootState) => 
        state.tabState.tabStates[tabId]
    );
    
    // Fallback to global state if tab state doesn't exist
    const globalCards = useSelector((state: RootState) => state.cards);
    
    // Больше не загружаем tab-specific карточки, используем только глобальные
    
    // Create context value
    const contextValue: TabAwareContextType = useMemo(() => {
        // Use tab-specific data if available, otherwise fallback to global
        const cardData = tabState?.cardData || {
            text: globalCards.text,
            translation: globalCards.translation,
            examples: globalCards.examples,
            image: globalCards.image,
            imageUrl: globalCards.imageUrl,
            front: globalCards.front,
            back: globalCards.back,
            linguisticInfo: globalCards.linguisticInfo,
            transcription: globalCards.transcription,
            isGeneratingCard: globalCards.isGeneratingCard,
            currentCardId: globalCards.currentCardId
        };

        // storedCards всегда должны быть глобальными, не tab-specific
        const storedCards = globalCards.storedCards;
        const fieldIdPrefix = tabState?.fieldIdPrefix || `fallback_${Date.now()}_`;
        
        // currentPage - tab-specific, но с fallback на глобальный
        const globalCurrentPage = useSelector((state: RootState) => state.currentPage);
        const currentPage = tabState?.currentPage || globalCurrentPage;

        return {
            // Card data
            text: cardData.text,
            translation: cardData.translation,
            examples: cardData.examples,
            image: cardData.image,
            imageUrl: cardData.imageUrl,
            front: cardData.front,
            back: cardData.back,
            linguisticInfo: cardData.linguisticInfo,
            transcription: cardData.transcription,
            isGeneratingCard: cardData.isGeneratingCard,
            currentCardId: cardData.currentCardId,
            storedCards,
            fieldIdPrefix,
            currentPage,
            
            // Action dispatchers - prefer tab-specific if available
            setText: (text: string) => {
                if (tabState) {
                    dispatch(setTabText(tabId, text));
                } else {
                    dispatch(setText(text));
                }
            },
            setTranslation: (translation: string) => {
                if (tabState) {
                    dispatch(setTabTranslation(tabId, translation));
                } else {
                    dispatch(setTranslation(translation));
                }
            },
            setExamples: (examples: Array<[string, string | null]>) => {
                if (tabState) {
                    dispatch(setTabExamples(tabId, examples));
                } else {
                    dispatch(setExamples(examples));
                }
            },
            setImage: (image: string | null) => {
                if (tabState) {
                    dispatch(setTabImage(tabId, image));
                } else {
                    dispatch(setImage(image));
                }
            },
            setImageUrl: (imageUrl: string | null) => {
                if (tabState) {
                    dispatch(setTabImageUrl(tabId, imageUrl));
                } else {
                    dispatch(setImageUrl(imageUrl));
                }
            },
            setFront: (front: string) => {
                if (tabState) {
                    dispatch(setTabFront(tabId, front));
                } else {
                    dispatch(setFront(front));
                }
            },
            setBack: (back: string | null) => {
                if (tabState) {
                    dispatch(setTabBack(tabId, back));
                } else {
                    dispatch(setBack(back));
                }
            },
            setLinguisticInfo: (linguisticInfo: string) => {
                if (tabState) {
                    dispatch(setTabLinguisticInfo(tabId, linguisticInfo));
                } else {
                    dispatch(setLinguisticInfo(linguisticInfo));
                }
            },
            setTranscription: (transcription: string) => {
                if (tabState) {
                    dispatch(setTabTranscription(tabId, transcription));
                } else {
                    dispatch(setTranscription(transcription));
                }
            },
            setIsGeneratingCard: (isGenerating: boolean) => {
                if (tabState) {
                    dispatch(setTabIsGeneratingCard(tabId, isGenerating));
                } else {
                    dispatch(setIsGeneratingCard(isGenerating));
                }
            },
            setCurrentCardId: (cardId: string | null) => {
                if (tabState) {
                    dispatch(setTabCurrentCardId(tabId, cardId));
                } else {
                    dispatch(setCurrentCardId(cardId));
                }
            },
            // Операции с сохраненными карточками всегда идут в глобальное хранилище
            saveCardToStorage: (card: any) => {
                dispatch(saveCardToStorage(card));
            },
            updateStoredCard: (card: StoredCard) => {
                dispatch(updateStoredCard(card));
            },
            deleteStoredCard: (cardId: string) => {
                dispatch(deleteStoredCard(cardId));
            },
            updateCardExportStatus: (cardId: string, status: any) => {
                dispatch(updateCardExportStatus(cardId, status));
            },
            setCurrentPage: (page: string) => {
                if (tabState) {
                    dispatch(setTabCurrentPage(tabId, page));
                } else {
                    // Fallback to global if no tab state
                    dispatch(setCurrentPage(page));
                }
            },
            updateCard: (updates: Partial<{
                text: string;
                translation: string;
                examples: Array<[string, string | null]>;
                image: string | null;
                imageUrl: string | null;
                front: string;
                back: string | null;
                linguisticInfo: string;
                transcription: string;
                isGeneratingCard: boolean;
                currentCardId: string | null;
            }>) => {
                // Update only provided fields
                Object.keys(updates).forEach(key => {
                    const value = updates[key as keyof typeof updates];
                    if (value !== undefined) {
                        switch (key) {
                            case 'text':
                                if (tabState) dispatch(setTabText(tabId, value as string));
                                else dispatch(setText(value as string));
                                break;
                            case 'translation':
                                if (tabState) dispatch(setTabTranslation(tabId, value as string));
                                else dispatch(setTranslation(value as string));
                                break;
                            case 'examples':
                                if (tabState) dispatch(setTabExamples(tabId, value as Array<[string, string | null]>));
                                else dispatch(setExamples(value as Array<[string, string | null]>));
                                break;
                            case 'image':
                                if (tabState) dispatch(setTabImage(tabId, value as string | null));
                                else dispatch(setImage(value as string | null));
                                break;
                            case 'imageUrl':
                                if (tabState) dispatch(setTabImageUrl(tabId, value as string | null));
                                else dispatch(setImageUrl(value as string | null));
                                break;
                            case 'front':
                                if (tabState) dispatch(setTabFront(tabId, value as string));
                                else dispatch(setFront(value as string));
                                break;
                            case 'back':
                                if (tabState) dispatch(setTabBack(tabId, value as string | null));
                                else dispatch(setBack(value as string | null));
                                break;
                            case 'linguisticInfo':
                                if (tabState) dispatch(setTabLinguisticInfo(tabId, value as string));
                                else dispatch(setLinguisticInfo(value as string));
                                break;
                            case 'transcription':
                                if (tabState) dispatch(setTabTranscription(tabId, value as string));
                                else dispatch(setTranscription(value as string));
                                break;
                            case 'isGeneratingCard':
                                if (tabState) dispatch(setTabIsGeneratingCard(tabId, value as boolean));
                                else dispatch(setIsGeneratingCard(value as boolean));
                                break;
                            case 'currentCardId':
                                if (tabState) dispatch(setTabCurrentCardId(tabId, value as string | null));
                                else dispatch(setCurrentCardId(value as string | null));
                                break;
                        }
                    }
                });
            }
        };
    }, [tabState, globalCards, tabId, dispatch]);

    return (
        <TabAwareContext.Provider value={contextValue}>
            {children}
        </TabAwareContext.Provider>
    );
};

export const useTabAware = (): TabAwareContextType => {
    const context = useContext(TabAwareContext);
    if (!context) {
        throw new Error('useTabAware must be used within a TabAwareProvider');
    }
    return context;
}; 