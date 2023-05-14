import React from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {useNavigate} from 'react-router-dom';
import {setAnkiConnectApiKey, setAnkiConnectUrl, setOpenAiKey, setUseAnkiConnect} from "../store/actions/settings";
import {RootState} from "../store";

const Settings: React.FC = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
    const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
    const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);

    const handleOpenAiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        dispatch(setOpenAiKey(event.target.value))
    };

    const handleUseAnkiConnectChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        dispatch(setUseAnkiConnect(event.target.checked))
    };

    const handleAnkiConnectUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        dispatch(setAnkiConnectUrl(event.target.value))
    };

    const handleAnkiConnectApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        dispatch(setAnkiConnectApiKey(event.target.value))
    };

    const handleBack = () => {
        navigate("/");
    };

    return (
        <div className="settings p-4">
            <label htmlFor="apiKey" className="block font-bold mb-2">OpenAI API Key</label>
            <input type="text" id="apiKey" value={openAiKey} onChange={handleOpenAiKeyChange}
                   className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600 mb-4"/>
            <div className="flex items-center mb-4">
                <input type="checkbox" id="useAnkiConnect" checked={useAnkiConnect}
                       onChange={handleUseAnkiConnectChange}/>
                <label htmlFor="useAnkiConnect" className="font-bold ml-2">Use AnkiConnect Plugin</label>
            </div>
            {useAnkiConnect && (
                <div className="anki-connect-settings border-l-4 border-blue-500 pl-4 mb-4">
                    <label htmlFor="ankiConnectUrl" className="block font-bold mb-2">AnkiConnect URL</label>
                    <input type="text" id="ankiConnectUrl" value={ankiConnectUrl}
                           onChange={handleAnkiConnectUrlChange}
                           className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600 mb-4"/>
                    <label htmlFor="ankiConnectApiKey" className="block font-bold mb-2">AnkiConnect API Key
                        (optional)</label>
                    <input type="text" id="ankiConnectApiKey" value={ankiConnectApiKey}
                           onChange={handleAnkiConnectApiKeyChange}
                           className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600 mb-4"/>
                </div>
            )}
            <div className="flex space-x-2">
                <button onClick={handleBack}
                        className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded w-full mt-4">Back
                </button>
            </div>
        </div>
    );
};


export default Settings