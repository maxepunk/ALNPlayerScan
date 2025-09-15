# Git Submodule Setup for Shared Tokens

This project uses a Git submodule to share `tokens.json` between the Player Scanner and GM Scanner apps.

## Initial Setup (For New Clones)

When cloning this repository for the first time:

```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/maxepunk/ALNPlayerScan.git

# OR if already cloned without submodules:
git submodule init
git submodule update
```

## Updating Tokens

The tokens are stored in the separate repository: https://github.com/maxepunk/ALN-TokenData

### To Update Tokens:

1. **Option A: Edit in the submodule directly**
```bash
cd data
git checkout main
# Edit tokens.json
git add tokens.json
git commit -m "Update tokens"
git push origin main
cd ..
git add data
git commit -m "Update token submodule reference"
git push
```

2. **Option B: Edit in the main TokenData repo**
```bash
# In a separate directory
git clone https://github.com/maxepunk/ALN-TokenData.git
cd ALN-TokenData
# Edit tokens.json
git add tokens.json
git commit -m "Update tokens"
git push

# Then in this project, update the submodule
cd /path/to/ALNPlayerScan
git submodule update --remote
git add data
git commit -m "Update token submodule to latest"
git push
```

## Pulling Latest Changes

To get the latest tokens when someone else has updated them:

```bash
git pull
git submodule update --remote
```

## File Paths

The app will try to load tokens from these locations in order:
1. `data/tokens.json` (submodule - preferred)
2. `tokens.json` (root - backward compatibility)
3. Embedded fallback tokens (if both fail)

## Python Scripts

All Python scripts (generate-qr.py, create_placeholders.py, convert-arduino-assets.py) automatically check both locations.

## Troubleshooting

If tokens aren't loading:
1. Check submodule is initialized: `git submodule status`
2. Update submodule: `git submodule update --init --remote`
3. Verify file exists: `ls data/tokens.json`

## For GM Scanner App

The same submodule should be added to the GM Scanner app:
```bash
cd ALNScanner
git submodule add https://github.com/maxepunk/ALN-TokenData.git data
git commit -m "Add ALN-TokenData submodule"
git push
```

Then update the GM app to load from `data/tokens.json` instead of `tokens.json`.