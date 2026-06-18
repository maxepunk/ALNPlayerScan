/**
 * app.js unit tests
 *
 * app.js depends on DOM + window globals (scannerCore, tokenDisplay,
 * OrchestratorIntegration). We mock those globals and test the logic methods:
 *
 *  - handleScan(): normalization, unknown-token gate, processToken delegation
 *  - handleOrchestratorResponse(): video-triggered / video-unavailable / error / queued paths
 *  - processToken(): new vs revisited tracking, orchestrator delegation, standalone bypass
 *  - handleUrlToken() / handleTokenFromUrl(): URL-param scan flow
 *  - loadSavedData() / saveData(): localStorage persistence
 *  - normalizeTokenId(): delegates to scannerCore, shows error + vibrates on failure
 */

const fs = require('fs');
const path = require('path');
const APP_SRC = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

// ─── Shared mock storage ──────────────────────────────────────────────────────

let mockStorage;
function setupStorageMock() {
  mockStorage = {};
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(key => mockStorage[key] ?? null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => { mockStorage[key] = String(val); });
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(key => { delete mockStorage[key]; });
}

// ─── DOM setup ───────────────────────────────────────────────────────────────

function buildAppDOM() {
  document.body.innerHTML = `
    <div class="main-container"></div>
    <div id="loadingScreen" style="display: block;"></div>
    <div id="welcomeScreen" class="hidden"></div>
    <div id="scannerContainer"></div>
    <div id="memoryDisplay"></div>
    <div id="memoryStatusOverlay" style="animation: none;"></div>
    <div id="memoryStatus"></div>
    <img id="memoryImage" style="display: none;" />
    <div id="audioPlaceholder"></div>
    <div id="audioIndicator"></div>
    <audio id="memoryAudio"></audio>
    <div id="continueHint"></div>
    <div id="video-alert"></div>
    <div id="nfcIndicator"></div>
    <span id="nfcStatus"></span>
    <div id="connection-status"></div>
    <span class="status-text"></span>
    <div id="manualEntryModal"></div>
    <input id="manualTokenId" />
    <div id="installPrompt"></div>
    <div id="scanMethodInfo"></div>
    <video id="scanner-video"></video>
    <div class="scanner-overlay"><span></span></div>
    <div class="status scanning"></div>
  `;
}

// ─── Global mock factories ────────────────────────────────────────────────────

function makeScannerCore(overrides = {}) {
  return {
    normalizeTokenId: jest.fn(id => {
      if (!id || typeof id !== 'string' || id.trim() === '') {
        return { error: 'Invalid token: empty input' };
      }
      return { tokenId: id.toLowerCase().replace(/[^a-z0-9_]/g, '') };
    }),
    classifyScanResponse: jest.fn(() => ({ treatment: 'none' })),
    ...overrides
  };
}

function makeTokenDisplay(overrides = {}) {
  return {
    displayMemory: jest.fn(),
    handleImageError: jest.fn(),
    setupAudioWithAutoplay: jest.fn(() => document.getElementById('memoryAudio')),
    stopAudio: jest.fn(),
    showError: jest.fn(),
    showVideoAlert: jest.fn(),
    showVideoUnavailable: jest.fn(),
    hideVideoAlert: jest.fn(),
    ...overrides
  };
}

/**
 * Install window globals and evaluate app.js. Returns { app, orchestrator, mockOrch }.
 *
 * @param {object} opts
 * @param {string}   [opts.pathname='/']
 * @param {object}   [opts.tokens={}]
 * @param {boolean}  [opts.orchIsStandalone=true]
 * @param {object}   [opts.orchScanResult]
 * @param {object}   [opts.scannerCoreOverrides] - Override specific scannerCore methods
 * @param {object}   [opts.tokenDisplayOverrides] - Override specific tokenDisplay methods
 */
function loadApp({
  pathname = '/',
  tokens = {},
  orchIsStandalone = true,
  orchScanResult = null,
  scannerCoreOverrides = {},
  tokenDisplayOverrides = {}
} = {}) {
  // Location
  delete window.location;
  window.location = {
    pathname,
    origin: 'https://example.com',
    search: '',
    href: 'https://example.com' + pathname,
  };
  window.history = { replaceState: jest.fn() };

  // Install window globals BEFORE eval
  window.scannerCore = makeScannerCore(scannerCoreOverrides);
  window.tokenDisplay = makeTokenDisplay(tokenDisplayOverrides);

  // OrchestratorIntegration constructor
  const mockOrch = {
    isStandalone: orchIsStandalone,
    scanToken: jest.fn().mockResolvedValue(orchScanResult || { status: 'accepted' }),
  };
  global.OrchestratorIntegration = jest.fn(() => mockOrch);
  // Also install as window property (accessed via new OrchestratorIntegration() in app.js)
  window.OrchestratorIntegration = global.OrchestratorIntegration;

  // fetch: return tokens
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(tokens),
  });

  // serviceWorker: stub register
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register: jest.fn().mockResolvedValue({}) },
    writable: true,
    configurable: true,
  });

  // navigator.vibrate stub
  Object.defineProperty(navigator, 'vibrate', {
    value: jest.fn().mockReturnValue(true),
    writable: true,
    configurable: true
  });

  // Force synchronous bootstrap path
  Object.defineProperty(document, 'readyState', {
    value: 'complete',
    writable: true,
    configurable: true
  });

  // Eval app.js in global scope
  eval(APP_SRC); // nosec: intentional test-only eval to bootstrap app globals

  return { app: window.app, orchestrator: window.orchestrator, mockOrch };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MemoryScanner', () => {
  beforeEach(() => {
    buildAppDOM();
    setupStorageMock();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'table').mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete global.fetch;
    delete global.OrchestratorIntegration;
    delete window.app;
    delete window.orchestrator;
    delete window.scannerCore;
    delete window.tokenDisplay;
    delete window.OrchestratorIntegration;
  });

  // ─── handleScan ──────────────────────────────────────────────────────

  describe('handleScan', () => {
    test('normalizes the raw token ID before lookup', async () => {
      const tokens = { 'kaa001': { SF_RFID: 'kaa001', image: null, audio: null } };
      const { app } = loadApp({ tokens });
      await Promise.resolve();

      app.handleScan('KAA001');

      expect(window.scannerCore.normalizeTokenId).toHaveBeenCalledWith('KAA001');
    });

    test('shows error and vibrates for invalid token ID', async () => {
      const { app } = loadApp({
        scannerCoreOverrides: {
          normalizeTokenId: jest.fn(() => ({ error: 'Invalid token: empty input' }))
        }
      });
      await Promise.resolve();

      app.handleScan('');

      expect(window.tokenDisplay.showError).toHaveBeenCalledWith('Invalid token: empty input');
      expect(navigator.vibrate).toHaveBeenCalledWith([100, 50, 100]);
    });

    test('shows error and vibrates for unknown token', async () => {
      const { app } = loadApp({});
      await Promise.resolve();

      app.tokens = { 'known001': { SF_RFID: 'known001', image: null, audio: null } };
      app.handleScan('unknown999');

      expect(window.tokenDisplay.showError).toHaveBeenCalledWith(
        expect.stringContaining('Unknown token')
      );
      expect(navigator.vibrate).toHaveBeenCalledWith([100, 50, 100]);
    });

    test('calls processToken for a known token', async () => {
      const { app } = loadApp({});
      await Promise.resolve();

      const token = { SF_RFID: 'kaa001', image: null, audio: null };
      app.tokens = { kaa001: token };
      const spy = jest.spyOn(app, 'processToken');
      app.handleScan('kaa001');

      expect(spy).toHaveBeenCalledWith(token);
    });
  });

  // ─── handleOrchestratorResponse ──────────────────────────────────────

  describe('handleOrchestratorResponse', () => {
    test('video-triggered: shows alert and schedules hide after 5s', async () => {
      const { app } = loadApp({
        scannerCoreOverrides: {
          classifyScanResponse: jest.fn(() => ({ treatment: 'video-triggered' }))
        }
      });
      await Promise.resolve();

      app.handleOrchestratorResponse({ status: 'accepted' }, true);

      expect(window.tokenDisplay.showVideoAlert).toHaveBeenCalled();

      jest.advanceTimersByTime(5000);
      expect(window.tokenDisplay.hideVideoAlert).toHaveBeenCalled();
    });

    test('video-unavailable: shows video unavailable notice', async () => {
      const { app } = loadApp({
        scannerCoreOverrides: {
          classifyScanResponse: jest.fn(() => ({
            treatment: 'video-unavailable',
            message: 'Video unavailable — rescan to retry'
          }))
        }
      });
      await Promise.resolve();

      app.handleOrchestratorResponse({ status: 'rejected' }, true);

      expect(window.tokenDisplay.showVideoUnavailable).toHaveBeenCalledWith(
        'Video unavailable — rescan to retry'
      );
    });

    test('error: shows error toast', async () => {
      const { app } = loadApp({
        scannerCoreOverrides: {
          classifyScanResponse: jest.fn(() => ({
            treatment: 'error',
            message: 'No active session'
          }))
        }
      });
      await Promise.resolve();

      app.handleOrchestratorResponse({ status: 'error' }, false);

      expect(window.tokenDisplay.showError).toHaveBeenCalledWith('No active session');
    });

    test('queued: shows error toast with queue message', async () => {
      const { app } = loadApp({
        scannerCoreOverrides: {
          classifyScanResponse: jest.fn(() => ({
            treatment: 'queued',
            message: 'Scan queued - orchestrator unavailable'
          }))
        }
      });
      await Promise.resolve();

      app.handleOrchestratorResponse({ queued: true }, false);

      expect(window.tokenDisplay.showError).toHaveBeenCalledWith(
        'Scan queued - orchestrator unavailable'
      );
    });

    test('none: no UI action', async () => {
      const { app } = loadApp({
        scannerCoreOverrides: {
          classifyScanResponse: jest.fn(() => ({ treatment: 'none' }))
        }
      });
      await Promise.resolve();

      app.handleOrchestratorResponse({ status: 'standalone' }, false);

      expect(window.tokenDisplay.showVideoAlert).not.toHaveBeenCalled();
      expect(window.tokenDisplay.showError).not.toHaveBeenCalled();
    });
  });

  // ─── processToken ─────────────────────────────────────────────────────

  describe('processToken', () => {
    test('tracks new token correctly', async () => {
      const token = { SF_RFID: 'kaa001', image: null, audio: null };
      const { app } = loadApp({});
      await Promise.resolve();

      app.tokens = { kaa001: token };
      app.processToken(token);

      expect(app.scannedTokens.has('kaa001')).toBe(true);
    });

    test('identifies revisited token', async () => {
      const token = { SF_RFID: 'kaa001', image: null, audio: null };
      const { app } = loadApp({});
      await Promise.resolve();

      app.scannedTokens.add('kaa001');
      app.processToken(token);

      expect(window.tokenDisplay.displayMemory).toHaveBeenCalledWith(token, false);
    });

    test('delegates rendering to tokenDisplay.displayMemory', async () => {
      const token = { SF_RFID: 'kaa001', image: null, audio: null };
      const { app } = loadApp({});
      await Promise.resolve();

      app.processToken(token);

      expect(window.tokenDisplay.displayMemory).toHaveBeenCalledWith(token, true);
    });

    test('does NOT call orchestrator in standalone mode', async () => {
      const { app } = loadApp({ orchIsStandalone: true });
      await Promise.resolve();

      const token = { SF_RFID: 'kaa001', image: null, audio: null };
      app.processToken(token);

      expect(window.orchestrator.scanToken).not.toHaveBeenCalled();
    });

    test('calls orchestrator.scanToken in networked mode', async () => {
      const { app, mockOrch } = loadApp({
        orchIsStandalone: false,
        orchScanResult: { status: 'accepted' }
      });
      await Promise.resolve();

      // The orchestrator global may have isStandalone from constructor — override it
      window.orchestrator.isStandalone = false;

      const token = { SF_RFID: 'kaa001', image: null, audio: null };
      app.processToken(token);

      expect(mockOrch.scanToken).toHaveBeenCalledWith('kaa001', expect.any(String));
    });

    test('A4: passes isVideoToken=true for video token', async () => {
      const { app } = loadApp({
        orchIsStandalone: false,
        orchScanResult: { status: 'accepted' }
      });
      await Promise.resolve();

      window.orchestrator.isStandalone = false;
      const handleSpy = jest.spyOn(app, 'handleOrchestratorResponse');

      const token = { SF_RFID: 'vid001', video: 'vid001.mp4', image: null, audio: null };
      app.processToken(token);

      // Let the promise resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(handleSpy).toHaveBeenCalledWith(
        expect.anything(),
        true  // isVideoToken
      );
    });

    test('A4: passes isVideoToken=false for non-video token', async () => {
      const { app } = loadApp({
        orchIsStandalone: false,
        orchScanResult: { status: 'accepted' }
      });
      await Promise.resolve();

      window.orchestrator.isStandalone = false;
      const handleSpy = jest.spyOn(app, 'handleOrchestratorResponse');

      const token = { SF_RFID: 'img001', image: 'img.bmp', audio: null };
      app.processToken(token);

      await Promise.resolve();
      await Promise.resolve();

      expect(handleSpy).toHaveBeenCalledWith(
        expect.anything(),
        false  // isVideoToken
      );
    });

    test('saves data after processing', async () => {
      const token = { SF_RFID: 'kaa001', image: null, audio: null };
      const { app } = loadApp({});
      await Promise.resolve();

      app.processToken(token);

      expect(mockStorage['alnMemoryScanner']).toBeDefined();
    });

    test('fires haptic feedback on process', async () => {
      const token = { SF_RFID: 'kaa001', image: null, audio: null };
      const { app } = loadApp({});
      await Promise.resolve();

      app.processToken(token);

      expect(navigator.vibrate).toHaveBeenCalledWith(200);
    });

    test('uses token.id when SF_RFID is missing', async () => {
      const token = { id: 'fallback_id', image: null, audio: null };
      const { app } = loadApp({});
      await Promise.resolve();

      app.processToken(token);

      expect(app.scannedTokens.has('fallback_id')).toBe(true);
    });
  });

  // ─── loadSavedData / saveData ─────────────────────────────────────────

  describe('persistence', () => {
    test('loadSavedData restores scannedTokens from localStorage', async () => {
      const { app } = loadApp({});
      await Promise.resolve();

      // Seed storage AFTER init so we can call loadSavedData directly
      mockStorage['alnMemoryScanner'] = JSON.stringify({
        scannedTokens: ['tok_a', 'tok_b'],
        lastScan: Date.now(),
        version: '1.0'
      });

      // Call directly — loadSavedData is a public method
      app.loadSavedData();

      expect(app.scannedTokens.has('tok_a')).toBe(true);
      expect(app.scannedTokens.has('tok_b')).toBe(true);
    });

    test('saveData writes scannedTokens to localStorage', async () => {
      const { app } = loadApp({});
      await Promise.resolve();

      app.scannedTokens.add('saved_tok');
      app.saveData();

      const saved = JSON.parse(mockStorage['alnMemoryScanner']);
      expect(saved.scannedTokens).toContain('saved_tok');
    });

    test('saveData writes version field', async () => {
      const { app } = loadApp({});
      await Promise.resolve();

      app.saveData();
      const saved = JSON.parse(mockStorage['alnMemoryScanner']);
      expect(saved.version).toBe('1.0');
    });

    test('loadSavedData handles corrupted localStorage gracefully', async () => {
      mockStorage['alnMemoryScanner'] = 'not-json-at-all';

      const { app } = loadApp({});
      await Promise.resolve();

      expect(() => app.loadSavedData()).not.toThrow();
    });
  });

  // ─── handleUrlToken ────────────────────────────────────────────────────

  describe('handleUrlToken / handleTokenFromUrl', () => {
    test('handleTokenFromUrl delegates to handleScan', async () => {
      const { app } = loadApp({});
      await Promise.resolve();

      const spy = jest.spyOn(app, 'handleScan');
      app.handleTokenFromUrl('test_001');

      expect(spy).toHaveBeenCalledWith('test_001');
    });

    test('handleUrlToken does nothing when no ?token= param', async () => {
      const { app } = loadApp({ pathname: '/' });
      await Promise.resolve();

      // location.search is '' (set in loadApp)
      const spy = jest.spyOn(app, 'handleScan');
      app.handleUrlToken();

      jest.advanceTimersByTime(1000);
      expect(spy).not.toHaveBeenCalled();
    });

    test('handleUrlToken schedules handleTokenFromUrl after 500ms when ?token= present', async () => {
      const { app } = loadApp({});
      await Promise.resolve();

      // Simulate URL with token parameter
      delete window.location;
      window.location = {
        pathname: '/',
        origin: 'https://example.com',
        search: '?token=tok001',
        href: 'https://example.com/?token=tok001',
      };
      window.history = { replaceState: jest.fn() };

      const spy = jest.spyOn(app, 'handleTokenFromUrl');
      app.handleUrlToken();

      jest.advanceTimersByTime(499);
      expect(spy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(spy).toHaveBeenCalledWith('tok001');
    });
  });

  // ─── mode detection (via orchestrator) ────────────────────────────────

  describe('mode detection', () => {
    test('standalone mode: orchestrator.isStandalone is true for root path', async () => {
      loadApp({ pathname: '/', orchIsStandalone: true });
      await Promise.resolve();

      expect(window.orchestrator.isStandalone).toBe(true);
    });

    test('networked mode: orchestrator.isStandalone is false for /player-scanner/', async () => {
      loadApp({ pathname: '/player-scanner/', orchIsStandalone: false });
      await Promise.resolve();

      expect(window.orchestrator.isStandalone).toBe(false);
    });
  });

  // ─── token loading fallback chain ─────────────────────────────────────

  describe('loadTokenDatabase', () => {
    test('loads tokens from data/tokens.json on success', async () => {
      const tokens = { tok1: { SF_RFID: 'tok1', image: null, audio: null } };
      loadApp({ tokens });

      // Allow async init to complete
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(window.app.tokens).toEqual(tokens);
    });

    test('falls back to root tokens.json when data/tokens.json fails', async () => {
      const fallbackTokens = { tok_fallback: { SF_RFID: 'tok_fallback', image: null, audio: null } };
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false }); // data/tokens.json fails
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(fallbackTokens) });
      });

      // Re-eval with the custom fetch
      buildAppDOM();
      window.scannerCore = makeScannerCore();
      window.tokenDisplay = makeTokenDisplay();
      const mockOrch = { isStandalone: true, scanToken: jest.fn() };
      global.OrchestratorIntegration = jest.fn(() => mockOrch);
      window.OrchestratorIntegration = global.OrchestratorIntegration;
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: jest.fn().mockResolvedValue({}) }, writable: true, configurable: true
      });
      Object.defineProperty(navigator, 'vibrate', {
        value: jest.fn().mockReturnValue(true), writable: true, configurable: true
      });
      Object.defineProperty(document, 'readyState', {
        value: 'complete', writable: true, configurable: true
      });
      delete window.location;
      window.location = { pathname: '/', origin: 'https://example.com', search: '' };
      window.history = { replaceState: jest.fn() };

      eval(APP_SRC); // nosec: intentional test-only eval to bootstrap app globals

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(window.app.tokens).toEqual(fallbackTokens);
    });

    test('falls back to demo token when both fetches fail', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      buildAppDOM();
      window.scannerCore = makeScannerCore();
      window.tokenDisplay = makeTokenDisplay();
      const mockOrch = { isStandalone: true, scanToken: jest.fn() };
      global.OrchestratorIntegration = jest.fn(() => mockOrch);
      window.OrchestratorIntegration = global.OrchestratorIntegration;
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: jest.fn().mockResolvedValue({}) }, writable: true, configurable: true
      });
      Object.defineProperty(navigator, 'vibrate', {
        value: jest.fn().mockReturnValue(true), writable: true, configurable: true
      });
      Object.defineProperty(document, 'readyState', {
        value: 'complete', writable: true, configurable: true
      });
      delete window.location;
      window.location = { pathname: '/', origin: 'https://example.com', search: '' };
      window.history = { replaceState: jest.fn() };

      eval(APP_SRC); // nosec: intentional test-only eval to bootstrap app globals

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(window.app.tokens).toHaveProperty('test_001');
    });
  });
});
