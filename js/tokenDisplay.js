/**
 * tokenDisplay.js — Memory rendering logic extracted from MemoryScanner.
 *
 * Handles: image display, audio autoplay, video-alert overlay, error toasts.
 * No orchestrator or scan logic here — purely visual output from a token object.
 *
 * Browser: available as window.tokenDisplay
 * Node.js/Jest: available via require('./js/tokenDisplay')
 */
const tokenDisplay = {
  /**
   * Show the memory display screen for a given token.
   * Hides the scanner container and renders image + audio.
   *
   * @param {object} token - Token data object from tokens.json
   * @param {boolean} isNew - true if this is the first time the token was scanned
   */
  displayMemory(token, isNew) {
    // Hide scanner, show memory display
    document.getElementById('scannerContainer').classList.remove('active');
    document.getElementById('memoryDisplay').classList.add('active');

    // Reset and show status overlay (triggers auto-fade animation)
    const statusOverlay = document.getElementById('memoryStatusOverlay');
    statusOverlay.style.animation = 'none';
    statusOverlay.offsetHeight; // Force reflow
    statusOverlay.style.animation = 'status-fade 4s ease-out forwards';

    // Show status (new vs revisited)
    const status = document.getElementById('memoryStatus');
    status.textContent = isNew ? '✨ New Memory!' : '✓ Memory Revisited';
    status.className = isNew ? 'memory-status new-memory' : 'memory-status';

    // Handle image display
    const img = document.getElementById('memoryImage');
    const placeholder = document.getElementById('audioPlaceholder');

    if (token.image) {
      img.style.display = 'block';
      placeholder.classList.remove('active');
      img.classList.add('loading');
      // F-PARITY-12: wire onerror BEFORE setting src so a 404'd
      // image shows the fallback instead of a broken-image glyph
      img.onerror = () => tokenDisplay.handleImageError(img);
      img.src = token.image;
      img.onload = () => img.classList.remove('loading');
    } else {
      // No image - show placeholder if audio exists
      img.style.display = 'none';
      if (token.audio) {
        placeholder.classList.add('active');
      } else {
        placeholder.classList.remove('active');
      }
    }

    // Setup audio with auto-play
    if (token.audio) {
      tokenDisplay.setupAudioWithAutoplay(token.audio);
    } else {
      // Hide audio indicator if no audio
      document.getElementById('audioIndicator').classList.remove('active');
    }

    // If no media at all, show token ID
    if (!token.image && !token.audio) {
      status.textContent += ` Token: ${token.SF_RFID || token.id}`;
    }
  },

  /**
   * Fallback handler when a token image fails to load (404, network error).
   * Replaces broken-image glyph with an inline SVG placeholder.
   *
   * @param {HTMLImageElement} img - The img element whose load failed
   */
  handleImageError(img) {
    console.error('❌ Failed to load image:', img.src);
    // Clear handler first so a (theoretical) fallback failure can't loop
    img.onerror = null;
    img.classList.remove('loading');
    // Use fallback image
    img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"%3E%3Crect fill="%23888" width="400" height="400"/%3E%3Ctext x="50%25" y="50%25" font-size="120" fill="white" text-anchor="middle" dominant-baseline="middle"%3E🖼️%3C/text%3E%3C/svg%3E';
  },

  /**
   * Set up audio element for playback with autoplay + tap-to-play fallback.
   * Wires the tap-to-play handler on the audio indicator.
   *
   * @param {string} audioUrl - URL of the audio asset to play
   * @returns {HTMLAudioElement} The audio element (so the caller can stop it later)
   */
  setupAudioWithAutoplay(audioUrl) {
    const audioIndicator = document.getElementById('audioIndicator');
    const audio = document.getElementById('memoryAudio');

    audio.src = audioUrl;

    audioIndicator.classList.add('active');
    audioIndicator.classList.remove('tap-to-play');

    // Auto-play with fallback for blocked browsers
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        audioIndicator.classList.add('tap-to-play');
      });
    }

    audio.onended = () => {
      audioIndicator.classList.remove('active');
    };

    return audio;
  },

  /**
   * Stop any currently playing audio and reset state.
   *
   * @param {HTMLAudioElement|null} audio - The audio element to stop
   */
  stopAudio(audio) {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  },

  /**
   * Display a transient error toast at the bottom of the main container.
   * Auto-dismisses after 3 seconds.
   *
   * @param {string} message - Human-readable error text
   */
  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.querySelector('.main-container').appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
    }, 3000);
  },

  /**
   * Show the dramatic full-screen video-triggered overlay.
   * Also fires a distinct haptic pattern for video alert.
   */
  showVideoAlert() {
    const alert = document.getElementById('video-alert');
    alert.classList.add('active');

    // Haptic feedback - dramatic pattern for video alert
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    console.log('📺 Video alert shown - LOOK AT THE VIDEO SCREEN');
  },

  /**
   * Show a short "video unavailable" error toast (Decision A4/A5).
   * Used when a video token was scanned but the orchestrator could not
   * queue playback (offline, video busy, VLC down). The local memory display
   * is unaffected; player rescans later to retry.
   *
   * @param {string} [message] - Optional message override
   */
  showVideoUnavailable(message) {
    tokenDisplay.showError(`📺 ${message || 'Video unavailable — rescan to retry'}`);

    // Distinct short vibration (vs the dramatic video-alert pattern)
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    console.log('📺 Video unavailable treatment shown (no playback promised)');
  },

  /**
   * Hide the video-triggered overlay with a short exit animation.
   */
  hideVideoAlert() {
    const alert = document.getElementById('video-alert');
    // Add exiting class for exit animation
    alert.classList.add('exiting');

    // Remove after animation completes
    setTimeout(() => {
      alert.classList.remove('active', 'exiting');
    }, 300);

    console.log('📺 Video alert hidden');
  }
};

// Browser: attach to window
if (typeof window !== 'undefined') {
  window.tokenDisplay = tokenDisplay;
}

// Node.js/Jest: CJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = tokenDisplay;
}
