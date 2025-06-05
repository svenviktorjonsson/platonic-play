function formatNumber(value, sigFigs) {
    if (value === 0) return "0";
    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";

    if (absValue >= 1000 || (absValue !== 0 && absValue < 0.001)) {
        return sign + absValue.toExponential(Math.max(0, sigFigs - 1));
    } else {
        const integerDigits = absValue < 1 ? 0 : Math.floor(Math.log10(absValue)) + 1;
        let decimalPlacesToDisplay;
        if (absValue === 0) {
            decimalPlacesToDisplay = sigFigs -1;
        } else if (absValue < 1) {
            let k = 0;
            let temp = absValue;
            while (temp < 1 && k < sigFigs + 5) {
                temp *= 10;
                k++;
            }
            decimalPlacesToDisplay = Math.max(0, sigFigs + k - 1 -1);
        } else {
            decimalPlacesToDisplay = Math.max(0, sigFigs - integerDigits);
        }
        decimalPlacesToDisplay = Math.min(decimalPlacesToDisplay, 10);
        let fixedStr = absValue.toFixed(decimalPlacesToDisplay);
        return sign + parseFloat(fixedStr).toString();
    }
}

function getDrawingContext(currentDrawStartPointId) {
    let offsetAngleRad = 0;
    let currentSegmentReferenceD = DEFAULT_REFERENCE_DISTANCE;
    let currentSegmentReferenceA = DEFAULT_REFERENCE_ANGLE_RAD;
    let isFirstSegmentBeingDrawn = true;

    const segment1_prev_to_current = getPrecedingSegment(currentDrawStartPointId);

    if (segment1_prev_to_current) {
        isFirstSegmentBeingDrawn = false;
        offsetAngleRad = segment1_prev_to_current.angleRad;
        currentSegmentReferenceD = frozenReference_D_du !== null ? frozenReference_D_du : DEFAULT_REFERENCE_DISTANCE;
        currentSegmentReferenceA = frozenReference_A_rad !== null ? Math.abs(frozenReference_A_rad) : DEFAULT_REFERENCE_ANGLE_RAD;
    } else {
        currentSegmentReferenceD = DEFAULT_REFERENCE_DISTANCE;
        currentSegmentReferenceA = DEFAULT_REFERENCE_ANGLE_RAD;
    }

    return {
        offsetAngleRad,
        currentSegmentReferenceD,
        currentSegmentReferenceA,
        isFirstSegmentBeingDrawn,
        frozen_A_rad_to_display: frozenReference_A_rad,
        frozen_A_baseRad_to_display: frozenReference_A_baseRad,
        frozen_D_du_to_display: frozenReference_D_du,
        frozen_Origin_Data_to_display: frozenReference_Origin_Data
    };
}

function drawReferenceElements(context, shiftPressed) {
    if (!shiftPressed || (!showAngles && !showDistances)) return;

    const {
        frozen_A_rad_to_display,
        frozen_A_baseRad_to_display,
        frozen_D_du_to_display,
        frozen_Origin_Data_to_display
    } = context;

    if (!frozen_Origin_Data_to_display) return;

    ctx.save();
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const refElementColor = 'rgba(240, 240, 130, 0.9)';
    const refElementTextColor = 'rgba(240, 240, 130, 1)';
    const textOutlineColor = 'rgba(50,50,0,0.6)';
    ctx.lineWidth = 3;

    const frozenOriginScreen = dataToScreen(frozen_Origin_Data_to_display);

    if (showDistances && frozen_D_du_to_display !== null && frozen_D_du_to_display > 0.0001) {
        const segmentPoint2_Data_for_D = {
            x: frozen_Origin_Data_to_display.x + frozen_D_du_to_display * Math.cos(frozen_A_baseRad_to_display + (frozen_A_rad_to_display !== null ? frozen_A_rad_to_display : 0) ),
            y: frozen_Origin_Data_to_display.y + frozen_D_du_to_display * Math.sin(frozen_A_baseRad_to_display + (frozen_A_rad_to_display !== null ? frozen_A_rad_to_display : 0) )
        };
         if (frozen_A_baseRad_to_display === null && frozen_A_rad_to_display !== null) { // D from first segment, A is absolute
            segmentPoint2_Data_for_D.x = frozen_Origin_Data_to_display.x + frozen_D_du_to_display * Math.cos(frozen_A_rad_to_display);
            segmentPoint2_Data_for_D.y = frozen_Origin_Data_to_display.y + frozen_D_du_to_display * Math.sin(frozen_A_rad_to_display);
        }

        const segmentPoint2_Screen_for_D = dataToScreen(segmentPoint2_Data_for_D);

        ctx.beginPath();
        ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y);
        ctx.lineTo(segmentPoint2_Screen_for_D.x, segmentPoint2_Screen_for_D.y);
        ctx.strokeStyle = refElementColor;
        ctx.setLineDash(DASH_PATTERN);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        const midX_D = (frozenOriginScreen.x + segmentPoint2_Screen_for_D.x) / 2;
        const midY_D = (frozenOriginScreen.y + segmentPoint2_Screen_for_D.y) / 2;
        const lineAngle_D = Math.atan2(segmentPoint2_Screen_for_D.y - frozenOriginScreen.y, segmentPoint2_Screen_for_D.x - frozenOriginScreen.x);
        const textPerpAngle_D = lineAngle_D - Math.PI / 2;
        const textDistLabelX_D = midX_D + Math.cos(textPerpAngle_D) * 15;
        const textDistLabelY_D = midY_D + Math.sin(textPerpAngle_D) * 15;
        const dValueConverted = convertToDisplayUnits(frozen_D_du_to_display);
        const dText = `D = ${formatNumber(dValueConverted, distanceSigFigs)}${currentUnit}`;
        
        ctx.lineWidth = 3; ctx.strokeStyle = textOutlineColor; ctx.strokeText(dText, textDistLabelX_D, textDistLabelY_D);
        ctx.fillStyle = refElementTextColor; ctx.fillText(dText, textDistLabelX_D, textDistLabelY_D);
    }

    if (showAngles && frozen_A_rad_to_display !== null && Math.abs(frozen_A_rad_to_display) > 0.001) {
        const arcRadius_A = 35;
        const startAngleForA_arc_Rad = frozen_A_baseRad_to_display !== null ? frozen_A_baseRad_to_display : 0;
        const endAngleForA_arc_Rad = startAngleForA_arc_Rad + frozen_A_rad_to_display;

        const baseLineEndData_A = { x: frozen_Origin_Data_to_display.x + Math.cos(startAngleForA_arc_Rad)*(arcRadius_A*1.2/viewTransform.scale), y: frozen_Origin_Data_to_display.y + Math.sin(startAngleForA_arc_Rad)*(arcRadius_A*1.2/viewTransform.scale) };
        const baseLineEndScreen_A = dataToScreen(baseLineEndData_A);
        ctx.beginPath(); ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y); ctx.lineTo(baseLineEndScreen_A.x, baseLineEndScreen_A.y);
        ctx.strokeStyle = refElementColor; ctx.setLineDash(DASH_PATTERN); ctx.lineWidth=1; ctx.stroke();

        const refLineA_EndData = { x: frozen_Origin_Data_to_display.x + Math.cos(endAngleForA_arc_Rad)*(arcRadius_A*1.2/viewTransform.scale), y: frozen_Origin_Data_to_display.y + Math.sin(endAngleForA_arc_Rad)*(arcRadius_A*1.2/viewTransform.scale) };
        const refLineA_EndScreen = dataToScreen(refLineA_EndData);
        ctx.beginPath(); ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y); ctx.lineTo(refLineA_EndScreen.x, refLineA_EndScreen.y); ctx.stroke();

        drawAngleArc(frozenOriginScreen, startAngleForA_arc_Rad, endAngleForA_arc_Rad, arcRadius_A, refElementColor, true);
        
        const bisectorAngle_A = startAngleForA_arc_Rad + frozen_A_rad_to_display / 2;
        const textAngleLabelX_A = frozenOriginScreen.x + Math.cos(bisectorAngle_A) * (arcRadius_A + 15);
        const textAngleLabelY_A = frozenOriginScreen.y - Math.sin(bisectorAngle_A) * (arcRadius_A + 15);
        const aValueDeg = frozen_A_rad_to_display * (180 / Math.PI);
        const aText = `A = ${formatNumber(aValueDeg, angleSigFigs)}°`;
        ctx.lineWidth = 3; ctx.strokeStyle = textOutlineColor; ctx.strokeText(aText, textAngleLabelX_A, textAngleLabelY_A);
        ctx.fillStyle = refElementTextColor; ctx.fillText(aText, textAngleLabelX_A, textAngleLabelY_A);
    }
    ctx.restore();
}

function drawSnapInfo(startPointData, targetDataPos, snappedOutput, shiftPressed, drawingContext) {
    if (!showAngles && !showDistances && !shiftPressed) return; 

    const startScreen = dataToScreen(startPointData);
    const targetScreen = dataToScreen(targetDataPos);
    const { angle: snappedAngleDegAbs, distance: snappedDistanceData } = snappedOutput;
    const currentLineAbsoluteAngleRad = snappedAngleDegAbs * (Math.PI / 180);
    const {
        offsetAngleRad,
        currentSegmentReferenceD,
        currentSegmentReferenceA,
        isFirstSegmentBeingDrawn
    } = drawingContext;

    ctx.save();
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const midX = (startScreen.x + targetScreen.x) / 2;
    const midY = (startScreen.y + targetScreen.y) / 2;
    const visualLineAngleScreen = Math.atan2(targetScreen.y - startScreen.y, targetScreen.x - startScreen.x);
    const textPerpAngle = visualLineAngleScreen - Math.PI / 2;
    const textOffset = 18;

    let currentAngleTextColor = 'rgba(230, 230, 230, 0.95)';
    let currentAngleArcColor = 'rgba(200, 200, 200, 0.7)';
    let currentAngleTextOutlineColor = 'rgba(20, 20, 20, 0.7)';
    
    const signedTurningAngleRad = normalizeAngleToPi(currentLineAbsoluteAngleRad - offsetAngleRad);

    if (showDistances && shiftPressed) {
        ctx.lineWidth = 3;
        ctx.fillStyle = currentAngleTextColor;
        ctx.strokeStyle = currentAngleTextOutlineColor;
        const distanceTextX = midX + Math.cos(textPerpAngle) * textOffset;
        const distanceTextY = midY + Math.sin(textPerpAngle) * textOffset;
        const distanceText = getRelativeDistanceDisplay(snappedDistanceData, currentSegmentReferenceD);
        ctx.strokeText(distanceText, distanceTextX, distanceTextY);
        ctx.fillText(distanceText, distanceTextX, distanceTextY);
    } else if (showDistances && !shiftPressed) {
        ctx.lineWidth = 3;
        ctx.fillStyle = currentAngleTextColor;
        ctx.strokeStyle = currentAngleTextOutlineColor;
        const distanceTextX = midX + Math.cos(textPerpAngle) * textOffset;
        const distanceTextY = midY + Math.sin(textPerpAngle) * textOffset;
        const d = convertToDisplayUnits(snappedDistanceData);
        const distanceText = (typeof d === 'string') ? d : `${formatNumber(d, distanceSigFigs)}${currentUnit}`;
        ctx.strokeText(distanceText, distanceTextX, distanceTextY);
        ctx.fillText(distanceText, distanceTextX, distanceTextY);
    }


    if (showAngles) {
        const angleBaseForArcRad = offsetAngleRad;
        const baseExtDataX = startPointData.x + Math.cos(angleBaseForArcRad) * 30 / viewTransform.scale;
        const baseExtDataY = startPointData.y + Math.sin(angleBaseForArcRad) * 30 / viewTransform.scale;
        const baseExtScreen = dataToScreen({ x: baseExtDataX, y: baseExtDataY });
        ctx.beginPath();
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(baseExtScreen.x, baseExtScreen.y);
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.6)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        const arcEndAngleForSweepRad = angleBaseForArcRad + signedTurningAngleRad;
        const arcRadius = 30;
        
        let angleLabel = "";
        const displayTurnDegSigned = signedTurningAngleRad * (180 / Math.PI);

        if (shiftPressed) {
            let isSnappedToFractionOfA = false;
            if (!isFirstSegmentBeingDrawn && currentSegmentReferenceA > 0.001) {
                const currentTurnMagRad = Math.abs(signedTurningAngleRad);
                const ratioToA = currentTurnMagRad / currentSegmentReferenceA;
                
                for (const snapFrac of SNAP_ANGLE_FRACTIONS_FOR_A_DISPLAY) {
                    if (Math.abs(ratioToA - snapFrac) < 0.02) { 
                        angleLabel = `${formatFraction(snapFrac)} A`;
                        isSnappedToFractionOfA = true;
                        break;
                    }
                }
            }
            
            if (Math.abs(signedTurningAngleRad) < 0.01) {
                angleLabel = `0 A`;
                isSnappedToFractionOfA = true; 
            }

            if (isSnappedToFractionOfA) {
                currentAngleTextColor = 'rgba(240, 240, 150, 0.95)';
                currentAngleArcColor = 'rgba(230, 230, 100, 0.8)';
                currentAngleTextOutlineColor = 'rgba(50,50,0,0.6)';
            }
            if (!angleLabel) { 
                 angleLabel = `${formatNumber(displayTurnDegSigned, angleSigFigs)}°`;
            }
        } else {
            if (isFirstSegmentBeingDrawn) {
                let angleToFormatDeg = normalizeAngleDegrees(snappedAngleDegAbs);
                let formattedAngle;
                if (angleToFormatDeg > 180.001 && Math.abs(angleToFormatDeg - 360) < 179.999 ) {
                    formattedAngle = formatNumber(angleToFormatDeg - 360, angleSigFigs);
                } else {
                    formattedAngle = formatNumber(angleToFormatDeg, angleSigFigs);
                }
                angleLabel = `${formattedAngle}°`;
            } else {
                angleLabel = `${formatNumber(displayTurnDegSigned, angleSigFigs)}°`;
            }
        }
        
        ctx.fillStyle = currentAngleTextColor;
        ctx.strokeStyle = currentAngleTextOutlineColor;
        ctx.lineWidth = 3;

        drawAngleArc(startScreen, angleBaseForArcRad, arcEndAngleForSweepRad, arcRadius, currentAngleArcColor, false);

        const bisectorAngleForText = angleBaseForArcRad + signedTurningAngleRad / 2;
        const angleTextRadius = arcRadius + 15;
        const angleTextX = startScreen.x + Math.cos(bisectorAngleForText) * angleTextRadius;
        const angleTextY = startScreen.y - Math.sin(bisectorAngleForText) * angleTextRadius;
        
        ctx.strokeText(angleLabel, angleTextX, angleTextY);
        ctx.fillText(angleLabel, angleTextX, angleTextY);
    }
    ctx.restore();
}

function redrawAll() {
    const actualCanvasWidth = canvas.width / dpr; const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform(); ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);
    
    const drawingContextForReferences = previewLineStartPointId ? getDrawingContext(previewLineStartPointId) : null;
    if (currentShiftPressed && drawingContextForReferences) {
         drawReferenceElements(drawingContextForReferences, currentShiftPressed);
    }

    drawAllEdges();
    const pointsToDraw = allPoints.map(p => { if (isDragConfirmed && dragPreviewPoints.length > 0) { const preview = dragPreviewPoints.find(dp => dp.id === p.id); return preview || p; } return p; });
    pointsToDraw.forEach(point => drawPoint(point));

    if (isDrawingMode && previewLineStartPointId && !isDragConfirmed && !isRectangleSelecting && !isActionInProgress) {
        const startPoint = findPointById(previewLineStartPointId);
        if (startPoint) {
            const drawingContext = getDrawingContext(startPoint.id);
            const snappedData = getSnappedPosition(startPoint, mousePos, currentShiftPressed);
            const targetPosData = { x: snappedData.x, y: snappedData.y };
            const startScreen = dataToScreen(startPoint); const targetScreen = dataToScreen(targetPosData);
            
            ctx.beginPath(); ctx.moveTo(startScreen.x, startScreen.y); ctx.lineTo(targetScreen.x, targetScreen.y);
            ctx.setLineDash(DASH_PATTERN); ctx.strokeStyle = currentColor; ctx.lineWidth = LINE_WIDTH; ctx.stroke(); ctx.setLineDash([]);
            
            drawSnapInfo(startPoint, targetPosData, snappedData, currentShiftPressed, drawingContext);
        }
    }
    if (isRectangleSelecting && isDragConfirmed && currentMouseButton === 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.setLineDash(DASH_PATTERN);
        const rX = Math.min(rectangleSelectStartPos.x, mousePos.x); const rY = Math.min(rectangleSelectStartPos.y, mousePos.y);
        const rW = Math.abs(rectangleSelectStartPos.x - mousePos.x); const rH = Math.abs(rectangleSelectStartPos.y - mousePos.y);
        ctx.strokeRect(rX, rY, rW, rH); ctx.setLineDash([]); ctx.lineWidth = LINE_WIDTH;
    }
}