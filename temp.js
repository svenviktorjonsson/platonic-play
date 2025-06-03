const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_FACTOR = 1.1;

let viewOffset = { x: 0, y: 0 };
let viewScale = 1;
let isPanning = false;
let panStartPos = { x: 0, y: 0 };
let panStartOffset = { x: 0, y: 0 };

function getMousePosOnCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    return {
        x: (rawX - viewOffset.x) / viewScale,
        y: (rawY - viewOffset.y) / viewScale
    };
}

function screenToWorld(pos) {
    return {
        x: (pos.x - viewOffset.x) / viewScale,
        y: (pos.y - viewOffset.y) / viewScale
    };
}

function worldToScreen(pos) {
    return {
        x: pos.x * viewScale + viewOffset.x,
        y: pos.y * viewScale + viewOffset.y
    };
}

function zoomAtPoint(zoomFactor, screenPoint) {
    const worldPointBefore = screenToWorld(screenPoint);
    viewScale *= zoomFactor;
    viewScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewScale));
    
    const worldPointAfter = screenToWorld(screenPoint);
    viewOffset.x += (worldPointAfter.x - worldPointBefore.x) * viewScale;
    viewOffset.y += (worldPointAfter.y - worldPointBefore.y) * viewScale;
    
    redrawAll();
}

function resizeCanvas() {
    const canvasContainer = document.querySelector('.canvas-container');
    const cW = canvasContainer.offsetWidth;
    const cH = canvasContainer.offsetHeight;
    
    canvas.width = cW * dpr;
    canvas.height = cH * dpr;
    canvas.style.width = `${cW}px`;
    canvas.style.height = `${cH}px`;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    redrawAll();
}

function redrawAll() {
    const acW = canvas.width / dpr;
    const acH = canvas.height / dpr;
    
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, acW, acH);
    
    ctx.translate(viewOffset.x, viewOffset.y);
    ctx.scale(viewScale, viewScale);
    
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
            ctx.beginPath();
            ctx.moveTo(sP.x, sP.y);
            ctx.lineTo(mousePos.x, mousePos.y);
            ctx.setLineDash(DASH_PATTERN);
            ctx.strokeStyle = currentColor;
            ctx.stroke();
            ctx.setLineDash([]);
        }
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
    
    ctx.restore();
}

function drawPoint(point) {
    const isSelected = selectedPointIds.includes(point.id) || point.id === activeCenterId;
    const pointColor = point.color || currentColor;

    ctx.save();
    ctx.translate(viewOffset.x, viewOffset.y);
    ctx.scale(viewScale, viewScale);

    if (point.type !== 'regular') {
        drawCenterSymbol(point);
    } else {
        ctx.beginPath();
        ctx.arc(point.x, point.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = pointColor;
        ctx.fill();
    }

    if (isSelected) {
        ctx.beginPath();
        const selectionRadius = point.type !== 'regular' ? 
            CENTER_POINT_VISUAL_RADIUS + SELECTED_INDICATOR_OFFSET : 
            POINT_RADIUS + SELECTED_INDICATOR_OFFSET;
        ctx.arc(point.x, point.y, selectionRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.setLineDash(DASH_PATTERN);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    ctx.restore();
    ctx.lineWidth = LINE_WIDTH;
}

canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const mousePos = { x: event.clientX, y: event.clientY };
    const zoomFactor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    zoomAtPoint(zoomFactor, mousePos);
});

canvas.addEventListener('mousedown', (event) => {
    if (event.button === 1 || (event.button === 0 && (event.ctrlKey || event.metaKey))) {
        isPanning = true;
        panStartPos = { x: event.clientX, y: event.clientY };
        panStartOffset = { ...viewOffset };
        canvas.style.cursor = 'grabbing';
        return;
    }

    isActionInProgress = true;
    currentMouseButton = event.button;
    actionStartPos = getMousePosOnCanvas(event);
    mousePos = actionStartPos;
    isDragConfirmed = false;
    isRectangleSelecting = false;
    isTransformDrag = false;
    dragPreviewPoints = [];

    shiftKeyAtActionStart = event.shiftKey;
    ctrlKeyAtActionStart = event.ctrlKey || event.metaKey;

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
                    const p = findPointById(id);
                    if (!p) return null;
                    return {
                        id: p.id,
                        x: p.x,
                        y: p.y,
                        originalAngleToCenter: Math.atan2(p.y - activeCenterPoint.y, p.x - activeCenterPoint.x),
                        originalDistanceToCenter: distance(p, activeCenterPoint)
                    };
                }).filter(p => p);
                initialMouseAngleToCenter = Math.atan2(actionStartPos.y - activeCenterPoint.y, actionStartPos.x - activeCenterPoint.x);
                initialMouseDistanceToCenter = distance(actionStartPos, activeCenterPoint);
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
                        const rc = findPointById(activeCenterId);
                        if (rc) pointsToConsiderForDrag.push(rc);
                    }
                } else {
                    pointsToConsiderForDrag = [actionTargetPoint];
                }
                dragPreviewPoints = pointsToConsiderForDrag.map(p => ({ id: p.id, x: p.x, y: p.y, type: p.type, color: p.color }));
            }
        } else {
            canvas.style.cursor = 'crosshair';
        }
    } else if (currentMouseButton === 2) {
        event.preventDefault();
        actionTargetPoint = null;
        dragPreviewPoints = [];
        rectangleSelectStartPos = actionStartPos;
        canvas.style.cursor = 'default';
    }
});

canvas.addEventListener('mousemove', (event) => {
    if (isPanning) {
        viewOffset.x = panStartOffset.x + (event.clientX - panStartPos.x);
        viewOffset.y = panStartOffset.y + (event.clientY - panStartPos.y);
        redrawAll();
        return;
    }

    mousePos = getMousePosOnCanvas(event);
    
    if (!isActionInProgress) {
        if (isDrawingMode && previewLineStartPointId) {
            redrawAll();
        }
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
                isRectangleSelecting = true;
                isDrawingMode = false;
                previewLineStartPointId = null;
                canvas.style.cursor = 'default';
            } else if (currentMouseButton === 0 && actionTargetPoint) {
                isRectangleSelecting = false;
                canvas.style.cursor = 'grabbing';
            }
        }
    }

    if (isDragConfirmed && currentMouseButton === 0 && actionTargetPoint) {
        if (isTransformDrag && initialCenterStateForTransform) {
            const activeCenterCurrentPreview = dragPreviewPoints.find(p => p.id === activeCenterId);
            if (!activeCenterCurrentPreview) {
                isTransformDrag = false;
                return;
            }

            let currentCenterPosPreview = { x: initialCenterStateForTransform.x, y: initialCenterStateForTransform.y };
            if (actionTargetPoint.id === activeCenterId) {
                currentCenterPosPreview.x = initialCenterStateForTransform.x + (mousePos.x - actionStartPos.x);
                currentCenterPosPreview.y = initialCenterStateForTransform.y + (mousePos.y - actionStartPos.y);
                activeCenterCurrentPreview.x = currentCenterPosPreview.x;
                activeCenterCurrentPreview.y = currentCenterPosPreview.y;
            } else {
                currentCenterPosPreview = { x: activeCenterCurrentPreview.x, y: activeCenterCurrentPreview.y };
            }

            const centerDef = findPointById(activeCenterId);
            if (!centerDef) {
                isTransformDrag = false;
                return;
            }
            let doRotation = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_rotate_only';
            let doScaling = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_scale_only';

            let overallDeltaAngle = 0;
            let overallScaleFactor = 1;

            const mouseVecX = mousePos.x - currentCenterPosPreview.x;
            const mouseVecY = mousePos.y - currentCenterPosPreview.y;
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
                if (!pointToUpdateInPreview) return;
                let newX = initialPtState.x - initialCenterStateForTransform.x;
                let newY = initialPtState.y - initialCenterStateForTransform.y;
                if (doScaling) {
                    newX *= overallScaleFactor;
                    newY *= overallScaleFactor;
                }
                if (doRotation) {
                    const rX = newX * Math.cos(overallDeltaAngle) - newY * Math.sin(overallDeltaAngle);
                    const rY = newX * Math.sin(overallDeltaAngle) + newY * Math.cos(overallDeltaAngle);
                    newX = rX;
                    newY = rY;
                }
                pointToUpdateInPreview.x = currentCenterPosPreview.x + newX;
                pointToUpdateInPreview.y = currentCenterPosPreview.y + newY;
            });
        } else if (dragPreviewPoints.length > 0 && !isTransformDrag) {
            const deltaX = mousePos.x - actionStartPos.x;
            const deltaY = mousePos.y - actionStartPos.y;

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
    if (isPanning && (event.button === 1 || event.button === 0)) {
        isPanning = false;
        canvas.style.cursor = 'crosshair';
        return;
    }

    if (!isActionInProgress || event.button !== currentMouseButton) return;
    canvas.style.cursor = 'crosshair';

    if (isDragConfirmed) {
        if (dragPreviewPoints.length > 0 && (currentMouseButton === 0 && actionTargetPoint)) {
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

            const pointsInRect = allPoints.filter(p => 
                p.x >= rX && p.x <= rX + rW && p.y >= rY && p.y <= rY + rH
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
                if (previewLineStartPointId !== cPO.id) {
                    allEdges.push({ id1: previewLineStartPointId, id2: cPO.id });
                }
                previewLineStartPointId = cPO.id;
            } else if (isDrawingMode && previewLineStartPointId && cPO.type !== 'regular') {
                saveStateForUndo();
                activeCenterId = cPO.id;
                isDrawingMode = false;
                previewLineStartPointId = null;
                if (!shiftKeyAtActionStart && !ctrlKeyAtActionStart) {
                    selectedPointIds = [];
                }
            } else {
                const cT = Date.now();
                if (cPO.id === clickData.pointId && cT - clickData.timestamp < DOUBLE_CLICK_MS && cPO.type === 'regular') {
                    clickData.count++;
                } else {
                    clickData.count = 1;
                    clickData.pointId = cPO.id;
                }
                clickData.timestamp = cT;
                let pIdsForSel = [];
                let selActTaken = false;
                let targetIsCenter = cPO.type !== 'regular';
                if (targetIsCenter) {
                    pIdsForSel = [cPO.id];
                    selActTaken = true;
                } else if (clickData.count === 3) {
                    pIdsForSel = findAllPointsInSubgraph(cPO.id);
                    clickData.count = 0;
                    selActTaken = true;
                } else if (clickData.count === 2) {
                    pIdsForSel = [cPO.id, ...findNeighbors(cPO.id)];
                    selActTaken = true;
                } else if (clickData.count === 1) {
                    pIdsForSel = [cPO.id];
                    selActTaken = true;
                }

                if (selActTaken) {
                    applySelectionLogic(pIdsForSel, shiftKeyAtActionStart, ctrlKeyAtActionStart, targetIsCenter);
                    if (!targetIsCenter || (targetIsCenter && !shiftKeyAtActionStart && !ctrlKeyAtActionStart)) {
                        isDrawingMode = false;
                        previewLineStartPointId = null;
                    }
                }
            }
        } else {
            const cT = Date.now();
            if (cT - lastCanvasClickTime < DOUBLE_CLICK_MS) {
                performEscapeAction();
            } else {
                if (!shiftKeyAtActionStart && !ctrlKeyAtActionStart) {
                    if (isDrawingMode && previewLineStartPointId) {
                        let edgeSplitOccurred = false;
                        for (let i = 0; i < allEdges.length; i++) {
                            const edge = allEdges[i];
                            const p1 = findPointById(edge.id1);
                            const p2 = findPointById(edge.id2);
                            if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
                                const closest = getClosestPointOnLineSegment(mousePos, p1, p2);
                                if (closest.distance < EDGE_CLICK_THRESHOLD && closest.onSegmentStrict) {
                                    saveStateForUndo();
                                    const newPointOnEdge = {
                                        id: generateUniqueId(),
                                        x: closest.x,
                                        y: closest.y,
                                        type: 'regular',
                                        color: currentColor
                                    };
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
                            const nP = {
                                id: generateUniqueId(),
                                x: mousePos.x,
                                y: mousePos.y,
                                type: 'regular',
                                color: currentColor
                            };
                            allPoints.push(nP);
                            allEdges.push({ id1: previewLineStartPointId, id2: nP.id });
                            previewLineStartPointId = nP.id;
                        }
                    } else if (!isDrawingMode && (selectedPointIds.length > 0 || activeCenterId)) {
                        performEscapeAction();
                    } else if (!isDrawingMode && selectedPointIds.length === 0 && !activeCenterId) {
                        saveStateForUndo();
                        const nP = {
                            id: generateUniqueId(),
                            x: mousePos.x,
                            y: mousePos.y,
                            type: 'regular',
                            color: currentColor
                        };
                        allPoints.push(nP);
                        previewLineStartPointId = nP.id;
                        isDrawingMode = true;
                        selectedPointIds = [nP.id];
                    }
                }
            }
            lastCanvasClickTime = cT;
        }
    } else if (currentMouseButton === 2 && !isDragConfirmed) {
        performEscapeAction();
    }

    isActionInProgress = false;
    isDragConfirmed = false;
    isRectangleSelecting = false;
    isTransformDrag = false;
    actionTargetPoint = null;
    dragPreviewPoints = [];
    currentMouseButton = -1;
    redrawAll();
});

window.addEventListener('keydown', (event) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    
    if (isActionInProgress && !['Shift', 'Control', 'Meta', 'Alt', 'Escape'].includes(event.key)) return;

    if (isCtrlOrCmd) {
        const canvasRect = canvas.getBoundingClientRect();
        const center = {
            x: canvasRect.left + canvasRect.width / 2,
            y: canvasRect.top + canvasRect.height / 2
        };
        
        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomAtPoint(ZOOM_FACTOR, center);
            return;
        } else if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            zoomAtPoint(1 / ZOOM_FACTOR, center);
            return;
        } else if (event.key === '0') {
            event.preventDefault();
            viewOffset = { x: 0, y: 0 };
            viewScale = 1;
            redrawAll();
            return;
        }
    }

    if (event.key === 'Escape') performEscapeAction();
    else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelectedPoints();
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        handleCopy();
    }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        handleCut();
    }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        handlePaste();
    }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        handleUndo();
    }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
    }
    else if (isCtrlOrCmd && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectedPointIds = allPoints.filter(p => p.type === 'regular').map(p => p.id);
        if (!activeCenterId) {
            const firstCenter = allPoints.find(p => p.type !== 'regular');
            if (firstCenter) activeCenterId = firstCenter.id;
        }
        isDrawingMode = false;
        previewLineStartPointId = null;
        clickData = { pointId: null, count: 0, timestamp: 0 };
        redrawAll();
    } else if (['c', 'r', 's'].includes(event.key.toLowerCase()) && !isCtrlOrCmd && !isActionInProgress) {
        event.preventDefault();
        saveStateForUndo();
        performEscapeAction();
        let type;
        if (event.key.toLowerCase() === 'c') type = 'center_rotate_scale';
        else if (event.key.toLowerCase() === 'r') type = 'center_rotate_only';
        else if (event.key.toLowerCase() === 's') type = 'center_scale_only';

        const newCenter = {
            id: generateUniqueId(),
            x: mousePos.x,
            y: mousePos.y,
            type: type,
            color: currentColor
        };
        allPoints.push(newCenter);
        activeCenterId = newCenter.id;
        redrawAll();
    }
});