/**
 * AsciiFlow - Connectors Module
 * Connector factories, anchor bindings, hit-testing, waypoints, and segment math.
 */

(function (global) {
  'use strict';

  let nextConnId = 1;

  function generateConnectorId() {
    return `conn_${Date.now().toString(36)}_${(nextConnId++).toString(36)}`;
  }

  /**
   * Factory function to create a new connector
   */
  function createConnector(fromShapeId, toShapeId, fromAnchor = 'auto', toAnchor = 'auto', options = {}) {
    // Backward compatibility normalization for arrowEnd
    let arrowStart = options.arrowStart || 'none';
    let arrowEnd = options.arrowEnd !== undefined ? options.arrowEnd : 'triangle';
    if (arrowEnd === 'end') {
      arrowEnd = 'triangle';
    } else if (arrowEnd === 'both') {
      arrowStart = 'triangle';
      arrowEnd = 'triangle';
    }

    return {
      id: options.id || generateConnectorId(),
      type: 'connector',
      fromShapeId: fromShapeId || null,
      fromAnchor: fromAnchor || 'auto',
      toShapeId: toShapeId || null,
      toAnchor: toAnchor || 'auto',
      fromPoint: options.fromPoint ? { ...options.fromPoint } : null,
      toPoint: options.toPoint ? { ...options.toPoint } : null,
      waypoints: options.waypoints ? options.waypoints.map(p => ({ ...p })) : [],
      arrowStart: arrowStart, // 'none' | 'triangle' | 'open' | 'dot' | 'diamond' | 'bar'
      arrowEnd: arrowEnd,     // 'none' | 'triangle' | 'open' | 'dot' | 'diamond' | 'bar'
      label: options.label || '',
      style: options.style || 'solid', // 'solid' | 'dashed' | 'dotted' | 'double'
      routing: options.routing || 'orthogonal', // 'orthogonal' | 'straight'
      ...options
    };
  }

  /**
   * Check if a point (col, row) is near any segment of a connector's resolved points
   */
  function hitTestConnector(conn, points, col, row, tolerance = 1.0) {
    if (!points || points.length < 2) return false;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      const dist = distanceToSegment(col, row, p1.x, p1.y, p2.x, p2.y);
      if (dist <= tolerance) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find index of the segment closest to (col, row)
   */
  function findSegmentIndexAt(points, col, row, tolerance = 1.2) {
    if (!points || points.length < 2) return -1;

    let bestIdx = -1;
    let minDist = Infinity;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dist = distanceToSegment(col, row, p1.x, p1.y, p2.x, p2.y);
      if (dist <= tolerance && dist < minDist) {
        minDist = dist;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  /**
   * Midpoint between two points
   */
  function getSegmentMidpoint(p1, p2) {
    return {
      x: Math.round((p1.x + p2.x) / 2),
      y: Math.round((p1.y + p2.y) / 2)
    };
  }

  /**
   * Distance from point (px, py) to line segment (x1, y1)-(x2, y2)
   */
  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);

    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);

    return Math.hypot(px - projX, py - projY);
  }

  /**
   * Add a waypoint to connector
   */
  function addWaypoint(conn, col, row, insertIndex = -1) {
    conn.waypoints = conn.waypoints || [];
    const pt = { x: Math.round(col), y: Math.round(row) };
    if (insertIndex >= 0 && insertIndex <= conn.waypoints.length) {
      conn.waypoints.splice(insertIndex, 0, pt);
    } else {
      conn.waypoints.push(pt);
    }
    return conn.waypoints.length - 1;
  }

  /**
   * Move an existing waypoint
   */
  function moveWaypoint(conn, index, col, row) {
    if (conn.waypoints && conn.waypoints[index]) {
      conn.waypoints[index].x = Math.round(col);
      conn.waypoints[index].y = Math.round(row);
    }
  }

  /**
   * Remove a waypoint
   */
  function removeWaypoint(conn, index) {
    if (conn.waypoints && index >= 0 && index < conn.waypoints.length) {
      conn.waypoints.splice(index, 1);
    }
  }

  // Export to global
  global.AsciiConnectors = {
    generateConnectorId,
    createConnector,
    hitTestConnector,
    findSegmentIndexAt,
    getSegmentMidpoint,
    distanceToSegment,
    addWaypoint,
    moveWaypoint,
    removeWaypoint
  };

})(typeof window !== 'undefined' ? window : this);
