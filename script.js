import ColormapSelector from 'colormap-selector';
import 'colormap-selector/styles.css';

import * as C from './constants.js';
import * as U from './utils.js';
import * as R from './renderer.js';

const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const htmlOverlay = document.getElementById('html-overlay');
const dpr = window.devicePixelRatio || 1;
const activeHtmlLabels = new Map();
let colorEditor;
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


let isDraggingColorTarget = false;
let draggedColorTargetInfo = null;

let currentDrawingPath = [];
let frozenReference_A_rad = null;
let frozenReference_A_baseRad = null;
let frozenReference_D_du = null;
let frozenReference_Origin_Data = null;
let isMouseOverCanvas = false;
let placingSnapPos = null;
let isDisplayPanelExpanded = false;
let isVisibilityPanelExpanded = false;
let coordsDisplayMode = 'regular';
let gridDisplayMode = 'lines';
let angleDisplayMode = 'degrees';
let distanceDisplayMode = 'on';
let verticesVisible = true;
let edgesVisible = true;
let facesVisible = false;

let hoveredVertexId = null;
let hoveredEdgeId = null;
let hoveredFaceId = null;
let isEdgeTransformDrag = false;
let isDraggingCenter = false;
let allVertices = [];
let allEdges = [];
let allFaces = [];
let selectedVertexIds = [];
let selectedEdgeIds = [];
let selectedFaceIds = [];
let activeCenterId = null;
let mousePos = { x: 0, y: 0 };

let frozenReference_D_g2g = null;
let isToolbarExpanded = false;
let isColorPaletteExpanded = false;
let isEditingColor = false;
let editingColorIndex = null;
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
let initialDragVertexStates = [];
let rectangleSelectStartPos = { x: 0, y: 0 };
let actionContext = null;
let allColors = C.DEFAULT_RECENT_COLORS;
let isDrawingMode = false;
let previewLineStartVertexId = null;
let actionTargetVertex = null;
let dragPreviewVertices = [];
let currentShiftPressed = false;
let clipboard = { vertices: [], edges: [], faces: [], referenceVertex: null };
let clickData = { targetId: null, type: null, count: 0, timestamp: 0 };
let undoStack = [];
let redoStack = [];
let ghostVertexPosition = null;
let selectedCenterIds = [];
let copyCountInput = '';
let copyCountTimer = null;
let ghostVertices = [];
let currentAccumulatedRotation = 0;
let lastGridState = {
    interval1: null,
    interval2: null,
    alpha1: 0,
    alpha2: 0,
    scale: null
};
let viewTransform = {
    scale: C.DEFAULT_CALIBRATION_VIEW_SCALE,
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

let activeColorTarget = C.COLOR_TARGET_VERTEX;
let colorAssignments = {
    [C.COLOR_TARGET_VERTEX]: 0,
    [C.COLOR_TARGET_EDGE]: 1,
    [C.COLOR_TARGET_FACE]: 2,
};

let isDraggingCoordSystem = false;
let draggedCoordSystemElement = null;
let coordSystemSnapTargets = null;


function ensureFaceCoordinateSystems() {
    U.updateFaceLocalCoordinateSystems(allFaces, findVertexById);
}

function createFaceWithCoordinateSystem(vertexIds) {
    const newFace = {
        id: U.getFaceId({ vertexIds }),
        vertexIds: vertexIds,
        localCoordSystem: null
    };

    if (!allFaces.some(f => f.id === newFace.id)) {
        allFaces.push(newFace);
    }

    ensureFaceCoordinateSystems();
    return newFace;
}

function getColors() {
    const theme = U.getCurrentTheme(activeThemeName, C.BASE_THEME);
    return theme;
}

function generateRandomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    const a = Math.random() * 0.8 + 0.2;
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function getColorForTarget(targetType, index = 0, total = 1) {
    const colorIndex = colorAssignments[targetType];
    if (colorIndex === -1) {
        return generateRandomColor();
    }
    const item = allColors[colorIndex];
    if (item?.type === 'color') {
        return item.value;
    } else if (item?.type === 'colormap') {
        const t = total > 1 ? index / (total - 1) : 0.5;
        return U.sampleColormap(item, t);
    }
    return getColors().vertex;
}

function applyColormapToEdge(edge, index = 0, total = 1) {
    const colorIndex = colorAssignments[C.COLOR_TARGET_EDGE];
    if (colorIndex === -1) {
        edge.color = generateRandomColor();
        return;
    }
    
    const colorItem = allColors[colorIndex];
    if (colorItem && colorItem.type === 'colormap') {
        const startT = total > 1 ? index / total : 0;
        const endT = total > 1 ? (index + 1) / total : 1;
        edge.gradientStart = startT;
        edge.gradientEnd = endT;
        edge.colormapItem = colorItem;
        delete edge.colormapOffset;
        delete edge.color;
    } else if (colorItem && colorItem.type === 'color') {
        edge.color = colorItem.value;
        delete edge.gradientStart;
        delete edge.gradientEnd;
        delete edge.colormapItem;
        delete edge.colormapOffset;
    } else {
        edge.color = getColors().edge;
        delete edge.gradientStart;
        delete edge.gradientEnd;
        delete edge.colormapItem;
        delete edge.colormapOffset;
    }
}

function applyColorsToSelection() {
    saveStateForUndo();

    const colorIndex = colorAssignments[activeColorTarget];
    if (colorIndex === -1 && activeColorTarget !== C.COLOR_TARGET_VERTEX) {
        return;
    }

    if (activeColorTarget === C.COLOR_TARGET_VERTEX) {
        const colorItem = allColors[colorIndex];
        if (colorItem && colorItem.type === 'colormap') {
            const verticesToColor = selectedVertexIds.map(id => findVertexById(id)).filter(p => p && p.type === 'regular');
            verticesToColor.forEach((vertex, index) => {
                const t = verticesToColor.length > 1 ? index / (verticesToColor.length - 1) : 0.5;
                vertex.color = U.sampleColormap(colorItem, t);
            });
        } else {
            selectedVertexIds.forEach(id => {
                const vertex = findVertexById(id);
                if (vertex && vertex.type === 'regular') {
                    vertex.color = getColorForTarget(C.COLOR_TARGET_VERTEX);
                }
            });
        }
    } else if (activeColorTarget === C.COLOR_TARGET_EDGE) {
        const colorItem = allColors[colorIndex];
        if (colorItem && colorItem.type === 'colormap') {
            selectedEdgeIds.forEach((edgeId, index) => {
                const edge = allEdges.find(e => U.getEdgeId(e) === edgeId);
                if (edge) {
                    const totalEdges = selectedEdgeIds.length;
                    const startT = totalEdges > 1 ? index / totalEdges : 0;
                    const endT = totalEdges > 1 ? (index + 1) / totalEdges : 1;
                    edge.gradientStart = startT;
                    edge.gradientEnd = endT;
                    edge.colormapItem = colorItem;
                    delete edge.colormapOffset;
                    delete edge.color;
                }
            });
        } else {
            const color = getColorForTarget(C.COLOR_TARGET_EDGE);
            allEdges.forEach(edge => {
                if (selectedEdgeIds.includes(U.getEdgeId(edge))) {
                    edge.color = color;
                    delete edge.gradientStart;
                    delete edge.gradientEnd;
                    delete edge.colormapItem;
                    delete edge.colormapOffset;
                }
            });
        }
    } else if (activeColorTarget === C.COLOR_TARGET_FACE) {
        const color = getColorForTarget(C.COLOR_TARGET_FACE);
        allFaces.forEach(face => {
            if (selectedFaceIds.includes(U.getFaceId(face))) {
                face.color = color;
            }
        });
    }
}

function invertVertexColors() {
    allVertices.forEach(vertex => {
        if (vertex.type === C.POINT_TYPE_REGULAR) {
            if (vertex.color) {
                vertex.color = U.invertGrayscaleValue(vertex.color);
            } else {
                vertex.color = getColors().vertex;
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

function getDeformingSnapPosition(dragOrigin, mouseDataPos, selectedVertexIds) {
    const snapStickinessData = C.SNAP_STICKINESS_RADIUS_SCREEN / viewTransform.scale;
    let allCandidates = [];

    const unselectedNeighbors = U.findNeighbors(dragOrigin.id, allEdges)
        .map(id => findVertexById(id))
        .filter(p => p && !selectedVertexIds.includes(p.id));

    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    allVertices.forEach(p => {
        if (p.id !== dragOrigin.id && p.type === 'regular') {
            allCandidates.push({ pos: p, type: 'vertex' });
        }
    });

    if (gridInterval) {
        U.getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true).forEach(p => {
            allCandidates.push({ pos: p, type: 'grid' });
        });
    }

    if (unselectedNeighbors.length >= 2) {
        for (let i = 0; i < unselectedNeighbors.length; i++) {
            for (let j = i + 1; j < unselectedNeighbors.length; j++) {
                const n1 = unselectedNeighbors[i];
                const n2 = unselectedNeighbors[j];
                const distN1N2 = U.distance(n1, n2);

                if (distN1N2 > C.GEOMETRY_CALCULATION_EPSILON) {
                    const midvertex = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
                    const bisectorDir = U.normalize({ x: -(n2.y - n1.y), y: n2.x - n1.x });
                    const snapAnglesRad = C.NINETY_DEG_ANGLE_SNAP_FRACTIONS.map(f => f * Math.PI / 2);

                    snapAnglesRad.forEach(alpha => {
                        if (alpha > 0 && alpha < Math.PI) {
                            const h = (distN1N2 / 2) / Math.tan(alpha / 2);
                            const p1 = { x: midvertex.x + h * bisectorDir.x, y: midvertex.y + h * bisectorDir.y };
                            const p2 = { x: midvertex.x - h * bisectorDir.x, y: midvertex.y - h * bisectorDir.y };
                            allCandidates.push({ pos: p1, type: 'equidistant_angle' });
                            allCandidates.push({ pos: p2, type: 'equidistant_angle' });
                        }
                    });
                }
            }
        }
    }

    if (allCandidates.length === 0) {
        return { pos: mouseDataPos, snapped: false };
    }

    let bestCandidate = null;
    let minSnapDistSq = Infinity;

    allCandidates.forEach(candidate => {
        const distSq = (candidate.pos.x - mouseDataPos.x) ** 2 + (candidate.pos.y - mouseDataPos.y) ** 2;
        if (distSq < minSnapDistSq) {
            minSnapDistSq = distSq;
            bestCandidate = candidate;
        }
    });

    if (bestCandidate && Math.sqrt(minSnapDistSq) < snapStickinessData) {
        return { pos: bestCandidate.pos, snapped: true, snapType: bestCandidate.type };
    }

    return { pos: mouseDataPos, snapped: false };
}

function getDragSnapPosition(dragOrigin, mouseDataPos) {
    const candidates = [];

    allVertices.forEach(p => {
        if (p.id !== dragOrigin.id && p.type === 'regular') {
            candidates.push({
                priority: 1,
                dist: U.distance(mouseDataPos, p),
                pos: p,
                snapType: 'vertex'
            });
        }
    });

    const gridCandidates = U.getGridSnapCandidates(mouseDataPos, gridDisplayMode, lastGridState.interval1, lastAngularGridState, true);
    if (gridCandidates.length > 0) {
        gridCandidates.forEach(gridVertex => {
            candidates.push({
                priority: 2,
                dist: U.distance(mouseDataPos, gridVertex),
                pos: gridVertex,
                snapType: 'grid'
            });
        });
    }

    const drawingContext = getDrawingContext(dragOrigin.id);
    const baseDistance = drawingContext.currentSegmentReferenceD;
    const distanceFactors = C.SNAP_FACTORS.filter(f => f >= 0 && f <= 10);

    const angleFactors = C.NINETY_DEG_ANGLE_SNAP_FRACTIONS;
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
                dist: U.distance(mouseDataPos, snapPos),
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
        return { vertex: mouseDataPos, snapped: false, snapType: 'none' };
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const bestCandidate = candidates[0];

    return {
        vertex: bestCandidate.pos,
        snapped: true,
        snapType: bestCandidate.snapType,
        distanceFactor: bestCandidate.distanceFactor,
        angleFactor: bestCandidate.angleFactor,
        snapDistance: bestCandidate.snapDistance,
        snapAngle: bestCandidate.snapAngle
    };
}

function getBestSnapPosition(mouseDataPos) {
    const candidates = U.getGridSnapCandidates(mouseDataPos, gridDisplayMode, lastGridState.interval1, lastAngularGridState, true);

    allVertices.forEach(p => {
        if (p.type === 'regular') {
            candidates.push({ x: p.x, y: p.y, isGridVertex: false });
        }
    });

    allEdges.forEach(edge => {
        const p1 = findVertexById(edge.id1);
        const p2 = findVertexById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
            const midvertex = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, isGridVertex: false };
            candidates.push(midvertex);
        }
    });

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

export function getSnappedPosition(startVertex, mouseScreenPos, shiftPressed, isDragContext = false, overrideContext = null) {
    const mouseDataPos = screenToData(mouseScreenPos);
    const drawingContext = overrideContext || getDrawingContext(startVertex.id);

    if (!shiftPressed) {
        const candidates = [];
        const vertexSelectRadiusData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;
        for (const p of allVertices) {
            if (p.id !== startVertex.id && p.type === "regular" && U.distance(mouseDataPos, p) < vertexSelectRadiusData) {
                candidates.push({ priority: 1, dist: U.distance(mouseDataPos, p), pos: { x: p.x, y: p.y }, snapType: 'vertex', targetVertex: p });
            }
        }
        const edgeClickThresholdData = C.EDGE_CLICK_THRESHOLD / viewTransform.scale;
        for (const edge of allEdges) {
            const p1 = findVertexById(edge.id1);
            const p2 = findVertexById(edge.id2);
            if (p1 && p2 && p1.type === "regular" && p2.type === "regular") {
                const closest = U.getClosestPointOnLineSegment(mouseDataPos, p1, p2);
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
            const finalAngleRad = Math.atan2(bestCandidate.pos.y - startVertex.y, bestCandidate.pos.x - startVertex.x) || 0;
            return {
                ...bestCandidate.pos,
                angle: finalAngleRad * (180 / Math.PI),
                distance: U.distance(startVertex, bestCandidate.pos),
                snapped: true,
                snapType: bestCandidate.snapType,
                targetEdge: bestCandidate.targetEdge,
                targetVertex: bestCandidate.targetVertex,
                gridSnapped: false,
                lengthSnapFactor: null,
                angleSnapFactor: null,
                angleTurn: U.normalizeAngleToPi(finalAngleRad - drawingContext.offsetAngleRad),
                gridToGridSquaredSum: null,
                gridInterval: null
            };
        }

        const finalAngleRad = Math.atan2(mouseDataPos.y - startVertex.y, mouseDataPos.x - startVertex.x) || 0;
        return {
            x: mouseDataPos.x, y: mouseDataPos.y,
            angle: finalAngleRad * (180 / Math.PI),
            distance: U.distance(startVertex, mouseDataPos),
            snapped: false, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null,
            angleTurn: U.normalizeAngleToPi(finalAngleRad - drawingContext.offsetAngleRad),
            gridToGridSquaredSum: null, gridInterval: null
        };
    }

    const highPriorityCandidates = [];
    const vertexSelectRadiusData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;
    for (const p of allVertices) {
        if (p.id !== startVertex.id && p.type === "regular" && U.distance(mouseDataPos, p) < vertexSelectRadiusData) {
            highPriorityCandidates.push({ priority: 1, dist: U.distance(mouseDataPos, p), pos: { x: p.x, y: p.y }, snapType: 'vertex', targetVertex: p });
        }
    }
    const edgeClickThresholdData = C.EDGE_CLICK_THRESHOLD / viewTransform.scale;
    for (const edge of allEdges) {
        const p1 = findVertexById(edge.id1);
        const p2 = findVertexById(edge.id2);
        if (p1 && p2 && p1.type === "regular" && p2.type === "regular") {
            const closest = U.getClosestPointOnLineSegment(mouseDataPos, p1, p2);
            if (closest.distance < edgeClickThresholdData && closest.onSegmentStrict) {
                highPriorityCandidates.push({ priority: 2, dist: closest.distance, pos: { x: closest.x, y: closest.y }, snapType: 'edge', targetEdge: edge });
            }
        }
    }

    if (highPriorityCandidates.length > 0) {
        highPriorityCandidates.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.dist - b.dist;
        });
        const bestCandidate = highPriorityCandidates[0];
        const finalAngleRad = Math.atan2(bestCandidate.pos.y - startVertex.y, bestCandidate.pos.x - startVertex.x) || 0;
        return {
            ...bestCandidate.pos,
            angle: finalAngleRad * (180 / Math.PI),
            distance: U.distance(startVertex, bestCandidate.pos),
            snapped: true,
            snapType: bestCandidate.snapType,
            targetEdge: bestCandidate.targetEdge,
            targetVertex: bestCandidate.targetVertex,
            gridSnapped: false,
            lengthSnapFactor: null,
            angleSnapFactor: null,
            angleTurn: U.normalizeAngleToPi(finalAngleRad - drawingContext.offsetAngleRad),
            gridToGridSquaredSum: null,
            gridInterval: null
        };
    }

    const unselectedNeighbors = U.findNeighbors(startVertex.id, allEdges)
        .map(id => findVertexById(id))
        .filter(p => p && p.type === 'regular' && !selectedVertexIds.includes(p.id));

    const isDeformingDrag = isDragContext && unselectedNeighbors.length > 0;

    if (isDeformingDrag) {
        const allSnapVertices = [];

        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (gridDisplayMode !== 'none' && gridInterval) {
            const gridVertices = U.getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true);
            gridVertices.forEach(p => allSnapVertices.push({ pos: p, type: 'grid' }));
        }

        allVertices.forEach(p => {
            if (p.id !== startVertex.id && p.type === 'regular') {
                allSnapVertices.push({ pos: p, type: 'vertex' });
            }
        });

        const getPerpendicularBisector = (p1, p2) => {
            const midVertex = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const perpVector = { x: -(p2.y - p1.y), y: p2.x - p1.x };
            return { p1: midVertex, p2: { x: midVertex.x + perpVector.x * C.BISECTOR_LINE_EXTENSION_FACTOR, y: midVertex.y + perpVector.y * C.BISECTOR_LINE_EXTENSION_FACTOR } };
        };

        for (let i = 0; i < unselectedNeighbors.length; i++) {
            for (let j = i + 1; j < unselectedNeighbors.length; j++) {
                const n1 = unselectedNeighbors[i];
                const n2 = unselectedNeighbors[j];
                const bisector = getPerpendicularBisector(n1, n2);

                if (gridInterval) {
                    const maxDist = U.distance(startVertex, mouseDataPos) + gridInterval * 10;
                    for (let d = gridInterval * 0.5; d < maxDist; d += gridInterval * 0.5) {
                        const intersections = U.getLineCircleIntersection(bisector, { center: n1, radius: d });
                        intersections.forEach(p => allSnapVertices.push({ pos: p, type: 'equidistant_grid_dist' }));
                    }
                }

                const distN1N2 = U.distance(n1, n2);
                if (distN1N2 > C.GEOMETRY_CALCULATION_EPSILON) {
                    const midvertex = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
                    const bisectorDir = U.normalize({ x: -(n2.y - n1.y), y: n2.x - p1.x });

                    const snapAnglesRad = C.NINETY_DEG_ANGLE_SNAP_FRACTIONS.map(f => f * Math.PI / 2);
                    snapAnglesRad.forEach(alpha => {
                        if (alpha > 0 && alpha < Math.PI) {
                            const h = (distN1N2 / 2) / Math.tan(alpha / 2);
                            const p1 = { x: midvertex.x + h * bisectorDir.x, y: midvertex.y + h * bisectorDir.y };
                            const p2 = { x: midvertex.x - h * bisectorDir.x, y: midvertex.y - h * bisectorDir.y };
                            allSnapVertices.push({ pos: p1, type: 'equidistant_angle' });
                            allSnapVertices.push({ pos: p2, type: 'equidistant_angle' });
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
                        const circumcenter = U.getLineLineIntersection(bisector1, bisector2);
                        if (circumcenter) {
                            allSnapVertices.push({ pos: circumcenter, type: 'circumcenter' });
                        }
                    }
                }
            }
        }

        if (allSnapVertices.length === 0) {
            const finalAngleRad = Math.atan2(mouseDataPos.y - startVertex.y, mouseDataPos.x - startVertex.x) || 0;
            return {
                x: mouseDataPos.x, y: mouseDataPos.y,
                angle: finalAngleRad * (180 / Math.PI), distance: U.distance(startVertex, mouseDataPos),
                snapped: false
            };
        }

        const bestCandidate = allSnapVertices.reduce((best, current) => {
            const currentDist = U.distance(mouseDataPos, current.pos);
            const bestDist = best.pos ? U.distance(mouseDataPos, best.pos) : Infinity;
            return currentDist < bestDist ? current : best;
        }, { pos: null });

        const finalPos = bestCandidate.pos;
        const finalAngle = Math.atan2(finalPos.y - startVertex.y, finalPos.x - startVertex.x) || 0;
        return {
            x: finalPos.x,
            y: finalPos.y,
            angle: finalAngle * (180 / Math.PI),
            distance: U.distance(startVertex, finalPos),
            snapped: true,
            snapType: bestCandidate.type,
            gridSnapped: bestCandidate.type === 'grid',
            lengthSnapFactor: null,
            angleSnapFactor: null,
            angleTurn: U.normalizeAngleToPi(finalAngle - drawingContext.offsetAngleRad),
            gridToGridSquaredSum: null,
            gridInterval: null,
        };

    } else {
        const allShiftCandidates = [];

        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (gridDisplayMode !== 'none' && gridInterval) {
            const gridVertices = U.getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true);
            gridVertices.forEach(p => allShiftCandidates.push({ pos: p, isGridVertexSnap: true, type: 'grid' }));
        }

        const referenceAngleForSnapping = drawingContext.currentSegmentReferenceA_for_display;
        const baseUnitDistance = drawingContext.currentSegmentReferenceD;
        const symmetricalAngleFractions = new Set([0, ...C.NINETY_DEG_ANGLE_SNAP_FRACTIONS.flatMap(f => [f, -f])]);
        const sortedSymmetricalFractions = Array.from(symmetricalAngleFractions).sort((a, b) => a - b);
        const allSnapAngles = sortedSymmetricalFractions.map(f => ({ factor: f, angle: U.normalizeAngleToPi(drawingContext.offsetAngleRad + (f * referenceAngleForSnapping)), turn: U.normalizeAngleToPi(f * referenceAngleForSnapping) }));
        const allSnapDistances = [];
        for (let i = 0; i <= C.DRAW_SNAP_DISTANCE_FACTOR_LIMIT / C.DRAW_SNAP_DISTANCE_FACTOR_STEP; i++) {
            const factor = i * C.DRAW_SNAP_DISTANCE_FACTOR_STEP;
            allSnapDistances.push({ factor: factor, dist: factor * baseUnitDistance });
        }

        if (allSnapAngles.length > 0 && allSnapDistances.length > 0) {
            for (const angleData of allSnapAngles) {
                for (const distData of allSnapDistances) {
                    const pos = { x: startVertex.x + distData.dist * Math.cos(angleData.angle), y: startVertex.y + distData.dist * Math.sin(angleData.angle) };
                    allShiftCandidates.push({
                        pos: pos,
                        isGridVertexSnap: false,
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
                const currentDist = U.distance(mouseDataPos, current.pos);
                const bestDist = best.pos ? U.distance(mouseDataPos, best.pos) : Infinity;
                return currentDist < bestDist ? current : best;
            }, { pos: null });

            const finalAngle = Math.atan2(bestOverallCandidate.pos.y - startVertex.y, bestOverallCandidate.pos.x - startVertex.x) || 0;
            const snappedDistanceOutput = parseFloat(U.distance(startVertex, bestOverallCandidate.pos).toFixed(10));
            let gridToGridSquaredSum = null;
            let finalGridInterval = null;

            if (bestOverallCandidate.isGridVertexSnap && gridDisplayMode !== 'polar') {
                const currentGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                const epsilon = currentGridInterval * C.GEOMETRY_CALCULATION_EPSILON;
                const isVertexOnGrid = (vertex, interval) => Math.abs(vertex.x / interval - Math.round(vertex.x / interval)) < epsilon && Math.abs(vertex.y / interval - Math.round(vertex.y / interval)) < epsilon;
                if (isVertexOnGrid(startVertex, currentGridInterval)) {
                    const deltaX = bestOverallCandidate.pos.x - startVertex.x;
                    const deltaY = bestOverallCandidate.pos.y - startVertex.y;
                    const dx_grid = Math.round(deltaX / currentGridInterval);
                    const dy_grid = Math.round(deltaY / currentGridInterval);
                    gridToGridSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;
                    finalGridInterval = currentGridInterval;
                }
            }

            let finalAngleTurn = bestOverallCandidate.angleTurn != null ? bestOverallCandidate.angleTurn : U.normalizeAngleToPi(finalAngle - drawingContext.offsetAngleRad);

            return {
                x: parseFloat(bestOverallCandidate.pos.x.toFixed(10)),
                y: parseFloat(bestOverallCandidate.pos.y.toFixed(10)),
                angle: finalAngle * (180 / Math.PI),
                distance: snappedDistanceOutput,
                snapped: true,
                gridSnapped: !!bestOverallCandidate.isGridVertexSnap,
                snapType: bestOverallCandidate.isGridVertexSnap ? 'grid' : 'geometric',
                lengthSnapFactor: bestOverallCandidate.lengthSnapFactor || null,
                angleSnapFactor: bestOverallCandidate.angleSnapFactor || null,
                angleTurn: finalAngleTurn,
                gridToGridSquaredSum: gridToGridSquaredSum,
                gridInterval: finalGridInterval,
            };
        }

        const finalAngleRad = Math.atan2(mouseDataPos.y - startVertex.y, mouseDataPos.x - startVertex.x) || 0;
        return {
            x: mouseDataPos.x, y: mouseDataPos.y,
            angle: finalAngleRad * (180 / Math.PI),
            distance: U.distance(startVertex, mouseDataPos),
            snapped: false, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null,
            angleTurn: U.normalizeAngleToPi(finalAngleRad - drawingContext.offsetAngleRad),
            gridToGridSquaredSum: null, gridInterval: null
        };
    }
}

function invertColors() {
    allColors = allColors.map(colorItem => {
        if (colorItem.type === 'color') {
            return { ...colorItem, value: U.invertGrayscaleValue(colorItem.value) };
        }
        return colorItem;
    });
}

function initializeCanvasUI() {
    canvasUI.toolbarButton = {
        id: "toolbar-button",
        x: C.UI_BUTTON_PADDING,
        y: C.UI_BUTTON_PADDING,
        width: C.MENU_BUTTON_WIDTH,
        height: C.MENU_BUTTON_HEIGHT,
        type: "menuButton"
    };
}

function buildTransformPanelUI() {
    canvasUI.transformIcons = [];
    const panelX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const iconY = canvasUI.transformToolButton.y;
    const iconSize = C.TRANSFORM_ICON_SIZE;
    const iconPadding = C.TRANSFORM_ICON_PADDING;
    const transformTypes = [
        C.TRANSFORMATION_TYPE_ROTATION,
        C.TRANSFORMATION_TYPE_SCALE,
        C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE
    ];

    transformTypes.forEach((type, index) => {
        canvasUI.transformIcons.push({
            id: `transform-icon-${type}`,
            type: type,
            x: panelX + index * (iconSize + iconPadding),
            y: iconY + C.TRANSFORM_ICON_Y_OFFSET,
            width: iconSize,
            height: iconSize
        });
    });
}

function buildDisplayPanelUI() {
    canvasUI.displayIcons = [];
    if (!canvasUI.displayToolButton) return;

    const panelX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const iconY = canvasUI.displayToolButton.y;
    const iconSize = C.DISPLAY_ICON_SIZE;
    const iconPadding = C.DISPLAY_ICON_PADDING;

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
   canvasUI.colorTargetIcons = [];
   const paletteY = canvasUI.colorToolButton.y;

   let currentX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;

   canvasUI.applyColorsButton = {
       id: "apply-colors-button",
       type: "button",
       x: currentX,
       y: paletteY + C.COLOR_PALETTE_Y_OFFSET,
       width: C.UI_SWATCH_SIZE,
       height: C.UI_SWATCH_SIZE,
   };
   currentX += C.UI_SWATCH_SIZE + C.UI_BUTTON_PADDING;

   canvasUI.randomColorButton = {
       id: "random-color-button",
       type: "button",
       x: currentX,
       y: paletteY + C.COLOR_PALETTE_Y_OFFSET,
       width: C.UI_SWATCH_SIZE,
       height: C.UI_SWATCH_SIZE,
   };
   currentX += C.UI_SWATCH_SIZE + C.UI_BUTTON_PADDING;

   canvasUI.removeColorButton = {
       id: "remove-color-button",
       type: "button",
       x: currentX,
       y: paletteY + C.COLOR_PALETTE_Y_OFFSET,
       width: C.UI_SWATCH_SIZE,
       height: C.UI_SWATCH_SIZE,
   };
   currentX += C.UI_SWATCH_SIZE + C.UI_BUTTON_PADDING;

   allColors.forEach((item, index) => {
       const swatchWidth = (item.type === 'colormap')
           ? (C.UI_SWATCH_SIZE * 3) + (C.UI_BUTTON_PADDING * 2)
           : C.UI_SWATCH_SIZE;

       canvasUI.colorSwatches.push({
           id: `swatch-${index}`,
           type: "colorSwatch",
           x: currentX,
           y: paletteY + C.COLOR_PALETTE_Y_OFFSET,
           width: swatchWidth,
           height: C.UI_SWATCH_SIZE,
           index: index,
           item: item
       });
       currentX += swatchWidth + C.UI_BUTTON_PADDING;
   });

   const addButtonX = currentX;
   canvasUI.addColorButton = {
       id: "add-color-button",
       type: "button",
       x: addButtonX,
       y: paletteY + C.COLOR_PALETTE_Y_OFFSET,
       width: C.UI_SWATCH_SIZE,
       height: C.UI_SWATCH_SIZE,
   };

   Object.entries(colorAssignments).forEach(([target, colorIndex]) => {
       const iconSize = C.UI_SWATCH_SIZE * 0.75;
       let swatch;
       if (colorIndex === -1) {
           swatch = canvasUI.randomColorButton;
       } else {
           swatch = canvasUI.colorSwatches.find(s => s.index === colorIndex);
       }

       if (swatch) {
           canvasUI.colorTargetIcons.push({
               id: `target-icon-${target}`,
               target: target,
               x: swatch.x + (swatch.width - iconSize) / 2,
               y: swatch.y - iconSize - 5,
               width: iconSize,
               height: iconSize
           });
       }
   });
}

function buildVisibilityPanelUI() {
    canvasUI.visibilityIcons = [];
    if (!canvasUI.visibilityToolButton) return;

    const panelX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const iconY = canvasUI.visibilityToolButton.y;
    const iconSize = C.DISPLAY_ICON_SIZE;
    const iconPadding = C.DISPLAY_ICON_PADDING;

    const iconGroups = ['angles', 'distances'];

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
        width: C.UI_TOOLBAR_WIDTH,
        height: canvasHeight,
        type: "toolbar"
    };

    canvasUI.colorToolButton = {
        id: "color-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: canvasUI.toolbarButton.y + canvasUI.toolbarButton.height + C.TOOLBAR_SECTION_GAP,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };

    canvasUI.transformToolButton = {
        id: "transform-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: canvasUI.colorToolButton.y + canvasUI.colorToolButton.height + C.UI_BUTTON_PADDING,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };

    canvasUI.displayToolButton = {
        id: "display-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: canvasUI.transformToolButton.y + canvasUI.transformToolButton.height + C.UI_BUTTON_PADDING,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };

    canvasUI.visibilityToolButton = {
        id: "visibility-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: canvasUI.displayToolButton.y + canvasUI.displayToolButton.height + C.UI_BUTTON_PADDING,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };

    canvasUI.themeToggleButton = {
        id: "theme-toggle-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: canvasUI.visibilityToolButton.y + canvasUI.visibilityToolButton.height + C.UI_BUTTON_PADDING,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };
}

function handleDisplayPanelClick(screenPos) {
    if (isDisplayPanelExpanded) {
        for (const icon of canvasUI.displayIcons) {
            if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
                screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
                switch (icon.group) {
                    case 'coords':
                        const coordsModes = [C.COORDS_DISPLAY_MODE_NONE, C.COORDS_DISPLAY_MODE_REGULAR, C.COORDS_DISPLAY_MODE_COMPLEX, C.COORDS_DISPLAY_MODE_POLAR];
                        coordsDisplayMode = coordsModes[(coordsModes.indexOf(coordsDisplayMode) + 1) % coordsModes.length];
                        break;
                    case 'grid':
                        const gridModes = [C.GRID_DISPLAY_MODE_LINES, C.GRID_DISPLAY_MODE_POINTS, C.GRID_DISPLAY_MODE_TRIANGULAR, C.GRID_DISPLAY_MODE_POLAR, C.GRID_DISPLAY_MODE_NONE];
                        gridDisplayMode = gridModes[(gridModes.indexOf(gridDisplayMode) + 1) % gridModes.length];
                        break;
                }
                return true;
            }
        }
    }
    return false;
}

function handleVisibilityPanelClick(screenPos) {
    if (isVisibilityPanelExpanded) {
        for (const icon of canvasUI.visibilityIcons) {
            if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
                screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
                switch (icon.group) {
                    case 'angles':
                        const angleModes = [C.ANGLE_DISPLAY_MODE_DEGREES, C.ANGLE_DISPLAY_MODE_RADIANS, C.ANGLE_DISPLAY_MODE_NONE];
                        angleDisplayMode = angleModes[(angleModes.indexOf(angleDisplayMode) + 1) % angleModes.length];
                        showAngles = angleDisplayMode !== C.ANGLE_DISPLAY_MODE_NONE;
                        break;
                    case 'distances':
                        const distModes = [C.DISTANCE_DISPLAY_MODE_ON, C.DISTANCE_DISPLAY_MODE_NONE];
                        distanceDisplayMode = distModes[(distModes.indexOf(distanceDisplayMode) + 1) % distModes.length];
                        showDistances = distanceDisplayMode === C.DISTANCE_DISPLAY_MODE_ON;
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
        if (handleDisplayPanelClick(screenPos, shiftKey, ctrlKey)) {
            return true;
        }
    }

    if (isVisibilityPanelExpanded) {
        if (handleVisibilityPanelClick(screenPos, shiftKey, ctrlKey)) {
            return true;
        }
    }

    return false;
}

function handleThemeToggle() {
    saveStateForUndo();

    activeThemeName = activeThemeName === 'dark' ? 'light' : 'dark';

    invertVertexColors();
    invertColors();

    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
    }
}

function addToColors(colorObject) {
    if (!colorObject || !colorObject.type) {
        console.error("Invalid color object passed to addToColors:", colorObject);
        return;
    }

    const isDuplicate = allColors.some(item => {
        if (!item || item.type !== colorObject.type) return false;
        if (item.type === 'colormap') {
            return JSON.stringify(item.vertices) === JSON.stringify(colorObject.vertices);
        }
        return item.value === colorObject.value;
    });

    if (isDuplicate) return;

    allColors.push(colorObject);

    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
    }
}

function getPrecedingSegment(vertexId, edgesToIgnoreIds = []) {
    const currentVertex = findVertexById(vertexId);
    if (!currentVertex) return null;
    for (let i = allEdges.length - 1; i >= 0; i--) {
        const edge = allEdges[i];
        const edgeIdentifier =  U.getEdgeId(edge);
        if (edgesToIgnoreIds.includes(edgeIdentifier)) continue;
        let otherVertexId = null;
        if (edge.id1 === vertexId) otherVertexId = edge.id2;
        else if (edge.id2 === vertexId) otherVertexId = edge.id1;
        if (otherVertexId) {
            const otherVertex = findVertexById(otherVertexId);
            if (otherVertex) {
                const dx = currentVertex.x - otherVertex.x; const dy = currentVertex.y - otherVertex.y;
                return { p1: otherVertex, p2: currentVertex, angleRad: Math.atan2(dy, dx), length: Math.sqrt(dx * dx + dy * dy), edgeId: edgeIdentifier };
            }
        }
    }
    return null;
}

function saveStateForUndo() {
    const state = {
        vertices: JSON.parse(JSON.stringify(allVertices)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        faces: JSON.parse(JSON.stringify(allFaces)),
        selectedVertexIds: JSON.parse(JSON.stringify(selectedVertexIds)),
        selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
        selectedFaceIds: JSON.parse(JSON.stringify(selectedFaceIds)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartVertexId: previewLineStartVertexId,
        frozenReference_A_rad, frozenReference_A_baseRad, frozenReference_D_du, frozenReference_Origin_Data,
        frozenReference_D_g2g
    };
    undoStack.push(state);
    if (undoStack.length > C.MAX_HISTORY_SIZE) undoStack.shift();
    redoStack = [];
}

function restoreState(state) {
    allVertices = JSON.parse(JSON.stringify(state.vertices));
    allEdges = JSON.parse(JSON.stringify(state.edges));
    allFaces = JSON.parse(JSON.stringify(state.faces || []));
    selectedVertexIds = JSON.parse(JSON.stringify(state.selectedVertexIds || []));
    selectedEdgeIds = JSON.parse(JSON.stringify(state.selectedEdgeIds || []));
    selectedFaceIds = JSON.parse(JSON.stringify(state.selectedFaceIds || []));
    activeCenterId = state.activeCenterId !== undefined ? state.activeCenterId : null;
    isDrawingMode = state.isDrawingMode !== undefined ? state.isDrawingMode : false;
    previewLineStartVertexId = state.previewLineStartVertexId !== undefined ? state.previewLineStartVertexId : null;
    frozenReference_A_rad = state.frozenReference_A_rad !== undefined ? state.frozenReference_A_rad : null;
    frozenReference_A_baseRad = state.frozenReference_A_baseRad !== undefined ? state.frozenReference_A_baseRad : null;
    frozenReference_D_du = state.frozenReference_D_du !== undefined ? state.frozenReference_D_du : null;
    frozenReference_Origin_Data = state.frozenReference_Origin_Data !== undefined ? state.frozenReference_Origin_Data : null;
    frozenReference_D_g2g = state.frozenReference_D_g2g !== undefined ? state.frozenReference_D_g2g : null;
    isActionInProgress = false; isDragConfirmed = false; isRectangleSelecting = false;
    isPanningBackground = false; dragPreviewVertices = [];
    actionTargetVertex = null; currentMouseButton = -1;
    clickData = { vertexId: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair';
    ensureFaceCoordinateSystems();
}

function handleUndo() {
    if (undoStack.length === 0) return;
    const currentStateForRedo = {
        vertices: JSON.parse(JSON.stringify(allVertices)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        faces: JSON.parse(JSON.stringify(allFaces)),
        selectedVertexIds: JSON.parse(JSON.stringify(selectedVertexIds)),
        selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
        selectedFaceIds: JSON.parse(JSON.stringify(selectedFaceIds)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartVertexId: previewLineStartVertexId,
        frozenReference_A_rad, frozenReference_A_baseRad, frozenReference_D_du, frozenReference_Origin_Data
    };
    redoStack.push(currentStateForRedo);
    if (redoStack.length > C.MAX_HISTORY_SIZE) redoStack.shift();
    const prevState = undoStack.pop();
    restoreState(prevState);
}

function handleRedo() {
    if (redoStack.length === 0) return;
    const currentStateForUndo = {
        vertices: JSON.parse(JSON.stringify(allVertices)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        faces: JSON.parse(JSON.stringify(allFaces)),
        selectedVertexIds: JSON.parse(JSON.stringify(selectedVertexIds)),
        selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
        selectedFaceIds: JSON.parse(JSON.stringify(selectedFaceIds)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartVertexId: previewLineStartVertexId,
        frozenReference_A_rad, frozenReference_A_baseRad, frozenReference_D_du, frozenReference_Origin_Data
    };
    undoStack.push(currentStateForUndo);
    if (undoStack.length > C.MAX_HISTORY_SIZE) undoStack.shift();
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

function findVertexById(id) { return allVertices.find(p => p.id === id); }

function findClickedVertex(clickPos) {
    const dataPos = screenToData(clickPos);
    const selectRadiusDataRegular = (C.VERTEX_RADIUS * 2) / viewTransform.scale;
    const selectRadiusDataCenter = (C.CENTER_POINT_VISUAL_RADIUS + C.VERTEX_RADIUS) / viewTransform.scale;

    for (let i = allVertices.length - 1; i >= 0; i--) {
        const vertex = allVertices[i];
        if (vertex.type !== 'regular') {
            if (U.distance(dataPos, vertex) < selectRadiusDataCenter) return vertex;
        }
    }

    for (let i = allVertices.length - 1; i >= 0; i--) {
        const vertex = allVertices[i];
        if (vertex.type === 'regular' && U.distance(dataPos, vertex) < selectRadiusDataRegular) return vertex;
    }
    return null;
}

function findClickedEdge(clickPos) {
    const dataPos = screenToData(clickPos);
    const edgeClickThresholdData = C.EDGE_CLICK_THRESHOLD / viewTransform.scale;

    for (let i = allEdges.length - 1; i >= 0; i--) {
        const edge = allEdges[i];
        const p1 = findVertexById(edge.id1);
        const p2 = findVertexById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
            const closest = U.getClosestPointOnLineSegment(dataPos, p1, p2);
            if (closest.distance < edgeClickThresholdData && closest.onSegmentStrict) {
                return edge;
            }
        }
    }
    return null;
}

function findClickedFace(clickPos) {
    const dataPos = screenToData(clickPos);

    for (let i = allFaces.length - 1; i >= 0; i--) {
        const face = allFaces[i];
        const vertices = face.vertexIds.map(id => findVertexById(id)).filter(p => p && p.type === 'regular');
        if (vertices.length < 3) continue;

        if (U.isVertexInPolygon(dataPos, vertices)) {
            return face;
        }
    }

    return null;
}

function findNeighborEdges(vertexId) {
    return allEdges.filter(e => e.id1 === vertexId || e.id2 === vertexId);
}

function findAllVerticesInSubgraph(startVertexId) {
    if (!findVertexById(startVertexId)) return [];
    const visited = new Set(); const queue = [startVertexId]; const subgraphVertexIds = [];
    visited.add(startVertexId);
    while (queue.length > 0) {
        const currentVertexId = queue.shift(); subgraphVertexIds.push(currentVertexId);
        U.findNeighbors(currentVertexId, allEdges).forEach(neighborId => {
            if (!visited.has(neighborId)) { visited.add(neighborId); queue.push(neighborId); }
        });
    }
    return subgraphVertexIds;
}



function handleCut() {
    if (selectedVertexIds.length === 0 && selectedEdgeIds.length === 0 && selectedCenterIds.length === 0) return;

    saveStateForUndo();
    handleCopy();
    deleteSelectedItems();
}

function handleCopy() {
    const verticesToCopyIds = new Set(selectedVertexIds);
    if (activeCenterId) verticesToCopyIds.add(activeCenterId);

    const facesToCopy = [];
    if (selectedFaceIds.length > 0) {
        selectedFaceIds.forEach(faceId => {
            // FIX: Find face by its canonical ID, not an object property
            const face = allFaces.find(f => U.getFaceId(f) === faceId);
            if (face) {
                facesToCopy.push(face);
                face.vertexIds.forEach(id => verticesToCopyIds.add(id));
            }
        });
    }

    selectedEdgeIds.forEach(edgeId => {
        const [id1, id2] = edgeId.split(C.EDGE_ID_DELIMITER);
        verticesToCopyIds.add(id1);
        verticesToCopyIds.add(id2);
    });

    clipboard.vertices = Array.from(verticesToCopyIds).map(id => {
        const p = findVertexById(id);
        return p ? { ...p } : null;
    }).filter(p => p);

    clipboard.edges = [];
    allEdges.forEach(edge => {
        if (verticesToCopyIds.has(edge.id1) && verticesToCopyIds.has(edge.id2)) {
            clipboard.edges.push({ ...edge });
        }
    });

    clipboard.faces = facesToCopy.map(f => ({ vertexIds: f.vertexIds }));
    clipboard.referenceVertex = screenToData(mousePos);
}

function handlePaste() {
    if (clipboard.vertices.length === 0 || !clipboard.referenceVertex) return;
    saveStateForUndo();
    const edgesBefore = JSON.parse(JSON.stringify(allEdges));

    const pastePosData = screenToData(mousePos);
    const deltaX = pastePosData.x - clipboard.referenceVertex.x;
    const deltaY = pastePosData.y - clipboard.referenceVertex.y;
    const oldToNewIdMap = new Map();
    const newPastedRegularVertexIds = [];
    let newPastedActiveCenterId = null;

    performEscapeAction();

    clipboard.vertices.forEach(cbVertex => {
        const newId = U.generateUniqueId();
        const newVertex = { ...cbVertex, id: newId, x: cbVertex.x + deltaX, y: cbVertex.y + deltaY };
        allVertices.push(newVertex);
        oldToNewIdMap.set(cbVertex.id, newId);
        if (newVertex.type === 'regular') {
            newPastedRegularVertexIds.push(newId);
        } else {
            newPastedActiveCenterId = newId;
        }
    });

    clipboard.edges.forEach(cbEdge => {
        const newP1Id = oldToNewIdMap.get(cbEdge.id1);
        const newP2Id = oldToNewIdMap.get(cbEdge.id2);
        if (newP1Id && newP2Id) allEdges.push({ id1: newP1Id, id2: newP2Id });
    });

    // FIX: Instead of manually creating faces, let the robust detection do it.
    updateFaces(edgesBefore, allEdges);

    // Select the newly pasted geometry
    selectedVertexIds = newPastedRegularVertexIds;
    selectedEdgeIds = clipboard.edges.map(e => U.getEdgeId({ id1: oldToNewIdMap.get(e.id1), id2: oldToNewIdMap.get(e.id2) }));
    selectedFaceIds = allFaces.filter(f => f.vertexIds.every(vid => oldToNewIdMap.has(vid))).map(f => U.getFaceId(f));
    activeCenterId = newPastedActiveCenterId;
}

function deleteSelectedItems() {
    const vertexIdsToDelete = new Set(selectedVertexIds);
    const centerIdsToDelete = new Set(selectedCenterIds);
    const edgeIdsToDelete = new Set(selectedEdgeIds);
    const faceIdsToExplicitlyDelete = new Set(selectedFaceIds);

    if (vertexIdsToDelete.size === 0 && centerIdsToDelete.size === 0 && edgeIdsToDelete.size === 0 && faceIdsToExplicitlyDelete.size === 0) {
        return;
    }
    saveStateForUndo();

    // When explicitly deleting faces, we just remove them from the active list.
    // We don't need to add them to a blacklist.
    if (faceIdsToExplicitlyDelete.size > 0) {
        allFaces = allFaces.filter(face => !faceIdsToExplicitlyDelete.has(U.getFaceId(face)));
    }

    const edgesBefore = [...allEdges];

    // Perform geometry deletions
    if (edgeIdsToDelete.size > 0) {
        allEdges = allEdges.filter(edge => !edgeIdsToDelete.has(U.getEdgeId(edge)));
    }
    if (vertexIdsToDelete.size > 0) {
        allVertices = allVertices.filter(p => !vertexIdsToDelete.has(p.id));
        allEdges = allEdges.filter(e => !vertexIdsToDelete.has(e.id1) && !vertexIdsToDelete.has(e.id2));
    }

    // Update faces based on the change in edges
    updateFaces(edgesBefore, allEdges);

    if (centerIdsToDelete.size > 0) {
        allVertices = allVertices.filter(p => !centerIdsToDelete.has(p.id));
    }

    performEscapeAction();
}

function zoomAt(zoomCenterScreen_css_pixels, scaleFactor) {
    let newScale = viewTransform.scale * scaleFactor;

    if (newScale < C.MIN_SCALE_VALUE) {
        newScale = C.MIN_SCALE_VALUE;
    }

    const mouseX_physical = zoomCenterScreen_css_pixels.x * dpr;
    const mouseY_physical = zoomCenterScreen_css_pixels.y * dpr;

    viewTransform.offsetX = mouseX_physical * (1 - scaleFactor) + viewTransform.offsetX * scaleFactor;

    viewTransform.offsetY = (canvas.height - mouseY_physical) * (1 - scaleFactor) + viewTransform.offsetY * scaleFactor;

    viewTransform.scale = newScale;
}

function getDrawingContext(currentDrawStartVertexId) {
    let offsetAngleRad = 0;
    let currentSegmentReferenceD;
    let currentSegmentReferenceA_for_display = Math.PI / 2;
    let isFirstSegmentBeingDrawn = true;

    const p_current = findVertexById(currentDrawStartVertexId);
    if (!p_current) {
        isFirstSegmentBeingDrawn = true;
        if (gridDisplayMode !== 'none' && lastGridState.interval1) {
            currentSegmentReferenceD = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        } else {
            currentSegmentReferenceD = C.DEFAULT_REFERENCE_DISTANCE;
        }
        if (frozenReference_D_du !== null) {
            currentSegmentReferenceD = frozenReference_D_du;
        }

        return {
            offsetAngleRad,
            currentSegmentReferenceD,
            currentSegmentReferenceA_for_display,
            isFirstSegmentBeingDrawn,
            displayAngleA_valueRad_for_A_equals_label: null,
            displayAngleA_originVertexData_for_A_equals_label: null,
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
            if (Math.abs(frozenReference_A_rad) < C.GEOMETRY_CALCULATION_EPSILON) {
                currentSegmentReferenceA_for_display = C.DEFAULT_REFERENCE_ANGLE_RAD;
            } else {
                currentSegmentReferenceA_for_display = Math.abs(frozenReference_A_rad);
            }
        } else {
            currentSegmentReferenceA_for_display = C.DEFAULT_REFERENCE_ANGLE_RAD;
        }
    } else {
        isFirstSegmentBeingDrawn = true;
        if (gridDisplayMode !== 'none' && lastGridState.interval1) {
            currentSegmentReferenceD = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        } else {
            currentSegmentReferenceD = C.DEFAULT_REFERENCE_DISTANCE;
        }
        if (frozenReference_D_du !== null) {
            currentSegmentReferenceD = frozenReference_D_du;
        }
        offsetAngleRad = 0;
        currentSegmentReferenceA_for_display = C.DEFAULT_REFERENCE_ANGLE_RAD;
    }

    return {
        offsetAngleRad,
        currentSegmentReferenceD,
        currentSegmentReferenceA_for_display,
        isFirstSegmentBeingDrawn,
        displayAngleA_valueRad_for_A_equals_label: frozenReference_A_rad,
        displayAngleA_originVertexData_for_A_equals_label: frozenReference_Origin_Data,
        frozen_A_baseRad_to_display: frozenReference_A_baseRad,
        frozen_D_du_to_display: frozenReference_D_du,
        frozen_D_g2g_to_display: frozenReference_D_g2g
    };
}

function getCompletedSegmentProperties(startVertex, endVertex, existingEdges) {
    if (!startVertex || !endVertex) return null;

    const angle = Math.atan2(endVertex.y - startVertex.y, endVertex.x - startVertex.x);
    const length = U.distance(startVertex, endVertex);

    let precedingSegmentAngle = 0;
    let isFirstSegmentOfLine = true;

    for (let i = existingEdges.length - 1; i >= 0; i--) {
        const edge = existingEdges[i];
        let otherVertexId = null;
        if (edge.id1 === startVertex.id && findVertexById(edge.id2)?.type === 'regular') otherVertexId = edge.id2;
        else if (edge.id2 === startVertex.id && findVertexById(edge.id1)?.type === 'regular') otherVertexId = edge.id1;

        if (otherVertexId && otherVertexId !== endVertex.id) {
            const prevVertex = findVertexById(otherVertexId);
            if (prevVertex) {
                precedingSegmentAngle = Math.atan2(startVertex.y - prevVertex.y, startVertex.x - prevVertex.x);
                isFirstSegmentOfLine = false;
                break;
            }
        }
    }

    const angleTurn = U.normalizeAngleToPi(angle - precedingSegmentAngle);

    return {
        startVertex,
        endVertex,
        absoluteAngleRad: angle,
        length: length,
        precedingSegmentAbsoluteAngleRad: precedingSegmentAngle,
        turnAngleRad: angleTurn,
        isFirstSegmentOfLine: isFirstSegmentOfLine
    };
}

function completeGraphOnSelectedVertices() {
    if (selectedVertexIds.length < 2) return;

    const regularVertexIds = selectedVertexIds.filter(id => {
        const vertex = findVertexById(id);
        return vertex && vertex.type === 'regular';
    });

    if (regularVertexIds.length < 2) return;

    saveStateForUndo();

    const edgesToAdd = [];
    for (let i = 0; i < regularVertexIds.length; i++) {
        for (let j = i + 1; j < regularVertexIds.length; j++) {
            const id1 = regularVertexIds[i];
            const id2 = regularVertexIds[j];

            const edgeExists = allEdges.some(edge =>
                (edge.id1 === id1 && edge.id2 === id2) ||
                (edge.id1 === id2 && edge.id2 === id1)
            );

            if (!edgeExists) {
                edgesToAdd.push({ id1, id2 });
            }
        }
    }

    if (edgesToAdd.length === 0) return;

    edgesToAdd.forEach(edge => allEdges.push(edge));

    if (facesVisible) {
        const newPolygons = U.detectClosedPolygons(allEdges, findVertexById);
        const existingFaceIds = new Set(allFaces.map(f => f.id));
        newPolygons.forEach(poly => {
            if (!existingFaceIds.has(poly.id)) {
                allFaces.push(poly);
            }
        });
        ensureFaceCoordinateSystems();
    }
}

function applySelectionLogic(vertexIdsToSelect = [], edgeIdsToSelect = [], faceIdsToSelect = [], wantsShift, wantsCtrl, targetIsCenter = false) {
    if (targetIsCenter) {
        handleCenterSelection(vertexIdsToSelect[0], wantsShift, wantsCtrl);
    } else {
        if (wantsShift) {
            selectedVertexIds = [...new Set([...selectedVertexIds, ...vertexIdsToSelect])];
            selectedEdgeIds = [...new Set([...selectedEdgeIds, ...edgeIdsToSelect])];
            selectedFaceIds = [...new Set([...selectedFaceIds, ...faceIdsToSelect])];
        } else if (wantsCtrl) {
            vertexIdsToSelect.forEach(id => {
                const index = selectedVertexIds.indexOf(id);
                if (index > -1) selectedVertexIds.splice(index, 1);
                else selectedVertexIds.push(id);
            });
            edgeIdsToSelect.forEach(id => {
                const index = selectedEdgeIds.indexOf(id);
                if (index > -1) selectedEdgeIds.splice(index, 1);
                else selectedEdgeIds.push(id);
            });
            faceIdsToSelect.forEach(id => {
                const index = selectedFaceIds.indexOf(id);
                if (index > -1) selectedFaceIds.splice(index, 1);
                else selectedFaceIds.push(id);
            });
        } else {
            selectedVertexIds = [...vertexIdsToSelect];
            selectedEdgeIds = [...edgeIdsToSelect];
            selectedFaceIds = [...faceIdsToSelect];
        }
    }
}



function handleColorToolButtonClick() {
    isColorPaletteExpanded = !isColorPaletteExpanded;
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
    }
}

function initializeApp() {
    allColors = C.DEFAULT_RECENT_COLORS.map(color => {
        if (typeof color === 'string') {
            return { type: 'color', value: color };
        }
        return color;
    });

    if (typeof window.katex === 'undefined') {
        console.error("KaTeX library failed to load or initialize. Math rendering will be broken.");
    }
    initializeCanvasUI();
    buildMainToolbarUI();
    resizeCanvas();

    colorEditor = new ColormapSelector();
    colorEditor.initialize();
    document.body.appendChild(colorEditor.getElement());

    colorEditor.getElement().addEventListener('select', (e) => {
        const colormapData = e.detail;
        const newItem = U.convertColorToColormapFormat(colormapData);

        if (!newItem) return;

        if (isEditingColor && editingColorIndex !== null) {
            allColors[editingColorIndex] = newItem;
            colorAssignments[activeColorTarget] = editingColorIndex;
        } else {
            addToColors(newItem);
            colorAssignments[activeColorTarget] = allColors.length - 1;
        }

        applyColorsToSelection();

        isEditingColor = false;
        editingColorIndex = null;
        buildColorPaletteUI();
    });

    viewTransform.scale = 70;
    viewTransform.offsetX = canvas.width / 2;
    viewTransform.offsetY = canvas.height / 2;
    coordsDisplayMode = 'regular';

    saveStateForUndo();
    gameLoop();
}

function calculateTransformFromMouse(center, mouseData, startReferenceVertex, centerType, currentAccumulatedRotation = 0) {
    const startVector = { x: startReferenceVertex.x - center.x, y: startReferenceVertex.y - center.y };
    const currentVector = { x: mouseData.x - center.x, y: mouseData.y - center.y };
    const startDist = Math.hypot(startVector.x, startVector.y);
    const currentDist = Math.hypot(currentVector.x, currentVector.y);
    const startAngle = Math.atan2(startVector.y, startVector.x);
    const currentAngle = Math.atan2(currentVector.y, currentVector.x);

    let rotation = 0;
    let scale = 1;
    let directionalScale = false;

    if (centerType === C.TRANSFORMATION_TYPE_ROTATION) {
        scale = 1.0;
        rotation = U.calculateRotationAngle(startAngle, currentAngle, currentAccumulatedRotation);
    } else if (centerType === C.TRANSFORMATION_TYPE_SCALE) {
        rotation = 0.0;
        if (startDist > C.GEOMETRY_CALCULATION_EPSILON) {
            scale = currentDist / startDist;
        }
    } else if (centerType === C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
        directionalScale = true;
        rotation = 0;
        if (startDist > C.GEOMETRY_CALCULATION_EPSILON) {
            const startNormalized = { x: startVector.x / startDist, y: startVector.y / startDist };
            const projectedDistance = (currentVector.x * startNormalized.x + currentVector.y * startNormalized.y);
            scale = projectedDistance / startDist;
        }
    }

    return { rotation, scale, directionalScale };
}

function findFacesContainingEdge(edgeId1, edgeId2) {
    const facesWithEdge = [];

    allFaces.forEach(face => {
        const vertices = face.vertexIds;
        for (let i = 0; i < vertices.length; i++) {
            const currentVertex = vertices[i];
            const nextVertex = vertices[(i + 1) % vertices.length];

            if ((currentVertex === edgeId1 && nextVertex === edgeId2) ||
                (currentVertex === edgeId2 && nextVertex === edgeId1)) {
                facesWithEdge.push({
                    face: face,
                    edgeIndex: i,
                    isReversed: currentVertex === edgeId2
                });
                break;
            }
        }
    });

    return facesWithEdge;
}

function updateFaceWithNewVertex(face, edgeIndex, newVertexId, isReversed) {
    const newVertexIds = [...face.vertexIds];

    if (isReversed) {
        newVertexIds.splice(edgeIndex + 1, 0, newVertexId);
    } else {
        newVertexIds.splice(edgeIndex + 1, 0, newVertexId);
    }

    const updatedFace = {
        id: U.getFaceId({ vertexIds: newVertexIds }),
        vertexIds: newVertexIds,
        localCoordSystem: null
    };

    return updatedFace;
}

function insertVertexOnEdgeWithFaces(targetEdge, insertionVertex) {
    const p1 = findVertexById(targetEdge.id1);
    const p2 = findVertexById(targetEdge.id2);

    if (!p1 || !p2) return null;

    const facesContainingEdge = findFacesContainingEdge(targetEdge.id1, targetEdge.id2);

    const newVertex = {
        id: U.generateUniqueId(),
        x: insertionVertex.x,
        y: insertionVertex.y,
        type: 'regular',
        color: getColorForTarget(C.COLOR_TARGET_VERTEX)
    };

    allVertices.push(newVertex);

    // FIX: This now correctly uses U.getEdgeId to remove only the target edge
    allEdges = allEdges.filter(e => U.getEdgeId(e) !== U.getEdgeId(targetEdge));

    allEdges.push({ id1: targetEdge.id1, id2: newVertex.id });
    allEdges.push({ id1: newVertex.id, id2: targetEdge.id2 });

    if (facesVisible && facesContainingEdge.length > 0) {
        const facesToRemove = new Set();
        const facesToAdd = [];

        facesContainingEdge.forEach(({ face, edgeIndex, isReversed }) => {
            facesToRemove.add(U.getFaceId(face));

            const updatedFace = updateFaceWithNewVertex(face, edgeIndex, newVertex.id, isReversed);
            facesToAdd.push(updatedFace);
        });

        allFaces = allFaces.filter(face => !facesToRemove.has(U.getFaceId(face)));
        allFaces.push(...facesToAdd);
        ensureFaceCoordinateSystems();
    }

    return newVertex;
}

function getBestTranslationSnap(initialDragVertexStates, rawDelta, copyCount) {
    const snapStickinessData = (2 * C.VERTEX_RADIUS) / viewTransform.scale;
    if (initialDragVertexStates.length === 0) {
        return { delta: rawDelta, snapped: false };
    }

    const handleVertex = initialDragVertexStates[0];
    const mouseDragPos = { x: handleVertex.x + rawDelta.x, y: handleVertex.y + rawDelta.y };
    const allPossibleSnaps = [];

    const verticesToDrag = initialDragVertexStates.filter(p => p.type === 'regular');
    const staticVertices = allVertices.filter(p => p.type === 'regular' && !initialDragVertexStates.some(ip => ip.id === p.id));

    const multipliers = copyCount === 1 ? [1] : Array.from({ length: copyCount }, (_, k) => k);

    if (verticesToDrag.length > 0) {
        multipliers.forEach(k => {
            if (k === 0) return;

            verticesToDrag.forEach(p_orig => {
                staticVertices.forEach(p_target => {
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

                    verticesToDrag.forEach(p1_orig => {
                        verticesToDrag.forEach(p2_orig => {
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
            x: handleVertex.x + snap.delta.x,
            y: handleVertex.y + snap.delta.y,
        };
        const dist = U.distance(mouseDragPos, handleAtSnapPos);

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

function getBestRotationSnap(center, initialVertexStates, handleVertex, rawRotation) {
    const copyCount = parseInt(copyCountInput || '1', 10);
    let allPossibleSnaps = [];
    const snapThresholdData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;

    if (copyCount > 1) {
        const staticVertices = allVertices.filter(p => p.type === 'regular' && !initialVertexStates.some(ip => ip.id === p.id));
        const verticesToTransform = initialVertexStates.filter(p => p.type === 'regular');

        for (let i = 0; i < verticesToTransform.length; i++) {
            for (let j = 0; j < verticesToTransform.length; j++) {
                const p1_orig = verticesToTransform[i];
                const p2_orig = verticesToTransform[j];
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
                            allPossibleSnaps.push({ rotation: exact_rotation, priority: Math.abs(exact_rotation - rawRotation) });
                        }
                    }
                }
            }
        }

        verticesToTransform.forEach(p_orig => {
            staticVertices.forEach(p_static => {
                const v_orig = { x: p_orig.x - center.x, y: p_orig.y - center.y };
                const v_static = { x: p_static.x - center.x, y: p_static.y - center.y };
                const r_orig = Math.hypot(v_orig.x, v_orig.y);
                const r_static = Math.hypot(v_static.x, v_static.y);

                if (Math.abs(r_orig - r_static) < snapThresholdData) {
                    const theta_orig = Math.atan2(v_orig.y, v_orig.x);
                    const theta_static = Math.atan2(v_static.y, v_static.y);

                    for (let c = 0; c < copyCount; c++) {
                        if (c === 0) {
                            if (Math.abs(U.normalizeAngleToPi(theta_static - theta_orig)) < C.GEOMETRY_CALCULATION_EPSILON) {
                                allPossibleSnaps.push({ rotation: 0, priority: Math.abs(rawRotation) });
                            }
                            continue;
                        }
                        let delta_theta = theta_static - theta_orig;
                        const target_delta_theta = rawRotation * c;
                        const k = Math.round((target_delta_theta - delta_theta) / (2 * Math.PI));
                        delta_theta += k * (2 * Math.PI);
                        const exact_rotation = delta_theta / c;
                        allPossibleSnaps.push({ rotation: exact_rotation, priority: Math.abs(exact_rotation - rawRotation) });
                    }
                }
            });
        });
    }

    if (Math.abs(rawRotation) < C.ANGLE_SNAP_THRESHOLD_RAD) {
        allPossibleSnaps.push({ rotation: 0, priority: Math.abs(rawRotation) });
    }

    if (currentShiftPressed) {
        for (const factor of C.NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
            const snapAngle = factor * Math.PI / 2;
            if (Math.abs(rawRotation - snapAngle) < C.ANGLE_SNAP_THRESHOLD_RAD) {
                allPossibleSnaps.push({ rotation: snapAngle, priority: Math.abs(rawRotation - snapAngle) });
            }
            if (snapAngle !== 0 && Math.abs(rawRotation - (-snapAngle)) < C.ANGLE_SNAP_THRESHOLD_RAD) {
                allPossibleSnaps.push({ rotation: -snapAngle, priority: Math.abs(rawRotation - (-snapAngle)) });
            }
        }
    }

    if (allPossibleSnaps.length > 0) {
        allPossibleSnaps.sort((a, b) => a.priority - b.priority);
        const bestSnap = allPossibleSnaps[0];

        if (bestSnap.priority < C.ANGLE_SNAP_THRESHOLD_RAD) {
            const finalPos = U.applyTransformToVertex(handleVertex, center, bestSnap.rotation, 1, false, null);
            return {
                rotation: bestSnap.rotation,
                pos: finalPos,
                snapped: true,
                snapType: 'merge'
            };
        }
    }

    const finalPos = U.applyTransformToVertex(handleVertex, center, rawRotation, 1, false, null);
    return { rotation: rawRotation, pos: finalPos, snapped: false, snapType: null };
}

function getBestScaleSnap(center, initialVertexStates, handleVertex, rawScale) {
    const copyCount = parseInt(copyCountInput || '1', 10);
    let allPossibleSnaps = [];
    const snapThresholdData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;
    const angleThreshold = snapThresholdData / 100;

    if (copyCount > 1) {
        const staticVertices = allVertices.filter(p => p.type === 'regular' && !initialVertexStates.some(ip => ip.id === p.id));
        const verticesToTransform = initialVertexStates.filter(p => p.type === 'regular');

        for (let i = 0; i < verticesToTransform.length; i++) {
            for (let j = 0; j < verticesToTransform.length; j++) {
                const p1_orig = verticesToTransform[i];
                const p2_orig = verticesToTransform[j];

                const v1 = { x: p1_orig.x - center.x, y: p1_orig.y - center.y };
                const v2 = { x: p2_orig.x - center.x, y: p2_orig.y - center.y };

                const r1 = Math.hypot(v1.x, v1.y);
                const r2 = Math.hypot(v2.x, v2.y);

                if (r1 < C.GEOMETRY_CALCULATION_EPSILON || r2 < C.GEOMETRY_CALCULATION_EPSILON) continue;

                const theta1 = Math.atan2(v1.y, v1.x);
                const theta2 = Math.atan2(v2.y, v2.x);

                if (Math.abs(U.normalizeAngleToPi(theta1 - theta2)) < angleThreshold) {
                    for (let c1 = 0; c1 < copyCount; c1++) {
                        for (let c2 = 0; c2 < copyCount; c2++) {
                            if (p1_orig.id === p2_orig.id && c1 === c2) continue;
                            if (c1 === c2) continue;

                            const delta_c = c1 - c2;
                            if (delta_c === 0) continue;

                            const ratio = r2 / r1;
                            if (ratio <= 0) continue;

                            const exact_scale = Math.pow(ratio, 1 / delta_c);
                            allPossibleSnaps.push({ scale: exact_scale, priority: Math.abs(exact_scale - rawScale) });
                        }
                    }
                }
            }
        }

        verticesToTransform.forEach(p_orig => {
            staticVertices.forEach(p_static => {
                const v_orig = { x: p_orig.x - center.x, y: p_orig.y - center.y };
                const v_static = { x: p_static.x - center.x, y: p_static.y - center.y };
                const r_orig = Math.hypot(v_orig.x, v_orig.y);
                const r_static = Math.hypot(v_static.x, v_static.y);

                if (r_orig < C.GEOMETRY_CALCULATION_EPSILON || r_static < C.GEOMETRY_CALCULATION_EPSILON) return;

                const theta_orig = Math.atan2(v_orig.y, v_orig.x);
                const theta_static = Math.atan2(v_static.y, v_static.y);

                if (Math.abs(U.normalizeAngleToPi(theta_orig - theta_static)) < angleThreshold) {
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
                        allPossibleSnaps.push({ scale: exact_scale, priority: Math.abs(exact_scale - rawScale) });
                    }
                }
            });
        });
    }

    if (Math.abs(rawScale - 1.0) < 0.1) {
        allPossibleSnaps.push({ scale: 1.0, priority: Math.abs(rawScale - 1.0) });
    }

    if (currentShiftPressed) {
        for (const factor of C.SNAP_FACTORS) {
            if (factor !== 0 && Math.abs(rawScale - factor) < 0.1) {
                allPossibleSnaps.push({ scale: factor, priority: Math.abs(rawScale - factor) });
            }
        }
    }

    if (allPossibleSnaps.length > 0) {
        allPossibleSnaps.sort((a, b) => a.priority - b.priority);
        const bestSnap = allPossibleSnaps[0];

        if (bestSnap.priority < 0.1) {
            const finalPos = U.applyTransformToVertex(handleVertex, center, 0, bestSnap.scale, false, null);
            return {
                scale: bestSnap.scale,
                pos: finalPos,
                snapped: true,
                snapType: 'merge',
                snappedScaleValue: bestSnap.scale
            };
        }
    }

    const finalPos = U.applyTransformToVertex(handleVertex, center, 0, rawScale, false, null);
    return { scale: rawScale, pos: finalPos, snapped: false, snapType: null };
}

function getBestDirectionalScaleSnap(center, initialVertexStates, handleVertex, rawScale, startVector) {
    const copyCount = parseInt(copyCountInput || '1', 10);
    let allPossibleSnaps = [];
    const snapThresholdData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;

    const axis_dist = Math.hypot(startVector.x, startVector.y);
    if (axis_dist < C.GEOMETRY_CALCULATION_EPSILON) {
        const finalPos = U.applyTransformToVertex(handleVertex, center, 0, rawScale, true, startVector);
        return { scale: rawScale, pos: finalPos, snapped: false, snapType: null };
    }
    const axis_norm = { x: startVector.x / axis_dist, y: startVector.y / axis_dist };
    const getProjectedComponents = (p) => {
        const vec = { x: p.x - center.x, y: p.y - center.y };
        const parallel_dist = vec.x * axis_norm.x + vec.y * axis_norm.y;
        const perp_vec = { x: vec.x - parallel_dist * axis_norm.x, y: vec.y - parallel_dist * axis_norm.y };
        return { parallel_dist, perp_vec };
    };

    if (copyCount > 1) {
        const staticVertices = allVertices.filter(p => p.type === 'regular' && !initialVertexStates.some(ip => ip.id === p.id));
        const verticesToTransform = initialVertexStates.filter(p => p.type === 'regular');

        for (let i = 0; i < verticesToTransform.length; i++) {
            for (let j = 0; j < verticesToTransform.length; j++) {
                const p1_orig = verticesToTransform[i];
                const p2_orig = verticesToTransform[j];
                const proj1 = getProjectedComponents(p1_orig);
                const proj2 = getProjectedComponents(p2_orig);
                if (U.distance(proj1.perp_vec, proj2.perp_vec) < snapThresholdData) {
                    for (let c1 = 0; c1 < copyCount; c1++) {
                        for (let c2 = 0; c2 < copyCount; c2++) {
                            if (p1_orig.id === p2_orig.id && c1 === c2) continue;
                            if (c1 === c2) continue;
                            const delta_c = c1 - c2;
                            if (delta_c === 0 || Math.abs(proj1.parallel_dist) < C.GEOMETRY_CALCULATION_EPSILON) continue;
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

        verticesToTransform.forEach(p_orig => {
            const proj_orig = getProjectedComponents(p_orig);
            staticVertices.forEach(p_static => {
                const proj_static = getProjectedComponents(p_static);
                if (U.distance(proj_orig.perp_vec, proj_static.perp_vec) < snapThresholdData) {
                    if (Math.abs(proj_orig.parallel_dist) < C.GEOMETRY_CALCULATION_EPSILON) return;
                    for (let c = 0; c < copyCount; c++) {
                        if (c === 0) {
                            if (Math.abs(proj_static.parallel_dist - proj_orig.parallel_dist) < snapThresholdData) {
                                allPossibleSnaps.push({ scale: 1.0, priority: Math.abs(rawScale - 1.0) });
                            }
                            continue;
                        }
                        const ratio = proj_static.parallel_dist / proj_orig.parallel_dist;
                        let exact_scale;
                        if (ratio >= 0) exact_scale = Math.pow(ratio, 1 / c);
                        else if (c % 2 !== 0) exact_scale = -Math.pow(Math.abs(ratio), 1 / c);
                        else continue;
                        allPossibleSnaps.push({ scale: exact_scale, priority: Math.abs(exact_scale - rawScale) });
                    }
                }
            });
        });

        const collapsedPositions = verticesToTransform.map(p => ({ p, collapsed: { x: center.x + getProjectedComponents(p).perp_vec.x, y: center.y + getProjectedComponents(p).perp_vec.y } }));
        for (const item of collapsedPositions) {
            if (staticVertices.some(sp => U.distance(item.collapsed, sp) < snapThresholdData)) {
                allPossibleSnaps.push({ scale: 0, priority: Math.abs(rawScale) });
            }
        }
        for (let i = 0; i < collapsedPositions.length; i++) {
            for (let j = i + 1; j < collapsedPositions.length; j++) {
                if (U.distance(collapsedPositions[i].collapsed, collapsedPositions[j].collapsed) < snapThresholdData) {
                    allPossibleSnaps.push({ scale: 0, priority: Math.abs(rawScale) });
                }
            }
        }
    }

    if (Math.abs(rawScale - 1.0) < 0.1) {
        allPossibleSnaps.push({ scale: 1.0, priority: Math.abs(rawScale - 1.0) });
    }
    if (Math.abs(rawScale) < 0.1) {
        allPossibleSnaps.push({ scale: 0, priority: Math.abs(rawScale) });
    }

    if (currentShiftPressed) {
        const scaleSnapFactors = C.SNAP_FACTORS.filter(f => f !== 0);
        for (const factor of scaleSnapFactors) {
            if (Math.abs(rawScale - factor) < 0.1) {
                allPossibleSnaps.push({ scale: factor, priority: Math.abs(rawScale - factor) });
            }
            if (Math.abs(rawScale - (-factor)) < 0.1) {
                allPossibleSnaps.push({ scale: -factor, priority: Math.abs(rawScale - (-factor)) });
            }
        }
    }

    if (allPossibleSnaps.length > 0) {
        allPossibleSnaps.sort((a, b) => a.priority - b.priority);
        const bestSnap = allPossibleSnaps[0];
        if (bestSnap.priority < 0.1) {
            const finalPos = U.applyTransformToVertex(handleVertex, center, 0, bestSnap.scale, true, startVector);
            return {
                scale: bestSnap.scale,
                pos: finalPos,
                snapped: true,
                snapType: 'merge',
                snappedScaleValue: bestSnap.scale
            };
        }
    }

    const finalPos = U.applyTransformToVertex(handleVertex, center, 0, rawScale, true, startVector);
    return { scale: rawScale, pos: finalPos, snapped: false, snapType: null };
}

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const colors = getColors();
    R.clearCanvas(ctx, { canvas, dpr, colors });

    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;

    const { grid1Interval, grid2Interval, alpha1, alpha2 } = R.calculateGridIntervals(viewTransform.scale);
    lastGridState = { interval1: grid1Interval, interval2: grid2Interval, alpha1, alpha2, scale: viewTransform.scale };
    lastAngularGridState = R.getDynamicAngularIntervals(viewTransform, actualCanvasWidth, actualCanvasHeight, dataToScreen);

    R.drawGrid(ctx, { gridDisplayMode, canvas, dpr, viewTransform, gridAlpha, colors }, dataToScreen, screenToData, lastGridState, lastAngularGridState);

    if (coordsDisplayMode !== C.COORDS_DISPLAY_MODE_NONE) {
        const stateForAxes = { canvas, dpr, coordsDisplayMode, viewTransform, angleDisplayMode, colors };
        R.drawAxes(ctx, htmlOverlay, stateForAxes, dataToScreen, screenToData, lastGridState, lastAngularGridState, updateHtmlLabel);
    }

    if (facesVisible && allVertices.length > 0) {
        R.drawFaces(ctx, {
            allFaces,
            facesVisible,
            isDragConfirmed,
            dragPreviewVertices
        }, dataToScreen, findVertexById);
    }

    const copyCount = parseInt(copyCountInput || '1', 10);
    const isCopyPreviewActive = copyCount > 1 && isDragConfirmed && initialDragVertexStates.length > 0 && initialDragVertexStates.some(p => p.type === 'regular');

    const edgesWithHover = hoveredEdgeId ? [...selectedEdgeIds, hoveredEdgeId] : selectedEdgeIds;
    const stateForEdges = { allEdges, selectedEdgeIds: edgesWithHover, isDragConfirmed, dragPreviewVertices, colors, edgesVisible };
    R.drawAllEdges(ctx, stateForEdges, dataToScreen, findVertexById, U.getEdgeId);

    allVertices.forEach(vertex => {
        let vertexToDraw = { ...vertex };
        if (isDragConfirmed && dragPreviewVertices.length > 0) {
            const preview = dragPreviewVertices.find(dp => dp.id === vertex.id);
            if (preview) vertexToDraw = { ...preview };
        }
        R.drawVertex(ctx, vertexToDraw, { selectedVertexIds, selectedCenterIds, activeCenterId, colors, verticesVisible, isHovered: hoveredVertexId === vertex.id }, dataToScreen, updateHtmlLabel);
    });

    if (isCopyPreviewActive) {
        R.drawCopyPreviews(ctx, { copyCount, isDragConfirmed, initialDragVertexStates, dragPreviewVertices, transformIndicatorData, allEdges, findVertexById, findNeighbors: (id) => U.findNeighbors(id, allEdges), colors }, dataToScreen);
    }

    if (facesVisible && allVertices.length > 0) {
        R.drawFaceGlows(ctx, {
            allFaces,
            hoveredFaceId,
            selectedFaceIds,
            colors,
            isDragConfirmed,
            dragPreviewVertices
        }, dataToScreen, findVertexById, U.getFaceId);
        
        ensureFaceCoordinateSystems();
        
        if (selectedFaceIds.length > 0) {
            R.drawFaceCoordinateSystems(ctx, {
                allFaces,
                selectedFaceIds,
                colors: getColors(),
                isDragConfirmed,
                dragPreviewVertices
            }, dataToScreen, findVertexById);
        }
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
        R.drawReferenceElementsGeometry(ctx, frozenDisplayContext, dataToScreen, screenToData, stateForRefGeo);
        const stateForRefTexts = { showAngles, showDistances, viewTransform, mousePos, frozenReference_D_du, distanceSigFigs, angleDisplayMode, colors };
        R.prepareReferenceElementsTexts(htmlOverlay, frozenDisplayContext, stateForRefTexts, screenToData, dataToScreen, updateHtmlLabel);
    }

    const stateForFeedback = { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors };

    if (isDragConfirmed) {
        if (actionContext && actionContext.dragSnap) {
            const { dragOrigin, snappedData } = actionContext.dragSnap;
            const targetDataPos = { x: snappedData.x, y: snappedData.y };
            const edgeColorIndex = currentDrawingPath ? currentDrawingPath.length - 1 : 0;
            const totalExpectedEdges = currentDrawingPath ? Math.max(currentDrawingPath.length, 2) : 2;
            const nextEdgeColor = getColorForTarget(C.COLOR_TARGET_EDGE, edgeColorIndex, totalExpectedEdges);
            

            let edgeColormapInfo = null;
            const colorIndex = colorAssignments[C.COLOR_TARGET_EDGE];
            if (colorIndex !== -1) {
                const colorItem = allColors[colorIndex];
                if (colorItem && colorItem.type === 'colormap') {
                    edgeColormapInfo = {
                        colormapItem: colorItem,
                        startT: 0,
                        endT: 1
                    };
                }
            }

            R.drawDrawingPreview(ctx, { startVertex: dragOrigin, snappedData, isShiftPressed: true, currentColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextCreationColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextEdgeColor, colors, edgeColormapInfo }, dataToScreen);
            const stateForSnapInfo = { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors };
            R.prepareSnapInfoTexts(ctx, htmlOverlay, dragOrigin, targetDataPos, snappedData, stateForSnapInfo, dataToScreen, getDrawingContext(dragOrigin.id), updateHtmlLabel);
        } else {
            const hybridVertexStates = allVertices.map(p => {
                const draggedVersion = dragPreviewVertices.find(dp => dp.id === p.id);
                return draggedVersion || p;
            });

            if (actionContext && actionContext.targetVertex) {
                R.drawDragFeedback(ctx, htmlOverlay, actionContext.targetVertex.id, hybridVertexStates, stateForFeedback, dataToScreen, (id) => U.findNeighbors(id, allEdges), U.getEdgeId, currentShiftPressed, null, updateHtmlLabel, selectedVertexIds, true, initialDragVertexStates, activeCenterId);
            } else if (actionContext && actionContext.targetEdge) {
                R.drawSelectedEdgeDistances(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showDistances, distanceSigFigs, colors, lastGridState }, findVertexById, U.getEdgeId, dataToScreen, updateHtmlLabel, hybridVertexStates);
            }
        }
    } else if ((showDistances || showAngles) && !isDrawingMode && !isCopyPreviewActive && !isPlacingTransform) {
        if (selectedVertexIds.length > 0 && selectedVertexIds.length <= C.MAX_VERTICES_FOR_ANGLES) {
            selectedVertexIds.forEach(vertexId => {
                R.drawDragFeedback(ctx, htmlOverlay, vertexId, allVertices, { ...stateForFeedback, currentShiftPressed: false }, dataToScreen, (id) => U.findNeighbors(id, allEdges), U.getEdgeId, false, null, updateHtmlLabel, selectedVertexIds, false, [], activeCenterId);
            });
        }
        if (selectedEdgeIds.length > 0 && selectedEdgeIds.length <= C.MAX_EDGES_FOR_LABELS) {
            R.drawSelectedEdgeDistances(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showDistances, distanceSigFigs, colors, lastGridState }, findVertexById, U.getEdgeId, dataToScreen, updateHtmlLabel);
            R.drawSelectedEdgeAngles(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showAngles, angleSigFigs, angleDisplayMode, currentShiftPressed, distanceSigFigs, viewTransform, lastGridState, colors }, findVertexById, U.getEdgeId, dataToScreen, (id) => U.findNeighbors(id, allEdges), updateHtmlLabel);
        }
    }

    if (isDrawingMode && previewLineStartVertexId) {
        const startVertex = findVertexById(previewLineStartVertexId);
        if (startVertex) {
            const currentPreviewDrawingContext = getDrawingContext(startVertex.id);
            const snappedData = getSnappedPosition(startVertex, mousePos, currentShiftPressed);
            
            let nextEdgeColor = getColorForTarget(C.COLOR_TARGET_EDGE);
            const colorIndex = colorAssignments[C.COLOR_TARGET_EDGE];
            if (colorIndex !== -1) {
                const colorItem = allColors[colorIndex];
                if (colorItem && colorItem.type === 'colormap' && currentDrawingPath && currentDrawingPath.length >= 1) {
                    const totalEdges = currentDrawingPath.length;
                    const nextEdgeIndex = currentDrawingPath.length - 1;
                    const startT = totalEdges > 1 ? nextEdgeIndex / (totalEdges - 1) : 0;
                    const endT = totalEdges > 1 ? (nextEdgeIndex + 1) / totalEdges : 1;
                    nextEdgeColor = U.sampleColormap(colorItem, (startT + endT) / 2);
                }
            }
            
            R.drawDrawingPreview(ctx, { startVertex, snappedData, isShiftPressed: currentShiftPressed, currentColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextCreationColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextEdgeColor, colors }, dataToScreen);
        }
    }

    if (isRectangleSelecting && isDragConfirmed) {
        R.drawSelectionRectangle(ctx, rectangleSelectStartPos, mousePos, colors);
    }

    if (isDragConfirmed) {
        R.drawMergePreviews(ctx, { allVertices, dragPreviewVertices, viewTransform, colors, transformIndicatorData, copyCount: parseInt(copyCountInput || '1', 10), initialDragVertexStates }, dataToScreen);
    }

    if (ghostVertexPosition) {
        const screenPos = dataToScreen(ghostVertexPosition);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, C.VERTEX_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = colors.feedbackSnapped;
        ctx.fill();
    }

    ghostVertices.forEach(ghostVertex => {
        const screenPos = dataToScreen(ghostVertex);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, C.VERTEX_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = colors.feedbackSnapped;
        ctx.fill();
    });

    if (transformIndicatorData) {
        R.drawTransformIndicators(ctx, htmlOverlay, { transformIndicatorData, angleSigFigs, distanceSigFigs, colors }, dataToScreen, updateHtmlLabel);
    }

    R.updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostVertexPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors }, screenToData, updateHtmlLabel);

    const stateForUI = {
        dpr, canvasUI, isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isVisibilityPanelExpanded,
        isPlacingTransform, placingTransformType, placingSnapPos, mousePos,
        allColors, activeThemeName, colors, verticesVisible, edgesVisible, facesVisible, coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode,
        namedColors: colorEditor.namedColors,
        colorAssignments, activeColorTarget
    };
    R.drawCanvasUI(ctx, htmlOverlay, stateForUI, updateHtmlLabel);

    cleanupHtmlLabels();
}

function getBestRigidTranslationSnap(initialDragVertexStates, rawDelta, copyCount) {
    const mergeSnap = getBestTranslationSnap(initialDragVertexStates, rawDelta, copyCount);
    if (mergeSnap.snapped) {
        return mergeSnap;
    }

    const handleVertex = initialDragVertexStates[0];
    const mouseDragPos = { x: handleVertex.x + rawDelta.x, y: handleVertex.y + rawDelta.y };
    const rawDist = Math.hypot(rawDelta.x, rawDelta.y);
    const rawAngle = Math.atan2(rawDelta.y, rawDelta.x);

    let allCandidates = [];
    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    if (gridInterval) {
        const distUnit = gridInterval * 0.5;
        const snapDistBefore = Math.floor(rawDist / distUnit) * distUnit;
        const snapDistAfter = snapDistBefore + distUnit;

        const allSnapAngles = C.NINETY_DEG_ANGLE_SNAP_FRACTIONS.flatMap(f => {
            const angle = f * Math.PI / 2;
            return angle === 0 ? [0] : [angle, -angle];
        }).sort((a, b) => a - b);

        let angleBefore = -Infinity;
        let angleAfter = Infinity;

        for (const snapAngle of allSnapAngles) {
            if (snapAngle <= rawAngle) {
                angleBefore = snapAngle;
            }
            if (snapAngle >= rawAngle && angleAfter === Infinity) {
                angleAfter = snapAngle;
            }
        }
        if (angleAfter === Infinity) angleAfter = allSnapAngles[0] + (2 * Math.PI);
        if (angleBefore === -Infinity) angleBefore = allSnapAngles[allSnapAngles.length - 1] - (2 * Math.PI);

        allCandidates.push({ x: snapDistBefore * Math.cos(angleBefore), y: snapDistBefore * Math.sin(angleBefore) });
        allCandidates.push({ x: snapDistBefore * Math.cos(angleAfter), y: snapDistBefore * Math.sin(angleAfter) });
        allCandidates.push({ x: snapDistAfter * Math.cos(angleBefore), y: snapDistAfter * Math.sin(angleBefore) });
        allCandidates.push({ x: snapDistAfter * Math.cos(angleAfter), y: snapDistAfter * Math.sin(angleAfter) });

        const gridVertices = U.getGridSnapCandidates(mouseDragPos, gridDisplayMode, gridInterval, lastAngularGridState, true);
        gridVertices.forEach(p => {
            allCandidates.push({ x: p.x - handleVertex.x, y: p.y - handleVertex.y });
        });
    }

    if (allCandidates.length === 0) {
        return { delta: rawDelta, snapped: false };
    }

    let bestDelta = rawDelta;
    let minSnapDistSq = Infinity;
    allCandidates.forEach(deltaCandidate => {
        const distSq = (deltaCandidate.x - rawDelta.x) ** 2 + (deltaCandidate.y - rawDelta.y) ** 2;
        if (distSq < minSnapDistSq) {
            minSnapDistSq = distSq;
            bestDelta = deltaCandidate;
        }
    });

    const snapStickinessData = C.SNAP_STICKINESS_RADIUS_SCREEN / viewTransform.scale;
    if (Math.sqrt(minSnapDistSq) < snapStickinessData) {
        return { delta: bestDelta, snapped: true, snapType: 'geometric_grid' };
    }

    return { delta: rawDelta, snapped: false };
}

function updateDrawingSequenceColors() {
    if (!currentDrawingPath || currentDrawingPath.length < 2) return;
    
    const colorIndex = colorAssignments[C.COLOR_TARGET_VERTEX];
    if (colorIndex === -1) return;
    
    const colorItem = allColors[colorIndex];
    if (!colorItem || colorItem.type !== 'colormap') return;
    
    const totalVertices = currentDrawingPath.length;
    currentDrawingPath.forEach((vertexId, index) => {
        const vertex = findVertexById(vertexId);
        if (vertex && vertex.type === 'regular') {
            const t = totalVertices > 1 ? index / (totalVertices - 1) : 0.5;
            vertex.color = U.sampleColormap(colorItem, t);
        }
    });
}

function updateDrawingSequenceEdgeColors() {
    if (!currentDrawingPath || currentDrawingPath.length < 2) return;
    
    const colorIndex = colorAssignments[C.COLOR_TARGET_EDGE];
    if (colorIndex === -1) return;
    
    const colorItem = allColors[colorIndex];
    if (!colorItem || colorItem.type !== 'colormap') return;
    
    const totalVertices = currentDrawingPath.length;
    const totalEdges = totalVertices - 1;
    
    for (let i = 0; i < totalEdges; i++) {
        const startVertexId = currentDrawingPath[i];
        const endVertexId = currentDrawingPath[i + 1];
        
        const edge = allEdges.find(e => 
            (e.id1 === startVertexId && e.id2 === endVertexId) ||
            (e.id1 === endVertexId && e.id2 === startVertexId)
        );
        
        if (edge) {
            const startT = i / totalEdges;
            const endT = (i + 1) / totalEdges;
            edge.gradientStart = startT;
            edge.gradientEnd = endT;
            edge.colormapItem = colorItem;
            delete edge.colormapOffset;
            delete edge.color;
        }
    }
}

function initializeColorPalette() {
    allColors = allColors.map(color => {
        if (typeof color === 'string') {
            return { type: 'color', value: color };
        }
        return color;
    });

    if (!allColors.some(item => item.type === 'color' && item.value === currentColor)) {
        allColors.unshift({ type: 'color', value: currentColor });
        if (allColors.length > 8) {
            allColors.pop();
        }
    }

    const currentColorIndex = allColors.findIndex(item =>
        item.type === 'color' && item.value === currentColor
    );
    if (currentColorIndex !== -1) {
        selectedColorIndices = [currentColorIndex];
    }
}

function handleColorPaletteClick(screenPos, shiftKey, ctrlKey) {
    if (!isColorPaletteExpanded) return false;

    // Check for clicks on the target icons first
    for (const icon of canvasUI.colorTargetIcons) {
        if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
            screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
            activeColorTarget = icon.target;
            return true;
        }
    }

    const now = Date.now();
    for (const swatch of canvasUI.colorSwatches) {
        if (screenPos.x >= swatch.x && screenPos.x <= swatch.x + swatch.width &&
            screenPos.y >= swatch.y && screenPos.y <= swatch.y + swatch.height) {

            const swatchId = `swatch-${swatch.index}`;
            if (clickData.targetId === swatchId && (now - clickData.timestamp) < C.DOUBLE_CLICK_MS) {
                // Double-click to edit
                isEditingColor = true;
                editingColorIndex = swatch.index;
                const colorToEdit = allColors[swatch.index];
                
                let initialState;
                if (colorToEdit.type === 'color') {
                    const parsedColor = U.parseColor(colorToEdit.value);
                    initialState = {
                        type: 'colormap',
                        points: [{
                            pos: 0.5,
                            alpha: parsedColor.a,
                            color: [parsedColor.r, parsedColor.g, parsedColor.b],
                            order: 1
                        }]
                    };
                } else if (colorToEdit.type === 'colormap') {
                    initialState = {
                        type: 'colormap',
                        points: colorToEdit.vertices.map(v => ({
                            pos: v.pos,
                            alpha: v.alpha !== undefined ? v.alpha : 1.0,
                            color: Array.isArray(v.color) ? [...v.color] : [v.color.r || 0, v.color.g || 0, v.color.b || 0],
                            order: v.order || 1
                        }))
                    };
                }
                
                colorEditor.show(undefined, undefined, initialState);
                clickData.count = 0;
            } else {
                // Single-click to assign color
                colorAssignments[activeColorTarget] = swatch.index;
                applyColorsToSelection();
                buildColorPaletteUI(); // Rebuild to move the icon
                clickData.targetId = swatchId;
                clickData.timestamp = now;
            }
            return true;
        }
    }

    const applyBtn = canvasUI.applyColorsButton;
    if (applyBtn && screenPos.x >= applyBtn.x && screenPos.x <= applyBtn.x + applyBtn.width &&
        screenPos.y >= applyBtn.y && screenPos.y <= applyBtn.y + applyBtn.height) {
        applyColorsToSelection();
        return true;
    }

    const randomBtn = canvasUI.randomColorButton;
    if (randomBtn && screenPos.x >= randomBtn.x && screenPos.x <= randomBtn.x + randomBtn.width &&
        screenPos.y >= randomBtn.y && screenPos.y <= randomBtn.y + randomBtn.height) {
        colorAssignments[activeColorTarget] = -1; // -1 represents random
        applyColorsToSelection();
        buildColorPaletteUI();
        return true;
    }

    const removeBtn = canvasUI.removeColorButton;
    if (removeBtn && screenPos.x >= removeBtn.x && screenPos.x <= removeBtn.x + removeBtn.width &&
        screenPos.y >= removeBtn.y && screenPos.y <= removeBtn.y + removeBtn.height) {
        const colorIndexToRemove = colorAssignments[activeColorTarget];
        if (colorIndexToRemove >= 0) {
             allColors.splice(colorIndexToRemove, 1);
             // Shift down assignments that were after the removed one
             Object.keys(colorAssignments).forEach(target => {
                 if (colorAssignments[target] > colorIndexToRemove) {
                     colorAssignments[target]--;
                 } else if (colorAssignments[target] === colorIndexToRemove) {
                    // Reassign the color for the current target to a safe default
                    colorAssignments[target] = 0;
                 }
             });
             buildColorPaletteUI();
        }
        return true;
    }

    const addBtn = canvasUI.addColorButton;
    if (addBtn && screenPos.x >= addBtn.x && screenPos.x <= addBtn.x + addBtn.width &&
        screenPos.y >= addBtn.y && screenPos.y <= addBtn.y + addBtn.height) {
        isEditingColor = false;
        editingColorIndex = null;
        colorEditor.show();
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
        previewLineStartVertexId = null;
        frozenReference_A_rad = null;
        frozenReference_A_baseRad = null;
        frozenReference_D_du = null;
        frozenReference_D_g2g = null;
        frozenReference_Origin_Data = null;
        drawingSequence = [];
        currentSequenceIndex = 0;
        currentDrawingPath = [];
        return;
    }

    if (isPlacingTransform) {
        isPlacingTransform = false;
        placingTransformType = null;
        placingSnapPos = null;
        return;
    }

    selectedVertexIds = [];
    selectedEdgeIds = [];
    selectedFaceIds = [];
    selectedCenterIds = [];
    activeCenterId = null;
    isActionInProgress = false;
    isDragConfirmed = false;
    isRectangleSelecting = false;
    isEdgeTransformDrag = false;
    isDraggingCenter = false;
    isPanningBackground = false;
    dragPreviewVertices = [];
    initialDragVertexStates = [];
    actionTargetVertex = null;
    currentMouseButton = -1;
    clickData = { targetId: null, type: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair';
    transformIndicatorData = null;
    ghostVertices = [];
    ghostVertexPosition = null;
}

function handleRepeat() {
    if (!isDrawingMode || !previewLineStartVertexId || drawingSequence.length === 0) {
        return;
    }

    saveStateForUndo();

    const lastVertex = findVertexById(previewLineStartVertexId);
    if (!lastVertex) {
        performEscapeAction();
        return;
    }

    const precedingSegmentOfLastVertex = getPrecedingSegment(lastVertex.id);
    if (!precedingSegmentOfLastVertex) {
        performEscapeAction();
        return;
    }
    const currentAbsoluteDirection = precedingSegmentOfLastVertex.angleRad;

    if (drawingSequence.length === 1) {
        return;
    }

    const repeatPatternLength = drawingSequence.length - 1;
    const patternStepIndex = ((currentSequenceIndex - 1) % repeatPatternLength) + 1;
    const patternStep = drawingSequence[patternStepIndex];

    const lengthToDraw = patternStep.length;
    let turnToApplyForNextSegment;
    if (patternStepIndex === drawingSequence.length - 1) {
        const firstRepeatSegmentIndex = drawingSequence.length > 2 ? 1 : 0;
        turnToApplyForNextSegment = drawingSequence[firstRepeatSegmentIndex].turn;
    } else {
        turnToApplyForNextSegment = patternStep.turn;
    }

    let colorForNewVertex;
    let colorForCurrentVertex;

    if (patternStepIndex === drawingSequence.length - 1) {
        const establishedColors = [drawingSequence[0].endVertexColor, drawingSequence[1].endVertexColor];
        const currentColorIndex = (currentSequenceIndex - 1) % establishedColors.length;
        colorForCurrentVertex = establishedColors[currentColorIndex];
        const newColorIndex = currentSequenceIndex % establishedColors.length;
        colorForNewVertex = establishedColors[newColorIndex];
        lastVertex.color = colorForCurrentVertex;
    } else {
        colorForNewVertex = patternStep.endVertexColor;
    }

    const newSegmentAbsoluteAngle = U.normalizeAngle(currentAbsoluteDirection + turnToApplyForNextSegment);

    const targetX = lastVertex.x + lengthToDraw * Math.cos(newSegmentAbsoluteAngle);
    const targetY = lastVertex.y + lengthToDraw * Math.sin(newSegmentAbsoluteAngle);

    let newVertex = null;
    let merged = false;
    const mergeRadiusData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;

    for (const p of allVertices) {
        if (p.type === 'regular' && U.distance({ x: targetX, y: targetY }, p) < mergeRadiusData) {
            newVertex = p;
            merged = true;
            break;
        }
    }

    if (!merged) {
        newVertex = { id: U.generateUniqueId(), x: targetX, y: targetY, type: 'regular', color: colorForNewVertex };
        allVertices.push(newVertex);
    }

    const edgeExists = allEdges.some(e =>
            (e.id1 === lastVertex.id && e.id2 === newVertex.id) ||
            (e.id2 === lastVertex.id && e.id1 === newVertex.id)
        );
        if (!edgeExists) {
            allEdges.push({ id1: lastVertex.id, id2: newVertex.id, color: getColorForTarget(C.COLOR_TARGET_EDGE) });
        }

        if (facesVisible) {
            allFaces = U.detectClosedPolygons(allEdges, findVertexById);
            ensureFaceCoordinateSystems();
        }

        currentDrawingPath.push(newVertex.id);
        window.currentDrawingPath = currentDrawingPath;

        // Update both vertex and edge colors in the drawing sequence
        updateDrawingSequenceColors();
        updateDrawingSequenceEdgeColors();

    previewLineStartVertexId = newVertex.id;

    currentSequenceIndex++;
    if (currentSequenceIndex >= drawingSequence.length) {
        currentSequenceIndex = 1;
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

function buildAdjacencyMap(edges) {
    const adjMap = new Map();
    edges.forEach(e => {
        if (!adjMap.has(e.id1)) adjMap.set(e.id1, []);
        if (!adjMap.has(e.id2)) adjMap.set(e.id2, []);
        adjMap.get(e.id1).push(e.id2);
        adjMap.get(e.id2).push(e.id1);
    });
    return adjMap;
}

function findAllSimplePaths(startId, endId, adjMap) {
    const allPaths = [];
    const queue = [[startId, [startId]]];

    while (queue.length > 0) {
        const [currentId, path] = queue.shift();

        if (path.length > allVertices.length) continue;

        const neighbors = adjMap.get(currentId) || [];
        for (const neighborId of neighbors) {
            if (neighborId === endId) {
                allPaths.push([...path, neighborId]);
                continue;
            }

            if (!path.includes(neighborId)) {
                const newPath = [...path, neighborId];
                queue.push([neighborId, newPath]);
            }
        }
    }
    return allPaths;
}

function handleCoordinateSystemMouseDown(event) {
    if (selectedFaceIds.length === 0) return false;

    const mousePos = U.getMousePosOnCanvas(event, canvas);

    for (const faceId of selectedFaceIds) {
        const face = allFaces.find(f => f.id === faceId);
        if (!face || !face.localCoordSystem) continue;

        const element = U.findCoordinateSystemElement(mousePos, face, dataToScreen);
        if (element) {
            isDraggingCoordSystem = true;
            draggedCoordSystemElement = element;

            coordSystemSnapTargets = prepareCoordSystemSnapTargets(face);

            if (element.type === 'center') {
                face.localCoordSystem.isCustom = true;
            }

            event.preventDefault();
            return true;
        }
    }

    return false;
}

function prepareCoordSystemSnapTargets(currentFace) {
    const vertices = [];
    const edgeMidvertices = [];
    const faceCenters = [];
    const edgeAngles = [];

    currentFace.vertexIds.forEach(id => {
        const vertex = findVertexById(id);
        if (vertex && vertex.type === 'regular') {
            vertices.push({ x: vertex.x, y: vertex.y });
        }
    });

    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        edgeMidvertices.push({
            x: (v1.x + v2.x) / 2,
            y: (v1.y + v2.y) / 2
        });

        edgeAngles.push(Math.atan2(v2.y - v1.y, v2.x - v1.x));
    }

    allFaces.forEach(face => {
        if (face.id !== currentFace.id && face.localCoordSystem) {
            faceCenters.push(face.localCoordSystem.origin);
        }
    });

    return { vertices, edgeMidvertices, faceCenters, edgeAngles };
}

function handleCoordinateSystemMouseMove(event) {
    if (!isDraggingCoordSystem || !draggedCoordSystemElement) return false;

    const mousePos = U.getMousePosOnCanvas(event, canvas);
    const mouseDataPos = screenToData(mousePos);
    const element = draggedCoordSystemElement;
    const face = element.face;
    const coordSystem = face.localCoordSystem;

    if (element.type === 'center') {
        const snappedPos = U.getCoordinateSystemSnapPosition(
            mouseDataPos,
            coordSystemSnapTargets,
            event.shiftKey
        );

        coordSystem.origin.x = snappedPos.x;
        coordSystem.origin.y = snappedPos.y;
        coordSystem.isCustom = true;

    } else if (element.type === 'x_axis' || element.type === 'y_axis') {
        const vectorFromOrigin = {
            x: mouseDataPos.x - coordSystem.origin.x,
            y: mouseDataPos.y - coordSystem.origin.y
        };
        
        const newScale = Math.hypot(vectorFromOrigin.x, vectorFromOrigin.y);
        let newAngle = Math.atan2(vectorFromOrigin.y, vectorFromOrigin.x);

        // Snap angle
        const snappedAngle = U.getAxisSnapAngle(
            mouseDataPos,
            coordSystem.origin,
            event.shiftKey,
            coordSystemSnapTargets
        );
        newAngle = snappedAngle;

        // Apply rotation based on which axis is dragged
        if (element.type === 'y_axis') {
            coordSystem.angle = newAngle - Math.PI / 2;
        } else { // x_axis
            coordSystem.angle = newAngle;
        }
        
        // Apply scale
        coordSystem.scale = newScale;

        coordSystem.isCustom = true;
    }

    return true;
}

function handleCoordinateSystemMouseUp() {
    if (isDraggingCoordSystem) {
        isDraggingCoordSystem = false;
        draggedCoordSystemElement = null;
        coordSystemSnapTargets = null;
        return true;
    }
    return false;
}

function handleCoordinateSystemKeyDown(event) {
    if (selectedFaceIds.length === 0) return false;

    if (event.key === 'r' && !event.ctrlKey && !event.shiftKey) {
        saveStateForUndo();
        selectedFaceIds.forEach(faceId => {
            const face = allFaces.find(f => f.id === faceId);
            if (face && face.localCoordSystem) {
                face.localCoordSystem.isCustom = false;
                face.localCoordSystem.angle = 0;
                U.updateFaceLocalCoordinateSystems([face], findVertexById);
            }
        });
        event.preventDefault();
        return true;
    }

    return false;
}

function updateFaces(edgesBefore, edgesAfter) {
    if (!facesVisible) {
        allFaces = [];
        return;
    }

    const possibleFacesBefore = U.detectClosedPolygons(edgesBefore, findVertexById);
    const possibleFacesAfter = U.detectClosedPolygons(edgesAfter, findVertexById);

    const idsBefore = new Set(possibleFacesBefore.map(f => U.getFaceId(f)));
    const idsAfter = new Set(possibleFacesAfter.map(f => U.getFaceId(f)));

    // Remove faces that no longer exist
    const destroyedFaceIds = new Set([...idsBefore].filter(id => !idsAfter.has(id)));
    if (destroyedFaceIds.size > 0) {
        allFaces = allFaces.filter(f => !destroyedFaceIds.has(U.getFaceId(f)));
    }

    // Add only newly created faces
    const newFaces = possibleFacesAfter.filter(f => !idsBefore.has(U.getFaceId(f)));
    if (newFaces.length > 0) {
        allFaces.push(...newFaces);
    }

    ensureFaceCoordinateSystems();
}

function handleCoordSystemKeyDown(event) {
    if (selectedFaceIds.length === 0) return false;

    if (event.key === 'r' && !event.ctrlKey && !event.shiftKey) {
        saveStateForUndo();
        selectedFaceIds.forEach(faceId => {
            const face = allFaces.find(f => f.id === faceId);
            if (face && face.localCoordSystem) {
                face.localCoordSystem.isCustom = false;
                face.localCoordSystem.angle = 0;
                U.updateFaceLocalCoordinateSystems([face], findVertexById);
            }
        });
        event.preventDefault();
        return true;
    }

    return false;
}

function handleKeyDown(event) {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    if (handleCoordSystemKeyDown(event)) {
        return;
    }

    if (event.key === 'Shift' && !currentShiftPressed) {
        currentShiftPressed = true;
        const mouseDataPos = screenToData(mousePos);
        if (isPlacingTransform) {
            const potentialSnapPos = getBestSnapPosition(mouseDataPos);
            if (potentialSnapPos) {
                placingSnapPos = dataToScreen(potentialSnapPos);
                ghostVertexPosition = potentialSnapPos;
            }
        } else if (isDrawingMode && previewLineStartVertexId) {
            const startVertex = findVertexById(previewLineStartVertexId);
            if (startVertex) {
                const currentPreviewDrawingContext = getDrawingContext(startVertex.id);
                const snappedData = getSnappedPosition(startVertex, mousePos, currentShiftPressed);

                let nextEdgeColor = getColorForTarget(C.COLOR_TARGET_EDGE);
                let edgeColormapInfo = null;

                const colorIndex = colorAssignments[C.COLOR_TARGET_EDGE];
                if (colorIndex !== -1) {
                    const colorItem = allColors[colorIndex];
                    if (colorItem && colorItem.type === 'colormap' && currentDrawingPath && currentDrawingPath.length >= 1) {
                        const totalEdges = currentDrawingPath.length;
                        const nextEdgeIndex = currentDrawingPath.length - 1;
                        const startT = totalEdges > 1 ? nextEdgeIndex / (totalEdges - 1) : 0;
                        const endT = totalEdges > 1 ? (nextEdgeIndex + 1) / totalEdges : 1;
                        edgeColormapInfo = {
                            colormapItem: colorItem,
                            startT: startT,
                            endT: endT
                        };
                    }
                }

                R.drawDrawingPreview(ctx, { startVertex, snappedData, isShiftPressed: currentShiftPressed, currentColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextCreationColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextEdgeColor, colors, edgeColormapInfo }, dataToScreen);const stateForSnapInfo = { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors };
                R.prepareSnapInfoTexts(ctx, htmlOverlay, startVertex, snappedData, snappedData, stateForSnapInfo, dataToScreen, currentPreviewDrawingContext, updateHtmlLabel);
            }
        } else if (!isActionInProgress) {
            ghostVertexPosition = getBestSnapPosition(mouseDataPos);
        }
    }

    if (isActionInProgress && currentMouseButton === 0 && (actionContext?.targetVertex || actionContext?.targetEdge) && event.key >= '0' && event.key <= '9') {
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

    if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_REPEAT) {
        event.preventDefault();
        if (isDrawingMode && previewLineStartVertexId) {
            handleRepeat();
        }
        return;
    }

    const allowedDuringAction = ['Shift', 'Control', 'Meta', 'Alt', 'Escape', 'Delete', 'Backspace'];
    if (isActionInProgress && !allowedDuringAction.includes(event.key) && !(isCtrlOrCmd && [C.KEY_COPY, C.KEY_CUT, C.KEY_PASTE, C.KEY_UNDO, C.KEY_REDO, C.KEY_SELECT_ALL, C.KEY_ZOOM_OUT, C.KEY_ZOOM_IN, C.KEY_ZOOM_IN_PLUS].includes(event.key.toLowerCase()))) return;

    if (isMouseOverCanvas && isCtrlOrCmd && (event.key === C.KEY_ZOOM_IN || event.key === C.KEY_ZOOM_IN_PLUS)) {
        event.preventDefault();
        const centerScreen = { x: (canvas.width / dpr) / 2, y: (canvas.height / dpr) / 2 };
        zoomAt(centerScreen, C.KEYBOARD_ZOOM_FACTOR);
        return;
    }
    if (isMouseOverCanvas && isCtrlOrCmd && event.key === C.KEY_ZOOM_OUT) {
        event.preventDefault();
        const centerScreen = { x: (canvas.width / dpr) / 2, y: (canvas.height / dpr) / 2 };
        zoomAt(centerScreen, 1 / C.KEYBOARD_ZOOM_FACTOR);
        return;
    }

    if (event.key === C.KEY_SPACE) {
        event.preventDefault();
        completeGraphOnSelectedVertices();
    } else if (event.key === C.KEY_ESCAPE) {
        performEscapeAction();
    } else if (event.key === C.KEY_DELETE || event.key === C.KEY_BACKSPACE) {
        deleteSelectedItems();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_COPY) {
        event.preventDefault();
        handleCopy();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_CUT) {
        event.preventDefault();
        handleCut();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_PASTE) {
        event.preventDefault();
        handlePaste();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_UNDO && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
    } else if (isCtrlOrCmd && (event.key.toLowerCase() === C.KEY_REDO || (event.shiftKey && event.key.toLowerCase() === C.KEY_UNDO))) {
        event.preventDefault();
        handleRedo();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_SELECT_ALL) {
        event.preventDefault();
        selectedVertexIds = allVertices.filter(p => p.type === 'regular').map(p => p.id);
        selectedEdgeIds = allEdges.map(edge => U.getEdgeId(edge));
        selectedFaceIds = allFaces.map(face => face.id);
        selectedCenterIds = allVertices.filter(p => p.type !== 'regular').map(p => p.id);
        activeCenterId = null;
    }
}

function handleMouseDown(event) {
    const targetElement = event.target;
    if (targetElement && targetElement.closest('.katex')) {
        event.stopPropagation();
        return;
    }

    mousePos = U.getMousePosOnCanvas(event, canvas);
    actionStartPos = { ...mousePos }; 
    
    if (isColorPaletteExpanded && canvasUI.colorTargetIcons) {
        for (let i = canvasUI.colorTargetIcons.length - 1; i >= 0; i--) {
            const icon = canvasUI.colorTargetIcons[i];
            if (mousePos.x >= icon.x && mousePos.x <= icon.x + icon.width &&
                mousePos.y >= icon.y && mousePos.y <= icon.y + icon.height) {
                
                const now = Date.now();
                const targetId = `target-icon-${icon.target}`;

                if (clickData.targetId === targetId && (now - clickData.timestamp) < C.DOUBLE_CLICK_MS) {
                    clickData.count = 0; 
                    if (icon.target === C.COLOR_TARGET_VERTEX) verticesVisible = !verticesVisible;
                    else if (icon.target === C.COLOR_TARGET_EDGE) edgesVisible = !edgesVisible;
                    else if (icon.target === C.COLOR_TARGET_FACE) facesVisible = !facesVisible;
                } else {
                    clickData.targetId = targetId;
                    clickData.timestamp = now;
                    activeColorTarget = icon.target;
                    isDraggingColorTarget = true;
                    draggedColorTargetInfo = {
                        target: icon.target,
                        offsetX: mousePos.x - icon.x,
                        offsetY: mousePos.y - icon.y
                    };
                }
                
                isActionInProgress = true; 
                actionContext = { target: 'ui-icon', targetVertex: null, targetEdge: null, targetFace: null, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey || event.metaKey };
                return; 
            }
        }
    }

    isDraggingCenter = false;

    if (handleCanvasUIClick(mousePos, event.shiftKey, event.ctrlKey || event.metaKey)) {
        return;
    }

    if (handleCoordinateSystemMouseDown(event)) {
        return;
    }

    if (isDrawingMode && event.button === 2) {
        performEscapeAction();
        return;
    }

    if (event.altKey && !isDrawingMode && (findClickedVertex(mousePos) || findClickedEdge(mousePos))) {
        const clickedEdge = findClickedEdge(mousePos);
        saveStateForUndo();
        performEscapeAction();
        isActionInProgress = true;
        currentMouseButton = 0;
        actionContext = { target: null, shiftKey: false, ctrlKey: false };

        const clickedVertex = findClickedVertex(mousePos);
        if (clickedVertex && clickedVertex.type === 'regular') {
            isDrawingMode = true;
            previewLineStartVertexId = clickedVertex.id;
        } else if (clickedEdge) {
            const p1 = findVertexById(clickedEdge.id1);
            const p2 = findVertexById(clickedEdge.id2);
            if (p1 && p2) {
                const closest = U.getClosestPointOnLineSegment(screenToData(actionStartPos), p1, p2);
                insertVertexOnEdgeWithFaces(clickedEdge, closest);
                const newVertex = allVertices[allVertices.length - 1];
                isDrawingMode = true;
                previewLineStartVertexId = newVertex.id;
            }
        }
        return;
    }

    let clickedVertex = findClickedVertex(mousePos);
    let clickedEdge = !clickedVertex ? findClickedEdge(mousePos) : null;
    let clickedFace = !clickedVertex && !clickedEdge ? findClickedFace(mousePos) : null;

    if (!isDrawingMode && !event.shiftKey && !event.ctrlKey) {
        if (clickedVertex && clickedVertex.type === 'regular' && !selectedVertexIds.includes(clickedVertex.id)) {
            applySelectionLogic([clickedVertex.id], [], [], false, false);
        } else if (clickedEdge && !selectedEdgeIds.includes(U.getEdgeId(clickedEdge))) {
            applySelectionLogic([], [U.getEdgeId(clickedEdge)], [], false, false);
        } else if (clickedFace && !selectedFaceIds.includes(U.getFaceId(clickedFace))) {
            applySelectionLogic([], [], [U.getFaceId(clickedFace)], false, false);
        }
    }

    isActionInProgress = true;
    isDragConfirmed = false;
    isPanningBackground = false;
    isRectangleSelecting = false;
    initialDragVertexStates = [];
    dragPreviewVertices = [];
    currentMouseButton = event.button;
    
    // THE FIX IS HERE: This line was missing.
    rectangleSelectStartPos = actionStartPos;

    actionContext = { targetVertex: clickedVertex, targetEdge: clickedEdge, targetFace: clickedFace, target: clickedVertex || clickedEdge || clickedFace || 'canvas', shiftKey: event.shiftKey, ctrlKey: event.ctrlKey || event.metaKey };

    if (clickedVertex && clickedVertex.type !== 'regular') {
        isDraggingCenter = true;
        handleCenterSelection(clickedVertex.id, event.shiftKey, event.ctrlKey || event.metaKey);
    }
}

function handleMouseMove(event) {
    mousePos = U.getMousePosOnCanvas(event, canvas);
    currentShiftPressed = event.shiftKey;

    if (isDraggingColorTarget && draggedColorTargetInfo) {
        // Find all possible drop targets
        const dropTargets = [...canvasUI.colorSwatches, canvasUI.randomColorButton];
        let closestTarget = null;
        let minDistance = Infinity;

        // Find the closest swatch to the current mouse position
        dropTargets.forEach(target => {
            if (!target) return;
            const targetCenter = { x: target.x + target.width / 2 };
            const d = Math.abs(mousePos.x - targetCenter.x);
            if (d < minDistance) {
                minDistance = d;
                closestTarget = target;
            }
        });

        const icon = canvasUI.colorTargetIcons.find(i => i.target === draggedColorTargetInfo.target);
        if (icon && closestTarget) {
            // Snap the icon's position to the center of the closest target during the drag
            const targetCenter = { x: closestTarget.x + closestTarget.width / 2 };
            icon.x = targetCenter.x - icon.width / 2;
        }
        return;
    }

    if (handleCoordinateSystemMouseMove(event)) {
        return;
    }

    hoveredVertexId = null;
    hoveredEdgeId = null;
    hoveredFaceId = null;

    if (!isActionInProgress) {
        const p = findClickedVertex(mousePos);
        const e = findClickedEdge(mousePos);
        const f = findClickedFace(mousePos);

        if (p) {
            hoveredVertexId = p.id;
        } else if (e) {
            hoveredEdgeId = U.getEdgeId(e);
        } else if (f) {
            hoveredFaceId = f.id;
        }
    }

    if (currentShiftPressed && !isActionInProgress) {
        const mouseDataPos = screenToData(mousePos);
        if (isPlacingTransform) {
            const potentialSnapPos = getBestSnapPosition(mouseDataPos);
            if (potentialSnapPos) {
                placingSnapPos = dataToScreen(potentialSnapPos);
                ghostVertexPosition = potentialSnapPos;
            }
        } else if (isDrawingMode && previewLineStartVertexId) {
            const startVertex = findVertexById(previewLineStartVertexId);
            if (startVertex) {
                const snappedData = getSnappedPosition(startVertex, mousePos, currentShiftPressed);
                ghostVertexPosition = { x: snappedData.x, y: snappedData.y };
            }
        } else {
            ghostVertexPosition = getBestSnapPosition(mouseDataPos);
        }
    } else if (!currentShiftPressed && isDrawingMode && previewLineStartVertexId) {
        const startVertex = findVertexById(previewLineStartVertexId);
        if (startVertex) {
            const snappedData = getSnappedPosition(startVertex, mousePos, false);
            if (snappedData.snapped && (snappedData.snapType === 'vertex' || snappedData.snapType === 'edge')) {
                ghostVertexPosition = { x: snappedData.x, y: snappedData.y };
            } else {
                ghostVertexPosition = null;
            }
        } else {
            ghostVertexPosition = null;
        }
    } else if (!currentShiftPressed) {
        ghostVertexPosition = null;
        placingSnapPos = null;
    }

    if (!isActionInProgress) {
        return;
    }

    if (!isDragConfirmed && U.distance(mousePos, actionStartPos) > C.DRAG_THRESHOLD) {
        isDragConfirmed = true;
        isEdgeTransformDrag = false;

        if (currentMouseButton === 2) {
            isRectangleSelecting = true;
            return;
        }

        if (actionContext.target === 'canvas') {
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
            canvas.style.cursor = 'move';
        } else {
            canvas.style.cursor = 'grabbing';
            isDraggingCenter = actionContext.targetVertex && actionContext.targetVertex.type !== 'regular';

            let verticesToDragIds = new Set(selectedVertexIds);

            selectedEdgeIds.forEach(edgeId => {
                const [id1, id2] = edgeId.split(C.EDGE_ID_DELIMITER);
                verticesToDragIds.add(id1);
                verticesToDragIds.add(id2);
            });

            selectedFaceIds.forEach(faceId => {
                const face = allFaces.find(f => U.getFaceId(f) === faceId);
                if (face) {
                    face.vertexIds.forEach(id => verticesToDragIds.add(id));
                }
            });

            let verticesToDrag = Array.from(verticesToDragIds).map(id => findVertexById(id)).filter(p => p && p.type === 'regular');

            if (isDraggingCenter) {
                verticesToDrag = [actionContext.targetVertex];
                if (actionContext.targetVertex.type === C.TRANSFORMATION_TYPE_ROTATION) {
                    const center = actionContext.targetVertex;
                    const startReferenceVertex = screenToData(actionStartPos);
                    const startVector = { x: startReferenceVertex.x - center.x, y: startReferenceVertex.y - center.y };
                    actionContext.initialRotationStartAngle = Math.atan2(startVector.y, startVector.x);
                    currentAccumulatedRotation = 0;
                }
            }

            if (verticesToDrag.length > 0) {
                initialDragVertexStates = JSON.parse(JSON.stringify(verticesToDrag));
                dragPreviewVertices = JSON.parse(JSON.stringify(verticesToDrag));
            }
        }
    }

    if (isDragConfirmed) {
        actionContext.dragSnap = null;
        const isTransformingSelection = activeCenterId && selectedVertexIds.length > 0 && !isEdgeTransformDrag;
        ghostVertexPosition = null;
        ghostVertices = [];

        if (isPanningBackground) {
            const deltaX_css = mousePos.x - actionStartPos.x;
            const deltaY_css = mousePos.y - actionStartPos.y;
            viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
            viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
        } else if (isDraggingCenter) {
            const mouseData = screenToData(mousePos);
            const startMouseData = screenToData(actionStartPos);
            let finalDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };
            const targetSnapPos = { x: initialDragVertexStates[0].x + finalDelta.x, y: initialDragVertexStates[0].y + finalDelta.y };
            const snapResult = getDragSnapPosition(initialDragVertexStates[0], targetSnapPos);
            if (snapResult.snapped) {
                finalDelta = { x: snapResult.vertex.x - initialDragVertexStates[0].x, y: snapResult.vertex.y - initialDragVertexStates[0].y };
                ghostVertexPosition = snapResult.vertex;
            }
            const newPos = { x: initialDragVertexStates[0].x + finalDelta.x, y: initialDragVertexStates[0].y + finalDelta.y };
            dragPreviewVertices[0].x = newPos.x;
            dragPreviewVertices[0].y = newPos.y;
        } else if (isTransformingSelection || isEdgeTransformDrag) {
            const center = findVertexById(activeCenterId);
            let startReferenceVertex;
            if (isEdgeTransformDrag) {
                startReferenceVertex = screenToData(actionStartPos);
            } else {
                startReferenceVertex = initialDragVertexStates.find(p => actionTargetVertex && p.id === actionTargetVertex.id);
                if (!startReferenceVertex || U.distance(startReferenceVertex, center) < 1e-6) {
                    startReferenceVertex = initialDragVertexStates.find(p => U.distance(p, center) > 1e-6) || startReferenceVertex || initialDragVertexStates[0];
                }
            }
            if (!center || !startReferenceVertex) return;
            const centerType = center.type;
            const mouseData = screenToData(mousePos);
            const rawTransform = calculateTransformFromMouse(center, mouseData, startReferenceVertex, centerType, currentAccumulatedRotation);
            let snapResult = {};
            let finalTransform = {};
            if (centerType === C.TRANSFORMATION_TYPE_ROTATION) {
                snapResult = getBestRotationSnap(center, initialDragVertexStates, startReferenceVertex, rawTransform.rotation);
                finalTransform = { rotation: snapResult.rotation, scale: 1, directionalScale: false };
                currentAccumulatedRotation = snapResult.rotation;
            } else if (centerType === C.TRANSFORMATION_TYPE_SCALE) {
                snapResult = getBestScaleSnap(center, initialDragVertexStates, startReferenceVertex, rawTransform.scale);
                finalTransform = { rotation: 0, scale: snapResult.scale || rawTransform.scale, directionalScale: false };
            } else if (centerType === C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
                const startVector = { x: startReferenceVertex.x - center.x, y: startReferenceVertex.y - center.y };
                snapResult = getBestDirectionalScaleSnap(center, initialDragVertexStates, startReferenceVertex, rawTransform.scale, startVector);
                finalTransform = { rotation: 0, scale: snapResult.scale || rawTransform.scale, directionalScale: true };
            }
            transformIndicatorData = {
                center,
                startPos: startReferenceVertex,
                currentPos: snapResult.pos || mouseData,
                rotation: finalTransform.rotation,
                scale: finalTransform.scale,
                isSnapping: snapResult.snapped || false,
                transformType: centerType,
                directionalScale: finalTransform.directionalScale,
                snappedScaleValue: snapResult.snappedScaleValue || null,
                gridToGridInfo: snapResult.gridToGridInfo || null
            };
            const startVectorForApply = { x: startReferenceVertex.x - center.x, y: startReferenceVertex.y - center.y };
            dragPreviewVertices = initialDragVertexStates.map(p_initial => {
                const newPos = U.applyTransformToVertex(p_initial, center, finalTransform.rotation, finalTransform.scale, finalTransform.directionalScale, startVectorForApply);
                return { ...p_initial, x: newPos.x, y: newPos.y };
            });
            if (snapResult.snapped && snapResult.snapType === 'merge' && snapResult.mergingVertex && snapResult.mergeTarget) {
                const sourceVertexInitial = initialDragVertexStates.find(p => p.id === snapResult.mergingVertex.id);
                if (sourceVertexInitial) {
                    const snappedVertexPreview = dragPreviewVertices.find(p => p.id === sourceVertexInitial.id);
                    if (snappedVertexPreview) {
                        const correctionVector = { x: snapResult.mergeTarget.x - snappedVertexPreview.x, y: snapResult.mergeTarget.y - snappedVertexPreview.y };
                        dragPreviewVertices.forEach(p => { p.x += correctionVector.x; p.y += correctionVector.y; });
                        if (transformIndicatorData.currentPos) { transformIndicatorData.currentPos.x += correctionVector.x; transformIndicatorData.currentPos.y += correctionVector.y; }
                    }
                }
            }
            ghostVertices = [];
            ghostVertexPosition = null;
            const mergeRadiusData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;
            const staticVerticesForMerge = allVertices.filter(p => p.type === 'regular' && !initialDragVertexStates.some(ip => ip.id === p.id));
            dragPreviewVertices.forEach(previewVertex => {
                if (previewVertex.type === 'regular') {
                    staticVerticesForMerge.forEach(staticVertex => {
                        if (U.distance(previewVertex, staticVertex) < mergeRadiusData) { ghostVertices.push({ x: staticVertex.x, y: staticVertex.y }); }
                    });
                }
            });
            for (let i = 0; i < dragPreviewVertices.length; i++) {
                for (let j = i + 1; j < dragPreviewVertices.length; j++) {
                    const p1 = dragPreviewVertices[i];
                    const p2 = dragPreviewVertices[j];
                    if (p1.type === 'regular' && p2.type === 'regular' && U.distance(p1, p2) < mergeRadiusData) {
                        ghostVertices.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
                    }
                }
            }
        } else if (dragPreviewVertices.length > 0) {
            const mouseData = screenToData(mousePos);
            const startMouseData = screenToData(actionStartPos);
            const rawDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };
            let snapResult = { snapped: false };
            const copyCount = parseInt(copyCountInput || '1', 10);

            const isDeformingDrag = currentShiftPressed &&
                initialDragVertexStates.length === 1 &&
                initialDragVertexStates[0].type === 'regular' &&
                U.findNeighbors(initialDragVertexStates[0].id, allEdges).some(id => !selectedVertexIds.includes(id));

            if (isDeformingDrag) {
                const dragOrigin = initialDragVertexStates[0];
                snapResult = getDeformingSnapPosition(dragOrigin, mouseData, selectedVertexIds);
                const previewVertexToUpdate = dragPreviewVertices.find(dp => dp && dp.id === dragOrigin.id);
                if (previewVertexToUpdate) {
                    previewVertexToUpdate.x = snapResult.pos.x;
                    previewVertexToUpdate.y = snapResult.pos.y;
                }
            } else {
                let finalDelta;
                if (currentShiftPressed) {
                    snapResult = getBestRigidTranslationSnap(initialDragVertexStates, rawDelta, copyCount);
                    finalDelta = snapResult.delta;
                } else {
                    snapResult = getBestTranslationSnap(initialDragVertexStates, rawDelta, copyCount);
                    finalDelta = snapResult.delta;
                }
                initialDragVertexStates.forEach(originalVertexState => {
                    const previewVertexToUpdate = dragPreviewVertices.find(dp => dp && dp.id === originalVertexState.id);
                    if (previewVertexToUpdate) {
                        previewVertexToUpdate.x = originalVertexState.x + finalDelta.x;
                        previewVertexToUpdate.y = originalVertexState.y + finalDelta.y;
                    }
                });
            }

            actionContext.finalSnapResult = snapResult;
            if (snapResult.snapped && snapResult.mergeTarget) {
                ghostVertexPosition = snapResult.mergeTarget;
            }
        }
    }
}

function handleMouseUp(event) {
    if (isDraggingColorTarget) {
        // The snapping is already handled by mousemove, so we just need to find the final target.
        const draggedIcon = canvasUI.colorTargetIcons.find(i => i.target === draggedColorTargetInfo.target);
        if (draggedIcon) {
            const iconCenter = { x: draggedIcon.x + draggedIcon.width / 2 };
            const dropTargets = [...canvasUI.colorSwatches, canvasUI.randomColorButton];
            let closestTarget = null;
            let minDistance = Infinity;

            dropTargets.forEach(target => {
                if (!target) return;
                const targetCenter = { x: target.x + target.width / 2 };
                const d = Math.abs(iconCenter.x - targetCenter.x);
                if (d < minDistance) {
                    minDistance = d;
                    closestTarget = target;
                }
            });

            if (closestTarget) {
                const newIndex = closestTarget.id === 'random-color-button' ? -1 : closestTarget.index;
                // Only update and apply if the assignment has changed
                if (colorAssignments[draggedColorTargetInfo.target] !== newIndex) {
                    colorAssignments[draggedColorTargetInfo.target] = newIndex;
                    applyColorsToSelection();
                }
            }
        }

        // Reset state
        isDraggingColorTarget = false;
        draggedColorTargetInfo = null;
        buildColorPaletteUI(); // Snap icon back to its correct, final position
        isActionInProgress = false;
        return;
    }

    if (handleCoordinateSystemMouseUp()) {
        return;
    }

    if (copyCountTimer) clearTimeout(copyCountTimer);
    const copyCount = parseInt(copyCountInput, 10) || 1;
    copyCountInput = '';
    copyCountTimer = null;

    if (!isActionInProgress) return;

    const { shiftKey, ctrlKey, targetVertex, targetEdge, targetFace } = actionContext;

    if (isDragConfirmed) {
        saveStateForUndo();
        const edgesBefore = JSON.parse(JSON.stringify(allEdges));
        let topologyChanged = false;

        if (isPanningBackground) {
            // No geometry change
        } else if (isRectangleSelecting) {
            const dataP1 = screenToData({ x: Math.min(actionStartPos.x, mousePos.x), y: Math.min(actionStartPos.y, mousePos.y) });
            const dataP2 = screenToData({ x: Math.max(actionStartPos.x, mousePos.x), y: Math.max(actionStartPos.y, mousePos.y) });
            const minX = Math.min(dataP1.x, dataP2.x);
            const maxX = Math.max(dataP1.x, dataP2.x);
            const minY = Math.min(dataP1.y, dataP2.y);
            const maxY = Math.max(dataP1.y, dataP2.y);
            const verticesInRect = allVertices.filter(p => p.type === 'regular' && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY).map(p => p.id);
            const edgesInRect = allEdges.filter(e => verticesInRect.includes(e.id1) && verticesInRect.includes(e.id2)).map(e => U.getEdgeId(e));
            const allVerticesInRect = new Set(verticesInRect);
            const facesInRect = allFaces.filter(f => f.vertexIds.every(vId => allVerticesInRect.has(vId))).map(f => U.getFaceId(f));
            applySelectionLogic(verticesInRect, edgesInRect, facesInRect, shiftKey, ctrlKey);
        } else if (dragPreviewVertices.length > 0) {
            if (copyCount > 1) {
                topologyChanged = true;
                const verticesToCopy = initialDragVertexStates.filter(p => p.type === 'regular');
                const originalIds = new Set(verticesToCopy.map(p => p.id));
                const internalEdges = allEdges.filter(edge => originalIds.has(edge.id1) && originalIds.has(edge.id2));
                const externalEdges = allEdges.filter(edge => {
                    const isP1Original = originalIds.has(edge.id1);
                    const isP2Original = originalIds.has(edge.id2);
                    return (isP1Original && !isP2Original) || (!isP1Original && isP2Original);
                });
                const allNewVertices = [];
                const allNewEdges = [];

                for (let i = 1; i < copyCount; i++) {
                    const newIdMapForThisCopy = new Map();
                    verticesToCopy.forEach(p => {
                        let newPos;
                        if (transformIndicatorData) {
                            const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
                            const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
                            newPos = U.applyTransformToVertex(p, center, rotation * i, Math.pow(scale, i), directionalScale, startVector);
                        } else {
                            const delta = { x: dragPreviewVertices[0].x - initialDragVertexStates[0].x, y: dragPreviewVertices[0].y - initialDragVertexStates[0].y };
                            newPos = { x: p.x + delta.x * i, y: p.y + delta.y * i };
                        }
                        const newVertex = { ...p, ...newPos, id: U.generateUniqueId(), color: getColorForTarget(C.COLOR_TARGET_VERTEX) };
                        allNewVertices.push(newVertex);
                        newIdMapForThisCopy.set(p.id, newVertex.id);
                    });
                    internalEdges.forEach(edge => {
                        const newId1 = newIdMapForThisCopy.get(edge.id1);
                        const newId2 = newIdMapForThisCopy.get(edge.id2);
                        if (newId1 && newId2) {
                            const newEdge = { id1: newId1, id2: newId2 };
                            applyColormapToEdge(newEdge, allNewEdges.length, allNewEdges.length + internalEdges.length);
                            allNewEdges.push(newEdge);
                        }
                    });
                    externalEdges.forEach(edge => {
                        const originalDraggedId = originalIds.has(edge.id1) ? edge.id1 : edge.id2;
                        const staticId = originalIds.has(edge.id1) ? edge.id2 : edge.id1;
                        const newCopiedId = newIdMapForThisCopy.get(originalDraggedId);
                        if (newCopiedId && staticId) {
                            const newEdge = { id1: newCopiedId, id2: staticId };
                            applyColormapToEdge(newEdge, allNewEdges.length, allNewEdges.length + externalEdges.length);
                            allNewEdges.push(newEdge);
                        }
                    });
                }
                allVertices.push(...allNewVertices);
                allEdges.push(...allNewEdges);
                selectedVertexIds = allNewVertices.map(p => p.id);
                selectedEdgeIds = allNewEdges.map(e => U.getEdgeId(e));
            } else {
                dragPreviewVertices.forEach(dp => {
                    const originalVertex = allVertices.find(p => p.id === dp.id);
                    if (originalVertex) {
                        originalVertex.x = dp.x;
                        originalVertex.y = dp.y;
                    }
                });
            }

            const mergeRadius = C.MERGE_RADIUS_SCREEN / viewTransform.scale;
            const parent = new Map();
            allVertices.forEach(p => parent.set(p.id, p.id));
            const isOriginalDragged = new Set(initialDragVertexStates.map(p => p.id));

            const findRoot = (id) => {
                if (!parent.has(id) || parent.get(id) === id) return id;
                const rootId = findRoot(parent.get(id));
                parent.set(id, rootId);
                return rootId;
            };

            for (let i = 0; i < allVertices.length; i++) {
                for (let j = i + 1; j < allVertices.length; j++) {
                    const p1 = allVertices[i];
                    const p2 = allVertices[j];
                    if (U.distance(p1, p2) < mergeRadius) {
                        const root1 = findRoot(p1.id);
                        const root2 = findRoot(p2.id);
                        if (root1 !== root2) {
                            const p1_is_orig = isOriginalDragged.has(root1);
                            const p2_is_orig = isOriginalDragged.has(root2);
                            if (p1_is_orig && !p2_is_orig) {
                                parent.set(root1, root2);
                            } else {
                                parent.set(root2, root1);
                            }
                        }
                    }
                }
            }

            const verticesToDelete = new Set();
            allVertices.forEach(p => {
                const rootId = findRoot(p.id);
                if (p.id !== rootId) verticesToDelete.add(p.id);
            });

            if (verticesToDelete.size > 0) {
                topologyChanged = true;
                allVertices = allVertices.filter(p => !verticesToDelete.has(p.id));
                allEdges.forEach(edge => {
                    edge.id1 = findRoot(edge.id1);
                    edge.id2 = findRoot(edge.id2);
                });
                allEdges = allEdges.filter((e, index, self) =>
                    e.id1 !== e.id2 &&
                    index === self.findIndex(t => U.getEdgeId(t) === U.getEdgeId(e))
                );
                selectedVertexIds = Array.from(new Set(selectedVertexIds.map(id => findRoot(id)).filter(id => !verticesToDelete.has(id))));
            }
        }

        if (topologyChanged) {
            updateFaces(edgesBefore, allEdges);
        }

    } else { // This is a CLICK action
        if (currentMouseButton === 0) {
            if (actionContext.target === 'ui-icon') {
                // This was a simple click on an icon, already handled by setting activeColorTarget in mouseDown.
            } else {
                const startVertex = findVertexById(previewLineStartVertexId);
                if (isDrawingMode && startVertex) {
                    console.log('Drawing mode - adding new vertex');
                    console.log('Before adding vertex, currentDrawingPath length:', currentDrawingPath.length);
                    
                    saveStateForUndo();
                    const edgesBefore = JSON.parse(JSON.stringify(allEdges));
                    const snappedData = getSnappedPosition(startVertex, mousePos, shiftKey);
                    let newVertex = null;
    
                    if (snappedData.snapType === 'vertex' && snappedData.targetVertex) {
                        newVertex = snappedData.targetVertex;
                        console.log('Snapped to existing vertex:', newVertex.id);
                    } else if (snappedData.snapType === 'edge' && snappedData.targetEdge) {
                        newVertex = insertVertexOnEdgeWithFaces(snappedData.targetEdge, { x: snappedData.x, y: snappedData.y });
                        console.log('Created vertex on edge:', newVertex?.id);
                    } else {
                        // Calculate the correct colormap color for this vertex position in the sequence
                        // Calculate temporary color - will be redistributed by updateDrawingSequenceColors
                        let newVertexColor = getColorForTarget(C.COLOR_TARGET_VERTEX);
                        const colorIndex = colorAssignments[C.COLOR_TARGET_VERTEX];
                        if (colorIndex !== -1) {
                            const colorItem = allColors[colorIndex];
                            if (colorItem && colorItem.type === 'colormap') {
                                newVertexColor = U.sampleColormap(colorItem, 0.5); // Temporary color
                            }
                        }

                        newVertex = { id: U.generateUniqueId(), x: snappedData.x, y: snappedData.y, type: 'regular', color: newVertexColor };
                        allVertices.push(newVertex);
                    }
    
                    if (newVertex) {
                        const edgeExists = allEdges.some(e => (e.id1 === startVertex.id && e.id2 === newVertex.id) || (e.id2 === startVertex.id && e.id1 === newVertex.id));
                        if (!edgeExists) {
                            // Create edge with temporary color - will be redistributed
                            const newEdge = { id1: startVertex.id, id2: newVertex.id };
                            applyColormapToEdge(newEdge);
                            allEdges.push(newEdge);
                            updateFaces(edgesBefore, allEdges);
                        }
                        
                        const completedSegmentProps = getCompletedSegmentProperties(startVertex, newVertex, allEdges);
                        if (completedSegmentProps) {
                            if (drawingSequence.length > 0) {
                                drawingSequence[drawingSequence.length - 1].turn = completedSegmentProps.turnAngleRad;
                            }
                            drawingSequence.push({ 
                                length: completedSegmentProps.length, 
                                turn: 0, 
                                endVertexColor: newVertex.color 
                            });
                            currentSequenceIndex = drawingSequence.length - 1;
                        }
                        
                        currentDrawingPath.push(newVertex.id);
                        window.currentDrawingPath = currentDrawingPath;

                        // Update both vertex and edge colors in the drawing sequence
                        updateDrawingSequenceColors();
                        updateDrawingSequenceEdgeColors();
                        
                        previewLineStartVertexId = newVertex.id;
                    }
                    
                    if (shiftKey && newVertex && snappedData) {
                        const completedSegmentProps = getCompletedSegmentProperties(startVertex, newVertex, allEdges);
                        if (completedSegmentProps) {
                            frozenReference_Origin_Data = completedSegmentProps.startVertex;
                            
                            if (snappedData.gridToGridSquaredSum > 0 && snappedData.gridInterval) {
                                frozenReference_D_du = snappedData.gridInterval * Math.sqrt(snappedData.gridToGridSquaredSum);
                            } else {
                                frozenReference_D_du = completedSegmentProps.length;
                            }
                            
                            frozenReference_D_g2g = snappedData.gridToGridSquaredSum > 0 ? { 
                                g2gSquaredSum: snappedData.gridToGridSquaredSum, 
                                interval: snappedData.gridInterval 
                            } : null;
                            
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
    
                    clickData.count = 0;
                } else if (actionContext.target === 'canvas') {
                    console.log('Canvas click - creating first vertex');
                    saveStateForUndo();
                    const startCoords = ghostVertexPosition ? ghostVertexPosition : screenToData(mousePos);
                    
                    // For the first vertex in a new drawing sequence, always use the first color of the colormap
                    let newVertexColor = getColorForTarget(C.COLOR_TARGET_VERTEX);
                    const colorIndex = colorAssignments[C.COLOR_TARGET_VERTEX];
                    if (colorIndex !== -1) {
                        const colorItem = allColors[colorIndex];
                        if (colorItem && colorItem.type === 'colormap') {
                            newVertexColor = U.sampleColormap(colorItem, 0); // First vertex gets t=0
                            console.log('First vertex colormap color:', newVertexColor);
                        }
                    }

                    const newVertex = { id: U.generateUniqueId(), ...startCoords, type: 'regular', color: newVertexColor };
                    console.log('Created first vertex with color:', newVertex.color);
                    allVertices.push(newVertex);
                    isDrawingMode = true;
                    previewLineStartVertexId = newVertex.id;
                    drawingSequence = [];
                    currentSequenceIndex = 0;
                    currentDrawingPath = [newVertex.id];
                    window.currentDrawingPath = currentDrawingPath;
                    console.log('Initialized currentDrawingPath:', currentDrawingPath);
                } else {
                    if (targetVertex || targetEdge || targetFace) {
                        const targetId = targetFace ? U.getFaceId(targetFace) : (targetEdge ? U.getEdgeId(targetEdge) : targetVertex.id);
                        let targetType;
                        if (targetFace) targetType = 'face';
                        else if (targetVertex && targetVertex.type !== 'regular') targetType = 'center';
                        else if (targetVertex) targetType = 'vertex';
                        else if (targetEdge) targetType = 'edge';
    
                        if (targetId && clickData.targetId === targetId && (Date.now() - clickData.timestamp) < C.DOUBLE_CLICK_MS) {
                            clickData.count++;
                        } else {
                            clickData.count = 1;
                        }
                        clickData.targetId = targetId;
                        clickData.type = targetType;
                        clickData.timestamp = Date.now();
    
                        switch (clickData.count) {
                            case 1:
                                if (clickData.type === 'face') applySelectionLogic([], [], [clickData.targetId], shiftKey, ctrlKey);
                                else if (clickData.type === 'edge') applySelectionLogic([], [clickData.targetId], [], shiftKey, ctrlKey);
                                else if (clickData.type === 'vertex') applySelectionLogic([clickData.targetId], [], [], shiftKey, ctrlKey);
                                else if (clickData.type === 'center') handleCenterSelection(clickData.targetId, shiftKey, ctrlKey);
                                break;
                            case 2:
                                if (clickData.type === 'vertex') {
                                    const neighbors = U.findNeighbors(clickData.targetId, allEdges);
                                    applySelectionLogic([clickData.targetId, ...neighbors], [], [], shiftKey, ctrlKey);
                                } else if (clickData.type === 'edge') {
                                    const edge = allEdges.find(e => U.getEdgeId(e) === clickData.targetId);
                                    if (edge) {
                                        const validNeighborEdges = [...findNeighborEdges(edge.id1), ...findNeighborEdges(edge.id2)];
                                        applySelectionLogic([], Array.from(new Set(validNeighborEdges.map(e => U.getEdgeId(e)))), [], shiftKey, ctrlKey);
                                    }
                                } else if (clickData.type === 'face') {
                                    const face = allFaces.find(f => U.getFaceId(f) === clickData.targetId);
                                    if (face) {
                                        const adjacentFaceIds = [];
                                        const faceEdges = new Set();
                                        for (let i = 0; i < face.vertexIds.length; i++) {
                                            const id1 = face.vertexIds[i];
                                            const id2 = face.vertexIds[(i + 1) % face.vertexIds.length];
                                            faceEdges.add(U.getEdgeId({ id1, id2 }));
                                        }
                                        allFaces.forEach(otherFace => {
                                            if (U.getFaceId(otherFace) === U.getFaceId(face)) return;
                                            for (let i = 0; i < otherFace.vertexIds.length; i++) {
                                                const id1 = otherFace.vertexIds[i];
                                                const id2 = otherFace.vertexIds[(i + 1) % otherFace.vertexIds.length];
                                                if (faceEdges.has(U.getEdgeId({ id1, id2 }))) {
                                                    adjacentFaceIds.push(U.getFaceId(otherFace));
                                                    break;
                                                }
                                            }
                                        });
                                        applySelectionLogic([], [], [U.getFaceId(face), ...adjacentFaceIds], shiftKey, ctrlKey);
                                    }
                                }
                                break;
                            case 3:
                                if (clickData.type === 'vertex' || clickData.type === 'edge' || clickData.type === 'face') {
                                    let startNode;
                                    if (clickData.type === 'vertex') startNode = clickData.targetId;
                                    else if (clickData.type === 'edge') startNode = clickData.targetId.split(C.EDGE_ID_DELIMITER)[0];
                                    else if (clickData.type === 'face') {
                                        const face = allFaces.find(f => U.getFaceId(f) === clickData.targetId);
                                        if (face) startNode = face.vertexIds[0];
                                    }
                                    if (startNode) {
                                        const verticesInSubgraph = new Set(findAllVerticesInSubgraph(startNode));
                                        if (clickData.type === 'vertex') applySelectionLogic(Array.from(verticesInSubgraph), [], [], shiftKey, ctrlKey);
                                        else if (clickData.type === 'edge') {
                                            const edgesInSubgraph = allEdges.filter(e => verticesInSubgraph.has(e.id1) && verticesInSubgraph.has(e.id2)).map(e => U.getEdgeId(e));
                                            applySelectionLogic([], edgesInSubgraph, [], shiftKey, ctrlKey);
                                        } else if (clickData.type === 'face') {
                                            const facesInSubgraph = allFaces.filter(f => f.vertexIds.every(vId => verticesInSubgraph.has(vId))).map(f => U.getFaceId(f));
                                            applySelectionLogic([], [], facesInSubgraph, shiftKey, ctrlKey);
                                        }
                                    }
                                }
                                clickData.count = 0;
                                break;
                        }
    
                        if (selectedFaceIds.length > 0) {
                            activeColorTarget = C.COLOR_TARGET_FACE;
                        } else if (selectedEdgeIds.length > 0) {
                            activeColorTarget = C.COLOR_TARGET_EDGE;
                        } else if (selectedVertexIds.length > 0) {
                            activeColorTarget = C.COLOR_TARGET_VERTEX;
                        }
                    }
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
    transformIndicatorData = null;
    canvas.style.cursor = 'crosshair';
    if (!currentShiftPressed) ghostVertexPosition = null;
}

// Event listeners setup
canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const mouseScreen = U.getMousePosOnCanvas(event, canvas);
    const scaleFactor = event.deltaY > 0 ? 1 / 1.15 : 1.15;
    zoomAt(mouseScreen, scaleFactor);
}, { passive: false });

canvas.addEventListener('mouseenter', () => {
    isMouseOverCanvas = true;
});

canvas.addEventListener('mouseleave', () => {
    isMouseOverCanvas = false;
    redrawAll();
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

canvas.addEventListener('mousemove', handleMouseMove);

canvas.addEventListener("mouseup", handleMouseUp);

canvas.addEventListener('mousedown', handleMouseDown);

window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
        currentShiftPressed = false;
        ghostVertexPosition = null;
        placingSnapPos = null;
        ghostVertices = [];
    }
});

window.addEventListener('keydown', handleKeyDown);

window.addEventListener('resize', resizeCanvas);

window.addEventListener('load', () => {
    initializeApp();
});