import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useSelector, useDispatch, shallowEqual, batch } from 'react-redux';
import { RootState } from '../store';
import { 
    setTabText, 
    setTabTranslation, 
    setTabExamples, 
    setTabImage, 
    setTabImageUrl, 
    setTabWordAudio,
    setTabFront, 
    setTabBack, 
    setTabLinguisticInfo, 
    setTabTranscription, 
    setTabIsGeneratingCard, 
    setTabCurrentCardId,
    setTabCurrentPage,
} from '../store/actions/tabState';
import { 
    setText, 
    setTranslation, 
    setExamples, 
    setImage, 
    setImageUrl, 
    setWordAudio,
    setFront, 
    setBack, 
    setLinguisticInfo, 
    setTranscription, 
    setIsGeneratingCard, 
    setCurrentCardId,
    saveCardToStorage,
    updateStoredCard,
    deleteStoredCard,
    updateCardExportStatus,
} from '../store/actions/cards';
import { setCurrentPage } from '../store/actions/page';
import { StoredCard } from '../store/reducers/cards';

interface TabAwareContextType {
    // Tab identity
    tabId: number;
    // Card data
    text: string;
    translation: string;
    examples: Array<[string, string | null]>;
    image: string | null;
    imageUrl: string | null;
    wordAudio: string | null;
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
    setWordAudio: (wordAudio: string | null) => void;
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
        wordAudio: string | null;
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
    const tabState = useSelector(
        (state: RootState) => state.tabState.tabStates[tabId],
        shallowEqual
    );

    // Read global card data once and memoise shallow fields to avoid needless rerenders
    const globalCardData = useSelector(
        (state: RootState) => ({
            text: state.cards.text,
            translation: state.cards.translation,
            examples: state.cards.examples,
            image: state.cards.image,
            imageUrl: state.cards.imageUrl,
            wordAudio: state.cards.wordAudio,
            front: state.cards.front,
            back: state.cards.back,
            linguisticInfo: state.cards.linguisticInfo,
            transcription: state.cards.transcription,
            isGeneratingCard: state.cards.isGeneratingCard,
            currentCardId: state.cards.currentCardId,
        }),
        shallowEqual
    );

    const storedCards = useSelector((state: RootState) => state.cards.storedCards, shallowEqual);
    const globalCurrentPage = useSelector((state: RootState) => state.currentPage);

    const fallbackFieldIdPrefixRef = useRef(`fallback_${tabId}_${Date.now()}_`);

    // Create context value
    const contextValue: TabAwareContextType = useMemo(() => {
        // Use tab-specific data if available, otherwise fallback to global
        const cardData = tabState?.cardData || {
            text: globalCardData.text,
            translation: globalCardData.translation,
            examples: globalCardData.examples,
            image: globalCardData.image,
            imageUrl: globalCardData.imageUrl,
            wordAudio: globalCardData.wordAudio,
            front: globalCardData.front,
            back: globalCardData.back,
            linguisticInfo: globalCardData.linguisticInfo,
            transcription: globalCardData.transcription,
            isGeneratingCard: globalCardData.isGeneratingCard,
            currentCardId: globalCardData.currentCardId,
        };

        const fieldIdPrefix = tabState?.fieldIdPrefix || fallbackFieldIdPrefixRef.current;

        // currentPage - tab-specific, но с fallback на глобальный
        const currentPage = tabState?.currentPage || globalCurrentPage;

        const isSameValue = (field: keyof typeof cardData, nextValue: unknown) => {
            return cardData[field] === nextValue;
        };

        return {
            tabId,
            // Card data
            text: cardData.text,
            translation: cardData.translation,
            examples: cardData.examples,
            image: cardData.image,
            imageUrl: cardData.imageUrl,
            wordAudio: cardData.wordAudio,
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
                if (isSameValue('text', text)) return;
                if (tabState) {
                    dispatch(setTabText(tabId, text));
                } else {
                    dispatch(setText(text));
                }
            },
            setTranslation: (translation: string) => {
                if (isSameValue('translation', translation)) return;
                if (tabState) {
                    dispatch(setTabTranslation(tabId, translation));
                } else {
                    dispatch(setTranslation(translation));
                }
            },
            setExamples: (examples: Array<[string, string | null]>) => {
                if (isSameValue('examples', examples)) return;
                if (tabState) {
                    dispatch(setTabExamples(tabId, examples));
                } else {
                    dispatch(setExamples(examples));
                }
            },
            setImage: (image: string | null) => {
                if (isSameValue('image', image)) return;
                if (tabState) {
                    dispatch(setTabImage(tabId, image));
                } else {
                    dispatch(setImage(image));
                }
            },
            setImageUrl: (imageUrl: string | null) => {
                if (isSameValue('imageUrl', imageUrl)) return;
                if (tabState) {
                    dispatch(setTabImageUrl(tabId, imageUrl));
                } else {
                    dispatch(setImageUrl(imageUrl));
                }
            },
            setWordAudio: (wordAudio: string | null) => {
                if (isSameValue('wordAudio', wordAudio)) return;
                if (tabState) {
                    dispatch(setTabWordAudio(tabId, wordAudio));
                } else {
                    dispatch(setWordAudio(wordAudio));
                }
            },
            setFront: (front: string) => {
                if (isSameValue('front', front)) return;
                if (tabState) {
                    dispatch(setTabFront(tabId, front));
                } else {
                    dispatch(setFront(front));
                }
            },
            setBack: (back: string | null) => {
                if (isSameValue('back', back)) return;
                if (tabState) {
                    dispatch(setTabBack(tabId, back));
                } else {
                    dispatch(setBack(back));
                }
            },
            setLinguisticInfo: (linguisticInfo: string) => {
                if (isSameValue('linguisticInfo', linguisticInfo)) return;
                if (tabState) {
                    dispatch(setTabLinguisticInfo(tabId, linguisticInfo));
                } else {
                    dispatch(setLinguisticInfo(linguisticInfo));
                }
            },
            setTranscription: (transcription: string) => {
                if (isSameValue('transcription', transcription)) return;
                if (tabState) {
                    dispatch(setTabTranscription(tabId, transcription));
                } else {
                    dispatch(setTranscription(transcription));
                }
            },
            setIsGeneratingCard: (isGenerating: boolean) => {
                if (isSameValue('isGeneratingCard', isGenerating)) return;
                if (tabState) {
                    dispatch(setTabIsGeneratingCard(tabId, isGenerating));
                } else {
                    dispatch(setIsGeneratingCard(isGenerating));
                }
            },
            setCurrentCardId: (cardId: string | null) => {
                if (isSameValue('currentCardId', cardId)) return;
                if (tabState) {
                    dispatch(setTabCurrentCardId(tabId, cardId));
                } else {
                    dispatch(setCurrentCardId(cardId));
                }
            },
            // Saved cards are global and shared between tabs.
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
                wordAudio: string | null;
                front: string;
                back: string | null;
                linguisticInfo: string;
                transcription: string;
                isGeneratingCard: boolean;
                currentCardId: string | null;
            }>) => {
                // Batch updates to avoid many intermediate renders on restore/open flows.
                batch(() => {
                    Object.keys(updates).forEach(key => {
                        const value = updates[key as keyof typeof updates];
                        if (value !== undefined) {
                            switch (key) {
                                case 'text':
                                    if (isSameValue('text', value)) break;
                                    if (tabState) dispatch(setTabText(tabId, value as string));
                                    else dispatch(setText(value as string));
                                    break;
                                case 'translation':
                                    if (isSameValue('translation', value)) break;
                                    if (tabState) dispatch(setTabTranslation(tabId, value as string));
                                    else dispatch(setTranslation(value as string));
                                    break;
                                case 'examples':
                                    if (isSameValue('examples', value)) break;
                                    if (tabState) dispatch(setTabExamples(tabId, value as Array<[string, string | null]>));
                                    else dispatch(setExamples(value as Array<[string, string | null]>));
                                    break;
                                case 'image':
                                    if (isSameValue('image', value)) break;
                                    if (tabState) dispatch(setTabImage(tabId, value as string | null));
                                    else dispatch(setImage(value as string | null));
                                    break;
                                case 'imageUrl':
                                    if (isSameValue('imageUrl', value)) break;
                                    if (tabState) dispatch(setTabImageUrl(tabId, value as string | null));
                                    else dispatch(setImageUrl(value as string | null));
                                    break;
                                case 'wordAudio':
                                    if (isSameValue('wordAudio', value)) break;
                                    if (tabState) dispatch(setTabWordAudio(tabId, value as string | null));
                                    else dispatch(setWordAudio(value as string | null));
                                    break;
                                case 'front':
                                    if (isSameValue('front', value)) break;
                                    if (tabState) dispatch(setTabFront(tabId, value as string));
                                    else dispatch(setFront(value as string));
                                    break;
                                case 'back':
                                    if (isSameValue('back', value)) break;
                                    if (tabState) dispatch(setTabBack(tabId, value as string | null));
                                    else dispatch(setBack(value as string | null));
                                    break;
                                case 'linguisticInfo':
                                    if (isSameValue('linguisticInfo', value)) break;
                                    if (tabState) dispatch(setTabLinguisticInfo(tabId, value as string));
                                    else dispatch(setLinguisticInfo(value as string));
                                    break;
                                case 'transcription':
                                    if (isSameValue('transcription', value)) break;
                                    if (tabState) dispatch(setTabTranscription(tabId, value as string));
                                    else dispatch(setTranscription(value as string));
                                    break;
                                case 'isGeneratingCard':
                                    if (isSameValue('isGeneratingCard', value)) break;
                                    if (tabState) dispatch(setTabIsGeneratingCard(tabId, value as boolean));
                                    else dispatch(setIsGeneratingCard(value as boolean));
                                    break;
                                case 'currentCardId':
                                    if (isSameValue('currentCardId', value)) break;
                                    if (tabState) dispatch(setTabCurrentCardId(tabId, value as string | null));
                                    else dispatch(setCurrentCardId(value as string | null));
                                    break;
                            }
                        }
                    });
                });
            }
        };
    }, [tabState, globalCardData, storedCards, tabId, dispatch, globalCurrentPage]);

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
