import React from 'react';
import { BrowserRouter as Router,  Routes, Route } from 'react-router-dom';

import CreateCard from './components/CreateCard/CreateCard';
import Settings from "./components/Settings";

function App() {
    return (
        <div className="App">
            <header className="App-header">
                <Router>
                    <Routes>
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/" element={<CreateCard />} />
                    </Routes>
                </Router>
            </header>
        </div>
    );
}

export default App;
