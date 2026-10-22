import { TBlueDotPositionUpdate } from "@mappedin/mappedin-js";

const ms = async (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time));

let currentPosition: TBlueDotPositionUpdate | null = null;
/**
 * ✅ NEW: expose the module-level currentPosition to outside callers
 * (e.g. a Recenter button) without touching how currentPosition itself
 * gets set anywhere above.
 */
export function getCurrentPosition(): TBlueDotPositionUpdate | null {
  return currentPosition;
}

export class DynamicPositionUpdater {
  interval: NodeJS.Timeout | null = null;
  positions: TBlueDotPositionUpdate[] = [];
  speed: number = 4000;

  private index: number = 0;
  private callback: Function | null = null;
  private paused: boolean = false;

  /**
   * Cancel any existing position updates
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Start a new set of position updates
   */
  start(
    positions: TBlueDotPositionUpdate[],
    speed: number,
    callBack: Function
  ) {
    this.positions = positions;
    this.speed = speed;
    this.callback = callBack;
    this.index = 0;
    this.paused = false;

    this.stop();
    this.runInterval();
  }

  private runInterval() {
    this.interval = setInterval(() => {
      currentPosition = this.positions[this.index];
      this.index++;
      if (this.index >= this.positions.length) {
        this.stop();
      }
      this.callback?.(currentPosition);
    }, this.speed);
  }

  /**
   * Pause in place — stops the timer WITHOUT resetting the index.
   */
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.stop();
  }

  /**
   * Resume from wherever pause() left off.
   */
  resume() {
    if (!this.paused) return;
    this.paused = false;

    if (this.index >= this.positions.length || !this.callback) {
      return;
    }

    this.runInterval();
  }

  /**
   * ✅ NEW: index of the most recently emitted position tick.
   * `this.index` is incremented immediately after reading
   * `this.positions[this.index]` and BEFORE the callback fires (see
   * runInterval above), so by the time a caller asks "what was just
   * emitted?", `this.index` is already one past that position. Subtract 1
   * to get the actual last-emitted index. Returns -1 if nothing has been
   * emitted yet.
   */
  getLastEmittedIndex(): number {
    return this.index - 1;
  }

  /**
   * ✅ NEW: teleport playback to a specific index and immediately emit
   * that position via the provided callback (or the instance's existing
   * callback if none is passed). Used by the "I've arrived at Building X"
   * checkpoint to skip ahead past an outdoor zigzag stretch.
   *
   * Keeps whatever running/paused state the updater was already in:
   * - If it was running, the interval is restarted so the next tick
   *   continues from `targetIndex + 1` at the same speed.
   * - If it was paused (e.g. mid stairs-transition), it stays paused —
   *   this only emits the one position immediately; resume() will pick
   *   up from the new index later.
   */
  jumpToIndex(targetIndex: number, callback?: Function) {
    if (targetIndex < 0 || targetIndex >= this.positions.length) {
      console.warn(
        "⚠️ jumpToIndex: index out of range:",
        targetIndex,
        "(positions length:",
        this.positions.length,
        ")"
      );
      return;
    }

    const wasRunning = this.interval !== null;
    this.stop();

    currentPosition = this.positions[targetIndex];
    this.index = targetIndex + 1;

    const cb = callback ?? this.callback;
    cb?.(currentPosition);

    if (wasRunning && !this.paused) {
      this.runInterval();
    }
  }

  /**
   * Stops updates and emits an update back at the beginning
   */
  async reset() {
    this.stop();
    this.paused = false;
    this.index = 0;
    await ms(this.speed);
    if (this.positions.length > 0) {
      currentPosition = this.positions[0];
    }
  }
}
