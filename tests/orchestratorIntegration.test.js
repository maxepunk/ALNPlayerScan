/**
 * OrchestratorIntegration tests
 *
 * The class constructor has side effects: reads localStorage, detects mode from
 * window.location.pathname, and starts a connection monitor (fetch + setInterval)
 * in networked mode. All external APIs must be mocked BEFORE requiring the module.
 */

// Storage mock (shared across tests)
let mockStorage;
function setupStorageMock() {
  mockStorage = {};
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(key => mockStorage[key] ?? null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => { mockStorage[key] = String(val); });
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(key => { delete mockStorage[key]; });
}

// Construct an instance with controlled window.location and fetch
function createInstance(pathname, fetchImpl) {
  // Set location
  delete window.location;
  window.location = {
    pathname: pathname || '/',
    origin: 'https://example.com',
    search: '',
  };

  // Set fetch
  global.fetch = fetchImpl || jest.fn().mockRejectedValue(new Error('no network'));

  // AbortSignal.timeout may not exist in jsdom
  if (!AbortSignal.timeout) {
    AbortSignal.timeout = jest.fn().mockReturnValue(new AbortController().signal);
  }

  // Fresh require (constructor runs immediately)
  jest.resetModules();
  const OrchestratorIntegration = require('../js/orchestratorIntegration');
  return new OrchestratorIntegration();
}

describe('OrchestratorIntegration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setupStorageMock();
    // Suppress console.log/error during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete global.fetch;
  });

  // ─── Mode Detection ───────────────────────────────────────────────

  describe('mode detection', () => {
    test('standalone mode when served from root', () => {
      const orch = createInstance('/');
      expect(orch.isStandalone).toBe(true);
    });

    test('standalone mode when served from GitHub Pages subpath', () => {
      const orch = createInstance('/aln-memory-scanner/');
      expect(orch.isStandalone).toBe(true);
    });

    test('networked mode when served from /player-scanner/', () => {
      const orch = createInstance('/player-scanner/');
      expect(orch.isStandalone).toBe(false);
    });

    test('networked mode when served from /player-scanner (no trailing slash)', () => {
      const orch = createInstance('/player-scanner');
      expect(orch.isStandalone).toBe(false);
    });

    test('standalone mode does not start connection monitor', () => {
      const orch = createInstance('/');
      expect(orch.connectionCheckInterval).toBeNull();
      expect(orch.pendingConnectionCheck).toBeUndefined();
    });

    test('networked mode starts connection monitor', () => {
      const orch = createInstance('/player-scanner/');
      expect(orch.connectionCheckInterval).not.toBeNull();
    });
  });

  // ─── URL Detection & Normalization ────────────────────────────────

  describe('URL handling', () => {
    test('detectOrchestratorUrl returns origin for networked mode', () => {
      const orch = createInstance('/player-scanner/');
      expect(orch.baseUrl).toBe('https://example.com');
    });

    test('detectOrchestratorUrl returns localhost for standalone', () => {
      const orch = createInstance('/');
      expect(orch.baseUrl).toBe('https://localhost:3000');
    });

    test('uses stored URL from localStorage if present', () => {
      mockStorage['orchestrator_url'] = 'https://custom:9000';
      const orch = createInstance('/player-scanner/');
      expect(orch.baseUrl).toBe('https://custom:9000');
    });

    test('normalizeUrl converts http to https', () => {
      const orch = createInstance('/');
      expect(orch.normalizeUrl('http://example.com')).toBe('https://example.com');
    });

    test('normalizeUrl preserves https', () => {
      const orch = createInstance('/');
      expect(orch.normalizeUrl('https://example.com')).toBe('https://example.com');
    });

    test('normalizeUrl handles null', () => {
      const orch = createInstance('/');
      expect(orch.normalizeUrl(null)).toBeNull();
    });

    test('normalizeUrl handles empty string', () => {
      const orch = createInstance('/');
      expect(orch.normalizeUrl('')).toBe('');
    });
  });

  // ─── Offline Queue ────────────────────────────────────────────────

  describe('offline queue', () => {
    test('queueOffline adds item to queue', () => {
      const orch = createInstance('/player-scanner/');
      orch.queueOffline('kaa001', 'TeamAlpha');
      expect(orch.offlineQueue).toHaveLength(1);
      expect(orch.offlineQueue[0].tokenId).toBe('kaa001');
      expect(orch.offlineQueue[0].teamId).toBe('TeamAlpha');
    });

    test('queueOffline enforces max queue size (removes oldest)', () => {
      const orch = createInstance('/player-scanner/');
      // Fill to max
      for (let i = 0; i < 100; i++) {
        orch.queueOffline(`token${i}`, 'team');
      }
      expect(orch.offlineQueue).toHaveLength(100);

      // Add one more — oldest removed
      orch.queueOffline('overflow', 'team');
      expect(orch.offlineQueue).toHaveLength(100);
      expect(orch.offlineQueue[0].tokenId).toBe('token1'); // token0 removed
      expect(orch.offlineQueue[99].tokenId).toBe('overflow');
    });

    test('queueOffline persists to localStorage', () => {
      const orch = createInstance('/player-scanner/');
      orch.queueOffline('kaa001', 'team');
      expect(mockStorage['offline_queue']).toBeDefined();
      const saved = JSON.parse(mockStorage['offline_queue']);
      expect(saved).toHaveLength(1);
      expect(saved[0].tokenId).toBe('kaa001');
    });

    test('loadQueue restores from localStorage', () => {
      mockStorage['offline_queue'] = JSON.stringify([
        { tokenId: 'saved1', teamId: 'team', timestamp: 123, retryCount: 0 },
        { tokenId: 'saved2', teamId: 'team', timestamp: 456, retryCount: 0 },
      ]);
      const orch = createInstance('/player-scanner/');
      expect(orch.offlineQueue).toHaveLength(2);
      expect(orch.offlineQueue[0].tokenId).toBe('saved1');
    });

    test('clearQueue empties queue and localStorage', () => {
      const orch = createInstance('/player-scanner/');
      orch.queueOffline('kaa001', 'team');
      orch.clearQueue();
      expect(orch.offlineQueue).toHaveLength(0);
      expect(JSON.parse(mockStorage['offline_queue'])).toHaveLength(0);
    });

    test('getQueueStatus returns current state', () => {
      const orch = createInstance('/player-scanner/');
      orch.queueOffline('kaa001', 'team');
      const status = orch.getQueueStatus();
      expect(status.queueSize).toBe(1);
      expect(status.maxQueueSize).toBe(100);
      expect(status.connected).toBe(false);
      expect(status.deviceId).toBeDefined();
    });
  });

  // ─── Scan Operations ──────────────────────────────────────────────

  describe('scanToken', () => {
    test('standalone mode returns standalone status (no network call)', async () => {
      const orch = createInstance('/');
      const result = await orch.scanToken('kaa001', 'team');
      expect(result.status).toBe('standalone');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('networked mode queues when disconnected', async () => {
      const orch = createInstance('/player-scanner/');
      orch.connected = false;
      const result = await orch.scanToken('kaa001', 'team');
      expect(result.status).toBe('offline');
      expect(result.queued).toBe(true);
      expect(orch.offlineQueue).toHaveLength(1);
    });

    test('networked mode sends POST when connected', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true;

      const result = await orch.scanToken('kaa001', 'TeamAlpha');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/scan',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Verify payload (calls[0] is the health check from the constructor,
      // calls[1] is the scan POST — find the POST call by URL to be robust)
      const scanCall = mockFetch.mock.calls.find(([url]) =>
        typeof url === 'string' && url.includes('/api/scan')
      );
      const body = JSON.parse(scanCall[1].body);
      expect(body.tokenId).toBe('kaa001');
      expect(body.teamId).toBe('TeamAlpha');
      expect(body.deviceType).toBe('player');
      expect(body.deviceId).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    test('omits teamId from payload when falsy', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true;

      await orch.scanToken('kaa001', '');

      const scanCall = mockFetch.mock.calls.find(([url]) =>
        typeof url === 'string' && url.includes('/api/scan')
      );
      const body = JSON.parse(scanCall[1].body);
      expect(body).not.toHaveProperty('teamId');
    });

    test('queues on network error', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('network error'));
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true;

      const result = await orch.scanToken('kaa001', 'team');
      expect(result.status).toBe('error');
      expect(result.queued).toBe(true);
      expect(orch.offlineQueue).toHaveLength(1);
    });
  });

  // ─── Connection Monitoring ────────────────────────────────────────

  describe('connection monitoring', () => {
    test('checkConnection sets connected=true on 200', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const orch = createInstance('/player-scanner/', mockFetch);

      const result = await orch.checkConnection();
      expect(result).toBe(true);
      expect(orch.connected).toBe(true);
    });

    test('checkConnection sets connected=false on error', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('timeout'));
      const orch = createInstance('/player-scanner/', mockFetch);

      const result = await orch.checkConnection();
      expect(result).toBe(false);
      expect(orch.connected).toBe(false);
    });

    test('checkConnection includes deviceId in health URL', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.deviceId = 'TEST_DEVICE';

      await orch.checkConnection();

      const calledUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0].toString();
      expect(calledUrl).toContain('deviceId=TEST_DEVICE');
      expect(calledUrl).toContain('type=player');
    });

    test('emits orchestrator:connected on state transition', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = false;

      const handler = jest.fn();
      window.addEventListener('orchestrator:connected', handler);
      try {
        await orch.checkConnection();
        expect(handler).toHaveBeenCalled();
      } finally {
        window.removeEventListener('orchestrator:connected', handler);
      }
    });

    test('emits orchestrator:disconnected on state transition', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('down'));
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true; // Was connected

      const handler = jest.fn();
      window.addEventListener('orchestrator:disconnected', handler);
      try {
        await orch.checkConnection();
        expect(handler).toHaveBeenCalled();
      } finally {
        window.removeEventListener('orchestrator:disconnected', handler);
      }
    });

    test('stopConnectionMonitor clears interval', () => {
      const orch = createInstance('/player-scanner/');
      expect(orch.connectionCheckInterval).not.toBeNull();

      orch.stopConnectionMonitor();
      expect(orch.connectionCheckInterval).toBeNull();
    });
  });

  // ─── Batch ID Generation ──────────────────────────────────────────

  describe('generateBatchId', () => {
    test('returns UUID v4 format', () => {
      const orch = createInstance('/');
      const id = orch.generateBatchId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    test('generates unique IDs', () => {
      const orch = createInstance('/');
      const ids = new Set(Array.from({ length: 100 }, () => orch.generateBatchId()));
      expect(ids.size).toBe(100);
    });
  });

  // ─── Cleanup ──────────────────────────────────────────────────────

  describe('destroy', () => {
    test('standalone mode destroy is no-op', async () => {
      const orch = createInstance('/');
      await orch.destroy(); // Should not throw
    });

    test('networked mode destroy stops monitor and awaits pending check', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const orch = createInstance('/player-scanner/', mockFetch);
      expect(orch.connectionCheckInterval).not.toBeNull();

      await orch.destroy();
      expect(orch.connectionCheckInterval).toBeNull();
      expect(orch.pendingConnectionCheck).toBeNull();
    });
  });
});
