/**
 * Scanner Core — Pure logic extracted from MemoryScanner class.
 * No DOM dependencies. Returns result objects instead of calling UI methods.
 *
 * Browser: available as window.scannerCore
 * Node.js/Jest: available via require('./js/scannerCore')
 */
const scannerCore = {
  /**
   * Normalize and validate a token ID.
   * @param {string} rawId - Raw token ID from QR/NFC/manual entry
   * @returns {{ tokenId: string } | { error: string }} - Normalized ID or error
   */
  normalizeTokenId(rawId) {
    if (!rawId || typeof rawId !== 'string') {
      return { error: 'Invalid token: empty input' };
    }

    const tokenId = rawId.toLowerCase().replace(/[^a-z0-9_]/g, '');

    if (!tokenId) {
      return { error: 'Invalid token: ID contains only special characters' };
    }

    if (tokenId.length > 100) {
      return { error: `Invalid token: ID too long (${tokenId.length} characters, max 100)` };
    }

    return { tokenId };
  },

  /**
   * Detect standalone vs networked mode from URL pathname.
   * @param {string} pathname - window.location.pathname
   * @returns {boolean} - true if standalone (no orchestrator)
   */
  isStandaloneMode(pathname) {
    if (!pathname) return true;
    return !pathname.startsWith('/player-scanner/') && pathname !== '/player-scanner';
  },

  /**
   * Classify an orchestrator scanToken() response into a UI treatment.
   * Implements Decisions A4 + A5 (2026-06-09):
   *  - A4: queued scans NEVER trigger video on replay, so a video token that
   *    was merely queued must show "video unavailable", not "video triggered".
   *  - A5: server-rejected (4xx) scans are FINAL — alert the player; the
   *    video-unavailable treatment tells them to rescan to retry.
   *
   * @param {object|null} response - result of OrchestratorIntegration.scanToken()
   * @param {boolean} isVideoToken - whether the scanned token has a video field
   * @returns {{treatment: 'none'|'video-triggered'|'video-unavailable'|'error'|'queued', message?: string}}
   */
  classifyScanResponse(response, isVideoToken) {
    if (!response || response.status === 'standalone') {
      return { treatment: 'none' };
    }

    if (isVideoToken) {
      if (response.queued || response.status === 'rejected') {
        // Queued (offline / network failure / 5xx): replay never fires video.
        // Rejected (409 video busy / vlc down): scan recorded, video skipped.
        return {
          treatment: 'video-unavailable',
          message: 'Video unavailable — rescan to retry'
        };
      }
      if (response.status === 'error') {
        return { treatment: 'error', message: response.error || 'Scan failed' };
      }
      return { treatment: 'video-triggered' };
    }

    if (response.queued) {
      return { treatment: 'queued', message: 'Scan queued - orchestrator unavailable' };
    }
    if (response.status === 'error' || response.status === 'rejected') {
      return {
        treatment: 'error',
        message: response.error || response.message || 'Scan failed'
      };
    }
    return { treatment: 'none' };
  }
};

// Browser: attach to window
if (typeof window !== 'undefined') {
  window.scannerCore = scannerCore;
}

// Node.js/Jest: CJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = scannerCore;
}
