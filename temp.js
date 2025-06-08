/**
 * REWRITE THIS FUNCTION
 * Displays the label for the yellow reference distance (the 'delta' value).
 * Now uses unitless "platonic" values with user-controlled precision.
 */
function prepareReferenceElementsTexts(context, shiftPressed) {
    if (!shiftPressed || (!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display) return;
    
    const refElementColor = 'rgba(240, 240, 130, 1)';
    const katexFontSize = 11;
    const frozenOriginScreen = dataToScreen(context.frozen_Origin_Data_to_display);

    if (showDistances && context.frozen_D_du_to_display !== null && context.frozen_D_du_to_display > 0.0001) {
        let actualAngleOfFrozenSegment = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        if (context.displayAngleA_valueRad_for_A_equals_label !== null) {
            actualAngleOfFrozenSegment += (context.frozen_A_baseRad_to_display === null) ? context.displayAngleA_valueRad_for_A_equals_label : context.displayAngleA_valueRad_for_A_equals_label;
        }
        const frozenSegmentTipX = context.frozen_Origin_Data_to_display.x + context.frozen_D_du_to_display * Math.cos(actualAngleOfFrozenSegment);
        const frozenSegmentTipY = context.frozen_Origin_Data_to_display.y + context.frozen_D_du_to_display * Math.sin(actualAngleOfFrozenSegment);
        const frozenSegmentTipScreen = dataToScreen({x: frozenSegmentTipX, y: frozenSegmentTipY});
        
        const midX_screen = (frozenOriginScreen.x + frozenSegmentTipScreen.x) / 2;
        const midY_screen = (frozenOriginScreen.y + frozenSegmentTipScreen.y) / 2;
        const lineCanvasAngle = Math.atan2(frozenSegmentTipScreen.y - frozenOriginScreen.y, frozenSegmentTipScreen.x - frozenOriginScreen.x);
        const perpendicularOffset = 18; 
        let textPerpAngle_D = lineCanvasAngle - Math.PI / 2; 
        let rotationForReadability = 0;
        if (lineCanvasAngle > Math.PI / 2 || lineCanvasAngle < -Math.PI / 2) { 
             rotationForReadability = Math.PI;
        }
        if (rotationForReadability !== 0) {
            textPerpAngle_D += Math.PI; 
        }
        const textDistLabelX_D = midX_screen + Math.cos(textPerpAngle_D) * perpendicularOffset;
        const textDistLabelY_D = midY_screen + Math.sin(textPerpAngle_D) * perpendicularOffset;

        // The platonic value is the raw distance divided by our base "unit" distance.
        const platonicValue = context.frozen_D_du_to_display / DEFAULT_REFERENCE_DISTANCE;
        const dDisplayText = `\\delta = ${formatNumber(platonicValue, distanceSigFigs)}`;

        updateHtmlLabel({ 
            id: 'ref-dist', 
            content: dDisplayText, 
            x: textDistLabelX_D, 
            y: textDistLabelY_D, 
            color: refElementColor, 
            fontSize: katexFontSize, 
            options: { textAlign: 'center', textBaseline: 'middle', rotationRad: lineCanvasAngle + rotationForReadability } 
        });
    }

    if (showAngles && context.displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(context.displayAngleA_valueRad_for_A_equals_label) > 0.0001) {
        const arcRadius_A_screen = 35;
        const startAngleForA_arc_dataRad = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        const bisectorCanvasAngle = Math.atan2(Math.sin(-startAngleForA_arc_dataRad) + Math.sin(-context.displayAngleA_valueRad_for_A_equals_label), Math.cos(-startAngleForA_arc_dataRad) + Math.cos(-context.displayAngleA_valueRad_for_A_equals_label)); 
        let rotationForReadability = 0;
        if (bisectorCanvasAngle > Math.PI / 2 || bisectorCanvasAngle < -Math.PI / 2) { 
             rotationForReadability = Math.PI;
        }
        const angleLabelOffsetDistance = arcRadius_A_screen + 35; 
        const textAngleLabelX_A = frozenOriginScreen.x + Math.cos(bisectorCanvasAngle) * angleLabelOffsetDistance;
        const textAngleLabelY_A = frozenOriginScreen.y + Math.sin(bisectorCanvasAngle) * angleLabelOffsetDistance; 
        const aValueDeg = context.displayAngleA_valueRad_for_A_equals_label * (180 / Math.PI);
        const aKatexText = `\\theta = ${formatNumber(aValueDeg, angleSigFigs)}^{\\circ}`;

        updateHtmlLabel({ 
            id: 'ref-angle', 
            content: aKatexText, 
            x: textAngleLabelX_A, 
            y: textAngleLabelY_A, 
            color: refElementColor, 
            fontSize: katexFontSize, 
            options: { textAlign: 'center', textBaseline: 'middle', rotationRad: bisectorCanvasAngle + rotationForReadability } 
        });
    }
}


/**
 * REWRITE THIS FUNCTION
 * Displays labels while drawing a new segment, using unitless numbers.
 */
function prepareSnapInfoTexts(startPointData, targetDataPos, snappedOutput, shiftPressed, drawingContext) {
    if (!showAngles && !showDistances) return;

    const startScreen = dataToScreen(startPointData);
    const { angle: snappedAbsoluteAngleDeg, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn } = snappedOutput;
    const { offsetAngleRad, isFirstSegmentBeingDrawn } = drawingContext; 
    const currentElementColor = shiftPressed ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)'; 
    const katexFontSize = 12;

    if (showDistances) {
        const midX = (startScreen.x + dataToScreen(targetDataPos).x) / 2;
        const midY = (startScreen.y + dataToScreen(targetDataPos).y) / 2;
        const visualLineAngleScreen = Math.atan2(dataToScreen(targetDataPos).y - startScreen.y, dataToScreen(targetDataPos).x - startScreen.x);
        const textPerpAngle = visualLineAngleScreen - Math.PI / 2;
        const distanceTextX = midX + Math.cos(textPerpAngle) * 18;
        const distanceTextY = midY + Math.sin(textPerpAngle) * 18; 
        let distanceText;

        if (shiftPressed && lengthSnapFactor !== null) {
            distanceText = formatSnapFactor(lengthSnapFactor, 'D');
        } else {
            // The platonic value is the raw distance divided by our base "unit" distance.
            const platonicValue = snappedDistanceData / DEFAULT_REFERENCE_DISTANCE;
            distanceText = `${formatNumber(platonicValue, distanceSigFigs)}`;
        }
        updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } });
    }

    if (showAngles) {
        const currentLineAbsoluteAngle = Math.atan2(targetDataPos.y - startPointData.y, targetDataPos.x - startPoint.x);
        const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad;
        
        const arcColor = shiftPressed ? 'rgba(230, 230, 100, 0.8)' : 'rgba(200, 200, 200, 0.7)';
        drawAngleArc(startScreen, baseAngleForArc, currentLineAbsoluteAngle, 30, arcColor);
        
        ctx.save();
        ctx.beginPath();
        const refLineEndData = { x: startPointData.x + (35 / viewTransform.scale) * Math.cos(baseAngleForArc), y: startPointData.y + (35 / viewTransform.scale) * Math.sin(baseAngleForArc) };
        const refLineEndScreen = dataToScreen(refLineEndData);
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(refLineEndScreen.x, refLineEndScreen.y);
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.6)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        let angleText;
        let angleToFormatDeg;

        if (shiftPressed) {
            if (angleSnapFactor !== null) {
                angleText = formatSnapFactor(angleSnapFactor, 'A'); 
            } else {
                angleToFormatDeg = angleTurn * (180/Math.PI);
                angleText = `\\theta = ${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
            }
        } else {
            angleToFormatDeg = isFirstSegmentBeingDrawn ? normalizeAngleDegrees(snappedAbsoluteAngleDeg) : (angleTurn !== null ? angleTurn * (180 / Math.PI) : normalizeAngleToPi(snappedAbsoluteAngleDeg * (Math.PI/180) - offsetAngleRad) * (180/Math.PI));
            if (angleToFormatDeg > 180.001 && !isFirstSegmentBeingDrawn) {
                angleToFormatDeg -= 360;
            }
            angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
        }
        
        const canvasStartAngle = -baseAngleForArc;
        const canvasEndAngle = -currentLineAbsoluteAngle;
        const sumCos = Math.cos(canvasStartAngle) + Math.cos(canvasEndAngle);
        const sumSin = Math.sin(canvasStartAngle) + Math.sin(canvasEndAngle);
        let bisectorCanvasAngle = Math.atan2(sumSin, sumCos);
        const labelDistance = 60; 
        const angleTextX = startScreen.x + Math.cos(bisectorCanvasAngle) * labelDistance;
        const angleTextY = startScreen.y + Math.sin(bisectorCanvasAngle) * labelDistance; 

        updateHtmlLabel({ id: 'snap-angle', content: angleText, x: angleTextX, y: angleTextY, color: currentElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } });
    }
}