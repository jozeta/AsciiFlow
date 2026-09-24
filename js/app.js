/**
 * AsciiFlow - Application Main Controller
 * Orchestrates canvas, UI toolbars, menus, modals, toasts, preview panel, and persistence.
 */

(function () {
  'use strict';

  let canvas = null;
  let toastInstance = null;

  document.addEventListener('DOMContentLoaded', () => {
    initApp();
  });

  function initApp() {
    // 1. Initialize Theme
    window.AsciiTheme.init();

    // 2. Initialize Canvas
    const canvasElement = document.getElementById('editorCanvas');
    canvas = new window.AsciiCanvas(canvasElement);

    // Repaint on theme change
    window.AsciiTheme.onThemeChange(() => {
      canvas.render();
    });

    // 3. Initialize Toast
    const toastEl = document.getElementById('clipboardToast');
    if (toastEl && window.bootstrap && window.bootstrap.Toast) {
      toastInstance = new window.bootstrap.Toast(toastEl, { delay: 2500 });
    }

    // 4. Load Saved Preferences & Diagram
    loadInitialData();

    // 5. Setup UI Event Listeners
    setupToolbar();
    setupHeaderActions();
    setupPropertyBar();
    setupStatusbar();
    setupPreviewPanel();
    setupSettingsModal();
    setupDragAndDrop();

    // 6. Connect Canvas Callbacks
    canvas.onDiagramChange = (diagram, isMajor) => {
      updateAsciiPreview();
      updateStatusInfo();
    };

    canvas.onSelectionChange = (shapes, conns) => {
      updatePropertyBar(shapes, conns);
      updateStatusInfo();
    };

    canvas.onCursorMove = (col, row) => {
      const cursorCoord = document.getElementById('cursorCoord');
      if (cursorCoord) {
        cursorCoord.textContent = `Col: ${col}, Row: ${row}`;
      }
    };

    // Update history buttons on state changes
    canvas.history.onChange((state) => {
      const btnUndo = document.getElementById('btnUndo');
      const btnRedo = document.getElementById('btnRedo');
      if (btnUndo) btnUndo.disabled = !state.canUndo;
      if (btnRedo) btnRedo.disabled = !state.canRedo;
    });

    // Initial render & sync
    updateAsciiPreview();
    updateStatusInfo();
  }

  /**
   * Load saved preferences and diagram from localStorage or starter template
   */
  function loadInitialData() {
    const prefs = window.AsciiStorage.loadPreferences();

    // Mode
    if (prefs.mode) {
      canvas.setMode(prefs.mode);
      updateModeUI(prefs.mode);
    }

    // Grid style
    if (prefs.gridStyle) {
      canvas.setGridStyle(prefs.gridStyle);
      const gridBtn = document.getElementById('btnGridToggle');
      if (gridBtn) gridBtn.textContent = `Grid: ${prefs.gridStyle}`;
    }

    // Preview panel visibility & width
    const previewPanel = document.getElementById('previewPanel');
    const btnTogglePreview = document.getElementById('btnTogglePreview');
    if (prefs.previewWidth && prefs.previewWidth >= 220) {
      previewPanel.style.width = `${prefs.previewWidth}px`;
    }
    if (prefs.previewVisible === false) {
      previewPanel.classList.add('collapsed');
      if (btnTogglePreview) btnTogglePreview.classList.remove('active');
    } else {
      previewPanel.classList.remove('collapsed');
      if (btnTogglePreview) btnTogglePreview.classList.add('active');
    }

    // Check for shared diagram in URL hash (#diagram=...)
    const urlDiagram = window.AsciiStorage.loadDiagramFromURLHash();
    if (urlDiagram) {
      canvas.loadDiagram(urlDiagram);
      showToast('Loaded shared diagram from link');
      return;
    }

    // Diagram data
    const saved = window.AsciiStorage.loadAutoSavedDiagram();
    if (saved && saved.shapes && (saved.shapes.length > 0 || saved.connectors.length > 0)) {
      canvas.loadDiagram(saved);
    } else {
      // Load friendly flowchart template by default
      const sample = window.AsciiStorage.getSample('flowchart');
      if (sample) {
        canvas.loadDiagram(sample);
      }
    }
  }

  // ==========================================
  // Left Toolbar Setup
  // ==========================================

  function setupToolbar() {
    const toolButtons = document.querySelectorAll('.tool-btn');

    toolButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        if (!tool) return;

        toolButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        canvas.setTool(tool);
      });
    });
  }

  // ==========================================
  // Header Actions Setup
  // ==========================================

  function setupHeaderActions() {
    // New Diagram
    const btnNew = document.getElementById('btnNew');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        if (confirm('Create a new blank diagram? Any unsaved changes will be lost.')) {
          canvas.clearDiagram();
          window.AsciiStorage.clearAutoSave();
          updateAsciiPreview();
        }
      });
    }

    // Templates Menu Items
    const templateItems = document.querySelectorAll('[data-template]');
    templateItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const templateKey = item.getAttribute('data-template');
        const sample = window.AsciiStorage.getSample(templateKey);
        if (sample) {
          if (canvas.diagram.shapes.length > 0) {
            if (!confirm(`Replace current diagram with ${sample.name}?`)) return;
          }
          canvas.loadDiagram(sample);
          updateAsciiPreview();
          showToast(`Loaded ${sample.name} template`);
        }
      });
    });

    // Undo / Redo
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.addEventListener('click', () => canvas.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => canvas.redo());

    // Copy ASCII Button
    const btnCopyAscii = document.getElementById('btnCopyAscii');
    if (btnCopyAscii) {
      btnCopyAscii.addEventListener('click', () => copyAsciiToClipboard());
    }

    // Export JSON
    const btnExportJSON = document.getElementById('btnExportJSON');
    if (btnExportJSON) {
      btnExportJSON.addEventListener('click', () => {
        window.AsciiStorage.exportJSON(canvas.diagram);
      });
    }

    // Download ASCII .txt
    const btnDownloadTxt = document.getElementById('btnDownloadTxt');
    if (btnDownloadTxt) {
      btnDownloadTxt.addEventListener('click', () => {
        const ascii = canvas.renderer.render(canvas.diagram);
        window.AsciiStorage.downloadASCII(ascii);
      });
    }

    // Export SVG
    const btnExportSVG = document.getElementById('btnExportSVG');
    if (btnExportSVG) {
      btnExportSVG.addEventListener('click', () => {
        const isDark = window.AsciiTheme.isDark();
        window.AsciiStorage.exportSVG(canvas.diagram, canvas.renderer, { theme: isDark ? 'dark' : 'light' });
        showToast('SVG diagram exported');
      });
    }

    // Export PNG
    const btnExportPNG = document.getElementById('btnExportPNG');
    if (btnExportPNG) {
      btnExportPNG.addEventListener('click', () => {
        const isDark = window.AsciiTheme.isDark();
        window.AsciiStorage.exportPNG(canvas.diagram, canvas.renderer, { theme: isDark ? 'dark' : 'light' });
        showToast('PNG image exported');
      });
    }

    // Copy as Markdown
    const btnCopyMarkdown = document.getElementById('btnCopyMarkdown');
    if (btnCopyMarkdown) {
      btnCopyMarkdown.addEventListener('click', async () => {
        const ok = await window.AsciiStorage.copyMarkdownCodeBlock(canvas.diagram, canvas.renderer);
        if (ok) showToast('Markdown code block copied to clipboard');
        else showToast('Failed to copy to clipboard');
      });
    }

    // Copy Shareable URL
    const btnShareURL = document.getElementById('btnShareURL');
    if (btnShareURL) {
      btnShareURL.addEventListener('click', async () => {
        const url = window.AsciiStorage.generateShareableURL(canvas.diagram);
        const ok = await window.AsciiStorage.copyToClipboard(url);
        if (ok) showToast('Shareable diagram link copied to clipboard');
        else showToast('Failed to copy link');
      });
    }

    // Import JSON File Picker
    const fileInput = document.getElementById('importFileInput');
    const btnImportJSON = document.getElementById('btnImportJSON');
    const btnImport = document.getElementById('btnImport');
    const triggerFilePick = () => fileInput && fileInput.click();
    if (btnImportJSON) btnImportJSON.addEventListener('click', triggerFilePick);
    if (btnImport) btnImport.addEventListener('click', triggerFilePick);

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const data = JSON.parse(event.target.result);
              canvas.loadDiagram(data);
              updateAsciiPreview();
              showToast('Diagram imported successfully');
            } catch (err) {
              alert('Error parsing JSON diagram file: ' + err.message);
            }
          };
          reader.readAsText(file);
        }
        fileInput.value = '';
      });
    }

    // Import ASCII Modal Submit
    const btnSubmitImportAscii = document.getElementById('btnSubmitImportAscii');
    if (btnSubmitImportAscii) {
      btnSubmitImportAscii.addEventListener('click', () => {
        const asciiArea = document.getElementById('importAsciiText');
        const feedback = document.getElementById('importAsciiFeedback');
        const text = asciiArea ? asciiArea.value.trim() : '';

        if (!text) {
          if (feedback) feedback.textContent = 'Please enter or paste an ASCII diagram first.';
          return;
        }

        try {
          const parsed = window.AsciiParser.parseAsciiToDiagram(text);
          if (parsed.shapes.length === 0 && parsed.connectors.length === 0) {
            if (feedback) feedback.textContent = 'No boxes or shapes detected in the input text.';
            return;
          }
          canvas.loadDiagram(parsed);
          updateAsciiPreview();

          const modalEl = document.getElementById('importAsciiModal');
          if (modalEl && window.bootstrap && window.bootstrap.Modal) {
            const modal = window.bootstrap.Modal.getInstance(modalEl) || new window.bootstrap.Modal(modalEl);
            modal.hide();
          }
          if (feedback) feedback.textContent = '';
          showToast(`Imported ${parsed.shapes.length} shapes from ASCII`);
        } catch (err) {
          if (feedback) feedback.textContent = 'Parse error: ' + err.message;
        }
      });
    }

    // Import Mermaid Modal Submit
    const btnSubmitImportMermaid = document.getElementById('btnSubmitImportMermaid');
    if (btnSubmitImportMermaid) {
      btnSubmitImportMermaid.addEventListener('click', () => {
        const mermaidArea = document.getElementById('importMermaidText');
        const feedback = document.getElementById('importMermaidFeedback');
        const text = mermaidArea ? mermaidArea.value.trim() : '';

        if (!text) {
          if (feedback) feedback.textContent = 'Please enter Mermaid flowchart syntax.';
          return;
        }

        try {
          const parsed = window.AsciiParser.parseMermaidToDiagram(text);
          if (parsed.shapes.length === 0) {
            if (feedback) feedback.textContent = 'No valid nodes found. Supported format: graph TD or graph LR.';
            return;
          }
          canvas.loadDiagram(parsed);
          updateAsciiPreview();

          const modalEl = document.getElementById('importMermaidModal');
          if (modalEl && window.bootstrap && window.bootstrap.Modal) {
            const modal = window.bootstrap.Modal.getInstance(modalEl) || new window.bootstrap.Modal(modalEl);
            modal.hide();
          }
          if (feedback) feedback.textContent = '';
          showToast(`Imported ${parsed.shapes.length} nodes from Mermaid`);
        } catch (err) {
          if (feedback) feedback.textContent = 'Mermaid syntax error: ' + err.message;
        }
      });
    }

    // Theme Toggle
    const btnTheme = document.getElementById('themeToggleBtn');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        window.AsciiTheme.toggleTheme();
      });
    }

    // Mode Toggle Pills (Unicode vs ASCII)
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        canvas.setMode(mode);
        window.AsciiStorage.savePreferences({ mode });
        updateModeUI(mode);
        updateAsciiPreview();
      });
    });

    // Preview Panel Toggle Button
    const btnTogglePreview = document.getElementById('btnTogglePreview');
    const previewPanel = document.getElementById('previewPanel');
    if (btnTogglePreview && previewPanel) {
      btnTogglePreview.addEventListener('click', () => {
        const isCollapsed = previewPanel.classList.toggle('collapsed');
        btnTogglePreview.classList.toggle('active', !isCollapsed);
        window.AsciiStorage.savePreferences({ previewVisible: !isCollapsed });
        setTimeout(() => canvas.handleResize(), 250);
      });
    }
  }

  function updateModeUI(mode) {
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });

    const statusMode = document.getElementById('statusMode');
    if (statusMode) {
      statusMode.textContent = mode === 'ascii' ? 'Mode: ASCII' : (mode === 'unicode-curved' ? 'Mode: Curved' : 'Mode: Unicode');
    }
  }

  // ==========================================
  // Contextual Property Bar Setup
  // ==========================================

  function setupPropertyBar() {
    const propBar = document.getElementById('propertyBar');
    const selType = document.getElementById('propShapeType');
    const selAlign = document.getElementById('propTextAlign');
    const btnAutoFit = document.getElementById('btnPropAutoFit');
    const btnDuplicate = document.getElementById('btnPropDuplicate');
    const btnDelete = document.getElementById('btnPropDelete');

    // Alignment buttons (left, center, right, top, middle, bottom)
    const alignBtns = document.querySelectorAll('#propAlignGroup [data-align]');
    alignBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const alignment = btn.getAttribute('data-align');
        if (alignment) canvas.alignSelected(alignment);
      });
    });

    // Distribution buttons (horizontal, vertical)
    const distBtns = document.querySelectorAll('#propDistributeGroup [data-distribute]');
    distBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const axis = btn.getAttribute('data-distribute');
        if (axis) canvas.distributeSelected(axis);
      });
    });

    // Group & Ungroup
    const btnGroup = document.getElementById('btnPropGroup');
    if (btnGroup) {
      btnGroup.addEventListener('click', () => {
        canvas.groupSelected();
      });
    }

    const btnUngroup = document.getElementById('btnPropUngroup');
    if (btnUngroup) {
      btnUngroup.addEventListener('click', () => {
        canvas.ungroupSelected();
      });
    }

    // Auto-layout
    const btnAutoLayout = document.getElementById('btnPropAutoLayout');
    if (btnAutoLayout) {
      btnAutoLayout.addEventListener('click', () => {
        canvas.autoLayout('TB');
        showToast('Auto-layout applied');
      });
    }

    // Connector Controls
    const selArrowStart = document.getElementById('propArrowStart');
    if (selArrowStart) {
      selArrowStart.addEventListener('change', () => {
        if (canvas.selectedConnectorIds.size > 0) {
          for (const id of canvas.selectedConnectorIds) {
            const conn = canvas.diagram.connectors.find(c => c.id === id);
            if (conn) conn.arrowStart = selArrowStart.value;
          }
          canvas.recordHistory();
          canvas.emitChange();
          canvas.render();
        }
      });
    }

    const selArrowEnd = document.getElementById('propArrowEnd');
    if (selArrowEnd) {
      selArrowEnd.addEventListener('change', () => {
        if (canvas.selectedConnectorIds.size > 0) {
          for (const id of canvas.selectedConnectorIds) {
            const conn = canvas.diagram.connectors.find(c => c.id === id);
            if (conn) conn.arrowEnd = selArrowEnd.value;
          }
          canvas.recordHistory();
          canvas.emitChange();
          canvas.render();
        }
      });
    }

    const selLineStyle = document.getElementById('propLineStyle');
    if (selLineStyle) {
      selLineStyle.addEventListener('change', () => {
        if (canvas.selectedConnectorIds.size > 0) {
          for (const id of canvas.selectedConnectorIds) {
            const conn = canvas.diagram.connectors.find(c => c.id === id);
            if (conn) conn.style = selLineStyle.value;
          }
          canvas.recordHistory();
          canvas.emitChange();
          canvas.render();
        }
      });
    }

    const selLineRouting = document.getElementById('propLineRouting');
    if (selLineRouting) {
      selLineRouting.addEventListener('change', () => {
        if (canvas.selectedConnectorIds.size > 0) {
          for (const id of canvas.selectedConnectorIds) {
            const conn = canvas.diagram.connectors.find(c => c.id === id);
            if (conn) conn.routing = selLineRouting.value;
          }
          canvas.recordHistory();
          canvas.emitChange();
          canvas.render();
        }
      });
    }

    if (selType) {
      selType.addEventListener('change', () => {
        if (canvas.selectedShapeIds.size > 0) {
          for (const id of canvas.selectedShapeIds) {
            const shape = canvas.findShapeById(id);
            if (shape) shape.type = selType.value;
          }
          canvas.recordHistory();
          canvas.emitChange();
          canvas.render();
        }
      });
    }

    if (selAlign) {
      selAlign.addEventListener('change', () => {
        if (canvas.selectedShapeIds.size > 0) {
          for (const id of canvas.selectedShapeIds) {
            const shape = canvas.findShapeById(id);
            if (shape) shape.textAlign = selAlign.value;
          }
          canvas.recordHistory();
          canvas.emitChange();
          canvas.render();
        }
      });
    }

    if (btnAutoFit) {
      btnAutoFit.addEventListener('click', () => {
        if (canvas.selectedShapeIds.size > 0) {
          for (const id of canvas.selectedShapeIds) {
            const shape = canvas.findShapeById(id);
            if (shape) window.AsciiShapes.autoFitShape(shape);
          }
          canvas.recordHistory();
          canvas.emitChange();
          canvas.render();
        }
      });
    }

    if (btnDuplicate) {
      btnDuplicate.addEventListener('click', () => {
        canvas.duplicateSelected();
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        canvas.deleteSelected();
      });
    }
  }

  function updatePropertyBar(shapes, conns) {
    const propBar = document.getElementById('propertyBar');
    if (!propBar) return;

    const shapeSection = document.getElementById('propShapeControls');
    const connSection = document.getElementById('propConnectorControls');

    if (shapes && shapes.length > 0) {
      propBar.classList.remove('hidden');
      if (shapeSection) {
        shapeSection.classList.remove('d-none');
        shapeSection.classList.add('d-flex');
      }
      if (connSection) {
        connSection.classList.remove('d-flex');
        connSection.classList.add('d-none');
      }

      const selType = document.getElementById('propShapeType');
      const selAlign = document.getElementById('propTextAlign');
      const alignGroup = document.getElementById('propAlignGroup');
      const distributeGroup = document.getElementById('propDistributeGroup');
      const btnGroup = document.getElementById('btnPropGroup');
      const btnUngroup = document.getElementById('btnPropUngroup');

      if (shapes.length === 1) {
        const s = shapes[0];
        if (selType) selType.value = s.type || 'rectangle';
        if (selAlign) selAlign.value = s.textAlign || 'center';
        if (alignGroup) alignGroup.style.display = 'none';
        if (distributeGroup) distributeGroup.style.display = 'none';
        if (btnGroup) btnGroup.style.display = 'none';
        if (btnUngroup) btnUngroup.style.display = s.groupId ? 'inline-flex' : 'none';
      } else {
        if (alignGroup) alignGroup.style.display = 'flex';
        if (distributeGroup) distributeGroup.style.display = shapes.length >= 3 ? 'flex' : 'none';
        if (btnGroup) btnGroup.style.display = 'inline-flex';
        const hasGrouped = shapes.some(s => s.groupId);
        if (btnUngroup) btnUngroup.style.display = hasGrouped ? 'inline-flex' : 'none';
      }
    } else if (conns && conns.length > 0) {
      propBar.classList.remove('hidden');
      if (shapeSection) {
        shapeSection.classList.remove('d-flex');
        shapeSection.classList.add('d-none');
      }
      if (connSection) {
        connSection.classList.remove('d-none');
        connSection.classList.add('d-flex');
      }

      const c = conns[0];
      const selArrowStart = document.getElementById('propArrowStart');
      const selArrowEnd = document.getElementById('propArrowEnd');
      const selLineStyle = document.getElementById('propLineStyle');
      const selLineRouting = document.getElementById('propLineRouting');

      if (selArrowStart) selArrowStart.value = c.arrowStart || 'none';
      if (selArrowEnd) selArrowEnd.value = c.arrowEnd !== undefined ? c.arrowEnd : 'triangle';
      if (selLineStyle) selLineStyle.value = c.style || 'solid';
      if (selLineRouting) selLineRouting.value = c.routing || 'orthogonal';
    } else {
      propBar.classList.add('hidden');
    }
  }

  // ==========================================
  // Bottom Status Bar Setup
  // ==========================================

  function setupStatusbar() {
    const btnZoomIn = document.getElementById('btnZoomIn');
    const btnZoomOut = document.getElementById('btnZoomOut');
    const btnZoomReset = document.getElementById('btnZoomReset');
    const btnZoomFit = document.getElementById('btnZoomFit');
    const btnGridToggle = document.getElementById('btnGridToggle');

    if (btnZoomIn) btnZoomIn.addEventListener('click', () => canvas.zoomIn());
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => canvas.zoomOut());
    if (btnZoomReset) btnZoomReset.addEventListener('click', () => canvas.resetZoom());
    if (btnZoomFit) btnZoomFit.addEventListener('click', () => canvas.fitView());

    if (btnGridToggle) {
      btnGridToggle.addEventListener('click', () => {
        const styles = ['dots', 'lines', 'none'];
        const nextIdx = (styles.indexOf(canvas.gridStyle) + 1) % styles.length;
        const nextStyle = styles[nextIdx];
        canvas.setGridStyle(nextStyle);
        window.AsciiStorage.savePreferences({ gridStyle: nextStyle });
        btnGridToggle.textContent = `Grid: ${nextStyle}`;
      });
    }
  }

  function updateStatusInfo() {
    const selCount = canvas.selectedShapeIds.size + canvas.selectedConnectorIds.size;
    const statusSelection = document.getElementById('statusSelection');

    if (statusSelection) {
      if (selCount === 0) {
        const total = canvas.diagram.shapes.length + canvas.diagram.connectors.length;
        statusSelection.textContent = `${total} objects`;
      } else if (selCount === 1) {
        if (canvas.selectedShapeIds.size === 1) {
          const s = canvas.findShapeById(Array.from(canvas.selectedShapeIds)[0]);
          statusSelection.textContent = s ? `${s.type} (${s.w}x${s.h})` : '1 selected';
        } else {
          statusSelection.textContent = '1 connector selected';
        }
      } else {
        statusSelection.textContent = `${selCount} selected`;
      }
    }
  }

  // ==========================================
  // ASCII Preview Panel Setup
  // ==========================================

  function setupPreviewPanel() {
    const btnCopyPreview = document.getElementById('btnCopyPreview');
    if (btnCopyPreview) {
      btnCopyPreview.addEventListener('click', () => copyAsciiToClipboard());
    }

    const btnClosePreview = document.getElementById('btnClosePreview');
    const previewPanel = document.getElementById('previewPanel');
    const btnTogglePreview = document.getElementById('btnTogglePreview');
    if (btnClosePreview && previewPanel) {
      btnClosePreview.addEventListener('click', () => {
        previewPanel.classList.add('collapsed');
        if (btnTogglePreview) btnTogglePreview.classList.remove('active');
        window.AsciiStorage.savePreferences({ previewVisible: false });
        setTimeout(() => canvas.handleResize(), 250);
      });
    }

    setupPreviewResizer();
  }

  function setupPreviewResizer() {
    const resizer = document.getElementById('previewResizer');
    const panel = document.getElementById('previewPanel');
    if (!resizer || !panel) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = panel.offsetWidth;
      panel.classList.add('resizing');
      resizer.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = startX - e.clientX;
      const newWidth = Math.max(220, Math.min(window.innerWidth - 120, startWidth + dx));
      panel.style.width = `${newWidth}px`;
      canvas.handleResize();
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        panel.classList.remove('resizing');
        resizer.classList.remove('is-dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.AsciiStorage.savePreferences({ previewWidth: panel.offsetWidth });
        canvas.handleResize();
      }
    });
  }

  function updateAsciiPreview() {
    const previewEl = document.getElementById('asciiPreviewCode');
    if (!previewEl) return;

    const asciiText = canvas.renderer.render(canvas.diagram, {
      trimTrailing: true,
      trimCanvas: true,
      minMargin: 1
    });

    previewEl.textContent = asciiText || '(empty diagram)';

    // Update lines / cols / chars badges
    const lines = asciiText ? asciiText.split('\n') : [];
    const lineCount = lines.length;
    const maxCol = lines.reduce((max, l) => Math.max(max, l.length), 0);
    const charCount = asciiText.length;

    const badgeLines = document.getElementById('previewBadgeLines');
    const badgeChars = document.getElementById('previewBadgeChars');
    if (badgeLines) badgeLines.textContent = `${lineCount} lines, ${maxCol} cols`;
    if (badgeChars) badgeChars.textContent = `${charCount} chars`;
  }

  // ==========================================
  // Clipboard Operations
  // ==========================================

  async function copyAsciiToClipboard() {
    const asciiText = canvas.renderer.render(canvas.diagram, {
      trimTrailing: true,
      trimCanvas: true,
      minMargin: 1
    });

    if (!asciiText) {
      showToast('Diagram is empty');
      return;
    }

    const success = await window.AsciiStorage.copyToClipboard(asciiText);
    if (success) {
      showToast('ASCII diagram copied to clipboard');
    } else {
      showToast('Failed to copy to clipboard');
    }
  }

  function showToast(message) {
    const toastBody = document.getElementById('toastBody');
    if (toastBody) toastBody.textContent = message;

    if (toastInstance) {
      toastInstance.show();
    } else {
      // Fallback
      alert(message);
    }
  }

  // ==========================================
  // Settings Modal Setup
  // ==========================================

  function setupSettingsModal() {
    const selCharSet = document.getElementById('settingsCharSet');
    const selGrid = document.getElementById('settingsGrid');
    const chkTrim = document.getElementById('settingsTrim');

    if (selCharSet) {
      selCharSet.value = canvas.diagram.mode || 'unicode';
      selCharSet.addEventListener('change', () => {
        canvas.setMode(selCharSet.value);
        window.AsciiStorage.savePreferences({ mode: selCharSet.value });
        updateModeUI(selCharSet.value);
        updateAsciiPreview();
      });
    }

    if (selGrid) {
      selGrid.value = canvas.gridStyle || 'dots';
      selGrid.addEventListener('change', () => {
        canvas.setGridStyle(selGrid.value);
        window.AsciiStorage.savePreferences({ gridStyle: selGrid.value });
        const btnGrid = document.getElementById('btnGridToggle');
        if (btnGrid) btnGrid.textContent = `Grid: ${selGrid.value}`;
      });
    }
  }

  // ==========================================
  // Drag & Drop JSON Import onto Canvas
  // ==========================================

  function setupDragAndDrop() {
    const container = document.querySelector('.canvas-container');
    if (!container) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      container.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.style.boxShadow = 'inset 0 0 0 2px var(--accent-primary)';
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      container.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.style.boxShadow = 'none';
      });
    });

    container.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.json') || file.type === 'application/json') {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const data = JSON.parse(event.target.result);
              canvas.loadDiagram(data);
              updateAsciiPreview();
              showToast(`Imported ${file.name}`);
            } catch (err) {
              alert('Error reading dropped JSON diagram: ' + err.message);
            }
          };
          reader.readAsText(file);
        }
      }
    });
  }

})();
