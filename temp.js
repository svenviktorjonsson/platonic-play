// Replace your getMousePosOnCanvas function with this:
function getMousePosOnCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    return {
        x: (rawX - viewOffset.x) / viewScale,
        y: (rawY - viewOffset.y) / viewScale
    };
}

// Add these new functions for view manipulation:
function screenToWorld(pos) {
    return {
        x: (pos.x - viewOffset.x) / viewScale,
        y: (pos.y - viewOffset.y) / viewScale
    };
}

function worldToScreen(pos) {
    return {
        x: pos.x * viewScale + viewOffset.x,
        y: pos.y * viewScale + viewOffset.y
    };
}

function zoomAtPoint(zoomFactor, screenPoint) {
    const worldPointBefore = screenToWorld(screenPoint);
    viewScale *= zoomFactor;
    viewScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewScale));
    
    const worldPointAfter = screenToWorld(screenPoint);
    viewOffset.x += (worldPointAfter.x - worldPointBefore.x) * viewScale;
    viewOffset.y += (worldPointAfter.y - worldPointBefore.y) * viewScale;
    
    redrawAll();
}

// Modify your redrawAll function to apply the view transform:
function redrawAll() {
    const acW = canvas.width / dpr;
    const acH = canvas.height / dpr;
    
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, acW, acH);
    
    // Apply view transform
    ctx.translate(viewOffset.x, viewOffset.y);
    ctx.scale(viewScale, viewScale);
    
    // Rest of your drawing code remains the same, but now it's in world coordinates
    let originalPointsBackup = null;
    if (isDragConfirmed && dragPreviewPoints.length > 0) {
        originalPointsBackup = allPoints.map(p => ({...p}));
        dragPreviewPoints.forEach(dp => {
            const actualPoint = allPoints.find(p => p.id === dp.id);
            if (actualPoint) { Object.assign(actualPoint, dp); }
        });
    }

    drawAllEdges();

    if (originalPointsBackup) {
        allPoints = originalPointsBackup;
    }

    const pointsToDraw = isDragConfirmed && dragPreviewPoints.length > 0 ?
        allPoints.map(p => dragPreviewPoints.find(dp => dp.id === p.id) || p)
        : allPoints;
    pointsToDraw.forEach(point => drawPoint(point));

    if (isDrawingMode && previewLineStartPointId && !isDragConfirmed && !isRectangleSelecting) {
        const sP = findPointById(previewLineStartPointId);
        if (sP) {
            ctx.beginPath();
            ctx.moveTo(sP.x, sP.y);
            ctx.lineTo(mousePos.x, mousePos.y);
            ctx.setLineDash(DASH_PATTERN);
            ctx.strokeStyle = currentColor;
            ctx.stroke();
            ctx.setLineDash([]);
        }
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
    
    ctx.restore();
}

// Update your mouse event handlers:
canvas.addEventListener('mousedown', (event) => {
    // Only start panning if middle mouse button or ctrl+left button is pressed
    if (event.button === 1 || (event.button === 0 && (event.ctrlKey || event.metaKey))) {
        isPanning = true;
        panStartPos = { x: event.clientX, y: event.clientY };
        panStartOffset = { ...viewOffset };
        canvas.style.cursor = 'grabbing';
        return;
    }
    
    // Rest of your existing mousedown code...
});

canvas.addEventListener('mousemove', (event) => {
    if (isPanning) {
        viewOffset.x = panStartOffset.x + (event.clientX - panStartPos.x);
        viewOffset.y = panStartOffset.y + (event.clientY - panStartPos.y);
        redrawAll();
        return;
    }
    
    // Rest of your existing mousemove code...
});

canvas.addEventListener('mouseup', (event) => {
    if (isPanning && (event.button === 1 || event.button === 0)) {
        isPanning = false;
        canvas.style.cursor = 'crosshair';
        return;
    }
    
    // Rest of your existing mouseup code...
});

// Add wheel event for zooming
canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const mousePos = { x: event.clientX, y: event.clientY };
    const zoomFactor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    zoomAtPoint(zoomFactor, mousePos);
});

// Update your keydown handler to add zoom shortcuts
window.addEventListener('keydown', (event) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    
    if (isActionInProgress && !['Shift', 'Control', 'Meta', 'Alt', 'Escape'].includes(event.key)) { return; }

    if (isCtrlOrCmd) {
        const canvasRect = canvas.getBoundingClientRect();
        const center = {
            x: canvasRect.left + canvasRect.width / 2,
            y: canvasRect.top + canvasRect.height / 2
        };
        
        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomAtPoint(ZOOM_FACTOR, center);
            return;
        } else if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            zoomAtPoint(1 / ZOOM_FACTOR, center);
            return;
        } else if (event.key === '0') {
            event.preventDefault();
            viewOffset = { x: 0, y: 0 };
            viewScale = 1;
            redrawAll();
            return;
        }
    }
    
    // Rest of your existing keydown code...
});

// Update your resizeCanvas function:
function resizeCanvas() {
    const canvasContainer = document.querySelector('.canvas-container');
    const cW = canvasContainer.offsetWidth;
    const cH = canvasContainer.offsetHeight;
    
    canvas.width = cW * dpr;
    canvas.height = cH * dpr;
    canvas.style.width = `${cW}px`;
    canvas.style.height = `${cH}px`;
    
    // Reset the transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    redrawAll();
}