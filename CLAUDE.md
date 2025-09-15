# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALN Memory Scanner is a Progressive Web App (PWA) for a live-action role-playing game. It allows Game Masters to scan QR codes/RFID tokens to display memory information to players, including images and audio. The app is designed to work offline and can be deployed as a GitHub Pages site.

## Key Architecture

### Token Data Management
- **Shared Database**: Uses Git submodule at `data/` linked to https://github.com/maxepunk/ALN-TokenData
- **Token Structure**: Each token has GM fields (`SF_RFID`, `SF_ValueRating`, `SF_MemoryType`, `SF_Group`) and player fields (`image`, `audio`)
- **Fallback Chain**: App loads from `data/tokens.json` → `tokens.json` (root) → demo data

### Core Components
- **index.html**: Single-page PWA with integrated JavaScript for QR scanning, collection management, and UI
- **sw.js**: Service worker for offline functionality and caching
- **manifest.json**: PWA configuration (note: actual file is `manifest.sjon` - typo in filename)

## Development Commands

### Generate QR Codes
```bash
python3 generate-qr.py
```
Generates QR codes in `qr-codes/` directory with options for:
- Simple black & white
- Labeled (with metadata)
- Colored (by memory type)

### Create Placeholder Images
```bash
python3 create_placeholders.py
```
Creates placeholder images for tokens without actual images.

### Convert Arduino Assets
```bash
python3 convert-arduino-assets.py
```
Converts assets for Arduino/embedded system compatibility.

### Initial Setup
```bash
bash scripts/setup.sh
```
Interactive setup script for creating project structure and GitHub Pages deployment.

### Update Token Submodule
```bash
# Get latest tokens from shared repository
git submodule update --remote

# Or edit tokens directly
cd data
git checkout main
# Edit tokens.json
git add tokens.json
git commit -m "Update tokens"
git push origin main
cd ..
git add data
git commit -m "Update submodule reference"
```

## Testing

### Local Testing
1. Use any local web server (e.g., `python3 -m http.server 8000`)
2. Open browser to `http://localhost:8000`
3. Test QR scanning with generated codes from `qr-codes/`

### PWA Testing
- Install as PWA via browser's "Add to Home Screen"
- Test offline functionality after caching
- Verify service worker in DevTools > Application

## Deployment

### GitHub Pages
1. Push to main branch
2. GitHub Pages serves from root directory
3. Access at: `https://[username].github.io/[repo-name]/`

## Important Notes

- **No Build Process**: Pure HTML/JS/CSS, no compilation needed
- **External Dependencies**: QR Scanner library loaded from CDN (unpkg.com)
- **Asset Paths**: All paths relative to support GitHub Pages subdirectory hosting
- **Token Updates**: Changes to shared tokens require submodule update in both Player and GM scanner apps