import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Home.css';

export default function Home() {
  useEffect(() => {
    const redirectToSite = async () => {
      try {
        // Just trigger the native navigation
        // The backend's on_page_load will handle script injection automatically!
        await invoke('open_browser');
      } catch (e) {
        window.location.href = 'https://arabp2p.net';
      }
    };
    
    redirectToSite();
  }, []);

  return (
    <div className="home-container" style={{ background: '#12121e', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div className="loading-spinner"></div>
      <h2 style={{ color: '#4ade80', marginTop: '20px', fontFamily: 'sans-serif' }}>Entering ArabP2P...</h2>
    </div>
  );
}