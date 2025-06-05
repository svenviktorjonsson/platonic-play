import {
    formatNumber,
    generateAngleSnapFractions,
    generateUniqueId,
    normalizeAngle,
    normalizeAngleToPi,
    normalizeAngleDegrees,
    snapTValue,
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

const DEFAULT_CALIBRATION_VIEW_SCALE = 1.0;
const DEFAULT_REFERENCE_DISTANCE = 100.0 / DEFAULT_CALIBRATION_VIEW_SCALE;
const DEFAULT_REFERENCE_ANGLE_RAD = Math.PI / 2;

let frozenReference_A_rad = null;
let frozenReference_A_baseRad = null;
let frozenReference_D_du = null;
let frozenReference_Origin_Data = null;
let currentDrawingFirstSegmentAbsoluteAngleRad = null;

let allPoints = [];
let allEdges = [];
let selectedPointIds = [];
let activeCenterId = null;
let mousePos = { x: 0, y: 0 };
let currentColor = '#ffffff';

let viewTransform = {
    scale: DEFAULT_CALIBRATION_VIEW_SCALE,
    offsetX: 0,
    offsetY: 0
};

let recentColors = ['#ffffff', '#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff', '#ffa544'];

let isDrawingMode = false;
let previewLineStartPointId = null;
let currentMouseButton = -1;
let isActionInProgress = false;
let actionStartPos = { x: 0, y: 0 };
let actionTargetPoint = null;
let isDragConfirmed = false;
let isTransformDrag = false;
let initialCenterStateForTransform = null;
let initialStatesForTransform = [];
let initialMouseAngleToCenter = 0;
let initialMouseDistanceToCenter = 0;
let dragPreviewPoints = [];
let isRectangleSelecting = false;
let rectangleSelectStartPos = { x: 0, y: 0 };
let shiftKeyAtActionStart = false;
let currentShiftPressed = false;
let ctrlKeyAtActionStart = false;
let lastCanvasClickTime = 0;
let clipboard = { points: [], edges: [], referencePoint: null };
let clickData = { pointId: null, count: 0, timestamp: 0 };
let undoStack = [];
let redoStack = [];
let isPanningBackground = false;
let backgroundPanStartOffset = { x: 0, y: 0 };
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

function getSnappedPosition(startPoint, mouseScreenPos, shiftPressed) {
    const mouseDataPos = screenToData(mouseScreenPos);
    const dxInitial = mouseDataPos.x - startPoint.x; const dyInitial = mouseDataPos.y - startPoint.y;
    let currentDistance = Math.sqrt(dxInitial*dxInitial + dyInitial*dyInitial); if (isNaN(currentDistance)) currentDistance = 0;
    let currentAngleRad = Math.atan2(dyInitial, dxInitial); if (isNaN(currentAngleRad)) currentAngleRad = 0;
    let snappedX = mouseDataPos.x; let snappedY = mouseDataPos.y; 
    let finalAngleRad = currentAngleRad; let finalDistance = currentDistance; 
    let didSnap = false; let lengthSnapFactor = null; let angleSnapFactor = null; let angleTurn = null;

    const snapRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;
    for (const p of allPoints) {
        if (p.id !== startPoint.id && p.type === 'regular') {
            if (distance(mouseDataPos, p) < snapRadiusData) {
                snappedX = p.x; snappedY = p.y; finalDistance = distance(startPoint, {x:snappedX, y:snappedY}); finalAngleRad = Math.atan2(snappedY-startPoint.y, snappedX-startPoint.x);
                if(isNaN(finalAngleRad)) finalAngleRad = 0; if(isNaN(finalDistance)) finalDistance = 0;
                return { x: snappedX, y: snappedY, angle: finalAngleRad*(180/Math.PI), distance: finalDistance, snapped: true, lengthSnapFactor, angleSnapFactor, angleTurn };
            }
        }
    }
    const segmentSnapThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
    for (const edge of allEdges) {
        const p1 = findPointById(edge.id1); const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular' && p1.id !== startPoint.id && p2.id !== startPoint.id) {
            const closest = getClosestPointOnLineSegment(mouseDataPos, p1, p2);
            if (closest.distance < segmentSnapThresholdData && closest.onSegmentStrict) {
                snappedX = closest.x; snappedY = closest.y; finalDistance = distance(startPoint, {x:snappedX, y:snappedY}); finalAngleRad = Math.atan2(snappedY-startPoint.y, snappedX-startPoint.x);
                if(isNaN(finalAngleRad)) finalAngleRad = 0; if(isNaN(finalDistance)) finalDistance = 0;
                return { x: snappedX, y: snappedY, angle: finalAngleRad*(180/Math.PI), distance: finalDistance, snapped: true, lengthSnapFactor, angleSnapFactor, angleTurn };
            }
        }
    }

    if (shiftPressed) {
        const drawingContext = getDrawingContext(startPoint.id);
        const forceSnapForAngle = !drawingContext.isFirstSegmentBeingDrawn;
        const forceSnapForLength = !drawingContext.isFirstSegmentBeingDrawn;

        const offsetAngleForSnap = drawingContext.offsetAngleRad;
        
        let refAngleForSnap = drawingContext.isFirstSegmentBeingDrawn ? DEFAULT_REFERENCE_ANGLE_RAD : drawingContext.currentSegmentReferenceA_for_display;

        // If the reference angle is 0, default to 90 degrees to allow for snapping.
        if (Math.abs(refAngleForSnap) < 1e-9) {
            refAngleForSnap = DEFAULT_REFERENCE_ANGLE_RAD;
        }
        
        const angleSnapResult = snapToAngle(currentAngleRad, offsetAngleForSnap, SNAP_FACTORS, refAngleForSnap, forceSnapForAngle);
        
        let snappedAngleRad = angleSnapResult.angle;
        angleTurn = angleSnapResult.turn;
        angleSnapFactor = angleSnapResult.factor;
        
        let relMouseAngleToSnappedLine = normalizeAngleToPi(currentAngleRad - snappedAngleRad); if (isNaN(relMouseAngleToSnappedLine)) relMouseAngleToSnappedLine = 0;
        let projectedDist = currentDistance * Math.cos(relMouseAngleToSnappedLine); if (isNaN(projectedDist)) projectedDist = currentDistance;
        projectedDist = Math.max(0, projectedDist);
        
        let lengthSnapResult;
        if (drawingContext.isFirstSegmentBeingDrawn) {
            const metersPerDataUnit = DEFAULT_CALIBRATION_VIEW_SCALE / 100.0;
            const reference_1_meter_in_data_units = metersPerDataUnit > 1e-9 ? (1.0 / metersPerDataUnit) : projectedDist;
            lengthSnapResult = snapToLength(projectedDist, reference_1_meter_in_data_units, 0.05, undefined, false);
        } else {
            const referenceDistanceForSnap = drawingContext.currentSegmentReferenceD;
            lengthSnapResult = snapToLength(projectedDist, referenceDistanceForSnap, 0.05, undefined, forceSnapForLength);
        }
        
        finalDistance = lengthSnapResult.length;
        lengthSnapFactor = lengthSnapResult.factor;

        finalAngleRad = snappedAngleRad;
        didSnap = true;
        snappedX = startPoint.x + Math.cos(finalAngleRad) * finalDistance;
        snappedY = startPoint.y + Math.sin(finalAngleRad) * finalDistance;
        if (isNaN(snappedX) || isNaN(snappedY)) {
            snappedX = startPoint.x; snappedY = startPoint.y; finalDistance = 0;
        }
    }
    return { x: snappedX, y: snappedY, angle: finalAngleRad*(180/Math.PI), distance: finalDistance, snapped: didSnap, lengthSnapFactor, angleSnapFactor, angleTurn };
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
            selectedPointIds: JSON.parse(JSON.stringify(selectedPointIds)), activeCenterId, isDrawingMode, previewLineStartPointId
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
    for (let i = allPoints.length - 1; i >= 0; i--) {
        const point = allPoints[i];
        if (point.type !== 'regular' && distance(dataPos, point) < selectRadiusDataCenter) return point;
    }
    for (let i = allPoints.length - 1; i >= 0; i--) {
        const point = allPoints[i];
        if (point.type === 'regular' && distance(dataPos, point) < selectRadiusDataRegular) return point;
    }
    return null;
}

function findNeighbors(pointId) {
    const n = new Set();
    allEdges.forEach(e => { if (e.id1 === pointId) n.add(e.id2); else if (e.id2 === pointId) n.add(e.id1); });
    return Array.from(n);
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

function applySelectionLogic(pointIdsToSelect, wantsShift, wantsCtrl, targetIsCenter = false) {
    if (targetIsCenter) {
        const centerId = pointIdsToSelect[0];
        if (wantsCtrl) activeCenterId = (activeCenterId === centerId) ? null : centerId;
        else { activeCenterId = centerId; if (!wantsShift) selectedPointIds = []; }
    } else {
        if (wantsShift) selectedPointIds = [...new Set([...selectedPointIds, ...pointIdsToSelect])];
        else if (wantsCtrl) {
            pointIdsToSelect.forEach(id => {
                const index = selectedPointIds.indexOf(id);
                if (index > -1) selectedPointIds.splice(index, 1); else selectedPointIds.push(id);
            });
        } else { selectedPointIds = [...pointIdsToSelect]; }
    }
}

function handleCopy() {
    const pointsToCopyIds = new Set(selectedPointIds);
    if (activeCenterId) pointsToCopyIds.add(activeCenterId);
    if (pointsToCopyIds.size === 0) return;
    clipboard.points = Array.from(pointsToCopyIds).map(id => { const p = findPointById(id); return p ? { ...p } : null; }).filter(p => p);
    clipboard.edges = allEdges.filter(edge => pointsToCopyIds.has(edge.id1) && pointsToCopyIds.has(edge.id2) && findPointById(edge.id1)?.type === 'regular' && findPointById(edge.id2)?.type === 'regular').map(edge => ({ ...edge }));
    clipboard.referencePoint = screenToData(mousePos);
}

function handleCut() {
    const pointsToCutIds = new Set(selectedPointIds);
    if (activeCenterId) pointsToCutIds.add(activeCenterId);
    if (pointsToCutIds.size === 0) return;
    saveStateForUndo(); handleCopy();
    allEdges = allEdges.filter(edge => !pointsToCutIds.has(edge.id1) || !pointsToCutIds.has(edge.id2));
    allPoints = allPoints.filter(point => !pointsToCutIds.has(point.id));
    selectedPointIds = []; activeCenterId = null;
    if (previewLineStartPointId && !findPointById(previewLineStartPointId)) { isDrawingMode = false; previewLineStartPointId = null; frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null; }
    redrawAll();
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
    selectedPointIds = newPastedRegularPointIds; activeCenterId = newPastedActiveCenterId;
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
        ctx.beginPath();
        const selectionRadius = point.type !== 'regular' ? CENTER_POINT_VISUAL_RADIUS + SELECTED_INDICATOR_OFFSET : POINT_RADIUS + SELECTED_INDICATOR_OFFSET;
        ctx.arc(screenPos.x, screenPos.y, selectionRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.setLineDash(DASH_PATTERN); ctx.stroke(); ctx.setLineDash([]);
    }
}

function drawAllEdges() {
    ctx.lineWidth = LINE_WIDTH;
    allEdges.forEach(edge => {
        const p1_orig = findPointById(edge.id1); const p2_orig = findPointById(edge.id2);
        if (!p1_orig || !p2_orig || p1_orig.type !== 'regular' || p2_orig.type !== 'regular') return;
        let p1_render = p1_orig; let p2_render = p2_orig;
        let lineShouldBeDashed = false;
        if (isDragConfirmed && dragPreviewPoints.length > 0) {
            const p1Preview = dragPreviewPoints.find(dp => dp.id === p1_orig.id);
            const p2Preview = dragPreviewPoints.find(dp => dp.id === p2_orig.id);
            if (p1Preview) p1_render = p1Preview;
            if (p2Preview) p2_render = p2Preview;
            if (p1Preview || p2Preview) lineShouldBeDashed = true;
        }
        const p1Screen = dataToScreen(p1_render); const p2Screen = dataToScreen(p2_render);
        ctx.beginPath(); ctx.moveTo(p1Screen.x, p1Screen.y); ctx.lineTo(p2Screen.x, p2Screen.y);
        const color1 = p1_orig.color || currentColor; const color2 = p2_orig.color || currentColor;
        if (color1 === color2) ctx.strokeStyle = color1;
        else {
            const gradient = ctx.createLinearGradient(p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y);
            gradient.addColorStop(0, color1); gradient.addColorStop(1, color2);
            ctx.strokeStyle = gradient;
        }
        ctx.setLineDash(lineShouldBeDashed ? DASH_PATTERN : []); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.strokeStyle = 'white';
}

function deleteSelectedPoints() {
    const idsToDelete = new Set(selectedPointIds);
    if (activeCenterId) idsToDelete.add(activeCenterId);
    if (idsToDelete.size === 0) return;
    saveStateForUndo();
    allEdges = allEdges.filter(edge => !idsToDelete.has(edge.id1) || !idsToDelete.has(edge.id2));
    allPoints = allPoints.filter(point => !idsToDelete.has(point.id));
    selectedPointIds = []; activeCenterId = null;
    if (previewLineStartPointId && !findPointById(previewLineStartPointId)) { isDrawingMode = false; previewLineStartPointId = null; frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null; }
    redrawAll();
}

function performEscapeAction() {
    selectedPointIds = []; activeCenterId = null; isDrawingMode = false; previewLineStartPointId = null;
    frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null;
    currentDrawingFirstSegmentAbsoluteAngleRad = null;
    isActionInProgress = false; isDragConfirmed = false; isRectangleSelecting = false;
    isTransformDrag = false; isPanningBackground = false; dragPreviewPoints = [];
    actionTargetPoint = null; currentMouseButton = -1;
    clickData = { pointId: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair'; redrawAll();
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
    // A positive data turn (CCW) requires a CCW sweep on the canvas, so the flag is true.
    // A negative data turn (CW) requires a CW sweep on the canvas, so the flag is false.
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
    if (!shiftPressed || (!showAngles && !showDistances)) return;
    const { displayAngleA_valueRad_for_A_equals_label, frozen_A_baseRad_to_display, frozen_D_du_to_display, frozen_Origin_Data_to_display } = context;
    if (!frozen_Origin_Data_to_display) return;
    const refElementColor = 'rgba(240, 240, 130, 0.9)';
    const frozenOriginScreen = dataToScreen(frozen_Origin_Data_to_display);
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = refElementColor;

    if (showDistances && frozen_D_du_to_display !== null && frozen_D_du_to_display > 0.00001) {
        let actualAngleOfFrozenSegment = frozen_A_baseRad_to_display !== null ? frozen_A_baseRad_to_display : 0;
        if (displayAngleA_valueRad_for_A_equals_label !== null) {
             actualAngleOfFrozenSegment += (frozen_A_baseRad_to_display === null) ? displayAngleA_valueRad_for_A_equals_label : displayAngleA_valueRad_for_A_equals_label;
        }
        const frozenSegmentTipX = frozen_Origin_Data_to_display.x + frozen_D_du_to_display * Math.cos(actualAngleOfFrozenSegment);
        const frozenSegmentTipY = frozen_Origin_Data_to_display.y + frozen_D_du_to_display * Math.sin(actualAngleOfFrozenSegment);
        const frozenSegmentTipScreen = dataToScreen({x: frozenSegmentTipX, y: frozenSegmentTipY});
        ctx.beginPath(); ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y); ctx.lineTo(frozenSegmentTipScreen.x, frozenSegmentTipScreen.y);
        ctx.setLineDash(DASH_PATTERN); ctx.stroke();
    }

    if (showAngles && displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(displayAngleA_valueRad_for_A_equals_label) > 0.0001) {
        const arcRadius_A_screen = 35;
        const startAngleForA_arc_dataRad = frozen_A_baseRad_to_display !== null ? frozen_A_baseRad_to_display : 0;
        const endAngleForA_arc_dataRad = startAngleForA_arc_dataRad + displayAngleA_valueRad_for_A_equals_label;
        const baseLineEndData_A = { x: frozen_Origin_Data_to_display.x + Math.cos(startAngleForA_arc_dataRad) * (arcRadius_A_screen * 1.2 / viewTransform.scale), y: frozen_Origin_Data_to_display.y + Math.sin(startAngleForA_arc_dataRad) * (arcRadius_A_screen * 1.2 / viewTransform.scale) };
        const baseLineEndScreen_A = dataToScreen(baseLineEndData_A);
        ctx.beginPath(); ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y); ctx.lineTo(baseLineEndScreen_A.x, baseLineEndScreen_A.y);
        ctx.setLineDash(DASH_PATTERN); ctx.stroke();
        const refLineA_EndData = { x: frozen_Origin_Data_to_display.x + Math.cos(endAngleForA_arc_dataRad) * (arcRadius_A_screen * 1.2 / viewTransform.scale), y: frozen_Origin_Data_to_display.y + Math.sin(endAngleForA_arc_dataRad) * (arcRadius_A_screen * 1.2 / viewTransform.scale) };
        const refLineA_EndScreen = dataToScreen(refLineA_EndData);
        ctx.beginPath(); ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y); ctx.lineTo(refLineA_EndScreen.x, refLineA_EndScreen.y);
        ctx.setLineDash([]); ctx.stroke();
        drawAngleArc(frozenOriginScreen, startAngleForA_arc_dataRad, endAngleForA_arc_dataRad, arcRadius_A_screen, refElementColor, true);
    }
    ctx.restore();
}

function prepareReferenceElementsTexts(context, shiftPressed) {
    if (!shiftPressed || (!showAngles && !showDistances)) return;
    const { displayAngleA_valueRad_for_A_equals_label, frozen_A_baseRad_to_display, frozen_D_du_to_display, frozen_Origin_Data_to_display } = context;
    if (!frozen_Origin_Data_to_display) return;
    const refElementColor = 'rgba(240, 240, 130, 1)';
    const katexFontSize = 11;
    const frozenOriginScreen = dataToScreen(frozen_Origin_Data_to_display);

    if (showDistances && frozen_D_du_to_display !== null && frozen_D_du_to_display > 0.00001) {
        let actualAngleOfFrozenSegment = frozen_A_baseRad_to_display !== null ? frozen_A_baseRad_to_display : 0;
        if (displayAngleA_valueRad_for_A_equals_label !== null) {
            actualAngleOfFrozenSegment += (frozen_A_baseRad_to_display === null) ? displayAngleA_valueRad_for_A_equals_label : displayAngleA_valueRad_for_A_equals_label;
        }
        const frozenSegmentTipX = frozen_Origin_Data_to_display.x + frozen_D_du_to_display * Math.cos(actualAngleOfFrozenSegment);
        const frozenSegmentTipY = frozen_Origin_Data_to_display.y + frozen_D_du_to_display * Math.sin(actualAngleOfFrozenSegment);
        const frozenSegmentTipScreen = dataToScreen({x: frozenSegmentTipX, y: frozenSegmentTipY});
        const midX_D = (frozenOriginScreen.x + frozenSegmentTipScreen.x) / 2;
        const midY_D = (frozenOriginScreen.y + frozenSegmentTipScreen.y) / 2;
        const lineAngle_D_screen = Math.atan2(frozenSegmentTipScreen.y - frozenOriginScreen.y, frozenSegmentTipScreen.x - frozenOriginScreen.x);
        const textPerpAngle_D = lineAngle_D_screen - Math.PI / 2;
        const textDistLabelX_D = midX_D + Math.cos(textPerpAngle_D) * 15;
        const textDistLabelY_D = midY_D + Math.sin(textPerpAngle_D) * 15;
        
        let dValueConverted = convertToDisplayUnits(frozen_D_du_to_display);
        let dDisplayText;
        if (typeof dValueConverted === 'string') {
            const num = parseFloat(dValueConverted) || 0;
            const unit = dValueConverted.replace(num.toString(), '');
            dDisplayText = `${formatNumber(num, distanceSigFigs)}\\mathrm{${unit}}`;
        } else {
            dDisplayText = `${formatNumber(dValueConverted, distanceSigFigs)}\\mathrm{${currentUnit}}`;
        }
        updateHtmlLabel({ id: 'ref-dist', content: `D = ${dDisplayText}`, x: textDistLabelX_D, y: textDistLabelY_D, color: refElementColor, fontSize: katexFontSize, options: {textAlign: 'center', textBaseline: 'middle'} });
    }

    if (showAngles && displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(displayAngleA_valueRad_for_A_equals_label) > 0.0001) {
        const arcRadius_A_screen = 35;
        const startAngleForA_arc_dataRad = frozen_A_baseRad_to_display !== null ? frozen_A_baseRad_to_display : 0;
        const bisectorAngle_A_dataRad = startAngleForA_arc_dataRad + displayAngleA_valueRad_for_A_equals_label / 2;
        const textAngleLabelX_A = frozenOriginScreen.x + Math.cos(bisectorAngle_A_dataRad) * (arcRadius_A_screen + 15);
        const textAngleLabelY_A = frozenOriginScreen.y - Math.sin(bisectorAngle_A_dataRad) * (arcRadius_A_screen + 15);
        const aValueDeg = displayAngleA_valueRad_for_A_equals_label * (180 / Math.PI);
        const aKatexText = `A = ${formatNumber(aValueDeg, angleSigFigs)}^{\\circ}`;
        updateHtmlLabel({ id: 'ref-angle', content: aKatexText, x: textAngleLabelX_A, y: textAngleLabelY_A, color: refElementColor, fontSize: katexFontSize, options: {textAlign: 'center', textBaseline: 'middle'} });
    }
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

function prepareSnapInfoTexts(startPointData, targetDataPos, snappedOutput, shiftPressed, drawingContext) {
    if (!shiftPressed && (!showAngles && !showDistances)) return;

    const startScreen = dataToScreen(startPointData);
    const { angle: snappedAngleDegAbs, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn } = snappedOutput;
    const { offsetAngleRad, currentSegmentReferenceA_for_display, isFirstSegmentBeingDrawn } = drawingContext;

    const katexFontSize = 12;
    const midX = (startScreen.x + dataToScreen(targetDataPos).x) / 2;
    const midY = (startScreen.y + dataToScreen(targetDataPos).y) / 2;
    const visualLineAngleScreen = Math.atan2(dataToScreen(targetDataPos).y - startScreen.y, dataToScreen(targetDataPos).x - startScreen.x);
    const textPerpAngle = visualLineAngleScreen - Math.PI / 2;
    const textOffset = 18;
    let currentElementColor = shiftPressed ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';

    if (showDistances) {
        const distanceTextX = midX + Math.cos(textPerpAngle) * textOffset;
        const distanceTextY = midY + Math.sin(textPerpAngle) * textOffset;
        let distanceText;
        if (shiftPressed && !isFirstSegmentBeingDrawn && lengthSnapFactor !== null) {
            distanceText = formatSnapFactor(lengthSnapFactor, 'D');
        } else {
            const convertedValue = convertToDisplayUnits(snappedDistanceData);
            if (typeof convertedValue === 'string') {
                const num = parseFloat(convertedValue) || 0;
                const unit = convertedValue.replace(num.toString(), '');
                distanceText = `${formatNumber(num, distanceSigFigs)}\\mathrm{${unit}}`;
            } else {
                distanceText = `${formatNumber(convertedValue, distanceSigFigs)}\\mathrm{${currentUnit}}`;
            }
        }
        updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: katexFontSize, options: {textAlign: 'center', textBaseline: 'middle'} });
    }

    if (showAngles) {
        const angleBaseForArcRad = offsetAngleRad;
        let angleText;

        if (shiftPressed && !isFirstSegmentBeingDrawn && angleSnapFactor !== null) {
            angleText = formatSnapFactor(angleSnapFactor, 'A');
        } else {
            let angleToFormatDeg = isFirstSegmentBeingDrawn ? normalizeAngleDegrees(snappedAngleDegAbs) : (angleTurn !== null ? angleTurn * (180 / Math.PI) : normalizeAngleToPi(snappedAngleDegAbs * (Math.PI/180) - offsetAngleRad) * (180/Math.PI));
             if (angleToFormatDeg > 180.001 && Math.abs(angleToFormatDeg - 360) < 179.999 && !isFirstSegmentBeingDrawn) {
                 angleToFormatDeg -= 360;
            }
            angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
        }

        const signedTurningAngleRad = angleTurn !== null ? angleTurn : normalizeAngleToPi(snappedAngleDegAbs * (Math.PI/180) - offsetAngleRad);
        
        const arcRadius = 30;
        const textRadius = arcRadius + 15;
        let bisectorAngleForText;

        // Check if the turn is exactly +/- 180 degrees, which has an ambiguous bisector
        if (Math.abs(Math.abs(signedTurningAngleRad) - Math.PI) < 1e-9) {
            // Place text at 90 degrees to the base line, in the direction of the turn
            bisectorAngleForText = angleBaseForArcRad + (Math.PI / 2) * Math.sign(signedTurningAngleRad);
        } else {
            // For all other angles, find the bisector by adding the start and end angle vectors
            const endAngle = angleBaseForArcRad + signedTurningAngleRad;
            const bisectorVecX = Math.cos(angleBaseForArcRad) + Math.cos(endAngle);
            const bisectorVecY = Math.sin(angleBaseForArcRad) + Math.sin(endAngle);
            bisectorAngleForText = Math.atan2(bisectorVecY, bisectorVecX);
        }

        const angleTextX = startScreen.x + Math.cos(bisectorAngleForText) * textRadius;
        const angleTextY = startScreen.y - Math.sin(bisectorAngleForText) * textRadius;
        updateHtmlLabel({ id: 'snap-angle', content: angleText, x: angleTextX, y: angleTextY, color: currentElementColor, fontSize: katexFontSize, options: {textAlign: 'center', textBaseline: 'middle'} });
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

    if (showGrid) {
        const r = parseInt(gridColor.slice(1, 3), 16);
        const g = parseInt(gridColor.slice(3, 5), 16);
        const b = parseInt(gridColor.slice(5, 7), 16);

        const topLeftData = screenToData({ x: 0, y: 0 });
        const bottomRightData = screenToData({ x: actualCanvasWidth, y: actualCanvasHeight });

        const viewMinX = Math.min(topLeftData.x, bottomRightData.x);
        const viewMaxX = Math.max(topLeftData.x, bottomRightData.x);
        const viewMinY = Math.min(topLeftData.y, bottomRightData.y);
        const viewMaxY = Math.max(topLeftData.y, bottomRightData.y);

        const targetScreenSpacing = 80;
        const effectiveDataInterval = targetScreenSpacing / viewTransform.scale;

        const lowerPowerOf10 = Math.pow(10, Math.floor(Math.log10(effectiveDataInterval)));
        const higherPowerOf10 = Math.pow(10, Math.ceil(Math.log10(effectiveDataInterval)));

        let grid1Interval, grid2Interval;
        let alpha1, alpha2;

        let logInterpFactor = 0;
        if (higherPowerOf10 > lowerPowerOf10 * 1.0001) {
             logInterpFactor = (Math.log10(effectiveDataInterval) - Math.log10(lowerPowerOf10)) / (Math.log10(higherPowerOf10) - Math.log10(lowerPowerOf10));
        }
        
        const smoothstep = (x) => x * x * (3 - 2 * x);

        const transitionZoneStart = 0.2;
        const transitionZoneEnd = 0.8;

        let interpValue = (logInterpFactor - transitionZoneStart) / (transitionZoneEnd - transitionZoneStart);
        interpValue = Math.max(0, Math.min(1, interpValue));
        interpValue = smoothstep(interpValue);
        
        grid1Interval = lowerPowerOf10;
        grid2Interval = higherPowerOf10;
        
        alpha1 = 1 - interpValue;
        alpha2 = interpValue;

        if (grid1Interval === grid2Interval) {
            grid2Interval = null;
            alpha1 = 1;
            alpha2 = 0;
        }

        const drawGridLayer = (interval, alpha) => {
            if (interval === null || alpha <= 0.001) return;
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${gridAlpha * alpha})`;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${gridAlpha * alpha})`;
            const startGridX = Math.floor(viewMinX / interval) * interval;
            const endGridX = Math.ceil(viewMaxX / interval) * interval;
            const startGridY = Math.floor(viewMinY / interval) * interval;
            const endGridY = Math.ceil(viewMaxY / interval) * interval;
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

    const drawingContextForReferences = previewLineStartPointId ? getDrawingContext(previewLineStartPointId) : null;
    if (currentShiftPressed && drawingContextForReferences && (drawingContextForReferences.frozen_Origin_Data_to_display || !drawingContextForReferences.isFirstSegmentBeingDrawn)) {
        if (drawingContextForReferences.frozen_Origin_Data_to_display) {
            drawReferenceElementsGeometry(drawingContextForReferences, currentShiftPressed);
            prepareReferenceElementsTexts(drawingContextForReferences, currentShiftPressed);
        } else if (!drawingContextForReferences.isFirstSegmentBeingDrawn) {
            prepareReferenceElementsTexts(drawingContextForReferences, currentShiftPressed);
        }
    }

    drawAllEdges();
    const pointsToDraw = allPoints.map(p => {
        if (isDragConfirmed && dragPreviewPoints.length > 0) {
            const preview = dragPreviewPoints.find(dp => dp.id === p.id);
            return preview || p;
        }
        return p;
    });
    pointsToDraw.forEach(point => drawPoint(point));

    if (isDrawingMode && previewLineStartPointId && !isDragConfirmed && !isRectangleSelecting && !isActionInProgress) {
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
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = LINE_WIDTH;
            ctx.stroke();
            ctx.setLineDash([]);
            if (showAngles) {
                const angleBaseForArcRad = drawingContext.offsetAngleRad;
                const currentLineAbsoluteAngleRad = snappedData.angle * (Math.PI / 180);
                const signedTurningAngleRad = snappedData.angleTurn !== null ? snappedData.angleTurn : normalizeAngleToPi(currentLineAbsoluteAngleRad - angleBaseForArcRad);
                const arcEndAngleForSweepRad = angleBaseForArcRad + signedTurningAngleRad;
                const arcRadius = 30;
                let currentArcColor = currentShiftPressed ? 'rgba(230, 230, 100, 0.8)' : 'rgba(200, 200, 200, 0.7)';
                drawAngleArc(startScreen, angleBaseForArcRad, arcEndAngleForSweepRad, arcRadius, currentArcColor, false);
                ctx.save();
                ctx.beginPath();
                const baseExtDataX = startPoint.x + Math.cos(angleBaseForArcRad) * 30 / viewTransform.scale;
                const baseExtDataY = startPoint.y + Math.sin(angleBaseForArcRad) * 30 / viewTransform.scale;
                const baseExtScreen = dataToScreen({ x: baseExtDataX, y: baseExtDataY });
                ctx.moveTo(startScreen.x, startScreen.y);
                ctx.lineTo(baseExtScreen.x, baseExtScreen.y);
                ctx.strokeStyle = 'rgba(180, 180, 180, 0.6)';
                ctx.setLineDash([2, 3]);
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
            }
            prepareSnapInfoTexts(startPoint, targetPosData, snappedData, currentShiftPressed, drawingContext);
        }
    }

    if (previewAltSnapOnEdge && previewAltSnapOnEdge.pointData) {
        const snapMarkerPosScreen = dataToScreen(previewAltSnapOnEdge.pointData);
        ctx.beginPath();
        ctx.arc(snapMarkerPosScreen.x, snapMarkerPosScreen.y, POINT_RADIUS * 0.8, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200, 200, 0, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    if (isRectangleSelecting && isDragConfirmed && currentMouseButton === 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash(DASH_PATTERN);
        const rX = Math.min(rectangleSelectStartPos.x, mousePos.x);
        const rY = Math.min(rectangleSelectStartPos.y, mousePos.y);
        const rW = Math.abs(rectangleSelectStartPos.x - mousePos.x);
        const rH = Math.abs(rectangleSelectStartPos.y - mousePos.y);
        ctx.strokeRect(rX, rY, rW, rH);
        ctx.setLineDash([]);
        ctx.lineWidth = LINE_WIDTH;
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


colorPicker.addEventListener('input', (event) => setCurrentColor(event.target.value));
canvas.addEventListener('wheel', (event) => {
    event.preventDefault(); const mouseScreen = getMousePosOnCanvas(event, canvas);
    const scaleFactor = event.deltaY > 0 ? 1/1.15 : 1.15;
    zoomAt(mouseScreen, scaleFactor); redrawAll();
});
canvas.addEventListener('mousedown', (event) => {
    isActionInProgress = true; currentMouseButton = event.button;
    actionStartPos = getMousePosOnCanvas(event, canvas); mousePos = actionStartPos;
    isDragConfirmed = false; isRectangleSelecting = false; isTransformDrag = false; isPanningBackground = false; dragPreviewPoints = [];
    shiftKeyAtActionStart = event.shiftKey; ctrlKeyAtActionStart = event.ctrlKey || event.metaKey;
    const altKeyAtActionStart = event.altKey;
    if (ctrlKeyAtActionStart && isDrawingMode && previewLineStartPointId) { performEscapeAction(); isActionInProgress = false; return; }
    if (currentMouseButton === 0) {
        let localActionTargetPoint = findClickedPoint(actionStartPos);
        if (altKeyAtActionStart) {
            if (localActionTargetPoint && localActionTargetPoint.type === 'regular') {
                saveStateForUndo(); performEscapeAction(); isDrawingMode = true; previewLineStartPointId = localActionTargetPoint.id;
                frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null; currentDrawingFirstSegmentAbsoluteAngleRad = null;
                actionTargetPoint = null; isPanningBackground = false; canvas.style.cursor = 'crosshair'; redrawAll(); return;
            } else {
                const mouseDataPosForEdgeCheck = screenToData(actionStartPos);
                const edgeClickThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
                const clickedEdgeInfo = findClosestEdgeInfo(mouseDataPosForEdgeCheck, edgeClickThresholdData);
                if (clickedEdgeInfo && clickedEdgeInfo.edge) {
                    const edgeToSplit = clickedEdgeInfo.edge;
                    const p1_orig = findPointById(edgeToSplit.id1); const p2_orig = findPointById(edgeToSplit.id2);
                    if (p1_orig && p2_orig) {
                        saveStateForUndo();
                        const dx = p2_orig.x - p1_orig.x; const dy = p2_orig.y - p1_orig.y;
                        let t_on_edge = clickedEdgeInfo.pointOnEdge.t;
                        const snapped_t = snapTValue(t_on_edge, SEGMENT_SNAP_FRACTIONS);
                        let startDrawFromPointId;
                        if (snapped_t > 0.0001 && snapped_t < 0.9999) {
                            const newPointX = p1_orig.x + snapped_t * dx; const newPointY = p1_orig.y + snapped_t * dy;
                            const newPoint = {id: generateUniqueId(), x: newPointX, y: newPointY, type: 'regular', color: currentColor};
                            allPoints.push(newPoint); startDrawFromPointId = newPoint.id;
                            allEdges = allEdges.filter(e => !((e.id1 === edgeToSplit.id1 && e.id2 === edgeToSplit.id2) || (e.id1 === edgeToSplit.id2 && e.id2 === edgeToSplit.id1)));
                            allEdges.push({ id1: p1_orig.id, id2: newPoint.id }); allEdges.push({ id1: newPoint.id, id2: p2_orig.id });
                        } else if (snapped_t <= 0.0001) { startDrawFromPointId = p1_orig.id; } else { startDrawFromPointId = p2_orig.id; }
                        performEscapeAction(); isDrawingMode = true; previewLineStartPointId = startDrawFromPointId;
                        frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null; currentDrawingFirstSegmentAbsoluteAngleRad = null;
                        actionTargetPoint = null; isPanningBackground = false; canvas.style.cursor = 'crosshair'; redrawAll(); return;
                    }
                }
                actionTargetPoint = localActionTargetPoint;
            }
        }
        if (!actionTargetPoint) actionTargetPoint = findClickedPoint(actionStartPos);
        if (actionTargetPoint) {
            canvas.style.cursor = 'grabbing'; isPanningBackground = false;
            const activeCenterPoint = activeCenterId ? findPointById(activeCenterId) : null;
            if (activeCenterPoint && selectedPointIds.length > 0 && (selectedPointIds.includes(actionTargetPoint.id) || actionTargetPoint.id === activeCenterId)) {
                isTransformDrag = true; initialCenterStateForTransform = { ...activeCenterPoint };
                initialStatesForTransform = selectedPointIds.map(id => {
                    const p = findPointById(id); if (!p) return null;
                    return {id: p.id, x: p.x, y: p.y, originalAngleToCenter: Math.atan2(p.y - activeCenterPoint.y, p.x - activeCenterPoint.x), originalDistanceToCenter: distance(p, activeCenterPoint) };
                }).filter(p => p);
                const dataStartPos = screenToData(actionStartPos);
                initialMouseAngleToCenter = Math.atan2(dataStartPos.y - activeCenterPoint.y, dataStartPos.x - activeCenterPoint.x);
                initialMouseDistanceToCenter = distance(dataStartPos, activeCenterPoint);
                dragPreviewPoints = initialStatesForTransform.map(isp => ({ ...findPointById(isp.id) }));
                if (!dragPreviewPoints.find(dp => dp.id === activeCenterId) && activeCenterPoint) { dragPreviewPoints.push({ ...activeCenterPoint }); }
            } else {
                isTransformDrag = false; let pointsToConsiderForDrag = [];
                if (selectedPointIds.includes(actionTargetPoint.id) || actionTargetPoint.id === activeCenterId) {
                    pointsToConsiderForDrag = selectedPointIds.map(id => findPointById(id)).filter(p => p);
                    if (activeCenterId && !pointsToConsiderForDrag.find(p => p.id === activeCenterId)) { const center = findPointById(activeCenterId); if (center) pointsToConsiderForDrag.push(center); }
                } else { pointsToConsiderForDrag = [actionTargetPoint]; }
                dragPreviewPoints = pointsToConsiderForDrag.map(p => ({ ...p }));
            }
        } else {
            const mouseDataPosForEdgeCheck = screenToData(actionStartPos);
            const edgeClickThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
            const clickedEdgeInfo = findClosestEdgeInfo(mouseDataPosForEdgeCheck, edgeClickThresholdData);
            if (clickedEdgeInfo && clickedEdgeInfo.edge && !altKeyAtActionStart) {
                const edgeToDrag = clickedEdgeInfo.edge; const p1 = findPointById(edgeToDrag.id1); const p2 = findPointById(edgeToDrag.id2);
                if (p1 && p2) {
                    actionTargetPoint = p1; dragPreviewPoints = [{...p1}, {...p2}]; canvas.style.cursor = 'grabbing'; isPanningBackground = false; isDrawingMode = false; previewLineStartPointId = null;
                    frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null; currentDrawingFirstSegmentAbsoluteAngleRad = null;
                    if (!shiftKeyAtActionStart && !ctrlKeyAtActionStart) { selectedPointIds = [p1.id, p2.id]; activeCenterId = null; }
                    else { applySelectionLogic([p1.id, p2.id], shiftKeyAtActionStart, ctrlKeyAtActionStart, false); }
                } else { isPanningBackground = true; canvas.style.cursor = 'move'; backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY }; }
            } else {
                isPanningBackground = true; canvas.style.cursor = 'move'; backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
                if (!isDrawingMode && !altKeyAtActionStart) { frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null; }
            }
        }
    } else if (currentMouseButton === 2) { event.preventDefault(); actionTargetPoint = null; dragPreviewPoints = []; rectangleSelectStartPos = actionStartPos; canvas.style.cursor = 'default'; }
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

canvas.addEventListener('mousemove', (event) => {
    mousePos = getMousePosOnCanvas(event, canvas);
    const oldShiftPressed = currentShiftPressed;
    currentShiftPressed = event.shiftKey;
    const currentAltPressed = event.altKey;
    let needsRedraw = false;

    const mouseData = screenToData(mousePos);
    const displayX = convertToDisplayUnits(mouseData.x);
    const displayY = convertToDisplayUnits(mouseData.y);

    if (typeof window.katex !== 'undefined') {
        let xValueForDisplay = displayX;
        let yValueForDisplay = displayY;

        if (typeof displayX === 'string') {
            xValueForDisplay = parseFloat(displayX) || 0;
            yValueForDisplay = parseFloat(displayY) || 0;
        }

        katex.render(formatNumber(xValueForDisplay, distanceSigFigs), mouseCoordXElement, { throwOnError: false, displayMode: false });
        katex.render(formatNumber(yValueForDisplay, distanceSigFigs), mouseCoordYElement, { throwOnError: false, displayMode: false });
    } else {
        mouseCoordXElement.textContent = typeof displayX === 'string' ? displayX : formatNumber(displayX, distanceSigFigs);
        mouseCoordYElement.textContent = typeof displayY === 'string' ? displayY : formatNumber(displayY, distanceSigFigs);
    }

    if (currentAltPressed && !isActionInProgress) {
        const mouseDataPos = screenToData(mousePos);
        const edgeHoverThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
        const hoveredEdgeInfo = findClosestEdgeInfo(mouseDataPos, edgeHoverThresholdData);

        if (hoveredEdgeInfo && hoveredEdgeInfo.edge) {
            const edge = hoveredEdgeInfo.edge;
            const p1 = findPointById(edge.id1);
            const p2 = findPointById(edge.id2);

            if (p1 && p2) {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const lenSq = dx * dx + dy * dy;
                let t = 0;
                if (lenSq > 1e-9) t = ((mouseDataPos.x - p1.x) * dx + (mouseDataPos.y - p1.y) * dy) / lenSq;
                t = Math.max(0, Math.min(1, t));
                const snappedT = snapTValue(t, SEGMENT_SNAP_FRACTIONS);
                const snappedPointData = { x: p1.x + snappedT * dx, y: p1.y + snappedT * dy };
                const currentEdgeIdentifier = edge.id1 < edge.id2 ? edge.id1 + edge.id2 : edge.id2 + edge.id1;
                let previewEdgeIdentifier = null;
                if (previewAltSnapOnEdge && previewAltSnapOnEdge.edge) {
                    const prevEdge = previewAltSnapOnEdge.edge;
                    previewEdgeIdentifier = prevEdge.id1 < prevEdge.id2 ? prevEdge.id1 + prevEdge.id2 : prevEdge.id2 + prevEdge.id1;
                }
                if (!previewAltSnapOnEdge || previewEdgeIdentifier !== currentEdgeIdentifier || previewAltSnapOnEdge.pointData.x !== snappedPointData.x || previewAltSnapOnEdge.pointData.y !== snappedPointData.y) {
                    previewAltSnapOnEdge = { edge: edge, pointData: snappedPointData, t_snapped: snappedT };
                    needsRedraw = true;
                }
            } else {
                if (previewAltSnapOnEdge !== null) {
                    previewAltSnapOnEdge = null;
                    needsRedraw = true;
                }
            }
        } else {
            if (previewAltSnapOnEdge !== null) {
                previewAltSnapOnEdge = null;
                needsRedraw = true;
            }
        }
    } else {
        if (previewAltSnapOnEdge !== null) {
            previewAltSnapOnEdge = null;
            needsRedraw = true;
        }
    }

    if (!isActionInProgress) {
        const hoveredPoint = findClickedPoint(mousePos);
        if (hoveredPoint) canvas.style.cursor = 'grab';
        else if (currentAltPressed && previewAltSnapOnEdge) canvas.style.cursor = 'crosshair';
        else if (!currentAltPressed) {
            const mouseDataPos = screenToData(mousePos);
            const edgeHoverThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
            const hoveredEdgeForSelect = findClosestEdgeInfo(mouseDataPos, edgeHoverThresholdData);
            if (hoveredEdgeForSelect) canvas.style.cursor = 'grab';
            else canvas.style.cursor = 'crosshair';
        } else canvas.style.cursor = 'crosshair';
        if (isDrawingMode && previewLineStartPointId) needsRedraw = true;
        if (oldShiftPressed !== currentShiftPressed && isDrawingMode && previewLineStartPointId) needsRedraw = true;
        if (needsRedraw) redrawAll();
        return;
    }

    if (!isDragConfirmed && distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
        isDragConfirmed = true;
        if (currentMouseButton === 2 && !actionTargetPoint) {
            isRectangleSelecting = true;
            isDrawingMode = false;
            previewLineStartPointId = null;
            frozenReference_A_rad = null;
            frozenReference_A_baseRad = null;
            frozenReference_D_du = null;
            frozenReference_Origin_Data = null;
            canvas.style.cursor = 'default';
        } else if (currentMouseButton === 0 && actionTargetPoint) {
            isRectangleSelecting = false;
            canvas.style.cursor = 'grabbing';
        } else if (currentMouseButton === 0 && isPanningBackground) {
            canvas.style.cursor = 'move';
        }
        needsRedraw = true;
    }

    if (isDragConfirmed) {
        if (currentMouseButton === 0) {
            if (isPanningBackground) {
                const deltaX_css = mousePos.x - actionStartPos.x;
                const deltaY_css = mousePos.y - actionStartPos.y;
                viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
                viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
            } else if (actionTargetPoint) {
                if (isTransformDrag && initialCenterStateForTransform && activeCenterId) {
                    const activeCenterCurrentPreview = dragPreviewPoints.find(p => p.id === activeCenterId);
                    if (!activeCenterCurrentPreview) {
                        isTransformDrag = false;
                        redrawAll();
                        return;
                    }
                    let currentCenterPosData = { x: initialCenterStateForTransform.x, y: initialCenterStateForTransform.y };
                    if (actionTargetPoint.id === activeCenterId) {
                        const mouseData = screenToData(mousePos);
                        const actionStartData = screenToData(actionStartPos);
                        currentCenterPosData.x = initialCenterStateForTransform.x + (mouseData.x - actionStartData.x);
                        currentCenterPosData.y = initialCenterStateForTransform.y + (mouseData.y - actionStartData.y);
                        activeCenterCurrentPreview.x = currentCenterPosData.x;
                        activeCenterCurrentPreview.y = currentCenterPosData.y;
                    } else {
                        currentCenterPosData = { x: activeCenterCurrentPreview.x, y: activeCenterCurrentPreview.y };
                    }
                    const centerDef = findPointById(activeCenterId);
                    if (!centerDef) {
                        isTransformDrag = false;
                        redrawAll();
                        return;
                    }
                    const doRotation = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_rotate_only';
                    const doScaling = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_scale_only';
                    let overallDeltaAngle = 0;
                    let overallScaleFactor = 1;
                    const mouseDataCurrent = screenToData(mousePos);
                    const mouseVecX = mouseDataCurrent.x - currentCenterPosData.x;
                    const mouseVecY = mouseDataCurrent.y - currentCenterPosData.y;
                    if (doRotation) {
                        const currentMouseAngleRelCenter = Math.atan2(mouseVecY, mouseVecX);
                        overallDeltaAngle = currentMouseAngleRelCenter - initialMouseAngleToCenter;
                    }
                    if (doScaling) {
                        const currentMouseDistRelCenter = Math.sqrt(mouseVecX * mouseVecX + mouseVecY * mouseVecY);
                        if (initialMouseDistanceToCenter > 0.001) overallScaleFactor = currentMouseDistRelCenter / initialMouseDistanceToCenter;
                    }
                    initialStatesForTransform.forEach(initialPtState => {
                        const pointToUpdateInPreview = dragPreviewPoints.find(dp => dp.id === initialPtState.id);
                        if (!pointToUpdateInPreview) return;
                        let relX = initialPtState.x - initialCenterStateForTransform.x;
                        let relY = initialPtState.y - initialCenterStateForTransform.y;
                        if (doScaling) {
                            relX *= overallScaleFactor;
                            relY *= overallScaleFactor;
                        }
                        if (doRotation) {
                            const rX = relX * Math.cos(overallDeltaAngle) - relY * Math.sin(overallDeltaAngle);
                            const rY = relX * Math.sin(overallDeltaAngle) + relY * Math.cos(overallDeltaAngle);
                            relX = rX;
                            relY = rY;
                        }
                        pointToUpdateInPreview.x = currentCenterPosData.x + relX;
                        pointToUpdateInPreview.y = currentCenterPosData.y + relY;
                    });
                } else {
                    const mouseData = screenToData(mousePos);
                    const actionStartData = screenToData(actionStartPos);
                    const deltaX = mouseData.x - actionStartData.x;
                    const deltaY = mouseData.y - actionStartData.y;
                    dragPreviewPoints.forEach(previewPointRef => {
                        const originalPointFromAllPoints = allPoints.find(ap => ap.id === previewPointRef.id);
                        if (originalPointFromAllPoints) {
                            const previewPointToUpdate = dragPreviewPoints.find(dp => dp.id === previewPointRef.id);
                            if (previewPointToUpdate) {
                                previewPointToUpdate.x = originalPointFromAllPoints.x + deltaX;
                                previewPointToUpdate.y = originalPointFromAllPoints.y + deltaY;
                            }
                        }
                    });
                }
            }
        }
        needsRedraw = true;
    }
    if (needsRedraw) redrawAll();
});

canvas.addEventListener('mouseup', (event) => {
    if (!isActionInProgress || event.button !== currentMouseButton) return;
    if (isDragConfirmed) {
        if (isPanningBackground) isPanningBackground = false;
        else if (dragPreviewPoints.length > 0 && currentMouseButton === 0 && actionTargetPoint) {
            saveStateForUndo();
            dragPreviewPoints.forEach(dp => { const actualPoint = findPointById(dp.id); if (actualPoint) { actualPoint.x = dp.x; actualPoint.y = dp.y; } });
            if (!isTransformDrag && !selectedPointIds.includes(actionTargetPoint.id) && actionTargetPoint.id !== activeCenterId) {
                if (!shiftKeyAtActionStart && !ctrlKeyAtActionStart) {
                    selectedPointIds = (actionTargetPoint.type === 'regular') ? [actionTargetPoint.id] : [];
                    activeCenterId = (actionTargetPoint.type !== 'regular') ? actionTargetPoint.id : null;
                    if (selectedPointIds.length > 0 || activeCenterId) { isDrawingMode = false; previewLineStartPointId = null; frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null;}
                }
            }
        } else if (currentMouseButton === 2 && isRectangleSelecting) {
            const rX1 = rectangleSelectStartPos.x; const rY1 = rectangleSelectStartPos.y; const rX2 = mousePos.x; const rY2 = mousePos.y;
            const dataP1 = screenToData({ x: Math.min(rX1, rX2), y: Math.min(rY1, rY2) }); const dataP2 = screenToData({ x: Math.max(rX1, rX2), y: Math.max(rY1, rY2) });
            const minX = Math.min(dataP1.x, dataP2.x); const maxX = Math.max(dataP1.x, dataP2.x); const minY = Math.min(dataP1.y, dataP2.y); const maxY = Math.max(dataP1.y, dataP2.y);
            const pointsInRect = allPoints.filter(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
            const regularPointIdsInRect = pointsInRect.filter(p => p.type === 'regular').map(p => p.id);
            const centerPointsInRect = pointsInRect.filter(p => p.type !== 'regular');
            applySelectionLogic(regularPointIdsInRect, shiftKeyAtActionStart, ctrlKeyAtActionStart, false);
            if (centerPointsInRect.length > 0) applySelectionLogic([centerPointsInRect[centerPointsInRect.length-1].id], shiftKeyAtActionStart, ctrlKeyAtActionStart, true);
            isDrawingMode = false; previewLineStartPointId = null; frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null;
        }
    } else {
        if (currentMouseButton === 0) {
            if (actionTargetPoint) {
                if (isDrawingMode && previewLineStartPointId) {
                    const p_start_of_committed_segment = findPointById(previewLineStartPointId);
                    const p_end_of_committed_segment = actionTargetPoint;
                    if (previewLineStartPointId !== actionTargetPoint.id && actionTargetPoint.type === 'regular') {
                        saveStateForUndo();
                        if (p_start_of_committed_segment) {
                            const contextBeforeCommit = getDrawingContext(p_start_of_committed_segment.id);
                            const committedSegmentAbsoluteAngle = Math.atan2(p_end_of_committed_segment.y - p_start_of_committed_segment.y, p_end_of_committed_segment.x - p_start_of_committed_segment.x);
                            const committedSegmentLength = distance(p_start_of_committed_segment, p_end_of_committed_segment);
                            frozenReference_Origin_Data = { x: p_start_of_committed_segment.x, y: p_start_of_committed_segment.y };
                            frozenReference_D_du = committedSegmentLength;
                            if (contextBeforeCommit.isFirstSegmentBeingDrawn) { frozenReference_A_baseRad = 0; frozenReference_A_rad = normalizeAngle(committedSegmentAbsoluteAngle); }
                            else { frozenReference_A_baseRad = contextBeforeCommit.offsetAngleRad; frozenReference_A_rad = normalizeAngleToPi(committedSegmentAbsoluteAngle - contextBeforeCommit.offsetAngleRad); }
                        }
                        allEdges.push({ id1: previewLineStartPointId, id2: actionTargetPoint.id });
                        previewLineStartPointId = actionTargetPoint.id;
                    } else if (actionTargetPoint.type !== 'regular') { applySelectionLogic([actionTargetPoint.id], shiftKeyAtActionStart, ctrlKeyAtActionStart, true); performEscapeAction(); }
                } else {
                    const now = Date.now(); let pointsForSelection = [actionTargetPoint.id]; const isCenterTarget = actionTargetPoint.type !== 'regular';
                    if (actionTargetPoint.id === clickData.pointId && (now - clickData.timestamp < DOUBLE_CLICK_MS)) clickData.count++;
                    else { clickData.count = 1; clickData.pointId = actionTargetPoint.id; }
                    clickData.timestamp = now;
                    if (!isCenterTarget) {
                        if (clickData.count === 3) { pointsForSelection = findAllPointsInSubgraph(actionTargetPoint.id); clickData.count = 0; }
                        else if (clickData.count === 2) pointsForSelection = [actionTargetPoint.id, ...findNeighbors(actionTargetPoint.id)];
                    }
                    applySelectionLogic(pointsForSelection, shiftKeyAtActionStart, ctrlKeyAtActionStart, isCenterTarget);
                    if (selectedPointIds.length > 0 || activeCenterId) { isDrawingMode = false; previewLineStartPointId = null; frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null;}
                }
            } else {
                const now = Date.now();
                if (now - lastCanvasClickTime < DOUBLE_CLICK_MS && !shiftKeyAtActionStart && !ctrlKeyAtActionStart) performEscapeAction();
                else {
                    if (isDrawingMode && previewLineStartPointId) {
                        saveStateForUndo(); const startPoint = findPointById(previewLineStartPointId);
                        const drawingContext = getDrawingContext(startPoint.id);
                        const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed);
                        const newPoint = { id: generateUniqueId(), x: snappedData.x, y: snappedData.y, type: 'regular', color: currentColor };
                        allPoints.push(newPoint);
                        if (startPoint) {
                            const committedSegmentAbsoluteAngle = Math.atan2(newPoint.y - startPoint.y, newPoint.x - startPoint.x);
                            const committedSegmentLength = distance(startPoint, newPoint);
                            frozenReference_Origin_Data = { x: startPoint.x, y: startPoint.y };
                            frozenReference_D_du = committedSegmentLength;
                            if (drawingContext.isFirstSegmentBeingDrawn) { frozenReference_A_baseRad = 0; frozenReference_A_rad = normalizeAngle(committedSegmentAbsoluteAngle); }
                            else { frozenReference_A_baseRad = drawingContext.offsetAngleRad; frozenReference_A_rad = normalizeAngleToPi(committedSegmentAbsoluteAngle - drawingContext.offsetAngleRad); }
                        }
                        allEdges.push({ id1: previewLineStartPointId, id2: newPoint.id });
                        previewLineStartPointId = newPoint.id;
                    } else if (!isDrawingMode && !ctrlKeyAtActionStart) {
                        if (!shiftKeyAtActionStart && (selectedPointIds.length > 0 || activeCenterId)) performEscapeAction();
                        else {
                            saveStateForUndo(); const mouseDataPos = screenToData(mousePos);
                            const newPoint = { id: generateUniqueId(), x: mouseDataPos.x, y: mouseDataPos.y, type: 'regular', color: currentColor };
                            allPoints.push(newPoint); previewLineStartPointId = newPoint.id; isDrawingMode = true;
                            selectedPointIds = []; activeCenterId = null;
                            frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null;
                        }
                    }
                }
                lastCanvasClickTime = now;
            }
        } else if (currentMouseButton === 2) performEscapeAction();
    }
    isActionInProgress = false; isDragConfirmed = false; isRectangleSelecting = false; isTransformDrag = false; isPanningBackground = false;
    actionTargetPoint = null; dragPreviewPoints = []; currentMouseButton = -1;
    redrawAll();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    if (event.key === 'Shift') { currentShiftPressed = true; if (isDrawingMode && previewLineStartPointId) redrawAll(); }
    const allowedDuringAction = ['Shift', 'Control', 'Meta', 'Alt', 'Escape', 'Delete', 'Backspace'];
    if (isActionInProgress && !allowedDuringAction.includes(event.key) && !(isCtrlOrCmd && ['c','x','v','z','y','a','=','-'].includes(event.key.toLowerCase())) ) return;
    if (event.key === 'Escape') performEscapeAction();
    else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelectedPoints();
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'c') { event.preventDefault(); handleCopy(); }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'x') { event.preventDefault(); handleCut(); }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'v') { event.preventDefault(); handlePaste(); }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); handleUndo(); }
    else if (isCtrlOrCmd && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) { event.preventDefault(); handleRedo(); }
    else if (isCtrlOrCmd && event.key === '=') { event.preventDefault(); const centerScreen = { x: (canvas.width/dpr)/2, y: (canvas.height/dpr)/2 }; zoomAt(centerScreen, 1.2); redrawAll(); }
    else if (isCtrlOrCmd && event.key === '-') { event.preventDefault(); const centerScreen = { x: (canvas.width/dpr)/2, y: (canvas.height/dpr)/2 }; zoomAt(centerScreen, 1/1.2); redrawAll(); }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'a') {
        event.preventDefault(); selectedPointIds = allPoints.filter(p => p.type === 'regular').map(p => p.id);
        if (!activeCenterId && allPoints.some(p => p.type !== 'regular')) activeCenterId = allPoints.find(p => p.type !== 'regular').id;
        isDrawingMode = false; previewLineStartPointId = null; frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null; redrawAll();
    } else if (['c', 'r', 's'].includes(event.key.toLowerCase()) && !isCtrlOrCmd && !isActionInProgress) {
        event.preventDefault(); saveStateForUndo(); performEscapeAction();
        let type;
        if (event.key.toLowerCase() === 'c') type = 'center_rotate_scale';
        else if (event.key.toLowerCase() === 'r') type = 'center_rotate_only';
        else if (event.key.toLowerCase() === 's') type = 'center_scale_only';
        const mouseDataPos = screenToData(mousePos);
        const newCenter = { id: generateUniqueId(), x: mouseDataPos.x, y: mouseDataPos.y, type: type, color: currentColor };
        allPoints.push(newCenter); activeCenterId = newCenter.id; redrawAll();
    }
});
window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') { currentShiftPressed = false; if (isDrawingMode && previewLineStartPointId || (isActionInProgress && isDragConfirmed)) redrawAll(); }
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