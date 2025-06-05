let selectedEdgeIds = [];

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
    return edge.id1 < edge.id2 ? `${edge.id1}-${edge.id2}` : `${edge.id2}-${edge.id1}`;
}

function findNeighborEdges(pointId) {
    return allEdges.filter(e => e.id1 === pointId || e.id2 === pointId);
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
        
        let p1_render = p1_orig;
        let p2_render = p2_orig;
        let lineShouldBeDashed = false;
        
        if (isDragConfirmed && dragPreviewPoints.length > 0) {
            const p1Preview = dragPreviewPoints.find(dp => dp.id === p1_orig.id);
            const p2Preview = dragPreviewPoints.find(dp => dp.id === p2_orig.id);
            if (p1Preview) p1_render = p1Preview;
            if (p2Preview) p2_render = p2Preview;
            if (p1Preview || p2Preview) lineShouldBeDashed = true;
        }
        
        const p1Screen = dataToScreen(p1_render);
        const p2Screen = dataToScreen(p2_render);
        
        const edgeId = getEdgeId(edge);
        const isSelected = selectedEdgeIds.includes(edgeId);
        
        if (isSelected) {
            ctx.save();
            ctx.shadowColor = '#4da6ff';
            ctx.shadowBlur = 10;
            ctx.globalAlpha = 0.6;
            
            ctx.beginPath();
            ctx.moveTo(p1Screen.x, p1Screen.y);
            ctx.lineTo(p2Screen.x, p2Screen.y);
            ctx.strokeStyle = '#4da6ff';
            ctx.lineWidth = LINE_WIDTH + 4;
            ctx.stroke();
            
            ctx.restore();
        }
        
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
        
        ctx.setLineDash(lineShouldBeDashed ? DASH_PATTERN : []);
        ctx.stroke();
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

canvas.addEventListener('mouseup', (event) => {
    if (!isActionInProgress || event.button !== currentMouseButton) return;
    
    if (isDragConfirmed) {
        if (isPanningBackground) {
            isPanningBackground = false;
        } else if (dragPreviewPoints.length > 0 && currentMouseButton === 0 && actionTargetPoint) {
            saveStateForUndo();
            dragPreviewPoints.forEach(dp => {
                const actualPoint = findPointById(dp.id);
                if (actualPoint) {
                    actualPoint.x = dp.x;
                    actualPoint.y = dp.y;
                }
            });
            
            if (!isTransformDrag && !selectedPointIds.includes(actionTargetPoint.id) && actionTargetPoint.id !== activeCenterId) {
                if (!shiftKeyAtActionStart && !ctrlKeyAtActionStart) {
                    selectedPointIds = (actionTargetPoint.type === 'regular') ? [actionTargetPoint.id] : [];
                    selectedEdgeIds = [];
                    activeCenterId = (actionTargetPoint.type !== 'regular') ? actionTargetPoint.id : null;
                    if (selectedPointIds.length > 0 || activeCenterId) {
                        isDrawingMode = false;
                        previewLineStartPointId = null;
                        frozenReference_A_rad = null;
                        frozenReference_A_baseRad = null;
                        frozenReference_D_du = null;
                        frozenReference_Origin_Data = null;
                    }
                }
            }
        } else if (currentMouseButton === 2 && isRectangleSelecting) {
            const rX1 = rectangleSelectStartPos.x;
            const rY1 = rectangleSelectStartPos.y;
            const rX2 = mousePos.x;
            const rY2 = mousePos.y;
            const dataP1 = screenToData({ x: Math.min(rX1, rX2), y: Math.min(rY1, rY2) });
            const dataP2 = screenToData({ x: Math.max(rX1, rX2), y: Math.max(rY1, rY2) });
            const minX = Math.min(dataP1.x, dataP2.x);
            const maxX = Math.max(dataP1.x, dataP2.x);
            const minY = Math.min(dataP1.y, dataP2.y);
            const maxY = Math.max(dataP1.y, dataP2.y);
            
            const pointsInRect = allPoints.filter(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
            const regularPointIdsInRect = pointsInRect.filter(p => p.type === 'regular').map(p => p.id);
            const centerPointsInRect = pointsInRect.filter(p => p.type !== 'regular');
            
            const edgesInRect = allEdges.filter(edge => {
                const p1 = findPointById(edge.id1);
                const p2 = findPointById(edge.id2);
                return p1 && p2 && 
                       p1.x >= minX && p1.x <= maxX && p1.y >= minY && p1.y <= maxY &&
                       p2.x >= minX && p2.x <= maxX && p2.y >= minY && p2.y <= maxY;
            }).map(edge => getEdgeId(edge));
            
            applySelectionLogic(regularPointIdsInRect, edgesInRect, shiftKeyAtActionStart, ctrlKeyAtActionStart, false);
            
            if (centerPointsInRect.length > 0) {
                applySelectionLogic([centerPointsInRect[centerPointsInRect.length-1].id], [], shiftKeyAtActionStart, ctrlKeyAtActionStart, true);
            }
            
            isDrawingMode = false;
            previewLineStartPointId = null;
            frozenReference_A_rad = null;
            frozenReference_A_baseRad = null;
            frozenReference_D_du = null;
            frozenReference_Origin_Data = null;
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
                                frozenReference_A_baseRad = 0;
                                frozenReference_A_rad = normalizeAngle(committedSegmentAbsoluteAngle);
                            } else {
                                frozenReference_A_baseRad = contextBeforeCommit.offsetAngleRad;
                                frozenReference_A_rad = normalizeAngleToPi(committedSegmentAbsoluteAngle - contextBeforeCommit.offsetAngleRad);
                            }
                        }
                        allEdges.push({ id1: previewLineStartPointId, id2: actionTargetPoint.id });
                        previewLineStartPointId = actionTargetPoint.id;
                    } else if (actionTargetPoint.type !== 'regular') {
                        applySelectionLogic([actionTargetPoint.id], [], shiftKeyAtActionStart, ctrlKeyAtActionStart, true);
                        performEscapeAction();
                    }
                } else {
                    const now = Date.now();
                    let pointsForSelection = [actionTargetPoint.id];
                    let edgesForSelection = [];
                    const isCenterTarget = actionTargetPoint.type !== 'regular';
                    
                    if (actionTargetPoint.id === clickData.pointId && (now - clickData.timestamp < DOUBLE_CLICK_MS)) {
                        clickData.count++;
                    } else {
                        clickData.count = 1;
                        clickData.pointId = actionTargetPoint.id;
                    }
                    clickData.timestamp = now;
                    
                    if (!isCenterTarget) {
                        if (clickData.count === 3) {
                            pointsForSelection = findAllPointsInSubgraph(actionTargetPoint.id);
                            edgesForSelection = allEdges.filter(edge => 
                                pointsForSelection.includes(edge.id1) && pointsForSelection.includes(edge.id2)
                            ).map(edge => getEdgeId(edge));
                            clickData.count = 0;
                        } else if (clickData.count === 2) {
                            const neighbors = findNeighbors(actionTargetPoint.id);
                            pointsForSelection = [actionTargetPoint.id, ...neighbors];
                            edgesForSelection = findNeighborEdges(actionTargetPoint.id).map(edge => getEdgeId(edge));
                        }
                    }
                    
                    applySelectionLogic(pointsForSelection, edgesForSelection, shiftKeyAtActionStart, ctrlKeyAtActionStart, isCenterTarget);
                    
                    if (selectedPointIds.length > 0 || selectedEdgeIds.length > 0 || activeCenterId) {
                        isDrawingMode = false;
                        previewLineStartPointId = null;
                        frozenReference_A_rad = null;
                        frozenReference_A_baseRad = null;
                        frozenReference_D_du = null;
                        frozenReference_Origin_Data = null;
                    }
                }
            } else {
                const clickedEdge = findClickedEdge(actionStartPos);
                if (clickedEdge) {
                    const now = Date.now();
                    const edgeId = getEdgeId(clickedEdge);
                    let pointsForSelection = [];
                    let edgesForSelection = [edgeId];
                    
                    if (clickData.pointId === edgeId && (now - clickData.timestamp < DOUBLE_CLICK_MS)) {
                        clickData.count++;
                    } else {
                        clickData.count = 1;
                        clickData.pointId = edgeId;
                    }
                    clickData.timestamp = now;
                    
                    if (clickData.count === 3) {
                        const p1 = findPointById(clickedEdge.id1);
                        const p2 = findPointById(clickedEdge.id2);
                        if (p1 && p2) {
                            pointsForSelection = findAllPointsInSubgraph(p1.id);
                            edgesForSelection = allEdges.filter(edge => 
                                pointsForSelection.includes(edge.id1) && pointsForSelection.includes(edge.id2)
                            ).map(edge => getEdgeId(edge));
                        }
                        clickData.count = 0;
                    } else if (clickData.count === 2) {
                        const p1 = findPointById(clickedEdge.id1);
                        const p2 = findPointById(clickedEdge.id2);
                        if (p1 && p2) {
                            const neighbors1 = findNeighbors(p1.id);
                            const neighbors2 = findNeighbors(p2.id);
                            pointsForSelection = [p1.id, p2.id, ...neighbors1, ...neighbors2];
                            edgesForSelection = [
                                ...findNeighborEdges(p1.id).map(edge => getEdgeId(edge)),
                                ...findNeighborEdges(p2.id).map(edge => getEdgeId(edge))
                            ];
                            edgesForSelection = [...new Set(edgesForSelection)];
                        }
                    }
                    
                    applySelectionLogic(pointsForSelection, edgesForSelection, shiftKeyAtActionStart, ctrlKeyAtActionStart, false);
                    
                    if (selectedPointIds.length > 0 || selectedEdgeIds.length > 0) {
                        isDrawingMode = false;
                        previewLineStartPointId = null;
                        frozenReference_A_rad = null;
                        frozenReference_A_baseRad = null;
                        frozenReference_D_du = null;
                        frozenReference_Origin_Data = null;
                    }
                } else {
                    const now = Date.now();
                    if (now - lastCanvasClickTime < DOUBLE_CLICK_MS && !shiftKeyAtActionStart && !ctrlKeyAtActionStart) {
                        performEscapeAction();
                    } else {
                        if (isDrawingMode && previewLineStartPointId) {
                            saveStateForUndo();
                            const startPoint = findPointById(previewLineStartPointId);
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
                                    frozenReference_A_baseRad = 0;
                                    frozenReference_A_rad = normalizeAngle(committedSegmentAbsoluteAngle);
                                } else {
                                    frozenReference_A_baseRad = drawingContext.offsetAngleRad;
                                    frozenReference_A_rad = normalizeAngleToPi(committedSegmentAbsoluteAngle - drawingContext.offsetAngleRad);
                                }
                            }
                            
                            allEdges.push({ id1: previewLineStartPointId, id2: newPoint.id });
                            previewLineStartPointId = newPoint.id;
                        } else if (!isDrawingMode && !ctrlKeyAtActionStart) {
                            if (!shiftKeyAtActionStart && (selectedPointIds.length > 0 || selectedEdgeIds.length > 0 || activeCenterId)) {
                                performEscapeAction();
                            } else {
                                saveStateForUndo();
                                const mouseDataPos = screenToData(mousePos);
                                const newPoint = { id: generateUniqueId(), x: mouseDataPos.x, y: mouseDataPos.y, type: 'regular', color: currentColor };
                                allPoints.push(newPoint);
                                previewLineStartPointId = newPoint.id;
                                isDrawingMode = true;
                                selectedPointIds = [];
                                selectedEdgeIds = [];
                                activeCenterId = null;
                                frozenReference_A_rad = null;
                                frozenReference_A_baseRad = null;
                                frozenReference_D_du = null;
                                frozenReference_Origin_Data = null;
                            }
                        }
                    }
                    lastCanvasClickTime = now;
                }
            }
        } else if (currentMouseButton === 2) {
            performEscapeAction();
        }
    }
    
    isActionInProgress = false;
    isDragConfirmed = false;
    isRectangleSelecting = false;
    isTransformDrag = false;
    isPanningBackground = false;
    actionTargetPoint = null;
    dragPreviewPoints = [];
    currentMouseButton = -1;
    redrawAll();
});

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
