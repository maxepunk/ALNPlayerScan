# GitHub Pages & Playtest Workflow

## How Everything Connects

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Shared Tokens  │────▶│   GM Scanner     │────▶│  GitHub Pages   │
│  (ALN-TokenData)│     │  (This Repo)     │     │   (Live App)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        ▲                        │                        │
        │                        │                        ▼
        │                        │                 ┌─────────────┐
        │                        │                 │   Players   │
        └────────────────────────┘                 │  Scan QRs   │
                                                   └─────────────┘
```

## The Complete Flow

### 1. Edit Tokens (Anywhere)
- Edit `data/tokens.json` in GM scanner
- OR edit in Player scanner  
- OR edit directly in ALN-TokenData repo

### 2. Sync & Deploy
```bash
python3 sync.py --deploy
```
This single command:
- Pushes your edits to shared token repo
- Pulls everyone else's edits
- Regenerates QR codes
- Commits everything
- **Pushes to GitHub Pages**

### 3. Players Access Live App
- Go to: `https://[username].github.io/[repo]/`
- App loads latest `data/tokens.json`
- Scan QR codes to collect memories
- Audio/images load from `assets/`

## Two Deployment Options

### Option A: Command Line (Fastest)
```bash
python3 sync.py --deploy   # Does everything including deploy
```

### Option B: GitHub Actions (From Browser)
1. Go to Actions tab
2. Click "Sync & Deploy"  
3. Click "Run workflow"
4. Wait ~2 minutes for deployment

## What Gets Deployed

When you run with `--deploy`, these update on GitHub Pages:
- `data/tokens.json` - Latest token data
- `qr-codes/*.png` - Fresh QR codes for printing
- `index.html` - The scanner PWA (if you edited it)
- `assets/` - Images and audio (if you added any)

## Typical Playtest Day

**Morning - Prep:**
```bash
# Get latest changes and deploy
python3 sync.py --deploy
# Print new QR codes from qr-codes/ folder
```

**During Playtest:**
- Players use phones to access GitHub Pages URL
- Scan QR codes to reveal memories
- PWA works offline after first load

**After Feedback:**
```bash
# Edit data/tokens.json with balance changes
python3 sync.py --deploy
# Changes live in 1-2 minutes!
```

**Next Day:**
- Other GM pulls changes: `python3 sync.py`
- Makes their edits
- Deploys: `python3 sync.py --deploy`

## Important Notes

### Deployment Timing
- GitHub Pages takes 1-2 minutes to update after push
- Service Worker may cache old version for up to 5 minutes
- Players can force refresh to get latest immediately

### Asset Management
- Images/audio in `assets/` are NOT in the shared submodule
- Each scanner repo has its own assets
- Consider using URLs for shared assets instead

### Offline Support
- Once loaded, the PWA works offline
- Players can scan QR codes without internet
- Collections are saved in browser localStorage

## Quick Reference

```bash
# Just sync tokens locally
python3 sync.py

# Sync and deploy to live site  
python3 sync.py --deploy

# Sync locally only (no GitHub operations)
python3 sync.py --local

# See all options
python3 sync.py --help
```

## Troubleshooting

**"Changes aren't showing on GitHub Pages"**
- Wait 2 minutes for deployment
- Check Actions tab for deployment status
- Have players force refresh (Ctrl+Shift+R)

**"Can't push to GitHub"**
- Check you're on main branch: `git branch`
- Pull latest first: `git pull`
- Then retry: `python3 sync.py --deploy`

**"Submodule issues"**
- Reset submodule: `git submodule update --force`
- Then sync: `python3 sync.py`

## The Beauty of This System

1. **One Command**: `sync.py --deploy` does everything
2. **Edit Anywhere**: Changes flow to all repos automatically
3. **Live Updates**: Players always get latest via GitHub Pages
4. **No Config**: No API keys, tokens, or complex setup
5. **Git History**: Every change is tracked and reversible

Perfect for rapid iteration during playtesting!