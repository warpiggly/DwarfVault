# DwarfVault

DwarfVault is a smart storage browser extension that allows users to create and manage custom databases. Perfect for organizing and saving text, categories, and important information. With a simple interface, you can easily add, edit, or delete your data, all within a secure and accessible environment.

---

## Features

- **Create unlimited custom databases** to organize your saved text and information.
- **Save selected text** from any web page, including the URL and favicon, directly to your chosen database via the context menu.
- **View, edit, and delete entries** in each database from the extension popup.
- **Copy saved text** to your clipboard with a single click.
- **Export and import databases** as CSV files for backup or sharing.
- **Emoji selector** for quick access to a variety of emojis.
- **Modern, user-friendly interface** with navigation and visual feedback.

---

## Installation

1. Download or clone this repository.
2. Open your browser's extensions page (e.g., `chrome://extensions/`).
3. Enable "Developer mode".
4. Click "Load unpacked" and select the `DwarfVault` folder.

---

## Usage

### 1. Create Your First Database 🏗️
- Open the extension popup.
- Go to the "FORGE 🔨" tab.
- Click "FORGE 🔨 - Create New Database" and enter a name.

### 2. Save Text from Any Web Page 📥
- Select any text on a web page.
- Right-click and choose "The Dwarf's Vault" → "Save to Vault 🏰".
- Select your database. The text, URL, and favicon will be saved.

### 3. View and Manage Saved Data 👀
- Open the extension popup.
- Use the "RELICS 🏰" tab to search, view, copy, edit, or delete entries.
- Click on "TABLES" to see all databases and their contents in table format.

### 4. Export/Import Databases
- Use the export button to download your database as a CSV file.
- Use the import button to upload a CSV and restore or add a database.

---

## File Structure

- `background.js` – Handles database logic, context menus, and background events.
- `popup.js` – Manages the popup UI, database CRUD, import/export, and emoji selector.
- `index.html` – Main popup interface.
- `View Board.html` – Displays all databases in table format.
- `History.html` – Tutorial and usage instructions.
- `emojis.json` – List of emojis for the selector.
- `styles.css` and related CSS – Styling for the extension.
- `icons/`, `fonts/`, `image/` – Assets for UI and branding.
- `manifest.json` – Extension manifest (permissions, scripts, icons).

---

## Technical Details

- Uses **IndexedDB** for persistent client-side storage of databases and entries.
- Context menu integration for quick saving of selected text.
- All data is stored locally in your browser and never leaves your device.
- Built with vanilla JavaScript, HTML, and CSS.

---

## Permissions

- `contextMenus`, `storage`, `notifications`, `tabs`, `clipboardWrite`, `clipboardRead`, `activeTab` – Required for full extension functionality.

---

## Credits

- Developed by David Salazar Saldarriaga / Warpiggly.
- Fonts and icons from open sources.

---

## License

This project is licensed under the MIT License.

---

## Screenshots

_Add screenshots of the extension in action here._

---

## Support

For questions or support, open an issue or contact the developer.


