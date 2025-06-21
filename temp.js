function buildMainToolbarUI() {
    const canvasHeight = canvas.height / dpr;
    canvasUI.mainToolbar = {
        id: "main-toolbar-bg",
        x: 0,
        y: 0,
        width: UI_TOOLBAR_WIDTH,
        height: canvasHeight,
        type: "toolbar"
    };

    canvasUI.colorToolButton = {
        id: "color-tool-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.toolbarButton.y + canvasUI.toolbarButton.height + TOOLBAR_SECTION_GAP,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };
    
    canvasUI.transformToolButton = {
        id: "transform-tool-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.colorToolButton.y + canvasUI.colorToolButton.height + UI_BUTTON_PADDING,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };

    canvasUI.displayToolButton = {
        id: "display-tool-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.transformToolButton.y + canvasUI.transformToolButton.height + UI_BUTTON_PADDING,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };

    // Add theme toggle button
    canvasUI.themeToggleButton = {
        id: "theme-toggle-button",
        type: "toolButton",
        x: UI_BUTTON_PADDING,
        y: canvasUI.displayToolButton.y + canvasUI.displayToolButton.height + UI_BUTTON_PADDING,
        width: UI_TOOLBAR_WIDTH - (2 * UI_BUTTON_PADDING),
        height: TOOL_BUTTON_HEIGHT,
    };
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
            if (isColorPaletteExpanded) {
                buildColorPaletteUI();
                const currentIndex = recentColors.indexOf(currentColor);
                selectedSwatchIndex = (currentIndex > -1) ? currentIndex : null;
            } else {
                selectedSwatchIndex = null;
            }
            return true;
        }

        const ttb = canvasUI.transformToolButton;
        if (ttb && screenPos.x >= ttb.x && screenPos.x <= ttb.x + ttb.width &&
            screenPos.y >= ttb.y && screenPos.y <= ttb.y + ttb.height) {
            isTransformPanelExpanded = !isTransformPanelExpanded;
            if (isTransformPanelExpanded) buildTransformPanelUI();
            return true;
        }

        const dtb = canvasUI.displayToolButton;
        if (dtb && screenPos.x >= dtb.x && screenPos.x <= dtb.x + dtb.width &&
            screenPos.y >= dtb.y && screenPos.y <= dtb.y + dtb.height) {
            isDisplayPanelExpanded = !isDisplayPanelExpanded;
            if (isDisplayPanelExpanded) buildDisplayPanelUI();
            return true;
        }

        // Add theme toggle button click handler
        const themeBtn = canvasUI.themeToggleButton;
        if (themeBtn && screenPos.x >= themeBtn.x && screenPos.x <= themeBtn.x + themeBtn.width &&
            screenPos.y >= themeBtn.y && screenPos.y <= themeBtn.y + themeBtn.height) {
            // Toggle between light and dark themes
            activeThemeName = activeThemeName === 'dark' ? 'light' : 'dark';
            
            // Update the current color to match the new theme
            currentColor = THEMES[activeThemeName].point;
            
            // Update color picker to match new theme
            colorPicker.value = currentColor;
            
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
                        const coordsModes = [COORDS_DISPLAY_MODE_NONE, COORDS_DISPLAY_MODE_REGULAR, COORDS_DISPLAY_MODE_COMPLEX, COORDS_DISPLAY_MODE_POLAR];
                        coordsDisplayMode = coordsModes[(coordsModes.indexOf(coordsDisplayMode) + 1) % coordsModes.length];
                        break;
                    case 'grid':
                        const gridModes = [GRID_DISPLAY_MODE_LINES, GRID_DISPLAY_MODE_POINTS, GRID_DISPLAY_MODE_TRIANGULAR, GRID_DISPLAY_MODE_POLAR, GRID_DISPLAY_MODE_NONE];
                        gridDisplayMode = gridModes[(gridModes.indexOf(gridDisplayMode) + 1) % gridModes.length];
                        break;
                    case 'angles':
                        const angleModes = [ANGLE_DISPLAY_MODE_DEGREES, ANGLE_DISPLAY_MODE_RADIANS, ANGLE_DISPLAY_MODE_NONE];
                        angleDisplayMode = angleModes[(angleModes.indexOf(angleDisplayMode) + 1) % angleModes.length];
                        showAngles = angleDisplayMode !== ANGLE_DISPLAY_MODE_NONE;
                        break;
                    case 'distances':
                        const distModes = [DISTANCE_DISPLAY_MODE_ON, DISTANCE_DISPLAY_MODE_NONE];
                        distanceDisplayMode = distModes[(distModes.indexOf(distanceDisplayMode) + 1) % distModes.length];
                        showDistances = distanceDisplayMode === DISTANCE_DISPLAY_MODE_ON;
                        break;
                }
                return true;
            }
        }
    }

    return false;
}

function redrawAll() {
    labelsToKeepThisFrame.clear();
    const colors = THEMES[activeThemeName]; // Get colors from current theme
    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);

    const { grid1Interval, grid2Interval, alpha1, alpha2 } = calculateGridIntervals(viewTransform.scale);
    lastGridState = { interval1: grid1Interval, interval2: grid2Interval, alpha1, alpha2, scale: viewTransform.scale };

    lastAngularGridState = getDynamicAngularIntervals(viewTransform, actualCanvasWidth, actualCanvasHeight, dataToScreen);

    // Pass `colors` object in the state parameter to all renderer functions
    drawGrid(ctx, { gridDisplayMode, canvas, dpr, viewTransform, gridAlpha, colors }, dataToScreen, screenToData, lastGridState, lastAngularGridState);

    if (coordsDisplayMode !== COORDS_DISPLAY_MODE_NONE) {
        const stateForAxes = { canvas, dpr, coordsDisplayMode, viewTransform, angleDisplayMode, colors };
        drawAxes(ctx, htmlOverlay, stateForAxes, dataToScreen, screenToData, lastGridState, lastAngularGridState, updateHtmlLabel);
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
            const stateForRefGeo = { showAngles, showDistances, viewTransform, mousePos, colors };
            drawReferenceElementsGeometry(ctx, frozenDisplayContext, dataToScreen, screenToData, stateForRefGeo);
            const stateForRefTexts = { showAngles, showDistances, viewTransform, mousePos, frozenReference_D_du, distanceSigFigs, angleDisplayMode, colors };
            prepareReferenceElementsTexts(htmlOverlay, frozenDisplayContext, stateForRefTexts, screenToData, dataToScreen, updateHtmlLabel);
        }
    }

    if (transformIndicatorData) {
        const stateForTransform = { transformIndicatorData, angleSigFigs, distanceSigFigs, colors };
        drawTransformIndicators(ctx, htmlOverlay, stateForTransform, dataToScreen, updateHtmlLabel);
        labelsToKeepThisFrame.add('transform-angle-indicator');
        labelsToKeepThisFrame.add('transform-scale-indicator');
    }

    const stateForEdges = { allEdges, selectedEdgeIds, isDragConfirmed, dragPreviewPoints, currentColor, colors };
    drawAllEdges(ctx, stateForEdges, dataToScreen, findPointById, getEdgeId);

    allPoints.forEach(point => {
        let pointToDraw = { ...point };
        if (isDragConfirmed && dragPreviewPoints.length > 0) {
            const preview = dragPreviewPoints.find(dp => dp.id === point.id);
            if (preview) {
                pointToDraw.x = preview.x;
                pointToDraw.y = preview.y;
            }
        }
        drawPoint(ctx, pointToDraw, { selectedPointIds, selectedCenterIds, activeCenterId, currentColor, colors }, dataToScreen);
    });

    if (isDragConfirmed) {
        const hybridPointStates = allPoints.map(p => {
            const draggedVersion = dragPreviewPoints.find(dp => dp.id === p.id);
            return draggedVersion || p;
        });
        const stateForFeedback = { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors };
        if (actionContext.targetPoint) {
            drawDragFeedback(ctx, htmlOverlay, actionContext.targetPoint.id, hybridPointStates, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, currentShiftPressed, null, updateHtmlLabel);
        } else if (actionContext.targetEdge) {
            const draggedEdgeId = getEdgeId(actionContext.targetEdge);
            drawDragFeedback(ctx, htmlOverlay, actionContext.targetEdge.id1, hybridPointStates, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, false, null, updateHtmlLabel);
            drawDragFeedback(ctx, htmlOverlay, actionContext.targetEdge.id2, hybridPointStates, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, false, draggedEdgeId, updateHtmlLabel);
        }
    } else {
        const stateForFeedback = { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors };
        if (selectedPointIds.length === 1 && selectedEdgeIds.length === 0) {
            drawDragFeedback(ctx, htmlOverlay, selectedPointIds[0], allPoints, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, false, null, updateHtmlLabel);
        } else if (selectedEdgeIds.length === 1 && selectedPointIds.length <= 2) {
            const selectedEdgeId = selectedEdgeIds[0];
            const edge = allEdges.find(e => getEdgeId(e) === selectedEdgeId);
            if (edge) {
                drawDragFeedback(ctx, htmlOverlay, edge.id1, allPoints, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, false, null, updateHtmlLabel);
                drawDragFeedback(ctx, htmlOverlay, edge.id2, allPoints, stateForFeedback, dataToScreen, findNeighbors, getEdgeId, false, selectedEdgeId, updateHtmlLabel);
            }
        }
    }

    if (ghostPointPosition) {
        const screenPos = dataToScreen(ghostPointPosition);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = colors.feedbackSnapped;
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
            ctx.strokeStyle = currentShiftPressed ? colors.feedbackSnapped : currentColor;
            ctx.lineWidth = LINE_WIDTH;
            ctx.stroke();
            ctx.setLineDash([]);
            if (snappedData.snapped) {
                ctx.beginPath();
                ctx.arc(targetScreen.x, targetScreen.y, POINT_RADIUS, 0, 2 * Math.PI);
                ctx.fillStyle = colors.feedbackSnapped;
                ctx.fill();
            }
            const stateForSnapInfo = { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors };
            prepareSnapInfoTexts(ctx, htmlOverlay, startPoint, targetPosData, snappedData, stateForSnapInfo, dataToScreen, currentPreviewDrawingContext, updateHtmlLabel);
        }
    }

    if (isRectangleSelecting && isDragConfirmed) {
        ctx.strokeStyle = colors.mouseCoords;
        ctx.lineWidth = 1;
        ctx.setLineDash(DASH_PATTERN);
        const rX = Math.min(rectangleSelectStartPos.x, mousePos.x);
        const rY = Math.min(rectangleSelectStartPos.y, mousePos.y);
        const rW = Math.abs(rectangleSelectStartPos.x - mousePos.x);
        const rH = Math.abs(rectangleSelectStartPos.y - mousePos.y);
        ctx.strokeRect(rX, rY, rW, rH);
        ctx.setLineDash([]);
    }

    updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostPointPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors}, screenToData, updateHtmlLabel);
    
    const stateForUI = { 
        dpr, 
        canvasUI, 
        isToolbarExpanded, 
        isColorPaletteExpanded, 
        isTransformPanelExpanded, 
        isDisplayPanelExpanded, 
        isPlacingTransform, 
        placingTransformType, 
        placingSnapPos, 
        mousePos, 
        selectedSwatchIndex, 
        recentColors, 
        activeThemeName, 
        colors,
        // Add these missing display mode properties:
        coordsDisplayMode,
        gridDisplayMode,
        angleDisplayMode,
        distanceDisplayMode
    };
    drawCanvasUI(ctx, htmlOverlay, stateForUI, updateHtmlLabel);
    
    cleanupHtmlLabels();
}