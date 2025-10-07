/**
 * OrchestratorIntegration - Manages communication with ALN Orchestrator
 * Provides offline queue support and automatic retry with exponential backoff
 *
 * DUAL-MODE OPERATION:
 * - Networked Mode: Served from /player-scanner/ path, connection monitoring + queue
 * - Standalone Mode: Served from GitHub Pages, NO monitoring, NO queue (FR:113, 219, 222)
 */
class OrchestratorIntegration {
  constructor() {
    this.baseUrl = localStorage.getItem('orchestrator_url') || this.detectOrchestratorUrl();
    this.maxQueueSize = 100; // Maximum offline transactions
    this.retryDelay = 1000;  // Initial retry delay (exponential backoff)
    this.deviceId = localStorage.getItem('device_id') || 'PLAYER_' + Date.now();

    // Detect deployment mode (FR:113 - Standalone "never attempts to connect")
    this.isStandalone = !window.location.pathname.startsWith('/player-scanner/');

    if (!this.isStandalone) {
      // NETWORKED MODE: Connection monitoring + offline queue
      this.offlineQueue = [];
      this.connected = false;
      this.connectionCheckInterval = null;
      this.pendingConnectionCheck = null;

      // Load offline queue from localStorage
      this.loadQueue();

      // Start connection monitoring
      this.startConnectionMonitor();
    } else {
      // STANDALONE MODE: No monitoring, no queue (FR:219 - "transactions processed immediately")
      this.offlineQueue = [];
      this.connected = false;
      this.connectionCheckInterval = null;
      this.pendingConnectionCheck = undefined;

      console.log('Player Scanner: Standalone mode detected (no orchestrator connection)');
    }
  }

  detectOrchestratorUrl() {
    // If served from orchestrator, use same origin
    if (window.location.pathname.startsWith('/player-scanner/')) {
      return window.location.origin;
    }
    // Fallback to localhost for development
    return 'http://localhost:3000';
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

    try {
      const response = await fetch(`${this.baseUrl}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId,
          ...(teamId && { teamId }),  // Only include if truthy (contract: optional string, not null)
          deviceId: this.deviceId,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        // Try to parse error response body
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          // If JSON parsing fails, use default message
        }
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      console.error('Scan failed:', error);
      this.queueOffline(tokenId, teamId);
      return { status: 'error', queued: true, error: error.message };
    }
  }

  queueOffline(tokenId, teamId) {
    // Enforce queue limit
    if (this.offlineQueue.length >= this.maxQueueSize) {
      this.offlineQueue.shift(); // Remove oldest if at limit
    }

    this.offlineQueue.push({
      tokenId,
      teamId,
      timestamp: Date.now(),
      retryCount: 0
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

    try {
      const response = await fetch(`${this.baseUrl}/api/scan/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: batch.map(item => ({
            tokenId: item.tokenId,
            teamId: item.teamId,
            deviceId: this.deviceId,
            timestamp: new Date(item.timestamp).toISOString()
          }))
        })
      });

      if (response.ok) {
        console.log('Batch processed successfully');
        this.saveQueue();

        // Process remaining queue
        if (this.offlineQueue.length > 0) {
          setTimeout(() => this.processOfflineQueue(), 1000);
        }
      } else {
        // Re-queue failed batch
        this.offlineQueue.unshift(...batch);
        this.saveQueue();
      }
    } catch (error) {
      console.error('Batch processing failed:', error);
      // Re-queue failed batch
      this.offlineQueue.unshift(...batch);
      this.saveQueue();
    }
  }

  async checkConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
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
    this.baseUrl = newUrl;
    localStorage.setItem('orchestrator_url', newUrl);
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