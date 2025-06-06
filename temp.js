

// --- Modified drawReferenceElementsGeometry function (remains unchanged from previous correct version) ---


// --- Modified prepareSnapInfoTexts function ---


// --- Modified mouseup event listener (remains unchanged from previous correct version) ---
canvas.addEventListener('mouseup', (event) => {
    if (!isActionInProgress) return;

    if (isDragConfirmed) {
        if (isRectangleSelecting) {
            const dataP1 = screenToData({ x: Math.min(actionStartPos.x, mousePos.x), y: Math.min(actionStartPos.y, mousePos.y) });
            const dataP2 = screenToData({ x: Math.max(actionStartPos.x, mousePos.x), y: Math.max(actionStartPos.y, mousePos.y) });
            const minX = Math.min(dataP1.x, dataP2.x), maxX = Math.max(dataP1.x, dataP2.x);
            const minY = Math.min(dataP1.y, dataP2.y), maxY = Math.max(dataP1.y, dataP2.y);
            const pointsInRect = allPoints.filter(p => p.type === 'regular' && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY).map(p => p.id);
            const edgesInRect = allEdges.filter(edge => pointsInRect.includes(edge.id1) && pointsInRect.includes(edge.id2)).map(edge => getEdgeId(edge));
            applySelectionLogic(pointsInRect, edgesInRect, actionContext.shiftKey, actionContext.ctrlKey, false);
        } else if (dragPreviewPoints.length > 0) {
            saveStateForUndo();
            dragPreviewPoints.forEach(dp => {
                const actualPoint = findPointById(dp.id);
                if (actualPoint) {
                    actualPoint.x = dp.x;
                    actualPoint.y = dp.y;
                }
            });
        }
    } else {
        if (currentMouseButton === 2) {
            performEscapeAction();
        } else if (currentMouseButton === 0) {
            const { targetPoint, targetEdge, shiftKey, ctrlKey } = actionContext;
            const startPoint = findPointById(previewLineStartPointId);
            const drawingContextForCompletedSegment = getDrawingContext(startPoint ? startPoint.id : null); 

            if (isDrawingMode && startPoint) {
                saveStateForUndo();
                let newPoint = null;
                let snappedDataForCompletedSegment = null; 

                if (targetPoint && targetPoint.type === 'regular' && targetPoint.id !== startPoint.id) {
                    const edgeExists = allEdges.some(e => (e.id1 === startPoint.id && e.id2 === targetPoint.id) || (e.id2 === startPoint.id && e.id1 === targetPoint.id));
                    if (!edgeExists) {
                        allEdges.push({ id1: startPoint.id, id2: targetPoint.id });
                    }
                    newPoint = targetPoint;
                    snappedDataForCompletedSegment = getSnappedPosition(startPoint, dataToScreen(newPoint), shiftKey); 
                } else if (targetEdge) {
                    const p1 = findPointById(targetEdge.id1);
                    const p2 = findPointById(targetEdge.id2);
                    if (p1 && p2) {
                        const closest = getClosestPointOnLineSegment(screenToData(mousePos), p1, p2);
                        newPoint = { id: generateUniqueId(), x: closest.x, y: closest.y, type: 'regular', color: currentColor };
                        allPoints.push(newPoint);
                        allEdges = allEdges.filter(e => getEdgeId(e) !== getEdgeId(targetEdge));
                        allEdges.push({ id1: p1.id, id2: newPoint.id });
                        allEdges.push({ id1: p2.id, id2: newPoint.id });
                        allEdges.push({ id1: startPoint.id, id2: newPoint.id });
                        snappedDataForCompletedSegment = getSnappedPosition(startPoint, dataToScreen(newPoint), shiftKey);
                    }
                } else {
                    snappedDataForCompletedSegment = getSnappedPosition(startPoint, mousePos, shiftKey);
                    newPoint = { id: generateUniqueId(), x: snappedDataForCompletedSegment.x, y: snappedDataForCompletedSegment.y, type: 'regular', color: currentColor };
                    allPoints.push(newPoint);
                    allEdges.push({ id1: startPoint.id, id2: newPoint.id });
                }

                if (shiftKey && newPoint && snappedDataForCompletedSegment) {
                    frozenReference_D_du = snappedDataForCompletedSegment.distance;
                    frozenReference_Origin_Data = startPoint;

                    if (drawingContextForCompletedSegment.isFirstSegmentBeingDrawn) { 
                        frozenReference_A_rad = normalizeAngleToPi(snappedDataForCompletedSegment.angle * (Math.PI / 180)); 
                        frozenReference_A_baseRad = 0; 
                    } else {
                        frozenReference_A_rad = snappedDataForCompletedSegment.angleTurn; 
                        frozenReference_A_baseRad = drawingContextForCompletedSegment.offsetAngleRad; 
                    }
                } else {
                    frozenReference_D_du = null;
                    frozenReference_A_rad = null;
                    frozenReference_A_baseRad = null;
                    frozenReference_Origin_Data = null;
                }

                if (newPoint) { 
                    previewLineStartPointId = newPoint.id;
                } else { 
                    isDrawingMode = false;
                    previewLineStartPointId = null;
                }
                clickData.count = 0;

            } else {
                const now = Date.now();
                const target = targetPoint || targetEdge;

                if (target) {
                    const targetId = targetPoint ? targetPoint.id : getEdgeId(targetEdge);
                    const targetType = targetPoint ? 'point' : 'edge';

                    if (clickData.targetId === targetId && (now - clickData.timestamp) < DOUBLE_CLICK_MS) {
                        clickData.count++;
                    } else {
                        clickData.count = 1;
                        clickData.targetId = targetId;
                        clickData.type = targetType;
                    }
                    clickData.timestamp = now;

                    switch (clickData.count) {
                        case 1:
                            if (targetPoint) { applySelectionLogic([targetPoint.id], [], shiftKey, ctrlKey, targetPoint.type !== 'regular'); } else { applySelectionLogic([], [getEdgeId(targetEdge)], shiftKey, ctrlKey, false); }
                            break;
                        case 2:
                            if (clickData.type === 'point') {
                                const neighbors = findNeighbors(clickData.targetId);
                                applySelectionLogic([clickData.targetId, ...neighbors], [], false, false);
                            } else {
                                const edge = allEdges.find(e => getEdgeId(e) === clickData.targetId);
                                if (edge) {
                                    const edges = new Set([...findNeighborEdges(edge.id1), ...findNeighborEdges(edge.id2)]);
                                    applySelectionLogic([], Array.from(edges).map(e => getEdgeId(e)), false, false);
                                }
                            }
                            break;
                        case 3:
                            if (clickData.type === 'point') {
                                const pointsInSubgraph = findAllPointsInSubgraph(clickData.targetId);
                                applySelectionLogic(pointsInSubgraph, [], false, false);
                            } else {
                                const edge = allEdges.find(e => getEdgeId(e) === clickData.targetId);
                                if (edge) {
                                    const pointsInSubgraph = new Set(findAllPointsInSubgraph(edge.id1));
                                    const edgesInSubgraph = allEdges.filter(e => pointsInSubgraph.has(e.id1) && pointsInSubgraph.has(e.id2));
                                    applySelectionLogic([], edgesInSubgraph.map(e => getEdgeId(e)), false, false);
                                }
                            }
                            clickData.count = 0;
                            break;
                    }
                } else {
                    clickData.count = 0;
                    saveStateForUndo();
                    performEscapeAction(); 
                    const startCoords = ghostPointPosition ? ghostPointPosition : screenToData(mousePos);
                    const newPoint = { id: generateUniqueId(), ...startCoords, type: 'regular', color: currentColor };
                    allPoints.push(newPoint);
                    isDrawingMode = true;
                    previewLineStartPointId = newPoint.id;
                    frozenReference_D_du = null;
                    frozenReference_A_rad = null;
                    frozenReference_A_baseRad = null;
                    frozenReference_Origin_Data = null;
                }
            }
        }
    }

    isActionInProgress = false;
    isDragConfirmed = false;
    isPanningBackground = false;
    isRectangleSelecting = false;
    actionContext = null;
    actionTargetPoint = null;
    dragBoundaryContext = null;
    canvas.style.cursor = 'crosshair';
    redrawAll();
});