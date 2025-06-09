function prepareSnapInfoTexts(startPointData, targetDataPos, snappedOutput, shiftPressed, drawingContext) {
    const epsilon = 1e-6; 
    if (!showAngles && !showDistances || snappedOutput.distance < epsilon) return;

    const startScreen = dataToScreen(startPointData);
    const { angle: snappedAbsoluteAngleDeg, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn, gridToGridSquaredSum, gridInterval } = snappedOutput;
    const { offsetAngleRad, isFirstSegmentBeingDrawn, currentSegmentReferenceA_for_display, currentSegmentReferenceD } = drawingContext;
    const currentElementColor = shiftPressed ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';
    const katexFontSize = 12;

    if (showDistances) {
        let distanceText = '';
        const isReferenceAngleDefault = Math.abs(currentSegmentReferenceA_for_display - (Math.PI / 2)) < 0.001;

        if (shiftPressed && gridToGridSquaredSum > 0 && gridInterval) {
            const currentExactDistance = gridInterval * Math.sqrt(gridToGridSquaredSum);
            
            if (currentSegmentReferenceD !== null && Math.abs(currentExactDistance - currentSegmentReferenceD) < epsilon) {
                distanceText = '\\delta';
            } else if (currentSegmentReferenceD !== null && currentSegmentReferenceD > epsilon) {
                const ratio = currentExactDistance / currentSegmentReferenceD;
                let foundFraction = false;
                
                for (const factor of SNAP_FACTORS) {
                    if (Math.abs(ratio - factor) < 0.001) {
                        distanceText = formatSnapFactor(factor, 'D');
                        foundFraction = true;
                        break;
                    }
                }
                
                if (!foundFraction) {
                    const [coeff, radicand] = simplifySquareRoot(gridToGridSquaredSum);
                    const finalCoeff = gridInterval * coeff;
                    distanceText = formatSimplifiedRoot(finalCoeff, radicand);
                }
            } else {
                const [coeff, radicand] = simplifySquareRoot(gridToGridSquaredSum);
                const finalCoeff = gridInterval * coeff;
                distanceText = formatSimplifiedRoot(finalCoeff, radicand);
            }
        } else if (shiftPressed && lengthSnapFactor !== null && Math.abs(lengthSnapFactor) > epsilon && !isFirstSegmentBeingDrawn && frozenReference_D_du !== null) {
            if (!isReferenceAngleDefault) {
                distanceText = formatSnapFactor(lengthSnapFactor, 'D');
            } else {
                distanceText = formatNumber(snappedDistanceData, distanceSigFigs);
            }
        } else {
            distanceText = formatNumber(snappedDistanceData, distanceSigFigs);
        }

        if (distanceText) {
            const startScreenPos = dataToScreen(startPointData);
            const endScreenPos = dataToScreen(targetDataPos);
            const edgeAngleScreen = Math.atan2(endScreenPos.y - startScreenPos.y, endScreenPos.x - startScreenPos.x);
            
            const midX = (startScreenPos.x + endScreenPos.x) / 2;
            const midY = (startScreenPos.y + endScreenPos.y) / 2;
            
            let textOffset = 18;
            
            if (Math.abs(Math.cos(edgeAngleScreen)) < 0.1) {
                const distanceTextX = midX + textOffset;
                const distanceTextY = midY;
                updateHtmlLabel({ 
                    id: 'snap-dist', 
                    content: distanceText, 
                    x: distanceTextX, 
                    y: distanceTextY, 
                    color: currentElementColor, 
                    fontSize: katexFontSize, 
                    options: { 
                        textAlign: 'center', 
                        textBaseline: 'middle',
                        rotation: 90
                    } 
                });
            } else {
                let textPerpAngle = edgeAngleScreen - Math.PI / 2;
                if (Math.sin(textPerpAngle) > 0) {
                    textPerpAngle += Math.PI;
                }
                const distanceTextX = midX + Math.cos(textPerpAngle) * textOffset;
                const distanceTextY = midY + Math.sin(textPerpAngle) * textOffset;
                
                let rotationDeg = edgeAngleScreen * (180 / Math.PI);
                if (rotationDeg > 90 || rotationDeg < -90) {
                    rotationDeg += 180;
                }
                
                updateHtmlLabel({ 
                    id: 'snap-dist', 
                    content: distanceText, 
                    x: distanceTextX, 
                    y: distanceTextY, 
                    color: currentElementColor, 
                    fontSize: katexFontSize, 
                    options: { 
                        textAlign: 'center', 
                        textBaseline: 'middle',
                        rotation: rotationDeg
                    } 
                });
            }
        }
    }

    if (showAngles && Math.abs(angleTurn) > epsilon) {
        const currentLineAbsoluteAngle = Math.atan2(targetDataPos.y - startPointData.y, targetDataPos.x - startPointData.x);
        const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad;
        
        drawAngleArc(startScreen, baseAngleForArc, currentLineAbsoluteAngle, 30, currentElementColor);

        if (!isFirstSegmentBeingDrawn) {
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
        }

        let angleText = '';
        const canReferToTheta = !isFirstSegmentBeingDrawn && frozenReference_A_rad !== null && Math.abs(frozenReference_A_rad) > epsilon;

        if (shiftPressed && canReferToTheta) {
            const referenceAngleRad = Math.abs(currentSegmentReferenceA_for_display);
            let potentialFactor = null;

            if (typeof angleSnapFactor === 'number') {
                potentialFactor = angleSnapFactor;
            } else if (angleTurn !== null) {
                if (Math.abs(referenceAngleRad) > epsilon) {
                    const calculatedFactor = angleTurn / referenceAngleRad;
                    for (const frac of NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
                        if (Math.abs(Math.abs(calculatedFactor) - frac) < 0.001) {
                            potentialFactor = calculatedFactor < 0 ? -frac : frac;
                            break;
                        }
                    }
                }
            }
            if (potentialFactor !== null && Math.abs(potentialFactor) > epsilon) {
                angleText = formatSnapFactor(potentialFactor, 'A');
            } else {
                let degrees = (angleTurn === null) ? 0 : angleTurn * (180 / Math.PI);
                if (Math.abs(degrees) > epsilon) {
                    if (degrees > 180.001) degrees -= 360;
                    angleText = `${formatNumber(degrees, angleSigFigs)}^{\\circ}`;
                }
            }
        } else {
            let angleToFormatDeg = isFirstSegmentBeingDrawn ? normalizeAngleDegrees(snappedAbsoluteAngleDeg) : angleTurn * (180 / Math.PI);
            if (Math.abs(angleToFormatDeg) > epsilon) {
                if (angleToFormatDeg > 180.001 && !isFirstSegmentBeingDrawn) {
                    angleToFormatDeg -= 360;
                }
                angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
            }
        }

        if (angleText) {
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
}

function drawDragFeedback(targetPointId, currentPointStates, isSnapping = false, excludedEdgeId = null) {
    const feedbackColor = isSnapping ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';
    const katexFontSize = 12;
    const ARC_RADIUS_SCREEN = 30;
    const LABEL_OFFSET_DIST_SCREEN = 18;

    const livePoints = new Map(currentPointStates.map(p => [p.id, { ...p }]));
    const getLivePoint = (id) => livePoints.get(id);

    const vertex = getLivePoint(targetPointId);
    if (!vertex) return;

    const neighbors = findNeighbors(vertex.id).map(getLivePoint).filter(Boolean);
    if (neighbors.length === 0) return;

    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    const isPointOnGrid = (point, interval) => {
        if (!interval || interval <= 0) return false;
        const epsilon = interval * 1e-6;
        const isOnGridX = Math.abs(point.x / interval - Math.round(point.x / interval)) < epsilon;
        const isOnGridY = Math.abs(point.y / interval - Math.round(point.y / interval)) < epsilon;
        return isOnGridX && isOnGridY;
    };

    const vertexScreen = dataToScreen(vertex);

    neighbors.forEach(neighbor => {
        const dist = distance(vertex, neighbor);
        if (dist < 1e-6) return;

        const currentEdgeId = getEdgeId({ id1: vertex.id, id2: neighbor.id });

        if (currentEdgeId !== excludedEdgeId) {
            let distText;
            const areBothPointsOnGrid = gridInterval && isPointOnGrid(vertex, gridInterval) && isPointOnGrid(neighbor, gridInterval);
            if (areBothPointsOnGrid) {
                const deltaX = vertex.x - neighbor.x;
                const deltaY = vertex.y - neighbor.y;
                const dx_grid = Math.round(deltaX / gridInterval);
                const dy_grid = Math.round(deltaY / gridInterval);
                const g2gSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;
                if (g2gSquaredSum === 0) {
                    distText = '0';
                } else {
                    const [coeff, radicand] = simplifySquareRoot(g2gSquaredSum);
                    const finalCoeff = gridInterval * coeff;
                    distText = formatSimplifiedRoot(finalCoeff, radicand);
                }
            } else {
                distText = formatNumber(dist, distanceSigFigs);
            }
            
            const vertexScreen = dataToScreen(vertex);
            const neighborScreen = dataToScreen(neighbor);
            const edgeAngleScreen = Math.atan2(neighborScreen.y - vertexScreen.y, neighborScreen.x - vertexScreen.x);
            
            const midX = (vertexScreen.x + neighborScreen.x) / 2;
            const midY = (vertexScreen.y + neighborScreen.y) / 2;
            
            let textOffset = LABEL_OFFSET_DIST_SCREEN;
            
            const labelId = `drag-dist-${vertex.id}-${neighbor.id}`;
            
            if (Math.abs(Math.cos(edgeAngleScreen)) < 0.1) {
                const distanceTextX = midX + textOffset;
                const distanceTextY = midY;
                updateHtmlLabel({
                    id: labelId,
                    content: distText,
                    x: distanceTextX,
                    y: distanceTextY,
                    color: feedbackColor,
                    fontSize: katexFontSize,
                    options: { 
                        textAlign: 'center', 
                        textBaseline: 'middle',
                        rotation: 90
                    }
                });
            } else {
                let textPerpAngle = edgeAngleScreen - Math.PI / 2;
                if (Math.sin(textPerpAngle) > 0) {
                    textPerpAngle += Math.PI;
                }
                const distanceTextX = midX + Math.cos(textPerpAngle) * textOffset;
                const distanceTextY = midY + Math.sin(textPerpAngle) * textOffset;
                
                let rotationDeg = edgeAngleScreen * (180 / Math.PI);
                if (rotationDeg > 90 || rotationDeg < -90) {
                    rotationDeg += 180;
                }
                
                updateHtmlLabel({
                    id: labelId,
                    content: distText,
                    x: distanceTextX,
                    y: distanceTextY,
                    color: feedbackColor,
                    fontSize: katexFontSize,
                    options: { 
                        textAlign: 'center', 
                        textBaseline: 'middle',
                        rotation: rotationDeg
                    }
                });
            }
        }
    });

    if (neighbors.length >= 2) {
        const sortedNeighbors = [...neighbors].sort((a, b) => {
            const angleA = Math.atan2(a.y - vertex.y, a.x - vertex.x);
            const angleB = Math.atan2(b.y - vertex.y, b.x - vertex.x);
            return angleA - angleB;
        });

        for (let i = 0; i < sortedNeighbors.length; i++) {
            const p1 = sortedNeighbors[i];
            const p2 = sortedNeighbors[(i + 1) % sortedNeighbors.length];
            const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
            const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
            const angle1_data = Math.atan2(v1.y, v1.x);
            const angle2_data = Math.atan2(v2.y, v2.x);
            let angleToDisplayRad = angle2_data - angle1_data;
            if (angleToDisplayRad < 0) {
                angleToDisplayRad += 2 * Math.PI;
            }
            if (angleToDisplayRad < 1e-6) continue;
            const LABEL_RADIUS_SCREEN = 75;
            const bisectorAngle = angle1_data + (angleToDisplayRad / 2);
            ctx.save();
            ctx.strokeStyle = feedbackColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(vertexScreen.x, vertexScreen.y, ARC_RADIUS_SCREEN, -angle1_data, -angle2_data, false);
            ctx.stroke();
            ctx.restore();
            const labelRadiusData = LABEL_RADIUS_SCREEN / viewTransform.scale;
            const angleLabelDataPos = {
                x: vertex.x + labelRadiusData * Math.cos(bisectorAngle),
                y: vertex.y + labelRadiusData * Math.sin(bisectorAngle)
            };
            const angleLabelScreenPos = dataToScreen(angleLabelDataPos);
            const angleText = `${formatNumber(angleToDisplayRad * (180 / Math.PI), angleSigFigs)}^{\\circ}`;
            const labelId = `drag-angle-${vertex.id}-${p1.id}-${p2.id}`;
            updateHtmlLabel({
                id: labelId,
                content: angleText,
                x: angleLabelScreenPos.x,
                y: angleLabelScreenPos.y,
                color: feedbackColor,
                fontSize: katexFontSize,
                options: { textAlign: 'center', textBaseline: 'middle' }
            });
        }
    }
}

function prepareReferenceElementsTexts(context, shiftPressed) {
    if (!shiftPressed || (!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display) return;
    
    const refElementColor = 'rgba(240, 240, 130, 1)';
    const katexFontSize = 11;
    const frozenOriginScreen = dataToScreen(context.frozen_Origin_Data_to_display);

    if (showDistances && context.frozen_D_du_to_display !== null && context.frozen_D_du_to_display > 0.0001) {
        let dDisplayText;
        
        if (frozenReference_D_g2g) {
            const { g2gSquaredSum, interval } = frozenReference_D_g2g;
            const [coeff, radicand] = simplifySquareRoot(g2gSquaredSum);
            const finalCoeff = interval * coeff;
            dDisplayText = `\\delta = ${formatSimplifiedRoot(finalCoeff, radicand)}`;
        } else {
            const platonicValue = context.frozen_D_du_to_display / DEFAULT_REFERENCE_DISTANCE;
            dDisplayText = `\\delta = ${formatNumber(platonicValue, distanceSigFigs)}`;
        }

        let actualAngleOfFrozenSegment = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        if (context.displayAngleA_valueRad_for_A_equals_label !== null) {
            actualAngleOfFrozenSegment += context.displayAngleA_valueRad_for_A_equals_label;
        }
        const frozenSegmentTipX = context.frozen_Origin_Data_to_display.x + context.frozen_D_du_to_display * Math.cos(actualAngleOfFrozenSegment);
        const frozenSegmentTipY = context.frozen_Origin_Data_to_display.y + context.frozen_D_du_to_display * Math.sin(actualAngleOfFrozenSegment);
        const frozenSegmentTipScreen = dataToScreen({x: frozenSegmentTipX, y: frozenSegmentTipY});
        
        const edgeAngleScreen = Math.atan2(frozenSegmentTipScreen.y - frozenOriginScreen.y, frozenSegmentTipScreen.x - frozenOriginScreen.x);
        const midX_screen = (frozenOriginScreen.x + frozenSegmentTipScreen.x) / 2;
        const midY_screen = (frozenOriginScreen.y + frozenSegmentTipScreen.y) / 2;
        
        let textOffset = 18;
        
        if (Math.abs(Math.cos(edgeAngleScreen)) < 0.1) {
            const textDistLabelX_D = midX_screen + textOffset;
            const textDistLabelY_D = midY_screen;
            updateHtmlLabel({ 
                id: 'ref-dist', 
                content: dDisplayText, 
                x: textDistLabelX_D, 
                y: textDistLabelY_D, 
                color: refElementColor, 
                fontSize: katexFontSize, 
                options: { 
                    textAlign: 'center', 
                    textBaseline: 'middle',
                    rotation: 90
                } 
            });
        } else {
            let textPerpAngle = edgeAngleScreen - Math.PI / 2;
            if (Math.sin(textPerpAngle) > 0) {
                textPerpAngle += Math.PI;
            }
            const textDistLabelX_D = midX_screen + Math.cos(textPerpAngle) * textOffset;
            const textDistLabelY_D = midY_screen + Math.sin(textPerpAngle) * textOffset;
            
            let rotationDeg = edgeAngleScreen * (180 / Math.PI);
            if (rotationDeg > 90 || rotationDeg < -90) {
                rotationDeg += 180;
            }
            
            updateHtmlLabel({ 
                id: 'ref-dist', 
                content: dDisplayText, 
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
        }
    }

    if (showAngles && context.displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(context.displayAngleA_valueRad_for_A_equals_label) > 0.0001) {
        const arcRadius_A_screen = 35;
        const startAngleForA_arc_dataRad = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
        const bisectorCanvasAngle = -startAngleForA_arc_dataRad - (context.displayAngleA_valueRad_for_A_equals_label / 2);
        
        const angleLabelOffsetDistance = arcRadius_A_screen + 15; 
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
            options: { textAlign: 'center', textBaseline: 'middle' } 
        });
    }
}