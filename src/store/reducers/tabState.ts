import {
    SET_CURRENT_TAB_ID,
    SET_TAB_CARD_FIELD,
    CLEAR_TAB_CARD_DATA,
    SAVE_TAB_CARD,
    DELETE_TAB_CARD,
    SET_TAB_STORED_CARDS,
    UPDATE_TAB_CARD_EXPORT_STATUS,
    UPDATE_TAB_STORED_CARD,
    SET_TAB_CURRENT_PAGE
} from '../actions/tabState';
import { ExportStatus, StoredCard } from './cards';
// Listen to global card actions so we can mirror them into the current tab's state
import {
    SET_TEXT,
    SET_TRANSLATION,
    SET_EXAMPLES,
    SET_IMAGE,
    SET_IMAGE_URL,
    SET_FRONT,
    SET_BACK,
    SET_LINGUISTIC_INFO,
    SET_TRANSCRIPTION,
    SET_IS_GENERATING_CARD,
    SET_CURRENT_CARD_ID as SET_GLOBAL_CURRENT_CARD_ID,
} from '../actions/cards';
import { Modes } from '../../constants';

export interface TabCardData {
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
}

export interface TabSpecificState {
    cardData: TabCardData;
    storedCards: StoredCard[];
    fieldIdPrefix: string; // Уникальный префикс для ID полей этой вкладки
    currentPage: string; // Текущая страница интерфейса для этой вкладки
}

export interface TabStateState {
    currentTabId: number | null;
    tabStates: { [tabId: number]: TabSpecificState };
}

const createDefaultTabCardData = (): TabCardData => ({
    text: "",
    translation: "",
    examples: [],
    image: null,
    imageUrl: null,
    front: "",
    back: null,
    linguisticInfo: "",
    transcription: "",
    isGeneratingCard: false,
    currentCardId: null
});

const createDefaultTabState = (tabId: number): TabSpecificState => ({
    cardData: createDefaultTabCardData(),
    storedCards: [],
    fieldIdPrefix: `tab_${tabId}_${Date.now()}_`, // Уникальный префикс для полей этой вкладки
    currentPage: 'createCard' // По умолчанию показываем создание карточек
});

const initialState: TabStateState = {
    currentTabId: null,
    tabStates: {}
};

const tabStateReducer = (state = initialState, action: any): TabStateState => {
    const newState = { ...state };

    switch (action.type) {
        case SET_CURRENT_TAB_ID:
            const tabId = action.payload;
            newState.currentTabId = tabId;
            
            // Создаем состояние для новой вкладки если его еще нет
            if (tabId && !newState.tabStates[tabId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tabId]: createDefaultTabState(tabId)
                };
            }
            break;

        case SET_TAB_CARD_FIELD:
            const { tabId: fieldTabId, field, value } = action.payload;
            if (fieldTabId && newState.tabStates[fieldTabId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [fieldTabId]: {
                        ...newState.tabStates[fieldTabId],
                        cardData: {
                            ...newState.tabStates[fieldTabId].cardData,
                            [field]: value
                        }
                    }
                };
            }
            break;

        case CLEAR_TAB_CARD_DATA:
            const { tabId: clearTabId } = action.payload;
            if (clearTabId && newState.tabStates[clearTabId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [clearTabId]: {
                        ...newState.tabStates[clearTabId],
                        cardData: createDefaultTabCardData()
                    }
                };
            }
            break;

        case SAVE_TAB_CARD:
            const { tabId: saveTabId, card } = action.payload;
            if (saveTabId && newState.tabStates[saveTabId]) {
                const tabState = newState.tabStates[saveTabId];
                const cardWithId = {
                    ...card,
                    id: card.id || `${tabState.fieldIdPrefix}${Date.now()}`,
                    createdAt: card.createdAt || new Date()
                };

                const existingCardIndex = tabState.storedCards.findIndex(c => c.text === cardWithId.text);
                
                let updatedStoredCards;
                if (existingCardIndex >= 0) {
                    updatedStoredCards = [...tabState.storedCards];
                    updatedStoredCards[existingCardIndex] = { ...cardWithId, id: tabState.storedCards[existingCardIndex].id };
                } else {
                    updatedStoredCards = [...tabState.storedCards, cardWithId];
                }

                newState.tabStates = {
                    ...newState.tabStates,
                    [saveTabId]: {
                        ...tabState,
                        storedCards: updatedStoredCards
                    }
                };
            }
            break;

        case DELETE_TAB_CARD:
            const { tabId: deleteTabId, cardId } = action.payload;
            if (deleteTabId && newState.tabStates[deleteTabId]) {
                const tabState = newState.tabStates[deleteTabId];
                newState.tabStates = {
                    ...newState.tabStates,
                    [deleteTabId]: {
                        ...tabState,
                        storedCards: tabState.storedCards.filter(card => card.id !== cardId)
                    }
                };
            }
            break;

        case SET_TAB_STORED_CARDS:
            const { tabId: setTabId, cards } = action.payload;
            if (setTabId && newState.tabStates[setTabId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [setTabId]: {
                        ...newState.tabStates[setTabId],
                        storedCards: cards
                    }
                };
            }
            break;

        case UPDATE_TAB_CARD_EXPORT_STATUS:
            const { tabId: updateTabId, cardId: updateCardId, status } = action.payload;
            if (updateTabId && newState.tabStates[updateTabId]) {
                const tabState = newState.tabStates[updateTabId];
                newState.tabStates = {
                    ...newState.tabStates,
                    [updateTabId]: {
                        ...tabState,
                        storedCards: tabState.storedCards.map(card =>
                            card.id === updateCardId ? { ...card, exportStatus: status } : card
                        )
                    }
                };
            }
            break;

        case UPDATE_TAB_STORED_CARD:
            const { tabId: updateStoredTabId, card: updatedCard } = action.payload;
            if (updateStoredTabId && newState.tabStates[updateStoredTabId] && updatedCard.id) {
                const tabState = newState.tabStates[updateStoredTabId];
                const cardExists = tabState.storedCards.some(card => card.id === updatedCard.id);

                let updatedStoredCards;
                if (cardExists) {
                    updatedStoredCards = tabState.storedCards.map(card =>
                        card.id === updatedCard.id ? { ...updatedCard } : card
                    );
                } else {
                    updatedStoredCards = [...tabState.storedCards, updatedCard];
                }

                newState.tabStates = {
                    ...newState.tabStates,
                    [updateStoredTabId]: {
                        ...tabState,
                        storedCards: updatedStoredCards
                    }
                };
            }
            break;

        case SET_TAB_CURRENT_PAGE:
            const { tabId: pageTabId, currentPage } = action.payload;
            if (pageTabId && newState.tabStates[pageTabId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [pageTabId]: {
                        ...newState.tabStates[pageTabId],
                        currentPage
                    }
                };
            }
            break;

        // Mirror global card state changes into the current tab's cardData
        case SET_TEXT: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            text: action.payload,
                        },
                    },
                };
            }
            break;
        }
        case SET_TRANSLATION: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            translation: action.payload,
                        },
                    },
                };
            }
            break;
        }
        case SET_EXAMPLES: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            examples: action.payload,
                        },
                    },
                };
            }
            break;
        }
        case SET_IMAGE: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            image: action.payload ?? null,
                        },
                    },
                };
            }
            break;
        }
        case SET_IMAGE_URL: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            imageUrl: action.payload ?? null,
                        },
                    },
                };
            }
            break;
        }
        case SET_FRONT: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            front: action.payload,
                        },
                    },
                };
            }
            break;
        }
        case SET_BACK: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            back: action.payload,
                        },
                    },
                };
            }
            break;
        }
        case SET_LINGUISTIC_INFO: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            linguisticInfo: action.payload,
                        },
                    },
                };
            }
            break;
        }
        case SET_TRANSCRIPTION: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            transcription: action.payload,
                        },
                    },
                };
            }
            break;
        }
        case SET_IS_GENERATING_CARD: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            isGeneratingCard: action.payload,
                        },
                    },
                };
            }
            break;
        }
        case SET_GLOBAL_CURRENT_CARD_ID: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...newState.tabStates[tId],
                        cardData: {
                            ...newState.tabStates[tId].cardData,
                            currentCardId: action.payload,
                        },
                    },
                };
            }
            break;
        }

        default:
            break;
    }

    return newState;
};

export default tabStateReducer; 
