import {
    formatNumber,
    generateAngleSnapFractions,
    generateUniqueId,
    normalize,
    normalizeAngleToPi,
    normalizeAngleDegrees,
    generateDistanceSnapFactors,
    distance,
    formatFraction,
    getClosestPointOnLineSegment,
    getMousePosOnCanvas,
    snapToAngle,
    formatSnapFactor,
    simplifySquareRoot,
    formatSimplifiedRoot
} from './utils.js';

const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const colorPalette = document.getElementById('colorPalette');
const htmlOverlay = document.getElementById('html-overlay');
const mouseCoordXElement = document.getElementById('mouseCoordX');
const mouseCoordYElement = document.getElementById('mouseCoordY');
const toggleGridCheckbox = document.getElementById('toggleGridCheckbox');
const gridTypeSelect = document.getElementById('gridTypeSelect');
const gridColorPicker = document.getElementById('gridColorPicker');
const gridAlphaInput = document.getElementById('gridAlphaInput');

const POINT_RADIUS = 5;
const CENTER_POINT_VISUAL_RADIUS = POINT_RADIUS * 2;
const POINT_SELECT_RADIUS = 10;
const LINE_WIDTH = 2;
const GRID_LINEWIDTH = 1;
const DASH_PATTERN = [6, 6];
const SELECTED_INDICATOR_OFFSET = 3;
const DOUBLE_CLICK_MS = 300;
const DRAG_THRESHOLD = 3;
const EDGE_CLICK_THRESHOLD = 7;
const dpr = window.devicePixelRatio || 1;
const FROZEN_REFERENCE_COLOR = '#ffd700';

const DEFAULT_CALIBRATION_VIEW_SCALE = 80.0;
const DEFAULT_REFERENCE_DISTANCE = 1.0;
const DEFAULT_REFERENCE_ANGLE_RAD = Math.PI / 2;

let frozenReference_A_rad = null;
let frozenReference_A_baseRad = null;
let frozenReference_D_du = null;
let frozenReference_Origin_Data = null;
let currentDrawingFirstSegmentAbsoluteAngleRad = null;
let dragBoundaryContext = null;
let isMouseOverCanvas = false;

let allPoints = [];
let allEdges = [];
let selectedPointIds = [];
let selectedEdgeIds = [];
let activeCenterId = null;
let mousePos = { x: 0, y: 0 };
let currentColor = '#ffffff';
let frozenReference_D_g2g = null; // Will store { g2gSquaredSum, interval }

let viewTransform = {
    scale: DEFAULT_CALIBRATION_VIEW_SCALE,
    offsetX: 0,
    offsetY: 0
};

let isActionInProgress = false;
let isDragConfirmed = false;
let isPanningBackground = false;
let isRectangleSelecting = false;
let currentMouseButton = -1;
let actionStartPos = { x: 0, y: 0 };
let backgroundPanStartOffset = { x: 0, y: 0 };
let initialDragPointStates = [];
let rectangleSelectStartPos = { x: 0, y: 0 };
let actionContext = null;

let recentColors = ['#ffffff', '#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff', '#ffa544'];

let isDrawingMode = false;
let previewLineStartPointId = null;
let actionTargetPoint = null;
let isTransformDrag = false;
let initialCenterStateForTransform = null;
let initialStatesForTransform = [];
let initialMouseAngleToCenter = 0;
let initialMouseDistanceToCenter = 0;
let dragPreviewPoints = [];
let shiftKeyAtActionStart = false;
let currentShiftPressed = false;
let ctrlKeyAtActionStart = false;
let lastCanvasClickTime = 0;
let clipboard = { points: [], edges: [], referencePoint: null };
let clickData = { targetId: null, type: null, count: 0, timestamp: 0 };
let undoStack = [];
let redoStack = [];
let showAngles = true;
let showDistances = true;
let angleSigFigs = 4;
let distanceSigFigs = 3;
let previewAltSnapOnEdge = null;
let showGrid = false;
let gridType = 'points';
let gridColor = '#888888';
let gridAlpha = 0.5;
let ghostPointPosition = null;

let lastGridState = {
    interval1: null,
    interval2: null,
    alpha1: 0,
    alpha2: 0,
    scale: null
};

const MAX_HISTORY_SIZE = 50;

const MAX_FRACTION_DENOMINATOR_FOR_ANGLE_SNAPS = 6;
const MAX_BASE_ANGLE_MULTIPLIER_FOR_SNAPS = 2;
const ANGLE_SNAP_FRACTIONS = generateAngleSnapFractions(
    MAX_FRACTION_DENOMINATOR_FOR_ANGLE_SNAPS,
    MAX_BASE_ANGLE_MULTIPLIER_FOR_SNAPS
);

const MAX_INITIAL_METER_SNAP_MULTIPLIER = 10;
const INITIAL_DISTANCE_SNAP_FACTORS = generateAngleSnapFractions(
    MAX_FRACTION_DENOMINATOR_FOR_ANGLE_SNAPS,
    MAX_INITIAL_METER_SNAP_MULTIPLIER
);

const MAX_SNAP_DENOMINATOR = 6;
const MAX_SNAP_INTEGER = 10;





function generateSnapFactors(maxDenominator, maxInteger) {
    const fractionsSet = new Set();
    fractionsSet.add(0);
    for (let q = 1; q <= maxDenominator; q++) {
        for (let p = 1; p <= q * maxInteger; p++) {
            fractionsSet.add(p / q);
        }
    }
    return Array.from(fractionsSet).sort((a, b) => a - b);
}

const NINETY_DEG_ANGLE_SNAP_FRACTIONS = (() => {
    const uniqueFractions = new Set();
    const denominators = [1, 2, 3, 4, 5, 6];
    for (const q of denominators) {
        // Generate fractions for angles up to 360 degrees (p/q * 90 <= 360 => p/q <= 4)
        for (let p = 1; p <= q * 4; p++) {
            uniqueFractions.add(p / q);
        }
    }
    return Array.from(uniqueFractions).sort((a, b) => a - b);
})();

const SNAP_FACTORS = generateSnapFactors(MAX_SNAP_DENOMINATOR, MAX_SNAP_INTEGER);
const tempSegmentSnapFactorsForAlt = SNAP_FACTORS.filter(f => f > 0 && f <= 1);
const SEGMENT_SNAP_FRACTIONS = [...new Set([0, ...tempSegmentSnapFactorsForAlt, 1])].sort((a,b)=>a-b);

function normalizeAngle(angleRad) {
    while (angleRad < 0) angleRad += 2 * Math.PI;
    while (angleRad >= 2 * Math.PI) angleRad -= 2 * Math.PI;
    return angleRad;
}

const SORTED_SNAP_DISTANCES = [...new Set(SNAP_FACTORS.map(f => f * DEFAULT_REFERENCE_DISTANCE))].sort((a, b) => a - b);
const SORTED_SNAP_ANGLES = [...new Set(NINETY_DEG_ANGLE_SNAP_FRACTIONS.flatMap(f => {
    const offset = f * (Math.PI / 2);
    return [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].flatMap(base => [normalizeAngle(base + offset), normalizeAngle(base - offset)]);
}))].sort((a, b) => a - b);

let lastSnapResult = null;

function solveForPoint(N1, N2, d1, alpha) {
    const d_n = distance(N1, N2);
    if (d_n < 1e-6 || Math.sin(alpha) < 1e-6) return [];
    const solutions = [];
    const A = 1,
        B = -2 * d1 * Math.cos(alpha),
        C = d1 * d1 - d_n * d_n;
    const discriminant = B * B - 4 * A * C;
    if (discriminant < 0) return [];

    [(-B + Math.sqrt(discriminant)) / (2 * A), (-B - Math.sqrt(discriminant)) / (2 * A)].forEach(d2 => {
        if (d2 <= 0) return;
        const a = (d1 * d1 - d2 * d2 + d_n * d_n) / (2 * d_n);
        const h = Math.sqrt(Math.max(0, d1 * d1 - a * a));
        const x_mid = N1.x + a * (N2.x - N1.x) / d_n;
        const y_mid = N1.y + a * (N2.y - N1.y) / d_n;
        solutions.push({ x: x_mid + h * (N2.y - N1.y) / d_n, y: y_mid - h * (N2.x - N1.x) / d_n, dist: d1, angle: alpha });
        solutions.push({ x: x_mid - h * (N2.y - N1.y) / d_n, y: y_mid + h * (N2.x - N1.x) / d_n, dist: d1, angle: alpha });
    });
    return solutions;
}

const activeHtmlLabels = new Map();
let labelsToKeepThisFrame = new Set();

function calculateGridIntervals(viewTransformScale) {
    const targetScreenSpacing = 80;
    const effectiveDataInterval = targetScreenSpacing / viewTransformScale;
    
    const logInterval = Math.log10(effectiveDataInterval);
    const lowerPowerOf10 = Math.pow(10, Math.floor(logInterval));
    const higherPowerOf10 = Math.pow(10, Math.ceil(logInterval));
    
    let grid1Interval = lowerPowerOf10;
    let grid2Interval = higherPowerOf10;
    let alpha1 = 1;
    let alpha2 = 0;
    
    if (Math.abs(higherPowerOf10 - lowerPowerOf10) > lowerPowerOf10 * 0.0001) {
        const logInterpFactor = (logInterval - Math.log10(lowerPowerOf10)) / (Math.log10(higherPowerOf10) - Math.log10(lowerPowerOf10));
        
        const transitionZoneStart = 0.2;
        const transitionZoneEnd = 0.8;
        
        let interpValue = (logInterpFactor - transitionZoneStart) / (transitionZoneEnd - transitionZoneStart);
        interpValue = Math.max(0, Math.min(1, interpValue));
        interpValue = interpValue * interpValue * (3 - 2 * interpValue);
        
        alpha1 = 1 - interpValue;
        alpha2 = interpValue;
    } else {
        grid2Interval = null;
    }
    
    return { grid1Interval, grid2Interval, alpha1, alpha2 };
}

function updateHtmlLabel({ id, content, x, y, color, fontSize, options = {} }) {
    labelsToKeepThisFrame.add(id);
    let el = activeHtmlLabels.get(id);

    if (!el) {
        el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.fontFamily = 'KaTeX_Main, Times New Roman, serif';
        el.style.whiteSpace = 'nowrap';
        htmlOverlay.appendChild(el);
        activeHtmlLabels.set(id, el);
    }

    let transform = '';
    if (options.textAlign === 'center') {
        transform += ' translateX(-50%)';
    } else if (options.textAlign === 'right') {
        transform += ' translateX(-100%)';
    }

    if (options.textBaseline === 'middle') {
        transform += ' translateY(-50%)';
    } else if (options.textBaseline === 'bottom') {
        transform += ' translateY(-100%)';
    }

    el.style.transform = transform.trim();
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.style.fontSize = `${fontSize}px`;

    if (el.katexContent !== content) {
        if (typeof window.katex !== 'undefined') {
            katex.render(content, el, {
                throwOnError: false,
                displayMode: false
            });
        } else {
            el.textContent = content.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2").replace(/[\\{}]/g, "");
        }
        el.katexContent = content;
    }
}

function cleanupHtmlLabels() {
    for (const [id, el] of activeHtmlLabels.entries()) {
        if (!labelsToKeepThisFrame.has(id)) {
            el.remove();
            activeHtmlLabels.delete(id);
        }
    }
}

function getPrecedingSegment(pointId, edgesToIgnoreIds = []) {
    const currentPoint = findPointById(pointId);
    if (!currentPoint) return null;
    for (let i = allEdges.length - 1; i >= 0; i--) {
        const edge = allEdges[i];
        const edgeIdentifier = edge.id1 < edge.id2 ? edge.id1 + edge.id2 : edge.id2 + edge.id1;
        if (edgesToIgnoreIds.includes(edgeIdentifier)) continue;
        let otherPointId = null;
        if (edge.id1 === pointId) otherPointId = edge.id2;
        else if (edge.id2 === pointId) otherPointId = edge.id1;
        if (otherPointId) {
            const otherPoint = findPointById(otherPointId);
            if (otherPoint) {
                const dx = currentPoint.x - otherPoint.x; const dy = currentPoint.y - otherPoint.y;
                return { p1: otherPoint, p2: currentPoint, angleRad: Math.atan2(dy, dx), length: Math.sqrt(dx*dx + dy*dy), edgeId: edgeIdentifier };
            }
        }
    }
    return null;
}

function getDrawingContext(currentDrawStartPointId) {
    let offsetAngleRad = 0;
    let currentSegmentReferenceD = DEFAULT_REFERENCE_DISTANCE;
    // Start with the default reference angle, which will be used if no other logic overrides it.
    let currentSegmentReferenceA_for_display = DEFAULT_REFERENCE_ANGLE_RAD;
    let isFirstSegmentBeingDrawn = true;

    const p_current = findPointById(currentDrawStartPointId);
    if (!p_current) {
        return { offsetAngleRad, currentSegmentReferenceD, currentSegmentReferenceA_for_display, isFirstSegmentBeingDrawn,
                 displayAngleA_valueRad_for_A_equals_label: null, displayAngleA_originPointData_for_A_equals_label: null, frozen_A_baseRad_to_display: null };
    }

    const segment1_prev_to_current = getPrecedingSegment(p_current.id);

    if (segment1_prev_to_current) {
        isFirstSegmentBeingDrawn = false;
        offsetAngleRad = segment1_prev_to_current.angleRad;
        currentSegmentReferenceD = frozenReference_D_du !== null ? frozenReference_D_du : segment1_prev_to_current.length;
        
        // Check if an angle has been frozen from a previous step.
        if (frozenReference_A_rad !== null) {
            // If the frozen angle is effectively zero (a straight line was drawn), use the default 90 degrees.
            if (Math.abs(frozenReference_A_rad) < 0.001) {
                currentSegmentReferenceA_for_display = DEFAULT_REFERENCE_ANGLE_RAD;
            } else {
                // Otherwise, use the absolute value of the last frozen angle as the new reference.
                currentSegmentReferenceA_for_display = Math.abs(frozenReference_A_rad);
            }
        } // If no angle is frozen, the default of 90 degrees from initialization is kept.

    } else {
        // For the very first segment of a new line, always use the default 90 degrees.
        offsetAngleRad = 0;
        currentSegmentReferenceD = DEFAULT_REFERENCE_DISTANCE;
        currentSegmentReferenceA_for_display = DEFAULT_REFERENCE_ANGLE_RAD;
    }

    return {
        offsetAngleRad,
        currentSegmentReferenceD,
        currentSegmentReferenceA_for_display, // This value is now dynamic
        isFirstSegmentBeingDrawn,
        displayAngleA_valueRad_for_A_equals_label: frozenReference_A_rad,
        displayAngleA_originPointData_for_A_equals_label: frozenReference_Origin_Data,
        frozen_A_baseRad_to_display: frozenReference_A_baseRad,
        frozen_D_du_to_display: frozenReference_D_du,
        frozen_Origin_Data_to_display: frozenReference_Origin_Data
    };
}

function snapToLength(targetLength, referenceLength, snapThresholdFactor = 0.05, factors = SNAP_FACTORS, forceSnap = false) {
    if (isNaN(targetLength) || isNaN(referenceLength) || referenceLength <= 0) {
        return { length: isNaN(targetLength) ? 0 : targetLength, factor: null };
    }

    let bestLength = targetLength;
    let minDiff = Infinity;
    let bestFactor = null;
    
    for (const factor of factors) {
        const snapLength = referenceLength * factor;
        const diff = Math.abs(targetLength - snapLength);
        if (diff < minDiff) {
            minDiff = diff;
            bestLength = snapLength;
            bestFactor = factor;
        }
    }

    const snapThreshold = Math.max(referenceLength * snapThresholdFactor, 1 / viewTransform.scale, 0.00001);

    if (forceSnap) {
        return { length: bestLength, factor: bestFactor };
    }

    if (minDiff < snapThreshold) {
        return { length: bestLength, factor: bestFactor };
    }
    
    return { length: targetLength, factor: null };
}



function addToRecentColors(color) {
    const index = recentColors.indexOf(color);
    if (index > -1) recentColors.splice(index, 1);
    recentColors.unshift(color);
    if (recentColors.length > 8) recentColors = recentColors.slice(0, 8);
    updateColorPalette();
}

function updateColorPalette() {
    colorPalette.innerHTML = '';
    recentColors.forEach(color => {
        const paletteColor = document.createElement('div');
        paletteColor.className = 'palette-color';
        paletteColor.style.backgroundColor = color;
        if (color === currentColor) paletteColor.classList.add('active');
        paletteColor.addEventListener('click', () => setCurrentColor(color));
        colorPalette.appendChild(paletteColor);
    });
}

function setCurrentColor(newColor) {
    const oldColor = currentColor;
    let changedPoints = [];
    if (selectedPointIds.length > 0) {
        selectedPointIds.forEach(id => {
            const point = findPointById(id);
            if (point && point.type === 'regular') {
                changedPoints.push({id: point.id, oldColor: point.color || oldColor });
                point.color = newColor;
            }
        });
    }
    if (activeCenterId) {
        const center = findPointById(activeCenterId);
        if (center) {
            changedPoints.push({id: center.id, oldColor: center.color || oldColor });
            center.color = newColor;
        }
    }
    if (changedPoints.length > 0) {
        const actualUndoState = {
            points: allPoints.map(p => {
                const changed = changedPoints.find(cp => cp.id === p.id);
                return changed ? {...p, color: changed.oldColor } : {...p};
            }),
            edges: JSON.parse(JSON.stringify(allEdges)),
            selectedPointIds: JSON.parse(JSON.stringify(selectedPointIds)), selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)), activeCenterId, isDrawingMode, previewLineStartPointId
          };
        undoStack.push(actualUndoState);
        if (undoStack.length > MAX_HISTORY_SIZE) undoStack.shift();
        redoStack = [];
        redrawAll();
    }
    currentColor = newColor;
    colorPicker.value = newColor;
    addToRecentColors(newColor);
}

function saveStateForUndo() {
    const state = {
        points: JSON.parse(JSON.stringify(allPoints)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        selectedPointIds: JSON.parse(JSON.stringify(selectedPointIds)),
        selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartPointId: previewLineStartPointId,
        frozenReference_A_rad, frozenReference_A_baseRad, frozenReference_D_du, frozenReference_Origin_Data,
        frozenReference_D_g2g // <-- ADD THIS
    };
    undoStack.push(state);
    if (undoStack.length > MAX_HISTORY_SIZE) undoStack.shift();
    redoStack = [];
}

function restoreState(state) {
    allPoints = JSON.parse(JSON.stringify(state.points));
    allEdges = JSON.parse(JSON.stringify(state.edges));
    selectedPointIds = JSON.parse(JSON.stringify(state.selectedPointIds || []));
    selectedEdgeIds = JSON.parse(JSON.stringify(state.selectedEdgeIds || []));
    activeCenterId = state.activeCenterId !== undefined ? state.activeCenterId : null;
    isDrawingMode = state.isDrawingMode !== undefined ? state.isDrawingMode : false;
    previewLineStartPointId = state.previewLineStartPointId !== undefined ? state.previewLineStartPointId : null;
    frozenReference_A_rad = state.frozenReference_A_rad !== undefined ? state.frozenReference_A_rad : null;
    frozenReference_A_baseRad = state.frozenReference_A_baseRad !== undefined ? state.frozenReference_A_baseRad : null;
    frozenReference_D_du = state.frozenReference_D_du !== undefined ? state.frozenReference_D_du : null;
    frozenReference_Origin_Data = state.frozenReference_Origin_Data !== undefined ? state.frozenReference_Origin_Data : null;
    frozenReference_D_g2g = state.frozenReference_D_g2g !== undefined ? state.frozenReference_D_g2g : null; // <-- ADD THIS
    isActionInProgress = false; isDragConfirmed = false; isRectangleSelecting = false;
    isTransformDrag = false; isPanningBackground = false; dragPreviewPoints = [];
    actionTargetPoint = null; currentMouseButton = -1;
    clickData = { pointId: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair';
    redrawAll();
}

function handleUndo() {
    if (undoStack.length === 0) return;
    const currentStateForRedo = {
        points: JSON.parse(JSON.stringify(allPoints)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        selectedPointIds: JSON.parse(JSON.stringify(selectedPointIds)),
        selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartPointId: previewLineStartPointId,
        frozenReference_A_rad, frozenReference_A_baseRad, frozenReference_D_du, frozenReference_Origin_Data
    };
    redoStack.push(currentStateForRedo);
    if (redoStack.length > MAX_HISTORY_SIZE) redoStack.shift();
    const prevState = undoStack.pop();
    restoreState(prevState);
}

function handleRedo() {
    if (redoStack.length === 0) return;
    const currentStateForUndo = {
        points: JSON.parse(JSON.stringify(allPoints)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        selectedPointIds: JSON.parse(JSON.stringify(selectedPointIds)),
        selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartPointId: previewLineStartPointId,
        frozenReference_A_rad, frozenReference_A_baseRad, frozenReference_D_du, frozenReference_Origin_Data
    };
    undoStack.push(currentStateForUndo);
    if (undoStack.length > MAX_HISTORY_SIZE) undoStack.shift();
    const nextState = redoStack.pop();
    restoreState(nextState);
}

function screenToData(screenPos_css_pixels) {
    const screenX_physical = screenPos_css_pixels.x * dpr;
    const screenY_physical = screenPos_css_pixels.y * dpr;
    const canvasHeight_physical = canvas.height;
    return {
        x: (screenX_physical - viewTransform.offsetX) / viewTransform.scale,
        y: (canvasHeight_physical - screenY_physical - viewTransform.offsetY) / viewTransform.scale
    };
}

function dataToScreen(dataPos) {
    const canvasHeight_physical = canvas.height;
    const screenX_physical = dataPos.x * viewTransform.scale + viewTransform.offsetX;
    const screenY_physical = canvasHeight_physical - (dataPos.y * viewTransform.scale + viewTransform.offsetY);
    return {
        x: screenX_physical / dpr,
        y: screenY_physical / dpr
    };
}


function resizeCanvas() {
    const canvasContainer = document.querySelector('.canvas-container');
    const canvasWrapper = document.querySelector('.canvas-wrapper-relative');

    if (!canvasContainer || !canvasWrapper) {
        console.error("Canvas container or wrapper not found. Ensure index.html structure has '.canvas-container' and '.canvas-wrapper-relative'.");
        return;
    }

    const cW = canvasWrapper.offsetWidth;
    const cH = canvasWrapper.offsetHeight;

    canvas.width = cW * dpr;
    canvas.height = cH * dpr;
    canvas.style.width = `${cW}px`;
    canvas.style.height = `${cH}px`;

    if (htmlOverlay) {
        htmlOverlay.style.width = `${cW}px`;
        htmlOverlay.style.height = `${cH}px`;
    }
    redrawAll();
}

function findPointById(id) { return allPoints.find(p => p.id === id); }

function findClickedPoint(clickPos) {
    const dataPos = screenToData(clickPos);
    const selectRadiusDataRegular = POINT_SELECT_RADIUS / viewTransform.scale;
    const selectRadiusDataCenter = (CENTER_POINT_VISUAL_RADIUS + POINT_SELECT_RADIUS / 2) / viewTransform.scale;

    // Prioritize center points for selection
    for (let i = allPoints.length - 1; i >= 0; i--) {
        const point = allPoints[i];
        if (point.type !== 'regular' && distance(dataPos, point) < selectRadiusDataCenter) return point;
    }

    // Then check for regular points
    for (let i = allPoints.length - 1; i >= 0; i--) {
        const point = allPoints[i];
        if (point.type === 'regular' && distance(dataPos, point) < selectRadiusDataRegular) return point;
    }
    return null;
}

function findClickedEdge(clickPos) {
    const dataPos = screenToData(clickPos);
    const edgeClickThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
    
    for (let i = allEdges.length - 1; i >= 0; i--) {
        const edge = allEdges[i];
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
            const closest = getClosestPointOnLineSegment(dataPos, p1, p2);
            if (closest.distance < edgeClickThresholdData && closest.onSegmentStrict) {
                return edge;
            }
        }
    }
    return null;
}

function getEdgeId(edge) {
    const DELIMITER = '_EDGE_';
    return edge.id1 < edge.id2 ? `${edge.id1}${DELIMITER}${edge.id2}` : `${edge.id2}${DELIMITER}${edge.id1}`;
}

function findNeighbors(pointId) {
    const n = new Set();
    allEdges.forEach(e => { if (e.id1 === pointId) n.add(e.id2); else if (e.id2 === pointId) n.add(e.id1); });
    return Array.from(n);
}

function findNeighborEdges(pointId) {
    return allEdges.filter(e => e.id1 === pointId || e.id2 === pointId);
}

function findAllPointsInSubgraph(startPointId) {
    if (!findPointById(startPointId)) return [];
    const visited = new Set(); const queue = [startPointId]; const subgraphPointIds = [];
    visited.add(startPointId);
    while (queue.length > 0) {
        const currentPointId = queue.shift(); subgraphPointIds.push(currentPointId);
        findNeighbors(currentPointId).forEach(neighborId => {
            if (!visited.has(neighborId)) { visited.add(neighborId); queue.push(neighborId); }
        });
    }
    return subgraphPointIds;
}

function drawCenterSymbol(point) {
    const screenPos = dataToScreen(point); const radius = CENTER_POINT_VISUAL_RADIUS;
    ctx.strokeStyle = point.color || currentColor; ctx.setLineDash([]); ctx.lineWidth = LINE_WIDTH;
    if (point.type === 'center_rotate_scale') {
        ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, radius, 0, 2*Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x-radius,screenPos.y); ctx.lineTo(screenPos.x+radius,screenPos.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x,screenPos.y-radius); ctx.lineTo(screenPos.x,screenPos.y+radius); ctx.stroke();
    } else if (point.type === 'center_rotate_only') {
        ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, radius, 0, 2*Math.PI); ctx.stroke();
    } else if (point.type === 'center_scale_only') {
        ctx.beginPath(); ctx.moveTo(screenPos.x-radius,screenPos.y); ctx.lineTo(screenPos.x+radius,screenPos.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x,screenPos.y-radius); ctx.lineTo(screenPos.x,screenPos.y+radius); ctx.stroke();
    }
}

function applySelectionLogic(pointIdsToSelect, edgeIdsToSelect, wantsShift, wantsCtrl, targetIsCenter = false) {
    if (targetIsCenter) {
        const centerId = pointIdsToSelect[0];
        if (wantsCtrl) {
            activeCenterId = (activeCenterId === centerId) ? null : centerId;
        } else {
            activeCenterId = centerId;
            if (!wantsShift) {
                selectedPointIds = [];
                selectedEdgeIds = [];
            }
        }
    } else {
        if (wantsShift) {
            selectedPointIds = [...new Set([...selectedPointIds, ...pointIdsToSelect])];
            selectedEdgeIds = [...new Set([...selectedEdgeIds, ...edgeIdsToSelect])];
        } else if (wantsCtrl) {
            pointIdsToSelect.forEach(id => {
                const index = selectedPointIds.indexOf(id);
                if (index > -1) selectedPointIds.splice(index, 1);
                else selectedPointIds.push(id);
            });
            edgeIdsToSelect.forEach(id => {
                const index = selectedEdgeIds.indexOf(id);
                if (index > -1) selectedEdgeIds.splice(index, 1);
                else selectedEdgeIds.push(id);
            });
        } else {
            selectedPointIds = [...pointIdsToSelect];
            selectedEdgeIds = [...edgeIdsToSelect];
        }
    }
}

/**
 * Calculates the circumcenter of a triangle defined by three points.
 * The circumcenter is equidistant from all three points.
 * Returns null if the points are collinear.
 */
function getCircumcenter(p1, p2, p3) {
    const D = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(D) < 1e-9) {
        return null; // Points are collinear, no unique circumcenter
    }

    const p1_sq = p1.x * p1.x + p1.y * p1.y;
    const p2_sq = p2.x * p2.x + p2.y * p2.y;
    const p3_sq = p3.x * p3.x + p3.y * p3.y;

    const Ux = (1 / D) * (p1_sq * (p2.y - p3.y) + p2_sq * (p3.y - p1.y) + p3_sq * (p1.y - p2.y));
    const Uy = (1 / D) * (p1_sq * (p3.x - p2.x) + p2_sq * (p1.x - p3.x) + p3_sq * (p2.x - p1.x));

    return { x: Ux, y: Uy, type: 'equidistant-circumcenter' };
}

/**
 * Calculates the projection of a point 'p' onto the perpendicular bisector
 * of the segment defined by p1 and p2.
 */
function getProjectionOnPerpendicularBisector(p, p1, p2) {
    const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const p1p2_vec = { x: p2.x - p1.x, y: p2.y - p1.y };
    const perp_vec = { x: -p1p2_vec.y, y: p1p2_vec.x };
    
    const v_sq_mag = perp_vec.x * perp_vec.x + perp_vec.y * perp_vec.y;
    if (v_sq_mag < 1e-9) return null; // p1 and p2 are the same point

    const Ap_vec = { x: p.x - midPoint.x, y: p.y - midPoint.y };
    const t = (Ap_vec.x * perp_vec.x + Ap_vec.y * perp_vec.y) / v_sq_mag;
    
    return { x: midPoint.x + t * perp_vec.x, y: midPoint.y + t * perp_vec.y, type: 'equidistant-bisector' };
}

function handleCopy() {
    const pointsToCopyIds = new Set(selectedPointIds);
    if (activeCenterId) pointsToCopyIds.add(activeCenterId);
    
    if (pointsToCopyIds.size === 0 && selectedEdgeIds.length === 0) return;
    
    selectedEdgeIds.forEach(edgeId => {
        const [id1, id2] = edgeId.split('-');
        pointsToCopyIds.add(id1);
        pointsToCopyIds.add(id2);
    });
    
    clipboard.points = Array.from(pointsToCopyIds).map(id => {
        const p = findPointById(id);
        return p ? { ...p } : null;
    }).filter(p => p);
    
    clipboard.edges = [];
    selectedEdgeIds.forEach(edgeId => {
        const [id1, id2] = edgeId.split('-');
        const edge = allEdges.find(e => getEdgeId(e) === edgeId);
        if (edge) clipboard.edges.push({ ...edge });
    });
    
    allEdges.forEach(edge => {
        if (pointsToCopyIds.has(edge.id1) && pointsToCopyIds.has(edge.id2) && 
            findPointById(edge.id1)?.type === 'regular' && findPointById(edge.id2)?.type === 'regular') {
            const edgeId = getEdgeId(edge);
            if (!clipboard.edges.find(e => getEdgeId(e) === edgeId)) {
                clipboard.edges.push({ ...edge });
            }
        }
    });
    
    clipboard.referencePoint = screenToData(mousePos);
}

function handleCut() {
    const pointsToCutIds = new Set(selectedPointIds);
    if (activeCenterId) pointsToCutIds.add(activeCenterId);
    
    if (pointsToCutIds.size === 0 && selectedEdgeIds.length === 0) return;
    
    saveStateForUndo();
    handleCopy();
    deleteSelectedItems();
}

function handlePaste() {
    if (clipboard.points.length === 0 || !clipboard.referencePoint) return;
    saveStateForUndo();
    const pastePosData = screenToData(mousePos);
    const deltaX = pastePosData.x - clipboard.referencePoint.x; const deltaY = pastePosData.y - clipboard.referencePoint.y;
    const oldToNewIdMap = new Map(); const newPastedRegularPointIds = []; let newPastedActiveCenterId = null;
    performEscapeAction();
    clipboard.points.forEach(cbPoint => {
        const newId = generateUniqueId();
        const newPoint = { ...cbPoint, id: newId, x: cbPoint.x + deltaX, y: cbPoint.y + deltaY };
        allPoints.push(newPoint); oldToNewIdMap.set(cbPoint.id, newId);
        if (newPoint.type === 'regular') newPastedRegularPointIds.push(newId);
        else newPastedActiveCenterId = newId;
    });
    clipboard.edges.forEach(cbEdge => {
        const newP1Id = oldToNewIdMap.get(cbEdge.id1); const newP2Id = oldToNewIdMap.get(cbEdge.id2);
        if (newP1Id && newP2Id) allEdges.push({ id1: newP1Id, id2: newP2Id });
    });
    selectedPointIds = newPastedRegularPointIds; 
    selectedEdgeIds = clipboard.edges.map(e => getEdgeId({id1: oldToNewIdMap.get(e.id1), id2: oldToNewIdMap.get(e.id2)}));
    activeCenterId = newPastedActiveCenterId;
    redrawAll();
}

function drawPoint(point) {
    const isSelected = selectedPointIds.includes(point.id) || point.id === activeCenterId;
    const pointColor = point.color || currentColor;
    const screenPos = dataToScreen(point);
    if (point.type !== 'regular') drawCenterSymbol(point);
    else {
        ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = pointColor; ctx.fill();
    }
    if (isSelected) {
        ctx.save();
        ctx.shadowColor = '#4da6ff';
        ctx.shadowBlur = 15;
        ctx.globalAlpha = 0.8;
        
        ctx.beginPath();
        const glowRadius = point.type !== 'regular' ? CENTER_POINT_VISUAL_RADIUS + 3 : POINT_RADIUS + 3;
        ctx.arc(screenPos.x, screenPos.y, glowRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#4da6ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }
}

function drawAllEdges() {
    ctx.lineWidth = LINE_WIDTH;
    allEdges.forEach(edge => {
        const p1_orig = findPointById(edge.id1);
        const p2_orig = findPointById(edge.id2);
        if (!p1_orig || !p2_orig || p1_orig.type !== 'regular' || p2_orig.type !== 'regular') return;

        let p1_render = { ...p1_orig };
        let p2_render = { ...p2_orig };
        let isBeingDragged = false;

        if (isDragConfirmed && dragPreviewPoints.length > 0) {
            const p1Preview = dragPreviewPoints.find(dp => dp.id === p1_orig.id);
            const p2Preview = dragPreviewPoints.find(dp => dp.id === p2_orig.id);
            if (p1Preview) { p1_render.x = p1Preview.x; p1_render.y = p1Preview.y; }
            if (p2Preview) { p2_render.x = p2Preview.x; p2_render.y = p2Preview.y; }
            if (p1Preview || p2Preview) isBeingDragged = true;
        }

        const p1Screen = dataToScreen(p1_render);
        const p2Screen = dataToScreen(p2_render);
        const edgeId = getEdgeId(edge);
        const isSelected = selectedEdgeIds.includes(edgeId);
        
        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);

        const color1 = p1_orig.color || currentColor;
        const color2 = p2_orig.color || currentColor;
        if (color1 === color2) {
            ctx.strokeStyle = color1;
        } else {
            const gradient = ctx.createLinearGradient(p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y);
            gradient.addColorStop(0, color1);
            gradient.addColorStop(1, color2);
            ctx.strokeStyle = gradient;
        }
        
        ctx.setLineDash(isBeingDragged ? DASH_PATTERN : []);
        ctx.lineWidth = LINE_WIDTH;
        ctx.stroke();
        ctx.setLineDash([]);
        
        if (isSelected) {
            ctx.beginPath();
            ctx.moveTo(p1Screen.x, p1Screen.y);
            ctx.lineTo(p2Screen.x, p2Screen.y);
            ctx.strokeStyle = '#4da6ff';
            ctx.globalAlpha = 0.8;
            ctx.lineWidth = LINE_WIDTH + 4;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    });
    ctx.setLineDash([]);
    ctx.strokeStyle = 'white';
}

function deleteSelectedItems() {
    if (selectedPointIds.length === 0 && selectedEdgeIds.length === 0 && !activeCenterId) return;
    
    saveStateForUndo();
    
    selectedEdgeIds.forEach(edgeId => {
        const [id1, id2] = edgeId.split('-');
        allEdges = allEdges.filter(edge => getEdgeId(edge) !== edgeId);
    });
    
    selectedPointIds.forEach(pointId => {
        const neighborEdges = findNeighborEdges(pointId);
        
        if (neighborEdges.length === 2) {
            const edge1 = neighborEdges[0];
            const edge2 = neighborEdges[1];
            
            const otherPoint1 = edge1.id1 === pointId ? edge1.id2 : edge1.id1;
            const otherPoint2 = edge2.id1 === pointId ? edge2.id2 : edge2.id1;
            
            if (otherPoint1 !== otherPoint2) {
                allEdges.push({ id1: otherPoint1, id2: otherPoint2 });
            }
        }
        
        allEdges = allEdges.filter(edge => edge.id1 !== pointId && edge.id2 !== pointId);
    });
    
    const idsToDelete = new Set(selectedPointIds);
    if (activeCenterId) idsToDelete.add(activeCenterId);
    
    allPoints = allPoints.filter(point => !idsToDelete.has(point.id));
    
    selectedPointIds = [];
    selectedEdgeIds = [];
    activeCenterId = null;
    
    if (previewLineStartPointId && !findPointById(previewLineStartPointId)) {
        isDrawingMode = false;
        previewLineStartPointId = null;
        frozenReference_A_rad = null;
        frozenReference_A_baseRad = null;
        frozenReference_D_du = null;
        frozenReference_Origin_Data = null;
    }
    
    redrawAll();
}

function performEscapeAction() {
    selectedPointIds = [];
    selectedEdgeIds = [];
    activeCenterId = null;
    isDrawingMode = false;
    previewLineStartPointId = null;
    frozenReference_A_rad = null;
    frozenReference_A_baseRad = null;
    frozenReference_D_du = null;
    frozenReference_D_g2g = null; // <-- ADD THIS
    frozenReference_Origin_Data = null;
    currentDrawingFirstSegmentAbsoluteAngleRad = null;
    isActionInProgress = false;
    isDragConfirmed = false;
    isRectangleSelecting = false;
    isTransformDrag = false;
    isPanningBackground = false;
    dragPreviewPoints = [];
    actionTargetPoint = null;
    currentMouseButton = -1;
    clickData = { pointId: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair';
    redrawAll();
}

function drawAngleArc(centerScreen, dataStartAngleRad, dataEndAngleRad, radius, color, isDashed = false) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(isDashed ? [3, 3] : []);
    const canvasStartAngle = -dataStartAngleRad;
    const canvasEndAngle = -dataEndAngleRad;
    let signedAngleDiffData = normalizeAngleToPi(dataEndAngleRad - dataStartAngleRad);
    ctx.beginPath();
    ctx.arc(centerScreen.x, centerScreen.y, radius, canvasStartAngle, canvasEndAngle, signedAngleDiffData > 0);
    ctx.stroke();
    ctx.restore();
}


function drawReferenceElementsGeometry(context, shiftPressed) {
    if (!shiftPressed || (!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display) return;
    
    const refElementColor = 'rgba(240, 240, 130, 0.9)'; // Matches currentElementColor for consistency
    const frozenOriginScreen = dataToScreen(context.frozen_Origin_Data_to_display);
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = refElementColor;

    // The Delta reference line was removed in a previous step.
    // This block is for the Angle reference geometry.
    if (showAngles && context.displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(context.displayAngleA_valueRad_for_A_equals_label) > 0.0001) {
        const arcRadius_A_screen = 35;
        const startAngleForA_arc_dataRad = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        const endAngleForA_arc_dataRad = startAngleForA_arc_dataRad + context.displayAngleA_valueRad_for_A_equals_label;
        
        // This is the dotted line along the last lineup up to the radius of the circle
        const baseLineEndData_A = { 
            x: context.frozen_Origin_Data_to_display.x + Math.cos(startAngleForA_arc_dataRad) * (arcRadius_A_screen / viewTransform.scale), 
            y: context.frozen_Origin_Data_to_display.y + Math.sin(startAngleForA_arc_dataRad) * (arcRadius_A_screen / viewTransform.scale) 
        };
        const baseLineEndScreen_A = dataToScreen(baseLineEndData_A);
        
        ctx.beginPath(); ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y); ctx.lineTo(baseLineEndScreen_A.x, baseLineEndScreen_A.y);
        ctx.setLineDash([1, 3]); // Dotted line pattern
        ctx.stroke();
        
        // REMOVED: The line that previously extended along the newly formed segment.
        // This was the "long dashed yellow line" that you wanted removed.

        // Draw the angle arc itself
        drawAngleArc(frozenOriginScreen, startAngleForA_arc_dataRad, endAngleForA_arc_dataRad, arcRadius_A_screen, refElementColor, true);
    }
    ctx.restore();
}

function zoomAt(zoomCenterScreen_css_pixels, scaleFactor) {
    const mouseX_physical = zoomCenterScreen_css_pixels.x * dpr;
    const mouseY_physical = zoomCenterScreen_css_pixels.y * dpr;
    const canvasHeight_physical = canvas.height;
    const dataX_at_mouse = (mouseX_physical - viewTransform.offsetX) / viewTransform.scale;
    const dataY_at_mouse = (canvasHeight_physical - mouseY_physical - viewTransform.offsetY) / viewTransform.scale;
    const oldScale = viewTransform.scale;
    viewTransform.scale *= scaleFactor;
    viewTransform.scale = Math.max(0.01, Math.min(viewTransform.scale, 20000));
    if (Math.abs(viewTransform.scale - oldScale) < 1e-9) {
        return;
    }
    viewTransform.offsetX = mouseX_physical - dataX_at_mouse * viewTransform.scale;
    viewTransform.offsetY = canvasHeight_physical - dataY_at_mouse * viewTransform.scale - mouseY_physical;
}

function getSnappedPosition(startPoint, mouseScreenPos, shiftPressed) {
    const mouseDataPos = screenToData(mouseScreenPos);
    const drawingContext = getDrawingContext(startPoint.id); // Get context once at the top

    // 1. HIGHEST PRIORITY: Snap to existing user-drawn geometry (Points & Edges).
    const snapRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;
    for (const p of allPoints) {
        if (p.id !== startPoint.id && p.type === "regular" && distance(mouseDataPos, p) < snapRadiusData) {
            const finalAngleRad = Math.atan2(p.y - startPoint.y, p.x - startPoint.x) || 0;
            return { x: p.x, y: p.y, angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, p), snapped: true, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null, angleTurn: normalizeAngleToPi(finalAngleRad - drawingContext.offsetAngleRad), gridToGridSquaredSum: null, gridInterval: null };
        }
    }
    const segmentSnapThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
    for (const edge of allEdges) {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === "regular" && p2.type === "regular" && p1.id !== startPoint.id && p2.id !== startPoint.id) {
            const closest = getClosestPointOnLineSegment(mouseDataPos, p1, p2);
            if (closest.distance < segmentSnapThresholdData && closest.onSegmentStrict) {
                const finalAngleRad = Math.atan2(closest.y - startPoint.y, closest.x - startPoint.x) || 0;
                return { x: closest.x, y: closest.y, angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, closest), snapped: true, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null, angleTurn: normalizeAngleToPi(finalAngleRad - drawingContext.offsetAngleRad), gridToGridSquaredSum: null, gridInterval: null };
            }
        }
    }

    // 2. SHIFT-KEY SNAPPING LOGIC
    if (isDrawingMode && shiftPressed && lastGridState.interval1) {
        const allCandidates = [];
        const NUM_CANDIDATES_EACH_SIDE = 2;
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

        const baseGridX = Math.floor(mouseDataPos.x / gridInterval) * gridInterval;
        const baseGridY = Math.floor(mouseDataPos.y / gridInterval) * gridInterval;
        const gridCandidates = [ { x: baseGridX, y: baseGridY }, { x: baseGridX + gridInterval, y: baseGridY }, { x: baseGridX, y: baseGridY + gridInterval }, { x: baseGridX + gridInterval, y: baseGridY + gridInterval }];
        gridCandidates.forEach(p => allCandidates.push({ ...p, isGridPoint: true }));

        const rawAngle = normalizeAngleToPi(Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x));
        const rawDist = distance(startPoint, mouseDataPos);
        const referenceAngleForSnapping = drawingContext.currentSegmentReferenceA_for_display;
        const baseUnitDistance = drawingContext.currentSegmentReferenceD;

        const allSnapAngles = NINETY_DEG_ANGLE_SNAP_FRACTIONS.map(f => ({ factor: f, angle: normalizeAngleToPi(drawingContext.offsetAngleRad + (f * referenceAngleForSnapping)), turn: normalizeAngleToPi(f * referenceAngleForSnapping) }));
        const allSnapDistances = [];
        for (let i = 1; i <= 100; i++) {
            const factor = i * 0.5;
            allSnapDistances.push({ factor: factor, dist: factor * baseUnitDistance });
        }
        
        if (allSnapAngles.length > 0 && allSnapDistances.length > 0) {
            const closestAngleIndex = allSnapAngles.reduce((bestI, current, i) => Math.abs(normalizeAngleToPi(current.angle - rawAngle)) < Math.abs(normalizeAngleToPi(allSnapAngles[bestI].angle - rawAngle)) ? i : bestI, 0);
            const closestDistIndex = allSnapDistances.reduce((bestI, current, i) => Math.abs(current.dist - rawDist) < Math.abs(allSnapDistances[bestI].dist - rawDist) ? i : bestI, 0);
            const candidateAngles = [];
            for (let i = -NUM_CANDIDATES_EACH_SIDE; i <= NUM_CANDIDATES_EACH_SIDE; i++) {
                const index = (closestAngleIndex + i + allSnapAngles.length) % allSnapAngles.length;
                candidateAngles.push(allSnapAngles[index]);
            }
            const candidateDistances = [];
            for (let i = -NUM_CANDIDATES_EACH_SIDE; i <= NUM_CANDIDATES_EACH_SIDE; i++) {
                const index = closestDistIndex + i;
                if (index >= 0 && index < allSnapDistances.length) { candidateDistances.push(allSnapDistances[index]); }
            }
            candidateAngles.forEach(angleData => {
                candidateDistances.forEach(distData => {
                    allCandidates.push({ x: startPoint.x + distData.dist * Math.cos(angleData.angle), y: startPoint.y + distData.dist * Math.sin(angleData.angle), isGridPoint: false, lengthSnapFactor: distData.factor, angleSnapFactor: angleData.factor, angleTurn: angleData.turn });
                });
            });
        }
        
        const bestSnapPoint = allCandidates.reduce((best, current) => {
            return distance(mouseDataPos, current) < distance(mouseDataPos, best) ? current : best;
        });
        
        let gridToGridSquaredSum = null;
        let finalGridInterval = null;
        const epsilon = gridInterval * 1e-6;
        const endIsOnGridX = Math.abs(bestSnapPoint.x / gridInterval - Math.round(bestSnapPoint.x / gridInterval)) < epsilon;
        const endIsOnGridY = Math.abs(bestSnapPoint.y / gridInterval - Math.round(bestSnapPoint.y / gridInterval)) < epsilon;

        if (endIsOnGridX && endIsOnGridY) {
            const startIsOnGridX = Math.abs(startPoint.x / gridInterval - Math.round(startPoint.x / gridInterval)) < epsilon;
            const startIsOnGridY = Math.abs(startPoint.y / gridInterval - Math.round(startPoint.y / gridInterval)) < epsilon;
            if (startIsOnGridX && startIsOnGridY) {
                const correctedEndX = Math.round(bestSnapPoint.x / gridInterval) * gridInterval;
                const correctedEndY = Math.round(bestSnapPoint.y / gridInterval) * gridInterval;
                const deltaX = correctedEndX - startPoint.x;
                const deltaY = correctedEndY - startPoint.y;
                const dx_grid = Math.round(deltaX / gridInterval);
                const dy_grid = Math.round(deltaY / gridInterval);
                gridToGridSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;
                finalGridInterval = gridInterval;
            }
        }
        
        const finalAngle = Math.atan2(bestSnapPoint.y - startPoint.y, bestSnapPoint.x - startPoint.x);
        return {
            x: bestSnapPoint.x, y: bestSnapPoint.y,
            angle: finalAngle * (180 / Math.PI),
            distance: distance(startPoint, bestSnapPoint),
            snapped: true,
            gridSnapped: bestSnapPoint.isGridPoint,
            lengthSnapFactor: bestSnapPoint.lengthSnapFactor,
            angleSnapFactor: bestSnapPoint.angleSnapFactor,
            angleTurn: bestSnapPoint.isGridPoint ? normalizeAngleToPi(finalAngle - drawingContext.offsetAngleRad) : bestSnapPoint.angleTurn,
            gridToGridSquaredSum: gridToGridSquaredSum,
            gridInterval: finalGridInterval,
        };
    }

    // 3. DEFAULT: No snapping if shift is not held
    const finalAngleRad = Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x) || 0;
    return {
        x: mouseDataPos.x, y: mouseDataPos.y,
        angle: finalAngleRad * (180 / Math.PI),
        distance: distance(startPoint, mouseDataPos),
        snapped: false, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null,
        angleTurn: normalizeAngleToPi(finalAngleRad - drawingContext.offsetAngleRad),
        gridToGridSquaredSum: null, gridInterval: null
    };
}

function prepareReferenceElementsTexts(context, shiftPressed) {
    if (!shiftPressed || (!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display) return;
    
    const refElementColor = 'rgba(240, 240, 130, 1)';
    const katexFontSize = 11;
    const frozenOriginScreen = dataToScreen(context.frozen_Origin_Data_to_display);

    if (showDistances && context.frozen_D_du_to_display !== null && context.frozen_D_du_to_display > 0.0001) {
        let dDisplayText;
        
        // **NEW**: Check for exact grid-to-grid reference distance
        if (frozenReference_D_g2g) {
            const { g2gSquaredSum, interval } = frozenReference_D_g2g;
            const [coeff, radicand] = simplifySquareRoot(g2gSquaredSum);
            const finalCoeff = interval * coeff;
            dDisplayText = `\\delta = ${formatSimplifiedRoot(finalCoeff, radicand)}`;
        } else {
            // Fallback for non-exact distances
            const platonicValue = context.frozen_D_du_to_display / DEFAULT_REFERENCE_DISTANCE;
            dDisplayText = `\\delta = ${formatNumber(platonicValue, distanceSigFigs)}`;
        }

        let actualAngleOfFrozenSegment = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        if (context.displayAngleA_valueRad_for_A_equals_label !== null) {
            actualAngleOfFrozenSegment += context.displayAngleA_valueRad_for_A_equals_label;
        }
        const frozenSegmentTipX = context.frozen_Origin_Data_to_display.x + context.frozen_D_du_to_display * Math.cos(actualAngleOfFrozenSegment);
        const frozenSegmentTipY = context.frozen_Origin_Data_to_display.y + context.frozen_D_du_to_display * Math.sin(actualAngleOfFrozenSegment);
        const frozenSegmentTipScreen = dataToScreen({x: frozenSegmentTipX, y: frozenSegmentTipY});
        
        const midX_screen = (frozenOriginScreen.x + frozenSegmentTipScreen.x) / 2;
        const midY_screen = (frozenOriginScreen.y + frozenSegmentTipScreen.y) / 2;
        const lineCanvasAngle = Math.atan2(frozenSegmentTipScreen.y - frozenOriginScreen.y, frozenSegmentTipScreen.x - frozenOriginScreen.x);
        const perpendicularOffset = 18; 
        let textPerpAngle_D = lineCanvasAngle - Math.PI / 2; 
        let rotationForReadability = 0;
        if (lineCanvasAngle > Math.PI / 2 || lineCanvasAngle < -Math.PI / 2) { 
             rotationForReadability = Math.PI;
        }
        if (rotationForReadability !== 0) {
            textPerpAngle_D += Math.PI; 
        }
        const textDistLabelX_D = midX_screen + Math.cos(textPerpAngle_D) * perpendicularOffset;
        const textDistLabelY_D = midY_screen + Math.sin(textPerpAngle_D) * perpendicularOffset;

        updateHtmlLabel({ 
            id: 'ref-dist', 
            content: dDisplayText, 
            x: textDistLabelX_D, 
            y: textDistLabelY_D, 
            color: refElementColor, 
            fontSize: katexFontSize, 
            options: { textAlign: 'center', textBaseline: 'middle' } 
        });
    }

    if (showAngles && context.displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(context.displayAngleA_valueRad_for_A_equals_label) > 0.0001) {
        const arcRadius_A_screen = 35;
        const startAngleForA_arc_dataRad = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        const bisectorCanvasAngle = -startAngleForA_arc_dataRad - (context.displayAngleA_valueRad_for_A_equals_label / 2);
        
        const angleLabelOffsetDistance = arcRadius_A_screen + 15; 
        const textAngleLabelX_A = frozenOriginScreen.x + Math.cos(bisectorCanvasAngle) * angleLabelOffsetDistance;
        const textAngleLabelY_A = frozenOriginScreen.y + Math.sin(bisectorCanvasAngle) * angleLabelOffsetDistance; 
        const aValueDeg = context.displayAngleA_valueRad_for_A_equals_label * (180 / Math.PI);
        const aKatexText = `\\theta = ${formatNumber(aValueDeg, angleSigFigs)}^{\\circ}`;

        updateHtmlLabel({ 
            id: 'ref-angle', 
            content: aKatexText, 
            x: textAngleLabelX_A, 
            y: textAngleLabelY_A, 
            color: refElementColor, 
            fontSize: katexFontSize, 
            options: { textAlign: 'center', textBaseline: 'middle' } 
        });
    }
}


function prepareSnapInfoTexts(startPointData, targetDataPos, snappedOutput, shiftPressed, drawingContext) {
    const epsilon = 1e-6; 
    if (!showAngles && !showDistances || snappedOutput.distance < epsilon) return;

    const startScreen = dataToScreen(startPointData);
    const { angle: snappedAbsoluteAngleDeg, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn, gridToGridSquaredSum, gridInterval } = snappedOutput;
    const { offsetAngleRad, isFirstSegmentBeingDrawn, currentSegmentReferenceA_for_display, currentSegmentReferenceD } = drawingContext;
    const currentElementColor = shiftPressed ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';
    const katexFontSize = 12;

    if (showDistances) {
        let distanceText = '';
        const isReferenceAngleDefault = Math.abs(currentSegmentReferenceA_for_display - (Math.PI / 2)) < 0.001;

        if (shiftPressed && gridToGridSquaredSum > 0 && gridInterval) {
            const currentExactDistance = gridInterval * Math.sqrt(gridToGridSquaredSum);
            if (currentSegmentReferenceD !== null && Math.abs(currentExactDistance - currentSegmentReferenceD) < epsilon) {
                distanceText = '\\delta';
            } else {
                const [coeff, radicand] = simplifySquareRoot(gridToGridSquaredSum);
                const finalCoeff = gridInterval * coeff;
                distanceText = formatSimplifiedRoot(finalCoeff, radicand);
            }
        } else if (shiftPressed && lengthSnapFactor !== null && Math.abs(lengthSnapFactor) > epsilon) {
            if (!isReferenceAngleDefault) {
                distanceText = formatSnapFactor(lengthSnapFactor, 'D');
            } else {
                distanceText = formatNumber(snappedDistanceData, distanceSigFigs);
            }
        } else {
            distanceText = formatNumber(snappedDistanceData, distanceSigFigs);
        }

        if (distanceText) {
            const midX = (startScreen.x + dataToScreen(targetDataPos).x) / 2;
            const midY = (startScreen.y + dataToScreen(targetDataPos).y) / 2;
            const visualLineAngleScreen = Math.atan2(dataToScreen(targetDataPos).y - startScreen.y, dataToScreen(targetDataPos).x - startScreen.x);
            const textPerpAngle = visualLineAngleScreen - Math.PI / 2;
            const distanceTextX = midX + Math.cos(textPerpAngle) * 18;
            const distanceTextY = midY + Math.sin(textPerpAngle) * 18;
            updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } });
        }
    }

    if (showAngles && Math.abs(angleTurn) > epsilon) {
        const currentLineAbsoluteAngle = Math.atan2(targetDataPos.y - startPointData.y, targetDataPos.x - startPointData.x);
        const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad;
        
        drawAngleArc(startScreen, baseAngleForArc, currentLineAbsoluteAngle, 30, currentElementColor);

        if (!isFirstSegmentBeingDrawn) {
            ctx.save();
            ctx.beginPath();
            const refLineEndData = { x: startPointData.x + (35 / viewTransform.scale) * Math.cos(baseAngleForArc), y: startPointData.y + (35 / viewTransform.scale) * Math.sin(baseAngleForArc) };
            const refLineEndScreen = dataToScreen(refLineEndData);
            ctx.moveTo(startScreen.x, startScreen.y);
            ctx.lineTo(refLineEndScreen.x, refLineEndScreen.y);
            ctx.strokeStyle = 'rgba(180, 180, 180, 0.6)';
            ctx.setLineDash([2, 3]);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        let angleText = '';
        const canReferToTheta = !isFirstSegmentBeingDrawn && frozenReference_A_rad !== null && Math.abs(frozenReference_A_rad) > epsilon;

        if (shiftPressed && canReferToTheta) {
            const referenceAngleRad = Math.abs(currentSegmentReferenceA_for_display);
            let potentialFactor = null;

            if (typeof angleSnapFactor === 'number') {
                potentialFactor = angleSnapFactor;
            } else if (angleTurn !== null) {
                if (Math.abs(referenceAngleRad) > epsilon) {
                    const calculatedFactor = angleTurn / referenceAngleRad;
                    for (const frac of NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
                        if (Math.abs(Math.abs(calculatedFactor) - frac) < 0.001) {
                            potentialFactor = calculatedFactor < 0 ? -frac : frac;
                            break;
                        }
                    }
                }
            }
            if (potentialFactor !== null && Math.abs(potentialFactor) > epsilon) {
                angleText = formatSnapFactor(potentialFactor, 'A');
            } else {
                let degrees = (angleTurn === null) ? 0 : angleTurn * (180 / Math.PI);
                if (Math.abs(degrees) > epsilon) {
                    if (degrees > 180.001) degrees -= 360;
                    angleText = `${formatNumber(degrees, angleSigFigs)}^{\\circ}`;
                }
            }
        } else {
            let angleToFormatDeg = isFirstSegmentBeingDrawn ? normalizeAngleDegrees(snappedAbsoluteAngleDeg) : angleTurn * (180 / Math.PI);
            if (Math.abs(angleToFormatDeg) > epsilon) {
                if (angleToFormatDeg > 180.001 && !isFirstSegmentBeingDrawn) {
                    angleToFormatDeg -= 360;
                }
                angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
            }
        }

        if (angleText) {
            const canvasStartAngle = -baseAngleForArc;
            const canvasEndAngle = -currentLineAbsoluteAngle;
            const sumCos = Math.cos(canvasStartAngle) + Math.cos(canvasEndAngle);
            const sumSin = Math.sin(canvasStartAngle) + Math.sin(canvasEndAngle);
            let bisectorCanvasAngle = Math.atan2(sumSin, sumCos);
            const labelDistance = 60;
            const angleTextX = startScreen.x + Math.cos(bisectorCanvasAngle) * labelDistance;
            const angleTextY = startScreen.y + Math.sin(bisectorCanvasAngle) * labelDistance;
            updateHtmlLabel({ id: 'snap-angle', content: angleText, x: angleTextX, y: angleTextY, color: currentElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } });
        }
    }
}

canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const mouseScreen = getMousePosOnCanvas(event, canvas);
    const scaleFactor = event.deltaY > 0 ? 1/1.15 : 1.15;
    zoomAt(mouseScreen, scaleFactor);
    redrawAll();
});


function getDragSnapPosition(dragOrigin, mouseDataPos) {
    const neighbors = findNeighbors(dragOrigin.id).map(id => allPoints.find(p => p.id === id)).filter(Boolean);
    let gridCandidates = [];
    let geometricCandidates = [];
    let bisectorCandidates = [];
    let circumcenterCandidates = [];

    const distanceSq = (p1, p2) => {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return dx * dx + dy * dy;
    };

    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
    if (gridInterval > 0) {
        gridCandidates.push({
            x: Math.round(mouseDataPos.x / gridInterval) * gridInterval,
            y: Math.round(mouseDataPos.y / gridInterval) * gridInterval
        });
    }

    const MAJOR_SNAP_ANGLES_RAD = [Math.PI / 3, Math.PI / 2, 2 * Math.PI / 3, Math.PI];
    const MAJOR_SNAP_DISTANCE_FACTORS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const MAJOR_SORTED_SNAP_DISTANCES = MAJOR_SNAP_DISTANCE_FACTORS.map(f => f * DEFAULT_REFERENCE_DISTANCE);
    for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
            const N1 = neighbors[i];
            const N2 = neighbors[j];
            for (const d1 of MAJOR_SORTED_SNAP_DISTANCES) {
                for (const alpha of MAJOR_SNAP_ANGLES_RAD) {
                    const solutions = solveForPoint(N1, N2, d1, alpha);
                    solutions.forEach(sol => {
                        sol.dist = d1;
                        sol.angle = alpha;
                    });
                    geometricCandidates.push(...solutions);
                }
            }
        }
    }

    for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
            const projection = getProjectionOnPerpendicularBisector(mouseDataPos, neighbors[i], neighbors[j]);
            if (projection) {
                bisectorCandidates.push(projection);
            }
        }
    }

    if (neighbors.length >= 3) {
        for (let i = 0; i < neighbors.length; i++) {
            for (let j = i + 1; j < neighbors.length; j++) {
                for (let k = j + 1; k < neighbors.length; k++) {
                    const circumcenter = getCircumcenter(neighbors[i], neighbors[j], neighbors[k]);
                    if (circumcenter) {
                        circumcenterCandidates.push(circumcenter);
                    }
                }
            }
        }
    }

    const PRIORITY_RADIUS_PX = 12;
    const priorityRadiusDataSq = Math.pow(PRIORITY_RADIUS_PX / viewTransform.scale, 2);
    let bestCandidate;

    let prioritizedSnaps = [];
    for (const center of circumcenterCandidates) {
        if (distanceSq(mouseDataPos, center) < priorityRadiusDataSq) {
            prioritizedSnaps.push(center);
        }
    }

    if (prioritizedSnaps.length > 0) {
        bestCandidate = prioritizedSnaps[0];
        let minDistanceSquared = distanceSq(mouseDataPos, bestCandidate);
        for (let i = 1; i < prioritizedSnaps.length; i++) {
            const currentDistSquared = distanceSq(mouseDataPos, prioritizedSnaps[i]);
            if (currentDistSquared < minDistanceSquared) {
                minDistanceSquared = currentDistSquared;
                bestCandidate = prioritizedSnaps[i];
            }
        }
    } else {
        const allCandidates = [
            ...gridCandidates,
            ...geometricCandidates,
            ...bisectorCandidates,
            ...circumcenterCandidates
        ];

        if (allCandidates.length === 0) {
            return { point: mouseDataPos, snapped: false };
        }

        bestCandidate = allCandidates[0];
        let minDistanceSquared = distanceSq(mouseDataPos, bestCandidate);
        for (let i = 1; i < allCandidates.length; i++) {
            const currentDistSquared = distanceSq(mouseDataPos, allCandidates[i]);
            if (currentDistSquared < minDistanceSquared) {
                minDistanceSquared = currentDistSquared;
                bestCandidate = allCandidates[i];
            }
        }
    }

    const constraints = {
        dist: bestCandidate.dist || null,
        angle: bestCandidate.angle || null
    };

    return { point: bestCandidate, snapped: true, constraints };
}

function drawDragFeedback(targetPointId, currentPointStates, isSnapping = false, excludedEdgeId = null) {
    const feedbackColor = isSnapping ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';
    const katexFontSize = 12;
    const ARC_RADIUS_SCREEN = 30;
    const LABEL_OFFSET_DIST_SCREEN = 18;

    const livePoints = new Map(currentPointStates.map(p => [p.id, { ...p }]));
    const getLivePoint = (id) => livePoints.get(id);

    const vertex = getLivePoint(targetPointId);
    if (!vertex) return;

    const neighbors = findNeighbors(vertex.id).map(getLivePoint).filter(Boolean);
    if (neighbors.length === 0) return;

    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    const isPointOnGrid = (point, interval) => {
        if (!interval || interval <= 0) return false;
        const epsilon = interval * 1e-6;
        const isOnGridX = Math.abs(point.x / interval - Math.round(point.x / interval)) < epsilon;
        const isOnGridY = Math.abs(point.y / interval - Math.round(point.y / interval)) < epsilon;
        return isOnGridX && isOnGridY;
    };

    const vertexScreen = dataToScreen(vertex);

    neighbors.forEach(neighbor => {
        const dist = distance(vertex, neighbor);
        if (dist < 1e-6) return;

        const currentEdgeId = getEdgeId({ id1: vertex.id, id2: neighbor.id });

        if (currentEdgeId !== excludedEdgeId) {
            let distText;
            const areBothPointsOnGrid = gridInterval && isPointOnGrid(vertex, gridInterval) && isPointOnGrid(neighbor, gridInterval);
            if (areBothPointsOnGrid) {
                const deltaX = vertex.x - neighbor.x;
                const deltaY = vertex.y - neighbor.y;
                const dx_grid = Math.round(deltaX / gridInterval);
                const dy_grid = Math.round(deltaY / gridInterval);
                const g2gSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;
                if (g2gSquaredSum === 0) {
                    distText = '0';
                } else {
                    const [coeff, radicand] = simplifySquareRoot(g2gSquaredSum);
                    const finalCoeff = gridInterval * coeff;
                    distText = formatSimplifiedRoot(finalCoeff, radicand);
                }
            } else {
                distText = formatNumber(dist, distanceSigFigs);
            }
            const neighborScreen = dataToScreen(neighbor);
            const midX = (vertexScreen.x + neighborScreen.x) / 2;
            const midY = (vertexScreen.y + neighborScreen.y) / 2;
            const edgeAngleScreen = Math.atan2(neighborScreen.y - vertexScreen.y, neighborScreen.x - vertexScreen.x);
            const textPerpAngle = edgeAngleScreen - Math.PI / 2;
            const distanceTextX = midX + Math.cos(textPerpAngle) * LABEL_OFFSET_DIST_SCREEN;
            const distanceTextY = midY + Math.sin(textPerpAngle) * LABEL_OFFSET_DIST_SCREEN;
            const labelId = `drag-dist-${vertex.id}-${neighbor.id}`;
            updateHtmlLabel({
                id: labelId,
                content: distText,
                x: distanceTextX,
                y: distanceTextY,
                color: feedbackColor,
                fontSize: katexFontSize,
                options: { textAlign: 'center', textBaseline: 'middle' }
            });
        }
    });

    if (neighbors.length >= 2) {
        const sortedNeighbors = [...neighbors].sort((a, b) => {
            const angleA = Math.atan2(a.y - vertex.y, a.x - vertex.x);
            const angleB = Math.atan2(b.y - vertex.y, b.x - vertex.x);
            return angleA - angleB;
        });

        for (let i = 0; i < sortedNeighbors.length; i++) {
            const p1 = sortedNeighbors[i];
            const p2 = sortedNeighbors[(i + 1) % sortedNeighbors.length];
            const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
            const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
            const angle1_data = Math.atan2(v1.y, v1.x);
            const angle2_data = Math.atan2(v2.y, v2.x);
            let angleToDisplayRad = angle2_data - angle1_data;
            if (angleToDisplayRad < 0) {
                angleToDisplayRad += 2 * Math.PI;
            }
            if (angleToDisplayRad < 1e-6) continue;
            const LABEL_RADIUS_SCREEN = 75;
            const bisectorAngle = angle1_data + (angleToDisplayRad / 2);
            ctx.save();
            ctx.strokeStyle = feedbackColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(vertexScreen.x, vertexScreen.y, ARC_RADIUS_SCREEN, -angle1_data, -angle2_data, false);
            ctx.stroke();
            ctx.restore();
            const labelRadiusData = LABEL_RADIUS_SCREEN / viewTransform.scale;
            const angleLabelDataPos = {
                x: vertex.x + labelRadiusData * Math.cos(bisectorAngle),
                y: vertex.y + labelRadiusData * Math.sin(bisectorAngle)
            };
            const angleLabelScreenPos = dataToScreen(angleLabelDataPos);
            const angleText = `${formatNumber(angleToDisplayRad * (180 / Math.PI), angleSigFigs)}^{\\circ}`;
            const labelId = `drag-angle-${vertex.id}-${p1.id}-${p2.id}`;
            updateHtmlLabel({
                id: labelId,
                content: angleText,
                x: angleLabelScreenPos.x,
                y: angleLabelScreenPos.y,
                color: feedbackColor,
                fontSize: katexFontSize,
                options: { textAlign: 'center', textBaseline: 'middle' }
            });
        }
    }
}

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);
    const { grid1Interval, grid2Interval, alpha1, alpha2 } = calculateGridIntervals(viewTransform.scale);
    lastGridState = { interval1: grid1Interval, interval2: grid2Interval, alpha1, alpha2, scale: viewTransform.scale };
    if (showGrid) {
        const r = parseInt(gridColor.slice(1, 3), 16);
        const g = parseInt(gridColor.slice(3, 5), 16);
        const b = parseInt(gridColor.slice(5, 7), 16);
        const drawGridLayer = (interval, alpha) => {
            if (!interval || alpha <= 0.001) return;
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${gridAlpha * alpha})`;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${gridAlpha * alpha})`;
            const topLeftData = screenToData({ x: 0, y: 0 });
            const bottomRightData = screenToData({ x: actualCanvasWidth, y: actualCanvasHeight });
            const startGridX = Math.floor(topLeftData.x / interval) * interval;
            const endGridX = Math.ceil(bottomRightData.x / interval) * interval;
            const startGridY = Math.floor(bottomRightData.y / interval) * interval;
            const endGridY = Math.ceil(topLeftData.y / interval) * interval;
            if (gridType === 'lines') {
                ctx.beginPath();
                ctx.lineWidth = GRID_LINEWIDTH;
                for (let x_data = startGridX; x_data <= endGridX; x_data += interval) {
                    const screenX = dataToScreen({ x: x_data, y: 0 }).x;
                    ctx.moveTo(screenX, 0);
                    ctx.lineTo(screenX, actualCanvasHeight);
                }
                for (let y_data = startGridY; y_data <= endGridY; y_data += interval) {
                    const screenY = dataToScreen({ x: 0, y: y_data }).y;
                    ctx.moveTo(0, screenY);
                    ctx.lineTo(actualCanvasWidth, screenY);
                }
                ctx.stroke();
            } else if (gridType === 'points') {
                for (let x_data = startGridX; x_data <= endGridX; x_data += interval) {
                    for (let y_data = startGridY; y_data <= endGridY; y_data += interval) {
                        const screenPos = dataToScreen({ x: x_data, y: y_data });
                        ctx.beginPath();
                        ctx.arc(screenPos.x, screenPos.y, 1, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
            }
        };
        drawGridLayer(grid1Interval, alpha1);
        drawGridLayer(grid2Interval, alpha2);
    }
    if (isDrawingMode && currentShiftPressed) {
        const drawingContext = getDrawingContext(previewLineStartPointId);
        if (drawingContext && drawingContext.frozen_Origin_Data_to_display) {
            drawReferenceElementsGeometry(drawingContext, true);
            prepareReferenceElementsTexts(drawingContext, true);
        }
    }
    drawAllEdges();
    allPoints.forEach(point => {
        let pointToDraw = { ...point };
        if (isDragConfirmed && dragPreviewPoints.length > 0) {
            const preview = dragPreviewPoints.find(dp => dp.id === point.id);
            if (preview) {
                pointToDraw.x = preview.x;
                pointToDraw.y = preview.y;
            }
        }
        drawPoint(pointToDraw);
    });

    if (isDragConfirmed) {
        const hybridPointStates = allPoints.map(p => {
            const draggedVersion = dragPreviewPoints.find(dp => dp.id === p.id);
            return draggedVersion || p;
        });
        if (actionContext.targetPoint) {
            drawDragFeedback(actionContext.targetPoint.id, hybridPointStates, currentShiftPressed);
        } else if (actionContext.targetEdge) {
            const draggedEdgeId = getEdgeId(actionContext.targetEdge);
            drawDragFeedback(actionContext.targetEdge.id1, hybridPointStates, false);
            drawDragFeedback(actionContext.targetEdge.id2, hybridPointStates, false, draggedEdgeId);
        }
    } else {
        if (selectedPointIds.length === 1 && selectedEdgeIds.length === 0) {
            drawDragFeedback(selectedPointIds[0], allPoints, false);
        } else if (selectedEdgeIds.length === 1 && selectedPointIds.length <= 2) {
            const selectedEdgeId = selectedEdgeIds[0];
            const edge = allEdges.find(e => getEdgeId(e) === selectedEdgeId);
            if (edge) {
                drawDragFeedback(edge.id1, allPoints, false);
                drawDragFeedback(edge.id2, allPoints, false, selectedEdgeId);
            }
        }
    }

    if (ghostPointPosition) {
        const screenPos = dataToScreen(ghostPointPosition);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(240, 240, 130, 0.9)';
        ctx.fill();
    }
    if (isDrawingMode && previewLineStartPointId && !isActionInProgress) {
        const startPoint = findPointById(previewLineStartPointId);
        if (startPoint) {
            const drawingContext = getDrawingContext(startPoint.id);
            const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed);
            const targetPosData = { x: snappedData.x, y: snappedData.y };
            const startScreen = dataToScreen(startPoint);
            const targetScreen = dataToScreen(targetPosData);
            ctx.beginPath();
            ctx.moveTo(startScreen.x, startScreen.y);
            ctx.lineTo(targetScreen.x, targetScreen.y);
            ctx.setLineDash(DASH_PATTERN);
            ctx.strokeStyle = currentShiftPressed ? 'rgba(240, 240, 130, 0.9)' : currentColor;
            ctx.lineWidth = LINE_WIDTH;
            ctx.stroke();
            ctx.setLineDash([]);
            if (snappedData.gridSnapped) {
                ctx.beginPath();
                ctx.arc(targetScreen.x, targetScreen.y, POINT_RADIUS, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(240, 240, 130, 0.9)';
                ctx.fill();
            }
            prepareSnapInfoTexts(startPoint, targetPosData, snappedData, currentShiftPressed, drawingContext);
        }
    }
    if (isRectangleSelecting && isDragConfirmed) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash(DASH_PATTERN);
        const rX = Math.min(rectangleSelectStartPos.x, mousePos.x);
        const rY = Math.min(rectangleSelectStartPos.y, mousePos.y);
        const rW = Math.abs(rectangleSelectStartPos.x - mousePos.x);
        const rH = Math.abs(rectangleSelectStartPos.y - mousePos.y);
        ctx.strokeRect(rX, rY, rW, rH);
        ctx.setLineDash([]);
    }
    cleanupHtmlLabels();
}


toggleGridCheckbox.addEventListener('change', (e) => {
    showGrid = e.target.checked;
    redrawAll();
});

gridTypeSelect.addEventListener('change', (e) => {
    gridType = e.target.value;
    redrawAll();
});

gridColorPicker.addEventListener('input', (e) => {
    gridColor = e.target.value;
    redrawAll();
});

gridAlphaInput.addEventListener('input', (e) => {
    gridAlpha = parseFloat(e.target.value) || 0;
    redrawAll();
});

canvas.addEventListener('mousedown', (event) => {
    isActionInProgress = true;
    isDragConfirmed = false;
    isPanningBackground = false;
    isRectangleSelecting = false;
    initialDragPointStates = [];
    dragPreviewPoints = [];
    currentMouseButton = event.button;
    actionStartPos = getMousePosOnCanvas(event, canvas);
    mousePos = actionStartPos;

    const targetPoint = findClickedPoint(actionStartPos);
    const targetEdge = targetPoint ? null : findClickedEdge(actionStartPos);

    actionContext = {
        targetPoint,
        targetEdge,
        target: targetPoint || targetEdge || 'canvas',
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey || event.metaKey,
    };

    if (event.altKey) {
        if (targetPoint && targetPoint.type === 'regular') {
            saveStateForUndo();
            performEscapeAction();
            isDrawingMode = true;
            previewLineStartPointId = targetPoint.id;
            isActionInProgress = false; // This is a one-shot action
            redrawAll();
            return;
        } else if (targetEdge) {
            saveStateForUndo();
            performEscapeAction();
            const p1 = findPointById(targetEdge.id1);
            const p2 = findPointById(targetEdge.id2);
            const closest = getClosestPointOnLineSegment(screenToData(actionStartPos), p1, p2);
            const newPoint = { id: generateUniqueId(), x: closest.x, y: closest.y, type: 'regular', color: currentColor };
            allPoints.push(newPoint);
            allEdges = allEdges.filter(e => getEdgeId(e) !== getEdgeId(targetEdge));
            allEdges.push({ id1: p1.id, id2: newPoint.id });
            allEdges.push({ id1: newPoint.id, id2: p2.id });
            isDrawingMode = true;
            previewLineStartPointId = newPoint.id;
            isActionInProgress = false;
            redrawAll();
            return;
        }
    }
});

canvas.addEventListener('mousemove', (event) => {
    mousePos = getMousePosOnCanvas(event, canvas);
    currentShiftPressed = event.shiftKey;
    lastSnapResult = null;
    ghostPointPosition = null;
    if (!isActionInProgress && currentShiftPressed && !isDrawingMode) {
        const gridData = calculateGridIntervals(viewTransform.scale);
        const mouseDataPos = screenToData(mousePos);
        let bestGridSnap = { dist: Infinity, pos: null };
        const checkGrid = (interval, alpha) => {
            if (!interval || alpha < 0.01) return;
            const snapX = Math.round(mouseDataPos.x / interval) * interval;
            const snapY = Math.round(mouseDataPos.y / interval) * interval;
            const distToGridPoint = distance(mouseDataPos, { x: snapX, y: snapY });
            if (distToGridPoint < bestGridSnap.dist) {
                bestGridSnap.dist = distToGridPoint;
                bestGridSnap.pos = { x: snapX, y: snapY };
            }
        };
        checkGrid(gridData.grid1Interval, gridData.alpha1);
        checkGrid(gridData.grid2Interval, gridData.alpha2);
        ghostPointPosition = bestGridSnap.pos;
    }
    if (!isActionInProgress) {
        redrawAll();
        return;
    }
    if (!isDragConfirmed && distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
        isDragConfirmed = true;
        if (currentMouseButton === 2) {
            isRectangleSelecting = true;
            redrawAll();
            return;
        }
        const { target, shiftKey, ctrlKey } = actionContext;
        if (target !== 'canvas') {
            actionTargetPoint = actionContext.targetPoint;
            if (actionTargetPoint && !selectedPointIds.includes(actionTargetPoint.id)) {
                applySelectionLogic([actionTargetPoint.id], [], shiftKey, ctrlKey, false);
            } else if (actionContext.targetEdge && !selectedEdgeIds.includes(getEdgeId(actionContext.targetEdge))) {
                applySelectionLogic([], [getEdgeId(actionContext.targetEdge)], shiftKey, ctrlKey, false);
            }
            const dragGroupIds = new Set(selectedPointIds);
            selectedEdgeIds.forEach(eid => {
                const parts = eid.split('_EDGE_');
                if (parts[0]) dragGroupIds.add(parts[0]);
                if (parts[1]) dragGroupIds.add(parts[1]);
            });
            if (dragGroupIds.size > 0) {
                const pointsToDrag = Array.from(dragGroupIds).map(id => findPointById(id)).filter(Boolean);
                if (pointsToDrag.length > 0) {
                    initialDragPointStates = pointsToDrag.map(p => ({ ...p }));
                    dragPreviewPoints = pointsToDrag.map(p => ({ ...p }));
                    canvas.style.cursor = 'grabbing';
                }
            }
        } else {
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
            canvas.style.cursor = 'move';
        }
    }
    if (isDragConfirmed) {
        if (isPanningBackground) {
            const deltaX_css = mousePos.x - actionStartPos.x;
            const deltaY_css = mousePos.y - actionStartPos.y;
            viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
            viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
        } else if (isRectangleSelecting) {} else if (dragPreviewPoints.length > 0) {
            const mouseData = screenToData(mousePos);
            const startMouseData = screenToData(actionStartPos);
            let finalDelta = {
                x: mouseData.x - startMouseData.x,
                y: mouseData.y - startMouseData.y
            };
            if (currentShiftPressed && actionTargetPoint) {
                const dragOrigin = initialDragPointStates.find(p => p.id === actionTargetPoint.id);
                const targetSnapPos = { x: dragOrigin.x + finalDelta.x, y: dragOrigin.y + finalDelta.y };
                const snapResult = getDragSnapPosition(dragOrigin, targetSnapPos);
                if (snapResult.snapped) {
                    finalDelta = { x: snapResult.point.x - dragOrigin.x, y: snapResult.point.y - dragOrigin.y };
                }
                lastSnapResult = snapResult;
            }
            initialDragPointStates.forEach(originalPointState => {
                const previewPointToUpdate = dragPreviewPoints.find(dp => dp.id === originalPointState.id);
                if (previewPointToUpdate) {
                    previewPointToUpdate.x = originalPointState.x + finalDelta.x;
                    previewPointToUpdate.y = originalPointState.y + finalDelta.y;
                }
            });
        }
    }
    redrawAll();
});

canvas.addEventListener('mouseup', (event) => {
    if (!isActionInProgress) return;

    if (isDragConfirmed) {
        if (isRectangleSelecting) {
            const dataP1 = screenToData({ x: Math.min(actionStartPos.x, mousePos.x), y: Math.min(actionStartPos.y, mousePos.y) });
            const dataP2 = screenToData({ x: Math.max(actionStartPos.x, mousePos.x), y: Math.max(actionStartPos.y, mousePos.y) });
            const minX = Math.min(dataP1.x, dataP2.x),
                maxX = Math.max(dataP1.x, dataP2.x);
            const minY = Math.min(dataP1.y, dataP2.y),
                maxY = Math.max(dataP1.y, dataP2.y);
            const pointsInRect = allPoints.filter(p => p.type === 'regular' && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY).map(p => p.id);
            const edgesInRect = allEdges.filter(edge => pointsInRect.includes(edge.id1) && pointsInRect.includes(edge.id2)).map(edge => getEdgeId(edge));
            applySelectionLogic(pointsInRect, edgesInRect, actionContext.shiftKey, actionContext.ctrlKey, false);
        } else if (dragPreviewPoints.length > 0) {
            saveStateForUndo();
            dragPreviewPoints.forEach(dp => {
                const actualPoint = findPointById(dp.id);
                if (actualPoint) {
                    actualPoint.x = dp.x;
                    actualPoint.y = dp.y;
                }
            });
            if (lastSnapResult && lastSnapResult.snapped && lastSnapResult.constraints) {
                frozenReference_D_du = lastSnapResult.constraints.dist;
                frozenReference_A_rad = lastSnapResult.constraints.angle;
                frozenReference_Origin_Data = initialDragPointStates.find(p => p.id === actionTargetPoint.id);
                frozenReference_A_baseRad = null;
            }
        }
    } else {
        if (currentMouseButton === 2) {
            performEscapeAction();
        } else if (currentMouseButton === 0) {
            const { targetPoint, targetEdge, shiftKey, ctrlKey } = actionContext;
            const startPoint = findPointById(previewLineStartPointId);
            const drawingContextForCompletedSegment = getDrawingContext(startPoint ? startPoint.id : null);

            if (isDrawingMode && startPoint) {
                saveStateForUndo();
                let newPoint = null;
                let snappedDataForCompletedSegment = null;

                if (targetPoint && targetPoint.type === 'regular' && targetPoint.id !== startPoint.id) {
                    const edgeExists = allEdges.some(e => (e.id1 === startPoint.id && e.id2 === targetPoint.id) || (e.id2 === startPoint.id && e.id1 === targetPoint.id));
                    if (!edgeExists) {
                        allEdges.push({ id1: startPoint.id, id2: targetPoint.id });
                    }
                    newPoint = targetPoint;
                    snappedDataForCompletedSegment = getSnappedPosition(startPoint, dataToScreen(newPoint), shiftKey);
                } else if (targetEdge) {
                    const p1 = findPointById(targetEdge.id1);
                    const p2 = findPointById(targetEdge.id2);
                    if (p1 && p2) {
                        const closest = getClosestPointOnLineSegment(screenToData(mousePos), p1, p2);
                        newPoint = { id: generateUniqueId(), x: closest.x, y: closest.y, type: 'regular', color: currentColor };
                        allPoints.push(newPoint);
                        allEdges = allEdges.filter(e => getEdgeId(e) !== getEdgeId(targetEdge));
                        allEdges.push({ id1: p1.id, id2: newPoint.id });
                        allEdges.push({ id1: p2.id, id2: newPoint.id });
                        allEdges.push({ id1: startPoint.id, id2: newPoint.id });
                        snappedDataForCompletedSegment = getSnappedPosition(startPoint, dataToScreen(newPoint), shiftKey);
                    }
                } else {
                    snappedDataForCompletedSegment = getSnappedPosition(startPoint, mousePos, shiftKey);
                    newPoint = { id: generateUniqueId(), x: snappedDataForCompletedSegment.x, y: snappedDataForCompletedSegment.y, type: 'regular', color: currentColor };
                    allPoints.push(newPoint);
                    allEdges.push({ id1: startPoint.id, id2: newPoint.id });
                }

                if (shiftKey && newPoint && snappedDataForCompletedSegment) {
                    frozenReference_Origin_Data = startPoint;

                    frozenReference_D_du = snappedDataForCompletedSegment.distance;
                    if (snappedDataForCompletedSegment.gridToGridSquaredSum > 0) {
                        frozenReference_D_g2g = {
                            g2gSquaredSum: snappedDataForCompletedSegment.gridToGridSquaredSum,
                            interval: snappedDataForCompletedSegment.gridInterval
                        };
                    } else {
                        frozenReference_D_g2g = null;
                    }

                    if (drawingContextForCompletedSegment.isFirstSegmentBeingDrawn) {
                        frozenReference_A_rad = normalizeAngleToPi(snappedDataForCompletedSegment.angle * (Math.PI / 180));
                        frozenReference_A_baseRad = 0;
                    } else {
                        frozenReference_A_rad = snappedDataForCompletedSegment.angleTurn;
                        frozenReference_A_baseRad = drawingContextForCompletedSegment.offsetAngleRad;
                    }
                } else {
                    frozenReference_D_du = null;
                    frozenReference_D_g2g = null;
                    frozenReference_A_rad = null;
                    frozenReference_A_baseRad = null;
                    frozenReference_Origin_Data = null;
                }

                if (newPoint) {
                    previewLineStartPointId = newPoint.id;
                } else {
                    isDrawingMode = false;
                    previewLineStartPointId = null;
                }
                clickData.count = 0;

            } else {
                const now = Date.now();
                const target = targetPoint || targetEdge;

                if (target) {
                    const targetId = targetPoint ? targetPoint.id : getEdgeId(targetEdge);
                    const targetType = targetPoint ? 'point' : 'edge';

                    if (clickData.targetId === targetId && (now - clickData.timestamp) < DOUBLE_CLICK_MS) {
                        clickData.count++;
                    } else {
                        clickData.count = 1;
                        clickData.targetId = targetId;
                        clickData.type = targetType;
                    }
                    clickData.timestamp = now;

                    switch (clickData.count) {
                        case 1:
                            if (targetPoint) { applySelectionLogic([targetPoint.id], [], shiftKey, ctrlKey, targetPoint.type !== 'regular'); } else { applySelectionLogic([], [getEdgeId(targetEdge)], shiftKey, ctrlKey, false); }
                            break;
                        case 2:
                            if (clickData.type === 'point') {
                                const neighbors = findNeighbors(clickData.targetId);
                                applySelectionLogic([clickData.targetId, ...neighbors], [], false, false);
                            } else {
                                const edge = allEdges.find(e => getEdgeId(e) === clickData.targetId);
                                if (edge) {
                                    const edges = new Set([...findNeighborEdges(edge.id1), ...findNeighborEdges(edge.id2)]);
                                    applySelectionLogic([], Array.from(edges).map(e => getEdgeId(e)), false, false);
                                }
                            }
                            break;
                        case 3:
                            if (clickData.type === 'point') {
                                const pointsInSubgraph = findAllPointsInSubgraph(clickData.targetId);
                                applySelectionLogic(pointsInSubgraph, [], false, false);
                            } else {
                                const edge = allEdges.find(e => getEdgeId(e) === clickData.targetId);
                                if (edge) {
                                    const pointsInSubgraph = new Set(findAllPointsInSubgraph(edge.id1));
                                    const edgesInSubgraph = allEdges.filter(e => pointsInSubgraph.has(e.id1) && pointsInSubgraph.has(e.id2));
                                    applySelectionLogic([], edgesInSubgraph.map(e => getEdgeId(e)), false, false);
                                }
                            }
                            clickData.count = 0;
                            break;
                    }
                } else {
                    clickData.count = 0;
                    saveStateForUndo();
                    performEscapeAction();
                    const startCoords = ghostPointPosition ? ghostPointPosition : screenToData(mousePos);
                    const newPoint = { id: generateUniqueId(), ...startCoords, type: 'regular', color: currentColor };
                    allPoints.push(newPoint);
                    isDrawingMode = true;
                    previewLineStartPointId = newPoint.id;
                    frozenReference_D_du = null;
                    frozenReference_D_g2g = null; // Clear exact reference too
                    frozenReference_A_rad = null;
                    frozenReference_A_baseRad = null;
                    frozenReference_Origin_Data = null;
                }
            }
        }
    }

    isActionInProgress = false;
    isDragConfirmed = false;
    isPanningBackground = false;
    isRectangleSelecting = false;
    actionContext = null;
    actionTargetPoint = null;
    dragBoundaryContext = null;
    canvas.style.cursor = 'crosshair';
    redrawAll();
});


canvas.addEventListener('mouseenter', () => {
    isMouseOverCanvas = true;
});

canvas.addEventListener('mouseleave', () => {
    isMouseOverCanvas = false;
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    if (event.key === 'Shift') {
        currentShiftPressed = true;
        if (isDrawingMode && previewLineStartPointId) redrawAll();
    }
    
    const allowedDuringAction = ['Shift', 'Control', 'Meta', 'Alt', 'Escape', 'Delete', 'Backspace'];
    // Prevent shortcuts from firing if an action is in progress, unless it's a zoom action over the canvas.
    if (isActionInProgress && !allowedDuringAction.includes(event.key) && !(isCtrlOrCmd && ['c','x','v','z','y','a','=','-'].includes(event.key.toLowerCase()))) return;

    // --- ZOOM LOGIC ---
    // If the mouse is over the canvas, prevent default browser zoom and zoom the canvas instead.
    if (isMouseOverCanvas && isCtrlOrCmd && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        const centerScreen = { x: (canvas.width/dpr)/2, y: (canvas.height/dpr)/2 };
        zoomAt(centerScreen, 1.15);
        redrawAll();
        return; // Stop further execution
    }
    if (isMouseOverCanvas && isCtrlOrCmd && event.key === '-') {
        event.preventDefault();
        const centerScreen = { x: (canvas.width/dpr)/2, y: (canvas.height/dpr)/2 };
        zoomAt(centerScreen, 1/1.15);
        redrawAll();
        return; // Stop further execution
    }
    // If the mouse is NOT over the canvas, the above conditions fail, no preventDefault() is called,
    // and the browser performs its default page zoom.

    // --- OTHER SHORTCUTS ---
    if (event.key === 'Escape') {
        performEscapeAction();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteSelectedItems();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        handleCopy();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        handleCut();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        handlePaste();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
    } else if (isCtrlOrCmd && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        event.preventDefault();
        handleRedo();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectedPointIds = allPoints.filter(p => p.type === 'regular').map(p => p.id);
        selectedEdgeIds = allEdges.map(edge => getEdgeId(edge));
        if (!activeCenterId && allPoints.some(p => p.type !== 'regular')) {
            activeCenterId = allPoints.find(p => p.type !== 'regular').id;
        }
        isDrawingMode = false;
        previewLineStartPointId = null;
        frozenReference_A_rad = null;
        frozenReference_A_baseRad = null;
        frozenReference_D_du = null;
        frozenReference_Origin_Data = null;
        redrawAll();
    } else if (['c', 'r', 's'].includes(event.key.toLowerCase()) && !isCtrlOrCmd && !isActionInProgress) {
        event.preventDefault();
        saveStateForUndo();
        performEscapeAction();
        
        let type;
        if (event.key.toLowerCase() === 'c') type = 'center_rotate_scale';
        else if (event.key.toLowerCase() === 'r') type = 'center_rotate_only';
        else if (event.key.toLowerCase() === 's') type = 'center_scale_only';
        
        const mouseDataPos = screenToData(mousePos);
        const newCenter = { id: generateUniqueId(), x: mouseDataPos.x, y: mouseDataPos.y, type: type, color: currentColor };
        allPoints.push(newCenter);
        activeCenterId = newCenter.id;
        redrawAll();
    }
});

window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
        currentShiftPressed = false;
        const needsRedraw = ghostPointPosition || (isDrawingMode && previewLineStartPointId) || (isActionInProgress && isDragConfirmed);
        ghostPointPosition = null;
        if (needsRedraw) {
            redrawAll();
        }
    }
});

document.getElementById('showAnglesCheckbox').addEventListener('change', (e) => { showAngles = e.target.checked; redrawAll(); });
document.getElementById('showDistancesCheckbox').addEventListener('change', (e) => { showDistances = e.target.checked; redrawAll(); });
document.getElementById('angleSigFigs').addEventListener('change', (e) => { angleSigFigs = parseInt(e.target.value) || 2; redrawAll(); });
document.getElementById('distanceSigFigs').addEventListener('change', (e) => { distanceSigFigs = parseInt(e.target.value) || 2; redrawAll(); });
window.addEventListener('resize', resizeCanvas);


window.addEventListener('load', () => {
    if (typeof window.katex === 'undefined') {
        console.error("KaTeX library failed to load or initialize. Math rendering will be broken.");
    }

    // Force the UI to match the desired initial state from the script.
    showGrid = true;
    toggleGridCheckbox.checked = showGrid;

    // --- START: ADD THIS LINE ---
    // Read the selected grid type from the HTML dropdown into the script's variable.
    gridType = gridTypeSelect.value;
    // --- END: ADD THIS LINE ---

    resizeCanvas();
    updateColorPalette();
    setCurrentColor(currentColor);
    saveStateForUndo();
    redrawAll();
});