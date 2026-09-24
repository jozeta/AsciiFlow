/**
 * AsciiFlow - Storage & Persistence Module
 * Handles localStorage auto-save, JSON import/export, ASCII download, and clipboard operations.
 */

(function (global) {
  'use strict';

  const STORAGE_KEY_DIAGRAM = 'asciiflow_diagram_data';
  const STORAGE_KEY_PREFS = 'asciiflow_preferences';

  // Sample templates for quick exploration
  const SAMPLE_TEMPLATES = {
    'flowchart': {
      version: 1,
      name: 'Authentication Flow',
      mode: 'unicode',
      shapes: [
        {
          id: 'start',
          type: 'rounded-rectangle',
          x: 4,
          y: 3,
          w: 16,
          h: 5,
          text: 'Start\nLogin Request',
          textAlign: 'center'
        },
        {
          id: 'input',
          type: 'parallelogram',
          x: 25,
          y: 3,
          w: 19,
          h: 5,
          text: 'Input Credentials\n(User & Password)',
          textAlign: 'center'
        },
        {
          id: 'check',
          type: 'diamond',
          x: 49,
          y: 2,
          w: 19,
          h: 7,
          text: 'Valid\nCredentials?',
          textAlign: 'center'
        },
        {
          id: 'success',
          type: 'rectangle',
          x: 74,
          y: 3,
          w: 18,
          h: 5,
          text: 'Grant Access\nIssue JWT Token',
          textAlign: 'center'
        },
        {
          id: 'retry',
          type: 'rectangle',
          x: 49,
          y: 13,
          w: 19,
          h: 5,
          text: 'Show Error\nIncrement Retries',
          textAlign: 'center'
        }
      ],
      connectors: [
        {
          id: 'c1',
          type: 'connector',
          fromShapeId: 'start',
          fromAnchor: 'right',
          toShapeId: 'input',
          toAnchor: 'left',
          arrowEnd: 'end'
        },
        {
          id: 'c2',
          type: 'connector',
          fromShapeId: 'input',
          fromAnchor: 'right',
          toShapeId: 'check',
          toAnchor: 'left',
          arrowEnd: 'end'
        },
        {
          id: 'c3',
          type: 'connector',
          fromShapeId: 'check',
          fromAnchor: 'right',
          toShapeId: 'success',
          toAnchor: 'left',
          label: 'Yes',
          arrowEnd: 'end'
        },
        {
          id: 'c4',
          type: 'connector',
          fromShapeId: 'check',
          fromAnchor: 'bottom',
          toShapeId: 'retry',
          toAnchor: 'top',
          label: 'No',
          arrowEnd: 'end'
        }
      ],
      texts: [],
      notes: [
        {
          id: 'note1',
          type: 'note',
          x: 4,
          y: 12,
          w: 24,
          h: 6,
          text: 'Security Policy:\nMax 5 failed attempts\nbefore lock out.'
        }
      ]
    },

    'architecture': {
      version: 1,
      name: 'System Architecture',
      mode: 'unicode',
      shapes: [
        {
          id: 'client',
          type: 'rounded-rectangle',
          x: 3,
          y: 4,
          w: 16,
          h: 5,
          text: 'Web / Mobile\nClient',
          textAlign: 'center'
        },
        {
          id: 'gateway',
          type: 'rectangle',
          x: 28,
          y: 3,
          w: 18,
          h: 7,
          text: 'API Gateway\nRate Limiter\nAuth Filter',
          textAlign: 'center'
        },
        {
          id: 'auth_srv',
          type: 'rectangle',
          x: 56,
          y: 1,
          w: 18,
          h: 5,
          text: 'Auth Service\nOAuth2 / SAML',
          textAlign: 'center'
        },
        {
          id: 'order_srv',
          type: 'rectangle',
          x: 56,
          y: 7,
          w: 18,
          h: 5,
          text: 'Order Service\nOrder Processing',
          textAlign: 'center'
        },
        {
          id: 'database',
          type: 'circle',
          x: 82,
          y: 4,
          w: 22,
          h: 5,
          text: 'Database Cluster\nPostgreSQL + Redis',
          textAlign: 'center'
        }
      ],
      connectors: [
        {
          id: 'c1',
          type: 'connector',
          fromShapeId: 'client',
          fromAnchor: 'right',
          toShapeId: 'gateway',
          toAnchor: 'left',
          label: 'HTTPS',
          arrowEnd: 'end'
        },
        {
          id: 'c2',
          type: 'connector',
          fromShapeId: 'gateway',
          fromAnchor: 'right',
          toShapeId: 'auth_srv',
          toAnchor: 'left',
          label: 'gRPC',
          arrowEnd: 'end'
        },
        {
          id: 'c3',
          type: 'connector',
          fromShapeId: 'gateway',
          fromAnchor: 'right',
          toShapeId: 'order_srv',
          toAnchor: 'left',
          label: 'REST',
          arrowEnd: 'end'
        },
        {
          id: 'c4',
          type: 'connector',
          fromShapeId: 'order_srv',
          fromAnchor: 'right',
          toShapeId: 'database',
          toAnchor: 'left',
          arrowEnd: 'end'
        }
      ],
      texts: [],
      notes: [
        {
          id: 'arch_note',
          type: 'note',
          x: 3,
          y: 13,
          w: 27,
          h: 5,
          text: 'Note:\nZero-trust mesh network\nbetween services'
        }
      ]
    },

    'decision': {
      version: 1,
      name: 'Decision Tree',
      mode: 'unicode',
      shapes: [
        {
          id: 'q1',
          type: 'diamond',
          x: 18,
          y: 2,
          w: 21,
          h: 7,
          text: 'Is Task\nUrgent?',
          textAlign: 'center'
        },
        {
          id: 'q2',
          type: 'diamond',
          x: 48,
          y: 2,
          w: 21,
          h: 7,
          text: 'Is Task\nImportant?',
          textAlign: 'center'
        },
        {
          id: 'action_do',
          type: 'rectangle',
          x: 78,
          y: 3,
          w: 18,
          h: 5,
          text: 'DO NOW\nImmediate Focus',
          textAlign: 'center'
        },
        {
          id: 'action_delegate',
          type: 'rectangle',
          x: 49,
          y: 13,
          w: 19,
          h: 5,
          text: 'DELEGATE\nHand off to team',
          textAlign: 'center'
        }
      ],
      connectors: [
        {
          id: 'c1',
          type: 'connector',
          fromShapeId: 'q1',
          fromAnchor: 'right',
          toShapeId: 'q2',
          toAnchor: 'left',
          label: 'Yes',
          arrowEnd: 'end'
        },
        {
          id: 'c2',
          type: 'connector',
          fromShapeId: 'q2',
          fromAnchor: 'right',
          toShapeId: 'action_do',
          toAnchor: 'left',
          label: 'Yes',
          arrowEnd: 'end'
        },
        {
          id: 'c3',
          type: 'connector',
          fromShapeId: 'q2',
          fromAnchor: 'bottom',
          toShapeId: 'action_delegate',
          toAnchor: 'top',
          label: 'No',
          arrowEnd: 'end'
        }
      ],
      texts: [],
      notes: []
    }
  };

  class StorageManager {
    constructor() {
      this.autoSaveTimer = null;
    }

    /**
     * Auto-save diagram to localStorage (debounced)
     */
    autoSave(diagram, delayMs = 600) {
      if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);

      this.autoSaveTimer = setTimeout(() => {
        try {
          const serialized = JSON.stringify(diagram);
          localStorage.setItem(STORAGE_KEY_DIAGRAM, serialized);
        } catch (e) {
          console.warn('AsciiFlow: Failed to auto-save to localStorage', e);
        }
      }, delayMs);
    }

    /**
     * Load auto-saved diagram or return null
     */
    loadAutoSavedDiagram() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_DIAGRAM);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return this.normalizeDiagram(parsed);
      } catch (e) {
        console.warn('AsciiFlow: Failed to parse auto-saved diagram', e);
        return null;
      }
    }

    /**
     * Clear auto-saved diagram
     */
    clearAutoSave() {
      try {
        localStorage.removeItem(STORAGE_KEY_DIAGRAM);
      } catch (e) {}
    }

    /**
     * Save user preferences
     */
    savePreferences(prefs) {
      try {
        const current = this.loadPreferences();
        const merged = { ...current, ...prefs };
        localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(merged));
      } catch (e) {}
    }

    /**
     * Load user preferences
     */
    loadPreferences() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_PREFS);
        if (!raw) {
          return {
            theme: 'light',
            mode: 'unicode', // 'unicode' | 'ascii' | 'unicode-curved'
            gridStyle: 'dots', // 'dots' | 'lines' | 'none'
            previewVisible: true,
            autoTrim: true
          };
        }
        return JSON.parse(raw);
      } catch (e) {
        return {
          theme: 'light',
          mode: 'unicode',
          gridStyle: 'dots',
          previewVisible: true,
          autoTrim: true
        };
      }
    }

    /**
     * Validate and normalize diagram structure
     */
    normalizeDiagram(data) {
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid diagram data');
      }

      return {
        version: data.version || 1,
        name: data.name || 'Untitled Diagram',
        updatedAt: new Date().toISOString(),
        mode: data.mode || 'unicode',
        shapes: Array.isArray(data.shapes) ? data.shapes : [],
        connectors: Array.isArray(data.connectors) ? data.connectors : [],
        texts: Array.isArray(data.texts) ? data.texts : [],
        notes: Array.isArray(data.notes) ? data.notes : []
      };
    }

    /**
     * Export diagram to JSON file download
     */
    exportJSON(diagram, filename = 'asciiflow-diagram.json') {
      const normalized = this.normalizeDiagram(diagram);
      const jsonStr = JSON.stringify(normalized, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      this.triggerDownload(blob, filename);
    }

    /**
     * Download rendered ASCII string as .txt file
     */
    downloadASCII(asciiString, filename = 'asciiflow-diagram.txt') {
      const blob = new Blob([asciiString], { type: 'text/plain;charset=utf-8' });
      this.triggerDownload(blob, filename);
    }

    /**
     * Export diagram to standalone SVG file download
     */
    exportSVG(diagram, renderer, options = {}, filename = 'asciiflow-diagram.svg') {
      const svg = renderer.renderToSVG(diagram, options);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      this.triggerDownload(blob, filename);
    }

    /**
     * Export diagram to high-resolution PNG image download
     */
    exportPNG(diagram, renderer, options = {}, filename = 'asciiflow-diagram.png') {
      const ascii = renderer.render(diagram, options);
      const lines = ascii.split('\n');
      const numRows = lines.length;
      let maxCols = 0;
      for (const line of lines) {
        if (line.length > maxCols) maxCols = line.length;
      }

      const fontSize = options.fontSize || 14;
      const charWidth = options.charWidth || (fontSize * 0.6);
      const lineHeight = options.lineHeight || (fontSize * 1.35);
      const padding = options.padding !== undefined ? options.padding : 24;

      const width = Math.max(120, Math.ceil(maxCols * charWidth + padding * 2));
      const height = Math.max(60, Math.ceil(numRows * lineHeight + padding * 2));

      const isDark = options.theme === 'dark';
      const bgColor = isDark ? '#1e1e24' : '#ffffff';
      const textColor = isDark ? '#eceff4' : '#2e3440';

      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 2;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // Font & Text
      ctx.fillStyle = textColor;
      ctx.font = `${fontSize}px "SFMono-Regular", "Cascadia Code", "Roboto Mono", "Consolas", monospace`;
      ctx.textBaseline = 'top';

      for (let r = 0; r < lines.length; r++) {
        const y = padding + r * lineHeight;
        ctx.fillText(lines[r], padding, y);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          this.triggerDownload(blob, filename);
        }
      }, 'image/png');
    }

    /**
     * Copy diagram wrapped in Markdown code block (```text ... ```)
     */
    async copyMarkdownCodeBlock(diagram, renderer, options = {}) {
      const ascii = renderer.render(diagram, options);
      const md = '```text\n' + ascii + '\n```';
      return await this.copyToClipboard(md);
    }

    /**
     * Generate shareable diagram URL with data embedded in the hash
     */
    generateShareableURL(diagram) {
      const normalized = this.normalizeDiagram(diagram);
      const json = JSON.stringify(normalized);
      const encoded = encodeURIComponent(json);
      return `${window.location.origin}${window.location.pathname}#diagram=${encoded}`;
    }

    /**
     * Load diagram data from current URL hash if present (#diagram=...)
     */
    loadDiagramFromURLHash() {
      try {
        if (!window.location.hash || !window.location.hash.startsWith('#diagram=')) {
          return null;
        }
        const encoded = window.location.hash.substring('#diagram='.length);
        const json = decodeURIComponent(encoded);
        const data = JSON.parse(json);
        return this.normalizeDiagram(data);
      } catch (e) {
        console.warn('Failed to parse diagram from URL hash:', e);
        return null;
      }
    }

    /**
     * Trigger browser file download helper
     */
    triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    }

    /**
     * Copy text to clipboard with modern API and legacy fallback
     */
    async copyToClipboard(text) {
      if (!text) return false;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (err) {
          // Fallback below
        }
      }

      // Fallback using textarea
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
      } catch (err) {
        console.error('Clipboard copy failed:', err);
        return false;
      }
    }

    /**
     * Get a built-in sample template by key
     */
    getSample(key) {
      const sample = SAMPLE_TEMPLATES[key];
      return sample ? JSON.parse(JSON.stringify(sample)) : null;
    }
  }

  // Export to global
  global.AsciiStorage = new StorageManager();
  global.SAMPLE_TEMPLATES = SAMPLE_TEMPLATES;

})(typeof window !== 'undefined' ? window : this);
