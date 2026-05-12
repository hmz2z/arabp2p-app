import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Settings.css';

interface TorrentInfo {
  number: number;
  name: string;
}

export default function Settings() {
  const [savePath, setSavePath] = useState('');
  const [torrentCount, setTorrentCount] = useState(0);
  const [names, setNames] = useState<TorrentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const path = await invoke<string>('get_save_path');
      setSavePath(path);
      
      const count = await invoke<number>('get_torrent_count', { savePath: path });
      setTorrentCount(count);
      
      const namesContent = await invoke<string>('get_names_file', { savePath: path });
      const namesList = (namesContent || '').split('\n')
        .filter(line => line.trim() && line.includes('|'))
        .map(line => {
          const [number, name] = line.split('|');
          return { number: parseInt(number) || 0, name: name?.trim() || 'Unknown' };
        });
      setNames(namesList);
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage(`Error loading settings: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePathChange = async () => {
    try {
      await invoke('set_save_path', { path: savePath });
      setMessage('Save path updated successfully!');
      setTimeout(() => setMessage(''), 3000);
      await loadSettings();
    } catch (error) {
      console.error('Error setting save path:', error);
      setMessage('Error updating save path');
    }
  };

  if (loading) {
    return <div className="settings-container"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="settings-container">
      <h1>Settings</h1>
      
      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}
      
      <div className="settings-section">
        <h2>Save Path Configuration</h2>
        <div className="setting-item">
          <label htmlFor="savePath">Save Path:</label>
          <input
            id="savePath"
            type="text"
            value={savePath}
            onChange={(e) => setSavePath(e.target.value)}
            placeholder="C:/Users/YourName/Documents/arabp2p"
          />
          <button onClick={handleSavePathChange}>Update Path</button>
        </div>
        <div className="setting-item">
          <label>Torrents Downloaded:</label>
          <span className="count">{torrentCount}</span>
        </div>
      </div>
      
      {names.length > 0 && (
        <div className="settings-section">
          <h2>Downloaded Torrents</h2>
          <div className="torrents-list">
            <ul>
              {names.map((torrent) => (
                <li key={torrent.number}>
                  <span className="torrent-number">{torrent.number.toString().padStart(2, '0')}</span>
                  <span className="torrent-name">{torrent.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      {names.length === 0 && (
        <div className="settings-section">
          <h2>Downloaded Torrents</h2>
          <p className="no-torrents">No torrents downloaded yet.</p>
        </div>
      )}
    </div>
  );
}