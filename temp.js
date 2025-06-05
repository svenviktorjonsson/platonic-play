





function prepareSnapInfoTexts(startPointData, targetDataPos, snappedOutput, shiftPressed, drawingContext) {
    if (!shiftPressed && (!showAngles && !showDistances)) return;

    const startScreen = dataToScreen(startPointData);
    const { angle: snappedAngleDegAbs, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn } = snappedOutput;
    const { offsetAngleRad, currentSegmentReferenceD, currentSegmentReferenceA_for_display, isFirstSegmentBeingDrawn } = drawingContext;

    const katexFontSize = 12;
    const midX = (startScreen.x + dataToScreen(targetDataPos).x) / 2;
    const midY = (startScreen.y + dataToScreen(targetDataPos).y) / 2;
    const visualLineAngleScreen = Math.atan2(dataToScreen(targetDataPos).y - startScreen.y, dataToScreen(targetDataPos).x - startScreen.x);
    const textPerpAngle = visualLineAngleScreen - Math.PI / 2;
    const textOffset = 18;
    let currentElementColor = shiftPressed ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';

    if (showDistances) {
        const distanceTextX = midX + Math.cos(textPerpAngle) * textOffset;
        const distanceTextY = midY + Math.sin(textPerpAngle) * textOffset;
        let distanceText;
        if (shiftPressed && !isFirstSegmentBeingDrawn && lengthSnapFactor !== null) {
            distanceText = formatSnapFactor(lengthSnapFactor, 'D');
        } else {
            const convertedValue = convertToDisplayUnits(snappedDistanceData);
            if (typeof convertedValue === 'string') {
                const num = parseFloat(convertedValue) || 0;
                const unit = convertedValue.replace(num.toString(), '');
                distanceText = `${formatNumber(num, distanceSigFigs)}\\mathrm{${unit}}`;
            } else {
                distanceText = `${formatNumber(convertedValue, distanceSigFigs)}\\mathrm{${currentUnit}}`;
            }
        }
        updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: katexFontSize, options: {textAlign: 'center', textBaseline: 'middle'} });
    }

    if (showAngles) {
        const angleBaseForArcRad = offsetAngleRad;
        let angleText;

        if (shiftPressed && !isFirstSegmentBeingDrawn && angleSnapFactor !== null) {
            angleText = formatSnapFactor(angleSnapFactor, 'A');
        } else {
            let angleToFormatDeg = isFirstSegmentBeingDrawn ? normalizeAngleDegrees(snappedAngleDegAbs) : (angleTurn !== null ? angleTurn * (180 / Math.PI) : normalizeAngleToPi(snappedAngleDegAbs * (Math.PI/180) - offsetAngleRad) * (180/Math.PI));
             if (angleToFormatDeg > 180.001 && Math.abs(angleToFormatDeg - 360) < 179.999 && !isFirstSegmentBeingDrawn) {
                 angleToFormatDeg -= 360;
            }
            angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
        }
        const signedTurningAngleRad = angleTurn !== null ? angleTurn : normalizeAngleToPi(snappedAngleDegAbs * (Math.PI/180) - offsetAngleRad);
        const arcRadius = 30;
        const bisectorAngleForText = angleBaseForArcRad + signedTurningAngleRad / 2;
        const angleTextX = startScreen.x + Math.cos(bisectorAngleForText) * (arcRadius + 15);
        const angleTextY = startScreen.y - Math.sin(bisectorAngleForText) * (arcRadius + 15);
        updateHtmlLabel({ id: 'snap-angle', content: angleText, x: angleTextX, y: angleTextY, color: currentElementColor, fontSize: katexFontSize, options: {textAlign: 'center', textBaseline: 'middle'} });
    }
}

canvas.addEventListener('mousemove', (event) => {
    mousePos = getMousePosOnCanvas(event, canvas);
    const oldShiftPressed = currentShiftPressed; currentShiftPressed = event.shiftKey;
    const currentAltPressed = event.altKey; let needsRedraw = false;
    if (currentAltPressed && !isActionInProgress) {
        const mouseDataPos = screenToData(mousePos); const edgeHoverThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
        const hoveredEdgeInfo = findClosestEdgeInfo(mouseDataPos, edgeHoverThresholdData);
        if (hoveredEdgeInfo && hoveredEdgeInfo.edge) {
            const edge = hoveredEdgeInfo.edge; const p1 = findPointById(edge.id1); const p2 = findPointById(edge.id2);
            if (p1 && p2) {
                const dx = p2.x - p1.x; const dy = p2.y - p1.y; const lenSq = dx * dx + dy * dy; let t = 0;
                if (lenSq > 1e-9) t = ((mouseDataPos.x - p1.x) * dx + (mouseDataPos.y - p1.y) * dy) / lenSq;
                t = Math.max(0, Math.min(1, t)); const snappedT = snapTValue(t, SEGMENT_SNAP_FRACTIONS);
                const snappedPointData = { x: p1.x + snappedT * dx, y: p1.y + snappedT * dy };
                const currentEdgeIdentifier = edge.id1 < edge.id2 ? edge.id1 + edge.id2 : edge.id2 + edge.id1;
                let previewEdgeIdentifier = null;
                if (previewAltSnapOnEdge && previewAltSnapOnEdge.edge) { const prevEdge = previewAltSnapOnEdge.edge; previewEdgeIdentifier = prevEdge.id1 < prevEdge.id2 ? prevEdge.id1 + prevEdge.id2 : prevEdge.id2 + prevEdge.id1; }
                if (!previewAltSnapOnEdge || previewEdgeIdentifier !== currentEdgeIdentifier || previewAltSnapOnEdge.pointData.x !== snappedPointData.x || previewAltSnapOnEdge.pointData.y !== snappedPointData.y) {
                    previewAltSnapOnEdge = { edge: edge, pointData: snappedPointData, t_snapped: snappedT }; needsRedraw = true;
                }
            } else { if (previewAltSnapOnEdge !== null) { previewAltSnapOnEdge = null; needsRedraw = true; } }
        } else { if (previewAltSnapOnEdge !== null) { previewAltSnapOnEdge = null; needsRedraw = true; } }
    } else { if (previewAltSnapOnEdge !== null) { previewAltSnapOnEdge = null; needsRedraw = true; } }
    if (!isActionInProgress) {
        const hoveredPoint = findClickedPoint(mousePos);
        if (hoveredPoint) canvas.style.cursor = 'grab';
        else if (currentAltPressed && previewAltSnapOnEdge) canvas.style.cursor = 'crosshair';
        else if (!currentAltPressed) {
            const mouseDataPos = screenToData(mousePos); const edgeHoverThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
            const hoveredEdgeForSelect = findClosestEdgeInfo(mouseDataPos, edgeHoverThresholdData);
            if (hoveredEdgeForSelect) canvas.style.cursor = 'grab'; else canvas.style.cursor = 'crosshair';
        } else canvas.style.cursor = 'crosshair';
        if (isDrawingMode && previewLineStartPointId) needsRedraw = true;
        if (oldShiftPressed !== currentShiftPressed && isDrawingMode && previewLineStartPointId) needsRedraw = true;
        if (needsRedraw) redrawAll(); return;
    }
    if (!isDragConfirmed && distance(mousePos, actionStartPos) > DRAG_THRESHOLD) {
        isDragConfirmed = true;
        if (currentMouseButton === 2 && !actionTargetPoint) { isRectangleSelecting = true; isDrawingMode = false; previewLineStartPointId = null; frozenReference_A_rad = null; frozenReference_A_baseRad = null; frozenReference_D_du = null; frozenReference_Origin_Data = null; canvas.style.cursor = 'default'; }
        else if (currentMouseButton === 0 && actionTargetPoint) { isRectangleSelecting = false; canvas.style.cursor = 'grabbing'; }
        else if (currentMouseButton === 0 && isPanningBackground) canvas.style.cursor = 'move';
        needsRedraw = true;
    }
    if (isDragConfirmed) {
        if (currentMouseButton === 0) {
            if (isPanningBackground) {
                const deltaX = mousePos.x - actionStartPos.x; const deltaY = mousePos.y - actionStartPos.y;
                viewTransform.offsetX = backgroundPanStartOffset.x + deltaX; viewTransform.offsetY = backgroundPanStartOffset.y - deltaY;
            } else if (actionTargetPoint) {
                if (isTransformDrag && initialCenterStateForTransform && activeCenterId) {
                    const activeCenterCurrentPreview = dragPreviewPoints.find(p => p.id === activeCenterId);
                    if (!activeCenterCurrentPreview) { isTransformDrag = false; redrawAll(); return; }
                    let currentCenterPosData = { x: initialCenterStateForTransform.x, y: initialCenterStateForTransform.y };
                    if (actionTargetPoint.id === activeCenterId) {
                        const mouseData = screenToData(mousePos); const actionStartData = screenToData(actionStartPos);
                        currentCenterPosData.x = initialCenterStateForTransform.x + (mouseData.x - actionStartData.x); currentCenterPosData.y = initialCenterStateForTransform.y + (mouseData.y - actionStartData.y);
                        activeCenterCurrentPreview.x = currentCenterPosData.x; activeCenterCurrentPreview.y = currentCenterPosData.y;
                    } else { currentCenterPosData = { x: activeCenterCurrentPreview.x, y: activeCenterCurrentPreview.y }; }
                    const centerDef = findPointById(activeCenterId); if (!centerDef) { isTransformDrag = false; redrawAll(); return; }
                    const doRotation = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_rotate_only';
                    const doScaling = centerDef.type === 'center_rotate_scale' || centerDef.type === 'center_scale_only';
                    let overallDeltaAngle = 0; let overallScaleFactor = 1;
                    const mouseDataCurrent = screenToData(mousePos);
                    const mouseVecX = mouseDataCurrent.x - currentCenterPosData.x; const mouseVecY = mouseDataCurrent.y - currentCenterPosData.y;
                    if (doRotation) { const currentMouseAngleRelCenter = Math.atan2(mouseVecY, mouseVecX); overallDeltaAngle = currentMouseAngleRelCenter - initialMouseAngleToCenter; }
                    if (doScaling) { const currentMouseDistRelCenter = Math.sqrt(mouseVecX*mouseVecX + mouseVecY*mouseVecY); if (initialMouseDistanceToCenter > 0.001) overallScaleFactor = currentMouseDistRelCenter / initialMouseDistanceToCenter; }
                    initialStatesForTransform.forEach(initialPtState => {
                        const pointToUpdateInPreview = dragPreviewPoints.find(dp => dp.id === initialPtState.id); if (!pointToUpdateInPreview) return;
                        let relX = initialPtState.x - initialCenterStateForTransform.x; let relY = initialPtState.y - initialCenterStateForTransform.y;
                        if (doScaling) { relX *= overallScaleFactor; relY *= overallScaleFactor; }
                        if (doRotation) { const rX = relX*Math.cos(overallDeltaAngle) - relY*Math.sin(overallDeltaAngle); const rY = relX*Math.sin(overallDeltaAngle) + relY*Math.cos(overallDeltaAngle); relX=rX; relY=rY; }
                        pointToUpdateInPreview.x = currentCenterPosData.x + relX; pointToUpdateInPreview.y = currentCenterPosData.y + relY;
                    });
                } else {
                    const mouseData = screenToData(mousePos); const actionStartData = screenToData(actionStartPos);
                    const deltaX = mouseData.x - actionStartData.x; const deltaY = mouseData.y - actionStartData.y;
                    dragPreviewPoints.forEach(previewPointRef => {
                        const originalPointFromAllPoints = allPoints.find(ap => ap.id === previewPointRef.id);
                        if (originalPointFromAllPoints) {
                            const previewPointToUpdate = dragPreviewPoints.find(dp => dp.id === previewPointRef.id);
                            if(previewPointToUpdate) { previewPointToUpdate.x = originalPointFromAllPoints.x + deltaX; previewPointToUpdate.y = originalPointFromAllPoints.y + deltaY; }
                        }
                    });
                }
            }
        }
        needsRedraw = true;
    }
    if (needsRedraw) redrawAll();
});