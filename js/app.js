/**
 * app.js — Main MemoryScanner application class + bootstrap.
 *
 * Depends on (loaded before this script via classic script tags):
 *   - window.scannerCore   (js/scannerCore.js)
 *   - window.tokenDisplay  (js/tokenDisplay.js)
 *   - OrchestratorIntegration class (js/orchestratorIntegration.js)
 *   - QrScanner            (CDN: qr-scanner.umd.min.js)
 *
 * Browser: creates window.app (MemoryScanner instance) and window.orchestrator.
 * Not exported to Node.js — DOM-dependent throughout.
 */

class MemoryScanner {
  constructor() {
    this.scanner = null;
    this.isScanning = false;
    this.scannedTokens = new Set();
    this.tokens = {};
    this.currentToken = null;
    this.currentAudio = null;
    this.deferredPrompt = null;

    this.init();
  }

  async init() {
    try {
      // Load token database from external file
      await this.loadTokenDatabase();

      // Record the pack identity for staleness visibility (best-effort,
      // non-blocking — fire and forget)
      this.loadPackInfo();

      // Setup capabilities
      this.checkCapabilities();

      // Setup PWA
      this.setupPWA();

      // Load saved data
      this.loadSavedData();

      // Setup event listeners
      this.setupEventListeners();

      // Hide loading, show welcome
      document.getElementById('loadingScreen').style.display = 'none';
      document.getElementById('welcomeScreen').classList.remove('hidden');

      // Check for token in URL parameter (from NFC tag tap)
      this.handleUrlToken();

    } catch (error) {
      console.error('Initialization error:', error);
      tokenDisplay.showError('Failed to initialize app. Please refresh.');
    }
  }

  async loadTokenDatabase() {
    try {
      // Try loading from submodule path first
      const response = await fetch('./data/tokens.json');
      if (!response.ok) {
        throw new Error('Failed to load token database from submodule');
      }
      this.tokens = await response.json();
      console.log(`✅ Loaded ${Object.keys(this.tokens).length} tokens from data/tokens.json`);
    } catch (error) {
      console.error('Error loading data/tokens.json:', error);
      try {
        // Fallback to root directory (for backward compatibility)
        const response = await fetch('./tokens.json');
        if (!response.ok) {
          throw new Error('Failed to load token database');
        }
        this.tokens = await response.json();
        console.log(`✅ Loaded ${Object.keys(this.tokens).length} tokens from tokens.json`);
      } catch (error2) {
        console.error('Error loading tokens.json:', error2);
        // Fallback to embedded tokens
        this.tokens = this.getDefaultTokens();
        console.log('⚠️ Using fallback token database');
      }
    }
  }

  /**
   * A2 staleness visibility (scoped: identity ONLY — the PWA displays
   * media, it doesn't score, so full staged pack refresh is deliberately
   * deferred; see the parent repo's transitional-debt ledger entry L3).
   * Fetches the pack manifest network-first from the deployment's pack
   * channel (orchestrator-served → /api/pack/manifest; Pages/standalone →
   * the live submodule copy at ./data/) and records the pack identity for
   * the config page display.
   */
  async loadPackInfo() {
    const pathname = window.location.pathname;
    const url = (pathname.startsWith('/player-scanner'))
      ? '/api/pack/manifest'
      : './data/pack-manifest.json';
    this.packInfo = null;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const manifest = await response.json();
        if (manifest && manifest.contentHash) {
          this.packInfo = {
            packId: manifest.packId,
            version: manifest.version,
            contentHash: manifest.contentHash
          };
          console.log(`📦 Pack: ${manifest.packId} v${manifest.version} (${String(manifest.contentHash).slice(7, 15)})`);
          try {
            localStorage.setItem('aln_pack_info', JSON.stringify(this.packInfo));
          } catch (e) { /* quota — display is best-effort */ }
        }
      }
    } catch (error) {
      // Offline / pre-pack deploy — identity stays null, app runs normally
      console.log('Pack manifest unavailable (offline or pre-pack deploy)');
    }
    return this.packInfo;
  }

  getDefaultTokens() {
    // Minimal fallback tokens if tokens.json fails to load
    return {
      'test_001': {
        SF_RFID: 'test_001',
        SF_ValueRating: 3,
        SF_MemoryType: 'Test',
        SF_Group: 'Development',
        image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"%3E%3Crect fill="%23888" width="400" height="400"/%3E%3Ctext x="50%25" y="50%25" font-size="120" fill="white" text-anchor="middle" dominant-baseline="middle"%3E❓%3C/text%3E%3C/svg%3E',
        audio: null
      }
    };
  }

  checkCapabilities() {
    const info = document.getElementById('scanMethodInfo');
    const capabilities = [];

    // Check for camera/QR scanning
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      capabilities.push('📷 QR Scanner');
    }

    // Check for NFC
    if ('NDEFReader' in window) {
      capabilities.push('📡 NFC');
      document.getElementById('nfcIndicator').classList.add('active');
    }

    capabilities.push('⌨️ Manual Entry');

    info.innerHTML = `Available: ${capabilities.join(' • ')}`;
  }

  setupPWA() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(_reg => console.log('✅ Service Worker registered'))
        .catch(err => console.log('⚠️ Service Worker registration failed:', err));
    }

    // Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      // Show install prompt after 30 seconds
      setTimeout(() => {
        if (this.deferredPrompt && !this.isInstalled()) {
          document.getElementById('installPrompt').classList.add('show');
        }
      }, 30000);
    });

    // Check if already installed
    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA installed');
      this.deferredPrompt = null;
    });
  }

  isInstalled() {
    // Check if running in standalone mode
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  loadSavedData() {
    const saved = localStorage.getItem('alnMemoryScanner');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.scannedTokens = new Set(data.scannedTokens || []);
        console.log('✅ Loaded saved progress');
      } catch (error) {
        console.error('Error loading saved data:', error);
      }
    }
  }

  saveData() {
    const data = {
      scannedTokens: Array.from(this.scannedTokens),
      lastScan: Date.now(),
      version: '1.0'
    };
    localStorage.setItem('alnMemoryScanner', JSON.stringify(data));
  }

  setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isScanning) {
          this.stopScanning();
        } else if (document.getElementById('manualEntryModal').classList.contains('active')) {
          this.hideManualEntry();
        } else if (document.getElementById('memoryDisplay').classList.contains('active')) {
          this.continueScan();
        }
      }

      // Debug shortcuts
      if (e.ctrlKey && e.key === 'd') {
        this.toggleDebugMode();
      }
    });

    // Handle manual entry submit on Enter
    document.getElementById('manualTokenId').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.processManualEntry();
      }
    });

    // Tap-to-continue on memory display (full screen tap target)
    const memoryTapTarget = document.getElementById('memoryTapTarget');
    if (memoryTapTarget) {
      memoryTapTarget.addEventListener('click', () => {
        this.continueScan();
      });
    }

    // Tap audio indicator to play when autoplay blocked
    const audioIndicator = document.getElementById('audioIndicator');
    if (audioIndicator) {
      audioIndicator.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger continue
        if (this.currentAudio) {
          this.currentAudio.play().then(() => {
            audioIndicator.classList.remove('tap-to-play');
          }).catch(err => console.log('Play failed:', err));
        }
      });
    }
  }

  async startScanning() {
    // Try NFC first if available and not iOS
    if ('NDEFReader' in window && !this.isIOS()) {
      try {
        await this.startNFCScanning();
        return;
      } catch (nfcErr) {
        console.log('NFC not available, falling back to QR:', nfcErr.message || nfcErr);
      }
    }

    // Fall back to QR scanning
    await this.startQRScanning();
  }

  async startQRScanning() {
    try {
      const video = document.getElementById('scanner-video');

      // Hide welcome screen, show scanner
      document.getElementById('welcomeScreen').classList.add('hidden');
      document.getElementById('scannerContainer').classList.add('active');

      // Initialize QR scanner
      this.scanner = new QrScanner(
        video,
        result => this.handleScan(result.data),
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
          preferredCamera: 'environment'
        }
      );

      await this.scanner.start();
      this.isScanning = true;

      console.log('📷 QR Scanner started');

    } catch (error) {
      console.error('Failed to start QR scanner:', error);
      tokenDisplay.showError('Camera access denied. Please use manual entry or check permissions.');
      this.showManualEntry();
    }
  }

  async startNFCScanning() {
    try {
      const ndef = new NDEFReader();
      await ndef.scan();

      // Update UI for NFC mode
      document.getElementById('welcomeScreen').classList.add('hidden');
      document.getElementById('scannerContainer').classList.add('active');
      document.querySelector('.scanner-overlay').style.display = 'none';
      document.getElementById('scanner-video').style.display = 'none';

      const status = document.querySelector('.status');
      status.innerHTML = '📡 Hold NFC tag near device...';

      document.getElementById('nfcIndicator').classList.add('scanning');
      document.getElementById('nfcStatus').textContent = 'NFC Scanning...';

      this.isScanning = true;

      // NFC event listeners
      ndef.addEventListener('reading', ({ message, serialNumber }) => {
        let tokenId = serialNumber;

        // Try to extract token ID from NDEF message
        for (const record of message.records) {
          if (record.recordType === 'text') {
            const textDecoder = new TextDecoder(record.encoding);
            tokenId = textDecoder.decode(record.data);
            break;
          }
        }

        console.log('📡 NFC read:', tokenId);
        this.handleScan(tokenId);
      });

      ndef.addEventListener('readingerror', () => {
        console.error('NFC read error');
        tokenDisplay.showError('Failed to read NFC tag. Please try again.');
      });

      console.log('📡 NFC Scanner started');

    } catch (error) {
      console.error('NFC scanning failed:', error);
      throw error;
    }
  }

  stopScanning() {
    if (this.scanner) {
      this.scanner.stop();
      this.scanner = null;
    }

    this.isScanning = false;

    // Update NFC indicator
    document.getElementById('nfcIndicator').classList.remove('scanning');
    document.getElementById('nfcStatus').textContent = 'NFC Ready';

    // Show welcome screen
    document.getElementById('welcomeScreen').classList.remove('hidden');
    document.getElementById('scannerContainer').classList.remove('active');
    document.getElementById('memoryDisplay').classList.remove('active');
  }

  /**
   * Normalize and validate a token ID.
   * Returns the normalized ID, or null if invalid (shows error + vibrates).
   */
  normalizeTokenId(rawId) {
    const result = window.scannerCore.normalizeTokenId(rawId);
    if (result.error) {
      tokenDisplay.showError(result.error);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      return null;
    }
    return result.tokenId;
  }

  handleScan(rawTokenId) {
    console.log('Scanned token:', rawTokenId);

    const tokenId = this.normalizeTokenId(rawTokenId);
    if (!tokenId) return;

    const token = this.tokens[tokenId];
    if (!token) {
      console.log('Unknown token:', tokenId);
      tokenDisplay.showError(`Unknown token: ${tokenId}`);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      return;
    }

    this.processToken(token);
  }

  handleOrchestratorResponse(response, isVideoToken) {
    // Decisions A4 + A5: treatment depends on what actually happened
    // server-side (classification logic lives in scannerCore for testability)
    const { treatment, message } = window.scannerCore.classifyScanResponse(response, isVideoToken);

    switch (treatment) {
      case 'video-triggered':
        tokenDisplay.showVideoAlert();
        setTimeout(() => tokenDisplay.hideVideoAlert(), 5000);
        break;
      case 'video-unavailable':
        tokenDisplay.showVideoUnavailable(message);
        break;
      case 'error':
      case 'queued':
        tokenDisplay.showError(message);
        break;
        // 'none': accepted (non-video) or standalone — no UI needed
    }
  }

  processToken(token) {
    // Send to orchestrator in networked mode (for ALL token types, not just video)
    // Check isStandalone, NOT connected - scanToken() handles offline queueing internally
    if (window.orchestrator && !window.orchestrator.isStandalone) {
      const teamId = sessionStorage.getItem('currentTeam') || '001';

      // Video alert is shown AFTER the orchestrator responds (Decision A4):
      // a queued/rejected scan never triggers playback, so we must not
      // promise "VIDEO MEMORY TRIGGERED" until the server accepts it.
      const isVideoToken = !!token.video;

      window.orchestrator.scanToken(token.SF_RFID, teamId)
        .then(response => this.handleOrchestratorResponse(response, isVideoToken))
        .catch(error => console.error('Orchestrator error:', error));
    }

    // Track if new or revisited
    const isNew = !this.scannedTokens.has(token.SF_RFID || token.id);
    if (isNew) {
      this.scannedTokens.add(token.SF_RFID || token.id);
    }

    // Save current token
    this.currentToken = token;

    // Display memory with status
    tokenDisplay.displayMemory(token, isNew);

    // Store reference to current audio element for tap-to-play handling
    this.currentAudio = document.getElementById('memoryAudio');

    // Save progress
    this.saveData();

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }

    console.log('✅ Token processed:', token.SF_RFID || token.id);
  }

  continueScan() {
    // Stop any playing audio
    tokenDisplay.stopAudio(this.currentAudio);

    // Clean up audio event handler to prevent stale callbacks
    const audio = document.getElementById('memoryAudio');
    if (audio) {
      audio.onended = null;
    }

    // Hide audio indicator
    const audioIndicator = document.getElementById('audioIndicator');
    audioIndicator.classList.remove('active');
    audioIndicator.classList.remove('tap-to-play');

    // Hide memory display, show scanner
    document.getElementById('memoryDisplay').classList.remove('active');
    this.startScanning();
  }

  viewCollection() {
    // Show list of collected token IDs
    const collected = Array.from(this.scannedTokens);
    const count = collected.length;

    if (count === 0) {
      alert('No memories collected yet. Start scanning!');
    } else {
      const tokenList = collected.sort().join('\n');
      alert(`Collected Memories (${count} unique):\n\n${tokenList}`);
    }
  }

  showManualEntry() {
    document.getElementById('manualEntryModal').classList.add('active');
    document.getElementById('manualTokenId').focus();
  }

  hideManualEntry() {
    document.getElementById('manualEntryModal').classList.remove('active');
    document.getElementById('manualTokenId').value = '';
  }

  processManualEntry() {
    const tokenId = document.getElementById('manualTokenId').value.trim();
    if (tokenId) {
      this.handleScan(tokenId);
      this.hideManualEntry();
    }
  }

  toggleDebugMode() {
    // Debug mode for testing
    const debugInfo = {
      tokens: Object.keys(this.tokens).length,
      scanned: this.scannedTokens.size,
      collected: Array.from(this.scannedTokens)
    };
    console.table(debugInfo);
  }

  /**
   * Handle token passed via URL parameter from NFC tag.
   * Enables "tap tag -> auto-open browser -> auto-process token" flow.
   */
  handleUrlToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
      console.log(`[NFC-URL] Token from URL parameter: ${tokenFromUrl}`);

      // Clean URL to prevent re-processing on refresh
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      // Process the token after a short delay to ensure app is fully initialized
      setTimeout(() => {
        this.handleTokenFromUrl(tokenFromUrl);
      }, 500);
    }
  }

  handleTokenFromUrl(rawTokenId) {
    console.log('[NFC-URL] Processing token:', rawTokenId);
    // Reuse the same scan path (normalizes, validates, and processes)
    this.handleScan(rawTokenId);
  }

  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  installPWA() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('✅ User accepted PWA install');
        }
        this.deferredPrompt = null;
      });
    }
    document.getElementById('installPrompt').classList.remove('show');
  }

  dismissInstall() {
    document.getElementById('installPrompt').classList.remove('show');
    // Don't show again for 7 days
    localStorage.setItem('installDismissed', Date.now());
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function initApp() {
  window.app = new MemoryScanner();
}

function initOrchestrator() {
  window.orchestrator = new OrchestratorIntegration();

  window.addEventListener('orchestrator:connected', () => {
    document.getElementById('connection-status').classList.add('connected');
    document.querySelector('.status-text').textContent = 'Online';
  });

  window.addEventListener('orchestrator:disconnected', () => {
    document.getElementById('connection-status').classList.remove('connected');
    document.querySelector('.status-text').textContent = 'Offline';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initApp();
    initOrchestrator();
  });
} else {
  initApp();
  initOrchestrator();
}
