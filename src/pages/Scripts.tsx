import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Scripts.css';

// ===== Types =====
interface UserScript {
  id: string;
  name: string;
  enabled: boolean;
  matches: string;
  code: string;
  createdAt: number;
  updatedAt: number;
}

// ===== Store helpers (Now using Rust commands) =====
async function loadScriptsFromStore(): Promise<UserScript[]> {
  try {
    const scripts = await invoke<UserScript[]>('load_scripts');
    return scripts ?? [];
  } catch (e) {
    console.error('Error loading scripts from Rust:', e);
    return [];
  }
}

async function saveScriptsToStore(scripts: UserScript[]): Promise<void> {
  try {
    await invoke('save_scripts', { scripts });
  } catch (e) {
    console.error('Error saving scripts to Rust:', e);
  }
}

// ===== Component =====
export default function Scripts() {
  const [scripts, setScripts] = useState<UserScript[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Editor state
  const [editName, setEditName] = useState('');
  const [editMatch, setEditMatch] = useState('');
  const [editCode, setEditCode] = useState('');

  // New script modal state
  const [newName, setNewName] = useState('');
  const [newMatch, setNewMatch] = useState('*');

  // Import/Export modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFileName, setImportFileName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load scripts on mount from tauri-plugin-store
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const loaded = await loadScriptsFromStore();
      setScripts(loaded);
      setIsLoading(false);
    })();
  }, []);

  // Show toast
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Select a script
  const selectScript = useCallback((id: string) => {
    const script = scripts.find(s => s.id === id);
    if (script) {
      setSelectedId(id);
      setEditName(script.name);
      setEditMatch(script.matches);
      setEditCode(script.code);
      setHasUnsaved(false);
    }
  }, [scripts]);

  // Get selected script
  const selectedScript = scripts.find(s => s.id === selectedId);

  // Filter scripts by search
  const filteredScripts = scripts.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Add new script
  const handleAddScript = async () => {
    if (!newName.trim()) return;

    const newScript: UserScript = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      enabled: true,
      matches: newMatch.trim() || '*',
      code: `// ==UserScript==\n// @name        ${newName.trim()}\n// @match       ${newMatch.trim() || '*'}\n// ==/UserScript==\n\nconsole.log("Script loaded: ${newName.trim()}");\n`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [...scripts, newScript];
    setScripts(updated);
    await saveScriptsToStore(updated);
    setSelectedId(newScript.id);
    setEditName(newScript.name);
    setEditMatch(newScript.matches);
    setEditCode(newScript.code);
    setHasUnsaved(false);
    setShowAddModal(false);
    setNewName('');
    setNewMatch('*');
    showToast('✅ Script created successfully');
  };

  // Save script
  const handleSave = async () => {
    if (!selectedId) return;
    const updated = scripts.map(s =>
      s.id === selectedId
        ? { ...s, name: editName, matches: editMatch, code: editCode, updatedAt: Date.now() }
        : s
    );
    setScripts(updated);
    await saveScriptsToStore(updated);
    setHasUnsaved(false);
    showToast('💾 Script saved');
  };

  // Toggle script enabled
  const handleToggle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = scripts.map(s =>
      s.id === id ? { ...s, enabled: !s.enabled, updatedAt: Date.now() } : s
    );
    setScripts(updated);
    await saveScriptsToStore(updated);
    const toggled = updated.find(s => s.id === id);
    showToast(toggled?.enabled ? '🟢 Script enabled' : '🔴 Script disabled');
  };

  // Confirm delete
  const confirmDelete = (id: string) => {
    setDeleteTargetId(id);
    setShowDeleteModal(true);
  };

  // Delete script
  const handleDelete = async () => {
    if (!deleteTargetId) return;
    const updated = scripts.filter(s => s.id !== deleteTargetId);
    setScripts(updated);
    await saveScriptsToStore(updated);
    if (selectedId === deleteTargetId) {
      setSelectedId(null);
      setEditName('');
      setEditMatch('');
      setEditCode('');
      setHasUnsaved(false);
    }
    setShowDeleteModal(false);
    setDeleteTargetId(null);
    showToast('🗑️ Script deleted');
  };

  // Run script directly in the iframe
  const handleRunScript = () => {
    if (!editCode.trim()) return;
    try {
      const event = new CustomEvent('run-userscript', { detail: { code: editCode } });
      window.dispatchEvent(event);
      showToast('▶️ Script injected into page');
    } catch (err) {
      console.error('Script injection error:', err);
      showToast('❌ Failed to inject script: ' + String(err), 'error');
    }
  };

  // Export all scripts as JSON
  const handleExportScripts = () => {
    const data = JSON.stringify(scripts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arabp2p_userscripts_export.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📦 Scripts exported');
  };

  // Parse Tampermonkey-style header from a .js file
  const parseTampermonkeyHeader = (code: string): { name: string; match: string } => {
    let name = '';
    let match = '*';
    const nameMatch = code.match(/@name\s+(.+)/i);
    if (nameMatch) name = nameMatch[1].trim();
    const matchMatch = code.match(/@match\s+(.+)/i);
    if (matchMatch) match = matchMatch[1].trim();
    return { name, match };
  };

  // Import scripts — handles both JSON (array of scripts) and .js files (single script)
  const handleImportScripts = async () => {
    if (!importText.trim()) return;
    try {
      let newScriptsToAdd: UserScript[] = [];

      // Try parsing as JSON first
      try {
        const parsed = JSON.parse(importText);
        if (Array.isArray(parsed)) {
          // JSON array of scripts
          const existingIds = new Set(scripts.map(s => s.id));
          newScriptsToAdd = parsed.filter((s: UserScript) => !existingIds.has(s.id));
        } else {
          throw new Error('not array');
        }
      } catch {
        // Not valid JSON → treat as raw JavaScript code
        const header = parseTampermonkeyHeader(importText);
        const scriptName = header.name || importFileName || 'Imported Script';
        newScriptsToAdd = [{
          id: crypto.randomUUID(),
          name: scriptName,
          enabled: true,
          matches: header.match,
          code: importText,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }];
      }

      if (newScriptsToAdd.length === 0) {
        showToast('⚠️ No new scripts to import', 'error');
        return;
      }

      const merged = [...scripts, ...newScriptsToAdd];
      setScripts(merged);
      await saveScriptsToStore(merged);
      setShowImportModal(false);
      setImportText('');
      setImportFileName('');
      showToast(`📥 Imported ${newScriptsToAdd.length} script(s)`);
    } catch (e) {
      showToast('❌ Import failed: ' + String(e), 'error');
    }
  };

  // Import scripts from file (.js or .json)
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Store the filename (without extension) for use as script name
    const baseName = file.name.replace(/\.(user\.js|js|json)$/i, '');
    setImportFileName(baseName);
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(reader.result as string);
    };
    reader.readAsText(file);
  };

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && selectedId) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, editName, editMatch, editCode]);

  // Handle code change
  const onCodeChange = (value: string) => {
    setEditCode(value);
    setHasUnsaved(true);
  };

  // Handle tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = editCode.substring(0, start) + '  ' + editCode.substring(end);
      setEditCode(newValue);
      setHasUnsaved(true);
      // Set cursor position after React re-renders
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const enabledCount = scripts.filter(s => s.enabled).length;

  if (isLoading) {
    return (
      <div className="scripts-container">
        <div className="scripts-loading">
          <div className="loading-spinner"></div>
          <p>Loading scripts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scripts-container">
      {/* Header */}
      <div className="scripts-header">
        <h1>
          <span className="icon">📜</span>
          Script Manager
          {scripts.length > 0 && (
            <span className="script-count-badge">
              {enabledCount}/{scripts.length}
            </span>
          )}
        </h1>
        <div className="header-actions">
          <button className="btn-header-action" onClick={() => setShowImportModal(true)} title="Import Scripts">
            📥 Import
          </button>
          <button className="btn-header-action" onClick={handleExportScripts} title="Export Scripts" disabled={scripts.length === 0}>
            📦 Export
          </button>
          <button className="btn-add-script" onClick={() => setShowAddModal(true)}>
            ➕ New Script
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="scripts-body">
        {/* Left: Script List */}
        <div className="scripts-list-panel">
          <div className="scripts-list-search">
            <input
              type="text"
              placeholder="🔍 Search scripts..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="scripts-list">
            {filteredScripts.length === 0 && (
              <div className="scripts-empty-state" style={{ padding: '20px', height: 'auto' }}>
                <p style={{ color: '#555', fontSize: '13px' }}>
                  {scripts.length === 0 ? 'No scripts yet. Click "New Script" to create one.' : 'No scripts match your search.'}
                </p>
              </div>
            )}
            {filteredScripts.map(script => (
              <div
                key={script.id}
                className={`script-card ${selectedId === script.id ? 'active' : ''}`}
                onClick={() => selectScript(script.id)}
              >
                <div className="script-card-icon">
                  {script.enabled ? '⚡' : '💤'}
                </div>
                <div className="script-card-info">
                  <div className="script-card-name">{script.name}</div>
                  <div className="script-card-meta">
                    {script.matches} · {formatDate(script.updatedAt)}
                  </div>
                </div>
                <label className="toggle-switch" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={script.enabled}
                    onChange={() => { }}
                    onClick={e => handleToggle(script.id, e as unknown as React.MouseEvent)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Editor */}
        <div className="scripts-editor-panel">
          {!selectedScript ? (
            <div className="scripts-empty-state">
              <div className="empty-icon">📝</div>
              <h2>Select or Create a Script</h2>
              <p>
                Choose a script from the list to edit, or create a new one.
                Scripts are saved permanently using Tauri Store.
              </p>
              <div className="tampermonkey-hint">
                <span className="hint-icon">💡</span>
                <span>Works like Tampermonkey — scripts persist and run based on URL match patterns</span>
              </div>
            </div>
          ) : (
            <>
              {/* Editor Header */}
              <div className="editor-header">
                <div className="editor-title-area">
                  <input
                    className="editor-name-input"
                    value={editName}
                    onChange={e => { setEditName(e.target.value); setHasUnsaved(true); }}
                    placeholder="Script name..."
                  />
                  <input
                    className="editor-match-input"
                    value={editMatch}
                    onChange={e => { setEditMatch(e.target.value); setHasUnsaved(true); }}
                    placeholder="@match pattern (e.g. *://example.com/*)"
                    title="URL pattern: use * as wildcard. Use * to match all pages."
                  />
                </div>
                <div className="editor-actions">
                  <button className="btn-run" onClick={handleRunScript} title="Run this script on the current page (via Tauri eval)">
                    ▶ Run
                  </button>
                  <button
                    className={`btn-save ${hasUnsaved ? 'unsaved' : ''}`}
                    onClick={handleSave}
                    title="Save (Ctrl+S)"
                  >
                    💾 Save
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => confirmDelete(selectedScript.id)}
                    title="Delete this script"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Code Editor */}
              <div className="code-editor-wrapper">
                <div className="code-editor-toolbar">
                  <span className="lang-badge">JavaScript</span>
                  <span>{editCode.split('\n').length} lines</span>
                  <span>·</span>
                  <span>{new Blob([editCode]).size} bytes</span>
                  <span className="toolbar-spacer"></span>
                  <span className="storage-badge">💾 Local JSON</span>
                </div>
                <textarea
                  className="code-editor"
                  value={editCode}
                  onChange={e => onCodeChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="// Write your JavaScript code here..."
                  spellCheck={false}
                />
              </div>

              {/* Status Bar */}
              <div className="editor-status-bar">
                <div className="status-indicator">
                  <span className={`status-dot ${!selectedScript.enabled ? 'disabled' : hasUnsaved ? 'unsaved' : ''}`}></span>
                  <span>
                    {!selectedScript.enabled ? 'Disabled' : hasUnsaved ? 'Unsaved changes' : 'Saved'}
                  </span>
                </div>
                <span>Last updated: {formatDate(selectedScript.updatedAt)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Script Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>✨ New Script</h2>
            <div className="modal-field">
              <label>Script Name</label>
              <input
                type="text"
                placeholder="e.g. Dark Mode, Ad Blocker..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddScript()}
              />
            </div>
            <div className="modal-field">
              <label>URL Match Pattern</label>
              <input
                type="text"
                placeholder="e.g. *://example.com/*"
                value={newMatch}
                onChange={e => setNewMatch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddScript()}
              />
              <div className="hint">Use * to match all URLs. Use patterns like *://site.com/* for specific sites.</div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn-create" onClick={handleAddScript}>Create Script</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Scripts Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-content modal-import" onClick={e => e.stopPropagation()}>
            <h2>📥 Import Scripts</h2>
            <div className="modal-field">
              <label>Paste code / JSON, or load a .js / .json file</label>
              <textarea
                className="import-textarea"
                placeholder={'// Paste JavaScript code directly\n// Or paste JSON: [{"name":"...","code":"..."}]\n// Or load a .js / .user.js file below'}
                value={importText}
                onChange={e => setImportText(e.target.value)}
              />
            </div>
            <div className="import-file-row">
              <button className="btn-file-pick" onClick={() => fileInputRef.current?.click()}>
                📂 Choose File (.js / .json)
              </button>
              {importFileName && <span className="import-file-name">📄 {importFileName}</span>}
              <input
                ref={fileInputRef}
                type="file"
                accept=".js,.user.js,.json"
                style={{ display: 'none' }}
                onChange={handleFileImport}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setShowImportModal(false); setImportText(''); }}>Cancel</button>
              <button className="btn-create" onClick={handleImportScripts}>Import</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content confirm-delete" onClick={e => e.stopPropagation()}>
            <h2>⚠️ Delete Script?</h2>
            <p style={{ color: '#aaa', lineHeight: 1.6 }}>
              Are you sure you want to delete <strong style={{ color: '#ef4444' }}>
                {scripts.find(s => s.id === deleteTargetId)?.name}
              </strong>? This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn-confirm-delete" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`scripts-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
