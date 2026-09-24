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
        undoCount: this.undoStack.length,
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
     * Undo action: returns previous state, pushes current to redo
     */
    undo(currentState) {
      if (!this.canUndo()) return null;

      const previous = this.undoStack.pop();
      if (currentState) {
        this.redoStack.push(this.cloneState(currentState));
      }

      this.notify();
      return previous;
    }

    /**
     * Redo action: returns next state, pushes current to undo
     */
    redo(currentState) {
      if (!this.canRedo()) return null;

      const next = this.redoStack.pop();
      if (currentState) {
        this.undoStack.push(this.cloneState(currentState));
      }

      this.notify();
      return next;
    }

    canUndo() {
      return this.undoStack.length > 0;
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
