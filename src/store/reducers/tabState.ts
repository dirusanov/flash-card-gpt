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
import { StoredCard } from './cards';
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
    SAVE_CARD_TO_STORAGE as GLOBAL_SAVE_CARD_TO_STORAGE,
    UPDATE_STORED_CARD as GLOBAL_UPDATE_STORED_CARD,
    DELETE_STORED_CARD as GLOBAL_DELETE_STORED_CARD,
    UPDATE_CARD_EXPORT_STATUS as GLOBAL_UPDATE_CARD_EXPORT_STATUS,
} from '../actions/cards';

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
    lastSavedCard?: StoredCard | null; // Последняя явно сохраненная карточка на этой вкладке
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
    currentPage: 'createCard', // По умолчанию показываем создание карточек
    lastSavedCard: null,
});

const ensureDate = (value: StoredCard['createdAt'] | string | number | undefined): Date => {
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    return new Date();
};

const normalizeStoredCard = (card: StoredCard): StoredCard => ({
    ...card,
    createdAt: ensureDate(card.createdAt),
    examples: Array.isArray(card.examples) ? card.examples : [],
    image: card.image ?? null,
    imageUrl: card.imageUrl ?? null,
    translation: card.translation ?? null,
    front: card.front ?? card.text,
    back: card.back ?? null,
    linguisticInfo: card.linguisticInfo ?? '',
    transcription: card.transcription ?? '',
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
                const normalizedCard = normalizeStoredCard(cardWithId as StoredCard);

                const existingCardIndex = tabState.storedCards.findIndex(c => c.id === normalizedCard.id);
                
                let updatedStoredCards;
                if (existingCardIndex >= 0) {
                    updatedStoredCards = [...tabState.storedCards];
                    updatedStoredCards[existingCardIndex] = normalizeStoredCard({
                        ...normalizedCard,
                        id: tabState.storedCards[existingCardIndex].id,
                    } as StoredCard);
                } else {
                    updatedStoredCards = [...tabState.storedCards, normalizedCard];
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
                        storedCards: cards.map(normalizeStoredCard)
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
                        card.id === updatedCard.id ? normalizeStoredCard({ ...updatedCard }) : card
                    );
                } else {
                    updatedStoredCards = [...tabState.storedCards, normalizeStoredCard(updatedCard)];
                }

                newState.tabStates = {
                    ...newState.tabStates,
                    [updateStoredTabId]: {
                        ...tabState,
                        storedCards: updatedStoredCards,
                        lastSavedCard: updatedCard
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

        // Обновляем lastSavedCard для текущей вкладки на глобальные события сохранения
        case GLOBAL_SAVE_CARD_TO_STORAGE: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                const tabState = newState.tabStates[tId];
                const normalizedCard = normalizeStoredCard({
                    ...(action.payload || {}),
                    id: action.payload?.id || `${tabState.fieldIdPrefix}${Date.now()}`,
                    createdAt: action.payload?.createdAt || new Date(),
                });
                const nextStoredCards = (() => {
                    const idx = tabState.storedCards.findIndex((card) => card.id === normalizedCard.id);
                    if (idx === -1) return [...tabState.storedCards, normalizedCard];
                    return tabState.storedCards.map((card, i) => (i === idx ? normalizedCard : card));
                })();
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...tabState,
                        storedCards: nextStoredCards,
                        lastSavedCard: normalizedCard,
                    },
                };
            }
            break;
        }
        case GLOBAL_UPDATE_STORED_CARD: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                const tabState = newState.tabStates[tId];
                const normalizedCard = normalizeStoredCard(action.payload);
                const nextStoredCards = (() => {
                    const idx = tabState.storedCards.findIndex((card) => card.id === normalizedCard.id);
                    if (idx === -1) return [...tabState.storedCards, normalizedCard];
                    return tabState.storedCards.map((card, i) => (i === idx ? normalizedCard : card));
                })();
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...tabState,
                        storedCards: nextStoredCards,
                        lastSavedCard: normalizedCard,
                    },
                };
            }
            break;
        }
        case GLOBAL_DELETE_STORED_CARD: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                const tabState = newState.tabStates[tId];
                const nextStoredCards = tabState.storedCards.filter((card) => card.id !== action.payload);
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...tabState,
                        storedCards: nextStoredCards,
                    },
                };
            }
            break;
        }
        case GLOBAL_UPDATE_CARD_EXPORT_STATUS: {
            const tId = newState.currentTabId;
            if (tId && newState.tabStates[tId]) {
                const tabState = newState.tabStates[tId];
                const nextStoredCards = tabState.storedCards.map((card) => (
                    card.id === action.payload.cardId
                        ? { ...card, exportStatus: action.payload.status }
                        : card
                ));
                newState.tabStates = {
                    ...newState.tabStates,
                    [tId]: {
                        ...tabState,
                        storedCards: nextStoredCards,
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
