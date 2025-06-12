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
            if (showDistances) {
                let distText;
                const areBothPointsOnGrid = gridInterval && isPointOnGrid(vertex, gridInterval) && isPointOnGrid(neighbor, gridInterval);
                if (areBothPointsOnGrid) {
                    const deltaX = vertex.x - neighbor.x;
                    const deltaY = vertex.y - neighbor.y;
                    const dx_grid = Math.round(deltaX / gridInterval);
                    const dy_grid = Math.round(deltaY / gridInterval);
                    const g2gSquaredSumForDisplay = dx_grid * dx_grid + dy_grid * dy_grid;
                    if (g2gSquaredSumForDisplay === 0) {
                        distText = '0';
                    } else {
                        const [coeff, radicand] = simplifySquareRoot(g2gSquaredSumForDisplay);
                        const finalCoeff = gridInterval * coeff;
                        distText = formatSimplifiedRoot(finalCoeff, radicand);
                    }
                } else {
                    distText = formatNumber(dist, distanceSigFigs);
                }

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
            } else {
                labelsToKeepThisFrame.delete(`drag-dist-${vertex.id}-${neighbor.id}`);
            }
        }
    });

    if (showAngles && neighbors.length >= 2) {
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

            let angleText;
            if (angleDisplayMode === 'degrees') {
                angleText = `${formatNumber(angleToDisplayRad * (180 / Math.PI), angleSigFigs)}^{\\circ}`;
            } else if (angleDisplayMode === 'radians') {
                // FIX 1: Angle display in radians mode
                if (currentShiftPressed) {
                    angleText = formatFraction(angleToDisplayRad / Math.PI, 0.001, 6) + '\\pi';
                    if (angleText.startsWith("1\\pi")) angleText = "\\pi";
                    if (angleText.startsWith("-1\\pi")) angleText = "-\\pi";
                    if (angleText === "0\\pi") angleText = "0";
                } else {
                    angleText = formatNumber(angleToDisplayRad, angleSigFigs);
                }
            }

            if (angleText) {
                const angleLabelDataPos = {
                    x: vertex.x + (LABEL_RADIUS_SCREEN / viewTransform.scale) * Math.cos(bisectorAngle),
                    y: vertex.y + (LABEL_RADIUS_SCREEN / viewTransform.scale) * Math.sin(bisectorAngle)
                };
                const angleLabelScreenPos = dataToScreen(angleLabelDataPos);
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
            } else {
                labelsToKeepThisFrame.delete(`drag-angle-${vertex.id}-${p1.id}-${p2.id}`);
            }
        }
    } else {
        neighbors.forEach(neighbor1 => {
            neighbors.forEach(neighbor2 => {
                if (neighbor1.id !== neighbor2.id) {
                    labelsToKeepThisFrame.delete(`drag-angle-${vertex.id}-${neighbor1.id}-${neighbor2.id}`);
                }
            });
        });
    }
}

function setCurrentColor(newColor) {
    const oldColor = currentColor;
    let changedPoints = [];
    if (selectedPointIds.length > 0) {
        selectedPointIds.forEach(id => {
            const point = findPointById(id);
            if (point && point.type === 'regular') {
                changedPoints.push({ id: point.id, oldColor: point.color || oldColor });
                point.color = newColor;
            }
        });
    }
    // FIX 2: Prevent transform centers from changing color
    // activeCenterId is the *last selected* center, not necessarily all selected centers
    selectedCenterIds.forEach(id => {
        const center = findPointById(id);
        // Only if it's explicitly a center point
        if (center && center.type !== 'regular') {
            // No color change for centers, they stay white as per drawCenterSymbol
            // So no need to add to changedPoints here for color
        }
    });

    if (changedPoints.length > 0) {
        const actualUndoState = {
            points: allPoints.map(p => {
                const changed = changedPoints.find(cp => cp.id === p.id);
                // Ensure center points are always stored with 'white' color in undo history if they were just placed
                if (p.type !== 'regular') {
                    return { ...p, color: 'white' }; // Centers always white in undo
                }
                return changed ? { ...p, color: changed.oldColor } : { ...p };
            }),
            edges: JSON.parse(JSON.stringify(allEdges)),
            selectedPointIds: JSON.parse(JSON.stringify(selectedPointIds)),
            selectedEdgeIds: JSON.parse(JSON.stringify(selectedEdgeIds)),
            activeCenterId,
            selectedCenterIds: JSON.parse(JSON.stringify(selectedCenterIds)), // Ensure selectedCenterIds is saved
            isDrawingMode,
            previewLineStartPointId
        };
        undoStack.push(actualUndoState);
        if (undoStack.length > MAX_HISTORY_SIZE) undoStack.shift();
        redoStack = [];
    }
    currentColor = newColor;
    colorPicker.value = newColor;
    addToRecentColors(newColor);
}

function drawCenterSymbol(point) {
    const screenPos = dataToScreen(point); const radius = CENTER_POINT_VISUAL_RADIUS;
    // FIX 2: Transform symbols should not be colorable
    ctx.strokeStyle = 'white'; // Always draw centers in white
    ctx.setLineDash([]); ctx.lineWidth = LINE_WIDTH;
    if (point.type === 'center_rotate_scale') {
        ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x - radius, screenPos.y); ctx.lineTo(screenPos.x + radius, screenPos.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x, screenPos.y - radius); ctx.lineTo(screenPos.x, screenPos.y + radius); ctx.stroke();
    } else if (point.type === 'center_rotate_only') {
        ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI); ctx.stroke();
    } else if (point.type === 'center_scale_only') {
        ctx.beginPath(); ctx.moveTo(screenPos.x - radius, screenPos.y); ctx.lineTo(screenPos.x + radius, screenPos.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x, screenPos.y - radius); ctx.lineTo(screenPos.x, screenPos.y + radius); ctx.stroke();
    }
}

function prepareSnapInfoTexts(startPointData, targetDataPos, snappedOutput, shiftPressed, drawingContext) {
    const epsilon = 1e-6;
    if ((!showAngles && !showDistances) || snappedOutput.distance < epsilon) return;

    const startScreen = dataToScreen(startPointData);
    const { angle: snappedAbsoluteAngleDeg, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn, gridToGridSquaredSum, gridInterval } = snappedOutput;
    const { offsetAngleRad, isFirstSegmentBeingDrawn, currentSegmentReferenceA_for_display, currentSegmentReferenceD } = drawingContext;
    const currentElementColor = shiftPressed ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';
    const katexFontSize = 12;
    const ARC_RADIUS_SCREEN_SNAP = 30;

    if (showDistances) {
        let distanceText = '';

        if (shiftPressed && gridToGridSquaredSum !== null && gridInterval) {
            if (gridToGridSquaredSum >= 0) {
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
            } else {
                distanceText = formatNumber(snappedDistanceData, distanceSigFigs);
            }
        } else if (shiftPressed && lengthSnapFactor !== null && Math.abs(lengthSnapFactor) > epsilon && !isFirstSegmentBeingDrawn && frozenReference_D_du !== null) {
            distanceText = formatSnapFactor(lengthSnapFactor, 'D');
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
        } else {
            labelsToKeepThisFrame.delete('snap-dist');
        }
    } else {
        labelsToKeepThisFrame.delete('snap-dist');
    }

    if (showAngles && Math.abs(angleTurn) > epsilon) {
        const currentLineAbsoluteAngle = Math.atan2(targetDataPos.y - startPointData.y, targetDataPos.x - startPointData.x);
        const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad;

        drawAngleArc(startScreen, baseAngleForArc, currentLineAbsoluteAngle, ARC_RADIUS_SCREEN_SNAP, currentElementColor);

        ctx.save();
        ctx.beginPath();
        const effectiveRadiusForLine = ARC_RADIUS_SCREEN_SNAP + ctx.lineWidth / 2;
        const baseLineEndData = {
            x: startPointData.x + (effectiveRadiusForLine / viewTransform.scale) * Math.cos(baseAngleForArc),
            y: startPointData.y + (effectiveRadiusForLine / viewTransform.scale) * Math.sin(baseAngleForArc)
        };
        const baseLineEndScreen = dataToScreen(baseLineEndData);
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(baseLineEndScreen.x, baseLineEndScreen.y);
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.6)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();


        let angleText = '';
        const canReferToTheta = !isFirstSegmentBeingDrawn && frozenReference_A_rad !== null && Math.abs(frozenReference_A_rad) > epsilon;

        if (angleDisplayMode === 'degrees') {
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
                    let degrees = normalizeAngleToPi(angleTurn) * (180 / Math.PI);
                    if (Math.abs(degrees) > epsilon) {
                        angleText = `${formatNumber(degrees, angleSigFigs)}^{\\circ}`;
                    }
                }
            } else {
                let angleToFormatRad = isFirstSegmentBeingDrawn ? currentLineAbsoluteAngle : angleTurn;
                let angleToFormatDeg = normalizeAngleToPi(angleToFormatRad) * (180 / Math.PI);
                if (Math.abs(angleToFormatDeg) > epsilon) {
                    angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
                }
            }
        } else if (angleDisplayMode === 'radians') {
            // FIX 1: Angle display in radians mode
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
                    const fracStr = formatSnapFactor(potentialFactor, null);
                    angleText = `${fracStr === '0' ? '0' : fracStr + '\\pi'}`;
                    if (angleText.startsWith("1\\pi")) angleText = "\\pi";
                    if (angleText.startsWith("-1\\pi")) angleText = "-\\pi";
                } else {
                    let radians = normalizeAngleToPi(angleTurn);
                    if (Math.abs(radians) > epsilon) {
                        angleText = formatNumber(radians, angleSigFigs);
                    }
                }
            } else {
                let angleToFormatRad = isFirstSegmentBeingDrawn ? currentLineAbsoluteAngle : angleTurn;
                let radians = normalizeAngleToPi(angleToFormatRad);
                if (Math.abs(radians) > epsilon) {
                    angleText = formatNumber(radians, angleSigFigs);
                }
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
        } else {
            labelsToKeepThisFrame.delete('snap-angle');
        }
    } else {
        labelsToKeepThisFrame.delete('snap-angle');
    }
}

function handleCanvasUIClick(screenPos) {
    const btn = canvasUI.toolbarButton;
    if (screenPos.x >= btn.x && screenPos.x <= btn.x + btn.width &&
        screenPos.y >= btn.y && screenPos.y <= btn.y + btn.height) {
        isToolbarExpanded = !isToolbarExpanded;
        if (isToolbarExpanded) {
            buildMainToolbarUI();
        } else {
            isColorPaletteExpanded = false;
            isTransformPanelExpanded = false;
            isDisplayPanelExpanded = false;
            selectedSwatchIndex = null;
        }
        return true;
    }

    if (isToolbarExpanded) {
        const ctb = canvasUI.colorToolButton;
        if (ctb && screenPos.x >= ctb.x && screenPos.x <= ctb.x + ctb.width &&
            screenPos.y >= ctb.y && screenPos.y <= ctb.y + ctb.height) {
            isColorPaletteExpanded = !isColorPaletteExpanded;
            // FIX 3: Do not close other panels when clicking another tool button
            // isTransformPanelExpanded = false;
            // isDisplayPanelExpanded = false;
            if (isColorPaletteExpanded) buildColorPaletteUI();
            else selectedSwatchIndex = null;
            return true;
        }

        const ttb = canvasUI.transformToolButton;
        if (ttb && screenPos.x >= ttb.x && screenPos.x <= ttb.x + ttb.width &&
            screenPos.y >= ttb.y && screenPos.y <= ttb.y + ttb.height) {
            isTransformPanelExpanded = !isTransformPanelExpanded;
            // FIX 3: Do not close other panels when clicking another tool button
            // isColorPaletteExpanded = false;
            // isDisplayPanelExpanded = false;
            if (isTransformPanelExpanded) buildTransformPanelUI();
            return true;
        }

        const dtb = canvasUI.displayToolButton;
        if (dtb && screenPos.x >= dtb.x && screenPos.x <= dtb.x + dtb.width &&
            screenPos.y >= dtb.y && screenPos.y <= dtb.y + dtb.height) {
            isDisplayPanelExpanded = !isDisplayPanelExpanded;
            // FIX 3: Do not close other panels when clicking another tool button
            // isColorPaletteExpanded = false;
            // isTransformPanelExpanded = false;
            if (isDisplayPanelExpanded) buildDisplayPanelUI();
            return true;
        }
    }

    if (isColorPaletteExpanded) {
        for (const swatch of canvasUI.colorSwatches) {
            if (screenPos.x >= swatch.x && screenPos.x <= swatch.x + swatch.width &&
                screenPos.y >= swatch.y && screenPos.y <= swatch.y + swatch.height) {
                setCurrentColor(swatch.color);
                selectedSwatchIndex = swatch.index;
                return true;
            }
        }
        const removeBtn = canvasUI.removeColorButton;
        if (removeBtn && screenPos.x >= removeBtn.x && screenPos.x <= removeBtn.x + removeBtn.width &&
            screenPos.y >= removeBtn.y && screenPos.y <= removeBtn.y + removeBtn.height) {
            if (selectedSwatchIndex === null && recentColors.length > 0) {
                selectedSwatchIndex = 0;
            }
            if (selectedSwatchIndex !== null) {
                recentColors.splice(selectedSwatchIndex, 1);
                if (recentColors.length === 0) {
                    selectedSwatchIndex = null;
                } else {
                    selectedSwatchIndex = Math.min(selectedSwatchIndex, recentColors.length - 1);
                }
                if (selectedSwatchIndex !== null) {
                    setCurrentColor(recentColors[selectedSwatchIndex]);
                }
                buildColorPaletteUI();
            }
            return true;
        }
        const addBtn = canvasUI.addColorButton;
        if (addBtn && screenPos.x >= addBtn.x && screenPos.x <= addBtn.x + addBtn.width &&
            screenPos.y >= addBtn.y && screenPos.y <= addBtn.y + addBtn.height) {
            setTimeout(() => {
                colorPicker.click();
            }, 0);
            return true;
        }
    }

    if (isTransformPanelExpanded) {
        for (const icon of canvasUI.transformIcons) {
            if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
                screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {
                isPlacingTransform = true;
                placingTransformType = icon.type;
                // Keep transform panel open for subsequent placements if desired, or close it
                // For now, it closes to allow placing the icon
                isTransformPanelExpanded = false; // Panel closes after selection to allow placing
                return true;
            }
        }
    }

    if (isDisplayPanelExpanded) {
        for (const icon of canvasUI.displayIcons) {
            if (screenPos.x >= icon.x && screenPos.x <= icon.x + icon.width &&
                screenPos.y >= icon.y && screenPos.y <= icon.y + icon.height) {

                switch (icon.group) {
                    case 'coords':
                        const coordsModes = ['none', 'regular', 'complex', 'polar'];
                        coordsDisplayMode = coordsModes[(coordsModes.indexOf(coordsDisplayMode) + 1) % coordsModes.length];
                        break;
                    case 'grid':
                        const gridModes = ['none', 'points', 'lines'];
                        gridDisplayMode = gridModes[(gridModes.indexOf(gridDisplayMode) + 1) % gridModes.length];
                        showGrid = gridDisplayMode !== 'none';
                        gridType = gridDisplayMode === 'none' ? 'lines' : gridDisplayMode; // Use 'lines' as default
                        break;
                    case 'angles':
                        const angleModes = ['degrees', 'radians', 'none'];
                        angleDisplayMode = angleModes[(angleModes.indexOf(angleDisplayMode) + 1) % angleModes.length];
                        showAngles = angleDisplayMode !== 'none';
                        break;
                    case 'distances':
                        const distModes = ['on', 'none'];
                        distanceDisplayMode = distModes[(distModes.indexOf(distanceDisplayMode) + 1) % distModes.length];
                        showDistances = distanceDisplayMode === 'on';
                        break;
                }
                return true;
            }
        }
    }

    return false;
}

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
                color: 'white' // FIX 2: Centers always white, not based on currentColor
            };
            allPoints.push(newCenter);
            // FIX 2: Centers are selected by default when placed
            handleCenterSelection(newCenter.id, false, false);
        }
        isPlacingTransform = false;
        placingTransformType = null;
        placingSnapPos = null;
        return;
    }

    // Determine initial target before setting up drag flags
    const clickedPoint = findClickedPoint(mousePos);
    const clickedEdge = findClickedEdge(mousePos);

    // FIX 2: If a transform center is clicked with the left mouse button, immediately start panning.
    // This prevents direct dragging of transform centers.
    if (clickedPoint && clickedPoint.type !== 'regular' && event.button === 0) {
        isActionInProgress = true;
        isDragConfirmed = false; // Will become true on mousemove if drag threshold is met
        isPanningBackground = true; // Force panning behavior
        backgroundPanStartOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
        canvas.style.cursor = 'move';
        actionStartPos = mousePos; // Ensure actionStartPos is set for delta calculation
        actionContext = { // Still set actionContext for cleanup in mouseup
            targetPoint: clickedPoint,
            targetEdge: null,
            target: clickedPoint,
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey || event.metaKey,
        };
        // Also select the center when clicked
        handleCenterSelection(clickedPoint.id, event.shiftKey, event.ctrlKey || event.metaKey);
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
            isActionInProgress = false; // Exit action mode for drawing
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
                allEdges = allEdges.filter(e => getEdgeId(e) !== getEdgeId(clickedEdge)); // Remove old edge
                allEdges.push({ id1: p1.id, id2: newPoint.id }); // Add new edge 1
                allEdges.push({ id1: newPoint.id, id2: p2.id }); // Add new edge 2
                isDrawingMode = true;
                previewLineStartPointId = newPoint.id;
                isActionInProgress = false; // Exit action mode for drawing
            }
            return;
        }
    }
    // No special behavior on mousedown - all drag behavior is determined in mousemove
    // when isDragConfirmed becomes true
});