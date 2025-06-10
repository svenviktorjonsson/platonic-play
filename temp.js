

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);
    const { grid1Interval, grid2Interval, alpha1, alpha2 } = calculateGridIntervals(viewTransform.scale);
    lastGridState = { interval1: grid1Interval, interval2: grid2Interval, alpha1, alpha2, scale: viewTransform.scale };
    if (showGrid) {
        const r = parseInt(gridColor.slice(1, 3), 16);
        const g = parseInt(gridColor.slice(3, 5), 16);
        const b = parseInt(gridColor.slice(5, 7), 16);
        const drawGridLayer = (interval, alpha) => {
            if (!interval || alpha <= 0.001) return;
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${gridAlpha * alpha})`;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${gridAlpha * alpha})`;
            const topLeftData = screenToData({ x: 0, y: 0 });
            const bottomRightData = screenToData({ x: actualCanvasWidth, y: actualCanvasHeight });
            const startGridX = Math.floor(topLeftData.x / interval) * interval;
            const endGridX = Math.ceil(bottomRightData.x / interval) * interval;
            const startGridY = Math.floor(bottomRightData.y / interval) * interval;
            const endGridY = Math.ceil(topLeftData.y / interval) * interval;
            if (gridType === 'lines') {
                ctx.beginPath();
                ctx.lineWidth = GRID_LINEWIDTH;
                for (let x_data = startGridX; x_data <= endGridX; x_data += interval) {
                    const screenX = dataToScreen({ x: x_data, y: 0 }).x;
                    ctx.moveTo(screenX, 0);
                    ctx.lineTo(screenX, actualCanvasHeight);
                }
                for (let y_data = startGridY; y_data <= endGridY; y_data += interval) {
                    const screenY = dataToScreen({ x: 0, y: y_data }).y;
                    ctx.moveTo(0, screenY);
                    ctx.lineTo(actualCanvasWidth, screenY);
                }
                ctx.stroke();
            } else if (gridType === 'points') {
                for (let x_data = startGridX; x_data <= endGridX; x_data += interval) {
                    for (let y_data = startGridY; y_data <= endGridY; y_data += interval) {
                        const screenPos = dataToScreen({ x: x_data, y: y_data });
                        ctx.beginPath();
                        ctx.arc(screenPos.x, screenPos.y, 1, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
            }
        };
        drawGridLayer(grid1Interval, alpha1);
        drawGridLayer(grid2Interval, alpha2);
    }
    if (isDrawingMode && currentShiftPressed) {
        const drawingContext = getDrawingContext(previewLineStartPointId);
        if (drawingContext && drawingContext.frozen_Origin_Data_to_display) {
            drawReferenceElementsGeometry(drawingContext, true);
            prepareReferenceElementsTexts(drawingContext, true);
        }
    }

    if (transformIndicatorData) {
        drawTransformIndicators(ctx);
        labelsToKeepThisFrame.add('transform-angle-indicator');
        labelsToKeepThisFrame.add('transform-scale-indicator');
    }

    drawAllEdges();
    allPoints.forEach(point => {
        let pointToDraw = { ...point };
        if (isDragConfirmed && dragPreviewPoints.length > 0) {
            const preview = dragPreviewPoints.find(dp => dp.id === point.id);
            if (preview) {
                pointToDraw.x = preview.x;
                pointToDraw.y = preview.y;
            }
        }
        drawPoint(pointToDraw);
    });

    if (isDragConfirmed) {
        const hybridPointStates = allPoints.map(p => {
            const draggedVersion = dragPreviewPoints.find(dp => dp.id === p.id);
            return draggedVersion || p;
        });
        if (actionContext.targetPoint) {
            drawDragFeedback(actionContext.targetPoint.id, hybridPointStates, currentShiftPressed);
        } else if (actionContext.targetEdge) {
            const draggedEdgeId = getEdgeId(actionContext.targetEdge);
            drawDragFeedback(actionContext.targetEdge.id1, hybridPointStates, false);
            drawDragFeedback(actionContext.targetEdge.id2, hybridPointStates, false, draggedEdgeId);
        }
    } else {
        if (selectedPointIds.length === 1 && selectedEdgeIds.length === 0) {
            drawDragFeedback(selectedPointIds[0], allPoints, false);
        } else if (selectedEdgeIds.length === 1 && selectedPointIds.length <= 2) {
            const selectedEdgeId = selectedEdgeIds[0];
            const edge = allEdges.find(e => getEdgeId(e) === selectedEdgeId);
            if (edge) {
                drawDragFeedback(edge.id1, allPoints, false);
                drawDragFeedback(edge.id2, allPoints, false, selectedEdgeId);
            }
        }
    }

    if (ghostPointPosition) {
        const screenPos = dataToScreen(ghostPointPosition);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(240, 240, 130, 0.9)';
        ctx.fill();
    }
    if (isDrawingMode && previewLineStartPointId && !isActionInProgress) {
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
            ctx.strokeStyle = currentShiftPressed ? 'rgba(240, 240, 130, 0.9)' : currentColor;
            ctx.lineWidth = LINE_WIDTH;
            ctx.stroke();
            ctx.setLineDash([]);
            if (snappedData.snapped) {
                ctx.beginPath();
                ctx.arc(targetScreen.x, targetScreen.y, POINT_RADIUS, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(240, 240, 130, 0.9)';
                ctx.fill();
            }
            prepareSnapInfoTexts(startPoint, targetPosData, snappedData, currentShiftPressed, drawingContext);
        }
    }
    if (isRectangleSelecting && isDragConfirmed) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash(DASH_PATTERN);
        const rX = Math.min(rectangleSelectStartPos.x, mousePos.x);
        const rY = Math.min(rectangleSelectStartPos.y, mousePos.y);
        const rW = Math.abs(rectangleSelectStartPos.x - mousePos.x);
        const rH = Math.abs(rectangleSelectStartPos.y - mousePos.y);
        ctx.strokeRect(rX, rY, rW, rH);
        ctx.setLineDash([]);
    }

    updateMouseCoordinates(mousePos);
    cleanupHtmlLabels();
    drawCanvasUI(ctx);
}

canvas.addEventListener('mouseup', (event) => {
    if (!isActionInProgress) return;

    if (isDragConfirmed) {
        if (isRectangleSelecting) {
            const dataP1 = screenToData({ x: Math.min(actionStartPos.x, mousePos.x), y: Math.min(actionStartPos.y, mousePos.y) });
            const dataP2 = screenToData({ x: Math.max(actionStartPos.x, mousePos.x), y: Math.max(actionStartPos.y, mousePos.y) });
            const minX = Math.min(dataP1.x, dataP2.x),
                maxX = Math.max(dataP1.x, dataP2.x);
            const minY = Math.min(dataP1.y, dataP2.y),
                maxY = Math.max(dataP1.y, dataP2.y);
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
            if (lastSnapResult && lastSnapResult.snapped && lastSnapResult.constraints) {
                frozenReference_D_du = lastSnapResult.constraints.dist;
                frozenReference_A_rad = lastSnapResult.constraints.angle;
                frozenReference_Origin_Data = initialDragPointStates.find(p => p.id === actionTargetPoint.id);
                frozenReference_A_baseRad = null;
            }
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
                    frozenReference_Origin_Data = startPoint;

                    frozenReference_D_du = snappedDataForCompletedSegment.distance;
                    if (snappedDataForCompletedSegment.gridToGridSquaredSum > 0) {
                        frozenReference_D_g2g = {
                            g2gSquaredSum: snappedDataForCompletedSegment.gridToGridSquaredSum,
                            interval: snappedDataForCompletedSegment.gridInterval
                        };
                    } else {
                        frozenReference_D_g2g = null;
                    }

                    if (drawingContextForCompletedSegment.isFirstSegmentBeingDrawn) {
                        frozenReference_A_rad = normalizeAngleToPi(snappedDataForCompletedSegment.angle * (Math.PI / 180));
                        frozenReference_A_baseRad = 0;
                    } else {
                        frozenReference_A_rad = snappedDataForCompletedSegment.angleTurn;
                        frozenReference_A_baseRad = drawingContextForCompletedSegment.offsetAngleRad;
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
                    frozenReference_D_g2g = null; 
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
    transformIndicatorData = null;
    canvas.style.cursor = 'crosshair';
});

canvas.addEventListener('mousemove', (event) => {
    mousePos = getMousePosOnCanvas(event, canvas);
    currentShiftPressed = event.shiftKey;
    lastSnapResult = null;
    ghostPointPosition = null;

    if (isPlacingTransform) {
        placingSnapPos = null;
        if (currentShiftPressed && lastGridState.interval1) {
            const mouseDataPos = screenToData(mousePos);
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2)
                                   ? lastGridState.interval2
                                   : lastGridState.interval1;

            const snappedDataX = Math.round(mouseDataPos.x / gridInterval) * gridInterval;
            const snappedDataY = Math.round(mouseDataPos.y / gridInterval) * gridInterval;
            
            placingSnapPos = dataToScreen({ x: snappedDataX, y: snappedDataY });
        }
    }

    if (!isActionInProgress) {
        if (currentShiftPressed && !isDrawingMode) {
            if (lastGridState.interval1) {
                const mouseDataPos = screenToData(mousePos);
                const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2)
                                       ? lastGridState.interval2
                                       : lastGridState.interval1;
                if (gridInterval > 0) {
                     ghostPointPosition = {
                        x: Math.round(mouseDataPos.x / gridInterval) * gridInterval,
                        y: Math.round(mouseDataPos.y / gridInterval) * gridInterval
                    };
                }
            }
        }
        return;
    }

    if (!isDragConfirmed && distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
        isDragConfirmed = true;
        if (currentMouseButton === 2) {
            isRectangleSelecting = true;
            return;
        }
        const { target, shiftKey, ctrlKey } = actionContext;
        if (target !== 'canvas') {
            actionTargetPoint = actionContext.targetPoint;
            if (actionTargetPoint && actionTargetPoint.type !== 'regular' && !activeCenterId) {
                activeCenterId = actionTargetPoint.id;
            } else if (actionTargetPoint && !selectedPointIds.includes(actionTargetPoint.id)) {
                applySelectionLogic([actionTargetPoint.id], [], shiftKey, ctrlKey, false);
            } else if (actionContext.targetEdge && !selectedEdgeIds.includes(getEdgeId(actionContext.targetEdge))) {
                applySelectionLogic([], [getEdgeId(actionContext.targetEdge)], shiftKey, ctrlKey, false);
            }

            let pointsToDragIds = new Set(selectedPointIds);
            if (actionTargetPoint && actionTargetPoint.type === 'regular' && !pointsToDragIds.has(actionTargetPoint.id)) {
                pointsToDragIds = new Set([actionTargetPoint.id]);
            }

            const pointsToDrag = Array.from(pointsToDragIds).map(id => findPointById(id)).filter(Boolean);
            if (pointsToDrag.length > 0) {
                initialDragPointStates = JSON.parse(JSON.stringify(pointsToDrag));
                dragPreviewPoints = JSON.parse(JSON.stringify(pointsToDrag));
                canvas.style.cursor = 'grabbing';
            }
        } else {
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
            canvas.style.cursor = 'move';
        }
    }
    if (isDragConfirmed) {
        if (isPanningBackground) {
            const deltaX_css = mousePos.x - actionStartPos.x;
            const deltaY_css = mousePos.y - actionStartPos.y;
            viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
            viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
        } else if (activeCenterId && dragPreviewPoints.length > 0) {
            const center = findPointById(activeCenterId);
            if (!center) return;
        
            let mouseData = screenToData(mousePos);
            const startMouseData = screenToData(actionStartPos);
            let isSnapping = false;
            let snappedRotation = null;
            let snappedScale = null;
        
            if (currentShiftPressed) {
                const snapResult = getTransformSnap(center, mouseData, startMouseData, center.type);
                if (snapResult.snapped) {
                    mouseData = snapResult.pos;
                    isSnapping = true;
                    snappedRotation = snapResult.rotation;
                    snappedScale = snapResult.scaleFactor;
                }
            }
            
            const startVector = { x: startMouseData.x - center.x, y: startMouseData.y - center.y };
            const currentVector = { x: mouseData.x - center.x, y: mouseData.y - center.y };
            
            const startDist = Math.hypot(startVector.x, startVector.y);
            const currentDist = Math.hypot(currentVector.x, currentVector.y);
        
            const startAngle = Math.atan2(startVector.y, startVector.x);
            const currentAngle = Math.atan2(currentVector.y, currentVector.x);
        
            let rotation = normalizeAngleToPi(currentAngle - startAngle);
            let scale = (startDist < 1e-9) ? 1 : currentDist / startDist;
        
            if(isSnapping) {
                if(snappedRotation !== null) rotation = snappedRotation;
                if(snappedScale !== null) scale = snappedScale;
            }
        
            transformIndicatorData = {
                center: center,
                startPos: startMouseData,
                currentPos: mouseData,
                rotation: rotation,
                scale: scale,
                isSnapping: isSnapping
            };
        
            const centerType = center.type;
            initialDragPointStates.forEach(p_initial => {
                const p_preview = dragPreviewPoints.find(p => p.id === p_initial.id);
                if (!p_preview) return;
                
                const initialPointVector = { x: p_initial.x - center.x, y: p_initial.y - center.y };
                let transformedVector = { ...initialPointVector };
                
                if (centerType === 'center_scale_only' || centerType === 'center_rotate_scale') {
                    transformedVector.x *= scale;
                    transformedVector.y *= scale;
                }
                if (centerType === 'center_rotate_only' || centerType === 'center_rotate_scale') {
                    const x = transformedVector.x;
                    const y = transformedVector.y;
                    transformedVector.x = x * Math.cos(rotation) - y * Math.sin(rotation);
                    transformedVector.y = x * Math.sin(rotation) + y * Math.cos(rotation);
                }
                p_preview.x = center.x + transformedVector.x;
                p_preview.y = center.y + transformedVector.y;
            });
        } else if (dragPreviewPoints.length > 0) {
            const mouseData = screenToData(mousePos);
            const startMouseData = screenToData(actionStartPos);
            let finalDelta = {
                x: mouseData.x - startMouseData.x,
                y: mouseData.y - startMouseData.y
            };
            if (currentShiftPressed && actionTargetPoint) {
                const dragOrigin = initialDragPointStates.find(p => p.id === actionTargetPoint.id);
                const targetSnapPos = { x: dragOrigin.x + finalDelta.x, y: dragOrigin.y + finalDelta.y };
                const snapResult = getDragSnapPosition(dragOrigin, targetSnapPos);
                if (snapResult.snapped) {
                    finalDelta = { x: snapResult.point.x - dragOrigin.x, y: snapResult.point.y - dragOrigin.y };
                }
                lastSnapResult = snapResult;
            }
            initialDragPointStates.forEach(originalPointState => {
                const previewPointToUpdate = dragPreviewPoints.find(dp => dp.id === originalPointState.id);
                if (previewPointToUpdate) {
                    previewPointToUpdate.x = originalPointState.x + finalDelta.x;
                    previewPointToUpdate.y = originalPointState.y + finalDelta.y;
                }
            });
        }
    }
});