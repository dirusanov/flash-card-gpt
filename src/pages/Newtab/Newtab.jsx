import React from 'react';
import logo from '../../assets/img/vaulto-cards-logo.png';
import './Newtab.css';
import './Newtab.scss';

const Newtab = () => {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="Vaulto Cards logo" />
        <h1>Vaulto Cards</h1>
        <p>Create, organize, and sync study cards from your browser.</p>
      </header>
    </div>
  );
};

export default Newtab;
