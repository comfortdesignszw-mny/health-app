// On-device step counting via the phone's accelerometer (DeviceMotion API).
//
// Important, honest limitation: this only counts steps while this browser
// tab/installed app is open and the screen is on. Unlike a native fitness
// app, a PWA has no background service that keeps counting once the app is
// closed or the screen locks — that's a platform restriction, not something
// this code can work around. It's genuinely useful for "count my walk right
// now" but not a 24/7 background pedometer.
//
// Support: works on most Android browsers over HTTPS without a prompt.
// iOS 13+ Safari requires an explicit user-gesture permission request
// (DeviceMotionEvent.requestPermission()) — call requestPermission() from a
// tap handler. Desktop browsers with no motion sensor are unsupported.

class StepCounter {
  constructor() {
    this.steps = 0;
    this.running = false;
    this._onStep = null;
    this._runningMag = null;
    this._lastStepTime = 0;
    this._handleMotion = this._handleMotion.bind(this);
  }

  static isSupported() {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  static needsIOSPermission() {
    return typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
  }

  // Must be called synchronously from within a user-gesture handler (a click/tap) on iOS.
  static async requestPermission() {
    if (!StepCounter.needsIOSPermission()) return 'granted';
    try {
      return await DeviceMotionEvent.requestPermission();
    } catch {
      return 'denied';
    }
  }

  start(startingCount, onStep) {
    if (this.running) return;
    this.steps = startingCount || 0;
    this._onStep = onStep || (() => {});
    this._runningMag = null;
    this._lastStepTime = 0;
    window.addEventListener('devicemotion', this._handleMotion, true);
    this.running = true;
  }

  stop() {
    if (!this.running) return;
    window.removeEventListener('devicemotion', this._handleMotion, true);
    this.running = false;
  }

  _handleMotion(event) {
    const a = event.acceleration && (event.acceleration.x || event.acceleration.y || event.acceleration.z)
      ? event.acceleration
      : event.accelerationIncludingGravity;
    if (!a || a.x == null) return;

    const magnitude = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);

    if (this._runningMag == null) {
      this._runningMag = magnitude;
      return;
    }

    // Exponential moving average acts as a low-pass filter for the
    // "resting" baseline; a step shows up as a sharp spike above it.
    const alpha = 0.15;
    this._runningMag = alpha * magnitude + (1 - alpha) * this._runningMag;
    const delta = magnitude - this._runningMag;

    const STEP_THRESHOLD = 1.2;      // tuned for typical phone-in-hand/pocket walking
    const MIN_STEP_INTERVAL_MS = 280; // guards against double-counting one footfall

    const now = Date.now();
    if (delta > STEP_THRESHOLD && (now - this._lastStepTime) > MIN_STEP_INTERVAL_MS) {
      this._lastStepTime = now;
      this.steps += 1;
      this._onStep(this.steps);
    }
  }
}

// Rough steps → distance → calories helper, used for the
// "log today's steps as walking" shortcut on the Today screen.
function stepsToKm(steps, strideMeters = 0.78) {
  return (steps * strideMeters) / 1000;
}
