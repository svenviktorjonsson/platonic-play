canvas.addEventListener('mousemove', (event) => {
    mousePos = getMousePosOnCanvas(event, canvas);
    currentShiftPressed = event.shiftKey;
    lastSnapResult = null;
    ghostPointPosition = null;

    if (isPlacingTransform) {
        placingSnapPos = null;
        if (currentShiftPressed && lastGridState.interval1) {
            const mouseDataPos = screenToData(mousePos);
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (gridInterval > 0) {
                const snappedDataX = Math.round(mouseDataPos.x / gridInterval) * gridInterval;
                const snappedDataY = Math.round(mouseDataPos.y / gridInterval) * gridInterval;
                placingSnapPos = dataToScreen({ x: snappedDataX, y: snappedDataY });
            }
        }
    }

    if (currentShiftPressed && !isActionInProgress && !isDrawingMode) {
        if (lastGridState.interval1) {
            const mouseDataPos = screenToData(mousePos);
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (gridInterval > 0) {
                ghostPointPosition = {
                    x: Math.round(mouseDataPos.x / gridInterval) * gridInterval,
                    y: Math.round(mouseDataPos.y / gridInterval) * gridInterval
                };
            }
        }
    }

    if (!isActionInProgress) {
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
            if (actionTargetPoint?.type !== 'regular') {
                if (actionTargetPoint) { // Ensure actionTargetPoint is not null here
                    handleCenterSelection(actionTargetPoint.id, shiftKey, ctrlKey);
                }
            } else if (actionTargetPoint && !selectedPointIds.includes(actionTargetPoint.id)) {
                applySelectionLogic([actionTargetPoint.id], [], shiftKey, ctrlKey, false);
            } else if (actionContext.targetEdge && !selectedEdgeIds.includes(getEdgeId(actionContext.targetEdge))) {
                applySelectionLogic([], [getEdgeId(actionContext.targetEdge)], shiftKey, ctrlKey, false);
            }
            
            let pointsToDragIds = new Set([...selectedPointIds, ...selectedCenterIds]);
            if (actionTargetPoint && !pointsToDragIds.has(actionTargetPoint.id)) {
                pointsToDragIds = new Set([actionTargetPoint.id]);
                if (actionTargetPoint.type === 'regular') {
                    selectedPointIds = [actionTargetPoint.id];
                    selectedCenterIds = [];
                } else {
                    selectedPointIds = [];
                    selectedCenterIds = [actionTargetPoint.id];
                }
                activeCenterId = selectedCenterIds.at(-1) ?? null;
            }
            
            const pointsToDrag = Array.from(pointsToDragIds).map(id => findPointById(id)).filter(Boolean);
            if (pointsToDrag.length > 0) {
                initialDragPointStates = JSON.parse(JSON.stringify(pointsToDrag));
                dragPreviewPoints = JSON.parse(JSON.stringify(pointsToDrag));
                canvas.style.cursor = 'grabbing';
            }
        } else if (currentMouseButton === 0) {
            // Only left mouse button (0) can pan the background
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
            canvas.style.cursor = 'move';
        }
    }
    
    if (isDragConfirmed) {
        const isTransforming = activeCenterId && selectedPointIds.length > 0;

        if (isPanningBackground) {
            const deltaX_css = mousePos.x - actionStartPos.x;
            const deltaY_css = mousePos.y - actionStartPos.y;
            viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
            viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
        } else if (isTransforming) {
            const center = findPointById(activeCenterId);
            const referencePoint = actionTargetPoint?.type === 'regular' ? actionTargetPoint : initialDragPointStates.find(p => selectedPointIds.includes(p.id));
            if (!center || !referencePoint) return;
        
            const mouseData = screenToData(mousePos);
            const startReferencePoint = initialDragPointStates.find(p => p.id === referencePoint.id); // No need for || referencePoint, if it's not in initialDragPointStates, something is wrong
            if (!startReferencePoint) return; // Add check here as well
            const centerType = center.type;
            let rotation, scale, finalMouseData, isSnapping, snappedScaleValue;
            isSnapping = false;
            snappedScaleValue = null;
            finalMouseData = mouseData;

            if (currentShiftPressed) {
                const snapResult = getTransformSnap(center, mouseData, startReferencePoint, centerType);
                if (snapResult.snapped) {
                    isSnapping = true;
                    finalMouseData = snapResult.pos;
                    rotation = snapResult.rotation;
                    scale = snapResult.scale;
                    snappedScaleValue = snapResult.pureScaleForDisplay;
                }
            }
            
            if (!isSnapping) {
                const startVector = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };
                const currentVector = { x: mouseData.x - center.x, y: mouseData.y - center.y };
                const startDist = Math.hypot(startVector.x, startVector.y);
                const currentDist = Math.hypot(currentVector.x, currentVector.y);
                const startAngle = Math.atan2(startVector.y, startVector.x);
                const currentAngle = Math.atan2(currentVector.y, currentVector.x);
                rotation = normalizeAngleToPi(currentAngle - startAngle);
                scale = (startDist < 1e-9) ? 1 : currentDist / startDist;
            }
        
            if (centerType === 'center_rotate_only') scale = 1.0;
            if (centerType === 'center_scale_only') rotation = 0.0;
        
            transformIndicatorData = { center, startPos: startReferencePoint, currentPos: finalMouseData, rotation, scale, isSnapping, snappedScaleValue, transformType: centerType };
        
            initialDragPointStates.forEach(p_initial => {
                if (!p_initial) return;
                if (p_initial.type !== 'regular') return;
                const p_preview = dragPreviewPoints.find(p => p && p.id === p_initial.id);
                if (!p_preview) return;
                
                const initialPointVector = { x: p_initial.x - center.x, y: p_initial.y - center.y };
                let transformedVector = { ...initialPointVector };
                
                if (centerType !== 'center_rotate_only') {
                    transformedVector.x *= scale;
                    transformedVector.y *= scale;
                }
                if (centerType !== 'center_scale_only') {
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
            let finalDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };

            if (currentShiftPressed && actionTargetPoint) {
                const dragOrigin = actionTargetPoint.type === 'regular' ? initialDragPointStates.find(p => p && p.id === actionTargetPoint.id) : null; // Added p && for safety
                if (dragOrigin) {
                    const targetSnapPos = { x: dragOrigin.x + finalDelta.x, y: dragOrigin.y + finalDelta.y };
                    const snapResult = getDragSnapPosition(dragOrigin, targetSnapPos);
                    if (snapResult.snapped) {
                        finalDelta = { x: snapResult.point.x - dragOrigin.x, y: snapResult.point.y - dragOrigin.y };
                    }
                    lastSnapResult = snapResult;
                }
            }

            initialDragPointStates.forEach(originalPointState => {
                if (!originalPointState) return;
                const previewPointToUpdate = dragPreviewPoints.find(dp => dp && dp.id === originalPointState.id); // Added dp && for safety
                if (previewPointToUpdate) {
                    previewPointToUpdate.x = originalPointState.x + finalDelta.x;
                    previewPointToUpdate.y = originalPointState.y + finalDelta.y;
                }
            });
        }
    }
});

canvas.addEventListener('mousedown', (event) => {
    mousePos = getMousePosOnCanvas(event, canvas);

    if (handleCanvasUIClick(mousePos)) {
        return;
    }

    if (isDrawingMode && event.button === 2) {
        performEscapeAction();
        return;
    }

    if (isPlacingTransform) {
        if (event.button === 0) {
            saveStateForUndo();
            const finalPlacePos = placingSnapPos || mousePos;
            const dataPos = screenToData(finalPlacePos);
            const newCenter = {
                id: generateUniqueId(),
                x: dataPos.x,
                y: dataPos.y,
                type: placingTransformType,
                color: currentColor
            };
            allPoints.push(newCenter);
            handleCenterSelection(newCenter.id, false, false);
        }
        isPlacingTransform = false;
        placingTransformType = null;
        placingSnapPos = null;
        return;
    }

    isActionInProgress = true;
    isDragConfirmed = false;
    isPanningBackground = false;
    isRectangleSelecting = false;
    initialDragPointStates = [];
    dragPreviewPoints = [];
    currentMouseButton = event.button;
    actionStartPos = mousePos;
    rectangleSelectStartPos = actionStartPos;

    const clickedPoint = findClickedPoint(actionStartPos);
    const clickedEdge = findClickedEdge(actionStartPos);

    actionContext = {
        targetPoint: clickedPoint,
        targetEdge: clickedEdge,
        target: clickedPoint || clickedEdge || 'canvas',
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey || event.metaKey,
    };

    if (event.altKey) {
        if (clickedPoint && clickedPoint.type === 'regular') {
            saveStateForUndo();
            performEscapeAction();
            isDrawingMode = true;
            previewLineStartPointId = clickedPoint.id;
            isActionInProgress = false;
            return;
        } else if (clickedEdge) {
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
            return;
        }
    }

    // No special behavior on mousedown - all drag behavior is determined in mousemove
    // when isDragConfirmed becomes true
});

canvas.addEventListener('mouseup', (event) => {
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
                selectedCenterIds = centersInRect;
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
            activeCenterId = selectedCenterIds.at(-1) ?? null;

        } else if (isPanningBackground) {
        }
        else if (dragPreviewPoints.length > 0) {
            let didMerge = false;
            if (targetPoint && targetPoint.type === 'regular' && dragPreviewPoints.length === 1 && dragPreviewPoints[0].id === targetPoint.id) {
                const finalDropPos = dragPreviewPoints[0];
                let mergeTargetPoint = null;
                const mergeRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;

                for (const p of allPoints) {
                    if (p.id !== targetPoint.id && p.type === 'regular' && distance({ x: finalDropPos.x, y: finalDropPos.y }, p) < mergeRadiusData) {
                        mergeTargetPoint = p;
                        break;
                    }
                }

                if (mergeTargetPoint) {
                    didMerge = true;
                    saveStateForUndo();
                    const pointToDeleteId = targetPoint.id;
                    const pointToKeepId = mergeTargetPoint.id;
                    const edgesToRewire = allEdges.filter(edge => edge.id1 === pointToDeleteId || edge.id2 === pointToDeleteId);
                    const newEdges = [];
                    for (const edge of edgesToRewire) {
                        const otherEndId = (edge.id1 === pointToDeleteId) ? edge.id2 : edge.id1;
                        if (otherEndId !== pointToKeepId) {
                            const edgeAlreadyExists = allEdges.some(e => (e.id1 === pointToKeepId && e.id2 === otherEndId) || (e.id2 === pointToKeepId && e.id1 === otherEndId));
                            if (!edgeAlreadyExists) newEdges.push({ id1: pointToKeepId, id2: otherEndId });
                        }
                    }
                    allEdges = allEdges.filter(edge => edge.id1 !== pointToDeleteId && edge.id2 !== pointToDeleteId);
                    allPoints = allPoints.filter(p => p.id !== pointToDeleteId);
                    selectedPointIds = selectedPointIds.filter(id => id !== pointToDeleteId);
                    if (!selectedPointIds.includes(pointToKeepId)) {
                         selectedPointIds.push(pointToKeepId);
                    }
                    allEdges.push(...newEdges);
                }
            }
            if (!didMerge) {
                saveStateForUndo();
                dragPreviewPoints.forEach(dp => {
                    if (dp) {
                        const p = allPoints.find(point => point.id === dp.id);
                        if (p) {
                            p.x = dp.x;
                            p.y = dp.y;
                        }
                    }
                });
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
                        // If there are previous segments in the pattern, update the 'turn' property of the *last* one added.
                        // This 'turn' is the relative angle from that previous segment to the segment just completed.
                        if (drawingSequence.length > 0) {
                            drawingSequence[drawingSequence.length - 1].turn = completedSegmentProps.turnAngleRad;
                            console.log("=== SEGMENT COMPLETION DEBUG ===");
                            console.log("Updated turn for segment", drawingSequence.length - 1, "to", completedSegmentProps.turnAngleRad, "radians (", completedSegmentProps.turnAngleRad * 180 / Math.PI, "degrees)");
                        }
                        // Add the current segment's details to the sequence.
                        // Its 'turn' property is set to 0 initially. This 0 means "no turn after this segment",
                        // which is correct for the very last segment in a pattern until more segments are drawn.
                        drawingSequence.push({
                            length: completedSegmentProps.length,
                            turn: 0, // Placeholder. If another segment is drawn, this will be updated. If not, it's 0.
                            endPointColor: newPoint.color // Store the color of the endpoint of this segment
                        });
                        console.log("Added new segment to sequence:", {
                            length: completedSegmentProps.length,
                            turn: 0,
                            endPointColor: newPoint.color
                        });
                        console.log("Full drawingSequence now:", drawingSequence);
                        // Set sequence index to track the current position in the pattern
                        currentSequenceIndex = drawingSequence.length - 1;
                    }
                }
                
                if (shiftKey && newPoint && snappedDataForCompletedSegment) {
                    const completedSegmentProps = getCompletedSegmentProperties(startPoint, newPoint, allEdges);

                    if (completedSegmentProps) {
                        frozenReference_Origin_Data = completedSegmentProps.startPoint;
                        frozenReference_D_du = completedSegmentProps.length;
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

                let primaryClickTarget = null;
                if (targetPoint && targetPoint.type !== 'regular') {
                    primaryClickTarget = targetPoint;
                } else if (targetPoint && targetPoint.type === 'regular') {
                    primaryClickTarget = targetPoint;
                } else if (targetEdge) {
                    primaryClickTarget = targetEdge;
                } else {
                    primaryClickTarget = 'canvas';
                }
                
                if (primaryClickTarget !== 'canvas') {
                    const targetId = primaryClickTarget.id || getEdgeId(primaryClickTarget);
                    const targetType = primaryClickTarget.id ? (primaryClickTarget.type !== 'regular' ? 'center' : 'point') : 'edge';
                    
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
                            if (targetType === 'center') {
                                handleCenterSelection(targetId, shiftKey, ctrlKey);
                                selectedPointIds = [];
                                selectedEdgeIds = [];
                            } else if (targetType === 'point') {
                                applySelectionLogic([targetId], [], shiftKey, ctrlKey, false);
                                selectedCenterIds = [];
                                activeCenterId = null;
                            } else if (targetType === 'edge') {
                                applySelectionLogic([], [targetId], shiftKey, ctrlKey, false);
                                selectedCenterIds = [];
                                activeCenterId = null;
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
                    selectedCenterIds = [];
                    activeCenterId = null;
                    isDrawingMode = false;
                    previewLineStartPointId = null;
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
                    drawingSequence = []; // New drawing session, clear sequence
                    currentSequenceIndex = 0;
                }
            }
        } else if (currentMouseButton === 2) {
            // Right click - perform escape action
            performEscapeAction();
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