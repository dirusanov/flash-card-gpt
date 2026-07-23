import React from 'react';
import Settings from '../../components/Settings';
import brandLogo from '../../assets/img/vaulto-cards-logo.png';
import './Options.css';

// Doubles as the welcome screen: background opens this page on install, because a fresh
// install cannot create anything until an API key is entered, and nothing in the panel says so.
const Options = () => (
  <div className="options-root">
    <header className="options-header">
      <div className="options-brand">
        <img className="options-brand-mark" src={brandLogo} alt="" />
        <span className="options-brand-name">Vaulto Cards</span>
      </div>
      <h1 className="options-title">Set up your card maker</h1>
      <p className="options-subtitle">
        Cards are generated with your own OpenAI key, so nothing works until you add one below.
        It is stored in the extension&apos;s storage and never sent anywhere except to OpenAI.
      </p>
    </header>

    <ol className="options-steps">
      <li className="options-step">
        <strong>Add your OpenAI key</strong> in the settings below, then press Test Connection to
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
