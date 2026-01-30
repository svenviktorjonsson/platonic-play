import ColormapSelector from './node_modules/colormap-selector/ColormapSelector.js';
import './node_modules/colormap-selector/styles.css';
import InterpolationEditor from './node_modules/interpolation-editor/interpolation-editor.js';
import './node_modules/interpolation-editor/style.css';
import { renderStringToElement, formatStringToMathDisplay } from 'katex-renderer';

import * as S from './snap.js';
import * as C from './constants.js';
import * as U from './utils.js';
import * as R from './renderer.js';

const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const htmlOverlay = document.getElementById('html-overlay');
const dpr = window.devicePixelRatio || 1;
const activeHtmlLabels = new Map();
const DEFAULT_TEXT_FONT_SIZE = 18;
const TEXT_EDGE_MARGIN_PX = 8;
const TEXT_VERTEX_OFFSET_PX = { x: 12, y: -12 };
const TEXT_BACKGROUND_OFFSET_PX = { x: 8, y: -8 };
let textEditorState = { activeId: null, inputEl: null };
const DEFAULT_INTERPOLATION_STYLE = {
    id: 'linear',
    name: 'Linear',
    type: 'linear',
    cornerHandling: 'pass_through',
    tension: 0,
    radiusMode: 'relative',
    radiusValue: 0.25
};
const STORAGE_PREFIX = 'platonic-play';
const STORAGE_VERSION = 1;
const STORAGE_USER_ID_KEY = `${STORAGE_PREFIX}.user-id`;
let activeUserId = null;
let persistTimeoutId = null;
let didRestoreFromStorage = false;
let colorEditor;
let interpolationEditor;
let interpolationStyles = [JSON.parse(JSON.stringify(DEFAULT_INTERPOLATION_STYLE))];
let activeInterpolationStyleId = DEFAULT_INTERPOLATION_STYLE.id;
const canvasUI = {
    toolbarButton: null,
    mainToolbar: null,
    colorToolButton: null,
    colorSwatches: [],
    addColorButton: null,
    colorModeToolButton: null,
    colorModeIcons: [],
    colorModePanelBounds: null,
    interpolationToolButton: null,
    interpolationIcons: [],
    transformToolButton: null,
    transformIcons: [],
    displayToolButton: null,
    displayIcons: [],
    themeToggleButton: null,
    symmetryToolButton: null,
    symmetryIcons: [],
    sessionsToolButton: null,
    sessionIcons: [],
    addSessionButton: null,
    removeSessionButton: null,
    sessionsPanelBounds: null
};

let contextMenu;
let contextMenuVertexId = null;
let contextMenuEdgeId = null;
let contextMenuFaceId = null;
let componentDrawOrder = [];

let drawingSnapLabelInfo = null;
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
let isInterpolationPanelExpanded = false;
let isSessionsPanelExpanded = false;
let isColorModePanelExpanded = false;
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
let hoveredTextId = null;
let isEdgeTransformDrag = false;
let isDraggingCenter = false;
let allVertices = [];
let allEdges = [];
let allFaces = [];
let allTextElements = [];
let snappedEdgeIds = new Map();
let snappedVertexIds = new Map();
let selectedVertexIds = [];
let selectedEdgeIds = [];
let selectedFaceIds = [];
let selectedTextIds = [];
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
let altHoverInfo = null;
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
let initialDragTextStates = [];
let dragPreviewTextStates = [];
let currentShiftPressed = false;
let clipboard = { vertices: [], edges: [], faces: [], texts: [], referenceVertex: null };
let clickData = { targetId: null, type: null, count: 0, timestamp: 0 };
let interpolationClickData = { id: null, timestamp: 0 };
let undoStack = [];
let sessions = [];
let activeSessionIndex = 0;
let selectedSessionIndex = 0;
let sessionClipboard = null;
let sessionUndoStack = [];
let edgeColorMode = 'fixed';
let faceColorMode = 'fixed';
let edgeColorExpression = 'x';
let faceColorExpression = 'x';
let faceColorPolarExpression = 'r';
let edgeExpressionInput = null;
let faceExpressionInput = null;
let currentAltPressed = false;
let ghostVertexSnapType = null;

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
let isDraggingSession = false;
let draggedSessionInfo = null;

let colorAssignments = {
    [C.COLOR_TARGET_VERTEX]: 0,
    [C.COLOR_TARGET_EDGE]: 1,
    [C.COLOR_TARGET_FACE]: 2,
    [C.COLOR_TARGET_TEXT]: 0,
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

function getColorForTarget(targetType, index = 0, total = 1) {
    let colorIndex = colorAssignments[targetType];

    // Safeguard: If the index is invalid for any reason, default to the first color.
    if (colorIndex < 0 || colorIndex >= allColors.length) {
        colorIndex = 0;
    }

    const item = allColors[colorIndex];
    if (item?.type === 'color') {
        return item.value;
    } else if (item?.type === 'colormap') {
        const t = total > 1 ? index / (total - 1) : 0.5;
        return U.sampleColormap(item, t);
    }
    
    // Fallback to theme defaults if something is still wrong
    const colors = getColors();
    if (targetType === C.COLOR_TARGET_VERTEX) return colors.vertex;
    if (targetType === C.COLOR_TARGET_EDGE) return colors.edge;
    if (targetType === C.COLOR_TARGET_FACE) return colors.face;
    if (targetType === C.COLOR_TARGET_TEXT) return colors.uiTextDefault || colors.geometryInfoText;
    
    return colors.vertex;
}

function syncColorAssignmentsForInheritance() {
    if (edgeColorMode === 'inherit_vertices') {
        colorAssignments[C.COLOR_TARGET_EDGE] = colorAssignments[C.COLOR_TARGET_VERTEX];
    }
    if (faceColorMode === 'inherit_vertices') {
        colorAssignments[C.COLOR_TARGET_FACE] = colorAssignments[C.COLOR_TARGET_VERTEX];
    } else if (faceColorMode === 'inherit_edges') {
        colorAssignments[C.COLOR_TARGET_FACE] = colorAssignments[C.COLOR_TARGET_EDGE];
    }
}

function normalizeActiveColorTargets() {
    // Keep targets visible even when inherited.
}

function getInheritedBaseTarget(target) {
    if (target === C.COLOR_TARGET_EDGE && edgeColorMode === 'inherit_vertices') {
        return C.COLOR_TARGET_VERTEX;
    }
    if (target === C.COLOR_TARGET_FACE) {
        if (faceColorMode === 'inherit_vertices') return C.COLOR_TARGET_VERTEX;
        if (faceColorMode === 'inherit_edges') return C.COLOR_TARGET_EDGE;
    }
    return target;
}

function getDependentTargets(baseTarget) {
    const dependents = [];
    if (baseTarget === C.COLOR_TARGET_VERTEX) {
        if (edgeColorMode === 'inherit_vertices') dependents.push(C.COLOR_TARGET_EDGE);
        if (faceColorMode === 'inherit_vertices') dependents.push(C.COLOR_TARGET_FACE);
    }
    if (baseTarget === C.COLOR_TARGET_EDGE && faceColorMode === 'inherit_edges') {
        dependents.push(C.COLOR_TARGET_FACE);
    }
    return dependents;
}

function applyColorModeDefaults() {
    if (edgeColorMode === 'fixed') {
        const fallbackColor = getColorForTarget(C.COLOR_TARGET_EDGE);
        allEdges.forEach(edge => {
            edge.color = edge.color || fallbackColor;
            delete edge.colormapItem;
            delete edge.gradientStart;
            delete edge.gradientEnd;
        });
    }
    if (faceColorMode === 'fixed') {
        const fallbackColor = getColorForTarget(C.COLOR_TARGET_FACE);
        allFaces.forEach(face => {
            face.color = face.color || fallbackColor;
            delete face.colormapItem;
            delete face.colormapDistribution;
        });
    }
    if (faceColorMode.startsWith('colormap')) {
        const colorIndex = colorAssignments[C.COLOR_TARGET_FACE];
        const colorItem = allColors[colorIndex];
        if (colorItem && colorItem.type === 'colormap') {
            allFaces.forEach(face => {
                face.colormapItem = face.colormapItem || colorItem;
                face.colormapDistribution = 'x';
            });
        }
    }
}

function applyColorsToSelection() {

    activeColorTargets.forEach(target => {
        const colorIndex = colorAssignments[target];

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
            if (edgeColorMode === 'colormap' && colorItem && colorItem.type === 'colormap') {
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
                const color = colorItem && colorItem.type === 'colormap'
                    ? U.sampleColormap(colorItem, 0.5)
                    : getColorForTarget(C.COLOR_TARGET_EDGE);
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
            if (faceColorMode === 'inherit_vertices' || faceColorMode === 'inherit_edges') {
                return;
            }
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
                if (faceColorMode.startsWith('colormap') && colorItem && colorItem.type === 'colormap') {
                    allFaces.forEach(face => {
                        if (selectedFaceIds.includes(U.getFaceId(face))) {
                            face.colormapItem = colorItem;
                            face.colormapDistribution = 'x'; // Default to x-direction
                            delete face.color;
                        }
                    });
                } else {
                    const color = colorItem && colorItem.type === 'colormap'
                        ? U.sampleColormap(colorItem, 0.5)
                        : getColorForTarget(C.COLOR_TARGET_FACE);
                    allFaces.forEach(face => {
                        if (selectedFaceIds.includes(U.getFaceId(face))) {
                            face.color = color;
                            delete face.colormapItem;
                            delete face.colormapDistribution;
                        }
                    });
                }
            }
        } else if (target === C.COLOR_TARGET_TEXT) {
            const colorItem = allColors[colorIndex];
            if (colorItem && colorItem.type === 'colormap') {
                selectedTextIds.forEach((id, index) => {
                    const textElement = getTextElementById(id);
                    if (!textElement) return;
                    const t = selectedTextIds.length > 1 ? index / (selectedTextIds.length - 1) : 0.5;
                    textElement.color = U.sampleColormap(colorItem, t);
                });
            } else {
                const color = getColorForTarget(C.COLOR_TARGET_TEXT);
                selectedTextIds.forEach(id => {
                    const textElement = getTextElementById(id);
                    if (textElement) {
                        textElement.color = color;
                    }
                });
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
        el.style.lineHeight = '1';
        el.style.display = 'inline-block';
        el.style.padding = '0';
        el.style.pointerEvents = 'none';

        const contentEl = document.createElement('div');
        contentEl.style.display = 'inline-block';
        contentEl.style.position = 'relative';
        contentEl.style.overflow = 'visible';

        const katexEl = document.createElement('div');
        katexEl.style.display = 'inline-block';
        katexEl.style.whiteSpace = 'nowrap';
        katexEl.style.lineHeight = '1';

        contentEl.appendChild(katexEl);

        el.appendChild(contentEl);
        el.contentEl = contentEl;
        el.katexEl = katexEl;
        htmlOverlay.appendChild(el);
        activeHtmlLabels.set(id, el);
    } else if (!el.contentEl || !el.katexEl) {
        const contentEl = document.createElement('div');
        contentEl.style.display = 'inline-block';
        contentEl.style.position = 'relative';
        contentEl.style.overflow = 'visible';

        const katexEl = document.createElement('div');
        katexEl.style.display = 'inline-block';
        katexEl.style.whiteSpace = 'nowrap';
        katexEl.style.lineHeight = '1';

        contentEl.appendChild(katexEl);
        el.textContent = '';
        el.appendChild(contentEl);
        el.contentEl = contentEl;
        el.katexEl = katexEl;
        el.katexContent = null;
        el.style.pointerEvents = 'none';
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

    const safeContent = (content === null || content === undefined) ? '' : String(content);
    const normalizedContent = formatStringToMathDisplay(safeContent);
    if (el.katexContent !== normalizedContent) {
        const target = el.katexEl || el.contentEl || el;
        renderStringToElement(target, normalizedContent);
        el.katexContent = normalizedContent;
    }

}

function ensureExpressionInput(ref, { placeholder, onChange }) {
    if (ref) return ref;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.style.position = 'absolute';
    input.style.fontFamily = 'Consolas, Monaco, "Courier New", monospace';
    input.style.fontSize = '12px';
    input.style.padding = '2px 4px';
    input.style.borderRadius = '4px';
    input.style.border = '1px solid rgba(0,0,0,0.3)';
    input.style.background = 'rgba(255,255,255,0.9)';
    input.style.color = '#111111';
    input.style.width = '70px';
    input.style.display = 'none';
    input.style.pointerEvents = 'auto';
    input.addEventListener('input', () => {
        if (onChange) onChange(input.value);
    });
    htmlOverlay.appendChild(input);
    return input;
}

function getIdentifiersFromExpression(expression) {
    const matches = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g);
    return matches ? matches : [];
}

function isExpressionAllowed(expression, allowedIdentifiers) {
    const trimmed = (expression || '').trim();
    if (!trimmed) return true;
    const identifiers = getIdentifiersFromExpression(trimmed);
    return identifiers.every(id => allowedIdentifiers.includes(id));
}

function updateColorModeExpressionInputs() {
    edgeExpressionInput = ensureExpressionInput(edgeExpressionInput, {
        placeholder: 'x',
        onChange: (value) => {
            const trimmed = value.trim();
            if (!isExpressionAllowed(trimmed, ['x'])) {
                edgeExpressionInput.value = edgeColorExpression || 'x';
                return;
            }
            edgeColorExpression = trimmed || 'x';
            schedulePersistState();
        }
    });
    faceExpressionInput = ensureExpressionInput(faceExpressionInput, {
        placeholder: 'x',
        onChange: (value) => {
            const trimmed = value.trim();
            const allowed = faceColorMode === 'colormap_polar' ? ['r', 'phi'] : ['x', 'y'];
            if (!isExpressionAllowed(trimmed, allowed)) {
                const fallback = faceColorMode === 'colormap_polar'
                    ? (faceColorPolarExpression || 'r')
                    : (faceColorExpression || 'x');
                faceExpressionInput.value = fallback;
                return;
            }
            if (faceColorMode === 'colormap_polar') {
                faceColorPolarExpression = trimmed || 'r';
            } else {
                faceColorExpression = trimmed || 'x';
            }
            schedulePersistState();
        }
    });

    edgeExpressionInput.style.display = 'none';
    faceExpressionInput.style.display = 'none';

    if (!isColorModePanelExpanded || !canvasUI.colorModeIcons.length) return;

    if (edgeColorMode === 'colormap') {
        const edgeIcon = canvasUI.colorModeIcons.find(icon => icon.group === 'edge');
        const faceIcon = canvasUI.colorModeIcons.find(icon => icon.group === 'face');
        if (edgeIcon) {
            edgeExpressionInput.value = edgeColorExpression || 'x';
            const gap = faceIcon ? (faceIcon.x - (edgeIcon.x + edgeIcon.width)) : 160;
            const left = edgeIcon.x + edgeIcon.width + 60;
            edgeExpressionInput.style.left = `${left}px`;
            edgeExpressionInput.style.top = `${edgeIcon.y + edgeIcon.height / 2 - 10}px`;
            edgeExpressionInput.style.width = `${Math.max(60, gap - 70)}px`;
            edgeExpressionInput.style.display = 'block';
        }
    }

    if (faceColorMode === 'colormap_xy' || faceColorMode === 'colormap_polar') {
        const faceIcon = canvasUI.colorModeIcons.find(icon => icon.group === 'face');
        if (faceIcon) {
            const value = faceColorMode === 'colormap_polar' ? faceColorPolarExpression : faceColorExpression;
            faceExpressionInput.value = value || (faceColorMode === 'colormap_polar' ? 'r' : 'x');
            faceExpressionInput.style.left = `${faceIcon.x + faceIcon.width + 60}px`;
            faceExpressionInput.style.top = `${faceIcon.y + faceIcon.height / 2 - 10}px`;
            faceExpressionInput.style.display = 'block';
        }
    }
}

function getTintedTextColor(baseColor, overlayColor, alpha) {
    const base = U.parseColor(baseColor);
    const overlay = U.parseColor(overlayColor);
    const a = Math.max(0, Math.min(1, alpha));
    const r = Math.round(base.r * (1 - a) + overlay.r * a);
    const g = Math.round(base.g * (1 - a) + overlay.g * a);
    const b = Math.round(base.b * (1 - a) + overlay.b * a);
    const outA = base.a;
    return `rgba(${r}, ${g}, ${b}, ${outA})`;
}

function cleanupHtmlLabels() {
    for (const [id, el] of activeHtmlLabels.entries()) {
        if (!labelsToKeepThisFrame.has(id)) {
            el.remove();
            activeHtmlLabels.delete(id);
        }
    }
}

function screenVectorToData(vector) {
    return {
        x: (vector.x * dpr) / viewTransform.scale,
        y: (-vector.y * dpr) / viewTransform.scale
    };
}

function getTextElementById(id) {
    return allTextElements.find(el => el.id === id);
}

function getEdgeNormalData(edge, p1, p2, faceVerticesForEdge = null) {
    if (!edge || !p1 || !p2) return null;
    const edgeVector = { x: p2.x - p1.x, y: p2.y - p1.y };
    const edgeLen = Math.hypot(edgeVector.x, edgeVector.y);
    if (edgeLen < 1e-6) return null;
    let normalData = { x: -edgeVector.y / edgeLen, y: edgeVector.x / edgeLen };

    if (faceVerticesForEdge && faceVerticesForEdge.length >= 3) {
        const anchor = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const center = faceVerticesForEdge.reduce((sum, v) => ({ x: sum.x + v.x, y: sum.y + v.y }), { x: 0, y: 0 });
        center.x /= faceVerticesForEdge.length;
        center.y /= faceVerticesForEdge.length;
        const toCenter = { x: center.x - anchor.x, y: center.y - anchor.y };
        const dot = normalData.x * toCenter.x + normalData.y * toCenter.y;
        if (dot > 0) {
            normalData = { x: -normalData.x, y: -normalData.y };
        }
    }

    return { normalData, edgeLen };
}

function computeEdgeLabelOffsetData(edgeId) {
    const edge = allEdges.find(e => U.getEdgeId(e) === edgeId);
    if (!edge) return screenVectorToData(TEXT_EDGE_MARGIN_PX);
    const p1 = findVertexById(edge.id1);
    const p2 = findVertexById(edge.id2);
    if (!p1 || !p2) return screenVectorToData(TEXT_EDGE_MARGIN_PX);

    const adjacentFaces = allFaces.filter(face => {
        const ids = face.vertexIds || [];
        for (let i = 0; i < ids.length; i++) {
            const id1 = ids[i];
            const id2 = ids[(i + 1) % ids.length];
            if ((id1 === edge.id1 && id2 === edge.id2) || (id1 === edge.id2 && id2 === edge.id1)) {
                return true;
            }
        }
        return false;
    });

    let faceVerticesForEdge = null;
    if (adjacentFaces.length === 1) {
        const face = adjacentFaces[0];
        faceVerticesForEdge = (face.vertexIds || []).map(id => findVertexById(id)).filter(Boolean);
    }

    const normalInfo = getEdgeNormalData(edge, p1, p2, faceVerticesForEdge);
    if (!normalInfo) return screenVectorToData(TEXT_EDGE_MARGIN_PX);
    const normalData = normalInfo.normalData;
    const marginData = (TEXT_EDGE_MARGIN_PX * dpr) / viewTransform.scale;
    return {
        x: normalData.x * marginData,
        y: normalData.y * marginData
    };
}

function computeEdgeOffsetFactor(edgeId, offsetVector) {
    const edge = allEdges.find(e => U.getEdgeId(e) === edgeId);
    if (!edge || !offsetVector) return null;
    const p1 = findVertexById(edge.id1);
    const p2 = findVertexById(edge.id2);
    if (!p1 || !p2) return null;
    const normalInfo = getEdgeNormalData(edge, p1, p2);
    if (!normalInfo) return null;
    const { normalData, edgeLen } = normalInfo;
    if (edgeLen < 1e-6) return null;
    const projection = offsetVector.x * normalData.x + offsetVector.y * normalData.y;
    return projection / edgeLen;
}

function computeVertexLabelPlacement(vertexId) {
    const vertex = findVertexById(vertexId);
    if (!vertex) {
        return {
            offset: screenVectorToData(TEXT_VERTEX_OFFSET_PX),
            align: 'left',
            baseline: 'middle'
        };
    }

    const neighborIds = U.findNeighbors(vertexId, allEdges);
    const neighbors = neighborIds.map(id => findVertexById(id)).filter(Boolean);
    let dirData = { x: 1, y: 0 };

    if (neighbors.length === 2) {
        const v1 = { x: neighbors[0].x - vertex.x, y: neighbors[0].y - vertex.y };
        const v2 = { x: neighbors[1].x - vertex.x, y: neighbors[1].y - vertex.y };
        const v1Len = Math.hypot(v1.x, v1.y);
        const v2Len = Math.hypot(v2.x, v2.y);
        if (v1Len > 1e-6 && v2Len > 1e-6) {
            const v1Unit = { x: v1.x / v1Len, y: v1.y / v1Len };
            const v2Unit = { x: v2.x / v2Len, y: v2.y / v2Len };
            const sum = { x: v1Unit.x + v2Unit.x, y: v1Unit.y + v2Unit.y };
            const sumLen = Math.hypot(sum.x, sum.y);
            if (sumLen > 1e-6) {
                // Reflex side is opposite the small-angle bisector
                dirData = { x: -sum.x / sumLen, y: -sum.y / sumLen };
            } else {
                // Nearly straight: use a perpendicular direction
                dirData = { x: -v1Unit.y, y: v1Unit.x };
            }
        }
    }

    const screenPos = dataToScreen(vertex);
    const screenPos2 = dataToScreen({ x: vertex.x + dirData.x, y: vertex.y + dirData.y });
    let screenDir = { x: screenPos2.x - screenPos.x, y: screenPos2.y - screenPos.y };
    const screenDirLen = Math.hypot(screenDir.x, screenDir.y);
    if (screenDirLen > 1e-6) {
        screenDir.x /= screenDirLen;
        screenDir.y /= screenDirLen;
    } else {
        screenDir = { x: 1, y: 0 };
    }

    const radius = Math.hypot(TEXT_VERTEX_OFFSET_PX.x, TEXT_VERTEX_OFFSET_PX.y);
    const offsetScreen = { x: screenDir.x * radius, y: screenDir.y * radius };
    const align = screenDir.x >= 0 ? 'left' : 'right';

    return {
        offset: screenVectorToData(offsetScreen),
        align,
        baseline: 'middle'
    };
}

function getInterpolationStyleById(id) {
    return interpolationStyles.find(style => style.id === id) || null;
}

function getActiveInterpolationStyle() {
    return getInterpolationStyleById(activeInterpolationStyleId) || interpolationStyles[0] || DEFAULT_INTERPOLATION_STYLE;
}

function setActiveInterpolationStyle(styleId) {
    if (!styleId) return;
    activeInterpolationStyleId = styleId;
    schedulePersistState();
}

function getSelectionInterpolationStyleId() {
    const selectedEdges = new Set(selectedEdgeIds);
    const selectedFaces = new Set(selectedFaceIds);
    const selectedVertices = new Set(selectedVertexIds);
    const styleIds = new Set();

    const addStyleId = (styleId) => {
        const normalized = styleId || DEFAULT_INTERPOLATION_STYLE.id;
        styleIds.add(normalized);
    };

    if (selectedEdges.size > 0) {
        allEdges.forEach(edge => {
            const edgeId = U.getEdgeId(edge);
            if (selectedEdges.has(edgeId)) {
                addStyleId(edge.interpolationStyleId);
            }
        });
    }

    if (selectedFaces.size > 0) {
        allFaces.forEach(face => {
            const faceId = U.getFaceId(face);
            if (faceId && selectedFaces.has(faceId)) {
                addStyleId(face.interpolationStyleId);
            }
        });
    }

    if (selectedEdges.size === 0 && selectedFaces.size === 0 && selectedVertices.size > 0) {
        allEdges.forEach(edge => {
            if (selectedVertices.has(edge.id1) || selectedVertices.has(edge.id2)) {
                addStyleId(edge.interpolationStyleId);
            }
        });
        allFaces.forEach(face => {
            if (face.vertexIds && face.vertexIds.some(id => selectedVertices.has(id))) {
                addStyleId(face.interpolationStyleId);
            }
        });
    }

    if (styleIds.size === 1) {
        return [...styleIds][0];
    }
    return null;
}

function applyInterpolationStyleToSelection(styleId) {
    if (!styleId) return;
    const selectedEdges = new Set(selectedEdgeIds);
    const selectedFaces = new Set(selectedFaceIds);
    const selectedVertices = new Set(selectedVertexIds);
    let didApply = false;

    if (selectedEdges.size > 0) {
        allEdges.forEach(edge => {
            const edgeId = U.getEdgeId(edge);
            if (selectedEdges.has(edgeId)) {
                edge.interpolationStyleId = styleId;
                didApply = true;
            }
        });
    }

    if (selectedFaces.size > 0) {
        allFaces.forEach(face => {
            const faceId = U.getFaceId(face);
            if (faceId && selectedFaces.has(faceId)) {
                face.interpolationStyleId = styleId;
                didApply = true;
            }
        });
    }

    if (selectedEdges.size === 0 && selectedFaces.size === 0 && selectedVertices.size > 0) {
        allEdges.forEach(edge => {
            if (selectedVertices.has(edge.id1) || selectedVertices.has(edge.id2)) {
                edge.interpolationStyleId = styleId;
                didApply = true;
            }
        });
        allFaces.forEach(face => {
            if (face.vertexIds && face.vertexIds.some(id => selectedVertices.has(id))) {
                face.interpolationStyleId = styleId;
                didApply = true;
            }
        });
    }

    if (didApply) {
        schedulePersistState();
    }
}

function clearInterpolationStyleFromSelection() {
    const selectedEdges = new Set(selectedEdgeIds);
    const selectedFaces = new Set(selectedFaceIds);
    const selectedVertices = new Set(selectedVertexIds);
    let didClear = false;

    if (selectedEdges.size > 0) {
        allEdges.forEach(edge => {
            const edgeId = U.getEdgeId(edge);
            if (selectedEdges.has(edgeId)) {
                delete edge.interpolationStyleId;
                didClear = true;
            }
        });
    }

    if (selectedFaces.size > 0) {
        allFaces.forEach(face => {
            const faceId = U.getFaceId(face);
            if (faceId && selectedFaces.has(faceId)) {
                delete face.interpolationStyleId;
                didClear = true;
            }
        });
    }

    if (selectedEdges.size === 0 && selectedFaces.size === 0 && selectedVertices.size > 0) {
        allEdges.forEach(edge => {
            if (selectedVertices.has(edge.id1) || selectedVertices.has(edge.id2)) {
                delete edge.interpolationStyleId;
                didClear = true;
            }
        });
        allFaces.forEach(face => {
            if (face.vertexIds && face.vertexIds.some(id => selectedVertices.has(id))) {
                delete face.interpolationStyleId;
                didClear = true;
            }
        });
    }

    if (didClear) {
        schedulePersistState();
    }
}

function applyActiveInterpolationToEdge(edge) {
    const activeStyle = getActiveInterpolationStyle();
    if (activeStyle && activeStyle.type && activeStyle.type !== 'linear') {
        edge.interpolationStyleId = activeStyle.id;
    }
}

function getTextElementAnchorData(textElement) {
    if (!textElement) return null;

    const previewVertexMap = new Map();
    if (isDragConfirmed && Array.isArray(dragPreviewVertices) && dragPreviewVertices.length > 0) {
        dragPreviewVertices.forEach(v => {
            if (!v || !v.id) return;
            const originalId = v.originalId || v.id;
            previewVertexMap.set(originalId, v);
        });
    }

    const getLiveVertexById = (id) => {
        if (previewVertexMap.has(id)) return previewVertexMap.get(id);
        return findVertexById(id);
    };

    if (textElement.anchorType === 'canvas') {
        if (!textElement.position) return null;
        return { anchor: textElement.position };
    }

    if (textElement.anchorType === 'vertex') {
        const vertex = getLiveVertexById(textElement.anchorId);
        if (!vertex) return null;
        return { anchor: { x: vertex.x, y: vertex.y } };
    }

    if (textElement.anchorType === 'edge') {
        const edge = allEdges.find(e => U.getEdgeId(e) === textElement.anchorId);
        if (!edge) return null;
        const p1 = getLiveVertexById(edge.id1);
        const p2 = getLiveVertexById(edge.id2);
        if (!p1 || !p2) return null;
        const anchor = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const edgeAngleRad = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const p1Screen = dataToScreen(p1);
        const p2Screen = dataToScreen(p2);
        const edgeAngleRadScreen = Math.atan2(p2Screen.y - p1Screen.y, p2Screen.x - p1Screen.x);
        // If the edge is a boundary with a single adjacent face, push the label away from that face.
        const adjacentFaces = allFaces.filter(face => {
            const ids = face.vertexIds || [];
            for (let i = 0; i < ids.length; i++) {
                const id1 = ids[i];
                const id2 = ids[(i + 1) % ids.length];
                if ((id1 === edge.id1 && id2 === edge.id2) || (id1 === edge.id2 && id2 === edge.id1)) {
                    return true;
                }
            }
            return false;
        });
        let faceVerticesForEdge = null;
        if (adjacentFaces.length === 1) {
            const face = adjacentFaces[0];
            faceVerticesForEdge = (face.vertexIds || []).map(id => getLiveVertexById(id)).filter(Boolean);
        }

        const normalInfo = getEdgeNormalData(edge, p1, p2, faceVerticesForEdge);
        const normalData = normalInfo ? normalInfo.normalData : null;

        return {
            anchor,
            edgeAngleRad,
            edgeAngleRadScreen,
            edgeNormalData: normalData,
            edgeLength: normalInfo ? normalInfo.edgeLen : null
        };
    }

    if (textElement.anchorType === 'face') {
        const face = allFaces.find(f => U.getFaceId(f) === textElement.anchorId);
        if (!face) return null;
        const vertices = face.vertexIds.map(id => getLiveVertexById(id)).filter(p => p && p.type === 'regular');
        if (vertices.length < 3) return null;
        const anchor = {
            x: vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length,
            y: vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length
        };
        return { anchor };
    }

    return null;
}

function getActiveTextTranslationDelta() {
    if (actionContext?.finalSnapResult?.finalDelta) return actionContext.finalSnapResult.finalDelta;
    if (actionContext?.textFinalDelta) return actionContext.textFinalDelta;
    if (dragPreviewVertices.length > 0 && initialDragVertexStates.length > 0) {
        return {
            x: dragPreviewVertices[0].x - initialDragVertexStates[0].x,
            y: dragPreviewVertices[0].y - initialDragVertexStates[0].y
        };
    }
    return null;
}

function getTextElementRenderState(textElement) {
    const anchorData = getTextElementAnchorData(textElement);
    if (!anchorData) return null;

    let offset = textElement.offset || { x: 0, y: 0 };
    if (textElement.anchorType === 'edge') {
        if (typeof textElement.edgeOffsetFactor === 'number' && anchorData.edgeNormalData && anchorData.edgeLength) {
            offset = {
                x: anchorData.edgeNormalData.x * anchorData.edgeLength * textElement.edgeOffsetFactor,
                y: anchorData.edgeNormalData.y * anchorData.edgeLength * textElement.edgeOffsetFactor
            };
        } else if (!textElement.offset || !('x' in textElement.offset) || !('y' in textElement.offset)) {
            offset = computeEdgeLabelOffsetData(textElement.anchorId);
            const factor = computeEdgeOffsetFactor(textElement.anchorId, offset);
            if (typeof factor === 'number') {
                textElement.edgeOffsetFactor = factor;
            }
        }
    }
    let position = { x: anchorData.anchor.x + offset.x, y: anchorData.anchor.y + offset.y };
    let rotationDeg = textElement.rotationDeg || 0;
    let scale = textElement.scale || 1;
    let textAlign = 'center';
    let textBaseline = 'middle';

    if (textElement.anchorType === 'vertex') {
        const placement = computeVertexLabelPlacement(textElement.anchorId);
        textAlign = textElement.vertexAlign || placement.align || 'left';
        textBaseline = textElement.vertexBaseline || placement.baseline || 'middle';
    } else if (textElement.anchorType === 'edge') {
        textAlign = 'center';
        textBaseline = 'middle';
        if (typeof anchorData.edgeAngleRadScreen === 'number') {
            rotationDeg += anchorData.edgeAngleRadScreen * (180 / Math.PI);
        } else if (typeof anchorData.edgeAngleRad === 'number') {
            rotationDeg += anchorData.edgeAngleRad * (180 / Math.PI);
        }
    } else if (textElement.anchorType === 'canvas') {
        textAlign = 'left';
        textBaseline = 'top';
    }

    if (textElement.anchorType === 'edge') {
        if (rotationDeg > 90 || rotationDeg < -90) {
            rotationDeg += 180;
            if (rotationDeg > 180) rotationDeg -= 360;
            textBaseline = 'top';
        }
    }

    const isSelected = selectedTextIds.includes(textElement.id);
    if (isDragConfirmed && isSelected) {
        if (transformIndicatorData) {
            const { center, rotation, scale: transformScale, directionalScale, startVector } = transformIndicatorData;
            position = U.applyTransformToVertex(position, center, rotation, transformScale, directionalScale, startVector);
            rotationDeg -= rotation * (180 / Math.PI);
            scale *= transformScale;
        } else {
            const delta = getActiveTextTranslationDelta();
            if (delta) {
                position = { x: position.x + delta.x, y: position.y + delta.y };
            }
        }
    }

    return {
        id: textElement.id,
        content: textElement.content || '',
        position,
        rotationDeg,
        scale,
        textAlign,
        textBaseline
    };
}

function drawTextElements(colors) {
    const overlayRect = htmlOverlay.getBoundingClientRect();
    const elementsToRemove = [];

    allTextElements.forEach(textElement => {
        const renderState = getTextElementRenderState(textElement);
        if (!renderState) {
            elementsToRemove.push(textElement.id);
            return;
        }

        const screenPos = dataToScreen(renderState.position);
        const domId = `text-${renderState.id}`;
        const isSelected = selectedTextIds.includes(textElement.id);

        const baseTextColor = textElement.color || getColorForTarget(C.COLOR_TARGET_TEXT) || colors.uiTextDefault || colors.geometryInfoText;
        const selectionTint = colors.selectionGlow || 'rgba(120, 170, 255, 1)';
        const selectedTextColor = getTintedTextColor(baseTextColor, selectionTint, 0.35);
        updateHtmlLabel({
            id: domId,
            content: renderState.content,
            x: screenPos.x,
            y: screenPos.y,
            color: isSelected ? selectedTextColor : baseTextColor,
            fontSize: (textElement.fontSize || DEFAULT_TEXT_FONT_SIZE) * renderState.scale,
            options: {
                textAlign: renderState.textAlign,
                textBaseline: renderState.textBaseline,
                rotation: renderState.rotationDeg
            }
        });

        const el = activeHtmlLabels.get(domId);
        if (el) {
            const outlineTarget = el.contentEl || el;
            outlineTarget.style.outline = 'none';
            outlineTarget.style.textShadow = 'none';
            outlineTarget.style.color = isSelected ? selectedTextColor : baseTextColor;
            const boundsTarget = el.katexEl || outlineTarget;
            const rect = boundsTarget.getBoundingClientRect();
            textElement.screenBounds = {
                left: rect.left - overlayRect.left,
                top: rect.top - overlayRect.top,
                right: rect.right - overlayRect.left,
                bottom: rect.bottom - overlayRect.top
            };
        }
    });

    if (elementsToRemove.length > 0) {
        allTextElements = allTextElements.filter(el => !elementsToRemove.includes(el.id));
        selectedTextIds = selectedTextIds.filter(id => !elementsToRemove.includes(id));
    }
}

function findClickedTextElement(screenPos) {
    for (let i = allTextElements.length - 1; i >= 0; i--) {
        const textElement = allTextElements[i];
        const bounds = textElement.screenBounds;
        if (!bounds) continue;
        if (screenPos.x >= bounds.left && screenPos.x <= bounds.right &&
            screenPos.y >= bounds.top && screenPos.y <= bounds.bottom) {
            return textElement;
        }
    }
    return null;
}

function startTextEditing(textElement, initialText = '') {
    if (!textEditorState.inputEl) {
        const input = document.createElement('input');
        input.type = 'text';
        input.style.position = 'absolute';
        input.style.zIndex = '5';
        input.style.pointerEvents = 'auto';
        input.style.fontFamily = 'KaTeX_Main, Times New Roman, serif';
        input.style.fontSize = `${textElement.fontSize || DEFAULT_TEXT_FONT_SIZE}px`;
        input.style.border = '1px solid rgba(255, 255, 255, 0.4)';
        input.style.borderRadius = '4px';
        input.style.padding = '2px 4px';
        input.style.background = 'rgba(0, 0, 0, 0.6)';
        input.style.color = '#ffffff';
        input.style.outline = 'none';
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                finalizeTextEditing(true);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                finalizeTextEditing(false);
            }
        });
        input.addEventListener('mouseleave', () => finalizeTextEditing(true));
        input.addEventListener('blur', () => finalizeTextEditing(true));
        htmlOverlay.appendChild(input);
        textEditorState.inputEl = input;
    }

    const renderState = getTextElementRenderState(textElement);
    if (!renderState) return;

    const screenPos = dataToScreen(renderState.position);
    const input = textEditorState.inputEl;
    input.value = initialText || textElement.content || '';
    input.style.left = `${screenPos.x}px`;
    input.style.top = `${screenPos.y}px`;
    input.style.transform = `translate(-10%, -10%)`;
    input.style.display = 'block';

    textEditorState.activeId = textElement.id;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
}

function finalizeTextEditing(commitChanges) {
    const input = textEditorState.inputEl;
    if (!input) return;
    const targetId = textEditorState.activeId;
    if (targetId && commitChanges) {
        const textElement = getTextElementById(targetId);
        if (textElement) {
            saveStateForUndo();
            const nextContent = input.value.trim();
            if (!nextContent && textElement.isDraft) {
                allTextElements = allTextElements.filter(el => el.id !== textElement.id);
                selectedTextIds = selectedTextIds.filter(id => id !== textElement.id);
            } else {
                textElement.content = nextContent || textElement.content || '';
                delete textElement.isDraft;
            }
        }
    }
    input.style.display = 'none';
    textEditorState.activeId = null;
}

function createTextElementFromHover(initialContent = '') {
    let anchorType = 'canvas';
    let anchorId = null;
    let offset = { x: 0, y: 0 };
    let position = screenToData(mousePos);

    if (hoveredVertexId) {
        anchorType = 'vertex';
        anchorId = hoveredVertexId;
        const placement = computeVertexLabelPlacement(anchorId);
        offset = placement.offset;
    } else if (hoveredEdgeId) {
        anchorType = 'edge';
        anchorId = hoveredEdgeId;
        offset = computeEdgeLabelOffsetData(anchorId);
    } else if (hoveredFaceId) {
        anchorType = 'face';
        anchorId = hoveredFaceId;
    } else {
        const backgroundOffset = screenVectorToData(TEXT_BACKGROUND_OFFSET_PX);
        position = { x: position.x + backgroundOffset.x, y: position.y + backgroundOffset.y };
    }

    const textElement = {
        id: U.generateUniqueId(),
        content: initialContent,
        anchorType,
        anchorId,
        position: anchorType === 'canvas' ? position : null,
        offset: anchorType === 'canvas' ? { x: 0, y: 0 } : offset,
        rotationDeg: 0,
        scale: 1,
        fontSize: DEFAULT_TEXT_FONT_SIZE,
        color: getColorForTarget(C.COLOR_TARGET_TEXT),
        isDraft: true
    };

    if (anchorType === 'vertex') {
        const placement = computeVertexLabelPlacement(anchorId);
        textElement.vertexAlign = placement.align;
        textElement.vertexBaseline = placement.baseline;
    }

    allTextElements.push(textElement);
    selectedTextIds = [textElement.id];
    startTextEditing(textElement, initialContent);
}

function handleCenterSelection(centerId, shiftKey, ctrlKey) {
    // Only ctrl-click can remove; normal clicks keep existing selection
    if (ctrlKey) {
        const index = selectedCenterIds.indexOf(centerId);
        if (index > -1) {
            selectedCenterIds.splice(index, 1);
            if (activeCenterId === centerId) {
                activeCenterId = selectedCenterIds.length > 0 ? selectedCenterIds[selectedCenterIds.length - 1] : null;
            }
            return;
        }
        // ctrl-click on unselected center toggles it on
        selectedCenterIds.push(centerId);
        activeCenterId = centerId;
        return;
    }

    // Non-ctrl: never clear other selections; just ensure this one is selected/active
    if (!selectedCenterIds.includes(centerId)) {
        selectedCenterIds.push(centerId);
    }
    activeCenterId = centerId;
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

function updateComponentDrawOrder() {
    const allVertexIds = new Set(allVertices.map(v => v.id));
    const visited = new Set();
    const newComponents = [];

    for (const vertexId of allVertexIds) {
        if (!visited.has(vertexId)) {
            const component = findAllVerticesInSubgraph(vertexId);
            const componentSet = new Set(component);
            newComponents.push(componentSet);
            component.forEach(id => visited.add(id));
        }
    }

    const key = (component) => [...component].sort().join(',');

    const newComponentOrder = [];
    const usedNewComponents = new Set();

    componentDrawOrder.forEach(oldComponent => {
        const oldKey = key(oldComponent);
        let foundMatch = false;
        for (let i = 0; i < newComponents.length; i++) {
            if (usedNewComponents.has(i)) continue;
            const newComponent = newComponents[i];
            if (oldKey === key(newComponent)) {
                newComponentOrder.push(newComponent);
                usedNewComponents.add(i);
                foundMatch = true;
                break;
            }
        }
    });

    for (let i = 0; i < newComponents.length; i++) {
        if (!usedNewComponents.has(i)) {
            newComponentOrder.push(newComponents[i]);
        }
    }

    componentDrawOrder = newComponentOrder;
}

function drawComponent(componentVertexIds, colors, isDragConfirmed = false, initialDragVertexStates = [], copyCount = 1) {
    if (isDragConfirmed && initialDragVertexStates.length > 0) {
        const componentHasDraggedVertex = [...componentVertexIds].some(id =>
            initialDragVertexStates.some(v => v.id === id)
        );
        if (componentHasDraggedVertex) {
            return;
        }
    }

    const componentFaces = allFaces.filter(f => f.vertexIds.every(id => componentVertexIds.has(id)));

    R.drawFaces(ctx, {
        allFaces: componentFaces,
        allEdges,
        facesVisible,
        isDragConfirmed: false,
        dragPreviewVertices: [],
        transformIndicatorData: null, initialDragVertexStates: [],
        colors, initialCoordSystemStates: new Map(),
        interpolationStyle: getActiveInterpolationStyle(),
        getInterpolationStyleById,
        faceColorMode,
        edgeColorMode,
        faceColorExpression,
        faceColorPolarExpression,
        edgeColorExpression
    }, dataToScreen, findVertexById);

    const componentEdges = allEdges.filter(e => componentVertexIds.has(e.id1) && componentVertexIds.has(e.id2));

    R.drawAllEdges(ctx, {
        allEdges: componentEdges, selectedEdgeIds, hoveredEdgeId,
        isDragConfirmed: false,
        dragPreviewVertices: [],
        colors, edgesVisible, snappedEdgeIds, currentAltPressed,
        interpolationStyle: getActiveInterpolationStyle(),
        getInterpolationStyleById,
        edgeColorMode,
        edgeColorExpression
    }, dataToScreen, findVertexById, U.getEdgeId);

    const componentVertices = allVertices.filter(v => componentVertexIds.has(v.id));
    componentVertices.forEach(vertex => {
        let isSnapped = false;
         if (snappedVertexIds.has(vertex.id)) {
             const snapEntries = snappedVertexIds.get(vertex.id);
             if (snapEntries.some(snap => snap.copyIndex === undefined)) {
                 isSnapped = true;
             }
         }

        R.drawVertex(ctx, vertex, {
            selectedVertexIds, selectedCenterIds, activeCenterId, colors,
            verticesVisible, isHovered: hoveredVertexId === vertex.id,
            isSnapped: isSnapped,
            snappedVertexIds,
            isDragConfirmed: false,
            dragPreviewVertices: [],
            currentAltPressed
        }, dataToScreen, updateHtmlLabel);
    });
}

function getSnappedPosition(startVertex, mouseScreenPos, shiftPressed, isDragContext = false, overrideContext = null) {
    const mouseDataPos = screenToData(mouseScreenPos);
    const drawingContext = overrideContext || getDrawingContext(startVertex.id);
    const snapRadiusVertexData = C.VERTEX_SELECT_RADIUS / viewTransform.scale;
    const snapRadiusEdgeData = C.EDGE_CLICK_THRESHOLD / viewTransform.scale;
    const gridInterval = (lastGridState?.alpha2 >= lastGridState?.alpha1 && lastGridState?.interval2) ? lastGridState.interval2 : lastGridState?.interval1;
    const stickinessVertexData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;
    const stickinessEdgeData = C.VERTEX_RADIUS / viewTransform.scale;
    const stickinessGridData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;
    const stickinessGeometricData = (C.VERTEX_RADIUS * 2) / viewTransform.scale;
    const isCurrentlyDrawing = isDrawingMode && currentDrawingPath.length >= 1;

    if (!shiftPressed) {
        // --- Standard (non-Shift) Snapping: Vertex > Edge (closest) ---
        const candidates = [];
        for (const p of allVertices) {
            if (p.id !== startVertex.id && p.type === "regular") {
                 const dist = U.distance(mouseDataPos, p);
                 if (dist < snapRadiusVertexData) {
                    candidates.push({ priority: 1, dist: dist, pos: p, snapType: 'vertex', targetVertex: p });
                 }
            }
        }
        for (const edge of allEdges) {
            const p1 = findVertexById(edge.id1);
            const p2 = findVertexById(edge.id2);
            if (p1 && p2 && p1.type === "regular" && p2.type === "regular") {
                const closest = U.getClosestPointOnLineSegment(mouseDataPos, p1, p2);
                if (closest.distance < snapRadiusEdgeData && closest.onSegmentStrict) {
                    candidates.push({ priority: 2, dist: closest.distance, pos: { x: closest.x, y: closest.y }, snapType: 'edge', targetEdge: edge });
                }
            }
        }

        let bestCandidate = null;
        if (candidates.length > 0) {
            bestCandidate = candidates.sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.dist - b.dist;
            })[0];
            const stickinessThreshold = bestCandidate.priority === 1 ? stickinessVertexData : stickinessEdgeData;
            if (bestCandidate.dist > stickinessThreshold) {
                 bestCandidate = null;
            }
        }

        if (bestCandidate) {
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

    } else { // --- Shift-Key Snapping ---
        const candidates = [];
        let isNearGeometry = false;

        for (const p of allVertices) {
            if (p.id !== startVertex.id && p.type === "regular") {
                 if (U.distance(mouseDataPos, p) < snapRadiusVertexData) {
                    isNearGeometry = true;
                    break;
                 }
            }
        }
        if (!isNearGeometry) {
            for (const edge of allEdges) {
                const p1 = findVertexById(edge.id1);
                const p2 = findVertexById(edge.id2);
                if (p1 && p2 && p1.type === "regular" && p2.type === "regular") {
                    const closest = U.getClosestPointOnLineSegment(mouseDataPos, p1, p2);
                    if (closest.distance < snapRadiusEdgeData) {
                        isNearGeometry = true;
                        break;
                    }
                }
            }
        }

        if (!isCurrentlyDrawing) {
            if (!isNearGeometry && gridDisplayMode !== 'none' && gridInterval) {
                 const primaryInterval = (lastGridState?.alpha2 >= lastGridState?.alpha1 && lastGridState?.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                 if (primaryInterval) {
                     const gridCandidates = U.getGridSnapCandidates(mouseDataPos, gridDisplayMode, primaryInterval, lastAngularGridState, true);
                     if (gridCandidates.length > 0) {
                        const closestGridPoint = gridCandidates.sort((a,b) => U.distance(mouseDataPos, a) - U.distance(mouseDataPos, b))[0];
                        candidates.push({ priority: 3, dist: U.distance(mouseDataPos, closestGridPoint), pos: closestGridPoint, snapType: 'grid' });
                     }
                 }
            }
        } else {
            allVertices.forEach(p => {
                if (p.id !== startVertex.id && p.type === 'regular') {
                    const dist = U.distance(mouseDataPos, p);
                    candidates.push({ priority: 1, dist: dist, pos: p, snapType: 'vertex', targetVertex: p });
                }
            });
            allEdges.forEach(edge => {
                const p1 = findVertexById(edge.id1);
                const p2 = findVertexById(edge.id2);
                if (p1 && p2 && p1.type === "regular" && p2.type === "regular" && p1.id !== startVertex.id && p2.id !== startVertex.id) {
                    const closestToLine = U.getClosestPointOnLineSegment(mouseDataPos, p1, p2);
                    if (closestToLine.distance < stickinessEdgeData * 1.5) {
                        C.ALT_SNAP_FRACTIONS.forEach(fraction => {
                            const snapPoint = { x: p1.x + fraction * (p2.x - p1.x), y: p1.y + fraction * (p2.y - p1.y) };
                            const distToSnapPoint = U.distance(mouseDataPos, snapPoint);
                            candidates.push({ priority: 2, dist: distToSnapPoint, pos: snapPoint, snapType: 'edge_fraction', targetEdge: edge, fraction: fraction });
                        });
                    }
                }
            });
            if (gridDisplayMode !== 'none' && gridInterval) {
                 const primaryInterval = (lastGridState?.alpha2 >= lastGridState?.alpha1 && lastGridState?.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                 if (primaryInterval) {
                     const gridCandidates = U.getGridSnapCandidates(mouseDataPos, gridDisplayMode, primaryInterval, lastAngularGridState, true);
                     gridCandidates.forEach(p => {
                         const dist = U.distance(mouseDataPos, p);
                         candidates.push({ priority: 3, dist, pos: p, snapType: 'grid' });
                     });
                 }
            }
            const referenceAngleForSnapping = drawingContext.currentSegmentReferenceA_for_display;
            const baseUnitDistance = drawingContext.currentSegmentReferenceD;
            const symmetricalAngleFractions = new Set([0, ...C.NINETY_DEG_ANGLE_SNAP_FRACTIONS.flatMap(f => [f, -f])]);
            const sortedSymmetricalFractions = Array.from(symmetricalAngleFractions).sort((a, b) => a - b);
            const allSnapAngles = sortedSymmetricalFractions.map(f => ({ factor: f, angle: U.normalizeAngle(drawingContext.offsetAngleRad + (f * referenceAngleForSnapping)), turn: U.normalizeAngleToPi(f * referenceAngleForSnapping) }));
            const currentMouseDist = U.distance(startVertex, mouseDataPos);
            const allSnapDistances = [];
            const baseDistFactors = [0, ...C.SNAP_FACTORS];
            baseDistFactors.forEach(factor => allSnapDistances.push({ factor: factor, dist: factor * baseUnitDistance }));
            if (baseUnitDistance > C.GEOMETRY_CALCULATION_EPSILON) {
                 const currentFactor = currentMouseDist / baseUnitDistance;
                 const nearbyInt = Math.round(currentFactor);
                 const nearbyHalf = Math.round(currentFactor * 2) / 2;
                 [nearbyInt, nearbyHalf].forEach(factor => {
                     if (factor >= 0 && !allSnapDistances.some(d => Math.abs(d.factor - factor) < C.GEOMETRY_CALCULATION_EPSILON)) {
                          allSnapDistances.push({ factor: factor, dist: factor * baseUnitDistance });
                     }
                });
            }
            allSnapDistances.sort((a, b) => a.dist - b.dist);
            if (allSnapAngles.length > 0 && allSnapDistances.length > 0) {
                for (const angleData of allSnapAngles) {
                    for (const distData of allSnapDistances) {
                        if (distData.dist < C.GEOMETRY_CALCULATION_EPSILON && (angleData.factor !== 0 || allSnapDistances.length > 1)) continue;
                        const pos = { x: startVertex.x + distData.dist * Math.cos(angleData.angle), y: startVertex.y + distData.dist * Math.sin(angleData.angle) };
                        const distToMouse = U.distance(mouseDataPos, pos);
                        candidates.push({ priority: 4, dist: distToMouse, pos: pos, snapType: 'geometric', lengthSnapFactor: distData.factor, angleSnapFactor: angleData.factor, angleTurn: angleData.turn });
                    }
                }
            }
        } // End of if (isCurrentlyDrawing)

        let bestSnap = null;
        if (candidates.length > 0) {
            if (!isCurrentlyDrawing) {
                 // Pre-draw: ALWAYS take the closest grid candidate, regardless of stickiness
                 bestSnap = candidates[0];
            } else {
                let foundStickySnap = false;
                for (let priorityLevel = 1; priorityLevel <= 3; priorityLevel++) {
                    let stickinessThreshold;
                    if (priorityLevel === 1) stickinessThreshold = stickinessVertexData;
                    else if (priorityLevel === 2) stickinessThreshold = stickinessEdgeData;
                    else stickinessThreshold = stickinessGridData;

                    const stickyCandidatesAtLevel = candidates.filter(c => c.priority === priorityLevel && c.dist < stickinessThreshold);
                    if (stickyCandidatesAtLevel.length > 0) {
                        bestSnap = stickyCandidatesAtLevel.sort((a, b) => a.dist - b.dist)[0];
                        foundStickySnap = true;
                        break;
                    }
                }
                if (!foundStickySnap) {
                     const geometricCandidates = candidates.filter(c => c.priority === 4);
                     if (geometricCandidates.length > 0) {
                         const closestGeometric = geometricCandidates.sort((a, b) => a.dist - b.dist)[0];
                         if (closestGeometric.dist < stickinessGeometricData) {
                             bestSnap = closestGeometric;
                         }
                     }
                }
                if (!bestSnap) {
                    bestSnap = candidates.sort((a, b) => a.dist - b.dist)[0];
                }
            }
        }

        if (bestSnap) {
            const finalAngle = Math.atan2(bestSnap.pos.y - startVertex.y, bestSnap.pos.x - startVertex.x) || 0;
            const snappedDistanceOutput = parseFloat(U.distance(startVertex, bestSnap.pos).toFixed(10));
            let gridToGridSquaredSum = null;
            let finalGridInterval = null;

            if (bestSnap.snapType === 'grid' && gridInterval) {
                 const primaryInterval = (lastGridState?.alpha2 >= lastGridState?.alpha1 && lastGridState?.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                 if (primaryInterval) {
                     const deltaX = bestSnap.pos.x - startVertex.x;
                     const deltaY = bestSnap.pos.y - startVertex.y;
                     const epsilon = primaryInterval * 1e-5;
                     if (gridDisplayMode === 'triangular') {
                         const y_step = primaryInterval * C.TRIANGULAR_GRID_Y_STEP_FACTOR;
                         const j_float = deltaY / y_step;
                         const j_grid_approx = Math.round(j_float);
                         const x_offset = (j_grid_approx % 2 !== 0) ? primaryInterval / 2 : 0;
                         const i_float = (deltaX - x_offset) / primaryInterval;
                         if (Math.abs(j_float - j_grid_approx) < epsilon / y_step &&
                             Math.abs(i_float - Math.round(i_float)) < epsilon / primaryInterval)
                         {
                             const j_grid = j_grid_approx;
                             const i_grid = Math.round(i_float);
                             gridToGridSquaredSum = i_grid * i_grid + i_grid * j_grid + j_grid * j_grid;
                             finalGridInterval = primaryInterval;
                         }
                     } else {
                         const dx_grid_float = deltaX / primaryInterval;
                         const dy_grid_float = deltaY / primaryInterval;
                         if (Math.abs(dx_grid_float - Math.round(dx_grid_float)) < epsilon / primaryInterval &&
                             Math.abs(dy_grid_float - Math.round(dy_grid_float)) < epsilon / primaryInterval)
                         {
                            const dx_grid = Math.round(dx_grid_float);
                            const dy_grid = Math.round(dy_grid_float);
                            gridToGridSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;
                            finalGridInterval = primaryInterval;
                         }
                     }
                 }
            }

            let finalAngleTurn = bestSnap.angleTurn != null ? bestSnap.angleTurn : U.normalizeAngleToPi(finalAngle - drawingContext.offsetAngleRad);

             return {
                 x: parseFloat(bestSnap.pos.x.toFixed(C.MAX_COORD_DECIMAL_PLACES)),
                 y: parseFloat(bestSnap.pos.y.toFixed(C.MAX_COORD_DECIMAL_PLACES)),
                 angle: finalAngle * (180 / Math.PI),
                 distance: snappedDistanceOutput,
                 snapped: true,
                 snapType: bestSnap.snapType,
                 targetEdge: bestSnap.targetEdge,
                 fraction: bestSnap.fraction,
                 targetVertex: bestSnap.targetVertex,
                 gridSnapped: bestSnap.snapType === 'grid',
                 lengthSnapFactor: bestSnap.lengthSnapFactor || null,
                 angleSnapFactor: bestSnap.angleSnapFactor || null,
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

function getDeformingSnapResult(startVertex, mouseDataPos, staticNeighbors) {
    const candidates = [];
    const stickyRadius = C.VERTEX_SELECT_RADIUS / viewTransform.scale;
    const edgeClickThresholdData = C.EDGE_CLICK_THRESHOLD / viewTransform.scale;

    // Priority 1: Vertex-to-Vertex Snap
    allVertices.forEach(p => {
        if (p.id !== startVertex.id && p.type === 'regular') {
            const dist = U.distance(mouseDataPos, p);
            if (dist < stickyRadius) {
                candidates.push({ priority: 1, dist, pos: p, snapType: 'vertex', targetVertex: p });
            }
        }
    });

    // Priority 2: Vertex-to-Edge Snap
    allEdges.forEach(edge => {
        if (edge.id1 === startVertex.id || edge.id2 === startVertex.id) return;
        const p1 = findVertexById(edge.id1);
        const p2 = findVertexById(edge.id2);
        if (p1 && p2 && p1.type === "regular" && p2.type === "regular") {
            const closest = U.getClosestPointOnLineSegment(mouseDataPos, p1, p2);
            if (closest.distance < edgeClickThresholdData && closest.onSegmentStrict) {
                candidates.push({ priority: 2, dist: closest.distance, pos: { x: closest.x, y: closest.y }, snapType: 'edge', targetEdge: edge });
            }
        }
    });

    if (candidates.length > 0) {
        const bestSnap = candidates.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.dist - b.dist;
        })[0];

        return {
            pos: bestSnap.pos,
            snapped: true,
            snapType: bestSnap.snapType,
            targetEdge: bestSnap.targetEdge,
            targetVertex: bestSnap.targetVertex,
        };
    }

    return { pos: mouseDataPos, snapped: false };
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

    // Use a consistent vertical gap to create a regular vertical rhythm for each UI row
    const verticalRowGap = C.UI_BUTTON_PADDING;
    let currentY = canvasUI.toolbarButton.y + canvasUI.toolbarButton.height + C.TOOLBAR_SECTION_GAP;

    canvasUI.colorToolButton = {
        id: "color-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: currentY,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };

    currentY += C.TOOL_BUTTON_HEIGHT + verticalRowGap;

    canvasUI.colorModeToolButton = {
        id: "color-mode-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: currentY,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };

    currentY += C.TOOL_BUTTON_HEIGHT + verticalRowGap;

    canvasUI.interpolationToolButton = {
        id: "interpolation-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: currentY,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };

    currentY += C.TOOL_BUTTON_HEIGHT + verticalRowGap;

    canvasUI.transformToolButton = {
        id: "transform-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: currentY,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };

    currentY += C.TOOL_BUTTON_HEIGHT + verticalRowGap;

    canvasUI.visibilityToolButton = {
        id: "visibility-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: currentY,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };

    currentY += C.TOOL_BUTTON_HEIGHT + verticalRowGap;

    canvasUI.sessionsToolButton = {
        id: "sessions-tool-button",
        type: "toolButton",
        x: C.UI_BUTTON_PADDING,
        y: currentY,
        width: C.UI_TOOLBAR_WIDTH - (2 * C.UI_BUTTON_PADDING),
        height: C.TOOL_BUTTON_HEIGHT,
    };
}

function buildColorPaletteUI() {
    canvasUI.colorSwatches = [];
    canvasUI.colorTargetIcons = [];

    // --- Standard Grid Parameters ---
    const standardHorizontalSpacing = C.TRANSFORM_ICON_SIZE + C.TRANSFORM_ICON_PADDING;
    const panelStartX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const buttonCenterY = canvasUI.colorToolButton.y + (C.TOOL_BUTTON_HEIGHT / 2);
    const itemSize = C.UI_SWATCH_SIZE;
    const verticalOffset = -2; // Nudge icons UP to align their visual center with the main button
    const itemY = buttonCenterY - (itemSize / 2) + verticalOffset;
    let currentGridX = panelStartX;

    // --- Layout each item, centering it within the standard grid pitch ---
    canvasUI.removeColorButton = {
        id: "remove-color-button",
        type: "button",
        x: currentGridX + (standardHorizontalSpacing - itemSize) / 2,
        y: itemY,
        width: itemSize,
        height: itemSize,
    };
    currentGridX += standardHorizontalSpacing;

    allColors.forEach((item, index) => {
        canvasUI.colorSwatches.push({
            id: `swatch-${index}`,
            type: "colorSwatch",
            x: currentGridX + (standardHorizontalSpacing - itemSize) / 2,
            y: itemY,
            width: itemSize,
            height: itemSize,
            index: index,
            item: item
        });
        currentGridX += standardHorizontalSpacing;
    });

    canvasUI.addColorButton = {
        id: "add-color-button",
        type: "button",
        x: currentGridX + (standardHorizontalSpacing - itemSize) / 2,
        y: itemY,
        width: itemSize,
        height: itemSize,
    };

    Object.entries(colorAssignments).forEach(([target, colorIndex]) => {
        const targetIconSize = itemSize * 0.75;
        const swatch = canvasUI.colorSwatches.find(s => s.index === colorIndex);
        if (swatch) {
            canvasUI.colorTargetIcons.push({
                id: `target-icon-${target}`,
                type: 'colorTargetIcon',
                target: target,
                x: swatch.x + (swatch.width - targetIconSize) / 2,
                y: swatch.y - targetIconSize - 5,
                width: targetIconSize,
                height: targetIconSize
            });
        }
    });

    const targetIconMap = new Map(canvasUI.colorTargetIcons.map(icon => [icon.target, icon]));
    Object.keys(colorAssignments).forEach((target) => {
        const baseTarget = getInheritedBaseTarget(target);
        if (baseTarget !== target) {
            const baseIcon = targetIconMap.get(baseTarget);
            const icon = targetIconMap.get(target);
            if (baseIcon && icon) {
                icon.x = baseIcon.x;
                icon.y = baseIcon.y;
                icon.width = baseIcon.width;
                icon.height = baseIcon.height;
            }
        }
    });

    const allPaletteElements = [
        ...canvasUI.colorSwatches, canvasUI.removeColorButton, canvasUI.addColorButton, ...canvasUI.colorTargetIcons
    ].filter(Boolean);

    if (allPaletteElements.length > 0) {
        const minY = Math.min(...allPaletteElements.map(el => el.y));
        const maxX = Math.max(...allPaletteElements.map(el => el.x + el.width));
        const maxY = Math.max(...allPaletteElements.map(el => el.y + el.height));
        const padding = 5;
        canvasUI.colorPaletteBounds = {
            x: C.UI_TOOLBAR_WIDTH,
            y: minY - padding,
            width: (maxX - C.UI_TOOLBAR_WIDTH) + padding,
            height: (maxY - minY) + (padding * 2)
        };
    } else {
        canvasUI.colorPaletteBounds = null;
    }
}

function buildColorModePanelUI() {
    canvasUI.colorModeIcons = [];
    if (!canvasUI.colorModeToolButton) return;

    const panelStartX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const buttonCenterY = canvasUI.colorModeToolButton.y + (C.TOOL_BUTTON_HEIGHT / 2);
    const iconSize = C.UI_SWATCH_SIZE;
    const verticalOffset = -2;
    const rowY = buttonCenterY - (iconSize / 2) + verticalOffset;
    const spacing = C.TRANSFORM_ICON_SIZE + C.TRANSFORM_ICON_PADDING;

    const entries = [
        { id: 'edge-color-mode', group: 'edge' },
        { id: 'face-color-mode', group: 'face' }
    ];

    let currentX = panelStartX;
    entries.forEach(entry => {
        const extraGap = entry.group === 'face' && (edgeColorMode === 'colormap' || faceColorMode.startsWith('colormap'))
            ? 240
            : 0;
        canvasUI.colorModeIcons.push({
            id: entry.id,
            type: 'colorModeIcon',
            group: entry.group,
            x: currentX + (spacing - iconSize) / 2,
            y: rowY,
            width: iconSize,
            height: iconSize
        });
        currentX += spacing + extraGap;
    });

    const allPanelElements = canvasUI.colorModeIcons.filter(Boolean);
    if (allPanelElements.length > 0) {
        const minY = Math.min(...allPanelElements.map(el => el.y));
        const maxX = Math.max(...allPanelElements.map(el => el.x + el.width));
        const maxY = Math.max(...allPanelElements.map(el => el.y + el.height));
        const padding = 5;
        canvasUI.colorModePanelBounds = {
            x: C.UI_TOOLBAR_WIDTH,
            y: minY - padding,
            width: (maxX - C.UI_TOOLBAR_WIDTH) + padding,
            height: (maxY - minY) + (padding * 2)
        };
    } else {
        canvasUI.colorModePanelBounds = null;
    }
}

function buildInterpolationPanelUI() {
    canvasUI.interpolationIcons = [];
    if (!canvasUI.interpolationToolButton) return;

    const panelStartX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const buttonCenterY = canvasUI.interpolationToolButton.y + (C.TOOL_BUTTON_HEIGHT / 2);
    const iconSize = C.TRANSFORM_ICON_SIZE;
    const verticalOffset = -2;
    const iconY = buttonCenterY - (iconSize / 2) + verticalOffset;
    const spacing = C.TRANSFORM_ICON_SIZE + C.TRANSFORM_ICON_PADDING;
    let currentX = panelStartX;

    canvasUI.interpolationIcons.push({
        id: 'interpolation-remove',
        type: 'interpolationRemove',
        x: currentX + (spacing - iconSize) / 2,
        y: iconY,
        width: iconSize,
        height: iconSize,
    });
    currentX += spacing;

    interpolationStyles.forEach(style => {
        canvasUI.interpolationIcons.push({
            id: `interpolation-${style.id}`,
            type: 'interpolationStyle',
            styleId: style.id,
            x: currentX + (spacing - iconSize) / 2,
            y: iconY,
            width: iconSize,
            height: iconSize,
        });
        currentX += spacing;
    });

    canvasUI.interpolationIcons.push({
        id: 'interpolation-add',
        type: 'interpolationAdd',
        x: currentX + (spacing - iconSize) / 2,
        y: iconY,
        width: iconSize,
        height: iconSize,
    });

    const allPanelElements = canvasUI.interpolationIcons.filter(Boolean);
    if (allPanelElements.length > 0) {
        const minY = Math.min(...allPanelElements.map(el => el.y));
        const maxX = Math.max(...allPanelElements.map(el => el.x + el.width));
        const maxY = Math.max(...allPanelElements.map(el => el.y + el.height));
        const padding = 5;
        canvasUI.interpolationPanelBounds = {
            x: C.UI_TOOLBAR_WIDTH,
            y: minY - padding,
            width: (maxX - C.UI_TOOLBAR_WIDTH) + padding,
            height: (maxY - minY) + (padding * 2)
        };
    } else {
        canvasUI.interpolationPanelBounds = null;
    }
}

function buildDisplayPanelUI() {
    canvasUI.displayIcons = [];
    if (!canvasUI.visibilityToolButton) return;

    // --- Standard Grid Parameters ---
    const standardHorizontalSpacing = C.TRANSFORM_ICON_SIZE + C.TRANSFORM_ICON_PADDING;
    const panelStartX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const buttonCenterY = canvasUI.visibilityToolButton.y + (C.TOOL_BUTTON_HEIGHT / 2);
    const iconSize = C.DISPLAY_ICON_SIZE;
    const verticalOffset = -2; // Nudge icons UP to align their visual center with the main button
    const iconY = buttonCenterY - (iconSize / 2) + verticalOffset;
    let currentGridX = panelStartX;

    const iconGroups = ['coords', 'grid', 'angles', 'distances', 'theme'];

    iconGroups.forEach((group) => {
        canvasUI.displayIcons.push({
            id: `display-icon-${group}`,
            group: group,
            x: currentGridX + (standardHorizontalSpacing - iconSize) / 2,
            y: iconY,
            width: iconSize,
            height: iconSize
        });
        currentGridX += standardHorizontalSpacing;
    });

    if (canvasUI.displayIcons.length > 0) {
        const firstIcon = canvasUI.displayIcons[0];
        const lastIcon = canvasUI.displayIcons[canvasUI.displayIcons.length - 1];
        const padding = 5;
        canvasUI.displayPanelBounds = {
            x: C.UI_TOOLBAR_WIDTH,
            y: firstIcon.y - padding,
            width: (lastIcon.x + lastIcon.width - C.UI_TOOLBAR_WIDTH) + padding,
            height: firstIcon.height + (padding * 2)
        };
    } else {
        canvasUI.displayPanelBounds = null;
    }
}

function buildSessionsPanelUI() {
    canvasUI.sessionIcons = [];
    if (!canvasUI.sessionsToolButton) return;

    const panelStartX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const buttonCenterY = canvasUI.sessionsToolButton.y + (C.TOOL_BUTTON_HEIGHT / 2);
    const itemSize = C.UI_SWATCH_SIZE;
    const verticalOffset = -2;
    const itemY = buttonCenterY - (itemSize / 2) + verticalOffset;
    const spacing = C.TRANSFORM_ICON_SIZE + C.TRANSFORM_ICON_PADDING;
    let currentX = panelStartX;

    canvasUI.removeSessionButton = {
        id: "remove-session-button",
        type: "button",
        x: currentX + (spacing - itemSize) / 2,
        y: itemY,
        width: itemSize,
        height: itemSize,
    };
    currentX += spacing;

    sessions.forEach((session, index) => {
        canvasUI.sessionIcons.push({
            id: `session-${session.id}`,
            type: "sessionIcon",
            x: currentX + (spacing - itemSize) / 2,
            y: itemY,
            width: itemSize,
            height: itemSize,
            index,
            session
        });
        currentX += spacing;
    });

    canvasUI.addSessionButton = {
        id: "add-session-button",
        type: "button",
        x: currentX + (spacing - itemSize) / 2,
        y: itemY,
        width: itemSize,
        height: itemSize,
    };

    const allPanelElements = [
        ...canvasUI.sessionIcons,
        canvasUI.removeSessionButton,
        canvasUI.addSessionButton
    ].filter(Boolean);

    if (allPanelElements.length > 0) {
        const minY = Math.min(...allPanelElements.map(el => el.y));
        const maxX = Math.max(...allPanelElements.map(el => el.x + el.width));
        const maxY = Math.max(...allPanelElements.map(el => el.y + el.height));
        const padding = 5;
        canvasUI.sessionsPanelBounds = {
            x: C.UI_TOOLBAR_WIDTH,
            y: minY - padding,
            width: (maxX - C.UI_TOOLBAR_WIDTH) + padding,
            height: (maxY - minY) + (padding * 2)
        };
    } else {
        canvasUI.sessionsPanelBounds = null;
    }
}

function buildTransformPanelUI() {
    canvasUI.transformIcons = [];

    // --- Grid System Parameters ---
    const iconSize = C.TRANSFORM_ICON_SIZE;
    const horizontalSpacing = iconSize + C.TRANSFORM_ICON_PADDING;
    const panelStartX = C.UI_TOOLBAR_WIDTH + C.UI_BUTTON_PADDING;
    const buttonCenterY = canvasUI.transformToolButton.y + (C.TOOL_BUTTON_HEIGHT / 2);
    const iconY = buttonCenterY - (iconSize / 2); // No vertical offset for the baseline row

    const transformTypes = [
        C.TRANSFORMATION_TYPE_ROTATION, C.TRANSFORMATION_TYPE_SCALE, C.TRANSFORMATION_TYPE_ROTATE_SCALE, C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE
    ];

    let currentGridX = panelStartX;

    transformTypes.forEach((type) => {
        canvasUI.transformIcons.push({
            id: `transform-icon-${type}`,
            type: type,
            x: currentGridX + (horizontalSpacing - iconSize) / 2,
            y: iconY,
            width: iconSize,
            height: iconSize
        });
        currentGridX += horizontalSpacing;
    });

    if (canvasUI.transformIcons.length > 0) {
        const firstIcon = canvasUI.transformIcons[0];
        const lastIcon = canvasUI.transformIcons[canvasUI.transformIcons.length - 1];
        const padding = 5;
        canvasUI.transformPanelBounds = {
            x: C.UI_TOOLBAR_WIDTH,
            y: firstIcon.y - padding,
            width: (lastIcon.x + lastIcon.width - C.UI_TOOLBAR_WIDTH) + padding,
            height: firstIcon.height + (padding * 2)
        };
    } else {
        canvasUI.transformPanelBounds = null;
    }
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
    syncColorAssignmentsForInheritance();

    buildColorPaletteUI();
}

function drawDebugBounds(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; // Bright red for visibility
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    const drawBox = (box) => {
        if (box) {
            ctx.strokeRect(box.x, box.y, box.width, box.height);
        }
    };

    // Draw bounds for all active UI areas
    if (isToolbarExpanded && canvasUI.mainToolbar) {
        drawBox(canvasUI.mainToolbar);
    }
    if (isColorPaletteExpanded && canvasUI.colorPaletteBounds) {
        drawBox(canvasUI.colorPaletteBounds);
    }
    if (isInterpolationPanelExpanded && canvasUI.interpolationPanelBounds) {
        drawBox(canvasUI.interpolationPanelBounds);
    }
    if (isTransformPanelExpanded && canvasUI.transformPanelBounds) {
        drawBox(canvasUI.transformPanelBounds);
    }
    if (isDisplayPanelExpanded && canvasUI.displayPanelBounds) {
        drawBox(canvasUI.displayPanelBounds);
    }
    if (isSessionsPanelExpanded && canvasUI.sessionsPanelBounds) {
        drawBox(canvasUI.sessionsPanelBounds);
    }
    if (isColorModePanelExpanded && canvasUI.colorModePanelBounds) {
        drawBox(canvasUI.colorModePanelBounds);
    }
    
    // Always draw the hamburger button box for reference
    drawBox(canvasUI.toolbarButton);

    ctx.restore();
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
    schedulePersistState();
    
}

function isMouseInUIPanel(pos) {
    // Always check the main toolbar button first, as it's always visible
    const btn = canvasUI.toolbarButton;
    if (btn && pos.x >= btn.x && pos.x <= btn.x + btn.width && pos.y >= btn.y && pos.y <= btn.y + btn.height) {
        return true;
    }

    // If the main toolbar is collapsed, no other UI is active
    if (!isToolbarExpanded) {
        return false;
    }

    // --- Step 1: Check for a direct hit inside any visible panel ---
    const activePanels = [];
    if (canvasUI.mainToolbar) activePanels.push(canvasUI.mainToolbar);
    if (isColorPaletteExpanded && canvasUI.colorPaletteBounds) activePanels.push(canvasUI.colorPaletteBounds);
    if (isInterpolationPanelExpanded && canvasUI.interpolationPanelBounds) activePanels.push(canvasUI.interpolationPanelBounds);
    if (isTransformPanelExpanded && canvasUI.transformPanelBounds) activePanels.push(canvasUI.transformPanelBounds);
    if (isDisplayPanelExpanded && canvasUI.displayPanelBounds) activePanels.push(canvasUI.displayPanelBounds);
    if (isSessionsPanelExpanded && canvasUI.sessionsPanelBounds) activePanels.push(canvasUI.sessionsPanelBounds);
    if (isColorModePanelExpanded && canvasUI.colorModePanelBounds) activePanels.push(canvasUI.colorModePanelBounds);

    for (const panel of activePanels) {
        if (panel && pos.x >= panel.x && pos.x <= panel.x + panel.width &&
            pos.y >= panel.y && pos.y <= panel.y + panel.height) {
            return true;
        }
    }

    // --- Step 2: Check for hits within the vertical gaps between submenus ---
    const activeSubPanels = [];
    if (isColorPaletteExpanded && canvasUI.colorPaletteBounds) activeSubPanels.push(canvasUI.colorPaletteBounds);
    if (isInterpolationPanelExpanded && canvasUI.interpolationPanelBounds) activeSubPanels.push(canvasUI.interpolationPanelBounds);
    if (isTransformPanelExpanded && canvasUI.transformPanelBounds) activeSubPanels.push(canvasUI.transformPanelBounds);
    if (isDisplayPanelExpanded && canvasUI.displayPanelBounds) activeSubPanels.push(canvasUI.displayPanelBounds);
    if (isSessionsPanelExpanded && canvasUI.sessionsPanelBounds) activeSubPanels.push(canvasUI.sessionsPanelBounds);
    if (isColorModePanelExpanded && canvasUI.colorModePanelBounds) activeSubPanels.push(canvasUI.colorModePanelBounds);
    
    // Sort panels by their Y position to check gaps between adjacent rows correctly
    activeSubPanels.sort((a, b) => a.y - b.y);

    for (let i = 0; i < activeSubPanels.length - 1; i++) {
        const panelA = activeSubPanels[i]; // Panel above
        const panelB = activeSubPanels[i + 1]; // Panel below

        const gapY_start = panelA.y + panelA.height;
        const gapY_end = panelB.y;

        // Check if cursor is vertically positioned in the gap between the two panels
        if (pos.y > gapY_start && pos.y < gapY_end) {
            // To keep the area next to shorter panels drawable, the gap's width is limited
            // by the narrower of the two adjacent panels.
            const gapX_start = C.UI_TOOLBAR_WIDTH;
            const panelA_submenuWidth = panelA.x + panelA.width - gapX_start;
            const panelB_submenuWidth = panelB.x + panelB.width - gapX_start;
            const gapWidth = Math.min(panelA_submenuWidth, panelB_submenuWidth);
            const gapX_end = gapX_start + gapWidth;

            // The cursor is in the UI if it's over the main toolbar or the safe gap area
            if (pos.x < C.UI_TOOLBAR_WIDTH || (pos.x >= gapX_start && pos.x <= gapX_end)) {
                return true;
            }
        }
    }
    
    // If we've reached this point, the cursor is over the drawable canvas area
    return false;
}

function restoreState(state) {
    allVertices = JSON.parse(JSON.stringify(state.vertices));
    allEdges = JSON.parse(JSON.stringify(state.edges));
    allFaces = JSON.parse(JSON.stringify(state.faces || []));
    allTextElements = JSON.parse(JSON.stringify(state.textElements || []));
    selectedVertexIds = JSON.parse(JSON.stringify(state.selectedVertexIds || []));
    selectedEdgeIds = JSON.parse(JSON.stringify(state.selectedEdgeIds || []));
    selectedFaceIds = JSON.parse(JSON.stringify(state.selectedFaceIds || []));
    selectedTextIds = JSON.parse(JSON.stringify(state.selectedTextIds || []));
    selectedCenterIds = JSON.parse(JSON.stringify(state.selectedCenterIds || []));
    activeColorTargets = JSON.parse(JSON.stringify(state.activeColorTargets || []));
    interpolationStyles = state.interpolationStyles && state.interpolationStyles.length > 0
        ? JSON.parse(JSON.stringify(state.interpolationStyles))
        : [JSON.parse(JSON.stringify(DEFAULT_INTERPOLATION_STYLE))];
    activeInterpolationStyleId = state.activeInterpolationStyleId || interpolationStyles[0]?.id || DEFAULT_INTERPOLATION_STYLE.id;
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
        [C.COLOR_TARGET_TEXT]: 0,
    };
    edgeColorMode = state.edgeColorMode || 'fixed';
    faceColorMode = state.faceColorMode || 'fixed';
    edgeColorExpression = state.edgeColorExpression || 'x';
    faceColorExpression = state.faceColorExpression || 'x';
    faceColorPolarExpression = state.faceColorPolarExpression || 'r';
    if (colorAssignments[C.COLOR_TARGET_TEXT] === undefined) {
        colorAssignments[C.COLOR_TARGET_TEXT] = 0;
    }
    syncColorAssignmentsForInheritance();
    applyColorModeDefaults();
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
    schedulePersistState();
    // REMOVE THE LINE BELOW:
    // saveStateForUndo();  <-- REMOVE THIS
}

function getCurrentState() {
    return {
        vertices: JSON.parse(JSON.stringify(allVertices)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        faces: JSON.parse(JSON.stringify(allFaces)),
        textElements: JSON.parse(JSON.stringify(allTextElements)),
        selectedVertexIds: JSON.parse(JSON.stringify(selectedVertexIds)),
        selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
        selectedFaceIds: JSON.parse(JSON.stringify(selectedFaceIds)),
        selectedTextIds: JSON.parse(JSON.stringify(selectedTextIds)),
        selectedCenterIds: JSON.parse(JSON.stringify(selectedCenterIds)),
        activeColorTargets: JSON.parse(JSON.stringify(activeColorTargets)),
        interpolationStyles: JSON.parse(JSON.stringify(interpolationStyles)),
        activeInterpolationStyleId: activeInterpolationStyleId,
        colorAssignments: JSON.parse(JSON.stringify(colorAssignments)),
        edgeColorMode,
        faceColorMode,
        edgeColorExpression,
        faceColorExpression,
        faceColorPolarExpression,
        allColors: JSON.parse(JSON.stringify(allColors)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartVertexId: previewLineStartVertexId,
        frozenReference_A_rad, frozenReference_A_baseRad, frozenReference_D_du, frozenReference_Origin_Data,
        frozenReference_D_g2g,
        deletedFaceIds: new Set(deletedFaceIds)
    };
}

function normalizeUserId(value) {
    if (!value) return '';
    return value.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

function getUserIdFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        return normalizeUserId(params.get('user'));
    } catch (err) {
        return '';
    }
}

function ensureActiveUserId() {
    if (activeUserId) return activeUserId;

    const urlUserId = getUserIdFromUrl();
    if (urlUserId) {
        activeUserId = urlUserId;
        try {
            localStorage.setItem(STORAGE_USER_ID_KEY, activeUserId);
        } catch (err) {
            console.warn('Could not persist user id to localStorage.', err);
        }
        return activeUserId;
    }

    try {
        activeUserId = localStorage.getItem(STORAGE_USER_ID_KEY);
    } catch (err) {
        activeUserId = null;
    }

    if (!activeUserId) {
        let promptValue = '';
        try {
            promptValue = window.prompt('Enter a name to keep your drawings on this device:', '') || '';
        } catch (err) {
            promptValue = '';
        }
        const normalized = normalizeUserId(promptValue);
        activeUserId = normalized || `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        try {
            localStorage.setItem(STORAGE_USER_ID_KEY, activeUserId);
        } catch (err) {
            console.warn('Could not persist user id to localStorage.', err);
        }
    }

    return activeUserId;
}

function getStateStorageKey() {
    const userId = ensureActiveUserId();
    return `${STORAGE_PREFIX}.state.v${STORAGE_VERSION}.${userId}`;
}

function getSessionsStorageKey() {
    const userId = ensureActiveUserId();
    return `${STORAGE_PREFIX}.sessions.v${STORAGE_VERSION}.${userId}`;
}

function createDefaultSessionState() {
    return {
        vertices: [],
        edges: [],
        faces: [],
        textElements: [],
        selectedVertexIds: [],
        selectedEdgeIds: [],
        selectedFaceIds: [],
        selectedTextIds: [],
        selectedCenterIds: [],
        activeColorTargets: [],
        interpolationStyles: [JSON.parse(JSON.stringify(DEFAULT_INTERPOLATION_STYLE))],
        activeInterpolationStyleId: DEFAULT_INTERPOLATION_STYLE.id,
        colorAssignments: {
            [C.COLOR_TARGET_VERTEX]: 0,
            [C.COLOR_TARGET_EDGE]: 1,
            [C.COLOR_TARGET_FACE]: 2,
            [C.COLOR_TARGET_TEXT]: 0,
        },
        edgeColorMode: 'fixed',
        faceColorMode: 'fixed',
        edgeColorExpression: 'x',
        faceColorExpression: 'x',
        faceColorPolarExpression: 'r',
        allColors: C.DEFAULT_RECENT_COLORS.map(color => {
            if (typeof color === 'string') {
                return { type: 'color', value: color };
            }
            return color;
        }),
        activeCenterId: null,
        isDrawingMode: false,
        previewLineStartVertexId: null,
        frozenReference_A_rad: null,
        frozenReference_A_baseRad: null,
        frozenReference_D_du: null,
        frozenReference_Origin_Data: null,
        frozenReference_D_g2g: null,
        deletedFaceIds: []
    };
}

function updateActiveSessionState() {
    if (!sessions.length) return;
    const session = sessions[activeSessionIndex];
    if (!session) return;
    session.state = getSerializableState();
}

function createSession(state, name = '') {
    return {
        id: U.generateUniqueId(),
        name,
        state: JSON.parse(JSON.stringify(state))
    };
}

function getSerializableState() {
    const state = getCurrentState();
    return {
        ...state,
        deletedFaceIds: Array.from(state.deletedFaceIds || [])
    };
}

function persistStateNow() {
    if (!window.localStorage) return;
    const storageKey = getStateStorageKey();
    const payload = {
        version: STORAGE_VERSION,
        savedAt: Date.now(),
        state: getSerializableState()
    };

    try {
        localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
        console.warn('Could not persist state to localStorage.', err);
    }

    if (sessions.length > 0) {
        updateActiveSessionState();
        const sessionsKey = getSessionsStorageKey();
        const sessionsPayload = {
            version: STORAGE_VERSION,
            savedAt: Date.now(),
            activeSessionIndex,
            sessions: sessions.map(session => ({
                ...session,
                state: JSON.parse(JSON.stringify(session.state))
            }))
        };
        try {
            localStorage.setItem(sessionsKey, JSON.stringify(sessionsPayload));
        } catch (err) {
            console.warn('Could not persist sessions to localStorage.', err);
        }
    }
}

function schedulePersistState() {
    if (!window.localStorage) return;
    if (persistTimeoutId) {
        clearTimeout(persistTimeoutId);
    }
    persistTimeoutId = setTimeout(() => {
        persistTimeoutId = null;
        persistStateNow();
    }, 300);
}

function loadStateFromStorage() {
    if (!window.localStorage) return false;
    const storageKey = getStateStorageKey();
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return false;
        const payload = JSON.parse(raw);
        if (!payload || !payload.state) return false;
        restoreState(payload.state);
        updateComponentDrawOrder();
        didRestoreFromStorage = true;
        return true;
    } catch (err) {
        console.warn('Could not load state from localStorage.', err);
        return false;
    }
}

function loadSessionsFromStorage() {
    if (!window.localStorage) return false;
    const sessionsKey = getSessionsStorageKey();
    try {
        const raw = localStorage.getItem(sessionsKey);
        if (!raw) return false;
        const payload = JSON.parse(raw);
        if (!payload || !Array.isArray(payload.sessions) || payload.sessions.length === 0) return false;
        sessions = payload.sessions.map(session => ({
            id: session.id || U.generateUniqueId(),
            name: session.name || '',
            state: session.state || createDefaultSessionState()
        }));
        activeSessionIndex = Math.min(Math.max(payload.activeSessionIndex || 0, 0), sessions.length - 1);
        selectedSessionIndex = activeSessionIndex;
        undoStack = [];
        redoStack = [];
        restoreState(sessions[activeSessionIndex].state);
        updateComponentDrawOrder();
        didRestoreFromStorage = true;
        return true;
    } catch (err) {
        console.warn('Could not load sessions from localStorage.', err);
        return false;
    }
}

function initializeSessionsFromCurrentState() {
    const initialState = getSerializableState();
    sessions = [createSession(initialState, 'World 1')];
    activeSessionIndex = 0;
    selectedSessionIndex = 0;
}

function setActiveSession(index) {
    if (index < 0 || index >= sessions.length) return;
    updateActiveSessionState();
    activeSessionIndex = index;
    selectedSessionIndex = index;
    undoStack = [];
    redoStack = [];
    restoreState(sessions[activeSessionIndex].state);
    updateComponentDrawOrder();
    if (isSessionsPanelExpanded) buildSessionsPanelUI();
    schedulePersistState();
}

function addNewSessionFromDefault() {
    updateActiveSessionState();
    const newSession = createSession(createDefaultSessionState(), `World ${sessions.length + 1}`);
    const insertIndex = selectedSessionIndex !== null ? selectedSessionIndex + 1 : sessions.length;
    sessions.splice(insertIndex, 0, newSession);
    setActiveSession(insertIndex);
}

function addSessionFromClipboard() {
    if (!sessionClipboard || !sessionClipboard.state) return;
    updateActiveSessionState();
    const newSession = createSession(sessionClipboard.state, `World ${sessions.length + 1}`);
    const insertIndex = selectedSessionIndex !== null ? selectedSessionIndex + 1 : sessions.length;
    sessions.splice(insertIndex, 0, newSession);
    setActiveSession(insertIndex);
}

function removeSessionAtIndex(index) {
    if (index < 0 || index >= sessions.length) return;
    updateActiveSessionState();
    if (sessions.length === 1) return;
    const nextIndex = index < sessions.length - 1 ? index : index - 1;
    const [removed] = sessions.splice(index, 1);
    sessionUndoStack.push({ session: removed, index });
    if (activeSessionIndex === index) {
        setActiveSession(Math.max(0, Math.min(nextIndex, sessions.length - 1)));
    } else {
        if (activeSessionIndex > index) activeSessionIndex -= 1;
        if (selectedSessionIndex > index) selectedSessionIndex -= 1;
        if (isSessionsPanelExpanded) buildSessionsPanelUI();
        schedulePersistState();
    }
}

function restoreDeletedSession() {
    if (!sessionUndoStack.length) return false;
    const { session, index } = sessionUndoStack.pop();
    const insertIndex = Math.max(0, Math.min(index, sessions.length));
    sessions.splice(insertIndex, 0, session);
    setActiveSession(insertIndex);
    return true;
}

function selectNextSession() {
    if (!sessions.length) return;
    const nextIndex = (selectedSessionIndex + 1) % sessions.length;
    setActiveSession(nextIndex);
}

function selectPreviousSession() {
    if (!sessions.length) return;
    const prevIndex = (selectedSessionIndex - 1 + sessions.length) % sessions.length;
    setActiveSession(prevIndex);
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

function findVertexById(id) {
    return allVertices.find(p => p.id === id);
}

function findAllVerticesInSubgraph(startVertexId) {
    if (!findVertexById(startVertexId)) return [];
    const visited = new Set();
    const queue = [startVertexId];
    const subgraphVertexIds = [];
    visited.add(startVertexId);
    while (queue.length > 0) {
        const currentVertexId = queue.shift();
        subgraphVertexIds.push(currentVertexId);
        U.findNeighbors(currentVertexId, allEdges).forEach(neighborId => {
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push(neighborId);
            }
        });
    }
    return subgraphVertexIds;
}

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
    const selectedTextIdSet = new Set(selectedTextIds);
    const faceIdSet = new Set(selectedFaceIds);
    const edgeIdSet = new Set(selectedEdgeIds);
    clipboard.texts = allTextElements.filter(text => {
        if (selectedTextIdSet.has(text.id)) return true;
        if (text.anchorType === 'vertex') return verticesToCopyIds.has(text.anchorId);
        if (text.anchorType === 'edge') {
            if (edgeIdSet.has(text.anchorId)) return true;
            const edge = allEdges.find(e => U.getEdgeId(e) === text.anchorId);
            return edge ? (verticesToCopyIds.has(edge.id1) && verticesToCopyIds.has(edge.id2)) : false;
        }
        if (text.anchorType === 'face') {
            if (faceIdSet.has(text.anchorId)) return true;
            const face = allFaces.find(f => U.getFaceId(f) === text.anchorId);
            return face ? face.vertexIds.every(id => verticesToCopyIds.has(id)) : false;
        }
        return false;
    }).map(text => JSON.parse(JSON.stringify(text)));
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

    const newPastedTextIds = [];
    clipboard.texts.forEach(cbText => {
        const newText = JSON.parse(JSON.stringify(cbText));
        newText.id = U.generateUniqueId();
        if (newText.anchorType === 'canvas') {
            if (!newText.position) return;
            newText.position = {
                x: newText.position.x + deltaX,
                y: newText.position.y + deltaY
            };
        } else if (newText.anchorType === 'vertex') {
            const newAnchorId = oldToNewIdMap.get(newText.anchorId);
            if (!newAnchorId) return;
            newText.anchorId = newAnchorId;
        } else if (newText.anchorType === 'edge') {
            const edge = allEdges.find(e => U.getEdgeId(e) === newText.anchorId);
            if (!edge) return;
            const newId1 = oldToNewIdMap.get(edge.id1);
            const newId2 = oldToNewIdMap.get(edge.id2);
            if (!newId1 || !newId2) return;
            newText.anchorId = U.getEdgeId({ id1: newId1, id2: newId2 });
        } else if (newText.anchorType === 'face') {
            const face = allFaces.find(f => U.getFaceId(f) === newText.anchorId);
            if (!face) return;
            const newVertexIds = face.vertexIds.map(id => oldToNewIdMap.get(id));
            if (!newVertexIds.every(Boolean)) return;
            newText.anchorId = U.getFaceId({ vertexIds: newVertexIds });
        }

        allTextElements.push(newText);
        newPastedTextIds.push(newText.id);
    });

    // Select the newly pasted geometry
    selectedVertexIds = newPastedRegularVertexIds;
    selectedEdgeIds = clipboard.edges.map(e => U.getEdgeId({ id1: oldToNewIdMap.get(e.id1), id2: oldToNewIdMap.get(e.id2) }));
    selectedFaceIds = newPastedFaceIds;
    selectedTextIds = newPastedTextIds;
    activeCenterId = newPastedActiveCenterId;

    updateComponentDrawOrder()
}

function deleteSelectedItems() {
    const vertexIdsToDelete = new Set(selectedVertexIds);
    const centerIdsToDelete = new Set(selectedCenterIds);
    const edgeIdsToDelete = new Set(selectedEdgeIds);
    const faceIdsToExplicitlyDelete = new Set(selectedFaceIds);
    const textIdsToDelete = new Set(selectedTextIds);

    if (vertexIdsToDelete.size === 0 && centerIdsToDelete.size === 0 && edgeIdsToDelete.size === 0 && faceIdsToExplicitlyDelete.size === 0 && textIdsToDelete.size === 0) {
        return;
    }
    saveStateForUndo();

    if (faceIdsToExplicitlyDelete.size > 0) {
        const facesToRemoveCompletely = new Set();
        
        allFaces.forEach(face => {
            const faceId = face.id || U.getFaceId(face);
            if (faceIdsToExplicitlyDelete.has(faceId)) {
                deletedFaceIds.add(faceId);
                if (face.childFaceIds && face.childFaceIds.length > 0) {
                    face.childFaceIds.forEach(childId => {
                        const childFace = allFaces.find(f => f.id === childId);
                        if (childFace) {
                            childFace.parentFaceId = null;
                        }
                    });
                }

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

        while (remainingToDelete.size > 0) {
            const startId = remainingToDelete.values().next().value;
            const component = new Set();
            const queue = [startId];
            
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

            const boundaryEdges = allEdges.filter(e => 
                (component.has(e.id1) && !component.has(e.id2)) ||
                (component.has(e.id2) && !component.has(e.id1))
            );
            const outermostNeighbors = new Set();
            boundaryEdges.forEach(e => {
                if (!component.has(e.id1)) outermostNeighbors.add(e.id1);
                if (!component.has(e.id2)) outermostNeighbors.add(e.id2);
            });

            const neighborsToConnect = Array.from(outermostNeighbors);
            if (neighborsToConnect.length === 2) {
                const [id1, id2] = neighborsToConnect;
                const v1 = findVertexById(id1);
                const v2 = findVertexById(id2);
                const edgeExists = allEdges.some(e => (e.id1 === id1 && e.id2 === id2) || (e.id1 === id2 && e.id2 === id1));
                if (v1 && v2 && !edgeExists) {
                    const newEdge = U.createEdge(v1, v2, gridInterval, getColorForTarget);
                    applyActiveInterpolationToEdge(newEdge);
                    newEdgesToAdd.push(newEdge);
                }
            }
        }

        allVertices = allVertices.filter(p => !vertexIdsToDelete.has(p.id));
        allEdges = allEdges.filter(e => !vertexIdsToDelete.has(e.id1) && !vertexIdsToDelete.has(e.id2));

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

    if (textIdsToDelete.size > 0) {
        allTextElements = allTextElements.filter(el => !textIdsToDelete.has(el.id));
    }

    const existingVertexIds = new Set(allVertices.map(v => v.id));
    const existingEdgeIds = new Set(allEdges.map(e => U.getEdgeId(e)));
    const existingFaceIds = new Set(allFaces.map(f => U.getFaceId(f)));
    allTextElements = allTextElements.filter(el => {
        if (el.anchorType === 'vertex') return existingVertexIds.has(el.anchorId);
        if (el.anchorType === 'edge') return existingEdgeIds.has(el.anchorId);
        if (el.anchorType === 'face') return existingFaceIds.has(el.anchorId);
        return true;
    });
    selectedTextIds = selectedTextIds.filter(id => allTextElements.some(el => el.id === id));

    performEscapeAction();
    updateComponentDrawOrder()
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
                    applyActiveInterpolationToEdge(newEdge);
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
    updateComponentDrawOrder()
}

function applySelectionLogic(vertexIdsToSelect = [], edgeIdsToSelect = [], faceIdsToSelect = [], wantsShift, wantsCtrl, targetIsCenter = false, textIdsToSelect = []) {
    if (targetIsCenter) {
        handleCenterSelection(vertexIdsToSelect[0], wantsShift, wantsCtrl);
    } else {
        if (wantsShift) {
            selectedVertexIds = [...new Set([...selectedVertexIds, ...vertexIdsToSelect])];
            selectedEdgeIds = [...new Set([...selectedEdgeIds, ...edgeIdsToSelect])];
            selectedFaceIds = [...new Set([...selectedFaceIds, ...faceIdsToSelect])];
            selectedTextIds = [...new Set([...selectedTextIds, ...textIdsToSelect])];
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
            textIdsToSelect.forEach(id => {
                const index = selectedTextIds.indexOf(id);
                if (index > -1) selectedTextIds.splice(index, 1);
                else selectedTextIds.push(id);
            });
        } else {
            selectedVertexIds = [...vertexIdsToSelect];
            selectedEdgeIds = [...edgeIdsToSelect];
            selectedFaceIds = [...faceIdsToSelect];
            selectedTextIds = [...textIdsToSelect];
        }
    }
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

    const correctFacesForComponent = U.detectClosedPolygons(affectedEdges, findVertexById);

    // Remove all old faces within the affected component
    const oldFaceIdsToRemove = new Set(oldFacesInComponent.map(f => f.id));
    allFaces = allFaces.filter(f => !oldFaceIdsToRemove.has(f.id));

    // ============================ START OF NEW FIX ============================
    
    let facesToAdd = correctFacesForComponent;

    // If we detected more than one new face, check for a composite face.
    if (correctFacesForComponent.length > 1) {
        const facesWithAreas = correctFacesForComponent.map(face => {
            const vertices = face.vertexIds.map(id => findVertexById(id));
            // Ensure all vertices for the face are valid before calculating area
            if (vertices.some(v => !v)) return null;
            return { face: face, area: Math.abs(U.shoelaceArea(vertices)) };
        }).filter(Boolean); // Remove any nulls from invalid faces

        if (facesWithAreas.length > 1) {
            // Sort faces by area, largest first
            facesWithAreas.sort((a, b) => b.area - a.area);

            const largestFace = facesWithAreas[0];
            const sumOfOthersArea = facesWithAreas.slice(1).reduce((sum, item) => sum + item.area, 0);

            // If the largest face's area equals the sum of the others, it's a composite face.
            if (Math.abs(largestFace.area - sumOfOthersArea) < C.GEOMETRY_CALCULATION_EPSILON) {
                // In this case, the faces we want to add are all BUT the largest one.
                facesToAdd = facesWithAreas.slice(1).map(item => item.face);
            }
        }
    }
    
    // ============================= END OF NEW FIX =============================

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

    const edgeA = U.createEdge(p1, newVertex, gridInterval, getColorForTarget);
    const edgeB = U.createEdge(newVertex, p2, gridInterval, getColorForTarget);
    applyActiveInterpolationToEdge(edgeA);
    applyActiveInterpolationToEdge(edgeB);
    allEdges.push(edgeA);
    allEdges.push(edgeB);

    if (facesVisible) {
        updateFaces(edgesBefore, allEdges);
    }

    return newVertex;
}



function getBestRotateScaleSnap(center, initialVertexStates, handleVertex, rawRotation, rawScale) {
    const mouseDataPos = U.applyTransformToVertex(handleVertex, center, rawRotation, rawScale, false, null);
    const startVector = { x: handleVertex.x - center.x, y: handleVertex.y - center.y };
    const snapRadius = 2 * C.VERTEX_RADIUS / viewTransform.scale;
    const verticesToTransform = initialVertexStates.filter(p => p.type === 'regular');

    // --- 1. Check for an overriding Merge Snap ---
    const mergeSnaps = [];
    if (verticesToTransform.length > 0) {
        const staticVertices = allVertices.filter(p => p.type === 'regular' && !initialVertexStates.some(ip => ip.id === p.id));
        const copyCount = parseInt(copyCountInput || '1', 10) || 1;
        for (let i = 1; i <= copyCount; i++) {
            verticesToTransform.forEach(p_source => {
                staticVertices.forEach(p_target => {
                    const v_source = { x: p_source.x - center.x, y: p_source.y - center.y };
                    const v_target = { x: p_target.x - center.x, y: p_target.y - center.y };
                    const r_source = Math.hypot(v_source.x, v_source.y);
                    const r_target = Math.hypot(v_target.x, v_target.y);
                    if (r_source > C.GEOMETRY_CALCULATION_EPSILON) {
                        const snap_scale = Math.pow(r_target / r_source, 1 / i);
                        let target_angle = Math.atan2(v_target.y, v_target.x) - Math.atan2(v_source.y, v_source.x);
                        const unwrapped_target_angle = target_angle + Math.round((rawRotation * i - target_angle) / (2 * Math.PI)) * (2 * Math.PI);
                        const snap_rotation = unwrapped_target_angle / i;
                        const handleAtSnapPos = U.applyTransformToVertex(handleVertex, center, snap_rotation, snap_scale, false, startVector);
                        const snapDist = U.distance(mouseDataPos, handleAtSnapPos);
                        mergeSnaps.push({ dist: snapDist, rotation: snap_rotation, scale: snap_scale, pos: handleAtSnapPos });
                    }
                });
            });
        }
    }
    
    if (mergeSnaps.length > 0) {
        const bestMergeSnap = mergeSnaps.sort((a, b) => a.dist - b.dist)[0];
        if (bestMergeSnap.dist < snapRadius) {
            return { ...bestMergeSnap, snapped: true, snapType: 'merge', snappedScaleValue: bestMergeSnap.scale };
        }
    }

    // --- 2. If no merge, perform Geometric Snapping on Shift ---
    if (currentShiftPressed) {
        const geometricSnaps = [];
        const polarCandidates = [];
        const cartesianCandidates = [];

        // Gather 4 polar candidates
        const allSnapAngles = C.NINETY_DEG_ANGLE_SNAP_FRACTIONS.flatMap(f => {
            const angle = f * Math.PI / 2;
            return angle === 0 ? [0] : [angle, -angle];
        }).sort((a, b) => Math.abs(U.normalizeAngleToPi(rawRotation - a)) - Math.abs(U.normalizeAngleToPi(rawRotation - b)));
        const allSnapScales = C.SNAP_FACTORS.filter(f => f > 0).sort((a,b) => Math.abs(rawScale - a) - Math.abs(rawScale - b));
        const candidateAngles = allSnapAngles.slice(0, 2);
        const candidateScales = allSnapScales.slice(0, 2);
        candidateAngles.forEach(angle => {
            candidateScales.forEach(scale => {
                const unwrappedAngle = angle + Math.round((rawRotation - angle) / (2 * Math.PI)) * (2 * Math.PI);
                const handleAtSnapPos = U.applyTransformToVertex(handleVertex, center, unwrappedAngle, scale, false, startVector);
                polarCandidates.push({ dist: U.distance(mouseDataPos, handleAtSnapPos), rotation: unwrappedAngle, scale: scale, pos: handleAtSnapPos });
            });
        });

        // Gather 4 Cartesian grid candidates
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        if (gridInterval) {
            const gridPoints = U.getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true);
            const startHandleRadius = Math.hypot(startVector.x, startVector.y);
            gridPoints.forEach(point => {
                if (startHandleRadius > C.GEOMETRY_CALCULATION_EPSILON) {
                    const targetVector = { x: point.x - center.x, y: point.y - center.y };
                    const targetScale = Math.hypot(targetVector.x, targetVector.y) / startHandleRadius;
                    const deltaAngle = Math.atan2(targetVector.y, targetVector.x) - Math.atan2(startVector.y, startVector.x);
                    const unwrappedDeltaAngle = deltaAngle + Math.round((rawRotation - deltaAngle) / (2 * Math.PI)) * (2 * Math.PI);
                    cartesianCandidates.push({ dist: U.distance(mouseDataPos, point), rotation: unwrappedDeltaAngle, scale: targetScale, pos: point });
                }
            });
        }
        
        const bestSnap = [...polarCandidates, ...cartesianCandidates].sort((a,b) => a.dist - b.dist)[0];
        return { ...bestSnap, snapped: true, snapType: 'geometric', snappedScaleValue: bestSnap.scale };
    }

    // --- 3. Fallback to unsnapped ---
    return { rotation: rawRotation, scale: rawScale, pos: mouseDataPos, snapped: false };
}

function getBestRotationSnap(center, initialVertexStates, handleVertex, rawRotation, mouseCursorDataPos) {
    const copyCount = parseInt(copyCountInput || '1', 10);
    let allPossibleSnaps = [];
    const handleRadius = Math.hypot(handleVertex.x - center.x, handleVertex.y - center.y);
    const snapRadius = 2 * C.VERTEX_RADIUS / viewTransform.scale;

    const verticesToTransform = initialVertexStates.filter(p => p.type === 'regular');
    const staticVertices = allVertices.filter(p => p.type === 'regular' && !initialVertexStates.some(ip => ip.id === p.id));
    
    // --- Merge Snaps ---
    const multipliers = Array.from({ length: copyCount }, (_, k) => k + 1);
    multipliers.forEach(k => {
        verticesToTransform.forEach(p_orig => {
            staticVertices.forEach(p_target => {
                const v_orig = { x: p_orig.x - center.x, y: p_orig.y - center.y };
                const v_target = { x: p_target.x - center.x, y: p_target.y - center.y };
                if (Math.abs(Math.hypot(v_orig.x, v_orig.y) - Math.hypot(v_target.x, v_target.y)) < C.GEOMETRY_CALCULATION_EPSILON) {
                    let delta_theta = Math.atan2(v_target.y, v_target.x) - Math.atan2(v_orig.y, v_orig.x);
                    const unwrapped_delta = delta_theta + Math.round((rawRotation * k - delta_theta) / (2 * Math.PI)) * (2 * Math.PI);
                    allPossibleSnaps.push({ rotation: unwrapped_delta / k, priority: Math.abs(U.normalizeAngleToPi((unwrapped_delta / k) - rawRotation)), snapType: 'merge' });
                }
            });
        });
    });

    // --- Geometric and Projection Snaps (Shift key) ---
    if (currentShiftPressed) {
        // ... (rest of the snapping logic is correct) ...
        const allSnapAngles = C.NINETY_DEG_ANGLE_SNAP_FRACTIONS.flatMap(f => {
            const angle = f * Math.PI / 2;
            return angle === 0 ? [0] : [angle, -angle];
        });
        allSnapAngles.forEach(angle => {
            const priority = Math.abs(U.normalizeAngleToPi(rawRotation - angle));
            const unwrappedAngle = angle + Math.round((rawRotation - angle) / (2 * Math.PI)) * (2 * Math.PI);
            allPossibleSnaps.push({ rotation: unwrappedAngle, priority: priority, snapType: 'geometric' });
        });

        const excludedVertexIds = new Set(initialVertexStates.map(v => v.id));
        let projectionCandidates = allVertices.filter(p => p.type === 'regular' && !excludedVertexIds.has(p.id));
        if (lastGridState) {
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (gridInterval) {
                projectionCandidates.push(...U.getGridSnapCandidates(mouseCursorDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true));
            }
        }
        
        projectionCandidates.forEach(candidate => {
            const distToCursor = U.distance(mouseCursorDataPos, candidate);
            if (distToCursor < C.VERTEX_SELECT_RADIUS / viewTransform.scale) {
                const dragOriginAngle = Math.atan2(handleVertex.y - center.y, handleVertex.x - center.x);
                const projectionSourceAngle = Math.atan2(candidate.y - center.y, candidate.x - center.x);
                const deltaAngle = U.normalizeAngleToPi(projectionSourceAngle - dragOriginAngle);
                const unwrappedDelta = deltaAngle + Math.round((rawRotation - deltaAngle) / (2*Math.PI)) * (2*Math.PI);
                allPossibleSnaps.push({ 
                    rotation: unwrappedDelta,
                    priority: distToCursor / 1000, 
                    snapType: 'projection',
                    projectionSource: candidate,
                });
            }
        });
    }

    if (allPossibleSnaps.length === 0) {
        // --- FIX #1: REMOVE 'pos' FROM THE RETURN OBJECT ---
        // This allows handleMouseMove to use the raw mouseData.
        return { rotation: rawRotation, snapped: false, snapType: null };
    }

    allPossibleSnaps.sort((a, b) => a.priority - b.priority);
    const bestSnap = allPossibleSnaps[0];
    
    if (bestSnap.snapType === 'merge') {
        const finalPosCheck = U.applyTransformToVertex(handleVertex, center, bestSnap.rotation, 1, false, null);
        if (U.distance(mouseCursorDataPos, finalPosCheck) > snapRadius) {
            // --- FIX #2: REMOVE 'pos' FROM THIS FALLBACK RETURN AS WELL ---
            return { rotation: rawRotation, snapped: false, snapType: null };
        }
    }

    const finalPos = U.applyTransformToVertex(handleVertex, center, bestSnap.rotation, 1, false, null);
    let finalProjectionPoint = null;
    if (bestSnap.snapType === 'projection') {
         finalProjectionPoint = {
              x: center.x + handleRadius * Math.cos(Math.atan2(handleVertex.y-center.y, handleVertex.x-center.x) + bestSnap.rotation),
              y: center.y + handleRadius * Math.sin(Math.atan2(handleVertex.y-center.y, handleVertex.x-center.x) + bestSnap.rotation)
         };
    }
    
    return {
        rotation: bestSnap.rotation,
        pos: finalPos,
        snapped: true,
        snapType: bestSnap.snapType,
        projectionSource: bestSnap.projectionSource || null,
        projectionPoint: finalProjectionPoint
    };
}

function getBestScaleSnap(center, initialVertexStates, handleVertex, rawScale) {
    const mouseCursorDataPos = screenToData(mousePos);
    const snapRadius = 2 * C.VERTEX_RADIUS / viewTransform.scale;
    const verticesToTransform = initialVertexStates.filter(p => p.type === 'regular');
    
    // --- 1. Check for an overriding Merge Snap ---
    const mergeSnaps = [];
    if (verticesToTransform.length > 0) {
        const staticVertices = allVertices.filter(p => p.type === 'regular' && !initialVertexStates.some(ip => ip.id === p.id));
        const angleThreshold = snapRadius / 100;
        const copyCount = parseInt(copyCountInput || '1', 10);

        for (let i = 1; i <= copyCount; i++) {
            verticesToTransform.forEach(p_orig => {
                staticVertices.forEach(p_static => {
                    const v_orig = { x: p_orig.x - center.x, y: p_orig.y - center.y };
                    const v_static = { x: p_static.x - center.x, y: p_static.y - center.y };
                    const r_orig = Math.hypot(v_orig.x, v_orig.y);
                    const r_static = Math.hypot(v_static.x, v_static.y);
                    if (r_orig > C.GEOMETRY_CALCULATION_EPSILON) {
                        const theta_orig = Math.atan2(v_orig.y, v_orig.x);
                        const theta_static = Math.atan2(v_static.y, v_static.y);
                        if (Math.abs(U.normalizeAngleToPi(theta_orig - theta_static)) < angleThreshold) {
                             const snap_scale = Math.pow(r_static / r_orig, 1 / i);
                             const finalPos = U.applyTransformToVertex(handleVertex, center, 0, snap_scale, false, null);
                             mergeSnaps.push({ scale: snap_scale, dist: U.distance(mouseCursorDataPos, finalPos) });
                        }
                    }
                });
            });
        }
        if (copyCount > 1) { /* Additional copy-to-copy logic could go here if needed */ }
    }
    
    if (mergeSnaps.length > 0) {
        const bestMergeSnap = mergeSnaps.sort((a, b) => a.dist - b.dist)[0];
        if (bestMergeSnap.dist < snapRadius) {
            const finalPos = U.applyTransformToVertex(handleVertex, center, 0, bestMergeSnap.scale, false, null);
            return { ...bestMergeSnap, pos: finalPos, snapped: true, snapType: 'merge' };
        }
    }

    // --- 2. If no merge, perform Geometric/Projection Snapping on Shift ---
    if (currentShiftPressed) {
        let bestFractionalSnap, bestProjectionSnap;

        let closestFactor = 1;
        let minDiff = Infinity;
        C.SNAP_FACTORS.forEach(factor => {
            const diff = Math.abs(rawScale - factor);
            if (diff < minDiff) { minDiff = diff; closestFactor = factor; }
        });
        const fractionalPos = U.applyTransformToVertex(handleVertex, center, 0, closestFactor, false, null);
        bestFractionalSnap = { scale: closestFactor, pos: fractionalPos, dist: U.distance(mouseCursorDataPos, fractionalPos), snapType: 'geometric', snappedScaleValue: closestFactor };

        const excludedVertexIds = new Set(initialVertexStates.map(v => v.id));
        const projectionCandidates = allVertices.filter(p => p.type === 'regular' && !excludedVertexIds.has(p.id));
        if (lastGridState) {
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (gridInterval) {
                projectionCandidates.push(...U.getGridSnapCandidates(mouseCursorDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true));
            }
        }
        
        if (projectionCandidates.length > 0) {
            const bestCand = projectionCandidates.reduce((a, b) => (U.distance(mouseCursorDataPos, a) < U.distance(mouseCursorDataPos, b) ? a : b));
            const handleRadius = Math.hypot(handleVertex.x - center.x, handleVertex.y - center.y);
            const snapRadiusProj = U.distance(center, bestCand);
            if (handleRadius > C.GEOMETRY_CALCULATION_EPSILON) {
                const snappedScale = snapRadiusProj / handleRadius;
                const handleAngle = Math.atan2(handleVertex.y - center.y, handleVertex.x - center.x);
                const finalPos = { x: center.x + snapRadiusProj * Math.cos(handleAngle), y: center.y + snapRadiusProj * Math.sin(handleAngle) };
                bestProjectionSnap = { scale: snappedScale, pos: finalPos, dist: U.distance(mouseCursorDataPos, finalPos), snapType: 'projection', snappedScaleValue: snappedScale, projectionSource: bestCand };
            }
        }
        
        if (bestProjectionSnap && U.distance(mouseCursorDataPos, bestProjectionSnap.projectionSource) < snapRadius) {
             return { ...bestProjectionSnap, snapped: true };
        } else {
             return { ...bestFractionalSnap, snapped: true };
        }
    }

    // --- 3. Fallback to unsnapped ---
    // --- FIX: REMOVE 'pos' FROM THIS FALLBACK RETURN ---
    return { scale: rawScale, snapped: false, snapType: null };
}

function getBestDirectionalScaleSnap(center, initialVertexStates, handleVertex, rawScale, startVector, mouseCursorDataPos) {
    let allPossibleSnaps = [];
    const snapRadius = 2 * C.VERTEX_RADIUS / viewTransform.scale;
    const verticesToTransform = initialVertexStates.filter(p => p.type === 'regular');

    // --- 1. Check for an overriding Merge Snap ---
    // Note: Merge snapping for directional scale is complex and has been omitted for now.

    // --- 2. If no merge, perform Geometric/Projection Snapping on Shift ---
    if (currentShiftPressed) {
        let bestFractionalSnap = null;
        let bestProjectionSnap = null;

        // --- Find Best Fractional Snap (Default Behavior) ---
        let closestFactor = 1;
        let minDiff = Infinity;
        const scaleCandidates = [...C.SNAP_FACTORS, ...C.SNAP_FACTORS.map(f => -f)];
        scaleCandidates.forEach(factor => {
            const diff = Math.abs(rawScale - factor);
            if (diff < minDiff) {
                minDiff = diff;
                closestFactor = factor;
            }
        });
        const fractionalPos = U.applyTransformToVertex(handleVertex, center, 0, closestFactor, true, startVector);
        bestFractionalSnap = { scale: closestFactor, pos: fractionalPos, dist: U.distance(mouseCursorDataPos, fractionalPos), snapType: 'geometric', snappedScaleValue: closestFactor };

        // --- Find Best Projection Target ---
        const excludedVertexIds = new Set(initialVertexStates.map(v => v.id));
        const projectionCandidates = allVertices.filter(p => p.type === 'regular' && !excludedVertexIds.has(p.id));
        if (lastGridState) {
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (gridInterval) {
                projectionCandidates.push(...U.getGridSnapCandidates(mouseCursorDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true));
            }
        }
        
        if (projectionCandidates.length > 0) {
            const bestProjectionCandidate = projectionCandidates.reduce((best, current) => (U.distance(mouseCursorDataPos, current) < U.distance(mouseCursorDataPos, best) ? current : best));
            const axisDist = Math.hypot(startVector.x, startVector.y);

            if (axisDist > C.GEOMETRY_CALCULATION_EPSILON) {
                const axisNorm = { x: startVector.x / axisDist, y: startVector.y / axisDist };
                const getParallelDist = (p) => (p.x - center.x) * axisNorm.x + (p.y - center.y) * axisNorm.y;

                const handleParallelDist = getParallelDist(handleVertex);
                if (Math.abs(handleParallelDist) > C.GEOMETRY_CALCULATION_EPSILON) {
                    const candidateParallelDist = getParallelDist(bestProjectionCandidate);
                    const snappedScale = candidateParallelDist / handleParallelDist;
                    const finalPos = U.applyTransformToVertex(handleVertex, center, 0, snappedScale, true, startVector);
                    bestProjectionSnap = { scale: snappedScale, pos: finalPos, dist: U.distance(mouseCursorDataPos, finalPos), snapType: 'projection', snappedScaleValue: snappedScale, projectionSource: bestProjectionCandidate };
                }
            }
        }
        
        // --- Decide The Winner ---
        if (bestProjectionSnap && U.distance(mouseCursorDataPos, bestProjectionSnap.projectionSource) < snapRadius) {
             allPossibleSnaps.push({ ...bestProjectionSnap, priority: 0 });
        } else {
             allPossibleSnaps.push({ ...bestFractionalSnap, priority: 1 });
        }
    }

    if (allPossibleSnaps.length === 0) {
        // --- FIX: REMOVE 'pos' FROM THIS FALLBACK RETURN ---
        return { scale: rawScale, snapped: false, snapType: null };
    }
    
    const bestSnap = allPossibleSnaps.sort((a, b) => a.priority - b.priority)[0];
    return { ...bestSnap, snapped: true };
}

function drawEnvironment(colors) {
    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;

    const { grid1Interval, grid2Interval, alpha1, alpha2 } = R.calculateGridIntervals(viewTransform.scale);
    lastGridState = { interval1: grid1Interval, interval2: grid2Interval, alpha1, alpha2, scale: viewTransform.scale };
    lastAngularGridState = R.getDynamicAngularIntervals(viewTransform, actualCanvasWidth, actualCanvasHeight, dataToScreen);

    R.drawGrid(ctx, { gridDisplayMode, canvas, dpr, viewTransform, gridAlpha, colors }, dataToScreen, screenToData, lastGridState, lastAngularGridState);

    let axisFormatInfo = { useScientific: false };
    if (coordsDisplayMode !== C.COORDS_DISPLAY_MODE_NONE) {
        const stateForAxes = { canvas, dpr, coordsDisplayMode, viewTransform, angleDisplayMode, colors };
        axisFormatInfo = R.drawAxes(ctx, htmlOverlay, stateForAxes, dataToScreen, screenToData, lastGridState, lastAngularGridState, updateHtmlLabel);
    }
    return axisFormatInfo;
}

function drawMainGeometry(colors) {
    const isDeformingDrag = isDragConfirmed && initialDragVertexStates.length === 1 && !transformIndicatorData && initialDragVertexStates[0].type === 'regular';

    componentDrawOrder.forEach(componentVertexIds => {
        const isDraggedComponent = isDragConfirmed && initialDragVertexStates.length > 0 &&
            [...componentVertexIds].some(id =>
                initialDragVertexStates.some(v => v.id === id)
            );

        if (!isDraggedComponent) {
             drawComponent(componentVertexIds, colors, false, [], 0);
        }
    });

     allVertices.forEach(vertex => {
         if (vertex.type !== 'regular') {
             const isDraggedCenter = isDragConfirmed && initialDragVertexStates.some(v => v.id === vertex.id);

             let vertexToDraw = vertex;
             let isSnapped = false;
             let copyIndexForSnapCheck = isDraggedCenter ? 0 : undefined;

             if (isDraggedCenter && !isDeformingDrag && dragPreviewVertices.length > 0) {
                 const preview = dragPreviewVertices.find(dp => dp && dp.originalId === vertex.id && dp.transformIndex === 0);
                  if (preview) {
                      vertexToDraw = preview;
                  }
             }

             if (snappedVertexIds) {
                 const idToCheck = vertex.originalId || vertex.id;
                 if (snappedVertexIds.has(idToCheck)) {
                     const snapEntries = snappedVertexIds.get(idToCheck);
                     const relevantSnap = snapEntries.find(snap => snap.copyIndex === copyIndexForSnapCheck);
                     if (relevantSnap) {
                         isSnapped = true;
                     }
                 }
             }

             const centerOptions = {
                 selectedVertexIds: [], selectedCenterIds, activeCenterId, colors,
                 verticesVisible: true, isHovered: hoveredVertexId === vertex.id && !currentAltPressed,
                 isSnapped: isSnapped, snappedVertexIds,
                 isDragConfirmed, dragPreviewVertices, currentAltPressed
             };
             R.drawVertex(ctx, vertexToDraw, centerOptions, dataToScreen, updateHtmlLabel);
         }
     });


    if (isDragConfirmed) {
        const copyCount = parseInt(copyCountInput || '1', 10);
        const params = {
             copyCount, isDragConfirmed, initialDragVertexStates, dragPreviewVertices, transformIndicatorData,
             allEdges, allFaces, findVertexById,
             findNeighbors: (id) => findNeighbors(id),
             findAllVerticesInSubgraph: (id) => findAllVerticesInSubgraph(id), // Pass the function
             colors,
             edgeColorMode,
             faceColorMode,
             edgeColorExpression,
             faceColorExpression,
             faceColorPolarExpression,
             snappedEdgesInfo: snappedEdgeIds,
             snappedVertexIds
         };

        if (isDeformingDrag) {
            R.drawDeformingDragPreview(ctx, params, dataToScreen);
        } else {
            R.drawRigidDragPreview(ctx, params, dataToScreen);
        }
    }
}

function drawUIElements(colors, axisFormatInfo) {
    R.updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostVertexPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors, useScientific: axisFormatInfo.useScientific }, screenToData, updateHtmlLabel);
    updateColorModeExpressionInputs();

    const stateForUI = {
        dpr, canvasUI, isToolbarExpanded, isColorPaletteExpanded, isColorModePanelExpanded, isInterpolationPanelExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isVisibilityPanelExpanded, isSessionsPanelExpanded,
        isPlacingTransform, placingTransformType, placingSnapPos, mousePos,
        allColors, activeThemeName, colors, verticesVisible, edgesVisible, facesVisible, coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode,
        namedColors: colorEditor.namedColors, colorAssignments, activeColorTargets,
        interpolationStyles, activeInterpolationStyleId,
        sessions, activeSessionIndex, selectedSessionIndex,
        edgeColorMode, faceColorMode, edgeColorExpression, faceColorExpression, faceColorPolarExpression,
        isDraggingColorTarget, draggedColorTargetInfo
    };
    stateForUI.selectedInterpolationStyleId = getSelectionInterpolationStyleId();
    R.drawCanvasUI(ctx, htmlOverlay, stateForUI, updateHtmlLabel);
}

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const colors = getColors();
    R.clearCanvas(ctx, { canvas, dpr, colors });

    const axisFormatInfo = drawEnvironment(colors);

    drawMainGeometry(colors); // Call the dedicated function

    R.drawFaceGlows(ctx, { allFaces, hoveredFaceId, selectedFaceIds, colors, isDragConfirmed, dragPreviewVertices, currentAltPressed }, dataToScreen, findVertexById, U.getFaceId);
    if (selectedFaceIds.length > 0) {
        R.drawFaceCoordinateSystems(ctx, { allFaces, selectedFaceIds, colors, isDragConfirmed, dragPreviewVertices, initialDragVertexStates, transformIndicatorData, highlightedEdgeForSnap, draggedFaceId, coordSystemSnapAngle, coordSystemSnapType, coordSystemSnapScale, initialCoordSystemStates }, dataToScreen, findVertexById);
    }

    drawFeedbackAndIndicators(colors);
    drawTextElements(colors);
    R.drawAltHoverIndicator(ctx, { altHoverInfo, colors }, dataToScreen, findVertexById, updateHtmlLabel);
    drawUIElements(colors, axisFormatInfo);
    cleanupHtmlLabels();
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
        drawingSnapLabelInfo = null;
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
    selectedTextIds = [];
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
    altHoverInfo = null;
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
            y: (v1.y + v2.y) / 2,
            v1: v1.id,
            v2: v2.id
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
            selectedTextIds = [];
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

function handleInterpolationPanelClick(screenPos) {
    if (!isInterpolationPanelExpanded) return false;
    for (const icon of canvasUI.interpolationIcons) {
        if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
            screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
            if (icon.type === 'interpolationRemove') {
                const hasSelection = selectedEdgeIds.length > 0 || selectedFaceIds.length > 0 || selectedVertexIds.length > 0;
                if (hasSelection) {
                    clearInterpolationStyleFromSelection();
                } else {
                    setActiveInterpolationStyle(DEFAULT_INTERPOLATION_STYLE.id);
                }
                return true;
            }
            if (icon.type === 'interpolationAdd') {
                interpolationEditor?.initialize?.();
                interpolationEditor?.show();
                return true;
            }
            if (icon.type === 'interpolationStyle') {
                const now = Date.now();
                if (interpolationClickData.id === icon.styleId && (now - interpolationClickData.timestamp) < C.DOUBLE_CLICK_MS) {
                    const style = getInterpolationStyleById(icon.styleId);
                    if (style) {
                        interpolationEditor?.initialize?.();
                        interpolationEditor?.show(style);
                    }
                    interpolationClickData = { id: null, timestamp: 0 };
                    return true;
                }
                interpolationClickData = { id: icon.styleId, timestamp: now };
                const hasSelection = selectedEdgeIds.length > 0 || selectedFaceIds.length > 0 || selectedVertexIds.length > 0;
                if (hasSelection) {
                    applyInterpolationStyleToSelection(icon.styleId);
                }
                setActiveInterpolationStyle(icon.styleId);
                return true;
            }
        }
    }
    return false;
}

function handleColorModePanelClick(screenPos) {
    if (!isColorModePanelExpanded) return false;
    for (const icon of canvasUI.colorModeIcons) {
        if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
            screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
            if (icon.group === 'edge') {
                const modes = ['fixed', 'inherit_vertices', 'colormap'];
                edgeColorMode = modes[(modes.indexOf(edgeColorMode) + 1) % modes.length];
            } else if (icon.group === 'face') {
                const modes = ['fixed', 'inherit_vertices', 'inherit_edges', 'colormap_xy', 'colormap_polar'];
                faceColorMode = modes[(modes.indexOf(faceColorMode) + 1) % modes.length];
            }
            syncColorAssignmentsForInheritance();
            normalizeActiveColorTargets();
            applyColorModeDefaults();
            buildColorPaletteUI();
            buildColorModePanelUI();
            schedulePersistState();
            return true;
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
            isColorModePanelExpanded = false;
            isInterpolationPanelExpanded = false;
            isTransformPanelExpanded = false;
            isDisplayPanelExpanded = false;
            isVisibilityPanelExpanded = false;
            isSessionsPanelExpanded = false;
            activeColorTargets = [];
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

        const cmb = canvasUI.colorModeToolButton;
        if (cmb && screenPos.x >= cmb.x && screenPos.x <= cmb.x + cmb.width &&
            screenPos.y >= cmb.y && screenPos.y <= cmb.y + cmb.height) {
            isColorModePanelExpanded = !isColorModePanelExpanded;
            if (isColorModePanelExpanded) buildColorModePanelUI();
            return true;
        }

        const itb = canvasUI.interpolationToolButton;
        if (itb && screenPos.x >= itb.x && screenPos.x <= itb.x + itb.width &&
            screenPos.y >= itb.y && screenPos.y <= itb.y + itb.height) {
            isInterpolationPanelExpanded = !isInterpolationPanelExpanded;
            if (isInterpolationPanelExpanded) buildInterpolationPanelUI();
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

        const stb = canvasUI.sessionsToolButton;
        if (stb && screenPos.x >= stb.x && screenPos.x <= stb.x + stb.width &&
            screenPos.y >= stb.y && screenPos.y <= stb.y + stb.height) {
            isSessionsPanelExpanded = !isSessionsPanelExpanded;
            if (isSessionsPanelExpanded) {
                selectedSessionIndex = activeSessionIndex;
                buildSessionsPanelUI();
            }
            return true;
        }
    }

    if (isColorPaletteExpanded) {
        if (handleColorPaletteClick(screenPos, shiftKey, ctrlKey)) {
            return true;
        }
    }

    if (isColorModePanelExpanded) {
        if (handleColorModePanelClick(screenPos)) {
            return true;
        }
    }

    if (isInterpolationPanelExpanded) {
        if (handleInterpolationPanelClick(screenPos)) {
            return true;
        }
    }

    if (isTransformPanelExpanded) {
        for (const icon of canvasUI.transformIcons) {
            if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
                screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
                if (isPlacingTransform) {
                    placingTransformType = icon.type;
                } else {
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

    if (isSessionsPanelExpanded && canvasUI.sessionsPanelBounds) {
        const panel = canvasUI.sessionsPanelBounds;
        const isInPanel = screenPos.x >= panel.x && screenPos.x <= panel.x + panel.width &&
            screenPos.y >= panel.y && screenPos.y <= panel.y + panel.height;
        if (isInPanel) {
            selectNextSession();
            return true;
        }
    }

    // Fallback check: If the click didn't hit a specific element but is within any UI panel,
    // consume the click to prevent canvas interaction.
    if (isMouseInUIPanel(screenPos)) {
        return true;
    }

    return false;
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
    updateComponentDrawOrder()
}

function handleRedo() {
    if (redoStack.length === 0) return;
    const currentStateForUndo = getCurrentState();
    undoStack.push(currentStateForUndo);
    if (undoStack.length > C.MAX_HISTORY_SIZE) undoStack.shift();
    const nextState = redoStack.pop();
    restoreState(nextState);
    updateComponentDrawOrder()
}

function handleAltHoverMouseMove(mousePos, shiftKey) {
    const mouseDataPos = screenToData(mousePos);
    const p = findClickedVertex(mousePos);
    const e = !p ? findClickedEdge(mousePos) : null;
    const f = !p && !e ? findClickedFace(mousePos) : null;

    if (p) {
        altHoverInfo = {
            point: { x: p.x, y: p.y },
            element: { type: 'vertex', id: p.id },
            shiftKey: shiftKey
        };
    } else if (e) {
        const p1 = findVertexById(e.id1);
        const p2 = findVertexById(e.id2);
        if (p1 && p2) {
            let finalPoint;
            let finalFraction;
            const closest = U.getClosestPointOnLineSegment(mouseDataPos, p1, p2);

            if (shiftKey) {
                const snapResult = U.getBestFractionalSnap(closest, p1, p2);
                finalPoint = snapResult.point;
                finalFraction = snapResult.fraction;
            } else {
                finalPoint = { x: closest.x, y: closest.y };
                finalFraction = closest.t;
            }

            altHoverInfo = {
                point: finalPoint,
                element: { type: 'edge', edge: e },
                shiftKey: shiftKey,
                fraction: finalFraction
            };
        }
    } else if (f) {
        altHoverInfo = {
            point: mouseDataPos,
            element: { type: 'face', id: U.getFaceId(f) },
            shiftKey: shiftKey
        };
    } else {
        altHoverInfo = null;
    }

    // This is the key part that disables the standard hover effect
    hoveredVertexId = null;
    hoveredEdgeId = null;
    hoveredFaceId = null;
}

function handleThemeToggle() {
    saveStateForUndo();
    activeThemeName = activeThemeName === 'dark' ? 'light' : 'dark';
    invertColors(); // This now only inverts the user-defined swatches
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
    }
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

    if (edgeInfo) {
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

        // --- Finalize Attachment Snaps (Center Drag) ---
        if (element.type === 'center' && coordSystem) {
            const snapThreshold = C.COORD_SYSTEM_CENTER_SNAP_THRESHOLD;
            let attachedToVertex = null;
            let attachedToEdge = null;
            let minVertexDist = Infinity;
            let minEdgeInfo = { dist: Infinity, t: 0.5, v1: null, v2: null };

            face.vertexIds.forEach(vertexId => {
                const vertex = findVertexById(vertexId);
                if (vertex && vertex.type === 'regular') {
                    const dist = U.distance(coordSystem.origin, vertex);
                    if (dist < minVertexDist) {
                        minVertexDist = dist;
                        if (dist < snapThreshold) {
                            attachedToVertex = vertexId;
                        }
                    }
                }
            });

            if (!attachedToVertex) {
                for (let i = 0; i < face.vertexIds.length; i++) {
                    const v1 = findVertexById(face.vertexIds[i]);
                    const v2 = findVertexById(face.vertexIds[(i + 1) % face.vertexIds.length]);
                    if (v1 && v2 && v1.type === 'regular' && v2.type === 'regular') {
                        const closest = U.getClosestPointOnLineSegment(coordSystem.origin, v1, v2);
                        if (closest.distance < minEdgeInfo.dist) {
                            minEdgeInfo = { dist: closest.distance, t: closest.t, v1: v1.id, v2: v2.id };
                        }
                    }
                }
                if (minEdgeInfo.dist < snapThreshold) {
                    const currentEdgeLength = U.distance(findVertexById(minEdgeInfo.v1), findVertexById(minEdgeInfo.v2));
                    if (currentEdgeLength > C.GEOMETRY_CALCULATION_EPSILON) {
                         attachedToEdge = {
                             v1: minEdgeInfo.v1,
                             v2: minEdgeInfo.v2,
                             t: minEdgeInfo.t,
                             originalLength: currentEdgeLength,
                             scaleRatio: coordSystem.scale / currentEdgeLength
                         };
                    }
                }
            }

            coordSystem.attachedToVertex = attachedToVertex;
            coordSystem.attachedToEdge = attachedToEdge;
        }

        // --- Update Rotation/Scale Constraint References (Axis Drag) ---
        if (element.type === 'x_axis' || element.type === 'y_axis') {
            let didSnapRotationToEdge = false;
            let didSnapScaleToEdge = false;

            if (coordSystemSnapType === 'edge' && highlightedEdgeForSnap !== null) {
                const edgeInfo = getAlignedEdgeInfo(face, highlightedEdgeForSnap);
                if (edgeInfo) {
                    coordSystem.rotationAlignedToEdge = {
                        v1: edgeInfo.v1Id,
                        v2: edgeInfo.v2Id,
                        originalAngle: edgeInfo.edgeAngle,
                        originalSystemAngle: coordSystem.angle
                    };
                    didSnapRotationToEdge = true;
                }
            }

             if (coordSystemSnapScale !== null && coordSystem.rotationAlignedToEdge) {
                 const edgeInfo = getAlignedEdgeInfo(face, highlightedEdgeForSnap);
                 if(edgeInfo) {
                     const v1 = findVertexById(edgeInfo.v1Id);
                     const v2 = findVertexById(edgeInfo.v2Id);
                     if (v1 && v2) {
                         const edgeLength = U.distance(v1, v2);
                         if (edgeLength > C.GEOMETRY_CALCULATION_EPSILON) {
                             coordSystem.scaleAttachedToEdge = {
                                 v1: edgeInfo.v1Id,
                                 v2: edgeInfo.v2Id,
                                 scaleRatio: coordSystem.scale / edgeLength,
                                 originalLength: edgeLength
                             };
                             didSnapScaleToEdge = true;
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

        // --- Cleanup specific to coordinate system drag ---
        coordSystemSnapScale = null;
        coordSystemTransformIndicatorData = null;
        isDraggingCoordSystem = false; // Reset the flag HERE
        draggedCoordSystemElement = null;
        coordSystemSnapTargets = null;
        highlightedEdgeForSnap = null;
        coordSystemSnapAngle = null;
        coordSystemSnapType = null;
        draggedFaceId = null;
        ghostVertexPosition = null;
        ghostVertices = [];

        // isCustom flag should have been set during mouse move when drag started

        return true; // Indicate that the mouse up was handled
    }
    return false; // Should not happen if called correctly, but good practice
}

function handleColorToolButtonClick() {
    isColorPaletteExpanded = !isColorPaletteExpanded;
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
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
            selectedTextIds = [];
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
            selectedTextIds = [];
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
            selectedTextIds = [];
            selectedFaceIds = [contextMenuFaceId];
        }
        // If it was already selected, do nothing to preserve the multi-selection.

        deleteSelectedItems();
        contextMenuFaceId = null;
    }
    contextMenu.style.display = 'none';
}

function handleLeftMouseButtonDown(event) {
    const clickedUIElement = U.getClickedUIElement(mousePos, canvasUI, { isToolbarExpanded, isColorPaletteExpanded, isColorModePanelExpanded, isInterpolationPanelExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isVisibilityPanelExpanded, isSessionsPanelExpanded });
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

        selectedCenterIds = [newCenter.id];
        activeCenterId = newCenter.id;
        selectedVertexIds = [];
        selectedEdgeIds = [];
        selectedFaceIds = [];
        selectedTextIds = [];

        isPlacingTransform = false;
        placingTransformType = null;
        placingSnapPos = null;
        canvas.style.cursor = 'crosshair';

        event.preventDefault();
        return;
    }

    if (event.altKey && !isDrawingMode) {
        handleAltHoverMouseMove(mousePos, event.shiftKey); // Get fresh info

        const clickedVertex = (altHoverInfo && altHoverInfo.element.type === 'vertex')
            ? findVertexById(altHoverInfo.element.id)
            : null;
        const clickedEdge = (altHoverInfo && altHoverInfo.element.type === 'edge')
            ? altHoverInfo.element.edge
            : null;
        const clickedFace = (altHoverInfo && altHoverInfo.element.type === 'face')
            ? allFaces.find(f => U.getFaceId(f) === altHoverInfo.element.id)
            : null;

        if (clickedVertex || clickedEdge || clickedFace) {
            saveStateForUndo();
            
            // --- Manually clear selections instead of calling performEscapeAction() ---
            selectedVertexIds = [];
            selectedEdgeIds = [];
            selectedFaceIds = [];
            selectedCenterIds = [];
            selectedTextIds = [];
            activeCenterId = null;
            activeColorTargets = [];
            if (isColorPaletteExpanded) {
                buildColorPaletteUI();
            }
            // --- End manual clear ---
            
            const gridInterval = (lastGridState?.alpha2 >= lastGridState?.alpha1 && lastGridState?.interval2) ? lastGridState.interval2 : lastGridState?.interval1;

            if (clickedVertex && clickedVertex.type === 'regular') {
                isDrawingMode = true;
                previewLineStartVertexId = clickedVertex.id;
                drawingSequence = [];
                currentSequenceIndex = 0;
                currentDrawingPath = [clickedVertex.id];
                window.currentDrawingPath = currentDrawingPath;
            } else if (clickedEdge && altHoverInfo) {
                const insertionPoint = altHoverInfo.point;
                const newVertex = insertVertexOnEdgeWithFaces(clickedEdge, insertionPoint, gridInterval, getColorForTarget);
                if (newVertex) {
                    isDrawingMode = true;
                    previewLineStartVertexId = newVertex.id;
                    drawingSequence = [];
                    currentSequenceIndex = 0;
                    currentDrawingPath = [newVertex.id];
                    window.currentDrawingPath = currentDrawingPath;
                    updateComponentDrawOrder();
                }
            } else if (clickedFace && altHoverInfo) {
                const startCoords = altHoverInfo.point;
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
                updateComponentDrawOrder();
            }
            
            isActionInProgress = false;
            event.preventDefault();
            return;
        }
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
            normalizeActiveColorTargets();
            buildColorPaletteUI();

            actionContext = { target: 'ui_icon_click', element: { ...topIcon, type: 'colorTargetIcon' } };
            canvas.style.cursor = 'default';
            return;
        }

        for (const swatch of canvasUI.colorSwatches) {
            if (mousePos.x >= swatch.x && mousePos.x <= swatch.x + swatch.width &&
                mousePos.y >= swatch.y && mousePos.y <= swatch.y + swatch.height) {
                actionContext = { target: 'ui_swatch', element: { ...swatch } };
                canvas.style.cursor = 'default';
                return;
            }
        }
    }

    if (isSessionsPanelExpanded) {
        const removeBtn = canvasUI.removeSessionButton;
        if (removeBtn && mousePos.x >= removeBtn.x && mousePos.x <= removeBtn.x + removeBtn.width &&
            mousePos.y >= removeBtn.y && mousePos.y <= removeBtn.y + removeBtn.height) {
            actionContext = { target: 'ui_session_remove' };
            canvas.style.cursor = 'default';
            return;
        }
        const addBtn = canvasUI.addSessionButton;
        if (addBtn && mousePos.x >= addBtn.x && mousePos.x <= addBtn.x + addBtn.width &&
            mousePos.y >= addBtn.y && mousePos.y <= addBtn.y + addBtn.height) {
            actionContext = { target: 'ui_session_add' };
            canvas.style.cursor = 'default';
            return;
        }
        for (const icon of canvasUI.sessionIcons) {
            if (mousePos.x >= icon.x && mousePos.x <= icon.x + icon.width &&
                mousePos.y >= icon.y && mousePos.y <= icon.y + icon.height) {
                actionContext = { target: 'ui_session', element: { ...icon } };
                canvas.style.cursor = 'default';
                return;
            }
        }
    }

    if (handleCanvasUIClick(mousePos, event.shiftKey, event.ctrlKey || event.metaKey)) {
        actionContext = { target: 'ui' };
        canvas.style.cursor = 'default';
        return;
    }

    if (handleCoordinateSystemMouseDown(event)) {
        actionContext = { target: 'coord_system' };
        return;
    }

    const clickedText = findClickedTextElement(mousePos);
    let clickedVertex = clickedText ? null : findClickedVertex(mousePos);
    let clickedEdge = !clickedText && !clickedVertex ? findClickedEdge(mousePos) : null;
    let clickedFace = !clickedText && !clickedVertex && !clickedEdge ? findClickedFace(mousePos) : null;

    const shiftOrCtrl = event.shiftKey || event.ctrlKey || event.metaKey;
    const clickedItem = clickedText || clickedVertex || clickedEdge || clickedFace;
    let isClickOnSelection = false;
    if (clickedText) isClickOnSelection = selectedTextIds.includes(clickedText.id);
    else if (clickedVertex) isClickOnSelection = selectedVertexIds.includes(clickedVertex.id) || selectedCenterIds.includes(clickedVertex.id);
    else if (clickedEdge) isClickOnSelection = selectedEdgeIds.includes(U.getEdgeId(clickedEdge));
    else if (clickedFace) isClickOnSelection = selectedFaceIds.includes(U.getFaceId(clickedFace));
    
    if (!isDrawingMode && !shiftOrCtrl && clickedItem && !isClickOnSelection) {
        if (clickedText) applySelectionLogic([], [], [], false, false, false, [clickedText.id]);
        else if (clickedVertex) applySelectionLogic([clickedVertex.id], [], [], false, false, clickedVertex.type !== 'regular');
        else if (clickedEdge) applySelectionLogic([], [U.getEdgeId(clickedEdge)], [], false, false);
        else if (clickedFace) applySelectionLogic([], [], [U.getFaceId(clickedFace)], false, false);
    }
    
    let dragHandle = null;
    if (clickedText) {
        dragHandle = screenToData(mousePos);
    } else if (clickedVertex) {
        dragHandle = clickedVertex;
    } else if (clickedEdge) {
        const p1 = findVertexById(clickedEdge.id1);
        const p2 = findVertexById(clickedEdge.id2);
        dragHandle = U.getClosestPointOnLineSegment(screenToData(mousePos), p1, p2);
    } else if (clickedFace) {
        dragHandle = screenToData(mousePos);
    }

    const isTransformDrag = activeCenterId && (selectedVertexIds.length > 0 || selectedEdgeIds.length > 0 || selectedFaceIds.length > 0 || selectedTextIds.length > 0);

    initialDragVertexStates = [];
    dragPreviewVertices = [];

    actionContext = {
        targetVertex: clickedVertex,
        dragHandle: dragHandle,
        targetEdge: clickedEdge,
        targetFace: clickedFace,
        targetText: clickedText,
        target: clickedItem || 'canvas',
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey || event.metaKey,
        altKey: event.altKey,
        isTransformDrag
    };

    if (clickedVertex && clickedVertex.type !== 'regular') {
        isDraggingCenter = true;
        handleCenterSelection(clickedVertex.id, event.shiftKey, event.ctrlKey || event.metaKey);
    }
}

function getFinalDragPositions(initialDragVertexStates, allVertices, finalDelta, copyCount) {
    const allFinalVertices = [];
    const verticesToDrag = initialDragVertexStates.filter(p => p.type === 'regular');
    const initialDraggedIds = new Set(verticesToDrag.map(p => p.id));

    allVertices.forEach(v => {
        if (!initialDraggedIds.has(v.id)) {
            allFinalVertices.push({ ...v, originalId: v.id, transformIndex: undefined });
        }
    });

    for (let i = 0; i < copyCount; i++) {
        verticesToDrag.forEach(p_orig => {
            const newPos = {
                x: p_orig.x + finalDelta.x * (i + 1),
                y: p_orig.y + finalDelta.y * (i + 1)
            };
            allFinalVertices.push({
                ...p_orig,
                ...newPos,
                id: i === 0 ? p_orig.id : `${p_orig.id}_copy_${i}`,
                originalId: p_orig.id,
                transformIndex: i
            });
        });
    }
    return allFinalVertices;
}


function finalizeDragAction() {
    saveStateForUndo();

    const initiallySelectedVertexIds = [...selectedVertexIds];
    const initiallySelectedEdgeIds = [...selectedEdgeIds];
    const initiallySelectedFaceIds = [...selectedFaceIds];
    const initiallySelectedCenterIds = [...selectedCenterIds];
    const initialActiveCenterId = activeCenterId;
    selectedVertexIds = [];
    selectedEdgeIds = [];
    selectedFaceIds = [];
    selectedCenterIds = [];
    selectedTextIds = [];
    activeCenterId = null;

    const copyCount = parseInt(copyCountInput, 10) || 1;
    let firstCopySelectionIds = null;

    const isDeformingEdgeSnap = isDragConfirmed &&
        initialDragVertexStates.length === 1 &&
        actionContext?.finalSnapResult?.snapType === 'edge';

    const textIdsToUpdate = new Set(initialDragTextStates.map(el => el.id));
    if (textIdsToUpdate.size > 0) {
        const textStatesById = new Map(initialDragTextStates.map(el => [el.id, el]));
        const movingVertexIds = new Set(initiallySelectedVertexIds);
        initiallySelectedEdgeIds.forEach(edgeId => {
            const [id1, id2] = edgeId.split(C.EDGE_ID_DELIMITER);
            if (id1) movingVertexIds.add(id1);
            if (id2) movingVertexIds.add(id2);
        });
        initiallySelectedFaceIds.forEach(faceId => {
            const face = allFaces.find(f => U.getFaceId(f) === faceId);
            if (face) {
                const faceVertexIds = getDescendantVertices(face.id, allFaces);
                faceVertexIds.forEach(id => movingVertexIds.add(id));
            }
        });

        const translationDelta = !transformIndicatorData ? getActiveTextTranslationDelta() : null;
        const {
            center,
            rotation = 0,
            scale = 1,
            directionalScale = false,
            startVector
        } = transformIndicatorData || {};
        const rotationDegDelta = -rotation * (180 / Math.PI);

        allTextElements.forEach(textElement => {
            if (!textIdsToUpdate.has(textElement.id)) return;
            const baseElement = textStatesById.get(textElement.id) || textElement;
            const anchorData = getTextElementAnchorData(baseElement);
            if (baseElement.anchorType !== 'canvas' && !anchorData) return;

            const anchor = baseElement.anchorType === 'canvas'
                ? (baseElement.position || textElement.position)
                : anchorData.anchor;
            const baseOffset = baseElement.anchorType === 'canvas'
                ? { x: 0, y: 0 }
                : (baseElement.offset || { x: 0, y: 0 });
            const basePosition = baseElement.anchorType === 'canvas'
                ? (baseElement.position || textElement.position || { x: 0, y: 0 })
                : { x: anchor.x + baseOffset.x, y: anchor.y + baseOffset.y };

            const anchorMoves = (() => {
                if (baseElement.anchorType === 'vertex') {
                    return movingVertexIds.has(baseElement.anchorId);
                }
                if (baseElement.anchorType === 'edge') {
                    if (initiallySelectedEdgeIds.includes(baseElement.anchorId)) return true;
                    const edge = allEdges.find(e => U.getEdgeId(e) === baseElement.anchorId);
                    return edge ? (movingVertexIds.has(edge.id1) && movingVertexIds.has(edge.id2)) : false;
                }
                if (baseElement.anchorType === 'face') {
                    if (initiallySelectedFaceIds.includes(baseElement.anchorId)) return true;
                    const face = allFaces.find(f => U.getFaceId(f) === baseElement.anchorId);
                    return face ? face.vertexIds.every(id => movingVertexIds.has(id)) : false;
                }
                return false;
            })();

            if (transformIndicatorData) {
                const newPosition = U.applyTransformToVertex(basePosition, center, rotation, scale, directionalScale, startVector);
                textElement.rotationDeg = (baseElement.rotationDeg || 0) + rotationDegDelta;
                textElement.scale = (baseElement.scale || 1) * scale;
                if (baseElement.anchorType === 'canvas') {
                    textElement.position = newPosition;
                } else {
                    const anchorAfter = anchorMoves
                        ? U.applyTransformToVertex(anchor, center, rotation, scale, directionalScale, startVector)
                        : anchor;
                    const newOffset = {
                        x: newPosition.x - anchorAfter.x,
                        y: newPosition.y - anchorAfter.y
                    };
                    textElement.offset = newOffset;
                    if (textElement.anchorType === 'edge') {
                        const factor = computeEdgeOffsetFactor(textElement.anchorId, newOffset);
                        if (typeof factor === 'number') {
                            textElement.edgeOffsetFactor = factor;
                        }
                    }
                }
            } else if (translationDelta) {
                if (baseElement.anchorType === 'canvas') {
                    const pos = baseElement.position || textElement.position || { x: 0, y: 0 };
                    textElement.position = {
                        x: pos.x + translationDelta.x,
                        y: pos.y + translationDelta.y
                    };
                } else if (!anchorMoves) {
                    const offset = baseElement.offset || { x: 0, y: 0 };
                    const newOffset = {
                        x: offset.x + translationDelta.x,
                        y: offset.y + translationDelta.y
                    };
                    textElement.offset = newOffset;
                    if (textElement.anchorType === 'edge') {
                        const factor = computeEdgeOffsetFactor(textElement.anchorId, newOffset);
                        if (typeof factor === 'number') {
                            textElement.edgeOffsetFactor = factor;
                        }
                    }
                }
            }
        });
    }

    if (isDeformingEdgeSnap) {
        const snapResult = actionContext.finalSnapResult;
        const draggedVertexId = initialDragVertexStates[0].id;
        const targetEdge = snapResult.targetEdge;
        const vertexToUpdate = findVertexById(draggedVertexId);

        if (vertexToUpdate && targetEdge) {
            const edgesBefore = JSON.parse(JSON.stringify(allEdges));
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

            vertexToUpdate.x = snapResult.pos.x;
            vertexToUpdate.y = snapResult.pos.y;

            allEdges = allEdges.filter(e => U.getEdgeId(e) !== U.getEdgeId(targetEdge));

            const p1 = findVertexById(targetEdge.id1);
            const p2 = findVertexById(targetEdge.id2);
            const edgeA = U.createEdge(p1, vertexToUpdate, gridInterval, getColorForTarget);
            const edgeB = U.createEdge(p2, vertexToUpdate, gridInterval, getColorForTarget);
            applyActiveInterpolationToEdge(edgeA);
            applyActiveInterpolationToEdge(edgeB);
            allEdges.push(edgeA);
            allEdges.push(edgeB);

            updateFaces(edgesBefore, allEdges);
        }
    } else {
        if (transformIndicatorData) {
            const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
            const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
            initialDragVertexStates.forEach(p_initial => {
                const vertexToUpdate = findVertexById(p_initial.id);
                if (vertexToUpdate) {
                    const newPos = U.applyTransformToVertex(p_initial, center, rotation, scale, directionalScale, startVector);
                    vertexToUpdate.x = newPos.x;
                    vertexToUpdate.y = newPos.y;
                }
            });
        } else if (dragPreviewVertices.length > 0) {
            const finalDelta = (actionContext.finalSnapResult && actionContext.finalSnapResult.snapped)
                ? actionContext.finalSnapResult.finalDelta
                : {
                    x: dragPreviewVertices[0].x - initialDragVertexStates[0].x,
                    y: dragPreviewVertices[0].y - initialDragVertexStates[0].y
                };

            const verticesToCopy = initialDragVertexStates.filter(p => p.type === 'regular');
            if (copyCount > 1 && verticesToCopy.length > 0) {
                const originalIds = new Set(verticesToCopy.map(p => p.id));
                const selectedFaceIdSet = new Set(selectedFaceIds);
                const selectedEdgeIdSet = new Set(selectedEdgeIds);

                selectedFaceIds.forEach(faceId => {
                    const face = allFaces.find(f => U.getFaceId(f) === faceId);
                    if (!face) return;
                    face.vertexIds.forEach(id => originalIds.add(id));
                });

                const faceEdgeIds = new Set();
                selectedFaceIds.forEach(faceId => {
                    const face = allFaces.find(f => U.getFaceId(f) === faceId);
                    if (!face) return;
                    for (let i = 0; i < face.vertexIds.length; i++) {
                        const id1 = face.vertexIds[i];
                        const id2 = face.vertexIds[(i + 1) % face.vertexIds.length];
                        faceEdgeIds.add(U.getEdgeId({ id1, id2 }));
                    }
                });

                const edgesToCopy = allEdges.filter(e => {
                    const edgeId = U.getEdgeId(e);
                    if (selectedEdgeIdSet.has(edgeId)) return true;
                    if (faceEdgeIds.has(edgeId)) return true;
                    return originalIds.has(e.id1) && originalIds.has(e.id2);
                });

                const facesToCopy = selectedFaceIds.length > 0
                    ? allFaces.filter(f => selectedFaceIdSet.has(U.getFaceId(f)))
                    : allFaces.filter(f => f.vertexIds.every(id => originalIds.has(id)));

                const boundaryEdges = allEdges.filter(e =>
                    (originalIds.has(e.id1) && !originalIds.has(e.id2)) ||
                    (originalIds.has(e.id2) && !originalIds.has(e.id1))
                );
                const allNewVertices = [];
                const allNewEdges = [];
                const allNewFaces = [];
                firstCopySelectionIds = { vertices: [], edges: [], faces: [], texts: [] };

                const selectedTextIdSet = new Set(selectedTextIds);
                const textsToCopy = allTextElements.filter(text => {
                    if (selectedTextIdSet.has(text.id)) return true;
                    if (text.anchorType === 'vertex') return originalIds.has(text.anchorId);
                    if (text.anchorType === 'edge') {
                        const edge = allEdges.find(e => U.getEdgeId(e) === text.anchorId);
                        return edge ? (originalIds.has(edge.id1) && originalIds.has(edge.id2)) : false;
                    }
                    if (text.anchorType === 'face') {
                        if (selectedFaceIdSet.has(text.anchorId)) return true;
                        const face = allFaces.find(f => U.getFaceId(f) === text.anchorId);
                        return face ? face.vertexIds.every(id => originalIds.has(id)) : false;
                    }
                    return false;
                });

                for (let i = 1; i < copyCount; i++) {
                    const newIdMapForThisCopy = new Map();
                    const currentCopyVertices = [];
                    const currentCopyEdges = [];
                    const currentCopyFaces = [];
                    const currentCopyTexts = [];

                    verticesToCopy.forEach(p => {
                        const newPos = { x: p.x + finalDelta.x * i, y: p.y + finalDelta.y * i };
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
                    boundaryEdges.forEach(edge => {
                        const staticVertexId = originalIds.has(edge.id1) ? edge.id2 : edge.id1;
                        const originalDraggedVertexId = originalIds.has(edge.id1) ? edge.id1 : edge.id2;
                        const newDraggedVertexId = newIdMapForThisCopy.get(originalDraggedVertexId);
                        if (newDraggedVertexId) {
                            const newEdge = { ...edge, id1: newDraggedVertexId, id2: staticVertexId };
                            allNewEdges.push(newEdge);
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
                                const delta = { x: finalDelta.x * i, y: finalDelta.y * i };
                                newFace.localCoordSystem.origin.x = initialSystemForCopy.origin.x + delta.x;
                                newFace.localCoordSystem.origin.y = initialSystemForCopy.origin.y + delta.y;
                            }
                            allNewFaces.push(newFace);
                            currentCopyFaces.push(newFace.id);
                        }
                    });

                    textsToCopy.forEach(text => {
                        const newText = JSON.parse(JSON.stringify(text));
                        newText.id = U.generateUniqueId();
                        if (text.anchorType === 'canvas') {
                            if (!newText.position) return;
                            newText.position = {
                                x: newText.position.x + finalDelta.x * i,
                                y: newText.position.y + finalDelta.y * i
                            };
                        } else if (text.anchorType === 'vertex') {
                            const newAnchorId = newIdMapForThisCopy.get(text.anchorId);
                            if (!newAnchorId) return;
                            newText.anchorId = newAnchorId;
                        } else if (text.anchorType === 'edge') {
                            const edge = allEdges.find(e => U.getEdgeId(e) === text.anchorId);
                            if (!edge) return;
                            const newId1 = newIdMapForThisCopy.get(edge.id1);
                            const newId2 = newIdMapForThisCopy.get(edge.id2);
                            if (!newId1 || !newId2) return;
                            newText.anchorId = U.getEdgeId({ id1: newId1, id2: newId2 });
                        } else if (text.anchorType === 'face') {
                            const face = allFaces.find(f => U.getFaceId(f) === text.anchorId);
                            if (!face) return;
                            const newVertexIds = face.vertexIds.map(id => newIdMapForThisCopy.get(id));
                            if (!newVertexIds.every(Boolean)) return;
                            newText.anchorId = U.getFaceId({ vertexIds: newVertexIds });
                        }

                        allTextElements.push(newText);
                        if (selectedTextIdSet.has(text.id)) {
                            currentCopyTexts.push(newText.id);
                        }
                    });

                    if (i === 1) {
                        firstCopySelectionIds = { vertices: currentCopyVertices, edges: currentCopyEdges, faces: currentCopyFaces, texts: currentCopyTexts };
                    }
                }
                allVertices.push(...allNewVertices);
                allEdges.push(...allNewEdges);
                allFaces.push(...allNewFaces);

            } else if (copyCount === 1) {
                initialDragVertexStates.forEach(originalVertexState => {
                    const vertexToUpdate = findVertexById(originalVertexState.id);
                    if (vertexToUpdate) {
                        vertexToUpdate.x = originalVertexState.x + finalDelta.x;
                        vertexToUpdate.y = originalVertexState.y + finalDelta.y;
                    }
                });
            }
        }
    }

    const verticesThatMoved = new Set(initialDragVertexStates.map(v => v.id));
    const affectedFaces = allFaces.filter(face => face.vertexIds.some(vId => verticesThatMoved.has(vId)));

    if (affectedFaces.length > 0) {
        affectedFaces.forEach(face => {
            const initialSystem = initialCoordSystemStates.get(face.id);
            if (face.localCoordSystem && initialSystem) {
                const faceVertexIds = new Set(face.vertexIds);
                const draggedVertexIds = new Set(initialDragVertexStates.map(v => v.id));
                const isRigidFaceDrag = [...faceVertexIds].every(vId => draggedVertexIds.has(vId));

                if (isRigidFaceDrag) {
                    if (transformIndicatorData) {
                        const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
                        const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
                        const newOrigin = U.applyTransformToVertex(initialSystem.origin, center, rotation, scale, directionalScale, startVector);
                        face.localCoordSystem.origin = newOrigin;

                        if (directionalScale) {
                            const p_unit_x_initial = U.localToGlobal({ x: 1, y: 0 }, initialSystem);
                            const p_unit_x_final = U.applyTransformToVertex(p_unit_x_initial, center, rotation, scale, directionalScale, startVector);
                            face.localCoordSystem.scale = U.distance(newOrigin, p_unit_x_final);
                        } else {
                            face.localCoordSystem.angle = U.normalizeAngle(initialSystem.angle + rotation);
                            face.localCoordSystem.scale = initialSystem.scale * scale;
                        }
                    } else if (copyCount === 1) {
                        const finalDelta = (actionContext.finalSnapResult && actionContext.finalSnapResult.snapped)
                            ? actionContext.finalSnapResult.finalDelta
                            : { x: dragPreviewVertices[0].x - initialDragVertexStates[0].x, y: dragPreviewVertices[0].y - initialDragVertexStates[0].y };
                        face.localCoordSystem.origin.x = initialSystem.origin.x + finalDelta.x;
                        face.localCoordSystem.origin.y = initialSystem.origin.y + finalDelta.y;
                    }
                } else {
                    const finalVertexPositionsForFace = face.vertexIds.map(id => findVertexById(id)).filter(Boolean);
                    applyCoordinateSystemConstraintsOnDragEnd(face, initialSystem, initialDragVertexStates, finalVertexPositionsForFace, findVertexById);
                }
            }
        });
    }

    updateAffectedEdgeProperties(Array.from(verticesThatMoved), transformIndicatorData);

    const { vertexMerges, edgeSplits } = calculateFinalMerges(allVertices, allEdges, viewTransform);
    const parent = new Map();
    allVertices.forEach(p => parent.set(p.id, p.id));
    const findRoot = (id) => {
        if (!parent.has(id) || parent.get(id) === id) return id;
        const rootId = findRoot(parent.get(id));
        parent.set(id, rootId);
        return rootId;
    };
    vertexMerges.forEach((rootId, sourceId) => {
        const root1 = findRoot(sourceId);
        const root2 = findRoot(rootId);
        if (root1 !== root2) parent.set(root2, root1);
    });

    const verticesToDelete = new Set();
    allVertices.forEach(p => {
        const rootId = findRoot(p.id);
        if (p.id !== rootId) {
            verticesToDelete.add(p.id);
        }
    });

    if (verticesToDelete.size > 0 || edgeSplits.size > 0) {
        const edgesBefore = JSON.parse(JSON.stringify(allEdges));
        const faceCoordSystemBackup = backupFaceCoordinateSystemsBeforeMerge(allFaces, findRoot);

        allEdges.forEach(edge => {
            edge.id1 = findRoot(edge.id1);
            edge.id2 = findRoot(edge.id2);
        });

        allVertices = allVertices.filter(p => !verticesToDelete.has(p.id));
        allEdges = allEdges.filter((e, index, self) =>
            e.id1 !== e.id2 &&
            index === self.findIndex(t => U.getEdgeId(t) === U.getEdgeId(e))
        );

        updateFaces(edgesBefore, allEdges);

        allFaces.forEach(face => {
            const backupSystem = faceCoordSystemBackup.get(face.id);
            if (backupSystem) face.localCoordSystem = backupSystem;
        });
        ensureFaceCoordinateSystems();
    }

    // --- Restore selection AT THE END based on initial selection type ---
    if (copyCount > 1 && firstCopySelectionIds) {
        selectedVertexIds = initiallySelectedVertexIds.length > 0 ? firstCopySelectionIds.vertices.map(id => findRoot(id)) : [];
        selectedEdgeIds = initiallySelectedEdgeIds.length > 0 ? firstCopySelectionIds.edges : [];
        selectedFaceIds = initiallySelectedFaceIds.length > 0 ? firstCopySelectionIds.faces : [];
        selectedTextIds = initialDragTextStates.length > 0 ? firstCopySelectionIds.texts : [];
    } else if (copyCount === 1) {
        selectedVertexIds = initiallySelectedVertexIds.map(id => findRoot(id));
        selectedEdgeIds = initiallySelectedEdgeIds;
        selectedFaceIds = initiallySelectedFaceIds;
        selectedTextIds = initialDragTextStates.map(text => text.id).filter(id => allTextElements.some(el => el.id === id));
    }
    // Restore centers exactly as before the drag
    selectedCenterIds = initiallySelectedCenterIds;
    activeCenterId = initialActiveCenterId;
    // --- End selection logic ---

    updateFaceHierarchy();
    updateComponentDrawOrder();
}

function handleCanvasClick(actionContext) {
    const { shiftKey, ctrlKey, targetVertex, targetEdge, targetFace, targetText } = actionContext;
    const startVertex = findVertexById(previewLineStartVertexId);

    if (isDrawingMode && startVertex) {
        saveStateForUndo();
        const edgesBefore = JSON.parse(JSON.stringify(allEdges));
        const snappedData = getSnappedPosition(startVertex, mousePos, shiftKey);
        let newVertex = null;
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

        if (snappedData.snapType === 'vertex' && snappedData.targetVertex) {
            newVertex = snappedData.targetVertex;
        } else if (snappedData.snapType?.startsWith('edge') && snappedData.targetEdge) {
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
                applyActiveInterpolationToEdge(newEdge);
                allEdges.push(newEdge);
                updateFaces(edgesBefore, allEdges);
                updateFaceHierarchy();
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
                drawingSequence.push({ length: completedSegmentProps.length, turn: 0, endVertexColor: newVertex.color });
                currentSequenceIndex = drawingSequence.length - 1;
                frozenReference_Origin_Data = completedSegmentProps.startVertex;
                frozenReference_D_du = (snappedData.gridToGridSquaredSum > 0 && snappedData.gridInterval) ? (snappedData.gridInterval * Math.sqrt(snappedData.gridToGridSquaredSum)) : completedSegmentProps.length;
                frozenReference_D_g2g = (snappedData.gridToGridSquaredSum > 0) ? { g2gSquaredSum: snappedData.gridToGridSquaredSum, interval: snappedData.gridInterval } : null;
                frozenReference_A_rad = completedSegmentProps.turnAngleRad;
                frozenReference_A_baseRad = completedSegmentProps.precedingSegmentAbsoluteAngleRad;
            }
            
            currentDrawingPath.push(newVertex.id);
            window.currentDrawingPath = currentDrawingPath;
            updateDrawingSequenceColors();
            updateDrawingSequenceEdgeColors();
            updateComponentDrawOrder();
            previewLineStartVertexId = newVertex.id;
        }
        
        if (shiftKey && newVertex && snappedData) {
            const completedSegmentProps = getCompletedSegmentProperties(startVertex, newVertex, allEdges);
            if (completedSegmentProps) {
                frozenReference_Origin_Data = completedSegmentProps.startVertex;
                frozenReference_D_du = (snappedData.gridToGridSquaredSum > 0 && snappedData.gridInterval) ? (snappedData.gridInterval * Math.sqrt(snappedData.gridToGridSquaredSum)) : completedSegmentProps.length;
                frozenReference_D_g2g = (snappedData.gridToGridSquaredSum > 0) ? { g2gSquaredSum: snappedData.gridToGridSquaredSum, interval: snappedData.gridInterval } : null;
                frozenReference_A_rad = completedSegmentProps.turnAngleRad;
                frozenReference_A_baseRad = completedSegmentProps.precedingSegmentAbsoluteAngleRad;
            }
        } 
        clickData.count = 0;
    } else if (actionContext.target === 'canvas') {
        saveStateForUndo();
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
        updateComponentDrawOrder();
    } else {
        if (actionContext && actionContext.altKey) {
        } else {
            const wasCenterClick = actionContext && actionContext.targetVertex && actionContext.targetVertex.type !== 'regular';
            if (!wasCenterClick && (targetText || targetVertex || targetEdge || targetFace)) {
                saveStateForUndo(); 
                const targetId = targetText ? targetText.id : (targetFace ? U.getFaceId(targetFace) : (targetEdge ? U.getEdgeId(targetEdge) : targetVertex.id));
                let targetType;
                if (targetText) targetType = 'text';
                else if (targetFace) targetType = 'face';
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
                        if (clickData.type === 'text') applySelectionLogic([], [], [], shiftKey, ctrlKey, false, [clickData.targetId]);
                        else if (clickData.type === 'face') applySelectionLogic([], [], [clickData.targetId], shiftKey, ctrlKey);
                        else if (clickData.type === 'edge') applySelectionLogic([], [clickData.targetId], [], shiftKey, ctrlKey);
                        else if (clickData.type === 'vertex') applySelectionLogic([clickData.targetId], [], [], shiftKey, ctrlKey);
                        else if (clickData.type === 'center') handleCenterSelection(clickData.targetId, shiftKey, ctrlKey);
                        break;
                    case 2:
                        if (clickData.type === 'text') {
                            const textElement = getTextElementById(clickData.targetId);
                            if (textElement) {
                                startTextEditing(textElement, textElement.content || '');
                            }
                        } else if (clickData.type === 'vertex') {
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
                if (selectedTextIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_TEXT);

                if (newActiveTargets.length > 0) {
                    activeColorTargets = newActiveTargets;
                    if (isColorPaletteExpanded) {
                        buildColorPaletteUI();
                    }
                }
            }
        }
    }
}

function handleUIClick(actionContext) {
    if (actionContext.target === 'ui_icon_click' && actionContext.element.type === 'colorTargetIcon') {
        const { element } = actionContext;
        const now = Date.now();
        const iconId = `icon-${element.target}`;
        
        if (clickData.targetId === iconId && (now - clickData.timestamp) < C.DOUBLE_CLICK_MS) {
            saveStateForUndo();
            switch (element.target) {
                case C.COLOR_TARGET_VERTEX: verticesVisible = !verticesVisible; break;
                case C.COLOR_TARGET_EDGE: edgesVisible = !edgesVisible; break;
                case C.COLOR_TARGET_FACE: facesVisible = !facesVisible; break;
            }
            buildColorPaletteUI();
            clickData.count = 0;
        }
        
        clickData.targetId = iconId;
        clickData.timestamp = now;
        return;
    }

    if (actionContext.target === 'ui_swatch') {
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
            if (activeColorTargets.length > 0) {
                saveStateForUndo();
                activeColorTargets.forEach(target => colorAssignments[target] = element.index);
                syncColorAssignmentsForInheritance();
                applyColorsToSelection();
                buildColorPaletteUI();
            }
        }
        clickData.targetId = swatchId;
        clickData.timestamp = now;
        return;
    }

    if (actionContext.target === 'ui_session') {
        const { element } = actionContext;
        if (element && element.index !== undefined) {
            setActiveSession(element.index);
        }
        return;
    }

    if (actionContext.target === 'ui_session_add') {
        addNewSessionFromDefault();
        return;
    }

    if (actionContext.target === 'ui_session_remove') {
        if (selectedSessionIndex !== null) {
            removeSessionAtIndex(selectedSessionIndex);
        }
        return;
    }
}

function handleLeftMouseButtonUp(event) {
    if (isDraggingColorTarget || isDraggingColorSwatch || isDraggingSession) {
        if (isDraggingColorTarget) {
            const icon = canvasUI.colorTargetIcons.find(i => i.target === draggedColorTargetInfo.target);
            if (icon) {
                const dropTargets = canvasUI.colorSwatches;
                const closestTarget = U.findClosestUIElement(mousePos, dropTargets);
                if (closestTarget) {
                    colorAssignments[draggedColorTargetInfo.target] = closestTarget.index;
                    getDependentTargets(draggedColorTargetInfo.target).forEach(dep => {
                        colorAssignments[dep] = closestTarget.index;
                    });
                    applyColorsToSelection();
                }
            }
        } else if (isDraggingColorSwatch) {
            const removeBtn = canvasUI.removeColorButton;
            const isOverRemoveButton = removeBtn &&
                mousePos.x >= removeBtn.x && mousePos.x <= removeBtn.x + removeBtn.width &&
                mousePos.y >= removeBtn.y && mousePos.y <= removeBtn.y + removeBtn.height;
            if (isOverRemoveButton && allColors.length > 1) {
                const currentIndex = allColors.indexOf(draggedSwatchInfo.item);
                if (currentIndex !== -1) removeColorAtIndex(currentIndex);
            }
        } else if (isDraggingSession) {
            const removeBtn = canvasUI.removeSessionButton;
            const isOverRemoveButton = removeBtn &&
                mousePos.x >= removeBtn.x && mousePos.x <= removeBtn.x + removeBtn.width &&
                mousePos.y >= removeBtn.y && mousePos.y <= removeBtn.y + removeBtn.height;
            if (isOverRemoveButton && draggedSessionInfo) {
                removeSessionAtIndex(draggedSessionInfo.index);
            }
        }
        
        isDraggingColorTarget = false;
        draggedColorTargetInfo = null;
        isDraggingColorSwatch = false;
        draggedSwatchInfo = null;
        isDraggingSession = false;
        draggedSessionInfo = null;
        draggedSwatchTemporarilyRemoved = false;
        if (isColorPaletteExpanded) buildColorPaletteUI();
        if (isSessionsPanelExpanded) buildSessionsPanelUI();
    
    } else if (isDragConfirmed) {
        finalizeDragAction();
    } else if (actionContext) {
        if (typeof actionContext.target === 'string' && actionContext.target.startsWith('ui')) {
            handleUIClick(actionContext);
        } else {
            handleCanvasClick(actionContext);
        }
    }
    
    cleanupAfterDrag();
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
        if (selectedTextIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_TEXT);

        if (newActiveTargets.length > 0) {
            activeColorTargets = newActiveTargets;
            if (isColorPaletteExpanded) {
                buildColorPaletteUI();
            }
        }
    } else {
        if (isSessionsPanelExpanded && canvasUI.sessionsPanelBounds) {
            const panel = canvasUI.sessionsPanelBounds;
            const isInPanel = mousePos.x >= panel.x && mousePos.x <= panel.x + panel.width &&
                mousePos.y >= panel.y && mousePos.y <= panel.y + panel.height;
            if (isInPanel) {
                selectPreviousSession();
                return;
            }
        }
        // This is a simple right-click (not a drag), so show the context menu.
        showContextMenu(event);
    }
}

function handleWheelEvent(event){
    event.preventDefault();
    const mouseScreen = U.getMousePosOnCanvas(event, canvas);
    const scaleFactor = event.deltaY > 0 ? 1 / 1.15 : 1.15;
    zoomAt(mouseScreen, scaleFactor)
}

function handleMouseEnter() {
    isMouseOverCanvas = true;
}

function handleMouseLeave() {
    isMouseOverCanvas = false;
    redrawAll();
}

function handleContextMenu(event){
    event.preventDefault()
}

function handleTranslationDrag(rawDelta, mouseData) {
    const copyCount = parseInt(copyCountInput || '1', 10) || 1;

    const snapResult = S.getSnapResult(
        initialDragVertexStates,
        allVertices,
        allEdges,
        findVertexById,
        rawDelta,
        copyCount,
        viewTransform
    );

    const finalDelta = snapResult.finalDelta;

    initialDragVertexStates.forEach(originalVertexState => {
        const previewVertexToUpdate = dragPreviewVertices.find(dp => dp && dp.id === originalVertexState.id);
        if (previewVertexToUpdate) {
            previewVertexToUpdate.x = originalVertexState.x + finalDelta.x;
            previewVertexToUpdate.y = originalVertexState.y + finalDelta.y;
        }
    });

    handleTranslationDragSnapVisualization(finalDelta, snapResult);

    actionContext.finalSnapResult = snapResult;
}

function drawFeedbackAndIndicators(colors) {
    if (facesVisible && allVertices.length > 0) {
        R.drawFaceGlows(ctx, { allFaces, hoveredFaceId, selectedFaceIds, colors, isDragConfirmed, dragPreviewVertices, currentAltPressed }, dataToScreen, findVertexById, U.getFaceId);
        if (selectedFaceIds.length > 0) {
            R.drawFaceCoordinateSystems(ctx, { allFaces, selectedFaceIds, colors, isDragConfirmed, dragPreviewVertices, initialDragVertexStates, transformIndicatorData, highlightedEdgeForSnap, draggedFaceId, coordSystemSnapAngle, coordSystemSnapType, coordSystemSnapScale, initialCoordSystemStates }, dataToScreen, findVertexById);
        }
    }

    if (isDrawingMode && currentShiftPressed && (frozenReference_D_du !== null || frozenReference_A_rad !== null) && currentDrawingPath.length >= 1 && frozenReference_Origin_Data) {
        const lastSegmentStart = findVertexById(frozenReference_Origin_Data.id);
        if (lastSegmentStart) {
            const frozenDisplayContext = { frozen_Origin_Data_to_display: lastSegmentStart, displayAngleA_valueRad_for_A_equals_label: frozenReference_A_rad, frozen_A_baseRad_to_display: frozenReference_A_baseRad, frozen_D_du_to_display: frozenReference_D_du, frozen_D_g2g_to_display: frozenReference_D_g2g };
            const stateForRefGeo = { showAngles, showDistances, viewTransform, mousePos, colors };
            R.drawReferenceElementsGeometry(ctx, frozenDisplayContext, dataToScreen, screenToData, stateForRefGeo);
            const stateForRefTexts = { showAngles, showDistances, viewTransform, mousePos, frozenReference_D_du, distanceSigFigs, angleDisplayMode, colors };
            R.prepareReferenceElementsTexts(htmlOverlay, frozenDisplayContext, stateForRefTexts, screenToData, dataToScreen, updateHtmlLabel);
        }
    }

    const stateForFeedback = { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors };

    if (isDragConfirmed) {
        const draggedVertexIds = new Set(initialDragVertexStates.map(v => v.id));
        let isDeformingDrag = false;
        if (initialDragVertexStates.length > 0) {
            const subgraphVertexIds = new Set(findAllVerticesInSubgraph(initialDragVertexStates[0].id));
            isDeformingDrag = !(draggedVertexIds.size === subgraphVertexIds.size &&
                                [...draggedVertexIds].every(id => subgraphVertexIds.has(id)));
        }

        const hybridVertexStates = allVertices.map(p => {
            const draggedVersion = dragPreviewVertices.find(dp => dp.id === p.id);
            return draggedVersion || p;
        });

        if (isDeformingDrag && currentShiftPressed) {
            initialDragVertexStates.forEach(draggedVertex => {
                const hasStaticNeighbors = U.findNeighbors(draggedVertex.id, allEdges).some(neighborId => !draggedVertexIds.has(neighborId));
                if (hasStaticNeighbors) {
                    R.drawDragFeedback(ctx, htmlOverlay, draggedVertex.id, hybridVertexStates, stateForFeedback, dataToScreen, (id) => U.findNeighbors(id, allEdges), U.getEdgeId, currentShiftPressed, null, updateHtmlLabel, selectedVertexIds, true, initialDragVertexStates, activeCenterId, snappedVertexIds);
                }
            });
        } else if (actionContext && (actionContext.targetVertex || actionContext.targetEdge)) {
            const primaryVertexId = actionContext.targetVertex ? actionContext.targetVertex.id : initialDragVertexStates[0]?.id;
            if (primaryVertexId) {
                R.drawDragFeedback(ctx, htmlOverlay, primaryVertexId, hybridVertexStates, stateForFeedback, dataToScreen, (id) => U.findNeighbors(id, allEdges), U.getEdgeId, currentShiftPressed, null, updateHtmlLabel, selectedVertexIds, true, initialDragVertexStates, activeCenterId, snappedVertexIds);
            }
            if (actionContext.targetEdge) {
                R.drawSelectedEdgeDistances(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showDistances, distanceSigFigs, colors, lastGridState, currentShiftPressed }, findVertexById, U.getEdgeId, dataToScreen, updateHtmlLabel, dragPreviewVertices, initialDragVertexStates, transformIndicatorData);
            }
        }
    } else if ((showDistances || showAngles) && !isDrawingMode && !(parseInt(copyCountInput || '1', 10) > 1 && isDragConfirmed) && !isPlacingTransform) {
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

    const isHoveringGeometryWithoutAlt = !currentAltPressed && (hoveredVertexId || hoveredEdgeId || hoveredFaceId);

    if (isDrawingMode && previewLineStartVertexId && !isHoveringGeometryWithoutAlt) {
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
                    const totalEdges = currentDrawingPath.length; const nextEdgeIndex = currentDrawingPath.length - 1;
                    const startT = totalEdges > 1 ? nextEdgeIndex / (totalEdges - 1) : 0; const endT = totalEdges > 1 ? (nextEdgeIndex + 1) / totalEdges : 1;
                    edgeColormapInfo = { colormapItem: colorItem, startT: startT, endT: endT };
                }
            }
            R.drawDrawingPreview(ctx, { startVertex, snappedData, isShiftPressed: currentShiftPressed, currentColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextCreationColor: getColorForTarget(C.COLOR_TARGET_VERTEX), nextEdgeColor, colors, edgeColormapInfo, interpolationStyle: getActiveInterpolationStyle() }, dataToScreen);
            const targetDataPos = { x: snappedData.x, y: snappedData.y };
            const stateForSnapInfo = { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors };
            R.prepareSnapInfoTexts(ctx, htmlOverlay, startVertex, targetDataPos, snappedData, stateForSnapInfo, dataToScreen, currentPreviewDrawingContext, updateHtmlLabel);
        }
    }

    if (ghostVertexPosition && !isHoveringGeometryWithoutAlt) {
        const ghostVertex = { ...ghostVertexPosition, id: 'ghost', type: 'regular' };
        const isGhostMergeSnap = ghostVertexSnapType === 'vertex' || ghostVertexSnapType === 'edge_fraction' || ghostVertexSnapType === 'edge';
        const options = {
            selectedVertexIds: [], selectedCenterIds: [], activeCenterId: null, colors: colors,
            verticesVisible: true, isHovered: false, isSnapped: true,
            snapType: isGhostMergeSnap ? ghostVertexSnapType : null,
            currentAltPressed
        };
         R.drawVertex(ctx, ghostVertex, options, dataToScreen, updateHtmlLabel);
    }

    if (isRectangleSelecting && isDragConfirmed) {
        R.drawSelectionRectangle(ctx, rectangleSelectStartPos, mousePos, colors);
    }

    R.drawDrawingSnapLabels(ctx, { info: { ...drawingSnapLabelInfo, startVertex: findVertexById(previewLineStartVertexId) }, colors }, dataToScreen, findVertexById, updateHtmlLabel);
    if (transformIndicatorData || coordSystemTransformIndicatorData) {
        R.drawTransformIndicators(ctx, htmlOverlay, { transformIndicatorData, colors, coordSystemTransformIndicatorData, currentShiftPressed }, dataToScreen, updateHtmlLabel);
    }

     if (ghostVertexPosition && !isHoveringGeometryWithoutAlt) {
         const ghostVertex = { ...ghostVertexPosition, id: 'ghost', type: 'regular' };
         const isGhostMergeSnap = ghostVertexSnapType === 'vertex' || ghostVertexSnapType === 'edge_fraction' || ghostVertexSnapType === 'edge';
         const optionsForGlow = {
             selectedVertexIds: [], selectedCenterIds: [], activeCenterId: null, colors: colors,
             verticesVisible: true, isHovered: false, isSnapped: true,
             snapType: isGhostMergeSnap ? ghostVertexSnapType : null,
             currentAltPressed
         };
          const optionsForBase = {
              colors: colors, verticesVisible: true, isSnapped: true
          };
         if (isGhostMergeSnap) {
             R.drawVertex(ctx, ghostVertex, optionsForGlow, dataToScreen, updateHtmlLabel);
         } else {
             R.drawVertexBaseOnly(ctx, ghostVertex, optionsForBase, dataToScreen);
         }
     }
}

function handleIdleMouseMove(mousePos) {
    hoveredVertexId = null;
    hoveredEdgeId = null;
    hoveredFaceId = null;
    hoveredTextId = null;
    ghostVertexPosition = null; // Reset ghost position by default
    ghostVertexSnapType = null; // Reset ghost snap type

    if (!isActionInProgress) {
        if (!currentAltPressed) {
            const hoveredText = findClickedTextElement(mousePos);
            if (hoveredText) {
                hoveredTextId = hoveredText.id;
                return;
            }
        }

        const p = findClickedVertex(mousePos);
        const e = !p ? findClickedEdge(mousePos) : null;
        const f = !p && !e ? findClickedFace(mousePos) : null;

        const isOverGeometry = p || e || f;

        if (!currentAltPressed) {
             // Standard Hover: Set hover IDs if over geometry
             if (p) hoveredVertexId = p.id;
             else if (e) hoveredEdgeId = U.getEdgeId(e);
             else if (f) hoveredFaceId = f.id;

             // Standard Shift Hover: Show ghost snap ONLY if NOT over geometry
             if (currentShiftPressed && !isOverGeometry) {
                 const mouseDataPos = screenToData(mousePos);
                 const potentialSnapData = getSnappedPosition({ id: 'dummy_start', x: 0, y: 0, type: 'regular' }, mousePos, true);
                 if (potentialSnapData.snapped) {
                     ghostVertexPosition = { x: potentialSnapData.x, y: potentialSnapData.y };
                     ghostVertexSnapType = potentialSnapData.snapType;
                 }
             }
        } else {
             // Alt Hover: Calculate altHoverInfo if over geometry
             if (isOverGeometry) {
                 handleAltHoverMouseMove(mousePos, currentShiftPressed); // This function sets altHoverInfo
             } else {
                 altHoverInfo = null; // Clear alt hover if not over geometry
             }
             // Do NOT set standard hover IDs when Alt is pressed
             hoveredVertexId = null;
             hoveredEdgeId = null;
             hoveredFaceId = null;
        }
    }
}


function handleDrawingMouseMove(mousePos) {
    if (previewLineStartVertexId) {
        const startVertex = findVertexById(previewLineStartVertexId);
        if (startVertex) {
            if (currentShiftPressed) {
                const snappedData = getSnappedPosition(startVertex, mousePos, currentShiftPressed);
                drawingSnapLabelInfo = (snappedData.snapped && snappedData.snapType === 'edge_fraction')
                    ? { edge: snappedData.targetEdge, fraction: snappedData.fraction, snapPoint: { x: snappedData.x, y: snappedData.y }, mousePos: mousePos }
                    : null;
            } else {
                drawingSnapLabelInfo = null;
            }
        }
    }
    ghostVertexPosition = null;
}

function handleTransformDrag(mouseData, startReferenceVertex, center, centerType) {
    const rawTransform = calculateTransformFromMouse(center, mouseData, startReferenceVertex, centerType, currentAccumulatedRotation);
    let snapResult = {};
    let finalTransform = {};
    if (centerType === C.TRANSFORMATION_TYPE_ROTATION) {
        snapResult = getBestRotationSnap(center, initialDragVertexStates, startReferenceVertex, rawTransform.rotation, mouseData);
        finalTransform = { rotation: snapResult.rotation, scale: 1, directionalScale: false };
        currentAccumulatedRotation = rawTransform.rotation;
    } else if (centerType === C.TRANSFORMATION_TYPE_SCALE) {
        snapResult = getBestScaleSnap(center, initialDragVertexStates, startReferenceVertex, rawTransform.scale);
        finalTransform = { rotation: 0, scale: snapResult.scale || rawTransform.scale, directionalScale: false };
    } else if (centerType === C.TRANSFORMATION_TYPE_ROTATE_SCALE) {
        snapResult = getBestRotateScaleSnap(center, initialDragVertexStates, startReferenceVertex, rawTransform.rotation, rawTransform.scale);
        finalTransform = { rotation: snapResult.rotation, scale: snapResult.scale, directionalScale: false };
        currentAccumulatedRotation = rawTransform.rotation;
    } else if (centerType === C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
        const startVector = { x: startReferenceVertex.x - center.x, y: startReferenceVertex.y - center.y };
        snapResult = getBestDirectionalScaleSnap(center, initialDragVertexStates, startReferenceVertex, rawTransform.scale, startVector, mouseData);
        finalTransform = { rotation: 0, scale: snapResult.scale || rawTransform.scale, directionalScale: true };
    }

    if (snapResult.snapped && snapResult.snapType === 'projection' && snapResult.projectionSource) {
        ghostVertexPosition = snapResult.projectionSource;
    }

    const startVector = { x: startReferenceVertex.x - center.x, y: startReferenceVertex.y - center.y };

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
        gridPoint: snapResult.gridPoint || null,
        nearbyVertex: snapResult.nearbyVertex || null,
        projectionPoint: snapResult.projectionPoint || null,
        projectionSource: snapResult.projectionSource || null,
        snapType: snapResult.snapType || null,
        projectionCenter: snapResult.snapType === 'projection' ? center : null,
        projectionHandleInitial: snapResult.projectionHandleInitial || null,
        startVector: startVector
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
}

function handleUIDrag(mousePos) {
    if (isDraggingColorTarget && draggedColorTargetInfo) {
        const icon = canvasUI.colorTargetIcons.find(i => i.target === draggedColorTargetInfo.target);
        if (icon) {
            const dropTargets = [...canvasUI.colorSwatches];
            const closestTarget = U.findClosestUIElement(mousePos, dropTargets);
            if (closestTarget) {
                icon.x = closestTarget.x + (closestTarget.width - icon.width) / 2;
                icon.y = closestTarget.y - icon.height - 5;
                draggedColorTargetInfo.previewColorIndex = closestTarget.index;
                getDependentTargets(draggedColorTargetInfo.target).forEach(dep => {
                    const depIcon = canvasUI.colorTargetIcons.find(i => i.target === dep);
                    if (depIcon) {
                        depIcon.x = icon.x;
                        depIcon.y = icon.y;
                    }
                });
            } else {
                icon.x = mousePos.x - draggedColorTargetInfo.offsetX;
                icon.y = mousePos.y - draggedColorTargetInfo.offsetY;
                draggedColorTargetInfo.previewColorIndex = draggedColorTargetInfo.originalColorIndex;
                getDependentTargets(draggedColorTargetInfo.target).forEach(dep => {
                    const depIcon = canvasUI.colorTargetIcons.find(i => i.target === dep);
                    if (depIcon) {
                        depIcon.x = icon.x;
                        depIcon.y = icon.y;
                    }
                });
            }
        }
        return true;
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
                removeColorAtIndex(indexToRemove);
                buildColorPaletteUI();
            }
            return true;
        } else if (!isOverRemoveButton && draggedSwatchTemporarilyRemoved) {
            draggedSwatchTemporarilyRemoved = false;
            allColors.splice(draggedSwatchInfo.originalIndex, 0, draggedSwatchInfo.item);
            Object.keys(colorAssignments).forEach(target => {
                if (colorAssignments[target] >= draggedSwatchInfo.originalIndex) {
                    colorAssignments[target]++;
                }
            });
            Object.keys(draggedSwatchInfo.originalAssignments).forEach(target => {
                if (draggedSwatchInfo.originalAssignments[target] === draggedSwatchInfo.originalIndex) {
                    colorAssignments[target] = draggedSwatchInfo.originalIndex;
                }
            });
            buildColorPaletteUI();
            return true;
        }

        if (draggedSwatchTemporarilyRemoved) return true;

        const fromIndex = allColors.indexOf(draggedSwatchInfo.item);
        let targetIndex = fromIndex;
        for (let i = 0; i < canvasUI.colorSwatches.length; i++) {
            const swatch = canvasUI.colorSwatches[i];
            if (mousePos.x >= swatch.x && mousePos.x <= swatch.x + swatch.width) {
                targetIndex = allColors.indexOf(swatch.item);
                break;
            }
        }
        
        if (targetIndex !== fromIndex) {
            const temp = allColors[fromIndex];
            allColors.splice(fromIndex, 1);
            allColors.splice(targetIndex, 0, temp);
            
            Object.keys(colorAssignments).forEach(target => {
                if (colorAssignments[target] === fromIndex) {
                    colorAssignments[target] = targetIndex;
                } else if (colorAssignments[target] > fromIndex && colorAssignments[target] <= targetIndex) {
                    colorAssignments[target]--;
                } else if (colorAssignments[target] < fromIndex && colorAssignments[target] >= targetIndex) {
                    colorAssignments[target]++;
                }
            });
            buildColorPaletteUI();
        }
        return true;
    }

    if (isDraggingSession) {
        return true;
    }

    return false;
}

function updateHoverStates() {
    // If we are in the middle of a drag, draw, or pan, clear all idle hover effects.
    if (isActionInProgress || isDrawingMode) {
        altHoverInfo = null;
        ghostVertexPosition = null;
        hoveredVertexId = null;
        hoveredEdgeId = null;
        hoveredFaceId = null;
        return;
    }

    // Check if Alt is held down
    if (currentAltPressed) {
        // If so, run the logic for the special Alt indicator
        handleAltHoverMouseMove(mousePos, currentShiftPressed);
    } else {
        // Otherwise, run the logic for normal and Shift-key hovering
        altHoverInfo = null;
        handleIdleMouseMove(mousePos);
    }
}

function handleMouseMove(event) {
    mousePos = U.getMousePosOnCanvas(event, canvas);
    currentShiftPressed = event.shiftKey;
    currentAltPressed = event.altKey;

    if (isMouseInUIPanel(mousePos)) {
        canvas.style.cursor = 'default';
    } else if (isPlacingTransform) {
        canvas.style.cursor = 'none';
    } else if (isPanningBackground || isDragConfirmed) {
        canvas.style.cursor = 'grabbing';
    } else {
        canvas.style.cursor = 'crosshair';
    }

    if (isActionInProgress) {
        if (!isDragConfirmed && U.distance(mousePos, actionStartPos) > C.DRAG_THRESHOLD && !isDrawingMode) {
            isDragConfirmed = true;

            if (actionContext && actionContext.target === 'coord_system') {
                return;
            }
            actionTargetVertex = actionContext.dragHandle;
            // Edge-only drags should not trigger transform handling even if a center is active
            isEdgeTransformDrag = actionContext.target === 'edge';

            if (actionContext.target === 'ui_icon_click') {
                isDraggingColorTarget = true;
                const baseTarget = getInheritedBaseTarget(actionContext.element.target);
                draggedColorTargetInfo = {
                    target: baseTarget,
                    offsetX: mousePos.x - actionContext.element.x,
                    offsetY: mousePos.y - actionContext.element.y,
                    originalColorIndex: colorAssignments[baseTarget],
                    previewColorIndex: colorAssignments[baseTarget]
                };
                actionContext.target = 'ui_icon_drag';
                activeColorTargets = [baseTarget, ...getDependentTargets(baseTarget)];
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
            } else if (actionContext.target === 'ui_session') {
                isDraggingSession = true;
                draggedSessionInfo = {
                    index: actionContext.element.index,
                    session: actionContext.element.session,
                    offsetX: mousePos.x - actionContext.element.x,
                    offsetY: mousePos.y - actionContext.element.y
                };
                actionContext.target = 'ui_session_drag';
            } else if (currentMouseButton === 2) {
                isRectangleSelecting = true;
                return;
            } else if (actionContext.target === 'canvas') {
                isPanningBackground = true;
                backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
                canvas.style.cursor = 'move';
            } else {
                canvas.style.cursor = 'grabbing';
                const targetIsCenter = actionContext.targetVertex && actionContext.targetVertex.type !== 'regular';
                isDraggingCenter = targetIsCenter && !actionContext.isTransformDrag;

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

                const textElementsToDrag = selectedTextIds.map(id => getTextElementById(id)).filter(Boolean);

                if (verticesToDrag.length > 0 || textElementsToDrag.length > 0) {
                    initialDragVertexStates = JSON.parse(JSON.stringify(verticesToDrag));
                    dragPreviewVertices = JSON.parse(JSON.stringify(verticesToDrag));
                    initialDragTextStates = JSON.parse(JSON.stringify(textElementsToDrag));
                    dragPreviewTextStates = JSON.parse(JSON.stringify(textElementsToDrag));
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
            if (isPanningBackground) {
                const deltaX_css = mousePos.x - actionStartPos.x;
                const deltaY_css = mousePos.y - actionStartPos.y;
                viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
                viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
            } else if (!isRectangleSelecting) {
                if (handleUIDrag(mousePos)) return;
                if (handleCoordinateSystemMouseMove(event)) return;
                const isTransformingSelection = activeCenterId && (selectedVertexIds.length > 0 || selectedEdgeIds.length > 0 || selectedFaceIds.length > 0 || selectedTextIds.length > 0) && !isEdgeTransformDrag;
                if (isTransformingSelection) {
                    const center = findVertexById(activeCenterId);
                    let startReferenceVertex = actionTargetVertex; // use the exact point the user grabbed
                    if (!startReferenceVertex && initialDragVertexStates.length > 0) {
                        startReferenceVertex =
                            initialDragVertexStates.find(p => p.type === 'regular' && U.distance(p, center) > 1e-6) ||
                            initialDragVertexStates.find(p => p.type === 'regular');
                    }
                    if (center && startReferenceVertex) {
                        handleTransformDrag(screenToData(mousePos), startReferenceVertex, center, center.type);
                    }
                } else if (dragPreviewVertices.length > 0) {
                    // --- THIS IS THE FIX ---
                    const isDeformingDrag = initialDragVertexStates.length === 1 && initialDragVertexStates[0].type === 'regular';
                    const mouseData = screenToData(mousePos);
                    
                    if (isDeformingDrag) {
                        const draggedVertex = initialDragVertexStates[0];
                        const staticNeighbors = U.findNeighbors(draggedVertex.id, allEdges)
                            .filter(neighborId => !initialDragVertexStates.some(v => v.id === neighborId))
                            .map(id => findVertexById(id));
                        
                        const snapResult = getDeformingSnapResult(draggedVertex, mouseData, staticNeighbors);

                        dragPreviewVertices[0].x = snapResult.pos.x;
                        dragPreviewVertices[0].y = snapResult.pos.y;

                        snappedVertexIds.clear();
                        snappedEdgeIds.clear();
                        if (snapResult.snapped) {
                            const snapInfo = { copyIndex: 0, type: snapResult.snapType, projectionLine: snapResult.projectionLine };
                            snappedVertexIds.set(draggedVertex.id, [snapInfo]);
                            if (snapResult.targetEdge) {
                                snappedEdgeIds.set(U.getEdgeId(snapResult.targetEdge), [{ copyIndex: 0, type: 'external_to_static' }]);
                            }
                        }
                        
                        actionContext.finalSnapResult = {
                            ...snapResult,
                            finalDelta: { x: snapResult.pos.x - draggedVertex.x, y: snapResult.pos.y - draggedVertex.y }
                        };
                    } else {
                        const startMouseData = screenToData(actionStartPos);
                        const rawDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };
                        handleTranslationDrag(rawDelta, mouseData);
                    }
                } else if (dragPreviewTextStates.length > 0) {
                    const startMouseData = screenToData(actionStartPos);
                    const mouseData = screenToData(mousePos);
                    const rawDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };
                    actionContext.textFinalDelta = rawDelta;
                }
            }
        }
    } else {
        if (isDrawingMode) {
            handleDrawingMouseMove(mousePos);
        } else {
            updateHoverStates();
        }
    }
}

function handleTranslationDragSnapVisualization(finalDelta, snapResult) {
    snappedVertexIds.clear();
    snappedEdgeIds.clear();

    if (!snapResult || !snapResult.snapped) return;

    const addSnapIndicator = (map, originalId, transformIndex, type) => {
        // transformIndex: 0..N-1 for copies, undefined for static, -1 for original selection ref target
        if (originalId === undefined) return;

        let visualizationCopyIndex;
        if (transformIndex === undefined) {
            visualizationCopyIndex = undefined; // Static element
        } else if (transformIndex === -1) {
            visualizationCopyIndex = 0; // Original element acts as target (drawn at index 0)
        } else if (transformIndex >= 0) {
            visualizationCopyIndex = transformIndex; // Direct mapping: 0 -> 0, 1 -> 1, etc.
        } else {
            return; // Invalid index
        }

        // Add indicator only if it's for a valid drawing index (0 to N-1 or undefined for static)
        if (visualizationCopyIndex === undefined || visualizationCopyIndex >= 0) {
             if (!map.has(originalId)) {
                 map.set(originalId, []);
             }
             if (!map.get(originalId).some(s => s.copyIndex === visualizationCopyIndex && s.type === type)) {
                  map.get(originalId).push({ copyIndex: visualizationCopyIndex, type });
             }
        }
    };

    // Iterate through ALL final merge pairs reported by snapResult
    snapResult.mergePairs.forEach(pair => {
        addSnapIndicator(snappedVertexIds, pair.source.originalId, pair.source.transformIndex, 'vertex');
        addSnapIndicator(snappedVertexIds, pair.target.originalId, pair.target.transformIndex, 'vertex');
    });

    // Iterate through ALL final edge snaps reported by snapResult
    snapResult.edgeSnaps.forEach(({ sourceVertex, targetEdge }) => {
        addSnapIndicator(snappedVertexIds, sourceVertex.originalId, sourceVertex.transformIndex, 'edge');
        addSnapIndicator(snappedEdgeIds, targetEdge.originalEdgeId, targetEdge.transformIndex, 'vertex_on_edge');
    });
}


function calculateFinalMerges(allFinalVertices, allEdges, viewTransform) {
    const mergeRadius = 2 * C.VERTEX_RADIUS / viewTransform.scale;
    const vertexMerges = new Map();
    const edgeSplits = new Map();
    const parent = new Map();
    allFinalVertices.forEach(p => parent.set(p.id, p.id));

    const findRoot = (id) => {
        if (!parent.has(id) || parent.get(id) === id) return id;
        const rootId = findRoot(parent.get(id));
        parent.set(id, rootId);
        return rootId;
    };

    for (let i = 0; i < allFinalVertices.length; i++) {
        for (let j = i + 1; j < allFinalVertices.length; j++) {
            const p1 = allFinalVertices[i];
            const p2 = allFinalVertices[j];
            if (p1.type === 'regular' && p2.type === 'regular' && U.distance(p1, p2) < mergeRadius) {
                const root1 = findRoot(p1.id);
                const root2 = findRoot(p2.id);
                if (root1 !== root2) {
                    parent.set(root2, root1);
                }
            }
        }
    }

    allFinalVertices.forEach(p => {
        const rootId = findRoot(p.id);
        if (p.id !== rootId) {
            vertexMerges.set(p.id, rootId);
        }
    });

    const mergedAwayVertexIds = new Set(vertexMerges.keys());
    const finalVertexMap = new Map(allFinalVertices.map(v => [v.id, v]));

    allEdges.forEach(edge => {
        const root1_id = findRoot(edge.id1);
        const root2_id = findRoot(edge.id2);
        if (root1_id === root2_id) return;

        const p1 = finalVertexMap.get(root1_id);
        const p2 = finalVertexMap.get(root2_id);
        if (!p1 || !p2) return;

        allFinalVertices.forEach(vertex => {
            if (vertex.type !== 'regular' || mergedAwayVertexIds.has(vertex.id)) return;
            if (vertex.id === root1_id || vertex.id === root2_id) return;

            const closest = U.getClosestPointOnLineSegment(vertex, p1, p2);
            if (closest.distance < mergeRadius && closest.onSegmentStrict) {
                const edgeId = U.getEdgeId({id1: root1_id, id2: root2_id});
                if (!edgeSplits.has(edgeId)) {
                    edgeSplits.set(edgeId, {edge: {id1: root1_id, id2: root2_id}, pointsToInsert: []});
                }
                edgeSplits.get(edgeId).pointsToInsert.push(vertex);
            }
        });
    });

    return { vertexMerges, edgeSplits };
}

function handleMouseUpDispatcher(event) {
    // --- NEW: Check for coordinate system drag first ---
    if (isDraggingCoordSystem) {
        handleCoordinateSystemMouseUp(); // This function now handles its own cleanup
    // --- END NEW ---
    } else if (currentMouseButton === 0) { // Original Left Mouse Button Logic
        handleLeftMouseButtonUp(event);
    } else if (currentMouseButton === 2) { // Original Right Mouse Button Logic
        handleRightMouseButtonUp(event);
    }

    // General cleanup (flags reset inside specific handlers now or here if not handled)
    if (!isDraggingCoordSystem) { // Don't run general cleanup if coord system handled it
         cleanupAfterDrag();
    }

    // Update cursor style based on final state
    if (isMouseInUIPanel(mousePos)) {
        canvas.style.cursor = 'default';
    } else if (!isPlacingTransform) {
        canvas.style.cursor = 'crosshair';
    }

    schedulePersistState();
}

function cleanupAfterDrag() {
    if (copyCountTimer) clearTimeout(copyCountTimer);
    copyCountInput = '';
    copyCountTimer = null;

    // Flags reset by handleLeft/RightMouseButtonUp or handleCoordinateSystemMouseUp
    isActionInProgress = false;
    isDragConfirmed = false;
    isRectangleSelecting = false;
    isEdgeTransformDrag = false;
    isDraggingCenter = false;
    isPanningBackground = false;

    // Reset drag previews and states
    dragPreviewVertices = [];
    initialDragVertexStates = [];
    dragPreviewTextStates = [];
    initialDragTextStates = [];
    actionContext = null;
    transformIndicatorData = null;
    ghostVertices = [];
    ghostVertexPosition = null; // Clear ghost vertex specifically
    snappedEdgeIds.clear();
    snappedVertexIds.clear();
    initialCoordSystemStates.clear(); // Clear the initial states backup

    // Reset other temporary states
    currentMouseButton = -1; // Reset mouse button tracker
}

function handleMouseDownDispatcher(event) {
    if (copyCountTimer) clearTimeout(copyCountTimer);
    copyCountInput = '';
    copyCountTimer = null;

    if (contextMenu.style.display === 'block') {
        contextMenu.style.display = 'none';
    }

    const targetElement = event.target;
    if (targetElement && (targetElement.tagName === 'INPUT' || targetElement.closest('.katex'))) {
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

function handleKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
        return;
    }
    if (event.key === 'Alt' && !event.repeat) {
        event.preventDefault();
        currentAltPressed = true;
        updateHoverStates();
    }

    const isTypingKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (isTypingKey && !isDrawingMode && !isPlacingTransform && !isActionInProgress) {
        event.preventDefault();
        createTextElementFromHover(event.key);
        return;
    }

    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    if (isCtrlOrCmd && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault();
        const allRegularVertexIds = allVertices.filter(v => v.type === 'regular').map(v => v.id);
        const allEdgeIds = allEdges.map(e => U.getEdgeId(e));
        const allFaceIds = allFaces.map(f => U.getFaceId(f));
        const allTextIds = allTextElements.map(el => el.id);
        applySelectionLogic(allRegularVertexIds, allEdgeIds, allFaceIds, false, false, false, allTextIds);
        selectedCenterIds = allVertices.filter(v => v.type !== 'regular').map(v => v.id);
        activeCenterId = selectedCenterIds.length > 0 ? selectedCenterIds[selectedCenterIds.length - 1] : null;
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
                const colors = getColors();
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
                    const face = draggedCoordSystemElement.face;
                    const coordSystem = face.localCoordSystem;
                    const faceVertices = face.vertexIds.map(id => findVertexById(id)).filter(p => p && p.type === 'regular');
                    const clampedPos = U.clampPointToPolygon(potentialSnapPos, faceVertices);
                    coordSystem.origin.x = clampedPos.x;
                    coordSystem.origin.y = clampedPos.y;
                    coordSystem.isCustom = true;
                }
            } else {
                const p = findClickedVertex(mousePos);
                const e = !p ? findClickedEdge(mousePos) : null;
                const f = !p && !e ? findClickedFace(mousePos) : null;
                if (!p && !e && !f) {
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

        // --- NEW: Recalculate snaps for the new copy count ---
        const newCopyCount = parseInt(copyCountInput, 10) || 1;
        // Check if a snap calculation has already happened and stored the delta
        if (actionContext?.finalSnapResult?.finalDelta) {
             const currentFinalDelta = actionContext.finalSnapResult.finalDelta;
             const rawTransform = { delta: currentFinalDelta }; // Use the delta from the last mouse move
             const applyTransform = (vertex, multiplier, transform = rawTransform) => ({
                 x: vertex.x + transform.delta.x * multiplier,
                 y: vertex.y + transform.delta.y * multiplier,
             });

             // Recalculate snaps with the NEW copy count but the SAME delta
             const newSnapResult = S.getGeneralSnapResult(
                 initialDragVertexStates,
                 allVertices,
                 allEdges,
                 findVertexById,
                 newCopyCount, // Use the updated count
                 viewTransform,
                 rawTransform, // Pass the raw transform based on currentFinalDelta
                 applyTransform
             );

             // Update the global snap indicator maps
             handleTranslationDragSnapVisualization(currentFinalDelta, newSnapResult);
             // Store the new result (optional, but good practice)
             actionContext.finalSnapResult = { ...newSnapResult, finalDelta: currentFinalDelta };
        }
        // --- END NEW ---

        copyCountTimer = setTimeout(() => {
            copyCountTimer = null;
        }, 500);
        // No return here, allow redraw to happen implicitly
        // return; // REMOVED
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
        event.preventDefault();
        deleteSelectedItems();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_COPY) {
        if (isSessionsPanelExpanded && sessions[selectedSessionIndex]) {
            event.preventDefault();
            sessionClipboard = JSON.parse(JSON.stringify(sessions[selectedSessionIndex]));
            return;
        }
        event.preventDefault();
        handleCopy();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_CUT) {
        event.preventDefault();
        handleCut();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_PASTE) {
        if (isSessionsPanelExpanded && sessionClipboard) {
            event.preventDefault();
            addSessionFromClipboard();
            return;
        }
        event.preventDefault();
        handlePaste();
    } else if (isCtrlOrCmd && event.key.toLowerCase() === C.KEY_UNDO && !event.shiftKey) {
        if (isSessionsPanelExpanded && sessionUndoStack.length > 0) {
            event.preventDefault();
            restoreDeletedSession();
            return;
        }
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
        const newActiveTargets = [];
        if (selectedFaceIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_FACE);
        if (selectedEdgeIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_EDGE);
        if (selectedVertexIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_VERTEX);
        if (selectedTextIds.length > 0) newActiveTargets.push(C.COLOR_TARGET_TEXT);
        if (newActiveTargets.length > 0) {
            activeColorTargets = newActiveTargets;
            if (isColorPaletteExpanded) {
                buildColorPaletteUI();
            }
        }
    }
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
    if (event.key === 'Alt') {
        currentAltPressed = false;
        updateHoverStates();
    }

    schedulePersistState();
}

function handleResize() {
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

function handleLoad() {
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
    handleResize();

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

    interpolationEditor = new InterpolationEditor({
        container: document.body,
        onSelect: (style) => {
            if (!style) return;
            const normalized = { ...style };
            if (!normalized.id) {
                normalized.id = U.generateUniqueId();
            }
            const existingIndex = interpolationStyles.findIndex(item => item.id === normalized.id);
            if (existingIndex >= 0) {
                interpolationStyles[existingIndex] = normalized;
            } else {
                interpolationStyles.push(normalized);
            }
            setActiveInterpolationStyle(normalized.id);
            if (isInterpolationPanelExpanded) buildInterpolationPanelUI();
            schedulePersistState();
        }
    });
    interpolationEditor.initialize();

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

    const restoredSessions = loadSessionsFromStorage();
    if (!restoredSessions) {
        const restored = loadStateFromStorage();
        if (!restored) {
            saveStateForUndo();
        }
        initializeSessionsFromCurrentState();
    }
    gameLoop();
    updateComponentDrawOrder();
}

canvas.addEventListener('wheel', handleWheelEvent, { passive: false });

canvas.addEventListener('mouseenter', handleMouseEnter);

canvas.addEventListener('mouseleave', handleMouseLeave);

window.addEventListener('contextmenu', handleContextMenu);

canvas.addEventListener('mousemove', handleMouseMove);

canvas.addEventListener("mouseup", handleMouseUpDispatcher);

canvas.addEventListener('mousedown', handleMouseDownDispatcher);

window.addEventListener('keyup', handleKeyUp);

window.addEventListener('keydown', handleKeyDown);

window.addEventListener('resize', handleResize);

window.addEventListener('beforeunload', () => {
    persistStateNow();
});

window.addEventListener('load', handleLoad);