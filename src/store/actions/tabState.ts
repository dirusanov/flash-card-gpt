import { Dispatch } from 'redux';
import { StoredCard, ExportStatus } from '../reducers/cards';
import { Modes } from '../../constants';

export const SET_CURRENT_TAB_ID = 'SET_CURRENT_TAB_ID';
export const SET_TAB_CARD_FIELD = 'SET_TAB_CARD_FIELD';
export const CLEAR_TAB_CARD_DATA = 'CLEAR_TAB_CARD_DATA';
export const SAVE_TAB_CARD = 'SAVE_TAB_CARD';
export const DELETE_TAB_CARD = 'DELETE_TAB_CARD';
export const SET_TAB_STORED_CARDS = 'SET_TAB_STORED_CARDS';
export const UPDATE_TAB_CARD_EXPORT_STATUS = 'UPDATE_TAB_CARD_EXPORT_STATUS';
export const UPDATE_TAB_STORED_CARD = 'UPDATE_TAB_STORED_CARD';
export const SET_TAB_CURRENT_PAGE = 'SET_TAB_CURRENT_PAGE';

// Действие для установки текущего ID вкладки
export const setCurrentTabId = (tabId: number | null) => ({
    type: SET_CURRENT_TAB_ID,
    payload: tabId,
});

// Действие для установки поля карточки в конкретной вкладке
export const setTabCardField = (tabId: number, field: string, value: any) => ({
    type: SET_TAB_CARD_FIELD,
    payload: { tabId, field, value },
});

// Действие для очистки данных карточки в конкретной вкладке
export const clearTabCardData = (tabId: number) => ({
    type: CLEAR_TAB_CARD_DATA,
    payload: { tabId },
});

// Действие для сохранения карточки в конкретной вкладке
export const saveTabCard = (
    tabId: number,
    card: {
        mode: Modes;
        front?: string;
        back?: string | null;
        text: string;
        translation?: string | null;
        examples?: Array<[string, string | null]>;
        image?: string | null;
        imageUrl?: string | null;
        createdAt?: Date;
        linguisticInfo?: string;
        transcription?: string;
    }
) => {
    console.log(`*** ACTION: saveTabCard called for tab ${tabId} ***`);
    console.log('Card data:', {
        hasImage: !!card.image,
        hasImageUrl: !!card.imageUrl,
        imageLength: card.image?.length,
        imageUrlLength: card.imageUrl?.length,
    });
    
    return {
        type: SAVE_TAB_CARD,
        payload: { tabId, card },
    };
};

// Действие для удаления карточки из конкретной вкладки
export const deleteTabCard = (tabId: number, cardId: string) => ({
    type: DELETE_TAB_CARD,
    payload: { tabId, cardId },
});

// Действие для установки всех сохраненных карточек в конкретной вкладке
export const setTabStoredCards = (tabId: number, cards: StoredCard[]) => ({
    type: SET_TAB_STORED_CARDS,
    payload: { tabId, cards },
});

// Действие для обновления статуса экспорта карточки в конкретной вкладке
export const updateTabCardExportStatus = (tabId: number, cardId: string, status: ExportStatus) => ({
    type: UPDATE_TAB_CARD_EXPORT_STATUS,
    payload: { tabId, cardId, status },
});

// Действие для обновления сохраненной карточки в конкретной вкладке
export const updateTabStoredCard = (tabId: number, card: StoredCard) => {
    console.log(`*** ACTION: updateTabStoredCard called for tab ${tabId} ***`);
    console.log('Updated card data:', {
        cardId: card.id,
        hasImage: !!card.image,
        hasImageUrl: !!card.imageUrl,
        imageLength: card.image?.length,
        imageUrlLength: card.imageUrl?.length,
    });
    
    return {
        type: UPDATE_TAB_STORED_CARD,
        payload: { tabId, card },
    };
};

// Удобные action creators для установки конкретных полей карточки
export const setTabText = (tabId: number, text: string) => 
    setTabCardField(tabId, 'text', text);

export const setTabTranslation = (tabId: number, translation: string) => 
    setTabCardField(tabId, 'translation', translation);

export const setTabExamples = (tabId: number, examples: Array<[string, string | null]>) => 
    setTabCardField(tabId, 'examples', examples);

export const setTabImage = (tabId: number, image: string | null) => 
    setTabCardField(tabId, 'image', image);

export const setTabImageUrl = (tabId: number, imageUrl: string | null) => 
    setTabCardField(tabId, 'imageUrl', imageUrl);

export const setTabFront = (tabId: number, front: string) => 
    setTabCardField(tabId, 'front', front);

export const setTabBack = (tabId: number, back: string | null) => 
    setTabCardField(tabId, 'back', back);

export const setTabLinguisticInfo = (tabId: number, linguisticInfo: string) => 
    setTabCardField(tabId, 'linguisticInfo', linguisticInfo);

export const setTabTranscription = (tabId: number, transcription: string) => 
    setTabCardField(tabId, 'transcription', transcription);

export const setTabIsGeneratingCard = (tabId: number, isGenerating: boolean) => 
    setTabCardField(tabId, 'isGeneratingCard', isGenerating);

export const setTabCurrentCardId = (tabId: number, cardId: string | null) => 
    setTabCardField(tabId, 'currentCardId', cardId);

// Действие для установки текущей страницы в конкретной вкладке
export const setTabCurrentPage = (tabId: number, currentPage: string) => ({
    type: SET_TAB_CURRENT_PAGE,
    payload: { tabId, currentPage },
}); 