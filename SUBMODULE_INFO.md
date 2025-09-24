# Shared Token Database via Git Submodule

This project uses a Git submodule to share the token database with the Player Scanner app.

## Token Repository
The tokens are maintained in: https://github.com/maxepunk/ALN-TokenData

## Structure
The shared `tokens.json` contains both player-facing and GM-facing fields:

```json
{
  "token_id": {
    // Player Scanner uses these:
    "image": "path/to/image",  
    "audio": "path/to/audio",
    "video": "path/to/video",
    "processingImage": "path/to/processingImage",
    
    // GM Scanner uses these:
    "SF_RFID": "token_id",
    "SF_ValueRating": 1-5,
    "SF_MemoryType": "Type",
    "SF_Group": "Group (xN)"
  }
}
```

## Updating Tokens

### Method 1: Edit directly in submodule
```bash
cd data
git checkout main
# Edit tokens.json
git add tokens.json
git commit -m "Update tokens"
git push origin main
cd ..
git add data
git commit -m "Update submodule reference"
git push
```

### Method 2: Update from main repo
```bash
# Update to latest tokens
git submodule update --remote
git add data
git commit -m "Update to latest tokens"
git push
```

## Initial Setup
For new clones:
```bash
git clone --recurse-submodules https://github.com/maxepunk/ALNScanner.git
```

Or if already cloned:
```bash
git submodule init
git submodule update
```

## How It Works
- The app first tries to load from `data/tokens.json` (submodule)
- Falls back to `tokens.json` in root (backward compatibility)
- Falls back to demo data if both fail

## Benefits
- Single source of truth for all token data
- Both Player and GM apps stay synchronized
- Version controlled token history
- Works offline (submodules are local copies)