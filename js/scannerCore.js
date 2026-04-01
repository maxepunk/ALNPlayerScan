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
