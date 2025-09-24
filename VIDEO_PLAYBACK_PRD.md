# Product Requirements Document: ALN Video Playback & State Synchronization System

## Executive Summary

This PRD defines the architecture and implementation strategy for adding external video playback capabilities to the About Last Night (ALN) memory scanner ecosystem, while establishing the foundation for future GM station synchronization. The system uses an asymmetric communication pattern: HTTP for player scanners (optimized for ESP32), WebSocket for GM stations (real-time sync).

## Architecture Overview

```
┌─────────────────┐                         ┌─────────────────────┐
│ Player Scanner  │──HTTP POST──────────────▶│                     │
│  (PWA/ESP32)    │◀─HTTP Response──────────│   Orchestrator      │
└─────────────────┘                         │   (Node.js)         │
                                            │                     │
┌─────────────────┐                         │ - Game State        │
│  GM Scanner     │◀───WebSocket───────────▶│ - Video Manager     │──VLC HTTP──▶ Projector
│   (Tablet)      │   (bidirectional)       │ - Session Logger    │    API
└─────────────────┘                         │ - Admin Interface   │
                                            └─────────────────────┘
```

## Repository Architecture Decision

### Submodule Strategy
The ALN ecosystem adopts a **hybrid submodule architecture** to balance component independence with system integration:

**Components as Submodules:**
- **aln-memory-scanner** (Player Scanner): Maintains independent GitHub Pages deployment
- **ALNScanner** (GM Scanner): Can be deployed and used standalone
- **ALN-TokenData**: Shared across all components as nested submodule

**Components as Direct Folders:**
- **aln-orchestrator**: New ecosystem-specific component, needs tight integration
- **hardware/esp32**: Hardware implementations share orchestrator configurations
- **shared/**: Utility code that orchestrator imports directly

This architecture enables:
- Independent CI/CD pipelines for each scanner
- Atomic updates to shared token data
- Rapid orchestrator development without submodule overhead
- Gradual migration path from current structure

## 1. Orchestrator Server Design

### 1.1 Technology Stack
- **Language**: Node.js (vanilla ES6 modules, matching existing webapp patterns)
- **Framework**: None (vanilla HTTP/WebSocket servers, following existing pattern)
- **Storage**: JSON files for session logs and state persistence
- **Video Control**: VLC HTTP interface

### 1.2 Server Architecture

```
orchestrator/
├── server.js                 # Main entry point
├── modules/
│   ├── httpServer.js        # HTTP API for player scanners
│   ├── wsServer.js          # WebSocket for GM stations
│   ├── videoManager.js      # VLC control & state
│   ├── gameState.js         # Authoritative game state
│   ├── sessionLogger.js     # JSON session logging
│   └── adminInterface.js    # Web-based admin UI
├── sessions/                 # JSON session logs
├── videos/                   # Video files
├── config/
│   ├── default.json         # Default configuration
│   └── runtime.json         # User-modifiable settings
└── admin/                    # Admin interface HTML/CSS
```

### 1.3 Hardware Requirements
- **Minimum**: Raspberry Pi 4 (4GB RAM) or equivalent
- **Recommended**: Laptop/Mini PC with 8GB RAM
- **Storage**: 32GB minimum (for videos)
- **Network**: Ethernet connection to router
- **Display**: HDMI output to projector

### 1.4 Network Architecture
```
Router (192.168.1.1)
├── Orchestrator (192.168.1.10) - Static IP
├── GM Stations (DHCP)
├── Player Devices (DHCP)
└── Chromecast/Projector (192.168.1.11) - Static IP
```

### 1.5 Core Modules

#### HTTP Server Module
```javascript
// Pseudocode for httpServer.js
class HTTPServer {
    endpoints = {
        'POST /api/scan': handlePlayerScan,
        'GET /api/status': getSystemStatus,
        'GET /api/tokens': getTokenDatabase
    }
    
    handlePlayerScan(request) {
        token = validateToken(request.tokenId)
        
        if (token.hasVideo) {
            if (videoManager.isPlaying()) {
                return { status: 'busy', message: 'Memory processing, try again' }
            }
            
            videoManager.play(token.videoFile)
            wsServer.broadcast({ event: 'video_started', token })
            sessionLogger.log({ type: 'video_trigger', token, device: request.deviceId })
            
            return { 
                status: 'playing', 
                message: 'Memory processing...',
                image: token.processingImage // Optional display image
            }
        } else {
            sessionLogger.log({ type: 'scan', token, device: request.deviceId })
            wsServer.broadcast({ event: 'token_scanned', token })
            return { status: 'logged' }
        }
    }
}
```

#### WebSocket Server Module
```javascript
// Pseudocode for wsServer.js
class WebSocketServer {
    connections = new Map() // gmStationId -> connection
    
    onConnection(ws, request) {
        stationId = parseStationId(request)
        connections.set(stationId, ws)
        
        // Send current state on connect
        ws.send({ 
            type: 'state_sync',
            transactions: gameState.getTransactions(),
            scores: gameState.calculateAllScores()
        })
        
        ws.on('message', (data) => {
            if (data.type === 'transaction') {
                gameState.addTransaction(data.transaction)
                recalculateScores()
                broadcastStateUpdate()
            }
        })
    }
    
    broadcastStateUpdate() {
        update = {
            type: 'state_update',
            transactions: gameState.getRecentTransactions(),
            scores: gameState.calculateAllScores(),
            groupCompletions: gameState.getCompletedGroups()
        }
        broadcast(update)
    }
}
```

#### Video Manager Module
```javascript
// Pseudocode for videoManager.js
class VideoManager {
    vlcEndpoint = 'http://localhost:8080/requests/status.json'
    currentVideo = null
    
    async play(videoFile) {
        // VLC HTTP API call
        response = await fetch(vlcEndpoint + '?command=in_play&input=' + videoFile)
        currentVideo = { file: videoFile, startTime: Date.now() }
        monitorPlayback()
    }
    
    async stop() {
        response = await fetch(vlcEndpoint + '?command=pl_stop')
        currentVideo = null
        wsServer.broadcast({ event: 'video_stopped' })
    }
    
    isPlaying() {
        return currentVideo !== null
    }
}
```

#### Game State Module
```javascript
// Pseudocode for gameState.js
class GameState {
    transactions = []
    scannedTokens = new Set()
    
    addTransaction(transaction) {
        // Check for duplicates
        if (scannedTokens.has(transaction.tokenId)) {
            return { error: 'duplicate' }
        }
        
        transactions.push(transaction)
        scannedTokens.add(transaction.tokenId)
        return { success: true }
    }
    
    calculateAllScores() {
        // Group all transactions by team
        teams = groupByTeam(transactions)
        
        return teams.map(team => {
            completedGroups = getCompletedGroups(team.transactions)
            baseScore = calculateBaseScore(team.transactions)
            bonusScore = calculateGroupBonuses(team.transactions, completedGroups)
            
            return {
                teamId: team.id,
                baseScore,
                bonusScore,
                totalScore: baseScore + bonusScore,
                completedGroups
            }
        })
    }
    
    getCompletedGroups(transactions) {
        // Logic matching GM scanner's group completion detection
        groups = buildGroupInventory(transactions)
        return groups.filter(group => 
            group.collected.size === group.total && 
            group.multiplier > 1
        )
    }
}
```

### 1.6 VLC Configuration
```bash
# Launch VLC with HTTP interface
vlc --intf http --http-password aln2024 \
    --fullscreen --no-video-title-show \
    --http-host 0.0.0.0 --http-port 8080
```

### 1.7 Admin Interface Features
- **Video Control**: Stop/Skip current video
- **System Status**: Current video, queue status, connected devices
- **Activity Log**: Real-time scan events with filtering
- **GM Station Monitor**: List of connected stations with status
- **Manual Triggers**: Test video playback
- **Configuration**: 
  - Network settings
  - Video file mappings
  - Session parameters
- **Session Management**:
  - Export session data
  - Manual score adjustments
  - Add/remove transactions

## 2. Player Scanner Implementation

### 2.1 Token Detection Logic Enhancement
```javascript
// Pseudocode for player scanner token processing
class MemoryScanner {
    async processToken(tokenId) {
        token = tokens[tokenId]
        
        // Determine token type by asset availability
        hasImage = token.image !== null
        hasAudio = token.audio !== null
        hasVideo = token.video !== null  // NEW field
        
        if (hasVideo) {
            // Video token - send to orchestrator
            response = await fetch(orchestratorUrl + '/api/scan', {
                method: 'POST',
                body: JSON.stringify({
                    tokenId: tokenId,
                    deviceId: getDeviceId(),
                    timestamp: Date.now()
                })
            })
            
            if (response.status === 'playing') {
                showProcessingScreen(token.processingImage)
            } else if (response.status === 'busy') {
                showBusyMessage()
            }
        } else if (hasImage || hasAudio) {
            // Standard memory token - local playback
            displayMemory(token)
        }
    }
}
```

### 2.2 Network Configuration
```javascript
// Pseudocode for orchestrator connection
class OrchestratorClient {
    constructor() {
        // Try to auto-discover orchestrator via mDNS
        this.baseUrl = discoverOrchestrator() || 'http://192.168.1.10:3000'
    }
    
    async scanToken(tokenId) {
        try {
            response = await fetchWithTimeout(this.baseUrl + '/api/scan', {
                method: 'POST',
                body: JSON.stringify({ tokenId, deviceId: this.deviceId })
            }, 5000) // 5 second timeout
            
            return response.json()
        } catch (error) {
            return { status: 'offline', error: error.message }
        }
    }
}
```

## 3. GM Scanner Implementation

### 3.1 WebSocket Integration
```javascript
// Pseudocode for GM scanner WebSocket client
const OrchestratorSync = {
    ws: null,
    connected: false,
    localQueue: [],
    
    connect() {
        this.ws = new WebSocket('ws://192.168.1.10:3000/gm')
        
        this.ws.onopen = () => {
            this.connected = true
            // Send queued transactions
            this.flushQueue()
            // Request full state sync
            this.ws.send({ type: 'request_sync' })
        }
        
        this.ws.onmessage = (event) => {
            data = JSON.parse(event.data)
            
            if (data.type === 'state_sync') {
                // Full state replacement
                DataManager.replaceTransactions(data.transactions)
                UIManager.updateScoreboard(data.scores)
            } else if (data.type === 'state_update') {
                // Incremental update
                DataManager.mergeTransactions(data.transactions)
                UIManager.updateScoreboard(data.scores)
            } else if (data.type === 'video_started') {
                UIManager.showVideoIndicator(data.token)
            }
        }
        
        this.ws.onclose = () => {
            this.connected = false
            // Fallback to local mode
            setTimeout(() => this.connect(), 5000) // Reconnect
        }
    },
    
    sendTransaction(transaction) {
        if (this.connected) {
            this.ws.send({ type: 'transaction', transaction })
        } else {
            // Queue for later
            this.localQueue.push(transaction)
        }
    }
}
```

### 3.2 Fallback Mode
```javascript
// Pseudocode for offline operation
const DataManager = {
    addTransaction(transaction) {
        // Always save locally first
        this.transactions.push(transaction)
        this.saveToLocalStorage()
        
        // Try to sync with orchestrator
        if (OrchestratorSync.connected) {
            OrchestratorSync.sendTransaction(transaction)
        }
        
        // Calculate scores locally if offline
        if (!OrchestratorSync.connected) {
            this.calculateLocalScores()
        }
    }
}
```

## 4. Token Data Structure Updates

### 4.1 Video Token Format
```json
{
  "video_moment_001": {
    "SF_RFID": "video_moment_001",
    "SF_ValueRating": 5,
    "SF_MemoryType": "Narrative",
    "SF_Group": "Critical Moments (x10)",
    "video": "videos/revelation_scene.mp4",
    "processingImage": "assets/images/processing_screen.jpg",
    "image": null,
    "audio": null
  }
}
```

### 4.2 Token Detection Logic
- If `video` field exists and is not null → Video token
- If `image` field exists and is not null → Image token
- If `audio` field exists and is not null → Audio token
- Combinations possible (except video + others)

## 5. ESP32 Implementation Guidelines

### 5.1 File Structure for Video Tokens
```
SD Card/
├── images/
│   └── video_moment_001.jpg  # Processing screen image
├── audio/
└── markers/
    └── video_moment_001.vid   # Empty marker file indicating video token
```

### 5.2 Token Detection Logic
```cpp
// Pseudocode for ESP32 token detection
TokenType detectTokenType(String tokenId) {
    String imagePath = "/images/" + tokenId + ".jpg";
    String audioPath = "/audio/" + tokenId + ".mp3";
    String videoMarker = "/markers/" + tokenId + ".vid";
    
    if (SD.exists(videoMarker)) {
        return TOKEN_VIDEO;
    } else if (SD.exists(imagePath) && SD.exists(audioPath)) {
        return TOKEN_IMAGE_AUDIO;
    } else if (SD.exists(imagePath)) {
        return TOKEN_IMAGE;
    } else if (SD.exists(audioPath)) {
        return TOKEN_AUDIO;
    } else {
        return TOKEN_UNKNOWN;
    }
}
```

### 5.3 Network Communication
```cpp
// Pseudocode for ESP32 HTTP client
class OrchestratorClient {
    String serverUrl = "http://192.168.1.10:3000";
    
    void sendScan(String tokenId, TokenType type) {
        if (type == TOKEN_VIDEO) {
            HTTPClient http;
            http.begin(serverUrl + "/api/scan");
            http.addHeader("Content-Type", "application/json");
            
            String payload = "{\"tokenId\":\"" + tokenId + "\",\"deviceId\":\"" + deviceId + "\"}";
            int responseCode = http.POST(payload);
            
            if (responseCode == 200) {
                String response = http.getString();
                // Parse response and show appropriate screen
                if (response.contains("playing")) {
                    showProcessingImage(tokenId);
                } else if (response.contains("busy")) {
                    showBusyMessage();
                }
            }
            
            http.end();
            
            // Enter deep sleep to save battery
            esp_sleep_enable_timer_wakeup(100000); // 100ms
            esp_deep_sleep_start();
        } else {
            // Handle local playback for non-video tokens
            handleLocalToken(tokenId, type);
        }
    }
}
```

### 5.4 Power Management Strategy
```cpp
// Aggressive power saving for battery life
void configurePowerSaving() {
    // WiFi power saving mode
    esp_wifi_set_ps(WIFI_PS_MAX_MODEM);
    
    // CPU frequency scaling
    setCpuFrequencyMhz(80); // Lower frequency when idle
    
    // Deep sleep between scans
    if (!activePlayback) {
        esp_deep_sleep_start();
    }
}
```

## 6. Network Configuration

### 6.1 Router Setup
```
DHCP Range: 192.168.1.100 - 192.168.1.200
Static Assignments:
- Orchestrator: 192.168.1.10
- Projector/Chromecast: 192.168.1.11
- Admin Laptop: 192.168.1.12

WiFi Settings:
- SSID: ALN_GAME_NET
- Password: [secure password]
- Channel: 6 (or least congested)
- 2.4GHz only (for ESP32 compatibility)
```

### 6.2 mDNS Service Discovery
```javascript
// Orchestrator advertises itself
mdns.advertise({
    name: 'aln-orchestrator',
    type: 'http',
    port: 3000,
    txt: {
        version: '1.0',
        api: '/api'
    }
})
```

## 7. Testing & Deployment

### 7.1 Test Scenarios
1. **Video Playback**: Single player triggers video
2. **Concurrency**: Multiple players scan simultaneously
3. **Network Failure**: Orchestrator goes offline mid-session
4. **State Recovery**: GM station reconnects after disconnect
5. **Score Calculation**: Verify group bonuses calculate correctly
6. **ESP32 Battery**: Measure power consumption over session

### 7.2 Deployment Steps
```bash
# 1. Setup orchestrator hardware
# 2. Install Node.js
# 3. Clone orchestrator repository
git clone [orchestrator-repo]
cd aln-orchestrator
npm install

# 4. Configure VLC
sudo apt install vlc
# Copy VLC launch script

# 5. Configure network
# Set static IP
# Configure firewall

# 6. Copy video files
cp /path/to/videos/* ./videos/

# 7. Update token database
# Add video field to relevant tokens

# 8. Start services
npm start

# 9. Access admin interface
# http://192.168.1.10:3000/admin
```

### 7.3 Session Checklist
- [ ] Orchestrator running
- [ ] VLC configured and running
- [ ] Projector connected and working
- [ ] Network configured
- [ ] GM stations connected
- [ ] Test video playback
- [ ] Verify scoring sync
- [ ] Check session logging

## 8. Future Enhancements

### Phase 2: Enhanced Synchronization
- Real-time leaderboard on external display
- Cross-venue synchronization
- Cloud backup of session data

### Phase 3: Advanced Features
- Multiple video displays
- Dynamic video selection based on game state
- Player-specific video triggers
- Integration with lighting/sound systems

## Appendix A: Configuration Schema

```json
{
  "network": {
    "orchestratorIp": "192.168.1.10",
    "orchestratorPort": 3000,
    "vlcPort": 8080,
    "vlcPassword": "aln2024"
  },
  "videos": {
    "directory": "./videos",
    "supportedFormats": ["mp4", "mkv", "avi"]
  },
  "session": {
    "name": "Session_${date}",
    "logLevel": "info",
    "autoExport": true
  },
  "game": {
    "mode": "blackmarket",
    "duplicateProtection": true,
    "groupBonuses": true
  }
}
```

## Appendix B: API Reference

### Player Scanner API
```
POST /api/scan
Body: { tokenId, deviceId, timestamp }
Response: { status: 'playing'|'busy'|'logged', message?, image? }

GET /api/status
Response: { orchestratorVersion, videoPlaying, connectedDevices }
```

### GM Scanner WebSocket Events
```
Client → Server:
{ type: 'transaction', transaction: {...} }
{ type: 'request_sync' }

Server → Client:
{ type: 'state_sync', transactions: [...], scores: [...] }
{ type: 'state_update', transactions: [...], scores: [...] }
{ type: 'video_started', token: {...} }
{ type: 'video_stopped' }
```

### Admin API
```
POST /api/admin/video/stop
POST /api/admin/video/play
Body: { tokenId }

GET /api/admin/session/export
Response: JSON session data

POST /api/admin/transaction/adjust
Body: { teamId, adjustment, reason }
```

## Appendix C: Repository Architecture & Submodule Structure

### C.1 Architecture Philosophy

The ALN ecosystem uses a **hybrid orchestrated model** combining Git submodules for existing components with direct folders for new ecosystem-specific components. This approach balances independence, reusability, and development efficiency.

**Key Principles:**
- **Preserve Independence**: Existing scanners maintain separate repos for independent deployment
- **Single Source of Truth**: Token data shared via nested submodules
- **Tight Integration**: Orchestrator as direct folder for rapid iteration
- **Gradual Migration**: No breaking changes to current workflows

### C.2 Detailed Repository Structure

```
ALN-Ecosystem/                          [Parent Repository - NEW]
├── .gitmodules                         [Submodule configuration]
├── README.md                           [System overview & setup]
├── docker-compose.yml                  [Full stack deployment]
├── .env.example                        [Environment variables template]
│
├── aln-memory-scanner/                 [SUBMODULE - Existing repo]
│   ├── index.html                      [Player scanner PWA]
│   ├── sw.js                          [Service worker]
│   ├── assets/                        [Images/audio]
│   ├── data/                          [NESTED SUBMODULE → ALN-TokenData]
│   └── .github/workflows/             [GitHub Pages deployment]
│
├── ALNScanner/                         [SUBMODULE - Existing repo]
│   ├── index.html                      [GM scanner interface]
│   ├── data/                          [NESTED SUBMODULE → ALN-TokenData]
│   └── sync.py                        [Token sync utilities]
│
├── ALN-TokenData/                      [SUBMODULE - Shared data]
│   └── tokens.json                    [Master token database]
│
├── aln-orchestrator/                   [DIRECT FOLDER - NEW]
│   ├── server.js                      [Main entry point]
│   ├── package.json                   [Dependencies]
│   ├── modules/
│   │   ├── httpServer.js             [Player scanner API]
│   │   ├── wsServer.js               [GM WebSocket server]
│   │   ├── videoManager.js           [VLC control]
│   │   ├── gameState.js              [Authoritative state]
│   │   ├── sessionLogger.js          [JSON logging]
│   │   └── adminInterface.js         [Web admin UI]
│   ├── sessions/                      [Session data storage]
│   ├── videos/                        [Video files]
│   ├── config/
│   │   ├── default.json              [Default settings]
│   │   └── runtime.json              [User settings]
│   └── admin/                         [Admin interface files]
│
├── hardware/                           [DIRECT FOLDER - Future]
│   └── esp32/                         [ESP32 implementation]
│       ├── src/
│       ├── platformio.ini
│       └── README.md
│
├── shared/                             [DIRECT FOLDER - Utilities]
│   ├── constants.js                   [Shared constants]
│   ├── scoring-engine.js              [Unified scoring logic]
│   └── token-validator.js             [Token validation]
│
└── scripts/                            [DIRECT FOLDER - DevOps]
    ├── setup-ecosystem.sh              [Initial setup script]
    ├── update-tokens.sh                [Token sync helper]
    ├── deploy-scanners.sh              [Deploy to GitHub Pages]
    └── start-dev.sh                    [Development environment]
```

### C.3 Component Types & Rationale

| Component | Type | Rationale |
|-----------|------|-----------|
| aln-memory-scanner | Submodule | Needs independent GitHub Pages deployment, existing history |
| ALNScanner | Submodule | Independent deployment, may be used standalone |
| ALN-TokenData | Nested Submodule | Single source of truth, version controlled |
| aln-orchestrator | Direct Folder | Ecosystem-specific, needs tight integration |
| hardware/esp32 | Direct Folder | Hardware-specific, shares orchestrator configs |
| shared/ | Direct Folder | Needs direct import by orchestrator |

### C.4 Implementation Steps

```bash
# 1. Initialize ALN-Ecosystem parent repository
cd /home/spide/projects/AboutLastNight/ALN-Ecosystem
git init
git remote add origin https://github.com/[username]/ALN-Ecosystem.git

# 2. Add existing components as submodules
git submodule add https://github.com/[username]/aln-memory-scanner.git
git submodule add https://github.com/[username]/ALNScanner.git
git submodule add https://github.com/[username]/ALN-TokenData.git

# 3. Configure nested submodules to auto-update
git config --file=.gitmodules submodule.aln-memory-scanner.recurse true
git config --file=.gitmodules submodule.ALNScanner.recurse true

# 4. Create orchestrator directly in parent repo
mkdir -p aln-orchestrator/modules
mkdir -p aln-orchestrator/config
mkdir -p aln-orchestrator/admin
mkdir -p aln-orchestrator/sessions
mkdir -p aln-orchestrator/videos

# 5. Create shared utilities
mkdir -p shared
mkdir -p scripts
mkdir -p hardware/esp32

# 6. Initial commit
git add .
git commit -m "Initial ALN ecosystem structure with submodules"
git push -u origin main
```

### C.5 Development Workflow

#### Working with Submodules
```bash
# Clone entire ecosystem with submodules
git clone --recurse-submodules https://github.com/[username]/ALN-Ecosystem.git

# Update all submodules to latest
git submodule update --remote --merge

# Work on specific scanner
cd aln-memory-scanner
git checkout main
# Make changes
git commit -m "Update feature"
git push
cd ..
git add aln-memory-scanner
git commit -m "Update scanner submodule reference"
```

#### Updating Shared Tokens
```bash
# Update tokens in all components
cd ALN-TokenData
git checkout main
# Edit tokens.json
git commit -m "Add new video tokens"
git push

# Update references in parent
cd ..
git submodule update --remote ALN-TokenData
git add ALN-TokenData aln-memory-scanner ALNScanner
git commit -m "Update token database across all components"
```

### C.6 Deployment Strategies

| Component | Deployment Method | Trigger |
|-----------|------------------|---------|
| Player Scanner | GitHub Pages (Actions) | Push to scanner repo |
| GM Scanner | GitHub Pages (Actions) | Push to scanner repo |
| Token Data | Auto-pulled by scanners | Submodule update |
| Orchestrator | Docker/SystemD on server | Push to ecosystem repo |
| Admin Interface | Served by orchestrator | Part of orchestrator |

### C.7 Environment Configuration

```env
# .env.example for ALN-Ecosystem
ORCHESTRATOR_IP=192.168.1.10
ORCHESTRATOR_PORT=3000
VLC_PORT=8080
VLC_PASSWORD=aln2024
VIDEO_DIR=./aln-orchestrator/videos
SESSION_DIR=./aln-orchestrator/sessions
ADMIN_PASSWORD=change_me_in_production
```

### C.8 Docker Deployment (Optional)

```yaml
# docker-compose.yml
version: '3.8'
services:
  orchestrator:
    build: ./aln-orchestrator
    ports:
      - "3000:3000"
    volumes:
      - ./aln-orchestrator/videos:/app/videos
      - ./aln-orchestrator/sessions:/app/sessions
      - ./ALN-TokenData:/app/tokens
    environment:
      - NODE_ENV=production
    restart: unless-stopped

  vlc:
    image: vanhemn/vlc-http
    ports:
      - "8080:8080"
    volumes:
      - ./aln-orchestrator/videos:/videos
    environment:
      - VLC_PASSWORD=${VLC_PASSWORD}
```

---

*This PRD defines the complete architecture for video playback and state synchronization in the ALN game ecosystem, using a hybrid submodule approach that maintains component independence while enabling tight orchestration.*