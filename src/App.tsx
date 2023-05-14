import React from 'react';

import CreateCard from './components/CreateCard/CreateCard';
import Settings from "./components/Settings";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "./store";
import {setCurrentPage} from "./store/actions/page";

function App() {
    const currentPage = useSelector((state: RootState) => state.currentPage);
    const dispatch = useDispatch();

    const handlePageChange = (page: string) => {
        dispatch(setCurrentPage(page));
    };
    return (
        <div className="App">
            <div className="App">
                <header className="App-header">
                    {!currentPage && <CreateCard onSettingsClick={() => handlePageChange('settings')} />}
                    {currentPage === 'settings' && <Settings onBackClick={() => handlePageChange('')} />}
                </header>
            </div>
        </div>
    );
}

export default App;
