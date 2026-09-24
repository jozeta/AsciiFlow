/**
 * AsciiFlow - Interactive Canvas Controller
 * Manages character grid coordinates, drawing pipeline, user interaction,
 * shape manipulation, anchors, resize handles, and text editing.
 */

(function (global) {
  'use strict';

  // Handle cursor types for 8 resize points
  const RESIZE_HANDLES = [
    { name: 'nw', cursor: 'nwse-resize', colOffset: 0, rowOffset: 0 },
    { name: 'n',  cursor: 'ns-resize',   colOffset: 0.5, rowOffset: 0 },
    { name: 'ne', cursor: 'nesw-resize', colOffset: 1, rowOffset: 0 },
    { name: 'e',  cursor: 'ew-resize',   colOffset: 1, rowOffset: 0.5 },
    { name: 'se', cursor: 'nwse-resize', colOffset: 1, rowOffset: 1 },
    { name: 's',  cursor: 'ns-resize',   colOffset: 0.5, rowOffset: 1 },
    { name: 'sw', cursor: 'nesw-resize', colOffset: 0, rowOffset: 1 },
    { name: 'w',  cursor: 'ew-resize',   colOffset: 0, rowOffset: 0.5 }
  ];

  class AsciiCanvas {
    constructor(canvasElement, options = {}) {
      this.canvas = canvasElement;
      this.ctx = canvasElement.getContext('2d');
      this.container = canvasElement.parentElement;
      this.textEditor = document.getElementById('canvasTextEditor');

      // Grid & Viewport settings
      this.cellWidth = 10;
      this.cellHeight = 18;
      this.zoom = 1.0;
      this.minZoom = 0.5;
      this.maxZoom = 2.5;
      this.panX = 60;
      this.panY = 60;

      // Active Tool: 'select' | 'pan' | 'rectangle' | 'rounded-rectangle' | 'diamond' |
      // 'parallelogram' | 'hexagon' | 'circle' | 'triangle' | 'note' | 'text' | 'line' | 'arrow' | 'connector'
      this.currentTool = 'select';
      this.gridStyle = 'dots'; // 'dots' | 'lines' | 'none'

      // Diagram Model
      this.diagram = {
        version: 1,
        name: 'Untitled Diagram',
        mode: 'unicode',
        shapes: [],
        connectors: [],
        texts: [],
        notes: []
      };

      // Selection state
      this.selectedShapeIds = new Set();
      this.selectedConnectorIds = new Set();

      // Interaction state
      this.isPanning = false;
      this.isDraggingShape = false;
      this.isResizing = false;
      this.isMarqueeSelecting = false;
      this.isDrawingShape = false;
      this.isDrawingConnector = false;

      // Endpoint & Waypoint interaction state
      this.isDraggingConnectorEndpoint = false;
      this.activeEndpointDrag = null; // { conn, end: 'start' | 'end' }
      this.endpointDragOrigin = null;

      this.isDraggingWaypoint = false;
      this.activeWaypointDrag = null; // { conn, index }

      this.isDraggingLineEndpoint = false;
      this.activeLineEndpointDrag = null; // { shape, end: 'start' | 'end' }

      this.activeResizeHandle = null;
      this.dragStart = { x: 0, y: 0, col: 0, row: 0 };
      this.shapeDragOrigins = new Map(); // shapeId -> { x, y }
      this.resizeShapeOrigin = null;
      this.marqueeBox = null; // { startCol, startRow, endCol, endRow }
      this.drawingShapeDraft = null;
      this.drawingConnectorDraft = null; // { fromShapeId, fromAnchor, fromPoint, currentPoint, hoveredAnchor, arrowEnd }
      this.activeGuides = []; // Magnetic alignment guides: [{ axis: 'x'|'y', col, row }]

      // Hover state
      this.hoveredShape = null;
      this.hoveredAnchor = null;
      this.hoveredResizeHandle = null;
      this.hoveredConnector = null;
      this.hoveredEndpoint = null;
      this.hoveredWaypoint = null;
      this.hoveredMidpoint = null;

      // History & Renderer instances
      this.history = new global.AsciiHistory(100);
      this.renderer = new global.AsciiRenderer({ mode: 'unicode' });

      // Callbacks
      this.onDiagramChange = null;
      this.onSelectionChange = null;
      this.onCursorMove = null;

      // Internal text editor state
      this.editingShape = null;

      this.init();
    }

    init() {
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());

      this.bindEvents();
      this.render();
    }

    handleResize() {
      const rect = this.container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      this.canvas.width = Math.floor(rect.width * dpr);
      this.canvas.height = Math.floor(rect.height * dpr);
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;

      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
      this.render();
    }

    setTool(tool) {
      if (this.editingShape) this.finishTextEditing();
      this.currentTool = tool;

      // Update cursor class
      this.container.classList.remove('tool-select', 'tool-pan', 'tool-draw');
      if (tool === 'select') {
        this.container.classList.add('tool-select');
      } else if (tool === 'pan') {
        this.container.classList.add('tool-pan');
      } else {
        this.container.classList.add('tool-draw');
      }

      this.render();
    }

    setMode(mode) {
      this.diagram.mode = mode;
      this.renderer.setMode(mode);
      this.emitChange(true);
      this.render();
    }

    setGridStyle(style) {
      this.gridStyle = style;
      this.render();
    }

    // ==========================================
    // Coordinate Math
    // ==========================================

    screenToGrid(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;

      const rawCol = (screenX - this.panX) / (this.cellWidth * this.zoom);
      const rawRow = (screenY - this.panY) / (this.cellHeight * this.zoom);

      return {
        col: Math.floor(rawCol),
        row: Math.floor(rawRow),
        rawCol,
        rawRow,
        screenX,
        screenY
      };
    }

    gridToScreen(col, row) {
      return {
        x: this.panX + col * this.cellWidth * this.zoom,
        y: this.panY + row * this.cellHeight * this.zoom
      };
    }

    // ==========================================
    // Event Listeners
    // ==========================================

    bindEvents() {
      const c = this.canvas;

      c.addEventListener('mousedown', (e) => this.onMouseDown(e));
      window.addEventListener('mousemove', (e) => this.onMouseMove(e));
      window.addEventListener('mouseup', (e) => this.onMouseUp(e));
      c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      c.addEventListener('dblclick', (e) => this.onDoubleClick(e));

      // In-place text editor blur / keydown
      if (this.textEditor) {
        this.textEditor.addEventListener('blur', () => this.finishTextEditing());
        this.textEditor.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            this.finishTextEditing(false); // cancel
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            this.finishTextEditing(true); // commit
          }
        });
      }

      // Keyboard shortcuts
      window.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    onMouseDown(e) {
      if (e.button === 1 || (e.button === 0 && (e.spaceKey || this.currentTool === 'pan'))) {
        // Pan canvas
        this.isPanning = true;
        this.container.classList.add('tool-panning');
        this.dragStart = { x: e.clientX, y: e.clientY };
        return;
      }

      if (e.button !== 0) return;

      const pos = this.screenToGrid(e.clientX, e.clientY);
      const col = pos.col;
      const row = pos.row;

      if (this.editingShape) {
        this.finishTextEditing();
      }

      // If Connector, Line, or Arrow Tool is active
      if (this.currentTool === 'connector' || this.currentTool === 'line' || this.currentTool === 'arrow') {
        const anchorHit = this.findAnchorAt(col, row);
        const arrowEnd = this.currentTool === 'line' ? 'none' : 'end';
        this.isDrawingConnector = true;
        this.drawingConnectorDraft = {
          fromShapeId: anchorHit ? anchorHit.shape.id : null,
          fromAnchor: anchorHit ? anchorHit.anchor : 'auto',
          fromPoint: anchorHit ? { x: anchorHit.x, y: anchorHit.y } : { x: col, y: row },
          currentPoint: { x: col, y: row },
          hoveredAnchor: null,
          arrowEnd: arrowEnd
        };
        this.render();
        return;
      }

      // If Shape Creation Tool is active
      if (this.currentTool !== 'select') {
        this.isDrawingShape = true;
        this.dragStart = { col, row, clientX: e.clientX, clientY: e.clientY };
        this.drawingShapeDraft = {
          type: this.currentTool,
          x: col,
          y: row,
          w: 1,
          h: 1
        };
        this.render();
        return;
      }

      // --- SELECT TOOL INTERACTIONS ---

      // 1. Check if clicking on a Start or End handle of a selected connector
      const endpointHit = this.findConnectorEndpointAt(pos.screenX, pos.screenY);
      if (endpointHit) {
        this.isDraggingConnectorEndpoint = true;
        this.activeEndpointDrag = { conn: endpointHit.conn, end: endpointHit.end };
        this.endpointDragOrigin = {
          fromShapeId: endpointHit.conn.fromShapeId,
          fromAnchor: endpointHit.conn.fromAnchor,
          fromPoint: endpointHit.conn.fromPoint ? { ...endpointHit.conn.fromPoint } : null,
          toShapeId: endpointHit.conn.toShapeId,
          toAnchor: endpointHit.conn.toAnchor,
          toPoint: endpointHit.conn.toPoint ? { ...endpointHit.conn.toPoint } : null
        };
        this.dragStart = { col, row };
        return;
      }

      // 2. Check if clicking on an existing Waypoint handle of a selected connector
      const waypointHit = this.findWaypointHandleAt(pos.screenX, pos.screenY);
      if (waypointHit) {
        this.isDraggingWaypoint = true;
        this.activeWaypointDrag = { conn: waypointHit.conn, index: waypointHit.index };
        this.dragStart = { col, row };
        return;
      }

      // 3. Check if clicking on a Midpoint "+" handle to add a point on line
      const midpointHit = this.findMidpointHandleAt(pos.screenX, pos.screenY);
      if (midpointHit) {
        if (midpointHit.isShape) {
          // Convert line/arrow shape into a connector with a waypoint
          const shape = midpointHit.shape;
          const isArrow = shape.type === 'arrow';
          const newConn = global.AsciiConnectors.createConnector(
            null,
            null,
            'auto',
            'auto',
            {
              fromPoint: { x: shape.x, y: shape.y },
              toPoint: { x: shape.x + shape.w - 1, y: shape.y + shape.h - 1 },
              waypoints: [{ x: midpointHit.point.x, y: midpointHit.point.y }],
              arrowEnd: isArrow ? 'end' : 'none'
            }
          );
          this.diagram.shapes = this.diagram.shapes.filter(s => s.id !== shape.id);
          this.diagram.connectors.push(newConn);
          this.selectedShapeIds.delete(shape.id);
          this.selectedConnectorIds.add(newConn.id);
          this.isDraggingWaypoint = true;
          this.activeWaypointDrag = { conn: newConn, index: 0 };
          this.dragStart = { col, row };
          this.recordHistory();
          this.emitChange();
          this.render();
          return;
        } else {
          // Add waypoint on connector
          const conn = midpointHit.conn;
          const insertIdx = this.getWaypointInsertIndex(conn, midpointHit.point.x, midpointHit.point.y);
          global.AsciiConnectors.addWaypoint(conn, midpointHit.point.x, midpointHit.point.y, insertIdx);
          this.isDraggingWaypoint = true;
          this.activeWaypointDrag = { conn: conn, index: insertIdx };
          this.dragStart = { col, row };
          this.recordHistory();
          this.emitChange();
          this.render();
          return;
        }
      }

      // 4. Check if clicking on an endpoint of a selected line/arrow shape
      const lineEndHit = this.findLineEndpointAt(pos.screenX, pos.screenY);
      if (lineEndHit) {
        this.isDraggingLineEndpoint = true;
        this.activeLineEndpointDrag = { shape: lineEndHit.shape, end: lineEndHit.end };
        this.dragStart = { col, row };
        return;
      }

      // 5. Check if clicking on an active resize handle of a selected shape
      if (this.selectedShapeIds.size === 1) {
        const singleShapeId = Array.from(this.selectedShapeIds)[0];
        const shape = this.findShapeById(singleShapeId);
        if (shape && shape.type !== 'line' && shape.type !== 'arrow') {
          const handle = this.findResizeHandleAt(shape, pos.screenX, pos.screenY);
          if (handle) {
            this.isResizing = true;
            this.activeResizeHandle = handle;
            this.resizeShapeOrigin = { ...shape };
            this.dragStart = { col, row };
            return;
          }
        }
      }

      // 6. Check if clicking on an anchor point to start connector in select mode
      const anchorHit = this.findAnchorAt(col, row);
      if (anchorHit && (this.hoveredShape || this.isShapeSelected(anchorHit.shape.id))) {
        this.isDrawingConnector = true;
        this.drawingConnectorDraft = {
          fromShapeId: anchorHit.shape.id,
          fromAnchor: anchorHit.anchor,
          fromPoint: { x: anchorHit.x, y: anchorHit.y },
          currentPoint: { x: col, y: row },
          hoveredAnchor: null,
          arrowEnd: 'end'
        };
        this.render();
        return;
      }

      // 7. Check if clicking on an already selected connector directly on its line to add waypoint
      const hitConn = this.findConnectorAt(col, row);
      if (hitConn && this.selectedConnectorIds.has(hitConn.id)) {
        const insertIdx = this.getWaypointInsertIndex(hitConn, col, row);
        global.AsciiConnectors.addWaypoint(hitConn, col, row, insertIdx);
        this.isDraggingWaypoint = true;
        this.activeWaypointDrag = { conn: hitConn, index: insertIdx };
        this.dragStart = { col, row };
        this.recordHistory();
        this.emitChange();
        this.render();
        return;
      }

      // 8. Check if clicking on a shape
      const hitShape = this.findShapeAt(col, row);
      if (hitShape) {
        const relatedShapes = hitShape.groupId
          ? this.diagram.shapes.filter(s => s.groupId === hitShape.groupId)
          : [hitShape];

        if (e.shiftKey) {
          const isSelected = this.selectedShapeIds.has(hitShape.id);
          for (const s of relatedShapes) {
            if (isSelected) {
              this.selectedShapeIds.delete(s.id);
            } else {
              this.selectedShapeIds.add(s.id);
            }
          }
        } else {
          if (!this.selectedShapeIds.has(hitShape.id)) {
            this.selectedShapeIds.clear();
            this.selectedConnectorIds.clear();
            for (const s of relatedShapes) {
              this.selectedShapeIds.add(s.id);
            }
          }
        }

        // Prepare for moving shapes
        this.isDraggingShape = true;
        this.dragStart = { col, row };
        this.shapeDragOrigins.clear();
        for (const id of this.selectedShapeIds) {
          const s = this.findShapeById(id);
          if (s) {
            this.shapeDragOrigins.set(id, { x: s.x, y: s.y });
          }
        }

        this.emitSelectionChange();
        this.render();
        return;
      }

      // 9. Check if clicking on an unselected connector
      if (hitConn) {
        if (!e.shiftKey) {
          this.selectedShapeIds.clear();
          this.selectedConnectorIds.clear();
        }
        this.selectedConnectorIds.add(hitConn.id);
        this.emitSelectionChange();
        this.render();
        return;
      }

      // 10. Clicked on empty canvas: Start Marquee Selection
      if (!e.shiftKey) {
        this.selectedShapeIds.clear();
        this.selectedConnectorIds.clear();
        this.emitSelectionChange();
      }

      this.isMarqueeSelecting = true;
      this.dragStart = { col, row };
      this.marqueeBox = { startCol: col, startRow: row, endCol: col, endRow: row };
      this.render();
    }

    onMouseMove(e) {
      // 1. Canvas Panning
      if (this.isPanning) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.panX += dx;
        this.panY += dy;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.render();
        return;
      }

      const pos = this.screenToGrid(e.clientX, e.clientY);
      const col = pos.col;
      const row = pos.row;

      if (this.onCursorMove) {
        this.onCursorMove(col, row);
      }

      // 2. Dragging Connector Endpoint
      if (this.isDraggingConnectorEndpoint && this.activeEndpointDrag) {
        const { conn, end } = this.activeEndpointDrag;
        const anchorHit = this.findAnchorAt(col, row);
        this.hoveredAnchor = anchorHit;

        if (end === 'start') {
          if (anchorHit) {
            conn.fromShapeId = anchorHit.shape.id;
            conn.fromAnchor = anchorHit.anchor;
            conn.fromPoint = null;
          } else {
            conn.fromShapeId = null;
            conn.fromAnchor = 'auto';
            conn.fromPoint = { x: col, y: row };
          }
        } else {
          if (anchorHit) {
            conn.toShapeId = anchorHit.shape.id;
            conn.toAnchor = anchorHit.anchor;
            conn.toPoint = null;
          } else {
            conn.toShapeId = null;
            conn.toAnchor = 'auto';
            conn.toPoint = { x: col, y: row };
          }
        }
        this.render();
        return;
      }

      // 3. Dragging Waypoint
      if (this.isDraggingWaypoint && this.activeWaypointDrag) {
        const { conn, index } = this.activeWaypointDrag;
        global.AsciiConnectors.moveWaypoint(conn, index, col, row);
        this.render();
        return;
      }

      // 4. Dragging Line / Arrow Shape Endpoint
      if (this.isDraggingLineEndpoint && this.activeLineEndpointDrag) {
        const { shape, end } = this.activeLineEndpointDrag;
        const anchorHit = this.findAnchorAt(col, row);
        this.hoveredAnchor = anchorHit;

        const targetCol = anchorHit ? anchorHit.x : col;
        const targetRow = anchorHit ? anchorHit.y : row;

        if (end === 'start') {
          const oldEndX = shape.x + shape.w - 1;
          const oldEndY = shape.y + shape.h - 1;
          const minX = Math.min(targetCol, oldEndX);
          const maxX = Math.max(targetCol, oldEndX);
          const minY = Math.min(targetRow, oldEndY);
          const maxY = Math.max(targetRow, oldEndY);
          shape.x = minX;
          shape.y = minY;
          shape.w = Math.max(1, maxX - minX + 1);
          shape.h = Math.max(1, maxY - minY + 1);
        } else {
          const minX = Math.min(shape.x, targetCol);
          const maxX = Math.max(shape.x, targetCol);
          const minY = Math.min(shape.y, targetRow);
          const maxY = Math.max(shape.y, targetRow);
          shape.x = minX;
          shape.y = minY;
          shape.w = Math.max(1, maxX - minX + 1);
          shape.h = Math.max(1, maxY - minY + 1);
        }
        this.render();
        return;
      }

      // 5. Drawing New Shape (Drag to size)
      if (this.isDrawingShape && this.drawingShapeDraft) {
        const minX = Math.min(this.dragStart.col, col);
        const minY = Math.min(this.dragStart.row, row);
        const maxX = Math.max(this.dragStart.col, col);
        const maxY = Math.max(this.dragStart.row, row);

        this.drawingShapeDraft.x = minX;
        this.drawingShapeDraft.y = minY;
        this.drawingShapeDraft.w = Math.max(2, maxX - minX + 1);
        this.drawingShapeDraft.h = Math.max(2, maxY - minY + 1);

        this.render();
        return;
      }

      // 6. Drawing Connector, Line, or Arrow
      if (this.isDrawingConnector && this.drawingConnectorDraft) {
        this.drawingConnectorDraft.currentPoint = { x: col, y: row };
        const anchorHit = this.findAnchorAt(col, row);

        if (anchorHit && (!this.drawingConnectorDraft.fromShapeId || anchorHit.shape.id !== this.drawingConnectorDraft.fromShapeId)) {
          this.drawingConnectorDraft.hoveredAnchor = anchorHit;
        } else {
          this.drawingConnectorDraft.hoveredAnchor = null;
        }

        this.render();
        return;
      }

      // 7. Moving Selected Shape(s)
      if (this.isDraggingShape) {
        let deltaCol = col - this.dragStart.col;
        let deltaRow = row - this.dragStart.row;

        this.activeGuides = [];
        const unselected = this.diagram.shapes.filter(s => !this.selectedShapeIds.has(s.id));

        if (unselected.length > 0 && this.shapeDragOrigins.size > 0 && !e.altKey) {
          const [firstId, origin] = Array.from(this.shapeDragOrigins.entries())[0];
          const primary = this.findShapeById(firstId);
          if (primary) {
            const testX = origin.x + deltaCol;
            const testY = origin.y + deltaRow;
            const testW = primary.w;
            const testH = primary.h;
            const testMidX = testX + Math.floor(testW / 2);
            const testMidY = testY + Math.floor(testH / 2);
            const testRight = testX + testW;
            const testBottom = testY + testH;

            let snappedX = false;
            let snappedY = false;

            for (const other of unselected) {
              const otherMidX = other.x + Math.floor(other.w / 2);
              const otherMidY = other.y + Math.floor(other.h / 2);
              const otherRight = other.x + other.w;
              const otherBottom = other.y + other.h;

              if (!snappedX) {
                if (Math.abs(testX - other.x) <= 1) {
                  deltaCol = other.x - origin.x;
                  this.activeGuides.push({ axis: 'x', col: other.x });
                  snappedX = true;
                } else if (Math.abs(testMidX - otherMidX) <= 1) {
                  deltaCol = (otherMidX - Math.floor(testW / 2)) - origin.x;
                  this.activeGuides.push({ axis: 'x', col: otherMidX });
                  snappedX = true;
                } else if (Math.abs(testRight - otherRight) <= 1) {
                  deltaCol = (otherRight - testW) - origin.x;
                  this.activeGuides.push({ axis: 'x', col: otherRight });
                  snappedX = true;
                }
              }

              if (!snappedY) {
                if (Math.abs(testY - other.y) <= 1) {
                  deltaRow = other.y - origin.y;
                  this.activeGuides.push({ axis: 'y', row: other.y });
                  snappedY = true;
                } else if (Math.abs(testMidY - otherMidY) <= 1) {
                  deltaRow = (otherMidY - Math.floor(testH / 2)) - origin.y;
                  this.activeGuides.push({ axis: 'y', row: otherMidY });
                  snappedY = true;
                } else if (Math.abs(testBottom - otherBottom) <= 1) {
                  deltaRow = (otherBottom - testH) - origin.y;
                  this.activeGuides.push({ axis: 'y', row: otherBottom });
                  snappedY = true;
                }
              }

              if (snappedX && snappedY) break;
            }
          }
        }

        for (const [id, origin] of this.shapeDragOrigins.entries()) {
          const s = this.findShapeById(id);
          if (s) {
            s.x = origin.x + deltaCol;
            s.y = origin.y + deltaRow;
          }
        }

        this.render();
        return;
      }

      // 8. Resizing Selected Shape
      if (this.isResizing && this.resizeShapeOrigin && this.activeResizeHandle) {
        const shape = this.findShapeById(this.resizeShapeOrigin.id);
        if (shape) {
          this.applyShapeResize(shape, this.resizeShapeOrigin, this.activeResizeHandle, col, row);
          this.render();
        }
        return;
      }

      // 9. Marquee Selecting
      if (this.isMarqueeSelecting && this.marqueeBox) {
        this.marqueeBox.endCol = col;
        this.marqueeBox.endRow = row;
        this.updateMarqueeSelection();
        this.render();
        return;
      }

      // 10. Hover updates when not actively dragging
      this.updateHoverStates(pos);
    }

    onMouseUp(e) {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.classList.remove('tool-panning');
        return;
      }

      // 1. Finish Dragging Connector Endpoint
      if (this.isDraggingConnectorEndpoint && this.activeEndpointDrag) {
        const { conn, end } = this.activeEndpointDrag;
        const pos = this.screenToGrid(e.clientX, e.clientY);
        const anchorHit = this.findAnchorAt(pos.col, pos.row);

        if (end === 'start') {
          if (anchorHit) {
            conn.fromShapeId = anchorHit.shape.id;
            conn.fromAnchor = anchorHit.anchor;
            conn.fromPoint = null;
          } else {
            conn.fromShapeId = null;
            conn.fromAnchor = 'auto';
            conn.fromPoint = { x: pos.col, y: pos.row };
          }
        } else {
          if (anchorHit) {
            conn.toShapeId = anchorHit.shape.id;
            conn.toAnchor = anchorHit.anchor;
            conn.toPoint = null;
          } else {
            conn.toShapeId = null;
            conn.toAnchor = 'auto';
            conn.toPoint = { x: pos.col, y: pos.row };
          }
        }

        this.isDraggingConnectorEndpoint = false;
        this.activeEndpointDrag = null;
        this.hoveredAnchor = null;
        this.recordHistory();
        this.emitChange();
        this.render();
        return;
      }

      // 2. Finish Dragging Waypoint
      if (this.isDraggingWaypoint) {
        this.isDraggingWaypoint = false;
        this.activeWaypointDrag = null;
        this.recordHistory();
        this.emitChange();
        this.render();
        return;
      }

      // 3. Finish Dragging Line Endpoint
      if (this.isDraggingLineEndpoint && this.activeLineEndpointDrag) {
        const { shape, end } = this.activeLineEndpointDrag;
        const pos = this.screenToGrid(e.clientX, e.clientY);
        const targetAnchor = this.findAnchorAt(pos.col, pos.row);

        if (targetAnchor) {
          // Convert line/arrow shape into a connected connector attached to the target anchor
          const isArrow = shape.type === 'arrow';
          let newConn;
          if (end === 'start') {
            newConn = global.AsciiConnectors.createConnector(
              targetAnchor.shape.id,
              null,
              targetAnchor.anchor,
              'auto',
              {
                toPoint: { x: shape.x + shape.w - 1, y: shape.y + shape.h - 1 },
                arrowEnd: isArrow ? 'end' : 'none'
              }
            );
          } else {
            newConn = global.AsciiConnectors.createConnector(
              null,
              targetAnchor.shape.id,
              'auto',
              targetAnchor.anchor,
              {
                fromPoint: { x: shape.x, y: shape.y },
                arrowEnd: isArrow ? 'end' : 'none'
              }
            );
          }
          this.diagram.shapes = this.diagram.shapes.filter(s => s.id !== shape.id);
          this.diagram.connectors.push(newConn);
          this.selectedShapeIds.delete(shape.id);
          this.selectedConnectorIds.add(newConn.id);
        }

        this.isDraggingLineEndpoint = false;
        this.activeLineEndpointDrag = null;
        this.hoveredAnchor = null;
        this.recordHistory();
        this.emitChange();
        this.render();
        return;
      }

      // 4. Finish Drawing Shape
      if (this.isDrawingShape && this.drawingShapeDraft) {
        const draft = this.drawingShapeDraft;
        let finalW = draft.w;
        let finalH = draft.h;

        // If it was just a quick click without dragging, use default size
        const config = global.AsciiShapes.SHAPE_CONFIGS[draft.type] || global.AsciiShapes.SHAPE_CONFIGS['rectangle'];
        if (finalW <= 2 && finalH <= 2) {
          finalW = config.defaultW;
          finalH = config.defaultH;
        }

        const newShape = global.AsciiShapes.createShape(
          draft.type,
          draft.x,
          draft.y,
          finalW,
          finalH,
          draft.type === 'note' ? 'Note:\n' : ''
        );

        this.addShape(newShape);
        this.selectedShapeIds.clear();
        this.selectedShapeIds.add(newShape.id);
        this.emitSelectionChange();

        this.isDrawingShape = false;
        this.drawingShapeDraft = null;

        // Auto-switch back to Select tool for seamless editing
        this.setTool('select');
        this.recordHistory();
        this.emitChange();
        this.render();
        return;
      }

      // 5. Finish Drawing Connector, Line, or Arrow
      if (this.isDrawingConnector && this.drawingConnectorDraft) {
        const draft = this.drawingConnectorDraft;
        const targetAnchor = draft.hoveredAnchor;
        const arrowEnd = draft.arrowEnd || 'end';

        let newConn = null;
        if (draft.fromShapeId && targetAnchor) {
          // Connect shape to shape
          newConn = global.AsciiConnectors.createConnector(
            draft.fromShapeId,
            targetAnchor.shape.id,
            draft.fromAnchor,
            targetAnchor.anchor,
            { arrowEnd }
          );
        } else if (draft.fromShapeId && !targetAnchor) {
          // Connect shape to free point
          newConn = global.AsciiConnectors.createConnector(
            draft.fromShapeId,
            null,
            draft.fromAnchor,
            'auto',
            { toPoint: draft.currentPoint, arrowEnd }
          );
        } else if (!draft.fromShapeId && targetAnchor) {
          // Connect free point to shape
          newConn = global.AsciiConnectors.createConnector(
            null,
            targetAnchor.shape.id,
            'auto',
            targetAnchor.anchor,
            { fromPoint: draft.fromPoint, arrowEnd }
          );
        } else {
          // Free line between two points
          newConn = global.AsciiConnectors.createConnector(
            null,
            null,
            'auto',
            'auto',
            { fromPoint: draft.fromPoint, toPoint: draft.currentPoint, arrowEnd }
          );
        }

        if (newConn) {
          this.addConnector(newConn);
          this.selectedShapeIds.clear();
          this.selectedConnectorIds.clear();
          this.selectedConnectorIds.add(newConn.id);
        }

        this.isDrawingConnector = false;
        this.drawingConnectorDraft = null;
        this.setTool('select');
        const selectBtn = document.querySelector('.tool-btn[data-tool="select"]');
        if (selectBtn) {
          document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
          selectBtn.classList.add('active');
        }
        this.recordHistory();
        this.emitChange();
        this.render();
        return;
      }

      // 6. Finish Moving Shapes
      if (this.isDraggingShape) {
        const pos = this.screenToGrid(e.clientX, e.clientY);
        const hasMoved = pos.col !== this.dragStart.col || pos.row !== this.dragStart.row;
        this.isDraggingShape = false;
        this.activeGuides = [];
        this.shapeDragOrigins.clear();

        if (hasMoved) {
          this.recordHistory();
          this.emitChange();
        }
        this.render();
        return;
      }

      // 7. Finish Resizing Shape
      if (this.isResizing) {
        this.isResizing = false;
        this.activeResizeHandle = null;
        this.resizeShapeOrigin = null;
        this.recordHistory();
        this.emitChange();
        this.render();
        return;
      }

      // 8. Finish Marquee Selection
      if (this.isMarqueeSelecting) {
        this.isMarqueeSelecting = false;
        this.marqueeBox = null;
        this.emitSelectionChange();
        this.render();
        return;
      }
    }

    onWheel(e) {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zooming relative to cursor position
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * zoomDelta));

        if (newZoom !== this.zoom) {
          // Maintain cursor position in diagram coordinates
          this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
          this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
          this.zoom = newZoom;
          this.render();
          this.emitZoomChange();
        }
      } else {
        // Trackpad / Wheel panning
        this.panX -= e.deltaX;
        this.panY -= e.deltaY;
        this.render();
      }
    }

    onDoubleClick(e) {
      const pos = this.screenToGrid(e.clientX, e.clientY);

      // 1. Check if double-clicking an existing waypoint to remove it
      const wpHit = this.findWaypointHandleAt(pos.screenX, pos.screenY);
      if (wpHit) {
        global.AsciiConnectors.removeWaypoint(wpHit.conn, wpHit.index);
        this.recordHistory();
        this.emitChange();
        this.render();
        return;
      }

      // 2. Check shape text editing
      const hitShape = this.findShapeAt(pos.col, pos.row);
      if (hitShape) {
        this.startTextEditing(hitShape);
      } else {
        const hitConn = this.findConnectorAt(pos.col, pos.row);
        if (hitConn) {
          const currentLabel = hitConn.label || '';
          const newLabel = prompt('Edit connector label:', currentLabel);
          if (newLabel !== null) {
            hitConn.label = newLabel;
            this.recordHistory();
            this.emitChange();
            this.render();
          }
        }
      }
    }

    onKeyDown(e) {
      if (this.editingShape) return; // Allow normal typing in textarea

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl/Cmd + Z
      if (cmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((cmdOrCtrl && e.key.toLowerCase() === 'z' && e.shiftKey) || (cmdOrCtrl && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        this.redo();
        return;
      }

      // Select All: Ctrl/Cmd + A
      if (cmdOrCtrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.selectAll();
        return;
      }

      // Duplicate: Ctrl/Cmd + D
      if (cmdOrCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.duplicateSelected();
        return;
      }

      // Group: Ctrl/Cmd + G
      if (cmdOrCtrl && e.key.toLowerCase() === 'g' && !e.shiftKey) {
        e.preventDefault();
        this.groupSelected();
        return;
      }

      // Ungroup: Ctrl/Cmd + Shift + G
      if (cmdOrCtrl && e.key.toLowerCase() === 'g' && e.shiftKey) {
        e.preventDefault();
        this.ungroupSelected();
        return;
      }

      // Delete / Backspace: Delete selected items
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedShapeIds.size > 0 || this.selectedConnectorIds.size > 0) {
          e.preventDefault();
          this.deleteSelected();
          return;
        }
      }

      // Escape: Return to select tool, deselect
      if (e.key === 'Escape') {
        this.setTool('select');
        this.selectedShapeIds.clear();
        this.selectedConnectorIds.clear();
        this.emitSelectionChange();
        this.render();
        return;
      }

      // Arrow keys: Nudge selected shapes by 1 cell
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (this.selectedShapeIds.size > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 5 : 1;
          let dCol = 0, dRow = 0;
          if (e.key === 'ArrowUp') dRow = -step;
          if (e.key === 'ArrowDown') dRow = step;
          if (e.key === 'ArrowLeft') dCol = -step;
          if (e.key === 'ArrowRight') dCol = step;

          for (const id of this.selectedShapeIds) {
            const s = this.findShapeById(id);
            if (s) {
              s.x += dCol;
              s.y += dRow;
            }
          }
          this.recordHistory();
          this.emitChange();
          this.render();
          return;
        }
      }

      // Quick Tool Shortcuts (V, H, R, U, D, P, X, C, T, N, K, L, A)
      if (!cmdOrCtrl && !e.altKey) {
        const key = e.key.toLowerCase();
        const toolMap = {
          'v': 'select',
          'h': 'pan',
          'r': 'rectangle',
          'u': 'rounded-rectangle',
          'd': 'diamond',
          'p': 'parallelogram',
          'x': 'hexagon',
          'c': 'circle',
          't': 'text',
          'n': 'note',
          'k': 'connector',
          'w': 'connector',
          'l': 'line',
          'a': 'arrow',
          'b': 'database'
        };

        if (toolMap[key]) {
          this.setTool(toolMap[key]);
          const toolBtn = document.querySelector(`.tool-btn[data-tool="${toolMap[key]}"]`);
          if (toolBtn) {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            toolBtn.classList.add('active');
          }
        }
      }
    }

    // ==========================================
    // Resize & Geometry Logic
    // ==========================================

    applyShapeResize(shape, origin, handle, curCol, curRow) {
      const minW = 4;
      const minH = 3;

      let newX = origin.x;
      let newY = origin.y;
      let newW = origin.w;
      let newH = origin.h;

      const dCol = curCol - this.dragStart.col;
      const dRow = curRow - this.dragStart.row;

      switch (handle.name) {
        case 'se':
          newW = Math.max(minW, origin.w + dCol);
          newH = Math.max(minH, origin.h + dRow);
          break;
        case 'e':
          newW = Math.max(minW, origin.w + dCol);
          break;
        case 's':
          newH = Math.max(minH, origin.h + dRow);
          break;
        case 'nw':
          newW = Math.max(minW, origin.w - dCol);
          newH = Math.max(minH, origin.h - dRow);
          newX = origin.x + (origin.w - newW);
          newY = origin.y + (origin.h - newH);
          break;
        case 'w':
          newW = Math.max(minW, origin.w - dCol);
          newX = origin.x + (origin.w - newW);
          break;
        case 'n':
          newH = Math.max(minH, origin.h - dRow);
          newY = origin.y + (origin.h - newH);
          break;
        case 'ne':
          newW = Math.max(minW, origin.w + dCol);
          newH = Math.max(minH, origin.h - dRow);
          newY = origin.y + (origin.h - newH);
          break;
        case 'sw':
          newW = Math.max(minW, origin.w - dCol);
          newH = Math.max(minH, origin.h + dRow);
          newX = origin.x + (origin.w - newW);
          break;
      }

      shape.x = newX;
      shape.y = newY;
      shape.w = newW;
      shape.h = newH;
    }

    updateHoverStates(pos) {
      if (this.currentTool === 'select') {
        // 1. Check connector endpoints
        const endpointHit = this.findConnectorEndpointAt(pos.screenX, pos.screenY);
        if (endpointHit) {
          this.hoveredEndpoint = endpointHit;
          this.canvas.style.cursor = 'grab';
          this.render();
          return;
        }
        if (this.hoveredEndpoint) {
          this.hoveredEndpoint = null;
          this.render();
        }

        // 2. Check connector waypoints
        const wpHit = this.findWaypointHandleAt(pos.screenX, pos.screenY);
        if (wpHit) {
          this.hoveredWaypoint = wpHit;
          this.canvas.style.cursor = 'grab';
          this.render();
          return;
        }
        if (this.hoveredWaypoint) {
          this.hoveredWaypoint = null;
          this.render();
        }

        // 3. Check connector midpoints
        const midHit = this.findMidpointHandleAt(pos.screenX, pos.screenY);
        if (midHit) {
          this.hoveredMidpoint = midHit;
          this.canvas.style.cursor = 'copy';
          this.render();
          return;
        }
        if (this.hoveredMidpoint) {
          this.hoveredMidpoint = null;
          this.render();
        }

        // 4. Check line / arrow shape endpoints
        const lineEndHit = this.findLineEndpointAt(pos.screenX, pos.screenY);
        if (lineEndHit) {
          this.canvas.style.cursor = 'grab';
          return;
        }

        // 5. Check resize handles on selected shapes
        if (this.selectedShapeIds.size === 1) {
          const singleShape = this.findShapeById(Array.from(this.selectedShapeIds)[0]);
          if (singleShape && singleShape.type !== 'line' && singleShape.type !== 'arrow') {
            const handle = this.findResizeHandleAt(singleShape, pos.screenX, pos.screenY);
            if (handle) {
              this.hoveredResizeHandle = handle;
              this.canvas.style.cursor = handle.cursor;
              return;
            }
          }
        }
        this.hoveredResizeHandle = null;

        // 6. Check anchor points
        const anchorHit = this.findAnchorAt(pos.col, pos.row);
        if (anchorHit) {
          this.hoveredAnchor = anchorHit;
          this.canvas.style.cursor = 'crosshair';
          this.render();
          return;
        }
        if (this.hoveredAnchor) {
          this.hoveredAnchor = null;
          this.render();
        }

        // 7. Check shapes
        const shape = this.findShapeAt(pos.col, pos.row);
        if (shape) {
          this.hoveredShape = shape;
          this.canvas.style.cursor = 'move';
          return;
        }

        // 8. Check connectors
        const conn = this.findConnectorAt(pos.col, pos.row);
        if (conn) {
          this.hoveredConnector = conn;
          this.canvas.style.cursor = 'pointer';
          return;
        }

        this.hoveredShape = null;
        this.hoveredConnector = null;
        this.canvas.style.cursor = 'default';
      } else if (this.currentTool === 'connector' || this.currentTool === 'line' || this.currentTool === 'arrow') {
        const anchorHit = this.findAnchorAt(pos.col, pos.row);
        if (anchorHit) {
          this.hoveredAnchor = anchorHit;
          this.canvas.style.cursor = 'crosshair';
        } else {
          this.hoveredAnchor = null;
          this.canvas.style.cursor = 'crosshair';
        }
        this.render();
      }
    }

    updateMarqueeSelection() {
      if (!this.marqueeBox) return;

      const minCol = Math.min(this.marqueeBox.startCol, this.marqueeBox.endCol);
      const maxCol = Math.max(this.marqueeBox.startCol, this.marqueeBox.endCol);
      const minRow = Math.min(this.marqueeBox.startRow, this.marqueeBox.endRow);
      const maxRow = Math.max(this.marqueeBox.startRow, this.marqueeBox.endRow);

      this.selectedShapeIds.clear();

      for (const shape of this.diagram.shapes) {
        const sRight = shape.x + shape.w - 1;
        const sBottom = shape.y + shape.h - 1;

        // Check intersection
        const intersects = !(
          shape.x > maxCol ||
          sRight < minCol ||
          shape.y > maxRow ||
          sBottom < minRow
        );

        if (intersects) {
          this.selectedShapeIds.add(shape.id);
        }
      }

      this.emitSelectionChange();
    }

    // ==========================================
    // In-place Text Editing
    // ==========================================

    startTextEditing(shape) {
      if (!this.textEditor) return;
      this.editingShape = shape;

      const screenPt = this.gridToScreen(shape.x + 1, shape.y + 1);
      const wPx = Math.max(120, (shape.w - 2) * this.cellWidth * this.zoom);
      const hPx = Math.max(40, (shape.h - 2) * this.cellHeight * this.zoom);

      this.textEditor.style.left = `${screenPt.x}px`;
      this.textEditor.style.top = `${screenPt.y}px`;
      this.textEditor.style.width = `${wPx}px`;
      this.textEditor.style.height = `${hPx}px`;
      this.textEditor.style.fontSize = `${13 * this.zoom}px`;
      this.textEditor.style.lineHeight = `${18 * this.zoom}px`;
      this.textEditor.style.display = 'block';
      this.textEditor.value = shape.text || '';
      this.textEditor.focus();
      this.textEditor.select();
    }

    finishTextEditing(commit = true) {
      if (!this.editingShape || !this.textEditor) return;

      if (commit) {
        const newText = this.textEditor.value;
        if (newText !== this.editingShape.text) {
          this.editingShape.text = newText;
          // Auto-adjust size if text overflows
          global.AsciiShapes.autoFitShape(this.editingShape);
          this.recordHistory();
          this.emitChange();
        }
      }

      this.textEditor.style.display = 'none';
      this.editingShape = null;
      this.render();
    }

    // ==========================================
    // Diagram Mutations
    // ==========================================

    addShape(shape) {
      this.diagram.shapes.push(shape);
      this.recordHistory();
      this.emitChange();
      this.render();
    }

    addConnector(connector) {
      this.diagram.connectors.push(connector);
      this.recordHistory();
      this.emitChange();
      this.render();
    }

    deleteSelected() {
      if (this.selectedShapeIds.size === 0 && this.selectedConnectorIds.size === 0) return;

      // Delete connectors attached to deleted shapes
      const remainingShapes = this.diagram.shapes.filter(s => !this.selectedShapeIds.has(s.id));
      const remainingNotes = (this.diagram.notes || []).filter(n => !this.selectedShapeIds.has(n.id));
      const remainingTexts = (this.diagram.texts || []).filter(t => !this.selectedShapeIds.has(t.id));

      const remainingConnectors = this.diagram.connectors.filter(c => {
        if (this.selectedConnectorIds.has(c.id)) return false;
        if (c.fromShapeId && this.selectedShapeIds.has(c.fromShapeId)) return false;
        if (c.toShapeId && this.selectedShapeIds.has(c.toShapeId)) return false;
        return true;
      });

      this.diagram.shapes = remainingShapes;
      this.diagram.notes = remainingNotes;
      this.diagram.texts = remainingTexts;
      this.diagram.connectors = remainingConnectors;

      this.selectedShapeIds.clear();
      this.selectedConnectorIds.clear();

      this.recordHistory();
      this.emitSelectionChange();
      this.emitChange();
      this.render();
    }

    duplicateSelected() {
      if (this.selectedShapeIds.size === 0) return;

      const newIds = new Set();
      const idMap = new Map();

      for (const id of this.selectedShapeIds) {
        const orig = this.findShapeById(id);
        if (orig) {
          const dup = global.AsciiShapes.duplicateShape(orig, 3, 2);
          this.diagram.shapes.push(dup);
          newIds.add(dup.id);
          idMap.set(id, dup.id);
        }
      }

      this.selectedShapeIds = newIds;
      this.selectedConnectorIds.clear();
      this.recordHistory();
      this.emitSelectionChange();
      this.emitChange();
      this.render();
    }

    selectAll() {
      this.selectedShapeIds.clear();
      this.selectedConnectorIds.clear();

      for (const s of this.diagram.shapes) {
        this.selectedShapeIds.add(s.id);
      }
      for (const c of this.diagram.connectors) {
        this.selectedConnectorIds.add(c.id);
      }

      this.emitSelectionChange();
      this.render();
    }

    /**
     * Align selected shapes along a given edge or center axis
     * @param {'left'|'center'|'right'|'top'|'middle'|'bottom'} alignment
     */
    alignSelected(alignment) {
      const shapes = Array.from(this.selectedShapeIds).map(id => this.findShapeById(id)).filter(Boolean);
      if (shapes.length < 2) return;

      switch (alignment) {
        case 'left': {
          const minX = Math.min(...shapes.map(s => s.x));
          shapes.forEach(s => s.x = minX);
          break;
        }
        case 'center': {
          const avgCenterX = Math.round(shapes.reduce((sum, s) => sum + s.x + s.w / 2, 0) / shapes.length);
          shapes.forEach(s => s.x = Math.round(avgCenterX - s.w / 2));
          break;
        }
        case 'right': {
          const maxX = Math.max(...shapes.map(s => s.x + s.w));
          shapes.forEach(s => s.x = maxX - s.w);
          break;
        }
        case 'top': {
          const minY = Math.min(...shapes.map(s => s.y));
          shapes.forEach(s => s.y = minY);
          break;
        }
        case 'middle': {
          const avgCenterY = Math.round(shapes.reduce((sum, s) => sum + s.y + s.h / 2, 0) / shapes.length);
          shapes.forEach(s => s.y = Math.round(avgCenterY - s.h / 2));
          break;
        }
        case 'bottom': {
          const maxY = Math.max(...shapes.map(s => s.y + s.h));
          shapes.forEach(s => s.y = maxY - s.h);
          break;
        }
      }

      this.recordHistory();
      this.emitChange();
      this.render();
    }

    /**
     * Distribute selected shapes evenly along the horizontal or vertical axis
     * @param {'horizontal'|'vertical'} axis
     */
    distributeSelected(axis = 'horizontal') {
      const shapes = Array.from(this.selectedShapeIds).map(id => this.findShapeById(id)).filter(Boolean);
      if (shapes.length < 3) return;

      if (axis === 'horizontal') {
        shapes.sort((a, b) => a.x - b.x);
        const first = shapes[0];
        const last = shapes[shapes.length - 1];
        const totalSpan = (last.x + last.w) - first.x;
        const totalWidth = shapes.reduce((sum, s) => sum + s.w, 0);
        const remainingSpace = totalSpan - totalWidth;
        const gap = remainingSpace / (shapes.length - 1);

        let curX = first.x;
        for (let i = 0; i < shapes.length; i++) {
          if (i > 0) shapes[i].x = Math.round(curX);
          curX += shapes[i].w + gap;
        }
      } else {
        shapes.sort((a, b) => a.y - b.y);
        const first = shapes[0];
        const last = shapes[shapes.length - 1];
        const totalSpan = (last.y + last.h) - first.y;
        const totalHeight = shapes.reduce((sum, s) => sum + s.h, 0);
        const remainingSpace = totalSpan - totalHeight;
        const gap = remainingSpace / (shapes.length - 1);

        let curY = first.y;
        for (let i = 0; i < shapes.length; i++) {
          if (i > 0) shapes[i].y = Math.round(curY);
          curY += shapes[i].h + gap;
        }
      }

      this.recordHistory();
      this.emitChange();
      this.render();
    }

    /**
     * Group currently selected shapes
     */
    groupSelected() {
      const selectedShapes = Array.from(this.selectedShapeIds).map(id => this.findShapeById(id)).filter(Boolean);
      if (selectedShapes.length < 2) return;
      if (global.AsciiShapes && global.AsciiShapes.groupShapes) {
        global.AsciiShapes.groupShapes(selectedShapes);
      }
      this.recordHistory();
      this.emitChange();
      this.emitSelectionChange();
      this.render();
    }

    /**
     * Ungroup currently selected shapes
     */
    ungroupSelected() {
      const selectedShapes = Array.from(this.selectedShapeIds).map(id => this.findShapeById(id)).filter(Boolean);
      if (selectedShapes.length === 0) return;
      if (global.AsciiShapes && global.AsciiShapes.ungroupShapes) {
        global.AsciiShapes.ungroupShapes(selectedShapes);
      }
      this.recordHistory();
      this.emitChange();
      this.emitSelectionChange();
      this.render();
    }

    /**
     * Auto-layout diagram shapes using topological hierarchical ranking
     * @param {'TB'|'LR'} direction
     */
    autoLayout(direction = 'TB') {
      const shapes = this.diagram.shapes;
      if (!shapes || shapes.length < 2) return;

      const connectors = this.diagram.connectors || [];

      // Build adjacency and in-degree tables
      const inDegree = new Map();
      const adj = new Map();
      shapes.forEach(s => {
        inDegree.set(s.id, 0);
        adj.set(s.id, []);
      });

      for (const c of connectors) {
        if (c.fromShapeId && c.toShapeId && inDegree.has(c.toShapeId) && adj.has(c.fromShapeId)) {
          inDegree.set(c.toShapeId, (inDegree.get(c.toShapeId) || 0) + 1);
          adj.get(c.fromShapeId).push(c.toShapeId);
        }
      }

      // Assign ranks using topological levels
      const ranks = new Map();
      const queue = [];

      shapes.forEach(s => {
        if (inDegree.get(s.id) === 0) {
          ranks.set(s.id, 0);
          queue.push(s.id);
        }
      });

      // Handle cyclic or fully connected structures
      if (queue.length === 0) {
        queue.push(shapes[0].id);
        ranks.set(shapes[0].id, 0);
      }

      while (queue.length > 0) {
        const u = queue.shift();
        const r = ranks.get(u);
        const neighbors = adj.get(u) || [];
        for (const v of neighbors) {
          const currR = ranks.get(v);
          if (currR === undefined || currR < r + 1) {
            ranks.set(v, r + 1);
            queue.push(v);
          }
        }
      }

      // Any remaining disconnected node gets maxRank + 1
      let maxRank = 0;
      for (const r of ranks.values()) {
        if (r > maxRank) maxRank = r;
      }
      shapes.forEach(s => {
        if (!ranks.has(s.id)) {
          ranks.set(s.id, maxRank + 1);
        }
      });

      // Group shapes by rank
      const rankGroups = new Map();
      shapes.forEach(s => {
        const r = ranks.get(s.id);
        if (!rankGroups.has(r)) rankGroups.set(r, []);
        rankGroups.get(r).push(s);
      });

      const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b);
      const isTB = direction === 'TB';

      const primaryGap = isTB ? 5 : 8;
      const secondaryGap = isTB ? 6 : 4;
      const startX = 6;
      const startY = 4;

      let primaryCoord = isTB ? startY : startX;

      let maxRankBreadth = 0;
      for (const r of sortedRanks) {
        const group = rankGroups.get(r);
        let breadth = 0;
        group.forEach((s, idx) => {
          breadth += (isTB ? s.w : s.h) + (idx > 0 ? secondaryGap : 0);
        });
        if (breadth > maxRankBreadth) maxRankBreadth = breadth;
      }

      for (const r of sortedRanks) {
        const group = rankGroups.get(r);
        let groupBreadth = 0;
        let maxDepthInRank = 0;

        group.forEach((s, idx) => {
          groupBreadth += (isTB ? s.w : s.h) + (idx > 0 ? secondaryGap : 0);
          const depth = isTB ? s.h : s.w;
          if (depth > maxDepthInRank) maxDepthInRank = depth;
        });

        // Center group along secondary axis
        let secCoord = (isTB ? startX : startY) + Math.max(0, Math.floor((maxRankBreadth - groupBreadth) / 2));

        for (const s of group) {
          if (isTB) {
            s.x = secCoord;
            s.y = primaryCoord;
            secCoord += s.w + secondaryGap;
          } else {
            s.x = primaryCoord;
            s.y = secCoord;
            secCoord += s.h + secondaryGap;
          }
        }

        primaryCoord += maxDepthInRank + primaryGap;
      }

      // Reset manual waypoints on connectors so they auto-route cleanly
      connectors.forEach(c => {
        c.waypoints = [];
      });

      this.recordHistory();
      this.emitChange();
      this.render();
    }

    loadDiagram(data) {
      if (this.editingShape) this.finishTextEditing();
      this.diagram = global.AsciiStorage.normalizeDiagram(data);
      this.renderer.setMode(this.diagram.mode || 'unicode');
      this.selectedShapeIds.clear();
      this.selectedConnectorIds.clear();
      this.history.clear();
      this.recordHistory();
      this.emitSelectionChange();
      this.emitChange();
      this.fitView();
      this.render();
    }

    clearDiagram() {
      this.loadDiagram({
        version: 1,
        name: 'Untitled Diagram',
        mode: this.diagram.mode || 'unicode',
        shapes: [],
        connectors: [],
        texts: [],
        notes: []
      });
    }

    // ==========================================
    // Undo / Redo
    // ==========================================

    recordHistory() {
      this.history.push(this.diagram);
    }

    undo() {
      if (!this.history.canUndo()) return;
      const prev = this.history.undo(this.diagram);
      if (prev) {
        this.diagram = global.AsciiStorage.normalizeDiagram(prev);
        this.selectedShapeIds.clear();
        this.selectedConnectorIds.clear();
        this.emitSelectionChange();
        this.emitChange();
        this.render();
      }
    }

    redo() {
      if (!this.history.canRedo()) return;
      const next = this.history.redo(this.diagram);
      if (next) {
        this.diagram = global.AsciiStorage.normalizeDiagram(next);
        this.selectedShapeIds.clear();
        this.selectedConnectorIds.clear();
        this.emitSelectionChange();
        this.emitChange();
        this.render();
      }
    }

    // ==========================================
    // Viewport & Zoom
    // ==========================================

    zoomIn() {
      this.setZoom(this.zoom * 1.2);
    }

    zoomOut() {
      this.setZoom(this.zoom / 1.2);
    }

    resetZoom() {
      this.setZoom(1.0);
    }

    setZoom(val) {
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, val));
      this.render();
      this.emitZoomChange();
    }

    fitView() {
      const bounds = this.renderer.calculateBounds(this.diagram, 4);
      const rect = this.container.getBoundingClientRect();

      const totalCols = bounds.maxCol - bounds.minCol + 1;
      const totalRows = bounds.maxRow - bounds.minRow + 1;
      const diagWPx = totalCols * this.cellWidth;
      const diagHPx = totalRows * this.cellHeight;

      if (diagWPx > 0 && diagHPx > 0) {
        const scaleX = (rect.width - 80) / diagWPx;
        const scaleY = (rect.height - 80) / diagHPx;
        this.zoom = Math.min(1.2, Math.max(0.6, Math.min(scaleX, scaleY)));
        this.panX = Math.floor((rect.width - diagWPx * this.zoom) / 2) - bounds.minCol * this.cellWidth * this.zoom;
        this.panY = Math.floor((rect.height - diagHPx * this.zoom) / 2) - bounds.minRow * this.cellHeight * this.zoom;
      } else {
        this.panX = 60;
        this.panY = 60;
        this.zoom = 1.0;
      }

      this.render();
      this.emitZoomChange();
    }

    // ==========================================
    // Hit-Testing Helpers
    // ==========================================

    findShapeById(id) {
      return this.diagram.shapes.find(s => s.id === id) ||
             (this.diagram.notes || []).find(n => n.id === id);
    }

    findShapeAt(col, row) {
      // Check in reverse order so top shapes are clicked first
      for (let i = this.diagram.shapes.length - 1; i >= 0; i--) {
        const s = this.diagram.shapes[i];
        if (global.AsciiShapes.hitTestShape(s, col, row)) {
          return s;
        }
      }
      return null;
    }

    findConnectorAt(col, row) {
      const shapeMap = new Map();
      this.diagram.shapes.forEach(s => shapeMap.set(s.id, s));

      for (let i = this.diagram.connectors.length - 1; i >= 0; i--) {
        const conn = this.diagram.connectors[i];
        const points = this.renderer.resolveConnectorPoints(conn, shapeMap);
        if (global.AsciiConnectors.hitTestConnector(conn, points, col, row, 1.0)) {
          return conn;
        }
      }
      return null;
    }

    findAnchorAt(col, row) {
      for (let i = this.diagram.shapes.length - 1; i >= 0; i--) {
        const shape = this.diagram.shapes[i];
        const anchor = global.AsciiShapes.hitTestAnchors(shape, col, row, 1.2);
        if (anchor) {
          return { shape, ...anchor };
        }
      }
      return null;
    }

    findResizeHandleAt(shape, screenX, screenY) {
      const handleSize = 8;
      const sPt = this.gridToScreen(shape.x, shape.y);
      const wPx = shape.w * this.cellWidth * this.zoom;
      const hPx = shape.h * this.cellHeight * this.zoom;

      for (const h of RESIZE_HANDLES) {
        const hX = sPt.x + h.colOffset * wPx;
        const hY = sPt.y + h.rowOffset * hPx;

        if (Math.abs(screenX - hX) <= handleSize && Math.abs(screenY - hY) <= handleSize) {
          return h;
        }
      }
      return null;
    }

    findConnectorEndpointAt(screenX, screenY, tolerance = 10) {
      const cellWPx = this.cellWidth * this.zoom;
      const cellHPx = this.cellHeight * this.zoom;
      const shapeMap = new Map();
      this.diagram.shapes.forEach(s => shapeMap.set(s.id, s));

      for (const id of this.selectedConnectorIds) {
        const conn = this.diagram.connectors.find(c => c.id === id);
        if (!conn) continue;

        const points = this.renderer.resolveConnectorPoints(conn, shapeMap);
        if (!points || points.length < 2) continue;

        const pStart = points[0];
        const sStart = this.gridToScreen(pStart.x, pStart.y);
        const startX = sStart.x + cellWPx / 2;
        const startY = sStart.y + cellHPx / 2;
        if (Math.hypot(screenX - startX, screenY - startY) <= tolerance) {
          return { conn, end: 'start', point: pStart };
        }

        const pEnd = points[points.length - 1];
        const sEnd = this.gridToScreen(pEnd.x, pEnd.y);
        const endX = sEnd.x + cellWPx / 2;
        const endY = sEnd.y + cellHPx / 2;
        if (Math.hypot(screenX - endX, screenY - endY) <= tolerance) {
          return { conn, end: 'end', point: pEnd };
        }
      }
      return null;
    }

    findWaypointHandleAt(screenX, screenY, tolerance = 10) {
      const cellWPx = this.cellWidth * this.zoom;
      const cellHPx = this.cellHeight * this.zoom;

      for (const id of this.selectedConnectorIds) {
        const conn = this.diagram.connectors.find(c => c.id === id);
        if (!conn || !conn.waypoints || conn.waypoints.length === 0) continue;

        for (let i = 0; i < conn.waypoints.length; i++) {
          const wp = conn.waypoints[i];
          const sPt = this.gridToScreen(wp.x, wp.y);
          const ptX = sPt.x + cellWPx / 2;
          const ptY = sPt.y + cellHPx / 2;
          if (Math.hypot(screenX - ptX, screenY - ptY) <= tolerance) {
            return { conn, index: i, waypoint: wp };
          }
        }
      }
      return null;
    }

    findMidpointHandleAt(screenX, screenY, tolerance = 8) {
      const cellWPx = this.cellWidth * this.zoom;
      const cellHPx = this.cellHeight * this.zoom;
      const shapeMap = new Map();
      this.diagram.shapes.forEach(s => shapeMap.set(s.id, s));

      for (const id of this.selectedConnectorIds) {
        const conn = this.diagram.connectors.find(c => c.id === id);
        if (!conn) continue;

        const points = this.renderer.resolveConnectorPoints(conn, shapeMap);
        if (!points || points.length < 2) continue;

        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];

          const s1 = this.gridToScreen(p1.x, p1.y);
          const s2 = this.gridToScreen(p2.x, p2.y);
          const x1 = s1.x + cellWPx / 2;
          const y1 = s1.y + cellHPx / 2;
          const x2 = s2.x + cellWPx / 2;
          const y2 = s2.y + cellHPx / 2;

          if (Math.hypot(x2 - x1, y2 - y1) < 22) continue;

          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          if (Math.hypot(screenX - midX, screenY - midY) <= tolerance) {
            const gridMid = {
              x: Math.round((p1.x + p2.x) / 2),
              y: Math.round((p1.y + p2.y) / 2)
            };
            return { conn, segmentIndex: i, point: gridMid };
          }
        }
      }

      // Also check midpoint on selected line/arrow shapes
      for (const id of this.selectedShapeIds) {
        const shape = this.findShapeById(id);
        if (!shape || (shape.type !== 'line' && shape.type !== 'arrow')) continue;

        const p1 = { x: shape.x, y: shape.y };
        const p2 = { x: shape.x + shape.w - 1, y: shape.y + shape.h - 1 };
        const s1 = this.gridToScreen(p1.x, p1.y);
        const s2 = this.gridToScreen(p2.x, p2.y);
        const x1 = s1.x + cellWPx / 2;
        const y1 = s1.y + cellHPx / 2;
        const x2 = s2.x + cellWPx / 2;
        const y2 = s2.y + cellHPx / 2;

        if (Math.hypot(x2 - x1, y2 - y1) < 20) continue;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        if (Math.hypot(screenX - midX, screenY - midY) <= tolerance) {
          const gridMid = {
            x: Math.round((p1.x + p2.x) / 2),
            y: Math.round((p1.y + p2.y) / 2)
          };
          return { shape, isShape: true, point: gridMid };
        }
      }

      return null;
    }

    findLineEndpointAt(screenX, screenY, tolerance = 10) {
      const cellWPx = this.cellWidth * this.zoom;
      const cellHPx = this.cellHeight * this.zoom;

      for (const id of this.selectedShapeIds) {
        const shape = this.findShapeById(id);
        if (!shape || (shape.type !== 'line' && shape.type !== 'arrow')) continue;

        const pStart = { x: shape.x, y: shape.y };
        const pEnd = { x: shape.x + shape.w - 1, y: shape.y + shape.h - 1 };

        const sStart = this.gridToScreen(pStart.x, pStart.y);
        const startX = sStart.x + cellWPx / 2;
        const startY = sStart.y + cellHPx / 2;
        if (Math.hypot(screenX - startX, screenY - startY) <= tolerance) {
          return { shape, end: 'start' };
        }

        const sEnd = this.gridToScreen(pEnd.x, pEnd.y);
        const endX = sEnd.x + cellWPx / 2;
        const endY = sEnd.y + cellHPx / 2;
        if (Math.hypot(screenX - endX, screenY - endY) <= tolerance) {
          return { shape, end: 'end' };
        }
      }
      return null;
    }

    getWaypointInsertIndex(conn, col, row) {
      if (!conn.waypoints || conn.waypoints.length === 0) {
        return 0;
      }

      const shapeMap = new Map();
      this.diagram.shapes.forEach(s => shapeMap.set(s.id, s));
      const routeInfo = this.renderer.resolveConnectorRouteInfo(conn, shapeMap);
      const points = (routeInfo && routeInfo.points) ? routeInfo.points : [];

      if (points.length < 2) return conn.waypoints.length;

      let bestSegment = 0;
      let minDist = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        const d = global.AsciiConnectors.distanceToSegment(col, row, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
        if (d < minDist) {
          minDist = d;
          bestSegment = i;
        }
      }

      for (let w = 0; w < conn.waypoints.length; w++) {
        const wp = conn.waypoints[w];
        const segIdx = points.findIndex(p => p.x === wp.x && p.y === wp.y);
        if (segIdx !== -1 && segIdx > bestSegment) {
          return w;
        }
      }
      return conn.waypoints.length;
    }

    isShapeSelected(id) {
      return this.selectedShapeIds.has(id);
    }

    // ==========================================
    // Render Pipeline
    // ==========================================

    render() {
      const ctx = this.ctx;
      const rect = this.container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Clear full canvas
      ctx.clearRect(0, 0, w, h);

      // Read theme colors
      const isDark = global.AsciiTheme ? global.AsciiTheme.isDark() : false;
      const themeColors = {
        gridDot: isDark ? '#1e293b' : '#cbd5e1',
        gridLine: isDark ? '#141e33' : '#f1f5f9',
        shapeFill: 'transparent',
        textColor: isDark ? '#f8fafc' : '#0f172a',
        selectionBorder: isDark ? '#60a5fa' : '#2563eb',
        selectionFill: isDark ? 'rgba(96, 165, 250, 0.12)' : 'rgba(37, 99, 235, 0.08)',
        anchorFill: isDark ? '#38bdf8' : '#0284c7',
        anchorGlow: isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.25)',
        connectorDraft: isDark ? '#38bdf8' : '#0284c7',
        isDark: isDark
      };

      // 1. Draw Grid Background (Dots or Lines)
      this.drawGridBackground(ctx, w, h, themeColors);

      // 2. Render ASCII character grid
      const asciiGrid = this.renderer.renderToGrid(this.diagram);

      // Monospace characters are drawn with transparent backgrounds
      this.drawAsciiCharacters(ctx, asciiGrid, themeColors);

      // 3. Draw Draft Elements (while creating shapes or connectors)
      if (this.isDrawingShape && this.drawingShapeDraft) {
        this.drawShapeDraft(ctx, this.drawingShapeDraft, themeColors);
      }
      if (this.isDrawingConnector && this.drawingConnectorDraft) {
        this.drawConnectorDraft(ctx, this.drawingConnectorDraft, themeColors);
      }

      // 4. Draw Selection Overlays (frames, handles, anchors, endpoints, waypoints)
      this.drawSelectionOverlays(ctx, themeColors);

      // 5. Draw Marquee Selection Box
      if (this.isMarqueeSelecting && this.marqueeBox) {
        this.drawMarqueeBox(ctx, this.marqueeBox, themeColors);
      }
    }

    drawGridBackground(ctx, w, h, colors) {
      if (this.gridStyle === 'none') return;

      const cellWPx = this.cellWidth * this.zoom;
      const cellHPx = this.cellHeight * this.zoom;

      const startCol = Math.floor(-this.panX / cellWPx) - 1;
      const endCol = Math.ceil((w - this.panX) / cellWPx) + 1;
      const startRow = Math.floor(-this.panY / cellHPx) - 1;
      const endRow = Math.ceil((h - this.panY) / cellHPx) + 1;

      if (this.gridStyle === 'lines') {
        ctx.strokeStyle = colors.gridLine;
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let col = startCol; col <= endCol; col++) {
          const x = Math.floor(this.panX + col * cellWPx) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }

        for (let row = startRow; row <= endRow; row++) {
          const y = Math.floor(this.panY + row * cellHPx) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
      } else {
        // Dots at intersections
        ctx.fillStyle = colors.gridDot;
        const dotRadius = Math.max(1, 1.2 * this.zoom);

        for (let col = startCol; col <= endCol; col++) {
          for (let row = startRow; row <= endRow; row++) {
            const x = this.panX + col * cellWPx;
            const y = this.panY + row * cellHPx;
            ctx.fillRect(x - dotRadius / 2, y - dotRadius / 2, dotRadius, dotRadius);
          }
        }
      }
    }

    drawShapeCards(ctx, colors) {
      // Shape backgrounds are transparent
    }

    drawAsciiCharacters(ctx, grid, colors) {
      const cellWPx = this.cellWidth * this.zoom;
      const cellHPx = this.cellHeight * this.zoom;
      const fontSize = Math.max(8, Math.round(13 * this.zoom));

      ctx.font = `${fontSize}px "SFMono-Regular", "Cascadia Code", "Roboto Mono", "Consolas", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colors.textColor;

      const halfW = cellWPx / 2;
      const halfH = cellHPx / 2;

      for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
          const char = grid.cells[r][c];
          if (char === ' ') continue;

          const col = grid.minCol + c;
          const row = grid.minRow + r;

          const screenX = this.panX + col * cellWPx + halfW;
          const screenY = this.panY + row * cellHPx + halfH;

          ctx.fillText(char, screenX, screenY);
        }
      }
    }

    drawSelectionOverlays(ctx, colors) {
      const cellWPx = this.cellWidth * this.zoom;
      const cellHPx = this.cellHeight * this.zoom;
      const shapeMap = new Map();
      this.diagram.shapes.forEach(s => shapeMap.set(s.id, s));

      // 0. Draw Magnetic Alignment Guides if active
      if (this.activeGuides && this.activeGuides.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#0ea5e9'; // Bright sky blue
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (const g of this.activeGuides) {
          if (g.axis === 'x') {
            const sPt = this.gridToScreen(g.col, 0);
            const x = Math.round(sPt.x);
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
          } else if (g.axis === 'y') {
            const sPt = this.gridToScreen(0, g.row);
            const y = Math.round(sPt.y);
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // 1. Draw Selection Box and Handles for selected shapes
      for (const id of this.selectedShapeIds) {
        const shape = this.findShapeById(id);
        if (!shape) continue;

        const sPt = this.gridToScreen(shape.x, shape.y);
        const wPx = shape.w * cellWPx;
        const hPx = shape.h * cellHPx;

        if (shape.type === 'line' || shape.type === 'arrow') {
          // Line / Arrow endpoint handles
          const pStart = { x: shape.x, y: shape.y };
          const pEnd = { x: shape.x + shape.w - 1, y: shape.y + shape.h - 1 };
          const s1 = this.gridToScreen(pStart.x, pStart.y);
          const s2 = this.gridToScreen(pEnd.x, pEnd.y);
          const x1 = s1.x + cellWPx / 2;
          const y1 = s1.y + cellHPx / 2;
          const x2 = s2.x + cellWPx / 2;
          const y2 = s2.y + cellHPx / 2;

          // Selection dashed line
          ctx.strokeStyle = colors.selectionBorder;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Start Handle (Emerald Green)
          ctx.fillStyle = '#10b981';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x1, y1, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // End Handle (Royal Blue)
          ctx.fillStyle = '#2563eb';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x2, y2, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Midpoint "+" Handle
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          if (Math.hypot(x2 - x1, y2 - y1) >= 20) {
            ctx.fillStyle = colors.isDark ? '#334155' : '#e2e8f0';
            ctx.strokeStyle = colors.isDark ? '#94a3b8' : '#64748b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(midX, midY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = colors.isDark ? '#f8fafc' : '#0f172a';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(midX - 2.5, midY);
            ctx.lineTo(midX + 2.5, midY);
            ctx.moveTo(midX, midY - 2.5);
            ctx.lineTo(midX, midY + 2.5);
            ctx.stroke();
          }
        } else {
          // Normal shape selection highlight frame
          ctx.strokeStyle = colors.selectionBorder;
          ctx.lineWidth = 1.5;
          ctx.fillStyle = colors.selectionFill;
          ctx.fillRect(sPt.x - 2, sPt.y - 2, wPx + 4, hPx + 4);
          ctx.strokeRect(sPt.x - 2, sPt.y - 2, wPx + 4, hPx + 4);

          // Draw 8 resize handles if single selection
          if (this.selectedShapeIds.size === 1) {
            const handleSize = 7;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = colors.selectionBorder;
            ctx.lineWidth = 1.5;

            for (const h of RESIZE_HANDLES) {
              const hX = sPt.x + h.colOffset * wPx;
              const hY = sPt.y + h.rowOffset * hPx;
              ctx.fillRect(hX - handleSize / 2, hY - handleSize / 2, handleSize, handleSize);
              ctx.strokeRect(hX - handleSize / 2, hY - handleSize / 2, handleSize, handleSize);
            }
          }
        }
      }

      // 2. Draw Anchor Points on shapes
      const isConnMode = (this.currentTool === 'connector' || this.currentTool === 'line' || this.currentTool === 'arrow');
      if (isConnMode || this.isDraggingConnectorEndpoint || this.isDraggingLineEndpoint || this.hoveredShape || this.selectedShapeIds.size === 1) {
        const shapesToShow = this.hoveredShape
          ? [this.hoveredShape]
          : (isConnMode || this.isDraggingConnectorEndpoint || this.isDraggingLineEndpoint ? this.diagram.shapes : []);

        for (const shape of shapesToShow) {
          if (shape.type === 'line' || shape.type === 'arrow' || shape.type === 'text') continue;
          const anchors = global.AsciiShapes.getAnchorPoints(shape);

          for (const key of ['top', 'bottom', 'left', 'right']) {
            const pt = anchors[key];
            const sPt = this.gridToScreen(pt.x, pt.y);
            const aX = sPt.x + cellWPx / 2;
            const aY = sPt.y + cellHPx / 2;

            const isHovered = this.hoveredAnchor &&
              this.hoveredAnchor.shape.id === shape.id &&
              this.hoveredAnchor.anchor === key;

            const radius = isHovered ? 6.5 : 4;

            ctx.fillStyle = isHovered ? '#10b981' : colors.anchorFill;
            ctx.beginPath();
            ctx.arc(aX, aY, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = isHovered ? 2 : 1;
            ctx.stroke();

            if (isHovered) {
              // Snapping ripple ring
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(aX, aY, radius + 4, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }

      // 3. Highlight selected connectors with Endpoints, Waypoints, and Midpoints
      for (const id of this.selectedConnectorIds) {
        const conn = this.diagram.connectors.find(c => c.id === id);
        if (!conn) continue;

        const points = this.renderer.resolveConnectorPoints(conn, shapeMap);
        if (!points || points.length < 2) continue;

        // Path outline
        ctx.strokeStyle = colors.selectionBorder;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();

        for (let i = 0; i < points.length; i++) {
          const sPt = this.gridToScreen(points[i].x, points[i].y);
          const x = sPt.x + cellWPx / 2;
          const y = sPt.y + cellHPx / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // A. Start Handle (Emerald Green Circle)
        const pStart = points[0];
        const sStart = this.gridToScreen(pStart.x, pStart.y);
        const startX = sStart.x + cellWPx / 2;
        const startY = sStart.y + cellHPx / 2;
        const isHoveredStart = (this.hoveredEndpoint && this.hoveredEndpoint.conn.id === conn.id && this.hoveredEndpoint.end === 'start');

        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(startX, startY, isHoveredStart ? 8 : 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(startX, startY, 2, 0, Math.PI * 2);
        ctx.fill();

        // B. End Handle (Royal Blue Circle)
        const pEnd = points[points.length - 1];
        const sEnd = this.gridToScreen(pEnd.x, pEnd.y);
        const endX = sEnd.x + cellWPx / 2;
        const endY = sEnd.y + cellHPx / 2;
        const isHoveredEnd = (this.hoveredEndpoint && this.hoveredEndpoint.conn.id === conn.id && this.hoveredEndpoint.end === 'end');

        ctx.fillStyle = '#2563eb';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(endX, endY, isHoveredEnd ? 8 : 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(endX, endY, 2, 0, Math.PI * 2);
        ctx.fill();

        // C. Existing Waypoints Handles (White circle with Indigo border)
        if (conn.waypoints && conn.waypoints.length > 0) {
          for (let w = 0; w < conn.waypoints.length; w++) {
            const wp = conn.waypoints[w];
            const sWp = this.gridToScreen(wp.x, wp.y);
            const wpX = sWp.x + cellWPx / 2;
            const wpY = sWp.y + cellHPx / 2;
            const isHoveredWp = (this.hoveredWaypoint && this.hoveredWaypoint.conn.id === conn.id && this.hoveredWaypoint.index === w);

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#4f46e5';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(wpX, wpY, isHoveredWp ? 7.5 : 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#4f46e5';
            ctx.beginPath();
            ctx.arc(wpX, wpY, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // D. Midpoint "+" Handles on segments
        for (let i = 0; i < points.length - 1; i++) {
          const pt1 = points[i];
          const pt2 = points[i + 1];
          const s1 = this.gridToScreen(pt1.x, pt1.y);
          const s2 = this.gridToScreen(pt2.x, pt2.y);
          const x1 = s1.x + cellWPx / 2;
          const y1 = s1.y + cellHPx / 2;
          const x2 = s2.x + cellWPx / 2;
          const y2 = s2.y + cellHPx / 2;

          if (Math.hypot(x2 - x1, y2 - y1) >= 22) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const isHoveredMid = (this.hoveredMidpoint && this.hoveredMidpoint.conn.id === conn.id && this.hoveredMidpoint.segmentIndex === i);

            ctx.fillStyle = colors.isDark ? '#334155' : '#e2e8f0';
            ctx.strokeStyle = colors.isDark ? '#94a3b8' : '#64748b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(midX, midY, isHoveredMid ? 6 : 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = colors.isDark ? '#f8fafc' : '#0f172a';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(midX - 2.5, midY);
            ctx.lineTo(midX + 2.5, midY);
            ctx.moveTo(midX, midY - 2.5);
            ctx.lineTo(midX, midY + 2.5);
            ctx.stroke();
          }
        }
      }
    }

    drawShapeDraft(ctx, draft, colors) {
      const sPt = this.gridToScreen(draft.x, draft.y);
      const wPx = draft.w * this.cellWidth * this.zoom;
      const hPx = draft.h * this.cellHeight * this.zoom;

      ctx.strokeStyle = colors.selectionBorder;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sPt.x, sPt.y, wPx, hPx);
      ctx.setLineDash([]);
    }

    drawConnectorDraft(ctx, draft, colors) {
      const p1 = draft.fromPoint;
      const p2 = draft.hoveredAnchor ? { x: draft.hoveredAnchor.x, y: draft.hoveredAnchor.y } : draft.currentPoint;

      const path = this.renderer.computeOrthogonalPath(p1, p2);

      ctx.strokeStyle = colors.connectorDraft;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();

      for (let i = 0; i < path.length; i++) {
        const sPt = this.gridToScreen(path[i].x, path[i].y);
        const x = sPt.x + (this.cellWidth * this.zoom) / 2;
        const y = sPt.y + (this.cellHeight * this.zoom) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw tip indicator
      if (path.length >= 2) {
        const lastPt = path[path.length - 1];
        const sLast = this.gridToScreen(lastPt.x, lastPt.y);
        const tipX = sLast.x + (this.cellWidth * this.zoom) / 2;
        const tipY = sLast.y + (this.cellHeight * this.zoom) / 2;

        ctx.fillStyle = colors.connectorDraft;
        ctx.beginPath();
        ctx.arc(tipX, tipY, draft.arrowEnd === 'none' ? 3 : 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawMarqueeBox(ctx, box, colors) {
      const minCol = Math.min(box.startCol, box.endCol);
      const minRow = Math.min(box.startRow, box.endRow);
      const maxCol = Math.max(box.startCol, box.endCol);
      const maxRow = Math.max(box.startRow, box.endRow);

      const sPt = this.gridToScreen(minCol, minRow);
      const wPx = (maxCol - minCol + 1) * this.cellWidth * this.zoom;
      const hPx = (maxRow - minRow + 1) * this.cellHeight * this.zoom;

      ctx.fillStyle = colors.selectionFill;
      ctx.strokeStyle = colors.selectionBorder;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.fillRect(sPt.x, sPt.y, wPx, hPx);
      ctx.strokeRect(sPt.x, sPt.y, wPx, hPx);
      ctx.setLineDash([]);
    }

    // ==========================================
    // Event Notification Emitters
    // ==========================================

    emitChange(isMajor = false) {
      if (this.onDiagramChange) {
        this.onDiagramChange(this.diagram, isMajor);
      }
      if (global.AsciiStorage) {
        global.AsciiStorage.autoSave(this.diagram);
      }
    }

    emitSelectionChange() {
      if (this.onSelectionChange) {
        const selectedShapes = Array.from(this.selectedShapeIds).map(id => this.findShapeById(id)).filter(Boolean);
        const selectedConns = Array.from(this.selectedConnectorIds).map(id => this.diagram.connectors.find(c => c.id === id)).filter(Boolean);
        this.onSelectionChange(selectedShapes, selectedConns);
      }
    }

    emitZoomChange() {
      const zoomDisplay = document.getElementById('zoomDisplay');
      if (zoomDisplay) {
        zoomDisplay.textContent = `${Math.round(this.zoom * 100)}%`;
      }
    }
  }

  global.AsciiCanvas = AsciiCanvas;

})(typeof window !== 'undefined' ? window : this);
