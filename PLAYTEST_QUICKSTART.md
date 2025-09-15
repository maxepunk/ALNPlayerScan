# Playtest Quickstart Guide

## The 30-Second Version

```bash
# After any token edit, from any location:
python3 sync.py --deploy
```

That's it! This syncs everything and deploys to your live app.

## What This Tool Does

After editing tokens **anywhere** (GM scanner, Player scanner, or shared repo), one command:
1. **Pushes** your changes to the shared token repository
2. **Pulls** everyone else's changes
3. **Regenerates** QR codes (adds new, removes old)
4. **Deploys** to GitHub Pages (with `--deploy`)

## First-Time Setup

```bash
# 1. Clone with submodules
git clone --recurse-submodules [your-repo-url]

# 2. Install Python dependency
pip install qrcode[pil]

# 3. You're ready!
python3 sync.py --deploy
```

## Command Options

```bash
python3 sync.py           # Sync tokens & QR codes locally
python3 sync.py --deploy  # Sync + deploy to GitHub Pages
python3 sync.py --local   # Sync without any GitHub operations
python3 sync.py --help    # Show all options
```

## Real Playtest Workflow

### Morning Prep
```bash
python3 sync.py --deploy
# ✅ Latest tokens loaded
# ✅ QR codes ready to print from qr-codes/
# ✅ Live app updated
```

### During Feedback
```bash
# Edit data/tokens.json with balance changes
python3 sync.py --deploy  
# Changes live in 1-2 minutes!
```

### Player Access
- Players go to: `https://[username].github.io/[repo]/`
- Scan printed QR codes
- App works offline after first load

## How It Works

```
Your Scanner Repo
├── data/              ← Submodule (shared tokens)
│   └── tokens.json    ← Edit this file
├── qr-codes/          ← Auto-generated QR codes
├── sync.py            ← Run this after edits
└── index.html         ← The web app (GitHub Pages)
```

The `data/` folder is a **git submodule** - a shared repository that both GM and Player scanners use. When you run `sync.py`:
- Local edits get pushed to the shared repo
- Other people's edits get pulled down
- QR codes regenerate automatically
- With `--deploy`, everything goes live

## Common Scenarios

### "I edited tokens on my phone via GitHub"
```bash
# On your computer later:
python3 sync.py --deploy
# Pulls those changes and regenerates QR codes
```

### "Multiple people edited tokens"
```bash
python3 sync.py --deploy
# Git handles the merge automatically
```

### "I want to test locally first"
```bash
python3 sync.py --local   # No GitHub operations
# Test your changes
python3 sync.py --deploy  # When ready
```

### "I can't use command line right now"
Go to GitHub Actions tab → "Sync & Deploy" → "Run workflow"

## Tips

- **Always sync after editing** - Makes next playtest smooth
- **Print QR codes** from `qr-codes/` folder
- **Force refresh** on phones if changes don't appear (PWA caches)
- **Check Actions tab** if deploy seems stuck

## Why This Design?

- **One command** for everything
- **Edit anywhere** - changes flow everywhere
- **No configuration** - no API keys or complex setup
- **Git-powered** - full history, easy rollback
- **Offline support** - PWA works without internet

Perfect for rapid iteration during playtesting!