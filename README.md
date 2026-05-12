# 🚀 ArabP2P Torrent Manager

A premium, native desktop application built with **Tauri v2** and **React** for managing torrents and automating interactions on the ArabP2P tracker.

![ArabP2P UI](https://img.shields.io/badge/UI-Modern%20&%20Sleek-blueviolet)
![Tauri](https://img.shields.io/badge/Backend-Rust%20%2F%20Tauri%20v2-orange)
![React](https://img.shields.io/badge/Frontend-React%20%2F%20Vite-blue)

## ✨ Features

- **🚀 Native Performance**: Extremely fast and lightweight app footprint using Rust.
- **📜 Userscript Engine**: Native support for custom JavaScript injection (Tampermonkey style) with robust URL matching.
- **📥 Smart Interception**: Automatically intercepts `.torrent` downloads and saves them to your preferred directory.
- **💎 Premium UI**: Modern glassmorphism design with dark mode, smooth transitions, and a responsive sidebar.
- **⚙️ Deep Integration**: Rust-based backend handles file operations, window management, and page event monitoring.

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, CSS3 (Vanilla), React Router.
- **Backend**: Rust, Tauri v2.
- **Storage**: Local JSON persistence for scripts and configurations.
- **Security**: Strict CSP policies and native window event hooks.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (Included in Windows 10/11)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Run the app in development mode with hot-reloading:
```bash
npm run tauri dev
```

### Build

Build the production installer (.msi or .exe):
```bash
npm run tauri build
```

## 📜 Userscript matching

The built-in script engine supports glob-style patterns:
- `*://*.arabp2p.net/*` matches everything on the tracker.
- `*://arabp2p.net/index.php?page=torrent-details*` matches only torrent pages.
- `*` or `<all_urls>` matches every website visited.

## 🤝 Contributing

Feel free to open issues or submit pull requests to improve the app!

---
*Built with ❤️ for the ArabP2P Community.*
