/**
 * tokenDisplay.js unit tests
 *
 * Coverage targets:
 *  - displayMemory(): image/audio/status rendering decisions
 *  - handleImageError(): fallback SVG, no-loop guard
 *  - setupAudioWithAutoplay(): autoplay path, autoplay-blocked path
 *  - stopAudio(): pause/reset + null guard
 *  - showError(): DOM insertion + auto-removal
 *  - showVideoAlert() / showVideoUnavailable() / hideVideoAlert(): video overlay lifecycle
 */

const tokenDisplay = require('../js/tokenDisplay');

// ─── DOM helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal DOM that tokenDisplay methods depend on.
 * Called in beforeEach — jsdom state persists across tests in the same suite.
 */
function buildDOM() {
  document.body.innerHTML = `
    <div class="main-container"></div>
    <div id="scannerContainer" class="active"></div>
    <div id="memoryDisplay"></div>
    <div id="memoryStatusOverlay" style="animation: none;"></div>
    <div id="memoryStatus"></div>
    <img id="memoryImage" style="display: none;" />
    <div id="audioPlaceholder"></div>
    <div id="audioIndicator"></div>
    <audio id="memoryAudio"></audio>
    <div id="continueHint"></div>
    <div id="video-alert"></div>
  `;
}

// ─── displayMemory ────────────────────────────────────────────────────────────

describe('tokenDisplay.displayMemory', () => {
  beforeEach(() => {
    buildDOM();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('hides scannerContainer and shows memoryDisplay', () => {
    const token = { image: null, audio: null, SF_RFID: 'tok1' };
    tokenDisplay.displayMemory(token, true);

    expect(document.getElementById('scannerContainer').classList.contains('active')).toBe(false);
    expect(document.getElementById('memoryDisplay').classList.contains('active')).toBe(true);
  });

  test('shows "New Memory!" status for new token', () => {
    const token = { image: null, audio: null, SF_RFID: 'tok1' };
    tokenDisplay.displayMemory(token, true);

    const status = document.getElementById('memoryStatus');
    expect(status.textContent).toContain('New Memory');
    expect(status.className).toContain('new-memory');
  });

  test('shows "Memory Revisited" for previously-scanned token', () => {
    const token = { image: null, audio: null, SF_RFID: 'tok1' };
    tokenDisplay.displayMemory(token, false);

    const status = document.getElementById('memoryStatus');
    expect(status.textContent).toContain('Memory Revisited');
    expect(status.className).not.toContain('new-memory');
  });

  test('displays image and wires onerror when token has image', () => {
    const token = { image: 'assets/images/tok1.bmp', audio: null, SF_RFID: 'tok1' };
    tokenDisplay.displayMemory(token, true);

    const img = document.getElementById('memoryImage');
    expect(img.style.display).toBe('block');
    expect(img.src).toContain('tok1.bmp');
    expect(typeof img.onerror).toBe('function');
  });

  test('hides image and shows audio placeholder when token has audio but no image', () => {
    const token = { image: null, audio: 'assets/audio/tok1.wav', SF_RFID: 'tok1' };
    tokenDisplay.displayMemory(token, true);

    const img = document.getElementById('memoryImage');
    const placeholder = document.getElementById('audioPlaceholder');
    expect(img.style.display).toBe('none');
    expect(placeholder.classList.contains('active')).toBe(true);
  });

  test('hides both image and placeholder when token has neither', () => {
    const token = { image: null, audio: null, SF_RFID: 'tok1' };
    tokenDisplay.displayMemory(token, true);

    const img = document.getElementById('memoryImage');
    const placeholder = document.getElementById('audioPlaceholder');
    expect(img.style.display).toBe('none');
    expect(placeholder.classList.contains('active')).toBe(false);
  });

  test('appends token ID to status when no media at all', () => {
    const token = { image: null, audio: null, SF_RFID: 'tok_no_media' };
    tokenDisplay.displayMemory(token, true);

    const status = document.getElementById('memoryStatus');
    expect(status.textContent).toContain('tok_no_media');
  });

  test('hides audioIndicator when no audio', () => {
    const token = { image: 'assets/images/tok1.bmp', audio: null, SF_RFID: 'tok1' };
    tokenDisplay.displayMemory(token, true);

    const indicator = document.getElementById('audioIndicator');
    expect(indicator.classList.contains('active')).toBe(false);
  });

  test('uses token.id as fallback when SF_RFID missing', () => {
    const token = { image: null, audio: null, id: 'fallback_id' };
    tokenDisplay.displayMemory(token, true);

    const status = document.getElementById('memoryStatus');
    expect(status.textContent).toContain('fallback_id');
  });
});

// ─── handleImageError ─────────────────────────────────────────────────────────

describe('tokenDisplay.handleImageError', () => {
  beforeEach(() => {
    buildDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sets img.src to an inline fallback SVG', () => {
    const img = document.getElementById('memoryImage');
    img.src = 'assets/images/missing.bmp';
    tokenDisplay.handleImageError(img);

    expect(img.src).toContain('data:image/svg+xml');
  });

  test('clears onerror handler to prevent infinite loop', () => {
    const img = document.getElementById('memoryImage');
    img.onerror = () => tokenDisplay.handleImageError(img);
    tokenDisplay.handleImageError(img);

    expect(img.onerror).toBeNull();
  });

  test('removes loading class', () => {
    const img = document.getElementById('memoryImage');
    img.classList.add('loading');
    tokenDisplay.handleImageError(img);

    expect(img.classList.contains('loading')).toBe(false);
  });

  test('logs the failed image src', () => {
    const img = document.getElementById('memoryImage');
    img.src = 'some/path.bmp';
    tokenDisplay.handleImageError(img);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load image'),
      expect.anything()
    );
  });
});

// ─── setupAudioWithAutoplay ───────────────────────────────────────────────────

describe('tokenDisplay.setupAudioWithAutoplay', () => {
  beforeEach(() => {
    buildDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sets audio src and shows indicator', () => {
    const audio = document.getElementById('memoryAudio');
    jest.spyOn(audio, 'play').mockResolvedValue(undefined);

    tokenDisplay.setupAudioWithAutoplay('assets/audio/tok1.wav');

    expect(audio.src).toContain('tok1.wav');
    expect(document.getElementById('audioIndicator').classList.contains('active')).toBe(true);
  });

  test('adds tap-to-play class when autoplay is blocked', async () => {
    const audio = document.getElementById('memoryAudio');
    jest.spyOn(audio, 'play').mockRejectedValue(new Error('autoplay blocked'));

    tokenDisplay.setupAudioWithAutoplay('assets/audio/tok1.wav');

    // Flush the rejected promise
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('audioIndicator').classList.contains('tap-to-play')).toBe(true);
  });

  test('removes tap-to-play when autoplay succeeds', async () => {
    const audio = document.getElementById('memoryAudio');
    jest.spyOn(audio, 'play').mockResolvedValue(undefined);

    tokenDisplay.setupAudioWithAutoplay('assets/audio/tok1.wav');

    // Flush the resolved promise
    await Promise.resolve();

    expect(document.getElementById('audioIndicator').classList.contains('tap-to-play')).toBe(false);
  });

  test('removes active class on audio ended', () => {
    const audio = document.getElementById('memoryAudio');
    jest.spyOn(audio, 'play').mockResolvedValue(undefined);

    tokenDisplay.setupAudioWithAutoplay('assets/audio/tok1.wav');

    // Simulate audio ending
    audio.dispatchEvent(new Event('ended'));

    expect(document.getElementById('audioIndicator').classList.contains('active')).toBe(false);
  });

  test('returns the audio element', () => {
    const audio = document.getElementById('memoryAudio');
    jest.spyOn(audio, 'play').mockResolvedValue(undefined);

    const result = tokenDisplay.setupAudioWithAutoplay('assets/audio/tok1.wav');
    expect(result).toBe(audio);
  });
});

// ─── stopAudio ────────────────────────────────────────────────────────────────

describe('tokenDisplay.stopAudio', () => {
  beforeEach(() => {
    buildDOM();
  });

  test('pauses and resets audio element', () => {
    const audio = { pause: jest.fn(), currentTime: 5 };
    tokenDisplay.stopAudio(audio);

    expect(audio.pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(0);
  });

  test('is a no-op when audio is null', () => {
    expect(() => tokenDisplay.stopAudio(null)).not.toThrow();
  });

  test('is a no-op when audio is undefined', () => {
    expect(() => tokenDisplay.stopAudio(undefined)).not.toThrow();
  });
});

// ─── showError ────────────────────────────────────────────────────────────────

describe('tokenDisplay.showError', () => {
  beforeEach(() => {
    buildDOM();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('appends error div with message to main-container', () => {
    tokenDisplay.showError('Something went wrong');

    const container = document.querySelector('.main-container');
    const errorDiv = container.querySelector('.error-message');
    expect(errorDiv).not.toBeNull();
    expect(errorDiv.textContent).toBe('Something went wrong');
  });

  test('removes error div after 3 seconds', () => {
    tokenDisplay.showError('Temporary error');

    const container = document.querySelector('.main-container');
    expect(container.querySelector('.error-message')).not.toBeNull();

    jest.advanceTimersByTime(3000);
    expect(container.querySelector('.error-message')).toBeNull();
  });

  test('supports multiple simultaneous errors', () => {
    tokenDisplay.showError('Error 1');
    tokenDisplay.showError('Error 2');

    const errors = document.querySelectorAll('.error-message');
    expect(errors.length).toBe(2);
  });
});

// ─── showVideoAlert / hideVideoAlert ─────────────────────────────────────────

describe('tokenDisplay video alert', () => {
  beforeEach(() => {
    buildDOM();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    // vibrate may not exist in jsdom
    if (!navigator.vibrate) {
      Object.defineProperty(navigator, 'vibrate', { value: jest.fn(), writable: true, configurable: true });
    }
    jest.spyOn(navigator, 'vibrate').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('showVideoAlert adds active class', () => {
    tokenDisplay.showVideoAlert();
    expect(document.getElementById('video-alert').classList.contains('active')).toBe(true);
  });

  test('showVideoAlert fires haptic vibration', () => {
    tokenDisplay.showVideoAlert();
    expect(navigator.vibrate).toHaveBeenCalledWith([200, 100, 200, 100, 400]);
  });

  test('hideVideoAlert adds exiting class then removes active+exiting', () => {
    const alertEl = document.getElementById('video-alert');
    alertEl.classList.add('active');

    tokenDisplay.hideVideoAlert();

    expect(alertEl.classList.contains('exiting')).toBe(true);
    expect(alertEl.classList.contains('active')).toBe(true); // still during animation

    jest.advanceTimersByTime(300);

    expect(alertEl.classList.contains('active')).toBe(false);
    expect(alertEl.classList.contains('exiting')).toBe(false);
  });
});

// ─── showVideoUnavailable ────────────────────────────────────────────────────

describe('tokenDisplay.showVideoUnavailable', () => {
  beforeEach(() => {
    buildDOM();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    if (!navigator.vibrate) {
      Object.defineProperty(navigator, 'vibrate', { value: jest.fn(), writable: true, configurable: true });
    }
    jest.spyOn(navigator, 'vibrate').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('shows error toast with video prefix', () => {
    tokenDisplay.showVideoUnavailable('Video busy');

    const errorDiv = document.querySelector('.error-message');
    expect(errorDiv).not.toBeNull();
    expect(errorDiv.textContent).toContain('📺');
    expect(errorDiv.textContent).toContain('Video busy');
  });

  test('uses default message when none provided', () => {
    tokenDisplay.showVideoUnavailable();

    const errorDiv = document.querySelector('.error-message');
    expect(errorDiv.textContent).toContain('Video unavailable');
    expect(errorDiv.textContent).toContain('rescan');
  });

  test('fires short distinct vibration (not the dramatic 5-pulse video pattern)', () => {
    tokenDisplay.showVideoUnavailable('busy');
    expect(navigator.vibrate).toHaveBeenCalledWith([100, 50, 100]);
    // Must NOT fire the video-triggered pattern
    expect(navigator.vibrate).not.toHaveBeenCalledWith([200, 100, 200, 100, 400]);
  });
});
