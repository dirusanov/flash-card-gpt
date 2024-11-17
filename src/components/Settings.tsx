import React from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {setAnkiConnectApiKey, setAnkiConnectUrl, setHuggingFaceApiKey, setOpenAiKey, setUseAnkiConnect} from "../store/actions/settings";
import {RootState} from "../store";
import chatGptLogo from '../assets/img/chat-gpt.png';
import CopyIcon from '../assets/img/copy-icon.svg';



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
  const copyIconUrl = chrome.runtime.getURL(CopyIcon);

    return (
      <div className="settings p-4">
        <div className="flex items-center mb-4">
          <label htmlFor="openAiKey" className="block font-bold mb-2 mr-2">OpenAI API Key</label>
          <img
            src={imageUrl}
            alt="ChatGPT Logo"
            style={{
              width: '20px',
              height: '20px',
              marginTop: '-6px'
            }} // Жестко заданный размер с небольшим поднятием вверх
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
          <p className="text-sm mb-2">
            Install the Anki plugin <strong>AnkiConnect</strong> and configure it as follows:
          </p>
          <ul className="text-sm list-disc list-inside mb-2">
            <li>Go to <strong>Tools</strong> then <strong>Add-ons</strong> then <strong>Get Add-ons...</strong></li>
            <li className="flex items-center">
              paste Code&nbsp;&nbsp;
              <button
                onClick={() => navigator.clipboard.writeText('2055492159')}
                className="flex items-center bg-gray-100 p-1 rounded text-blue-500 hover:bg-gray-200 transition cursor-pointer"
              >
                <img src={copyIconUrl} alt="Copy Icon" className="mr-1" style={{ width: '18px', height: '18px' }} />
                <span className="ml-1"></span> {/* Добавленный элемент для отступа */}

                <span className="ml-1"></span> {/* Добавленный элемент для отступа */}
                <code className="bg-transparent">2055492159</code>
              </button>
            </li>
            <li>Then click <strong>OK</strong></li>
            <li>Restart Anki</li>
            <li>Navigate to <strong>Tools</strong> &gt; <strong>Add-ons</strong> &gt; <strong>AnkiConnect</strong> &gt;
              <strong>Config</strong></li>
          </ul>
          <div className="relative bg-gray-100 p-4 rounded mb-4">
            <p className="text-sm mb-2">Copy paste the following config, you can change the <code>apiKey</code>:</p>
            <pre
              className="block overflow-auto p-2 bg-gray-200 rounded whitespace-pre-wrap cursor-pointer"
              onClick={() => navigator.clipboard.writeText(
                JSON.stringify({
                  apiKey: ankiConnectApiKey || 'your_api_key',
                  webCorsOriginList: ['http://localhost', '*'],
                  webBindPort: 8765,
                }, null, 2),
              )}
              title="Click to copy"
            >
              {JSON.stringify({
                apiKey: ankiConnectApiKey || 'your_api_key',
                webCorsOriginList: ['http://localhost', '*'],
                webBindPort: 8765,
              }, null, 2)}
            </pre>
            <button
              onClick={() => navigator.clipboard.writeText(
                JSON.stringify({
                  apiKey: ankiConnectApiKey || 'your_api_key',
                  webCorsOriginList: ['http://localhost', '*'],
                  webBindPort: 8765,
                }, null, 2),
              )}
              className="absolute top-2 right-2"
              title="Copy to clipboard"
            >
              <img src={copyIconUrl} alt="Copy Icon" style={{ width: '20px', height: '20px' }} />
            </button>
          </div>
          <label htmlFor="ankiConnectApiKey" className="block font-bold mb-2">AnkiConnect API Key (optional)</label>
          <input
            type="text"
            id="ankiConnectApiKey"
            value={ankiConnectApiKey !== null ? ankiConnectApiKey : ''}
            onChange={handleAnkiConnectApiKeyChange}
            className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600 mb-4"
          />
        </div>
        <label htmlFor="haggingFaceApiKey" className="block font-bold mb-2">Hugging Face API Key (optional)</label>
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
            Create cards
            </button>
          </div>
        )}
      </div>
    );
};


export default Settings
