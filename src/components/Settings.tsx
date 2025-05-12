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
      <div style={{
        padding: '12px',
        backgroundColor: '#ffffff',
        height: '100%',
        width: '100%',
        maxWidth: '320px',
        margin: '0 auto',
        overflowY: 'auto',
        paddingBottom: '16px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '8px'
        }}>
          <label htmlFor="openAiKey" style={{
            display: 'block',
            fontWeight: '600',
            marginBottom: '0',
            marginRight: '8px',
            color: '#111827',
            fontSize: '14px'
          }}>OpenAI API Key</label>
          <img
            src={imageUrl}
            alt="ChatGPT Logo"
            style={{
              width: '16px',
              height: '16px',
              marginTop: '-2px'
            }}
          />
        </div>
        <p style={{
          fontSize: '12px',
          marginBottom: '6px',
          color: '#6B7280'
        }}>
          You can get your OpenAI API key from <a href="https://platform.openai.com/account/api-keys" target="_blank"
                                                  rel="noopener noreferrer" style={{
            color: '#2563EB',
            textDecoration: 'underline'
          }}>here</a>.
        </p>
        <div style={{
          position: 'relative',
          marginBottom: '16px'
        }}>
          <input
            type="text"
            id="openAiKey"
            value={openAiKey}
            onChange={handleOpenAiKeyChange}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid #E5E7EB',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontSize: '13px',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => e.target.style.borderColor = '#2563EB'}
            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
          />
        </div>
        <div>
          <p style={{
            fontSize: '13px',
            marginBottom: '8px',
            color: '#6B7280'
          }}>
            Install the Anki plugin <strong>AnkiConnect</strong> and configure it as follows:
          </p>
          <ul style={{
            fontSize: '13px',
            listStyle: 'disc',
            paddingLeft: '20px',
            marginBottom: '8px',
            color: '#6B7280'
          }}>
            <li style={{ marginBottom: '4px' }}>Go to <strong>Tools</strong> then <strong>Add-ons</strong> then <strong>Get Add-ons...</strong></li>
            <li style={{
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center'
            }}>
              Paste Code&nbsp;&nbsp;
              <button
                onClick={() => navigator.clipboard.writeText('2055492159')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#F3F4F6',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  color: '#2563EB',
                  transition: 'all 0.2s ease',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#E5E7EB'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              >
                <img src={copyIconUrl} alt="Copy Icon" style={{ width: '16px', height: '16px', marginRight: '4px' }} />
                <code style={{ backgroundColor: 'transparent', fontSize: '12px' }}>2055492159</code>
              </button>
            </li>
            <li style={{ marginBottom: '4px' }}>Then click <strong>OK</strong></li>
            <li style={{ marginBottom: '4px' }}>Restart Anki</li>
            <li style={{ marginBottom: '4px' }}>Navigate to <strong>Tools</strong> &gt; <strong>Add-ons</strong> &gt; <strong>AnkiConnect</strong> &gt;
              <strong>Config</strong></li>
          </ul>
          <div style={{
            position: 'relative',
            backgroundColor: '#F9FAFB',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '20px'
          }}>
            <p style={{
              fontSize: '13px',
              marginBottom: '8px',
              color: '#6B7280'
            }}>Copy paste the following config, you can change the <code>apiKey</code>:</p>
            <pre
              style={{
                display: 'block',
                overflow: 'auto',
                padding: '10px',
                backgroundColor: '#F3F4F6',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#374151',
                margin: 0
              }}
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
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px'
              }}
              title="Copy to clipboard"
            >
              <img src={copyIconUrl} alt="Copy Icon" style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
          <label htmlFor="ankiConnectApiKey" style={{
            display: 'block',
            fontWeight: '600',
            marginBottom: '8px',
            color: '#111827',
            fontSize: '14px'
          }}>AnkiConnect API Key (optional)</label>
          <input
            type="text"
            id="ankiConnectApiKey"
            value={ankiConnectApiKey !== null ? ankiConnectApiKey : ''}
            onChange={handleAnkiConnectApiKeyChange}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E5E7EB',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontSize: '13px',
              outline: 'none',
              transition: 'all 0.2s ease',
              marginBottom: '20px'
            }}
            onFocus={(e) => e.target.style.borderColor = '#2563EB'}
            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
          />
        </div>
        <label htmlFor="haggingFaceApiKey" style={{
          display: 'block',
          fontWeight: '600',
          marginBottom: '8px',
          color: '#111827',
          fontSize: '14px'
        }}>Hugging Face API Key (optional)</label>
        <p style={{
          fontSize: '13px',
          color: '#6B7280',
          fontStyle: 'italic',
          marginBottom: '8px'
        }}>(for image generation)</p>
        <input
          type="text"
          id="huggingFaceApiKey"
          value={haggingFaceApiKey}
          onChange={handleHuggingFaceApiKeyChange}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            backgroundColor: '#ffffff',
            color: '#374151',
            fontSize: '13px',
            outline: 'none',
            transition: 'all 0.2s ease',
            marginBottom: '20px'
          }}
          onFocus={(e) => e.target.style.borderColor = '#2563EB'}
          onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
        />
        {!popup && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            width: '100%',
            marginBottom: '8px',
            marginTop: '16px'
          }}>
            <button
              onClick={handleBackClick}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: '#2563EB',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1D4ED8'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563EB'}
            >
              Create Cards
            </button>
          </div>
        )}
      </div>
    );
};

export default Settings;
