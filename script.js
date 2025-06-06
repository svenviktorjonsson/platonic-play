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
    formatSnapFactor
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

const DEFAULT_CALIBRATION_VIEW_SCALE = 1.0;
const DEFAULT_REFERENCE_DISTANCE = 100.0 / DEFAULT_CALIBRATION_VIEW_SCALE;
const DEFAULT_REFERENCE_ANGLE_RAD = Math.PI / 2;

let frozenReference_A_rad = null;
let frozenReference_A_baseRad = null;
let frozenReference_D_du = null;
let frozenReference_Origin_Data = null;
let currentDrawingFirstSegmentAbsoluteAngleRad = null;
let dragBoundaryContext = null;

let allPoints = [];
let allEdges = [];
let selectedPointIds = [];
let selectedEdgeIds = [];
let activeCenterId = null;
let mousePos = { x: 0, y: 0 };
let currentColor = '#ffffff';

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
let currentUnit = 'm';
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

const unitConversions = {
    'mm': 0.001, 'cm': 0.01, 'm': 1, 'km': 1000,
    'in': 0.0254, 'ft': 0.3048, 'yd': 0.9144, 'mi': 1609.34
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
        currentSegmentReferenceA_for_display = frozenReference_A_rad !== null ? Math.abs(frozenReference_A_rad) : DEFAULT_REFERENCE_ANGLE_RAD;
    } else {
        offsetAngleRad = 0;
        currentSegmentReferenceD = DEFAULT_REFERENCE_DISTANCE;
        currentSegmentReferenceA_for_display = DEFAULT_REFERENCE_ANGLE_RAD;
    }

    return {
        offsetAngleRad,
        currentSegmentReferenceD,
        currentSegmentReferenceA_for_display,
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
        frozenReference_A_rad, frozenReference_A_baseRad, frozenReference_D_du, frozenReference_Origin_Data
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

function getRelativeAngleDisplay(currentAngleDegrees, referenceAngleDegrees) {
    const fallbackToDegrees = (angle) => `${formatNumber(angle, angleSigFigs)}^{\\circ}`;

    if (Math.abs(referenceAngleDegrees) < 0.1) {
        let angleToFormat = normalizeAngleDegrees(currentAngleDegrees);
        if (angleToFormat > 180.001 && Math.abs(angleToFormat - 360) < 179.999 ) {
            angleToFormat -= 360;
        }
        return fallbackToDegrees(angleToFormat);
    }
    const ratio = currentAngleDegrees / referenceAngleDegrees;
    const fractionStr = formatFraction(ratio, 0.03, MAX_FRACTION_DENOMINATOR_FOR_ANGLE_SNAPS);
    const isDecimalOrTooLarge = fractionStr.includes('.') || Math.abs(ratio) > (MAX_BASE_ANGLE_MULTIPLIER_FOR_SNAPS + 0.1) || (!fractionStr.includes('/') && isNaN(parseInt(fractionStr.charAt(0))));
    if (isDecimalOrTooLarge && fractionStr !== "0") {
        let angleToFormat = normalizeAngleDegrees(currentAngleDegrees);
        if (angleToFormat > 180.001 && Math.abs(angleToFormat - 360) < 179.999 ) {
            angleToFormat -= 360;
        }
        return fallbackToDegrees(angleToFormat);
    }
    return formatSnapFactor(ratio, 'A');
}

function getRelativeDistanceDisplay(currentDistance, referenceDistance) {
    const fallbackToUnits = () => {
        const val = convertToDisplayUnits(currentDistance);
        if (typeof val === 'string') {
            const num = parseFloat(val) || 0;
            const unit = val.replace(num.toString(), '');
            return `${formatNumber(num, distanceSigFigs)}\\mathrm{${unit}}`;
        }
        return `${formatNumber(val, distanceSigFigs)}\\mathrm{${currentUnit}}`;
    };
    if (referenceDistance < 0.0001) return fallbackToUnits();
    const ratio = currentDistance / referenceDistance;
    const fractionStr = formatFraction(ratio, 0.02, MAX_FRACTION_DENOMINATOR_FOR_ANGLE_SNAPS);
    const isDecimalOrTooLarge = fractionStr.includes('.') || Math.abs(ratio) > (MAX_BASE_ANGLE_MULTIPLIER_FOR_SNAPS + 0.1) || (!fractionStr.includes('/') && isNaN(parseInt(fractionStr.charAt(0))));
    if (isDecimalOrTooLarge && fractionStr !== "0") return fallbackToUnits();
    return formatSnapFactor(ratio, 'D');
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

function convertToDisplayUnits(valueInDataUnits) {
    const metersPerDataUnit = DEFAULT_CALIBRATION_VIEW_SCALE / 100.0;
    const valueInMeters = valueInDataUnits * metersPerDataUnit;
    if (Math.abs(valueInMeters) < 0.000001 && valueInDataUnits !== 0 && currentUnit !== 'mm') {
        const valueInMM = valueInMeters / unitConversions['mm'];
        if (Math.abs(valueInMM) >= 0.01) {
            return `${formatNumber(valueInMM, Math.max(1,distanceSigFigs-1))}mm`;
        }
    }
    return valueInMeters / unitConversions[currentUnit];
}

function findClosestEdgeInfo(dataPos, thresholdData) {
    let closestEdge = null; let closestPointInfo = null; let minDistance = thresholdData;
    for (const edge of allEdges) {
        const p1 = findPointById(edge.id1); const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
            const ptInfo = getClosestPointOnLineSegment(dataPos, p1, p2);
            if (ptInfo.distance < minDistance && ptInfo.t > -0.00001 && ptInfo.t < 1.00001) {
                minDistance = ptInfo.distance; closestEdge = edge;
                closestPointInfo = { x: ptInfo.x, y: ptInfo.y, t: ptInfo.t, onSegmentStrict: ptInfo.onSegmentStrict };
            }
        }
    }
    if (closestEdge) return { edge: closestEdge, pointOnEdge: closestPointInfo, distanceToMouse: minDistance };
    return null;
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
    
    const snapRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;
    for (const p of allPoints) {
        if (p.id !== startPoint.id && p.type === 'regular' && distance(mouseDataPos, p) < snapRadiusData) {
            const finalAngleRad = Math.atan2(p.y - startPoint.y, p.x - startPoint.x) || 0;
            return { x: p.x, y: p.y, angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, p), snapped: true, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null, angleTurn: null };
        }
    }
    const segmentSnapThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
    for (const edge of allEdges) {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular' && p1.id !== startPoint.id && p2.id !== startPoint.id) {
            const closest = getClosestPointOnLineSegment(mouseDataPos, p1, p2);
            if (closest.distance < segmentSnapThresholdData && closest.onSegmentStrict) {
                const finalAngleRad = Math.atan2(closest.y - startPoint.y, closest.x - startPoint.x) || 0;
                return { x: closest.x, y: closest.y, angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, closest), snapped: true, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null, angleTurn: null };
            }
        }
    }

    if (shiftPressed) {
        const drawingContext = getDrawingContext(startPoint.id);
        const rawAngle = Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x) || 0;
        const rawDist = distance(startPoint, mouseDataPos);

        const candidates = [];
        
        const refAngle = drawingContext.isFirstSegmentBeingDrawn ? (Math.PI / 2) : drawingContext.currentSegmentReferenceA_for_display;
        const angleSnap = snapToAngle(rawAngle, drawingContext.offsetAngleRad, ANGLE_SNAP_FRACTIONS, refAngle, true);
        candidates.push({ type: 'angle', pos: { x: startPoint.x + rawDist * Math.cos(angleSnap.angle), y: startPoint.y + rawDist * Math.sin(angleSnap.angle) }, snapInfo: { angleSnap } });

        // MODIFICATION START: Use DEFAULT_REFERENCE_DISTANCE for the first segment
        const refDist = drawingContext.isFirstSegmentBeingDrawn ? DEFAULT_REFERENCE_DISTANCE : drawingContext.currentSegmentReferenceD;
        // MODIFICATION END

        const distanceSnapFactors = generateDistanceSnapFactors();
        const distSnap = (refDist > 0) ? snapToLength(rawDist, refDist, 0.1, distanceSnapFactors, true) : { length: rawDist, factor: null };
        candidates.push({ type: 'dist', pos: { x: startPoint.x + distSnap.length * Math.cos(rawAngle), y: startPoint.y + distSnap.length * Math.sin(rawAngle) }, snapInfo: { distSnap } });

        const gridSnapPoint = (showGrid && lastGridState.interval1) ? { x: Math.round(mouseDataPos.x / lastGridState.interval1) * lastGridState.interval1, y: Math.round(mouseDataPos.y / lastGridState.interval1) * lastGridState.interval1 } : null;
        if (gridSnapPoint) {
            candidates.push({ type: 'grid', pos: gridSnapPoint, snapInfo: { } });
        }
        
        let bestCandidate = candidates.reduce((best, current) => {
            const currentDist = distance(mouseDataPos, current.pos);
            if (currentDist < best.dist) {
                return { ...current, dist: currentDist };
            }
            return best;
        }, { dist: Infinity, pos: mouseDataPos, type: null, snapInfo: null });
        
        let finalPos = bestCandidate.pos; 

        if (bestCandidate.type === 'angle' && gridSnapPoint) {
            const secondarySnapThreshold = 10 / viewTransform.scale;
            const gridPointOnRay = getClosestPointOnLineSegment(gridSnapPoint, startPoint, finalPos).onSegmentStrict ? gridSnapPoint : null;
            if (gridPointOnRay && distance(finalPos, gridPointOnRay) < secondarySnapThreshold) {
                finalPos = gridPointOnRay;
                bestCandidate.type = 'grid_on_angle';
            }
        }
        
        const finalAngle = Math.atan2(finalPos.y - startPoint.y, finalPos.x - startPoint.x) || 0;
        const finalDist = distance(startPoint, finalPos);
        
        const finalAngleSnap = snapToAngle(finalAngle, drawingContext.offsetAngleRad, ANGLE_SNAP_FRACTIONS, refAngle, true);
        const finalDistSnap = (refDist > 0) ? snapToLength(finalDist, refDist, 0.01, distanceSnapFactors, true) : { factor: null };

        const gridSnapped = (gridSnapPoint && distance(finalPos, gridSnapPoint) < 1e-9) ? true : false;

        return {
            x: finalPos.x,
            y: finalPos.y,
            angle: finalAngle * (180 / Math.PI),
            distance: finalDist,
            snapped: true,
            gridSnapped: gridSnapped,
            lengthSnapFactor: finalDistSnap.factor,
            angleSnapFactor: finalAngleSnap.factor,
            angleTurn: finalAngleSnap.turn
        };
    }

    const finalAngleRad = Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x) || 0;
    return { x: mouseDataPos.x, y: mouseDataPos.y, angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, mouseDataPos), snapped: false, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null, angleTurn: null };
}

// --- Modified prepareReferenceElementsTexts function ---
function prepareReferenceElementsTexts(context, shiftPressed) {
    if (!shiftPressed || (!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display) return;
    
    const refElementColor = 'rgba(240, 240, 130, 1)'; // Matches currentElementColor for consistency
    const katexFontSize = 11;
    const frozenOriginScreen = dataToScreen(context.frozen_Origin_Data_to_display);

    if (showDistances && context.frozen_D_du_to_display !== null && context.frozen_D_du_to_display > 0.0001) {
        let actualAngleOfFrozenSegment = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        if (context.displayAngleA_valueRad_for_A_equals_label !== null) {
            actualAngleOfFrozenSegment += (context.frozen_A_baseRad_to_display === null) ? context.displayAngleA_valueRad_for_A_equals_label : context.displayAngleA_valueRad_for_A_equals_label;
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

        let dDisplayText;
        const defaultRefDist = DEFAULT_REFERENCE_DISTANCE; 
        const relativeFactor = context.frozen_D_du_to_display / defaultRefDist;
        const fractionFormatted = formatFraction(relativeFactor, 0.001); 
        
        const isNiceFraction = fractionFormatted.includes('/') || (fractionFormatted.length < 5 && parseFloat(fractionFormatted) % 1 === 0);

        if (isNiceFraction) {
            dDisplayText = formatSnapFactor(relativeFactor, 'D'); 
        } else {
            const dValueConverted = convertToDisplayUnits(context.frozen_D_du_to_display);
            if (typeof dValueConverted === 'string') {
                const num = parseFloat(dValueConverted) || 0;
                const unit = dValueConverted.replace(num.toString(), '');
                dDisplayText = `\\delta = ${formatNumber(num, distanceSigFigs)}\\mathrm{${unit}}`; // Corrected: \\Delta to \\delta
            } else {
                dDisplayText = `\\delta = ${formatNumber(dValueConverted, distanceSigFigs)}\\mathrm{${currentUnit}}`; // Corrected: \\Delta to \\delta
            }
        }

        updateHtmlLabel({ 
            id: 'ref-dist', 
            content: dDisplayText, 
            x: textDistLabelX_D, 
            y: textDistLabelY_D, 
            color: refElementColor, 
            fontSize: katexFontSize, 
            options: {
                textAlign: 'center', 
                textBaseline: 'middle', 
                rotationRad: lineCanvasAngle + rotationForReadability 
            } 
        });
    }

    if (showAngles && context.displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(context.displayAngleA_valueRad_for_A_equals_label) > 0.0001) {
        const arcRadius_A_screen = 35;
        const startAngleForA_arc_dataRad = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        const bisectorAngle_A_dataRad = startAngleForA_arc_dataRad + context.displayAngleA_valueRad_for_A_equals_label / 2;
        
        const bisectorCanvasAngle = Math.atan2(Math.sin(-startAngleForA_arc_dataRad) + Math.sin(-context.displayAngleA_valueRad_for_A_equals_label), Math.cos(-startAngleForA_arc_dataRad) + Math.cos(-context.displayAngleA_valueRad_for_A_equals_label)); 

        let rotationForReadability = 0;
        if (bisectorCanvasAngle > Math.PI / 2 || bisectorCanvasAngle < -Math.PI / 2) { 
             rotationForReadability = Math.PI;
        }

        const angleLabelOffsetDistance = arcRadius_A_screen + 35; 

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
            options: {
                textAlign: 'center', 
                textBaseline: 'middle', 
                rotationRad: bisectorCanvasAngle + rotationForReadability 
            } 
        });
    }
}

// --- Modified prepareSnapInfoTexts function ---
function prepareSnapInfoTexts(startPointData, targetDataPos, snappedOutput, shiftPressed, drawingContext) {
    if (!showAngles && !showDistances) return;

    const startScreen = dataToScreen(startPointData);
    const { angle: snappedAbsoluteAngleDeg, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn } = snappedOutput;
    const { offsetAngleRad, isFirstSegmentBeingDrawn, frozenReference_D_du, frozenReference_A_rad } = drawingContext; 
    const currentElementColor = shiftPressed ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)'; 
    const katexFontSize = 12;

    if (showDistances) {
        const midX = (startScreen.x + dataToScreen(targetDataPos).x) / 2;
        const midY = (startScreen.y + dataToScreen(targetDataPos).y) / 2;
        const visualLineAngleScreen = Math.atan2(dataToScreen(targetDataPos).y - startScreen.y, dataToScreen(targetDataPos).x - startScreen.x);
        const textPerpAngle = visualLineAngleScreen - Math.PI / 2;
        const distanceTextX = midX + Math.cos(textPerpAngle) * 18;
        const distanceTextY = midY + Math.sin(textPerpAngle) * 18; 
        let distanceText;

        if (shiftPressed) {
            if (frozenReference_D_du !== null && !isFirstSegmentBeingDrawn) { 
                if (lengthSnapFactor !== null) {
                    distanceText = formatSnapFactor(lengthSnapFactor, 'D'); 
                } else {
                    const convertedValue = convertToDisplayUnits(snappedDistanceData);
                    distanceText = `${formatNumber(convertedValue, distanceSigFigs)}\\mathrm{${currentUnit}}`;
                }
            } else {
                const convertedValue = convertToDisplayUnits(snappedDistanceData);
                distanceText = `${formatNumber(convertedValue, distanceSigFigs)}\\mathrm{${currentUnit}}`;
            }
        } else {
            const convertedValue = convertToDisplayUnits(snappedDistanceData);
            distanceText = `${formatNumber(convertedValue, distanceSigFigs)}\\mathrm{${currentUnit}}`;
        }
        updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } });
    }

    if (showAngles) {
        const currentLineAbsoluteAngle = Math.atan2(targetDataPos.y - startPointData.y, targetDataPos.x - startPointData.x);
        const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad;
        
        const arcColor = shiftPressed ? 'rgba(230, 230, 100, 0.8)' : 'rgba(200, 200, 200, 0.7)';
        drawAngleArc(startScreen, baseAngleForArc, currentLineAbsoluteAngle, 30, arcColor);
        
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

        let angleText;
        let angleToFormatDeg;

        if (shiftPressed) {
            const thresholdZeroAngleRad = 0.001 * (Math.PI / 180); 
            const offsetAngleIsEffectivelyZero = Math.abs(normalizeAngleToPi(offsetAngleRad)) < thresholdZeroAngleRad;

            if (frozenReference_A_rad !== null && !isFirstSegmentBeingDrawn && !offsetAngleIsEffectivelyZero) {
                angleToFormatDeg = angleTurn * (180 / Math.PI); 

                if (angleSnapFactor !== null) {
                    angleText = formatSnapFactor(angleSnapFactor, 'A'); 
                } else {
                    angleText = `\\theta = ${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
                }
            } else {
                angleToFormatDeg = normalizeAngleToPi(currentLineAbsoluteAngle) * (180 / Math.PI);
                angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
            }
        } else {
            angleToFormatDeg = isFirstSegmentBeingDrawn ? normalizeAngleDegrees(snappedAbsoluteAngleDeg) : (angleTurn !== null ? angleTurn * (180 / Math.PI) : normalizeAngleToPi(snappedAbsoluteAngleDeg * (Math.PI/180) - offsetAngleRad) * (180/Math.PI));
            if (angleToFormatDeg > 180.001 && !isFirstSegmentBeingDrawn) {
                angleToFormatDeg -= 360;
            }
            angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
        }
        
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

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);

    // This is the correct, working grid logic.
    if (showGrid) {
        const { grid1Interval, grid2Interval, alpha1, alpha2 } = calculateGridIntervals(viewTransform.scale);
        lastGridState = { interval1: grid1Interval, interval2: grid2Interval, alpha1, alpha2, scale: viewTransform.scale };
        
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

    if (isDragConfirmed && actionTargetPoint) {
        if(typeof drawDragFeedback === 'function') {
           drawDragFeedback(actionTargetPoint.id, dragPreviewPoints);
        }
    }

    // This block draws the ghost circle when NOT in create mode
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
            
            // This block draws the ghost circle WHEN in create mode, if a grid snap occurs
            if (snappedData.gridSnapped) {
                ctx.beginPath();
                ctx.arc(targetScreen.x, targetScreen.y, POINT_RADIUS, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(240, 240, 130, 0.9)';
                ctx.fill();
            }

            // All angle feedback logic is now correctly consolidated in this one function call.
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
    const LABEL_RADIUS = ARC_RADIUS + 15;

    const drawSingleAngle = (vertex, p1, p2, id, isReflex) => {
        const vertexScreen = dataToScreen(vertex);
        const angle1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
        const angle2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);

        const signedDiff = normalizeAngleToPi(angle2 - angle1);
        const interiorAngle = Math.abs(signedDiff);
        const angleToDraw = isReflex ? (2 * Math.PI - interiorAngle) : interiorAngle;
        if (angleToDraw < 0.001) return;

        const interiorSweep = signedDiff < 0;
        const sweepFlag = isReflex ? !interiorSweep : interiorSweep;

        ctx.beginPath();
        ctx.arc(vertexScreen.x, vertexScreen.y, ARC_RADIUS, -angle1, -angle2, sweepFlag);
        ctx.strokeStyle = feedbackColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();

        const bisector = angle1 + signedDiff / 2 + (isReflex ? Math.PI : 0);
        const labelX = vertexScreen.x + Math.cos(bisector) * LABEL_RADIUS;
        const labelY = vertexScreen.y - Math.sin(bisector) * LABEL_RADIUS;
        
        const angleValue = isReflex ? -(angleToDraw) : signedDiff;
        const angleText = `${formatNumber(angleValue * (180 / Math.PI), angleSigFigs)}^{\\circ}`;
        updateHtmlLabel({ id: `drag-angle-${id}`, content: angleText, x: labelX, y: labelY, color: feedbackColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } });
    };

    const targetPoint = currentDragStates.find(p => p.id === targetPointId);
    if (!targetPoint) return;

    const targetNeighbors = findNeighbors(targetPoint.id).map(id => currentDragStates.find(p => p.id === id) || findPointById(id)).filter(Boolean);

    const targetScreen = dataToScreen(targetPoint);
    targetNeighbors.forEach(neighbor => {
        const dist = distance(targetPoint, neighbor);
        const neighborScreen = dataToScreen(neighbor);
        const midX = (targetScreen.x + neighborScreen.x) / 2;
        const midY = (targetScreen.y + neighborScreen.y) / 2;
        const lineAngle = Math.atan2(neighborScreen.y - targetScreen.y, neighborScreen.x - targetScreen.x);
        const perpAngle = lineAngle - Math.PI / 2;
        const textX = midX + Math.cos(perpAngle) * 15;
        const textY = midY + Math.sin(perpAngle) * 15;
        const convertedValue = convertToDisplayUnits(dist);
        let distText = `${formatNumber(convertedValue, distanceSigFigs)}\\mathrm{${currentUnit}}`;
        updateHtmlLabel({ id: `drag-dist-P-${neighbor.id}`, content: distText, x: textX, y: textY, color: feedbackColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } });
    });

    if (targetNeighbors.length >= 2) {
        const sorted = [...targetNeighbors].sort((a, b) => Math.atan2(a.y - targetPoint.y, a.x - targetPoint.x) - Math.atan2(b.y - targetPoint.y, b.x - targetPoint.x));
        
        if (sorted.length === 2) {
            drawSingleAngle(targetPoint, sorted[0], sorted[1], "P-interior", false);
            drawSingleAngle(targetPoint, sorted[0], sorted[1], "P-reflex", true);
        } else {
            for (let i = 0; i < sorted.length; i++) {
                drawSingleAngle(targetPoint, sorted[i], sorted[(i + 1) % sorted.length], `P-${i}`, false);
            }
        }
    }

    targetNeighbors.forEach(neighbor => {
        const neighborsOfN = findNeighbors(neighbor.id).map(id => currentDragStates.find(p => p.id === id) || findPointById(id)).filter(Boolean);
        if (neighborsOfN.length < 2) return;

        const sorted = [...neighborsOfN].sort((a, b) => Math.atan2(a.y - neighbor.y, a.x - neighbor.x) - Math.atan2(b.y - neighbor.y, b.x - neighbor.x));
        const pIndex = sorted.findIndex(p => p.id === targetPoint.id);
        if (pIndex === -1) return;

        if (neighborsOfN.length === 2) {
            const otherNeighbor = sorted[(pIndex + 1) % 2];
            drawSingleAngle(neighbor, targetPoint, otherNeighbor, `N-${neighbor.id}-single`, false);
        } else {
            const prevPoint = sorted[(pIndex - 1 + sorted.length) % sorted.length];
            const nextPoint = sorted[(pIndex + 1) % sorted.length];
            drawSingleAngle(neighbor, prevPoint, targetPoint, `N-${neighbor.id}-prev`, false);
            drawSingleAngle(neighbor, targetPoint, nextPoint, `N-${neighbor.id}-next`, false);
        }
    });
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
                    frozenReference_D_du = snappedDataForCompletedSegment.distance;
                    frozenReference_Origin_Data = startPoint;

                    if (drawingContextForCompletedSegment.isFirstSegmentBeingDrawn) { 
                        frozenReference_A_rad = normalizeAngleToPi(snappedDataForCompletedSegment.angle * (Math.PI / 180)); 
                        frozenReference_A_baseRad = 0; 
                    } else {
                        frozenReference_A_rad = snappedDataForCompletedSegment.angleTurn; 
                        frozenReference_A_baseRad = drawingContextForCompletedSegment.offsetAngleRad; 
                    }
                } else {
                    frozenReference_D_du = null;
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

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    if (event.key === 'Shift') {
        currentShiftPressed = true;
        if (isDrawingMode && previewLineStartPointId) redrawAll();
    }
    
    const allowedDuringAction = ['Shift', 'Control', 'Meta', 'Alt', 'Escape', 'Delete', 'Backspace'];
    if (isActionInProgress && !allowedDuringAction.includes(event.key) && !(isCtrlOrCmd && ['c','x','v','z','y','a','=','-'].includes(event.key.toLowerCase()))) return;
    
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
    } else if (isCtrlOrCmd && event.key === '=') {
        event.preventDefault();
        const centerScreen = { x: (canvas.width/dpr)/2, y: (canvas.height/dpr)/2 };
        zoomAt(centerScreen, 1.2);
        redrawAll();
    } else if (isCtrlOrCmd && event.key === '-') {
        event.preventDefault();
        const centerScreen = { x: (canvas.width/dpr)/2, y: (canvas.height/dpr)/2 };
        zoomAt(centerScreen, 1/1.2);
        redrawAll();
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
document.getElementById('unitsSelect').addEventListener('change', (e) => { currentUnit = e.target.value; redrawAll(); });
window.addEventListener('resize', resizeCanvas);

window.addEventListener('load', () => {
    if (typeof window.katex === 'undefined') {
        console.error("KaTeX library failed to load or initialize. Math rendering will be broken.");
    }
    resizeCanvas();
    updateColorPalette();
    setCurrentColor(currentColor);
    saveStateForUndo();
    redrawAll();
});