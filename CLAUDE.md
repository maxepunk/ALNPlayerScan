# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALN Memory Scanner is a Progressive Web App (PWA) that enables scanning of QR codes and NFC tags to unlock "memory tokens" - collectible items containing images, audio, and metadata. The app works offline-first and is designed for deployment on GitHub Pages.

## Architecture

### Core Components

1. **index.html** - Single-page application (1250 lines)
   - Main `MemoryScanner` class handles all app logic
   - Three scanning modes: QR camera, NFC reader, manual entry
   - Token display with image, audio, ratings, and descriptions
   - Stats tracking and local storage persistence
   - PWA installation prompts

2. **Service Worker (sw.js)** - Offline functionality
   - Caches app shell and external dependencies (QR Scanner library)
   - Network-first strategy for dynamic content
   - Cache-first for images and audio assets
   - Background sync for token updates
   - Version: 1.0.0 (update when making changes)

3. **Token Database (tokens.json)** - Memory token definitions
   - Each token contains: `id`, `title`, `type`, `rating`, `group`, `description`
   - Optional: `image` path, `audio` path
   - Group names can include multipliers: `"Childhood (x3)"`
   - Special token: `534e2b02` with BMP/WAV assets

### Scanning Technologies

- **QR Scanner**: Uses `qr-scanner@1.4.2` library from unpkg CDN
- **NFC Support**: Web NFC API (`NDEFReader`) for Android devices
- **Manual Entry**: Fallback for testing and iOS devices

### Asset Structure

- `assets/images/` - Memory images (JPG, BMP)
- `assets/audio/` - Memory audio (MP3, WAV)
- `qr-codes/` - Generated QR code PNGs
- `scripts/` - Setup and conversion utilities

## Development Commands

### Initial Setup
```bash
bash scripts/setup.sh
```
Prompts for GitHub username and creates full project structure.

### Generate QR Codes
```bash
python3 generate-qr.py
```
Creates QR codes for all tokens in tokens.json.

### Create Placeholder Assets
```bash
python3 create_placeholders.py
```

### Convert Arduino Assets
```bash
python3 scripts/convert-arduino-assets.py
```
Converts BMP→JPG and WAV→MP3 from Arduino projects.

### Local Development Server
```bash
python3 -m http.server 8000
```
Navigate to http://localhost:8000

### Testing
- Service worker requires HTTPS or localhost
- Clear browser cache when testing SW updates
- Use Chrome DevTools Application tab for PWA testing

## Key Implementation Details

### Token Processing Flow
1. Scan QR/NFC → Extract token ID
2. Normalize ID (lowercase, alphanumeric only)
3. Lookup in tokens.json
4. Display memory with image/audio
5. Update stats and save to localStorage

### Scoring System
- Base score = rating × 100
- Group multiplier from group name (e.g., "x3")
- Total score = base × multiplier
- Tracks unique tokens and groups

### PWA Features
- Installable on mobile devices
- Works fully offline after first visit
- Auto-caches scanned memory assets
- Background sync for token updates

### Browser Compatibility
- QR Scanning: All modern browsers with camera
- NFC: Android Chrome only
- PWA: Chrome, Edge, Safari (limited)
- Service Worker: All modern browsers

## Important Files

- **manifest.sjon** - PWA manifest (note: typo in filename)
- **sw.js** - Service worker must be updated when changing cached files
- **tokens.json** - Add new memories here, then regenerate QR codes

## GitHub Pages Deployment

1. Push all files to GitHub repository
2. Enable Pages in Settings → Pages → Deploy from branch (main)
3. App available at: `https://[username].github.io/[repo-name]/`
4. All paths must be relative for GitHub Pages compatibility

## Adding New Memory Tokens

1. Edit tokens.json with new token data
2. Add images to `assets/images/[token_id].jpg`
3. Add audio to `assets/audio/[token_id].mp3` (optional)
4. Run `python3 generate-qr.py` to create QR codes
5. Commit and push to update live app