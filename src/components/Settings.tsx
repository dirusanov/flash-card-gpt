import React from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {setAnkiConnectApiKey, setAnkiConnectUrl, setHuggingFaceApiKey, setOpenAiKey, setUseAnkiConnect} from "../store/actions/settings";
import {RootState} from "../store";
import chatGptLogo from '../assets/img/chat-gpt.png';


interface SettingsProps {
    onBackClick: () => void;
    popup: boolean
}


const Settings: React.FC<SettingsProps> = ({ onBackClick, popup = false }) => {
  const dispatch = useDispatch();

  const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
  const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
  const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
  const haggingFaceApiKey = useSelector((state: RootState) => state.settings.huggingFaceApiKey);

  const handleOpenAiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setOpenAiKey(event.target.value));
  };

  const handleAnkiConnectUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setAnkiConnectUrl(event.target.value));
  };

  const handleAnkiConnectApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setAnkiConnectApiKey(event.target.value));
  };

  const handleHuggingFaceApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setHuggingFaceApiKey(event.target.value));
  };

  const handleBackClick = () => {
    onBackClick();
  };
  const imageUrl = chrome.runtime.getURL(chatGptLogo);


    return (
      <div className="settings p-4">
        <div className="flex items-center mb-4">
          <label htmlFor="openAiKey" className="block font-bold mb-2 mr-2">OpenAI API Key</label>
          <img
            src={imageUrl}
            alt="ChatGPT Logo"
            style={{ width: '20px', height: '20px', marginTop: '-6px' }} // Жестко заданный размер с небольшим поднятием вверх
          />
        </div>
        <p className="text-sm mb-2">
          You can get your OpenAI API key from <a href="https://platform.openai.com/account/api-keys" target="_blank"
                                                  rel="noopener noreferrer" className="text-blue-500 underline">here</a>.
        </p>
        <div className="relative mb-4">
          <input
            type="text"
            id="openAiKey"
            value={openAiKey}
            onChange={handleOpenAiKeyChange}
            className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600 pr-10"
          />
        </div>
        <div className="">
            <label htmlFor="ankiConnectApiKey" className="block font-bold mb-2">AnkiConnect API Key (optional)</label>
            <input
              type="text"
              id="ankiConnectApiKey"
              value={ankiConnectApiKey !== null ? ankiConnectApiKey : ""}
              onChange={handleAnkiConnectApiKeyChange}
              className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600 mb-4"
            />
          </div>
        <label htmlFor="haggingFaceApiKey" className="block font-bold mb-2">Hugging Face API Key</label>
        <br />
        <em>(for image generation)</em>
        <input
          type="text"
          id="huggingFaceApiKey"
          value={haggingFaceApiKey}
          onChange={handleHuggingFaceApiKeyChange}
          className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600 mb-4"
        />
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
