import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./store";
import { setCurrentPage } from "./store/actions/page";
import CreateCard from './components/CreateCard';
import Settings from "./components/Settings";
import { FiChevronRight, FiChevronLeft } from 'react-icons/fi';
import { instantiateStore } from './store';
import { setVisibleSideBar } from './store/actions/settings';
import { ExtendedStore } from 'reduxed-chrome-storage';

function App() {
    const [store, setStore] = useState<ExtendedStore | null>(null);
    const currentPage = useSelector((state: RootState) => state.currentPage);
    const visibleSideBar = useSelector((state: RootState) => state.settings.visibleSideBar);
    const dispatch = useDispatch();

    useEffect(() => {
        instantiateStore()
          .then((resolvedStore) => {
            setStore(resolvedStore);
          })
          .catch((error) => {
            console.error('Error loading state from Chrome storage:', error);
          });
      }, []);
    
    
    if (!store) {
        return null;  // or some loading state
    }

    const handlePageChange = (page: string) => {
        dispatch(setCurrentPage(page));
    };

    const toggleVisibility = () => dispatch(setVisibleSideBar(!visibleSideBar));

    return (
        <div className="App" style={{backgroundColor: 'white', height: '100%', display: 'flex', flexDirection: 'row', position: 'absolute', right: 0, top: 0, width: visibleSideBar ? '350px' : '20px' }}>
            <div style={{ flex: '1 1 auto', overflow: 'scroll', display: visibleSideBar ? 'block' : 'none' }}>
                <header className="App-header">
                    {!currentPage && <CreateCard onSettingsClick={() => handlePageChange('settings')} />}
                    {currentPage === 'settings' && <Settings onBackClick={() => handlePageChange('')} popup={false} />}
                </header>
            </div>
            <div onClick={toggleVisibility} style={{ width: '20px', height: '100%', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderLeft: '1px solid #777', borderRight: '1px solid #777', zIndex: 10000 }}>
                {visibleSideBar ? <FiChevronRight size={20} color="black" /> : <FiChevronLeft size={20} color="black" />}
            </div>
        </div>
    );
}



export default App;
