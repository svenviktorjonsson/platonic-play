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
    ANGLE_SNAP_THRESHOLD_RAD,

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

    // --- FEEDBACK LABELS & TEXT ---
    FEEDBACK_LABEL_FONT_SIZE,
    FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN,
    MAX_POINTS_FOR_ANGLES,
    MAX_EDGES_FOR_LABELS,

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

import {
    solveForPoint,
    generateUniqueId,
    normalizeAngleToPi,
    distance,
    getClosestPointOnLineSegment,
    getMousePosOnCanvas,
    getLineCircleIntersection,
    getLineLineIntersection,
    getGridSnapCandidates,
    invertGrayscaleValue,
    getCurrentTheme,
    calculateRotationAngle,
    applyTransformToPoint,
    normalize
} from './utils.js';

import {drawPoint,
        drawAllEdges,
        drawDrawingPreview,
        drawCopyPreviews,
        drawGrid,
        drawCanvasUI,
        drawMergePreviews,
        updateMouseCoordinates,
        drawTransformIndicators,
        drawDragFeedback,
        calculateGridIntervals,
        getDynamicAngularIntervals,
        drawSelectionRectangle,
        drawAxes,
        prepareSnapInfoTexts,
        prepareReferenceElementsTexts,
        drawReferenceElementsGeometry,
        drawSelectedEdgeDistances,
        drawSelectedEdgeAngles,
        clearCanvas
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



let hoveredPointId = null;
let frozenReference_A_rad = null;
let frozenReference_A_baseRad = null;
let frozenReference_D_du = null;
let frozenReference_Origin_Data = null;
let isMouseOverCanvas = false;
let placingSnapPos = null;
let isDisplayPanelExpanded = false;
let isVisibilityPanelExpanded = false;
let coordsDisplayMode = 'regular';    // Options: 'regular', 'complex', 'polar', 'none'
let gridDisplayMode = 'lines';      // Options: 'lines', 'points', 'none'
let angleDisplayMode = 'degrees';  // Options: 'degrees', 'radians', 'none'
let distanceDisplayMode = 'on';    // Options: 'on', 'none'
let pointsVisible = true;

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
let copyCountInput = '';
let copyCountTimer = null;
let ghostPoints = [];
let currentAccumulatedRotation = 0;
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
let selectedColorIndices = [];
let colorCreationIndex = 0;

function generateRandomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function getNextCreationColor(advance = true) {
    if (selectedColorIndices.length === 0) {
        return currentColor;
    }
    if (selectedColorIndices.length === 1) {
        const colorIndex = selectedColorIndices[0];
        if (colorIndex === -1) {
            return generateRandomColor();
        }
        return recentColors[colorIndex];
    }
    const selectedIndex = selectedColorIndices[colorCreationIndex % selectedColorIndices.length];
    if (advance) {
        colorCreationIndex++;
    }
    if (selectedIndex === -1) {
        return generateRandomColor();
    }
    return recentColors[selectedIndex];
}

function applyColorsToSelection() {
    if (selectedPointIds.length === 0 || selectedColorIndices.length === 0) return;
    
    saveStateForUndo();
    
    selectedPointIds.forEach((pointId, index) => {
        const point = findPointById(pointId);
        if (point && point.type === 'regular') {
            const colorIndex = selectedColorIndices[index % selectedColorIndices.length];
            if (colorIndex === -1) {
                point.color = generateRandomColor();
            } else {
                point.color = recentColors[colorIndex];
            }
        }
    });
}

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
                activeCenterId = selectedCenterIds.length > 0 ? selectedCenterIds[selectedCenterIds.length - 1] : null;
            }
        } else {
            selectedCenterIds.push(centerId);
            activeCenterId = centerId;
        }
    } else if (shiftKey) {
        if (!selectedCenterIds.includes(centerId)) {
            selectedCenterIds.push(centerId);
            activeCenterId = centerId;
        }
    } else {
        selectedCenterIds = [centerId];
        activeCenterId = centerId;
    }
}

function getDragSnapPosition(dragOrigin, mouseDataPos) {
    const candidates = [];
    
    allPoints.forEach(p => {
        if (p.id !== dragOrigin.id && p.type === 'regular') {
            candidates.push({ 
                priority: 1, 
                dist: distance(mouseDataPos, p), 
                pos: p, 
                snapType: 'point' 
            });
        }
    });

    const gridCandidates = getGridSnapCandidates(mouseDataPos, gridDisplayMode, lastGridState.interval1, lastAngularGridState, true);
    if (gridCandidates.length > 0) {
        gridCandidates.forEach(gridPoint => {
            candidates.push({ 
                priority: 2, 
                dist: distance(mouseDataPos, gridPoint), 
                pos: gridPoint, 
                snapType: 'grid' 
            });
        });
    }

    const drawingContext = getDrawingContext(dragOrigin.id);
    const currentDist = distance(dragOrigin, mouseDataPos);
    const currentAngle = Math.atan2(mouseDataPos.y - dragOrigin.y, mouseDataPos.x - dragOrigin.x);
    
    const baseDistance = drawingContext.currentSegmentReferenceD;
    const distanceFactors = SNAP_FACTORS.filter(f => f >= 0 && f <= 10);
    
    const angleFactors = NINETY_DEG_ANGLE_SNAP_FRACTIONS;
    const baseAngle = drawingContext.currentSegmentReferenceA_for_display;
    
    distanceFactors.forEach(distFactor => {
        const snapDistance = baseDistance * distFactor;
        
        angleFactors.forEach(angleFactor => {
            const snapAngle = drawingContext.offsetAngleRad + (angleFactor * baseAngle);
            const snapPos = {
                x: dragOrigin.x + snapDistance * Math.cos(snapAngle),
                y: dragOrigin.y + snapDistance * Math.sin(snapAngle)
            };
            
            candidates.push({
                priority: 3,
                dist: distance(mouseDataPos, snapPos),
                pos: snapPos,
                snapType: 'geometric',
                distanceFactor: distFactor,
                angleFactor: angleFactor,
                snapDistance: snapDistance,
                snapAngle: snapAngle
            });
        });
    });

    if (candidates.length === 0) {
        return { point: mouseDataPos, snapped: false, snapType: 'none' };
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const bestCandidate = candidates[0];

    return {
        point: bestCandidate.pos,
        snapped: true,
        snapType: bestCandidate.snapType,
        distanceFactor: bestCandidate.distanceFactor,
        angleFactor: bestCandidate.angleFactor,
        snapDistance: bestCandidate.snapDistance,
        snapAngle: bestCandidate.snapAngle
    };
}

function handleShiftTransformation(mouseData, actionContext) {
    const { targetPoint } = actionContext;
    
    if (isDraggingCenter) {
        const candidates = getUniversalSnapCandidates(mouseData, 'translation', null, targetPoint, [targetPoint.id]);
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.distance - b.distance);
            const bestCandidate = candidates[0];
            ghostPointPosition = bestCandidate.pos;
            return bestCandidate.pos;
        }
        return mouseData;
        
    } else if (activeCenterId && selectedPointIds.length > 0) {
        const center = findPointById(activeCenterId);
        const centerType = center.type;
        const startReferencePoint = isEdgeTransformDrag ? 
            screenToData(actionStartPos) : 
            initialDragPointStates.find(p => actionTargetPoint && p.id === actionTargetPoint.id) || initialDragPointStates[0];
            
        if (!center || !startReferencePoint) return mouseData;
        
        const excludedIds = initialDragPointStates.map(p => p.id);
        const candidates = getUniversalSnapCandidates(mouseData, centerType, center, startReferencePoint, excludedIds);
        
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.distance - b.distance);
            const bestCandidate = candidates[0];
            
            const constrainedPoint = applyTransformationConstraint(bestCandidate.pos, centerType, center, startReferencePoint);
            
            const rawTransform = calculateTransformFromMouse(center, constrainedPoint, startReferencePoint, centerType, currentAccumulatedRotation);
            
            return {
                mousePos: constrainedPoint,
                transform: rawTransform,
                snapped: true,
                snapInfo: bestCandidate
            };
        }
        
    } else {
        const dragOrigin = initialDragPointStates[0];
        const startMouseData = screenToData(actionStartPos);
        const rawDelta = { 
            x: mouseData.x - startMouseData.x, 
            y: mouseData.y - startMouseData.y 
        };
        
        const targetPos = { 
            x: dragOrigin.x + rawDelta.x, 
            y: dragOrigin.y + rawDelta.y 
        };
        
        const candidates = getTranslationSnapCandidates(targetPos, dragOrigin);
        
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.distance - b.distance);
            const bestCandidate = candidates[0];
            
            const finalDelta = {
                x: bestCandidate.pos.x - dragOrigin.x,
                y: bestCandidate.pos.y - dragOrigin.y
            };
            
            ghostPointPosition = bestCandidate.pos;
            
            return {
                delta: finalDelta,
                snapped: true,
                snapInfo: bestCandidate
            };
        }
    }
    
    return mouseData;
}

function getTranslationSnapCandidates(targetPos, dragOrigin) {
    const candidates = [];

    const effectiveGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    if (gridDisplayMode !== 'none' && effectiveGridInterval > 0) {
        const gridCandidates = getGridSnapCandidates(targetPos, gridDisplayMode, effectiveGridInterval, lastAngularGridState, true);
        gridCandidates.forEach(gridPoint => {
            candidates.push({
                type: 'grid',
                pos: gridPoint,
                priority: 2,
                distance: distance(targetPos, gridPoint)
            });
        });
    }

    allPoints.forEach(p => {
        if (p.type === 'regular' && p.id !== dragOrigin.id) {
            candidates.push({
                type: 'vertex',
                pos: { x: p.x, y: p.y },
                priority: 1,
                distance: distance(targetPos, p)
            });
        }
    });

    const drawingContext = getDrawingContext(dragOrigin.id);
    const baseDistance = drawingContext.currentSegmentReferenceD;
    const offsetAngle = drawingContext.offsetAngleRad;
    const baseAngleForSnapping = drawingContext.currentSegmentReferenceA_for_display;

    NINETY_DEG_ANGLE_SNAP_FRACTIONS.forEach(angleFactor => {
        const snapAngleTurn = angleFactor * baseAngleForSnapping;
        SNAP_FACTORS.forEach(distFactor => {
            const snapDistance = baseDistance * distFactor;
            if (snapDistance > 0) {
                const snapAngle1 = offsetAngle + snapAngleTurn;
                const snapPos1 = {
                    x: dragOrigin.x + snapDistance * Math.cos(snapAngle1),
                    y: dragOrigin.y + snapDistance * Math.sin(snapAngle1)
                };
                candidates.push({
                    type: 'geometric',
                    pos: snapPos1,
                    priority: 3,
                    distance: distance(targetPos, snapPos1),
                    distanceFactor: distFactor,
                    angleFactor: angleFactor,
                    snapDistance: snapDistance,
                    snapAngle: snapAngle1
                });

                if (angleFactor !== 0) {
                    const snapAngle2 = offsetAngle - snapAngleTurn;
                    const snapPos2 = {
                        x: dragOrigin.x + snapDistance * Math.cos(snapAngle2),
                        y: dragOrigin.y + snapDistance * Math.sin(snapAngle2)
                    };
                    candidates.push({
                        type: 'geometric',
                        pos: snapPos2,
                        priority: 3,
                        distance: distance(targetPos, snapPos2),
                        distanceFactor: distFactor,
                        angleFactor: -angleFactor,
                        snapDistance: snapDistance,
                        snapAngle: snapAngle2
                    });
                }
            }
        });
    });

    return candidates;
}

function getUniversalSnapCandidates(mouseDataPos, transformationType, center, initialPoint, excludedPointIds = []) {
    const candidates = [];
    const excludedIdSet = new Set(excludedPointIds);

    const gridCandidates = getGridSnapCandidates(mouseDataPos, gridDisplayMode, lastGridState.interval1, lastAngularGridState, true);
    gridCandidates.forEach(gridPoint => {
        candidates.push({
            type: 'grid',
            pos: gridPoint,
            priority: 2,
            distance: distance(mouseDataPos, gridPoint)
        });
    });

    allPoints.forEach(p => {
        if (p.type === 'regular' && !excludedIdSet.has(p.id)) {
            candidates.push({
                type: 'vertex',
                pos: { x: p.x, y: p.y },
                priority: 1,
                distance: distance(mouseDataPos, p)
            });
        }
    });

    if (transformationType === TRANSFORMATION_TYPE_ROTATION) {
        const angleFactors = NINETY_DEG_ANGLE_SNAP_FRACTIONS;
        const initialVector = { x: initialPoint.x - center.x, y: initialPoint.y - center.y };
        const initialRadius = Math.hypot(initialVector.x, initialVector.y);
        const initialAngle = Math.atan2(initialVector.y, initialVector.x);

        angleFactors.forEach(factor => {
            if (factor !== 0) {
                [factor, -factor].forEach(f => {
                    const targetAngle = initialAngle + (f * Math.PI / 2);
                    const snapPos = {
                        x: center.x + initialRadius * Math.cos(targetAngle),
                        y: center.y + initialRadius * Math.sin(targetAngle)
                    };
                    
                    candidates.push({
                        type: 'rotation_angle',
                        pos: snapPos,
                        priority: 3,
                        distance: distance(mouseDataPos, snapPos),
                        angleFactor: f,
                        rotation: f * Math.PI / 2
                    });
                });
            }
        });

    } else if (transformationType === TRANSFORMATION_TYPE_SCALE) {
        const scaleFactors = SNAP_FACTORS.filter(f => f > 0 && f <= 6);
        const initialVector = { x: initialPoint.x - center.x, y: initialPoint.y - center.y };
        const initialRadius = Math.hypot(initialVector.x, initialVector.y);
        const initialAngle = Math.atan2(initialVector.y, initialVector.x);

        scaleFactors.forEach(factor => {
            const targetRadius = initialRadius * factor;
            const snapPos = {
                x: center.x + targetRadius * Math.cos(initialAngle),
                y: center.y + targetRadius * Math.sin(initialAngle)
            };
            
            candidates.push({
                type: 'scale_factor',
                pos: snapPos,
                priority: 3,
                distance: distance(mouseDataPos, snapPos),
                scaleFactor: factor
            });
        });

    } else if (transformationType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
        const scaleFactors = SNAP_FACTORS.filter(f => f !== 0 && Math.abs(f) <= 6);
        const initialVector = { x: initialPoint.x - center.x, y: initialPoint.y - center.y };
        const initialLength = Math.hypot(initialVector.x, initialVector.y);
        
        if (initialLength > GEOMETRY_CALCULATION_EPSILON) {
            const direction = { x: initialVector.x / initialLength, y: initialVector.y / initialLength };

            scaleFactors.forEach(factor => {
                [factor, -factor].forEach(f => {
                    const targetLength = initialLength * f;
                    const snapPos = {
                        x: center.x + targetLength * direction.x,
                        y: center.y + targetLength * direction.y
                    };
                    
                    candidates.push({
                        type: 'directional_scale',
                        pos: snapPos,
                        priority: 3,
                        distance: distance(mouseDataPos, snapPos),
                        scaleFactor: f
                    });
                });
            });
        }

    } else {
        // For 'translation' type, use the new dedicated function
        return getTranslationSnapCandidates(mouseDataPos, initialPoint);
    }

    return candidates;
}

function getBestSnapPosition(mouseDataPos) {
    const candidates = getAllSnapCandidatesNearMouse(mouseDataPos);
    if (candidates.length === 0) {
        return null;
    }

    const distanceSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;

    return candidates.reduce((best, current) => {
        const bestDist = distanceSq(mouseDataPos, best);
        const currentDist = distanceSq(mouseDataPos, current);
        return currentDist < bestDist ? current : best;
    });
}

function getSnappedPosition(startPoint, mouseScreenPos, shiftPressed, isDragContext = false, overrideContext = null) {
    const mouseDataPos = screenToData(mouseScreenPos);
    const drawingContext = overrideContext || getDrawingContext(startPoint.id);

    if (!shiftPressed) {
        const candidates = [];
        const pointSelectRadiusData = (POINT_RADIUS * 2) / viewTransform.scale;
        for (const p of allPoints) {
            if (p.id !== startPoint.id && p.type === "regular" && distance(mouseDataPos, p) < pointSelectRadiusData) {
                candidates.push({ priority: 1, dist: distance(mouseDataPos, p), pos: { x: p.x, y: p.y }, snapType: 'point', targetPoint: p });
            }
        }
        const edgeClickThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
        for (const edge of allEdges) {
            const p1 = findPointById(edge.id1);
            const p2 = findPointById(edge.id2);
            if (p1 && p2 && p1.type === "regular" && p2.type === "regular" && p1.id !== startPoint.id && p2.id !== startPoint.id) {
                const closest = getClosestPointOnLineSegment(mouseDataPos, p1, p2);
                if (closest.distance < edgeClickThresholdData && closest.onSegmentStrict) {
                    candidates.push({ priority: 2, dist: closest.distance, pos: { x: closest.x, y: closest.y }, snapType: 'edge', targetEdge: edge });
                }
            }
        }
        
        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.dist - b.dist;
            });
            const bestCandidate = candidates[0];
            const finalAngleRad = Math.atan2(bestCandidate.pos.y - startPoint.y, bestCandidate.pos.x - startPoint.x) || 0;
            return {
                ...bestCandidate.pos,
                angle: finalAngleRad * (180 / Math.PI),
                distance: distance(startPoint, bestCandidate.pos),
                snapped: true,
                snapType: bestCandidate.snapType,
                targetEdge: bestCandidate.targetEdge,
                targetPoint: bestCandidate.targetPoint,
                gridSnapped: false,
                lengthSnapFactor: null,
                angleSnapFactor: null,
                angleTurn: normalizeAngleToPi(finalAngleRad - drawingContext.offsetAngleRad),
                gridToGridSquaredSum: null,
                gridInterval: null
            };
        }

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

    const unselectedNeighbors = findNeighbors(startPoint.id)
        .map(id => findPointById(id))
        .filter(p => p && p.type === 'regular' && !selectedPointIds.includes(p.id));

    const isDeformingDrag = isDragContext && unselectedNeighbors.length > 0;

    if (isDeformingDrag) {
        const allSnapPoints = [];

        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (gridDisplayMode !== 'none' && gridInterval) {
            const gridPoints = getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true);
            gridPoints.forEach(p => allSnapPoints.push({ pos: p, type: 'grid' }));
        }

        allPoints.forEach(p => {
            if (p.id !== startPoint.id && p.type === 'regular') {
                allSnapPoints.push({ pos: p, type: 'vertex' });
            }
        });

        const getPerpendicularBisector = (p1, p2) => {
            const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const perpVector = { x: -(p2.y - p1.y), y: p2.x - p1.x };
            return { p1: midPoint, p2: { x: midPoint.x + perpVector.x * BISECTOR_LINE_EXTENSION_FACTOR, y: midPoint.y + perpVector.y * BISECTOR_LINE_EXTENSION_FACTOR } };
        };

        for (let i = 0; i < unselectedNeighbors.length; i++) {
            for (let j = i + 1; j < unselectedNeighbors.length; j++) {
                const n1 = unselectedNeighbors[i];
                const n2 = unselectedNeighbors[j];
                const bisector = getPerpendicularBisector(n1, n2);

                if (gridInterval) {
                    const maxDist = distance(startPoint, mouseDataPos) + gridInterval * 10;
                    for (let d = gridInterval * 0.5; d < maxDist; d += gridInterval * 0.5) {
                        const intersections = getLineCircleIntersection(bisector, { center: n1, radius: d });
                        intersections.forEach(p => allSnapPoints.push({ pos: p, type: 'equidistant_grid_dist' }));
                    }
                }

                const distN1N2 = distance(n1, n2);
                if (distN1N2 > GEOMETRY_CALCULATION_EPSILON) {
                    const midpoint = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
                    const bisectorDir = normalize({ x: -(n2.y - n1.y), y: n2.x - n1.x });
                    
                    const snapAnglesRad = NINETY_DEG_ANGLE_SNAP_FRACTIONS.map(f => f * Math.PI / 2);
                    snapAnglesRad.forEach(alpha => {
                        if (alpha > 0 && alpha < Math.PI) {
                            const h = (distN1N2 / 2) / Math.tan(alpha / 2);
                            const p1 = { x: midpoint.x + h * bisectorDir.x, y: midpoint.y + h * bisectorDir.y };
                            const p2 = { x: midpoint.x - h * bisectorDir.x, y: midpoint.y - h * bisectorDir.y };
                            allSnapPoints.push({ pos: p1, type: 'equidistant_angle' });
                            allSnapPoints.push({ pos: p2, type: 'equidistant_angle' });
                        }
                    });
                }
            }
        }
        
        if (unselectedNeighbors.length >= 3) {
            for (let i = 0; i < unselectedNeighbors.length; i++) {
                for (let j = i + 1; j < unselectedNeighbors.length; j++) {
                    for (let k = j + 1; k < unselectedNeighbors.length; k++) {
                        const n1 = unselectedNeighbors[i];
                        const n2 = unselectedNeighbors[j];
                        const n3 = unselectedNeighbors[k];
                        const bisector1 = getPerpendicularBisector(n1, n2);
                        const bisector2 = getPerpendicularBisector(n2, n3);
                        const circumcenter = getLineLineIntersection(bisector1, bisector2);
                        if (circumcenter) {
                            allSnapPoints.push({ pos: circumcenter, type: 'circumcenter' });
                        }
                    }
                }
            }
        }

        if (allSnapPoints.length === 0) {
            const finalAngleRad = Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x) || 0;
            return {
                x: mouseDataPos.x, y: mouseDataPos.y,
                angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, mouseDataPos),
                snapped: false
            };
        }

        const bestCandidate = allSnapPoints.reduce((best, current) => {
            const currentDist = distance(mouseDataPos, current.pos);
            const bestDist = best.pos ? distance(mouseDataPos, best.pos) : Infinity;
            return currentDist < bestDist ? current : best;
        }, { pos: null });
        
        const finalPos = bestCandidate.pos;
        const finalAngle = Math.atan2(finalPos.y - startPoint.y, finalPos.x - startPoint.x) || 0;
        return {
            x: finalPos.x,
            y: finalPos.y,
            angle: finalAngle * (180 / Math.PI),
            distance: distance(startPoint, finalPos),
            snapped: true,
            snapType: bestCandidate.type,
            gridSnapped: bestCandidate.type === 'grid',
            lengthSnapFactor: null,
            angleSnapFactor: null,
            angleTurn: normalizeAngleToPi(finalAngle - drawingContext.offsetAngleRad),
            gridToGridSquaredSum: null,
            gridInterval: null,
        };

    } else { // This block now handles RIGID DRAG and DRAWING
        const allShiftCandidates = [];
        
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (gridDisplayMode !== 'none' && gridInterval) {
            const gridPoints = getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true);
            gridPoints.forEach(p => allShiftCandidates.push({ pos: p, isGridPointSnap: true, type: 'grid' }));
        }

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
                    allShiftCandidates.push({
                        pos: pos,
                        isGridPointSnap: false,
                        type: 'geometric',
                        lengthSnapFactor: distData.factor,
                        angleSnapFactor: angleData.factor,
                        angleTurn: angleData.turn
                    });
                }
            }
        }

        if (allShiftCandidates.length > 0) {
            const bestOverallCandidate = allShiftCandidates.reduce((best, current) => {
                const currentDist = distance(mouseDataPos, current.pos);
                const bestDist = best.pos ? distance(mouseDataPos, best.pos) : Infinity;
                return currentDist < bestDist ? current : best;
            }, { pos: null });

            const finalAngle = Math.atan2(bestOverallCandidate.pos.y - startPoint.y, bestOverallCandidate.pos.x - startPoint.x) || 0;
            const snappedDistanceOutput = parseFloat(distance(startPoint, bestOverallCandidate.pos).toFixed(10));
            let gridToGridSquaredSum = null;
            let finalGridInterval = null;
            
            if (bestOverallCandidate.isGridPointSnap && gridDisplayMode !== 'polar') {
                const currentGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                const epsilon = currentGridInterval * GEOMETRY_CALCULATION_EPSILON;
                const isPointOnGrid = (point, interval) => Math.abs(point.x / interval - Math.round(point.x / interval)) < epsilon && Math.abs(point.y / interval - Math.round(point.y / interval)) < epsilon;
                if (isPointOnGrid(startPoint, currentGridInterval)) {
                    const deltaX = bestOverallCandidate.pos.x - startPoint.x;
                    const deltaY = bestOverallCandidate.pos.y - startPoint.y;
                    const dx_grid = Math.round(deltaX / currentGridInterval);
                    const dy_grid = Math.round(deltaY / currentGridInterval);
                    gridToGridSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;
                    finalGridInterval = currentGridInterval;
                }
            }

            let finalAngleTurn = bestOverallCandidate.angleTurn != null ? bestOverallCandidate.angleTurn : normalizeAngleToPi(finalAngle - drawingContext.offsetAngleRad);

            return {
                x: parseFloat(bestOverallCandidate.pos.x.toFixed(10)),
                y: parseFloat(bestOverallCandidate.pos.y.toFixed(10)),
                angle: finalAngle * (180 / Math.PI),
                distance: snappedDistanceOutput,
                snapped: true,
                gridSnapped: !!bestOverallCandidate.isGridPointSnap,
                snapType: bestOverallCandidate.isGridPointSnap ? 'grid' : 'geometric',
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
            gridToGridSquaredSum: null, gridInterval: null
        };
    }
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

function getAllSnapCandidatesNearMouse(mouseDataPos, excludedPointIds = []) {
    const candidates = getGridSnapCandidates(mouseDataPos, gridDisplayMode, lastGridState.interval1, lastAngularGridState, true);
    const excludedIdSet = new Set(excludedPointIds);

    // This loop now correctly ignores the points being transformed
    allPoints.forEach(p => {
        if (p.type === 'regular' && !excludedIdSet.has(p.id)) {
            candidates.push({ x: p.x, y: p.y, isGridPoint: false });
        }
    });
    
    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
    // 2. Add all existing points
    allPoints.forEach(p => {
        if (p.type === 'regular') {
            candidates.push({ x: p.x, y: p.y, isGridPoint: false });
        }
    });

    // 3. Add midpoints of all edges
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

    const iconGroups = ['coords', 'grid'];

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

    let currentX = UI_TOOLBAR_WIDTH + UI_BUTTON_PADDING;

    canvasUI.applyColorsButton = {
        id: "apply-colors-button",
        type: "button",
        x: currentX,
        y: paletteY + COLOR_PALETTE_Y_OFFSET,
        width: UI_SWATCH_SIZE,
        height: UI_SWATCH_SIZE,
    };
    currentX += UI_SWATCH_SIZE + UI_BUTTON_PADDING;

    canvasUI.randomColorButton = {
        id: "random-color-button", 
        type: "button",
        x: currentX,
        y: paletteY + COLOR_PALETTE_Y_OFFSET,
        width: UI_SWATCH_SIZE,
        height: UI_SWATCH_SIZE,
    };
    currentX += UI_SWATCH_SIZE + UI_BUTTON_PADDING;

    canvasUI.removeColorButton = {
        id: "remove-color-button",
        type: "button",
        x: currentX,
        y: paletteY + COLOR_PALETTE_Y_OFFSET,
        width: UI_SWATCH_SIZE,
        height: UI_SWATCH_SIZE,
    };
    currentX += UI_SWATCH_SIZE + UI_BUTTON_PADDING;

    recentColors.forEach((color, index) => {
        canvasUI.colorSwatches.push({
            id: `swatch-${color}-${index}`,
            type: "colorSwatch",
            x: currentX,
            y: paletteY + COLOR_PALETTE_Y_OFFSET,
            width: UI_SWATCH_SIZE,
            height: UI_SWATCH_SIZE,
            index: index,
            color: color
        });
        currentX += UI_SWATCH_SIZE + UI_BUTTON_PADDING;
    });

    const addButtonX = currentX;
    canvasUI.addColorButton = {
        id: "add-color-button",
        type: "button",
        x: addButtonX,
        y: paletteY + COLOR_PALETTE_Y_OFFSET,
        width: UI_SWATCH_SIZE,
        height: UI_SWATCH_SIZE,
    };

    // Set default selection if none exists
    if (selectedColorIndices.length === 0) {
        const currentColorIndex = recentColors.indexOf(currentColor);
        if (currentColorIndex !== -1) {
            selectedColorIndices = [currentColorIndex];
        } else {
            // If current color isn't in recent colors, select the first color
            if (recentColors.length > 0) {
                selectedColorIndices = [0];
            }
        }
    }
}
function buildVisibilityPanelUI() {
    canvasUI.visibilityIcons = [];
    if (!canvasUI.visibilityToolButton) return;

    const panelX = UI_TOOLBAR_WIDTH + UI_BUTTON_PADDING;
    const iconY = canvasUI.visibilityToolButton.y;
    const iconSize = DISPLAY_ICON_SIZE;
    const iconPadding = DISPLAY_ICON_PADDING;

    const iconGroups = ['points', 'angles', 'distances'];

    iconGroups.forEach((group, index) => {
        canvasUI.visibilityIcons.push({
            id: `visibility-icon-${group}`,
            group: group,
            x: panelX + index * (iconSize + iconPadding),
            y: iconY,
            width: iconSize,
            height: iconSize
        });
    });
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

    canvasUI.visibilityToolButton = {
        id: "visibility-tool-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.displayToolButton.y + canvasUI.displayToolButton.height + UI_BUTTON_PADDING,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };

    canvasUI.themeToggleButton = {
        id: "theme-toggle-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.visibilityToolButton.y + canvasUI.visibilityToolButton.height + UI_BUTTON_PADDING,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };
}

function handleDisplayPanelClick(screenPos, shiftKey, ctrlKey) {
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
                }
                return true;
            }
        }
    }
    return false;
}

function handleVisibilityPanelClick(screenPos, shiftKey, ctrlKey) {
    if (isVisibilityPanelExpanded) {
        for (const icon of canvasUI.visibilityIcons) {
            if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
                screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
                switch (icon.group) {
                    case 'points':
                        pointsVisible = !pointsVisible;
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

function handleCanvasUIClick(screenPos, shiftKey = false, ctrlKey = false) {
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
            isVisibilityPanelExpanded = false;
            selectedColorIndices = [];
        }
        return true;
    }

    if (isToolbarExpanded) {
        const ctb = canvasUI.colorToolButton;
        if (ctb && screenPos.x >= ctb.x && screenPos.x <= ctb.x + ctb.width &&
            screenPos.y >= ctb.y && screenPos.y <= ctb.y + ctb.height) {
            handleColorToolButtonClick();
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

        const vtb = canvasUI.visibilityToolButton;
        if (vtb && screenPos.x >= vtb.x && screenPos.x <= vtb.x + vtb.width &&
            screenPos.y >= vtb.y && screenPos.y <= vtb.y + vtb.height) {
            isVisibilityPanelExpanded = !isVisibilityPanelExpanded;
            if (isVisibilityPanelExpanded) buildVisibilityPanelUI();
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
        if (handleColorPaletteClick(screenPos, shiftKey, ctrlKey)) {
            return true;
        }
    }

    if (isColorPaletteExpanded) {
    if (handleColorPaletteClick(screenPos, shiftKey, ctrlKey)) {
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
                }
                return true;
            }
        }
    }

    if (isVisibilityPanelExpanded) {
        for (const icon of canvasUI.visibilityIcons) {
            if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
                screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
                switch (icon.group) {
                    case 'points':
                        pointsVisible = !pointsVisible;
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
    const existingIndex = recentColors.indexOf(color);
    
    if (existingIndex !== -1) {
        // Color already exists, just select it
        selectedColorIndices = [existingIndex];
        return;
    }
    
    // Add new color to the beginning
    recentColors.unshift(color);
    
    // Remove excess colors (keep max 8)
    if (recentColors.length > 8) {
        recentColors.pop();
    }
    
    // Update selected indices (shift existing indices by 1 since we added at beginning)
    selectedColorIndices = selectedColorIndices.map(index => {
        if (index >= 0) return index + 1;
        return index; // Keep -1 (random) unchanged
    });
    
    // Select the new color (now at index 0)
    if (!selectedColorIndices.includes(0)) {
        selectedColorIndices.unshift(0);
    }

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
    const selectRadiusDataRegular = (POINT_RADIUS * 2) / viewTransform.scale;
    const selectRadiusDataCenter = (CENTER_POINT_VISUAL_RADIUS + POINT_RADIUS ) / viewTransform.scale;

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

function setupColorPickerHandler() {
    colorPicker.addEventListener('change', (e) => {
        const newColor = e.target.value;
        setCurrentColor(newColor);
        addToRecentColors(newColor);
        
        // Ensure the new color is selected
        const newColorIndex = recentColors.indexOf(newColor);
        if (newColorIndex !== -1) {
            selectedColorIndices = [newColorIndex];
        }
        
        if (isColorPaletteExpanded) {
            buildColorPaletteUI();
        }
    });
}

function handleColorToolButtonClick() {
    isColorPaletteExpanded = !isColorPaletteExpanded;
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
        // Ensure current color is selected when opening palette
        if (selectedColorIndices.length === 0) {
            initializeColorPalette();
        }
    } else {
        // Keep selection when closing
        // selectedColorIndices = []; // Remove this line to maintain selection
    }
}

function initializeApp() {
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

    // Initialize color palette with default selection
    initializeColorPalette();
    setCurrentColor(currentColor);
    setupColorPickerHandler();
    
    saveStateForUndo();
    gameLoop();
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

function getBestTranslationSnap(initialDragPointStates, rawDelta, copyCount) {
    const snapStickinessData = (2 * POINT_RADIUS) / viewTransform.scale;
    if (initialDragPointStates.length === 0) {
        return { delta: rawDelta, snapped: false };
    }

    const handlePoint = initialDragPointStates[0];
    const mouseDragPos = { x: handlePoint.x + rawDelta.x, y: handlePoint.y + rawDelta.y };
    const allPossibleSnaps = [];

    const pointsToDrag = initialDragPointStates.filter(p => p.type === 'regular');
    const staticPoints = allPoints.filter(p => p.type === 'regular' && !initialDragPointStates.some(ip => ip.id === p.id));
    
    const multipliers = copyCount === 1 ? [1] : Array.from({ length: copyCount }, (_, k) => k);

    if (pointsToDrag.length > 0) {
        multipliers.forEach(k => {
            if (k === 0) return; 

            pointsToDrag.forEach(p_orig => {
                staticPoints.forEach(p_target => {
                    const requiredDelta = {
                        x: (p_target.x - p_orig.x) / k,
                        y: (p_target.y - p_orig.y) / k,
                    };
                    allPossibleSnaps.push({ delta: requiredDelta });
                });
            });
        });
        
        if (copyCount > 1) {
            multipliers.forEach(k1 => {
                multipliers.forEach(k2 => {
                    if (k1 >= k2) return; 
                    
                    pointsToDrag.forEach(p1_orig => {
                        pointsToDrag.forEach(p2_orig => {
                            const denominator = k1 - k2;
                            if (Math.abs(denominator) > 0) {
                                const requiredDelta = {
                                    x: (p2_orig.x - p1_orig.x) / denominator,
                                    y: (p2_orig.y - p1_orig.y) / denominator,
                                };
                                allPossibleSnaps.push({ delta: requiredDelta });
                            }
                        });
                    });
                });
            });
        }
    }

    if (allPossibleSnaps.length === 0) {
        return { delta: rawDelta, snapped: false };
    }

    let bestSnap = null;
    let minSnapDist = Infinity;

    allPossibleSnaps.forEach(snap => {
        const handleAtSnapPos = {
            x: handlePoint.x + snap.delta.x,
            y: handlePoint.y + snap.delta.y,
        };
        const dist = distance(mouseDragPos, handleAtSnapPos);

        if (dist < minSnapDist) {
            minSnapDist = dist;
            bestSnap = snap;
        }
    });

    if (bestSnap && minSnapDist < snapStickinessData) {
        return {
            delta: bestSnap.delta,
            snapped: true,
            snapType: 'merge'
        };
    }

    return { delta: rawDelta, snapped: false };
}

function getBestRotationSnap(center, initialPointStates, handlePoint, rawRotation) {
    const copyCount = parseInt(copyCountInput || '1', 10);

    if (currentShiftPressed || copyCount <= 1) {
        let allPossibleSnaps = [];

        if (currentShiftPressed) {
            for (const factor of NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
                const snapAngle = factor * Math.PI / 2;
                if (Math.abs(rawRotation - snapAngle) < ANGLE_SNAP_THRESHOLD_RAD) {
                    allPossibleSnaps.push({ rotation: snapAngle, priority: Math.abs(rawRotation - snapAngle) });
                }
                if (snapAngle !== 0 && Math.abs(rawRotation - (-snapAngle)) < ANGLE_SNAP_THRESHOLD_RAD) {
                    allPossibleSnaps.push({ rotation: -snapAngle, priority: Math.abs(rawRotation - (-snapAngle)) });
                }
            }
        }

        if (allPossibleSnaps.length > 0) {
            allPossibleSnaps.sort((a, b) => a.priority - b.priority);
            const bestSnap = allPossibleSnaps[0];
            const finalPos = applyTransformToPoint(handlePoint, center, bestSnap.rotation, 1, false, null);
            return {
                rotation: bestSnap.rotation,
                pos: finalPos,
                snapped: true,
                snapType: 'fraction'
            };
        }

        const finalPos = applyTransformToPoint(handlePoint, center, rawRotation, 1, false, null);
        return { rotation: rawRotation, pos: finalPos, snapped: false, snapType: null };

    } else {
        const snapThresholdData = (POINT_RADIUS * 2) / viewTransform.scale;
        const staticPoints = allPoints.filter(p => p.type === 'regular' && !initialPointStates.some(ip => ip.id === p.id));
        const pointsToTransform = initialPointStates.filter(p => p.type === 'regular');
        let allPossibleSnaps = [];

        for (let i = 0; i < pointsToTransform.length; i++) {
            for (let j = 0; j < pointsToTransform.length; j++) {
                const p1_orig = pointsToTransform[i];
                const p2_orig = pointsToTransform[j];

                const v1 = { x: p1_orig.x - center.x, y: p1_orig.y - center.y };
                const v2 = { x: p2_orig.x - center.x, y: p2_orig.y - center.y };
                
                const r1 = Math.hypot(v1.x, v1.y);
                const r2 = Math.hypot(v2.x, v2.y);
                
                if (Math.abs(r1 - r2) < snapThresholdData) {
                    const theta1_orig = Math.atan2(v1.y, v1.x);
                    const theta2_orig = Math.atan2(v2.y, v2.x);
                    
                    for (let c1 = 0; c1 < copyCount; c1++) {
                        for (let c2 = 0; c2 < copyCount; c2++) {
                            if (p1_orig.id === p2_orig.id && c1 === c2) continue;
                            if (c1 === c2) continue;

                            const delta_c = c1 - c2;
                            if (delta_c === 0) continue;

                            let delta_theta = theta2_orig - theta1_orig;
                            const target_delta_theta = rawRotation * delta_c;
                            const k = Math.round((target_delta_theta - delta_theta) / (2 * Math.PI));
                            delta_theta += k * (2 * Math.PI);

                            const exact_rotation = delta_theta / delta_c;
                            allPossibleSnaps.push({
                                rotation: exact_rotation,
                                priority: Math.abs(exact_rotation - rawRotation)
                            });
                        }
                    }
                }
            }
        }
        
        pointsToTransform.forEach(p_orig => {
            staticPoints.forEach(p_static => {
                const v_orig = { x: p_orig.x - center.x, y: p_orig.y - center.y };
                const v_static = { x: p_static.x - center.x, y: p_static.y - center.y };
                const r_orig = Math.hypot(v_orig.x, v_orig.y);
                const r_static = Math.hypot(v_static.x, v_static.y);

                if (Math.abs(r_orig - r_static) < snapThresholdData) {
                    const theta_orig = Math.atan2(v_orig.y, v_orig.x);
                    const theta_static = Math.atan2(v_static.y, v_static.y);
                    
                    for (let c = 0; c < copyCount; c++) {
                        if (c === 0) {
                            if (Math.abs(normalizeAngleToPi(theta_static - theta_orig)) < GEOMETRY_CALCULATION_EPSILON) {
                                allPossibleSnaps.push({ rotation: 0, priority: Math.abs(rawRotation) });
                            }
                            continue;
                        }

                        let delta_theta = theta_static - theta_orig;
                        const target_delta_theta = rawRotation * c;
                        const k = Math.round((target_delta_theta - delta_theta) / (2 * Math.PI));
                        delta_theta += k * (2 * Math.PI);

                        const exact_rotation = delta_theta / c;
                        allPossibleSnaps.push({
                            rotation: exact_rotation,
                            priority: Math.abs(exact_rotation - rawRotation)
                        });
                    }
                }
            });
        });

        if (allPossibleSnaps.length > 0) {
            allPossibleSnaps.sort((a, b) => a.priority - b.priority);
            const bestSnap = allPossibleSnaps[0];
            
            if (bestSnap.priority < ANGLE_SNAP_THRESHOLD_RAD) {
                const finalPos = applyTransformToPoint(handlePoint, center, bestSnap.rotation, 1, false, null);
                return { 
                    rotation: bestSnap.rotation, 
                    pos: finalPos, 
                    snapped: true, 
                    snapType: 'merge' 
                };
            }
        }
        
        const finalPos = applyTransformToPoint(handlePoint, center, rawRotation, 1, false, null);
        return { rotation: rawRotation, pos: finalPos, snapped: false, snapType: null };
    }
}

function getBestScaleSnap(center, initialPointStates, handlePoint, rawScale) {
    const copyCount = parseInt(copyCountInput || '1', 10);

    if (currentShiftPressed || copyCount <= 1) {
        let allPossibleSnaps = [];

        if (Math.abs(rawScale - 1.0) < 0.1) {
            allPossibleSnaps.push({ scale: 1.0, priority: Math.abs(rawScale - 1.0) });
        }
        
        if (currentShiftPressed) {
            for (const factor of SNAP_FACTORS) {
                if (Math.abs(rawScale - factor) < 0.1) {
                    allPossibleSnaps.push({ scale: factor, priority: Math.abs(rawScale - factor) });
                }
            }
        }
        
        if (allPossibleSnaps.length > 0) {
            allPossibleSnaps.sort((a, b) => a.priority - b.priority);
            const bestSnap = allPossibleSnaps[0];
            const finalPos = applyTransformToPoint(handlePoint, center, 0, bestSnap.scale, false, null);
            return {
                scale: bestSnap.scale,
                pos: finalPos,
                snapped: true,
                snapType: 'fraction',
                snappedScaleValue: bestSnap.scale
            };
        }
        
        const finalPos = applyTransformToPoint(handlePoint, center, 0, rawScale, false, null);
        return { scale: rawScale, pos: finalPos, snapped: false, snapType: null };

    } else {
        const snapThresholdData = (POINT_RADIUS * 2) / viewTransform.scale;
        const angleThreshold = snapThresholdData / 100;
        const staticPoints = allPoints.filter(p => p.type === 'regular' && !initialPointStates.some(ip => ip.id === p.id));
        const pointsToTransform = initialPointStates.filter(p => p.type === 'regular');
        let allPossibleSnaps = [];
        
        for (let i = 0; i < pointsToTransform.length; i++) {
            for (let j = 0; j < pointsToTransform.length; j++) {
                const p1_orig = pointsToTransform[i];
                const p2_orig = pointsToTransform[j];

                const v1 = { x: p1_orig.x - center.x, y: p1_orig.y - center.y };
                const v2 = { x: p2_orig.x - center.x, y: p2_orig.y - center.y };
                
                const r1 = Math.hypot(v1.x, v1.y);
                const r2 = Math.hypot(v2.x, v2.y);
                
                if (r1 < GEOMETRY_CALCULATION_EPSILON || r2 < GEOMETRY_CALCULATION_EPSILON) continue;
                
                const theta1 = Math.atan2(v1.y, v1.x);
                const theta2 = Math.atan2(v2.y, v2.x);

                if (Math.abs(normalizeAngleToPi(theta1 - theta2)) < angleThreshold) {
                    for (let c1 = 0; c1 < copyCount; c1++) {
                        for (let c2 = 0; c2 < copyCount; c2++) {
                            if (p1_orig.id === p2_orig.id && c1 === c2) continue;
                            if (c1 === c2) continue;
                            
                            const delta_c = c1 - c2;
                            if (delta_c === 0) continue;
                            
                            const ratio = r2 / r1;
                            if (ratio <= 0) continue;
                            
                            const exact_scale = Math.pow(ratio, 1 / delta_c);
                            allPossibleSnaps.push({
                                scale: exact_scale,
                                priority: Math.abs(exact_scale - rawScale)
                            });
                        }
                    }
                }
            }
        }
        
        pointsToTransform.forEach(p_orig => {
            staticPoints.forEach(p_static => {
                const v_orig = { x: p_orig.x - center.x, y: p_orig.y - center.y };
                const v_static = { x: p_static.x - center.x, y: p_static.y - center.y };
                const r_orig = Math.hypot(v_orig.x, v_orig.y);
                const r_static = Math.hypot(v_static.x, v_static.y);
                
                if (r_orig < GEOMETRY_CALCULATION_EPSILON || r_static < GEOMETRY_CALCULATION_EPSILON) return;

                const theta_orig = Math.atan2(v_orig.y, v_orig.x);
                const theta_static = Math.atan2(v_static.y, v_static.x);

                if (Math.abs(normalizeAngleToPi(theta_orig - theta_static)) < angleThreshold) {
                    for (let c = 0; c < copyCount; c++) {
                        if (c === 0) {
                            if (Math.abs(r_static - r_orig) < snapThresholdData) {
                                allPossibleSnaps.push({ scale: 1.0, priority: Math.abs(rawScale - 1.0) });
                            }
                            continue;
                        }

                        const ratio = r_static / r_orig;
                        if (ratio <= 0) continue;

                        const exact_scale = Math.pow(ratio, 1 / c);
                        allPossibleSnaps.push({
                            scale: exact_scale,
                            priority: Math.abs(exact_scale - rawScale)
                        });
                    }
                }
            });
        });
        
        if (allPossibleSnaps.length > 0) {
            allPossibleSnaps.sort((a, b) => a.priority - b.priority);
            const bestSnap = allPossibleSnaps[0];

            if (bestSnap.priority < 0.1) {
                const finalPos = applyTransformToPoint(handlePoint, center, 0, bestSnap.scale, false, null);
                return {
                    scale: bestSnap.scale,
                    pos: finalPos,
                    snapped: true,
                    snapType: 'merge'
                };
            }
        }
        
        const finalPos = applyTransformToPoint(handlePoint, center, 0, rawScale, false, null);
        return { scale: rawScale, pos: finalPos, snapped: false, snapType: null };
    }
}

function getBestDirectionalScaleSnap(center, initialPointStates, handlePoint, rawScale, startVector) {
    const copyCount = parseInt(copyCountInput || '1', 10);

    if (currentShiftPressed || copyCount <= 1) {
        let allPossibleSnaps = [];
        if (Math.abs(rawScale - 1.0) < 0.1) {
            allPossibleSnaps.push({ scale: 1.0, priority: Math.abs(rawScale - 1.0) });
        }
        if (Math.abs(rawScale) < 0.1) {
            allPossibleSnaps.push({ scale: 0, priority: Math.abs(rawScale) });
        }
        if (currentShiftPressed) {
            const scaleSnapFactors = SNAP_FACTORS.filter(f => f !== 0);
            for (const factor of scaleSnapFactors) {
                if (Math.abs(rawScale - factor) < 0.1) {
                    allPossibleSnaps.push({ scale: factor, priority: Math.abs(rawScale - factor) });
                }
            }
        }
        if (allPossibleSnaps.length > 0) {
            allPossibleSnaps.sort((a, b) => a.priority - b.priority);
            const bestSnap = allPossibleSnaps[0];
            const finalPos = applyTransformToPoint(handlePoint, center, 0, bestSnap.scale, true, startVector);
            return {
                scale: bestSnap.scale,
                pos: finalPos,
                snapped: true,
                snapType: 'fraction',
                snappedScaleValue: bestSnap.scale
            };
        }
        const finalPos = applyTransformToPoint(handlePoint, center, 0, rawScale, true, startVector);
        return { scale: rawScale, pos: finalPos, snapped: false, snapType: null };
    } else {
        const snapThresholdData = (POINT_RADIUS * 2) / viewTransform.scale;
        const staticPoints = allPoints.filter(p => p.type === 'regular' && !initialPointStates.some(ip => ip.id === p.id));
        const pointsToTransform = initialPointStates.filter(p => p.type === 'regular');
        let allPossibleSnaps = [];
        const axis_dist = Math.hypot(startVector.x, startVector.y);
        if (axis_dist < GEOMETRY_CALCULATION_EPSILON) {
            const finalPos = applyTransformToPoint(handlePoint, center, 0, rawScale, true, startVector);
            return { scale: rawScale, pos: finalPos, snapped: false, snapType: null };
        }
        const axis_norm = { x: startVector.x / axis_dist, y: startVector.y / axis_dist };
        const getProjectedComponents = (p) => {
            const vec = { x: p.x - center.x, y: p.y - center.y };
            const parallel_dist = vec.x * axis_norm.x + vec.y * axis_norm.y;
            const perp_vec = { x: vec.x - parallel_dist * axis_norm.x, y: vec.y - parallel_dist * axis_norm.y };
            return { parallel_dist, perp_vec };
        };

        for (let i = 0; i < pointsToTransform.length; i++) {
            for (let j = 0; j < pointsToTransform.length; j++) {
                const p1_orig = pointsToTransform[i];
                const p2_orig = pointsToTransform[j];
                const proj1 = getProjectedComponents(p1_orig);
                const proj2 = getProjectedComponents(p2_orig);
                if (distance(proj1.perp_vec, proj2.perp_vec) < snapThresholdData) {
                    for (let c1 = 0; c1 < copyCount; c1++) {
                        for (let c2 = 0; c2 < copyCount; c2++) {
                            if (p1_orig.id === p2_orig.id && c1 === c2) continue;
                            if (c1 === c2) continue;
                            const delta_c = c1 - c2;
                            if (delta_c === 0 || Math.abs(proj1.parallel_dist) < GEOMETRY_CALCULATION_EPSILON) continue;
                            const ratio = proj2.parallel_dist / proj1.parallel_dist;
                            if (ratio >= 0) {
                                const pos_scale = Math.pow(ratio, 1 / delta_c);
                                allPossibleSnaps.push({ scale: pos_scale, priority: Math.abs(pos_scale - rawScale) });
                                if (delta_c % 2 === 0) {
                                    const neg_scale = -pos_scale;
                                    allPossibleSnaps.push({ scale: neg_scale, priority: Math.abs(neg_scale - rawScale) });
                                }
                            } else if (delta_c % 2 !== 0) {
                                const neg_scale = -Math.pow(Math.abs(ratio), 1 / delta_c);
                                allPossibleSnaps.push({ scale: neg_scale, priority: Math.abs(neg_scale - rawScale) });
                            }
                        }
                    }
                }
            }
        }
        
        pointsToTransform.forEach(p_orig => {
            const proj_orig = getProjectedComponents(p_orig);
            staticPoints.forEach(p_static => {
                const proj_static = getProjectedComponents(p_static);
                if (distance(proj_orig.perp_vec, proj_static.perp_vec) < snapThresholdData) {
                    if (Math.abs(proj_orig.parallel_dist) < GEOMETRY_CALCULATION_EPSILON) return;
                    for (let c = 0; c < copyCount; c++) {
                        if (c === 0) {
                            if (Math.abs(proj_static.parallel_dist - proj_orig.parallel_dist) < snapThresholdData) {
                                allPossibleSnaps.push({ scale: 1.0, priority: Math.abs(rawScale - 1.0) });
                            }
                            continue;
                        }
                        const ratio = proj_static.parallel_dist / proj_orig.parallel_dist;
                        let exact_scale;
                        if (ratio >= 0) exact_scale = Math.pow(ratio, 1/c);
                        else if (c % 2 !== 0) exact_scale = -Math.pow(Math.abs(ratio), 1/c);
                        else continue;
                        allPossibleSnaps.push({ scale: exact_scale, priority: Math.abs(exact_scale - rawScale) });
                    }
                }
            });
        });

        const collapsedPositions = pointsToTransform.map(p => ({ p, collapsed: {x: center.x + getProjectedComponents(p).perp_vec.x, y: center.y + getProjectedComponents(p).perp_vec.y} }));
        for (const item of collapsedPositions) {
            if (staticPoints.some(sp => distance(item.collapsed, sp) < snapThresholdData)) {
                allPossibleSnaps.push({ scale: 0, priority: Math.abs(rawScale) });
            }
        }
        for (let i = 0; i < collapsedPositions.length; i++) {
            for (let j = i + 1; j < collapsedPositions.length; j++) {
                if (distance(collapsedPositions[i].collapsed, collapsedPositions[j].collapsed) < snapThresholdData) {
                    allPossibleSnaps.push({ scale: 0, priority: Math.abs(rawScale) });
                }
            }
        }
        
        if (allPossibleSnaps.length > 0) {
            allPossibleSnaps.sort((a, b) => a.priority - b.priority);
            const bestSnap = allPossibleSnaps[0];
            if (bestSnap.priority < 0.1) {
                const finalPos = applyTransformToPoint(handlePoint, center, 0, bestSnap.scale, true, startVector);
                return { scale: bestSnap.scale, pos: finalPos, snapped: true, snapType: 'merge' };
            }
        }

        const finalPos = applyTransformToPoint(handlePoint, center, 0, rawScale, true, startVector);
        return { scale: rawScale, pos: finalPos, snapped: false, snapType: null };
    }
}

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const colors = getColors();
    clearCanvas(ctx, { canvas, dpr, colors });

    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;

    const { grid1Interval, grid2Interval, alpha1, alpha2 } = calculateGridIntervals(viewTransform.scale);
    lastGridState = { interval1: grid1Interval, interval2: grid2Interval, alpha1, alpha2, scale: viewTransform.scale };
    lastAngularGridState = getDynamicAngularIntervals(viewTransform, actualCanvasWidth, actualCanvasHeight, dataToScreen);
    
    const stateForFeedback = { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors };

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
    const isCopyPreviewActive = copyCount > 1 && isDragConfirmed && initialDragPointStates.length > 0 && initialDragPointStates.some(p => p.type === 'regular');

    const effectiveDragPreviewsForMainDrawing = isCopyPreviewActive ? [] : dragPreviewPoints;
    const stateForEdges = { allEdges, selectedEdgeIds, isDragConfirmed, dragPreviewPoints: effectiveDragPreviewsForMainDrawing, currentColor, colors };
    drawAllEdges(ctx, stateForEdges, dataToScreen, findPointById, getEdgeId);

    allPoints.forEach(point => {
        if (point.type === POINT_TYPE_REGULAR) {
            let pointToDraw = { ...point };
            const isSelectedRegularPointInCopyPreview = isCopyPreviewActive && initialDragPointStates.some(p => p.id === point.id && p.type === 'regular');

            if (isDragConfirmed && effectiveDragPreviewsForMainDrawing.length > 0) {
                const preview = effectiveDragPreviewsForMainDrawing.find(dp => dp.id === point.id);
                if (preview) {
                    pointToDraw.x = preview.x;
                    pointToDraw.y = preview.y;
                }
            }

            if (!isSelectedRegularPointInCopyPreview) {
                const isHovered = hoveredPointId === point.id;
                drawPoint(ctx, pointToDraw, { selectedPointIds, selectedCenterIds, activeCenterId, currentColor, colors, pointsVisible, isHovered }, dataToScreen, updateHtmlLabel);
            }
        }
    });

    allPoints.forEach(point => {
        if (point.type !== POINT_TYPE_REGULAR) {
            let pointToDraw = { ...point };
            if (isDragConfirmed && effectiveDragPreviewsForMainDrawing.length > 0) {
                const preview = effectiveDragPreviewsForMainDrawing.find(dp => dp.id === point.id);
                if (preview) {
                    pointToDraw.x = preview.x;
                    pointToDraw.y = preview.y;
                }
            }
            const isHovered = hoveredPointId === point.id;
            drawPoint(ctx, pointToDraw, { selectedPointIds, selectedCenterIds, activeCenterId, currentColor, colors, pointsVisible, isHovered }, dataToScreen, updateHtmlLabel);
        }
    });

    if (transformIndicatorData) {
        drawTransformIndicators(ctx, htmlOverlay, { transformIndicatorData, angleSigFigs, distanceSigFigs, colors }, dataToScreen, updateHtmlLabel);
    }

    if (isCopyPreviewActive) {
        drawCopyPreviews(ctx, {
            copyCount,
            isDragConfirmed,
            initialDragPointStates,
            dragPreviewPoints,
            transformIndicatorData,
            allEdges,
            findPointById,
            findNeighbors,
            colors
        }, dataToScreen);
    }

    if (isDragConfirmed) {
        if (actionContext && actionContext.dragSnap) {
            const { dragOrigin, snappedData, drawingContext } = actionContext.dragSnap;
            const targetDataPos = { x: snappedData.x, y: snappedData.y };

            drawDrawingPreview(ctx, {
                startPoint: dragOrigin,
                snappedData,
                isShiftPressed: true,
                currentColor,
                nextCreationColor: getNextCreationColor(false),
                colors
            }, dataToScreen);

            const stateForSnapInfo = { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors };
            prepareSnapInfoTexts(ctx, htmlOverlay, dragOrigin, targetDataPos, snappedData, stateForSnapInfo, dataToScreen, drawingContext, updateHtmlLabel);

        } else {
            const hybridPointStates = allPoints.map(p => {
                const draggedVersion = dragPreviewPoints.find(dp => dp.id === p.id);
                return draggedVersion || p;
            });

            if (actionContext && actionContext.targetPoint) {
                drawDragFeedback(ctx, htmlOverlay, actionContext.targetPoint.id, hybridPointStates, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, currentShiftPressed, null, updateHtmlLabel, selectedPointIds, true, initialDragPointStates);
            } else if (actionContext && actionContext.targetEdge) {
                drawSelectedEdgeDistances(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showDistances, distanceSigFigs, colors, lastGridState }, findPointById, getEdgeId, dataToScreen, updateHtmlLabel, hybridPointStates);
            }
        }
    } else if ((showDistances || showAngles) && !isDrawingMode && !isCopyPreviewActive && !isPlacingTransform) {
        if (selectedPointIds.length > 0 && selectedPointIds.length <= MAX_POINTS_FOR_ANGLES) {
            selectedPointIds.forEach(pointId => {
                drawDragFeedback(ctx, htmlOverlay, pointId, allPoints, { ...stateForFeedback, currentShiftPressed: false }, dataToScreen, findNeighbors, getEdgeId, false, null, updateHtmlLabel, selectedPointIds, false, []);
            });
        }
        if (selectedEdgeIds.length > 0 && selectedEdgeIds.length <= MAX_EDGES_FOR_LABELS) {
            drawSelectedEdgeDistances(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showDistances, distanceSigFigs, colors, lastGridState }, findPointById, getEdgeId, dataToScreen, updateHtmlLabel);
            drawSelectedEdgeAngles(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showAngles, angleSigFigs, angleDisplayMode, currentShiftPressed, distanceSigFigs, viewTransform, lastGridState, colors }, findPointById, getEdgeId, dataToScreen, findNeighbors, updateHtmlLabel);
        }
    }

    if (isDrawingMode && previewLineStartPointId) {
        const startPoint = findPointById(previewLineStartPointId);
        if (startPoint) {
            const currentPreviewDrawingContext = getDrawingContext(startPoint.id);
            const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed);

            drawDrawingPreview(ctx, {
                startPoint,
                snappedData,
                isShiftPressed: currentShiftPressed,
                currentColor,
                nextCreationColor: getNextCreationColor(false),
                colors
            }, dataToScreen);

            const stateForSnapInfo = { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors };
            prepareSnapInfoTexts(ctx, htmlOverlay, startPoint, snappedData, snappedData, stateForSnapInfo, dataToScreen, currentPreviewDrawingContext, updateHtmlLabel);
        }
    }

    if (isRectangleSelecting && isDragConfirmed) {
        drawSelectionRectangle(ctx, rectangleSelectStartPos, mousePos, colors);
    }

    if (isDragConfirmed) {
        drawMergePreviews(ctx, { allPoints, dragPreviewPoints, viewTransform, colors, transformIndicatorData, copyCount, initialDragPointStates }, dataToScreen);
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

    updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostPointPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors}, screenToData, updateHtmlLabel);

    const stateForUI = {
        dpr, canvasUI, isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isVisibilityPanelExpanded,
        isPlacingTransform, placingTransformType, placingSnapPos, mousePos, selectedColorIndices,
        recentColors, activeThemeName, colors, pointsVisible, coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode
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

function initializeColorPalette() {
    // Ensure currentColor is in recentColors
    if (!recentColors.includes(currentColor)) {
        recentColors.unshift(currentColor); // Add to beginning
        if (recentColors.length > 8) {
            recentColors.pop(); // Remove last if too many
        }
    }
    
    // Set initial selection to current color
    const currentColorIndex = recentColors.indexOf(currentColor);
    if (currentColorIndex !== -1) {
        selectedColorIndices = [currentColorIndex];
    }
}

function handleColorPaletteClick(screenPos, shiftKey, ctrlKey) {
    if (!isColorPaletteExpanded) return false;

    const applyBtn = canvasUI.applyColorsButton;
    if (applyBtn && screenPos.x >= applyBtn.x && screenPos.x <= applyBtn.x + applyBtn.width &&
        screenPos.y >= applyBtn.y && screenPos.y <= applyBtn.y + applyBtn.height) {
        applyColorsToSelection();
        return true;
    }

    const randomBtn = canvasUI.randomColorButton;
    if (randomBtn && screenPos.x >= randomBtn.x && screenPos.x <= randomBtn.x + randomBtn.width &&
        screenPos.y >= randomBtn.y && screenPos.y <= randomBtn.y + randomBtn.height) {
        if (ctrlKey) {
            const index = selectedColorIndices.indexOf(-1);
            if (index > -1) {
                selectedColorIndices.splice(index, 1);
            } else {
                selectedColorIndices.push(-1);
            }
        } else if (shiftKey) {
            if (!selectedColorIndices.includes(-1)) {
                selectedColorIndices.push(-1);
            }
        } else {
            selectedColorIndices = [-1];
        }
        return true;
    }

    for (const swatch of canvasUI.colorSwatches) {
        if (screenPos.x >= swatch.x && screenPos.x <= swatch.x + swatch.width &&
            screenPos.y >= swatch.y && screenPos.y <= swatch.y + swatch.height) {
            if (ctrlKey) {
                const index = selectedColorIndices.indexOf(swatch.index);
                if (index > -1) {
                    selectedColorIndices.splice(index, 1);
                } else {
                    selectedColorIndices.push(swatch.index);
                }
            } else if (shiftKey) {
                if (!selectedColorIndices.includes(swatch.index)) {
                    selectedColorIndices.push(swatch.index);
                }
            } else {
                selectedColorIndices = [swatch.index];
                setCurrentColor(swatch.color);
            }
            return true;
        }
    }

    const removeBtn = canvasUI.removeColorButton;
    if (removeBtn && screenPos.x >= removeBtn.x && screenPos.x <= removeBtn.x + removeBtn.width &&
        screenPos.y >= removeBtn.y && screenPos.y <= removeBtn.y + removeBtn.height) {
        if (selectedColorIndices.length > 0) {
            const indicesToRemove = selectedColorIndices.filter(index => index >= 0).sort((a, b) => b - a);
            indicesToRemove.forEach(index => {
                recentColors.splice(index, 1);
            });
            selectedColorIndices = selectedColorIndices.filter(index => index === -1);
            
            // After removing colors, ensure we still have a selection if colors remain
            if (recentColors.length > 0 && selectedColorIndices.length === 0) {
                selectedColorIndices = [0]; // Select first remaining color
                setCurrentColor(recentColors[0]);
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

    return false;
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
        colorCreationIndex = 0;
        return;
    }

    if (isPlacingTransform) {
        isPlacingTransform = false;
        placingTransformType = null;
        placingSnapPos = null;
        return;
    }

    selectedPointIds = [];
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
    initialDragPointStates = [];
    actionTargetPoint = null;
    currentMouseButton = -1;
    clickData = { pointId: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair';
    transformIndicatorData = null;
    ghostPoints = [];
    ghostPointPosition = null;
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
    const mergeRadiusData = (POINT_RADIUS * 2) / viewTransform.scale;

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

function createEdgesToOriginalNeighbors(originalPointIds, newIdMap) {
    originalPointIds.forEach(originalId => {
        const newId = newIdMap.get(originalId);
        if (!newId) return;
        
        const neighbors = findNeighbors(originalId);
        neighbors.forEach(neighborId => {
            if (!originalPointIds.has(neighborId)) {
                const edgeExists = allEdges.some(e =>
                    (e.id1 === newId && e.id2 === neighborId) ||
                    (e.id1 === neighborId && e.id2 === newId)
                );
                if (!edgeExists) {
                    allEdges.push({ id1: newId, id2: neighborId });
                }
            }
        });
    });
}

function findMergeTargetsForCopyPreview(previewPoints, mergeRadiusData) {
    const mergeTargets = new Map();
    
    previewPoints.forEach(previewPoint => {
        for (const existingPoint of allPoints) {
            if (existingPoint.type === 'regular' && 
                existingPoint.id !== previewPoint.originalId &&
                distance(previewPoint, existingPoint) < mergeRadiusData) {
                mergeTargets.set(previewPoint.id, existingPoint);
                break;
            }
        }
    });
    
    return mergeTargets;
}

function handleMouseDown(event) {
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

    if (handleCanvasUIClick(mousePos, event.shiftKey, event.ctrlKey || event.metaKey)) {
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

    if (isPlacingTransform) {
        if (event.button === 0) {
            saveStateForUndo();
            const type = placingTransformType;
            const finalPlacePos = placingSnapPos || mousePos;
            const dataPos = screenToData(finalPlacePos);
            const mergeRadiusData = (POINT_RADIUS * 2) / viewTransform.scale;

            let mergeTarget = null;
            for (const existingPoint of allPoints) {
                if (existingPoint.type === type && distance(dataPos, existingPoint) < mergeRadiusData) {
                    mergeTarget = existingPoint;
                    break;
                }
            }

            if (mergeTarget) {
                handleCenterSelection(mergeTarget.id, false, false);
            } else {
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
            }
        }
        
        isPlacingTransform = false;
        placingTransformType = null;
        placingSnapPos = null;
        
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

        if (clickedEdge && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
            const edgeId = getEdgeId(clickedEdge);
            if (!selectedEdgeIds.includes(edgeId)) {
                selectedPointIds = [];
                selectedEdgeIds = [edgeId];
                selectedCenterIds = [];
                activeCenterId = null;
            }
        }

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
                const newPoint = { id: generateUniqueId(), x: closest.x, y: closest.y, type: 'regular', color: getNextCreationColor() };
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
}

setupColorPickerHandler();

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

    hoveredPointId = null;
    if (!isActionInProgress && !pointsVisible) {
        const mouseDataPos = screenToData(mousePos);
        const selectRadiusData = (POINT_RADIUS * 2) / viewTransform.scale;
        for (let i = allPoints.length - 1; i >= 0; i--) {
            const point = allPoints[i];
            if (point.type === POINT_TYPE_REGULAR && distance(mouseDataPos, point) < selectRadiusData) {
                hoveredPointId = point.id;
                break;
            }
        }
    }

    if (currentShiftPressed && !isActionInProgress) {
        const mouseDataPos = screenToData(mousePos);
        if (isPlacingTransform) {
            const potentialSnapPos = getBestSnapPosition(mouseDataPos);
            if (potentialSnapPos) {
                placingSnapPos = dataToScreen(potentialSnapPos);
                ghostPointPosition = potentialSnapPos;
            }
        } else if (isDrawingMode && previewLineStartPointId) {
            const startPoint = findPointById(previewLineStartPointId);
            if (startPoint) {
                const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed, false);
                ghostPointPosition = { x: snappedData.x, y: snappedData.y };
            }
        } else {
            ghostPointPosition = getBestSnapPosition(mouseDataPos);
        }
    } else if (!currentShiftPressed) {
        ghostPointPosition = null;
        placingSnapPos = null;
    }

    if (!isActionInProgress) {
        return;
    }

    if (!isDragConfirmed && distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
        isDragConfirmed = true;
        isEdgeTransformDrag = false;
        if (currentMouseButton === 2) { isRectangleSelecting = true; return; }
        const { targetPoint, targetEdge } = actionContext;
        if (isDraggingCenter) {
            const pointToDrag = targetPoint;
            if (pointToDrag) {
                initialDragPointStates = JSON.parse(JSON.stringify([pointToDrag]));
                dragPreviewPoints = JSON.parse(JSON.stringify([pointToDrag]));
                canvas.style.cursor = 'grabbing';
            }
            if (pointToDrag && pointToDrag.type === TRANSFORMATION_TYPE_ROTATION) {
                const center = pointToDrag;
                const startReferencePoint = screenToData(actionStartPos);
                const startVector = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };
                actionContext.initialRotationStartAngle = Math.atan2(startVector.y, startVector.x);
                currentAccumulatedRotation = 0;
            }
            return;
        } else if (targetEdge) {
            if (activeCenterId) isEdgeTransformDrag = true;
            const pointIdsToAffect = new Set(selectedPointIds);
            selectedEdgeIds.forEach(edgeId => {
                const edge = allEdges.find(e => getEdgeId(e) === edgeId);
                if (edge) { pointIdsToAffect.add(edge.id1); pointIdsToAffect.add(edge.id2); }
            });
            pointIdsToAffect.add(targetEdge.id1);
            pointIdsToAffect.add(targetEdge.id2);
            const pointsToDrag = Array.from(pointIdsToAffect).map(id => findPointById(id)).filter(Boolean);
            if (pointsToDrag.length > 0) {
                initialDragPointStates = JSON.parse(JSON.stringify(pointsToDrag));
                dragPreviewPoints = JSON.parse(JSON.stringify(pointsToDrag));
                canvas.style.cursor = 'grabbing';
            }
        } else if (actionContext.target !== 'canvas') {
            actionTargetPoint = targetPoint;
            if (targetPoint?.type !== 'regular') {
                if (targetPoint) handleCenterSelection(targetPoint.id, actionContext.shiftKey, actionContext.ctrlKey);
            } else if (targetPoint && !selectedPointIds.includes(targetPoint.id)) {
                applySelectionLogic([targetPoint.id], [], actionContext.shiftKey, actionContext.ctrlKey, false);
            }
            let pointsToDragIds = new Set([...selectedPointIds, ...selectedCenterIds]);
            if (targetPoint && !pointsToDragIds.has(targetPoint.id)) {
                pointsToDragIds = new Set([targetPoint.id]);
                if (targetPoint.type === 'regular') {
                    selectedPointIds = [targetPoint.id];
                    selectedCenterIds = [];
                } else {
                    selectedPointIds = [];
                    selectedCenterIds = [targetPoint.id];
                }
                activeCenterId = selectedCenterIds.at(-1) ?? null;
            }
            const pointsToDrag = Array.from(pointsToDragIds).map(id => findPointById(id)).filter(Boolean);
            let finalPointsToDrag = pointsToDrag;
            if (activeCenterId) {
                const center = findPointById(activeCenterId);
                if (center) {
                    finalPointsToDrag = pointsToDrag.filter(p => {
                        if (p.type !== 'regular') return true;
                        const pScreen = dataToScreen(p);
                        const centerScreen = dataToScreen(center);
                        const screenDistance = Math.hypot(pScreen.x - centerScreen.x, pScreen.y - centerScreen.y);
                        return screenDistance > 0.1;
                    });
                }
            }
            if (finalPointsToDrag.length > 0) {
                initialDragPointStates = JSON.parse(JSON.stringify(finalPointsToDrag));
                dragPreviewPoints = JSON.parse(JSON.stringify(finalPointsToDrag));
                canvas.style.cursor = 'grabbing';
            }
        } else if (currentMouseButton === 0) {
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
            canvas.style.cursor = 'move';
        }
    }

    if (isDragConfirmed) {
        actionContext.dragSnap = null;
        const isTransformingSelection = activeCenterId && selectedPointIds.length > 0 && !isEdgeTransformDrag;

        ghostPointPosition = null;
        ghostPoints = [];

        if (currentShiftPressed) {
            const dragOrigin = actionContext.targetPoint || initialDragPointStates[0];
            if (dragOrigin) {
                const snappedData = getSnappedPosition(dragOrigin, mousePos, true, true);
                const finalDelta = { x: snappedData.x - dragOrigin.x, y: snappedData.y - dragOrigin.y };

                initialDragPointStates.forEach(originalPointState => {
                    const previewPointToUpdate = dragPreviewPoints.find(dp => dp && dp.id === originalPointState.id);
                    if (previewPointToUpdate) {
                        previewPointToUpdate.x = originalPointState.x + finalDelta.x;
                        previewPointToUpdate.y = originalPointState.y + finalDelta.y;
                    }
                });
            }
        } else {
            if (isPanningBackground) {
                const deltaX_css = mousePos.x - actionStartPos.x;
                const deltaY_css = mousePos.y - actionStartPos.y;
                viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
                viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
            } else if (isDraggingCenter) {
                const mouseData = screenToData(mousePos);
                const startMouseData = screenToData(actionStartPos);
                let finalDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };
                const targetSnapPos = { x: initialDragPointStates[0].x + finalDelta.x, y: initialDragPointStates[0].y + finalDelta.y };
                const snapResult = getDragSnapPosition(initialDragPointStates[0], targetSnapPos);
                if (snapResult.snapped) {
                    finalDelta = { x: snapResult.point.x - initialDragPointStates[0].x, y: snapResult.point.y - initialDragPointStates[0].y };
                    ghostPointPosition = snapResult.point;
                }
                const newPos = { x: initialDragPointStates[0].x + finalDelta.x, y: initialDragPointStates[0].y + finalDelta.y };
                dragPreviewPoints[0].x = newPos.x;
                dragPreviewPoints[0].y = newPos.y;
            } else if (isTransformingSelection || isEdgeTransformDrag) {
                const center = findPointById(activeCenterId);
                let startReferencePoint;
                if (isEdgeTransformDrag) {
                    startReferencePoint = screenToData(actionStartPos);
                } else {
                    startReferencePoint = initialDragPointStates.find(p => actionTargetPoint && p.id === actionTargetPoint.id);
                    if (!startReferencePoint || distance(startReferencePoint, center) < 1e-6) {
                        startReferencePoint = initialDragPointStates.find(p => distance(p, center) > 1e-6) || startReferencePoint || initialDragPointStates[0];
                    }
                }
                if (!center || !startReferencePoint) return;
                const centerType = center.type;
                const mouseData = screenToData(mousePos);
                const rawTransform = calculateTransformFromMouse(center, mouseData, startReferencePoint, centerType, currentAccumulatedRotation);
                let snapResult = {};
                let finalTransform = {};
                if (centerType === TRANSFORMATION_TYPE_ROTATION) {
                    snapResult = getBestRotationSnap(center, initialDragPointStates, startReferencePoint, rawTransform.rotation);
                    finalTransform = { rotation: snapResult.rotation, scale: 1, directionalScale: false };
                    currentAccumulatedRotation = snapResult.rotation;
                } else if (centerType === TRANSFORMATION_TYPE_SCALE) {
                    snapResult = getBestScaleSnap(center, initialDragPointStates, startReferencePoint, rawTransform.scale);
                    finalTransform = { rotation: 0, scale: snapResult.scale || rawTransform.scale, directionalScale: false };
                } else if (centerType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
                    const startVector = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };
                    snapResult = getBestDirectionalScaleSnap(center, initialDragPointStates, startReferencePoint, rawTransform.scale, startVector);
                    finalTransform = { rotation: 0, scale: snapResult.scale || rawTransform.scale, directionalScale: true };
                }
                transformIndicatorData = {
                    center,
                    startPos: startReferencePoint,
                    currentPos: snapResult.pos || mouseData,
                    rotation: finalTransform.rotation,
                    scale: finalTransform.scale,
                    isSnapping: snapResult.snapped || false,
                    transformType: centerType,
                    directionalScale: finalTransform.directionalScale,
                    snappedScaleValue: snapResult.snappedScaleValue || null,
                    gridToGridInfo: snapResult.gridToGridInfo || null
                };
                const startVectorForApply = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };
                dragPreviewPoints = initialDragPointStates.map(p_initial => {
                    const newPos = applyTransformToPoint(p_initial, center, finalTransform.rotation, finalTransform.scale, finalTransform.directionalScale, startVectorForApply);
                    return { ...p_initial, x: newPos.x, y: newPos.y };
                });
                if (snapResult.snapped && snapResult.snapType === 'merge' && snapResult.mergingPoint && snapResult.mergeTarget) {
                    const sourcePointInitial = initialDragPointStates.find(p => p.id === snapResult.mergingPoint.id);
                    if(sourcePointInitial) {
                        const snappedPointPreview = dragPreviewPoints.find(p => p.id === sourcePointInitial.id);
                        if (snappedPointPreview) {
                            const correctionVector = { x: snapResult.mergeTarget.x - snappedPointPreview.x, y: snapResult.mergeTarget.y - snappedPointPreview.y };
                            dragPreviewPoints.forEach(p => { p.x += correctionVector.x; p.y += correctionVector.y; });
                            if (transformIndicatorData.currentPos) { transformIndicatorData.currentPos.x += correctionVector.x; transformIndicatorData.currentPos.y += correctionVector.y; }
                        }
                    }
                }
                ghostPoints = [];
                ghostPointPosition = null;
                const mergeRadiusData = (POINT_RADIUS * 2) / viewTransform.scale;
                const staticPointsForMerge = allPoints.filter(p => p.type === 'regular' && !initialDragPointStates.some(ip => ip.id === p.id));
                dragPreviewPoints.forEach(previewPoint => {
                    if (previewPoint.type === 'regular') {
                        staticPointsForMerge.forEach(staticPoint => {
                            if (distance(previewPoint, staticPoint) < mergeRadiusData) { ghostPoints.push({ x: staticPoint.x, y: staticPoint.y }); }
                        });
                    }
                });
                for (let i = 0; i < dragPreviewPoints.length; i++) {
                    for (let j = i + 1; j < dragPreviewPoints.length; j++) {
                        const p1 = dragPreviewPoints[i];
                        const p2 = dragPreviewPoints[j];
                        if (p1.type === 'regular' && p2.type === 'regular' && distance(p1, p2) < mergeRadiusData) {
                            ghostPoints.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
                        }
                    }
                }
            } else if (dragPreviewPoints.length > 0) {
                const mouseData = screenToData(mousePos);
                const startMouseData = screenToData(actionStartPos);
                let rawDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };

                let finalDelta;
                let snapResult = { snapped: false };

                snapResult = getBestTranslationSnap(initialDragPointStates, rawDelta, parseInt(copyCountInput || '1', 10));
                finalDelta = snapResult.delta;
                actionContext.finalSnapResult = snapResult;
                
                initialDragPointStates.forEach(originalPointState => {
                    const previewPointToUpdate = dragPreviewPoints.find(dp => dp && dp.id === originalPointState.id);
                    if (previewPointToUpdate) {
                        previewPointToUpdate.x = originalPointState.x + finalDelta.x;
                        previewPointToUpdate.y = originalPointState.y + finalDelta.y;
                    }
                });
                
                ghostPoints = [];
                ghostPointPosition = null;

                if (snapResult.snapped && snapResult.mergeTarget) {
                    ghostPointPosition = snapResult.mergeTarget;
                }
            }
        }
    }
});

canvas.addEventListener("mouseup", (event) => {
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
            const minX = Math.min(dataP1.x, dataP2.x);
            const maxX = Math.max(dataP1.x, dataP2.x);
            const minY = Math.min(dataP1.y, dataP2.y);
            const maxY = Math.max(dataP1.y, dataP2.y);
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
            // No action
        } else if (dragPreviewPoints.length > 0) {
            saveStateForUndo();
            const mergeRadiusData = (POINT_RADIUS * 2) / viewTransform.scale;

            function performMergeAndUpdate(pointToUpdate, finalPos) {
                if (pointToUpdate.type !== 'regular') {
                    pointToUpdate.x = finalPos.x;
                    pointToUpdate.y = finalPos.y;
                    return pointToUpdate.id;
                }
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
                            if (!edgeAlreadyExists) { newEdges.push({ id1: pointToKeepId, id2: otherEndId }); }
                        }
                    }
                    allEdges = allEdges.filter(edge => edge.id1 !== pointToDeleteId && edge.id2 !== pointToDeleteId);
                    allPoints = allPoints.filter(p => p.id !== pointToDeleteId);
                    selectedPointIds = selectedPointIds.filter(id => id !== pointToDeleteId);
                    if (!selectedPointIds.includes(pointToKeepId)) { selectedPointIds.push(pointToKeepId); }
                    allEdges.push(...newEdges);
                    return pointToKeepId;
                } else {
                    pointToUpdate.x = finalPos.x;
                    pointToUpdate.y = finalPos.y;
                    return pointToUpdate.id;
                }
            }
            
            // NEW: Only change selection if we dragged an edge that wasn't already selected
            if (actionContext && actionContext.targetEdge && !shiftKey && !ctrlKey) {
                const edgeId = getEdgeId(actionContext.targetEdge);
                const wasAlreadySelected = selectedEdgeIds.includes(edgeId);
                
                if (!wasAlreadySelected) {
                    // Only clear other selections if the edge wasn't already selected
                    selectedEdgeIds = [edgeId];
                    selectedPointIds = [];
                    selectedCenterIds = [];
                    activeCenterId = null;
                }
                // If it was already selected, keep all existing selections
            }
            
            if (copyCount <= 1) {
                    const snapResult = actionContext.finalSnapResult;

                    if (snapResult && snapResult.snapType === 'edge' && snapResult.targetEdge && initialDragPointStates.length === 1) {
                        const pointToInsert = allPoints.find(p => p.id === initialDragPointStates[0].id);
                        const finalPos = dragPreviewPoints[0];
                        const targetEdge = snapResult.targetEdge;

                        if (pointToInsert && finalPos && targetEdge) {
                            pointToInsert.x = finalPos.x;
                            pointToInsert.y = finalPos.y;

                            allEdges = allEdges.filter(e => getEdgeId(e) !== getEdgeId(targetEdge));

                            allEdges.push({ id1: targetEdge.id1, id2: pointToInsert.id });
                            allEdges.push({ id1: pointToInsert.id, id2: targetEdge.id2 });
                        }
                    } else {
                        dragPreviewPoints.forEach(dp => {
                            if (dp) {
                                const originalPoint = allPoints.find(p => p.id === dp.id);
                                if (originalPoint) {
                                    performMergeAndUpdate(originalPoint, { x: dp.x, y: dp.y });
                                }
                            }
                        });
                    }
            } else {
                const pointsToCopy = initialDragPointStates.filter(p => p.type === 'regular');
                if (pointsToCopy.length > 0) {
                    const originalIds = new Set(pointsToCopy.map(p => p.id));
                    const incidentEdges = allEdges.filter(edge => originalIds.has(edge.id1) && originalIds.has(edge.id2));
                    const externalConnections = [];
                    pointsToCopy.forEach(p_copy => {
                        const neighbors = findNeighbors(p_copy.id);
                        neighbors.forEach(neighborId => {
                            if (!originalIds.has(neighborId)) {
                                externalConnections.push({ fromOriginalId: p_copy.id, toStaticId: neighborId });
                            }
                        });
                    });
                    
                    let finalTransform;
                    if (transformIndicatorData) {
                        finalTransform = { type: 'matrix', ...transformIndicatorData };
                    } else {
                        const refOriginalPoint = initialDragPointStates.find(p => p.type === 'regular');
                        const refPreviewPoint = dragPreviewPoints.find(p => p.id === refOriginalPoint.id);
                        const delta = { x: refPreviewPoint.x - refOriginalPoint.x, y: refPreviewPoint.y - refOriginalPoint.y };
                        finalTransform = { type: 'translation', delta: delta };
                    }

                    const newlyGeneratedPoints = [];
                    for (let i = 1; i < copyCount; i++) {
                        pointsToCopy.forEach(p => {
                            let newPos;
                            if (finalTransform.type === 'matrix') {
                                const { center, rotation, scale, directionalScale, startPos } = finalTransform;
                                const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
                                newPos = applyTransformToPoint(p, center, rotation * i, Math.pow(scale, i), directionalScale, startVector);
                            } else {
                                newPos = { x: p.x + finalTransform.delta.x * i, y: p.y + finalTransform.delta.y * i };
                            }
                            newlyGeneratedPoints.push({ ...p, ...newPos, id: generateUniqueId(), originalId: p.id, copyIndex: i });
                        });
                    }
                    
                    const mergeCandidates = [...allPoints, ...newlyGeneratedPoints];
                    const parent = new Map();
                    mergeCandidates.forEach(p => parent.set(p.id, p.id));
                    const findSet = (id) => {
                        if (!parent.has(id)) return id;
                        if (parent.get(id) === id) return id;
                        const rootId = findSet(parent.get(id));
                        parent.set(id, rootId);
                        return rootId;
                    };
                    const unionSets = (id1, id2) => {
                        const root1 = findSet(id1);
                        const root2 = findSet(id2);
                        if (root1 !== root2) parent.set(root2, root1);
                    };

                    for (let i = 0; i < mergeCandidates.length; i++) {
                        for (let j = i + 1; j < mergeCandidates.length; j++) {
                            const p1 = mergeCandidates[i];
                            const p2 = mergeCandidates[j];
                            if (distance(p1, p2) < mergeRadiusData) {
                                unionSets(p1.id, p2.id);
                            }
                        }
                    }

                    const finalPoints = new Map();
                    mergeCandidates.forEach(p => {
                        const rootId = findSet(p.id);
                        if (!finalPoints.has(rootId)) {
                            finalPoints.set(rootId, mergeCandidates.find(cp => cp.id === rootId));
                        }
                    });

                    allPoints = Array.from(finalPoints.values());
                    const finalEdges = new Map();
                    allEdges.forEach(edge => {
                        const id1 = findSet(edge.id1);
                        const id2 = findSet(edge.id2);
                        if(id1 !== id2) {
                            const edgeId = getEdgeId({id1, id2});
                            if(!finalEdges.has(edgeId)) finalEdges.set(edgeId, {id1, id2});
                        }
                    });
                    
                    let firstCopyFinalIds = [];
                    for (let i = 1; i < copyCount; i++) {
                        const newIdMapForThisCopy = new Map();
                        pointsToCopy.forEach(p => {
                            const generatedPoint = newlyGeneratedPoints.find(np => np.originalId === p.id && np.copyIndex === i);
                            if(generatedPoint) {
                                newIdMapForThisCopy.set(p.id, findSet(generatedPoint.id));
                            }
                        });
                        
                        incidentEdges.forEach(edge => {
                            const newId1 = newIdMapForThisCopy.get(edge.id1);
                            const newId2 = newIdMapForThisCopy.get(edge.id2);
                            if (newId1 && newId2 && newId1 !== newId2) {
                                const edgeId = getEdgeId({id1: newId1, id2: newId2});
                                if(!finalEdges.has(edgeId)) finalEdges.set(edgeId, {id1: newId1, id2: newId2});
                            }
                        });

                        externalConnections.forEach(conn => {
                            const newId1 = newIdMapForThisCopy.get(conn.fromOriginalId);
                            const newId2 = findSet(conn.toStaticId);
                            if (newId1 && newId2 && newId1 !== newId2) {
                                const edgeId = getEdgeId({id1: newId1, id2: newId2});
                                if(!finalEdges.has(edgeId)) finalEdges.set(edgeId, {id1: newId1, id2: newId2});
                            }
                        });

                        if (i === 1) {
                            firstCopyFinalIds = [...new Set(Array.from(newIdMapForThisCopy.values()))];
                        }
                    }
                    
                    allEdges = Array.from(finalEdges.values());
                    selectedPointIds = firstCopyFinalIds;
                    selectedEdgeIds = [];
                }
            }
        }
    } else {
        if (currentMouseButton === 0) {
            const startPoint = findPointById(previewLineStartPointId);
            if (isDrawingMode && startPoint) {
                saveStateForUndo();
                let newPoint = null;
                const snappedData = getSnappedPosition(startPoint, mousePos, shiftKey);

                if (snappedData.snapType === 'point' && snappedData.targetPoint) {
                    const edgeExists = allEdges.some(e => (e.id1 === startPoint.id && e.id2 === snappedData.targetPoint.id) || (e.id2 === startPoint.id && e.id1 === snappedData.targetPoint.id));
                    if (!edgeExists) {
                        allEdges.push({ id1: startPoint.id, id2: snappedData.targetPoint.id });
                    }
                    newPoint = snappedData.targetPoint;

                } else if (snappedData.snapType === 'edge' && snappedData.targetEdge) {
                    const targetEdge = snappedData.targetEdge;
                    const p1 = findPointById(targetEdge.id1);
                    const p2 = findPointById(targetEdge.id2);

                    newPoint = { id: generateUniqueId(), x: snappedData.x, y: snappedData.y, type: 'regular', color: getNextCreationColor() };
                    allPoints.push(newPoint);

                    allEdges = allEdges.filter(e => getEdgeId(e) !== getEdgeId(targetEdge));
                    allEdges.push({ id1: p1.id, id2: newPoint.id });
                    allEdges.push({ id1: newPoint.id, id2: p2.id });
                    allEdges.push({ id1: startPoint.id, id2: newPoint.id });

                } else {
                    newPoint = { id: generateUniqueId(), x: snappedData.x, y: snappedData.y, type: 'regular', color: getNextCreationColor() };
                    allPoints.push(newPoint);
                    allEdges.push({ id1: startPoint.id, id2: newPoint.id });
                }

                if (newPoint) {
                    const completedSegmentProps = getCompletedSegmentProperties(startPoint, newPoint, allEdges);
                    if (completedSegmentProps) {
                        if (drawingSequence.length > 0) {
                            drawingSequence[drawingSequence.length - 1].turn = completedSegmentProps.turnAngleRad;
                        }
                        drawingSequence.push({ length: completedSegmentProps.length, turn: 0, endPointColor: newPoint.color });
                        currentSequenceIndex = drawingSequence.length - 1;
                    }
                }

                if (shiftKey && newPoint && snappedData) {
                    const completedSegmentProps = getCompletedSegmentProperties(startPoint, newPoint, allEdges);
                    if (completedSegmentProps) {
                        frozenReference_Origin_Data = completedSegmentProps.startPoint;
                        if (snappedData.gridToGridSquaredSum > 0 && snappedData.gridInterval) {
                            frozenReference_D_du = snappedData.gridInterval * Math.sqrt(snappedData.gridToGridSquaredSum);
                        } else {
                            frozenReference_D_du = completedSegmentProps.length;
                        }
                        frozenReference_D_g2g = snappedData.gridToGridSquaredSum > 0 ? { g2gSquaredSum: snappedData.gridToGridSquaredSum, interval: snappedData.gridInterval } : null;
                        frozenReference_A_rad = completedSegmentProps.turnAngleRad;
                        frozenReference_A_baseRad = completedSegmentProps.precedingSegmentAbsoluteAngleRad;
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
                }
                clickData.count = 0;
            } else {
                const now = Date.now();
                let primaryClickTarget = target;
                if (primaryClickTarget && primaryClickTarget !== 'canvas') {
                    const targetId = primaryClickTarget.id || getEdgeId(primaryClickTarget);
                    let targetType;
                    if (primaryClickTarget.id) {
                        if (primaryClickTarget.type !== 'regular') { targetType = 'center'; } else { targetType = 'point'; }
                    } else { targetType = 'edge'; }
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
                                // NEW: Handle edge selection on single click
                                if (!shiftKey && !ctrlKey) {
                                    selectedPointIds = [];
                                    selectedEdgeIds = [targetId];
                                    selectedCenterIds = [];
                                    activeCenterId = null;
                                } else {
                                    applySelectionLogic([], [targetId], shiftKey, ctrlKey, false);
                                }
                            } else if (targetType === 'center') { 
                                if (!ctrlKey) { 
                                    handleCenterSelection(targetId, shiftKey, ctrlKey); 
                                } 
                            }
                            break;
                        case 2:
                            if (targetType === 'point') { const neighbors = findNeighbors(clickData.targetId); applySelectionLogic([clickData.targetId, ...neighbors], [], false, false); } else if (targetType === 'edge') { const edge = allEdges.find(e => getEdgeId(e) === clickData.targetId); if (edge) { const validNeighborEdges = [...findNeighborEdges(edge.id1), ...findNeighborEdges(edge.id2)].filter(e => findPointById(e.id1) && findPointById(e.id2)); applySelectionLogic([], Array.from(new Set(validNeighborEdges.map(e => getEdgeId(e)))), false, false); } } else if (targetType === 'center') { const center = findPointById(clickData.targetId); if (center) { const relatedPoints = allPoints.filter(p => p.type === 'regular' && distance(p, center) < (POINT_SELECT_RADIUS * 10 / viewTransform.scale)).map(p => p.id); const relatedEdges = allEdges.filter(e => relatedPoints.includes(e.id1) && relatedPoints.includes(e.id2)).map(e => getEdgeId(e)); applySelectionLogic(relatedPoints, relatedEdges, shiftKey, ctrlKey, false); } }
                            break;
                        case 3:
                            if (targetType === 'point') { const pointsInSubgraph = findAllPointsInSubgraph(clickData.targetId); applySelectionLogic(pointsInSubgraph, [], false, false); } else if (targetType === 'edge') { const edge = allEdges.find(e => getEdgeId(e) === clickData.targetId); if (edge) { const pointsInSubgraph = new Set(findAllPointsInSubgraph(edge.id1)); const edgesInSubgraph = allEdges.filter(e => pointsInSubgraph.has(e.id1) && pointsInSubgraph.has(e.id2)); applySelectionLogic([], edgesInSubgraph.map(e => getEdgeId(e)), false, false); } } else if (targetType === 'center') { const allRegularPoints = allPoints.filter(p => p.type === 'regular').map(p => p.id); const allGeometricEdges = allEdges.map(e => getEdgeId(e)); applySelectionLogic(allRegularPoints, allGeometricEdges, shiftKey, ctrlKey, false); }
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
                    const newPoint = { id: generateUniqueId(), ...startCoords, type: 'regular', color: getNextCreationColor() };
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
    currentAccumulatedRotation = 0;
});

canvas.addEventListener('mousedown', handleMouseDown);

window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
        currentShiftPressed = false;
        // Turn off all visual snap indicators when Shift is released
        ghostPointPosition = null;
        placingSnapPos = null;
        ghostPoints = [];
    }
});

window.addEventListener('keydown', (event) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    if (event.key === 'Shift' && !currentShiftPressed) {
        currentShiftPressed = true;
        // Trigger snap indicators immediately on Shift press
        const mouseDataPos = screenToData(mousePos);
        if (isPlacingTransform) {
            const potentialSnapPos = getBestSnapPosition(mouseDataPos);
            if (potentialSnapPos) {
                placingSnapPos = dataToScreen(potentialSnapPos);
                ghostPointPosition = potentialSnapPos;
            }
        } else if (isDrawingMode && previewLineStartPointId) {
            const startPoint = findPointById(previewLineStartPointId);
            if (startPoint) {
                const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed);
                ghostPointPosition = { x: snappedData.x, y: snappedData.y };
            }
        } else if (!isActionInProgress) { // General canvas interaction (not dragging/drawing)
            ghostPointPosition = getBestSnapPosition(mouseDataPos);
        }
    }

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
    initializeApp();
});