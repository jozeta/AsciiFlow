/**
 * AsciiFlow - History Module
 * Undo/Redo stack management with deep snapshot cloning.
 */

(function (global) {
  'use strict';

  class HistoryManager {
    constructor(maxStates = 100) {
      this.maxStates = maxStates;
      this.undoStack = [];
      this.redoStack = [];
      this.listeners = [];
    }

    /**
     * Subscribe to history state changes (to update undo/redo buttons)
     */
    onChange(callback) {
      if (typeof callback === 'function') {
        this.listeners.push(callback);
      }
    }

    notify() {
      const state = {
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        undoCount: Math.max(0, this.undoStack.length - 1),
        redoCount: this.redoStack.length
      };
      for (const cb of this.listeners) {
        cb(state);
      }
    }

    /**
     * Deep clone diagram state
     */
    cloneState(state) {
      return JSON.parse(JSON.stringify(state));
    }

    /**
     * Push a new state snapshot
     */
    push(currentState) {
      if (!currentState) return;

      const snapshot = this.cloneState(currentState);

      // Avoid pushing identical snapshot to top of stack
      if (this.undoStack.length > 0) {
        const top = this.undoStack[this.undoStack.length - 1];
        if (JSON.stringify(top) === JSON.stringify(snapshot)) {
          return;
        }
      }

      this.undoStack.push(snapshot);
      if (this.undoStack.length > this.maxStates) {
        this.undoStack.shift();
      }

      // Any new action clears redo
      this.redoStack = [];
      this.notify();
    }

    /**
     * The top of the undo stack is always the current state: the canvas
     * records a snapshot after every change. Undo moves that snapshot to the
     * redo stack and returns the one below it.
     *
     * currentState is the live diagram; if it has unrecorded changes, it is
     * kept on the redo stack so Redo can bring it back.
     */
    undo(currentState) {
      const top = this.undoStack[this.undoStack.length - 1];
      const unrecorded = currentState && top &&
        JSON.stringify(currentState) !== JSON.stringify(top);

      if (unrecorded) {
        // Go back to the last recorded state; Redo restores the live one
        this.redoStack.push(this.cloneState(currentState));
      } else {
        if (!this.canUndo()) return null;
        this.redoStack.push(this.undoStack.pop());
      }

      this.notify();
      return this.cloneState(this.undoStack[this.undoStack.length - 1]);
    }

    /**
     * Redo action: returns the next state and makes it the current one
     */
    redo() {
      if (!this.canRedo()) return null;

      const next = this.redoStack.pop();
      this.undoStack.push(next);

      this.notify();
      return this.cloneState(next);
    }

    canUndo() {
      return this.undoStack.length > 1;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    clear() {
      this.undoStack = [];
      this.redoStack = [];
      this.notify();
    }
  }

  // Export to global
  global.AsciiHistory = HistoryManager;

})(typeof window !== 'undefined' ? window : this);
