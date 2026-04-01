const scannerCore = require('../js/scannerCore');

describe('scannerCore', () => {
  describe('normalizeTokenId', () => {
    test('normalizes valid token ID to lowercase', () => {
      expect(scannerCore.normalizeTokenId('KAA001')).toEqual({ tokenId: 'kaa001' });
    });

    test('strips non-alphanumeric characters except underscore', () => {
      expect(scannerCore.normalizeTokenId('04:A1:B2:C3')).toEqual({ tokenId: '04a1b2c3' });
    });

    test('preserves underscores', () => {
      expect(scannerCore.normalizeTokenId('test_001')).toEqual({ tokenId: 'test_001' });
    });

    test('handles already-clean input', () => {
      expect(scannerCore.normalizeTokenId('kaa001')).toEqual({ tokenId: 'kaa001' });
    });

    test('returns error for null input', () => {
      const result = scannerCore.normalizeTokenId(null);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('empty input');
    });

    test('returns error for undefined input', () => {
      const result = scannerCore.normalizeTokenId(undefined);
      expect(result).toHaveProperty('error');
    });

    test('returns error for empty string', () => {
      const result = scannerCore.normalizeTokenId('');
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('empty input');
    });

    test('returns error for non-string input', () => {
      const result = scannerCore.normalizeTokenId(12345);
      expect(result).toHaveProperty('error');
    });

    test('returns error when only special characters', () => {
      const result = scannerCore.normalizeTokenId(':::---...');
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('special characters');
    });

    test('returns error for ID exceeding 100 characters', () => {
      const longId = 'a'.repeat(101);
      const result = scannerCore.normalizeTokenId(longId);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('too long');
    });

    test('accepts ID at exactly 100 characters', () => {
      const maxId = 'a'.repeat(100);
      const result = scannerCore.normalizeTokenId(maxId);
      expect(result).toEqual({ tokenId: maxId });
    });

    test('strips spaces and special chars before length check', () => {
      // 90 alphanumeric + 20 colons = 110 raw, but 90 after strip
      const rawId = ('a:').repeat(45);
      const result = scannerCore.normalizeTokenId(rawId);
      expect(result).toHaveProperty('tokenId');
      expect(result.tokenId.length).toBe(45);
    });
  });

  describe('isStandaloneMode', () => {
    test('returns false for /player-scanner/ path (networked)', () => {
      expect(scannerCore.isStandaloneMode('/player-scanner/')).toBe(false);
    });

    test('returns false for /player-scanner path without trailing slash', () => {
      expect(scannerCore.isStandaloneMode('/player-scanner')).toBe(false);
    });

    test('returns false for /player-scanner/index.html', () => {
      expect(scannerCore.isStandaloneMode('/player-scanner/index.html')).toBe(false);
    });

    test('returns true for root path (standalone/GitHub Pages)', () => {
      expect(scannerCore.isStandaloneMode('/')).toBe(true);
    });

    test('returns true for GitHub Pages subpath', () => {
      expect(scannerCore.isStandaloneMode('/aln-memory-scanner/')).toBe(true);
    });

    test('returns true for empty pathname', () => {
      expect(scannerCore.isStandaloneMode('')).toBe(true);
    });

    test('returns true for null pathname', () => {
      expect(scannerCore.isStandaloneMode(null)).toBe(true);
    });

    test('returns true for undefined pathname', () => {
      expect(scannerCore.isStandaloneMode(undefined)).toBe(true);
    });
  });
});
