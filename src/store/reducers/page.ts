import {SET_CURRENT_PAGE} from "../actions/page";

const currentPageReducer = (state = 'createCard', action: any) => {
    switch (action.type) {
        case SET_CURRENT_PAGE:
            return action.currentPage;
        default:
            return state;
    }
};

export default currentPageReducer;
