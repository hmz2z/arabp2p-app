import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Scripts from './pages/Scripts';
import './App.css';

function App() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen('download-finished', () => {
        setToast({ message: '📥 Torrent downloaded and saved successfully!', type: 'success' });
        setTimeout(() => setToast(null), 3500);
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  return (
    <div className="app">
      <div className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/scripts" element={<Scripts />} />
        </Routes>
      </div>

      {toast && (
        <div className={`global-toast ${toast.type}`}>
          <div className="toast-icon">✅</div>
          <div className="toast-content">{toast.message}</div>
        </div>
      )}
    </div>
  );
}

export default App;