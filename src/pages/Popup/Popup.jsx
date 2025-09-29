import React from 'react';
import Settings from '../../components/Settings';
import './Popup.css';

const Popup = () => {
  return (
    <div className="popup-root">
      <header className="popup-banner">
        <h1 className="popup-heading">AI Provider</h1>
        <p className="popup-subheading">Select which provider to use for generating flashcards. To use the extension, open any website tab.</p>
      </header>
      <section className="popup-content">
        <Settings onBackClick={() => null} popup={true} />
      </section>
    </div>
  );
};

export default Popup;
