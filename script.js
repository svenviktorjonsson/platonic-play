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

let allPoints = [];
let allEdges = [];
let selectedPointIds = [];
let activeCenterId = null;
let mousePos = { x: 0, y: 0 };
let currentColor = '#ffffff';

let viewTransform = {
    scale: 100,
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
let ctrlKeyAtActionStart = false;
let lastCanvasClickTime = 0;
let clipboard = { points: [], edges: [], referencePoint: null };
let clickData = { pointId: null, count: 0, timestamp: 0 };
let undoStack = [];
let redoStack = [];
let isPanningBackground = false;
let backgroundPanStartOffset = { x: 0, y: 0 };

const MAX_HISTORY_SIZE = 50;

function generateUniqueId() { return crypto.randomUUID(); }

function addToRecentColors(color) {
    const index = recentColors.indexOf(color);
    if (index > -1) {
        recentColors.splice(index, 1);
    }
    recentColors.unshift(color);
    if (recentColors.length > 8) {
        recentColors = recentColors.slice(0, 8);
    }
    updateColorPalette();
}

function updateColorPalette() {
    colorPalette.innerHTML = '';
    recentColors.forEach(color => {
        const paletteColor = document.createElement('div');
        paletteColor.className = 'palette-color';
        paletteColor.style.backgroundColor = color;
        if (color === currentColor) {
            paletteColor.classList.add('active');
        }
        paletteColor.addEventListener('click', () => {
            setCurrentColor(color);
        });
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
        const undoState = JSON.parse(JSON.stringify({points: allPoints, edges: allEdges, selectedPointIds, activeCenterId, isDrawingMode, previewLineStartPointId}));
        const redoState = JSON.parse(JSON.stringify({points: allPoints, edges: allEdges, selectedPointIds, activeCenterId, isDrawingMode, previewLineStartPointId}));

        changedPoints.forEach(cp => {
            const p = redoState.points.find(pt => pt.id === cp.id);
            if(p) p.color = newColor;
        });
        redoStack = [];

        changedPoints.forEach(cp => {
             const p = undoState.points.find(pt => pt.id === cp.id);
             if(p) p.color = cp.oldColor;
        });
        undoStack.push(undoState);
         if (undoStack.length > MAX_HISTORY_SIZE) undoStack.shift();

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
        previewLineStartPointId: previewLineStartPointId
    };
    undoStack.push(state);
    if (undoStack.length > MAX_HISTORY_SIZE) {
        undoStack.shift();
    }
    redoStack = [];
}

function restoreState(state) {
    allPoints = JSON.parse(JSON.stringify(state.points));
    allEdges = JSON.parse(JSON.stringify(state.edges));
    selectedPointIds = JSON.parse(JSON.stringify(state.selectedPointIds || []));
    activeCenterId = state.activeCenterId !== undefined ? state.activeCenterId : null;
    isDrawingMode = state.isDrawingMode !== undefined ? state.isDrawingMode : false;
    previewLineStartPointId = state.previewLineStartPointId !== undefined ? state.previewLineStartPointId : null;

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

function handleUndo() {
    if (undoStack.length === 0) { return; }
    const currentState = {
        points: JSON.parse(JSON.stringify(allPoints)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        selectedPointIds: JSON.parse(JSON.stringify(selectedPointIds)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartPointId: previewLineStartPointId
    };
    redoStack.push(currentState);
    const prevState = undoStack.pop();
    restoreState(prevState);
}

function handleRedo() {
    if (redoStack.length === 0) { return; }
    const currentState = {
        points: JSON.parse(JSON.stringify(allPoints)),
        edges: JSON.parse(JSON.stringify(allEdges)),
        selectedPointIds: JSON.parse(JSON.stringify(selectedPointIds)),
        activeCenterId: activeCenterId,
        isDrawingMode: isDrawingMode,
        previewLineStartPointId: previewLineStartPointId
    };
    undoStack.push(currentState);
    const nextState = redoStack.pop();
    restoreState(nextState);
}

function screenToData(screenPos) {
    return {
        x: (screenPos.x - viewTransform.offsetX) / viewTransform.scale,
        y: (screenPos.y - viewTransform.offsetY) / viewTransform.scale
    };
}

function dataToScreen(dataPos) {
    return {
        x: dataPos.x * viewTransform.scale + viewTransform.offsetX,
        y: dataPos.y * viewTransform.scale + viewTransform.offsetY
    };
}

function zoomAt(zoomCenter, scaleFactor) {
    const dataPosBeforeZoom = screenToData(zoomCenter);
    viewTransform.scale *= scaleFactor;
    viewTransform.scale = Math.max(0.1, Math.min(1000, viewTransform.scale));
    const screenPosAfterZoom = dataToScreen(dataPosBeforeZoom);
    viewTransform.offsetX += zoomCenter.x - screenPosAfterZoom.x;
    viewTransform.offsetY += zoomCenter.y - screenPosAfterZoom.y;
}

function resizeCanvas() {
    const canvasContainer = document.querySelector('.canvas-container');
    const cW = canvasContainer.offsetWidth;
    const cH = canvasContainer.offsetHeight;
    
    canvas.width = cW * dpr;
    canvas.height = cH * dpr;
    canvas.style.width = `${cW}px`;
    canvas.style.height = `${cH}px`;
    
    ctx.scale(dpr, dpr);
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
    for (let i = allPoints.length - 1; i >= 0; i--) {
        const point = allPoints[i];
        if (point.type !== 'regular' && distance(dataPos, point) < (CENTER_POINT_VISUAL_RADIUS + POINT_SELECT_RADIUS / 2) / viewTransform.scale) { return point; }
    }
    for (let i = allPoints.length - 1; i >= 0; i--) {
        const point = allPoints[i];
        if (point.type === 'regular' && distance(dataPos, point) < POINT_SELECT_RADIUS / viewTransform.scale) { return point; }
    }
    return null;
}

function findNeighbors(pointId) {
    const n = new Set();
    allEdges.forEach(e => { if (e.id1 === pointId) { n.add(e.id2); } if (e.id2 === pointId) { n.add(e.id1); } });
    return Array.from(n);
}

function findAllPointsInSubgraph(startPointId) {
    if (!findPointById(startPointId)) { return []; }
    const v = new Set(); const q = [startPointId]; const sPIds = []; v.add(startPointId);
    while (q.length > 0) {
        const cId = q.shift(); sPIds.push(cId);
        findNeighbors(cId).forEach(nId => { if (!v.has(nId)) { v.add(nId); q.push(nId); } });
    }
    return sPIds;
}

function drawCenterSymbol(point) {
    const screenPos = dataToScreen(point);
    const radius = CENTER_POINT_VISUAL_RADIUS;
    ctx.strokeStyle = point.color || currentColor;
    ctx.fillStyle = point.color || currentColor;
    ctx.setLineDash([]);
    if (point.type === 'center_rotate_scale') {
        ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI); ctx.lineWidth = LINE_WIDTH; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x - radius, screenPos.y); ctx.lineTo(screenPos.x + radius, screenPos.y);
        ctx.moveTo(screenPos.x, screenPos.y - radius); ctx.lineTo(screenPos.x, screenPos.y + radius); ctx.lineWidth = LINE_WIDTH; ctx.stroke();
    } else if (point.type === 'center_rotate_only') {
        ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI); ctx.lineWidth = LINE_WIDTH; ctx.stroke();
    } else if (point.type === 'center_scale_only') {
        ctx.beginPath(); ctx.moveTo(screenPos.x - radius, screenPos.y); ctx.lineTo(screenPos.x + radius, screenPos.y);
        ctx.moveTo(screenPos.x, screenPos.y - radius); ctx.lineTo(screenPos.x, screenPos.y + radius); ctx.lineWidth = LINE_WIDTH; ctx.stroke();
    }
    ctx.lineWidth = LINE_WIDTH;
}

function applySelectionLogic(pointIdsToSelect, shiftPressed, ctrlPressed, targetIsCenter = false) {
    if (targetIsCenter) {
        const centerId = pointIdsToSelect[0];
        if (ctrlPressed) {
            if (activeCenterId === centerId) { activeCenterId = null; }
            else { activeCenterId = centerId; }
        } else {
            activeCenterId = centerId;
            if (!shiftPressed) { selectedPointIds = []; }
        }
    } else {
        if (shiftPressed) {
            selectedPointIds = [...new Set([...selectedPointIds, ...pointIdsToSelect])];
        } else if (ctrlPressed) {
            pointIdsToSelect.forEach(id => {
                const i = selectedPointIds.indexOf(id);
                if (i > -1) { selectedPointIds.splice(i, 1); }
                else { selectedPointIds.push(id); }
            });
        } else {
            selectedPointIds = [...pointIdsToSelect];
            if (!shiftPressed && !ctrlPressed) { activeCenterId = null; }
        }
    }
}

function handleCopy() {
    const pointsToCopyIds = [...selectedPointIds]; if (activeCenterId) { pointsToCopyIds.push(activeCenterId); } if (pointsToCopyIds.length === 0) { return; }
    clipboard.points = pointsToCopyIds.map(id => { const p = findPointById(id); return p ? { ...p } : null; }).filter(p => p !== null);
    clipboard.edges = allEdges.filter(edge => pointsToCopyIds.includes(edge.id1) && pointsToCopyIds.includes(edge.id2) && findPointById(edge.id1)?.type === 'regular' && findPointById(edge.id2)?.type === 'regular').map(edge => ({ ...edge }));
    clipboard.referencePoint = screenToData(mousePos);
}

function handleCut() {
    const pointsToCutIds = [...selectedPointIds]; if (activeCenterId) { pointsToCutIds.push(activeCenterId); } if (pointsToCutIds.length === 0) { return; }
    saveStateForUndo();
    handleCopy();
    allEdges = allEdges.filter(edge => !pointsToCutIds.includes(edge.id1) || !pointsToCutIds.includes(edge.id2));
    allPoints = allPoints.filter(point => !pointsToCutIds.includes(point.id));
    selectedPointIds = []; activeCenterId = null;
    if (previewLineStartPointId && !findPointById(previewLineStartPointId)) { isDrawingMode = false; previewLineStartPointId = null; }
    redrawAll();
}

function handlePaste() {
    if (clipboard.points.length === 0 || !clipboard.referencePoint) { return; }
    saveStateForUndo();
    const pastePos = screenToData(mousePos); const dX = pastePos.x - clipboard.referencePoint.x; const dY = pastePos.y - clipboard.referencePoint.y;
    const otnIdMap = new Map(); const nPRegularPIds = []; let nPACId = null;
    performEscapeAction();
    clipboard.points.forEach(cbP => {
        const nId = generateUniqueId(); const nP = { id: nId, x: cbP.x + dX, y: cbP.y + dY, type: cbP.type, color: cbP.color || currentColor };
        allPoints.push(nP); otnIdMap.set(cbP.id, nId);
        if (nP.type === 'regular') { nPRegularPIds.push(nId); }
        else if (nP.type !== 'regular') { nPACId = nId; }
    });
    clipboard.edges.forEach(cbE => { const nP1Id = otnIdMap.get(cbE.id1); const nP2Id = otnIdMap.get(cbE.id2); if (nP1Id && nP2Id) { allEdges.push({ id1: nP1Id, id2: nP2Id }); } });
    selectedPointIds = nPRegularPIds; activeCenterId = nPACId;
    redrawAll();
}

function drawPoint(point) {
    const isSelected = selectedPointIds.includes(point.id) || point.id === activeCenterId;
    const pointColor = point.color || currentColor;
    const screenPos = dataToScreen(point);

    if (point.type !== 'regular') {
        drawCenterSymbol(point);
    } else {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = pointColor;
        ctx.fill();
    }

    if (isSelected) {
        ctx.beginPath();
        const selectionRadius = point.type !== 'regular' ? CENTER_POINT_VISUAL_RADIUS + SELECTED_INDICATOR_OFFSET : POINT_RADIUS + SELECTED_INDICATOR_OFFSET;
        ctx.arc(screenPos.x, screenPos.y, selectionRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.setLineDash(DASH_PATTERN);
        ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.lineWidth = LINE_WIDTH;
}

function drawAllEdges() {
    ctx.lineWidth = LINE_WIDTH;
    allEdges.forEach(edge => {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
            let lineShouldBeDashed = false;
            const p1IsBeingDragged = dragPreviewPoints.find(dp => dp.id === p1.id);
            const p2IsBeingDragged = dragPreviewPoints.find(dp => dp.id === p2.id);
            if (isDragConfirmed && (p1IsBeingDragged || p2IsBeingDragged)) {
                lineShouldBeDashed = true;
            }

            ctx.beginPath();
            const p1Data = p1IsBeingDragged ? p1IsBeingDragged : p1;
            const p2Data = p2IsBeingDragged ? p2IsBeingDragged : p2;
            const p1Screen = dataToScreen(p1Data);
            const p2Screen = dataToScreen(p2Data);
            ctx.moveTo(p1Screen.x, p1Screen.y);
            ctx.lineTo(p2Screen.x, p2Screen.y);

            const color1 = p1.color || currentColor;
            const color2 = p2.color || currentColor;

            if (color1 === color2) {
                ctx.strokeStyle = color1;
            } else {
                const gradient = ctx.createLinearGradient(p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y);
                gradient.addColorStop(0, color1);
                gradient.addColorStop(1, color2);
                ctx.strokeStyle = gradient;
            }

            ctx.setLineDash(lineShouldBeDashed ? DASH_PATTERN : []);
            ctx.stroke();
        }
    });
    ctx.setLineDash([]);
    ctx.strokeStyle = 'white';
}

function redrawAll() {
    const acW = canvas.width / dpr; const acH = canvas.height / dpr;
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, acW, acH);

    let originalPointsBackup = null;
    if (isDragConfirmed && dragPreviewPoints.length > 0) {
        originalPointsBackup = allPoints.map(p => ({...p}));
        dragPreviewPoints.forEach(dp => {
            const actualPoint = allPoints.find(p => p.id === dp.id);
            if (actualPoint) { Object.assign(actualPoint, dp); }
        });
    }

    drawAllEdges();

    if (originalPointsBackup) {
        allPoints = originalPointsBackup;
    }

    const pointsToDraw = isDragConfirmed && dragPreviewPoints.length > 0 ?
        allPoints.map(p => dragPreviewPoints.find(dp => dp.id === p.id) || p)
        : allPoints;
    pointsToDraw.forEach(point => drawPoint(point));

    if (isDrawingMode && previewLineStartPointId && !isDragConfirmed && !isRectangleSelecting) {
        const sP = findPointById(previewLineStartPointId);
        if (sP) {
            const startScreen = dataToScreen(sP);
            ctx.beginPath(); ctx.moveTo(startScreen.x, startScreen.y); ctx.lineTo(mousePos.x, mousePos.y);
            ctx.setLineDash(DASH_PATTERN); ctx.strokeStyle = currentColor;
            ctx.stroke(); ctx.setLineDash([]);
        }
    }
    if (isRectangleSelecting && isDragConfirmed && currentMouseButton === 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.setLineDash(DASH_PATTERN);
        const rX = Math.min(rectangleSelectStartPos.x, mousePos.x); const rY = Math.min(rectangleSelectStartPos.y, mousePos.y);
        const rW = Math.abs(rectangleSelectStartPos.x - mousePos.x); const rH = Math.abs(rectangleSelectStartPos.y - mousePos.y);
        ctx.strokeRect(rX, rY, rW, rH); ctx.setLineDash([]); ctx.lineWidth = LINE_WIDTH;
    }
}

function deleteSelectedPoints() {
    const idsToDelete = [...selectedPointIds];
    if (activeCenterId) { idsToDelete.push(activeCenterId); }
    if (idsToDelete.length === 0) { return; }
    saveStateForUndo();
    allEdges = allEdges.filter(edge => !idsToDelete.includes(edge.id1) || !idsToDelete.includes(edge.id2));
    allPoints = allPoints.filter(point => !idsToDelete.includes(point.id));
    selectedPointIds = [];
    if (activeCenterId && idsToDelete.includes(activeCenterId)) { activeCenterId = null; }
    if (previewLineStartPointId && !findPointById(previewLineStartPointId)) {
        isDrawingMode = false; previewLineStartPointId = null;
    }
    redrawAll();
}

function performEscapeAction() {
    selectedPointIds = []; activeCenterId = null;
    isDrawingMode = false; previewLineStartPointId = null;
    isActionInProgress = false; isDragConfirmed = false; isRectangleSelecting = false; isTransformDrag = false; isPanningBackground = false;
    dragPreviewPoints = [];
    actionTargetPoint = null;
    currentMouseButton = -1; clickData = { pointId: null, count: 0, timestamp: 0 };
    canvas.style.cursor = 'crosshair'; redrawAll();
}

function getClosestPointOnLineSegment(p, a, b) {
    const abx = b.x - a.x; const aby = b.y - a.y;
    const acx = p.x - a.x; const acy = p.y - a.y;
    const lenSqAB = abx * abx + aby * aby;
    if (lenSqAB === 0) { return { x: a.x, y: a.y, distance: distance(p, a), onSegmentStrict: false }; }
    let t = (acx * abx + acy * aby) / lenSqAB;
    const onSegmentStrict = t > 0 && t < 1;
    t = Math.max(0, Math.min(1, t));
    const closestX = a.x + t * abx; const closestY = a.y + t * aby;
    const dist = distance(p, { x: closestX, y: closestY });
    return { x: closestX, y: closestY, distance: dist, onSegmentStrict: onSegmentStrict };
}

colorPicker.addEventListener('input', (event) => {
    setCurrentColor(event.target.value);
});

canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const mouseScreen = getMousePosOnCanvas(event);
    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
    zoomAt(mouseScreen, scaleFactor);
    redrawAll();
});

canvas.addEventListener('mousedown', (event) => {
    isActionInProgress = true; currentMouseButton = event.button;
    actionStartPos = getMousePosOnCanvas(event); mousePos = actionStartPos;
    isDragConfirmed = false; isRectangleSelecting = false; isTransformDrag = false; isPanningBackground = false;
    dragPreviewPoints = [];

    shiftKeyAtActionStart = event.shiftKey; ctrlKeyAtActionStart = event.ctrlKey || event.metaKey;

    if (currentMouseButton === 0) {
        actionTargetPoint = findClickedPoint(actionStartPos);
        if (actionTargetPoint) {
            canvas.style.cursor = 'grabbing';
            const activeCenterPoint = activeCenterId ? findPointById(activeCenterId) : null;
            if (activeCenterPoint && selectedPointIds.length > 0 &&
                (selectedPointIds.includes(actionTargetPoint.id) || actionTargetPoint.id === activeCenterId)) {
                isTransformDrag = true;
                initialCenterStateForTransform = { ...activeCenterPoint };
                initialStatesForTransform = selectedPointIds.map(id => {
                    const p = findPointById(id); if (!p) { return null; }
                    return {
                        id: p.id, x: p.x, y: p.y,
                        originalAngleToCenter: Math.atan2(p.y - activeCenterPoint.y, p.x - activeCenterPoint.x),
                        originalDistanceToCenter: distance(p, activeCenterPoint)
                    };
                }).filter(p => p);
                const dataStartPos = screenToData(actionStartPos);
                initialMouseAngleToCenter = Math.atan2(dataStartPos.y - activeCenterPoint.y, dataStartPos.x - activeCenterPoint.x);
                initialMouseDistanceToCenter = distance(dataStartPos, activeCenterPoint);
                dragPreviewPoints = initialStatesForTransform.map(p => ({ ...p, x: p.x, y: p.y }));
                 if (!dragPreviewPoints.find(p => p.id === activeCenterId) && activeCenterPoint) {
                    dragPreviewPoints.push({...activeCenterPoint, x: activeCenterPoint.x, y: activeCenterPoint.y});
                }

            } else {
                isTransformDrag = false;
                let pointsToConsiderForDrag = [];
                if (selectedPointIds.includes(actionTargetPoint.id) || actionTargetPoint.id === activeCenterId) {
                    pointsToConsiderForDrag = selectedPointIds.map(id => findPointById(id)).filter(p => p);
                    if (activeCenterId && !pointsToConsiderForDrag.find(p => p.id === activeCenterId)) {
                        const rc = findPointById(activeCenterId); if (rc) { pointsToConsiderForDrag.push(rc); }
                    }
                } else {
                    pointsToConsiderForDrag = [actionTargetPoint];
                }
                dragPreviewPoints = pointsToConsiderForDrag.map(p => ({ id: p.id, x: p.x, y: p.y, type: p.type, color: p.color }));
            }
        } else { 
            canvas.style.cursor = 'move';
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
        }
    } else if (currentMouseButton === 2) {
        event.preventDefault(); actionTargetPoint = null; dragPreviewPoints = [];
        rectangleSelectStartPos = actionStartPos; canvas.style.cursor = 'default';
    }
});

canvas.addEventListener('mousemove', (event) => {
    mousePos = getMousePosOnCanvas(event);
    if (!isActionInProgress) {
        if (isDrawingMode && previewLineStartPointId) { redrawAll(); }
        const hoveredPoint = findClickedPoint(mousePos);
        if (hoveredPoint) {
            canvas.style.cursor = 'grab';
        } else if (!isDrawingMode && !isRectangleSelecting) {
            canvas.style.cursor = 'crosshair';
        } else if (isRectangleSelecting) {
             canvas.style.cursor = 'default';
        }
        return;
    }
    
    if (!isDragConfirmed) {
        if (distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
            isDragConfirmed = true;
            if (currentMouseButton === 2 && !actionTargetPoint) {
                isRectangleSelecting = true; isDrawingMode = false; previewLineStartPointId = null;
                 canvas.style.cursor = 'default';
            } else if (currentMouseButton === 0 && actionTargetPoint) {
                isRectangleSelecting = false;
                canvas.style.cursor = 'grabbing';
            } else if (currentMouseButton === 0 && isPanningBackground) {
                canvas.style.cursor = 'move';
            }
        }
    }

    if (isDragConfirmed && currentMouseButton === 0 && isPanningBackground) {
        const deltaX = mousePos.x - actionStartPos.x;
        const deltaY = mousePos.y - actionStartPos.y;
        viewTransform.offsetX = backgroundPanStartOffset.x + deltaX;
        viewTransform.offsetY = backgroundPanStartOffset.y + deltaY;
        redrawAll();
        return;
    }

    if (isDragConfirmed && currentMouseButton === 0 && actionTargetPoint) {
        if (isTransformDrag && initialCenterStateForTransform) {
            const activeCenterCurrentPreview = dragPreviewPoints.find(p => p.id === activeCenterId);
            if (!activeCenterCurrentPreview) { isTransformDrag = false; return; }

            let currentCenterPosPreview = { x: initialCenterStateForTransform.x, y: initialCenterStateForTransform.y };
            if (actionTargetPoint.id === activeCenterId) {
                const deltaData = screenToData(mousePos);
                const startData = screenToData(actionStartPos);
                currentCenterPosPreview.x = initialCenterStateForTransform.x + (deltaData.x - startData.x);
                currentCenterPosPreview.y = initialCenterStateForTransform.y + (deltaData.y - startData.y);
                activeCenterCurrentPreview.x = currentCenterPosPreview.x;
                activeCenterCurrentPreview.y = currentCenterPosPreview.y;
            } else {
                currentCenterPosPreview = { x: activeCenterCurrentPreview.x, y: activeCenterCurrentPreview.y };
            }

            const centerDef = findPointById(activeCenterId);
            if (!centerDef) { isTransformDrag = false; return; }
            let doRotation = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_rotate_only';
            let doScaling = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_scale_only';

            let overallDeltaAngle = 0;
            let overallScaleFactor = 1;

            const mouseDataPos = screenToData(mousePos);
            const mouseVecX = mouseDataPos.x - currentCenterPosPreview.x;
            const mouseVecY = mouseDataPos.y - currentCenterPosPreview.y;
            const currentMouseAngleRelCenter = Math.atan2(mouseVecY, mouseVecX);
            const currentMouseDistRelCenter = Math.sqrt(mouseVecX * mouseVecX + mouseVecY * mouseVecY);

            if (doRotation) {
                overallDeltaAngle = currentMouseAngleRelCenter - initialMouseAngleToCenter;
            }
            if (doScaling) {
                if (initialMouseDistanceToCenter > 0.001) {
                    overallScaleFactor = currentMouseDistRelCenter / initialMouseDistanceToCenter;
                }
            }

            initialStatesForTransform.forEach(initialPtState => {
                const pointToUpdateInPreview = dragPreviewPoints.find(dp => dp.id === initialPtState.id);
                if (!pointToUpdateInPreview) { return; }
                let newX = initialPtState.x - initialCenterStateForTransform.x;
                let newY = initialPtState.y - initialCenterStateForTransform.y;
                if (doScaling) { newX *= overallScaleFactor; newY *= overallScaleFactor; }
                if (doRotation) {
                    const rX = newX * Math.cos(overallDeltaAngle) - newY * Math.sin(overallDeltaAngle);
                    const rY = newX * Math.sin(overallDeltaAngle) + newY * Math.cos(overallDeltaAngle);
                    newX = rX; newY = rY;
                }
                pointToUpdateInPreview.x = currentCenterPosPreview.x + newX;
                pointToUpdateInPreview.y = currentCenterPosPreview.y + newY;
            });

        } else if (dragPreviewPoints.length > 0 && !isTransformDrag) {
            const deltaData = screenToData(mousePos);
            const startData = screenToData(actionStartPos);
            const deltaX = deltaData.x - startData.x;
            const deltaY = deltaData.y - startData.y;

            dragPreviewPoints.forEach(dp => {
                const originalPointState = allPoints.find(p => p.id === dp.id);
                if (originalPointState) {
                    dp.x = originalPointState.x + deltaX;
                    dp.y = originalPointState.y + deltaY;
                }
            });
        }
    }
    redrawAll();
});

canvas.addEventListener('mouseup', (event) => {
    if (!isActionInProgress || event.button !== currentMouseButton) { return; }
    canvas.style.cursor = 'crosshair';

    if (isDragConfirmed) {
        if (isPanningBackground) {
            isPanningBackground = false;
        } else if (dragPreviewPoints.length > 0 && (currentMouseButton === 0 && actionTargetPoint)) {
            saveStateForUndo();
            dragPreviewPoints.forEach(dp => {
                const actualPoint = findPointById(dp.id);
                if (actualPoint) {
                    actualPoint.x = dp.x;
                    actualPoint.y = dp.y;
                }
            });
             if (!isTransformDrag && actionTargetPoint) {
                 if (!selectedPointIds.includes(actionTargetPoint.id) && actionTargetPoint.id !== activeCenterId) {
                    if (!shiftKeyAtActionStart && !ctrlKeyAtActionStart) {
                        selectedPointIds = [actionTargetPoint.id].filter(id => findPointById(id)?.type === 'regular');
                        activeCenterId = (actionTargetPoint.type !== 'regular') ? actionTargetPoint.id : null;
                    } else {
                        applySelectionLogic([actionTargetPoint.id], shiftKeyAtActionStart, ctrlKeyAtActionStart, actionTargetPoint.type !== 'regular');
                    }
                 }
            }

        } else if (currentMouseButton === 2 && isRectangleSelecting) {
        const rX = Math.min(rectangleSelectStartPos.x, mousePos.x);
        const rY = Math.min(rectangleSelectStartPos.y, mousePos.y);
        const rW = Math.abs(rectangleSelectStartPos.x - mousePos.x);
        const rH = Math.abs(rectangleSelectStartPos.y - mousePos.y);

        const rectStartData = screenToData({ x: rX, y: rY });
        const rectEndData = screenToData({ x: rX + rW, y: rY + rH });
        const minX = Math.min(rectStartData.x, rectEndData.x);
        const maxX = Math.max(rectStartData.x, rectEndData.x);
        const minY = Math.min(rectStartData.y, rectEndData.y);
        const maxY = Math.max(rectStartData.y, rectEndData.y);

        const pointsInRect = allPoints.filter(p => 
            p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
        );
        const regularPointIdsInRect = pointsInRect.filter(p => p.type === 'regular').map(p => p.id);
        const centerPointsInRect = pointsInRect.filter(p => p.type !== 'regular');

        if (shiftKeyAtActionStart) {
            selectedPointIds = [...new Set([...selectedPointIds, ...regularPointIdsInRect])];
            if (centerPointsInRect.length > 0) {
                activeCenterId = centerPointsInRect[centerPointsInRect.length - 1].id;
            }
        } else if (ctrlKeyAtActionStart) {
            regularPointIdsInRect.forEach(id => {
                const index = selectedPointIds.indexOf(id);
                if (index > -1) selectedPointIds.splice(index, 1);
                else selectedPointIds.push(id);
            });
            if (centerPointsInRect.length > 0) {
                const lastCenterInRectId = centerPointsInRect[centerPointsInRect.length - 1].id;
                if (activeCenterId === lastCenterInRectId) {
                    activeCenterId = null;
                } else {
                    activeCenterId = lastCenterInRectId;
                }
            }
        } else {
            selectedPointIds = regularPointIdsInRect;
            activeCenterId = null;
        }
        isDrawingMode = false; 
        previewLineStartPointId = null;
    }

    } else if (currentMouseButton === 0) {
        if (actionTargetPoint) {
            const cPO = actionTargetPoint;
            if (isDrawingMode && previewLineStartPointId && cPO.type === 'regular') {
                saveStateForUndo();
                if (previewLineStartPointId !== cPO.id) { allEdges.push({ id1: previewLineStartPointId, id2: cPO.id }); }
                previewLineStartPointId = cPO.id;
            } else if (isDrawingMode && previewLineStartPointId && cPO.type !== 'regular') {
                saveStateForUndo();
                activeCenterId = cPO.id; isDrawingMode = false; previewLineStartPointId = null;
                if (!shiftKeyAtActionStart && !ctrlKeyAtActionStart) { selectedPointIds = []; }
            } else {
                const cT = Date.now();
                if (cPO.id === clickData.pointId && cT - clickData.timestamp < DOUBLE_CLICK_MS && cPO.type === 'regular') {
                    clickData.count++;
                } else {
                    clickData.count = 1; clickData.pointId = cPO.id;
                }
                clickData.timestamp = cT;
                let pIdsForSel = []; let selActTaken = false; let targetIsCenter = cPO.type !== 'regular';
                if (targetIsCenter) { pIdsForSel = [cPO.id]; selActTaken = true; }
                else if (clickData.count === 3) { pIdsForSel = findAllPointsInSubgraph(cPO.id); clickData.count = 0; selActTaken = true; }
                else if (clickData.count === 2) { pIdsForSel = [cPO.id, ...findNeighbors(cPO.id)]; selActTaken = true; }
                else if (clickData.count === 1) { pIdsForSel = [cPO.id]; selActTaken = true; }

                if (selActTaken) {
                    applySelectionLogic(pIdsForSel, shiftKeyAtActionStart, ctrlKeyAtActionStart, targetIsCenter);
                    if (!targetIsCenter || (targetIsCenter && !shiftKeyAtActionStart && !ctrlKeyAtActionStart)) {
                        isDrawingMode = false; previewLineStartPointId = null;
                    }
                }
            }
        } else {
            const cT = Date.now();
            if (cT - lastCanvasClickTime < DOUBLE_CLICK_MS) { performEscapeAction(); }
            else {
                if (!shiftKeyAtActionStart && !ctrlKeyAtActionStart) {
                    if (isDrawingMode && previewLineStartPointId) {
                        const mouseDataPos = screenToData(mousePos);
                        let edgeSplitOccurred = false;
                        for (let i = 0; i < allEdges.length; i++) {
                            const edge = allEdges[i];
                            const p1 = findPointById(edge.id1);
                            const p2 = findPointById(edge.id2);
                            if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
                                const closest = getClosestPointOnLineSegment(mouseDataPos, p1, p2);
                                if (closest.distance < EDGE_CLICK_THRESHOLD / viewTransform.scale && closest.onSegmentStrict) {
                                    saveStateForUndo();
                                    const newPointOnEdge = { id: generateUniqueId(), x: closest.x, y: closest.y, type: 'regular', color: currentColor };
                                    allPoints.push(newPointOnEdge);
                                    allEdges.splice(i, 1);
                                    allEdges.push({ id1: p1.id, id2: newPointOnEdge.id });
                                    allEdges.push({ id1: newPointOnEdge.id, id2: p2.id });
                                    allEdges.push({ id1: previewLineStartPointId, id2: newPointOnEdge.id });
                                    previewLineStartPointId = newPointOnEdge.id;
                                    edgeSplitOccurred = true;
                                    break;
                                }
                            }
                        }
                        if (!edgeSplitOccurred) {
                            saveStateForUndo();
                            const nP = { id: generateUniqueId(), x: mouseDataPos.x, y: mouseDataPos.y, type: 'regular', color: currentColor };
                            allPoints.push(nP); allEdges.push({ id1: previewLineStartPointId, id2: nP.id });
                            previewLineStartPointId = nP.id;
                        }
                    } else if (!isDrawingMode && (selectedPointIds.length > 0 || activeCenterId)) { performEscapeAction(); }
                    else if (!isDrawingMode && selectedPointIds.length === 0 && !activeCenterId) {
                        saveStateForUndo();
                        selectedPointIds = []; activeCenterId = null;
                        const mouseDataPos = screenToData(mousePos);
                        const nP = { id: generateUniqueId(), x: mouseDataPos.x, y: mouseDataPos.y, type: 'regular', color: currentColor };
                        allPoints.push(nP); previewLineStartPointId = nP.id; isDrawingMode = true;
                    }
                }
            }
            lastCanvasClickTime = cT;
        }
    } else if (currentMouseButton === 2 && !isDragConfirmed) {
        performEscapeAction();
    }

    isActionInProgress = false; isDragConfirmed = false; isRectangleSelecting = false; isTransformDrag = false; isPanningBackground = false;
    actionTargetPoint = null; dragPreviewPoints = [];
    currentMouseButton = -1;
    redrawAll();
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

window.addEventListener('keydown', (event) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    if (isActionInProgress && !['Shift', 'Control', 'Meta', 'Alt', 'Escape'].includes(event.key)) { return; }

    if (event.key === 'Escape') { performEscapeAction(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { deleteSelectedPoints(); }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'c') { event.preventDefault(); handleCopy(); }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'x') { event.preventDefault(); handleCut(); }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'v') { event.preventDefault(); handlePaste(); }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'z') { event.preventDefault(); handleUndo(); }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'y') { event.preventDefault(); handleRedo(); }
    else if (isCtrlOrCmd && event.key === '=') {
        event.preventDefault();
        const centerScreen = { x: canvas.width / (2 * dpr), y: canvas.height / (2 * dpr) };
        zoomAt(centerScreen, 1.1);
        redrawAll();
    }
    else if (isCtrlOrCmd && event.key === '-') {
        event.preventDefault();
        const centerScreen = { x: canvas.width / (2 * dpr), y: canvas.height / (2 * dpr) };
        zoomAt(centerScreen, 0.9);
        redrawAll();
    }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectedPointIds = allPoints.filter(p => p.type === 'regular').map(p => p.id);
        if (!activeCenterId) {
            const firstCenter = allPoints.find(p => p.type !== 'regular');
            if (firstCenter) { activeCenterId = firstCenter.id; }
        }
        isDrawingMode = false; previewLineStartPointId = null;
        clickData = { pointId: null, count: 0, timestamp: 0 };
        redrawAll();
    } else if (['c', 'r', 's'].includes(event.key.toLowerCase()) && !isCtrlOrCmd && !isActionInProgress) {
        event.preventDefault();
        saveStateForUndo();
        performEscapeAction();
        let type;
        if (event.key.toLowerCase() === 'c') { type = 'center_rotate_scale'; }
        else if (event.key.toLowerCase() === 'r') { type = 'center_rotate_only'; }
        else if (event.key.toLowerCase() === 's') { type = 'center_scale_only'; }

        const mouseDataPos = screenToData(mousePos);
        const newCenter = { id: generateUniqueId(), x: mouseDataPos.x, y: mouseDataPos.y, type: type, color: currentColor };
        allPoints.push(newCenter);
        activeCenterId = newCenter.id;
        redrawAll();
    }
});

window.addEventListener('resize', resizeCanvas);

resizeCanvas();
updateColorPalette();
saveStateForUndo();