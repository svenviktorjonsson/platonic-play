

function cleanupHtmlLabels() {
    const coordinateLabels = new Set(['mouse-coord-x', 'mouse-coord-y']);
    coordinateLabels.forEach(id => labelsToKeepThisFrame.add(id));
    
    for (const [id, el] of activeHtmlLabels.entries()) {
        if (!labelsToKeepThisFrame.has(id)) {
            el.remove();
            activeHtmlLabels.delete(id);
        }
    }
}

function drawReferenceElementsGeometry(context, shiftPressed) {
    if ((!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display) return;

    const refElementColor = FROZEN_REFERENCE_COLOR;
    const frozenOriginScreen = dataToScreen(context.frozen_Origin_Data_to_display);
    const epsilon = 1e-6;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = refElementColor;

    if (showAngles && context.displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(context.displayAngleA_valueRad_for_A_equals_label) > epsilon) {
        const arcRadius_A_screen = 35;
        const startAngleData = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        const turnAngleData = context.displayAngleA_valueRad_for_A_equals_label;
        const endAngleData = startAngleData + turnAngleData;

        const baseLineEndData_A = {
            x: context.frozen_Origin_Data_to_display.x + Math.cos(startAngleData) * (arcRadius_A_screen / viewTransform.scale),
            y: context.frozen_Origin_Data_to_display.y + Math.sin(startAngleData) * (arcRadius_A_screen / viewTransform.scale)
        };
        const baseLineEndScreen_A = dataToScreen(baseLineEndData_A);

        ctx.beginPath();
        ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y);
        ctx.lineTo(baseLineEndScreen_A.x, baseLineEndScreen_A.y);
        ctx.setLineDash([1, 3]);
        ctx.stroke();

        drawAngleArc(frozenOriginScreen, startAngleData, endAngleData, arcRadius_A_screen, refElementColor, true);
    }
    ctx.restore();
}

function prepareReferenceElementsTexts(context, shiftPressed) {
    if (!showAngles && !showDistances) {
        labelsToKeepThisFrame.delete('ref-dist');
        labelsToKeepThisFrame.delete('ref-angle');
        return;
    }

    const refElementColor = FROZEN_REFERENCE_COLOR;
    const katexFontSize = 11;
    const epsilon = 1e-6;

    const startPointData = context.frozen_Origin_Data_to_display;
    const turnAngleData = context.displayAngleA_valueRad_for_A_equals_label;
    const baseAngleData = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
    const distanceData = context.frozen_D_du_to_display;
    const frozenG2GSquaredSum = context.frozen_D_g2g_to_display ? context.frozen_D_g2g_to_display.g2gSquaredSum : null;
    const frozenG2GInterval = context.frozen_D_g2g_to_display ? context.frozen_D_g2g_to_display.interval : null;

    if (!startPointData) {
        labelsToKeepThisFrame.delete('ref-dist');
        labelsToKeepThisFrame.delete('ref-angle');
        return;
    }

    const absoluteAngleForRefLine = baseAngleData + turnAngleData;
    const endPointData = {
        x: startPointData.x + distanceData * Math.cos(absoluteAngleForRefLine),
        y: startPointData.y + distanceData * Math.sin(absoluteAngleForRefLine)
    };

    const startPointScreen = dataToScreen(startPointData);
    const endPointScreen = dataToScreen(endPointData);

    if (showDistances && distanceData !== null && distanceData > epsilon) {
        let distanceText = '';

        if (frozenG2GSquaredSum !== null && frozenG2GSquaredSum > 0 && frozenG2GInterval) {
            const [coeff, radicand] = simplifySquareRoot(frozenG2GSquaredSum);
            const finalCoeff = frozenG2GInterval * coeff;
            distanceText = `\\delta = ${formatSimplifiedRoot(finalCoeff, radicand)}`;
        } else {
            const platonicValue = distanceData / DEFAULT_REFERENCE_DISTANCE;
            distanceText = `\\delta = ${formatNumber(platonicValue, distanceSigFigs)}`;
        }

        const edgeAngleScreen = Math.atan2(endPointScreen.y - startPointScreen.y, endPointScreen.x - startPointScreen.x);
        const midX_screen = (startPointScreen.x + endPointScreen.x) / 2;
        const midY_screen = (startPointScreen.y + endPointScreen.y) / 2;
        const textOffset = 18;

        let rotationDeg = edgeAngleScreen * (180 / Math.PI);
        if (rotationDeg > 90 || rotationDeg < -90) {
            rotationDeg += 180;
        }

        let textPerpAngle = edgeAngleScreen - Math.PI / 2;
        if (Math.sin(textPerpAngle) > 0) {
            textPerpAngle += Math.PI;
        }
        const textDistLabelX_D = midX_screen + Math.cos(textPerpAngle) * textOffset;
        const textDistLabelY_D = midY_screen + Math.sin(textPerpAngle) * textOffset;

        updateHtmlLabel({
            id: 'ref-dist',
            content: distanceText,
            x: textDistLabelX_D,
            y: textDistLabelY_D,
            color: refElementColor,
            fontSize: katexFontSize,
            options: {
                textAlign: 'center',
                textBaseline: 'middle',
                rotation: rotationDeg
            }
        });
    } else {
        labelsToKeepThisFrame.delete('ref-dist');
    }

    if (showAngles && turnAngleData !== null && Math.abs(turnAngleData) > epsilon) {
        const startAngleCanvas = -baseAngleData;
        const endAngleCanvas = -(baseAngleData + turnAngleData);

        const sumCos = Math.cos(startAngleCanvas) + Math.cos(endAngleCanvas);
        const sumSin = Math.sin(startAngleCanvas) + Math.sin(endAngleCanvas);
        let bisectorCanvasAngle = Math.atan2(sumSin, sumCos);
        const angleLabelOffsetDistance = 35 + 15;

        const textAngleLabelX_A = startPointScreen.x + Math.cos(bisectorCanvasAngle) * angleLabelOffsetDistance;
        const textAngleLabelY_A = startPointScreen.y + Math.sin(bisectorCanvasAngle) * angleLabelOffsetDistance;

        const aValueDeg = turnAngleData * (180 / Math.PI);
        const aKatexText = `\\theta = ${formatNumber(aValueDeg, angleSigFigs)}^{\\circ}`;

        updateHtmlLabel({
            id: 'ref-angle',
            content: aKatexText,
            x: textAngleLabelX_A,
            y: textAngleLabelY_A,
            color: refElementColor,
            fontSize: katexFontSize,
            options: { textAlign: 'center', textBaseline: 'middle' }
        });
    } else {
        labelsToKeepThisFrame.delete('ref-angle');
    }
}

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
        if (frozenReference_Origin_Data) {
            const frozenDisplayContext = {
                frozen_Origin_Data_to_display: frozenReference_Origin_Data,
                displayAngleA_valueRad_for_A_equals_label: frozenReference_A_rad,
                frozen_A_baseRad_to_display: frozenReference_A_baseRad,
                frozen_D_du_to_display: frozenReference_D_du,
                frozen_D_g2g_to_display: frozenReference_D_g2g
            };
            drawReferenceElementsGeometry(frozenDisplayContext, true);
            prepareReferenceElementsTexts(frozenDisplayContext, true);
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
            const currentPreviewDrawingContext = getDrawingContext(startPoint.id);
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
            prepareSnapInfoTexts(startPoint, targetPosData, snappedData, currentShiftPressed, currentPreviewDrawingContext);
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