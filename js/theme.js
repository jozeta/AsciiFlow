/**
 * AsciiFlow - Theme Manager
 * Manages Nordic Light and Dark themes, persistence, and reactive updates.
 */

(function (global) {
  'use strict';

  class ThemeManager {
    constructor() {
      this.currentTheme = 'light';
      this.listeners = [];
    }

    init() {
      const prefs = global.AsciiStorage ? global.AsciiStorage.loadPreferences() : {};
      let preferredTheme = prefs.theme;

      if (!preferredTheme) {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          preferredTheme = 'dark';
        } else {
          preferredTheme = 'light';
        }
      }

      this.setTheme(preferredTheme, false);

      // Listen for system theme changes if user hasn't explicitly set preference
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
          const userPref = global.AsciiStorage ? global.AsciiStorage.loadPreferences().theme : null;
          if (!userPref) {
            this.setTheme(e.matches ? 'dark' : 'light', true);
          }
        });
      }
    }

    setTheme(theme, save = true) {
      this.currentTheme = theme === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', this.currentTheme);

      if (save && global.AsciiStorage) {
        global.AsciiStorage.savePreferences({ theme: this.currentTheme });
      }

      this.updateUI();
      this.notifyListeners();
    }

    toggleTheme() {
      const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
      this.setTheme(nextTheme, true);
      return nextTheme;
    }

    isDark() {
      return this.currentTheme === 'dark';
    }

    onThemeChange(callback) {
      if (typeof callback === 'function') {
        this.listeners.push(callback);
      }
    }

    notifyListeners() {
      for (const cb of this.listeners) {
        try {
          cb(this.currentTheme);
        } catch (e) {
          console.error('Theme change callback error:', e);
        }
      }
    }

    updateUI() {
      const themeBtn = document.getElementById('themeToggleBtn');
      if (themeBtn) {
        const icon = themeBtn.querySelector('i') || themeBtn;
        if (this.currentTheme === 'dark') {
          themeBtn.innerHTML = '<i class="bi bi-sun"></i>';
          themeBtn.title = 'Switch to Light Theme';
          themeBtn.setAttribute('aria-label', 'Switch to Light Theme');
        } else {
          themeBtn.innerHTML = '<i class="bi bi-moon-stars"></i>';
          themeBtn.title = 'Switch to Dark Theme';
          themeBtn.setAttribute('aria-label', 'Switch to Dark Theme');
        }
      }
    }
  }

  global.AsciiTheme = new ThemeManager();

})(typeof window !== 'undefined' ? window : this);
