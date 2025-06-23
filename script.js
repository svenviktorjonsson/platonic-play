import {
    solveForPoint,
    generateUniqueId,
    normalizeAngleToPi,
    distance,
    getClosestPointOnLineSegment,
    getMousePosOnCanvas,
    getLineCircleIntersection,
    getLineLineIntersection,
    getNearestGridPoints,
    invertGrayscaleValue,
    getCurrentTheme,
    calculateRotationAngle
} from './utils.js';

import {
    BASE_THEME,
    DEFAULT_RECENT_COLORS,

    // --- GEOMETRY & DRAWING ---
    POINT_RADIUS,
    MERGE_RADIUS_SCREEN,
    CENTER_POINT_VISUAL_RADIUS,
    POINT_SELECT_RADIUS,
    LINE_WIDTH,
    DASH_PATTERN,

    // --- INTERACTION ---
    DOUBLE_CLICK_MS,
    DRAG_THRESHOLD,
    EDGE_CLICK_THRESHOLD,
    EDGE_ID_DELIMITER,
    MIN_SCALE_VALUE,
    ZOOM_FACTOR,
    KEYBOARD_ZOOM_FACTOR,
    GRID_SNAP_THRESHOLD_FACTOR,
    BISECTOR_LINE_EXTENSION_FACTOR,

    // --- DEFAULTS ---
    DEFAULT_CALIBRATION_VIEW_SCALE,
    DEFAULT_REFERENCE_DISTANCE,
    DEFAULT_REFERENCE_ANGLE_RAD,

    // --- UI & TOOLBAR ---
    UI_BUTTON_PADDING,
    UI_TOOLBAR_WIDTH,
    UI_SWATCH_SIZE,
    MENU_BUTTON_WIDTH,
    MENU_BUTTON_HEIGHT,
    TOOLBAR_SECTION_GAP,
    TOOL_BUTTON_HEIGHT,
    DISPLAY_ICON_SIZE,
    DISPLAY_ICON_PADDING,
    TRANSFORM_ICON_SIZE,
    TRANSFORM_ICON_PADDING,
    TRANSFORM_ICON_Y_OFFSET,
    UI_SYMMETRY_TOOL_LABEL_FONT_SIZE,
    UI_SYMMETRY_TOOL_LABEL_TEXT,
    COLOR_PALETTE_Y_OFFSET,

    // --- SNAPPING PARAMETERS ---
    GEOMETRY_CALCULATION_EPSILON,
    SNAP_STICKINESS_RADIUS_SCREEN,
    LINE_TO_SNAP_RADIUS_SCREEN,
    POINT_ON_LINE_SNAP_RADIUS_SCREEN,
    DRAG_SNAP_GEOMETRIC_DISTANCE_FACTORS,
    DRAW_SNAP_DISTANCE_FACTOR_STEP,
    DRAW_SNAP_DISTANCE_FACTOR_LIMIT,
    MAX_HISTORY_SIZE,
    NINETY_DEG_ANGLE_SNAP_FRACTIONS,
    SNAP_FACTORS,

    // --- ENUMS & LITERALS ---
    POINT_TYPE_REGULAR,
    TRANSFORMATION_TYPE_ROTATION,
    TRANSFORMATION_TYPE_SCALE,
    TRANSFORMATION_TYPE_DIRECTIONAL_SCALE,
    COORDS_DISPLAY_MODE_REGULAR,
    COORDS_DISPLAY_MODE_COMPLEX,
    COORDS_DISPLAY_MODE_POLAR,
    COORDS_DISPLAY_MODE_NONE,
    GRID_DISPLAY_MODE_LINES,
    GRID_DISPLAY_MODE_POINTS,
    GRID_DISPLAY_MODE_TRIANGULAR,
    GRID_DISPLAY_MODE_POLAR,
    GRID_DISPLAY_MODE_NONE,
    ANGLE_DISPLAY_MODE_DEGREES,
    ANGLE_DISPLAY_MODE_RADIANS,
    ANGLE_DISPLAY_MODE_NONE,
    DISTANCE_DISPLAY_MODE_ON,
    DISTANCE_DISPLAY_MODE_NONE,
    KEY_SPACE,
    KEY_ESCAPE,
    KEY_DELETE,
    KEY_BACKSPACE,
    KEY_REPEAT,
    KEY_ZOOM_IN,
    KEY_ZOOM_IN_PLUS,
    KEY_ZOOM_OUT,
    KEY_COPY,
    KEY_PASTE,
    KEY_CUT,
    KEY_UNDO,
    KEY_REDO,
    KEY_SELECT_ALL

} from './constants.js';

import {drawPoint, 
        drawAllEdges,
        drawGrid,
        drawCanvasUI,
        updateMouseCoordinates,
        drawTransformIndicators,
        drawDragFeedback,
        calculateGridIntervals,
        getDynamicAngularIntervals,
        drawAxes,
        prepareSnapInfoTexts,
        prepareReferenceElementsTexts,
        drawReferenceElementsGeometry,
        drawTranslationFeedback
        } from './renderer.js';


const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const htmlOverlay = document.getElementById('html-overlay');
const colorPicker = document.getElementById('colorPicker');
const dpr = window.devicePixelRatio || 1;
const activeHtmlLabels = new Map();
const canvasUI = {
    toolbarButton: null,
    mainToolbar: null,
    colorToolButton: null,
    colorSwatches: [],
    addColorButton: null,
    transformToolButton: null,
    transformIcons: [],
    displayToolButton: null,
    displayIcons: [],
    themeToggleButton: null,
    symmetryToolButton: null,
    symmetryIcons: []
};






let frozenReference_A_rad = null;
let frozenReference_A_baseRad = null;
let frozenReference_D_du = null;
let frozenReference_Origin_Data = null;
let isMouseOverCanvas = false;
let placingSnapPos = null;
let isDisplayPanelExpanded = false;
let coordsDisplayMode = 'regular';    // Options: 'regular', 'complex', 'polar', 'none'
let gridDisplayMode = 'lines';      // Options: 'lines', 'points', 'none'
let angleDisplayMode = 'degrees';  // Options: 'degrees', 'radians', 'none'
let distanceDisplayMode = 'on';    // Options: 'on', 'none'

let isEdgeTransformDrag = false;
let isDraggingCenter = false;
let allPoints = [];
let allEdges = [];
let selectedPointIds = [];
let selectedEdgeIds = [];
let activeCenterId = null;
let mousePos = { x: 0, y: 0 };

let frozenReference_D_g2g = null;
let isToolbarExpanded = false;
let isColorPaletteExpanded = false;
let selectedSwatchIndex = null;
let isTransformPanelExpanded = false;
let isPlacingTransform = false;
let placingTransformType = null;
let drawingSequence = [];
let currentSequenceIndex = 0;
let showAngles = true;
let showDistances = true;
let angleSigFigs = 4;
let distanceSigFigs = 3;
let gridAlpha = 0.5;
let transformIndicatorData = null;
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
let recentColors = DEFAULT_RECENT_COLORS;
let isDrawingMode = false;
let previewLineStartPointId = null;
let actionTargetPoint = null;
let dragPreviewPoints = [];
let currentShiftPressed = false;
let clipboard = { points: [], edges: [], referencePoint: null };
let clickData = { targetId: null, type: null, count: 0, timestamp: 0 };
let undoStack = [];
let redoStack = [];
let ghostPointPosition = null;
let selectedCenterIds = [];
let isPlacingSymmetry = false;
let placingSymmetryType = null;
let copyCountInput = '';
let copyCountTimer = null;
let ghostPoints = [];
let lastGridState = {
    interval1: null,
    interval2: null,
    alpha1: 0,
    alpha2: 0,
    scale: null
};
let viewTransform = {
    scale: DEFAULT_CALIBRATION_VIEW_SCALE,
    offsetX: 0,
    offsetY: 0
};
let lastAngularGridState = {
    angle1: 30,
    angle2: 15,
    alpha1: 1,
    alpha2: 0,
};
let labelsToKeepThisFrame = new Set();

let activeThemeName = 'dark';
let currentColor = getColors().point;

function getColors() {
    return getCurrentTheme(activeThemeName, BASE_THEME);
}

function invertPointColors() {
    allPoints.forEach(point => {
        if (point.type === POINT_TYPE_REGULAR) {
            // Always invert the color, whether it exists or not
            if (point.color) {
                point.color = invertGrayscaleValue(point.color);
            } else {
                // If no color, use the current theme's point color
                point.color = getColors().point;
            }
        }
    });
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

    if (options.rotation !== undefined) {
        transform += ` rotate(${options.rotation}deg)`;
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

function handleCenterSelection(centerId, shiftKey, ctrlKey) {
    if (ctrlKey) {
        const index = selectedCenterIds.indexOf(centerId);
        if (index > -1) {
            selectedCenterIds.splice(index, 1);
            if (activeCenterId === centerId) {
                activeCenterId = null;
            }
        } else {
            selectedCenterIds.push(centerId);
        }
    } else if (shiftKey) {
        if (!selectedCenterIds.includes(centerId)) {
            selectedCenterIds.push(centerId);
        }
    } else {
        selectedCenterIds = [centerId];
    }

    if (!ctrlKey && !shiftKey) {
        activeCenterId = centerId;
    }
}

function getBestSnapPosition(mouseDataPos) {
    const candidates = [];
    const distanceSq = (p1, p2) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
    
    if (gridDisplayMode !== 'none') {
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (gridInterval > 0) {
            if (gridDisplayMode === 'polar') {
                const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180 / Math.PI + 360) % 360;
                const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
                const snappedRadius = Math.round(mouseRadius / gridInterval) * gridInterval;

                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        const angularInterval = level.angle;
                        const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                        const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                        const gridPoint = { x: snappedRadius * Math.cos(snappedAngleRad), y: snappedRadius * Math.sin(snappedAngleRad) };
                        candidates.push({ pos: gridPoint, distSq: distanceSq(mouseDataPos, gridPoint) });
                    }
                });
            } else if (gridDisplayMode === 'triangular') {
                const y_step = gridInterval * Math.sqrt(3) / 2;
                const i_f = (mouseDataPos.x / gridInterval) - (mouseDataPos.y / (gridInterval * Math.sqrt(3)));
                const j_f = mouseDataPos.y / y_step;

                let i_r = Math.round(i_f);
                let j_r = Math.round(j_f);
                let k_r = Math.round(-i_f - j_f);

                const i_diff = Math.abs(i_r - i_f);
                const j_diff = Math.abs(j_r - j_f);
                const k_diff = Math.abs(k_r - (-i_f - j_f));

                if (i_diff > j_diff && i_diff > k_diff) {
                    i_r = -j_r - k_r;
                } else if (j_diff > k_diff) {
                    j_r = -i_r - k_r;
                }

                const snappedX = i_r * gridInterval + j_r * gridInterval / 2;
                const snappedY = j_r * y_step;
                const gridPoint = { x: snappedX, y: snappedY };
                candidates.push({ pos: gridPoint, distSq: distanceSq(mouseDataPos, gridPoint) });
            } else {
                const gridPoint = { x: Math.round(mouseDataPos.x / gridInterval) * gridInterval, y: Math.round(mouseDataPos.y / gridInterval) * gridInterval };
                candidates.push({ pos: gridPoint, distSq: distanceSq(mouseDataPos, gridPoint) });
            }
        }
    }

    allPoints.forEach(p => { 
        if (p.type === 'regular') {
            candidates.push({ pos: p, distSq: distanceSq(mouseDataPos, p) }); 
        }
    });

    allEdges.forEach(edge => {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
            const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            candidates.push({ pos: midpoint, distSq: distanceSq(mouseDataPos, midpoint) });
        }
    });

    if (candidates.length === 0) return null;
    const bestCandidate = candidates.sort((a, b) => a.distSq - b.distSq)[0];
    return bestCandidate.pos;
}

function getTransformSnap(center, mouseDataPos, startReferencePoint, transformType, currentAccumulatedRotation) {
    const allCandidates = [];
    const startVector = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };
    const startDist = Math.hypot(startVector.x, startVector.y);
    const startAngle = Math.atan2(startVector.y, startVector.x);

    if (gridDisplayMode !== 'none' && lastGridState.interval1) {
        const dominantGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (dominantGridInterval > 0) {
            if (gridDisplayMode === 'polar') {
                const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180 / Math.PI + 360) % 360;
                const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
                const snappedRadius = Math.round(mouseRadius / dominantGridInterval) * dominantGridInterval;
                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        const angularInterval = level.angle;
                        const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                        const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                        const gridPoint = { x: snappedRadius * Math.cos(snappedAngleRad), y: snappedRadius * Math.sin(snappedAngleRad) };
                        allCandidates.push({ pos: gridPoint, type: 'grid', isGridPoint: true });
                    }
                });
            } else if (gridDisplayMode === 'triangular') {
                const y_step = dominantGridInterval * Math.sqrt(3) / 2;
                const i_f = (mouseDataPos.x / dominantGridInterval) - (mouseDataPos.y / (dominantGridInterval * Math.sqrt(3)));
                const j_f = mouseDataPos.y / y_step;

                let i_r = Math.round(i_f);
                let j_r = Math.round(j_f);
                let k_r = Math.round(-i_f - j_f);

                const i_diff = Math.abs(i_r - i_f);
                const j_diff = Math.abs(j_r - j_f);
                const k_diff = Math.abs(k_r - (-i_f - j_f));

                if (i_diff > j_diff && i_diff > k_diff) {
                    i_r = -j_r - k_r;
                } else if (j_diff > k_diff) {
                    j_r = -i_r - k_r;
                }
                const snappedX = i_r * dominantGridInterval + j_r * dominantGridInterval / 2;
                const snappedY = j_r * y_step;
                const gridPoint = { x: snappedX, y: snappedY };
                allCandidates.push({ pos: gridPoint, type: 'grid', isGridPoint: true });
            } else {
                const gridX = Math.round(mouseDataPos.x / dominantGridInterval) * dominantGridInterval;
                const gridY = Math.round(mouseDataPos.y / dominantGridInterval) * dominantGridInterval;
                const gridPoint = { x: gridX, y: gridY };
                allCandidates.push({ pos: gridPoint, type: 'grid', isGridPoint: true });
            }
        }
    }

    if (startDist > GEOMETRY_CALCULATION_EPSILON) {
        const scaleSnapFactors = [...SNAP_FACTORS.filter(f => f > 0), ...SNAP_FACTORS.filter(f => f > 0).map(f => -f)];
        const angleSnapFractions = NINETY_DEG_ANGLE_SNAP_FRACTIONS;

        if (transformType === TRANSFORMATION_TYPE_ROTATION) {
            const rotationIncrements = angleSnapFractions.flatMap(f => (f === 0 ? [0] : [f * Math.PI / 2, -f * Math.PI / 2]));
            for (const snapIncrement of rotationIncrements) {
                const candidateTargetAngleAbsolute = startAngle + snapIncrement;
                allCandidates.push({
                    pos: { x: center.x + startDist * Math.cos(candidateTargetAngleAbsolute), y: center.y + startDist * Math.sin(candidateTargetAngleAbsolute) },
                    type: 'transform_angle_snap',
                    rawSnapIncrement: snapIncrement
                });
            }
        }

        if (transformType === TRANSFORMATION_TYPE_SCALE || transformType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
            for (const factor of scaleSnapFactors) {
                const scaledDist = factor * startDist;
                const candidatePos = { x: center.x + scaledDist * Math.cos(startAngle), y: center.y + scaledDist * Math.sin(startAngle) };
                allCandidates.push({
                    pos: candidatePos,
                    type: 'transform_scale_snap',
                    pureScale: factor,
                    directionalScale: (transformType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE)
                });
            }
        }
    }

    if (allCandidates.length === 0) return { snapped: false };

    let bestCandidate = allCandidates.reduce((best, current) => {
        const distSq = (p, c) => (p.x - c.pos.x) ** 2 + (p.y - c.pos.y) ** 2;
        return distSq(mouseDataPos, current) < distSq(mouseDataPos, best) ? current : best;
    });

    const finalVec = { x: bestCandidate.pos.x - center.x, y: bestCandidate.pos.y - center.y };
    const finalAngleOfSnappedPos = Math.atan2(finalVec.y, finalVec.x);
    const finalDistOfSnappedPos = Math.hypot(finalVec.x, finalVec.y);

    let calculatedRotation = 0;
    let calculatedScale = 1;
    let calculatedDirectionalScale = false;
    let pureScaleForDisplay = null;
    let pureRotationForDisplay = null;
    let gridToGridInfo = null;

    if (bestCandidate.type === 'grid') {
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        const epsilon = gridInterval * GEOMETRY_CALCULATION_EPSILON;
        const startIsOnGridX = Math.abs(startReferencePoint.x / gridInterval - Math.round(startReferencePoint.x / gridInterval)) < epsilon;
        const startIsOnGridY = Math.abs(startReferencePoint.y / gridInterval - Math.round(startReferencePoint.y / gridInterval)) < epsilon;

        if (startIsOnGridX && startIsOnGridY) {
            const deltaX = bestCandidate.pos.x - startReferencePoint.x;
            const deltaY = bestCandidate.pos.y - startReferencePoint.y;
            const dx_grid = Math.round(deltaX / gridInterval);
            const dy_grid = Math.round(deltaY / gridInterval);
            const startDX_grid = Math.round((startReferencePoint.x - center.x) / gridInterval);
            const startDY_grid = Math.round((startReferencePoint.y - center.y) / gridInterval);
            const startSquaredSum = startDX_grid * startDX_grid + startDY_grid * startDY_grid;
            const snapSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;

            if (startSquaredSum > 0 && snapSquaredSum > 0) {
                gridToGridInfo = { startSquaredSum, snapSquaredSum, gridInterval };
            }
        }
    }

    if (transformType === TRANSFORMATION_TYPE_ROTATION) {
        calculatedScale = 1;
        calculatedRotation = calculateRotationAngle(startAngle, finalAngleOfSnappedPos, currentAccumulatedRotation);
        if (bestCandidate.type === 'transform_angle_snap') {
            pureRotationForDisplay = bestCandidate.rawSnapIncrement;
        }
    } else if (transformType === TRANSFORMATION_TYPE_SCALE) {
        calculatedRotation = 0;
        calculatedScale = (startDist > GEOMETRY_CALCULATION_EPSILON) ? finalDistOfSnappedPos / startDist : 1;
        if (bestCandidate.type === 'transform_scale_snap') {
            pureScaleForDisplay = bestCandidate.pureScale;
        }
    } else if (transformType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
        calculatedRotation = 0;
        calculatedDirectionalScale = true;
        const startNormalized = { x: startVector.x / startDist, y: startVector.y / startDist };
        const projectedDistance = (finalVec.x * startNormalized.x + finalVec.y * startNormalized.y);
        calculatedScale = (startDist > GEOMETRY_CALCULATION_EPSILON) ? projectedDistance / startDist : 1;
        if (bestCandidate.type === 'transform_scale_snap') {
            pureScaleForDisplay = bestCandidate.pureScale;
        }
    }

    return {
        snapped: true,
        pos: bestCandidate.pos,
        rotation: calculatedRotation,
        scale: calculatedScale,
        pureScaleForDisplay: pureScaleForDisplay,
        pureRotationForDisplay: pureRotationForDisplay,
        gridToGridInfo: gridToGridInfo,
        directionalScale: calculatedDirectionalScale
    };
}

function getSnappedPosition(startPoint, mouseScreenPos, shiftPressed) {
    const mouseDataPos = screenToData(mouseScreenPos);
    const drawingContext = getDrawingContext(startPoint.id);

    const distanceSq = (p1, p2) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;

    const pointSelectRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;
    for (const p of allPoints) {
        if (p.id !== startPoint.id && p.type === "regular" && distance(mouseDataPos, p) < pointSelectRadiusData) {
            const finalAngleRad = Math.atan2(p.y - startPoint.y, p.x - startPoint.x) || 0;
            return { x: p.x, y: p.y, angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, p), snapped: true, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null, angleTurn: normalizeAngleToPi(finalAngleRad, 0), gridToGridSquaredSum: null, gridInterval: null };
        }
    }

    const edgeClickThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
    for (const edge of allEdges) {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === "regular" && p2.type === "regular" && p1.id !== startPoint.id && p2.id !== startPoint.id) {
            const closest = getClosestPointOnLineSegment(mouseDataPos, p1, p2);
            if (closest.distance < edgeClickThresholdData && closest.onSegmentStrict) {
                const finalAngleRad = Math.atan2(closest.y - startPoint.y, closest.x - startPoint.x) || 0;
                return { x: closest.x, y: closest.y, angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, closest), snapped: true, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null, angleTurn: normalizeAngleToPi(finalAngleRad, 0), gridToGridSquaredSum: null, gridInterval: null };
            }
        }
    }

    if (!shiftPressed) {
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

    const gridSnapThreshold = POINT_SELECT_RADIUS / viewTransform.scale * 0.8;
    let priorityGridCandidate = null;
    
    if (gridDisplayMode !== 'none' && lastGridState.interval1) {
        const dominantGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (dominantGridInterval > 0) {
            if (gridDisplayMode === 'polar') {
                const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180 / Math.PI + 360) % 360;
                const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
                const snappedRadius = Math.round(mouseRadius / dominantGridInterval) * dominantGridInterval;
                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        const angularInterval = level.angle;
                        const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                        const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                        const pos = { x: snappedRadius * Math.cos(snappedAngleRad), y: snappedRadius * Math.sin(snappedAngleRad) };
                        const gridDist = distance(mouseDataPos, pos);
                        if (gridDist < gridSnapThreshold) {
                            if (!priorityGridCandidate || gridDist < distance(mouseDataPos, priorityGridCandidate.pos)) {
                                priorityGridCandidate = { pos: pos, isGridPoint: true, type: 'polar_grid_snap' };
                            }
                        }
                    }
                });
            } else if (gridDisplayMode === 'triangular') {
                const y_step = dominantGridInterval * Math.sqrt(3) / 2;
                const i_f = (mouseDataPos.x / dominantGridInterval) - (mouseDataPos.y / (dominantGridInterval * Math.sqrt(3)));
                const j_f = mouseDataPos.y / y_step;

                let i_r = Math.round(i_f);
                let j_r = Math.round(j_f);
                let k_r = Math.round(-i_f - j_f);

                const i_diff = Math.abs(i_r - i_f);
                const j_diff = Math.abs(j_r - j_f);
                const k_diff = Math.abs(k_r - (-i_f - j_f));

                if (i_diff > j_diff && i_diff > k_diff) {
                    i_r = -j_r - k_r;
                } else if (j_diff > k_diff) {
                    j_r = -i_r - k_r;
                }
                const snappedX = i_r * dominantGridInterval + j_r * dominantGridInterval / 2;
                const snappedY = j_r * y_step;
                const pos = { x: snappedX, y: snappedY };
                const gridDist = distance(mouseDataPos, pos);
                if (gridDist < gridSnapThreshold) {
                    priorityGridCandidate = { pos: pos, isGridPoint: true, type: 'triangular_grid_snap' };
                }
            } else {
                const gridX = Math.round(mouseDataPos.x / dominantGridInterval) * dominantGridInterval;
                const gridY = Math.round(mouseDataPos.y / dominantGridInterval) * dominantGridInterval;
                const pos = { x: gridX, y: gridY };
                const gridDist = distance(mouseDataPos, pos);
                if (gridDist < gridSnapThreshold) {
                    priorityGridCandidate = { pos: pos, isGridPoint: true, type: 'rect_grid_snap' };
                }
            }
        }
    }
    
    if (priorityGridCandidate) {
        const finalAngle = Math.atan2(priorityGridCandidate.pos.y - startPoint.y, priorityGridCandidate.pos.x - startPoint.x) || 0;
        const snappedDistanceOutput = parseFloat(distance(startPoint, priorityGridCandidate.pos).toFixed(10));
        
        let gridToGridSquaredSum = null;
        let finalGridInterval = null;
        if (gridDisplayMode !== 'polar') {
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            const epsilon = gridInterval * GEOMETRY_CALCULATION_EPSILON;
            const startIsOnGridX = Math.abs(startPoint.x / gridInterval - Math.round(startPoint.x / gridInterval)) < epsilon;
            const startIsOnGridY = Math.abs(startPoint.y / gridInterval - Math.round(startPoint.y / gridInterval)) < epsilon;
            if (startIsOnGridX && startIsOnGridY) {
                const deltaX = priorityGridCandidate.pos.x - startPoint.x;
                const deltaY = priorityGridCandidate.pos.y - startPoint.y;
                const dx_grid = Math.round(deltaX / gridInterval);
                const dy_grid = Math.round(deltaY / gridInterval);
                gridToGridSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;
                finalGridInterval = gridInterval;
            }
        }
        
        const rawAngle = Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x);
        const snappedTurnRaw = finalAngle - drawingContext.offsetAngleRad;
        const rawTurn = rawAngle - drawingContext.offsetAngleRad;
        const turnOptions = [snappedTurnRaw, snappedTurnRaw + 2 * Math.PI, snappedTurnRaw - 2 * Math.PI];
        const finalAngleTurn = turnOptions.reduce((best, current) => {
            return Math.abs(current - rawTurn) < Math.abs(best - rawTurn) ? current : best;
        });
        
        return {
            x: parseFloat(priorityGridCandidate.pos.x.toFixed(10)),
            y: parseFloat(priorityGridCandidate.pos.y.toFixed(10)),
            angle: finalAngle * (180 / Math.PI),
            distance: snappedDistanceOutput,
            snapped: true,
            gridSnapped: true,
            isGridPointSnap: true,
            lengthSnapFactor: null,
            angleSnapFactor: null,
            angleTurn: finalAngleTurn,
            gridToGridSquaredSum: gridToGridSquaredSum,
            gridInterval: finalGridInterval
        };
    }

    const categorizedSnapCandidates = [];
    let closestGridPoint = null;

    if (gridDisplayMode !== 'none' && lastGridState.interval1) {
        const dominantGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (dominantGridInterval > 0) {
            if (gridDisplayMode === 'triangular') {
                const y_step = dominantGridInterval * Math.sqrt(3) / 2;
                const i_f = (mouseDataPos.x / dominantGridInterval) - (mouseDataPos.y / (dominantGridInterval * Math.sqrt(3)));
                const j_f = mouseDataPos.y / y_step;
                let i_r = Math.round(i_f), j_r = Math.round(j_f), k_r = Math.round(-i_f - j_f);
                const i_diff = Math.abs(i_r - i_f), j_diff = Math.abs(j_r - j_f), k_diff = Math.abs(k_r - (-i_f - j_f));
                if (i_diff > j_diff && i_diff > k_diff) { i_r = -j_r - k_r; } else if (j_diff > k_diff) { j_r = -i_r - k_r; }
                const snappedX = i_r * dominantGridInterval + j_r * dominantGridInterval / 2;
                const snappedY = j_r * y_step;
                closestGridPoint = { pos: { x: snappedX, y: snappedY }, isGridPoint: true, type: 'triangular_grid_snap' };
            } else if (gridDisplayMode === 'polar') {
                const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180 / Math.PI + 360) % 360;
                const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
                const snappedRadius = Math.round(mouseRadius / dominantGridInterval) * dominantGridInterval;
                let bestPolarDist = Infinity;
                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        const angularInterval = level.angle;
                        const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                        const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                        const pos = { x: snappedRadius * Math.cos(snappedAngleRad), y: snappedRadius * Math.sin(snappedAngleRad) };
                        const dist = distanceSq(mouseDataPos, pos);
                        if (dist < bestPolarDist) {
                            bestPolarDist = dist;
                            closestGridPoint = { pos, isGridPoint: true, type: 'polar_grid_snap' };
                        }
                    }
                });
            } else {
                const baseX = Math.floor(mouseDataPos.x / dominantGridInterval) * dominantGridInterval;
                const baseY = Math.floor(mouseDataPos.y / dominantGridInterval) * dominantGridInterval;
                const candidates = [
                    { x: baseX, y: baseY },
                    { x: baseX + dominantGridInterval, y: baseY },
                    { x: baseX, y: baseY + dominantGridInterval },
                    { x: baseX + dominantGridInterval, y: baseY + dominantGridInterval }
                ];
                let bestDistSq = Infinity;
                let bestPos = null;
                candidates.forEach(pos => {
                    const dist = distanceSq(mouseDataPos, pos);
                    if (dist < bestDistSq) {
                        bestDistSq = dist;
                        bestPos = pos;
                    }
                });
                closestGridPoint = { pos: bestPos, isGridPoint: true, type: 'rect_grid_snap' };
            }
        }
    }
    if (closestGridPoint) {
        categorizedSnapCandidates.push(closestGridPoint);
    }
    
    let closestAngleDistanceSnap = null;
    let minAngleDistSnapSq = Infinity;
    const referenceAngleForSnapping = drawingContext.currentSegmentReferenceA_for_display;
    const baseUnitDistance = drawingContext.currentSegmentReferenceD;
    const symmetricalAngleFractions = new Set([0, ...NINETY_DEG_ANGLE_SNAP_FRACTIONS.flatMap(f => [f, -f])]);
    const sortedSymmetricalFractions = Array.from(symmetricalAngleFractions).sort((a, b) => a - b);
    const allSnapAngles = sortedSymmetricalFractions.map(f => ({ factor: f, angle: normalizeAngleToPi(drawingContext.offsetAngleRad + (f * referenceAngleForSnapping)), turn: normalizeAngleToPi(f * referenceAngleForSnapping) }));
    const allSnapDistances = [];
    for (let i = 0; i <= DRAW_SNAP_DISTANCE_FACTOR_LIMIT / DRAW_SNAP_DISTANCE_FACTOR_STEP; i++) {
        const factor = i * DRAW_SNAP_DISTANCE_FACTOR_STEP;
        allSnapDistances.push({ factor: factor, dist: factor * baseUnitDistance });
    }
    if (allSnapAngles.length > 0 && allSnapDistances.length > 0) {
        for (const angleData of allSnapAngles) {
            for (const distData of allSnapDistances) {
                const pos = { x: startPoint.x + distData.dist * Math.cos(angleData.angle), y: startPoint.y + distData.dist * Math.sin(angleData.angle) };
                const dist = distanceSq(mouseDataPos, pos);
                if (dist < minAngleDistSnapSq) {
                    minAngleDistSnapSq = dist;
                    closestAngleDistanceSnap = {
                        pos: pos,
                        type: 'angle_distance_snap',
                        lengthSnapFactor: distData.factor,
                        angleSnapFactor: angleData.factor,
                        angleTurn: angleData.turn
                    };
                }
            }
        }
    }
    if (closestAngleDistanceSnap) {
        categorizedSnapCandidates.push(closestAngleDistanceSnap);
    }

    if (categorizedSnapCandidates.length > 0) {
        const bestOverallCandidate = categorizedSnapCandidates.reduce((best, current) =>
            distanceSq(mouseDataPos, current.pos) < distanceSq(mouseDataPos, best.pos) ? current : best
        );

        const finalAngle = Math.atan2(bestOverallCandidate.pos.y - startPoint.y, bestOverallCandidate.pos.x - startPoint.x) || 0;
        const snappedDistanceOutput = parseFloat(distance(startPoint, bestOverallCandidate.pos).toFixed(10));

        let gridToGridSquaredSum = null;
        let finalGridInterval = null;
        if (bestOverallCandidate.isGridPoint && gridDisplayMode !== 'polar') {
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            const epsilon = gridInterval * GEOMETRY_CALCULATION_EPSILON;
            const startIsOnGridX = Math.abs(startPoint.x / gridInterval - Math.round(startPoint.x / gridInterval)) < epsilon;
            const startIsOnGridY = Math.abs(startPoint.y / gridInterval - Math.round(startPoint.y / gridInterval)) < epsilon;
            if (startIsOnGridX && startIsOnGridY) {
                const deltaX = bestOverallCandidate.pos.x - startPoint.x;
                const deltaY = bestOverallCandidate.pos.y - startPoint.y;
                const dx_grid = Math.round(deltaX / gridInterval);
                const dy_grid = Math.round(deltaY / gridInterval);
                gridToGridSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;
                finalGridInterval = gridInterval;
            }
        }

        let finalAngleTurn;
        if (bestOverallCandidate.angleTurn != null) {
            finalAngleTurn = bestOverallCandidate.angleTurn;
        } else {
            const rawAngle = Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x);
            const snappedTurnRaw = finalAngle - drawingContext.offsetAngleRad;
            const rawTurn = rawAngle - drawingContext.offsetAngleRad;
            const turnOptions = [snappedTurnRaw, snappedTurnRaw + 2 * Math.PI, snappedTurnRaw - 2 * Math.PI];
            finalAngleTurn = turnOptions.reduce((best, current) => {
                return Math.abs(current - rawTurn) < Math.abs(best - rawTurn) ? current : best;
            });
        }

        return {
            x: parseFloat(bestOverallCandidate.pos.x.toFixed(10)),
            y: parseFloat(bestOverallCandidate.pos.y.toFixed(10)),
            angle: finalAngle * (180 / Math.PI),
            distance: snappedDistanceOutput,
            snapped: true,
            gridSnapped: !!bestOverallCandidate.isGridPoint,
            isGridPointSnap: !!bestOverallCandidate.isGridPoint,
            lengthSnapFactor: bestOverallCandidate.lengthSnapFactor || null,
            angleSnapFactor: bestOverallCandidate.angleSnapFactor || null,
            angleTurn: finalAngleTurn,
            gridToGridSquaredSum: gridToGridSquaredSum,
            gridInterval: finalGridInterval,
        };
    }

    const finalAngleRad = Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x) || 0;
    return {
        x: mouseDataPos.x, y: mouseDataPos.y,
        angle: finalAngleRad * (180 / Math.PI),
        distance: distance(startPoint, mouseDataPos),
        snapped: false, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null,
        angleTurn: normalizeAngleToPi(finalAngleRad - drawingContext.offsetAngleRad),
        gridToGridSquaredSum: null, gridInterval: null,
    };
}

function getDragSnapPosition(dragOrigin, mouseDataPos) {
    const neighbors = findNeighbors(dragOrigin.id).map(id => allPoints.find(p => p.id === id)).filter(Boolean);
    const distanceSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    const lineToSnapRadius = LINE_TO_SNAP_RADIUS_SCREEN / viewTransform.scale;
    const pointOnLineSnapRadius = POINT_ON_LINE_SNAP_RADIUS_SCREEN / viewTransform.scale;
    let bestBisector = null;
    let minDistToBisector = Infinity;
    let bestBisectorNeighbors = null;
    for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
            const p1 = neighbors[i];
            const p2 = neighbors[j];
            const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const perpVec = { x: -(p2.y - p1.y), y: p2.x - p1.x };
            if (Math.hypot(perpVec.x, perpVec.y) < GEOMETRY_CALCULATION_EPSILON) continue;
            const bisectorP1 = { x: midPoint.x - perpVec.x * BISECTOR_LINE_EXTENSION_FACTOR, y: midPoint.y - perpVec.y * BISECTOR_LINE_EXTENSION_FACTOR };
            const bisectorP2 = { x: midPoint.x + perpVec.x * BISECTOR_LINE_EXTENSION_FACTOR, y: midPoint.y + perpVec.y * BISECTOR_LINE_EXTENSION_FACTOR };
            const closestPointOnLine = getClosestPointOnLineSegment(mouseDataPos, bisectorP1, bisectorP2);
            if (closestPointOnLine.distance < minDistToBisector) {
                minDistToBisector = closestPointOnLine.distance;
                bestBisector = { p1: bisectorP1, p2: bisectorP2, projection: closestPointOnLine };
                bestBisectorNeighbors = [p1, p2];
            }
        }
    }
    if (bestBisector && minDistToBisector < lineToSnapRadius) {
        const secondOrderCandidates = [];
        const [p1, p2] = bestBisectorNeighbors;
        const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const d_half = distance(p1, midPoint);
        const perpVec = { x: -(p2.y - p1.y), y: p2.x - p1.x };
        const perpVecMag = Math.hypot(perpVec.x, perpVec.y);
        if (d_half > GEOMETRY_CALCULATION_EPSILON && perpVecMag > GEOMETRY_CALCULATION_EPSILON) {
            const normPerpVec = { x: perpVec.x / perpVecMag, y: perpVec.y / perpVecMag };
            const geometricSnapAnglesRad = NINETY_DEG_ANGLE_SNAP_FRACTIONS
                .map(f => f * (Math.PI / 2))
                .filter(angle => angle > GEOMETRY_CALCULATION_EPSILON && angle < Math.PI);
            geometricSnapAnglesRad.forEach(angleRad => {
                const tanHalfTheta = Math.tan(angleRad / 2);
                if (Math.abs(tanHalfTheta) > GEOMETRY_CALCULATION_EPSILON) {
                    const h = d_half / tanHalfTheta;
                    secondOrderCandidates.push({ x: midPoint.x + h * normPerpVec.x, y: midPoint.y + h * normPerpVec.y });
                }
            });
        }
        if (gridDisplayMode !== 'none') {
            const topLeftData = screenToData({ x: 0, y: 0 });
            const bottomRightData = screenToData({ x: canvas.width / dpr, y: canvas.height / dpr });
            const maxViewDim = Math.max(Math.abs(bottomRightData.x - topLeftData.x), Math.abs(topLeftData.y - bottomRightData.y));
            if (gridDisplayMode === 'polar') {
                const dominantRadialInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                for(let r = dominantRadialInterval; r < maxViewDim; r += dominantRadialInterval) {
                    secondOrderCandidates.push(...getLineCircleIntersection(bestBisector, { center: {x:0, y:0}, radius: r }));
                }
                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        for (let angle = 0; angle < 360; angle += level.angle) {
                            const rad = angle * Math.PI / 180;
                            const rayLine = { p1: {x:0, y:0}, p2: {x: Math.cos(rad), y: Math.sin(rad)} };
                            const intersection = getLineLineIntersection(bestBisector, rayLine);
                            if(intersection) secondOrderCandidates.push(intersection);
                        }
                    }
                });
            } else {
                const dominantGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                const startX = Math.floor(topLeftData.x / dominantGridInterval) * dominantGridInterval;
                const endX = Math.ceil(bottomRightData.x / dominantGridInterval) * dominantGridInterval;
                const startY = Math.floor(bottomRightData.y / dominantGridInterval) * dominantGridInterval;
                const endY = Math.ceil(topLeftData.y / dominantGridInterval) * dominantGridInterval;
                for (let x = startX; x <= endX; x += dominantGridInterval) {
                    const intersection = getLineLineIntersection(bestBisector, { p1: { x: x, y: -BISECTOR_LINE_EXTENSION_FACTOR }, p2: { x: x, y: BISECTOR_LINE_EXTENSION_FACTOR } });
                    if (intersection) secondOrderCandidates.push(intersection);
                }
                for (let y = startY; y <= endY; y += dominantGridInterval) {
                    const intersection = getLineLineIntersection(bestBisector, { p1: { x: -BISECTOR_LINE_EXTENSION_FACTOR, y: y }, p2: { x: BISECTOR_LINE_EXTENSION_FACTOR, y: y } });
                    if (intersection) secondOrderCandidates.push(intersection);
                }
            }
        }
        if (secondOrderCandidates.length > 0) {
            const projectedPos = { x: bestBisector.projection.x, y: bestBisector.projection.y };
            const bestOnLineCandidate = secondOrderCandidates.reduce((best, current) => distanceSq(projectedPos, current) < distanceSq(projectedPos, best) ? current : best);
            if (distance(projectedPos, bestOnLineCandidate) < pointOnLineSnapRadius) {
                return { point: bestOnLineCandidate, snapped: true, constraints: null };
            }
        }
        return { point: { x: bestBisector.projection.x, y: bestBisector.projection.y }, snapped: true, constraints: null };
    }
    let allCandidates = [];
    if (gridDisplayMode !== 'none') {
        const dominantGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (dominantGridInterval > 0) {
            if (gridDisplayMode === 'triangular') {
                const y_step = dominantGridInterval * Math.sqrt(3) / 2;
                const i_f = (mouseDataPos.x / dominantGridInterval) - (mouseDataPos.y / (dominantGridInterval * Math.sqrt(3)));
                const j_f = mouseDataPos.y / y_step;

                let i_r = Math.round(i_f);
                let j_r = Math.round(j_f);
                let k_r = Math.round(-i_f - j_f);

                const i_diff = Math.abs(i_r - i_f);
                const j_diff = Math.abs(j_r - j_f);
                const k_diff = Math.abs(k_r - (-i_f - j_f));

                if (i_diff > j_diff && i_diff > k_diff) {
                    i_r = -j_r - k_r;
                } else if (j_diff > k_diff) {
                    j_r = -i_r - k_r;
                }
                const snappedX = i_r * dominantGridInterval + j_r * dominantGridInterval / 2;
                const snappedY = j_r * y_step;
                allCandidates.push({ x: snappedX, y: snappedY });

            } else if (gridDisplayMode === 'polar') {
                const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180 / Math.PI + 360) % 360;
                const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
                const snappedRadius = Math.round(mouseRadius / dominantGridInterval) * dominantGridInterval;
                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        const angularInterval = level.angle;
                        const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                        const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                        allCandidates.push({ x: snappedRadius * Math.cos(snappedAngleRad), y: snappedRadius * Math.sin(snappedAngleRad) });
                    }
                });
            } else {
                const baseGridX = Math.round(mouseDataPos.x / dominantGridInterval) * dominantGridInterval;
                const baseGridY = Math.round(mouseDataPos.y / dominantGridInterval) * dominantGridInterval;
                allCandidates.push({ x: baseGridX, y: baseGridY });
            }
        }
    }
    for (const p of allPoints) {
        if (p.id !== dragOrigin.id && p.type === 'regular') {
            allCandidates.push({ x: p.x, y: p.y });
        }
    }
    if (gridDisplayMode !== 'polar') {
        const majorSnapAnglesRad = NINETY_DEG_ANGLE_SNAP_FRACTIONS.map(f => f * (Math.PI / 2)).filter(angle => angle > GEOMETRY_CALCULATION_EPSILON && angle < Math.PI);
        const majorSortedSnapDistances = DRAG_SNAP_GEOMETRIC_DISTANCE_FACTORS.map(f => f * DEFAULT_REFERENCE_DISTANCE);
        for (let i = 0; i < neighbors.length; i++) {
            for (let j = i + 1; j < neighbors.length; j++) {
                for (const d1 of majorSortedSnapDistances) {
                    for (const alpha of majorSnapAnglesRad) {
                        allCandidates.push(...solveForPoint(neighbors[i], neighbors[j], d1, alpha));
                    }
                }
            }
        }
    }
    if (allCandidates.length === 0) return { point: mouseDataPos, snapped: false };
    const bestCandidate = allCandidates.reduce((best, current) => distanceSq(mouseDataPos, current) < distanceSq(mouseDataPos, best) ? current : best);
    const snapStickinessRadius = SNAP_STICKINESS_RADIUS_SCREEN / viewTransform.scale;
    if (distance(mouseDataPos, bestCandidate) < snapStickinessRadius) {
        return { point: bestCandidate, snapped: true, constraints: { dist: bestCandidate.dist || null, angle: bestCandidate.angle || null } };
    }
    return { point: mouseDataPos, snapped: false };
}

function invertRecentColors() {
    recentColors = recentColors.map(color => invertGrayscaleValue(color));
}

function getDirectionalScalingSnap(center, mouseDataPos, startReferencePoint) {
    const startVector = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };
    const startDist = Math.hypot(startVector.x, startVector.y);

    if (startDist <= GEOMETRY_CALCULATION_EPSILON) {
        return { snapped: false };
    }

    const startNormalized = { x: startVector.x / startDist, y: startVector.y / startDist };

    const snapCandidates = getAllSnapCandidatesNearMouse(mouseDataPos);
    const projectedCandidates = [];

    const scaleSnapFactors = [...SNAP_FACTORS.filter(f => f > 0), ...SNAP_FACTORS.filter(f => f > 0).map(f => -f)];
    scaleSnapFactors.forEach(factor => {
        const scaledDist = factor * startDist;
        const projectedPoint = {
            x: center.x + scaledDist * startNormalized.x,
            y: center.y + scaledDist * startNormalized.y
        };
        projectedCandidates.push({
            point: projectedPoint,
            scale: factor,
            type: 'transform_scale_snap'
        });
    });

    snapCandidates.forEach(candidate => {
        const candidateVector = { x: candidate.x - center.x, y: candidate.y - center.y };
        const projectedDistanceAlongAxis = (candidateVector.x * startNormalized.x + candidateVector.y * startNormalized.y);

        if (Math.abs(projectedDistanceAlongAxis) > GEOMETRY_CALCULATION_EPSILON) {
            const projectedPoint = {
                x: center.x + projectedDistanceAlongAxis * startNormalized.x,
                y: center.y + projectedDistanceAlongAxis * startNormalized.y
            };

            projectedCandidates.push({
                point: projectedPoint,
                scale: projectedDistanceAlongAxis / startDist,
                type: 'snap_candidate',
                isGridPoint: candidate.isGridPoint || false
            });
        }
    });

    if (projectedCandidates.length === 0) {
        const mouseVector = { x: mouseDataPos.x - center.x, y: mouseDataPos.y - center.y };
        const mouseProjectedDistanceAlongAxis = (mouseVector.x * startNormalized.x + mouseVector.y * startNormalized.y);
        const fallbackScale = (startDist > GEOMETRY_CALCULATION_EPSILON) ? mouseProjectedDistanceAlongAxis / startDist : 1;

        return {
            snapped: false,
            pos: { x: center.x + fallbackScale * startDist * startNormalized.x, y: center.y + fallbackScale * startDist * startNormalized.y },
            scale: fallbackScale,
            rotation: 0,
            directionalScale: true,
            pureScaleForDisplay: null,
            gridToGridInfo: null
        };
    }

    const bestCandidate = projectedCandidates.reduce((best, current) => {
        const bestDistSq = distance(mouseDataPos, best.point);
        const currentDistSq = distance(mouseDataPos, current.point);
        return currentDistSq < bestDistSq ? current : best;
    });

    let pureScaleForDisplay = null;
    let gridToGridInfo = null;

    if (bestCandidate.type === 'transform_scale_snap') {
        pureScaleForDisplay = bestCandidate.scale;
    } else if (bestCandidate.isGridPoint && lastGridState.interval1) {
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        const epsilon = gridInterval * GEOMETRY_CALCULATION_EPSILON;

        const centerIsOnGridX = Math.abs(center.x / gridInterval - Math.round(center.x / gridInterval)) < epsilon;
        const centerIsOnGridY = Math.abs(center.y / gridInterval - Math.round(center.y / gridInterval)) < epsilon;
        const startIsOnGridX = Math.abs(startReferencePoint.x / gridInterval - Math.round(startReferencePoint.x / gridInterval)) < epsilon;
        const startIsOnGridY = Math.abs(startReferencePoint.y / gridInterval - Math.round(startReferencePoint.y / gridInterval)) < epsilon;

        if (centerIsOnGridX && centerIsOnGridY && startIsOnGridX && startIsOnGridY) {
            const snappedVector = { x: bestCandidate.point.x - center.x, y: bestCandidate.point.y - center.y };
            const projectedDistance = (snappedVector.x * startNormalized.x + snappedVector.y * startNormalized.y);

            const startGridDistance = startDist / gridInterval;
            const projectedGridDistance = Math.abs(projectedDistance) / gridInterval;

            const startSquaredSum = Math.round(startGridDistance * startGridDistance);
            const snapSquaredSum = Math.round(projectedGridDistance * projectedGridDistance);

            if (startSquaredSum > 0 && snapSquaredSum > 0) {
                gridToGridInfo = { startSquaredSum, snapSquaredSum, gridInterval };
            }
        }
    }

    return {
        snapped: true,
        pos: bestCandidate.point,
        scale: bestCandidate.scale,
        rotation: 0,
        directionalScale: true,
        pureScaleForDisplay: pureScaleForDisplay,
        gridToGridInfo: gridToGridInfo
    };
}

function getAllSnapCandidatesNearMouse(mouseDataPos) {
    const candidates = [];
    const distanceSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    
    if (gridDisplayMode !== 'none') {
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (gridInterval > 0) {
            if (gridDisplayMode === 'polar') {
                const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180 / Math.PI + 360) % 360;
                const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
                const snappedRadius = Math.round(mouseRadius / gridInterval) * gridInterval;

                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        const angularInterval = level.angle;
                        const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                        const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                        const gridPoint = { x: snappedRadius * Math.cos(snappedAngleRad), y: snappedRadius * Math.sin(snappedAngleRad), isGridPoint: true };
                        candidates.push(gridPoint);
                    }
                });
            } else if (gridDisplayMode === 'triangular') {
                const y_step = gridInterval * Math.sqrt(3) / 2;
                const i_f = (mouseDataPos.x / gridInterval) - (mouseDataPos.y / (gridInterval * Math.sqrt(3)));
                const j_f = mouseDataPos.y / y_step;

                let i_r = Math.round(i_f);
                let j_r = Math.round(j_f);
                let k_r = Math.round(-i_f - j_f);

                const i_diff = Math.abs(i_r - i_f);
                const j_diff = Math.abs(j_r - j_f);
                const k_diff = Math.abs(k_r - (-i_f - j_f));

                if (i_diff > j_diff && i_diff > k_diff) {
                    i_r = -j_r - k_r;
                } else if (j_diff > k_diff) {
                    j_r = -i_r - k_r;
                }

                const snappedX = i_r * gridInterval + j_r * gridInterval / 2;
                const snappedY = j_r * y_step;
                const gridPoint = { x: snappedX, y: snappedY, isGridPoint: true };
                candidates.push(gridPoint);
            } else {
                const nearbyGridPoints = getNearestGridPoints(mouseDataPos, gridInterval);
                nearbyGridPoints.forEach(point => {
                    candidates.push(point);
                });
            }
        }
    }

    allPoints.forEach(p => { 
        if (p.type === 'regular') {
            candidates.push({ x: p.x, y: p.y, isGridPoint: false }); 
        }
    });

    allEdges.forEach(edge => {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
            const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, isGridPoint: false };
            candidates.push(midpoint);
        }
    });

    return candidates;
}

function initializeCanvasUI() {
    canvasUI.toolbarButton = {
        id: "toolbar-button",
        x: UI_BUTTON_PADDING,
        y: UI_BUTTON_PADDING,
        width: MENU_BUTTON_WIDTH,
        height: MENU_BUTTON_HEIGHT,
        type: "menuButton"
    };
}

function buildTransformPanelUI() {
    canvasUI.transformIcons = [];
    const panelX = UI_TOOLBAR_WIDTH + UI_BUTTON_PADDING;
    const iconY = canvasUI.transformToolButton.y;
    const iconSize = TRANSFORM_ICON_SIZE;
    const iconPadding = TRANSFORM_ICON_PADDING;
    const transformTypes = [
        TRANSFORMATION_TYPE_ROTATION,
        TRANSFORMATION_TYPE_SCALE,
        TRANSFORMATION_TYPE_DIRECTIONAL_SCALE
    ];

    transformTypes.forEach((type, index) => {
        canvasUI.transformIcons.push({
            id: `transform-icon-${type}`,
            type: type,
            x: panelX + index * (iconSize + iconPadding),
            y: iconY + TRANSFORM_ICON_Y_OFFSET,
            width: iconSize,
            height: iconSize
        });
    });
}

function buildDisplayPanelUI() {
    canvasUI.displayIcons = [];
    if (!canvasUI.displayToolButton) return;

    const panelX = UI_TOOLBAR_WIDTH + UI_BUTTON_PADDING;
    const iconY = canvasUI.displayToolButton.y;
    const iconSize = DISPLAY_ICON_SIZE;
    const iconPadding = DISPLAY_ICON_PADDING;

    const iconGroups = ['coords', 'grid', 'angles', 'distances'];

    iconGroups.forEach((group, index) => {
        canvasUI.displayIcons.push({
            id: `display-icon-${group}`,
            group: group,
            x: panelX + index * (iconSize + iconPadding),
            y: iconY,
            width: iconSize,
            height: iconSize
        });
    });
}

function buildColorPaletteUI() {
    canvasUI.colorSwatches = [];
    const paletteY = canvasUI.colorToolButton.y;

    const removeBtnX = UI_TOOLBAR_WIDTH + UI_BUTTON_PADDING;
    canvasUI.removeColorButton = {
        id: "remove-color-button",
        type: "button",
        x: removeBtnX,
        y: paletteY + COLOR_PALETTE_Y_OFFSET,
        width: UI_SWATCH_SIZE,
        height: UI_SWATCH_SIZE,
    };

    const swatchesX = removeBtnX + UI_SWATCH_SIZE + UI_BUTTON_PADDING;
    recentColors.forEach((color, index) => {
        canvasUI.colorSwatches.push({
            id: `swatch-${color}-${index}`,
            type: "colorSwatch",
            x: swatchesX + index * (UI_SWATCH_SIZE + UI_BUTTON_PADDING),
            y: paletteY + COLOR_PALETTE_Y_OFFSET,
            width: UI_SWATCH_SIZE,
            height: UI_SWATCH_SIZE,
            index: index,
            color: color
        });
    });

    const addButtonX = swatchesX + recentColors.length * (UI_SWATCH_SIZE + UI_BUTTON_PADDING);
    canvasUI.addColorButton = {
        id: "add-color-button",
        type: "button",
        x: addButtonX,
        y: paletteY + COLOR_PALETTE_Y_OFFSET,
        width: UI_SWATCH_SIZE,
        height: UI_SWATCH_SIZE,
    };
}

function buildMainToolbarUI() {
    const canvasHeight = canvas.height / dpr;
    canvasUI.mainToolbar = {
        id: "main-toolbar-bg",
        x: 0,
        y: 0,
        width: UI_TOOLBAR_WIDTH,
        height: canvasHeight,
        type: "toolbar"
    };

    canvasUI.colorToolButton = {
        id: "color-tool-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.toolbarButton.y + canvasUI.toolbarButton.height + TOOLBAR_SECTION_GAP,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };

    canvasUI.transformToolButton = {
        id: "transform-tool-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.colorToolButton.y + canvasUI.colorToolButton.height + UI_BUTTON_PADDING,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };

    canvasUI.displayToolButton = {
        id: "display-tool-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.transformToolButton.y + canvasUI.transformToolButton.height + UI_BUTTON_PADDING,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };

    canvasUI.themeToggleButton = {
        id: "theme-toggle-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.displayToolButton.y + canvasUI.displayToolButton.height + UI_BUTTON_PADDING,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };
}

function handleCanvasUIClick(screenPos) {
    const btn = canvasUI.toolbarButton;
    if (screenPos.x >= btn.x && screenPos.x <= btn.x + btn.width &&
        screenPos.y >= btn.y && screenPos.y <= btn.y + btn.height) {
        isToolbarExpanded = !isToolbarExpanded;
        if (isToolbarExpanded) {
            buildMainToolbarUI();
        } else {
            isColorPaletteExpanded = false;
            isTransformPanelExpanded = false;
            isDisplayPanelExpanded = false;
            isSymmetryPanelExpanded = false;
            selectedSwatchIndex = null;
        }
        return true;
    }

    if (isToolbarExpanded) {
        const ctb = canvasUI.colorToolButton;
        if (ctb && screenPos.x >= ctb.x && screenPos.x <= ctb.x + ctb.width &&
            screenPos.y >= ctb.y && screenPos.y <= ctb.y + ctb.height) {
            isColorPaletteExpanded = !isColorPaletteExpanded;
            if (isColorPaletteExpanded) {
                buildColorPaletteUI();
                const currentIndex = recentColors.indexOf(currentColor);
                selectedSwatchIndex = (currentIndex > -1) ? currentIndex : null;
            } else {
                selectedSwatchIndex = null;
            }
            return true;
        }

        const ttb = canvasUI.transformToolButton;
        if (ttb && screenPos.x >= ttb.x && screenPos.x <= ttb.x + ttb.width &&
            screenPos.y >= ttb.y && screenPos.y <= ttb.y + ttb.height) {
            isTransformPanelExpanded = !isTransformPanelExpanded;
            if (isTransformPanelExpanded) buildTransformPanelUI();
            return true;
        }

        const dtb = canvasUI.displayToolButton;
        if (dtb && screenPos.x >= dtb.x && screenPos.x <= dtb.x + dtb.width &&
            screenPos.y >= dtb.y && screenPos.y <= dtb.y + dtb.height) {
            isDisplayPanelExpanded = !isDisplayPanelExpanded;
            if (isDisplayPanelExpanded) buildDisplayPanelUI();
            return true;
        }

        const themeBtn = canvasUI.themeToggleButton;
        if (themeBtn && screenPos.x >= themeBtn.x && screenPos.x <= themeBtn.x + themeBtn.width &&
            screenPos.y >= themeBtn.y && screenPos.y <= themeBtn.y + themeBtn.height) {
            handleThemeToggle();
            return true;
        }
    }

    if (isColorPaletteExpanded) {
        for (const swatch of canvasUI.colorSwatches) {
            if (screenPos.x >= swatch.x && screenPos.x <= swatch.x + swatch.width &&
                screenPos.y >= swatch.y && screenPos.y <= swatch.y + swatch.height) {
                setCurrentColor(swatch.color);
                selectedSwatchIndex = swatch.index;
                return true;
            }
        }
        const removeBtn = canvasUI.removeColorButton;
        if (removeBtn && screenPos.x >= removeBtn.x && screenPos.x <= removeBtn.x + removeBtn.width &&
            screenPos.y >= removeBtn.y && screenPos.y <= removeBtn.y + removeBtn.height) {
            if (selectedSwatchIndex === null && recentColors.length > 0) {
                selectedSwatchIndex = 0;
            }
            if (selectedSwatchIndex !== null) {
                recentColors.splice(selectedSwatchIndex, 1);
                if (recentColors.length === 0) {
                    selectedSwatchIndex = null;
                } else {
                    selectedSwatchIndex = Math.min(selectedSwatchIndex, recentColors.length - 1);
                }
                if (selectedSwatchIndex !== null) {
                    setCurrentColor(recentColors[selectedSwatchIndex]);
                }
                buildColorPaletteUI();
            }
            return true;
        }
        const addBtn = canvasUI.addColorButton;
        if (addBtn && screenPos.x >= addBtn.x && screenPos.x <= addBtn.x + addBtn.width &&
            screenPos.y >= addBtn.y && screenPos.y <= addBtn.y + addBtn.height) {
            setTimeout(() => {
                colorPicker.click();
            }, 0);
            return true;
        }
    }

    if (isTransformPanelExpanded) {
        for (const icon of canvasUI.transformIcons) {
            if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
                screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
                isPlacingTransform = true;
                placingTransformType = icon.type;
                return true;
            }
        }
    }

    if (isDisplayPanelExpanded) {
        for (const icon of canvasUI.displayIcons) {
            if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
                screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {

                switch (icon.group) {
                    case 'coords':
                        const coordsModes = [COORDS_DISPLAY_MODE_NONE, COORDS_DISPLAY_MODE_REGULAR, COORDS_DISPLAY_MODE_COMPLEX, COORDS_DISPLAY_MODE_POLAR];
                        coordsDisplayMode = coordsModes[(coordsModes.indexOf(coordsDisplayMode) + 1) % coordsModes.length];
                        break;
                    case 'grid':
                        const gridModes = [GRID_DISPLAY_MODE_LINES, GRID_DISPLAY_MODE_POINTS, GRID_DISPLAY_MODE_TRIANGULAR, GRID_DISPLAY_MODE_POLAR, GRID_DISPLAY_MODE_NONE];
                        gridDisplayMode = gridModes[(gridModes.indexOf(gridDisplayMode) + 1) % gridModes.length];
                        break;
                    case 'angles':
                        const angleModes = [ANGLE_DISPLAY_MODE_DEGREES, ANGLE_DISPLAY_MODE_RADIANS, ANGLE_DISPLAY_MODE_NONE];
                        angleDisplayMode = angleModes[(angleModes.indexOf(angleDisplayMode) + 1) % angleModes.length];
                        showAngles = angleDisplayMode !== ANGLE_DISPLAY_MODE_NONE;
                        break;
                    case 'distances':
                        const distModes = [DISTANCE_DISPLAY_MODE_ON, DISTANCE_DISPLAY_MODE_NONE];
                        distanceDisplayMode = distModes[(distModes.indexOf(distanceDisplayMode) + 1) % distModes.length];
                        showDistances = distanceDisplayMode === DISTANCE_DISPLAY_MODE_ON;
                        break;
                }
                return true;
            }
        }
    }

    return false;
}

function handleThemeToggle() {
    saveStateForUndo();
    
    // Toggle theme name
    activeThemeName = activeThemeName === 'dark' ? 'light' : 'dark';
    
    // Invert all point colors, recent colors, and current color
    invertPointColors();
    invertRecentColors();
    currentColor = invertGrayscaleValue(currentColor);
    colorPicker.value = currentColor;
    
    // Update UI if needed
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
        const currentIndex = recentColors.indexOf(currentColor);
        selectedSwatchIndex = (currentIndex > -1) ? currentIndex : null;
    }
}

function addToRecentColors(color) {
    if (recentColors.includes(color)) {
        return;
    }
    recentColors.push(color);

    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
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
    isPanningBackground = false; dragPreviewPoints = [];
    actionTargetPoint = null; currentMouseButton = -1;
    clickData = { pointId: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair';
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
}

function findPointById(id) { return allPoints.find(p => p.id === id); }

function findClickedPoint(clickPos) {
    const dataPos = screenToData(clickPos);
    const selectRadiusDataRegular = POINT_SELECT_RADIUS / viewTransform.scale;
    const selectRadiusDataCenter = (CENTER_POINT_VISUAL_RADIUS + POINT_SELECT_RADIUS / 2) / viewTransform.scale;

    for (let i = allPoints.length - 1; i >= 0; i--) {
        const point = allPoints[i];
        if (point.type !== 'regular') {
            if (distance(dataPos, point) < selectRadiusDataCenter) return point;
        }
    }

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

function handleCopy() {
    const pointsToCopyIds = new Set(selectedPointIds);
    if (activeCenterId) pointsToCopyIds.add(activeCenterId);
    
    if (pointsToCopyIds.size === 0 && selectedEdgeIds.length === 0) return;
    
    selectedEdgeIds.forEach(edgeId => {
        const [id1, id2] = edgeId.split(EDGE_ID_DELIMITER);
        pointsToCopyIds.add(id1);
        pointsToCopyIds.add(id2);
    });
    
    clipboard.points = Array.from(pointsToCopyIds).map(id => {
        const p = findPointById(id);
        return p ? { ...p } : null;
    }).filter(p => p);
    
    clipboard.edges = [];
    selectedEdgeIds.forEach(edgeId => {
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
    if (selectedPointIds.length === 0 && selectedEdgeIds.length === 0 && selectedCenterIds.length === 0) return;
    
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
}

function deleteSelectedItems() {
    if (selectedPointIds.length === 0 && selectedEdgeIds.length === 0 && selectedCenterIds.length === 0) return;

    saveStateForUndo();

    selectedEdgeIds.forEach(edgeId => {
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

    const idsToDelete = new Set([...selectedPointIds, ...selectedCenterIds]);

    allPoints = allPoints.filter(point => !idsToDelete.has(point.id));

    selectedPointIds = [];
    selectedEdgeIds = [];
    selectedCenterIds = [];
    activeCenterId = null;

    if (previewLineStartPointId && !findPointById(previewLineStartPointId)) {
        isDrawingMode = false;
        previewLineStartPointId = null;
        frozenReference_A_rad = null;
        frozenReference_A_baseRad = null;
        frozenReference_D_du = null;
        frozenReference_Origin_Data = null;
    }
}

function zoomAt(zoomCenterScreen_css_pixels, scaleFactor) {
    const oldScale = viewTransform.scale;
    let newScale = oldScale * scaleFactor;

    if (newScale < MIN_SCALE_VALUE) {
        newScale = MIN_SCALE_VALUE;
    }

    const mouseX_physical = zoomCenterScreen_css_pixels.x * dpr;
    const mouseY_physical = zoomCenterScreen_css_pixels.y * dpr;

    viewTransform.offsetX = mouseX_physical * (1 - scaleFactor) + viewTransform.offsetX * scaleFactor;
    
    viewTransform.offsetY = (canvas.height - mouseY_physical) * (1 - scaleFactor) + viewTransform.offsetY * scaleFactor;

    viewTransform.scale = newScale;
}

function getDrawingContext(currentDrawStartPointId) {
    let offsetAngleRad = 0;
    let currentSegmentReferenceD; // Will be set conditionally
    let currentSegmentReferenceA_for_display = Math.PI / 2;
    let isFirstSegmentBeingDrawn = true;

    const p_current = findPointById(currentDrawStartPointId);
    if (!p_current) {
        // This case implies no active drawing line, so it implicitly is the 'first segment' conceptually.
        isFirstSegmentBeingDrawn = true;
        // The currentSegmentReferenceD for a *new* drawing operation will be the grid interval or default.
        if (gridDisplayMode !== 'none' && lastGridState.interval1) {
            currentSegmentReferenceD = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        } else {
            currentSegmentReferenceD = DEFAULT_REFERENCE_DISTANCE;
        }
        // If a reference was globally frozen, that takes precedence even for the "first" segment
        // of a new drawing sequence, but it's more about "the current length unit"
        if (frozenReference_D_du !== null) {
            currentSegmentReferenceD = frozenReference_D_du;
        }

        return {
            offsetAngleRad,
            currentSegmentReferenceD,
            currentSegmentReferenceA_for_display,
            isFirstSegmentBeingDrawn,
            displayAngleA_valueRad_for_A_equals_label: null,
            displayAngleA_originPointData_for_A_equals_label: null,
            frozen_A_baseRad_to_display: null,
            frozen_D_du_to_display: null,
            frozen_D_g2g_to_display: null,
            frozen_Origin_Data_to_display: null
        };
    }

    const segment1_prev_to_current = getPrecedingSegment(p_current.id);

    if (segment1_prev_to_current) {
        isFirstSegmentBeingDrawn = false;
        offsetAngleRad = segment1_prev_to_current.angleRad;
        currentSegmentReferenceD = frozenReference_D_du !== null ? frozenReference_D_du : segment1_prev_to_current.length;

        if (frozenReference_A_rad !== null) {
            if (Math.abs(frozenReference_A_rad) < GEOMETRY_CALCULATION_EPSILON) {
                currentSegmentReferenceA_for_display = DEFAULT_REFERENCE_ANGLE_RAD;
            } else {
                currentSegmentReferenceA_for_display = Math.abs(frozenReference_A_rad);
            }
        } else {
            currentSegmentReferenceA_for_display = DEFAULT_REFERENCE_ANGLE_RAD;
        }
    } else {
        isFirstSegmentBeingDrawn = true;
        if (gridDisplayMode !== 'none' && lastGridState.interval1) {
            currentSegmentReferenceD = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        } else {
            currentSegmentReferenceD = DEFAULT_REFERENCE_DISTANCE;
        }
        if (frozenReference_D_du !== null) {
            currentSegmentReferenceD = frozenReference_D_du;
        }
        offsetAngleRad = 0;
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
        frozen_D_g2g_to_display: frozenReference_D_g2g
    };
}

function getCompletedSegmentProperties(startPoint, endPoint, existingEdges) {
    if (!startPoint || !endPoint) return null;

    const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
    const length = distance(startPoint, endPoint);

    let precedingSegmentAngle = 0;
    let isFirstSegmentOfLine = true;

    for (let i = existingEdges.length - 1; i >= 0; i--) {
        const edge = existingEdges[i];
        let otherPointId = null;
        if (edge.id1 === startPoint.id && findPointById(edge.id2)?.type === 'regular') otherPointId = edge.id2;
        else if (edge.id2 === startPoint.id && findPointById(edge.id1)?.type === 'regular') otherPointId = edge.id1;

        if (otherPointId && otherPointId !== endPoint.id) {
            const prevPoint = findPointById(otherPointId);
            if (prevPoint) {
                precedingSegmentAngle = Math.atan2(startPoint.y - prevPoint.y, startPoint.x - prevPoint.x);
                isFirstSegmentOfLine = false;
                break;
            }
        }
    }

    const angleTurn = normalizeAngleToPi(angle - precedingSegmentAngle);

    return {
        startPoint,
        endPoint,
        absoluteAngleRad: angle,
        length: length,
        precedingSegmentAbsoluteAngleRad: precedingSegmentAngle,
        turnAngleRad: angleTurn,
        isFirstSegmentOfLine: isFirstSegmentOfLine
    };
}

function completeGraphOnSelectedPoints() {
    if (selectedPointIds.length < 2) return;
    
    const regularPointIds = selectedPointIds.filter(id => {
        const point = findPointById(id);
        return point && point.type === 'regular';
    });
    
    if (regularPointIds.length < 2) return;
    
    saveStateForUndo();
    
    let edgesAdded = 0;
    
    for (let i = 0; i < regularPointIds.length; i++) {
        for (let j = i + 1; j < regularPointIds.length; j++) {
            const id1 = regularPointIds[i];
            const id2 = regularPointIds[j];
            
            const edgeExists = allEdges.some(edge => 
                (edge.id1 === id1 && edge.id2 === id2) || 
                (edge.id1 === id2 && edge.id2 === id1)
            );
            
            if (!edgeExists) {
                allEdges.push({ id1: id1, id2: id2 });
                edgesAdded++;
            }
        }
    }
}

function applySelectionLogic(pointIdsToSelect, edgeIdsToSelect, wantsShift, wantsCtrl, targetIsCenter = false) {
    if (targetIsCenter) {
        handleCenterSelection(pointIdsToSelect[0], wantsShift, wantsCtrl);
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

function setCurrentColor(newColor) {
    const oldColor = currentColor;
    const colors = getColors();
    let changedPoints = [];
    if (selectedPointIds.length > 0) {
        selectedPointIds.forEach(id => {
            const point = findPointById(id);
            if (point && point.type === POINT_TYPE_REGULAR) {
                changedPoints.push({ id: point.id, oldColor: point.color || oldColor });
                point.color = newColor;
            }
        });
    }

    selectedCenterIds.forEach(id => {
        const center = findPointById(id);
        if (center && center.type !== POINT_TYPE_REGULAR) {
            // No color change for centers, they stay white as per drawCenterSymbol
        }
    });

    if (changedPoints.length > 0) {
        const actualUndoState = {
            points: allPoints.map(p => {
                const changed = changedPoints.find(cp => cp.id === p.id);
                if (p.type !== POINT_TYPE_REGULAR) {
                    return { ...p, color: colors.uiIcon };
                }
                return changed ? { ...p, color: changed.oldColor } : { ...p };
            }),
            edges: JSON.parse(JSON.stringify(allEdges)),
            selectedPointIds: JSON.parse(JSON.stringify(selectedPointIds)),
            selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
            activeCenterId,
            selectedCenterIds: JSON.parse(JSON.stringify(selectedCenterIds)),
            isDrawingMode,
            previewLineStartPointId
        };
        undoStack.push(actualUndoState);
        if (undoStack.length > MAX_HISTORY_SIZE) undoStack.shift();
        redoStack = [];
    }
    currentColor = newColor;
    colorPicker.value = newColor;
    addToRecentColors(newColor);
}

function calculateTransformFromMouse(center, mouseData, startReferencePoint, centerType, currentAccumulatedRotation = 0) {
    const startVector = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };
    const currentVector = { x: mouseData.x - center.x, y: mouseData.y - center.y };
    const startDist = Math.hypot(startVector.x, startVector.y);
    const currentDist = Math.hypot(currentVector.x, currentVector.y);
    const startAngle = Math.atan2(startVector.y, startVector.x);
    const currentAngle = Math.atan2(currentVector.y, currentVector.x);

    let rotation = 0;
    let scale = 1;
    let directionalScale = false;

    if (centerType === TRANSFORMATION_TYPE_ROTATION) {
        scale = 1.0;
        rotation = calculateRotationAngle(startAngle, currentAngle, currentAccumulatedRotation);
    } else if (centerType === TRANSFORMATION_TYPE_SCALE) {
        rotation = 0.0;
        if (startDist > GEOMETRY_CALCULATION_EPSILON) {
            scale = currentDist / startDist;
        }
    } else if (centerType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
        directionalScale = true;
        rotation = 0;
        if (startDist > GEOMETRY_CALCULATION_EPSILON) {
            const startNormalized = { x: startVector.x / startDist, y: startVector.y / startDist };
            const projectedDistance = (currentVector.x * startNormalized.x + currentVector.y * startNormalized.y);
            scale = projectedDistance / startDist;
        }
    }

    return { rotation, scale, directionalScale };
}

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const colors = getColors();
    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);

    const { grid1Interval, grid2Interval, alpha1, alpha2 } = calculateGridIntervals(viewTransform.scale);
    lastGridState = { interval1: grid1Interval, interval2: grid2Interval, alpha1, alpha2, scale: viewTransform.scale };
    lastAngularGridState = getDynamicAngularIntervals(viewTransform, actualCanvasWidth, actualCanvasHeight, dataToScreen);
    drawGrid(ctx, { gridDisplayMode, canvas, dpr, viewTransform, gridAlpha, colors }, dataToScreen, screenToData, lastGridState, lastAngularGridState);

    if (coordsDisplayMode !== COORDS_DISPLAY_MODE_NONE) {
        const stateForAxes = { canvas, dpr, coordsDisplayMode, viewTransform, angleDisplayMode, colors };
        drawAxes(ctx, htmlOverlay, stateForAxes, dataToScreen, screenToData, lastGridState, lastAngularGridState, updateHtmlLabel);
    }

    if (isDrawingMode && currentShiftPressed && frozenReference_Origin_Data) {
        const frozenDisplayContext = {
            frozen_Origin_Data_to_display: frozenReference_Origin_Data,
            displayAngleA_valueRad_for_A_equals_label: frozenReference_A_rad,
            frozen_A_baseRad_to_display: frozenReference_A_baseRad,
            frozen_D_du_to_display: frozenReference_D_du,
            frozen_D_g2g_to_display: frozenReference_D_g2g
        };
        const stateForRefGeo = { showAngles, showDistances, viewTransform, mousePos, colors };
        drawReferenceElementsGeometry(ctx, frozenDisplayContext, dataToScreen, screenToData, stateForRefGeo);
        const stateForRefTexts = { showAngles, showDistances, viewTransform, mousePos, frozenReference_D_du, distanceSigFigs, angleDisplayMode, colors };
        prepareReferenceElementsTexts(htmlOverlay, frozenDisplayContext, stateForRefTexts, screenToData, dataToScreen, updateHtmlLabel);
    }

    const copyCount = parseInt(copyCountInput || '1', 10);
    const isCopyPreviewMode = copyCount > 1 && isDragConfirmed && initialDragPointStates.length > 0 && initialDragPointStates.some(p => p.type === 'regular');
    const effectiveDragPreviews = isCopyPreviewMode ? [] : dragPreviewPoints;
    const stateForEdges = { allEdges, selectedEdgeIds, isDragConfirmed, dragPreviewPoints: effectiveDragPreviews, currentColor, colors };
    drawAllEdges(ctx, stateForEdges, dataToScreen, findPointById, getEdgeId);

    const mergeRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;

    allPoints.forEach(point => {
        let pointToDraw = { ...point };
        if (isDragConfirmed && effectiveDragPreviews.length > 0) {
            const preview = effectiveDragPreviews.find(dp => dp.id === point.id);
            if (preview) {
                pointToDraw.x = preview.x;
                pointToDraw.y = preview.y;
            }
        }
        const isSelectedAndInCopyPreview = isCopyPreviewMode && initialDragPointStates.some(p => p.id === point.id);
        if (!isSelectedAndInCopyPreview) {
            drawPoint(ctx, pointToDraw, { selectedPointIds, selectedCenterIds, activeCenterId, currentColor, colors }, dataToScreen, updateHtmlLabel);
        }
    });

    if (isCopyPreviewMode) {
        ctx.globalAlpha = 0.5;

        const pointsToCopyFrom = initialDragPointStates.filter(p => p.type === 'regular');
        const pointIdsToCopy = new Set(pointsToCopyFrom.map(p => p.id));
        const incidentEdges = allEdges.filter(edge =>
            pointIdsToCopy.has(edge.id1) && pointIdsToCopy.has(edge.id2)
        );

        pointsToCopyFrom.forEach(p => drawPoint(ctx, p, { selectedPointIds:[], selectedCenterIds:[], activeCenterId:null, currentColor, colors }, dataToScreen, ()=>{}))
        ctx.setLineDash(DASH_PATTERN);
        incidentEdges.forEach(edge => {
            const p1 = allPoints.find(p => p.id === edge.id1);
            const p2 = allPoints.find(p => p.id === edge.id2);
            if(p1 && p2) {
                const p1Screen = dataToScreen(p1);
                const p2Screen = dataToScreen(p2);
                ctx.beginPath();
                ctx.moveTo(p1Screen.x, p1Screen.y);
                ctx.lineTo(p2Screen.x, p2Screen.y);
                ctx.strokeStyle = colors.defaultStroke;
                ctx.stroke();
            }
        });

        for (let i = 1; i < copyCount; i++) {
            let previewPointsForThisCopy;

            if (transformIndicatorData) {
                const { center, rotation, scale, currentPos, directionalScale } = transformIndicatorData;
                const startVector = { x: transformIndicatorData.startPos.x - center.x, y: transformIndicatorData.startPos.y - center.y };

                let effectiveRotation, effectiveScale;

                if (directionalScale) {
                    effectiveRotation = rotation * i;
                    effectiveScale = scale;
                } else {
                    effectiveRotation = rotation * i;
                    effectiveScale = Math.pow(Math.abs(scale), i);
                    const effectiveScaleSign = scale < 0 ? Math.pow(-1, i) : 1;
                    effectiveScale *= effectiveScaleSign;
                }

                previewPointsForThisCopy = pointsToCopyFrom.map(p => {
                    const newPos = applyTransformToPoint(p, center, effectiveRotation, effectiveScale, directionalScale, startVector);
                    return { ...p, id: `preview_${p.id}_${i}`, x: newPos.x, y: newPos.y };
                });
            } else {
                const deltaX = dragPreviewPoints[0].x - initialDragPointStates[0].x;
                const deltaY = dragPreviewPoints[0].y - initialDragPointStates[0].y;
                const effectiveDeltaX = deltaX * i;
                const effectiveDeltaY = deltaY * i;
                previewPointsForThisCopy = pointsToCopyFrom.map(p => ({
                    ...p, id: `preview_${p.id}_${i}`, x: p.x + effectiveDeltaX, y: p.y + effectiveDeltaY
                }));
            }
            
            const newIdMap = new Map(previewPointsForThisCopy.map((p, j) => [pointsToCopyFrom[j].id, p.id]));
            
            ctx.setLineDash(DASH_PATTERN);
            incidentEdges.forEach(edge => {
                const id1WasCopied = pointIdsToCopy.has(edge.id1);
                const id2WasCopied = pointIdsToCopy.has(edge.id2);
                
                if (id1WasCopied && id2WasCopied) {
                    const newId1 = newIdMap.get(edge.id1);
                    const newId2 = newIdMap.get(edge.id2);
                    
                    const p1 = previewPointsForThisCopy.find(p => p.id === newId1);
                    const p2 = previewPointsForThisCopy.find(p => p.id === newId2);

                    if (p1 && p2) {
                        const p1Screen = dataToScreen(p1);
                        const p2Screen = dataToScreen(p2);
                        ctx.beginPath();
                        ctx.moveTo(p1Screen.x, p1Screen.y);
                        ctx.lineTo(p2Screen.x, p2Screen.y);
                        ctx.strokeStyle = colors.defaultStroke;
                        ctx.stroke();
                    }
                }
            });
            previewPointsForThisCopy.forEach(point => drawPoint(ctx, point, { selectedPointIds:[], selectedCenterIds:[], activeCenterId:null, currentColor, colors }, dataToScreen, ()=>{}));
        }
        ctx.globalAlpha = 1.0;
        ctx.setLineDash([]);
    }

    const isTransforming = transformIndicatorData || (activeCenterId && findPointById(activeCenterId)?.type?.startsWith('transformation_'));
    const isRegularTranslation = isDragConfirmed && copyCount <= 1 && !isTransforming;

    const stateForFeedback = { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors };

    if (isDragConfirmed) {
        if (transformIndicatorData) {
            drawTransformIndicators(ctx, htmlOverlay, { transformIndicatorData, angleSigFigs, distanceSigFigs, colors }, dataToScreen, updateHtmlLabel);
            labelsToKeepThisFrame.add('transform-angle-indicator');
            labelsToKeepThisFrame.add('transform-scale-indicator');
        } else {
            const hybridPointStates = allPoints.map(p => {
                const draggedVersion = dragPreviewPoints.find(dp => dp.id === p.id);
                return draggedVersion || p;
            });

            const draggedPointIds = new Set(dragPreviewPoints.map(dp => dp.id));
            const isDraggingAllPointsInGraph = actionContext && actionContext.targetPoint &&
                draggedPointIds.size > 1 && isDraggingEntireConnectedComponent(actionContext.targetPoint.id, draggedPointIds);

            if (isDraggingAllPointsInGraph && currentShiftPressed && actionContext && actionContext.targetPoint) {
                const dragOrigin = initialDragPointStates.find(p => p && p.id === actionContext.targetPoint.id);
                if (dragOrigin) {
                    const targetMousePos = { x: mousePos.x + (actionStartPos.x - dataToScreen(dragOrigin).x), y: mousePos.y + (actionStartPos.y - dataToScreen(dragOrigin).y) };
                    const snappedData = getSnappedPosition(dragOrigin, targetMousePos, currentShiftPressed);
                    const translationDrawingContext = {
                        offsetAngleRad: 0,
                        currentSegmentReferenceD: DEFAULT_REFERENCE_DISTANCE,
                        currentSegmentReferenceA_for_display: Math.PI / 2,
                        isFirstSegmentBeingDrawn: true
                    };
                    const translationFeedbackState = {
                        dragOrigin: dragOrigin,
                        snappedData: snappedData,
                        drawingContext: translationDrawingContext,
                        showDistances,
                        showAngles,
                        distanceSigFigs,
                        angleDisplayMode,
                        angleSigFigs,
                        viewTransform,
                        frozenReference_D_du: null,
                        gridDisplayMode,
                        frozenReference_A_rad: null,
                        colors
                    };
                    drawTranslationFeedback(ctx, htmlOverlay, translationFeedbackState, dataToScreen, updateHtmlLabel);
                }
            } else if (actionContext && actionContext.targetPoint) {
                drawDragFeedback(ctx, htmlOverlay, actionContext.targetPoint.id, hybridPointStates, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, currentShiftPressed, null, updateHtmlLabel);
            } else if (actionContext && actionContext.targetEdge) {
                const draggedEdgeId = getEdgeId(actionContext.targetEdge);
                drawDragFeedback(ctx, htmlOverlay, actionContext.targetEdge.id1, hybridPointStates, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, currentShiftPressed, null, updateHtmlLabel);
                drawDragFeedback(ctx, htmlOverlay, actionContext.targetEdge.id2, hybridPointStates, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, currentShiftPressed, draggedEdgeId, updateHtmlLabel);
            }
        }
    } else if ((showDistances || showAngles) && !isTransforming && !isDrawingMode && !isCopyPreviewMode && !isPlacingTransform && !isPlacingSymmetry) {
        if (selectedPointIds.length === 1 && selectedEdgeIds.length === 0) {
            drawDragFeedback(ctx, htmlOverlay, selectedPointIds[0], allPoints, { ...stateForFeedback, currentShiftPressed: false }, dataToScreen, findNeighbors, getEdgeId, false, null, updateHtmlLabel);
        }
    }


    if (ghostPointPosition) {
        const screenPos = dataToScreen(ghostPointPosition);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = colors.feedbackSnapped;
        ctx.fill();
    }

    ghostPoints.forEach(ghostPoint => {
        const screenPos = dataToScreen(ghostPoint);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = colors.feedbackSnapped;
        ctx.fill();
    });

    if (isDrawingMode && previewLineStartPointId) {
        const startPoint = findPointById(previewLineStartPointId);
        if (startPoint) {
            const currentPreviewDrawingContext = getDrawingContext(startPoint.id);
            const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed);
            const targetPosData = { x: snappedData.x, y: snappedData.y };
            const startScreen = dataToScreen(startPoint);
            const targetScreen = dataToScreen(targetPosData);
            ctx.beginPath();
            ctx.moveTo(startScreen.x, startScreen.y);
            ctx.lineTo(targetScreen.x, targetScreen.y);
            ctx.setLineDash(DASH_PATTERN);
            ctx.strokeStyle = currentShiftPressed ? colors.feedbackSnapped : currentColor;
            ctx.lineWidth = LINE_WIDTH;
            ctx.stroke();
            ctx.setLineDash([]);
            if (snappedData.snapped) {
                ctx.beginPath();
                ctx.arc(targetScreen.x, targetScreen.y, POINT_RADIUS, 0, 2 * Math.PI);
                ctx.fillStyle = colors.feedbackSnapped;
                ctx.fill();
            }
            const stateForSnapInfo = { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors };
            prepareSnapInfoTexts(ctx, htmlOverlay, startPoint, targetPosData, snappedData, stateForSnapInfo, dataToScreen, currentPreviewDrawingContext, updateHtmlLabel);
        }
    }

    if (isRectangleSelecting && isDragConfirmed) {
        ctx.strokeStyle = colors.mouseCoords;
        ctx.lineWidth = 1;
        ctx.setLineDash(DASH_PATTERN);
        const rX = Math.min(rectangleSelectStartPos.x, mousePos.x);
        const rY = Math.min(rectangleSelectStartPos.y, mousePos.y);
        const rW = Math.abs(rectangleSelectStartPos.x - mousePos.x);
        const rH = Math.abs(rectangleSelectStartPos.y - mousePos.y);
        ctx.strokeRect(rX, rY, rW, rH);
        ctx.setLineDash([]);
    }

    updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostPointPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors}, screenToData, updateHtmlLabel);

    const stateForUI = {
        dpr, canvasUI, isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded,
        isPlacingTransform, placingTransformType, placingSnapPos, mousePos, selectedSwatchIndex,
        recentColors, activeThemeName, colors, coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode
    };
    drawCanvasUI(ctx, htmlOverlay, stateForUI, updateHtmlLabel);

    cleanupHtmlLabels();
}
function isDraggingEntireConnectedComponent(startPointId, draggedPointIds) {
    const visited = new Set();
    const queue = [startPointId];
    const componentPoints = new Set();
    
    visited.add(startPointId);
    
    while (queue.length > 0) {
        const currentPointId = queue.shift();
        componentPoints.add(currentPointId);
        
        const neighbors = findNeighbors(currentPointId);
        neighbors.forEach(neighborId => {
            const neighborPoint = findPointById(neighborId);
            if (neighborPoint && neighborPoint.type === 'regular' && !visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push(neighborId);
            }
        });
    }
    
    for (const pointId of componentPoints) {
        if (!draggedPointIds.has(pointId)) {
            return false;
        }
    }
    
    return componentPoints.size > 1;
}

function performEscapeAction() {
    if (copyCountTimer) clearTimeout(copyCountTimer);
    copyCountInput = '';
    copyCountTimer = null;

    if (isDrawingMode) {
        isDrawingMode = false;
        previewLineStartPointId = null;
        frozenReference_A_rad = null;
        frozenReference_A_baseRad = null;
        frozenReference_D_du = null;
        frozenReference_D_g2g = null;
        frozenReference_Origin_Data = null;
        drawingSequence = [];
        currentSequenceIndex = 0;
        return;
    }

    if (isPlacingTransform) {
        isPlacingTransform = false;
        placingTransformType = null;
        placingSnapPos = null;
        return;
    }

    selectedPointIds = [];
    selectedEdgeIds = [];
    selectedCenterIds = [];
    activeCenterId = null;
    isActionInProgress = false;
    isDragConfirmed = false;
    isRectangleSelecting = false;
    isEdgeTransformDrag = false;
    isDraggingCenter = false;
    isPanningBackground = false;
    dragPreviewPoints = [];
    actionTargetPoint = null;
    currentMouseButton = -1;
    clickData = { pointId: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair';
    transformIndicatorData = null;
    ghostPoints = [];
    ghostPointPosition = null;
}

function applyTransformToPoint(point, center, rotation, scale, directionalScale, startVector) {
    const pointVector = { x: point.x - center.x, y: point.y - center.y };

    if (directionalScale) {
        const startDist = Math.hypot(startVector.x, startVector.y);
        if (startDist > GEOMETRY_CALCULATION_EPSILON) {
            const startNormalized = { x: startVector.x / startDist, y: startVector.y / startDist };

            const parallelComponent = (pointVector.x * startNormalized.x + pointVector.y * startNormalized.y);
            const perpVector = {
                x: pointVector.x - parallelComponent * startNormalized.x,
                y: pointVector.y - parallelComponent * startNormalized.y
            };

            const scaledParallelComponent = parallelComponent * scale;

            const newVector = {
                x: scaledParallelComponent * startNormalized.x + perpVector.x,
                y: scaledParallelComponent * startNormalized.y + perpVector.y
            };

            return { x: center.x + newVector.x, y: center.y + newVector.y };
        }
        return { x: point.x, y: point.y };
    } else {
        let transformedVector = { ...pointVector };

        transformedVector.x *= scale;
        transformedVector.y *= scale;

        const x = transformedVector.x;
        const y = transformedVector.y;
        transformedVector.x = x * Math.cos(rotation) - y * Math.sin(rotation);
        transformedVector.y = x * Math.sin(rotation) + y * Math.cos(rotation);

        return { x: center.x + transformedVector.x, y: center.y + transformedVector.y };
    }
}

function handleRepeat() {
    if (!isDrawingMode || !previewLineStartPointId || drawingSequence.length === 0) {
        return;
    }

    saveStateForUndo();

    const lastPoint = findPointById(previewLineStartPointId);
    if (!lastPoint) {
        console.error("handleRepeat: Last point not found. Cannot repeat.");
        performEscapeAction();
        return;
    }

    const precedingSegmentOfLastPoint = getPrecedingSegment(lastPoint.id);
    if (!precedingSegmentOfLastPoint) {
        console.error("handleRepeat: No preceding segment found for lastPoint, but drawingSequence is not empty. Aborting repeat.");
        performEscapeAction();
        return;
    }
    const currentAbsoluteDirection = precedingSegmentOfLastPoint.angleRad;

    // For the repeat pattern, we only use segments starting from index 1 (skipping the first segment)
    // If we only have the first segment, we can't repeat yet
    if (drawingSequence.length === 1) {
        console.log("handleRepeat: Only first segment exists, cannot repeat pattern yet.");
        return;
    }

    // Get the pattern step from the repeating portion (starting from index 1)
    const repeatPatternLength = drawingSequence.length - 1;
    const patternStepIndex = ((currentSequenceIndex - 1) % repeatPatternLength) + 1;
    const patternStep = drawingSequence[patternStepIndex];
    
    console.log("=== REPEAT DEBUG ===");
    console.log("drawingSequence:", drawingSequence);
    console.log("currentSequenceIndex:", currentSequenceIndex);
    console.log("repeatPatternLength:", repeatPatternLength);
    console.log("patternStepIndex:", patternStepIndex);
    console.log("patternStep:", patternStep);
    
    const lengthToDraw = patternStep.length;
    // For repeating patterns, the last segment (which has turn=0 as placeholder) 
    // should use the same turn as the first segment in the repeating cycle
    let turnToApplyForNextSegment;
    if (patternStepIndex === drawingSequence.length - 1) {
        // We're at the last segment - its turn is just a placeholder 0
        // Use the turn from the first segment of the repeating pattern (index 1, or index 0 if only 2 total)
        const firstRepeatSegmentIndex = drawingSequence.length > 2 ? 1 : 0;
        turnToApplyForNextSegment = drawingSequence[firstRepeatSegmentIndex].turn;
        console.log("Last segment - using turn from segment", firstRepeatSegmentIndex, ":", turnToApplyForNextSegment, "radians");
    } else {
        // Use the established turn for this segment
        turnToApplyForNextSegment = patternStep.turn;
        console.log("Using established turn from pattern step:", turnToApplyForNextSegment, "radians");
    }
        
    console.log("lengthToDraw:", lengthToDraw);
    console.log("turnToApplyForNextSegment (radians):", turnToApplyForNextSegment);
    console.log("turnToApplyForNextSegment (degrees):", turnToApplyForNextSegment * 180 / Math.PI);
    
    // Cycle through colors just like we cycle through angles
    // For proper alternating pattern, determine which color position we should be at
    let colorForNewPoint;
    let colorForCurrentPoint;
    
    if (patternStepIndex === drawingSequence.length - 1) {
        // We're at the last segment - figure out the proper alternating pattern
        // Based on the established pattern (segments 0 and 1), determine what colors should be
        const establishedColors = [drawingSequence[0].endPointColor, drawingSequence[1].endPointColor];
        
        // For the current point (where we're standing), use the alternating pattern
        const currentColorIndex = (currentSequenceIndex - 1) % establishedColors.length;
        colorForCurrentPoint = establishedColors[currentColorIndex];
        
        // For the new point, use the next color in the alternating pattern
        const newColorIndex = currentSequenceIndex % establishedColors.length;
        colorForNewPoint = establishedColors[newColorIndex];
        
        console.log("Last segment - alternating pattern:");
        console.log("Current point color should be:", colorForCurrentPoint);
        console.log("New point color should be:", colorForNewPoint);
        
        // Update the current point's color to match the pattern
        lastPoint.color = colorForCurrentPoint;
    } else {
        // Use the color that corresponds to this pattern step's position
        colorForNewPoint = patternStep.endPointColor;
        console.log("Using color from current pattern step:", colorForNewPoint);
    }

    // Calculate the new point's absolute angle
    const newSegmentAbsoluteAngle = normalizeAngle(currentAbsoluteDirection + turnToApplyForNextSegment);
    
    const targetX = lastPoint.x + lengthToDraw * Math.cos(newSegmentAbsoluteAngle);
    const targetY = lastPoint.y + lengthToDraw * Math.sin(newSegmentAbsoluteAngle);

    let newPoint = null;
    let merged = false;
    const mergeRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;

    for (const p of allPoints) {
        if (p.type === 'regular' && distance({ x: targetX, y: targetY }, p) < mergeRadiusData) {
            newPoint = p;
            merged = true;
            break;
        }
    }

    if (!merged) {
        newPoint = { id: generateUniqueId(), x: targetX, y: targetY, type: 'regular', color: colorForNewPoint };
        allPoints.push(newPoint);
    }

    const edgeExists = allEdges.some(e => 
        (e.id1 === lastPoint.id && e.id2 === newPoint.id) || 
        (e.id2 === lastPoint.id && e.id1 === newPoint.id)
    );
    if (!edgeExists) {
        allEdges.push({ id1: lastPoint.id, id2: newPoint.id });
    }

    previewLineStartPointId = newPoint.id;
    
    // Update sequence index for next repeat
    currentSequenceIndex++;
    if (currentSequenceIndex >= drawingSequence.length) {
        currentSequenceIndex = 1; // Reset to start of repeat pattern (skipping first segment)
    }

    frozenReference_D_du = null;
    frozenReference_D_g2g = null;
    frozenReference_A_rad = null;
    frozenReference_A_baseRad = null;
    frozenReference_Origin_Data = null;
}

function gameLoop() {
    redrawAll();
    requestAnimationFrame(gameLoop);
}




colorPicker.addEventListener('change', (e) => {
    const newColor = e.target.value;
    setCurrentColor(newColor);
    addToRecentColors(newColor);
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
        const currentIndex = recentColors.indexOf(newColor);
        selectedSwatchIndex = (currentIndex > -1) ? currentIndex : null;
    }
});


canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const mouseScreen = getMousePosOnCanvas(event, canvas);
    const scaleFactor = event.deltaY > 0 ? 1/1.15 : 1.15;
    zoomAt(mouseScreen, scaleFactor);
});

canvas.addEventListener('mouseenter', () => {
    isMouseOverCanvas = true;
});

canvas.addEventListener('mouseleave', () => {
    isMouseOverCanvas = false;
    redrawAll(); // To hide the mouse coordinates
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

canvas.addEventListener('mousemove', (event) => {
    mousePos = getMousePosOnCanvas(event, canvas);
    currentShiftPressed = event.shiftKey;
    placingSnapPos = null;
    ghostPointPosition = null;

    const copyCount = parseInt(copyCountInput || '1', 10);

    if (isPlacingTransform && currentShiftPressed) {
        const mouseDataPos = screenToData(mousePos);
        const potentialSnapPos = getBestSnapPosition(mouseDataPos);
        if (potentialSnapPos) {
            placingSnapPos = dataToScreen(potentialSnapPos);
            ghostPointPosition = potentialSnapPos;
        }
    } else if (isDrawingMode && currentShiftPressed && previewLineStartPointId) {
        const startPoint = findPointById(previewLineStartPointId);
        if (startPoint) {
            const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed);
            ghostPointPosition = { x: snappedData.x, y: snappedData.y };
        }
    } else if (currentShiftPressed && !isActionInProgress && !isDrawingMode && !isPlacingSymmetry) {
        const mouseDataPos = screenToData(mousePos);
        ghostPointPosition = getBestSnapPosition(mouseDataPos);
    }

    if (!isActionInProgress) {
        return;
    }

    if (!isDragConfirmed && distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
        isDragConfirmed = true;
        isEdgeTransformDrag = false;
        transformIndicatorData = null;

        if (currentMouseButton === 2) {
            isRectangleSelecting = true;
            return;
        }

        const { targetPoint, targetEdge } = actionContext;
        const { shiftKey, ctrlKey } = actionContext;

        if (isDraggingCenter) {
            initialDragPointStates = JSON.parse(JSON.stringify([targetPoint]));
            dragPreviewPoints = JSON.parse(JSON.stringify([targetPoint]));
            canvas.style.cursor = 'grabbing';
        } else if (targetEdge) {
            const pointIdsToAffect = new Set(selectedPointIds);
            selectedEdgeIds.forEach(edgeId => {
                const edge = allEdges.find(e => getEdgeId(e) === edgeId);
                if (edge) {
                    pointIdsToAffect.add(edge.id1);
                    pointIdsToAffect.add(edge.id2);
                }
            });
            pointIdsToAffect.add(targetEdge.id1);
            pointIdsToAffect.add(targetEdge.id2);
            initialDragPointStates = Array.from(pointIdsToAffect).map(id => findPointById(id)).filter(Boolean);
            dragPreviewPoints = JSON.parse(JSON.stringify(initialDragPointStates));
            isEdgeTransformDrag = true;
            canvas.style.cursor = 'grabbing';
        } else if (targetPoint && targetPoint.type === POINT_TYPE_REGULAR) {
            actionTargetPoint = targetPoint;

            let pointsToDragOnConfirmedDrag = [];

            if (selectedPointIds.includes(targetPoint.id)) {
                pointsToDragOnConfirmedDrag = selectedPointIds.map(id => findPointById(id)).filter(Boolean);
            } else {
                pointsToDragOnConfirmedDrag = [targetPoint];
                // The selection state should already be set by mousedown's applySelectionLogic
                // based on shiftKey/ctrlKey. This block only determines WHAT to drag.
            }

            initialDragPointStates = JSON.parse(JSON.stringify(pointsToDragOnConfirmedDrag));
            dragPreviewPoints = JSON.parse(JSON.stringify(pointsToDragOnConfirmedDrag));
            canvas.style.cursor = 'grabbing';
        } else if (target === 'canvas') {
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
            canvas.style.cursor = 'move';
        }
    }

    if (isDragConfirmed) {
        const mouseData = screenToData(mousePos);
        const startMouseData = screenToData(actionStartPos);
        let finalDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };

        const isTransformingSelection = activeCenterId && (selectedPointIds.length > 0 || selectedEdgeIds.length > 0);
        const center = findPointById(activeCenterId);
        const mergeRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;

        ghostPoints = [];
        if (!currentShiftPressed) {
            ghostPointPosition = null;
        }

        if (isPanningBackground) {
            const deltaX_css = mousePos.x - actionStartPos.x;
            const deltaY_css = mousePos.y - actionStartPos.y;
            viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
            viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
        } else if (isDraggingCenter) {
            let targetPosForCenter = { x: initialDragPointStates[0].x + finalDelta.x, y: initialDragPointStates[0].y + finalDelta.y };

            if (currentShiftPressed) {
                const snapResult = getDragSnapPosition(initialDragPointStates[0], targetPosForCenter);
                if (snapResult.snapped) {
                    targetPosForCenter = snapResult.point;
                    ghostPointPosition = targetPosForCenter;
                }
            }

            dragPreviewPoints[0].x = targetPosForCenter.x;
            dragPreviewPoints[0].y = targetPosForCenter.y;
        } else if (isTransformingSelection || isEdgeTransformDrag) {
            if (!center) return;

            let startReferencePoint;
            const pointsBeingAffected = new Set(initialDragPointStates.map(p => p.id));
            if (isEdgeTransformDrag) {
                startReferencePoint = screenToData(actionStartPos);
            } else if (actionTargetPoint && pointsBeingAffected.has(actionTargetPoint.id)) {
                startReferencePoint = initialDragPointStates.find(p => p.id === actionTargetPoint.id);
            } else if (selectedPointIds.length > 0) {
                 startReferencePoint = initialDragPointStates.find(p => selectedPointIds.includes(p.id));
            } else if (selectedCenterIds.length > 0) {
                startReferencePoint = initialDragPointStates.find(p => selectedCenterIds.includes(p.id));
            }

            if (!startReferencePoint) return;

            const currentAccumulatedRotation = transformIndicatorData?.rotation || 0;

            let snapResult = { snapped: false, pos: mouseData };
            if (currentShiftPressed) {
                if (center.type === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
                    snapResult = getDirectionalScalingSnap(center, mouseData, startReferencePoint);
                } else {
                    snapResult = getTransformSnap(center, mouseData, startReferencePoint, center.type, currentAccumulatedRotation);
                }
            }

            const targetPosForTransform = snapResult.snapped ? snapResult.pos : mouseData;

            const transformResult = calculateTransformFromMouse(center, targetPosForTransform, startReferencePoint, center.type, currentAccumulatedRotation);

            let calculatedRotation = transformResult.rotation;
            let calculatedScale = transformResult.scale;
            let calculatedDirectionalScale = transformResult.directionalScale;

            if (center.type === TRANSFORMATION_TYPE_ROTATION) calculatedScale = 1.0;
            if (center.type === TRANSFORMATION_TYPE_SCALE) calculatedRotation = 0.0;

            transformIndicatorData = {
                center: center,
                startPos: startReferencePoint,
                currentPos: targetPosForTransform,
                rotation: calculatedRotation,
                scale: calculatedScale,
                isSnapping: snapResult.snapped,
                snappedScaleValue: snapResult.pureScaleForDisplay,
                pureRotationForDisplay: snapResult.pureRotationForDisplay,
                transformType: center.type,
                gridToGridInfo: snapResult.gridToGridInfo,
                directionalScale: calculatedDirectionalScale
            };

            const initialStartVectorForTransform = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };

            initialDragPointStates.forEach(p_initial => {
                const p_preview = dragPreviewPoints.find(p => p && p.id === p_initial.id);
                if (p_preview) {
                    const newPos = applyTransformToPoint(
                        p_initial, center, calculatedRotation, calculatedScale, calculatedDirectionalScale, initialStartVectorForTransform
                    );

                    let mergeTarget = null;
                    if (p_initial.type === POINT_TYPE_REGULAR) {
                        for (const p of allPoints) {
                            if (p.id !== p_initial.id && p.type === POINT_TYPE_REGULAR && distance(newPos, p) < mergeRadiusData) {
                                mergeTarget = p;
                                break;
                            }
                        }
                        if (!mergeTarget && distance(newPos, p_initial) < mergeRadiusData) {
                            mergeTarget = p_initial;
                        }
                    }

                    if (mergeTarget) {
                        p_preview.x = mergeTarget.x;
                        p_preview.y = mergeTarget.y;
                        if (!ghostPoints.some(gp => gp.x === mergeTarget.x && gp.y === mergeTarget.y)) {
                            ghostPoints.push(mergeTarget);
                        }
                    } else {
                        p_preview.x = newPos.x;
                        p_preview.y = newPos.y;
                    }
                }
            });

        } else if (dragPreviewPoints.length > 0) {
            let targetPosForDrag = { x: initialDragPointStates[0].x + finalDelta.x, y: initialDragPointStates[0].y + finalDelta.y };

            if (copyCount <= 1) {
                if (currentShiftPressed) {
                    const snapResult = getDragSnapPosition(initialDragPointStates[0], targetPosForDrag);
                    if (snapResult.snapped) {
                        targetPosForDrag = snapResult.point;
                        ghostPointPosition = targetPosForDrag;
                    }
                }
            } else {
                ghostPointPosition = null;
            }

            const effectiveTranslationDeltaX = targetPosForDrag.x - initialDragPointStates[0].x;
            const effectiveTranslationDeltaY = targetPosForDrag.y - initialDragPointStates[0].y;

            initialDragPointStates.forEach(originalPointState => {
                if (!originalPointState) return;
                const previewPointToUpdate = dragPreviewPoints.find(dp => dp && dp.id === originalPointState.id);
                if (previewPointToUpdate) {
                    previewPointToUpdate.x = originalPointState.x + effectiveTranslationDeltaX;
                    previewPointToUpdate.y = originalPointState.y + effectiveTranslationDeltaY;
                }
            });

            if (copyCount <= 1) {
                dragPreviewPoints.forEach(dp => {
                    if (dp && dp.type === POINT_TYPE_REGULAR) {
                        let mergeTarget = null;
                        for (const p of allPoints) {
                            if (p.id !== dp.id && p.type === POINT_TYPE_REGULAR && distance(dp, p) < mergeRadiusData) {
                                mergeTarget = p;
                                break;
                            }
                        }
                        if (mergeTarget) {
                            dp.x = mergeTarget.x;
                            dp.y = mergeTarget.y;
                            if (!ghostPoints.some(gp => gp.x === mergeTarget.x && gp.y === mergeTarget.y)) {
                                ghostPoints.push(mergeTarget);
                            }
                        }
                    }
                });
            }
        }
    }
});

canvas.addEventListener('mousedown', (event) => {
    const targetElement = event.target;
    if (targetElement && targetElement.closest('.katex')) {
        const parentDiv = targetElement.closest('div[id^="symmetry-n-label-"]');
        if (parentDiv) {
            const symmetryObjectId = parentDiv.id.replace('symmetry-n-label-', '');
            const symmetryObject = findPointById(symmetryObjectId);
            if (symmetryObject) {
                saveStateForUndo();
                const currentN = symmetryObject.n;
                const currentIndex = SYMMETRY_COPY_COUNTS.indexOf(currentN);
                let nextIndex;
                if (currentIndex === -1) {
                    nextIndex = 0;
                } else {
                    nextIndex = (currentIndex + 1) % SYMMETRY_COPY_COUNTS.length;
                }
                symmetryObject.n = SYMMETRY_COPY_COUNTS[nextIndex];
            }
            event.stopPropagation();
            return;
        }
    }

    mousePos = getMousePosOnCanvas(event, canvas);
    isDraggingCenter = false;

    if (handleCanvasUIClick(mousePos)) {
        return;
    }

    if (isDrawingMode && event.button === 2) {
        isDrawingMode = false;
        previewLineStartPointId = null;
        frozenReference_A_rad = null;
        frozenReference_A_baseRad = null;
        frozenReference_D_du = null;
        frozenReference_D_g2g = null;
        frozenReference_Origin_Data = null;
        return;
    }

    if (isPlacingTransform || isPlacingSymmetry) {
        if (event.button === 0) {
            saveStateForUndo();
            const type = isPlacingTransform ? placingTransformType : placingSymmetryType;
            const finalPlacePos = placingSnapPos || mousePos;
            const dataPos = screenToData(finalPlacePos);
            const newObject = {
                id: generateUniqueId(),
                x: dataPos.x,
                y: dataPos.y,
                type: type,
                color: getColors().uiIcon,
                n: 2
            };
            allPoints.push(newObject);
            handleCenterSelection(newObject.id, false, false);
        } else if (event.button === 2) {
            isPlacingTransform = false;
            placingTransformType = null;
            isPlacingSymmetry = false;
            placingSymmetryType = null;
            placingSnapPos = null;
        }
        return;
    }

    const clickedPoint = findClickedPoint(mousePos);
    let clickedEdge = !clickedPoint && findClickedEdge(mousePos);

    if (clickedPoint || clickedEdge) {
        isActionInProgress = true;
        isDragConfirmed = false;
        isPanningBackground = false;
        isRectangleSelecting = false;
        initialDragPointStates = [];
        dragPreviewPoints = [];
        currentMouseButton = event.button;
        actionStartPos = mousePos;
        rectangleSelectStartPos = actionStartPos;
        actionContext = { targetPoint: clickedPoint, targetEdge: clickedEdge, target: clickedPoint || clickedEdge, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey || event.metaKey };

        if (clickedPoint) {
            if (clickedPoint.type !== 'regular') {
                isDraggingCenter = true;
                handleCenterSelection(clickedPoint.id, event.shiftKey, event.ctrlKey || event.metaKey);
            }
        }

        if (event.altKey && clickedPoint && clickedPoint.type === 'regular') {
            saveStateForUndo();
            performEscapeAction();
            isDrawingMode = true;
            previewLineStartPointId = clickedPoint.id;
            isActionInProgress = false;
        } else if (event.altKey && clickedEdge) {
            saveStateForUndo();
            performEscapeAction();
            const p1 = findPointById(clickedEdge.id1);
            const p2 = findPointById(clickedEdge.id2);
            if (p1 && p2) {
                const closest = getClosestPointOnLineSegment(screenToData(actionStartPos), p1, p2);
                const newPoint = { id: generateUniqueId(), x: closest.x, y: closest.y, type: 'regular', color: currentColor };
                allPoints.push(newPoint);
                allEdges = allEdges.filter(e => getEdgeId(e) !== getEdgeId(clickedEdge));
                allEdges.push({ id1: p1.id, id2: newPoint.id });
                allEdges.push({ id1: newPoint.id, id2: p2.id });
                isDrawingMode = true;
                previewLineStartPointId = newPoint.id;
                isActionInProgress = false;
            }
        }
    } else {
        isActionInProgress = true;
        isDragConfirmed = false;
        isPanningBackground = false;
        isRectangleSelecting = false;
        initialDragPointStates = [];
        dragPreviewPoints = [];
        currentMouseButton = event.button;
        actionStartPos = mousePos;
        rectangleSelectStartPos = actionStartPos;
        actionContext = { targetPoint: null, targetEdge: null, target: 'canvas', shiftKey: event.shiftKey, ctrlKey: event.ctrlKey || event.metaKey };
    }
});

canvas.addEventListener('mouseup', (event) => {
    if (copyCountTimer) clearTimeout(copyCountTimer);
    copyCountTimer = null;
    const copyCount = parseInt(copyCountInput, 10) || 1;
    copyCountInput = '';

    if (!isActionInProgress) return;

    const { shiftKey, ctrlKey, targetPoint, targetEdge, target } = actionContext;

    if (isDragConfirmed) {
        if (isRectangleSelecting) {
            const dataP1 = screenToData({ x: Math.min(actionStartPos.x, mousePos.x), y: Math.min(actionStartPos.y, mousePos.y) });
            const dataP2 = screenToData({ x: Math.max(actionStartPos.x, mousePos.x), y: Math.max(actionStartPos.y, mousePos.y) });
            const minX = Math.min(dataP1.x, dataP2.x),
                maxX = Math.max(dataP1.x, dataP2.x);
            const minY = Math.min(dataP1.y, dataP2.y),
                maxY = Math.max(dataP1.y, dataP2.y);

            const pointsInRect = allPoints.filter(p => p.type === 'regular' && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY).map(p => p.id);
            const centersInRect = allPoints.filter(p => p.type !== 'regular' && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY).map(p => p.id);

            if (!shiftKey && !ctrlKey) {
                selectedPointIds = pointsInRect;
                selectedEdgeIds = allEdges.filter(e => pointsInRect.includes(e.id1) && pointsInRect.includes(e.id2)).map(e => getEdgeId(e));
                if (centersInRect.length > 0) {
                    selectedCenterIds = centersInRect;
                    activeCenterId = null;
                }
            } else {
                if (shiftKey) {
                    selectedPointIds = [...new Set([...selectedPointIds, ...pointsInRect])];
                    const edgesInRect = allEdges.filter(e => pointsInRect.includes(e.id1) && pointsInRect.includes(e.id2)).map(e => getEdgeId(e));
                    selectedEdgeIds = [...new Set([...selectedEdgeIds, ...edgesInRect])];
                    selectedCenterIds = [...new Set([...selectedCenterIds, ...centersInRect])];
                } else {
                    pointsInRect.forEach(id => { const i = selectedPointIds.indexOf(id); if (i > -1) selectedPointIds.splice(i, 1); else selectedPointIds.push(id); });
                    centersInRect.forEach(id => { const i = selectedCenterIds.indexOf(id); if (i > -1) selectedCenterIds.splice(i, 1); else selectedCenterIds.push(id); });
                }
            }
        } else if (isPanningBackground) {
        } else if (dragPreviewPoints.length > 0) {
            saveStateForUndo();
            const mergeRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;

            function performMergeAndUpdate(pointToUpdate, finalPos) {
                let mergeTarget = null;
                for (const p of allPoints) {
                    if (p.id !== pointToUpdate.id && p.type === 'regular' && distance(finalPos, p) < mergeRadiusData) {
                        mergeTarget = p;
                        break;
                    }
                }

                if (mergeTarget) {
                    const pointToDeleteId = pointToUpdate.id;
                    const pointToKeepId = mergeTarget.id;
                    
                    const edgesToRewire = allEdges.filter(edge => edge.id1 === pointToDeleteId || edge.id2 === pointToDeleteId);
                    const newEdges = [];
                    for (const edge of edgesToRewire) {
                        const otherEndId = (edge.id1 === pointToDeleteId) ? edge.id2 : edge.id1;
                        if (otherEndId !== pointToKeepId) {
                            const edgeAlreadyExists = allEdges.some(e => (e.id1 === pointToKeepId && e.id2 === otherEndId) || (e.id2 === pointToKeepId && e.id1 === otherEndId));
                            if (!edgeAlreadyExists) {
                                newEdges.push({ id1: pointToKeepId, id2: otherEndId });
                            }
                        }
                    }
                    
                    allEdges = allEdges.filter(edge => edge.id1 !== pointToDeleteId && edge.id2 !== pointToDeleteId);
                    allPoints = allPoints.filter(p => p.id !== pointToDeleteId);
                    
                    selectedPointIds = selectedPointIds.filter(id => id !== pointToDeleteId);
                    if (!selectedPointIds.includes(pointToKeepId)) {
                        selectedPointIds.push(pointToKeepId);
                    }
                    
                    allEdges.push(...newEdges);
                    return pointToKeepId;
                } else {
                    pointToUpdate.x = finalPos.x;
                    pointToUpdate.y = finalPos.y;
                    return pointToUpdate.id;
                }
            }

            if (copyCount <= 1) {
                dragPreviewPoints.forEach(dp => {
                    if (dp) {
                        const originalPoint = allPoints.find(p => p.id === dp.id);
                        if (originalPoint) {
                            performMergeAndUpdate(originalPoint, { x: dp.x, y: dp.y });
                        }
                    }
                });
            } else {
                const pointsToCopyFrom = initialDragPointStates.filter(p => p.type === 'regular');
                if (pointsToCopyFrom.length === 0) {
                    dragPreviewPoints.forEach(dp => {
                        if (dp) {
                            const originalPoint = allPoints.find(p => p.id === dp.id);
                            if (originalPoint) {
                                performMergeAndUpdate(originalPoint, { x: dp.x, y: dp.y });
                            }
                        }
                    });
                } else {
                    const pointIdsToCopy = new Set(pointsToCopyFrom.map(p => p.id));
                    const incidentEdges = allEdges.filter(edge =>
                        pointIdsToCopy.has(edge.id1) && pointIdsToCopy.has(edge.id2)
                    );

                    dragPreviewPoints.forEach(dp => {
                        if (dp && dp.type !== 'regular') {
                            const originalPoint = allPoints.find(p => p.id === dp.id);
                            if (originalPoint) {
                                performMergeAndUpdate(originalPoint, { x: dp.x, y: dp.y });
                            }
                        }
                    });

                    for (let i = 1; i < copyCount; i++) {
                        let newPointsForThisCopy;

                        if (transformIndicatorData) {
                            const { center, rotation, scale, currentPos } = transformIndicatorData;
                            const effectiveRotation = rotation * i;
                            const effectiveScale = Math.pow(Math.abs(scale), i);
                            const effectiveScaleSign = scale < 0 ? Math.pow(-1, i) : 1;
                            const finalEffectiveScale = effectiveScale * effectiveScaleSign;
                            
                            newPointsForThisCopy = pointsToCopyFrom.map(p => {
                                const initialVec = { x: p.x - center.x, y: p.y - center.y };
                                const scaledVec = { x: initialVec.x * Math.abs(finalEffectiveScale), y: initialVec.y * Math.abs(finalEffectiveScale) };
                                let finalRotation = effectiveRotation;
                                if (finalEffectiveScale < 0) {
                                    finalRotation += Math.PI;
                                }
                                const rotatedX = scaledVec.x * Math.cos(finalRotation) - scaledVec.y * Math.sin(finalRotation);
                                const rotatedY = scaledVec.x * Math.sin(finalRotation) + scaledVec.y * Math.cos(finalRotation);
                                return { ...p, id: generateUniqueId(), x: center.x + rotatedX, y: center.y + rotatedY };
                            });
                        } else {
                            const deltaX = dragPreviewPoints.find(dp => dp.type === 'regular').x - pointsToCopyFrom[0].x;
                            const deltaY = dragPreviewPoints.find(dp => dp.type === 'regular').y - pointsToCopyFrom[0].y;
                            const effectiveDeltaX = deltaX * i;
                            const effectiveDeltaY = deltaY * i;
                            newPointsForThisCopy = pointsToCopyFrom.map(p => ({
                                ...p, id: generateUniqueId(), x: p.x + effectiveDeltaX, y: p.y + effectiveDeltaY
                            }));
                        }

                        const newIdMap = new Map();
                        const actualNewPoints = [];
                        
                        newPointsForThisCopy.forEach((newPoint, index) => {
                            const originalPoint = pointsToCopyFrom[index];
                            
                            let mergeTarget = null;
                            for (const p of allPoints) {
                                if (p.type === 'regular' && distance(newPoint, p) < mergeRadiusData) {
                                    mergeTarget = p;
                                    break;
                                }
                            }
                            
                            if (mergeTarget) {
                                newIdMap.set(originalPoint.id, mergeTarget.id);
                            } else {
                                allPoints.push(newPoint);
                                actualNewPoints.push(newPoint);
                                newIdMap.set(originalPoint.id, newPoint.id);
                            }
                        });
                        
                        incidentEdges.forEach(edge => {
                            const newId1 = newIdMap.get(edge.id1);
                            const newId2 = newIdMap.get(edge.id2);
                            
                            if (newId1 && newId2 && newId1 !== newId2) {
                                const edgeExists = allEdges.some(e => 
                                    (e.id1 === newId1 && e.id2 === newId2) || 
                                    (e.id1 === newId2 && e.id2 === newId1)
                                );
                                if (!edgeExists) {
                                    allEdges.push({ id1: newId1, id2: newId2 });
                                }
                            }
                        });
                    }
                    
                    selectedPointIds = [];
                    selectedEdgeIds = [];
                    selectedCenterIds = [];
                    activeCenterId = null;
                }
            }
        }
    } else {
        if (currentMouseButton === 0) {
            const startPoint = findPointById(previewLineStartPointId);
            if (isDrawingMode && startPoint) {
                saveStateForUndo();
                let newPoint = null;
                const snappedDataForCompletedSegment = getSnappedPosition(startPoint, mousePos, shiftKey);

                if (targetPoint && targetPoint.type === 'regular' && targetPoint.id !== startPoint.id) {
                    const edgeExists = allEdges.some(e => (e.id1 === startPoint.id && e.id2 === targetPoint.id) || (e.id2 === startPoint.id && e.id1 === targetPoint.id));
                    if (!edgeExists) allEdges.push({ id1: startPoint.id, id2: targetPoint.id });
                    newPoint = targetPoint;
                } else if (targetEdge) {
                    const p1 = findPointById(targetEdge.id1);
                    const p2 = findPointById(targetEdge.id2);
                    if (p1 && p2) {
                        const closest = getClosestPointOnLineSegment(screenToData(mousePos), p1, p2);
                        newPoint = { id: generateUniqueId(), x: closest.x, y: closest.y, type: 'regular', color: currentColor };
                        allPoints.push(newPoint);
                        allEdges = allEdges.filter(e => getEdgeId(e) !== getEdgeId(targetEdge));
                        allEdges.push({ id1: p1.id, id2: newPoint.id }, { id1: newPoint.id, id2: p2.id }, { id1: startPoint.id, id2: newPoint.id });
                    }
                } else {
                    newPoint = { id: generateUniqueId(), x: snappedDataForCompletedSegment.x, y: snappedDataForCompletedSegment.y, type: 'regular', color: currentColor };
                    allPoints.push(newPoint);
                    allEdges.push({ id1: startPoint.id, id2: newPoint.id });
                }

                if (newPoint) {
                    const completedSegmentProps = getCompletedSegmentProperties(startPoint, newPoint, allEdges);
                    if (completedSegmentProps) {
                        if (drawingSequence.length > 0) {
                            drawingSequence[drawingSequence.length - 1].turn = completedSegmentProps.turnAngleRad;
                        }
                        drawingSequence.push({
                            length: completedSegmentProps.length,
                            turn: 0,
                            endPointColor: newPoint.color
                        });
                        currentSequenceIndex = drawingSequence.length - 1;
                    }
                }

                if (shiftKey && newPoint && snappedDataForCompletedSegment) {
                    const completedSegmentProps = getCompletedSegmentProperties(startPoint, newPoint, allEdges);
                    if (completedSegmentProps) {
                        frozenReference_Origin_Data = completedSegmentProps.startPoint;
                        if (snappedDataForCompletedSegment.gridToGridSquaredSum > 0 && snappedDataForCompletedSegment.gridInterval) {
                            frozenReference_D_du = snappedDataForCompletedSegment.gridInterval * Math.sqrt(snappedDataForCompletedSegment.gridToGridSquaredSum);
                        } else {
                            frozenReference_D_du = completedSegmentProps.length;
                        }
                        frozenReference_D_g2g = snappedDataForCompletedSegment.gridToGridSquaredSum > 0 ? { g2gSquaredSum: snappedDataForCompletedSegment.gridToGridSquaredSum, interval: snappedDataForCompletedSegment.gridInterval } : null;
                        frozenReference_A_rad = completedSegmentProps.turnAngleRad;
                        frozenReference_A_baseRad = completedSegmentProps.precedingSegmentAbsoluteAngleRad;
                    } else {
                        frozenReference_D_du = null;
                        frozenReference_D_g2g = null;
                        frozenReference_A_rad = null;
                        frozenReference_A_baseRad = null;
                        frozenReference_Origin_Data = null;
                    }
                } else {
                    frozenReference_D_du = null;
                    frozenReference_D_g2g = null;
                    frozenReference_A_rad = null;
                    frozenReference_A_baseRad = null;
                    frozenReference_Origin_Data = null;
                }
                if (newPoint) previewLineStartPointId = newPoint.id;
                else isDrawingMode = false;
                clickData.count = 0;
            } else {
                const now = Date.now();
                let primaryClickTarget = target;
                if (primaryClickTarget && primaryClickTarget !== 'canvas') {
                    const targetId = primaryClickTarget.id || getEdgeId(primaryClickTarget);
                    let targetType;
                    if (primaryClickTarget.id) {
                        if (primaryClickTarget.type !== 'regular') {
                            targetType = 'center';
                        } else {
                            targetType = 'point';
                        }
                    } else {
                        targetType = 'edge';
                    }
                    if (targetId && clickData.targetId === targetId && (now - clickData.timestamp) < DOUBLE_CLICK_MS) {
                        clickData.count++;
                    } else {
                        clickData.count = 1;
                        clickData.targetId = targetId;
                        clickData.type = targetType;
                    }
                    clickData.timestamp = now;
                    switch (clickData.count) {
                        case 1:
                            if (targetType === 'point') {
                                applySelectionLogic([targetId], [], shiftKey, ctrlKey, false);
                            } else if (targetType === 'edge') {
                                applySelectionLogic([], [targetId], shiftKey, ctrlKey, false);
                            } else if (targetType === 'center') {
                                handleCenterSelection(targetId, shiftKey, ctrlKey);
                            }
                            break;
                        case 2:
                            if (targetType === 'point') {
                                const neighbors = findNeighbors(clickData.targetId);
                                applySelectionLogic([clickData.targetId, ...neighbors], [], false, false);
                            } else if (targetType === 'edge') {
                                const edge = allEdges.find(e => getEdgeId(e) === clickData.targetId);
                                if (edge) {
                                    const validNeighborEdges = [...findNeighborEdges(edge.id1), ...findNeighborEdges(edge.id2)].filter(e => findPointById(e.id1) && findPointById(e.id2));
                                    applySelectionLogic([], Array.from(new Set(validNeighborEdges.map(e => getEdgeId(e)))), false, false);
                                }
                            } else if (targetType === 'center') {
                                const center = findPointById(clickData.targetId);
                                if (center) {
                                    const relatedPoints = allPoints.filter(p => p.type === 'regular' && distance(p, center) < (POINT_SELECT_RADIUS * 10 / viewTransform.scale)).map(p => p.id);
                                    const relatedEdges = allEdges.filter(e => relatedPoints.includes(e.id1) && relatedPoints.includes(e.id2)).map(e => getEdgeId(e));
                                    applySelectionLogic(relatedPoints, relatedEdges, shiftKey, ctrlKey, false);
                                }
                            }
                            break;
                        case 3:
                            if (targetType === 'point') {
                                const pointsInSubgraph = findAllPointsInSubgraph(clickData.targetId);
                                applySelectionLogic(pointsInSubgraph, [], false, false);
                            } else if (targetType === 'edge') {
                                const edge = allEdges.find(e => getEdgeId(e) === clickData.targetId);
                                if (edge) {
                                    const pointsInSubgraph = new Set(findAllPointsInSubgraph(edge.id1));
                                    const edgesInSubgraph = allEdges.filter(e => pointsInSubgraph.has(e.id1) && pointsInSubgraph.has(e.id2));
                                    applySelectionLogic([], edgesInSubgraph.map(e => getEdgeId(e)), false, false);
                                }
                            } else if (targetType === 'center') {
                                const allRegularPoints = allPoints.filter(p => p.type === 'regular').map(p => p.id);
                                const allGeometricEdges = allEdges.map(e => getEdgeId(e));
                                applySelectionLogic(allRegularPoints, allGeometricEdges, shiftKey, ctrlKey, false);
                            }
                            clickData.count = 0;
                            break;
                    }
                } else {
                    clickData.count = 0;
                    saveStateForUndo();
                    selectedPointIds = [];
                    selectedEdgeIds = [];
                    isDrawingMode = false;
                    previewLineStartPointId = null;
                    const startCoords = ghostPointPosition ? ghostPointPosition : screenToData(mousePos);
                    const newPoint = { id: generateUniqueId(), ...startCoords, type: 'regular', color: currentColor };
                    allPoints.push(newPoint);
                    isDrawingMode = true;
                    previewLineStartPointId = newPoint.id;
                    drawingSequence = [];
                    currentSequenceIndex = 0;
                }
            }
        } else if (currentMouseButton === 2) {
            performEscapeAction();
        }
    }

    isActionInProgress = false;
    isDragConfirmed = false;
    isPanningBackground = false;
    isRectangleSelecting = false;
    actionContext = null;
    actionTargetPoint = null;
    transformIndicatorData = null;
    isEdgeTransformDrag = false;
    isDraggingCenter = false;
    canvas.style.cursor = 'crosshair';
    ghostPoints = [];
    if (!currentShiftPressed) {
        ghostPointPosition = null;
    }
});

window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
        currentShiftPressed = false;
        ghostPointPosition = null;
    }
});

window.addEventListener('keydown', (event) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    if (isActionInProgress && currentMouseButton === 0 && (actionContext?.targetPoint || actionContext?.targetEdge) && event.key >= '0' && event.key <= '9') {
        if (event.repeat) {
            return;
        }
        event.preventDefault();

        clearTimeout(copyCountTimer);

        if (copyCountTimer === null || copyCountInput.length >= 2) {
            copyCountInput = event.key;
        } else {
            copyCountInput += event.key;
        }

        copyCountTimer = setTimeout(() => {
            copyCountTimer = null;
        }, 500);
        return;
    }

    if (isCtrlOrCmd && event.key.toLowerCase() === KEY_REPEAT) {
        event.preventDefault();
        if (isDrawingMode && previewLineStartPointId) {
            handleRepeat();
        }
        return;
    }

    if (event.key === 'Shift' && !currentShiftPressed) {
        currentShiftPressed = true;
        if (!isActionInProgress && !isDrawingMode) {
            const mouseDataPos = screenToData(mousePos);
            ghostPointPosition = getBestSnapPosition(mouseDataPos);
        }
    }

    const allowedDuringAction = ['Shift', 'Control', 'Meta', 'Alt', 'Escape', 'Delete', 'Backspace'];
    if (isActionInProgress && !allowedDuringAction.includes(event.key) && !(isCtrlOrCmd && [KEY_COPY, KEY_CUT, KEY_PASTE, KEY_UNDO, KEY_REDO, KEY_SELECT_ALL, KEY_ZOOM_OUT, KEY_ZOOM_IN, KEY_ZOOM_IN_PLUS].includes(event.key.toLowerCase()))) return;

    if (isMouseOverCanvas && isCtrlOrCmd && (event.key === KEY_ZOOM_IN || event.key === KEY_ZOOM_IN_PLUS)) {
        event.preventDefault();
        const centerScreen = { x: (canvas.width / dpr) / 2, y: (canvas.height / dpr) / 2 };
        zoomAt(centerScreen, KEYBOARD_ZOOM_FACTOR);
        return;
    }
    if (isMouseOverCanvas && isCtrlOrCmd && event.key === KEY_ZOOM_OUT) {
        event.preventDefault();
        const centerScreen = { x: (canvas.width / dpr) / 2, y: (canvas.height / dpr) / 2 };
        zoomAt(centerScreen, 1 / KEYBOARD_ZOOM_FACTOR);
        return;
    }

    if (event.key === KEY_SPACE) {
        event.preventDefault();
        completeGraphOnSelectedPoints();
    } else if (event.key === KEY_ESCAPE) {
        performEscapeAction();
    } else if (event.key === KEY_DELETE || event.key === KEY_BACKSPACE) {
        deleteSelectedItems();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === KEY_COPY) {
        event.preventDefault();
        handleCopy();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === KEY_CUT) {
        event.preventDefault();
        handleCut();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === KEY_PASTE) {
        event.preventDefault();
        handlePaste();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === KEY_UNDO && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
    } else if (isCtrlOrCmd && (event.key.toLowerCase() === KEY_REDO || (event.shiftKey && event.key.toLowerCase() === KEY_UNDO))) {
        event.preventDefault();
        handleRedo();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === KEY_SELECT_ALL) {
        event.preventDefault();
        selectedPointIds = allPoints.filter(p => p.type === 'regular').map(p => p.id);
        selectedEdgeIds = allEdges.map(edge => getEdgeId(edge));
        selectedCenterIds = allPoints.filter(p => p.type !== 'regular').map(p => p.id);
        activeCenterId = null;
    }
});

window.addEventListener('resize', resizeCanvas);

window.addEventListener('load', () => {
    if (typeof window.katex === 'undefined') {
        console.error("KaTeX library failed to load or initialize. Math rendering will be broken.");
    }
    initializeCanvasUI();
    buildMainToolbarUI();
    resizeCanvas();

    viewTransform.scale = 70;
    
    viewTransform.offsetX = canvas.width / 2;
    viewTransform.offsetY = canvas.height / 2;
    
    coordsDisplayMode = 'regular';

    setCurrentColor(currentColor);
    saveStateForUndo();
    gameLoop();
});