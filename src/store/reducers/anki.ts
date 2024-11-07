import { SET_ANKI_AVAILABILITY } from '../actions/anki';

interface AnkiState {
  isAnkiAvailable: boolean;
}

const initialState: AnkiState = {
  isAnkiAvailable: false,
};

const ankiReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case SET_ANKI_AVAILABILITY:
      return {
        ...state,
        isAnkiAvailable: action.payload,
      };
    default:
      return state;
  }
};

export default ankiReducer;
