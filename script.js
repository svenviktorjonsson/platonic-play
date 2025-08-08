import ColormapSelector from './node_modules/colormap-selector/ColormapSelector.js';
import './node_modules/colormap-selector/styles.css';

console.log('🚀 Script.js loaded at:', new Date().toLocaleTimeString());

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

let contextMenu;
let contextMenuVertexId = null;
let contextMenuEdgeId = null;
let contextMenuFaceId = null;


let initialCoordSystemStateOnDrag = null;
let initialCoordSystemStates = new Map();
let coordSystemTransformIndicatorData = null;
let highlightedEdgeForSnap = null;
let coordSystemSnapAngle = null;
let draggedFaceId = null;
let coordSystemSnapType = null;
let coordSystemSnapScale = null;

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
let facesVisible = true;

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

function setupUndoStackDebugging() {
    const originalPop = Array.prototype.pop;
    const originalPush = Array.prototype.push;
    const originalShift = Array.prototype.shift;
    const originalSplice = Array.prototype.splice;

    undoStack.pop = function() {
        const result = originalPop.call(this);
        return result;
    };

    undoStack.push = function(...args) {
        const result = originalPush.call(this, ...args);
        return result;
    };

    undoStack.shift = function() {
        const result = originalShift.call(this);
        return result;
    };

    undoStack.splice = function(...args) {
        const result = originalSplice.call(this, ...args);
        return result;
    };
}

// In script.js (near the other state variables)

let isMouseOverColorEditor = false;
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

let activeColorTargets = [];
let isDraggingColorSwatch = false;
let draggedSwatchInfo = null;

let colorAssignments = {
    [C.COLOR_TARGET_VERTEX]: 0,
    [C.COLOR_TARGET_EDGE]: 1,
    [C.COLOR_TARGET_FACE]: 2,
};

let isDraggingCoordSystem = false;
let draggedCoordSystemElement = null;
let coordSystemSnapTargets = null;

let deletedFaceIds = new Set(); // Track explicitly deleted faces
let draggedSwatchTemporarilyRemoved = false;


function ensureFaceCoordinateSystems() {
    U.updateFaceLocalCoordinateSystems(allFaces, findVertexById);
}

function getColors() {
    const theme = U.getCurrentTheme(activeThemeName, C.DARK_THEME);
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
    
    const colors = getColors();
    if (targetType === C.COLOR_TARGET_VERTEX) return colors.vertex;
    if (targetType === C.COLOR_TARGET_EDGE) return colors.edge;
    if (targetType === C.COLOR_TARGET_FACE) return colors.face;
    
    return colors.vertex;
}

function applyColorsToSelection() {

    activeColorTargets.forEach(target => {
        const colorIndex = colorAssignments[target];
        if (colorIndex === -1 && target !== C.COLOR_TARGET_VERTEX) {
            return;
        }

        if (target === C.COLOR_TARGET_VERTEX) {
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
        } else if (target === C.COLOR_TARGET_EDGE) {
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
                    }
                });
            }
        } else if (target === C.COLOR_TARGET_FACE) {
            const colorIndex = colorAssignments[target];
            if (colorIndex === -1) {
                const color = getColorForTarget(C.COLOR_TARGET_FACE);
                allFaces.forEach(face => {
                    if (selectedFaceIds.includes(U.getFaceId(face))) {
                        face.color = color;
                        delete face.colormapItem;
                        delete face.colormapDistribution;
                    }
                });
            } else {
                const colorItem = allColors[colorIndex];
                if (colorItem && colorItem.type === 'colormap') {
                    allFaces.forEach(face => {
                        if (selectedFaceIds.includes(U.getFaceId(face))) {
                            face.colormapItem = colorItem;
                            face.colormapDistribution = 'x'; // Default to x-direction
                            delete face.color;
                        }
                    });
                } else {
                    const color = getColorForTarget(C.COLOR_TARGET_FACE);
                    allFaces.forEach(face => {
                        if (selectedFaceIds.includes(U.getFaceId(face))) {
                            face.color = color;
                            delete face.colormapItem;
                            delete face.colormapDistribution;
                        }
                    });
                }
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

    let translateX = '-50%';
    let translateY = '-50%';
    let transformOrigin = 'center';

    switch (options.textAlign) {
        case 'left': translateX = '0%'; break;
        case 'right': translateX = '-100%'; break;
    }

    switch (options.textBaseline) {
        case 'top': translateY = '0%'; break;
        case 'bottom': translateY = '-100%'; break;
    }

    // Adjust origin for rotations to feel more natural with alignment
    if (options.textAlign === 'left' && options.textBaseline === 'top') transformOrigin = 'top left';
    else if (options.textAlign === 'right' && options.textBaseline === 'top') transformOrigin = 'top right';
    else if (options.textAlign === 'left' && options.textBaseline === 'bottom') transformOrigin = 'bottom left';
    else if (options.textAlign === 'right' && options.textBaseline === 'bottom') transformOrigin = 'bottom right';


    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transformOrigin = transformOrigin;
    el.style.transform = `translate(${translateX}, ${translateY}) rotate(${options.rotation || 0}deg)`;
    
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
    const unselectedNeighbors = U.findNeighbors(dragOrigin.id, allEdges)
        .map(id => findVertexById(id))
        .filter(p => p && !selectedVertexIds.includes(p.id));

    const candidates = [];
    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    const pointGeometries = [];
    const pathGeometries = [];

    if (gridInterval) {
        U.getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true).forEach(p => pointGeometries.push(p));
    }
    allVertices.forEach(p => {
        if (p.id !== dragOrigin.id && p.type === 'regular' && !unselectedNeighbors.some(n => n.id === p.id)) {
            pointGeometries.push(p);
        }
    });

    if (unselectedNeighbors.length === 2) {
        const n1 = unselectedNeighbors[0];
        const n2 = unselectedNeighbors[1];
        
        pathGeometries.push({ type: 'line', data: U.getPerpendicularBisector(n1, n2), snapType: 'isosceles' });

        const originalAngle = U.computeAngle(n1, dragOrigin, n2);
        const anglePreservingCircle = U.findCircleFromPointsAndAngle(n1, n2, originalAngle, dragOrigin);
        if (anglePreservingCircle) pathGeometries.push({ type: 'circle', data: anglePreservingCircle, snapType: 'angle_preservation' });
        
        const allSnapAngles = new Set();
        C.NINETY_DEG_ANGLE_SNAP_FRACTIONS.forEach(f => {
            for (let i = 1; i <= 24; i++) {
                const angle = U.normalizeAngle((f * Math.PI / 2) * i);
                if (angle > C.GEOMETRY_CALCULATION_EPSILON && angle < C.RADIANS_IN_CIRCLE - C.GEOMETRY_CALCULATION_EPSILON) {
                    allSnapAngles.add(parseFloat(angle.toFixed(7)));
                }
            }
        });
        allSnapAngles.forEach(angle => {
            const circle = U.findCircleFromPointsAndAngle(n1, n2, angle, dragOrigin);
            if (circle) pathGeometries.push({ type: 'circle', data: circle, snapType: 'fixed_angle' });
        });
        
        const sideLength = U.distance(n1, n2);
        pathGeometries.push({ type: 'circle', data: { center: n1, radius: sideLength }, snapType: 'equal_distance' });
        pathGeometries.push({ type: 'circle', data: { center: n2, radius: sideLength }, snapType: 'equal_distance' });

        if (gridInterval) {
            for (let i = 1; i <= 30; i++) {
                const radius = i * gridInterval * 0.5;
                pathGeometries.push({ type: 'circle', data: { center: n1, radius }, snapType: 'grid_distance' });
                pathGeometries.push({ type: 'circle', data: { center: n2, radius }, snapType: 'grid_distance' });
            }
        }
    }

    pointGeometries.forEach(p => {
        candidates.push({ type: 'point', pos: p, dist: U.distance(mouseDataPos, p), source: p });
    });
    
    pathGeometries.forEach(geom => {
        let closestPointOnPath, distToMouse;
        if (geom.type === 'line') {
            const closest = U.getClosestPointOnLine(mouseDataPos, geom.data.p1, geom.data.p2);
            closestPointOnPath = { x: closest.x, y: closest.y };
            distToMouse = closest.distance;
        } else {
            const vectorToMouse = { x: mouseDataPos.x - geom.data.center.x, y: mouseDataPos.y - geom.data.center.y };
            const mag = Math.hypot(vectorToMouse.x, vectorToMouse.y);
            if (mag < C.GEOMETRY_CALCULATION_EPSILON) {
                closestPointOnPath = { x: geom.data.center.x + geom.data.radius, y: geom.data.center.y };
            } else {
                closestPointOnPath = {
                    x: geom.data.center.x + vectorToMouse.x / mag * geom.data.radius,
                    y: geom.data.center.y + vectorToMouse.y / mag * geom.data.radius
                };
            }
            distToMouse = U.distance(mouseDataPos, closestPointOnPath);
        }
        candidates.push({ type: geom.type, pos: closestPointOnPath, dist: distToMouse, source: geom.data, snapType: geom.snapType });
    });

    if (candidates.length === 0) return { pos: mouseDataPos, snapped: false };
    
    candidates.sort((a, b) => a.dist - b.dist);
    const bestPrimaryCandidate = candidates[0];

    if (bestPrimaryCandidate.dist > snapStickinessData) {
        return { pos: mouseDataPos, snapped: false };
    }
    
    let finalSnapPos = bestPrimaryCandidate.pos;
    
    if ((bestPrimaryCandidate.type === 'line' || bestPrimaryCandidate.type === 'circle') && unselectedNeighbors.length === 2) {
        const primaryPath = bestPrimaryCandidate.source;
        const secondarySnapPoints = [];

        pathGeometries.forEach(otherGeom => {
            if (otherGeom.data === primaryPath) return;
            
            if (bestPrimaryCandidate.type === 'line') {
                if (otherGeom.type === 'line') {
                    const int = U.getLineLineIntersection(primaryPath, otherGeom.data);
                    if (int) secondarySnapPoints.push(int);
                } else {
                    secondarySnapPoints.push(...U.getLineCircleIntersection(primaryPath, otherGeom.data));
                }
            } else {
                if (otherGeom.type === 'line') {
                    secondarySnapPoints.push(...U.getLineCircleIntersection(otherGeom.data, primaryPath));
                } else {
                    secondarySnapPoints.push(...U.getCircleCircleIntersection(primaryPath, otherGeom.data));
                }
            }
        });
        
        pointGeometries.forEach(p => {
            if (U.distance(p, finalSnapPos) < snapStickinessData * 2) {
                if(bestPrimaryCandidate.type === 'line') {
                    secondarySnapPoints.push(U.getClosestPointOnLine(p, primaryPath.p1, primaryPath.p2));
                } else {
                    const vec = { x: p.x - primaryPath.center.x, y: p.y - primaryPath.center.y };
                    const mag = Math.hypot(vec.x, vec.y);
                    if (mag > C.GEOMETRY_CALCULATION_EPSILON) {
                        secondarySnapPoints.push({
                            x: primaryPath.center.x + vec.x / mag * primaryPath.radius,
                            y: primaryPath.center.y + vec.y / mag * primaryPath.radius
                        });
                    }
                }
            }
        });

        if (secondarySnapPoints.length > 0) {
            let minSecondaryDist = Infinity;
            let bestSecondarySnap = null;
            secondarySnapPoints.forEach(candidate => {
                const dist = U.distance(finalSnapPos, candidate);
                if (dist < minSecondaryDist) {
                    minSecondaryDist = dist;
                    bestSecondarySnap = candidate;
                }
            });

            if (bestSecondarySnap && minSecondaryDist < (snapStickinessData / 2.0)) {
                finalSnapPos = bestSecondarySnap;
            }
        }
    }

    return { pos: finalSnapPos, snapped: true, snapType: bestPrimaryCandidate.snapType || bestPrimaryCandidate.type };
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

function getSnappedPosition(startVertex, mouseScreenPos, shiftPressed, isDragContext = false, overrideContext = null) {
    const mouseDataPos = screenToData(mouseScreenPos);
    const drawingContext = overrideContext || getDrawingContext(startVertex.id);

    if (!shiftPressed) {
        const candidates = [];
        const vertexSelectRadiusData = C.VERTEX_SELECT_RADIUS / viewTransform.scale;
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
    } else { // shiftPressed is true
        const unselectedNeighbors = U.findNeighbors(startVertex.id, allEdges)
            .map(id => findVertexById(id))
            .filter(p => p && p.type === 'regular' && !selectedVertexIds.includes(p.id));

        const isDeformingDrag = isDragContext && shiftPressed && unselectedNeighbors.length > 0;

        if (isDeformingDrag) {
            const snapResult = getDeformingSnapPosition(startVertex, mouseDataPos, selectedVertexIds);
            const finalAngle = Math.atan2(snapResult.pos.y - startVertex.y, snapResult.pos.x - startVertex.x) || 0;
            return {
                x: snapResult.pos.x,
                y: snapResult.pos.y,
                angle: finalAngle * (180 / Math.PI),
                distance: U.distance(startVertex, snapResult.pos),
                snapped: snapResult.snapped,
                snapType: snapResult.snapType,
                gridSnapped: snapResult.snapType === 'grid',
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

            allVertices.forEach(p => {
                if (p.id !== startVertex.id && p.type === 'regular') {
                    allShiftCandidates.push({ pos: p, isGridVertexSnap: false, type: 'vertex', sourceVertex: p });
                }
            });

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

                    if (Math.abs(currentDist - bestDist) < C.GEOMETRY_CALCULATION_EPSILON) {
                        if (current.type === 'vertex' && best.type !== 'vertex') {
                            return current;
                        }
                        if (best.type === 'vertex' && current.type !== 'vertex') {
                            return best;
                        }
                    }
                    
                    return currentDist < bestDist ? current : best;
                }, { pos: null });
                
                const finalAngle = Math.atan2(bestOverallCandidate.pos.y - startVertex.y, bestOverallCandidate.pos.x - startVertex.x) || 0;
                
                if (bestOverallCandidate.type === 'vertex') {
                    return {
                        ...bestOverallCandidate.pos,
                        angle: finalAngle * (180 / Math.PI),
                        distance: U.distance(startVertex, bestOverallCandidate.pos),
                        snapped: true,
                        snapType: 'vertex',
                        targetVertex: bestOverallCandidate.sourceVertex,
                        gridSnapped: false,
                        lengthSnapFactor: null,
                        angleSnapFactor: null,
                        angleTurn: U.normalizeAngleToPi(finalAngle - drawingContext.offsetAngleRad),
                        gridToGridSquaredSum: null,
                        gridInterval: null
                    };
                }

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
        C.TRANSFORMATION_TYPE_ROTATE_SCALE,
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

function buildColorPaletteUI() {
    canvasUI.colorSwatches = [];
    canvasUI.colorTargetIcons = [];
    const paletteY = canvasUI.colorToolButton.y;

    let currentX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;

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
        if (colorIndex >= 0 && colorIndex < allColors.length) {
            swatch = canvasUI.colorSwatches.find(s => s.index === colorIndex);
        } else {
            // If color is unassigned (-1), point to the remove/random button area
            swatch = canvasUI.removeColorButton;
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

function removeColorAtIndex(indexToRemove) {
    if (indexToRemove < 0 || indexToRemove >= allColors.length || allColors.length <= 1) {
        return;
    }

    allColors.splice(indexToRemove, 1);

    Object.keys(colorAssignments).forEach(target => {
        if (colorAssignments[target] > indexToRemove) {
            colorAssignments[target]--;
        } else if (colorAssignments[target] === indexToRemove) {
            colorAssignments[target] = Math.min(indexToRemove, allColors.length - 1);
        }
    });

    buildColorPaletteUI();
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

    canvasUI.visibilityToolButton = {
        id: "visibility-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: canvasUI.transformToolButton.y + canvasUI.transformToolButton.height + C.UI_BUTTON_PADDING,
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
                    case 'theme':
                        handleThemeToggle();
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

        const vtb = canvasUI.visibilityToolButton;
        if (vtb && screenPos.x >= vtb.x && screenPos.x <= vtb.x + vtb.width &&
            screenPos.y >= vtb.y && screenPos.y <= vtb.y + vtb.height) {
            isDisplayPanelExpanded = !isDisplayPanelExpanded;
            if (isDisplayPanelExpanded) buildDisplayPanelUI();
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
            if (isPlacingTransform) {
                // If already placing, just switch the type
                placingTransformType = icon.type;
            } else {
                // Otherwise, start placement mode
                isPlacingTransform = true;
                placingTransformType = icon.type;
                canvas.style.cursor = 'none';
            }
            return true;
        }
    }
    }

    if (isDisplayPanelExpanded) {
        if (handleDisplayPanelClick(screenPos, shiftKey, ctrlKey)) {
            return true;
        }
    }

    return false;
}

function buildDisplayPanelUI() {
    canvasUI.displayIcons = [];
    if (!canvasUI.visibilityToolButton) return;

    const panelX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const iconY = canvasUI.visibilityToolButton.y;
    const iconSize = C.DISPLAY_ICON_SIZE;
    const iconPadding = C.DISPLAY_ICON_PADDING;

    const iconGroups = ['coords', 'grid', 'angles', 'distances', 'theme'];

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
    const state = getCurrentState();
    
    // Create a simple signature of the current state
    const signature = {
        colorCount: allColors.length,
        firstColor: allColors[0]?.value || 'none',
        vertexCount: allVertices.length
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
    selectedCenterIds = JSON.parse(JSON.stringify(state.selectedCenterIds || []));
    activeColorTargets = JSON.parse(JSON.stringify(state.activeColorTargets || []));
    allColors = state.allColors ? JSON.parse(JSON.stringify(state.allColors)) : C.DEFAULT_RECENT_COLORS.map(color => {
        if (typeof color === 'string') {
            return { type: 'color', value: color };
        }
        return color;
    });
    colorAssignments = state.colorAssignments ? JSON.parse(JSON.stringify(state.colorAssignments)) : {
        [C.COLOR_TARGET_VERTEX]: 0,
        [C.COLOR_TARGET_EDGE]: 1,
        [C.COLOR_TARGET_FACE]: 2,
    };
    activeCenterId = state.activeCenterId !== undefined ? state.activeCenterId : null;
    isDrawingMode = state.isDrawingMode !== undefined ? state.isDrawingMode : false;
    previewLineStartVertexId = state.previewLineStartVertexId !== undefined ? state.previewLineStartVertexId : null;
    frozenReference_A_rad = state.frozenReference_A_rad !== undefined ? state.frozenReference_A_rad : null;
    frozenReference_A_baseRad = state.frozenReference_A_baseRad !== undefined ? state.frozenReference_A_baseRad : null;
    frozenReference_D_du = state.frozenReference_D_du !== undefined ? state.frozenReference_D_du : null;
    frozenReference_Origin_Data = state.frozenReference_Origin_Data !== undefined ? state.frozenReference_Origin_Data : null;
    frozenReference_D_g2g = state.frozenReference_D_g2g !== undefined ? state.frozenReference_D_g2g : null;
    deletedFaceIds = state.deletedFaceIds !== undefined ? new Set(state.deletedFaceIds) : new Set();
    isActionInProgress = false; isDragConfirmed = false; isRectangleSelecting = false;
    isPanningBackground = false; dragPreviewVertices = [];
    actionTargetVertex = null; currentMouseButton = -1;
    clickData = { targetId: null, type: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair';
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
    }
    const restoredState = getCurrentState();
    if (undoStack.length === 0) {
        undoStack.push(restoredState);
    }
    // REMOVE THE LINE BELOW:
    // saveStateForUndo();  <-- REMOVE THIS
}

function getCurrentState() {
    return {
        vertices: JSON.parse(JSON.stringify(allVertices)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        faces: JSON.parse(JSON.stringify(allFaces)),
        selectedVertexIds: JSON.parse(JSON.stringify(selectedVertexIds)),
        selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
        selectedFaceIds: JSON.parse(JSON.stringify(selectedFaceIds)),
        selectedCenterIds: JSON.parse(JSON.stringify(selectedCenterIds)),
        activeColorTargets: JSON.parse(JSON.stringify(activeColorTargets)),
        colorAssignments: JSON.parse(JSON.stringify(colorAssignments)),
        allColors: JSON.parse(JSON.stringify(allColors)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartVertexId: previewLineStartVertexId,
        frozenReference_A_rad, frozenReference_A_baseRad, frozenReference_D_du, frozenReference_Origin_Data,
        frozenReference_D_g2g,
        deletedFaceIds: new Set(deletedFaceIds)
    };
}

function updateFaceHierarchy() {
    // 1. Reset all hierarchy links
    allFaces.forEach(f => {
        f.parentFaceId = null;
        f.childFaceIds = [];
    });

    // 2. Prepare candidate data for efficient lookup
    const faceCandidates = allFaces.map(face => {
        const vertices = face.vertexIds.map(id => findVertexById(id));
        if (vertices.some(v => !v)) {
            return null; // Skip faces with invalid vertices
        }
        return {
            face: face,
            vertices: vertices,
            area: Math.abs(U.shoelaceArea(vertices))
        };
    }).filter(Boolean);

    // 3. Determine the direct (smallest) parent for each face
    faceCandidates.forEach(childCandidate => {
        let bestParent = null;
        let minParentArea = Infinity;

        faceCandidates.forEach(parentCandidate => {
            if (childCandidate.face.id === parentCandidate.face.id) return;
            if (parentCandidate.area <= childCandidate.area) return; // Optimization

            const childGraphVertexIds = childCandidate.face.vertexIds;
            const childGraphVertices = childGraphVertexIds.map(id => findVertexById(id));
            if (childGraphVertices.some(v => !v)) return;

            // Check if all vertices of the child's graph are contained
            const verticesAreContained = U.areVerticesContainedInPolygon(childGraphVertices, parentCandidate.vertices);
            
            if (verticesAreContained) {
                const childGraphVertexIdSet = new Set(childGraphVertexIds);
                const childGraphEdges = allEdges.filter(edge => 
                    childGraphVertexIdSet.has(edge.id1) && childGraphVertexIdSet.has(edge.id2)
                );
                
                const edgesDoIntersect = U.doGraphEdgesIntersectPolygon(childGraphEdges, parentCandidate.vertices, findVertexById);

                if (!edgesDoIntersect && parentCandidate.area < minParentArea) {
                    minParentArea = parentCandidate.area;
                    bestParent = parentCandidate.face;
                }
            }
        });

        if (bestParent) {
            childCandidate.face.parentFaceId = bestParent.id;
        }
    });

    // 4. Populate the childFaceIds arrays based on the determined parent links
    allFaces.forEach(f => {
        if (f.parentFaceId) {
            const parent = allFaces.find(p => p.id === f.parentFaceId);
            if (parent && !parent.childFaceIds.includes(f.id)) {
                parent.childFaceIds.push(f.id);
            }
        }
    });
}

function handleUndo() {
    if (undoStack.length === 0) return;
    
    
    const currentStateForRedo = getCurrentState();
    const currentSignature = {
        colorCount: allColors.length,
        firstColor: allColors[0]?.value || 'none',
        vertexCount: allVertices.length
    };
    
    redoStack.push(currentStateForRedo);
    if (redoStack.length > C.MAX_HISTORY_SIZE) redoStack.shift();
    
    const prevState = undoStack.pop();
    
    restoreState(prevState);
    
    const restoredSignature = {
        colorCount: allColors.length,
        firstColor: allColors[0]?.value || 'none',
        vertexCount: allVertices.length
    };
}

function handleRedo() {
    if (redoStack.length === 0) return;
    const currentStateForUndo = getCurrentState();
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
    const potentialFaces = [];

    // Find all visible faces whose outer boundary contains the point
    for (const face of allFaces) {
        if (face.color === 'transparent') continue;

        const vertices = face.vertexIds.map(id => findVertexById(id)).filter(p => p && p.type === 'regular');
        if (vertices.length < 3) continue;

        if (U.isVertexInPolygon(dataPos, vertices)) {
            potentialFaces.push(face);
        }
    }

    if (potentialFaces.length === 0) {
        return null;
    }

    // Find the smallest valid face that contains the point
    let smallestValidFace = null;
    let smallestArea = Infinity;

    for (const potentialFace of potentialFaces) {
        let isInsideHole = false;
        if (potentialFace.childFaceIds && potentialFace.childFaceIds.length > 0) {
            for (const childId of potentialFace.childFaceIds) {
                const childFace = allFaces.find(f => f.id === childId);
                // A hole is a child face that is marked transparent
                if (childFace && childFace.color === 'transparent') {
                    const childVertices = childFace.vertexIds.map(id => findVertexById(id)).filter(Boolean);
                    if (childVertices.length >= 3 && U.isVertexInPolygon(dataPos, childVertices)) {
                        isInsideHole = true;
                        break;
                    }
                }
            }
        }

        if (!isInsideHole) {
            const vertices = potentialFace.vertexIds.map(id => findVertexById(id));
            if (vertices.every(Boolean)) {
                 const faceArea = Math.abs(U.shoelaceArea(vertices));
                if (faceArea < smallestArea) {
                    smallestArea = faceArea;
                    smallestValidFace = potentialFace;
                }
            }
        }
    }

    return smallestValidFace;
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

    clipboard.faces = facesToCopy.map(f => JSON.parse(JSON.stringify(f)));
    clipboard.referenceVertex = screenToData(mousePos);
}

function handlePaste() {
    if (clipboard.vertices.length === 0 || !clipboard.referenceVertex) return;
    saveStateForUndo();

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
        if (newP1Id && newP2Id) {
            allEdges.push({ ...cbEdge, id1: newP1Id, id2: newP2Id });
        }
    });

    const newPastedFaceIds = [];
    clipboard.faces.forEach(cbFace => {
        const newVertexIds = cbFace.vertexIds.map(id => oldToNewIdMap.get(id)).filter(Boolean);
        if (newVertexIds.length === cbFace.vertexIds.length) {
            const newFace = {
                ...cbFace,
                id: U.getFaceId({ vertexIds: newVertexIds }),
                vertexIds: newVertexIds,
            };

            if (newFace.localCoordSystem) {
                // Translate the origin
                newFace.localCoordSystem.origin.x += deltaX;
                newFace.localCoordSystem.origin.y += deltaY;

                // Remap vertex/edge IDs within the coordinate system's constraints
                if (newFace.localCoordSystem.attachedToVertex) {
                    newFace.localCoordSystem.attachedToVertex = oldToNewIdMap.get(newFace.localCoordSystem.attachedToVertex);
                }
                if (newFace.localCoordSystem.attachedToEdge) {
                    newFace.localCoordSystem.attachedToEdge.v1 = oldToNewIdMap.get(newFace.localCoordSystem.attachedToEdge.v1);
                    newFace.localCoordSystem.attachedToEdge.v2 = oldToNewIdMap.get(newFace.localCoordSystem.attachedToEdge.v2);
                }
                if (newFace.localCoordSystem.rotationAlignedToEdge) {
                    newFace.localCoordSystem.rotationAlignedToEdge.v1 = oldToNewIdMap.get(newFace.localCoordSystem.rotationAlignedToEdge.v1);
                    newFace.localCoordSystem.rotationAlignedToEdge.v2 = oldToNewIdMap.get(newFace.localCoordSystem.rotationAlignedToEdge.v2);
                }
                if (newFace.localCoordSystem.scaleAttachedToEdge) {
                    newFace.localCoordSystem.scaleAttachedToEdge.v1 = oldToNewIdMap.get(newFace.localCoordSystem.scaleAttachedToEdge.v1);
                    newFace.localCoordSystem.scaleAttachedToEdge.v2 = oldToNewIdMap.get(newFace.localCoordSystem.scaleAttachedToEdge.v2);
                }
            }
            newFace.parentFaceId = null;
            newFace.childFaceIds = [];
            allFaces.push(newFace);
            newPastedFaceIds.push(newFace.id);
        }
    });
    ensureFaceCoordinateSystems();

    // Select the newly pasted geometry
    selectedVertexIds = newPastedRegularVertexIds;
    selectedEdgeIds = clipboard.edges.map(e => U.getEdgeId({ id1: oldToNewIdMap.get(e.id1), id2: oldToNewIdMap.get(e.id2) }));
    selectedFaceIds = newPastedFaceIds;
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

    if (faceIdsToExplicitlyDelete.size > 0) {
        const facesToRemoveCompletely = new Set();
        
        allFaces.forEach(face => {
            const faceId = face.id || U.getFaceId(face);
            if (faceIdsToExplicitlyDelete.has(faceId)) {
                // Liberate any children of this face
                if (face.childFaceIds && face.childFaceIds.length > 0) {
                    face.childFaceIds.forEach(childId => {
                        const childFace = allFaces.find(f => f.id === childId);
                        if (childFace) {
                            childFace.parentFaceId = null;
                        }
                    });
                }

                // If the face is itself a child, it becomes a hole. Otherwise, it gets deleted.
                if (face.parentFaceId) {
                    face.color = 'transparent';
                } else {
                    facesToRemoveCompletely.add(faceId);
                }
            }
        });

        if (facesToRemoveCompletely.size > 0) {
            allFaces = allFaces.filter(face => !facesToRemoveCompletely.has(face.id || U.getFaceId(face)));
        }
    }

    const edgesBefore = [...allEdges];

    if (edgeIdsToDelete.size > 0) {
        allEdges = allEdges.filter(edge => !edgeIdsToDelete.has(U.getEdgeId(edge)));
    }
    if (vertexIdsToDelete.size > 0) {
        const edgesBefore = JSON.parse(JSON.stringify(allEdges));
        const newEdgesToAdd = [];
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        
        const remainingToDelete = new Set(vertexIdsToDelete);

        // Process all selected vertices, handling each connected component (chain) separately.
        while (remainingToDelete.size > 0) {
            const startId = remainingToDelete.values().next().value;
            const component = new Set();
            const queue = [startId];
            
            // 1. Find the full connected component (chain) within the selection
            while (queue.length > 0) {
                const currentId = queue.shift();
                if (remainingToDelete.has(currentId)) {
                    component.add(currentId);
                    remainingToDelete.delete(currentId);
                    const neighbors = U.findNeighbors(currentId, allEdges);
                    neighbors.forEach(neighborId => {
                        if (remainingToDelete.has(neighborId)) {
                            queue.push(neighborId);
                        }
                    });
                }
            }

            // 2. Find the "outermost" neighbors for this specific component
            const boundaryEdges = allEdges.filter(e => 
                (component.has(e.id1) && !component.has(e.id2)) ||
                (component.has(e.id2) && !component.has(e.id1))
            );
            const outermostNeighbors = new Set();
            boundaryEdges.forEach(e => {
                if (!component.has(e.id1)) outermostNeighbors.add(e.id1);
                if (!component.has(e.id2)) outermostNeighbors.add(e.id2);
            });

            // 3. If there are exactly two, prepare a new edge to connect them
            const neighborsToConnect = Array.from(outermostNeighbors);
            if (neighborsToConnect.length === 2) {
                const [id1, id2] = neighborsToConnect;
                const v1 = findVertexById(id1);
                const v2 = findVertexById(id2);
                const edgeExists = allEdges.some(e => (e.id1 === id1 && e.id2 === id2) || (e.id1 === id2 && e.id2 === id1));
                if (v1 && v2 && !edgeExists) {
                    newEdgesToAdd.push(U.createEdge(v1, v2, gridInterval, getColorForTarget));
                }
            }
        }

        // 4. Now, perform the original deletion of ALL selected vertices and their connected edges
        allVertices = allVertices.filter(p => !vertexIdsToDelete.has(p.id));
        allEdges = allEdges.filter(e => !vertexIdsToDelete.has(e.id1) && !vertexIdsToDelete.has(e.id2));

        // 5. Finally, add all the new connecting edges
        if (newEdgesToAdd.length > 0) {
            allEdges.push(...newEdgesToAdd);
            updateFaces(edgesBefore, allEdges);
            ensureFaceCoordinateSystems();
        }
    }

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
    if (newScale > C.MAX_SCALE_VALUE) {
        newScale = C.MAX_SCALE_VALUE;
    }

    const effectiveScaleFactor = newScale / viewTransform.scale;

    const mouseX_physical = zoomCenterScreen_css_pixels.x * dpr;
    const mouseY_physical = zoomCenterScreen_css_pixels.y * dpr;

    viewTransform.offsetX = mouseX_physical * (1 - effectiveScaleFactor) + viewTransform.offsetX * effectiveScaleFactor;
    viewTransform.offsetY = (canvas.height - mouseY_physical) * (1 - effectiveScaleFactor) + viewTransform.offsetY * effectiveScaleFactor;

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



function getDescendantVertices(faceId, allFaces) {
    const descendantVertices = new Set();
    const queue = [faceId];
    const visitedFaceIds = new Set([faceId]);

    while (queue.length > 0) {
        const currentFaceId = queue.shift();
        const currentFace = allFaces.find(f => f.id === currentFaceId);

        if (currentFace) {
            currentFace.vertexIds.forEach(vId => descendantVertices.add(vId));
            
            if (currentFace.childFaceIds) {
                currentFace.childFaceIds.forEach(childId => {
                    if (!visitedFaceIds.has(childId)) {
                        visitedFaceIds.add(childId);
                        queue.push(childId);
                    }
                });
            }
        }
    }
    return Array.from(descendantVertices);
}

function completeGraphOnSelectedVertices() {
    const regularVertexIds = selectedVertexIds.filter(id => {
        const vertex = findVertexById(id);
        return vertex && vertex.type === 'regular';
    });

    if (regularVertexIds.length < 2) return;

    saveStateForUndo();

    const edgesBefore = JSON.parse(JSON.stringify(allEdges));
    let edgesWereAdded = false;
    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    for (let i = 0; i < regularVertexIds.length; i++) {
        for (let j = i + 1; j < regularVertexIds.length; j++) {
            const id1 = regularVertexIds[i];
            const id2 = regularVertexIds[j];

            const edgeExists = allEdges.some(edge =>
                (edge.id1 === id1 && edge.id2 === id2) ||
                (edge.id1 === id2 && edge.id2 === id1)
            );

            if (!edgeExists) {
                const v1 = findVertexById(id1);
                const v2 = findVertexById(id2);
                if (v1 && v2) {
                    const newEdge = U.createEdge(v1, v2, gridInterval, getColorForTarget);
                    allEdges.push(newEdge);
                    edgesWereAdded = true;
                }
            }
        }
    }

    if (edgesWereAdded && facesVisible) {
        updateFaces(edgesBefore, allEdges);
        
        allFaces.forEach(face => {
            if (!face.color) {
                face.color = getColorForTarget(C.COLOR_TARGET_FACE);
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



function initializeApp() {
    setupUndoStackDebugging();
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

    const colorEditorElement = colorEditor.getElement();
    colorEditorElement.addEventListener('mouseenter', () => {
        isMouseOverColorEditor = true;
    });
    colorEditorElement.addEventListener('mouseleave', () => {
        isMouseOverColorEditor = false;
    });

    colorEditor.getElement().addEventListener('select', (e) => {
        const colormapData = e.detail;
        const newItem = U.convertColorToColormapFormat(colormapData);

        if (!newItem) return;

        if (isEditingColor && editingColorIndex !== null) {
            allColors[editingColorIndex] = newItem;
        } else {
            addToColors(newItem);
            const newColorIndex = allColors.length - 1;
            activeColorTargets.forEach(target => {
                colorAssignments[target] = newColorIndex;
            });
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

    contextMenu = document.getElementById('context-menu');
    window.addEventListener('click', () => {
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
    });
    contextMenu.addEventListener('mouseleave', () => {
        contextMenu.style.display = 'none';
    });

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
    } else if (centerType === C.TRANSFORMATION_TYPE_ROTATE_SCALE) {
        rotation = U.calculateRotationAngle(startAngle, currentAngle, currentAccumulatedRotation);
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

function updateFaces(edgesBefore, edgesAfter) {
    if (!facesVisible) {
        allFaces = [];
        deletedFaceIds.clear();
        return;
    }

    const edgesBeforeSet = new Set(edgesBefore.map(e => U.getEdgeId(e)));
    const edgesAfterSet = new Set(edgesAfter.map(e => U.getEdgeId(e)));
    
    const addedEdges = edgesAfter.filter(e => !edgesBeforeSet.has(U.getEdgeId(e)));
    const removedEdges = edgesBefore.filter(e => !edgesAfterSet.has(U.getEdgeId(e)));

    if (addedEdges.length === 0 && removedEdges.length === 0) {
        return;
    }

    const dirtyVertices = new Set();
    addedEdges.forEach(e => { dirtyVertices.add(e.id1); dirtyVertices.add(e.id2); });
    removedEdges.forEach(e => { dirtyVertices.add(e.id1); dirtyVertices.add(e.id2); });
    
    const affectedComponentVertices = new Set();
    const processedStartNodes = new Set();
    for (const startId of dirtyVertices) {
        if (!processedStartNodes.has(startId)) {
            const component = findAllVerticesInSubgraph(startId);
            component.forEach(vId => {
                affectedComponentVertices.add(vId);
                processedStartNodes.add(vId);
            });
        }
    }

    const affectedEdges = allEdges.filter(e => affectedComponentVertices.has(e.id1) && affectedComponentVertices.has(e.id2));
    const oldFacesInComponent = allFaces.filter(face =>
        face.vertexIds.every(vId => affectedComponentVertices.has(vId))
    );
    const oldFaceIds = new Set(oldFacesInComponent.map(f => f.id));

    const correctFacesForComponent = U.detectClosedPolygons(affectedEdges, findVertexById);
    const correctFaceIds = new Set(correctFacesForComponent.map(f => f.id));

    // Remove all old faces within the affected component
    const oldFaceIdsToRemove = new Set(oldFacesInComponent.map(f => f.id));
    allFaces = allFaces.filter(f => !oldFaceIdsToRemove.has(f.id));

    // Add all newly detected minimal faces for that component
    const facesToAdd = correctFacesForComponent;
    const addedEdgeIds = new Set(addedEdges.map(e => U.getEdgeId(e)));

    facesToAdd.forEach(newFace => {
        let isFormedByNewEdge = false;
        if (addedEdges.length > 0) {
            for (let i = 0; i < newFace.vertexIds.length; i++) {
                const p1 = newFace.vertexIds[i];
                const p2 = newFace.vertexIds[(i + 1) % newFace.vertexIds.length];
                const faceEdgeId = U.getEdgeId({ id1: p1, id2: p2 });
                if (addedEdgeIds.has(faceEdgeId)) {
                    isFormedByNewEdge = true;
                    break;
                }
            }
        }
        
        if (deletedFaceIds.has(newFace.id)) {
            if (isFormedByNewEdge) {
                deletedFaceIds.delete(newFace.id);
            } else {
                return;
            }
        }
        
        const colorIndex = colorAssignments[C.COLOR_TARGET_FACE];
        if (colorIndex !== -1) {
            const colorItem = allColors[colorIndex];
            if (colorItem && colorItem.type === 'colormap') {
                newFace.colormapItem = colorItem;
                newFace.colormapDistribution = 'x';
                delete newFace.color;
            } else {
                newFace.color = getColorForTarget(C.COLOR_TARGET_FACE);
                delete newFace.colormapItem;
                delete newFace.colormapDistribution;
            }
        } else {
            newFace.color = getColorForTarget(C.COLOR_TARGET_FACE);
            delete newFace.colormapItem;
            delete newFace.colormapDistribution;
        }
        
        newFace.parentFaceId = null;
        newFace.childFaceIds = [];
        allFaces.push(newFace);
    });

    ensureFaceCoordinateSystems();
}

function insertVertexOnEdgeWithFaces(targetEdge, insertionVertex, gridInterval, getColorForTarget) {
    const p1 = findVertexById(targetEdge.id1);
    const p2 = findVertexById(targetEdge.id2);

    if (!p1 || !p2) return null;

    const edgesBefore = [...allEdges];

    const newVertex = {
        id: U.generateUniqueId(),
        x: insertionVertex.x,
        y: insertionVertex.y,
        type: 'regular',
        color: getColorForTarget(C.COLOR_TARGET_VERTEX)
    };

    allVertices.push(newVertex);

    allEdges = allEdges.filter(e => U.getEdgeId(e) !== U.getEdgeId(targetEdge));

    allEdges.push(U.createEdge(p1, newVertex, gridInterval, getColorForTarget));
    allEdges.push(U.createEdge(newVertex, p2, gridInterval, getColorForTarget));

    if (facesVisible) {
        updateFaces(edgesBefore, allEdges);
    }

    return newVertex;
}

function getBestRotateScaleSnap(center, initialVertexStates, handleVertex, rawRotation, rawScale) {
    const mouseDataPos = U.applyTransformToVertex(handleVertex, center, rawRotation, rawScale, false, null);
    const startVector = { x: handleVertex.x - center.x, y: handleVertex.y - center.y };
    const validSnaps = [];
    const snapRadius = C.MERGE_RADIUS_SCREEN / viewTransform.scale;

    const verticesToTransform = initialVertexStates.filter(p => p.type === 'regular');
    if (verticesToTransform.length === 0) {
        return { rotation: rawRotation, scale: rawScale, pos: mouseDataPos, snapped: false };
    }

    let maxInitialDist = 0;
    for (let i = 0; i < verticesToTransform.length; i++) {
        for (let j = i + 1; j < verticesToTransform.length; j++) {
            maxInitialDist = Math.max(maxInitialDist, U.distance(verticesToTransform[i], verticesToTransform[j]));
        }
    }
    const relativeSnapThreshold = maxInitialDist > C.GEOMETRY_CALCULATION_EPSILON ? maxInitialDist * 2.0 : snapRadius * 10;

    const draggedIds = new Set(verticesToTransform.map(v => v.id));
    const staticVertices = allVertices.filter(p => p.type === 'regular' && !draggedIds.has(p.id));
    const copyCount = parseInt(copyCountInput || '1', 10) || 1;

    // Check snaps for all potential copies, from T^1 up to T^copyCount
    for (let i = 1; i <= copyCount; i++) {
        // --- Snap dragged copy vertices to STATIC vertices ---
        // This loop checks every copied vertex against every standalone vertex in the scene.
        verticesToTransform.forEach(p_source => {
            staticVertices.forEach(p_target => {
                const v_source = { x: p_source.x - center.x, y: p_source.y - center.y };
                const v_target = { x: p_target.x - center.x, y: p_target.y - center.y };
                const r_source = Math.hypot(v_source.x, v_source.y);
                const r_target = Math.hypot(v_target.x, v_target.y);

                if (r_source > C.GEOMETRY_CALCULATION_EPSILON) {
                    const snap_scale = Math.pow(r_target / r_source, 1 / i);
                    let target_angle = Math.atan2(v_target.y, v_target.x) - Math.atan2(v_source.y, v_source.x);
                    const num_revs = Math.round((rawRotation * i - target_angle) / (2 * Math.PI));
                    target_angle += num_revs * 2 * Math.PI;
                    const snap_rotation = target_angle / i;

                    const handleAtSnapPos = U.applyTransformToVertex(handleVertex, center, snap_rotation, snap_scale, false, startVector);
                    const snapDist = U.distance(mouseDataPos, handleAtSnapPos);
                    
                    if (snapDist < snapRadius) {
                        validSnaps.push({ priority: 1, dist: snapDist, rotation: snap_rotation, scale: snap_scale, pos: handleAtSnapPos, snappedScaleValue: snap_scale });
                    }
                }
            });
        });

        // --- Snap dragged copy vertices to OTHER dragged copy vertices ---
        if (copyCount > 1) {
            for (let j = 1; j <= copyCount; j++) {
                if (i === j) continue;
                verticesToTransform.forEach(p1_orig => {
                    verticesToTransform.forEach(p2_orig => {
                        if (p1_orig.id === p2_orig.id) return;
                        // Pre-filter: only snap vertices that were initially close within the copied group
                        if (U.distance(p1_orig, p2_orig) > relativeSnapThreshold) return;
                        
                        const v1 = { x: p1_orig.x - center.x, y: p1_orig.y - center.y };
                        const v2 = { x: p2_orig.x - center.x, y: p2_orig.y - center.y };
                        const r1 = Math.hypot(v1.x, v1.y);
                        const r2 = Math.hypot(v2.x, v2.y);
                        
                        if (r1 > C.GEOMETRY_CALCULATION_EPSILON && Math.abs(i-j) > 0) {
                            const scale_ratio = r2/r1;
                            const snap_scale = Math.pow(scale_ratio, 1/(j-i));

                            const angle1 = Math.atan2(v1.y,v1.x);
                            const angle2 = Math.atan2(v2.y,v2.x);
                            let target_angle_diff = angle2 - angle1;
                            const num_revs = Math.round((rawRotation * (j - i) - target_angle_diff) / (2 * Math.PI));
                            target_angle_diff += num_revs * 2 * Math.PI;
                            const snap_rotation = target_angle_diff / (j - i);

                            const handleAtSnapPos = U.applyTransformToVertex(handleVertex, center, snap_rotation, snap_scale, false, startVector);
                            const snapDist = U.distance(mouseDataPos, handleAtSnapPos);

                            if(snapDist < snapRadius){
                                validSnaps.push({ priority: 1, dist: snapDist, rotation: snap_rotation, scale: snap_scale, pos: handleAtSnapPos, snappedScaleValue: snap_scale });
                            }
                        }
                    });
                });
            }
        }
    }
    
    // --- Geometric Snapping (for Shift key) ---
    if (currentShiftPressed) {
        C.NINETY_DEG_ANGLE_SNAP_FRACTIONS.forEach(f => {
            const snapAngleTurn = f * Math.PI / 2;
            [snapAngleTurn, -snapAngleTurn].forEach(turn => {
                if (Math.abs(U.normalizeAngleToPi(rawRotation - turn)) < C.ANGLE_SNAP_THRESHOLD_RAD) {
                    const handleAtSnapPos = U.applyTransformToVertex(handleVertex, center, turn, rawScale, false, startVector);
                    validSnaps.push({ priority: 2, dist: U.distance(mouseDataPos, handleAtSnapPos), rotation: turn, scale: rawScale, pos: handleAtSnapPos, snappedScaleValue: null });
                }
            });
        });
        
        if (Math.hypot(startVector.x, startVector.y) > C.GEOMETRY_CALCULATION_EPSILON) {
            C.SNAP_FACTORS.forEach(factor => {
                if (factor > 0 && Math.abs(rawScale - factor) < C.SCALE_SNAP_THRESHOLD) {
                    const handleAtSnapPos = U.applyTransformToVertex(handleVertex, center, rawRotation, factor, false, startVector);
                    validSnaps.push({ priority: 2, dist: U.distance(mouseDataPos, handleAtSnapPos), rotation: rawRotation, scale: factor, pos: handleAtSnapPos, snappedScaleValue: factor });
                }
            });
        }
    }

    if (validSnaps.length === 0) {
        return { rotation: rawRotation, scale: rawScale, pos: mouseDataPos, snapped: false };
    }

    validSnaps.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.dist - b.dist;
    });
    
    const bestSnap = validSnaps[0];

    if (bestSnap.dist < snapRadius) {
        return { ...bestSnap, snapped: true, snapType: bestSnap.priority === 1 ? 'merge' : 'geometric' };
    }

    return { rotation: rawRotation, scale: rawScale, pos: mouseDataPos, snapped: false };
}

function getBestTranslationSnap(initialDragVertexStates, rawDelta, copyCount) {
    const snapStickinessData = C.MERGE_RADIUS_SCREEN / viewTransform.scale;
    if (initialDragVertexStates.length === 0) {
        return { delta: rawDelta, snapped: false };
    }

    const handleVertex = initialDragVertexStates[0];
    const mouseHandlePos = { x: handleVertex.x + rawDelta.x, y: handleVertex.y + rawDelta.y };
    const allPossibleSnaps = [];

    const verticesToDrag = initialDragVertexStates.filter(p => p.type === 'regular');
    const staticVertices = allVertices.filter(p => p.type === 'regular' && !initialDragVertexStates.some(ip => ip.id === p.id));
    const multipliers = copyCount === 1 ? [1] : Array.from({ length: copyCount }, (_, k) => k);

    if (verticesToDrag.length > 0) {
        multipliers.forEach(k => {
            if (k === 0) return;
            verticesToDrag.forEach(p_orig => {
                staticVertices.forEach(p_target => {
                    allPossibleSnaps.push({ delta: { x: (p_target.x - p_orig.x) / k, y: (p_target.y - p_orig.y) / k }, type: 'vertex' });
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
                                allPossibleSnaps.push({ delta: { x: (p2_orig.x - p1_orig.x) / denominator, y: (p2_orig.y - p1_orig.y) / denominator }, type: 'vertex' });
                            }
                        });
                    });
                });
            });
        }
    }

    const staticEdges = allEdges.filter(edge => !initialDragVertexStates.some(ip => ip.id === edge.id1) && !initialDragVertexStates.some(ip => ip.id === edge.id2));
    if (copyCount === 1) { 
        verticesToDrag.forEach(p_orig => {
            const p_dragged_raw = { x: p_orig.x + rawDelta.x, y: p_orig.y + rawDelta.y };
            staticEdges.forEach(edge => {
                const e1 = findVertexById(edge.id1);
                const e2 = findVertexById(edge.id2);
                if (e1 && e2) {
                    const closest = U.getClosestPointOnLineSegment(p_dragged_raw, e1, e2);
                    if (closest.distance < snapStickinessData && closest.onSegmentStrict) {
                        const requiredDelta = { x: closest.x - p_orig.x, y: closest.y - p_orig.y };
                        allPossibleSnaps.push({ delta: requiredDelta, type: 'edge' });
                    }
                }
            });
        });
    }

    if (allPossibleSnaps.length === 0) {
        return { delta: rawDelta, snapped: false };
    }

    let bestSnap = null;
    let minSnapDist = Infinity;

    allPossibleSnaps.forEach(snap => {
        const handleAtSnapPos = { x: handleVertex.x + snap.delta.x, y: handleVertex.y + snap.delta.y };
        const dist = U.distance(mouseHandlePos, handleAtSnapPos);

        if (dist < minSnapDist) {
            minSnapDist = dist;
            bestSnap = snap;
        }
    });

    if (bestSnap && minSnapDist < snapStickinessData) {
        return { delta: bestSnap.delta, snapped: true, snapType: bestSnap.type };
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

    if (Math.abs(rawScale - 1.0) < C.SCALE_SNAP_THRESHOLD) {
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

        if (bestSnap.priority < C.TRANSFORM_SCALE_SNAP_PRIORITY_THRESHOLD) {
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

function getBestDirectionalScaleSnap(center, initialVertexStates, handleVertex, rawScale, startVector, mouseCursorDataPos) {
    const copyCount = parseInt(copyCountInput || '1', 10);
    let allPossibleSnaps = [];
    const snapRadius = C.MERGE_RADIUS_SCREEN / viewTransform.scale;

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

    const staticVertices = allVertices.filter(p => p.type === 'regular' && !initialVertexStates.some(ip => ip.id === p.id));
    const verticesToTransform = initialVertexStates.filter(p => p.type === 'regular');
    const mouseDataPos = U.applyTransformToVertex(handleVertex, center, 0, rawScale, true, startVector);

    const addSnapCandidate = (scale) => {
        const handleAtSnapPos = U.applyTransformToVertex(handleVertex, center, 0, scale, true, startVector);
        const snapDist = U.distance(mouseDataPos, handleAtSnapPos);
        allPossibleSnaps.push({ scale: scale, dist: snapDist, snapType: 'vertex', priority: 1 });
    };

    if (copyCount > 1) {
        let maxInitialDist = 0;
        for (let i = 0; i < verticesToTransform.length; i++) {
            for (let j = i + 1; j < verticesToTransform.length; j++) {
                maxInitialDist = Math.max(maxInitialDist, U.distance(verticesToTransform[i], verticesToTransform[j]));
            }
        }
        const relativeSnapThreshold = maxInitialDist > C.GEOMETRY_CALCULATION_EPSILON ? maxInitialDist * 2.0 : snapRadius * 10;
        
        const allIndices = [0, ...Array.from({ length: copyCount }, (_, k) => k + 1)];

        for (const i of allIndices) {
            for (const j of allIndices) {
                if (i <= j) continue;
                verticesToTransform.forEach(p1_orig => {
                    verticesToTransform.forEach(p2_orig => {
                        if (p1_orig.id === p2_orig.id && i === j) return;
                        if (U.distance(p1_orig, p2_orig) > relativeSnapThreshold) return;

                        const proj1 = getProjectedComponents(p1_orig);
                        const proj2 = getProjectedComponents(p2_orig);

                        if (U.distance(proj1.perp_vec, proj2.perp_vec) < snapRadius) {
                            const p1_para = (i === 0) ? proj1.parallel_dist : proj1.parallel_dist;
                            const p2_para = (j === 0) ? proj2.parallel_dist : proj2.parallel_dist;
                            const delta_c = i - j;
                            
                            if (Math.abs(delta_c) > 0 && Math.abs(p1_para) > C.GEOMETRY_CALCULATION_EPSILON) {
                                const ratio = p2_para / p1_para;
                                if (ratio >= 0) {
                                    const scale = Math.pow(ratio, 1 / delta_c);
                                    addSnapCandidate(scale);
                                    if (delta_c % 2 === 0) { // Even root has a negative solution
                                        addSnapCandidate(-scale);
                                    }
                                } else { // ratio < 0
                                    if (delta_c % 2 !== 0) { // Odd root of a negative number
                                        const scale = -Math.pow(Math.abs(ratio), 1 / delta_c);
                                        addSnapCandidate(scale);
                                    }
                                }
                            }
                        }
                    });
                });
            }
        }
    }

    if (currentShiftPressed) {
        const geometricSnaps = [];
        const scaleSnapFactors = [...C.SNAP_FACTORS.filter(f => f !== 0), 0];
        for (const factor of scaleSnapFactors) {
            geometricSnaps.push({ scale: factor, dist: Math.abs(rawScale - factor) });
            if (factor !== 0) {
                geometricSnaps.push({ scale: -factor, dist: Math.abs(rawScale - (-factor)) });
            }
        }
        if (geometricSnaps.length > 0) {
            const bestGeometricSnap = geometricSnaps.reduce((a, b) => a.dist < b.dist ? a : b);
            allPossibleSnaps.push({ ...bestGeometricSnap, snapType: 'geometric', priority: 2 });
        }

        const projectionSnaps = [];
        if (lastGridState && mouseCursorDataPos) {
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (gridInterval) {
                const gridCandidates = U.getGridSnapCandidates(mouseCursorDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true);
                const nearbyVertices = staticVertices.filter(vertex => U.distance(vertex, mouseCursorDataPos) <= gridInterval);
                const allCandidates = [...gridCandidates, ...nearbyVertices];
                if (allCandidates.length > 0) {
                    const bestCandidate = allCandidates.reduce((best, current) => {
                        return U.distance(mouseCursorDataPos, current) < U.distance(mouseCursorDataPos, best) ? current : best;
                    });
                    const { parallel_dist: candidateParallel } = getProjectedComponents(bestCandidate);
                    const { parallel_dist: handleParallel } = getProjectedComponents(handleVertex);
                    if (Math.abs(handleParallel) > C.GEOMETRY_CALCULATION_EPSILON) {
                        const requiredScale = candidateParallel / handleParallel;
                        const distToCursor = U.distance(mouseCursorDataPos, bestCandidate);
                        if (distToCursor < snapRadius) {
                            projectionSnaps.push({
                                scale: requiredScale, dist: distToCursor, snapType: 'projection', priority: 1,
                                gridPoint: gridCandidates.includes(bestCandidate) ? bestCandidate : null,
                                nearbyVertex: nearbyVertices.includes(bestCandidate) ? bestCandidate : null,
                                projectionPoint: { x: center.x + candidateParallel * axis_norm.x, y: center.y + candidateParallel * axis_norm.y }
                            });
                        }
                    }
                }
            }
        }
        if (projectionSnaps.length > 0) {
            allPossibleSnaps.push(projectionSnaps.reduce((a, b) => a.dist < b.dist ? a : b));
        }
    } else {
        verticesToTransform.forEach(p_source => {
            staticVertices.forEach(p_target => {
                const proj_source = getProjectedComponents(p_source);
                const proj_target = getProjectedComponents(p_target);
                if (U.distance(proj_source.perp_vec, proj_target.perp_vec) < snapRadius) {
                    if (Math.abs(proj_source.parallel_dist) > C.GEOMETRY_CALCULATION_EPSILON) {
                        const snap_scale = proj_target.parallel_dist / proj_source.parallel_dist;
                        const handleAtSnapPos = U.applyTransformToVertex(handleVertex, center, 0, snap_scale, true, startVector);
                        if (U.distance(mouseDataPos, handleAtSnapPos) < snapRadius) {
                            allPossibleSnaps.push({ scale: snap_scale, dist: U.distance(mouseDataPos, handleAtSnapPos), snapType: 'vertex' });
                        }
                    }
                }
            });
        });
    }

    if (allPossibleSnaps.length === 0) {
        return { scale: rawScale, pos: mouseDataPos, snapped: false, snapType: null };
    }
    
    allPossibleSnaps.sort((a, b) => {
        const aPrio = a.priority || 10;
        const bPrio = b.priority || 10;
        if (aPrio !== bPrio) return aPrio - bPrio;
        return a.dist - b.dist;
    });
    
    const bestSnap = allPossibleSnaps[0];
    
    if (bestSnap && (currentShiftPressed || bestSnap.dist < snapRadius)) {
        const finalPos = U.applyTransformToVertex(handleVertex, center, 0, bestSnap.scale, true, startVector);
        return {
            scale: bestSnap.scale, pos: finalPos, snapped: true, snapType: bestSnap.snapType,
            snappedScaleValue: bestSnap.scale, gridPoint: bestSnap.gridPoint || null,
            nearbyVertex: bestSnap.nearbyVertex || null, projectionPoint: bestSnap.projectionPoint || null
        };
    }
    
    return { scale: rawScale, pos: mouseDataPos, snapped: false, snapType: null };
}

function redrawAll() {
    labelsToKeepThisFrame.clear();
    let axisFormatInfo = { useScientific: false };
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
        axisFormatInfo = R.drawAxes(ctx, htmlOverlay, stateForAxes, dataToScreen, screenToData, lastGridState, lastAngularGridState, updateHtmlLabel);
    }

    if (facesVisible && allVertices.length > 0) {
        R.drawFaces(ctx, {
            allFaces,
            facesVisible,
            isDragConfirmed,
            dragPreviewVertices,
            transformIndicatorData,
            initialDragVertexStates,
            colors,
            initialCoordSystemStates
        }, dataToScreen, findVertexById);
    }

    const copyCount = parseInt(copyCountInput || '1', 10);
    const isCopyPreviewActive = copyCount > 1 && isDragConfirmed && initialDragVertexStates.length > 0 && initialDragVertexStates.some(p => p.type === 'regular');

    const edgesWithHover = hoveredEdgeId ? [...selectedEdgeIds, hoveredEdgeId] : selectedEdgeIds;
    const stateForEdges = { allEdges, selectedEdgeIds: edgesWithHover, isDragConfirmed, dragPreviewVertices, colors, edgesVisible };
    R.drawAllEdges(ctx, stateForEdges, dataToScreen, findVertexById, U.getEdgeId);

    const originalDraggedVertexIds = isCopyPreviewActive
        ? new Set(initialDragVertexStates.map(v => v.id))
        : new Set();

    allVertices.forEach(vertex => {
        // When doing a multi-copy drag, skip rendering any vertex that is part of the initial selection.
        // The drawCopyPreviews function is now responsible for drawing all copies (T^0, T^1, T^2...).
        if (isCopyPreviewActive && originalDraggedVertexIds.has(vertex.id)) {
            return;
        }

        // This logic now only runs for static vertices OR vertices in a non-copy drag.
        let vertexToDraw = { ...vertex };
        if (isDragConfirmed && dragPreviewVertices.length > 0) {
            const preview = dragPreviewVertices.find(dp => dp.id === vertex.id);
            if (preview) vertexToDraw = { ...preview };
        }
        R.drawVertex(ctx, vertexToDraw, { 
            selectedVertexIds, 
            selectedCenterIds, 
            activeCenterId, 
            colors, 
            verticesVisible, 
            isHovered: hoveredVertexId === vertex.id 
        }, dataToScreen, updateHtmlLabel);
    });

    if (isCopyPreviewActive) {
        R.drawCopyPreviews(ctx, { 
            copyCount, 
            isDragConfirmed, 
            initialDragVertexStates, 
            dragPreviewVertices, 
            transformIndicatorData, 
            allEdges, 
            allFaces,
            findVertexById, 
            findNeighbors: (id) => U.findNeighbors(id, allEdges), 
            colors 
        }, dataToScreen);
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
                colors, 
                isDragConfirmed, 
                dragPreviewVertices, 
                initialDragVertexStates, 
                transformIndicatorData, 
                highlightedEdgeForSnap, 
                draggedFaceId, 
                coordSystemSnapAngle, 
                coordSystemSnapType,
                coordSystemSnapScale,
                initialCoordSystemStates
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
                R.drawSelectedEdgeDistances(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showDistances, distanceSigFigs, colors, lastGridState, currentShiftPressed }, findVertexById, U.getEdgeId, dataToScreen, updateHtmlLabel, dragPreviewVertices, initialDragVertexStates, transformIndicatorData);
            }
        }
    } else if ((showDistances || showAngles) && !isDrawingMode && !isCopyPreviewActive && !isPlacingTransform) {
        if (selectedVertexIds.length > 0 && selectedVertexIds.length <= C.MAX_VERTICES_FOR_ANGLES) {
            selectedVertexIds.forEach(vertexId => {
                R.drawDragFeedback(ctx, htmlOverlay, vertexId, allVertices, { ...stateForFeedback, currentShiftPressed: false }, dataToScreen, (id) => U.findNeighbors(id, allEdges), U.getEdgeId, false, null, updateHtmlLabel, selectedVertexIds, false, [], activeCenterId);
            });
        }
        if (selectedEdgeIds.length > 0 && selectedEdgeIds.length <= C.MAX_EDGES_FOR_LABELS) {
            R.drawSelectedEdgeDistances(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showDistances, distanceSigFigs, colors, lastGridState }, findVertexById, U.getEdgeId, dataToScreen, updateHtmlLabel, dragPreviewVertices, initialDragVertexStates, transformIndicatorData);
            R.drawSelectedEdgeAngles(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showAngles, angleSigFigs, angleDisplayMode, currentShiftPressed, distanceSigFigs, viewTransform, lastGridState, colors }, findVertexById, U.getEdgeId, dataToScreen, (id) => U.findNeighbors(id, allEdges), updateHtmlLabel);
        }
    }

    if (isDrawingMode && previewLineStartVertexId) {
        const startVertex = findVertexById(previewLineStartVertexId);
        if (startVertex) {
            const currentPreviewDrawingContext = getDrawingContext(startVertex.id);
            const snappedData = getSnappedPosition(startVertex, mousePos, currentShiftPressed);
            
            let nextEdgeColor = getColorForTarget(C.COLOR_TARGET_EDGE);
            let edgeColormapInfo = null;
            const colorIndex = colorAssignments[C.COLOR_TARGET_EDGE];

            if (colorIndex !== -1) {
                const colorItem = allColors[colorIndex];
                if (colorItem && colorItem.type === 'colormap') {
                    const totalEdges = currentDrawingPath ? Math.max(currentDrawingPath.length, 1) : 1;
                    const nextEdgeIndex = currentDrawingPath ? currentDrawingPath.length - 1 : 0;
                    const startT = totalEdges > 1 ? nextEdgeIndex / totalEdges : 0;
                    const endT = totalEdges > 1 ? (nextEdgeIndex + 1) / totalEdges : 1;
                    
                    edgeColormapInfo = {
                        colormapItem: colorItem,
                        startT: startT,
                        endT: endT
                    };
                }
            }
            
            R.drawDrawingPreview(ctx, { startVertex, snappedData, isShiftPressed: currentShiftPressed, currentColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextCreationColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextEdgeColor, colors, edgeColormapInfo }, dataToScreen);
            
            const targetDataPos = { x: snappedData.x, y: snappedData.y };
            const stateForSnapInfo = { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors };
            R.prepareSnapInfoTexts(ctx, htmlOverlay, startVertex, targetDataPos, snappedData, stateForSnapInfo, dataToScreen, currentPreviewDrawingContext, updateHtmlLabel);
        }
    }

    if (isRectangleSelecting && isDragConfirmed) {
        R.drawSelectionRectangle(ctx, rectangleSelectStartPos, mousePos, colors);
    }

    if (isDragConfirmed) {
        R.drawMergePreviews(ctx, { 
        allVertices, 
        dragPreviewVertices, 
        viewTransform, 
        colors, 
        transformIndicatorData, 
        copyCount: parseInt(copyCountInput || '1', 10), 
        initialDragVertexStates,
        isSnapping: transformIndicatorData?.isSnapping || (actionContext?.finalSnapResult?.snapped ?? false)
    }, dataToScreen);}

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

    if (transformIndicatorData || coordSystemTransformIndicatorData) {
        R.drawTransformIndicators(ctx, htmlOverlay, { transformIndicatorData, angleSigFigs, distanceSigFigs, colors, coordSystemTransformIndicatorData }, dataToScreen, updateHtmlLabel);
    }

    R.updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostVertexPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors, useScientific: axisFormatInfo.useScientific }, screenToData, updateHtmlLabel);
    const stateForUI = {
        dpr, canvasUI, isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isVisibilityPanelExpanded,
        isPlacingTransform, placingTransformType, placingSnapPos, mousePos,
        allColors, activeThemeName, colors, verticesVisible, edgesVisible, facesVisible, coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode,
        namedColors: colorEditor.namedColors,
        colorAssignments, activeColorTargets,
        isDraggingColorTarget, draggedColorTargetInfo
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

function handleColorPaletteClick(screenPos, shiftKey, ctrlKey) {
    if (!isColorPaletteExpanded) return false;


    const removeBtn = canvasUI.removeColorButton;
    if (removeBtn && screenPos.x >= removeBtn.x && screenPos.x <= removeBtn.x + removeBtn.width &&
        screenPos.y >= removeBtn.y && screenPos.y <= removeBtn.y + removeBtn.height) {
        if (allColors.length > 1 && activeColorTargets.length > 0) {
            const primaryTarget = activeColorTargets[activeColorTargets.length - 1];
            const colorIndexToRemove = colorAssignments[primaryTarget];
            if (colorIndexToRemove >= 0) {
                saveStateForUndo();
                removeColorAtIndex(colorIndexToRemove);
            }
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

    // Add this new section:
    if (isDraggingColorSwatch) {
        // Restore original state since drag was cancelled
        allColors = draggedSwatchInfo.originalAllColors;
        colorAssignments = draggedSwatchInfo.originalAssignments;
        buildColorPaletteUI();
        
        // Remove the state we saved at drag start since no action was completed
        if (undoStack.length > 0) {
            undoStack.pop();
        }
        
        isDraggingColorSwatch = false;
        draggedSwatchInfo = null;
        draggedSwatchTemporarilyRemoved = false;
    }

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
    }

    selectedVertexIds = [];
    selectedEdgeIds = [];
    selectedFaceIds = [];
    selectedCenterIds = [];
    activeCenterId = null;
    activeColorTargets = [];
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
    }

    coordSystemTransformIndicatorData = null;
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
    highlightedEdgeForSnap = null;
    coordSystemSnapAngle = null;
    draggedFaceId = null;
    coordSystemSnapType = null;
    coordSystemTransformIndicatorData = null;
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
            draggedFaceId = face.id;
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
    const edgeVertexIds = [];
    const faceCenters = [];
    const edgeAngles = [];

    currentFace.vertexIds.forEach(id => {
        const vertex = findVertexById(id);
        if (vertex && vertex.type === 'regular') {
            vertices.push({ ...vertex, id: id });
        }
    });

    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        edgeMidvertices.push({
            x: (v1.x + v2.x) / 2,
            y: (v1.y + v2.y) / 2
        });
        
        edgeVertexIds.push(v1.id, v2.id);
        edgeAngles.push(Math.atan2(v2.y - v1.y, v2.x - v1.x));
    }

    allFaces.forEach(face => {
        if (face.id !== currentFace.id && face.localCoordSystem) {
            faceCenters.push(face.localCoordSystem.origin);
        }
    });

    return { vertices, edgeMidvertices, edgeVertexIds, faceCenters, edgeAngles };
}

function handleCoordinateSystemMouseMove(event) {
    if (!isDraggingCoordSystem || !draggedCoordSystemElement) return false;

    const mousePos = U.getMousePosOnCanvas(event, canvas);
    const mouseDataPos = screenToData(mousePos);
    const element = draggedCoordSystemElement;
    const face = element.face;
    const coordSystem = face.localCoordSystem;

    const faceVertices = face.vertexIds.map(id => findVertexById(id)).filter(p => p && p.type === 'regular' && p.x !== undefined && p.y !== undefined);

    if (element.type === 'center') {
        let targetPos;
        let snapResult = { snapped: false };
        
        if (event.shiftKey) {
            snapResult = U.getCoordinateSystemCenterSnap(
                mouseDataPos,
                coordSystemSnapTargets,
                gridDisplayMode,
                lastGridState,
                lastAngularGridState
            );
            
            if (snapResult.snapped) {
                targetPos = snapResult.snapPoint;
                
                if (snapResult.snapType === 'edge') {
                    const edgeInfo = snapResult.edgeInfo;
                    const v1 = findVertexById(edgeInfo.v1);
                    const v2 = findVertexById(edgeInfo.v2);
                    
                    if (v1 && v2) {
                        if (initialCoordSystemStateOnDrag && initialCoordSystemStateOnDrag.attachedToEdge) {
                            const fractions = [0, 0.25, 1/3, 0.5, 2/3, 0.75, 1];
                            let bestFraction = 0.5;
                            let minDist = Infinity;
                            
                            fractions.forEach(frac => {
                                const fracPoint = {
                                    x: v1.x + frac * (v2.x - v1.x),
                                    y: v1.y + frac * (v2.y - v1.y)
                                };
                                const dist = U.distance(mouseDataPos, fracPoint);
                                if (dist < minDist) {
                                    minDist = dist;
                                    bestFraction = frac;
                                }
                            });
                            
                            targetPos = {
                                x: v1.x + bestFraction * (v2.x - v1.x),
                                y: v1.y + bestFraction * (v2.y - v1.y)
                            };
                            
                            snapResult.edgeInfo.t = bestFraction;
                            
                            const currentEdgeLength = U.distance(v1, v2);
                            const originalEdgeLength = coordSystem.attachedToEdge ? coordSystem.attachedToEdge.originalLength : currentEdgeLength;
                            const scaleRatio = coordSystem.scale / originalEdgeLength;
                            
                            snapResult.edgeInfo.originalLength = currentEdgeLength;
                            snapResult.edgeInfo.scaleRatio = scaleRatio;
                            
                            coordSystemTransformIndicatorData = {
                                edgeFraction: bestFraction,
                                v1: v1,
                                v2: v2,
                                snapPosition: targetPos
                            };
                        } else {
                            targetPos = snapResult.snapPoint;
                            coordSystemTransformIndicatorData = null;
                        }
                    }
                }
            } else {
                const incenter = U.calculateIncenter(faceVertices);
                targetPos = incenter ? incenter.center : faceVertices[0];
            }
            
            if (element.type === 'center') {
                ghostVertexPosition = targetPos;
            }
        } else {
            targetPos = mouseDataPos;
            ghostVertexPosition = null;
            coordSystemTransformIndicatorData = null;
        }
        
        if (faceVertices.length > 0 && faceVertices.every(v => v && v.x !== undefined && v.y !== undefined)) {
            targetPos = U.clampPointToPolygon(targetPos, faceVertices);
            
            if (ghostVertexPosition) {
                ghostVertexPosition = U.clampPointToPolygon(ghostVertexPosition, faceVertices);
            }
        }
        
        coordSystem.origin.x = targetPos.x;
        coordSystem.origin.y = targetPos.y;
        coordSystem.isCustom = true;
        
        if (snapResult.snapped) {
            coordSystem.attachedToVertex = snapResult.vertexId || null;
            coordSystem.attachedToEdge = snapResult.edgeInfo || null;
        } else {
            coordSystem.attachedToVertex = null;
            coordSystem.attachedToEdge = null;
        }
    } else if (element.type === 'x_axis' || element.type === 'y_axis') {
        const vectorFromOrigin = {
            x: mouseDataPos.x - coordSystem.origin.x,
            y: mouseDataPos.y - coordSystem.origin.y
        };
        
        let newAngle = Math.atan2(vectorFromOrigin.y, vectorFromOrigin.x);
        let newScale = Math.hypot(vectorFromOrigin.x, vectorFromOrigin.y);

        highlightedEdgeForSnap = null;
        coordSystemSnapAngle = null;
        coordSystemSnapType = null;
        ghostVertices = [];
        ghostVertexPosition = null;
        coordSystemTransformIndicatorData = null;
        coordSystemSnapScale = null;
        
        if (event.shiftKey) {
            const angleSnapResult = U.getAxisSnapAngle(mouseDataPos, coordSystem.origin, true, coordSystemSnapTargets);
            
            if (angleSnapResult.snapped) {
                newAngle = angleSnapResult.angle;
                coordSystemSnapAngle = newAngle;
                coordSystemSnapType = angleSnapResult.snapType;
                
                const snappedAxisDirection = { x: Math.cos(newAngle), y: Math.sin(newAngle) };
                const mouseVector = { x: mouseDataPos.x - coordSystem.origin.x, y: mouseDataPos.y - coordSystem.origin.y };
                const effectiveScale = mouseVector.x * snappedAxisDirection.x + mouseVector.y * snappedAxisDirection.y;

                if (angleSnapResult.snapType === 'vertex_direction') {
                    const targetVertex = findVertexById(angleSnapResult.targetVertexId);
                    if (targetVertex) {
                        newScale = U.distance(coordSystem.origin, targetVertex);
                        coordSystemSnapScale = newScale;
                    }
                } else if (angleSnapResult.edgeIndex !== null) {
                    highlightedEdgeForSnap = angleSnapResult.edgeIndex;
                    const edgeInfo = getAlignedEdgeInfo(face, angleSnapResult.edgeIndex);
                    const isPerpendicular = Math.abs(U.normalizeAngleToPi(newAngle - edgeInfo.edgeAngle)) > Math.PI / 4 && Math.abs(U.normalizeAngleToPi(newAngle - edgeInfo.edgeAngle)) < 3 * Math.PI / 4;

                    if (element.type === 'x_axis' && isPerpendicular) {
                        const v1 = findVertexById(edgeInfo.v1Id);
                        const v2 = findVertexById(edgeInfo.v2Id);
                        if (v1 && v2) {
                            const closestOnEdge = U.getClosestPointOnLine(coordSystem.origin, v1, v2);
                            const referenceOrthogonalDistance = closestOnEdge.distance;

                            const fractions = [0.25, 1/3, 0.5, 2/3, 0.75, 1.0];
                            let bestSnap = { scale: effectiveScale, dist: Infinity, fraction: null };

                            fractions.forEach(frac => {
                                const targetDist = referenceOrthogonalDistance * frac;
                                const diff = Math.abs(effectiveScale - targetDist);
                                if (diff < bestSnap.dist) {
                                    bestSnap = { scale: targetDist, dist: diff, fraction: frac };
                                }
                            });
                            
                            const pixelSnapThreshold = 15 / viewTransform.scale;
                            if (bestSnap.dist < pixelSnapThreshold) {
                                newScale = bestSnap.scale;
                                coordSystemSnapScale = newScale;
                                coordSystemTransformIndicatorData = {
                                    orthogonalDistanceFraction: bestSnap.fraction,
                                    v1: v1,
                                    v2: v2,
                                    snapPosition: { origin: coordSystem.origin, closest: closestOnEdge }
                                };
                            } else {
                                newScale = effectiveScale > 0 ? effectiveScale : 0;
                                coordSystemSnapScale = newScale;
                            }
                        }
                    } else {
                        const scaleSnapResult = U.getAxisScaleSnap(
                            coordSystem.origin, 
                            element.type === 'y_axis' ? newAngle - Math.PI / 2 : newAngle, 
                            { alignedEdgeInfo: edgeInfo }, 
                            face, 
                            findVertexById,
                            effectiveScale,
                            viewTransform,
                            element.type
                        );
                        
                        if (scaleSnapResult.snapped) {
                            newScale = scaleSnapResult.scale;
                            coordSystemSnapScale = newScale;
                            
                            if (scaleSnapResult.edgeFraction !== null) {
                                const arrowHeadPosition = {
                                    x: coordSystem.origin.x + newScale * Math.cos(element.type === 'y_axis' ? newAngle : newAngle),
                                    y: coordSystem.origin.y + newScale * Math.sin(element.type === 'y_axis' ? newAngle : newAngle)
                                };
                                coordSystemTransformIndicatorData = {
                                    edgeFraction: scaleSnapResult.edgeFraction,
                                    v1: findVertexById(edgeInfo.v1Id),
                                    v2: findVertexById(edgeInfo.v2Id),
                                    snapPosition: arrowHeadPosition
                                };
                            }
                        } else {
                             newScale = effectiveScale > 0 ? effectiveScale : 0;
                        }
                    }
                }
            } else {
                newScale = Math.hypot(vectorFromOrigin.x, vectorFromOrigin.y);
            }
        }

        if (element.type === 'y_axis') {
            coordSystem.angle = newAngle - Math.PI / 2;
        } else {
            coordSystem.angle = newAngle;
        }

        if (newScale > 0.01) {
            coordSystem.scale = newScale;
        }

        coordSystem.isCustom = true;
    }

    return true;
}

function handleCoordinateSystemMouseUp() {
    if (isDraggingCoordSystem) {
        const element = draggedCoordSystemElement;
        const face = element.face;
        const coordSystem = face.localCoordSystem;
        
        if (element.type === 'center' && coordSystem) {
            const snapThreshold = 0.01;
            let attachedToVertex = null;
            let attachedToEdge = null;
            
            face.vertexIds.forEach(vertexId => {
                const vertex = findVertexById(vertexId);
                if (vertex && U.distance(coordSystem.origin, vertex) < snapThreshold) {
                    attachedToVertex = vertexId;
                }
            });
            
            if (!attachedToVertex) {
                for (let i = 0; i < face.vertexIds.length; i++) {
                    const v1 = findVertexById(face.vertexIds[i]);
                    const v2 = findVertexById(face.vertexIds[(i + 1) % face.vertexIds.length]);
                    if (v1 && v2) {
                        const closest = U.getClosestPointOnLineSegment(coordSystem.origin, v1, v2);
                        if (closest.distance < snapThreshold && closest.onSegmentStrict) {
                            const currentEdgeLength = U.distance(v1, v2);
                            attachedToEdge = { 
                                v1: v1.id, 
                                v2: v2.id, 
                                t: closest.t,
                                originalAngle: Math.atan2(v2.y - v1.y, v2.x - v1.x),
                                originalLength: currentEdgeLength,
                                scaleRatio: coordSystem.scale / currentEdgeLength
                            };
                            break;
                        }
                    }
                }
            }
            
            coordSystem.attachedToVertex = attachedToVertex;
            coordSystem.attachedToEdge = attachedToEdge;
        }

        if (element.type === 'x_axis' || element.type === 'y_axis') {
            let didSnapRotationToEdge = false;
            let didSnapScaleToEdge = false;

            if (coordSystemSnapType === 'edge' && highlightedEdgeForSnap !== null) {
                const edgeInfo = getAlignedEdgeInfo(face, highlightedEdgeForSnap);
                if (edgeInfo) {
                    if (coordSystemSnapAngle !== null) {
                        coordSystem.rotationAlignedToEdge = {
                            v1: edgeInfo.v1Id,
                            v2: edgeInfo.v2Id,
                            originalAngle: edgeInfo.edgeAngle,
                            originalSystemAngle: coordSystem.angle
                        };
                        didSnapRotationToEdge = true;
                    }

                    if (coordSystemSnapScale !== null) {
                        const v1 = findVertexById(edgeInfo.v1Id);
                        const v2 = findVertexById(edgeInfo.v2Id);
                        if (v1 && v2) {
                            const edgeLength = U.distance(v1, v2);
                            if (edgeLength > C.GEOMETRY_CALCULATION_EPSILON) {
                                coordSystem.scaleAttachedToEdge = {
                                    v1: edgeInfo.v1Id,
                                    v2: edgeInfo.v2Id,
                                    scaleRatio: coordSystem.scale / edgeLength
                                };
                                didSnapScaleToEdge = true;
                            }
                         }
                    }
                }
            }

            if (!didSnapRotationToEdge) {
                coordSystem.rotationAlignedToEdge = null;
            }
            if (!didSnapScaleToEdge) {
                coordSystem.scaleAttachedToEdge = null;
            }
        }
        
        coordSystemSnapScale = null;
        coordSystemTransformIndicatorData = null;
        isDraggingCoordSystem = false;
        draggedCoordSystemElement = null;
        coordSystemSnapTargets = null;
        highlightedEdgeForSnap = null;
        coordSystemSnapAngle = null;
        coordSystemSnapType = null;
        draggedFaceId = null;
        ghostVertexPosition = null;
        ghostVertices = [];
        coordSystemTransformIndicatorData = null;
        return true;
    }
    return false;
}

function handleKeyDown(event) {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    const colors = getColors();

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

                R.drawDrawingPreview(ctx, { startVertex, snappedData, isShiftPressed: currentShiftPressed, currentColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextCreationColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextEdgeColor, colors, edgeColormapInfo }, dataToScreen);
                const stateForSnapInfo = { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors };
                R.prepareSnapInfoTexts(ctx, htmlOverlay, startVertex, snappedData, snappedData, stateForSnapInfo, dataToScreen, currentPreviewDrawingContext, updateHtmlLabel);
            }
        } else if (!isActionInProgress) {
            if (isDraggingCoordSystem && draggedCoordSystemElement && draggedCoordSystemElement.type === 'center') {
                const potentialSnapPos = getBestSnapPosition(mouseDataPos);
                if (potentialSnapPos) {
                    ghostVertexPosition = potentialSnapPos;
                    // Apply the snap to the coordinate system
                    const face = draggedCoordSystemElement.face;
                    const coordSystem = face.localCoordSystem;
                    const faceVertices = face.vertexIds.map(id => findVertexById(id)).filter(p => p && p.type === 'regular');
                    const clampedPos = U.clampPointToPolygon(potentialSnapPos, faceVertices);
                    coordSystem.origin.x = clampedPos.x;
                    coordSystem.origin.y = clampedPos.y;
                    coordSystem.isCustom = true;
                }
            } else {
                const clickedFace = findClickedFace(mousePos);
                if (!clickedFace) {
                    ghostVertexPosition = getBestSnapPosition(mouseDataPos);
                } else {
                    ghostVertexPosition = null;
                }
            }
        }
    }

    if (isActionInProgress && currentMouseButton === 0 && (actionContext?.targetVertex || actionContext?.targetEdge || actionContext?.targetFace) && event.key >= '0' && event.key <= '9') {
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
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_SELECT_ALL && !isMouseOverColorEditor) {
        event.preventDefault();
        saveStateForUndo();
        selectedVertexIds = allVertices.filter(p => p.type === 'regular').map(p => p.id);
        selectedEdgeIds = allEdges.map(edge => U.getEdgeId(edge));
        selectedFaceIds = allFaces.map(face => face.id);
        selectedCenterIds = allVertices.filter(p => p.type !== 'regular').map(p => p.id);
        activeCenterId = null;

        // Update active color targets for select all
        const newActiveTargets = [];
        if (selectedFaceIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_FACE);
        if (selectedEdgeIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_EDGE);
        if (selectedVertexIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_VERTEX);

        if (newActiveTargets.length > 0) {
            activeColorTargets = newActiveTargets;
            if (isColorPaletteExpanded) {
                buildColorPaletteUI();
            }
        }
    }
}

function handleColorToolButtonClick() {
    isColorPaletteExpanded = !isColorPaletteExpanded;
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
    }
}

function handleThemeToggle() {
    saveStateForUndo();
    activeThemeName = activeThemeName === 'dark' ? 'light' : 'dark';
    invertColors(); // This now only inverts the user-defined swatches
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
    }
}

function getAlignedEdgeInfo(face, edgeIndex) {
    const v1Id = face.vertexIds[edgeIndex];
    const v2Id = face.vertexIds[(edgeIndex + 1) % face.vertexIds.length];
    const v1 = findVertexById(v1Id);
    const v2 = findVertexById(v2Id);
    
    if (v1 && v2) {
        return {
            v1Id,
            v2Id,
            edgeAngle: Math.atan2(v2.y - v1.y, v2.x - v1.x)
        };
    }
    
    return null;
}

function handleMouseMove(event) {
    mousePos = U.getMousePosOnCanvas(event, canvas);
    currentShiftPressed = event.shiftKey;

    if (isDraggingColorTarget && draggedColorTargetInfo) {
        const icon = canvasUI.colorTargetIcons.find(i => i.target === draggedColorTargetInfo.target);
        if (icon) {
            const dropTargets = [...canvasUI.colorSwatches, canvasUI.randomColorButton];
            const closestTarget = U.findClosestUIElement(mousePos, dropTargets);
            if (closestTarget) {
                icon.x = closestTarget.x + (closestTarget.width - icon.width) / 2;
                const newIndex = closestTarget.id === 'random-color-button' ? -1 : closestTarget.index;
                draggedColorTargetInfo.previewColorIndex = newIndex;
            } else {
                icon.x = mousePos.x - draggedColorTargetInfo.offsetX;
                draggedColorTargetInfo.previewColorIndex = draggedColorTargetInfo.originalColorIndex;
            }
        }
        return;
    }

    if (isDraggingColorSwatch) {
        const removeBtn = canvasUI.removeColorButton;
        const isOverRemoveButton = removeBtn && 
            mousePos.x >= removeBtn.x && mousePos.x <= removeBtn.x + removeBtn.width &&
            mousePos.y >= removeBtn.y && mousePos.y <= removeBtn.y + removeBtn.height;

        if (isOverRemoveButton && allColors.length > 1 && !draggedSwatchTemporarilyRemoved) {
            draggedSwatchTemporarilyRemoved = true;
            const indexToRemove = allColors.indexOf(draggedSwatchInfo.item);
            if (indexToRemove >= 0) {
                allColors.splice(indexToRemove, 1);
                
                Object.keys(colorAssignments).forEach(target => {
                    if (colorAssignments[target] > indexToRemove) {
                        colorAssignments[target]--;
                    } else if (colorAssignments[target] === indexToRemove) {
                        colorAssignments[target] = Math.min(indexToRemove, allColors.length - 1);
                    }
                });
                
                buildColorPaletteUI();
            }
            return;
        } else if (!isOverRemoveButton && draggedSwatchTemporarilyRemoved) {
            draggedSwatchTemporarilyRemoved = false;
            allColors.unshift(draggedSwatchInfo.item);
            
            Object.keys(colorAssignments).forEach(target => {
                colorAssignments[target]++;
            });
            
            Object.keys(draggedSwatchInfo.originalAssignments).forEach(target => {
                if (draggedSwatchInfo.originalAssignments[target] === draggedSwatchInfo.originalIndex) {
                    colorAssignments[target] = 0;
                }
            });
            
            buildColorPaletteUI();
            return;
        }

        if (draggedSwatchTemporarilyRemoved) {
            return;
        }

        const fromIndex = allColors.indexOf(draggedSwatchInfo.item);
        
        let targetIndex = fromIndex;
        
        for (let i = 0; i < canvasUI.colorSwatches.length; i++) {
            const swatch = canvasUI.colorSwatches[i];
            const swatchLeft = swatch.x;
            const swatchRight = swatch.x + swatch.width;
            
            if (mousePos.x >= swatchLeft && mousePos.x <= swatchRight) {
                targetIndex = allColors.indexOf(swatch.item);
                break;
            }
        }
        
        if (targetIndex !== fromIndex) {
            const temp = allColors[fromIndex];
            allColors[fromIndex] = allColors[targetIndex];
            allColors[targetIndex] = temp;
            
            Object.keys(colorAssignments).forEach(target => {
                if (colorAssignments[target] === fromIndex) {
                    colorAssignments[target] = targetIndex;
                } else if (colorAssignments[target] === targetIndex) {
                    colorAssignments[target] = fromIndex;
                }
            });
            
            draggedSwatchInfo.item = allColors[targetIndex];
            
            buildColorPaletteUI();
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
        } else if (isDraggingCoordSystem && draggedCoordSystemElement && draggedCoordSystemElement.type === 'center') {
            ghostVertexPosition = getBestSnapPosition(mouseDataPos);
        } else {
            const clickedFace = findClickedFace(mousePos);
            if (!clickedFace) {
                ghostVertexPosition = getBestSnapPosition(mouseDataPos);
            } else {
                ghostVertexPosition = null;
            }
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
        actionTargetVertex = actionContext.dragHandle;
        isEdgeTransformDrag = !!actionContext.isTransformDrag;

        if (actionContext.target === 'ui_icon_click') {
            isDraggingColorTarget = true;
            draggedColorTargetInfo = {
                target: actionContext.element.target,
                offsetX: mousePos.x - actionContext.element.x,
                offsetY: mousePos.y - actionContext.element.y,
                originalColorIndex: colorAssignments[actionContext.element.target],
                previewColorIndex: colorAssignments[actionContext.element.target]
            };
            actionContext.target = 'ui_icon_drag';
            activeColorTargets = [actionContext.element.target];
        } else if (actionContext.target === 'ui_swatch') {
            saveStateForUndo();
            isDraggingColorSwatch = true;
            draggedSwatchInfo = {
                index: actionContext.element.index,
                item: actionContext.element.item,
                offsetX: mousePos.x - actionContext.element.x,
                originalIndex: actionContext.element.index,
                originalAllColors: JSON.parse(JSON.stringify(allColors)),
                originalAssignments: JSON.parse(JSON.stringify(colorAssignments))
            };
        } else if (currentMouseButton === 2) {
            isRectangleSelecting = true;
            return;
        } else if (actionContext.target === 'canvas') {
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
            canvas.style.cursor = 'move';
        } else {
            canvas.style.cursor = 'grabbing';
            isDraggingCenter = actionContext.targetVertex && actionContext.targetVertex.type !== 'regular';

            let verticesToDrag;

            if (isDraggingCenter) {
                verticesToDrag = [actionContext.targetVertex];
            } else {
                let verticesToDragIds = new Set(selectedVertexIds);

                selectedEdgeIds.forEach(edgeId => {
                    const [id1, id2] = edgeId.split(C.EDGE_ID_DELIMITER);
                    verticesToDragIds.add(id1);
                    verticesToDragIds.add(id2);
                });

                selectedFaceIds.forEach(faceId => {
                    const face = allFaces.find(f => U.getFaceId(f) === faceId);
                    if (face) {
                        const allFamilyVertices = getDescendantVertices(face.id, allFaces);
                        allFamilyVertices.forEach(id => verticesToDragIds.add(id));
                    }
                });

                verticesToDrag = Array.from(verticesToDragIds).map(id => findVertexById(id)).filter(p => p && p.type === 'regular');
            }

            if (isDraggingCenter) {
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
                
                initialCoordSystemStates.clear();
                const verticesThatMoved = new Set(initialDragVertexStates.map(v => v.id));
                allFaces.forEach(face => {
                    if (face.vertexIds.some(vId => verticesThatMoved.has(vId))) {
                        if (face.localCoordSystem) {
                            initialCoordSystemStates.set(face.id, JSON.parse(JSON.stringify(face.localCoordSystem)));
                        }
                    }
                });
            }
        }
    }

    if (isDragConfirmed) {
        const isTransformingSelection = activeCenterId && (selectedVertexIds.length > 0 || selectedEdgeIds.length > 0 || selectedFaceIds.length > 0) && !isEdgeTransformDrag;
        actionContext.dragSnap = null;
        ghostVertexPosition = null;
        ghostVertices = [];

        if (isPanningBackground) {
            const deltaX_css = mousePos.x - actionStartPos.x;
            const deltaY_css = mousePos.y - actionStartPos.y;
            viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
            viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
        } else if ((isTransformingSelection || isEdgeTransformDrag) && !isDraggingCenter) {
            const center = findVertexById(activeCenterId);
            let startReferenceVertex = actionTargetVertex;
            
            if (!startReferenceVertex && initialDragVertexStates.length > 0) {
                startReferenceVertex = initialDragVertexStates.find(p => U.distance(p, center) > 1e-6) || initialDragVertexStates[0];
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
            } else if (centerType === C.TRANSFORMATION_TYPE_ROTATE_SCALE) {
                snapResult = getBestRotateScaleSnap(center, initialDragVertexStates, startReferenceVertex, rawTransform.rotation, rawTransform.scale);
                finalTransform = { rotation: snapResult.rotation, scale: snapResult.scale, directionalScale: false };
                currentAccumulatedRotation = snapResult.rotation;
            } else if (centerType === C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
                const startVector = { x: startReferenceVertex.x - center.x, y: startReferenceVertex.y - center.y };
                const mouseData = screenToData(mousePos);
                snapResult = getBestDirectionalScaleSnap(center, initialDragVertexStates, startReferenceVertex, rawTransform.scale, startVector, mouseData);
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
                gridToGridInfo: snapResult.gridToGridInfo || null,
                gridPoint: snapResult.gridPoint || null,          // ADD THIS
                nearbyVertex: snapResult.nearbyVertex || null,
                projectionPoint: snapResult.projectionPoint || null  // ADD THIS
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
        } else if (isDraggingCenter && dragPreviewVertices.length > 0) {
            // Simple translation for dragging centers with placement-style snapping
            const mouseData = screenToData(mousePos);
            
            let finalPos = mouseData;
            if (currentShiftPressed) {
                const potentialSnapPos = getBestSnapPosition(mouseData);
                if (potentialSnapPos) {
                    finalPos = potentialSnapPos;
                    ghostVertexPosition = potentialSnapPos;
                }
            } else {
                ghostVertexPosition = null;
            }
            
            const previewCenterToUpdate = dragPreviewVertices.find(dp => dp && dp.id === initialDragVertexStates[0].id);
            if (previewCenterToUpdate) {
                previewCenterToUpdate.x = finalPos.x;
                previewCenterToUpdate.y = finalPos.y;
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

function handleLeftMouseButtonDown(event) {
    const clickedUIElement = U.getClickedUIElement(mousePos, canvasUI, { isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isVisibilityPanelExpanded });
    if (isPlacingTransform && (!clickedUIElement || clickedUIElement.type !== 'transformIcon')) {
        saveStateForUndo();
        const mouseDataPos = screenToData(mousePos);
        const snappedPos = currentShiftPressed ? getBestSnapPosition(mouseDataPos) : mouseDataPos;

        const newCenter = {
            id: U.generateUniqueId(),
            x: snappedPos.x,
            y: snappedPos.y,
            type: placingTransformType
        };
        allVertices.push(newCenter);

        // Make the new center active and selected
        selectedCenterIds = [newCenter.id];
        activeCenterId = newCenter.id;
        // Clear other selections for clarity
        selectedVertexIds = [];
        selectedEdgeIds = [];
        selectedFaceIds = [];

        // Reset ONLY the placement-related state, keeping the new selection
        isPlacingTransform = false;
        placingTransformType = null;
        placingSnapPos = null;
        canvas.style.cursor = 'crosshair';

        event.preventDefault();
        return;
    }
    isActionInProgress = true;
    isDragConfirmed = false;
    isPanningBackground = false;

    if (isColorPaletteExpanded) {
        const iconsUnderMouse = (canvasUI.colorTargetIcons || []).filter(icon =>
            mousePos.x >= icon.x && mousePos.x <= icon.x + icon.width &&
            mousePos.y >= icon.y && mousePos.y <= icon.y + icon.height
        );

        if (iconsUnderMouse.length > 0) {
            const topIcon = iconsUnderMouse[iconsUnderMouse.length - 1];
            
            const { element, shiftKey, ctrlKey } = { element: topIcon, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey || event.metaKey };
            if (shiftKey) {
                if (!activeColorTargets.includes(element.target)) {
                    activeColorTargets.push(element.target);
                }
            } else if (ctrlKey) {
                if (activeColorTargets.includes(element.target)) {
                    activeColorTargets = activeColorTargets.filter(t => t !== element.target);
                } else {
                    activeColorTargets.push(element.target);
                }
            } else {
                activeColorTargets = [element.target];
            }
            buildColorPaletteUI();

            actionContext = { target: 'ui_icon_click', element: { ...topIcon, type: 'colorTargetIcon' } };
            return;
        }

        for (const swatch of canvasUI.colorSwatches) {
            if (mousePos.x >= swatch.x && mousePos.x <= swatch.x + swatch.width &&
                mousePos.y >= swatch.y && mousePos.y <= swatch.y + swatch.height) {
                actionContext = { target: 'ui_swatch', element: { ...swatch } };
                return;
            }
        }
    }

    if (handleCanvasUIClick(mousePos, event.shiftKey, event.ctrlKey || event.metaKey)) {
        actionContext = { target: 'ui' }; // Set a generic context for UI clicks
        return;
    }

    if (handleCoordinateSystemMouseDown(event)) {
        return;
    }

    if (event.altKey && !isDrawingMode) {
        const clickedVertex = findClickedVertex(mousePos);
        const clickedEdge = !clickedVertex ? findClickedEdge(mousePos) : null;
        const clickedFace = !clickedVertex && !clickedEdge ? findClickedFace(mousePos) : null;

        if (clickedVertex || clickedEdge || clickedFace) {
            saveStateForUndo();
            performEscapeAction();
            
            if (clickedVertex && clickedVertex.type === 'regular') {
                isDrawingMode = true;
                previewLineStartVertexId = clickedVertex.id;
                drawingSequence = [];
                currentSequenceIndex = 0;
                currentDrawingPath = [clickedVertex.id];
                window.currentDrawingPath = currentDrawingPath;
            } else if (clickedEdge) {
                const p1 = findVertexById(clickedEdge.id1);
                const p2 = findVertexById(clickedEdge.id2);
                if (p1 && p2) {
                    const closest = U.getClosestPointOnLineSegment(screenToData(mousePos), p1, p2);
                    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                    const newVertex = insertVertexOnEdgeWithFaces(clickedEdge, closest, gridInterval, getColorForTarget);
                    if (newVertex) {
                        isDrawingMode = true;
                        previewLineStartVertexId = newVertex.id;
                        drawingSequence = [];
                        currentSequenceIndex = 0;
                        currentDrawingPath = [newVertex.id];
                        window.currentDrawingPath = currentDrawingPath;
                    }
                }
            } else if (clickedFace) {
                const startCoords = ghostVertexPosition ? ghostVertexPosition : screenToData(mousePos);

                let newVertexColor = getColorForTarget(C.COLOR_TARGET_VERTEX);
                const colorIndex = colorAssignments[C.COLOR_TARGET_VERTEX];
                if (colorIndex !== -1) {
                    const colorItem = allColors[colorIndex];
                    if (colorItem && colorItem.type === 'colormap') {
                        newVertexColor = U.sampleColormap(colorItem, 0);
                    }
                }

                const newVertex = { id: U.generateUniqueId(), ...startCoords, type: 'regular', color: newVertexColor };
                allVertices.push(newVertex);
                isDrawingMode = true;
                previewLineStartVertexId = newVertex.id;
                drawingSequence = [];
                currentSequenceIndex = 0;
                currentDrawingPath = [newVertex.id];
                window.currentDrawingPath = currentDrawingPath;
            }

            isActionInProgress = false;
            event.preventDefault();
            return;
        }
    }

    let clickedVertex = findClickedVertex(mousePos);
    let clickedEdge = !clickedVertex ? findClickedEdge(mousePos) : null;
    let clickedFace = !clickedVertex && !clickedEdge ? findClickedFace(mousePos) : null;

    const shiftOrCtrl = event.shiftKey || event.ctrlKey || event.metaKey;
    const clickedItem = clickedVertex || clickedEdge || clickedFace;
    let isClickOnSelection = false;
    if (clickedVertex) isClickOnSelection = selectedVertexIds.includes(clickedVertex.id) || selectedCenterIds.includes(clickedVertex.id);
    else if (clickedEdge) isClickOnSelection = selectedEdgeIds.includes(U.getEdgeId(clickedEdge));
    else if (clickedFace) isClickOnSelection = selectedFaceIds.includes(U.getFaceId(clickedFace));
    
    if (!isDrawingMode && !shiftOrCtrl && clickedItem && !isClickOnSelection) {
        if (clickedVertex) applySelectionLogic([clickedVertex.id], [], [], false, false, clickedVertex.type !== 'regular');
        else if (clickedEdge) applySelectionLogic([], [U.getEdgeId(clickedEdge)], [], false, false);
        else if (clickedFace) applySelectionLogic([], [], [U.getFaceId(clickedFace)], false, false);
    }
    
    let dragHandle = null;
    if (clickedVertex) {
        dragHandle = clickedVertex;
    } else if (clickedEdge) {
        const p1 = findVertexById(clickedEdge.id1);
        const p2 = findVertexById(clickedEdge.id2);
        dragHandle = U.getClosestPointOnLineSegment(screenToData(mousePos), p1, p2);
    } else if (clickedFace) {
        dragHandle = screenToData(mousePos);
    }

    const isTransformDrag = activeCenterId && (selectedVertexIds.length > 0 || selectedEdgeIds.length > 0 || selectedFaceIds.length > 0);

    initialDragVertexStates = [];
    dragPreviewVertices = [];

    actionContext = {
        targetVertex: clickedVertex,
        dragHandle: dragHandle,
        targetEdge: clickedEdge,
        targetFace: clickedFace,
        target: clickedItem || 'canvas',
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey || event.metaKey,
        isTransformDrag
    };

    if (clickedVertex && clickedVertex.type !== 'regular') {
        isDraggingCenter = true;
        handleCenterSelection(clickedVertex.id, event.shiftKey, event.ctrlKey || event.metaKey);
    }
}

function handleLeftMouseButtonUp(event) {
    if (isDraggingColorTarget) {
        const icon = canvasUI.colorTargetIcons.find(i => i.target === draggedColorTargetInfo.target);
        if (icon) {
            const dropTargets = [...canvasUI.colorSwatches, canvasUI.randomColorButton];
            const closestTarget = U.findClosestUIElement(mousePos, dropTargets);
            if (closestTarget) {
                const newIndex = closestTarget.id === 'random-color-button' ? -1 : closestTarget.index;
                // Apply to the specific target that was dragged
                colorAssignments[draggedColorTargetInfo.target] = newIndex;
                applyColorsToSelection();
            }
        }
        isDraggingColorTarget = false;
        draggedColorTargetInfo = null;
        buildColorPaletteUI();
        isActionInProgress = false;
        isDragConfirmed = false;
        actionContext = null;
        return;
    }

    if (isDraggingColorSwatch) {
        const removeBtn = canvasUI.removeColorButton;
        const isOverRemoveButton = removeBtn && 
            mousePos.x >= removeBtn.x && mousePos.x <= removeBtn.x + removeBtn.width &&
            mousePos.y >= removeBtn.y && mousePos.y <= removeBtn.y + removeBtn.height;

        if (isOverRemoveButton && allColors.length > 1) {
            const currentIndex = allColors.indexOf(draggedSwatchInfo.item);
            if (currentIndex !== -1) {
                removeColorAtIndex(currentIndex);
            }
        }

        isDraggingColorSwatch = false;
        draggedSwatchInfo = null;
        draggedSwatchTemporarilyRemoved = false;
        
        buildColorPaletteUI();
        
        isActionInProgress = false;
        isDragConfirmed = false;
        actionContext = null;
        return;
    }

    if (!isDragConfirmed && actionContext && actionContext.target === 'ui_icon_click' && actionContext.element.type === 'colorTargetIcon') {
        const { element } = actionContext;
        const now = Date.now();
        
        const iconId = `icon-${element.target}`;
        if (clickData.targetId === iconId && (now - clickData.timestamp) < C.DOUBLE_CLICK_MS) {
            // Double-click: toggle visibility of this geometry type
            saveStateForUndo();
            switch (element.target) {
                case C.COLOR_TARGET_VERTEX:
                    verticesVisible = !verticesVisible;
                    break;
                case C.COLOR_TARGET_EDGE:
                    edgesVisible = !edgesVisible;
                    break;
                case C.COLOR_TARGET_FACE:
                    facesVisible = !facesVisible;
                    break;
            }
            buildColorPaletteUI();
            clickData.count = 0; // Reset for next click
        } else {
            // Single-click was already handled on mousedown
        }
        
        clickData.targetId = iconId;
        clickData.timestamp = now;
        isActionInProgress = false;
        actionContext = null;
        return;
    } else if (!isDragConfirmed && actionContext && actionContext.target === 'ui') {
        clickData.count = 0;
    }

    if (!isDragConfirmed && actionContext && actionContext.target === 'ui_swatch') {
        const { element } = actionContext;
        const now = Date.now();
        
        const swatchId = `swatch-${element.index}`;
        if (clickData.targetId === swatchId && (now - clickData.timestamp) < C.DOUBLE_CLICK_MS) {
            isEditingColor = true;
            editingColorIndex = element.index;
            const colorToEdit = allColors[element.index];
            let initialState;
            if (colorToEdit.type === 'color') {
                const parsedColor = U.parseColor(colorToEdit.value);
                initialState = { type: 'colormap', points: [{ pos: 0.5, alpha: parsedColor.a, color: [parsedColor.r, parsedColor.g, parsedColor.b], order: 1 }] };
            } else if (colorToEdit.type === 'colormap') {
                initialState = { 
                    type: 'colormap', 
                    points: colorToEdit.vertices.map(v => ({ pos: v.pos, alpha: v.alpha !== undefined ? v.alpha : 1.0, color: Array.isArray(v.color) ? [...v.color] : [v.color.r || 0, v.color.g || 0, v.color.b || 0], order: v.order || 1 })),
                    isCyclic: colorToEdit.isCyclic === true
                };
            }
            colorEditor.show(undefined, undefined, initialState);
            clickData.count = 0;
        } else {
            // Single-click re-assigns active targets and colors selection
            if (activeColorTargets.length > 0) {
                saveStateForUndo(); // Save state BEFORE making changes
                activeColorTargets.forEach(target => colorAssignments[target] = element.index);
                applyColorsToSelection();
                buildColorPaletteUI();
            }
        }
        clickData.targetId = swatchId;
        clickData.timestamp = now;
        isActionInProgress = false;
        actionContext = null;
        return;
    }

    if (!isDragConfirmed && isDraggingColorSwatch) {
        const swatchIndex = allColors.indexOf(draggedSwatchInfo.item);
        const swatchId = `swatch-${swatchIndex}`;
        const now = Date.now();
        
        if (clickData.targetId === swatchId && (now - clickData.timestamp) < C.DOUBLE_CLICK_MS) {
            isEditingColor = true;
            editingColorIndex = swatchIndex;
            const colorToEdit = allColors[swatchIndex];
            let initialState;
            if (colorToEdit.type === 'color') {
                const parsedColor = U.parseColor(colorToEdit.value);
                initialState = { type: 'colormap', points: [{ pos: 0.5, alpha: parsedColor.a, color: [parsedColor.r, parsedColor.g, parsedColor.b], order: 1 }] };
            } else if (colorToEdit.type === 'colormap') {
                initialState = { type: 'colormap', points: colorToEdit.vertices.map(v => ({ pos: v.pos, alpha: v.alpha !== undefined ? v.alpha : 1.0, color: Array.isArray(v.color) ? [...v.color] : [v.color.r || 0, v.color.g || 0, v.color.b || 0], order: v.order || 1 })) };
            }
            colorEditor.show(undefined, undefined, initialState);
            clickData.count = 0;
        } else {
            activeColorTargets.forEach(t => colorAssignments[t] = swatchIndex);
            applyColorsToSelection();
            buildColorPaletteUI();
        }
        clickData.targetId = swatchId;
        clickData.timestamp = now;
        
        isDraggingColorSwatch = false;
        draggedSwatchInfo = null;
        saveStateForUndo();
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

        // Find this line:
    if (isDragConfirmed) {

    // And replace everything inside it with this:
        saveStateForUndo();
        let lastCopySelectionIds = null;
        if (copyCount > 1) {
            const verticesToCopy = initialDragVertexStates.filter(p => p.type === 'regular');
            const originalIds = new Set(verticesToCopy.map(p => p.id));
            const edgesToCopy = allEdges.filter(e => originalIds.has(e.id1) && originalIds.has(e.id2));
            const facesToCopy = allFaces.filter(f => f.vertexIds.every(id => originalIds.has(id)));
            
            const allNewVertices = [];
            const allNewEdges = [];
            const allNewFaces = [];
            lastCopySelectionIds = { vertices: [], edges: [], faces: [] };

            for (let i = 0; i < copyCount; i++) {
                const newIdMapForThisCopy = new Map();
                const currentCopyVertices = [];
                const currentCopyEdges = [];
                const currentCopyFaces = [];

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
                    const newVertex = { ...p, ...newPos, id: U.generateUniqueId() };
                    allNewVertices.push(newVertex);
                    newIdMapForThisCopy.set(p.id, newVertex.id);
                    currentCopyVertices.push(newVertex.id);
                });

                edgesToCopy.forEach(edge => {
                    const newId1 = newIdMapForThisCopy.get(edge.id1);
                    const newId2 = newIdMapForThisCopy.get(edge.id2);
                    if (newId1 && newId2) {
                        const newEdge = { ...edge, id1: newId1, id2: newId2 };
                        allNewEdges.push(newEdge);
                        currentCopyEdges.push(U.getEdgeId(newEdge));
                    }
                });

                facesToCopy.forEach(originalFace => {
                    const initialSystemForCopy = initialCoordSystemStates.get(originalFace.id);
                    const newVertexIds = originalFace.vertexIds.map(id => newIdMapForThisCopy.get(id));
                    if (newVertexIds.every(Boolean)) {
                        const newFace = JSON.parse(JSON.stringify(originalFace));
                        newFace.id = U.getFaceId({ vertexIds: newVertexIds });
                        newFace.vertexIds = newVertexIds;

                        if (newFace.localCoordSystem && initialSystemForCopy) {
                            if (transformIndicatorData) {
                                const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
                                const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
                                newFace.localCoordSystem.origin = U.applyTransformToVertex(initialSystemForCopy.origin, center, rotation * i, Math.pow(scale, i), directionalScale, startVector);
                                newFace.localCoordSystem.angle = U.normalizeAngle(initialSystemForCopy.angle + (rotation * i));
                                if (!directionalScale) newFace.localCoordSystem.scale = initialSystemForCopy.scale * Math.pow(scale, i);
                            } else {
                                const delta = { x: dragPreviewVertices[0].x - initialDragVertexStates[0].x, y: dragPreviewVertices[0].y - initialDragVertexStates[0].y };
                                newFace.localCoordSystem.origin.x = initialSystemForCopy.origin.x + delta.x * i;
                                newFace.localCoordSystem.origin.y = initialSystemForCopy.origin.y + delta.y * i;
                            }
                            
                            if (newFace.localCoordSystem.attachedToVertex) {
                                newFace.localCoordSystem.attachedToVertex = newIdMapForThisCopy.get(newFace.localCoordSystem.attachedToVertex);
                            }
                            if (newFace.localCoordSystem.attachedToEdge) {
                                newFace.localCoordSystem.attachedToEdge.v1 = newIdMapForThisCopy.get(newFace.localCoordSystem.attachedToEdge.v1);
                                newFace.localCoordSystem.attachedToEdge.v2 = newIdMapForThisCopy.get(newFace.localCoordSystem.attachedToEdge.v2);
                            }
                            if (newFace.localCoordSystem.rotationAlignedToEdge) {
                                newFace.localCoordSystem.rotationAlignedToEdge.v1 = newIdMapForThisCopy.get(newFace.localCoordSystem.rotationAlignedToEdge.v1);
                                newFace.localCoordSystem.rotationAlignedToEdge.v2 = newIdMapForThisCopy.get(newFace.localCoordSystem.rotationAlignedToEdge.v2);
                            }
                            if (newFace.localCoordSystem.scaleAttachedToEdge) {
                                newFace.localCoordSystem.scaleAttachedToEdge.v1 = newIdMapForThisCopy.get(newFace.localCoordSystem.scaleAttachedToEdge.v1);
                                newFace.localCoordSystem.scaleAttachedToEdge.v2 = newIdMapForThisCopy.get(newFace.localCoordSystem.scaleAttachedToEdge.v2);
                            }
                            
                            newFace.localCoordSystem.isCustom = true;
                        }
                        allNewFaces.push(newFace);
                        currentCopyFaces.push(newFace.id);
                    }
                });
                
                if (i === copyCount - 1) {
                    lastCopySelectionIds = { vertices: currentCopyVertices, edges: currentCopyEdges, faces: currentCopyFaces };
                }
            }
            
            allVertices.push(...allNewVertices);
            allEdges.push(...allNewEdges);
            allFaces.push(...allNewFaces);
            
            selectedVertexIds = lastCopySelectionIds.vertices;
            selectedEdgeIds = lastCopySelectionIds.edges;
            selectedFaceIds = lastCopySelectionIds.faces;
        } else if (dragPreviewVertices.length > 0) {
            dragPreviewVertices.forEach(dp => {
                const originalVertex = allVertices.find(p => p.id === dp.id);
                if (originalVertex) {
                    originalVertex.x = dp.x;
                    originalVertex.y = dp.y;
                }
            });
            
            const verticesThatMoved = new Set(initialDragVertexStates.map(v => v.id));
            const affectedFaces = new Set();
            allFaces.forEach(face => {
                if (face.vertexIds.some(vId => verticesThatMoved.has(vId))) {
                    affectedFaces.add(face);
                }
            });

            if (affectedFaces.size > 0) {
        affectedFaces.forEach(face => {
            const initialSystem = initialCoordSystemStates.get(face.id);
            if (face.localCoordSystem && initialSystem) {
                const faceVertexIds = new Set(face.vertexIds);
                const draggedVertexIds = new Set(initialDragVertexStates.map(v => v.id));
                const isRigidFaceDrag = [...faceVertexIds].every(vId => draggedVertexIds.has(vId));

                if (isRigidFaceDrag) {
                    if (transformIndicatorData) {
                        // This is a rigid transform (rotation, scale, or directional scale)
                        const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
                        const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
                        const newOrigin = U.applyTransformToVertex(initialSystem.origin, center, rotation, scale, directionalScale, startVector);
                        face.localCoordSystem.origin = newOrigin;
                        
                        if (directionalScale) {
                            const p_unit_x_initial = U.localToGlobal({ x: 1, y: 0 }, initialSystem);
                            const p_unit_x_final = U.applyTransformToVertex(p_unit_x_initial, center, rotation, scale, directionalScale, startVector);
                            face.localCoordSystem.scale = U.distance(newOrigin, p_unit_x_final);
                            // Angle remains unchanged in directional scale
                        } else {
                            face.localCoordSystem.angle = U.normalizeAngle(initialSystem.angle + rotation);
                            face.localCoordSystem.scale = initialSystem.scale * scale;
                        }
                    } else {
                        // This is a simple translation of the entire face
                        const delta = {
                            x: dragPreviewVertices[0].x - initialDragVertexStates[0].x,
                            y: dragPreviewVertices[0].y - initialDragVertexStates[0].y
                        };
                        face.localCoordSystem.origin.x = initialSystem.origin.x + delta.x;
                        face.localCoordSystem.origin.y = initialSystem.origin.y + delta.y;
                    }
                } else {
                    // This is a deformation (only some vertices moved)
                    applyCoordinateSystemConstraintsOnDragEnd(face, initialSystem, initialDragVertexStates, dragPreviewVertices, findVertexById);
                }
            }
        });
    }
        }

        const mergeRadius = C.GEOMETRY_CALCULATION_EPSILON;

        const draggedVerticesFinal = [];
        if (copyCount > 1) {
            // Find the final positions of all newly created copy vertices
            const lastCopyIds = new Set(lastCopySelectionIds.vertices);
            allVertices.forEach(v => {
                if (lastCopyIds.has(v.id)) {
                    draggedVerticesFinal.push(v);
                }
            });
            // Also include the original dragged selection
            draggedVerticesFinal.push(...dragPreviewVertices);
        } else {
            draggedVerticesFinal.push(...dragPreviewVertices);
        }

        const initialDraggedIds = new Set(initialDragVertexStates.map(p => p.id));
        const staticEdges = allEdges.filter(edge => !initialDraggedIds.has(edge.id1) && !initialDraggedIds.has(edge.id2));
        const edgesToSplit = new Map();

        if (staticEdges.length > 0) {
            draggedVerticesFinal.forEach(vertex => {
                if (vertex.type !== 'regular') return;

                for (const edge of staticEdges) {
                    const p1 = findVertexById(edge.id1);
                    const p2 = findVertexById(edge.id2);

                    if (p1 && p2) {
                        const closest = U.getClosestPointOnLineSegment(vertex, p1, p2);
                        if (closest.distance < mergeRadius && closest.onSegmentStrict) {
                            const edgeId = U.getEdgeId(edge);
                            if (!edgesToSplit.has(edgeId)) {
                                edgesToSplit.set(edgeId, { edge: edge, pointsToInsert: [] });
                            }
                            // Store the vertex and its precise final position on the edge
                            edgesToSplit.get(edgeId).pointsToInsert.push({ ...vertex, finalPos: {x: closest.x, y: closest.y} });
                            break; 
                        }
                    }
                }
            });
        }
        
        if (edgesToSplit.size > 0) {
            const edgesBefore = JSON.parse(JSON.stringify(allEdges));
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

            edgesToSplit.forEach(({ edge, pointsToInsert }) => {
                allEdges = allEdges.filter(e => U.getEdgeId(e) !== U.getEdgeId(edge));

                const p1 = findVertexById(edge.id1);
                pointsToInsert.sort((a, b) => U.distance(p1, a.finalPos) - U.distance(p1, b.finalPos));
                
                let lastVertexInChain = p1;
                pointsToInsert.forEach(insertData => {
                    const vertexToUpdate = allVertices.find(v => v.id === insertData.id);
                    if(vertexToUpdate) {
                        vertexToUpdate.x = insertData.finalPos.x;
                        vertexToUpdate.y = insertData.finalPos.y;
                    }

                    allEdges.push(U.createEdge(lastVertexInChain, vertexToUpdate, gridInterval, getColorForTarget));
                    lastVertexInChain = vertexToUpdate;
                });

                const p2 = findVertexById(edge.id2);
                allEdges.push(U.createEdge(lastVertexInChain, p2, gridInterval, getColorForTarget));
            });

            updateFaces(edgesBefore, allEdges);
            ensureFaceCoordinateSystems();
        }

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
                if (p1.type === 'regular' && p2.type === 'regular' && U.distance(p1, p2) < mergeRadius) {
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
            const edgesBeforeMerge = JSON.parse(JSON.stringify(allEdges));
            
            const faceCoordSystemBackup = backupFaceCoordinateSystemsBeforeMerge(allFaces, findRoot);

            allEdges.forEach(edge => {
                edge.id1 = findRoot(edge.id1);
                edge.id2 = findRoot(edge.id2);
            });

            allFaces.forEach(face => {
                const remappedVertexIds = face.vertexIds.map(vId => findRoot(vId));
                const uniqueVertexIds = remappedVertexIds.filter((vId, index, self) => self.indexOf(vId) === index);
                
                if (uniqueVertexIds.length < 3) {
                    face.vertexIds = [];
                } else {
                    face.vertexIds = uniqueVertexIds;
                    face.id = U.getFaceId({ vertexIds: uniqueVertexIds });
                }
            });

            allVertices = allVertices.filter(p => !verticesToDelete.has(p.id));

            allEdges = allEdges.filter((e, index, self) =>
                e.id1 !== e.id2 &&
                index === self.findIndex(t => U.getEdgeId(t) === U.getEdgeId(e))
            );
            allFaces = allFaces.filter(f => f.vertexIds.length >= 3);
            
            selectedVertexIds = Array.from(new Set(selectedVertexIds.map(id => findRoot(id)).filter(id => !verticesToDelete.has(id))));
            selectedEdgeIds = Array.from(new Set(selectedEdgeIds.map(id => {
                const [id1, id2] = id.split(C.EDGE_ID_DELIMITER);
                const root1 = findRoot(id1);
                const root2 = findRoot(id2);
                return root1 === root2 ? null : U.getEdgeId({id1: root1, id2: root2});
            }).filter(Boolean)));
            selectedFaceIds = Array.from(new Set(selectedFaceIds.map(id => {
                const face = allFaces.find(f => f.id === id);
                return face ? face.id : null;
            }).filter(Boolean)));
            
            updateFaces(edgesBeforeMerge, allEdges);
            
            allFaces.forEach(face => {
                const backupSystem = faceCoordSystemBackup.get(face.id);
                if (backupSystem) {
                    face.localCoordSystem = backupSystem;
                    
                    if (face.localCoordSystem.attachedToVertex) {
                        const mergedVertexId = findRoot(face.localCoordSystem.attachedToVertex);
                        face.localCoordSystem.attachedToVertex = mergedVertexId;
                        
                        const mergedVertex = allVertices.find(v => v.id === mergedVertexId);
                        if (mergedVertex) {
                            face.localCoordSystem.origin.x = mergedVertex.x;
                            face.localCoordSystem.origin.y = mergedVertex.y;
                        }
                    }
                    if (face.localCoordSystem.attachedToEdge) {
                        face.localCoordSystem.attachedToEdge.v1 = findRoot(face.localCoordSystem.attachedToEdge.v1);
                        face.localCoordSystem.attachedToEdge.v2 = findRoot(face.localCoordSystem.attachedToEdge.v2);
                        
                        const v1 = allVertices.find(v => v.id === face.localCoordSystem.attachedToEdge.v1);
                        const v2 = allVertices.find(v => v.id === face.localCoordSystem.attachedToEdge.v2);
                        if (v1 && v2) {
                            const t = face.localCoordSystem.attachedToEdge.t;
                            face.localCoordSystem.origin.x = v1.x + t * (v2.x - v1.x);
                            face.localCoordSystem.origin.y = v1.y + t * (v2.y - v1.y);
                        }
                    }
                    if (face.localCoordSystem.rotationAlignedToEdge) {
                        face.localCoordSystem.rotationAlignedToEdge.v1 = findRoot(face.localCoordSystem.rotationAlignedToEdge.v1);
                        face.localCoordSystem.rotationAlignedToEdge.v2 = findRoot(face.localCoordSystem.rotationAlignedToEdge.v2);
                    }
                    if (face.localCoordSystem.scaleAttachedToEdge) {
                        face.localCoordSystem.scaleAttachedToEdge.v1 = findRoot(face.localCoordSystem.scaleAttachedToEdge.v1);
                        face.localCoordSystem.scaleAttachedToEdge.v2 = findRoot(face.localCoordSystem.scaleAttachedToEdge.v2);
                    }
                }
            });
            
            ensureFaceCoordinateSystems();
        }

        const finalMovedVertexIds = new Set();
        if (copyCount > 1 && lastCopySelectionIds) {
            lastCopySelectionIds.vertices.forEach(id => finalMovedVertexIds.add(id));
        } else if (dragPreviewVertices.length > 0) {
            dragPreviewVertices.forEach(p => finalMovedVertexIds.add(p.id));
        }

        if (verticesToDelete.size > 0) {
            selectedVertexIds.forEach(id => finalMovedVertexIds.add(id));
        }

        if (finalMovedVertexIds.size > 0) {
            updateAffectedEdgeProperties(Array.from(finalMovedVertexIds), transformIndicatorData);
        }

        initialCoordSystemStates.clear();
        updateFaceHierarchy();
    } else {
        if (actionContext.target === 'ui-icon') {
            // This was a simple click on an icon, already handled by setting activeColorTarget in mouseDown.
        } else {
            const startVertex = findVertexById(previewLineStartVertexId);
            if (isDrawingMode && startVertex) {
            saveStateForUndo();
            const edgesBefore = JSON.parse(JSON.stringify(allEdges));
            const snappedData = getSnappedPosition(startVertex, mousePos, shiftKey);
            let newVertex = null;
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

            if (snappedData.snapType === 'vertex' && snappedData.targetVertex) {
                newVertex = snappedData.targetVertex;
            } else if (snappedData.snapType === 'edge' && snappedData.targetEdge) {
                newVertex = insertVertexOnEdgeWithFaces(snappedData.targetEdge, { x: snappedData.x, y: snappedData.y }, gridInterval, getColorForTarget);
            } else {
                let newVertexColor = getColorForTarget(C.COLOR_TARGET_VERTEX);
                const colorIndex = colorAssignments[C.COLOR_TARGET_VERTEX];
                if (colorIndex !== -1) {
                    const colorItem = allColors[colorIndex];
                    if (colorItem && colorItem.type === 'colormap') {
                        newVertexColor = U.sampleColormap(colorItem, 0.5);
                    }
                }

                newVertex = { id: U.generateUniqueId(), x: snappedData.x, y: snappedData.y, type: 'regular', color: newVertexColor };
                allVertices.push(newVertex);
            }

            if (newVertex) {
                const edgeExists = allEdges.some(e => (e.id1 === startVertex.id && e.id2 === newVertex.id) || (e.id2 === startVertex.id && e.id1 === newVertex.id));
                if (!edgeExists) {
                    const newEdge = U.createEdge(startVertex, newVertex, gridInterval, getColorForTarget);
                    allEdges.push(newEdge);
                    updateFaces(edgesBefore, allEdges);
                    updateFaceHierarchy();

                    // Assign colors to any newly created faces
                    allFaces.forEach(face => {
                        if (!face.color) {
                            face.color = getColorForTarget(C.COLOR_TARGET_FACE);
                        }
                    });
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
                saveStateForUndo();
                const startCoords = ghostVertexPosition ? ghostVertexPosition : screenToData(mousePos);
                
                // For the first vertex in a new drawing sequence, always use the first color of the colormap
                let newVertexColor = getColorForTarget(C.COLOR_TARGET_VERTEX);
                const colorIndex = colorAssignments[C.COLOR_TARGET_VERTEX];
                if (colorIndex !== -1) {
                    const colorItem = allColors[colorIndex];
                    if (colorItem && colorItem.type === 'colormap') {
                        newVertexColor = U.sampleColormap(colorItem, 0);
                    }
                }

                const newVertex = { id: U.generateUniqueId(), ...startCoords, type: 'regular', color: newVertexColor };
                allVertices.push(newVertex);
                isDrawingMode = true;
                previewLineStartVertexId = newVertex.id;
                drawingSequence = [];
                currentSequenceIndex = 0;
                currentDrawingPath = [newVertex.id];
                window.currentDrawingPath = currentDrawingPath;
            } else {
                if (targetVertex || targetEdge || targetFace) {
                    saveStateForUndo();    
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

                    const newActiveTargets = [];
                    if (selectedFaceIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_FACE);
                    if (selectedEdgeIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_EDGE);
                    if (selectedVertexIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_VERTEX);

                    if (newActiveTargets.length > 0) {
                        activeColorTargets = newActiveTargets;
                    }
                }
            }
        } 
    }

    isActionInProgress = false;
    isDragConfirmed = false;
    isPanningBackground = false;
    isRectangleSelecting = false;
    actionContext = null;
    transformIndicatorData = null;

    // Only reset the cursor if we are NOT in the middle of placing a transform
    if (!isPlacingTransform) {
        canvas.style.cursor = 'crosshair';
    }

    if (!currentShiftPressed) ghostVertexPosition = null;
}

function updateAffectedEdgeProperties(movedVertexIds, transformIndicatorData) {
    if (movedVertexIds.length === 0) return;

    // For rotation or translation, properties are preserved, so we do nothing.
    const isRotation = transformIndicatorData && transformIndicatorData.transformType === C.TRANSFORMATION_TYPE_ROTATION;
    const isTranslation = !transformIndicatorData;
    if (isRotation || isTranslation) {
        return;
    }

    const affectedEdges = new Set();
    movedVertexIds.forEach(vertexId => {
        findNeighborEdges(vertexId).forEach(edge => affectedEdges.add(edge));
    });

    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    // For scaling, we recalculate the property for each affected edge.
    affectedEdges.forEach(edge => {
        const v1 = findVertexById(edge.id1);
        const v2 = findVertexById(edge.id2);
        if (!v1 || !v2) return;

        const deltaX = v1.x - v2.x;
        const deltaY = v1.y - v2.y;
        const dx_grid_float = deltaX / gridInterval;
        const dy_grid_float = deltaY / gridInterval;
        const epsilon = 1e-5;

        const isGridVector = gridInterval &&
            Math.abs(dx_grid_float - Math.round(dx_grid_float)) < epsilon &&
            Math.abs(dy_grid_float - Math.round(dy_grid_float)) < epsilon;

        if (isGridVector) {
            edge.labelMode = 'exact';
            const dx_grid = Math.round(dx_grid_float);
            const dy_grid = Math.round(dy_grid_float);
            edge.exactValue = {
                g2gSquaredSum: dx_grid * dx_grid + dy_grid * dy_grid,
                gridInterval: gridInterval
            };
        } else {
            edge.labelMode = 'decimal';
            delete edge.exactValue;
        }
    });
}

function handleRightMouseButtonDown(event) {
    isActionInProgress = true;
    isRectangleSelecting = false; 
    rectangleSelectStartPos = actionStartPos;
    actionContext = {
        target: 'canvas',
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey || event.metaKey
    };
}

function handleRightMouseButtonUp(event) {
    if (isDragConfirmed && isRectangleSelecting) {
        const dataP1 = screenToData({ x: Math.min(actionStartPos.x, mousePos.x), y: Math.min(actionStartPos.y, mousePos.y) });
        const dataP2 = screenToData({ x: Math.max(actionStartPos.x, mousePos.x), y: Math.max(actionStartPos.y, mousePos.y) });
        const minX = Math.min(dataP1.x, dataP2.x);
        const maxX = Math.max(dataP1.x, dataP2.x);
        const minY = Math.min(dataP1.y, dataP2.y);
        const maxY = Math.max(dataP1.y, dataP2.y);
        
        const verticesInRect = allVertices.filter(p => p.type === 'regular' && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY).map(p => p.id);
        const centersInRect = allVertices.filter(p => p.type !== 'regular' && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY).map(p => p.id);
        const allVerticesInRectIds = new Set(verticesInRect);
        const edgesInRect = allEdges.filter(e => allVerticesInRectIds.has(e.id1) && allVerticesInRectIds.has(e.id2)).map(e => U.getEdgeId(e));
        const facesInRect = allFaces.filter(f => f.vertexIds.every(vId => allVerticesInRectIds.has(vId))).map(f => U.getFaceId(f));

        if (actionContext.shiftKey) {
            // Add to selection
            selectedVertexIds = [...new Set([...selectedVertexIds, ...verticesInRect])];
            selectedEdgeIds = [...new Set([...selectedEdgeIds, ...edgesInRect])];
            selectedFaceIds = [...new Set([...selectedFaceIds, ...facesInRect])];
            selectedCenterIds = [...new Set([...selectedCenterIds, ...centersInRect])];
        } else if (actionContext.ctrlKey) {
            // Toggle selection
            verticesInRect.forEach(id => {
                const index = selectedVertexIds.indexOf(id);
                if (index > -1) selectedVertexIds.splice(index, 1); else selectedVertexIds.push(id);
            });
            edgesInRect.forEach(id => {
                const index = selectedEdgeIds.indexOf(id);
                if (index > -1) selectedEdgeIds.splice(index, 1); else selectedEdgeIds.push(id);
            });
            facesInRect.forEach(id => {
                const index = selectedFaceIds.indexOf(id);
                if (index > -1) selectedFaceIds.splice(index, 1); else selectedFaceIds.push(id);
            });
            centersInRect.forEach(id => {
                const index = selectedCenterIds.indexOf(id);
                if (index > -1) selectedCenterIds.splice(index, 1); else selectedCenterIds.push(id);
            });
        } else {
            // Replace entire selection
            selectedVertexIds = verticesInRect;
            selectedEdgeIds = edgesInRect;
            selectedFaceIds = facesInRect;
            selectedCenterIds = centersInRect;
        }

        const newActiveTargets = [];
        if (selectedFaceIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_FACE);
        if (selectedEdgeIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_EDGE);
        if (selectedVertexIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_VERTEX);

        if (newActiveTargets.length > 0) {
            activeColorTargets = newActiveTargets;
            if (isColorPaletteExpanded) {
                buildColorPaletteUI();
            }
        }
    } else {
        // This is a simple right-click (not a drag), so show the context menu.
        showContextMenu(event);
    }
}

function handleMouseDownDispatcher(event) {
    if (contextMenu.style.display === 'block') {
        contextMenu.style.display = 'none';
    }

    const targetElement = event.target;
    if (targetElement && targetElement.closest('.katex')) {
        event.stopPropagation();
        return;
    }

    if ((isDrawingMode || isPlacingTransform) && event.button === 2) {
        performEscapeAction();
        event.preventDefault();
        return;
    }

    mousePos = U.getMousePosOnCanvas(event, canvas);
    actionStartPos = { ...mousePos };
    currentMouseButton = event.button;

    if (currentMouseButton === 0) {
        handleLeftMouseButtonDown(event);
    } else if (currentMouseButton === 2) {
        handleRightMouseButtonDown(event);
    }
}

function handleMouseUpDispatcher(event) {
    if (currentMouseButton === 0) {
        handleLeftMouseButtonUp(event);
    } else if (currentMouseButton === 2) {
        handleRightMouseButtonUp(event);
    }

    isActionInProgress = false;
    isDragConfirmed = false;
    isPanningBackground = false;
    isRectangleSelecting = false;
    actionContext = null;
    transformIndicatorData = null;
    
    // Only reset the cursor if we are NOT in the middle of placing a transform
    if (!isPlacingTransform) {
        canvas.style.cursor = 'crosshair';
    }

    if (!currentShiftPressed) ghostVertexPosition = null;
}

function handleAddFaceFromMenu() {
    if (contextMenuFaceId) {
        saveStateForUndo();
        let faceToModify = allFaces.find(f => f.id === contextMenuFaceId);

        if (faceToModify) {
            // Face exists as a hole; restore its color and parentage.
            faceToModify.color = getColorForTarget(C.COLOR_TARGET_FACE);
            updateFaceHierarchy();
        } else {
            // Face does not exist; create and add it.
            const allPossibleFaces = U.detectClosedPolygons(allEdges, findVertexById);
            const faceToAdd = allPossibleFaces.find(f => f.id === contextMenuFaceId);
            if (faceToAdd) {
                faceToAdd.color = getColorForTarget(C.COLOR_TARGET_FACE);
                allFaces.push(faceToAdd);
                updateFaceHierarchy();
                ensureFaceCoordinateSystems();
            }
        }
        contextMenuFaceId = null;
    }
    contextMenu.style.display = 'none';
}

function getDescendantFaces(faceId, allFaces) {
    const descendants = [];
    const startFace = allFaces.find(f => f.id === faceId);
    if (!startFace) return [];

    const queue = [...(startFace.childFaceIds || [])];
    const visited = new Set(startFace.childFaceIds);

    while (queue.length > 0) {
        const currentId = queue.shift();
        const currentFace = allFaces.find(f => f.id === currentId);
        if (currentFace) {
            descendants.push(currentFace);
            if (currentFace.childFaceIds) {
                currentFace.childFaceIds.forEach(childId => {
                    if (!visited.has(childId)) {
                        visited.add(childId);
                        queue.push(childId);
                    }
                });
            }
        }
    }
    return descendants;
}

function applyCoordinateSystemConstraintsOnDragEnd(face, initialSystem, initialDragVertexStates, dragPreviewVertices, findVertexById) {
    // This function now correctly solves constraints based on the final vertex positions (dragPreviewVertices)
    // without incorrectly checking against the initial set of dragged vertices.

    if (!initialSystem.isCustom) {
        const faceVertices = face.vertexIds.map(id => {
            return dragPreviewVertices.find(p => p.id === id) || findVertexById(id);
        }).filter(v => v && v.type === 'regular');
        
        if (faceVertices.length >= 3) {
            const incircle = U.calculateIncenter(faceVertices);
            if (incircle) {
                face.localCoordSystem.origin = incircle.center;
                face.localCoordSystem.scale = incircle.radius;
            }
        }
        return;
    }

    let finalOrigin = { ...initialSystem.origin };
    let finalAngle = initialSystem.angle;
    let finalScale = initialSystem.scale;
    
    if (face.localCoordSystem.attachedToVertex) {
        const finalVertex = dragPreviewVertices.find(p => p.id === face.localCoordSystem.attachedToVertex);
        if (finalVertex) {
            finalOrigin = { x: finalVertex.x, y: finalVertex.y };
        }
    } else if (face.localCoordSystem.attachedToEdge) {
        const finalV1 = dragPreviewVertices.find(p => p.id === face.localCoordSystem.attachedToEdge.v1) || findVertexById(face.localCoordSystem.attachedToEdge.v1);
        const finalV2 = dragPreviewVertices.find(p => p.id === face.localCoordSystem.attachedToEdge.v2) || findVertexById(face.localCoordSystem.attachedToEdge.v2);
        
        if (finalV1 && finalV2) {
            finalOrigin = {
                x: finalV1.x + face.localCoordSystem.attachedToEdge.t * (finalV2.x - finalV1.x),
                y: finalV1.y + face.localCoordSystem.attachedToEdge.t * (finalV2.y - finalV1.y)
            };
        }
    }
    
    if (face.localCoordSystem.rotationAlignedToEdge) {
        const finalV1 = dragPreviewVertices.find(p => p.id === face.localCoordSystem.rotationAlignedToEdge.v1) || findVertexById(face.localCoordSystem.rotationAlignedToEdge.v1);
        const finalV2 = dragPreviewVertices.find(p => p.id === face.localCoordSystem.rotationAlignedToEdge.v2) || findVertexById(face.localCoordSystem.rotationAlignedToEdge.v2);
        
        if (finalV1 && finalV2) {
            const newEdgeAngle = Math.atan2(finalV2.y - finalV1.y, finalV2.x - finalV1.x);
            const originalEdgeAngle = face.localCoordSystem.rotationAlignedToEdge.originalAngle;
            const originalSystemAngle = face.localCoordSystem.rotationAlignedToEdge.originalSystemAngle;
            
            const angleOffset = originalSystemAngle - originalEdgeAngle;
            finalAngle = U.normalizeAngle(newEdgeAngle + angleOffset);
            
            face.localCoordSystem.rotationAlignedToEdge.originalAngle = newEdgeAngle;
            face.localCoordSystem.rotationAlignedToEdge.originalSystemAngle = finalAngle;
        }
    }
    
    if (face.localCoordSystem.scaleAttachedToEdge) {
        const finalV1 = dragPreviewVertices.find(p => p.id === face.localCoordSystem.scaleAttachedToEdge.v1) || findVertexById(face.localCoordSystem.scaleAttachedToEdge.v1);
        const finalV2 = dragPreviewVertices.find(p => p.id === face.localCoordSystem.scaleAttachedToEdge.v2) || findVertexById(face.localCoordSystem.scaleAttachedToEdge.v2);
        
        if (finalV1 && finalV2) {
            const newEdgeLength = U.distance(finalV1, finalV2);
            finalScale = newEdgeLength * face.localCoordSystem.scaleAttachedToEdge.scaleRatio;
            face.localCoordSystem.scaleAttachedToEdge.originalLength = newEdgeLength;
        }
    }
    
    const finalFaceVertices = face.vertexIds.map(id => {
        return dragPreviewVertices.find(p => p.id === id) || findVertexById(id);
    }).filter(v => v && v.type === 'regular');
    
    if (finalFaceVertices.length >= 3) {
        face.localCoordSystem.origin = U.clampPointToPolygon(finalOrigin, finalFaceVertices);
        face.localCoordSystem.angle = finalAngle;
        face.localCoordSystem.scale = Math.max(0.01, finalScale);
        face.localCoordSystem.isCustom = true;
    }
}

function backupFaceCoordinateSystemsBeforeMerge(allFaces, findRoot) {
    const faceCoordSystemBackup = new Map();
    allFaces.forEach(face => {
        const remappedVertexIds = [...new Set(face.vertexIds.map(vId => findRoot(vId)))];
        if (remappedVertexIds.length >= 3) {
            const newFaceId = U.getFaceId({ vertexIds: remappedVertexIds });
            if (face.localCoordSystem && face.localCoordSystem.isCustom) {
                const backup = JSON.parse(JSON.stringify(face.localCoordSystem));

                if (backup.attachedToVertex) {
                    backup.attachedToVertex = findRoot(backup.attachedToVertex);
                }
                if (backup.attachedToEdge) {
                    backup.attachedToEdge.v1 = findRoot(backup.attachedToEdge.v1);
                    backup.attachedToEdge.v2 = findRoot(backup.attachedToEdge.v2);
                }
                if (backup.rotationAlignedToEdge) {
                    backup.rotationAlignedToEdge.v1 = findRoot(backup.rotationAlignedToEdge.v1);
                    backup.rotationAlignedToEdge.v2 = findRoot(backup.rotationAlignedToEdge.v2);
                }
                if (backup.scaleAttachedToEdge) {
                    backup.scaleAttachedToEdge.v1 = findRoot(backup.scaleAttachedToEdge.v1);
                    backup.scaleAttachedToEdge.v2 = findRoot(backup.scaleAttachedToEdge.v2);
                }

                faceCoordSystemBackup.set(newFaceId, backup);
            }
        }
    });
    return faceCoordSystemBackup;
}

function handleKeyUp(event) {
    if (event.key === 'Shift') {
        currentShiftPressed = false;
        ghostVertexPosition = null;
        placingSnapPos = null;
        ghostVertices = [];
        
        if (isDraggingCoordSystem && draggedCoordSystemElement && draggedCoordSystemElement.type === 'center') {
            const mouseDataPos = screenToData(mousePos);
            const face = draggedCoordSystemElement.face;
            const coordSystem = face.localCoordSystem;
            const faceVertices = face.vertexIds.map(id => findVertexById(id)).filter(p => p && p.type === 'regular');
            const clampedPos = U.clampPointToPolygon(mouseDataPos, faceVertices);
            coordSystem.origin.x = clampedPos.x;
            coordSystem.origin.y = clampedPos.y;
            coordSystem.isCustom = true;
        }
    }
}

function handleRemoveFaceAndChildrenFromMenu() {
    if (contextMenuFaceId) {
        saveStateForUndo();
        const face = allFaces.find(f => f.id === contextMenuFaceId);
        if (face) {
            // 1. Get all descendants (children, grandchildren, etc.)
            const descendantFaces = getDescendantFaces(face.id, allFaces);
            const descendantFaceIds = new Set(descendantFaces.map(df => df.id));
            const descendantVertexIds = new Set();
            descendantFaces.forEach(df => {
                df.vertexIds.forEach(vId => descendantVertexIds.add(vId));
            });

            // 2. Remove all descendant vertices
            allVertices = allVertices.filter(v => !descendantVertexIds.has(v.id));

            // 3. Remove all edges connected to the now-deleted descendant vertices
            allEdges = allEdges.filter(e => !descendantVertexIds.has(e.id1) && !descendantVertexIds.has(e.id2));

            // 4. Remove the parent face and all descendant faces from the faces list
            const allFaceIdsToRemove = new Set([face.id, ...descendantFaceIds]);
            allFaces = allFaces.filter(f => !allFaceIdsToRemove.has(f.id));

            // 5. Clear selection to avoid dangling references
            performEscapeAction();
        }
        contextMenuFaceId = null;
    }
    contextMenu.style.display = 'none';
}

function showContextMenu(event) {
    contextMenu.innerHTML = '';
    contextMenu.style.display = 'none';
    mousePos = U.getMousePosOnCanvas(event, canvas);

    // --- Selection Logic on Right-Click ---
    const clickedVertex = findClickedVertex(mousePos);
    const clickedEdge = !clickedVertex ? findClickedEdge(mousePos) : null;
    const clickedFace = !clickedVertex && !clickedEdge ? findClickedFace(mousePos) : null;
    const clickedItem = clickedVertex || clickedEdge || clickedFace;

    if (clickedItem) {
        let wasSelected = false;
        if (clickedVertex) wasSelected = selectedVertexIds.includes(clickedVertex.id);
        else if (clickedEdge) wasSelected = selectedEdgeIds.includes(U.getEdgeId(clickedEdge));
        else if (clickedFace) wasSelected = selectedFaceIds.includes(U.getFaceId(clickedFace));

        if (!wasSelected) {
            selectedVertexIds = [];
            selectedEdgeIds = [];
            selectedFaceIds = [];
            selectedCenterIds = [];
            if (clickedVertex) selectedVertexIds = [clickedVertex.id];
            else if (clickedEdge) selectedEdgeIds = [U.getEdgeId(clickedEdge)];
            else if (clickedFace) selectedFaceIds = [U.getFaceId(clickedFace)];
        }
    } else {
        performEscapeAction();
    }
    // --- End of Selection Logic ---

    const dataPos = screenToData(mousePos);
    let menuItems = [];
    contextMenuFaceId = null;
    contextMenuEdgeId = null;
    contextMenuVertexId = null;

    const selectionTypeCount =
        (selectedVertexIds.length > 0 ? 1 : 0) +
        (selectedEdgeIds.length > 0 ? 1 : 0) +
        (selectedFaceIds.length > 0 ? 1 : 0);

    // Re-check clicked item after selection has been finalized
    const finalClickedVertex = findClickedVertex(mousePos);
    const finalClickedEdge = !finalClickedVertex ? findClickedEdge(mousePos) : null;

    if (finalClickedVertex && finalClickedVertex.type === 'regular') {
        contextMenuVertexId = finalClickedVertex.id;
        const removeText = selectionTypeCount > 1 ? "Remove Geometry" : "Remove Vertex";
        menuItems.push({ text: removeText, handler: handleRemoveVertexFromMenu });
    } else if (finalClickedEdge) {
        contextMenuEdgeId = U.getEdgeId(finalClickedEdge);
        const removeText = selectionTypeCount > 1 ? "Remove Geometry" : "Remove Edge";
        menuItems.push({ text: removeText, handler: handleRemoveEdgeFromMenu });
    } else {
        const finalClickedFace = findClickedFace(mousePos);
        if (finalClickedFace) {
            contextMenuFaceId = U.getFaceId(finalClickedFace);
            const removeText = selectionTypeCount > 1 ? "Remove Geometry" : "Remove Face";
            menuItems.push({ text: removeText, handler: handleRemoveFaceFromMenu });
            if (finalClickedFace.childFaceIds && finalClickedFace.childFaceIds.length > 0) {
                menuItems.push({ text: 'Remove Face and Children', handler: handleRemoveFaceAndChildrenFromMenu });
            }
        } else {
            const allPossibleFaces = U.detectClosedPolygons(allEdges, findVertexById);
            let smallestPotentialFace = null;
            let smallestArea = Infinity;
            allPossibleFaces.forEach(loop => {
                const vertices = loop.vertexIds.map(id => findVertexById(id));
                if (vertices.every(Boolean) && U.isVertexInPolygon(dataPos, vertices)) {
                    const area = Math.abs(U.shoelaceArea(vertices));
                    if (area < smallestArea) {
                        smallestArea = area;
                        smallestPotentialFace = loop;
                    }
                }
            });
            if (smallestPotentialFace) {
                contextMenuFaceId = smallestPotentialFace.id || U.getFaceId(smallestPotentialFace);
                menuItems.push({ text: 'Add Face', handler: handleAddFaceFromMenu });
            }
        }
    }

    if (menuItems.length > 0) {
        const ul = document.createElement('ul');
        menuItems.forEach(itemData => {
            const li = document.createElement('li');
            li.textContent = itemData.text;
            li.addEventListener('click', itemData.handler);
            ul.appendChild(li);
        });
        contextMenu.appendChild(ul);
        contextMenu.style.left = `${event.clientX - C.CONTEXT_MENU_INSET}px`;
        contextMenu.style.top = `${event.clientY - C.CONTEXT_MENU_INSET}px`;
        contextMenu.style.display = 'block';
    }
}

function handleRemoveVertexFromMenu() {
    if (contextMenuVertexId) {
        saveStateForUndo();

        // Check if the right-clicked vertex was already part of a selection.
        const wasVertexSelected = selectedVertexIds.includes(contextMenuVertexId);
        
        if (wasVertexSelected) {
            // If it was selected, the "Remove" action applies to the entire existing selection.
            // We don't need to change the selection arrays.
        } else {
            // If it was not selected, the action applies only to this newly right-clicked vertex.
            selectedEdgeIds = [];
            selectedFaceIds = [];
            selectedCenterIds = [];
            selectedVertexIds = [contextMenuVertexId];
        }

        deleteSelectedItems(); // This now operates on the correct selection set.
        contextMenuVertexId = null;
    }
    contextMenu.style.display = 'none';
}

function handleRemoveEdgeFromMenu() {
    if (contextMenuEdgeId) {
        saveStateForUndo();
        
        // Check if the right-clicked edge was already part of the selection.
        const wasEdgeSelected = selectedEdgeIds.includes(contextMenuEdgeId);
        
        if (!wasEdgeSelected) {
            // If it was not selected, clear the old selection.
            selectedVertexIds = [];
            selectedFaceIds = [];
            selectedCenterIds = [];
            selectedEdgeIds = [contextMenuEdgeId];
        }
        // If it was already selected, do nothing to preserve the multi-selection.

        deleteSelectedItems();
        contextMenuEdgeId = null;
    }
    contextMenu.style.display = 'none';
}

function handleRemoveFaceFromMenu() {
    if (contextMenuFaceId) {
        saveStateForUndo();

        // Check if the right-clicked face was already part of the selection.
        const wasFaceSelected = selectedFaceIds.includes(contextMenuFaceId);

        if (!wasFaceSelected) {
            // If it was not selected, clear the old selection.
            selectedVertexIds = [];
            selectedEdgeIds = [];
            selectedCenterIds = [];
            selectedFaceIds = [contextMenuFaceId];
        }
        // If it was already selected, do nothing to preserve the multi-selection.

        deleteSelectedItems();
        contextMenuFaceId = null;
    }
    contextMenu.style.display = 'none';
}

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

window.addEventListener('contextmenu', (event) => event.preventDefault());

canvas.addEventListener('mousemove', handleMouseMove);

canvas.addEventListener("mouseup", handleMouseUpDispatcher);

canvas.addEventListener('mousedown', handleMouseDownDispatcher);

window.addEventListener('keyup', handleKeyUp);

window.addEventListener('keydown', handleKeyDown);

window.addEventListener('resize', resizeCanvas);

window.addEventListener('load', () => {
    initializeApp();
});