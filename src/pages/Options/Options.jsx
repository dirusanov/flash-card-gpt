import React from 'react';
import Settings from '../../components/Settings';
import App from '../../App';
import brandLogo from '../../assets/img/vaulto-cards-logo.png';
import './Options.css';

// The welcome URL runs the same real flow as the panel; no separate throwaway demo.
const Options = () => window.location.hash === '#welcome' ? (
  <div style={{ height: '100vh', maxWidth: 480, margin: '0 auto' }}>
    <App tabId={-1} />
  </div>
) : (
  <div className="options-root">
    <header className="options-header">
      <div className="options-brand">
        <img className="options-brand-mark" src={brandLogo} alt="" />
        <span className="options-brand-name">Vaulto Cards</span>
      </div>
      <h1 className="options-title">Vaulto Cards settings</h1>
      <p className="options-subtitle">
        Your first few cards are built by Vaulto, no key needed. Add your own OpenAI key or
        connect Anki here to keep going.
        {' '}<a href="options.html#welcome" className="text-accent underline" onClick={() => { window.location.hash = 'welcome'; window.location.reload(); }}>
          Try a card
        </a>
      </p>
    </header>

    <ol className="options-steps">
      <li className="options-step">
        <strong>Optional: add your OpenAI key</strong> in the settings below, then press Test Connection to
        confirm it works.
      </li>
      <li className="options-step">
        <strong>Select text on any page</strong> and either right-click and choose
        &laquo;Create card from&hellip;&raquo; or press <span className="options-shortcut">Alt+C</span>.
        Clicking the toolbar icon opens the panel too.
      </li>
      <li className="options-step">
        <strong>Optional: connect Anki</strong> to push finished cards straight into your local
        collection, or sign in to sync them with Vaulto.
      </li>
    </ol>

    <div className="options-settings">
      <Settings onBackClick={() => null} popup />
    </div>
  </div>
);

export default Options;
