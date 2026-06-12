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
    // Suppress console.log/warn/error during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
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

  // ─── Device Identity (F-PARITY-04) ────────────────────────────────

  describe('deviceId persistence', () => {
    test('uses stored device_id from localStorage when present', () => {
      mockStorage['device_id'] = 'PLAYER_STABLE_123';
      const orch = createInstance('/player-scanner/');
      expect(orch.deviceId).toBe('PLAYER_STABLE_123');
    });

    test('F-PARITY-04: persists a generated deviceId back to localStorage', () => {
      const orch = createInstance('/player-scanner/');
      expect(orch.deviceId).toMatch(/^PLAYER_/);
      expect(mockStorage['device_id']).toBe(orch.deviceId);
    });

    test('deviceId is stable across reloads (no registry churn)', () => {
      const orch1 = createInstance('/player-scanner/');
      const orch2 = createInstance('/player-scanner/');
      expect(orch2.deviceId).toBe(orch1.deviceId);
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
        { tokenId: 'saved1', teamId: 'team', timestamp: 123 },
        { tokenId: 'saved2', teamId: 'team', timestamp: 456 },
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

    // ─── F-SCAN-01 (P0) / Decision A5: 4xx is FINAL, only network-level
    //     failures (fetch rejection / 5xx) may queue ─────────────────────

    test('queues on 5xx server error (retryable)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'SERVICE_UNAVAILABLE', message: 'Server is still initializing, please retry' }),
      });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true;

      const result = await orch.scanToken('kaa001', 'team');
      expect(result.status).toBe('error');
      expect(result.queued).toBe(true);
      expect(orch.offlineQueue).toHaveLength(1);
    });

    test('409 video-rejected is FINAL: not queued, passes through rejected status', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          status: 'rejected',
          message: 'Video already playing, please wait',
          tokenId: 'kaa001',
          videoQueued: false,
          waitTime: 30,
        }),
      });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true;

      const result = await orch.scanToken('kaa001', 'team');
      expect(result.status).toBe('rejected');
      expect(result.queued).toBe(false);
      expect(orch.offlineQueue).toHaveLength(0);
    });

    test('409 SESSION_NOT_FOUND is FINAL: not queued, surfaces error', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          error: 'SESSION_NOT_FOUND',
          message: 'No active session - admin must create session first',
        }),
      });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true;

      const result = await orch.scanToken('kaa001', 'team');
      expect(result.status).toBe('error');
      expect(result.queued).toBe(false);
      expect(result.error).toContain('No active session');
      expect(orch.offlineQueue).toHaveLength(0);
    });

    test('400 validation error is FINAL: not queued', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'VALIDATION_ERROR', message: 'Validation failed: tokenId' }),
      });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true;

      const result = await orch.scanToken('kaa001', 'team');
      expect(result.status).toBe('error');
      expect(result.queued).toBe(false);
      expect(orch.offlineQueue).toHaveLength(0);
    });

    test('404 TOKEN_NOT_FOUND is FINAL: not queued', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'TOKEN_NOT_FOUND', message: 'Token kaa001 not recognized' }),
      });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true;

      const result = await orch.scanToken('kaa001', 'team');
      expect(result.status).toBe('error');
      expect(result.queued).toBe(false);
      expect(orch.offlineQueue).toHaveLength(0);
    });

    test('4xx with unparseable body is FINAL: not queued', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.reject(new Error('not json')),
      });
      const orch = createInstance('/player-scanner/', mockFetch);
      orch.connected = true;

      const result = await orch.scanToken('kaa001', 'team');
      expect(result.status).toBe('error');
      expect(result.queued).toBe(false);
      expect(orch.offlineQueue).toHaveLength(0);
    });
  });

  // ─── Batch Replay (F-SCAN-10) ─────────────────────────────────────

  describe('processOfflineQueue', () => {
    function batchIdOfCall(mockFetch, idx = 0) {
      return JSON.parse(mockFetch.mock.calls[idx][1].body).batchId;
    }

    test('successful batch clears queue and pending batch snapshot', async () => {
      const orch = createInstance('/player-scanner/');
      orch.connected = true;
      orch.queueOffline('t1', 'team');
      orch.queueOffline('t2', 'team');

      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await orch.processOfflineQueue();

      expect(orch.offlineQueue).toHaveLength(0);
      expect(orch.pendingBatch).toBeNull();
      expect(mockStorage['pending_batch']).toBeUndefined();
    });

    test('F-SCAN-10: retry after 5xx reuses the SAME batchId', async () => {
      const orch = createInstance('/player-scanner/');
      orch.connected = true;
      orch.queueOffline('t1', 'team');
      orch.queueOffline('t2', 'team');

      // Attempt 1: 503 → snapshot stays pending (items moved OUT of the
      // queue at formation, PS-1)
      global.fetch = jest.fn().mockResolvedValue({
        ok: false, status: 503, json: () => Promise.resolve({}),
      });
      await orch.processOfflineQueue();
      expect(orch.offlineQueue).toHaveLength(0);
      expect(orch.pendingBatch.items).toHaveLength(2);
      const firstBatchId = batchIdOfCall(global.fetch);

      // Attempt 2: success → SAME batchId (backend idempotency cache works)
      // (constructor's initial checkConnection rejection settles during the
      // first await and flips connected=false — re-pin it, as elsewhere)
      orch.connected = true;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await orch.processOfflineQueue();
      expect(batchIdOfCall(global.fetch)).toBe(firstBatchId);
      expect(orch.offlineQueue).toHaveLength(0);
      expect(orch.pendingBatch).toBeNull();
    });

    test('F-SCAN-10: retry after network error reuses the SAME batchId', async () => {
      const orch = createInstance('/player-scanner/');
      orch.connected = true;
      orch.queueOffline('t1', 'team');

      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
      await orch.processOfflineQueue();
      expect(orch.pendingBatch.items).toHaveLength(1);
      const firstBatchId = batchIdOfCall(global.fetch);

      orch.connected = true; // re-pin (see note in 5xx test)
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await orch.processOfflineQueue();
      expect(batchIdOfCall(global.fetch)).toBe(firstBatchId);
    });

    test('PS-1: a scan queued between a lost send and its retry is NOT lost', async () => {
      const orch = createInstance('/player-scanner/');
      orch.connected = true;
      orch.queueOffline('t1', 'team');

      // Attempt 1: response lost (network-class) — the server may have
      // processed the batch anyway. Snapshot stays pending.
      global.fetch = jest.fn().mockRejectedValue(new Error('response lost'));
      await orch.processOfflineQueue();
      const firstBatchId = batchIdOfCall(global.fetch);
      const firstTokens = JSON.parse(global.fetch.mock.calls[0][1].body)
        .transactions.map(t => t.tokenId);

      // A NEW scan arrives between attempts
      orch.queueOffline('t2', 'team');

      // Attempt 2 (retry): must resend EXACTLY the original snapshot — t2
      // must not ride under the possibly-already-processed batchId, or the
      // backend's cached response would mark it sent without processing it
      orch.connected = true;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await orch.processOfflineQueue();
      const retryBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(retryBody.batchId).toBe(firstBatchId);
      expect(retryBody.transactions.map(t => t.tokenId)).toEqual(firstTokens);

      // t2 is still queued and goes out under a DIFFERENT batchId
      expect(orch.offlineQueue).toHaveLength(1);
      orch.connected = true;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await orch.processOfflineQueue();
      const nextBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(nextBody.batchId).not.toBe(firstBatchId);
      expect(nextBody.transactions.map(t => t.tokenId)).toEqual(['t2']);
    });

    test('PS-1: concurrent processOfflineQueue calls send exactly one batch', async () => {
      const orch = createInstance('/player-scanner/');
      orch.connected = true;
      orch.queueOffline('t1', 'team');

      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await Promise.all([orch.processOfflineQueue(), orch.processOfflineQueue()]);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(orch.pendingBatch).toBeNull();
    });

    test('a NEW batch after success mints a NEW batchId', async () => {
      const orch = createInstance('/player-scanner/');
      orch.connected = true;

      orch.queueOffline('t1', 'team');
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await orch.processOfflineQueue();
      const firstBatchId = batchIdOfCall(global.fetch);

      orch.connected = true; // re-pin (see note in 5xx test)
      orch.queueOffline('t2', 'team');
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await orch.processOfflineQueue();
      expect(batchIdOfCall(global.fetch)).not.toBe(firstBatchId);
    });

    test('F-SCAN-10: 400 batch response is DROPPED with error report, not requeued', async () => {
      const orch = createInstance('/player-scanner/');
      orch.connected = true;
      orch.queueOffline('t1', 'team');
      orch.queueOffline('t2', 'team');

      global.fetch = jest.fn().mockResolvedValue({
        ok: false, status: 400,
        json: () => Promise.resolve({ error: 'VALIDATION_ERROR', message: 'Validation failed' }),
      });
      await orch.processOfflineQueue();

      expect(orch.offlineQueue).toHaveLength(0); // dropped, NOT requeued forever
      expect(orch.pendingBatch).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('dropping'),
        expect.anything(),
        expect.anything()
      );
    });

    test('pending batch SNAPSHOT survives reload (persisted to localStorage)', async () => {
      const orch = createInstance('/player-scanner/');
      orch.connected = true;
      orch.queueOffline('t1', 'team');

      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
      await orch.processOfflineQueue();
      const persisted = JSON.parse(mockStorage['pending_batch']);
      expect(persisted.batchId).toBeTruthy();
      expect(persisted.items.map(i => i.tokenId)).toEqual(['t1']);

      const orch2 = createInstance('/player-scanner/');
      expect(orch2.pendingBatch).toEqual(persisted);
    });

    test('legacy id-only pending_batch_id key is dropped on load (items stayed in queue)', () => {
      mockStorage['pending_batch_id'] = 'PLAYER_X_legacy_0';
      const orch = createInstance('/player-scanner/');
      expect(orch.pendingBatch).toBeNull();
      expect(mockStorage['pending_batch_id']).toBeUndefined();
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
