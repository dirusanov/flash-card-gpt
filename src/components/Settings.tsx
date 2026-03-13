import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setAnkiConnectApiKey, setAnkiConnectUrl, setOpenAiKey, setUseAnkiConnect, setAutoSaveToServer } from "../store/actions/settings";
import { RootState } from "../store";
import chatGptLogo from '../assets/img/chat-gpt.png';
import CopyIcon from '../assets/img/copy-icon.svg';
import { backgroundFetch } from '../services/backgroundFetch';

interface SettingsProps {
  onBackClick: () => void;
  popup: boolean
}

const Settings: React.FC<SettingsProps> = ({ onBackClick, popup = false }) => {
  const dispatch = useDispatch();
  const [aiTestResults, setAiTestResults] = useState<{ success: boolean, message: string } | null>(null);
  const [ankiTestResults, setAnkiTestResults] = useState<{ success: boolean, message: string } | null>(null);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [isTestingAnki, setIsTestingAnki] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showAnkiApiKey, setShowAnkiApiKey] = useState(false);
  const [showAnkiInstructions, setShowAnkiInstructions] = useState(false);

  const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
  const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
  const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
  const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);
  const autoSaveToServer = useSelector((state: RootState) => state.settings.autoSaveToServer);
  const isLoggedIn = useSelector((state: RootState) => Boolean(state.auth.accessToken));

  const handleOpenAiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setOpenAiKey(event.target.value));
  };

  const handleAnkiConnectUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setAnkiConnectUrl(event.target.value));
  };

  const handleAnkiConnectApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setAnkiConnectApiKey(event.target.value));
  };

  const handleUseAnkiConnectChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setUseAnkiConnect(event.target.checked));
  };

  const handleAutoSaveToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setAutoSaveToServer(event.target.checked));
  };


  const handleBackClick = () => {
    onBackClick();
  };
  const imageUrl = chrome.runtime.getURL(chatGptLogo);
  const copyIconUrl = chrome.runtime.getURL(CopyIcon);

  // Function to test API connections
  const testApiConnection = async () => {
    setAiTestResults(null);
    setIsTestingAi(true);
    try {
      let endpoint = '';
      let headers = {};
      let body = {};
      let apiKey = '';

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

      if (!apiKey.trim()) {
        setAiTestResults({
          success: false,
          message: "API key is missing. Please enter your API key."
        });
        setIsTestingAi(false);
        return;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.ok) {
        setAiTestResults({
          success: true,
          message: "Connection successful! Everything is working perfectly."
        });
      } else {
        setAiTestResults({
          success: false,
          message: `Error: ${data.error?.message || 'Unknown error occurred'}`
        });
      }
    } catch (error) {
      setAiTestResults({
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      });
    } finally {
      setIsTestingAi(false);
    }
  };

  // Function to render test results
  const renderTestResults = (results: { success: boolean, message: string } | null) => {
    if (!results) return null;

    return (
      <div style={{
        padding: '10px',
        marginTop: '10px',
        borderRadius: '8px',
        backgroundColor: results.success ? '#ECFDF5' : '#FEF2F2',
        color: results.success ? '#065F46' : '#B91C1C',
        fontSize: '14px',
        borderLeft: `4px solid ${results.success ? '#10B981' : '#EF4444'}`
      }}>
        {results.message}
      </div>
    );
  };

  // Render OpenAI API key section
  const renderOpenAISection = () => {
    return (
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px'
        }}>
          <label htmlFor="openAiKey" style={{
            fontWeight: '600',
            color: '#111827',
            fontSize: '14px'
          }}>OpenAI API Key</label>
          <img
            src={imageUrl}
            alt="ChatGPT"
            style={{ width: '16px', height: '16px' }}
          />
        </div>

        <p style={{ fontSize: '12px', marginBottom: '12px', color: '#6B7280', lineHeight: '1.5' }}>
          Get your key from the <a href="https://platform.openai.com/account/api-keys" target="_blank"
            rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'none', fontWeight: '500' }}>OpenAI Dashboard</a>.
        </p>

        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <input
            type={showOpenAiKey ? "text" : "password"}
            id="openAiKey"
            value={openAiKey}
            onChange={handleOpenAiKeyChange}
            placeholder="sk-..."
            style={{
              width: '100%',
              padding: '10px 40px 10px 12px',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              fontSize: '13px',
              outline: 'none',
              transition: 'all 0.2s ease',
              backgroundColor: '#F9FAFB'
            }}
            onFocus={(e) => e.target.style.borderColor = '#2563EB'}
            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
          />
          <button
            onClick={() => setShowOpenAiKey(!showOpenAiKey)}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6B7280',
              fontSize: '12px'
            }}
          >
            {showOpenAiKey ? 'Hide' : 'Show'}
          </button>
        </div>

        <button
          onClick={testApiConnection}
          disabled={isTestingAi}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#10a37f',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isTestingAi ? 'wait' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            transition: 'opacity 0.2s ease',
            opacity: isTestingAi ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          {isTestingAi && <div className="spinner" style={{
            width: '16px',
            height: '16px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderRadius: '50%',
            borderTopColor: '#fff',
            animation: 'spin 0.8s linear infinite'
          }} />}
          {isTestingAi ? 'Testing...' : 'Test Connection'}
        </button>

        {renderTestResults(aiTestResults)}
      </div>
    );
  };

  const renderAnkiConnectSection = () => {
    return (
      <div style={{ marginBottom: '24px', backgroundColor: '#F9FAFB', padding: '16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#111827', fontSize: '15px' }}>Anki Integration</div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>Sync cards directly to your local Anki</div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useAnkiConnect}
              onChange={handleUseAnkiConnectChange}
              style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}
            />
            <span style={{
              width: '42px', height: '24px', borderRadius: '999px', display: 'inline-block', position: 'relative',
              backgroundColor: useAnkiConnect ? '#10B981' : '#D1D5DB', transition: 'background-color 0.2s ease'
            }}>
              <span style={{
                position: 'absolute', top: '3px', left: useAnkiConnect ? '21px' : '3px', width: '18px', height: '18px',
                borderRadius: '999px', backgroundColor: '#ffffff', transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </span>
          </label>
        </div>

        {useAnkiConnect && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label htmlFor="ankiConnectUrl" style={{
                display: 'block', fontWeight: 600, marginBottom: '6px', color: '#374151', fontSize: '13px'
              }}>AnkiConnect URL</label>
              <input
                type="text"
                id="ankiConnectUrl"
                value={ankiConnectUrl}
                onChange={handleAnkiConnectUrlChange}
                placeholder="http://127.0.0.1:8765"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB',
                  backgroundColor: '#ffffff', color: '#374151', fontSize: '13px', outline: 'none'
                }}
              />
            </div>

            <div>
              <label htmlFor="ankiConnectApiKey" style={{
                display: 'block', fontWeight: 600, marginBottom: '6px', color: '#374151', fontSize: '13px'
              }}>API Key (optional)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showAnkiApiKey ? "text" : "password"}
                  id="ankiConnectApiKey"
                  value={ankiConnectApiKey || ''}
                  onChange={handleAnkiConnectApiKeyChange}
                  placeholder="Enter API key if configured"
                  style={{
                    width: '100%', padding: '10px 40px 10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB',
                    backgroundColor: '#ffffff', color: '#374151', fontSize: '13px', outline: 'none'
                  }}
                />
                <button
                  onClick={() => setShowAnkiApiKey(!showAnkiApiKey)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '12px'
                  }}
                >
                  {showAnkiApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              onClick={async () => {
                setIsTestingAnki(true);
                setAnkiTestResults(null);
                try {
                  const response = await backgroundFetch(ankiConnectUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'version', version: 6, key: ankiConnectApiKey })
                  });
                  const data = await response.json<any>();
                  if (response.ok && !data.error) {
                    setAnkiTestResults({ success: true, message: 'Connected to Anki successfully! 🎉' });
                  } else {
                    setAnkiTestResults({ success: false, message: `AnkiConnect error: ${data?.error || 'Unknown error'}` });
                  }
                } catch (e: any) {
                  setAnkiTestResults({ success: false, message: `Could not reach Anki. Is it running?` });
                } finally {
                  setIsTestingAnki(false);
                }
              }}
              disabled={isTestingAnki}
              style={{
                padding: '10px', backgroundColor: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px',
                cursor: isTestingAnki ? 'wait' : 'pointer', fontSize: '13px', fontWeight: '600'
              }}
            >
              {isTestingAnki ? 'Checking...' : 'Check Connection'}
            </button>

            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '12px' }}>
              <button
                onClick={() => setShowAnkiInstructions(!showAnkiInstructions)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', color: '#4B5563', fontSize: '13px', fontWeight: '500'
                }}
              >
                <span>Setup Instructions</span>
                <span>{showAnkiInstructions ? '−' : '+'}</span>
              </button>

              {showAnkiInstructions && (
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#FFF', borderRadius: '8px', border: '1px solid #F3F4F6' }}>
                  <ol style={{ fontSize: '12px', color: '#4B5563', paddingLeft: '18px', margin: 0, lineHeight: '1.6' }}>
                    <li style={{ marginBottom: '8px' }}>In Anki, go to <strong>Tools</strong> &gt; <strong>Add-ons</strong> &gt; <strong>Get Add-ons...</strong></li>
                    <li style={{ marginBottom: '8px' }}>
                      Enter code: <code style={{ backgroundColor: '#F3F4F6', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>2055492159</code>
                      <button
                        onClick={() => navigator.clipboard.writeText('2055492159')}
                        style={{ marginLeft: '8px', border: 'none', background: '#E0E7FF', color: '#4338CA', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
                      >Copy</button>
                    </li>
                    <li style={{ marginBottom: '8px' }}>Restart Anki.</li>
                    <li style={{ marginBottom: '8px' }}>Go to <strong>Tools</strong> &gt; <strong>Add-ons</strong> &gt; <strong>AnkiConnect</strong> &gt; <strong>Config</strong> and use this setup:</li>
                  </ol>
                  <pre
                    style={{
                      marginTop: '8px', padding: '8px', backgroundColor: '#1F2937', color: '#F9FAFB',
                      borderRadius: '6px', fontSize: '11px', overflowX: 'auto', cursor: 'pointer'
                    }}
                    onClick={() => navigator.clipboard.writeText(JSON.stringify({
                      apiKey: ankiConnectApiKey || "your_api_key",
                      webCorsOriginList: ["http://localhost", "*"],
                      webBindPort: 8765
                    }, null, 2))}
                  >
                    {JSON.stringify({
                      apiKey: ankiConnectApiKey || "your_api_key",
                      webCorsOriginList: ["http://localhost", "*"],
                      webBindPort: 8765
                    }, null, 2)}
                  </pre>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '4px', textAlign: 'center' }}>Click to copy config</div>
                </div>
              )}
            </div>
          </div>
        )}
        {renderTestResults(ankiTestResults)}
      </div>
    );
  }


  const renderAutoSaveSection = () => {
    if (!isLoggedIn) {
      return null;
    }

    return (
      <div style={{ marginTop: '20px', padding: '14px', borderRadius: '8px', backgroundColor: '#FEFEFF', border: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>Auto Sync</div>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>
              Enable to synchronize every saved card with the server instantly.
            </div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoSaveToServer}
              onChange={handleAutoSaveToggle}
              style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}
            />
            <span style={{
              width: '40px',
              height: '22px',
              borderRadius: '999px',
              position: 'relative',
              display: 'inline-block',
              backgroundColor: autoSaveToServer ? '#10B981' : '#D1D5DB',
              transition: 'background-color 0.2s ease'
            }}>
              <span style={{
                position: 'absolute',
                top: '3px',
                left: autoSaveToServer ? '20px' : '3px',
                width: '16px',
                height: '16px',
                borderRadius: '999px',
                backgroundColor: '#fff',
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)'
              }} />
            </span>
          </label>
        </div>
        <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>
          Auto Sync requires an active session. Turn it on to keep Vaulto cloud in sync without manual action.
        </p>
      </div>
    );
  };

  return (
    <div style={{
      boxSizing: 'border-box',
      padding: '20px',
      backgroundColor: '#ffffff',
      height: '100%',
      width: '100%',
      maxWidth: popup ? '100%' : '600px',
      margin: '0 auto',
      overflowY: 'auto',
      paddingBottom: '40px',
      borderRadius: popup ? '12px' : '0',
    }}>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .spinner { border: 2px solid rgba(0,0,0,0.1); border-top-color: #2563EB; border-radius: 50%; width: 16px; height: 16px; animation: spin 0.8s linear infinite; }
      `}</style>

      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 8px 0' }}>Settings</h2>
        <p style={{ margin: 0, fontSize: '13px', color: '#6B7280', lineHeight: 1.5 }}>
          Vaulto Cards now uses OpenAI as the only AI provider in this extension.
        </p>
      </div>


      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {renderOpenAISection()}
        {renderAnkiConnectSection()}
        {renderAutoSaveSection()}
      </div>

      {/* Bottom spacing */}
      <div style={{ height: '20px' }} />
    </div>
  );
};

export default Settings;
