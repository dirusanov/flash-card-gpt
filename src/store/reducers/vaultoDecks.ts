export interface VaultoDeck {
    /** Stable, local identity — this is what `StoredCard.deckId` points at.
     *  For a deck that originates on the server (fetched or created while online) this
     *  equals `syncId`. Only a deck created while signed out/offline mints a fresh local
     *  id here that differs from `syncId` until the deck is pushed. */
    id: string;
    /** Server-side deck id once this deck has reached Vaulto Cloud. Null until then. */
    syncId: string | null;
    syncVersion: number | null;
    /** True until the deck has been created (or its last edit pushed) on the server. */
    syncPending: boolean;
    name: string;
    createdAt: string;
    updatedAt: string;
}

interface VaultoDecksState {
    decks: VaultoDeck[];
}

const initialState: VaultoDecksState = {
    decks: [],
};

export const SET_VAULTO_DECKS = 'SET_VAULTO_DECKS';
export const UPSERT_VAULTO_DECK = 'UPSERT_VAULTO_DECK';
export const DELETE_VAULTO_DECK = 'DELETE_VAULTO_DECK';

const vaultoDecksReducer = (state = initialState, action: any): VaultoDecksState => {
    switch (action.type) {
        case SET_VAULTO_DECKS:
            return { decks: action.payload };

        case UPSERT_VAULTO_DECK: {
            const deck = action.payload as VaultoDeck;
            const exists = state.decks.some((d) => d.id === deck.id);
            return {
                decks: exists
                    ? state.decks.map((d) => (d.id === deck.id ? deck : d))
                    : [...state.decks, deck],
            };
        }

        case DELETE_VAULTO_DECK:
            return {
                decks: state.decks.filter((d) => d.id !== action.payload),
            };

        default:
            return state;
    }
};

export default vaultoDecksReducer;
