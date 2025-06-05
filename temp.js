let gridState = {
    interval1: null,
    interval2: null,
    alpha1: 0,
    alpha2: 0,
    lastCalculatedScale: null
};

function calculateGridIntervals(viewTransformScale) {
    const targetScreenSpacing = 80;
    const effectiveDataInterval = targetScreenSpacing / viewTransformScale;
    
    const logInterval = Math.log10(effectiveDataInterval);
    const lowerPowerOf10 = Math.pow(10, Math.floor(logInterval));
    const higherPowerOf10 = Math.pow(10, Math.ceil(logInterval));
    
    let grid1Interval = lowerPowerOf10;
    let grid2Interval = higherPowerOf10;
    let alpha1 = 1;
    let alpha2 = 0;
    
    if (Math.abs(higherPowerOf10 - lowerPowerOf10) > lowerPowerOf10 * 0.0001) {
        const logInterpFactor = (logInterval - Math.log10(lowerPowerOf10)) / (Math.log10(higherPowerOf10) - Math.log10(lowerPowerOf10));
        
        const transitionZoneStart = 0.2;
        const transitionZoneEnd = 0.8;
        
        let interpValue = (logInterpFactor - transitionZoneStart) / (transitionZoneEnd - transitionZoneStart);
        interpValue = Math.max(0, Math.min(1, interpValue));
        interpValue = interpValue * interpValue * (3 - 2 * interpValue);
        
        alpha1 = 1 - interpValue;
        alpha2 = interpValue;
    } else {
        grid2Interval = null;
    }
    
    return { grid1Interval, grid2Interval, alpha1, alpha2 };
}

function updateGridStateOnZoom() {
    const gridCalculation = calculateGridIntervals(viewTransform.scale);
    gridState = {
        interval1: gridCalculation.grid1Interval,
        interval2: gridCalculation.grid2Interval,
        alpha1: gridCalculation.alpha1,
        alpha2: gridCalculation.alpha2,
        lastCalculatedScale: viewTransform.scale
    };
}

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);

    if (showGrid) {
        if (gridState.lastCalculatedScale === null) {
            updateGridStateOnZoom();
        }

        const r = parseInt(gridColor.slice(1, 3), 16);
        const g = parseInt(gridColor.slice(3, 5), 16);
        const b = parseInt(gridColor.slice(5, 7), 16);

        const topLeftData = screenToData({ x: 0, y: 0 });
        const bottomRightData = screenToData({ x: actualCanvasWidth, y: actualCanvasHeight });

        const viewMinX = Math.min(topLeftData.x, bottomRightData.x);
        const viewMaxX = Math.max(topLeftData.x, bottomRightData.x);
        const viewMinY = Math.min(topLeftData.y, bottomRightData.y);
        const viewMaxY = Math.max(topLeftData.y, bottomRightData.y);

        const drawGridLayer = (interval, alpha) => {
            if (interval === null || alpha <= 0.001) return;
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${gridAlpha * alpha})`;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${gridAlpha * alpha})`;
            const startGridX = Math.floor(viewMinX / interval) * interval;
            const endGridX = Math.ceil(viewMaxX / interval) * interval;
            const startGridY = Math.floor(viewMinY / interval) * interval;
            const endGridY = Math.ceil(viewMaxY / interval) * interval;
            if (gridType === 'lines') {
                ctx.beginPath();
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

        drawGridLayer(gridState.interval1, gridState.alpha1);
        drawGridLayer(gridState.interval2, gridState.alpha2);
    }

    const drawingContextForReferences = previewLineStartPointId ? getDrawingContext(previewLineStartPointId) : null;
    if (currentShiftPressed && drawingContextForReferences && (drawingContextForReferences.frozen_Origin_Data_to_display || !drawingContextForReferences.isFirstSegmentBeingDrawn)) {
        if (drawingContextForReferences.frozen_Origin_Data_to_display) {
            drawReferenceElementsGeometry(drawingContextForReferences, currentShiftPressed);
            prepareReferenceElementsTexts(drawingContextForReferences, currentShiftPressed);
        } else if (!drawingContextForReferences.isFirstSegmentBeingDrawn) {
            prepareReferenceElementsTexts(drawingContextForReferences, currentShiftPressed);
        }
    }

    drawAllEdges();
    const pointsToDraw = allPoints.map(p => {
        if (isDragConfirmed && dragPreviewPoints.length > 0) {
            const preview = dragPreviewPoints.find(dp => dp.id === p.id);
            return preview || p;
        }
        return p;
    });
    pointsToDraw.forEach(point => drawPoint(point));

    if (isDrawingMode && previewLineStartPointId && !isDragConfirmed && !isRectangleSelecting && !isActionInProgress) {
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
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = LINE_WIDTH;
            ctx.stroke();
            ctx.setLineDash([]);
            if (showAngles) {
                const angleBaseForArcRad = drawingContext.offsetAngleRad;
                const currentLineAbsoluteAngleRad = snappedData.angle * (Math.PI / 180);
                const signedTurningAngleRad = snappedData.angleTurn !== null ? snappedData.angleTurn : normalizeAngleToPi(currentLineAbsoluteAngleRad - angleBaseForArcRad);
                const arcEndAngleForSweepRad = angleBaseForArcRad + signedTurningAngleRad;
                const arcRadius = 30;
                let currentArcColor = currentShiftPressed ? 'rgba(230, 230, 100, 0.8)' : 'rgba(200, 200, 200, 0.7)';
                drawAngleArc(startScreen, angleBaseForArcRad, arcEndAngleForSweepRad, arcRadius, currentArcColor, false);
                ctx.save();
                ctx.beginPath();
                const baseExtDataX = startPoint.x + Math.cos(angleBaseForArcRad) * 30 / viewTransform.scale;
                const baseExtDataY = startPoint.y + Math.sin(angleBaseForArcRad) * 30 / viewTransform.scale;
                const baseExtScreen = dataToScreen({ x: baseExtDataX, y: baseExtDataY });
                ctx.moveTo(startScreen.x, startScreen.y);
                ctx.lineTo(baseExtScreen.x, baseExtScreen.y);
                ctx.strokeStyle = 'rgba(180, 180, 180, 0.6)';
                ctx.setLineDash([2, 3]);
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
            }
            prepareSnapInfoTexts(startPoint, targetPosData, snappedData, currentShiftPressed, drawingContext);
        }
    }

    if (previewAltSnapOnEdge && previewAltSnapOnEdge.pointData) {
        const snapMarkerPosScreen = dataToScreen(previewAltSnapOnEdge.pointData);
        ctx.beginPath();
        ctx.arc(snapMarkerPosScreen.x, snapMarkerPosScreen.y, POINT_RADIUS * 0.8, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200, 200, 0, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
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
    cleanupHtmlLabels();
}