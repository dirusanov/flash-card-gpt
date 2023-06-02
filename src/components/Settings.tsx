import React from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {setAnkiConnectApiKey, setAnkiConnectUrl, setOpenAiKey, setUseAnkiConnect} from "../store/actions/settings";
import {RootState} from "../store";


interface SettingsProps {
    onBackClick: () => void;
    popup: boolean
}


const Settings: React.FC<SettingsProps> = ({ onBackClick, popup=false }) => {
    // const navigate = useNavigate();
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

    const handleBackClick = () => {
        // Здесь что-то делается при клике на кнопку "назад"
        onBackClick();
    };

    return (
        <div className="settings p-4">
            <label htmlFor="apiKey" className="block font-bold mb-2">OpenAI API Key</label>
            <input type="text" id="apiKey" value={openAiKey} onChange={handleOpenAiKeyChange}
                   className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600 mb-4"/>
            <div className="flex items-center mb-4">
                {/* <input type="checkbox" id="useAnkiConnect" checked={useAnkiConnect}
                       onChange={handleUseAnkiConnectChange}/> */}
                {/* <label htmlFor="useAnkiConnect" className="font-bold ml-2">Use AnkiConnect Plugin</label> */}
            </div>
            {true && (
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
            {!popup && (
                <div className="flex flex-col space-y-4 w-full">
                    <button
                        onClick={handleBackClick}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    >
                        Back
                    </button>
                </div>
            )}
        </div>
    );
};


export default Settings
