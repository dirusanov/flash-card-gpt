import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import {setApiKey} from "../store/actions/settings";

const Settings = () => {
    const dispatch = useDispatch();
    const [apiKey, setLocalApiKey] = useState(localStorage.getItem('openai_key') || '');

    const handleApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        setLocalApiKey(newValue);
        dispatch(setApiKey(newValue));
    };

    return (
        <div className="settings">
            <label htmlFor="apiKey">OpenAI API Key</label>
            <input type="text" id="apiKey" value={apiKey} onChange={handleApiKeyChange} />
        </div>
    );
};

export default Settings;
