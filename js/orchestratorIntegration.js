/**
 * OrchestratorIntegration - Manages communication with ALN Orchestrator
 * Provides offline queue support: scans that fail at the network level
 * (fetch rejection / 5xx) are queued and replayed in batches when the
 * connection monitor (10s health-check interval) observes a reconnect.
 *
 * DUAL-MODE OPERATION:
 * - Networked Mode: Served from /player-scanner/ path, connection monitoring + queue
 * - Standalone Mode: Served from GitHub Pages, NO monitoring, NO queue (FR:113, 219, 222)
 */
class OrchestratorIntegration {
  constructor() {
    this.baseUrl = localStorage.getItem('orchestrator_url') || this.detectOrchestratorUrl();
    this.maxQueueSize = 100; // Maximum offline transactions

    // F-PARITY-04: stable device identity — persist the generated id so the
    // device keeps the same identity across page loads (per-device attribution
    // in session.playerScans, no device-registry churn / heartbeat noise)
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = 'PLAYER_' + Date.now();
      try {
        localStorage.setItem('device_id', deviceId);
      } catch (e) {
        console.error('Failed to persist device_id:', e);
      }
    }
    this.deviceId = deviceId;

    // Detect deployment mode (FR:113 - Standalone "never attempts to connect")
    // Handle both /player-scanner and /player-scanner/ (trailing slash variations)
    const pathname = window.location.pathname;
    this.isStandalone = !pathname.startsWith('/player-scanner/') && pathname !== '/player-scanner';

    if (!this.isStandalone) {
      // NETWORKED MODE: Connection monitoring + offline queue
      this.offlineQueue = [];
      this.connected = false;
      this.connectionCheckInterval = null;
      this.pendingConnectionCheck = null;

      // Load offline queue from localStorage
      this.loadQueue();

      // F-SCAN-10: restore in-flight batch id so a reload mid-retry reuses it
      this.pendingBatchId = localStorage.getItem('pending_batch_id') || null;

      // Start connection monitoring
      this.startConnectionMonitor();
    } else {
      // STANDALONE MODE: No monitoring, no queue (FR:219 - "transactions processed immediately")
      this.offlineQueue = [];
      this.connected = false;
      this.connectionCheckInterval = null;
      this.pendingConnectionCheck = undefined;
      this.pendingBatchId = null;

      console.log('Player Scanner: Standalone mode detected (no orchestrator connection)');
    }
  }

  detectOrchestratorUrl() {
    // If served from orchestrator, use same origin
    // Handle both /player-scanner and /player-scanner/ (trailing slash variations)
    const pathname = window.location.pathname;
    if (pathname.startsWith('/player-scanner/') || pathname === '/player-scanner') {
      return window.location.origin;
    }
    // Fallback to localhost for development
    // HTTPS required for Web NFC API support in GM Scanner
    return 'https://localhost:3000';
  }

  /**
   * Normalize URL to use HTTPS protocol (Web NFC API requirement)
   * @param {string} url - URL to normalize
   * @returns {string} Normalized URL with https:// protocol
   */
  normalizeUrl(url) {
    if (!url) return url;
    // Replace http:// with https:// for Web NFC API compatibility
    return url.replace(/^http:\/\//i, 'https://');
  }

  async scanToken(tokenId, teamId) {
    // STANDALONE MODE: Process locally, never attempt network (FR:113, FR:222)
    if (this.isStandalone) {
      console.log(`Standalone scan: ${tokenId} (local processing only)`);
      return { status: 'standalone', logged: true };
    }

    // NETWORKED MODE: Attempt network or queue for sync
    if (!this.connected) {
      this.queueOffline(tokenId, teamId);
      return { status: 'offline', queued: true };
    }

    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId,
          ...(teamId && { teamId }),  // Only include if truthy (contract: optional string, not null)
          deviceId: this.deviceId,
          deviceType: 'player',  // P2.1: Device-type-specific behavior
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      // Network-level failure (fetch rejection) — the request may never have
      // reached the server. Queue for batch replay (Decision A5).
      console.error('Scan failed (network):', error);
      this.queueOffline(tokenId, teamId);
      return { status: 'error', queued: true, error: error.message };
    }

    // Parse response body (both success and error shapes are JSON)
    let body = null;
    try {
      body = await response.json();
    } catch (e) {
      // Non-JSON body — fall through with null body
    }

    if (response.ok) {
      // 200: {status:'accepted', tokenId, mediaAssets, videoQueued}
      return body || { status: 'accepted' };
    }

    if (response.status >= 500) {
      // Server-side failure (5xx) — retryable, queue for replay (Decision A5)
      console.error(`Scan failed (HTTP ${response.status}), queuing for replay`);
      this.queueOffline(tokenId, teamId);
      return {
        status: 'error',
        queued: true,
        error: (body && body.message) || `HTTP error! status: ${response.status}`
      };
    }

    // 4xx = FINAL — the server made a decision; NEVER queue (F-SCAN-01 P0,
    // Decision A5: rejected scans are definitive, rescan to retry).
    // /api/scan 409 is a documented oneOf:
    //   {status:'rejected', ...}        → video trigger rejected, scan WAS recorded
    //   {error:'SESSION_NOT_FOUND', ..} → scan NOT recorded (final: no session)
    if (response.status === 409 && body && body.status === 'rejected') {
      console.warn('Scan video-rejected (scan recorded, video skipped):', body.message);
      return { ...body, queued: false };
    }

    // SESSION_NOT_FOUND 409, 400 validation, 404 unknown token, other 4xx
    const errorMessage = (body && body.message) || `HTTP error! status: ${response.status}`;
    console.warn(`Scan rejected (HTTP ${response.status}, final):`, errorMessage);
    return {
      status: 'error',
      queued: false,
      error: errorMessage,
      ...(body && body.error && { code: body.error })
    };
  }

  queueOffline(tokenId, teamId) {
    // Enforce queue limit
    if (this.offlineQueue.length >= this.maxQueueSize) {
      this.offlineQueue.shift(); // Remove oldest if at limit
    }

    this.offlineQueue.push({
      tokenId,
      teamId,
      timestamp: Date.now()
    });

    this.saveQueue(); // Persist to localStorage
    console.log(`Queued offline: ${tokenId} for ${teamId}. Queue size: ${this.offlineQueue.length}`);
  }

  saveQueue() {
    try {
      localStorage.setItem('offline_queue', JSON.stringify(this.offlineQueue));
    } catch (e) {
      console.error('Failed to save offline queue:', e);
    }
  }

  loadQueue() {
    try {
      const saved = localStorage.getItem('offline_queue');
      if (saved) {
        this.offlineQueue = JSON.parse(saved);
        console.log(`Loaded ${this.offlineQueue.length} queued transactions`);
      }
    } catch (e) {
      console.error('Failed to load offline queue:', e);
      this.offlineQueue = [];
    }
  }

  async processOfflineQueue() {
    if (this.offlineQueue.length === 0 || !this.connected) {
      return;
    }

    console.log(`Processing ${this.offlineQueue.length} offline transactions...`);
    const batch = this.offlineQueue.splice(0, 10); // Process up to 10 at a time

    // F-SCAN-10: mint the batchId PER BATCH, not per attempt. Retries of the
    // same batch reuse the same id (persisted across reloads) so the backend's
    // idempotency cache deduplicates resends after a lost response.
    const batchId = this.pendingBatchId || this.generateBatchId();
    this.setPendingBatchId(batchId);

    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/scan/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId,  // P2.1: Idempotency key (stable across retries)
          transactions: batch.map(item => ({
            tokenId: item.tokenId,
            teamId: item.teamId,
            deviceId: this.deviceId,
            deviceType: 'player',  // P2.1: Device-type-specific behavior
            timestamp: new Date(item.timestamp).toISOString()
          }))
        })
      });
    } catch (error) {
      console.error('Batch processing failed (network):', error);
      // Re-queue for retry; pendingBatchId stays set for the next attempt
      this.offlineQueue.unshift(...batch);
      this.saveQueue();
      return;
    }

    if (!response) {
      // Indeterminate send (no Response object) — treat as a network-class
      // failure: requeue with the same pendingBatchId so backend idempotency
      // protects against double-processing if the batch actually landed.
      this.offlineQueue.unshift(...batch);
      this.saveQueue();
      return;
    }

    if (response.ok) {
      console.log('Batch processed successfully');
      this.setPendingBatchId(null);
      this.saveQueue();

      // Process remaining queue
      if (this.offlineQueue.length > 0) {
        setTimeout(() => this.processOfflineQueue(), 1000);
      }
      return;
    }

    if (response.status >= 400 && response.status < 500) {
      // F-SCAN-10: 4xx is FINAL — drop the batch with an error report instead
      // of requeueing it forever.
      let body = null;
      try {
        body = await response.json();
      } catch (e) {
        // No parseable body
      }
      console.error(
        `Batch rejected (HTTP ${response.status}) — dropping ${batch.length} scan(s):`,
        (body && body.message) || 'no error details',
        batch.map(item => item.tokenId)
      );
      this.setPendingBatchId(null);
      this.saveQueue();

      // Continue with the rest of the queue
      if (this.offlineQueue.length > 0) {
        setTimeout(() => this.processOfflineQueue(), 1000);
      }
      return;
    }

    // 5xx — retryable: re-queue, keep pendingBatchId for the retry
    console.error(`Batch failed (HTTP ${response.status}), will retry`);
    this.offlineQueue.unshift(...batch);
    this.saveQueue();
  }

  /**
   * Track the batchId of the in-flight/retrying batch (F-SCAN-10).
   * Persisted to localStorage so a reload mid-retry keeps idempotency.
   * @param {string|null} batchId - id to remember, or null to clear
   */
  setPendingBatchId(batchId) {
    this.pendingBatchId = batchId;
    try {
      if (batchId) {
        localStorage.setItem('pending_batch_id', batchId);
      } else {
        localStorage.removeItem('pending_batch_id');
      }
    } catch (e) {
      console.error('Failed to persist pending batch id:', e);
    }
  }

  async checkConnection() {
    try {
      // Include deviceId in health check for device tracking
      // This registers the player scanner as a connected device in the orchestrator
      const healthUrl = new URL(`${this.baseUrl}/health`);
      healthUrl.searchParams.set('deviceId', this.deviceId);
      healthUrl.searchParams.set('type', 'player');

      const response = await fetch(healthUrl, {
        method: 'GET',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      });

      const wasOffline = !this.connected;
      this.connected = response.ok;

      if (this.connected && wasOffline) {
        console.log('Connection restored!');
        this.onConnectionRestored();
      } else if (!this.connected && !wasOffline) {
        console.log('Connection lost!');
        this.onConnectionLost();
      }

      return this.connected;
    } catch (error) {
      const wasOnline = this.connected;
      this.connected = false;

      if (wasOnline) {
        console.log('Connection lost!');
        this.onConnectionLost();
      }

      return false;
    }
  }

  startConnectionMonitor() {
    // Initial check (store Promise for test cleanup)
    this.pendingConnectionCheck = this.checkConnection();

    // Check every 10 seconds
    this.connectionCheckInterval = setInterval(() => {
      this.pendingConnectionCheck = this.checkConnection();
    }, 10000);
  }

  stopConnectionMonitor() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  onConnectionRestored() {
    // Emit event for UI update
    window.dispatchEvent(new CustomEvent('orchestrator:connected'));

    // Process offline queue
    if (this.offlineQueue.length > 0) {
      this.processOfflineQueue();
    }
  }

  onConnectionLost() {
    // Emit event for UI update
    window.dispatchEvent(new CustomEvent('orchestrator:disconnected'));
  }

  updateOrchestratorUrl(newUrl) {
    // Normalize to HTTPS for Web NFC API compatibility (Oct 2025 migration)
    const normalizedUrl = this.normalizeUrl(newUrl);
    this.baseUrl = normalizedUrl;
    localStorage.setItem('orchestrator_url', normalizedUrl);
    this.checkConnection(); // Test new URL immediately
  }

  getQueueStatus() {
    return {
      connected: this.connected,
      queueSize: this.offlineQueue.length,
      maxQueueSize: this.maxQueueSize,
      deviceId: this.deviceId
    };
  }

  clearQueue() {
    this.offlineQueue = [];
    this.saveQueue();
    console.log('Offline queue cleared');
  }

  /**
   * Generate a unique batch ID for idempotent batch uploads
   * Uses simple UUID v4 generation (random)
   * @returns {string} UUID v4 format batch ID
   */
  generateBatchId() {
    // Simple UUID v4 generation: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async destroy() {
    // STANDALONE MODE: No monitoring to destroy
    if (this.isStandalone) {
      return;
    }

    // NETWORKED MODE: Stop monitoring and await pending checks
    this.stopConnectionMonitor();

    // Wait for pending connection check to complete (prevents "Cannot log after tests are done")
    if (this.pendingConnectionCheck) {
      await this.pendingConnectionCheck.catch(() => {
        // Ignore errors during cleanup
      });
      this.pendingConnectionCheck = null;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrchestratorIntegration;
}