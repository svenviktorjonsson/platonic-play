# refactor_signatures.py
import os
import re

def update_renderer_signatures():
    """
    Updates function signatures in renderer.js to accept the 'colors' object,
    and updates the internal calls to helper functions.
    """
    filename = 'renderer.js'
    if not os.path.exists(filename):
        print(f"ERROR: File '{filename}' not found.")
        return

    try:
        with open(filename, 'r', encoding='utf-8') as f:
            content = f.read()

        # This list defines the exact signature replacements.
        # It finds the old function definition and replaces it with the new one.
        signature_replacements = [
            (
                "export function drawGrid(ctx, state, dataToScreen, screenToData, lastGridState, lastAngularGridState)",
                "export function drawGrid(ctx, { gridDisplayMode, canvas, dpr, viewTransform, gridAlpha, colors }, dataToScreen, screenToData, lastGridState, lastAngularGridState)"
            ),
            (
                "export function drawAxes(ctx, htmlOverlay, state, dataToScreen, screenToData, lastGridState, lastAngularGridState, updateHtmlLabel)",
                "export function drawAxes(ctx, htmlOverlay, { canvas, dpr, coordsDisplayMode, viewTransform, angleDisplayMode, colors }, dataToScreen, screenToData, lastGridState, lastAngularGridState, updateHtmlLabel)"
            ),
            (
                "export function drawPoint(ctx, point, state, dataToScreen)",
                "export function drawPoint(ctx, point, { selectedPointIds, selectedCenterIds, activeCenterId, currentColor, colors }, dataToScreen)"
            ),
            (
                "export function drawAllEdges(ctx, state, dataToScreen, findPointById, getEdgeId)",
                "export function drawAllEdges(ctx, { allEdges, selectedEdgeIds, isDragConfirmed, dragPreviewPoints, currentColor, colors }, dataToScreen, findPointById, getEdgeId)"
            ),
            (
                "export function drawDragFeedback(ctx, htmlOverlay, targetPointId, currentPointStates, state, dataToScreen, findNeighbors, getEdgeId, isSnapping = false, excludedEdgeId = null, updateHtmlLabel = null)",
                "export function drawDragFeedback(ctx, htmlOverlay, targetPointId, currentPointStates, { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors }, dataToScreen, findNeighbors, getEdgeId, isSnapping = false, excludedEdgeId = null, updateHtmlLabel = null)"
            ),
            (
                "export function drawTransformIndicators(ctx, htmlOverlay, state, dataToScreen, updateHtmlLabel)",
                "export function drawTransformIndicators(ctx, htmlOverlay, { transformIndicatorData, angleSigFigs, distanceSigFigs, colors }, dataToScreen, updateHtmlLabel)"
            ),
            (
                "export function drawReferenceElementsGeometry(ctx, context, dataToScreen, screenToData, state)",
                "export function drawReferenceElementsGeometry(ctx, context, dataToScreen, screenToData, { showAngles, showDistances, viewTransform, mousePos, colors })"
            ),
            (
                "export function prepareSnapInfoTexts(ctx, htmlOverlay, startPointData, targetDataPos, snappedOutput, state, dataToScreen, drawingContext, updateHtmlLabel)",
                "export function prepareSnapInfoTexts(ctx, htmlOverlay, startPointData, targetDataPos, snappedOutput, { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors }, dataToScreen, drawingContext, updateHtmlLabel)"
            ),
            (
                "export function prepareReferenceElementsTexts(htmlOverlay, context, state, screenToData, dataToScreen, updateHtmlLabel)",
                "export function prepareReferenceElementsTexts(htmlOverlay, context, { showAngles, showDistances, viewTransform, mousePos, frozenReference_D_du, distanceSigFigs, angleDisplayMode, colors }, screenToData, dataToScreen, updateHtmlLabel)"
            ),
            (
                "export function updateMouseCoordinates(htmlOverlay, state, screenToData, updateHtmlLabel)",
                "export function updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostPointPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors}, screenToData, updateHtmlLabel)"
            ),
            (
                "export function drawDisplayIcon(ctx, icon, state, htmlOverlay, updateHtmlLabel)",
                "export function drawDisplayIcon(ctx, icon, { coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode, colors }, htmlOverlay, updateHtmlLabel)"
            ),
            (
                "export function drawCanvasUI(ctx, htmlOverlay, state, updateHtmlLabel)",
                "export function drawCanvasUI(ctx, htmlOverlay, { dpr, canvasUI, isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isPlacingTransform, placingTransformType, placingSnapPos, mousePos, selectedSwatchIndex, recentColors, activeThemeName, colors }, updateHtmlLabel)"
            ),
            # Helper functions that need the `colors` object passed to them
            ("function drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel)", "function drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel, colors)"),
            ("function drawCenterSymbol(ctx, point, dataToScreen)", "function drawCenterSymbol(ctx, point, dataToScreen, colors)"),
            ("function drawUITransformSymbol(ctx, icon)", "function drawUITransformSymbol(ctx, icon, colors)"),
            ("function drawCoordsIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel)", "function drawCoordsIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel, colors)"),
            ("function drawAngleIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel)", "function drawAngleIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel, colors)"),
            ("function drawDistanceIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel)", "function drawDistanceIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel, colors)"),
            ("function drawGridIcon(ctx, rect, mode, isSelected)", "function drawGridIcon(ctx, rect, mode, isSelected, colors)")
        ]

        # Update the main function signatures first
        for find_sig, replace_sig in signature_replacements:
            if find_sig in content:
                content = content.replace(find_sig, replace_sig)

        # Then, update the calls to the internal helper functions
        content = content.replace(
            "drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel);",
            "drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel, colors);"
        )
        content = content.replace(
            "drawCenterSymbol(ctx, point, dataToScreen);",
            "drawCenterSymbol(ctx, point, dataToScreen, colors);"
        )
        content = content.replace(
            "drawUITransformSymbol(ctx, ghostIcon);",
            "drawUITransformSymbol(ctx, ghostIcon, colors);"
        )
        content = content.replace(
            "drawUITransformSymbol(ctx, icon);",
            "drawUITransformSymbol(ctx, icon, colors);"
        )
        # The state object needs to be passed through to the display icon helpers
        content = content.replace(
            "drawCoordsIcon(ctx, rect, coordsDisplayMode, isSelected, htmlOverlay, updateHtmlLabel);",
            "drawCoordsIcon(ctx, rect, coordsDisplayMode, isSelected, htmlOverlay, updateHtmlLabel, colors);"
        )
        content = content.replace(
            "drawGridIcon(ctx, rect, gridDisplayMode, isSelected);",
            "drawGridIcon(ctx, rect, gridDisplayMode, isSelected, colors);"
        )
        content = content.replace(
            "drawAngleIcon(ctx, rect, angleDisplayMode, isSelected, htmlOverlay, updateHtmlLabel);",
            "drawAngleIcon(ctx, rect, angleDisplayMode, isSelected, htmlOverlay, updateHtmlLabel, colors);"
        )
        content = content.replace(
            "drawDistanceIcon(ctx, rect, distanceDisplayMode, isSelected, htmlOverlay, updateHtmlLabel);",
            "drawDistanceIcon(ctx, rect, distanceDisplayMode, isSelected, htmlOverlay, updateHtmlLabel, colors);"
        )
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"SUCCESS: Updated function signatures in '{filename}'.")

    except Exception as e:
        print(f"ERROR processing {filename}: {e}")

if __name__ == "__main__":
    print("--- Starting Signature Refactoring Script ---")
    update_renderer_signatures()
    print("--- Script Finished ---")