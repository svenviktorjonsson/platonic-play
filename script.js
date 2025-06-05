const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const colorPalette = document.getElementById('colorPalette');

const POINT_RADIUS = 5;
const CENTER_POINT_VISUAL_RADIUS = POINT_RADIUS * 2;
const POINT_SELECT_RADIUS = 10;
const LINE_WIDTH = 2;
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

const SNAP_ANGLE_FRACTIONS_FOR_A_DISPLAY = ANGLE_SNAP_FRACTIONS;
const SNAP_LENGTH_FACTORS = [0.1, 0.2, 0.25, 1/3, 0.4, 0.5, 2/3, 0.75, 0.8, 0.9, 1, 1.25, 1.5, 5/3, 2, 2.5, 3, 4, 5, 10];

const tempSegmentSnapFactorsForAlt = SNAP_LENGTH_FACTORS.filter(f => f > 0 && f <= 1);
const SEGMENT_SNAP_FRACTIONS = [...new Set([0, ...tempSegmentSnapFactorsForAlt, 1])].sort((a,b)=>a-b);


function formatNumber(value, sigFigs) {
    if (value === 0) return "0";
    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";

    if (absValue >= 1000 || (absValue !== 0 && absValue < 0.001)) {
        return sign + absValue.toExponential(Math.max(0, sigFigs - 1));
    } else {
        const integerDigits = absValue < 1 ? 0 : Math.floor(Math.log10(absValue)) + 1;
        let decimalPlacesToDisplay;
        if (absValue === 0) {
            decimalPlacesToDisplay = sigFigs -1;
        } else if (absValue < 1) {
            let k = 0;
            let temp = absValue;
            while (temp < 1 && k < sigFigs + 5) {
                temp *= 10;
                k++;
            }
            decimalPlacesToDisplay = Math.max(0, (k -1) + sigFigs);
        } else {
            decimalPlacesToDisplay = Math.max(0, sigFigs - integerDigits);
        }
        decimalPlacesToDisplay = Math.min(decimalPlacesToDisplay, 10);
        let fixedStr = absValue.toFixed(decimalPlacesToDisplay);
        return sign + parseFloat(fixedStr).toString();
    }
}

function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

function generateAngleSnapFractions(maxDenominator, maxResultingMultipleOfBase) {
    const fractionsSet = new Set();
    fractionsSet.add(0);
    for (let q = 1; q <= maxDenominator; q++) {
        for (let p = 1; p <= q * maxResultingMultipleOfBase; p++) {
            fractionsSet.add(p / q);
        }
    }
    return Array.from(fractionsSet).sort((a, b) => a - b);
}

function generateUniqueId() { return crypto.randomUUID(); }

function normalizeAngle(angleRad) {
    while (angleRad < 0) angleRad += 2 * Math.PI;
    while (angleRad >= 2 * Math.PI) angleRad -= 2 * Math.PI;
    return angleRad;
}

function normalizeAngleToPi(angleRad) {
    angleRad = normalizeAngle(angleRad);
    if (angleRad > Math.PI) {
        angleRad -= 2 * Math.PI;
    }
    return angleRad;
}

function normalizeAngleDegrees(angleDeg) {
    while (angleDeg < 0) angleDeg += 360;
    while (angleDeg >= 360) angleDeg -= 360;
    return angleDeg;
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

function snapTValue(t, fractions, snapThreshold = 0.05) { // snapThreshold relative to 1.0 span of t
    let bestSnappedT = t;
    let minDiff = snapThreshold;

    if (t < -snapThreshold || t > 1 + snapThreshold) { // If t is way outside [0,1] reasonable bounds
        return Math.max(0, Math.min(1, t)); // Just clamp it without snapping to fractions
    }

    for (const snapFraction of fractions) {
        const diff = Math.abs(t - snapFraction);
        if (diff < minDiff) {
            minDiff = diff;
            bestSnappedT = snapFraction;
        }
    }
    // Ensure the result is strictly within [0,1] if it snapped near boundaries
    return Math.max(0, Math.min(1, bestSnappedT));
}

function snapToAngle(targetAngleRad, offsetAngleRad) {
    if (isNaN(targetAngleRad) || isNaN(offsetAngleRad)) {
        return isNaN(offsetAngleRad) ? 0 : offsetAngleRad;
    }
    let bestSnappedAngleRad = offsetAngleRad;
    let minAngleDifference = Math.PI * 2 + 1;
    const baseReferenceAngleForSnapping = Math.PI / 2;

    for (const fraction of ANGLE_SNAP_FRACTIONS) {
        const snapIncrementRad = baseReferenceAngleForSnapping * fraction;
        const potentialSnapAngleCCW = normalizeAngle(offsetAngleRad + snapIncrementRad);
        let diffCCW = Math.abs(normalizeAngleToPi(targetAngleRad - potentialSnapAngleCCW));
        if (diffCCW < minAngleDifference) {
            minAngleDifference = diffCCW;
            bestSnappedAngleRad = potentialSnapAngleCCW;
        }
        if (fraction !== 0) {
            const potentialSnapAngleCW = normalizeAngle(offsetAngleRad - snapIncrementRad);
            let diffCW = Math.abs(normalizeAngleToPi(targetAngleRad - potentialSnapAngleCW));
            if (diffCW < minAngleDifference) {
                minAngleDifference = diffCW;
                bestSnappedAngleRad = potentialSnapAngleCW;
            }
        }
    }
    if (minAngleDifference > Math.PI + 0.0001 && ANGLE_SNAP_FRACTIONS.length > 0) {
        bestSnappedAngleRad = normalizeAngle(offsetAngleRad);
    }
    return bestSnappedAngleRad;
}

function snapToLength(targetLength, referenceLength, snapThresholdFactor = 0.05, factors = SNAP_LENGTH_FACTORS) {
    let bestLength = targetLength;
    if (isNaN(targetLength) || isNaN(referenceLength)) return isNaN(targetLength) ? 0 : targetLength;
    if (referenceLength <= 0) return targetLength;

    // Minimum difference to trigger a snap. Max of (factor * refLength) or 1 pixel in data units.
    let minDiff = Math.max(referenceLength * snapThresholdFactor, 1 / viewTransform.scale); 
    minDiff = Math.max(minDiff, 0.00001); // ensure minDiff is positive

    let foundSnap = false;
    for (const factor of factors) { // Use the provided 'factors' array
        const snapLength = referenceLength * factor;
        const diff = Math.abs(targetLength - snapLength);
        if (diff < minDiff) {
            minDiff = diff;
            bestLength = snapLength;
            foundSnap = true;
        }
    }
    if (!foundSnap) return targetLength; 
    return bestLength;
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

function screenToData(screenPos) {
    const canvasHeight = canvas.height / dpr;
    return {
        x: (screenPos.x - viewTransform.offsetX) / viewTransform.scale,
        y: (canvasHeight - screenPos.y - viewTransform.offsetY) / viewTransform.scale
    };
}

function dataToScreen(dataPos) {
    const canvasHeight = canvas.height / dpr;
    return {
        x: dataPos.x * viewTransform.scale + viewTransform.offsetX,
        y: canvasHeight - (dataPos.y * viewTransform.scale + viewTransform.offsetY)
    };
}

function zoomAt(zoomCenter, scaleFactor) {
    const dataPosBeforeZoom = screenToData(zoomCenter);
    const oldScale = viewTransform.scale;
    viewTransform.scale *= scaleFactor;
    viewTransform.scale = Math.max(0.01, Math.min(viewTransform.scale, 20000));

    if (Math.abs(viewTransform.scale - oldScale) < 0.00001) return;

    const screenPosAfterZoom = dataToScreen(dataPosBeforeZoom); 

    viewTransform.offsetX += zoomCenter.x - screenPosAfterZoom.x;
    viewTransform.offsetY += screenPosAfterZoom.y - zoomCenter.y;
}

function resizeCanvas() {
    const canvasContainer = document.querySelector('.canvas-container');
    const cW = canvasContainer.offsetWidth; const cH = canvasContainer.offsetHeight;
    canvas.width = cW * dpr; canvas.height = cH * dpr;
    canvas.style.width = `${cW}px`; canvas.style.height = `${cH}px`;
    redrawAll();
}

function getMousePosOnCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function distance(p1, p2) { return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)); }
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

function formatFraction(decimal, tolerance = 0.015, maxDisplayDenominator = 32) {
    if (Math.abs(decimal) < 0.0001) return "0";
    if (Math.abs(decimal - Math.round(decimal)) < tolerance) return Math.round(decimal).toString();
    
    // Predefined common fractions to check first
    const fractions = [
        [1,2],[1,3],[2,3],[1,4],[3,4],[1,5],[2,5],[3,5],[4,5],[1,6],[5,6],
        [1,8],[3,8],[5,8],[7,8],[1,10],[1,12]
    ];

    for (const [num, den] of fractions) { 
        if (den <= maxDisplayDenominator) { // Only consider if denominator is within the allowed limit
            if (Math.abs(Math.abs(decimal) - num/den) < tolerance) {
                return (decimal < 0 ? "-" : "") + `${num}/${den}`; 
            }
        }
    }

    const sign = decimal < 0 ? "-" : ""; 
    const absDecimal = Math.abs(decimal);

    // Loop to find the best fraction up to maxDisplayDenominator
    for (let currentDen = 1; currentDen <= maxDisplayDenominator; currentDen++) {
        const currentNum = Math.round(absDecimal * currentDen); 
        if (currentNum === 0 && absDecimal !==0) continue;

        // Check if this fraction is within tolerance
        if (Math.abs(absDecimal - currentNum / currentDen) < tolerance / currentDen) { // tolerance scaled by 1/den for higher den
            const common = gcd(currentNum, currentDen); 
            if (currentDen/common === 1) return sign + `${currentNum/common}`; // Integer
            return sign + `${currentNum/common}/${currentDen/common}`; 
        }
    }

    // Fallback if no good fraction is found within limits (should be rare if inputs are from snaps)
    return sign + absDecimal.toFixed(absDecimal < 1 ? 2 : (absDecimal < 10 ? 1 : 0));
}

function getRelativeAngleDisplay(currentAngleDegrees, referenceAngleDegrees) {
    if (referenceAngleDegrees < 0.1) return `${formatNumber(currentAngleDegrees, angleSigFigs)}°`;

    let displayTurnDeg = normalizeAngleDegrees(currentAngleDegrees);
    // For ratios, usually the shortest turn magnitude is preferred
    if (displayTurnDeg > 180 && Math.abs(displayTurnDeg - 360) < 179.999) { // Check to avoid issues if displayTurnDeg is exactly 180
        displayTurnDeg = 360 - displayTurnDeg; // Use the smaller magnitude, sign will be handled by ratio
    }
    // Note: The original code used displayTurnDeg = 360 - displayTurnDeg if > 180, effectively making it always positive or using the explementary.
    // For ratio, it's currentAngleDegrees (which can be signed for turn direction) / referenceAngleDegrees (magnitude).
    // Let's use currentAngleDegrees directly for the ratio's sign, and magnitudes for comparison.
    
    const normRefAngleDeg = normalizeAngleDegrees(referenceAngleDegrees);
    if (Math.abs(normRefAngleDeg) < 0.1) return `${formatNumber(currentAngleDegrees, angleSigFigs)}°`; // Avoid division by zero

    const ratio = currentAngleDegrees / normRefAngleDeg; 
    
    // Call formatFraction with max denominator for angles (6)
    const fractionStr = formatFraction(ratio, 0.03, MAX_FRACTION_DENOMINATOR_FOR_ANGLE_SNAPS); 

    if (fractionStr === "0") return `0 A`; 
    if (fractionStr === "1") return `A`; 
    if (fractionStr === "-1") return `-A`;

    // Handle cases like "2/1 A" -> "2A"
    if (fractionStr.endsWith("/1")) return `${fractionStr.slice(0, -2)} A`;

    // Handle "1/2 A" -> "A/2" or "-1/2 A" -> "-A/2"
    if (fractionStr.startsWith("1/")) return `A/${fractionStr.split('/')[1]}`; 
    if (fractionStr.startsWith("-1/")) return `-A/${fractionStr.split('/')[1]}`;
    
    return `${fractionStr} A`; // e.g., "2/3 A", "-3/4 A"
}

function getRelativeDistanceDisplay(currentDistance, referenceDistance) {
    if (referenceDistance < 0.0001) return `${formatNumber(convertToDisplayUnits(currentDistance), distanceSigFigs)}${currentUnit}`;

    const ratio = currentDistance / referenceDistance;
    // Call formatFraction with max denominator (e.g., 6, same as angles for consistency)
    const fractionStr = formatFraction(ratio, 0.02, MAX_FRACTION_DENOMINATOR_FOR_ANGLE_SNAPS); 

    if (fractionStr === "0") return `0 D`; 
    if (fractionStr === "1") return `D`;
    // No negative distances, so no "-1 D" case needed for D.

    // Handle "2/1 D" -> "2D"
    if (fractionStr.endsWith("/1")) return `${fractionStr.slice(0, -2)} D`;

    // Handle "1/2 D" -> "D/2"
    // And general fractions like "numD/den"
    if (fractionStr.includes('/')) { 
        const parts = fractionStr.split('/'); 
        if (parts.length === 2) {
            if (parts[0] === "1") return `D/${parts[1]}`; // "D/2", "D/3"
            // For "2D/3", "3D/4" etc.
            return `${parts[0]}D/${parts[1]}`; 
        }
    }
    // Fallback for other cases, e.g. if formatFraction returned just an integer not ending in /1
    return `${fractionStr} D`; 
}

function getSnappedPosition(startPoint, mouseScreenPos, shiftPressed) {
    const mouseDataPos = screenToData(mouseScreenPos);
    const dxInitial = mouseDataPos.x - startPoint.x; const dyInitial = mouseDataPos.y - startPoint.y;
    let currentDistance = Math.sqrt(dxInitial*dxInitial + dyInitial*dyInitial); if (isNaN(currentDistance)) currentDistance = 0;
    let currentAngleRad = Math.atan2(dyInitial, dxInitial); if (isNaN(currentAngleRad)) currentAngleRad = 0;
    let snappedX = mouseDataPos.x; let snappedY = mouseDataPos.y; let finalAngleRad = currentAngleRad; let finalDistance = currentDistance; let didSnap = false;
    const snapRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;

    for (const p of allPoints) {
        if (p.id !== startPoint.id && p.type === 'regular') {
            if (distance(mouseDataPos, p) < snapRadiusData) {
                snappedX = p.x; snappedY = p.y; finalDistance = distance(startPoint, {x:snappedX, y:snappedY}); finalAngleRad = Math.atan2(snappedY-startPoint.y, snappedX-startPoint.x);
                if(isNaN(finalAngleRad)) finalAngleRad = 0; if(isNaN(finalDistance)) finalDistance = 0;
                return { x: snappedX, y: snappedY, angle: finalAngleRad*(180/Math.PI), distance: finalDistance, snapped: true };
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
                return { x: snappedX, y: snappedY, angle: finalAngleRad*(180/Math.PI), distance: finalDistance, snapped: true };
            }
        }
    }

    if (shiftPressed) {
        const drawingContext = getDrawingContext(startPoint.id);
        const offsetAngleForSnap = drawingContext.offsetAngleRad; 
        let snappedAngleRad = snapToAngle(currentAngleRad, offsetAngleForSnap); if (isNaN(snappedAngleRad)) snappedAngleRad = offsetAngleForSnap;
        let relMouseAngleToSnappedLine = normalizeAngleToPi(currentAngleRad - snappedAngleRad); if (isNaN(relMouseAngleToSnappedLine)) relMouseAngleToSnappedLine = 0;
        let projectedDist = currentDistance * Math.cos(relMouseAngleToSnappedLine); if (isNaN(projectedDist)) projectedDist = currentDistance;
        projectedDist = Math.max(0, projectedDist); 

        let snappedAbsDistance_data;

        if (drawingContext.isFirstSegmentBeingDrawn) {
            const metersPerDataUnit = DEFAULT_CALIBRATION_VIEW_SCALE / 100.0;
            // Avoid division by zero if metersPerDataUnit is somehow zero
            const reference_1_meter_in_data_units = metersPerDataUnit > 1e-9 ? (1.0 / metersPerDataUnit) : projectedDist; 
            
            // Use snapToLength with a 1-meter reference (in data units) and the new initial factors
            // projectedDist is already in data units.
            snappedAbsDistance_data = snapToLength(
                projectedDist, 
                reference_1_meter_in_data_units, 
                0.05, // Default snapThresholdFactor
                INITIAL_DISTANCE_SNAP_FACTORS
            );
        } else { // Not the first segment, use existing D-relative snapping
            const referenceDistanceForSnap = drawingContext.currentSegmentReferenceD;
            snappedAbsDistance_data = snapToLength(projectedDist, referenceDistanceForSnap); // Uses default SNAP_LENGTH_FACTORS
        }
        
        if (isNaN(snappedAbsDistance_data)) snappedAbsDistance_data = projectedDist;
        snappedAbsDistance_data = Math.max(0, snappedAbsDistance_data);

        finalAngleRad = snappedAngleRad; 
        finalDistance = snappedAbsDistance_data; 
        didSnap = true; 
        snappedX = startPoint.x + Math.cos(finalAngleRad) * finalDistance; 
        snappedY = startPoint.y + Math.sin(finalAngleRad) * finalDistance;
        if (isNaN(snappedX) || isNaN(snappedY)) { 
            snappedX = startPoint.x; 
            snappedY = startPoint.y; 
            finalDistance = 0; 
        }
    }
    return { x: snappedX, y: snappedY, angle: finalAngleRad*(180/Math.PI), distance: finalDistance, snapped: didSnap };
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

function getClosestPointOnLineSegment(p, a, b) {
    const abx = b.x - a.x; const aby = b.y - a.y; const acx = p.x - a.x; const acy = p.y - a.y;
    const lenSqAB = abx * abx + aby * aby;
    if (lenSqAB === 0) return { x: a.x, y: a.y, distance: distance(p, a), onSegmentStrict: true };
    let t = (acx * abx + acy * aby) / lenSqAB;
    const onSegmentStrict = t > 0.00001 && t < 0.99999;
    t = Math.max(0, Math.min(1, t));
    const closestX = a.x + t * abx; const closestY = a.y + t * aby;
    const dist = distance(p, { x: closestX, y: closestY });
    return { x: closestX, y: closestY, distance: dist, onSegmentStrict: onSegmentStrict };
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
    ctx.arc(centerScreen.x, centerScreen.y, radius, canvasStartAngle, canvasEndAngle, signedAngleDiffData >= 0);
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

function drawReferenceElements(context, shiftPressed) {
    if (!shiftPressed || (!showAngles && !showDistances)) return;
    const { isFirstSegmentBeingDrawn } = context;
    if (isFirstSegmentBeingDrawn) { 
        return; 
    }

    const {
        displayAngleA_valueRad_for_A_equals_label, // This is frozenReference_A_rad
        frozen_A_baseRad_to_display,             // This is frozenReference_A_baseRad
        frozen_D_du_to_display,                  // This is frozenReference_D_du
        frozen_Origin_Data_to_display            // This is frozenReference_Origin_Data
    } = context;

    if (!frozen_Origin_Data_to_display) return;

    ctx.save();
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const refElementColor = 'rgba(240, 240, 130, 0.9)';
    const refElementTextColor = 'rgba(240, 240, 130, 1)';
    const textOutlineColor = 'rgba(50,50,0,0.6)';

    const frozenOriginScreen = dataToScreen(frozen_Origin_Data_to_display);

    if (showDistances && frozen_D_du_to_display !== null && frozen_D_du_to_display > 0.0001) {
        ctx.lineWidth = 3; // For text outline
        let frozenSegmentTipX, frozenSegmentTipY;
        let actualAngleOfFrozenSegment;

        // Determine the absolute angle of the frozen reference segment D
        // frozen_A_rad_to_display is the turn angle from frozen_A_baseRad_to_display
        if (frozen_A_baseRad_to_display === null && displayAngleA_valueRad_for_A_equals_label !== null) {
            actualAngleOfFrozenSegment = displayAngleA_valueRad_for_A_equals_label; // Base is 0, A_rad is absolute
        } else if (frozen_A_baseRad_to_display !== null && displayAngleA_valueRad_for_A_equals_label !== null) {
            actualAngleOfFrozenSegment = frozen_A_baseRad_to_display + displayAngleA_valueRad_for_A_equals_label; // Base + turn
        } else {
            actualAngleOfFrozenSegment = frozen_A_baseRad_to_display !== null ? frozen_A_baseRad_to_display : 0; // Use base if A_rad is null, else 0
        }
        
        frozenSegmentTipX = frozen_Origin_Data_to_display.x + frozen_D_du_to_display * Math.cos(actualAngleOfFrozenSegment);
        frozenSegmentTipY = frozen_Origin_Data_to_display.y + frozen_D_du_to_display * Math.sin(actualAngleOfFrozenSegment);

        const frozenSegmentTipScreen = dataToScreen({x: frozenSegmentTipX, y: frozenSegmentTipY});

        ctx.beginPath();
        ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y);
        ctx.lineTo(frozenSegmentTipScreen.x, frozenSegmentTipScreen.y);
        ctx.strokeStyle = refElementColor; ctx.setLineDash(DASH_PATTERN); ctx.lineWidth=1; ctx.stroke(); ctx.setLineDash([]);
        
        const midX_D = (frozenOriginScreen.x + frozenSegmentTipScreen.x) / 2;
        const midY_D = (frozenOriginScreen.y + frozenSegmentTipScreen.y) / 2;
        const lineAngle_D = Math.atan2(frozenSegmentTipScreen.y - frozenOriginScreen.y, frozenSegmentTipScreen.x - frozenOriginScreen.x);
        const textPerpAngle_D = lineAngle_D - Math.PI / 2;
        const textDistLabelX_D = midX_D + Math.cos(textPerpAngle_D) * 15;
        const textDistLabelY_D = midY_D + Math.sin(textPerpAngle_D) * 15;
        
        let dDisplayText;
        const dValueConverted = convertToDisplayUnits(frozen_D_du_to_display);
        if (typeof dValueConverted === 'string') { // If convertToDisplayUnits returned a pre-formatted string (e.g., "12.3mm")
            dDisplayText = dValueConverted;
        } else { // It returned a number, so format it and append currentUnit
            dDisplayText = `${formatNumber(dValueConverted, distanceSigFigs)}${currentUnit}`;
        }
        const dText = `D = ${dDisplayText}`;
        
        ctx.lineWidth = 3; ctx.strokeStyle = textOutlineColor; ctx.strokeText(dText, textDistLabelX_D, textDistLabelY_D);
        ctx.fillStyle = refElementTextColor; ctx.fillText(dText, textDistLabelX_D, textDistLabelY_D);
    }

    if (showAngles && displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(displayAngleA_valueRad_for_A_equals_label) > 0.001) {
        ctx.lineWidth = 3; // For text outline
        const arcRadius_A = 35;
        const startAngleForA_arc_Rad = frozen_A_baseRad_to_display !== null ? frozen_A_baseRad_to_display : 0;
        const endAngleForA_arc_Rad = startAngleForA_arc_Rad + displayAngleA_valueRad_for_A_equals_label;

        const baseLineEndData_A = { 
            x: frozen_Origin_Data_to_display.x + Math.cos(startAngleForA_arc_Rad)*(arcRadius_A*1.2/viewTransform.scale), 
            y: frozen_Origin_Data_to_display.y + Math.sin(startAngleForA_arc_Rad)*(arcRadius_A*1.2/viewTransform.scale) 
        };
        const baseLineEndScreen_A = dataToScreen(baseLineEndData_A);
        ctx.beginPath(); 
        ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y); 
        ctx.lineTo(baseLineEndScreen_A.x, baseLineEndScreen_A.y);
        ctx.strokeStyle = refElementColor; ctx.setLineDash(DASH_PATTERN); ctx.lineWidth=1; ctx.stroke();

        const refLineA_EndData = { 
            x: frozen_Origin_Data_to_display.x + Math.cos(endAngleForA_arc_Rad)*(arcRadius_A*1.2/viewTransform.scale), 
            y: frozen_Origin_Data_to_display.y + Math.sin(endAngleForA_arc_Rad)*(arcRadius_A*1.2/viewTransform.scale) 
        };
        const refLineA_EndScreen = dataToScreen(refLineA_EndData);
        ctx.beginPath(); 
        ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y); 
        ctx.lineTo(refLineA_EndScreen.x, refLineA_EndScreen.y); 
        // No need to setLineDash again if it's already set for the previous line, stroke with same style
        ctx.stroke(); 
        ctx.setLineDash([]); // Reset after drawing dashed lines

        drawAngleArc(frozenOriginScreen, startAngleForA_arc_Rad, endAngleForA_arc_Rad, arcRadius_A, refElementColor, true);
        
        const bisectorAngle_A = startAngleForA_arc_Rad + displayAngleA_valueRad_for_A_equals_label / 2;
        const textAngleLabelX_A = frozenOriginScreen.x + Math.cos(bisectorAngle_A) * (arcRadius_A + 15);
        // Corrected Y for text label to match typical canvas text rendering (Y positive down for text offset)
        const textAngleLabelY_A = frozenOriginScreen.y - Math.sin(bisectorAngle_A) * (arcRadius_A + 15); 
        
        const aValueDeg = displayAngleA_valueRad_for_A_equals_label * (180 / Math.PI);
        const aText = `A = ${formatNumber(aValueDeg, angleSigFigs)}°`; // formatNumber expects a number, aValueDeg is number. This is fine.

        ctx.lineWidth = 3; ctx.strokeStyle = textOutlineColor; ctx.strokeText(aText, textAngleLabelX_A, textAngleLabelY_A);
        ctx.fillStyle = refElementTextColor; ctx.fillText(aText, textAngleLabelX_A, textAngleLabelY_A);
    }
    ctx.restore();
}

function snapToSignificantPower(targetValue, threshold) {
    if (Math.abs(targetValue) < 1e-9) return targetValue;

    const sign = Math.sign(targetValue);
    const val = Math.abs(targetValue);

    let bestSnap = val;
    let minAbsoluteDiffFromVal = threshold;
    let foundSnap = false;

    const orderOfMagnitude = Math.pow(10, Math.floor(Math.log10(val)));

    const scalesToTest = [orderOfMagnitude / 10, orderOfMagnitude, orderOfMagnitude * 10];

    for (const scale of scalesToTest) {
        if (scale < 1e-7) continue;

        for (let p = 1; p <= 9; p++) {
            const snapCandidate = p * scale;
            const diff = Math.abs(val - snapCandidate);

            if (diff < minAbsoluteDiffFromVal) {
                minAbsoluteDiffFromVal = diff;
                bestSnap = snapCandidate;
                foundSnap = true;
            } else if (diff === minAbsoluteDiffFromVal) {
            }
        }
    }
    return foundSnap ? sign * bestSnap : targetValue;
}

function findClosestEdgeInfo(dataPos, thresholdData) {
    let closestEdge = null;
    let closestPointInfo = null;
    let minDistance = thresholdData;

    for (const edge of allEdges) {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);

        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
            const ptInfo = getClosestPointOnLineSegment(dataPos, p1, p2);
            
            // We are interested if the mouse is close to the segment line itself,
            // and the closest point on that infinite line falls within the segment.
            if (ptInfo.distance < minDistance && ptInfo.t > -0.00001 && ptInfo.t < 1.00001) { // Check if t is effectively [0,1]
                minDistance = ptInfo.distance;
                closestEdge = edge;
                closestPointInfo = {
                    x: ptInfo.x,
                    y: ptInfo.y,
                    t: ptInfo.t, // t parameter relative to p1-p2
                    onSegmentStrict: ptInfo.onSegmentStrict // if strictly between endpoints
                };
            }
        }
    }

    if (closestEdge) {
        return {
            edge: closestEdge,
            pointOnEdge: closestPointInfo, // This is the projected point of dataPos onto the edge
            distanceToMouse: minDistance   // This is distance from dataPos to pointOnEdge
        };
    }
    return null;
}

function getClosestPointOnLineSegment(p, a, b) {
    const abx = b.x - a.x; 
    const aby = b.y - a.y; 
    const acx = p.x - a.x; 
    const acy = p.y - a.y;
    const lenSqAB = abx * abx + aby * aby;

    if (lenSqAB === 0) { // a and b are the same point
        return { 
            x: a.x, 
            y: a.y, 
            distance: distance(p, a), 
            onSegmentStrict: true, // Technically on the "segment" which is just a point
            t: 0 // Or undefined, as t is degenerate. Let's use 0.
        };
    }

    let t = (acx * abx + acy * aby) / lenSqAB;
    const onSegmentStrict = t > 0.00001 && t < 0.99999; // Consider point on segment if t is strictly between 0 and 1
    
    const clampedT = Math.max(0, Math.min(1, t)); // Clamp t to be between 0 and 1 for projection onto segment

    const closestX = a.x + clampedT * abx; 
    const closestY = a.y + clampedT * aby;
    const dist = distance(p, { x: closestX, y: closestY });

    return { 
        x: closestX, 
        y: closestY, 
        distance: dist, 
        onSegmentStrict: onSegmentStrict, // True if the projection falls strictly within segment endpoints
        t: clampedT // The t parameter (0-1) of the closest point on the segment AB
    };
}

function drawSnapInfo(startPointData, targetDataPos, snappedOutput, shiftPressed, drawingContext) {
    if (!shiftPressed && (!showAngles && !showDistances)) return;

    const startScreen = dataToScreen(startPointData);
    const targetScreen = dataToScreen(targetDataPos);
    const { angle: snappedAngleDegAbs, distance: snappedDistanceData } = snappedOutput;
    const currentLineAbsoluteAngleRad = snappedAngleDegAbs * (Math.PI / 180);
    const {
        offsetAngleRad,
        currentSegmentReferenceD,
        currentSegmentReferenceA_for_display, // This is in radians
        isFirstSegmentBeingDrawn
    } = drawingContext;

    ctx.save();
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const midX = (startScreen.x + targetScreen.x) / 2;
    const midY = (startScreen.y + targetScreen.y) / 2;
    const visualLineAngleScreen = Math.atan2(targetScreen.y - startScreen.y, targetScreen.x - startScreen.x);
    const textPerpAngle = visualLineAngleScreen - Math.PI / 2;
    const textOffset = 18;

    let currentElementColor = shiftPressed ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';
    let currentArcColor = shiftPressed ? 'rgba(230, 230, 100, 0.8)' : 'rgba(200, 200, 200, 0.7)';
    let currentTextOutlineColor = shiftPressed ? 'rgba(50,50,0,0.6)' : 'rgba(20, 20, 20, 0.7)';
    
    const signedTurningAngleRad = normalizeAngleToPi(currentLineAbsoluteAngleRad - offsetAngleRad);

    if (showDistances) {
        ctx.lineWidth = 3;
        ctx.fillStyle = currentElementColor;
        ctx.strokeStyle = currentTextOutlineColor;
        const distanceTextX = midX + Math.cos(textPerpAngle) * textOffset;
        const distanceTextY = midY + Math.sin(textPerpAngle) * textOffset;
        let distanceText;
        
        if (shiftPressed) {
            if (isFirstSegmentBeingDrawn) { 
                const convertedDistanceValue = convertToDisplayUnits(snappedDistanceData);
                if (typeof convertedDistanceValue === 'string') {
                    distanceText = convertedDistanceValue;
                } else { 
                    distanceText = `${formatNumber(convertedDistanceValue, distanceSigFigs)}${currentUnit}`;
                }
            } else { // Shift pressed, AND extending an existing line
                const relativeDistStr = getRelativeDistanceDisplay(snappedDistanceData, currentSegmentReferenceD);
                distanceText = "D = " + relativeDistStr;
            }
        } else { // Not shift pressed: always absolute units
            const convertedDistanceValue = convertToDisplayUnits(snappedDistanceData);
            if (typeof convertedDistanceValue === 'string') {
                distanceText = convertedDistanceValue;
            } else {
                distanceText = `${formatNumber(convertedDistanceValue, distanceSigFigs)}${currentUnit}`;
            }
        }
        if (distanceText && distanceText.trim() !== "") { 
            ctx.strokeText(distanceText, distanceTextX, distanceTextY);
            ctx.fillText(distanceText, distanceTextX, distanceTextY);
        }
    }

    if (showAngles) {
        const angleBaseForArcRad = offsetAngleRad;
        const baseExtDataX = startPointData.x + Math.cos(angleBaseForArcRad) * 30 / viewTransform.scale;
        const baseExtDataY = startPointData.y + Math.sin(angleBaseForArcRad) * 30 / viewTransform.scale;
        const baseExtScreen = dataToScreen({ x: baseExtDataX, y: baseExtDataY });
        ctx.beginPath();
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(baseExtScreen.x, baseExtScreen.y);
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.6)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        const arcEndAngleForSweepRad = angleBaseForArcRad + signedTurningAngleRad;
        const arcRadius = 30;
        
        let angleLabel = "";
        const displayTurnDegSigned = signedTurningAngleRad * (180 / Math.PI);

        if (shiftPressed) {
            if (isFirstSegmentBeingDrawn) { 
                let angleToFormatDeg = normalizeAngleDegrees(snappedAngleDegAbs);
                if (angleToFormatDeg > 180.001 && Math.abs(angleToFormatDeg - 360) < 179.999 ) {
                    angleLabel = `${formatNumber(angleToFormatDeg - 360, angleSigFigs)}°`;
                } else {
                    angleLabel = `${formatNumber(angleToFormatDeg, angleSigFigs)}°`;
                }
            } else { // Shift pressed, AND extending an existing line
                const referenceAngleForADeg = currentSegmentReferenceA_for_display * (180 / Math.PI);
                const relativeAngleStr = getRelativeAngleDisplay(displayTurnDegSigned, referenceAngleForADeg);
                // "we should not use angles" - getRelativeAngleDisplay returns degrees if ref angle is too small.
                // This is acceptable as "pA/q" is not meaningful then.
                if (relativeAngleStr && relativeAngleStr.trim() !== "") {
                    angleLabel = "A = " + relativeAngleStr;
                } else {
                    angleLabel = ""; 
                }
            }
        } else { // Not shift pressed
            if (isFirstSegmentBeingDrawn) {
                let angleToFormatDeg = normalizeAngleDegrees(snappedAngleDegAbs);
                if (angleToFormatDeg > 180.001 && Math.abs(angleToFormatDeg - 360) < 179.999 ) {
                    angleLabel = `${formatNumber(angleToFormatDeg - 360, angleSigFigs)}°`;
                } else {
                    angleLabel = `${formatNumber(angleToFormatDeg, angleSigFigs)}°`;
                }
            } else { 
                angleLabel = `${formatNumber(displayTurnDegSigned, angleSigFigs)}°`;
            }
        }
        
        if (angleLabel && angleLabel.trim() !== "") { 
            ctx.fillStyle = currentElementColor;
            ctx.strokeStyle = currentTextOutlineColor;
            ctx.lineWidth = 3;

            drawAngleArc(startScreen, angleBaseForArcRad, arcEndAngleForSweepRad, arcRadius, currentArcColor, false);

            const bisectorAngleForText = angleBaseForArcRad + signedTurningAngleRad / 2;
            const angleTextRadius = arcRadius + 15;
            const angleTextX = startScreen.x + Math.cos(bisectorAngleForText) * angleTextRadius;
            const angleTextY = startScreen.y - Math.sin(bisectorAngleForText) * angleTextRadius; 
            
            ctx.strokeText(angleLabel, angleTextX, angleTextY);
            ctx.fillText(angleLabel, angleTextX, angleTextY);
        }
    }
    ctx.restore();
}

function redrawAll() {
    const actualCanvasWidth = canvas.width / dpr; 
    const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform(); 
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a1a'; 
    ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);
    
    const drawingContextForReferences = previewLineStartPointId ? getDrawingContext(previewLineStartPointId) : null;
    if (currentShiftPressed && drawingContextForReferences && !drawingContextForReferences.isFirstSegmentBeingDrawn) {
        drawReferenceElements(drawingContextForReferences, currentShiftPressed);
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
            
            drawSnapInfo(startPoint, targetPosData, snappedData, currentShiftPressed, drawingContext);
        }
    }

    if (previewAltSnapOnEdge && previewAltSnapOnEdge.pointData) {
        const snapMarkerPosScreen = dataToScreen(previewAltSnapOnEdge.pointData);
        ctx.beginPath();
        ctx.arc(snapMarkerPosScreen.x, snapMarkerPosScreen.y, POINT_RADIUS * 0.8, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)'; // Yellowish, semi-transparent
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
}

colorPicker.addEventListener('input', (event) => setCurrentColor(event.target.value));
canvas.addEventListener('wheel', (event) => {
    event.preventDefault(); const mouseScreen = getMousePosOnCanvas(event);
    const scaleFactor = event.deltaY > 0 ? 1/1.15 : 1.15;
    zoomAt(mouseScreen, scaleFactor); redrawAll();
});

canvas.addEventListener('mousedown', (event) => {
    isActionInProgress = true;
    currentMouseButton = event.button;
    actionStartPos = getMousePosOnCanvas(event);
    mousePos = actionStartPos;
    isDragConfirmed = false;
    isRectangleSelecting = false;
    isTransformDrag = false;
    isPanningBackground = false;
    dragPreviewPoints = [];
    shiftKeyAtActionStart = event.shiftKey;
    ctrlKeyAtActionStart = event.ctrlKey || event.metaKey;
    const altKeyAtActionStart = event.altKey;

    if (ctrlKeyAtActionStart && isDrawingMode && previewLineStartPointId) {
        performEscapeAction();
        isActionInProgress = false;
        return;
    }

    if (currentMouseButton === 0) {
        let localActionTargetPoint = findClickedPoint(actionStartPos);

        if (altKeyAtActionStart) {
            if (localActionTargetPoint && localActionTargetPoint.type === 'regular') {
                saveStateForUndo(); performEscapeAction(); isDrawingMode = true;
                previewLineStartPointId = localActionTargetPoint.id;
                frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null;
                currentDrawingFirstSegmentAbsoluteAngleRad = null; 
                actionTargetPoint = null; // Clear global actionTargetPoint
                isPanningBackground = false;
                canvas.style.cursor = 'crosshair'; redrawAll(); return;
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
                        } else if (snapped_t <= 0.0001) { startDrawFromPointId = p1_orig.id;
                        } else { startDrawFromPointId = p2_orig.id; }
                        performEscapeAction(); isDrawingMode = true; previewLineStartPointId = startDrawFromPointId;
                        frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null;
                        currentDrawingFirstSegmentAbsoluteAngleRad = null; 
                            actionTargetPoint = null; // Clear global actionTargetPoint
                            isPanningBackground = false;
                        canvas.style.cursor = 'crosshair'; redrawAll(); return;
                    }
                }
                // If Alt was pressed but not on a regular point or edge, localActionTargetPoint might be a center, or null.
                // Fall through to use localActionTargetPoint for normal drag if it's a center.
                actionTargetPoint = localActionTargetPoint; // Use the initially found point if any
            }
        } // End of if (altKeyAtActionStart) specific logic paths that return


        // If we reach here, an Alt-specific action that returns was NOT taken.
        // actionTargetPoint is either from findClickedPoint (if no Alt or Alt on center), 
        // or it was explicitly nulled by an Alt-action that returned (but then we wouldn't be here).
        // So, actionTargetPoint is the result of findClickedPoint if Alt didn't intervene and return.
        // If Alt was pressed but didn't hit a regular point or edge, actionTargetPoint is findClickedPoint's result.

        if (!actionTargetPoint) { // If it's still null after findClickedPoint and non-returning Alt paths
            actionTargetPoint = findClickedPoint(actionStartPos);
        }

        if (actionTargetPoint) { // A point (regular or center) was clicked
            canvas.style.cursor = 'grabbing';
            isPanningBackground = false; // Explicitly not panning if a point is targeted
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
            } else { // Regular point drag (or center point drag if not transform)
                isTransformDrag = false; 
                let pointsToConsiderForDrag = [];
                if (selectedPointIds.includes(actionTargetPoint.id) || actionTargetPoint.id === activeCenterId) {
                    pointsToConsiderForDrag = selectedPointIds.map(id => findPointById(id)).filter(p => p);
                    if (activeCenterId && !pointsToConsiderForDrag.find(p => p.id === activeCenterId)) { const center = findPointById(activeCenterId); if (center) pointsToConsiderForDrag.push(center); }
                } else { pointsToConsiderForDrag = [actionTargetPoint]; }
                dragPreviewPoints = pointsToConsiderForDrag.map(p => ({ ...p }));
            }
        } else { // No point clicked directly (and not an Alt-action that returned)
            const mouseDataPosForEdgeCheck = screenToData(actionStartPos);
            const edgeClickThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
            const clickedEdgeInfo = findClosestEdgeInfo(mouseDataPosForEdgeCheck, edgeClickThresholdData);

            if (clickedEdgeInfo && clickedEdgeInfo.edge && !altKeyAtActionStart) { // Check !altKeyAtActionStart for segment drag
                const edgeToDrag = clickedEdgeInfo.edge;
                const p1 = findPointById(edgeToDrag.id1);
                const p2 = findPointById(edgeToDrag.id2);
                if (p1 && p2) {
                    actionTargetPoint = p1; 
                    dragPreviewPoints = [{...p1}, {...p2}];
                    canvas.style.cursor = 'grabbing';
                    isPanningBackground = false;
                    isDrawingMode = false; 
                    previewLineStartPointId = null;
                    frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null;
                    currentDrawingFirstSegmentAbsoluteAngleRad = null;

                    if (!shiftKeyAtActionStart && !ctrlKeyAtActionStart) {
                        selectedPointIds = [p1.id, p2.id];
                        activeCenterId = null;
                    } else {
                        applySelectionLogic([p1.id, p2.id], shiftKeyAtActionStart, ctrlKeyAtActionStart, false);
                    }
                } else {
                    isPanningBackground = true; canvas.style.cursor = 'move';
                    backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
                }
            } else { // No point, no segment clicked (or Alt was pressed and missed targets) -> Pan
                isPanningBackground = true; canvas.style.cursor = 'move';
                backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
                if (!isDrawingMode && !altKeyAtActionStart) { 
                    frozenReference_A_rad = null; frozenReference_A_baseRad = null;
                    frozenReference_D_du = null; frozenReference_Origin_Data = null;
                }
            }
        }
    } else if (currentMouseButton === 2) {
        event.preventDefault(); actionTargetPoint = null; dragPreviewPoints = [];
        rectangleSelectStartPos = actionStartPos; canvas.style.cursor = 'default';
    }
});


canvas.addEventListener('mousemove', (event) => {
    mousePos = getMousePosOnCanvas(event);
    const oldShiftPressed = currentShiftPressed;
    currentShiftPressed = event.shiftKey;
    const currentAltPressed = event.altKey;
    let needsRedraw = false;

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
                if (lenSq > 1e-9) {
                    t = ((mouseDataPos.x - p1.x) * dx + (mouseDataPos.y - p1.y) * dy) / lenSq;
                }
                t = Math.max(0, Math.min(1, t));
                const snappedT = snapTValue(t, SEGMENT_SNAP_FRACTIONS);
                const snappedPointData = { x: p1.x + snappedT * dx, y: p1.y + snappedT * dy };

                if (!previewAltSnapOnEdge || 
                    (previewAltSnapOnEdge.edge.id1 !== edge.id1 || previewAltSnapOnEdge.edge.id2 !== edge.id2 || previewAltSnapOnEdge.edge.id1 !== edge.id2) && /* Ensure edge comparison is robust */
                    (previewAltSnapOnEdge.pointData.x !== snappedPointData.x || previewAltSnapOnEdge.pointData.y !== snappedPointData.y)) {
                    
                    // A more robust edge identity check:
                    const currentEdgeIdentifier = edge.id1 < edge.id2 ? edge.id1 + edge.id2 : edge.id2 + edge.id1;
                    let previewEdgeIdentifier = null;
                    if (previewAltSnapOnEdge && previewAltSnapOnEdge.edge) {
                        const prevEdge = previewAltSnapOnEdge.edge;
                        previewEdgeIdentifier = prevEdge.id1 < prevEdge.id2 ? prevEdge.id1 + prevEdge.id2 : prevEdge.id2 + prevEdge.id1;
                    }

                    if (!previewAltSnapOnEdge || previewEdgeIdentifier !== currentEdgeIdentifier ||
                        previewAltSnapOnEdge.pointData.x !== snappedPointData.x || previewAltSnapOnEdge.pointData.y !== snappedPointData.y) {
                        previewAltSnapOnEdge = { edge: edge, pointData: snappedPointData, t_snapped: snappedT };
                        needsRedraw = true;
                    }
                }
            } else {
                 if (previewAltSnapOnEdge !== null) { previewAltSnapOnEdge = null; needsRedraw = true; }
            }
        } else {
            if (previewAltSnapOnEdge !== null) { previewAltSnapOnEdge = null; needsRedraw = true; }
        }
    } else {
        if (previewAltSnapOnEdge !== null) { previewAltSnapOnEdge = null; needsRedraw = true; }
    }

    if (!isActionInProgress) {
        const hoveredPoint = findClickedPoint(mousePos);
        if (hoveredPoint) {
            canvas.style.cursor = 'grab';
        } else if (currentAltPressed && previewAltSnapOnEdge) { // Alt is pressed and over a snappable point on edge
            canvas.style.cursor = 'crosshair'; 
        } else if (!currentAltPressed) { // Alt is NOT pressed, check for edge hover for segment drag/select indication
            const mouseDataPos = screenToData(mousePos);
            const edgeHoverThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
            const hoveredEdgeForSelect = findClosestEdgeInfo(mouseDataPos, edgeHoverThresholdData);
            if (hoveredEdgeForSelect) {
                canvas.style.cursor = 'grab'; // Hand indicator for potential segment drag/select
            } else {
                canvas.style.cursor = 'crosshair';
            }
        } else { // Default if no other condition met (e.g. Alt pressed but no snap on edge)
             canvas.style.cursor = 'crosshair';
        }

        if (isDrawingMode && previewLineStartPointId) { needsRedraw = true; }
        if (oldShiftPressed !== currentShiftPressed && isDrawingMode && previewLineStartPointId) { needsRedraw = true; }
        if (needsRedraw) { redrawAll(); }
        return;
    }

    if (!isDragConfirmed && distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
        isDragConfirmed = true;
        if (currentMouseButton === 2 && !actionTargetPoint) { 
            isRectangleSelecting = true; isDrawingMode = false; previewLineStartPointId = null; 
            frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null; 
            canvas.style.cursor = 'default'; 
        } else if (currentMouseButton === 0 && actionTargetPoint) { 
            isRectangleSelecting = false; canvas.style.cursor = 'grabbing'; 
        } else if (currentMouseButton === 0 && isPanningBackground) { 
            canvas.style.cursor = 'move'; 
        }
        needsRedraw = true; 
    }

    if (isDragConfirmed) {
        if (currentMouseButton === 0) {
            if (isPanningBackground) {
                const deltaX = mousePos.x - actionStartPos.x; 
                const deltaY = mousePos.y - actionStartPos.y;
                viewTransform.offsetX = backgroundPanStartOffset.x + deltaX;
                viewTransform.offsetY = backgroundPanStartOffset.y - deltaY;
            } else if (actionTargetPoint) {
                if (isTransformDrag && initialCenterStateForTransform && activeCenterId) {
                    const activeCenterCurrentPreview = dragPreviewPoints.find(p => p.id === activeCenterId);
                    if (!activeCenterCurrentPreview) { isTransformDrag = false; redrawAll(); return; }
                    let currentCenterPosData = { x: initialCenterStateForTransform.x, y: initialCenterStateForTransform.y };
                    if (actionTargetPoint.id === activeCenterId) {
                        const mouseData = screenToData(mousePos); const actionStartData = screenToData(actionStartPos);
                        currentCenterPosData.x = initialCenterStateForTransform.x + (mouseData.x - actionStartData.x);
                        currentCenterPosData.y = initialCenterStateForTransform.y + (mouseData.y - actionStartData.y);
                        activeCenterCurrentPreview.x = currentCenterPosData.x; activeCenterCurrentPreview.y = currentCenterPosData.y;
                    } else { currentCenterPosData = { x: activeCenterCurrentPreview.x, y: activeCenterCurrentPreview.y }; }
                    const centerDef = findPointById(activeCenterId); if (!centerDef) { isTransformDrag = false; redrawAll(); return; }
                    const doRotation = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_rotate_only';
                    const doScaling = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_scale_only';
                    let overallDeltaAngle = 0; let overallScaleFactor = 1;
                    const mouseDataCurrent = screenToData(mousePos);
                    const mouseVecX = mouseDataCurrent.x - currentCenterPosData.x; const mouseVecY = mouseDataCurrent.y - currentCenterPosData.y;
                    if (doRotation) { const currentMouseAngleRelCenter = Math.atan2(mouseVecY, mouseVecX); overallDeltaAngle = currentMouseAngleRelCenter - initialMouseAngleToCenter; }
                    if (doScaling) { const currentMouseDistRelCenter = Math.sqrt(mouseVecX*mouseVecX + mouseVecY*mouseVecY); if (initialMouseDistanceToCenter > 0.001) overallScaleFactor = currentMouseDistRelCenter / initialMouseDistanceToCenter; }
                    initialStatesForTransform.forEach(initialPtState => {
                        const pointToUpdateInPreview = dragPreviewPoints.find(dp => dp.id === initialPtState.id); if (!pointToUpdateInPreview) return;
                        let relX = initialPtState.x - initialCenterStateForTransform.x; let relY = initialPtState.y - initialCenterStateForTransform.y;
                        if (doScaling) { relX *= overallScaleFactor; relY *= overallScaleFactor; }
                        if (doRotation) { const rX = relX*Math.cos(overallDeltaAngle) - relY*Math.sin(overallDeltaAngle); const rY = relX*Math.sin(overallDeltaAngle) + relY*Math.cos(overallDeltaAngle); relX=rX; relY=rY; }
                        pointToUpdateInPreview.x = currentCenterPosData.x + relX; pointToUpdateInPreview.y = currentCenterPosData.y + relY;
                    });
                } else {
                    const mouseData = screenToData(mousePos); const actionStartData = screenToData(actionStartPos);
                    const deltaX = mouseData.x - actionStartData.x; const deltaY = mouseData.y - actionStartData.y;
                    dragPreviewPoints.forEach(previewPointRef => {
                        const originalPointFromAllPoints = allPoints.find(ap => ap.id === previewPointRef.id);
                        if (originalPointFromAllPoints) { // Ensure original point exists
                           const previewPointToUpdate = dragPreviewPoints.find(dp => dp.id === previewPointRef.id);
                           if(previewPointToUpdate) {
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
    if (needsRedraw) {
        redrawAll();
    }
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
                            if (contextBeforeCommit.isFirstSegmentBeingDrawn) {
                                frozenReference_A_baseRad = 0; frozenReference_A_rad = normalizeAngle(committedSegmentAbsoluteAngle);
                            } else {
                                frozenReference_A_baseRad = contextBeforeCommit.offsetAngleRad; frozenReference_A_rad = normalizeAngleToPi(committedSegmentAbsoluteAngle - contextBeforeCommit.offsetAngleRad);
                            }
                        }
                        allEdges.push({ id1: previewLineStartPointId, id2: actionTargetPoint.id });
                        previewLineStartPointId = actionTargetPoint.id;
                    } else if (actionTargetPoint.type !== 'regular') {
                        applySelectionLogic([actionTargetPoint.id], shiftKeyAtActionStart, ctrlKeyAtActionStart, true);
                        performEscapeAction();
                    }
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
                            if (drawingContext.isFirstSegmentBeingDrawn) {
                                frozenReference_A_baseRad = 0; frozenReference_A_rad = normalizeAngle(committedSegmentAbsoluteAngle);
                            } else {
                                frozenReference_A_baseRad = drawingContext.offsetAngleRad; frozenReference_A_rad = normalizeAngleToPi(committedSegmentAbsoluteAngle - drawingContext.offsetAngleRad);
                            }
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
resizeCanvas();
updateColorPalette();
setCurrentColor(currentColor);
saveStateForUndo();
redrawAll();