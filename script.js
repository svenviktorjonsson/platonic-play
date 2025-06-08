import {
    formatNumber,
    generateAngleSnapFractions,
    generateUniqueId,
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
    const epsilon = 1e-6; // Use a small tolerance for zero checks
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
        
        drawAngleArc(startScreen, baseAngleForArc, currentLineAbsoluteAngle, 30, 'rgba(230, 230, 100, 0.8)');

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

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);

    // --- THIS IS THE FIX ---
    // The grid state calculation is now OUTSIDE the if-statement.
    // It will run on every frame, ensuring the snapping logic always has fresh data.
    const { grid1Interval, grid2Interval, alpha1, alpha2 } = calculateGridIntervals(viewTransform.scale);
    lastGridState = { interval1: grid1Interval, interval2: grid2Interval, alpha1, alpha2, scale: viewTransform.scale };

    // The if-statement now ONLY protects the visual drawing of the grid.
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

    // (The rest of your redrawAll function remains the same...)
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

    if (isDragConfirmed && actionTargetPoint) {
        if(typeof drawDragFeedback === 'function') {
           drawDragFeedback(actionTargetPoint.id, dragPreviewPoints);
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

canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const mouseScreen = getMousePosOnCanvas(event, canvas);
    const scaleFactor = event.deltaY > 0 ? 1/1.15 : 1.15;
    zoomAt(mouseScreen, scaleFactor);
    redrawAll();
});

function drawDragFeedback(targetPointId, currentDragStates) {
    const feedbackColor = currentShiftPressed ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';
    const katexFontSize = 12;
    const ARC_RADIUS = 30;
    const LABEL_RADIUS = ARC_RADIUS + 20;

    // Create a live map of all points for this frame to guarantee no stale data is used.
    const livePoints = new Map(allPoints.map(p => [p.id, { ...p }]));
    currentDragStates.forEach(p => livePoints.set(p.id, { ...p }));
    const getLivePoint = (id) => livePoints.get(id);

    /**
     * Draws an interior and a reflex angle between two edges at a vertex,
     * using the new, user-specified positioning rule.
     */
    const drawAnglePairAtVertex = (vertex, p1, p2, id) => {
        // 1. GET NORMALIZED VECTORS from the vertex to the arm points.
        const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
        const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        if (mag1 < 1e-9 || mag2 < 1e-9) return;
        const u1 = { x: v1.x / mag1, y: v1.y / mag1 };
        const u2 = { x: v2.x / mag2, y: v2.y / mag2 };

        // 2. CALCULATE THE BISECTOR DIRECTION VECTOR (always points into the interior angle).
        let bisectorDir = { x: u1.x + u2.x, y: u1.y + u2.y };
        const magB = Math.sqrt(bisectorDir.x * bisectorDir.x + bisectorDir.y * bisectorDir.y);
        if (magB < 1e-9) { // Handle 180-degree case
            bisectorDir = { x: -u1.y, y: u1.x };
        } else {
            bisectorDir.x /= magB;
            bisectorDir.y /= magB;
        }

        // 3. CALCULATE THE INTERIOR ANGLE VALUE using the dot product.
        const dot = u1.x * u2.x + u1.y * u2.y;
        const interiorAngle_rad = Math.acos(Math.max(-1, Math.min(1, dot)));
        
        // 4. DEFINE THE TWO ANGLES to draw (interior and reflex).
        const angles = [
            { value: interiorAngle_rad, isReflex: false },
            { value: 2 * Math.PI - interiorAngle_rad, isReflex: true }
        ];

        // 5. DRAW EACH ANGLE AND ITS LABEL using the new rule.
        angles.forEach(angle => {
            if (angle.value < 0.001 || angle.value > 2 * Math.PI - 0.001) return;

            // A. APPLY THE POSITIONING RULE
            // If angle > 180 (isReflex), use subtraction. Otherwise, use addition.
            const sign = angle.isReflex ? -1 : 1;
            const labelX = dataToScreen(vertex).x + sign * bisectorDir.x * LABEL_RADIUS;
            const labelY = dataToScreen(vertex).y + sign * bisectorDir.y * LABEL_RADIUS;

            // B. Draw the Arc
            const cross_z = v1.x * v2.y - v1.y * v2.x;
            const interiorSweepIsCCW = cross_z > 0;
            const canvasSweepFlag = angle.isReflex ? !interiorSweepIsCCW : interiorSweepIsCCW;
            const startAngle_canvas = -Math.atan2(v1.y, v1.x);
            const endAngle_canvas = -Math.atan2(v2.y, v2.x);
            ctx.beginPath();
            ctx.arc(dataToScreen(vertex).x, dataToScreen(vertex).y, ARC_RADIUS, startAngle_canvas, endAngle_canvas, canvasSweepFlag);
            ctx.strokeStyle = feedbackColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.stroke();

            // C. Render the Label
            const angleValueDeg = angle.value * (180 / Math.PI);
            const angleText = `${formatNumber(angleValueDeg, angleSigFigs)}^{\\circ}`;
            const labelId = `drag-angle-${id}-${angle.isReflex ? 'reflex' : 'interior'}`;
            updateHtmlLabel({
                id: labelId, content: angleText, x: labelX, y: labelY, color: feedbackColor, fontSize: katexFontSize,
                options: { textAlign: 'center', textBaseline: 'middle' }
            });
        });
    };

    const targetPoint = getLivePoint(targetPointId);
    if (!targetPoint) return;

    // Per your request, we ONLY draw the angles around the point being dragged.
    // All neighbor logic is temporarily removed.
    const targetNeighbors = findNeighbors(targetPoint.id).map(getLivePoint).filter(Boolean);

    if (targetNeighbors.length >= 2) {
        // Sort neighbors by angle to process them in CCW order.
        const sorted = [...targetNeighbors].sort((a, b) => Math.atan2(a.y - targetPoint.y, a.x - targetPoint.x) - Math.atan2(b.y - targetPoint.y, b.x - targetPoint.x));
        
        // Form angles between adjacent neighbors and draw them.
        for (let i = 0; i < sorted.length; i++) {
            const p1 = sorted[i];
            const p2 = sorted[(i + 1) % sorted.length];
            
            // For each pair of edges, draw the interior and reflex angle using the new logic.
            drawAnglePairAtVertex(targetPoint, p1, p2, `T-${i}`);
        }
    }
}

colorPicker.addEventListener('input', (event) => setCurrentColor(event.target.value));
canvas.addEventListener('wheel', (event) => {
    event.preventDefault(); const mouseScreen = getMousePosOnCanvas(event, canvas);
    const scaleFactor = event.deltaY > 0 ? 1/1.15 : 1.15;
    zoomAt(mouseScreen, scaleFactor); redrawAll();
});


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

    // Reset ghost point by default for every frame
    ghostPointPosition = null; 

    // Determine if a ghost point should be shown (when Shift is held and not in action)
    if (!isActionInProgress && currentShiftPressed) {
        // If in drawing mode, the ghost point is the snapped end of the line being drawn
        if (isDrawingMode && previewLineStartPointId) {
            const startPoint = findPointById(previewLineStartPointId);
            if (startPoint) {
                // getSnappedPosition will return the final snapped coordinates (point, edge, angle, distance, or grid)
                const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed);
                ghostPointPosition = { x: snappedData.x, y: snappedData.y }; 
            }
        } else { // Not in drawing mode, but shift is held for general snapping
            const targetPoint = findClickedPoint(mousePos);
            const targetEdge = targetPoint ? null : findClickedEdge(mousePos);
            
            // Only show ghost if not hovering over an existing point or edge (as they get their own highlight)
            if (!(targetPoint || targetEdge)) {
                // For general hover, check for grid snaps (as grid snapping is always active when shift is down)
                const gridData = calculateGridIntervals(viewTransform.scale);
                const mouseDataPos = screenToData(mousePos);
                const gridSnapRadiusData = (POINT_SELECT_RADIUS * 2.0) / viewTransform.scale;
                let bestGridSnap = { dist: Infinity, pos: null };
                
                const checkGrid = (interval, alpha) => {
                    // Alpha check helps ensure the ghost point only shows for relevant grid scales
                    if (!interval || alpha < 0.01) return; 
                    const snapX = Math.round(mouseDataPos.x / interval) * interval;
                    const snapY = Math.round(mouseDataPos.y / interval) * interval;
                    const distToGridPoint = distance(mouseDataPos, { x: snapX, y: snapY });
                    if (distToGridPoint < bestGridSnap.dist) { // Removed gridSnapRadiusData check here for robustness, relies on general POINT_SELECT_RADIUS
                        bestGridSnap.dist = distToGridPoint;
                        bestGridSnap.pos = { x: snapX, y: snapY };
                    }
                };

                checkGrid(gridData.grid1Interval, gridData.alpha1);
                checkGrid(gridData.grid2Interval, gridData.alpha2);
                ghostPointPosition = bestGridSnap.pos; // Set ghost point position if a suitable grid snap is found
            }
        }
    }

    // Redraw immediately to show ghost point or cursor changes, if no action is in progress.
    // This allows the ghost point to be visually updated without waiting for a drag/pan action.
    if (!isActionInProgress) { 
        redrawAll();
        return; // Exit early if no action to process below
    }

    // --- Action in progress logic ---

    // Confirm drag only after mouse moves beyond a threshold
    if (!isDragConfirmed && distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
        isDragConfirmed = true;
        if (currentMouseButton === 2) { // Right-click drag starts rectangle selection
            isRectangleSelecting = true;
            redrawAll(); // Redraw immediately to show selection rectangle
            return; // Skip further drag processing for rectangle select initiation
        }
        // If left-click drag, prepare for dragging selected points/edges or panning
        const { target, shiftKey, ctrlKey } = actionContext;
        if (target !== 'canvas') { // Dragging a point or edge
            actionTargetPoint = actionContext.targetPoint; // Identify the specific point being targeted
            if (actionTargetPoint && !selectedPointIds.includes(actionTargetPoint.id)) {
                // If targeted point is not selected, select it (and potentially others)
                applySelectionLogic([actionTargetPoint.id], [], shiftKey, ctrlKey, false);
            } else if (actionContext.targetEdge && !selectedEdgeIds.includes(getEdgeId(actionContext.targetEdge))) {
                // If targeted edge is not selected, select it (and potentially others)
                applySelectionLogic([], [getEdgeId(actionContext.targetEdge)], shiftKey, ctrlKey, false);
            }
            // Prepare the set of all points to be dragged (selected points and points connected to selected edges)
            const dragGroupIds = new Set(selectedPointIds);
            selectedEdgeIds.forEach(eid => {
                const parts = eid.split('_EDGE_');
                if (parts[0]) dragGroupIds.add(parts[0]);
                if (parts[1]) dragGroupIds.add(parts[1]);
            });
            if (dragGroupIds.size > 0) {
                const pointsToDrag = Array.from(dragGroupIds).map(id => findPointById(id)).filter(Boolean);
                if (pointsToDrag.length > 0) {
                    initialDragPointStates = pointsToDrag.map(p => ({ ...p })); // Store initial states for delta calculation
                    dragPreviewPoints = pointsToDrag.map(p => ({ ...p })); // Initialize preview points
                    canvas.style.cursor = 'grabbing'; // Change cursor to indicate dragging
                }
            }
        } else { // Dragging on canvas background starts panning
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
            canvas.style.cursor = 'move'; // Change cursor to indicate panning
        }
    }

    // Process drag/pan based on confirmed action
    if (isDragConfirmed) {
        if (isPanningBackground) {
            const deltaX_css = mousePos.x - actionStartPos.x;
            const deltaY_css = mousePos.y - actionStartPos.y;
            // Update view transform offsets based on mouse movement
            viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
            viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr); // Canvas Y is inverted relative to CSS Y
        } else if (isRectangleSelecting) {
            // Rectangle selecting, only visual update here
        } else if (dragPreviewPoints.length > 0) { // Dragging points/edges
            const mouseData = screenToData(mousePos);
            const actionStartData = screenToData(actionStartPos);
            // Calculate the total data-space delta from action start to current mouse position
            const finalDelta = { x: mouseData.x - actionStartData.x, y: mouseData.y - actionStartData.y };
            
            // Update preview points based on the delta
            initialDragPointStates.forEach(originalPointState => {
                const previewPointToUpdate = dragPreviewPoints.find(dp => dp.id === originalPointState.id);
                if (previewPointToUpdate) {
                    previewPointToUpdate.x = originalPointState.x + finalDelta.x;
                    previewPointToUpdate.y = originalPointState.y + finalDelta.y;
                }
            });
        }
    }
    redrawAll(); // Redraw canvas to show real-time changes during drag/pan
});

canvas.addEventListener('mouseup', (event) => {
    if (!isActionInProgress) return;

    if (isDragConfirmed) {
        if (isRectangleSelecting) {
            const dataP1 = screenToData({ x: Math.min(actionStartPos.x, mousePos.x), y: Math.min(actionStartPos.y, mousePos.y) });
            const dataP2 = screenToData({ x: Math.max(actionStartPos.x, mousePos.x), y: Math.max(actionStartPos.y, mousePos.y) });
            const minX = Math.min(dataP1.x, dataP2.x), maxX = Math.max(dataP1.x, dataP2.x);
            const minY = Math.min(dataP1.y, dataP2.y), maxY = Math.max(dataP1.y, dataP2.y);
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