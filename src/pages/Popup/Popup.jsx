import React from 'react';
import Settings from '../../components/Settings';
import './Popup.css';

const Popup = () => {
  return (
    <div className="popup-root">
      <header className="popup-banner">
        <div className="popup-badge">
          <span className="popup-badge-mark">V</span>
          <span className="popup-badge-label">Vaulto Cards</span>
        </div>
        <h1 className="popup-heading">Browser Companion</h1>
        <p className="popup-subheading">Configure AI, sync, and card creation settings in the same visual style as Vaulto Cards.</p>
      </header>
      <section className="popup-content">
        <Settings onBackClick={() => null} popup={true} />
      </section>
    </div>
  );
};

export default Popup;
