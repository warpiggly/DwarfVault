# 🏔️ DwarfVault — Your Personal AI Text Vault

> **Save. Organize. Discover.** A private, offline Chrome extension for managing text databases with AI-powered semantic search coming in v1.3

![DwarfVault Logo](icons/Final%20Gif.gif)

---

## 🎯 What is DwarfVault?

DwarfVault is a **lightning-fast, privacy-first browser extension** that lets you:
- ✅ Save text from any website with a single right-click
- ✅ Organize into unlimited custom databases
- ✅ Search by keyword OR by meaning (v1.3+)
- ✅ Export/Import for backup
- ✅ Zero cloud, 100% local storage

**Perfect for:** Researchers, data scientists, developers, writers, students — anyone who saves and organizes text.

---

## 📊 Version Comparison

| Feature | v1.2 (Current) | v1.3 (Coming) | v1.4+ |
|---------|---|---|---|
| 💾 Save text to databases | ✅ | ✅ | ✅ |
| 🔍 Keyword search | ✅ | ✅ | ✅ |
| 📋 Export/Import CSV | ✅ | ✅ | ✅ |
| 🧠 **Semantic search** (AI) | ❌ | ✅ **NEW** | ✅ |
| 🗺️ **Visual map** (UMAP) | ❌ | ❌ | ✅ **NEW**  |
| 🏷️ **Auto-tagging** (k-NN) | ❌ | ❌ | ✅ **NEW** |
| 📊 **Analytics dashboard** | ❌ | ✅ **NEW** | ✅ |
| 🔔 Notification toggle | ✅ | ✅ | ✅ |
| 🔐 Security hardened | ✅ | ✅ | ✅ |

---

## ✨ Key Features

### 🔨 FORGE — Database Management
- **Create** parent & child databases (organize hierarchically)
- **Edit** database names on the fly
- **Delete** entire vaults with one click
- **Quick Access** — Link favorite databases to context menu

### 📥 TRADE — Import/Export
- Export single database as **CSV** (for spreadsheets)
- Export full vault as **JSON** (with all children)
- Import CSV to restore or merge databases
- **Backup your data** anytime, anywhere

### 🏰 RELICS — Entry Management
- **🔍 Keyword Search** — Find by text or index
- **🧠 Semantic Search** (v1.3+) — Find by meaning ("ML" finds "machine learning")
- **Edit** entries inline
- **Copy** to clipboard (⌘/Ctrl+C ready)
- **View** URL & favicon from original page
- **Delete** individual entries

### 💎 Glyph Vault — Emoji Selector
- Quick access to 100+ emojis
- Copy to clipboard instantly
- Organize your favorite glyphs

### 📜 TABLES — Database Viewer
- See all databases and entries in table format
- Column view with index, text, URL, favicon
- Sortable & searchable

### 🔔 Smart Notifications
- **Toggle on/off** in SETTINGS
- Get notified when you save text
- Mute all notifications with one click

---

## ⚡ Quick Start

### Installation (Developer Mode)

```
1. Clone or download this repo
2. Go to chrome://extensions/
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the DwarfVault folder
6. Done! ✅ Extension appears in your toolbar
```

**Keyboard Shortcut:** `Ctrl+Y` (Windows/Linux) or `Cmd+Y` (Mac) to open the popup.

---

## 🎬 Usage Guide

### 1️⃣ **Create Your First Database** 🏛️

```
📍 FORGE 🔨 → NEW VAULT (Parent) → Enter name → Create
```

The database is created and stored locally. You can now save text to it.

### 2️⃣ **Save Text from Any Website** 📥

**Method A: Right-Click Context Menu**
```
1. Select any text on a website
2. Right-click → "The Dwarf's Vault" → Select database
3. Text + URL + favicon saved automatically ✅
```

**Method B: Use Popup**
```
1. Open popup (Ctrl+Y)
2. Select database in FORGE
3. Paste text → Copy Text button
4. Done!
```

### 3️⃣ **Search & Manage Entries** 🔍

**Keyword Search:**
```
RELICS 🏰 → Keyword tab → Type word → See results
```

**Semantic Search (v1.3+):**
```
RELICS 🏰 → 🧠 Semantic tab → "machine learning" → 
Returns: "deep learning", "neural networks", etc. (by meaning)
```

### 4️⃣ **Export & Backup** 💾

**Single Database (CSV):**
```
FORGE 🔨 → TRADE → 📤 EXPORT CSV → File saved
```

**Full Vault with Children (JSON):**
```
FORGE 🔨 → TRADE → 📦 EXPORT Full Vault → Backup created
```

**Import:**
```
FORGE 🔨 → TRADE → 📥 IMPORT CSV or 🗃️ IMPORT Full Vault
```

### 5️⃣ **View All Data** 📊

Click **"TABLES"** in navigation to see a table view of all databases and entries with sortable columns.

---

## 🧠 Semantic Search (v1.3) — How It Works

Instead of finding exact keywords, **semantic search understands meaning**.

**Example:**
```
You save: "Python machine learning libraries like TensorFlow"
You search: "deep learning frameworks"

Result: ✅ FOUND — 87% similarity match
```

**Under the hood:**
- ✅ AI converts your text to "meaning vectors" (384-dimensional)
- ✅ Compares vectors to find similar concepts
- ✅ Ranks results by relevance (0-100%)
- ✅ All runs offline in your browser (no servers)

First search takes 2-10 sec (model downloads), then <1 sec each.

---

## 📁 Project Structure

```
DwarfVault/
├── 📄 manifest.json          (Extension config, permissions)
├── 📄 index.html             (Main popup UI)
├── 📄 popup.js               (Popup logic & database CRUD)
├── 📄 background.js          (Service worker, context menus)
├── 📄 View Board.html        (Table view of all DBs)
├── 📄 History.html           (Tutorial page)
├── 📁 scripts/
│   ├── db.js                 (IndexedDB interface)
│   ├── security.js           (XSS prevention, validation)
│   ├── notifications.js      (Toast notifications)
│   ├── ml.js                 (AI wrapper - Phase 1)
│   ├── ml-worker.js          (AI computation - Phase 1)
│   ├── Butons.js             (Button handlers)
│   └── Menu.js               (Navigation menu)
├── 📁 icons/                 (Extension icons 16x48x128px)
├── 📁 fonts/                 (Custom fonts)
├── 📁 image/                 (UI assets)
├── 📄 styles.css             (Main styles)
├── 📄 styles Board.css       (Table view styles)
├── 📄 styles History.css     (Tutorial styles)
└── 📄 emojis.json            (Emoji database)
```

---

## 🔒 Security & Privacy

### ✅ Your Data is Always Yours
- **100% offline** — Nothing sent to servers
- **Client-side only** — IndexedDB stores everything locally
- **No tracking** — No analytics, no ads, no telemetry
- **Open source** — Audit the code yourself

### 🔐 Security Hardened (v1.2+)
- **CSP enabled** — `script-src 'self'` prevents injection attacks
- **XSS protection** — All URLs & database names validated
- **Import validation** — CSV/JSON import sanitized
- **Favicon safety** — Only safe image URLs allowed
- **No eval()** — Manifest V3 compliant

---

## ⚙️ Technical Details

| Component | Technology |
|-----------|-----------|
| **Storage** | IndexedDB (local, persistent) |
| **UI** | Vanilla JS, HTML5, CSS3 |
| **Architecture** | Chrome Manifest V3 (modern) |
| **Threading** | Web Workers (non-blocking) |
| **AI** (v1.3+) | Transformers.js + MiniLM model |
| **Performance** | <1 sec search, <100ms copy |

### Permissions Used
- `contextMenus` — Right-click save menu
- `storage` — Store user preferences
- `notifications` — Toast notifications
- `tabs`, `activeTab` — Get current URL
- `clipboardWrite` — Copy text to clipboard
- `scripting` — Content script injection

---

## 🚀 Roadmap

### v1.2 ✅ (Current)
- ✅ Core CRUD operations
- ✅ CSV import/export
- ✅ Context menu integration
- ✅ Security hardening
- ✅ Notification toggle
- ✅ 100% offline operation

### v1.3 🚀 (Next — May 2026)
- 🧠 **Semantic search** with AI embeddings
- 📊 **Analytics dashboard** (TF-IDF, word clouds)
- 🔔 Notification improvements
- 🎨 UI polish

### v1.4+ 🔮 (Planned)
- 🗺️ **UMAP visualization** (see data in 2D)
- 🏷️ **Auto-tagging** with k-NN classifier
- 🔍 **Duplicate detection** (MinHash + LSH)
- ⚡ **Performance optimizations**
- 📱 Mobile app exploration

**See full roadmap:** [ROADMAP_v1.3-v1.7.md](ROADMAP_v1.3-v1.7.md)

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | This file — overview & quick start |
| [ROADMAP_v1.3-v1.7.md](ROADMAP_v1.3-v1.7.md) | 7-phase AI roadmap with architecture |
| [PHASE_1_INTEGRATION.md](PHASE_1_INTEGRATION.md) | Step-by-step guide for v1.3 |
| [PHASE_1_CODE_EXAMPLES.md](PHASE_1_CODE_EXAMPLES.md) | Copy-paste code snippets |
| [README_FASE_1.md](README_FASE_1.md) | Summary in simple Spanish |

---

## ❓ FAQ

**Q: Is my data safe?**  
A: Yes. All data stays in your browser's IndexedDB. Nothing leaves your device.

**Q: Can I sync across devices?**  
A: Not yet. Use Export/Import to backup and restore on other devices.

**Q: How much data can I store?**  
A: Usually 50MB+ depending on your browser. Typical usage: thousands of entries.

**Q: Will semantic search work offline?**  
A: Yes, after the first download. The AI model caches locally (~22MB).

**Q: Can I use this on Firefox/Safari?**  
A: Not yet. Currently Chrome/Edge only (Manifest V3). Firefox version planned for v1.4.

**Q: Do you collect any data?**  
A: No. This is completely anonymous, open-source software.

**Q: How do I report a bug?**  
A: Open an issue on GitHub or contact: WarpigglyTech@gmail.com

---

## 🎓 Learning Resources

Want to understand how DwarfVault works internally? Check these:
- **Web Extensions**: https://developer.chrome.com/docs/extensions/
- **IndexedDB**: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- **Web Workers**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- **Transformers.js** (AI): https://huggingface.co/docs/transformers.js
- **Semantic Search**: Understanding word embeddings and cosine similarity

---

## 📦 Packaging for Chrome Web Store

When building the extension ZIP for distribution, **exclude** development files:

```
❌ Exclude:
   - ROADMAP_*.md
   - PHASE_*.md
   - README_*.md
   - .git/
   - .gitignore
   - *.jsonl (conversation logs)

✅ Include:
   - manifest.json
   - index.html, View Board.html, History.html
   - background.js, popup.js, Viewboard.js
   - scripts/ (all .js files)
   - styles*.css
   - icons/, fonts/, image/
   - emojis.json
```

**Result:** ~500 KB extension ZIP (optimized for distribution)

---

## 👨‍💻 Development

### Clone & Setup
```bash
git clone https://github.com/DearDeivy/DwarfVault.git
cd DwarfVault
# Load in Chrome: chrome://extensions → Developer Mode → Load Unpacked
```

### Build for Production
```bash
# Create distribution ZIP excluding dev files
zip -r DwarfVault-v1.2.zip . \
  -x "*.md" "*.git*" "*.jsonl" ".DS_Store"
```

---

## 🤝 Contributing

Found a bug? Want to add a feature?
1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "Add feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📜 License

MIT License — Free for personal and commercial use.

---

## 🙏 Credits

**Developer:** David Salazar Saldarriaga (DearDeivy / Warpiggly)  
**Email:** WarpigglyTech@gmail.com 
**Open Source:** MIT Licensed

**Libraries & Resources:**
- Transformers.js (HuggingFace) — AI models
- Righteous Font — Custom typography
- Emojis — Unicode Consortium

---

## 📞 Support & Contact

- 🐛 **Bug Reports:** Open an issue on GitHub
- 💬 **Questions:** WarpigglyTech@gmail.com
- ⭐ **Like it?** Star this repo to show support!

---

<div align="center">

**Made with ❤️ by DearDeivy**

*DwarfVault — Save. Organize. Discover.*

[🌟 GitHub](https://github.com/DearDeivy/DwarfVault) • [📧 Email](mailto:WarpigglyTech@gmail.com) • [🚀 Version 1.2](https://github.com/DearDeivy/DwarfVault/releases)

</div>

