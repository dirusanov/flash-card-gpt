import React, { useState } from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {setAnkiConnectApiKey, setAnkiConnectUrl, setGroqApiKey, setGroqModelName, setOpenAiKey, setUseAnkiConnect, setModelProvider} from "../store/actions/settings";
import {RootState} from "../store";
import chatGptLogo from '../assets/img/chat-gpt.png';
import CopyIcon from '../assets/img/copy-icon.svg';
import { ModelProvider } from '../store/reducers/settings';

interface SettingsProps {
    onBackClick: () => void;
    popup: boolean
}

const Settings: React.FC<SettingsProps> = ({ onBackClick, popup = false }) => {
  const dispatch = useDispatch();
  const [testResults, setTestResults] = useState<{success: boolean, message: string} | null>(null);

  const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
  const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
  const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
  const groqApiKey = useSelector((state: RootState) => state.settings.groqApiKey);
  const groqModelName = useSelector((state: RootState) => state.settings.groqModelName);
  const modelProvider = useSelector((state: RootState) => state.settings.modelProvider);

  const handleOpenAiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setOpenAiKey(event.target.value));
  };

  const handleAnkiConnectUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setAnkiConnectUrl(event.target.value));
  };

  const handleAnkiConnectApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setAnkiConnectApiKey(event.target.value));
  };

  const handleGroqApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setGroqApiKey(event.target.value));
  };

  const handleGroqModelNameChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(setGroqModelName(event.target.value));
  };

  const handleModelProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(setModelProvider(event.target.value as ModelProvider));
    // Clear test results when changing provider
    setTestResults(null);
  };

  const handleBackClick = () => {
    onBackClick();
  };
  const imageUrl = chrome.runtime.getURL(chatGptLogo);
  const copyIconUrl = chrome.runtime.getURL(CopyIcon);

  // Function to test API connections
  const testApiConnection = async (provider: ModelProvider) => {
    setTestResults(null);
    try {
      let endpoint = '';
      let headers = {};
      let body = {};
      let apiKey = '';

      switch (provider) {
        case ModelProvider.OpenAI:
          endpoint = 'https://api.openai.com/v1/chat/completions';
          apiKey = openAiKey;
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          };
          body = {
            model: 'gpt-5-nano',
            messages: [
              {
                role: "user",
                content: "Say hello"
              }
            ],

          };
          break;
        case ModelProvider.Groq:
          endpoint = 'https://api.groq.com/openai/v1/chat/completions';
          apiKey = groqApiKey;
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          };
          body = {
            model: groqModelName,
            messages: [
              {
                role: "user",
                content: "Say hello"
              }
            ],

          };
          break;
      }

      if (!apiKey.trim()) {
        setTestResults({
          success: false,
          message: "API key is missing. Please enter your API key."
        });
        return;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log("API test response:", data);
        setTestResults({
          success: true,
          message: "Connection successful! API is working properly."
        });
      } else {
        console.error("API test error:", data);
        setTestResults({
          success: false,
          message: `Error: ${data.error?.message || 'Unknown error occurred'}`
        });
      }
    } catch (error) {
      console.error("API connection test error:", error);
      setTestResults({
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      });
    }
  };

  // Function to render test results
  const renderTestResults = () => {
    if (!testResults) return null;
    
    return (
      <div style={{
        padding: '10px',
        marginTop: '10px',
        borderRadius: '6px',
        backgroundColor: testResults.success ? '#ECFDF5' : '#FEF2F2',
        color: testResults.success ? '#065F46' : '#B91C1C',
        fontSize: '14px',
        borderLeft: `4px solid ${testResults.success ? '#10B981' : '#EF4444'}`
      }}>
        {testResults.message}
      </div>
    );
  };

  // Render OpenAI API key section
  const renderOpenAISection = () => {
    if (modelProvider !== ModelProvider.OpenAI) return null;
    
    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '6px',
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
              boxSizing: 'border-box',
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
        
        <button 
          onClick={() => testApiConnection(ModelProvider.OpenAI)}
          style={{
            marginTop: '8px',
            padding: '6px 12px',
            backgroundColor: '#10a37f', // Green for OpenAI
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Test API Connection
        </button>
        
        {renderTestResults()}
      </div>
    );
  };

  // Render Groq API key section
  const renderGroqSettings = () => {
    if (modelProvider !== ModelProvider.Groq) return null;
    
    return (
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="groqApiKey" style={{
          display: 'block',
          fontWeight: '600',
          marginBottom: '8px',
          color: '#111827',
          fontSize: '14px'
        }}>Groq API Key</label>
        <p style={{
          fontSize: '12px',
          marginBottom: '8px',
          color: '#6B7280'
        }}>
          You can get your Groq API key from <a href="https://console.groq.com/keys" target="_blank"
                                                  rel="noopener noreferrer" style={{
            color: '#2563EB',
            textDecoration: 'underline'
          }}>here</a>.
        </p>
        <input
          type="text"
          id="groqApiKey"
          value={groqApiKey}
          onChange={handleGroqApiKeyChange}
          style={{
            width: '100%',
            padding: '8px 12px',
            boxSizing: 'border-box',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            backgroundColor: '#ffffff',
            color: '#374151',
            fontSize: '13px',
            outline: 'none',
            transition: 'all 0.2s ease',
            marginBottom: '16px'
          }}
          onFocus={(e) => e.target.style.borderColor = '#2563EB'}
          onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
        />
        
        <div style={{
          padding: '8px',
          backgroundColor: '#DBEAFE',
          borderRadius: '6px',
          marginBottom: '16px'
        }}>
          <p style={{
            fontSize: '12px',
            color: '#1E40AF',
            margin: 0
          }}>
            <strong>Note:</strong> Image generation is not available with Groq.
          </p>
        </div>
        
        <label htmlFor="groqModelName" style={{
          display: 'block',
          fontWeight: '600',
          marginBottom: '8px',
          color: '#111827',
          fontSize: '14px'
        }}>Groq Model</label>
        
        <select
          id="groqModelName"
          value={groqModelName}
          onChange={handleGroqModelNameChange}
          style={{
            width: '100%',
            padding: '8px 12px',
            boxSizing: 'border-box',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            backgroundColor: '#ffffff',
            color: '#374151',
            fontSize: '13px',
            outline: 'none',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
            marginBottom: '16px'
          }}
          onFocus={(e) => e.target.style.borderColor = '#2563EB'}
          onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
        >
          <option value="llama3-8b-8192">Llama-3 8B</option>
          <option value="llama3-70b-8192">Llama-3 70B</option>
          <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
          <option value="gemma-7b-it">Gemma 7B</option>
        </select>
        
        <button 
          onClick={() => testApiConnection(ModelProvider.Groq)}
          style={{
            marginTop: '8px',
            padding: '6px 12px',
            backgroundColor: '#7c3aed', // Фиолетовый для Groq
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Test API Connection
        </button>
        
        {renderTestResults()}
      </div>
    );
  };

  const renderAnkiConnectSection = () => {
    return (
      <div style={{ marginBottom: '20px' }}>
        {/* Anki Connect settings */}
      </div>
    );
  }

  return (
    <div style={{
      boxSizing: 'border-box',
      padding: '14px',
      backgroundColor: '#ffffff',
      height: '100%',
      width: '100%',
      maxWidth: popup ? '100%' : '640px',
      margin: '0 auto',
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingBottom: '18px',
      marginTop: '12px',
      borderRadius: popup ? '12px' : '0',
      boxShadow: popup ? '0 16px 35px rgba(15, 23, 42, 0.12)' : 'none'
    }}>
      <div style={{
        marginBottom: '20px',
        backgroundColor: '#F9FAFB',
        padding: '12px',
        borderRadius: '8px'
      }}>
        <label htmlFor="modelProvider" style={{
          display: 'block',
          fontWeight: '600',
          marginBottom: '8px',
          color: '#111827',
          fontSize: '14px'
        }}>AI Provider</label>
        <p style={{
          fontSize: '12px',
          marginBottom: '8px',
          color: '#6B7280'
        }}>
          Select which provider to use for generating flashcards
        </p>
        <select
          id="modelProvider"
          value={modelProvider}
          onChange={handleModelProviderChange}
          style={{
            width: '100%',
            padding: '8px 12px',
            boxSizing: 'border-box',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            backgroundColor: '#ffffff',
            color: '#374151',
            fontSize: '13px',
            outline: 'none',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onFocus={(e) => e.target.style.borderColor = '#2563EB'}
          onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
        >
          <option value={ModelProvider.OpenAI}>OpenAI</option>
          <option value={ModelProvider.Groq}>Groq</option>
        </select>
      </div>

      <div>
        {renderOpenAISection()}
        {renderGroqSettings()}
        {renderAnkiConnectSection()}
      </div>

      <div>
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
            boxSizing: 'border-box',
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
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px'
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
              overflowX: 'hidden',
              overflowY: 'auto',
              padding: '10px',
              backgroundColor: '#F3F4F6',
              borderRadius: '4px',
              whiteSpace: 'pre-wrap',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#374151',
              margin: 0,
              wordBreak: 'break-word'
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
      </div>

      {/* Removed the floating action button since we've added a button to the top navigation */}
    </div>
  );
};

export default Settings;
