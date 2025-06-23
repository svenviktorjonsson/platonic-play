canvas.addEventListener('mousemove', (event) => {
    mousePos = getMousePosOnCanvas(event, canvas);
    currentShiftPressed = event.shiftKey;

    // Declare state-dependent flags here for broader scope within mousemove
    // These reflect the *current* state of selection and active tools
    const isTransformingSelection = activeCenterId && selectedPointIds.length > 0;
    const isDrawingNewSegment = isDrawingMode && previewLineStartPointId;
    const isPlacingNewTransformCenter = isPlacingTransform;


    // --- General Ghost Point/Snap Handling (when not actively dragging) ---
    // This logic only applies if NO active drag action is in progress.
    // During a drag, specific drag-related snap logic (in the isDragConfirmed block) takes over.
    if (!isActionInProgress) {
        if (currentShiftPressed) {
            const mouseDataPos = screenToData(mousePos);
            if (isPlacingNewTransformCenter) {
                // When placing a transform center, snap to grid/points
                const potentialSnapPos = getBestSnapPosition(mouseDataPos);
                if (potentialSnapPos) {
                    placingSnapPos = dataToScreen(potentialSnapPos); // UI position for the ghost icon
                    ghostPointPosition = potentialSnapPos; // Data position for coordinate display
                } else {
                    placingSnapPos = null;
                    ghostPointPosition = null;
                }
            } else if (isDrawingNewSegment) {
                // When drawing a segment, snap the end point of the preview line
                const startPoint = findPointById(previewLineStartPointId);
                if (startPoint) {
                    const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed);
                    ghostPointPosition = { x: snappedData.x, y: snappedData.y };
                } else {
                    ghostPointPosition = null;
                }
            } else {
                // General canvas interaction (not drawing or placing, just hovering with Shift)
                ghostPointPosition = getBestSnapPosition(mouseDataPos);
            }
        } else {
            // Shift is not pressed, clear general ghost indicator
            ghostPointPosition = null;
            placingSnapPos = null;
        }
    } else {
        // If an action IS in progress, clear general ghosting (specific drag ghosts are handled later)
        ghostPointPosition = null;
        placingSnapPos = null;
    }


    const copyCount = parseInt(copyCountInput || '1', 10); // Evaluate copyCount based on current input

    // --- Drag Confirmation Logic ---
    // This block determines if a mouse down has turned into a confirmed drag.
    if (!isDragConfirmed && distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
        isDragConfirmed = true; // Confirmed drag!
        // Initialize specific drag types based on initial action context
        isEdgeTransformDrag = activeCenterId && actionContext.targetEdge;
        isDraggingCenter = actionContext.targetPoint && (actionContext.targetPoint.type !== POINT_TYPE_REGULAR);
        isPanningBackground = actionContext.target === 'canvas' && currentMouseButton === 0;

        // Populate initialDragPointStates and dragPreviewPoints once when drag is confirmed
        if (isDraggingCenter) {
            if (actionContext.targetPoint) {
                initialDragPointStates = [JSON.parse(JSON.stringify(actionContext.targetPoint))];
                dragPreviewPoints = [JSON.parse(JSON.stringify(actionContext.targetPoint))];
                canvas.style.cursor = 'grabbing';
            }
        } else if (isTransformingSelection || isEdgeTransformDrag) {
            let pointsToDragIds = new Set(selectedPointIds);
            if (activeCenterId) pointsToDragIds.add(activeCenterId); // Include active center in points to drag if it's selected
            if (actionContext.targetPoint) pointsToDragIds.add(actionContext.targetPoint.id);
            if (actionContext.targetEdge) {
                pointsToDragIds.add(actionContext.targetEdge.id1);
                pointsToDragIds.add(actionContext.targetEdge.id2);
            }
            initialDragPointStates = Array.from(pointsToDragIds).map(id => findPointById(id)).filter(Boolean).map(p => JSON.parse(JSON.stringify(p)));
            dragPreviewPoints = Array.from(pointsToDragIds).map(id => findPointById(id)).filter(Boolean).map(p => JSON.parse(JSON.stringify(p)));
            canvas.style.cursor = 'grabbing';

            // Initialize currentAccumulatedRotation for transform drag
            if (activeCenterId && findPointById(activeCenterId)?.type === TRANSFORMATION_TYPE_ROTATION) {
                const center = findPointById(activeCenterId);
                const referencePoint = initialDragPointStates.find(p => p.type === POINT_TYPE_REGULAR) || initialDragPointStates[0]; // Prefer a regular point, fallback to first dragged
                if (center && referencePoint) {
                    const initialVector = { x: referencePoint.x - center.x, y: referencePoint.y - center.y };
                    actionContext.initialRotationStartAngle = Math.atan2(initialVector.y, initialVector.x);
                    currentAccumulatedRotation = 0; // Reset for a new drag session
                }
            }

        } else if (actionContext.target === 'canvas' && currentMouseButton === 0) {
            isPanningBackground = true;
            backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
            canvas.style.cursor = 'move';
        } else if (actionContext.targetPoint && actionContext.targetPoint.type === POINT_TYPE_REGULAR) {
            // Regular point drag (not part of a transform or center drag)
            if (!selectedPointIds.includes(actionContext.targetPoint.id)) {
                applySelectionLogic([actionContext.targetPoint.id], [], actionContext.shiftKey, actionContext.ctrlKey, false);
            }
            initialDragPointStates = selectedPointIds.map(id => findPointById(id)).filter(Boolean).map(p => JSON.parse(JSON.stringify(p)));
            dragPreviewPoints = selectedPointIds.map(id => findPointById(id)).filter(Boolean).map(p => JSON.parse(JSON.stringify(p)));
            canvas.style.cursor = 'grabbing';
        } else if (actionContext.targetEdge) {
             // Edge drag (not part of a transform)
            const edgePoints = [actionContext.targetEdge.id1, actionContext.targetEdge.id2];
            // Select edge and its points if not already selected
            if (!selectedEdgeIds.includes(getEdgeId(actionContext.targetEdge))) {
                applySelectionLogic(edgePoints, [getEdgeId(actionContext.targetEdge)], actionContext.shiftKey, actionContext.ctrlKey, false);
            }
            initialDragPointStates = [...selectedPointIds].map(id => findPointById(id)).filter(Boolean).map(p => JSON.parse(JSON.stringify(p)));
            dragPreviewPoints = [...selectedPointIds].map(id => findPointById(id)).filter(Boolean).map(p => JSON.parse(JSON.stringify(p)));
            canvas.style.cursor = 'grabbing';
        }
    }

    // --- Active Drag Logic (runs every mousemove if isDragConfirmed is true) ---
    if (isDragConfirmed) {
        // Clear ghost points from previous frame within the drag, new ones generated below
        ghostPoints = [];

        if (isPanningBackground) {
            const deltaX_css = mousePos.x - actionStartPos.x;
            const deltaY_css = mousePos.y - actionStartPos.y;
            viewTransform.offsetX = backgroundPanStartOffset.x + (deltaX_css * dpr);
            viewTransform.offsetY = backgroundPanStartOffset.y - (deltaY_css * dpr);
        } else if (isDraggingCenter) {
            const mouseData = screenToData(mousePos);
            const startMouseData = screenToData(actionStartPos);
            let finalDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };

            if (currentShiftPressed) {
                const targetSnapPos = { x: initialDragPointStates[0].x + finalDelta.x, y: initialDragPointStates[0].y + finalDelta.y };
                const snapResult = getDragSnapPosition(initialDragPointStates[0], targetSnapPos);
                if (snapResult.snapped) {
                    finalDelta = { x: snapResult.point.x - initialDragPointStates[0].x, y: snapResult.point.y - initialDragPointStates[0].y };
                    ghostPoints = [snapResult.point];
                }
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
                const referencePointCandidate = initialDragPointStates.find(p => p.id === actionTargetPoint?.id || selectedPointIds.includes(p.id));
                startReferencePoint = referencePointCandidate || initialDragPointStates[0];
            }

            if (!center || !startReferencePoint) return;

            const mouseData = screenToData(mousePos);
            const centerType = center.type;
            let rotation, scale, finalMouseData, isSnapping, snappedScaleValue, gridToGridInfo, directionalScale;
            isSnapping = false;
            snappedScaleValue = null;
            gridToGridInfo = null;
            directionalScale = false;
            finalMouseData = mouseData;

            if (currentShiftPressed) {
                if (centerType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
                    const snapResult = getDirectionalScalingSnap(center, mouseData, startReferencePoint);
                    isSnapping = true;
                    rotation = snapResult.rotation;
                    scale = snapResult.scale;
                    directionalScale = snapResult.directionalScale;
                    finalMouseData = snapResult.pos;
                    snappedScaleValue = snapResult.pureScaleForDisplay;
                    gridToGridInfo = snapResult.gridToGridInfo;
                } else {
                    const snapResult = getTransformSnap(center, mouseData, startReferencePoint, centerType);
                    if (snapResult.snapped) {
                        isSnapping = true;
                        finalMouseData = snapResult.pos;
                        rotation = snapResult.rotation;
                        scale = snapResult.scale;
                        snappedScaleValue = snapResult.pureScaleForDisplay;
                        gridToGridInfo = snapResult.gridToGridInfo;
                        directionalScale = snapResult.directionalScale;
                    }
                }
                ghostPoints = [finalMouseData]; // Show ghost for the snapped transform reference point
            }

            const initialStartAngleForRotation = actionContext.initialRotationStartAngle !== undefined ? actionContext.initialRotationStartAngle : Math.atan2(startReferencePoint.y - center.y, startReferencePoint.x - center.x);
            const transformResult = calculateTransformFromMouse(center, finalMouseData, startReferencePoint, centerType, currentAccumulatedRotation, initialStartAngleForRotation);

            rotation = transformResult.rotation;
            scale = transformResult.scale;
            directionalScale = transformResult.directionalScale;

            if (centerType === TRANSFORMATION_TYPE_ROTATION) {
                currentAccumulatedRotation = rotation; // Update for next frame
            }

            // Ensure scale and rotation are consistent with transform type constraints
            if (centerType === TRANSFORMATION_TYPE_ROTATION) scale = 1.0;
            if (centerType === TRANSFORMATION_TYPE_SCALE) rotation = 0.0;
            if (centerType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) rotation = 0.0;


            transformIndicatorData = { center, startPos: startReferencePoint, currentPos: finalMouseData, rotation, scale, isSnapping, snappedScaleValue, transformType: centerType, gridToGridInfo, directionalScale };

            const startVector = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };

            initialDragPointStates.forEach(p_initial => {
                if (!p_initial) return;
                const p_preview = dragPreviewPoints.find(p => p && p.id === p_initial.id);
                if (p_preview) { // Make sure the preview point exists
                    const newPos = applyTransformToPoint(p_initial, center, rotation, scale, directionalScale, startVector);
                    p_preview.x = newPos.x;
                    p_preview.y = newPos.y;
                }
            });
        } else if (isRegularTranslation && dragPreviewPoints.length > 0) { // Regular translation drag (no transform, no center drag)
            const mouseData = screenToData(mousePos);
            const startMouseData = screenToData(actionStartPos);
            let finalDelta = { x: mouseData.x - startMouseData.x, y: mouseData.y - startMouseData.y };

            if (currentShiftPressed) {
                // Determine the reference point for translation snapping
                const translationReferencePoint = actionTargetPoint?.type === 'regular' ? actionTargetPoint : initialDragPointStates[0];
                if (translationReferencePoint) {
                    // Calculate where this reference point would be if it snapped
                    const targetSnapPos = { x: translationReferencePoint.x + finalDelta.x, y: translationReferencePoint.y + finalDelta.y };
                    const snappedData = getSnappedPosition(translationReferencePoint, mousePos, currentShiftPressed); // Using mousePos directly for getSnappedPosition's internal data conversion
                    finalDelta = { x: snappedData.x - translationReferencePoint.x, y: snappedData.y - translationReferencePoint.y };
                    ghostPointPosition = snappedData; // Show ghost for the snapped translation reference point
                }
            } else {
                ghostPointPosition = null; // No shift, no ghost
            }

            // Apply calculated delta to all dragged points
            initialDragPointStates.forEach(originalPointState => {
                const previewPointToUpdate = dragPreviewPoints.find(dp => dp && dp.id === originalPointState.id);
                if (previewPointToUpdate) {
                    previewPointToUpdate.x = originalPointState.x + finalDelta.x;
                    previewPointToUpdate.y = originalPointState.y + finalDelta.y;
                }
            });
        }
    }
});

canvas.addEventListener('mouseup', (event) => {
    if (copyCountTimer) clearTimeout(copyCountTimer);
    copyCountTimer = null;
    const copyCount = parseInt(copyCountInput, 10) || 1;
    copyCountInput = '';

    // IMPORTANT: Check if an action was in progress BEFORE resetting flags.
    // This ensures that non-drag clicks are handled correctly first.
    if (!isActionInProgress) return;

    const { shiftKey, ctrlKey, targetPoint, targetEdge, target } = actionContext;

    // --- Handle confirmed drags ---
    if (isDragConfirmed) {
        saveStateForUndo(); // Save state at the beginning of a confirmed drag end

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
            // Nothing more to do here; transform is already applied in mousemove.
        } else { // Point/Edge Drag or Transform
            const mergeRadiusData = MERGE_RADIUS_SCREEN / viewTransform.scale;

            // Helper function to update point positions or perform merges
            function applyPointUpdateOrMergeAtEndOfDrag(originalPointId, finalPreviewPos, isCopy = false) {
                const originalPoint = findPointById(originalPointId);
                if (!originalPoint) return; // Point might have been merged/deleted by another operation

                if (originalPoint.type !== POINT_TYPE_REGULAR) {
                    // Non-regular points (like transform centers) just move, they don't merge.
                    originalPoint.x = finalPreviewPos.x;
                    originalPoint.y = finalPreviewPos.y;
                    return originalPoint.id;
                }

                // For regular points, check for merge targets
                let mergeTargetId = null;
                for (const existingPoint of allPoints) {
                    // Don't merge with itself, or with points *also being dragged* (unless it's the specific target)
                    if (existingPoint.id === originalPointId || (initialDragPointStates.some(p => p.id === existingPoint.id) && !isCopy)) {
                        continue;
                    }
                    if (existingPoint.type === POINT_TYPE_REGULAR && distance(finalPreviewPos, existingPoint) < mergeRadiusData) {
                        mergeTargetId = existingPoint.id;
                        break;
                    }
                }

                if (mergeTargetId) {
                    // Perform merge: rewire edges, remove originalPoint, update selections
                    const pointToDeleteId = originalPointId;
                    const pointToKeepId = mergeTargetId;

                    // Rewire existing edges that connected to the point being deleted
                    allEdges = allEdges.filter(edge => {
                        if (edge.id1 === pointToDeleteId) {
                            if (edge.id2 !== pointToKeepId) {
                                // Add new edge only if it doesn't already exist
                                const exists = allEdges.some(e => (e.id1 === pointToKeepId && e.id2 === edge.id2) || (e.id2 === pointToKeepId && e.id1 === edge.id2));
                                if (!exists) {
                                    allEdges.push({ id1: pointToKeepId, id2: edge.id2 });
                                }
                            }
                            return false; // Remove old edge
                        } else if (edge.id2 === pointToDeleteId) {
                            if (edge.id1 !== pointToKeepId) {
                                const exists = allEdges.some(e => (e.id1 === pointToKeepId && e.id2 === edge.id1) || (e.id2 === pointToKeepId && e.id1 === edge.id1));
                                if (!exists) {
                                    allEdges.push({ id1: pointToKeepId, id2: edge.id1 });
                                }
                            }
                            return false; // Remove old edge
                        }
                        return true; // Keep other edges
                    });

                    // Remove the point that was merged
                    allPoints = allPoints.filter(p => p.id !== pointToDeleteId);

                    // Update selection lists
                    selectedPointIds = selectedPointIds.filter(id => id !== pointToDeleteId);
                    if (!selectedPointIds.includes(pointToKeepId) && !isCopy) { // If not a copy, select the merged point
                        selectedPointIds.push(pointToKeepId);
                    }
                    selectedEdgeIds = selectedEdgeIds.filter(id => id.includes(pointToDeleteId)); // Edges involving deleted point are now gone/rewired

                    return pointToKeepId;
                } else {
                    // No merge, just update the original point's position
                    originalPoint.x = finalPreviewPos.x;
                    originalPoint.y = finalPreviewPos.y;
                    return originalPoint.id;
                }
            }


            // --- Apply the final positions/copies based on dragPreviewPoints ---
            if (copyCount <= 1) { // Single move operation
                selectedPointIds = []; // Clear current selection to rebuild after potential merges/moves
                selectedCenterIds = [];

                initialDragPointStates.forEach(originalPointState => {
                    const previewPoint = dragPreviewPoints.find(dp => dp.id === originalPointState.id);
                    if (previewPoint) {
                        const finalId = applyPointUpdateOrMergeAtEndOfDrag(originalPointState.id, previewPoint, false);
                        if (originalPointState.type === POINT_TYPE_REGULAR && !selectedPointIds.includes(finalId)) {
                            selectedPointIds.push(finalId);
                        } else if (originalPointState.type !== POINT_TYPE_REGULAR && !selectedCenterIds.includes(finalId)) {
                             selectedCenterIds.push(finalId);
                        }
                        if (originalPointState.id === activeCenterId) activeCenterId = finalId;
                    }
                });
                // Re-evaluate selected edges based on new point positions (if any merged)
                selectedEdgeIds = allEdges.filter(e => selectedPointIds.includes(e.id1) && selectedPointIds.includes(e.id2)).map(e => getEdgeId(e));


            } else { // Copy operation (copyCount > 1)
                const pointsToCopyFrom = initialDragPointStates.filter(p => p.type === POINT_TYPE_REGULAR);
                const centersToCopyFrom = initialDragPointStates.filter(p => p.type !== POINT_TYPE_REGULAR);

                // Move original centers to their final preview positions
                centersToCopyFrom.forEach(originalCenter => {
                    const previewCenter = dragPreviewPoints.find(p => p.id === originalCenter.id);
                    if (previewCenter) {
                        originalCenter.x = previewCenter.x;
                        originalCenter.y = previewCenter.y;
                    }
                });
                // Clear selection on original points/edges after copying
                selectedPointIds = [];
                selectedEdgeIds = [];
                selectedCenterIds = [];
                activeCenterId = null;


                const incidentEdgesForCopy = allEdges.filter(edge =>
                    pointsToCopyFrom.some(p => p.id === edge.id1) && pointsToCopyFrom.some(p => p.id === edge.id2)
                );

                for (let i = 1; i < copyCount; i++) {
                    const newIdMapForThisCopy = new Map(); // Maps original IDs to the new copied IDs for this iteration

                    let currentTransform = { rotation: 0, scale: 1, directionalScale: false };
                    if (transformIndicatorData) {
                        const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
                        currentTransform.rotation = rotation * i;
                        currentTransform.scale = Math.pow(Math.abs(scale), i);
                        currentTransform.scale *= (scale < 0 ? Math.pow(-1, i) : 1);
                        currentTransform.directionalScale = directionalScale;
                        const initialStartVector = { x: startPos.x - center.x, y: startPos.y - center.y };

                        pointsToCopyFrom.forEach(p => {
                            const newPos = applyTransformToPoint(p, center, currentTransform.rotation, currentTransform.scale, currentTransform.directionalScale, initialStartVector);
                            const newPointData = { ...p, id: generateUniqueId(), x: newPos.x, y: newPos.y };
                            const finalNewPointId = applyPointUpdateOrMergeAtEndOfDrag(newPointData.id, newPointData, true); // Copies *can* merge into existing geometry
                            newIdMapForThisCopy.set(p.id, finalNewPointId); // Map original ID to the final ID of the new point
                        });
                        // Centers also get copied if they were part of initialDragPointStates
                        centersToCopyFrom.forEach(c => {
                             const newPos = applyTransformToPoint(c, center, currentTransform.rotation, currentTransform.scale, currentTransform.directionalScale, initialStartVector);
                             const newCenterData = { ...c, id: generateUniqueId(), x: newPos.x, y: newPos.y };
                             allPoints.push(newCenterData);
                             newIdMapForThisCopy.set(c.id, newCenterData.id);
                        });


                    } else { // Regular translation copy
                        const deltaX = dragPreviewPoints.find(dp => dp.type === POINT_TYPE_REGULAR)?.x - pointsToCopyFrom[0]?.x;
                        const deltaY = dragPreviewPoints.find(dp => dp.type === POINT_TYPE_REGULAR)?.y - pointsToCopyFrom[0]?.y;
                        const effectiveDeltaX = deltaX * i;
                        const effectiveDeltaY = deltaY * i;

                        pointsToCopyFrom.forEach(p => {
                            const newPointData = { ...p, id: generateUniqueId(), x: p.x + effectiveDeltaX, y: p.y + effectiveDeltaY };
                            const finalNewPointId = applyPointUpdateOrMergeAtEndOfDrag(newPointData.id, newPointData, true);
                            newIdMapForThisCopy.set(p.id, finalNewPointId);
                        });
                        centersToCopyFrom.forEach(c => {
                            const newCenterData = { ...c, id: generateUniqueId(), x: c.x + effectiveDeltaX, y: c.y + effectiveDeltaY };
                            allPoints.push(newCenterData);
                            newIdMapForThisCopy.set(c.id, newCenterData.id);
                        });
                    }

                    // Add new edges for the current copy based on the newIdMap
                    incidentEdgesForCopy.forEach(edge => {
                        const newId1 = newIdMapForThisCopy.get(edge.id1);
                        const newId2 = newIdMapForThisCopy.get(edge.id2);

                        if (newId1 && newId2 && newId1 !== newId2) {
                            const edgeExists = allEdges.some(e =>
                                (e.id1 === newId1 && e.id2 === newId2) ||
                                (e.id1 === newId2 && e.id2 === newId1)
                            );
                            if (!edgeExists) {
                                allEdges.push({ id1: newId1, id2: newId2 });
                            }
                        }
                    });
                }
            }
        }
    } else { // Not a drag (simple click or start drawing)
        if (currentMouseButton === 0) { // Left click
            const startPoint = findPointById(previewLineStartPointId);
            if (isDrawingMode && startPoint) {
                saveStateForUndo();
                let newPoint = null;
                const snappedDataForCompletedSegment = getSnappedPosition(startPoint, mousePos, shiftKey);

                // Handle snapping to existing points or edges
                if (targetPoint && targetPoint.type === 'regular' && targetPoint.id !== startPoint.id) {
                    const edgeExists = allEdges.some(e => (e.id1 === startPoint.id && e.id2 === targetPoint.id) || (e.id2 === startPoint.id && e.id1 === targetPoint.id));
                    if (!edgeExists) allEdges.push({ id1: startPoint.id, id2: targetPoint.id });
                    newPoint = targetPoint;
                } else if (targetEdge) {
                    const p1 = findPointById(targetEdge.id1);
                    const p2 = findPointById(targetEdge.id2);
                    if (p1 && p2) {
                        const closest = getClosestPointOnLineSegment(screenToData(mousePos), p1, p2);
                        newPoint = { id: generateUniqueId(), x: closest.x, y: closest.y, type: POINT_TYPE_REGULAR, color: currentColor };
                        allPoints.push(newPoint);
                        // Remove the old edge and add two new ones connected to the new point
                        allEdges = allEdges.filter(e => getEdgeId(e) !== getEdgeId(targetEdge));
                        allEdges.push({ id1: p1.id, id2: newPoint.id }, { id1: newPoint.id, id2: p2.id }, { id1: startPoint.id, id2: newPoint.id });
                    }
                } else {
                    // No snap to existing geometry, create a new point at the snapped or raw mouse position
                    newPoint = { id: generateUniqueId(), x: snappedDataForCompletedSegment.x, y: snappedDataForCompletedSegment.y, type: POINT_TYPE_REGULAR, color: currentColor };
                    allPoints.push(newPoint);
                    allEdges.push({ id1: startPoint.id, id2: newPoint.id });
                }

                // Update drawing sequence and reference data
                if (newPoint) {
                    const completedSegmentProps = getCompletedSegmentProperties(startPoint, newPoint, allEdges);
                    if (completedSegmentProps) {
                        if (drawingSequence.length > 0) {
                            drawingSequence[drawingSequence.length - 1].turn = completedSegmentProps.turnAngleRad;
                        }
                        drawingSequence.push({
                            length: completedSegmentProps.length,
                            turn: 0, // Placeholder, updated by next segment or on completion
                            endPointColor: newPoint.color
                        });
                        currentSequenceIndex = drawingSequence.length - 1;
                    }
                }

                if (shiftKey && newPoint && snappedDataForCompletedSegment) {
                    // Set frozen reference for subsequent segments
                    const completedSegmentProps = getCompletedSegmentProperties(startPoint, newPoint, allEdges);
                    if (completedSegmentProps) {
                        frozenReference_Origin_Data = completedSegmentProps.startPoint;
                        if (snappedDataForCompletedSegment.gridToGridSquaredSum > 0 && snappedDataForCompletedSegment.gridInterval) {
                            frozenReference_D_du = snappedDataForCompletedSegment.gridInterval * Math.sqrt(snappedDataForCompletedSegment.gridToGridSquaredSum);
                        } else {
                            frozenReference_D_du = completedSegmentProps.length;
                        }
                        frozenReference_D_g2g = snappedDataForCompletedSegment.gridToGridSquaredSum > 0 ? { g2gSquaredSum: snappedDataForCompletedSegment.gridToGridSquaredSum, interval: snappedDataForCompletedSegment.gridInterval } : null;
                        frozenReference_A_rad = completedSegmentProps.turnAngleRad;
                        frozenReference_A_baseRad = completedSegmentProps.precedingSegmentAbsoluteAngleRad;
                    }
                } else {
                    // Clear frozen reference if Shift is not held or no new segment
                    frozenReference_D_du = null;
                    frozenReference_D_g2g = null;
                    frozenReference_A_rad = null;
                    frozenReference_A_baseRad = null;
                    frozenReference_Origin_Data = null;
                }
                previewLineStartPointId = newPoint ? newPoint.id : null;
                if (!previewLineStartPointId) isDrawingMode = false;
                clickData.count = 0; // Reset click count after successful point placement
            } else { // Not drawing mode, so this is a general click/selection
                const now = Date.now();
                let primaryClickTarget = target; // target could be 'canvas' or an object

                if (primaryClickTarget && primaryClickTarget !== 'canvas') {
                    const targetId = primaryClickTarget.id || getEdgeId(primaryClickTarget);
                    let targetType;
                    if (primaryClickTarget.id) { // It's a point (regular or center)
                        targetType = (primaryClickTarget.type !== POINT_TYPE_REGULAR) ? 'center' : 'point';
                    } else { // It's an edge
                        targetType = 'edge';
                    }

                    // Handle double-click logic for target-specific actions
                    if (clickData.targetId === targetId && (now - clickData.timestamp) < DOUBLE_CLICK_MS) {
                        clickData.count++;
                    } else {
                        clickData.count = 1;
                        clickData.targetId = targetId;
                        clickData.type = targetType;
                    }
                    clickData.timestamp = now;

                    switch (clickData.count) {
                        case 1: // Single click: simple selection
                            if (targetType === 'point') {
                                applySelectionLogic([targetId], [], shiftKey, ctrlKey, false);
                            } else if (targetType === 'edge') {
                                applySelectionLogic([], [targetId], shiftKey, ctrlKey, false);
                            } else if (targetType === 'center') {
                                handleCenterSelection(targetId, shiftKey, ctrlKey);
                            }
                            break;
                        case 2: // Double click: expand selection (neighbors, connected edges, related geometry for centers)
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
                                    const relatedPoints = allPoints.filter(p => p.type === POINT_TYPE_REGULAR && distance(p, center) < (POINT_SELECT_RADIUS * 10 / viewTransform.scale)).map(p => p.id);
                                    const relatedEdges = allEdges.filter(e => relatedPoints.includes(e.id1) && relatedPoints.includes(e.id2)).map(e => getEdgeId(e));
                                    applySelectionLogic(relatedPoints, relatedEdges, shiftKey, ctrlKey, false);
                                }
                            }
                            break;
                        case 3: // Triple click: select full subgraph or all geometric elements
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
                                const allRegularPoints = allPoints.filter(p => p.type === POINT_TYPE_REGULAR).map(p => p.id);
                                const allGeometricEdges = allEdges.map(e => getEdgeId(e));
                                applySelectionLogic(allRegularPoints, allGeometricEdges, shiftKey, ctrlKey, false);
                            }
                            clickData.count = 0; // Reset click count after triple click
                            break;
                    }
                } else { // Clicked on empty canvas
                    clickData.count = 0; // Reset click count
                    saveStateForUndo();
                    // Deselect all
                    selectedPointIds = [];
                    selectedEdgeIds = [];
                    selectedCenterIds = [];
                    activeCenterId = null;
                    isDrawingMode = false;
                    previewLineStartPointId = null;

                    // Start new drawing segment
                    const startCoords = ghostPointPosition ? ghostPointPosition : screenToData(mousePos);
                    const newPoint = { id: generateUniqueId(), ...startCoords, type: POINT_TYPE_REGULAR, color: currentColor };
                    allPoints.push(newPoint);
                    isDrawingMode = true;
                    previewLineStartPointId = newPoint.id;
                    drawingSequence = []; // Reset drawing sequence for new line
                    currentSequenceIndex = 0;
                }
            }
        } else if (currentMouseButton === 2) { // Right-click (context menu or cancel action)
            performEscapeAction();
        }
    }

    // --- FINAL RESET OF ACTION STATE AFTER MOUSE UP ---
    isActionInProgress = false;
    isDragConfirmed = false;
    isPanningBackground = false;
    isRectangleSelecting = false;
    actionContext = null; // Clear context of the started action
    actionTargetPoint = null;
    transformIndicatorData = null; // Always clear transform indicator on mouseup
    isEdgeTransformDrag = false;
    isDraggingCenter = false;
    canvas.style.cursor = 'crosshair'; // Reset cursor
    ghostPoints = []; // Clear any active drag-specific ghost points
    // Note: ghostPointPosition is handled by keyup/keydown for Shift state, no need to force clear here unless Shift is up.
    if (!currentShiftPressed) { // Only clear if shift is not currently held
        ghostPointPosition = null;
    }
    currentAccumulatedRotation = 0; // Reset accumulated rotation for next potential transform
});