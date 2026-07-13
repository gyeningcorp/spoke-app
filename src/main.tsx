import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

// Native keyboard behavior (safe no-op on web).
if (Capacitor.isNativePlatform()) {
  Keyboard.setAccessoryBarVisible?.({ isVisible: false }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
