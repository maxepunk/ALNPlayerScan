# ALN Memory Scanner - Player Edition

A Progressive Web App for the "About Last Night" immersive crime thriller game. Players scan QR/NFC memory tokens to reveal their content — memory images and audio — and, in networked mode, trigger orchestrator-controlled video playback on the shared screen. This is the intel-gathering scanner: it does NOT score or process transactions (that is the separate GM scanner).

## 🎮 For Playtesting

**Quick sync after any token edit:**
```bash
python3 sync.py --deploy
```

See [PLAYTEST_QUICKSTART.md](PLAYTEST_QUICKSTART.md) for the complete playtest workflow.

## 🚀 Features

- **QR Code Scanning**: Scan tokens to reveal memories
- **Offline Support**: Works without internet after first load
- **Audio/Visual**: Display images and play audio for each memory
- **Collection Tracking**: Players build their memory collection
- **Token management & playtest tools**: Token sync and balance testing

## 📁 Project Structure

```
aln-memory-scanner/
├── index.html              # Main PWA application
├── sync.py                 # Sync & deployment tool
├── data/                   # Shared token database (git submodule)
│   └── tokens.json         # Token definitions
├── qr-codes/               # Generated QR codes for printing
├── assets/                 # Memory images and audio
└── .github/workflows/      # GitHub Actions automation
```

## 🛠️ Setup

### Prerequisites
- Python 3 with pip
- Git

### Installation
```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/[user]/aln-memory-scanner
cd aln-memory-scanner

# Install dependencies
pip install qrcode[pil]

# Initial sync
python3 sync.py --deploy
```

## 📖 Documentation

- [PLAYTEST_QUICKSTART.md](PLAYTEST_QUICKSTART.md) - Essential playtest workflow
- [GITHUB_PAGES_WORKFLOW.md](GITHUB_PAGES_WORKFLOW.md) - Deployment details
- [SUBMODULE_INFO.md](SUBMODULE_INFO.md) - Token sharing system
- [CLAUDE.md](CLAUDE.md) - AI assistant context

## 🔄 Token Management

Tokens can be edited in three places:
1. This player scanner (`data/tokens.json`)
2. GM scanner (separate repo)
3. Shared token repository (ALN-TokenData)

After any edit, run `python3 sync.py --deploy` to sync everywhere.

## 🌐 Live App

After deployment, your app is available at:
```
https://[username].github.io/aln-memory-scanner/
```

Players access this URL on their phones to scan QR codes and collect memories.

## 🎯 Workflow Overview

1. **Edit** tokens in `data/tokens.json`
2. **Sync** with `python3 sync.py --deploy`
3. **Print** QR codes from `qr-codes/` folder
4. **Play** - Players scan codes via the web app
5. **Iterate** - Adjust balance based on feedback

## 🤝 Contributing

This is a prototype for playtesting. Feel free to fork and adapt for your own immersive games!

## 📝 License

MIT - Use this however you like for your own projects.

---

*Built for rapid iteration during playtesting of immersive crime thriller experiences.*