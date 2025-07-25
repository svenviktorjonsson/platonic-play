import * as U from './utils.js';
import * as C from './constants.js';

let colorWheelIcon = null
const patternCache = new Map();

export function calculateGridIntervals(viewTransformScale) {
    const effectiveDataInterval = C.GRID_TARGET_SPACING / viewTransformScale;

    let lowerPowerOf10 = Math.pow(10, Math.floor(Math.log10(effectiveDataInterval)));
    let higherPowerOf10 = Math.pow(10, Math.ceil(Math.log10(effectiveDataInterval)));

    if (Math.abs(lowerPowerOf10 - higherPowerOf10) < C.GEOMETRY_CALCULATION_EPSILON || lowerPowerOf10 === 0) {
        higherPowerOf10 = lowerPowerOf10 === 0 ? 0.001 : lowerPowerOf10 * 10;
        if (lowerPowerOf10 === 0) lowerPowerOf10 = 0.0001;
    }

    const grid1Interval = lowerPowerOf10;
    const grid2Interval = higherPowerOf10;

    let logInterpFactor = 0;
    if (grid2Interval > grid1Interval && grid1Interval > 0) {
        logInterpFactor = (Math.log10(effectiveDataInterval) - Math.log10(grid1Interval)) / (Math.log10(grid2Interval) - Math.log10(grid1Interval));
    }

    let interpValue = (logInterpFactor - C.GRID_ALPHA_TRANSITION_START) / (C.GRID_ALPHA_TRANSITION_END - C.GRID_ALPHA_TRANSITION_START);
    interpValue = Math.max(0, Math.min(1, interpValue));
    interpValue = interpValue * interpValue * (3 - 2 * interpValue);

    let alpha1 = 1 - interpValue;
    let alpha2 = interpValue;

    if (alpha1 < C.GRID_ALPHA_CLAMP_THRESHOLD) alpha1 = 0; else if (alpha1 > 1 - C.GRID_ALPHA_CLAMP_THRESHOLD) alpha1 = 1;
    if (alpha2 < C.GRID_ALPHA_CLAMP_THRESHOLD) alpha2 = 0; else if (alpha2 > 1 - C.GRID_ALPHA_CLAMP_THRESHOLD) alpha2 = 1;

    const totalAlpha = alpha1 + alpha2;
    if (totalAlpha > 0 && totalAlpha !== 2) {
        alpha1 /= totalAlpha;
        alpha2 /= totalAlpha;
    }

    return { grid1Interval, grid2Interval, alpha1, alpha2 };
}

export function getDynamicAngularIntervals(viewTransform, canvasWidth, canvasHeight, dataToScreen) {
    const originScreen = dataToScreen({ x: 0, y: 0 });
    const screenCenter = { x: canvasWidth / 2, y: canvasHeight / 2 };

    const radiusToCenterScreen = U.distance(originScreen, screenCenter);
    let targetAngleDeg;

    if (radiusToCenterScreen < 1e-6) {
        targetAngleDeg = C.ANGULAR_GRID_TARGET_SPACING;
    } else {
        const targetAngleRad = C.ANGULAR_GRID_TARGET_SPACING / radiusToCenterScreen;
        targetAngleDeg = targetAngleRad * (180 / Math.PI);
    }

    if (isNaN(targetAngleDeg) || targetAngleDeg <= C.GEOMETRY_CALCULATION_EPSILON) {
        targetAngleDeg = C.GEOMETRY_CALCULATION_EPSILON;
    }

    const results = [];
    let allLevels = [...C.ANGULAR_GRID_PREDEFINED_LEVELS];

    let lastGeneratedLevel = allLevels[allLevels.length - 1];
    
    const absoluteMinimum = 1e-15;
    
    while (lastGeneratedLevel > absoluteMinimum) {
        lastGeneratedLevel /= 10;
        if (!allLevels.includes(lastGeneratedLevel)) {
            allLevels.push(lastGeneratedLevel);
        }
    }

    allLevels.sort((a, b) => b - a);

    let primaryLevel = null;
    let secondaryLevel = null;

    for (let i = allLevels.length - 1; i >= 0; i--) {
        const currentLevel = allLevels[i];

        if (targetAngleDeg < currentLevel) {
            primaryLevel = { angle: currentLevel, alpha: 1.0 };
            if (i + 1 < allLevels.length) {
                secondaryLevel = { angle: allLevels[i + 1], alpha: 0 };
            }
            break;
        }
    }

    if (!primaryLevel && allLevels.length > 0) {
        primaryLevel = { angle: allLevels[0], alpha: 1.0 };
        if (allLevels.length > 1) {
            secondaryLevel = { angle: allLevels[1], alpha: 0 };
        }
    } else if (!primaryLevel && allLevels.length === 0) {
        primaryLevel = { angle: C.ANGULAR_GRID_PREDEFINED_LEVELS[0], alpha: 1.0 };
    }

    results.push(primaryLevel);

    if (secondaryLevel) {
        const logPrimary = Math.log10(primaryLevel.angle);
        const logSecondary = Math.log10(secondaryLevel.angle);
        const logTarget = Math.log10(targetAngleDeg);

        let interpValue;
        if (logSecondary === logPrimary) {
            interpValue = 0;
        } else {
            interpValue = (logTarget - logPrimary) / (logSecondary - logPrimary);
        }

        interpValue = Math.max(0, Math.min(1, interpValue));

        const fadeInAlpha = interpValue * interpValue * (3 - 2 * interpValue);

        if (fadeInAlpha > C.ANGULAR_GRID_FADE_IN_THRESHOLD) {
            secondaryLevel.alpha = fadeInAlpha;
            results.push(secondaryLevel);
        }
    }

    const uniqueResults = [];
    const seenAngles = new Set();
    results.sort((a, b) => b.angle - a.angle);

    for (const res of results) {
        if (!seenAngles.has(res.angle)) {
            uniqueResults.push(res);
            seenAngles.add(res.angle);
        }
    }

    if (uniqueResults.length === 0) {
        uniqueResults.push({ angle: C.ANGULAR_GRID_PREDEFINED_LEVELS[0], alpha: 1.0 });
    }

    return uniqueResults;
}

export function drawFaceGlows(ctx, { allFaces, hoveredFaceId, selectedFaceIds, colors, isDragConfirmed, dragPreviewVertices }, dataToScreen, findVertexById, getFaceId) {
    if (!hoveredFaceId && selectedFaceIds.length === 0) return;

    const getLiveVertex = (vertexId) => {
        if (isDragConfirmed && dragPreviewVertices) {
            const previewVertex = dragPreviewVertices.find(p => p && p.id === vertexId);
            if (previewVertex) {
                return previewVertex;
            }
        }
        return findVertexById(vertexId);
    };

    allFaces.forEach(face => {
        const faceId = getFaceId(face);
        const isSelected = selectedFaceIds.includes(faceId);
        const isHovered = faceId === hoveredFaceId;

        if (isSelected || isHovered) {
            const vertices = face.vertexIds.map(id => getLiveVertex(id)).filter(p => p && p.type === 'regular');
            if (vertices.length < 3) return;

            const screenVertices = vertices.map(v => dataToScreen(v));

            ctx.save();
            ctx.fillStyle = colors.selectionGlow;
            ctx.globalAlpha = 0.25;
            
            ctx.beginPath();
            screenVertices.forEach((vertex, index) => {
                if (index === 0) {
                    ctx.moveTo(vertex.x, vertex.y);
                } else {
                    ctx.lineTo(vertex.x, vertex.y);
                }
            });
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
    });
}

function calculateVisibleAngleRange(originScreen, screenRadius, canvasWidth, canvasHeight) {
    if (originScreen.x >= 0 && originScreen.x <= canvasWidth && 
        originScreen.y >= 0 && originScreen.y <= canvasHeight) {
        return { minAngle: 0, maxAngle: 360, isFullCircle: true };
    }

    const rect = {
        left: 0,
        right: canvasWidth,
        top: 0,
        bottom: canvasHeight
    };

    if (originScreen.x + screenRadius < rect.left || 
        originScreen.x - screenRadius > rect.right ||
        originScreen.y + screenRadius < rect.top || 
        originScreen.y - screenRadius > rect.bottom) {
        return null;
    }

    const corners = [
        { x: rect.left, y: rect.top },
        { x: rect.right, y: rect.top },
        { x: rect.right, y: rect.bottom },
        { x: rect.left, y: rect.bottom }
    ];

    const allCornersInside = corners.every(corner => {
        const distSq = (corner.x - originScreen.x) ** 2 + (corner.y - originScreen.y) ** 2;
        return distSq <= screenRadius ** 2;
    });

    if (allCornersInside) {
        return { minAngle: 0, maxAngle: 360, isFullCircle: true };
    }

    const intersectionAngles = [];

    corners.forEach(corner => {
        const distSq = (corner.x - originScreen.x) ** 2 + (corner.y - originScreen.y) ** 2;
        if (distSq > screenRadius ** 2) {
            const dx = corner.x - originScreen.x;
            const dy = corner.y - originScreen.y;
            const angle = Math.atan2(-dy, dx);
            const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
            intersectionAngles.push(normalizedAngle * 180 / Math.PI);
        }
    });

    const edges = [
        { x1: rect.left, y1: rect.top, x2: rect.right, y2: rect.top },
        { x1: rect.right, y1: rect.top, x2: rect.right, y2: rect.bottom },
        { x1: rect.right, y1: rect.bottom, x2: rect.left, y2: rect.bottom },
        { x1: rect.left, y1: rect.bottom, x2: rect.left, y2: rect.top }
    ];

    edges.forEach(edge => {
        const intersections = U.getLineCircleIntersection(
            {p1: {x: edge.x1, y: edge.y1}, p2: {x: edge.x2, y: edge.y2}},
            {center: {x: originScreen.x, y: originScreen.y}, radius: screenRadius}
        );
        
        intersections.forEach(vertex => {
            const dx = vertex.x - originScreen.x;
            const dy = vertex.y - originScreen.y;
            const angle = Math.atan2(-dy, dx);
            const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
            intersectionAngles.push(normalizedAngle * 180 / Math.PI);
        });
    });

    if (intersectionAngles.length === 0) {
        return { minAngle: 0, maxAngle: 360, isFullCircle: true };
    }

    const uniqueAngles = [...new Set(intersectionAngles.map(a => Math.round(a * 1e6) / 1e6))].sort((a, b) => a - b);

    if (uniqueAngles.length < 2) {
        return { minAngle: 0, maxAngle: 360, isFullCircle: true };
    }

    let maxGap = 0;
    let maxGapStartAngle = 0;
    let maxGapEndAngle = 0;

    for (let i = 0; i < uniqueAngles.length; i++) {
        const currentAngle = uniqueAngles[i];
        const nextAngle = uniqueAngles[(i + 1) % uniqueAngles.length];
        
        let gap;
        if (i === uniqueAngles.length - 1) {
            gap = (360 - currentAngle) + nextAngle;
        } else {
            gap = nextAngle - currentAngle;
        }

        if (gap > maxGap) {
            maxGap = gap;
            maxGapStartAngle = currentAngle;
            maxGapEndAngle = nextAngle;
        }
    }

    if (maxGapEndAngle > maxGapStartAngle) {
        return {
            minAngle: maxGapEndAngle,
            maxAngle: maxGapStartAngle + 360,
            isFullCircle: false
        };
    } else {
        return {
            minAngle: maxGapEndAngle,
            maxAngle: maxGapStartAngle,
            isFullCircle: false
        };
    }
}

export function clearCanvas(ctx, { canvas, dpr, colors }) {
    const actualCanvasWidth = canvas.width / dpr;
    const actualCanvasHeight = canvas.height / dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, actualCanvasWidth, actualCanvasHeight);
}

export function drawFaces(ctx, { allFaces, facesVisible, isDragConfirmed, dragPreviewVertices, transformIndicatorData, initialDragVertexStates, colors, initialCoordSystemStates }, dataToScreen, findVertexById) {
    if (!facesVisible || !allFaces || !colors || !ctx) return;

    const getLiveVertex = (vertexId) => {
        if (isDragConfirmed && dragPreviewVertices) {
            const previewVertex = dragPreviewVertices.find(p => p && p.id === vertexId);
            if (previewVertex) return previewVertex;
        }
        return findVertexById(vertexId);
    };

    allFaces.forEach((face) => {
        if (!face || !face.vertexIds || face.vertexIds.length < 3) return;
        
        const liveVertices = face.vertexIds.map(id => getLiveVertex(id)).filter(p => p && p.type === 'regular');
        if (liveVertices.length < 3) return;

        const screenVertices = liveVertices.map(v => dataToScreen(v));

        let faceToDraw = face;
        if (isDragConfirmed && face.localCoordSystem && face.vertexIds.some(vid => dragPreviewVertices.some(pv => pv.id === vid))) {
            const initialSystem = initialCoordSystemStates.get(face.id);
            const previewSystem = calculatePreviewCoordSystem(face, { initialSystem, dragPreviewVertices, initialDragVertexStates, findVertexById, transformIndicatorData });
            faceToDraw = { ...face, localCoordSystem: previewSystem };
        }
        
        if (screenVertices.every(v => v && typeof v.x === 'number' && typeof v.y === 'number')) {
            drawFace(ctx, screenVertices, faceToDraw, colors, dataToScreen, findVertexById);
        }
    });
}

function calculatePreviewCoordSystem(face, { initialSystem, dragPreviewVertices, initialDragVertexStates, findVertexById, transformIndicatorData }) {
    if (!initialSystem) return face.localCoordSystem;

    const liveVertices = face.vertexIds
        .map(id => dragPreviewVertices.find(p => p && p.id === id) || findVertexById(id))
        .filter(p => p && p.type === 'regular');

    if (!initialSystem.isCustom) {
        const incircle = U.calculateIncenter(liveVertices);
        if (incircle) {
            const rotation = transformIndicatorData ? transformIndicatorData.rotation : 0;
            const scale = transformIndicatorData ? transformIndicatorData.scale : 1;
            return {
                ...initialSystem,
                origin: incircle.center,
                scale: initialSystem.scale * scale,
                angle: U.normalizeAngle(initialSystem.angle + rotation)
            };
        }
        return initialSystem;
    }

    const previewSystem = JSON.parse(JSON.stringify(initialSystem));

    if (transformIndicatorData) {
        const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
        const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };

        previewSystem.origin = U.applyTransformToVertex(initialSystem.origin, center, rotation, scale, directionalScale, startVector);

        if (!directionalScale) {
            previewSystem.angle = U.normalizeAngle(initialSystem.angle + rotation);
            previewSystem.scale = initialSystem.scale * scale;
        }
    }

    const draggedVertexIds = new Set(initialDragVertexStates.map(v => v.id));
    let newOrigin = { ...previewSystem.origin };
    let newAngle = previewSystem.angle;
    let newScale = previewSystem.scale;

    if (previewSystem.attachedToVertex) {
        if (draggedVertexIds.has(previewSystem.attachedToVertex)) {
            const draggedVertex = dragPreviewVertices.find(p => p.id === previewSystem.attachedToVertex);
            if (draggedVertex) newOrigin = { ...draggedVertex };
        }
    } else if (previewSystem.attachedToEdge) {
        if (draggedVertexIds.has(previewSystem.attachedToEdge.v1) || draggedVertexIds.has(previewSystem.attachedToEdge.v2)) {
            const v1 = dragPreviewVertices.find(p => p.id === previewSystem.attachedToEdge.v1) || findVertexById(previewSystem.attachedToEdge.v1);
            const v2 = dragPreviewVertices.find(p => p.id === previewSystem.attachedToEdge.v2) || findVertexById(previewSystem.attachedToEdge.v2);
            if (v1 && v2) {
                newOrigin = {
                    x: v1.x + previewSystem.attachedToEdge.t * (v2.x - v1.x),
                    y: v1.y + previewSystem.attachedToEdge.t * (v2.y - v1.y)
                };
            }
        }
    }

    if (previewSystem.rotationAlignedToEdge) {
        if (draggedVertexIds.has(previewSystem.rotationAlignedToEdge.v1) || draggedVertexIds.has(previewSystem.rotationAlignedToEdge.v2)) {
            const v1 = dragPreviewVertices.find(p => p.id === previewSystem.rotationAlignedToEdge.v1) || findVertexById(previewSystem.rotationAlignedToEdge.v1);
            const v2 = dragPreviewVertices.find(p => p.id === previewSystem.rotationAlignedToEdge.v2) || findVertexById(previewSystem.rotationAlignedToEdge.v2);
            if (v1 && v2) {
                const currentEdgeAngle = Math.atan2(v2.y - v1.y, v2.x - v1.x);
                const { originalAngle, originalSystemAngle } = previewSystem.rotationAlignedToEdge;
                const angleOffset = originalSystemAngle - originalAngle;
                newAngle = U.normalizeAngle(currentEdgeAngle + angleOffset);
            }
        }
    }

    if (previewSystem.scaleAttachedToEdge) {
        if (draggedVertexIds.has(previewSystem.scaleAttachedToEdge.v1) || draggedVertexIds.has(previewSystem.scaleAttachedToEdge.v2)) {
            const v1 = dragPreviewVertices.find(p => p.id === previewSystem.scaleAttachedToEdge.v1) || findVertexById(previewSystem.scaleAttachedToEdge.v1);
            const v2 = dragPreviewVertices.find(p => p.id === previewSystem.scaleAttachedToEdge.v2) || findVertexById(previewSystem.scaleAttachedToEdge.v2);
            if (v1 && v2) {
                newScale = U.distance(v1, v2) * previewSystem.scaleAttachedToEdge.scaleRatio;
            }
        }
    }

    if (liveVertices.length >= 3) {
        previewSystem.origin = U.clampPointToPolygon(newOrigin, liveVertices);
    } else {
        previewSystem.origin = newOrigin;
    }
    previewSystem.angle = newAngle;
    previewSystem.scale = Math.max(0.01, newScale);

    return previewSystem;
}

export function drawCopyPreviews(ctx, { copyCount, isDragConfirmed, initialDragVertexStates, dragPreviewVertices, transformIndicatorData, allEdges, allFaces, findVertexById, findNeighbors, colors }, dataToScreen) {
    const verticesToCopy = initialDragVertexStates.filter(p => p.type === 'regular');
    const vertexIdsToCopy = new Set(verticesToCopy.map(p => p.id));
    const incidentEdges = allEdges.filter(edge =>
        vertexIdsToCopy.has(edge.id1) && vertexIdsToCopy.has(edge.id2)
    );
    
    const affectedFaces = allFaces.filter(face => 
        face.vertexIds && face.vertexIds.some(vId => vertexIdsToCopy.has(vId))
    );

    const isRigidBodyMotion = affectedFaces.every(face => 
        face.vertexIds.every(vId => vertexIdsToCopy.has(vId))
    );

    ctx.save();
    ctx.globalAlpha = 1.0;

    for (let i = 0; i < copyCount; i++) {
        let previewVerticesForThisCopy;

        if (i === 0) {
            previewVerticesForThisCopy = initialDragVertexStates.filter(p => p.type === 'regular');
        } else if (transformIndicatorData) {
            const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
            const effectiveRotation = rotation * i;
            const effectiveScale = Math.pow(scale, i);
            const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
            previewVerticesForThisCopy = verticesToCopy.map(p => {
                const newPos = U.applyTransformToVertex(p, center, effectiveRotation, effectiveScale, directionalScale, startVector);
                return { ...p, id: `preview_${p.id}_${i}`, x: newPos.x, y: newPos.y };
            });
        } else {
            const deltaX = dragPreviewVertices[0].x - initialDragVertexStates[0].x;
            const deltaY = dragPreviewVertices[0].y - initialDragVertexStates[0].y;
            const effectiveDeltaX = deltaX * i;
            const effectiveDeltaY = deltaY * i;
            previewVerticesForThisCopy = verticesToCopy.map(p => ({
                ...p, id: `preview_${p.id}_${i}`, x: p.x + effectiveDeltaX, y: p.y + effectiveDeltaY
            }));
        }

        const newIdMapForThisCopy = new Map();
        previewVerticesForThisCopy.forEach((previewVertex, index) => {
            const originalVertex = verticesToCopy[index];
            newIdMapForThisCopy.set(originalVertex.id, previewVertex);
        });

        affectedFaces.forEach(originalFace => {
            const faceVerticesForThisCopy = originalFace.vertexIds.map(originalVertexId => {
                if (vertexIdsToCopy.has(originalVertexId)) {
                    return newIdMapForThisCopy.get(originalVertexId);
                }
                const staticVertex = findVertexById(originalVertexId);
                return (staticVertex && staticVertex.type === 'regular') ? staticVertex : null;
            }).filter(Boolean);

            if (faceVerticesForThisCopy.length >= 3) {
                const screenVertices = faceVerticesForThisCopy.map(v => dataToScreen(v));
                if (screenVertices.every(v => v && typeof v.x === 'number' && typeof v.y === 'number')) {
                    let faceToDraw = originalFace;
                    if (originalFace.localCoordSystem) {
                        const previewSystem = JSON.parse(JSON.stringify(originalFace.localCoordSystem));
                        if (previewSystem.isCustom) {
                            if (transformIndicatorData && i > 0) {
                                const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
                                const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
                                previewSystem.origin = U.applyTransformToVertex(previewSystem.origin, center, rotation * i, Math.pow(scale, i), directionalScale, startVector);
                                previewSystem.angle = U.normalizeAngle(previewSystem.angle + (rotation * i));
                                if(!directionalScale) previewSystem.scale *= Math.pow(scale, i);
                            } else if (i > 0) {
                                const deltaX = dragPreviewVertices[0].x - initialDragVertexStates[0].x;
                                const deltaY = dragPreviewVertices[0].y - initialDragVertexStates[0].y;
                                previewSystem.origin.x += deltaX * i;
                                previewSystem.origin.y += deltaY * i;
                            }
                        } else {
                            const incircle = U.calculateIncenter(faceVerticesForThisCopy);
                            if(incircle) {
                                previewSystem.origin = incircle.center;
                                previewSystem.scale = incircle.radius;
                            }
                        }
                        faceToDraw = {...originalFace, localCoordSystem: previewSystem};
                    }
                    drawFace(ctx, screenVertices, faceToDraw, colors, dataToScreen, findVertexById);
                }
            }
        });

        if (isRigidBodyMotion) {
            ctx.setLineDash([]);
            incidentEdges.forEach(originalEdge => {
                const p1 = newIdMapForThisCopy.get(originalEdge.id1);
                const p2 = newIdMapForThisCopy.get(originalEdge.id2);
                if (p1 && p2) {
                    const p1Screen = dataToScreen(p1);
                    const p2Screen = dataToScreen(p2);
                    ctx.beginPath();
                    ctx.moveTo(p1Screen.x, p1Screen.y);
                    ctx.lineTo(p2Screen.x, p2Screen.y);
                    ctx.strokeStyle = originalEdge.color || colors.defaultStroke;
                    ctx.lineWidth = C.LINE_WIDTH;
                    ctx.stroke();
                }
            });
        }

        ctx.setLineDash(isRigidBodyMotion ? [] : C.DASH_PATTERN);
        verticesToCopy.forEach(originalVertex => {
            const correspondingPreviewVertex = newIdMapForThisCopy.get(originalVertex.id);
            if (!correspondingPreviewVertex) return;
            
            const neighbors = findNeighbors(originalVertex.id);
            neighbors.forEach(neighborId => {
                if (!vertexIdsToCopy.has(neighborId)) {
                    const neighborVertex = findVertexById(neighborId);
                    if (neighborVertex && neighborVertex.type === 'regular') {
                        const previewScreen = dataToScreen(correspondingPreviewVertex);
                        const neighborScreen = dataToScreen(neighborVertex);
                        ctx.beginPath();
                        ctx.moveTo(previewScreen.x, previewScreen.y);
                        ctx.lineTo(neighborScreen.x, neighborScreen.y);
                        ctx.strokeStyle = colors.defaultStroke;
                        ctx.lineWidth = C.LINE_WIDTH;
                        ctx.stroke();
                    }
                }
            });
        });

        previewVerticesForThisCopy.forEach(vertex => {
            drawVertex(ctx, vertex, { 
                selectedVertexIds: [], 
                selectedCenterIds: [], 
                activeCenterId: null, 
                currentColor: vertex.color, 
                colors, 
                verticesVisible: true 
            }, dataToScreen, () => {});
        });
    }

    ctx.restore();
}

export function drawDrawingPreview(ctx, { startVertex, snappedData, isShiftPressed, currentColor, nextCreationColor, nextEdgeColor, colors, edgeColormapInfo }, dataToScreen) {
    const startScreen = dataToScreen(startVertex);
    const targetScreen = dataToScreen(snappedData);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(targetScreen.x, targetScreen.y);
    ctx.setLineDash(C.DASH_PATTERN);
    
    if (edgeColormapInfo && edgeColormapInfo.colormapItem) {
        const gradient = ctx.createLinearGradient(startScreen.x, startScreen.y, targetScreen.x, targetScreen.y);
        const startColor = U.sampleColormap(edgeColormapInfo.colormapItem, edgeColormapInfo.startT);
        const endColor = U.sampleColormap(edgeColormapInfo.colormapItem, edgeColormapInfo.endT);
        gradient.addColorStop(0, startColor);
        gradient.addColorStop(1, endColor);
        ctx.strokeStyle = gradient;
    } else if (snappedData.snapped) {
        ctx.strokeStyle = colors.feedbackSnapped;
    } else if (isShiftPressed) {
        ctx.strokeStyle = colors.feedbackSnapped;
    } else {
        ctx.strokeStyle = nextEdgeColor;
    }
    
    ctx.lineWidth = C.LINE_WIDTH;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(targetScreen.x, targetScreen.y, C.VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
    
    if (snappedData.snapped) {
        ctx.fillStyle = colors.feedbackSnapped;
    } else {
        ctx.fillStyle = nextCreationColor;
    }
    
    ctx.fill();
    ctx.restore();
}

export function drawMergePreviews(ctx, { allVertices, dragPreviewVertices, viewTransform, colors, transformIndicatorData, copyCount, initialDragVertexStates }, dataToScreen) {
    if (!dragPreviewVertices || dragPreviewVertices.length === 0 || !initialDragVertexStates || initialDragVertexStates.length === 0) {
        return;
    }

    const indicatorMergeThreshold = C.GEOMETRY_CALCULATION_EPSILON;
    const drawnMergeIndicators = new Set();
    const draggedIds = new Set(initialDragVertexStates.map(p => p.id));
    const verticesToTransform = initialDragVertexStates.filter(p => p.type === 'regular');

    const staticVertices = allVertices.filter(p => p.type === 'regular' && !draggedIds.has(p.id));

    const multipliers = copyCount === 1 ? [1] : Array.from({ length: copyCount }, (_, k) => k);

    const copies = [];
    if (verticesToTransform.length > 0) {
        if (transformIndicatorData) {
            const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
            const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
            multipliers.forEach(k => {
                const effectiveRotation = rotation * k;
                const effectiveScale = Math.pow(scale, k);
                const transformedVertices = verticesToTransform.map(p_orig => {
                    const newPos = U.applyTransformToVertex(p_orig, center, effectiveRotation, effectiveScale, directionalScale, startVector);
                    return { ...p_orig, ...newPos };
                });
                copies.push(transformedVertices);
            });
        } else {
            const deltaX = dragPreviewVertices[0].x - initialDragVertexStates[0].x;
            const deltaY = dragPreviewVertices[0].y - initialDragVertexStates[0].y;
            multipliers.forEach(k => {
                const effectiveDeltaX = deltaX * k;
                const effectiveDeltaY = deltaY * k;
                const transformedVertices = verticesToTransform.map(p_orig => ({
                    ...p_orig,
                    x: p_orig.x + effectiveDeltaX,
                    y: p_orig.y + effectiveDeltaY,
                }));
                copies.push(transformedVertices);
            });
        }
    }

    const drawIndicator = (p1, p2) => {
        if (p1.id === p2.id) return;
        if (U.distance(p1, p2) < indicatorMergeThreshold) {
            const mergePos = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const screenPos = dataToScreen(mergePos);
            const key = `${Math.round(screenPos.x)},${Math.round(screenPos.y)}`;
            if (!drawnMergeIndicators.has(key)) {
                ctx.beginPath();
                ctx.arc(screenPos.x, screenPos.y, C.VERTEX_RADIUS, 0, 2 * Math.PI);
                ctx.fill();
                drawnMergeIndicators.add(key);
            }
        }
    };

    ctx.fillStyle = colors.feedbackSnapped;

    for (const copy of copies) {
        for (const p_copy of copy) {
            for (const p_static of staticVertices) {
                drawIndicator(p_copy, p_static);
            }
        }
    }

    for (let i = 0; i < copies.length; i++) {
        for (let j = i + 1; j < copies.length; j++) {
            for (const pA of copies[i]) {
                for (const pB of copies[j]) {
                    drawIndicator(pA, pB);
                }
            }
        }
    }
}

function generateOptimizedAngleSequence(angleStep, minAngle, maxAngle) {
    const angles = [];
    
    const isWraparound = maxAngle > 360;
    
    if (isWraparound) {
        const actualMaxAngle = maxAngle - 360;
        
        const startAngle1 = Math.floor(minAngle / angleStep) * angleStep;
        for (let angle = startAngle1; angle < 360; angle += angleStep) {
            if (angle >= minAngle) {
                angles.push(angle);
            }
        }
        
        for (let angle = 0; angle <= actualMaxAngle + angleStep; angle += angleStep) {
            if (angle <= actualMaxAngle) {
                angles.push(angle);
            }
        }
    } else {
        const startAngle = Math.floor(minAngle / angleStep) * angleStep;
        for (let angle = startAngle; angle <= maxAngle + angleStep; angle += angleStep) {
            if (angle >= minAngle && angle <= maxAngle && angle >= 0 && angle < 360) {
                angles.push(angle);
            }
        }
    }
    
    return [...new Set(angles)].sort((a, b) => a - b);
}

function isTickVisible(tickEnd, canvasWidth, canvasHeight) {
    return tickEnd.x >= -C.AXIS_LABEL_PADDING && 
           tickEnd.x <= canvasWidth + C.AXIS_LABEL_PADDING && 
           tickEnd.y >= -C.AXIS_LABEL_PADDING && 
           tickEnd.y <= canvasHeight + C.AXIS_LABEL_PADDING;
}

export function drawPolarReferenceCircle(ctx, htmlOverlay, updateHtmlLabel, radius, alpha, { canvas, dpr, viewTransform, angleDisplayMode, colors }, dataToScreen, lastAngularGridState) {
    if (typeof dataToScreen !== 'function' || typeof updateHtmlLabel !== 'function') {
        return;
    }

    const originScreen = dataToScreen({ x: 0, y: 0 });
    const canvasWidthCSS = canvas.width / dpr;
    const canvasHeightCSS = canvas.height / dpr;
    const screenCenter = { x: canvasWidthCSS / 2, y: canvasHeightCSS / 2 };
    const baseRadius = Math.min(canvasWidthCSS, canvasHeightCSS) / 4;
    const panDistance = U.distance(originScreen, screenCenter);
    const screenRadius = baseRadius + panDistance;

    if (screenRadius < C.REF_CIRCLE_MIN_DISPLAY_RADIUS || !isCircleInView(originScreen.x, originScreen.y, screenRadius, canvasWidthCSS, canvasHeightCSS)) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;
    ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;

    const transitionRadius = Math.min(canvasWidthCSS, canvasHeightCSS) * 400;
    const isLineMode = screenRadius > transitionRadius;

    let visibleAngleRange = null;

    if (isLineMode) {
        const screenRect = { x: 0, y: 0, w: canvasWidthCSS, h: canvasHeightCSS };
        const circle = { x: originScreen.x, y: originScreen.y, r: screenRadius };
        const intersections = getCircleRectIntersections(circle, screenRect);

        if (intersections.length >= 2) {
            let p1 = intersections[0], p2 = intersections[1];
            let maxDistSq = 0;
            for (let i = 0; i < intersections.length; i++) {
                for (let j = i + 1; j < intersections.length; j++) {
                    const dSq = (intersections[i].x - intersections[j].x)**2 + (intersections[i].y - intersections[j].y)**2;
                    if (dSq > maxDistSq) {
                        maxDistSq = dSq;
                        p1 = intersections[i];
                        p2 = intersections[j];
                    }
                }
            }
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            const angle1 = (Math.atan2(originScreen.y - p1.y, p1.x - originScreen.x) * 180 / Math.PI + 360) % 360;
            const angle2 = (Math.atan2(originScreen.y - p2.y, p2.x - originScreen.x) * 180 / Math.PI + 360) % 360;
            visibleAngleRange = { minAngle: Math.min(angle1, angle2), maxAngle: Math.max(angle1, angle2), isFullCircle: false };
            if (Math.abs(angle1 - angle2) > 180) {
                 visibleAngleRange = { minAngle: Math.max(angle1, angle2), maxAngle: Math.min(angle1, angle2) + 360, isFullCircle: false };
            }
        }
    } else {
        ctx.beginPath();
        ctx.arc(originScreen.x, originScreen.y, screenRadius, 0, 2 * Math.PI);
        ctx.stroke();
        visibleAngleRange = calculateVisibleAngleRange(originScreen, screenRadius, canvasWidthCSS, canvasHeightCSS);
    }
    
    ctx.restore();
    
    if (!visibleAngleRange) return;

    const dataRadius = screenRadius / (viewTransform.scale / dpr);
    const drawnAnglesSimple = new Set();
    const drawnAnglesComplex = new Map();

    lastAngularGridState.forEach(level => {
        const tickAlpha = level.alpha;
        if (tickAlpha < 0.01) return;

        const screenSeparation = screenRadius * (level.angle * Math.PI / 180);
        
        if (screenSeparation < C.REF_CIRCLE_MIN_TICK_SPACING * 0.5) return;

        const finalColor = `rgba(${colors.feedbackDefault.join(',')}, ${tickAlpha * 0.95})`;

        let anglesToProcess;
        if (visibleAngleRange.isFullCircle) {
            anglesToProcess = [];
            for (let deg = 0; deg < 360; deg += level.angle) {
                anglesToProcess.push(deg);
            }
        } else {
            anglesToProcess = generateOptimizedAngleSequence(
                level.angle,
                visibleAngleRange.minAngle,
                visibleAngleRange.maxAngle
            );
        }

        anglesToProcess.forEach(deg => {
            if (angleDisplayMode === 'degrees') {
                if (drawnAnglesSimple.has(deg)) return;
            }
            else if (angleDisplayMode === 'radians') {
                const levelKey = `${deg}-${level.angle}`;
                if (drawnAnglesComplex.has(levelKey)) return;
            }

            const angleRad = deg * Math.PI / 180;
            let labelOptions = { textAlign: 'center', textBaseline: 'middle' };
            
            if (angleDisplayMode === 'radians') {
                labelOptions = { textAlign: 'left', textBaseline: 'middle' };
            }
            
            let labelPos;

            ctx.save();
            ctx.strokeStyle = finalColor;
            ctx.lineWidth = C.GRID_LINEWIDTH;

            if (deg % 90 === 0 && deg < 360) {
                const vertexOnCircle = { 
                    x: originScreen.x + screenRadius * Math.cos(angleRad), 
                    y: originScreen.y - screenRadius * Math.sin(angleRad) 
                };

                let tickVec;
                const tickLength = C.AXIS_TICK_SIZE * 1.5;
                
                switch (deg) {
                    case 0:
                        tickVec = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
                        labelOptions = { textAlign: 'left', textBaseline: 'bottom' };
                        break;
                    case 90:
                        tickVec = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
                        labelOptions = { textAlign: 'left', textBaseline: 'bottom' };
                        break;
                    case 180:
                        tickVec = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
                        labelOptions = { textAlign: 'right', textBaseline: 'bottom' };
                        break;
                    case 270:
                        tickVec = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
                        labelOptions = { textAlign: 'left', textBaseline: 'top' };
                        break;
                }
                
                const tickEnd = {
                    x: vertexOnCircle.x + tickVec.x * tickLength,
                    y: vertexOnCircle.y + tickVec.y * tickLength
                };

                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(vertexOnCircle.x, vertexOnCircle.y);
                ctx.lineTo(tickEnd.x, tickEnd.y);
                ctx.stroke();
                
                labelPos = { x: tickEnd.x, y: tickEnd.y };

            } else {
                const tickStart = { 
                    x: originScreen.x + (screenRadius - C.VERTEX_RADIUS) * Math.cos(angleRad), 
                    y: originScreen.y - (screenRadius - C.VERTEX_RADIUS) * Math.sin(angleRad) 
                };
                const tickEnd = { 
                    x: originScreen.x + (screenRadius + C.VERTEX_RADIUS) * Math.cos(angleRad), 
                    y: originScreen.y - (screenRadius + C.VERTEX_RADIUS) * Math.sin(angleRad) 
                };
                if (isTickVisible(tickEnd, canvasWidthCSS, canvasHeightCSS)) {
                    ctx.beginPath();
                    ctx.moveTo(tickStart.x, tickStart.y);
                    ctx.lineTo(tickEnd.x, tickEnd.y);
                    ctx.stroke();
                }
                labelPos = { 
                    x: originScreen.x + (screenRadius + C.REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN) * Math.cos(angleRad), 
                    y: originScreen.y - (screenRadius + C.REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN) * Math.sin(angleRad) 
                };
            }
            
            ctx.restore();
            
            let angleText = '';
            if (angleDisplayMode === 'degrees') {
                let precision = Math.max(0, (level.angle.toString().split('.')[1] || '').length);
                
                if (level.angle < 1) {
                    precision = Math.max(precision, Math.ceil(-Math.log10(level.angle)) + 1);
                }
                
                const formattedDeg = parseFloat(deg.toFixed(precision));
                angleText = `${formattedDeg}^{\\circ}`;
            } else {
                if (deg === 0 && angleDisplayMode === 'radians') {
                    angleText = '0';
                } else if (deg !== 0) {
                    const isFineTick = level.angle <= 5;
                    
                    if (isFineTick) {
                        const radianValue = deg * Math.PI / 180;
                        
                        let precision;
                        if (level.angle >= 1) {
                            precision = 3;
                        } else if (level.angle >= 0.1) {
                            precision = 4;
                        } else if (level.angle >= 0.01) {
                            precision = 5;
                        } else if (level.angle >= 0.001) {
                            precision = 6;
                        } else {
                            precision = 7;
                        }
                        
                        let formattedRadian = radianValue.toFixed(precision);
                        
                        if (parseFloat(formattedRadian) !== 0) {
                            angleText = formattedRadian;
                        }
                    } else {
                        const numerator = deg;
                        const denominator = 180;
                        
                        const gcdValue = U.gcd(numerator, denominator);
                        const simplifiedNum = numerator / gcdValue;
                        const simplifiedDen = denominator / gcdValue;
                        
                        if (simplifiedDen === 1) {
                            if (simplifiedNum === 1) angleText = '\\pi';
                            else if (simplifiedNum === -1) angleText = '-\\pi';
                            else angleText = `${simplifiedNum}\\pi`;
                        } else {
                            if (simplifiedNum === 1) angleText = `\\frac{\\pi}{${simplifiedDen}}`;
                            else if (simplifiedNum === -1) angleText = `-\\frac{\\pi}{${simplifiedDen}}`;
                            else if (simplifiedNum < 0) angleText = `-\\frac{${Math.abs(simplifiedNum)}\\pi}{${simplifiedDen}}`;
                            else angleText = `\\frac{${simplifiedNum}\\pi}{${simplifiedDen}}`;
                        }
                    }
                }
            }

            if (angleText) {
                const labelId = angleDisplayMode === 'radians' 
                    ? `circ-label-${deg}-${level.angle}-${dataRadius.toExponential(15)}`
                    : `circ-label-${deg}-${dataRadius.toExponential(15)}`;
                    
                updateHtmlLabel({ 
                    id: labelId, 
                    content: angleText, 
                    x: labelPos.x, 
                    y: labelPos.y, 
                    color: finalColor, 
                    fontSize: C.REF_TEXT_KATEX_FONT_SIZE, 
                    options: labelOptions
                });
                
                if (angleDisplayMode === 'degrees') {
                    drawnAnglesSimple.add(deg);
                } else {
                    const levelKey = `${deg}-${level.angle}`;
                    drawnAnglesComplex.set(levelKey, { 
                        levelAngle: level.angle, 
                        alpha: tickAlpha,
                        labelId: labelId 
                    });
                }
            }
        });
    });

    const arrowColor = colors.feedbackDefault;
    let stickyArrowAngle = -Infinity;
    const zeroDegVertex = { x: originScreen.x + screenRadius, y: originScreen.y };
    if (zeroDegVertex.x > -C.AXIS_LABEL_PADDING && zeroDegVertex.x < canvasWidthCSS + C.AXIS_LABEL_PADDING && zeroDegVertex.y > -C.AXIS_LABEL_PADDING && zeroDegVertex.y < canvasHeightCSS + C.AXIS_LABEL_PADDING) {
        stickyArrowAngle = 0;
    } else {
        const screenRect = { x: 0, y: 0, w: canvasWidthCSS, h: canvasHeightCSS };
        const circle = { x: originScreen.x, y: originScreen.y, r: screenRadius };
        const intersections = getCircleRectIntersections(circle, screenRect);
        let boundaryAngles = intersections.map(p => Math.atan2(originScreen.y - p.y, p.x - originScreen.x));
        const corners = [{x:0,y:0}, {x:screenRect.w,y:0}, {x:screenRect.w,y:screenRect.h}, {x:0,y:screenRect.h}];
        corners.forEach(c => {
            if (U.distance(c, circle) < circle.r) {
                boundaryAngles.push(Math.atan2(originScreen.y - c.y, c.x - originScreen.x));
            }
        });

        if (boundaryAngles.length > 0) {
            boundaryAngles = boundaryAngles.map(a => (a < 0) ? a + 2 * Math.PI : a).sort((a, b) => a - b);
            let uniqueAngles = [...new Set(boundaryAngles.map(a => parseFloat(a.toFixed(7))))];
            if (uniqueAngles.length > 0) {
                uniqueAngles.push(uniqueAngles[0] + 2 * Math.PI);
                let lastVisibleEndAngle = -Infinity;
                for (let i = 0; i < uniqueAngles.length - 1; i++) {
                    const startAngle = uniqueAngles[i];
                    const endAngle = uniqueAngles[i+1];
                    const midAngle = (startAngle + endAngle) / 2;
                    const midVertex = { x: circle.x + circle.r * Math.cos(midAngle), y: circle.y - circle.r * Math.sin(midAngle) };
                    if (midVertex.x > 0 && midVertex.x < screenRect.w && midVertex.y > 0 && midVertex.y < screenRect.h) {
                        lastVisibleEndAngle = endAngle;
                    }
                }
                if (lastVisibleEndAngle > -Infinity) {
                    stickyArrowAngle = lastVisibleEndAngle % (2 * Math.PI);
                }
            }
        }
    }

    if (stickyArrowAngle > -Infinity) {
        const arrowAngle = stickyArrowAngle;
        const tipPos = { x: originScreen.x + screenRadius * Math.cos(arrowAngle), y: originScreen.y - screenRadius * Math.sin(arrowAngle) };
        const tangentVec = { x: -Math.sin(arrowAngle), y: -Math.cos(arrowAngle) };
        const radialVec = { x: Math.cos(arrowAngle), y: -Math.sin(arrowAngle) };
        const p1 = { x: tipPos.x - C.AXIS_ARROW_SIZE * tangentVec.x + (C.AXIS_ARROW_SIZE / 2) * radialVec.x, y: tipPos.y - C.AXIS_ARROW_SIZE * tangentVec.y + (C.AXIS_ARROW_SIZE / 2) * radialVec.y };
        const p2 = { x: tipPos.x - C.AXIS_ARROW_SIZE * tangentVec.x - (C.AXIS_ARROW_SIZE / 2) * radialVec.x, y: tipPos.y - C.AXIS_ARROW_SIZE * tangentVec.y - (C.AXIS_ARROW_SIZE / 2) * radialVec.y };
        ctx.save();
        ctx.fillStyle = `rgba(${arrowColor.join(',')}, 1.0)`;
        ctx.beginPath();
        ctx.moveTo(tipPos.x, tipPos.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        let labelPos;
        if (arrowAngle === 0) {
            labelPos = {
                x: tipPos.x - C.POLAR_THETA_LABEL_DISTANCE,
                y: tipPos.y + C.POLAR_THETA_LABEL_ARROW_DIST + C.AXIS_ARROW_SIZE
            };
        } else {
            const radialVecInward = { x: -Math.cos(arrowAngle), y: Math.sin(arrowAngle) };
            labelPos = {
                x: tipPos.x + radialVecInward.x * (C.POLAR_THETA_LABEL_ARROW_DIST + C.AXIS_ARROW_SIZE) + tangentVec.x * C.POLAR_THETA_LABEL_DISTANCE,
                y: tipPos.y + radialVecInward.y * (C.POLAR_THETA_LABEL_ARROW_DIST + C.AXIS_ARROW_SIZE) + tangentVec.y * C.POLAR_THETA_LABEL_DISTANCE
            };
        }
        updateHtmlLabel({ id: `theta-label-sticky`, content: '\\theta', x: labelPos.x, y: labelPos.y, color: `rgba(${arrowColor.join(',')}, 1.0)`, fontSize: C.AXIS_NAME_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } });
    }
}

function getCircleRectIntersections(circle, rect) {
    const { x: cx, y: cy, r } = circle;
    const { x: rx, y: ry, w: rw, h: rh } = rect;
    const intersections = [];
    const checkLine = (x1, y1, x2, y2) => {
        const dx = x2 - x1, dy = y2 - y1;
        const a = dx * dx + dy * dy;
        const b = 2 * (dx * (x1 - cx) + dy * (y1 - cy));
        const c = (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy) - r * r;
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return;
        const sqrtD = Math.sqrt(discriminant);
        const t1 = (-b + sqrtD) / (2 * a);
        const t2 = (-b - sqrtD) / (2 * a);
        [t1, t2].forEach(t => {
            if (t >= 0 && t <= 1) {
                intersections.push({ x: x1 + t * dx, y: y1 + t * dy });
            }
        });
    };
    checkLine(rx, ry, rx + rw, ry);
    checkLine(rx + rw, ry, rx + rw, ry + rh);
    checkLine(rx + rw, ry + rh, rx, ry + rh);
    checkLine(rx, ry + rh, rx, ry);
    return intersections;
}

export function isCircleInView(circleX, circleY, circleRadius, canvasWidth, canvasHeight) {
    if (circleX + circleRadius < 0 ||
        circleX - circleRadius > canvasWidth ||
        circleY + circleRadius < 0 ||
        circleY - circleRadius > canvasHeight) {
        return false;
    }
    return true;
}

function drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel, colors) {
    const tickColor = `rgba(${colors.axisTickLabel.join(',')}, ${C.AXIS_TICK_LABEL_ALPHA})`;
    const longTickSize = C.AXIS_TICK_SIZE * C.AXIS_MAJOR_TICK_SCALE_FACTOR;
    
    ctx.save();
    ctx.strokeStyle = tickColor;
    ctx.lineWidth = C.MAJOR_TICK_LINE_WIDTH;
    ctx.setLineDash([]);
    
    const yLength = longTickSize;
    const xLength = yLength / Math.tan(C.ORIGIN_TICK_ANGLE_RAD);
    
    const endX = origin.x - xLength;
    const endY = origin.y + yLength;
    
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    ctx.restore();
    
    updateHtmlLabel({
        id: 'tick-label-origin',
        content: C.ORIGIN_LABEL_TEXT,
        x: origin.x - C.AXIS_TICK_SIZE - C.AXIS_LABEL_OFFSET,
        y: origin.y + C.AXIS_TICK_SIZE + C.AXIS_LABEL_OFFSET,
        color: tickColor,
        fontSize: C.AXIS_TICK_FONT_SIZE,
        options: { textAlign: 'right', textBaseline: 'top' }
    });
}

export function drawAxes(ctx, htmlOverlay, { canvas, dpr, coordsDisplayMode, viewTransform, angleDisplayMode, colors }, dataToScreen, screenToData, lastGridState, lastAngularGridState, updateHtmlLabel) {
    ctx.save();
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;
    const origin = dataToScreen({ x: 0, y: 0 });

    const drawAxisWithArrows = (x1, y1, x2, y2) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - C.AXIS_ARROW_SIZE * Math.cos(angle - C.AXIS_ARROW_ANGLE_RAD), y2 - C.AXIS_ARROW_SIZE * Math.sin(angle - C.AXIS_ARROW_ANGLE_RAD));
        ctx.lineTo(x2 - C.AXIS_ARROW_SIZE * Math.cos(angle + C.AXIS_ARROW_ANGLE_RAD), y2 - C.AXIS_ARROW_SIZE * Math.sin(angle + C.AXIS_ARROW_ANGLE_RAD));
        ctx.closePath();
        ctx.fill();
    };

    const drawTicksAndLabels = (interval1, alpha1, interval2, alpha2, isPolar) => {
        const drawnXPositions = new Map();
        const drawnYPositions = new Map();
        
        const addTicksForInterval = (interval, alpha, isCoarser) => {
            if (!interval || alpha < C.MIN_ALPHA_FOR_DRAWING) return;
            const topLeftData = screenToData({ x: 0, y: 0 });
            const bottomRightData = screenToData({ x: canvasWidth, y: canvasHeight });
            const localZeroThreshold = interval * C.GEOMETRY_CALCULATION_EPSILON;
            
            if (isPolar) {
                const maxRadiusData = Math.hypot(Math.max(Math.abs(topLeftData.x), Math.abs(bottomRightData.x)), Math.max(Math.abs(topLeftData.y), Math.abs(bottomRightData.y))) * C.POLAR_AXIS_RADIUS_BUFFER_FACTOR;
                
                for (let r_data = interval; r_data <= maxRadiusData; r_data += interval) {
                    if (Math.abs(r_data) < localZeroThreshold) continue;
                    const existing = drawnXPositions.get(r_data);
                    if (!existing) {
                        drawnXPositions.set(r_data, { alpha, isCoarser });
                    } else if (isCoarser) {
                        drawnXPositions.set(r_data, { alpha: Math.max(existing.alpha, alpha), isCoarser: true });
                    } else {
                        if (!existing.isCoarser) {
                            drawnXPositions.set(r_data, { alpha: Math.max(existing.alpha, alpha), isCoarser: false });
                        }
                    }
                }
            } else {
                const startTickX = Math.floor(topLeftData.x / interval) * interval;
                const endTickX = Math.ceil(bottomRightData.x / interval) * interval;
                const startTickY = Math.floor(bottomRightData.y / interval) * interval;
                const endTickY = Math.ceil(topLeftData.y / interval) * interval;
                
                for (let x_data = startTickX; x_data <= endTickX; x_data += interval) {
                    if (Math.abs(x_data) < localZeroThreshold) continue;
                    const existing = drawnXPositions.get(x_data);
                    if (!existing) {
                        drawnXPositions.set(x_data, { alpha, isCoarser });
                    } else if (isCoarser) {
                        drawnXPositions.set(x_data, { alpha: Math.max(existing.alpha, alpha), isCoarser: true });
                    } else {
                        if (!existing.isCoarser) {
                            drawnXPositions.set(x_data, { alpha: Math.max(existing.alpha, alpha), isCoarser: false });
                        }
                    }
                }
                
                for (let y_data = startTickY; y_data <= endTickY; y_data += interval) {
                    if (Math.abs(y_data) < localZeroThreshold) continue;
                    const existing = drawnYPositions.get(y_data);
                    if (!existing) {
                        drawnYPositions.set(y_data, { alpha, isCoarser });
                    } else if (isCoarser) {
                        drawnYPositions.set(y_data, { alpha: Math.max(existing.alpha, alpha), isCoarser: true });
                    } else {
                        if (!existing.isCoarser) {
                            drawnYPositions.set(y_data, { alpha: Math.max(existing.alpha, alpha), isCoarser: false });
                        }
                    }
                }
            }
        };
        
        const interval1IsCoarser = !interval2 || interval1 >= interval2;
        
        addTicksForInterval(interval1, alpha1, interval1IsCoarser);
        addTicksForInterval(interval2, alpha2, !interval1IsCoarser);
        
        drawnXPositions.forEach((tickInfo, x_data) => {
            const effectiveAlpha = tickInfo.isCoarser ? 1.0 : tickInfo.alpha;
            const tickLabelColor = `rgba(${colors.axisTickLabel.join(',')}, ${C.AXIS_TICK_LABEL_ALPHA * effectiveAlpha})`;
            ctx.strokeStyle = tickLabelColor;
            ctx.lineWidth = C.GRID_LINEWIDTH;
            
            let sourceInterval = interval1;
            if (interval2 && Math.abs(x_data % interval2) < Math.abs(x_data % interval1)) {
                sourceInterval = interval2;
            }
            const screenSpacing = sourceInterval * viewTransform.scale;
            let sigFigsForLabel = 0;
            if (screenSpacing > C.TICK_LABEL_SIGFIG_THRESH_1) sigFigsForLabel = 3; 
            else if (screenSpacing > C.TICK_LABEL_SIGFIG_THRESH_2) sigFigsForLabel = 2; 
            else if (screenSpacing > C.TICK_LABEL_SIGFIG_THRESH_3) sigFigsForLabel = 1; 
            else sigFigsForLabel = 0;
            
            const decimalPlacesInInterval = sourceInterval > 0 ? -Math.floor(Math.log10(sourceInterval)) : 0;
            if (decimalPlacesInInterval > 0) {
                sigFigsForLabel = Math.max(sigFigsForLabel, decimalPlacesInInterval + 1);
            }
            
            if (isPolar) {
                const labelText = U.formatNumber(x_data, sigFigsForLabel);
                const stableIdPart = x_data.toExponential(15);
                
                const isYAxisOnScreen = origin.y > -C.AXIS_LABEL_PADDING && origin.y < canvasHeight + C.AXIS_LABEL_PADDING;
                const isXAxisOnScreen = origin.x > -C.AXIS_LABEL_PADDING && origin.x < canvasWidth + C.AXIS_LABEL_PADDING;

                const pX = dataToScreen({ x: x_data, y: 0 });
                if (isYAxisOnScreen && pX.x > -C.AXIS_LABEL_PADDING && pX.x < canvasWidth + C.AXIS_LABEL_PADDING) {
                    ctx.beginPath(); 
                    ctx.moveTo(pX.x, origin.y - C.AXIS_TICK_SIZE / 2); 
                    ctx.lineTo(pX.x, origin.y + C.AXIS_TICK_SIZE / 2); 
                    ctx.stroke();
                    updateHtmlLabel({ 
                        id: `polartick-r-x-${stableIdPart}`, 
                        content: labelText, 
                        x: pX.x, 
                        y: origin.y + C.AXIS_TICK_SIZE + C.AXIS_LABEL_OFFSET, 
                        color: tickLabelColor, 
                        fontSize: C.AXIS_TICK_FONT_SIZE, 
                        options: { textAlign: 'center', textBaseline: 'top' } 
                    });
                }
                
                const pNegX = dataToScreen({ x: -x_data, y: 0 });
                if (isYAxisOnScreen && pNegX.x > -C.AXIS_LABEL_PADDING && pNegX.x < canvasWidth + C.AXIS_LABEL_PADDING) {
                    ctx.beginPath(); 
                    ctx.moveTo(pNegX.x, origin.y - C.AXIS_TICK_SIZE / 2); 
                    ctx.lineTo(pNegX.x, origin.y + C.AXIS_TICK_SIZE / 2); 
                    ctx.stroke();
                    updateHtmlLabel({ 
                        id: `polartick-r-negx-${stableIdPart}`, 
                        content: labelText, 
                        x: pNegX.x, 
                        y: origin.y + C.AXIS_TICK_SIZE + C.AXIS_LABEL_OFFSET, 
                        color: tickLabelColor, 
                        fontSize: C.AXIS_TICK_FONT_SIZE, 
                        options: { textAlign: 'center', textBaseline: 'top' } 
                    });
                }
                
                const pPosY = dataToScreen({ x: 0, y: x_data });
                if (isXAxisOnScreen && pPosY.y > -C.AXIS_LABEL_PADDING && pPosY.y < canvasHeight + C.AXIS_LABEL_PADDING) {
                    ctx.beginPath(); 
                    ctx.moveTo(origin.x - C.AXIS_TICK_SIZE / 2, pPosY.y); 
                    ctx.lineTo(origin.x + C.AXIS_TICK_SIZE / 2, pPosY.y); 
                    ctx.stroke();
                    updateHtmlLabel({ 
                        id: `polartick-r-posy-${stableIdPart}`, 
                        content: labelText, 
                        x: origin.x - C.AXIS_TICK_SIZE - C.AXIS_LABEL_OFFSET, 
                        y: pPosY.y, 
                        color: tickLabelColor, 
                        fontSize: C.AXIS_TICK_FONT_SIZE, 
                        options: { textAlign: 'right', textBaseline: 'middle' } 
                    });
                }
                
                const pNegY = dataToScreen({ x: 0, y: -x_data });
                if (isXAxisOnScreen && pNegY.y > -C.AXIS_LABEL_PADDING && pNegY.y < canvasHeight + C.AXIS_LABEL_PADDING) {
                    ctx.beginPath(); 
                    ctx.moveTo(origin.x - C.AXIS_TICK_SIZE / 2, pNegY.y); 
                    ctx.lineTo(origin.x + C.AXIS_TICK_SIZE / 2, pNegY.y); 
                    ctx.stroke();
                    updateHtmlLabel({ 
                        id: `polartick-r-negy-${stableIdPart}`, 
                        content: labelText, 
                        x: origin.x - C.AXIS_TICK_SIZE - C.AXIS_LABEL_OFFSET, 
                        y: pNegY.y, 
                        color: tickLabelColor, 
                        fontSize: C.AXIS_TICK_FONT_SIZE, 
                        options: { textAlign: 'right', textBaseline: 'middle' } 
                    });
                }
            } else {
                const screenX = dataToScreen({ x: x_data, y: 0 }).x;
                ctx.beginPath(); 
                ctx.moveTo(screenX, origin.y); 
                ctx.lineTo(screenX, origin.y + C.AXIS_TICK_SIZE); 
                ctx.stroke();
                
                const getStableId = (prefix, num) => `${prefix}-${num.toExponential(15)}`;
                updateHtmlLabel({ 
                    id: getStableId('tick-label-x', x_data), 
                    content: U.formatNumber(x_data, sigFigsForLabel), 
                    x: screenX, 
                    y: origin.y + C.AXIS_TICK_SIZE + C.AXIS_LABEL_OFFSET, 
                    color: tickLabelColor, 
                    fontSize: C.AXIS_TICK_FONT_SIZE, 
                    options: { textAlign: 'center', textBaseline: 'top' } 
                });
            }
        });
        
        if (!isPolar) {
            drawnYPositions.forEach((tickInfo, y_data) => {
                const effectiveAlpha = tickInfo.isCoarser ? 1.0 : tickInfo.alpha;
                const tickLabelColor = `rgba(${colors.axisTickLabel.join(',')}, ${C.AXIS_TICK_LABEL_ALPHA * effectiveAlpha})`;
                ctx.strokeStyle = tickLabelColor;
                ctx.lineWidth = C.GRID_LINEWIDTH;
                
                let sourceInterval = interval1;
                if (interval2 && Math.abs(y_data % interval2) < Math.abs(y_data % interval1)) {
                    sourceInterval = interval2;
                }
                const screenSpacing = sourceInterval * viewTransform.scale;
                let sigFigsForLabel = 0;
                if (screenSpacing > C.TICK_LABEL_SIGFIG_THRESH_1) sigFigsForLabel = 3; 
                else if (screenSpacing > C.TICK_LABEL_SIGFIG_THRESH_2) sigFigsForLabel = 2; 
                else if (screenSpacing > C.TICK_LABEL_SIGFIG_THRESH_3) sigFigsForLabel = 1; 
                else sigFigsForLabel = 0;
                
                const decimalPlacesInInterval = sourceInterval > 0 ? -Math.floor(Math.log10(sourceInterval)) : 0;
                if (decimalPlacesInInterval > 0) {
                    sigFigsForLabel = Math.max(sigFigsForLabel, decimalPlacesInInterval + 1);
                }
                
                const screenY = dataToScreen({ x: 0, y: y_data }).y;
                let yLabelContent = U.formatNumber(y_data, sigFigsForLabel);
                if (coordsDisplayMode === C.COORDS_DISPLAY_MODE_COMPLEX && yLabelContent !== "0") {
                    if (yLabelContent === '1') yLabelContent = C.IMAGINARY_UNIT_SYMBOL;
                    else if (yLabelContent === '-1') yLabelContent = `-${C.IMAGINARY_UNIT_SYMBOL}`;
                    else yLabelContent += C.IMAGINARY_UNIT_SYMBOL;
                }
                
                ctx.beginPath(); 
                ctx.moveTo(origin.x, screenY); 
                ctx.lineTo(origin.x - C.AXIS_TICK_SIZE, screenY); 
                ctx.stroke();
                
                const getStableId = (prefix, num) => `${prefix}-${num.toExponential(15)}`;
                updateHtmlLabel({ 
                    id: getStableId('tick-label-y', y_data), 
                    content: yLabelContent, 
                    x: origin.x - C.AXIS_TICK_SIZE - C.AXIS_LABEL_OFFSET, 
                    y: screenY, 
                    color: tickLabelColor, 
                    fontSize: C.AXIS_TICK_FONT_SIZE, 
                    options: { textAlign: 'right', textBaseline: 'middle' } 
                });
            });
        }
    };

    ctx.lineWidth = C.AXIS_LINE_WIDTH;
    ctx.strokeStyle = colors.axis;
    ctx.fillStyle = colors.axis;

    if (coordsDisplayMode === C.COORDS_DISPLAY_MODE_POLAR) {
        const { interval1, interval2, alpha1, alpha2 } = lastGridState;
        ctx.lineWidth = C.GRID_LINEWIDTH;
        
        const posXVisible = canvasWidth > origin.x;
        const negXVisible = 0 < origin.x;
        const posYVisible = 0 < origin.y;
        const negYVisible = canvasHeight > origin.y;
        
        if (posXVisible) {
            drawAxisWithArrows(origin.x, origin.y, canvasWidth, origin.y);
            updateHtmlLabel({ 
                id: 'axis-label-r-posx', 
                content: C.POLAR_RADIUS_SYMBOL, 
                x: canvasWidth - C.AXIS_ARROW_SIZE - C.X_AXIS_LABEL_ARROW_DIST, 
                y: origin.y - C.X_AXIS_LABEL_DISTANCE, 
                color: colors.axis, 
                fontSize: C.AXIS_NAME_FONT_SIZE, 
                options: { textAlign: 'center', textBaseline: 'bottom' } 
            });
        }
        
        if (negXVisible) {
            drawAxisWithArrows(origin.x, origin.y, 0, origin.y);
            updateHtmlLabel({ 
                id: 'axis-label-r-negx', 
                content: C.POLAR_RADIUS_SYMBOL, 
                x: C.AXIS_ARROW_SIZE + C.X_AXIS_LABEL_ARROW_DIST, 
                y: origin.y - C.X_AXIS_LABEL_DISTANCE, 
                color: colors.axis, 
                fontSize: C.AXIS_NAME_FONT_SIZE, 
                options: { textAlign: 'center', textBaseline: 'bottom' } 
            });
        }
        
        if (posYVisible) {
            drawAxisWithArrows(origin.x, origin.y, origin.x, 0);
            updateHtmlLabel({ 
                id: 'axis-label-r-posy', 
                content: C.POLAR_RADIUS_SYMBOL, 
                x: origin.x + C.Y_AXIS_LABEL_DISTANCE, 
                y: C.AXIS_ARROW_SIZE + C.Y_AXIS_LABEL_ARROW_DIST, 
                color: colors.axis, 
                fontSize: C.AXIS_NAME_FONT_SIZE, 
                options: { textAlign: 'left', textBaseline: 'middle' } 
            });
        }
        
        if (negYVisible) {
            drawAxisWithArrows(origin.x, origin.y, origin.x, canvasHeight);
            updateHtmlLabel({ 
                id: 'axis-label-r-negy', 
                content: C.POLAR_RADIUS_SYMBOL, 
                x: origin.x + C.Y_AXIS_LABEL_DISTANCE, 
                y: canvasHeight - C.AXIS_ARROW_SIZE - C.Y_AXIS_LABEL_ARROW_DIST, 
                color: colors.axis, 
                fontSize: C.AXIS_NAME_FONT_SIZE, 
                options: { textAlign: 'left', textBaseline: 'middle' } 
            });
        }
        
        drawTicksAndLabels(interval1, alpha1, interval2, alpha2, true);
        drawPolarReferenceCircle(ctx, htmlOverlay, updateHtmlLabel, 0, 0, { canvas, dpr, coordsDisplayMode, viewTransform, angleDisplayMode, colors }, dataToScreen, lastAngularGridState);
    } else {
        if (origin.y > 0 && origin.y < canvasHeight) drawAxisWithArrows(0, origin.y, canvasWidth, origin.y);
        if (origin.x > 0 && origin.x < canvasWidth) drawAxisWithArrows(origin.x, canvasHeight, origin.x, 0);
        
        let xLabel = 'x';
        let yLabel = 'y';
        if (coordsDisplayMode === C.COORDS_DISPLAY_MODE_COMPLEX) {
            xLabel = C.COMPLEX_REAL_LABEL;
            yLabel = C.COMPLEX_IMAGINARY_LABEL;
        }
        
        updateHtmlLabel({ 
            id: 'axis-label-x', 
            content: xLabel, 
            x: canvasWidth - C.AXIS_ARROW_SIZE - C.X_AXIS_LABEL_ARROW_DIST, 
            y: origin.y - C.X_AXIS_LABEL_DISTANCE, 
            color: colors.axis, 
            fontSize: C.AXIS_NAME_FONT_SIZE, 
            options: { textAlign: 'center', textBaseline: 'bottom' } 
        });
        
        updateHtmlLabel({ 
            id: 'axis-label-y', 
            content: yLabel, 
            x: origin.x + C.Y_AXIS_LABEL_DISTANCE, 
            y: C.AXIS_ARROW_SIZE + C.Y_AXIS_LABEL_ARROW_DIST, 
            color: colors.axis, 
            fontSize: C.AXIS_NAME_FONT_SIZE, 
            options: { textAlign: 'left', textBaseline: 'middle' } 
        });
        
        drawTicksAndLabels(lastGridState.interval1, lastGridState.alpha1, lastGridState.interval2, lastGridState.alpha2, false);
    }

    drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel, colors);

    ctx.restore();
}

export function drawGrid(ctx, { gridDisplayMode, canvas, dpr, viewTransform, gridAlpha, colors }, dataToScreen, screenToData, lastGridState, lastAngularGridState) {
    
    if (gridDisplayMode === C.GRID_DISPLAY_MODE_NONE) return;

    ctx.save();

    const origin = dataToScreen({ x: 0, y: 0 });
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;

    if (gridDisplayMode === C.GRID_DISPLAY_MODE_POLAR) {
        const topLeftData = screenToData({ x: 0, y: 0 });
        const bottomRightData = screenToData({ x: canvasWidth, y: canvasHeight });
        const maxDataRadius = Math.hypot(Math.max(Math.abs(topLeftData.x), Math.abs(bottomRightData.x)), Math.max(Math.abs(topLeftData.y), Math.abs(bottomRightData.y)));
        const transitionRadius = Math.min(canvasWidth, canvasHeight) * C.POLAR_TO_LINE_TRANSITION_RADIUS_FACTOR;

        const drawPolarCircles = (interval, alpha) => {
            if (!interval || alpha < C.MIN_ALPHA_FOR_DRAWING) return;
            
            const screenSpacing = interval * viewTransform.scale / dpr;
            if (screenSpacing < C.GRID_POLAR_CIRCLE_MIN_SPACING) return;

            ctx.strokeStyle = `rgba(${colors.grid.join(',')}, ${alpha * gridAlpha})`;
            ctx.lineWidth = C.GRID_LINEWIDTH;
            for (let r = interval; r <= maxDataRadius; r += interval) {
                const screenRadius = r * viewTransform.scale / dpr;
                
                if (screenRadius > transitionRadius) {
                    const circle = { x: origin.x, y: origin.y, r: screenRadius };
                    const intersections = getCircleRectIntersections(circle, {x: 0, y: 0, w: canvasWidth, h: canvasHeight});
                    if (intersections.length >= 2) {
                        let p1 = intersections[0], p2 = intersections[1], maxDistSq = 0;
                        for (let i = 0; i < intersections.length; i++) {
                            for (let j = i + 1; j < intersections.length; j++) {
                                const dSq = (intersections[i].x - intersections[j].x)**2 + (intersections[i].y - intersections[j].y)**2;
                                if (dSq > maxDistSq) {
                                    maxDistSq = dSq;
                                    p1 = intersections[i];
                                    p2 = intersections[j];
                                }
                            }
                        }
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                } else {
                    if (isCircleInView(origin.x, origin.y, screenRadius, canvasWidth, canvasHeight)) {
                        ctx.beginPath();
                        ctx.arc(origin.x, origin.y, screenRadius, 0, C.RADIANS_IN_CIRCLE);
                        ctx.stroke();
                    }
                }
            }
        };

        drawPolarCircles(lastGridState.interval1, lastGridState.alpha1);
        drawPolarCircles(lastGridState.interval2, lastGridState.alpha2);

        const screenRadiusForSpokes = maxDataRadius * viewTransform.scale / dpr;
        const drawnAngles = new Set();
        
        let visibleAngleInfo = null;
        if (screenRadiusForSpokes < canvasWidth * 10) {
            visibleAngleInfo = { ranges: [[0, 360]], isFullCircle: true };
        } else {
            visibleAngleInfo = calculateVisibleAngleRange(origin, screenRadiusForSpokes, canvasWidth, canvasHeight);
        }

        if (!visibleAngleInfo) {
            ctx.restore();
            return;
        }

        lastAngularGridState.forEach(level => {
            if (level.alpha < C.MIN_ALPHA_FOR_DRAWING) return;

            const screenSeparation = screenRadiusForSpokes * (level.angle * Math.PI / 180);
            if (screenSeparation < C.GRID_POLAR_SPOKE_MIN_SPACING && screenRadiusForSpokes > C.GRID_POLAR_SPOKE_MIN_RADIUS) return;

            ctx.strokeStyle = `rgba(${colors.grid.join(',')}, ${level.alpha * gridAlpha})`;
            ctx.lineWidth = C.GRID_LINEWIDTH;

            let anglesToProcess = [];
            if (visibleAngleInfo.isFullCircle) {
                for (let deg = 0; deg < C.DEGREES_IN_CIRCLE; deg += level.angle) {
                    anglesToProcess.push(deg);
                }
            } else {
                visibleAngleInfo.ranges.forEach(range => {
                    const [min, max] = range;
                    anglesToProcess.push(...generateOptimizedAngleSequence(level.angle, min, max));
                });
                anglesToProcess = [...new Set(anglesToProcess)];
            }

            anglesToProcess.forEach(angle => {
                if (drawnAngles.has(angle)) return;

                const rad = angle * Math.PI / 180;
                const endX = origin.x + screenRadiusForSpokes * Math.cos(rad);
                const endY = origin.y - screenRadiusForSpokes * Math.sin(rad);
                ctx.beginPath();
                ctx.moveTo(origin.x, origin.y);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                drawnAngles.add(angle);
            });
        });

    } else {
        const drawGridElements = (interval, alpha) => {
            if (!interval || alpha < C.MIN_ALPHA_FOR_DRAWING) return;
            const gridElementColor = `rgba(${colors.grid.join(',')}, ${alpha * gridAlpha})`;

            const start = screenToData({ x: 0, y: canvasHeight });
            const end = screenToData({ x: canvasWidth, y: 0 });
            const startTickX = Math.floor(start.x / interval) * interval;
            const endTickX = Math.ceil(end.x / interval) * interval;
            const startTickY = Math.floor(start.y / interval) * interval;
            const endTickY = Math.ceil(end.y / interval) * interval;

            if (gridDisplayMode === C.GRID_DISPLAY_MODE_LINES) {
                ctx.strokeStyle = gridElementColor;
                ctx.lineWidth = C.GRID_LINEWIDTH;
                for (let x = startTickX; x <= endTickX; x += interval) {
                    const screenX = dataToScreen({ x: x, y: 0 }).x;
                    ctx.beginPath();
                    ctx.moveTo(screenX, 0);
                    ctx.lineTo(screenX, canvasHeight);
                    ctx.stroke();
                }
                for (let y = startTickY; y <= endTickY; y += interval) {
                    const screenY = dataToScreen({ x: 0, y: y }).y;
                    ctx.beginPath();
                    ctx.moveTo(0, screenY);
                    ctx.lineTo(canvasWidth, screenY);
                    ctx.stroke();
                }
            } else if (gridDisplayMode === C.GRID_DISPLAY_MODE_POINTS) {
                ctx.fillStyle = gridElementColor;
                const vertexRadius = C.GRID_POINT_RADIUS * dpr;
                for (let x = startTickX; x <= endTickX; x += interval) {
                    for (let y = startTickY; y <= endTickY; y += interval) {
                        const screenPos = dataToScreen({ x: x, y: y });
                        ctx.beginPath();
                        ctx.arc(screenPos.x, screenPos.y, vertexRadius, 0, C.RADIANS_IN_CIRCLE);
                        ctx.fill();
                    }
                }
            } else if (gridDisplayMode === C.GRID_DISPLAY_MODE_TRIANGULAR) {
                ctx.fillStyle = gridElementColor;
                const vertexRadius = C.GRID_POINT_RADIUS * dpr;
                const y_step = interval * C.TRIANGULAR_GRID_Y_STEP_FACTOR;
                
                const startTickY_tri = Math.floor(start.y / y_step) * y_step;
                const endTickY_tri = Math.ceil(end.y / y_step) * y_step;
                
                for (let y = startTickY_tri; y <= endTickY_tri; y += y_step) {
                    const rowIndex = Math.round(y / y_step);
                    const x_offset = (rowIndex % 2 !== 0) ? interval / 2 : 0;
                    for (let x = startTickX; x <= endTickX; x += interval) {
                        const finalX = x + x_offset;
                        const screenPos = dataToScreen({ x: finalX, y: y });
                        ctx.beginPath();
                        ctx.arc(screenPos.x, screenPos.y, vertexRadius, 0, C.RADIANS_IN_CIRCLE);
                        ctx.fill();
                    }
                }
            }
        };
        drawGridElements(lastGridState.interval1, lastGridState.alpha1);
        drawGridElements(lastGridState.interval2, lastGridState.alpha2);
    }
    ctx.restore();
}

export function drawAngleArc(ctx, centerScreen, dataStartAngleRad, dataEndAngleRad, radius, color, isDashed = false) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = C.GRID_LINEWIDTH;
    ctx.setLineDash(isDashed ? C.DASH_PATTERN_SMALL : []);
    const canvasStartAngle = -dataStartAngleRad;
    const canvasEndAngle = -dataEndAngleRad;
    let signedAngleDiffData = U.normalizeAngleToPi(dataEndAngleRad - dataStartAngleRad);
    ctx.beginPath();
    ctx.arc(centerScreen.x, centerScreen.y, radius, canvasStartAngle, canvasEndAngle, signedAngleDiffData > 0);
    ctx.stroke();
    ctx.restore();
}

export function drawVertex(ctx, vertex, { selectedVertexIds, selectedCenterIds, activeCenterId, colors, verticesVisible = true, isHovered = false }, dataToScreen, updateHtmlLabel) {
    let isSelected;
    if (vertex.type === C.VERTEX_TYPE_REGULAR) {
        isSelected = selectedVertexIds.includes(vertex.id);
        
        if (!verticesVisible && !isSelected && !isHovered) {
            return;
        }
    } else {
        isSelected = selectedCenterIds.includes(vertex.id);
    }

    const vertexColor = vertex.color || colors.vertex;
    const screenPos = dataToScreen(vertex);

    switch (vertex.type) {
        case C.VERTEX_TYPE_REGULAR:
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, C.VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
            ctx.fillStyle = vertexColor;
            ctx.fill();
            break;
        case C.TRANSFORMATION_TYPE_ROTATION:
        case C.TRANSFORMATION_TYPE_SCALE:
        case C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE:
            const onCanvasIconSize = C.CENTER_POINT_VISUAL_RADIUS * 2;
            const icon = {
                type: vertex.type,
                x: screenPos.x - onCanvasIconSize / 2,
                y: screenPos.y - onCanvasIconSize / 2,
                width: onCanvasIconSize,
                height: onCanvasIconSize
            };
            drawUITransformationSymbols(ctx, icon, colors);
            break;
    }

    const shouldGlow = isSelected || isHovered;
    if (shouldGlow) {
        ctx.save();
        ctx.shadowColor = vertex.id === activeCenterId ? colors.activeCenterGlow : colors.selectionGlow;
        ctx.shadowBlur = C.SELECTION_GLOW_BLUR_RADIUS;
        ctx.globalAlpha = C.SELECTION_GLOW_ALPHA;

        ctx.beginPath();
        let glowRadius;
        if (vertex.type === C.VERTEX_TYPE_REGULAR) {
            glowRadius = C.VERTEX_RADIUS + C.SELECTION_GLOW_RADIUS_OFFSET;
        } else {
            glowRadius = C.CENTER_POINT_VISUAL_RADIUS + C.SELECTION_GLOW_RADIUS_OFFSET;
        }
        ctx.arc(screenPos.x, screenPos.y, glowRadius, 0, C.RADIANS_IN_CIRCLE);
        ctx.strokeStyle = vertex.id === activeCenterId ? colors.activeCenterGlow : colors.selectionGlow;
        ctx.lineWidth = C.SELECTION_GLOW_LINE_WIDTH;
        ctx.stroke();

        ctx.restore();
    }
}

export function drawAllEdges(ctx, { allEdges, selectedEdgeIds, isDragConfirmed, dragPreviewVertices, colors, edgesVisible }, dataToScreen, findVertexById, getEdgeId) {
    ctx.lineWidth = C.LINE_WIDTH;
    allEdges.forEach(edge => {
        const p1_orig = findVertexById(edge.id1);
        const p2_orig = findVertexById(edge.id2);
        if (!p1_orig || !p2_orig || p1_orig.type !== C.VERTEX_TYPE_REGULAR || p2_orig.type !== C.VERTEX_TYPE_REGULAR) return;

        const edgeId = getEdgeId(edge);
        const isSelected = selectedEdgeIds.includes(edgeId);
        
        if (!edgesVisible && !isSelected) return;

        let p1_render = { ...p1_orig };
        let p2_render = { ...p2_orig };
        let shouldBeDashed = false;

        if (isDragConfirmed && dragPreviewVertices.length > 0) {
            const p1Preview = dragPreviewVertices.find(dp => dp.id === p1_orig.id);
            const p2Preview = dragPreviewVertices.find(dp => dp.id === p2_orig.id);
            
            const p1BeingDragged = !!p1Preview;
            const p2BeingDragged = !!p2Preview;
            shouldBeDashed = p1BeingDragged !== p2BeingDragged;
            
            if (p1Preview) { p1_render.x = p1Preview.x; p1_render.y = p1Preview.y; }
            if (p2Preview) { p2_render.x = p2Preview.x; p2_render.y = p2Preview.y; }
        }

        const p1Screen = dataToScreen(p1_render);
        const p2Screen = dataToScreen(p2_render);

        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);

        if (edge.colormapItem) {
            const gradient = ctx.createLinearGradient(p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y);
            const startColor = U.sampleColormap(edge.colormapItem, edge.gradientStart);
            const endColor = U.sampleColormap(edge.colormapItem, edge.gradientEnd);
            gradient.addColorStop(0, startColor);
            gradient.addColorStop(1, endColor);
            ctx.strokeStyle = gradient;
        } else {
            ctx.strokeStyle = edge.color || colors.defaultStroke;
        }

        ctx.setLineDash(shouldBeDashed ? C.DASH_PATTERN : []);
        ctx.lineWidth = C.LINE_WIDTH;
        ctx.stroke();
        ctx.setLineDash([]);

        if (isSelected) {
            ctx.beginPath();
            ctx.moveTo(p1Screen.x, p1Screen.y);
            ctx.lineTo(p2Screen.x, p2Screen.y);
            ctx.strokeStyle = colors.selectionGlow;
            ctx.globalAlpha = C.SELECTION_GLOW_ALPHA;
            ctx.lineWidth = C.LINE_WIDTH + C.EDGE_SELECTION_GLOW_WIDTH_OFFSET;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    });
    ctx.setLineDash([]);
    ctx.strokeStyle = colors.defaultStroke;
}

export function drawTransformIndicators(ctx, htmlOverlay, { transformIndicatorData, angleSigFigs, distanceSigFigs, colors, coordSystemTransformIndicatorData }, dataToScreen, updateHtmlLabel) {
    if (transformIndicatorData) {
        const { center, startPos, currentPos, rotation, scale, isSnapping, snappedScaleValue, gridToGridInfo, transformType, directionalScale } = transformIndicatorData;

        const centerScreen = dataToScreen(center);
        const startScreen = dataToScreen(startPos);
        const color = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;

        ctx.save();
        ctx.setLineDash(C.DASH_PATTERN);
        ctx.strokeStyle = color;
        ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;

        if (transformType === C.TRANSFORMATION_TYPE_ROTATION) {
            const currentScreen = dataToScreen(currentPos);
            const startVecScreen = { x: startScreen.x - centerScreen.x, y: startScreen.y - centerScreen.y };
            const arcRadius = Math.hypot(startVecScreen.x, startVecScreen.y);
            const startAngleScreen = Math.atan2(startVecScreen.y, startVecScreen.x);

            ctx.beginPath();
            ctx.moveTo(centerScreen.x, centerScreen.y);
            ctx.lineTo(startScreen.x, startScreen.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(centerScreen.x, centerScreen.y);
            ctx.lineTo(currentScreen.x, currentScreen.y);
            ctx.stroke();

            if (Math.abs(rotation) > C.MIN_TRANSFORM_ACTION_THRESHOLD) {
                const screenRotation = -rotation;
                const anticlockwise = rotation > 0;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(centerScreen.x, centerScreen.y, arcRadius, startAngleScreen, startAngleScreen + screenRotation, anticlockwise);
                ctx.stroke();
            }
        } else if (transformType === C.TRANSFORMATION_TYPE_SCALE || transformType === C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
            const scaledPos = {
                x: center.x + (startPos.x - center.x) * scale,
                y: center.y + (startPos.y - center.y) * scale
            };
            const scaledScreen = dataToScreen(scaledPos);

            ctx.beginPath();
            ctx.moveTo(centerScreen.x, centerScreen.y);
            ctx.lineTo(startScreen.x, startScreen.y);
            ctx.stroke();

            if (Math.abs(scale - 1) > C.MIN_TRANSFORM_ACTION_THRESHOLD) {
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(centerScreen.x, centerScreen.y);
                ctx.lineTo(scaledScreen.x, scaledScreen.y);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);
        ctx.restore();

        if (transformType === C.TRANSFORMATION_TYPE_ROTATION && Math.abs(rotation) > C.MIN_TRANSFORM_ACTION_THRESHOLD) {
            const angleDeg = rotation * (180 / Math.PI);
            const angleText = `${parseFloat(angleDeg.toFixed(4)).toString()}^{\\circ}`;
            const startVecScreen = { x: startScreen.x - centerScreen.x, y: startScreen.y - centerScreen.y };
            
            const bisectorAngle = Math.atan2(startVecScreen.y, startVecScreen.x) + (-rotation) / 2;
            const arcRadius = Math.hypot(startVecScreen.x, startVecScreen.y);
            const labelRadius = arcRadius + C.TRANSFORM_ANGLE_LABEL_OFFSET;
            const angleTextX = centerScreen.x + labelRadius * Math.cos(bisectorAngle);
            const angleTextY = centerScreen.y + labelRadius * Math.sin(bisectorAngle);

            updateHtmlLabel({ id: 'transform-angle-indicator', content: angleText, x: angleTextX, y: angleTextY, color: color, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } });
        } else {
            updateHtmlLabel({ id: 'transform-angle-indicator', content: '', x: 0, y: 0, color: color, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
        }

        if ((transformType === C.TRANSFORMATION_TYPE_SCALE || transformType === C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) && Math.abs(scale - 1) > C.MIN_TRANSFORM_ACTION_THRESHOLD) {
            let scaleText;
            const effectiveScale = isSnapping && snappedScaleValue !== null ? snappedScaleValue : scale;
            
            if (Math.abs(effectiveScale - 1) < 0.001) {
                scaleText = `\\times 1`;
            } else if (isSnapping && gridToGridInfo) {
                const { startSquaredSum, snapSquaredSum } = gridToGridInfo;
                const [startCoeff, startRadicand] = U.simplifySquareRoot(startSquaredSum);
                const [snapCoeff, snapRadicand] = U.simplifySquareRoot(snapSquaredSum);
                
                if (startRadicand === 1 && snapRadicand === 1) {
                    scaleText = `\\times \\frac{${snapCoeff}}{${startCoeff}}`;
                } else if (startRadicand === snapRadicand) {
                    scaleText = `\\times \\frac{${snapCoeff}}{${startCoeff}}`;
                } else {
                    const numerator = U.formatSimplifiedRoot(snapCoeff, snapRadicand);
                    const denominator = U.formatSimplifiedRoot(startCoeff, startRadicand);
                    scaleText = `\\times \\frac{${numerator}}{${denominator}}`;
                }
            } else if (isSnapping && snappedScaleValue !== null) {
                scaleText = `\\times ${U.formatFraction(snappedScaleValue, C.FRACTION_FORMAT_TOLERANCE, C.FRACTION_FORMAT_MAX_DENOMINATOR_TRANSFORM)}`;
            } else {
                const formattedScale = parseFloat(effectiveScale.toFixed(4)).toString();
                scaleText = `\\times ${formattedScale}`;
            }

            const midX = (centerScreen.x + startScreen.x) / 2;
            const midY = (centerScreen.y + startScreen.y) / 2;
            const lineAngle = Math.atan2(startScreen.y - centerScreen.y, startScreen.x - centerScreen.x);
            let textPerpAngle = lineAngle - Math.PI / 2;
            const scaleTextX = midX + Math.cos(textPerpAngle) * C.TRANSFORM_SCALE_LABEL_OFFSET;
            const scaleTextY = midY + Math.sin(textPerpAngle) * C.TRANSFORM_SCALE_LABEL_OFFSET;

            let rotationDeg = lineAngle * (C.DEGREES_IN_HALF_CIRCLE / Math.PI);
            if (rotationDeg > C.DEGREES_IN_QUADRANT || rotationDeg < -C.DEGREES_IN_QUADRANT) {
                rotationDeg += C.DEGREES_IN_HALF_CIRCLE;
            }

            updateHtmlLabel({ id: 'transform-scale-indicator', content: scaleText, x: scaleTextX, y: scaleTextY, color: color, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'bottom', rotation: rotationDeg } }, htmlOverlay);
        } else {
            updateHtmlLabel({ id: 'transform-scale-indicator', content: '', x: 0, y: 0, color: color, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'bottom' } }, htmlOverlay);
        }
    }

    if (coordSystemTransformIndicatorData) {
        const { edgeFraction, orthogonalDistanceFraction, v1, v2, snapPosition } = coordSystemTransformIndicatorData;
        
        let labelText = '';
        let labelPos = { x: 0, y: 0 };
        
        if (orthogonalDistanceFraction !== undefined) {
            labelText = U.formatFraction(orthogonalDistanceFraction, 0.001, 8);
            const originScreen = dataToScreen(snapPosition.origin);
            const snapScreen = dataToScreen(snapPosition.closest);
            
            const midX = (originScreen.x + snapScreen.x) / 2;
            const midY = (originScreen.y + snapScreen.y) / 2;
            const angle = Math.atan2(snapScreen.y - originScreen.y, snapScreen.x - originScreen.x);
            
            labelPos.x = midX + Math.cos(angle + Math.PI/2) * C.COORD_SYSTEM_EDGE_FRACTION_LABEL_OFFSET;
            labelPos.y = midY + Math.sin(angle + Math.PI/2) * C.COORD_SYSTEM_EDGE_FRACTION_LABEL_OFFSET;
        } else if (edgeFraction !== undefined) {
            const v1Screen = dataToScreen(v1);
            const v2Screen = dataToScreen(v2);
            const snapScreen = dataToScreen(snapPosition);
            const edgeAngle = Math.atan2(v2Screen.y - v1Screen.y, v2Screen.x - v1Screen.x);
            
            const offsetX = Math.cos(edgeAngle + Math.PI/2) * C.COORD_SYSTEM_EDGE_FRACTION_LABEL_OFFSET;
            const offsetY = Math.sin(edgeAngle + Math.PI/2) * C.COORD_SYSTEM_EDGE_FRACTION_LABEL_OFFSET;
            
            labelPos.x = snapScreen.x + offsetX;
            labelPos.y = snapScreen.y + offsetY;
            
            labelText = U.formatFraction(edgeFraction, 0.001, 8);
        }
        
        if (labelText) {
             updateHtmlLabel({ 
                id: 'coord-system-edge-fraction', 
                content: labelText, 
                x: labelPos.x, 
                y: labelPos.y, 
                color: colors.feedbackSnapped, 
                fontSize: C.COORD_SYSTEM_EDGE_FRACTION_FONT_SIZE, 
                options: { textAlign: 'center', textBaseline: 'middle' } 
            });
        }
    }
}

export function drawReferenceElementsGeometry(ctx, context, dataToScreen, screenToData, { showAngles, showDistances, viewTransform, mousePos, colors }) {
    if ((!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display) return;
    
    const startVertexData = context.frozen_Origin_Data_to_display;
    const mouseDataPos = screenToData(mousePos);
    const previewDistance = U.distance(startVertexData, mouseDataPos);
    
    if (previewDistance < C.GEOMETRY_CALCULATION_EPSILON) return;

    const refElementColor = colors.frozenReference;

    const turnAngleData = context.displayAngleA_valueRad_for_A_equals_label;
    const baseAngleData = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
    const distanceData = context.frozen_D_du_to_display;

    if (!startVertexData) return;

    const frozenOriginScreen = dataToScreen(startVertexData);
    const absoluteAngleForRefLine = baseAngleData + turnAngleData;

    ctx.save();
    ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
    ctx.strokeStyle = refElementColor;

    if (showAngles && context.displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(context.displayAngleA_valueRad_for_A_equals_label) > C.GEOMETRY_CALCULATION_EPSILON) {
        const effectiveRadiusForLine = C.REF_ARC_RADIUS_SCREEN + ctx.lineWidth / 2;

        const dottedLineEndVertexData = {
            x: startVertexData.x + Math.cos(baseAngleData) * (effectiveRadiusForLine / viewTransform.scale),
            y: startVertexData.y + Math.sin(baseAngleData) * (effectiveRadiusForLine / viewTransform.scale)
        };
        const dottedLineEndVertexScreen = dataToScreen(dottedLineEndVertexData);

        ctx.beginPath();
        ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y);
        ctx.lineTo(dottedLineEndVertexScreen.x, dottedLineEndVertexScreen.y);
        ctx.setLineDash(C.REF_LINE_DASH_PATTERN);
        ctx.stroke();

        drawAngleArc(ctx, frozenOriginScreen, baseAngleData, absoluteAngleForRefLine, C.REF_ARC_RADIUS_SCREEN, refElementColor, false);
    }
    ctx.restore();
}

export function prepareSnapInfoTexts(ctx, htmlOverlay, startVertexData, targetDataPos, snappedOutput, { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors }, dataToScreen, drawingContext, updateHtmlLabel) {
    if ((!showAngles && !showDistances) || snappedOutput.distance < C.GEOMETRY_CALCULATION_EPSILON) {
        return;
    }

    const startScreen = dataToScreen(startVertexData);
    const { angle: snappedAbsoluteAngleDeg, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn, gridToGridSquaredSum, gridInterval } = snappedOutput;
    const { offsetAngleRad, isFirstSegmentBeingDrawn } = drawingContext;
    const currentElementColor = currentShiftPressed ? colors.feedbackSnapped : colors.geometryInfoText;
    const currentLineAbsoluteAngle = Math.atan2(targetDataPos.y - startVertexData.y, targetDataPos.x - startVertexData.x);

    if (snappedDistanceData * viewTransform.scale / window.devicePixelRatio < C.VERTEX_RADIUS) {
        return;
    }

    const isAngleFeedbackActive = showAngles && snappedDistanceData > C.GEOMETRY_CALCULATION_EPSILON && Math.abs(angleTurn) > C.GEOMETRY_CALCULATION_EPSILON;

    if (showDistances) {
        let distanceText = '';

        if (currentShiftPressed && !isFirstSegmentBeingDrawn && frozenReference_D_du !== null) {
            const currentExactDistance = snappedDistanceData;

            if (gridToGridSquaredSum !== null && gridInterval) {
                const actualGridDistance = gridInterval * Math.sqrt(gridToGridSquaredSum);
                if (Math.abs(actualGridDistance - frozenReference_D_du) < C.GEOMETRY_CALCULATION_EPSILON) {
                    distanceText = C.DELTA_SYMBOL_KATEX;
                } else {
                    let foundFraction = false;
                    for (const factor of C.SNAP_FACTORS) {
                        if (Math.abs(currentExactDistance / frozenReference_D_du - factor) < C.GEOMETRY_CALCULATION_EPSILON) {
                            distanceText = U.formatSnapFactor(factor, 'D');
                            foundFraction = true;
                            break;
                        }
                    }
                    if (!foundFraction) {
                        const [coeff, radicand] = U.simplifySquareRoot(gridToGridSquaredSum);
                        const finalCoeff = gridInterval * coeff;
                        const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                        distanceText = U.formatSimplifiedRoot(roundedFinalCoeff, radicand);
                    }
                }
            } else if (frozenReference_D_du > C.GEOMETRY_CALCULATION_EPSILON) {
                const ratio = currentExactDistance / frozenReference_D_du;
                let foundFraction = false;
                for (const factor of C.SNAP_FACTORS) {
                    if (Math.abs(ratio - factor) < C.GEOMETRY_CALCULATION_EPSILON) {
                        distanceText = U.formatSnapFactor(factor, 'D');
                        foundFraction = true;
                        break;
                    }
                }
                if (!foundFraction) {
                    distanceText = U.formatNumber(snappedDistanceData, distanceSigFigs);
                }
            } else {
                distanceText = U.formatNumber(snappedDistanceData, distanceSigFigs);
            }
        } else if (currentShiftPressed && isFirstSegmentBeingDrawn && gridDisplayMode !== C.GRID_DISPLAY_MODE_NONE && gridInterval) {
            if (gridToGridSquaredSum !== null && gridInterval) {
                if (gridToGridSquaredSum >= 0) {
                    const [coeff, radicand] = U.simplifySquareRoot(gridToGridSquaredSum);
                    const finalCoeff = gridInterval * coeff;
                    const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                    distanceText = U.formatSimplifiedRoot(roundedFinalCoeff, radicand);
                }
            } else {
                distanceText = U.formatNumber(snappedDistanceData, distanceSigFigs);
            }
        } else {
            distanceText = U.formatNumber(snappedDistanceData, distanceSigFigs);
        }

        if (distanceText) {
            const startScreenPos = dataToScreen(startVertexData);
            const endScreenPos = dataToScreen(targetDataPos);
            const edgeAngleScreen = Math.atan2(endScreenPos.y - startScreenPos.y, endScreenPos.x - startScreenPos.x);
            const midX = (startScreenPos.x + endScreenPos.x) / 2;
            const midY = (startScreenPos.y + endScreenPos.y) / 2;

            let textPerpAngle;

            if (isAngleFeedbackActive) {
                if (angleTurn > C.GEOMETRY_CALCULATION_EPSILON) {
                    textPerpAngle = edgeAngleScreen - Math.PI / 2;
                } else if (angleTurn < -C.GEOMETRY_CALCULATION_EPSILON) {
                    textPerpAngle = edgeAngleScreen + Math.PI / 2;
                } else {
                    textPerpAngle = edgeAngleScreen - Math.PI / 2;
                }
            } else {
                if (Math.abs(Math.sin(edgeAngleScreen)) < C.VERTICAL_LINE_COS_THRESHOLD) {
                    textPerpAngle = edgeAngleScreen - Math.PI / 2;
                } else if (Math.abs(Math.cos(edgeAngleScreen)) < C.VERTICAL_LINE_COS_THRESHOLD) {
                    textPerpAngle = edgeAngleScreen;
                    if (Math.sin(edgeAngleScreen) < 0) {
                        textPerpAngle += Math.PI / 2;
                    } else {
                        textPerpAngle -= Math.PI / 2;
                    }
                } else {
                    textPerpAngle = edgeAngleScreen - Math.PI / 2;
                    if (Math.sin(textPerpAngle) > 0) {
                        textPerpAngle += Math.PI;
                    }
                }
            }
            
            const distanceTextX = midX + Math.cos(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
            const distanceTextY = midY + Math.sin(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
            let rotationDeg = edgeAngleScreen * (C.DEGREES_IN_HALF_CIRCLE / Math.PI);
            if (rotationDeg > C.DEGREES_IN_QUADRANT || rotationDeg < -C.DEGREES_IN_QUADRANT) {
                rotationDeg += C.DEGREES_IN_HALF_CIRCLE;
            }
            updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } }, htmlOverlay);
        }
    }

    if (isAngleFeedbackActive) {
        const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad;

        drawAngleArc(ctx, startScreen, baseAngleForArc, currentLineAbsoluteAngle, C.FEEDBACK_ARC_RADIUS_SCREEN, currentElementColor);

        ctx.save();
        ctx.beginPath();
        const effectiveRadiusForLine = C.FEEDBACK_ARC_RADIUS_SCREEN + ctx.lineWidth / 2;
        const baseLineEndData = {
            x: startVertexData.x + (effectiveRadiusForLine / viewTransform.scale) * Math.cos(baseAngleForArc),
            y: startVertexData.y + (effectiveRadiusForLine / viewTransform.scale) * Math.sin(baseAngleForArc)
        };
        const baseLineEndScreen = dataToScreen(baseLineEndData);
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(baseLineEndScreen.x, baseLineEndScreen.y);
        ctx.strokeStyle = currentElementColor;
        ctx.setLineDash(C.HELPER_LINE_DASH_PATTERN);
        ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
        ctx.stroke();
        ctx.restore();

        let angleText = '';
        const canReferToTheta = !isFirstSegmentBeingDrawn && frozenReference_A_rad !== null && Math.abs(frozenReference_A_rad) > C.GEOMETRY_CALCULATION_EPSILON;

        if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_DEGREES) {
            if (currentShiftPressed && canReferToTheta) {
                const referenceAngleRad = Math.abs(drawingContext.currentSegmentReferenceA_for_display);
                let potentialFactor = null;

                if (typeof angleSnapFactor === 'number') {
                    potentialFactor = angleSnapFactor;
                } else if (angleTurn !== null) {
                    if (Math.abs(referenceAngleRad) > C.GEOMETRY_CALCULATION_EPSILON) {
                        const calculatedFactor = angleTurn / referenceAngleRad;
                        for (const frac of C.NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
                            if (Math.abs(Math.abs(calculatedFactor) - frac) < C.GEOMETRY_CALCULATION_EPSILON) {
                                potentialFactor = calculatedFactor < 0 ? -frac : frac;
                                break;
                            }
                        }
                    }
                }
                if (potentialFactor !== null && Math.abs(potentialFactor) > C.GEOMETRY_CALCULATION_EPSILON) {
                    angleText = U.formatSnapFactor(potentialFactor, 'A');
                } else {
                    let degrees = angleTurn * (C.DEGREES_IN_HALF_CIRCLE / Math.PI);
                    if (Math.abs(degrees) > C.GEOMETRY_CALCULATION_EPSILON) {
                        angleText = `${U.formatNumber(degrees, angleSigFigs)}^{\\circ}`;
                    }
                }
            } else {
                let angleToFormatRad = isFirstSegmentBeingDrawn ? currentLineAbsoluteAngle : angleTurn;
                if (currentShiftPressed && !isFirstSegmentBeingDrawn) {
                    let angleToFormatDeg = angleToFormatRad * (C.DEGREES_IN_HALF_CIRCLE / Math.PI);
                    if (Math.abs(angleToFormatDeg) > C.GEOMETRY_CALCULATION_EPSILON) {
                        angleText = `${U.formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
                    }
                } else {
                    let angleToFormatDeg = U.normalizeAngleToPi(angleToFormatRad) * (C.DEGREES_IN_HALF_CIRCLE / Math.PI);
                    if (Math.abs(angleToFormatDeg) > C.GEOMETRY_CALCULATION_EPSILON) {
                        angleText = `${U.formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
                    }
                }
            }
        } else if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_RADIANS) {
            if (currentShiftPressed && canReferToTheta) {
                const referenceAngleRad = Math.abs(drawingContext.currentSegmentReferenceA_for_display);
                let potentialFactor = null;

                if (typeof angleSnapFactor === 'number') {
                    potentialFactor = angleSnapFactor;
                } else if (angleTurn !== null) {
                    if (Math.abs(referenceAngleRad) > C.GEOMETRY_CALCULATION_EPSILON) {
                        const calculatedFactor = angleTurn / referenceAngleRad;
                        for (const frac of C.NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
                            if (Math.abs(Math.abs(calculatedFactor) - frac) < C.GEOMETRY_CALCULATION_EPSILON) {
                                potentialFactor = calculatedFactor < 0 ? -frac : frac;
                                break;
                            }
                        }
                    }
                }
                if (potentialFactor !== null && Math.abs(potentialFactor) > C.GEOMETRY_CALCULATION_EPSILON) {
                    const fracStr = U.formatSnapFactor(potentialFactor, null);
                    angleText = `${fracStr === '0' ? '0' : fracStr + C.PI_SYMBOL_KATEX}`;
                    if (angleText.startsWith(`1${C.PI_SYMBOL_KATEX}`)) angleText = C.PI_SYMBOL_KATEX;
                    if (angleText.startsWith(`-1${C.PI_SYMBOL_KATEX}`)) angleText = `-${C.PI_SYMBOL_KATEX}`;
                    if (angleText === `0${C.PI_SYMBOL_KATEX}`) angleText = "0";
                } else {
                    let radians = angleTurn;
                    if (Math.abs(radians) > C.GEOMETRY_CALCULATION_EPSILON) {
                        angleText = U.formatNumber(radians, angleSigFigs);
                    }
                }
            } else {
                let angleToFormatRad = isFirstSegmentBeingDrawn ? currentLineAbsoluteAngle : angleTurn;
                if (currentShiftPressed && !isFirstSegmentBeingDrawn) {
                    let radians = angleToFormatRad;
                    if (Math.abs(radians) > C.GEOMETRY_CALCULATION_EPSILON) {
                        angleText = U.formatNumber(radians, angleSigFigs);
                    }
                } else {
                    let radians = U.normalizeAngleToPi(angleToFormatRad);
                    if (Math.abs(radians) > C.GEOMETRY_CALCULATION_EPSILON) {
                        angleText = U.formatNumber(radians, angleSigFigs);
                    }
                }
            }
        }

        if (angleText) {
            const canvasStartAngle = -baseAngleForArc;
            const canvasEndAngle = -currentLineAbsoluteAngle;
            const sumCos = Math.cos(canvasStartAngle) + Math.cos(canvasEndAngle);
            const sumSin = Math.sin(canvasStartAngle) + Math.sin(canvasEndAngle);
            let bisectorCanvasAngle = Math.atan2(sumSin, sumCos);
            const angleTextX = startScreen.x + Math.cos(bisectorCanvasAngle) * C.SNAP_ANGLE_LABEL_OFFSET;
            const angleTextY = startScreen.y + Math.sin(bisectorCanvasAngle) * C.SNAP_ANGLE_LABEL_OFFSET;
            updateHtmlLabel({ id: 'snap-angle', content: angleText, x: angleTextX, y: angleTextY, color: currentElementColor, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
        }
    }
}

export function prepareReferenceElementsTexts(htmlOverlay, context, { showAngles, showDistances, viewTransform, mousePos, frozenReference_D_du, distanceSigFigs, angleSigFigs, angleDisplayMode, colors }, screenToData, dataToScreen, updateHtmlLabel) {
    const dataThreshold = C.REF_TEXT_SCREEN_PIXEL_THRESHOLD / viewTransform.scale;

    let previewDistance = -1;
    if (context.frozen_Origin_Data_to_display) {
        const startVertexData = context.frozen_Origin_Data_to_display;
        const mouseDataPos = screenToData(mousePos);
        previewDistance = U.distance(startVertexData, mouseDataPos);
    }

    if ((!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display || previewDistance < dataThreshold) {
        return;
    }

    const refElementColor = colors.frozenReference;

    const startVertexData = context.frozen_Origin_Data_to_display;
    const turnAngleData = context.displayAngleA_valueRad_for_A_equals_label;
    const baseAngleData = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
    const distanceData = context.frozen_D_du_to_display;
    const frozenG2GSquaredSum = context.frozen_D_g2g_to_display ? context.frozen_D_g2g_to_display.g2gSquaredSum : null;
    const frozenG2GInterval = context.frozen_D_g2g_to_display ? context.frozen_D_g2g_to_display.interval : null;

    if (!startVertexData) {
        return;
    }

    const absoluteAngleForRefLine = baseAngleData + turnAngleData;
    const endVertexData = {
        x: startVertexData.x + distanceData * Math.cos(absoluteAngleForRefLine),
        y: startVertexData.y + distanceData * Math.sin(absoluteAngleForRefLine)
    };

    const startVertexScreen = dataToScreen(startVertexData);
    const endVertexScreen = dataToScreen(endVertexData);

    if (showDistances && distanceData !== null && distanceData > dataThreshold && frozenReference_D_du !== null) {
        let distanceText = '';

        if (frozenG2GSquaredSum !== null && frozenG2GSquaredSum > 0 && frozenG2GInterval) {
            const [coeff, radicand] = U.simplifySquareRoot(frozenG2GSquaredSum);
            const finalCoeff = frozenG2GInterval * coeff;
            const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
            distanceText = `${C.DELTA_EQUALS_KATEX}${U.formatSimplifiedRoot(roundedFinalCoeff, radicand)}`;
        } else {
            const platonicValue = distanceData / C.DEFAULT_REFERENCE_DISTANCE;
            distanceText = `${C.DELTA_EQUALS_KATEX}${U.formatNumber(platonicValue, distanceSigFigs)}`;
        }

        const edgeAngleScreen = Math.atan2(endVertexScreen.y - startVertexScreen.y, endVertexScreen.x - startVertexScreen.x);
        const midX_screen = (startVertexScreen.x + endVertexScreen.x) / 2;
        const midY_screen = (startVertexScreen.y + endVertexScreen.y) / 2;
        
        let rotationDeg = edgeAngleScreen * (C.DEGREES_IN_HALF_CIRCLE / Math.PI);
        if (rotationDeg > C.DEGREES_IN_QUADRANT || rotationDeg < -C.DEGREES_IN_QUADRANT) {
            rotationDeg += C.DEGREES_IN_HALF_CIRCLE;
        }
        let textPerpAngle;

        if (showAngles && turnAngleData !== null && Math.abs(turnAngleData) > C.GEOMETRY_CALCULATION_EPSILON) {
            const canvasStartAngle = -baseAngleData;
            const canvasEndAngle = -(baseAngleData + turnAngleData);
            const sumCos = Math.cos(canvasStartAngle) + Math.cos(canvasEndAngle);
            const sumSin = Math.sin(canvasStartAngle) + Math.sin(canvasEndAngle);
            const angleLabelBisectorRad = Math.atan2(sumSin, sumCos);
            const perp1 = edgeAngleScreen - Math.PI / 2;
            const perp2 = edgeAngleScreen + Math.PI / 2;
            const diff1 = Math.abs(U.normalizeAngleToPi(perp1 - angleLabelBisectorRad));
            const diff2 = Math.abs(U.normalizeAngleToPi(perp2 - angleLabelBisectorRad));
            textPerpAngle = diff1 > diff2 ? perp1 : perp2;
        } else {
            textPerpAngle = edgeAngleScreen - Math.PI / 2;
            if (Math.sin(textPerpAngle) > 0) {
                textPerpAngle += Math.PI;
            }
        }
        const textDistLabelX_D = midX_screen + Math.cos(textPerpAngle) * C.REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN;
        const textDistLabelY_D = midY_screen + Math.sin(textPerpAngle) * C.REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN;

        updateHtmlLabel({ id: 'ref-dist', content: distanceText, x: textDistLabelX_D, y: textDistLabelY_D, color: refElementColor, fontSize: C.REF_TEXT_KATEX_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } }, htmlOverlay);
    }

    if (showAngles && turnAngleData !== null && Math.abs(turnAngleData) > C.GEOMETRY_CALCULATION_EPSILON) {
        const startAngleCanvas = -baseAngleData;
        const endAngleCanvas = -(baseAngleData + turnAngleData);

        const sumCos = Math.cos(startAngleCanvas) + Math.cos(endAngleCanvas);
        const sumSin = Math.sin(startAngleCanvas) + Math.sin(endAngleCanvas);
        let bisectorCanvasAngle = Math.atan2(sumSin, sumCos);
        const angleLabelOffsetDistance = C.REF_TEXT_ANGLE_LABEL_OFFSET_SCREEN;

        const textAngleLabelX_A = startVertexScreen.x + Math.cos(bisectorCanvasAngle) * angleLabelOffsetDistance;
        const textAngleLabelY_A = startVertexScreen.y + Math.sin(bisectorCanvasAngle) * angleLabelOffsetDistance;

        let aKatexText = '';
        if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_DEGREES) {
            let aValueDeg = turnAngleData * (C.DEGREES_IN_HALF_CIRCLE / Math.PI);
            aKatexText = `${C.THETA_EQUALS_KATEX}${U.formatNumber(aValueDeg, angleSigFigs)}^{\\circ}`;
        } else if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_RADIANS) {
            let aValueRad = turnAngleData;
            aKatexText = `${C.THETA_EQUALS_KATEX}${U.formatFraction(aValueRad / Math.PI, C.FRACTION_FORMAT_TOLERANCE, C.FRACTION_FORMAT_MAX_DENOMINATOR)}${C.PI_SYMBOL_KATEX}`;
            if (aKatexText === `${C.THETA_EQUALS_KATEX}1${C.PI_SYMBOL_KATEX}`) aKatexText = C.PI_SYMBOL_KATEX;
            if (aKatexText === `${C.THETA_EQUALS_KATEX}-1${C.PI_SYMBOL_KATEX}`) aKatexText = `-${C.PI_SYMBOL_KATEX}`;
            if (aKatexText === `${C.THETA_EQUALS_KATEX}0${C.PI_SYMBOL_KATEX}`) aKatexText = "0";
        }

        updateHtmlLabel({ id: 'ref-angle', content: aKatexText, x: textAngleLabelX_A, y: textAngleLabelY_A, color: refElementColor, fontSize: C.REF_TEXT_KATEX_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }
}

export function updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostVertexPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors}, screenToData, updateHtmlLabel) {
    
    if (coordsDisplayMode === C.COORDS_DISPLAY_MODE_NONE || !mousePos || !isMouseOverCanvas) {
        return;
    }

    let displayPos;
    if (currentShiftPressed && ghostVertexPosition) {
        displayPos = ghostVertexPosition;
    } else {
        displayPos = screenToData(mousePos);
    }

    let effectiveGridInterval = 1;
    if (gridDisplayMode !== C.GRID_DISPLAY_MODE_NONE && lastGridState && lastGridState.interval1) {
        effectiveGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
    }

    let decimalPlaces = 0;
    if (effectiveGridInterval > 0) {
        decimalPlaces = Math.max(0, -Math.floor(Math.log10(effectiveGridInterval * C.COORD_PRECISION_FACTOR)));
        decimalPlaces = Math.min(decimalPlaces + 1, C.MAX_COORD_DECIMAL_PLACES);
    }

    const angleDecimalPlaces = Math.min(decimalPlaces + 1, C.MAX_ANGLE_DECIMAL_PLACES);
    let textContent = '';

    switch (coordsDisplayMode) {
        case C.COORDS_DISPLAY_MODE_REGULAR: {
            let xValue = displayPos.x;
            let yValue = displayPos.y;
            let xText = xValue.toFixed(decimalPlaces);
            if (xValue >= 0) xText = `${C.KATEX_MINUS_PHANTOM}${xText}`;
            let yText = yValue.toFixed(decimalPlaces);
            if (yValue >= 0) yText = `${C.KATEX_MINUS_PHANTOM}${yText}`;
            textContent = `\\begin{pmatrix*}[r] x \\\\ y \\end{pmatrix*} = \\begin{pmatrix*}[r] ${xText} \\\\ ${yText} \\end{pmatrix*}`;
            break;
        }
        case C.COORDS_DISPLAY_MODE_COMPLEX: {
            let reValue = displayPos.x;
            let imValue = displayPos.y;
            let rePart = reValue.toFixed(decimalPlaces);
            if (reValue >= 0) rePart = `${C.KATEX_MINUS_PHANTOM}${rePart}`;
            let imPartAbs = Math.abs(imValue).toFixed(decimalPlaces);
            const sign = imValue < 0 ? '-' : '+';
            textContent = `z = ${rePart} ${sign} ${imPartAbs}${C.IMAGINARY_UNIT_SYMBOL}`;
            break;
        }
        case C.COORDS_DISPLAY_MODE_POLAR: {
            let rValue = Math.hypot(displayPos.x, displayPos.y);
            let thetaRaw = Math.atan2(displayPos.y, displayPos.x);
            let rText = rValue.toFixed(decimalPlaces);
            if (rValue >= 0) rText = `${C.KATEX_MINUS_PHANTOM}${rText}`;
            let angleStr;
            if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_DEGREES) {
                let thetaDeg = U.normalizeAngleDegrees(thetaRaw * 180 / Math.PI);
                angleStr = thetaDeg.toFixed(angleDecimalPlaces);
                if (thetaDeg >= 0) angleStr = `${C.KATEX_MINUS_PHANTOM}${angleStr}`;
                angleStr += `^{\\circ}`;
            } else {
                let thetaRad = U.normalizeAngleToPi(thetaRaw);
                angleStr = thetaRad.toFixed(angleDecimalPlaces);
                if (thetaRad >= 0) angleStr = `${C.KATEX_MINUS_PHANTOM}${angleStr}`;
            }
            textContent = `\\begin{pmatrix*}[r] r \\\\ \\theta \\end{pmatrix*} = \\begin{pmatrix*}[r] ${rText} \\\\ ${angleStr} \\end{pmatrix*}`;
            break;
        }
    }

    const canvasWidth = canvas.width / dpr;
    updateHtmlLabel({ id: 'mouse-coord-text', content: textContent, x: canvasWidth - C.UI_PADDING, y: C.UI_PADDING, color: colors.mouseCoords, fontSize: C.MOUSE_COORD_FONT_SIZE, options: { textAlign: 'right', textBaseline: 'top' } }, htmlOverlay);
}

export function createColorWheelIcon(size, dpr) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size * dpr;
    tempCanvas.height = size * dpr;
    const tempCtx = tempCanvas.getContext('2d');
    const imageData = tempCtx.createImageData(tempCanvas.width, tempCanvas.height);
    const pixels = imageData.data;
    const centerX = tempCanvas.width / 2;
    const centerY = tempCanvas.height / 2;
    const radius = tempCanvas.width / 2;
    for (let y = 0; y < tempCanvas.height; y++) {
        for (let x = 0; x < tempCanvas.width; x++) {
            const i = (y * tempCanvas.width + x) * 4;
            const dx = x - centerX;
            const dy = y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > radius) continue;
            const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
            const saturation = 100;
            const lightness = 50;
            let alpha;
            const fadeStartRadius = radius * C.COLOR_WHEEL_FADE_START_RADIUS_FACTOR;
            if (dist < fadeStartRadius) {
                alpha = 1.0;
            } else {
                const fadeDistance = radius - fadeStartRadius;
                alpha = 1.0 - ((dist - fadeStartRadius) / fadeDistance);
            }
            const [R, G, B] = U.hslToRgb(hue / 360, saturation / 100, lightness / 100);
            pixels[i] = R;
            pixels[i + 1] = G;
            pixels[i + 2] = B;
            pixels[i + 3] = Math.round(Math.max(0, alpha) * 255);
        }
    }
    tempCtx.putImageData(imageData, 0, 0);
    return tempCanvas;
}

function drawThemeIcon(ctx, rect, activeThemeName, colors) {
    ctx.save();
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const radius = rect.width / 2 * 0.6;

    ctx.strokeStyle = colors.uiIcon;
    ctx.fillStyle = colors.uiIcon;
    ctx.lineWidth = 2;

    if (activeThemeName === 'dark') {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.7, 0, 2 * Math.PI);
        ctx.fill();
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * 2 * Math.PI;
            const startX = centerX + Math.cos(angle) * (radius * 0.85);
            const startY = centerY + Math.sin(angle) * (radius * 0.85);
            const endX = centerX + Math.cos(angle) * (radius * 1.1);
            const endY = centerY + Math.sin(angle) * (radius * 1.1);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
    } else {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(centerX - 5, centerY - 3, radius, 0, 2 * Math.PI);
        ctx.fillStyle = colors.background;
        ctx.fill();
    }
    ctx.restore();
}

export function drawCoordsIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel, colors) {
    const colorStrong = isSelected ? colors.uiIconSelected : colors.uiIconDefault;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / C.UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    const x_offset = 1;
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2 + x_offset, 30); ctx.lineTo(30 + x_offset, 30);
    ctx.moveTo(2 + x_offset, 30); ctx.lineTo(2 + x_offset, 2);
    ctx.stroke();
    ctx.fillStyle = colorStrong;
    const vertex = { x: 16 + x_offset, y: 16 };
    let labelPos = { x: 17 + x_offset, y: 8 };
    let label = '';
    switch (mode) {
        case C.COORDS_DISPLAY_MODE_REGULAR:
            ctx.setLineDash(C.UI_ICON_DASH_PATTERN);
            ctx.beginPath();
            ctx.moveTo(vertex.x, vertex.y); ctx.lineTo(vertex.x, 30);
            ctx.moveTo(vertex.x, vertex.y); ctx.lineTo(2 + x_offset, vertex.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(vertex.x, vertex.y, C.UI_ICON_VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
            ctx.fill();
            label = '(x,y)';
            break;
        case C.COORDS_DISPLAY_MODE_COMPLEX:
            ctx.setLineDash(C.UI_ICON_DASH_PATTERN);
            ctx.beginPath();
            ctx.moveTo(2 + x_offset, 30); ctx.lineTo(vertex.x, vertex.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(vertex.x, vertex.y, C.UI_ICON_VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
            ctx.fill();
            label = 'x+iy';
            break;
        case C.COORDS_DISPLAY_MODE_POLAR:
            ctx.setLineDash(C.UI_ICON_DASH_PATTERN);
            ctx.beginPath();
            ctx.moveTo(2 + x_offset, 30); ctx.lineTo(vertex.x, vertex.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(2 + x_offset, 30, 8, -Math.atan2(30 - vertex.y, vertex.x - (2 + x_offset)), 0);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(vertex.x, vertex.y, C.UI_ICON_VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
            ctx.fill();
            label = '(r,\\theta)';
            break;
        case C.COORDS_DISPLAY_MODE_NONE:
            break;
    }
    ctx.restore();
    if (label) {
        const labelId = 'icon-label-coords';
        const labelColor = isSelected ? colors.uiTextSelected : colors.uiTextDefault;
        updateHtmlLabel({ id: labelId, content: label, x: center.x + (labelPos.x - 16) * scale, y: center.y + (labelPos.y - 16) * scale, color: labelColor, fontSize: C.UI_ICON_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }
}

export function drawAngleIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel, colors) {
    const colorStrong = isSelected ? colors.uiIconSelected : colors.uiIconDefault;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    let sizeIncrease = 0;
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / C.UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
    const p1 = { x: 28, y: 30 };
    const p2 = { x: 4, y: 30 };
    const p3 = { x: 16, y: 8 };
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
    let label = '';
    let labelPos = { x: 20, y: 22 };
    if (mode !== C.ANGLE_DISPLAY_MODE_NONE) {
        ctx.beginPath();
        const angle = Math.atan2(p3.y - p2.y, p3.x - p2.x);
        ctx.arc(p2.x, p2.y, 8, angle, 0);
        ctx.stroke();
        if (mode === C.ANGLE_DISPLAY_MODE_DEGREES) {
            label = '60^\\circ';
        } else if (mode === C.ANGLE_DISPLAY_MODE_RADIANS) {
            label = '\\frac{\\pi}{3}';
            sizeIncrease = 2
        }
    }
    ctx.restore();
    if (label) {
        const labelId = 'icon-label-angles';
        const labelColor = isSelected ? colors.uiTextSelected : colors.uiTextDefault;
        updateHtmlLabel({ id: labelId, content: label, x: center.x + (labelPos.x - 16) * scale, y: center.y + (labelPos.y - 20) * scale, color: labelColor, fontSize: C.UI_ICON_LABEL_FONT_SIZE+sizeIncrease, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }
}

export function drawDistanceIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel, colors) {
    const colorStrong = isSelected ? colors.uiIconSelected : colors.uiIconDefault;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / C.UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
    ctx.beginPath();
    ctx.moveTo(2, 30);
    ctx.lineTo(30, 30);
    ctx.stroke();
    let label = '';
    let labelPos = { x: 16, y: 22 };
    if (mode === C.DISTANCE_DISPLAY_MODE_ON) {
        label = '3.14';
    }
    ctx.restore();
    if (label) {
        const labelId = 'icon-label-distances';
        const labelColor = isSelected ? colors.uiTextSelected : colors.uiTextDefault;
        updateHtmlLabel({ id: labelId, content: label, x: center.x + (labelPos.x - 16) * scale, y: center.y + (labelPos.y - 16) * scale, color: labelColor, fontSize: 12, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }
}

export function drawGridIcon(ctx, rect, mode, isSelected, colors) {
    const colorStrong = isSelected ? colors.uiIconSelected : colors.uiIconDefault;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / C.UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    ctx.strokeStyle = colorStrong;
    ctx.fillStyle = colorStrong;
    ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
    switch (mode) {
        case C.GRID_DISPLAY_MODE_LINES:
            ctx.strokeRect(2, 2, 28, 28);
            ctx.beginPath();
            ctx.moveTo(2, 16); ctx.lineTo(30, 16);
            ctx.moveTo(16, 2); ctx.lineTo(16, 30);
            ctx.stroke();
            break;
        case C.GRID_DISPLAY_MODE_POINTS:
            ctx.strokeRect(2, 2, 28, 28);
            ctx.beginPath();
            [8, 16, 24].forEach(x => {
                [8, 16, 24].forEach(y => {
                    ctx.moveTo(x, y);
                    ctx.arc(x, y, C.UI_ICON_VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
                });
            });
            ctx.fill();
            break;
        case C.GRID_DISPLAY_MODE_TRIANGULAR:
            ctx.strokeRect(2, 2, 28, 28);
            const triRadius = 8;
            const triCenterX = 16;
            const triCenterY = 16;
            ctx.beginPath();
            ctx.arc(triCenterX, triCenterY, C.UI_ICON_VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 3 * i;
                const x = triCenterX + triRadius * Math.cos(angle);
                const y = triCenterY + triRadius * Math.sin(angle);
                ctx.moveTo(x, y);
                ctx.arc(x, y, C.UI_ICON_VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
            }
            ctx.fill();
            break;
        case C.GRID_DISPLAY_MODE_POLAR:
            ctx.beginPath();
            ctx.arc(16, 16, 14, 0, C.RADIANS_IN_CIRCLE);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(16, 16, 7, 0, C.RADIANS_IN_CIRCLE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(2, 16); ctx.lineTo(30, 16);
            ctx.moveTo(16, 2); ctx.lineTo(16, 30);
            ctx.stroke();
            break;
        case C.GRID_DISPLAY_MODE_NONE:
            ctx.strokeRect(2, 2, 28, 28);
            break;
    }
    ctx.restore();
}

export function drawDisplayIcon(ctx, icon, state, htmlOverlay, updateHtmlLabel) {
    const { coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode, colors } = state;
    let isSelected = false;
    switch (icon.group) {
        case 'coords':
            isSelected = coordsDisplayMode !== C.COORDS_DISPLAY_MODE_NONE;
            break;
        case 'grid':
            isSelected = gridDisplayMode !== C.GRID_DISPLAY_MODE_NONE;
            break;
        case 'angles':
            isSelected = angleDisplayMode !== C.ANGLE_DISPLAY_MODE_NONE;
            break;
        case 'distances':
            isSelected = distanceDisplayMode === C.DISTANCE_DISPLAY_MODE_ON;
            break;
    }
    const rect = { x: icon.x, y: icon.y, width: icon.width, height: icon.height };
    switch (icon.group) {
        case 'coords':
            drawCoordsIcon(ctx, rect, coordsDisplayMode, isSelected, htmlOverlay, updateHtmlLabel, colors);
            break;
        case 'grid':
            drawGridIcon(ctx, rect, gridDisplayMode, isSelected, colors);
            break;
        case 'angles':
            drawAngleIcon(ctx, rect, angleDisplayMode, isSelected, htmlOverlay, updateHtmlLabel, colors);
            break;
        case 'distances':
            drawDistanceIcon(ctx, rect, distanceDisplayMode, isSelected, htmlOverlay, updateHtmlLabel, colors);
            break;
    }
}

function drawUITransformationSymbols(ctx, icon, colors) {
    const screenPos = { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 };
    const radius = icon.width / 2;
    ctx.strokeStyle = colors.uiIcon;
    ctx.fillStyle = colors.uiIcon;
    ctx.setLineDash([]);
    ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);

    switch (icon.type) {
        case C.TRANSFORMATION_TYPE_ROTATION: {
            const arcAngle = -Math.PI / 4;
            
            ctx.beginPath();
            ctx.arc(0, 0, radius,  arcAngle,-arcAngle);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(0, 0, radius, Math.PI+arcAngle, Math.PI-arcAngle);
            ctx.stroke();
            
            const arrowSize = radius * 0.25;
            
            const arrow1X = radius * Math.cos(arcAngle);
            const arrow1Y = radius * Math.sin(arcAngle);
            
            ctx.save();
            ctx.translate(arrow1X, arrow1Y);
            ctx.rotate(arcAngle-Math.PI/2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-arrowSize, -arrowSize * 0.5);
            ctx.moveTo(0, 0);
            ctx.lineTo(-arrowSize, arrowSize * 0.5);
            ctx.stroke();
            ctx.restore();
            
            const arrow2X = radius * Math.cos(Math.PI + arcAngle);
            const arrow2Y = radius * Math.sin(Math.PI + arcAngle);
            
            ctx.save();
            ctx.translate(arrow2X, arrow2Y);
            ctx.rotate(arcAngle+Math.PI/2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-arrowSize, -arrowSize * 0.5);
            ctx.moveTo(0, 0);
            ctx.lineTo(-arrowSize, arrowSize * 0.5);
            ctx.stroke();
            ctx.restore();
            break;
        }

        case C.TRANSFORMATION_TYPE_SCALE: {
            const lineLength = radius * 0.8;
            const arrowSize = radius * 0.25;
            
            ctx.beginPath();
            ctx.moveTo(-lineLength, 0);
            ctx.lineTo(lineLength, 0);
            ctx.moveTo(0, -lineLength);
            ctx.lineTo(0, lineLength);
            ctx.stroke();
            
            const arrowPositions = [
                { x: lineLength, y: 0, dirX: 1, dirY: 0 },
                { x: -lineLength, y: 0, dirX: -1, dirY: 0 },
                { x: 0, y: -lineLength, dirX: 0, dirY: -1 },
                { x: 0, y: lineLength, dirX: 0, dirY: 1 }
            ];
            
            arrowPositions.forEach(pos => {
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x - pos.dirX * arrowSize + pos.dirY * arrowSize * 0.5, 
                           pos.y - pos.dirY * arrowSize - pos.dirX * arrowSize * 0.5);
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x - pos.dirX * arrowSize - pos.dirY * arrowSize * 0.5, 
                           pos.y - pos.dirY * arrowSize + pos.dirX * arrowSize * 0.5);
                ctx.stroke();
            });
            break;
        }

        case C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE: {
            const lineLength = radius * 0.8;
            const arrowSize = radius * 0.25;
            
            ctx.beginPath();
            ctx.moveTo(-lineLength / Math.sqrt(2), -lineLength / Math.sqrt(2));
            ctx.lineTo(lineLength / Math.sqrt(2), lineLength / Math.sqrt(2));
            ctx.moveTo(lineLength / Math.sqrt(2), -lineLength / Math.sqrt(2));
            ctx.lineTo(-lineLength / Math.sqrt(2), lineLength / Math.sqrt(2));
            ctx.stroke();
            
            const arrowPositions = [
                { 
                    x: lineLength / Math.sqrt(2), 
                    y: -lineLength / Math.sqrt(2), 
                    dirX: 1/Math.sqrt(2), 
                    dirY: -1/Math.sqrt(2)
                },
                { 
                    x: -lineLength / Math.sqrt(2), 
                    y: lineLength / Math.sqrt(2), 
                    dirX: -1/Math.sqrt(2), 
                    dirY: 1/Math.sqrt(2)
                }
            ];
            
            arrowPositions.forEach(pos => {
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x - pos.dirX * arrowSize + pos.dirY * arrowSize * 0.5, 
                           pos.y - pos.dirY * arrowSize - pos.dirX * arrowSize * 0.5);
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x - pos.dirX * arrowSize - pos.dirY * arrowSize * 0.5, 
                           pos.y - pos.dirY * arrowSize + pos.dirX * arrowSize * 0.5);
                ctx.stroke();
            });
            break;
        }
    }
    ctx.restore();
}

export function drawVisibilityIcon(ctx, rect, colors) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const eyeWidth = rect.width * 0.6;
    const eyeHeight = rect.height * 0.3;
    
    ctx.save();
    ctx.strokeStyle = colors.uiIcon;
    ctx.fillStyle = colors.uiIcon;
    ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, eyeWidth / 2, eyeHeight / 2, 0, 0, 2 * Math.PI);
    ctx.stroke();
    
    const pupilRadius = eyeHeight * 0.3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, pupilRadius, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.restore();
}

function drawColorPalette(ctx, htmlOverlay, state, updateHtmlLabel) {
    const { canvasUI, colors, allColors, namedColors, colorAssignments, activeColorTargets, verticesVisible, edgesVisible, facesVisible, isDraggingColorTarget, draggedColorTargetInfo, mousePos } = state;

    const checkerboardColor1 = '#808080';
    const checkerboardColor2 = '#c0c0c0';
    
    function drawCheckerboard(rect) {
        const tileSize = rect.height / 3;
        const numCols = Math.ceil(rect.width / tileSize);
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < numCols; col++) {
                ctx.fillStyle = (row + col) % 2 === 0 ? checkerboardColor1 : checkerboardColor2;
                const tileX = rect.x + col * tileSize;
                const tileY = rect.y + row * tileSize;
                const tileWidth = Math.min(tileSize, rect.x + rect.width - tileX);
                const tileHeight = Math.min(tileSize, rect.y + rect.height - tileY);
                if (tileWidth > 0 && tileHeight > 0) ctx.fillRect(tileX, tileY, tileWidth, tileHeight);
            }
        }
    }
    
    const randomBtn = canvasUI.randomColorButton;
    if (randomBtn) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(randomBtn.x, randomBtn.y, randomBtn.width, randomBtn.height);
        ctx.strokeStyle = colors.uiDefault;
        ctx.lineWidth = C.UI_BUTTON_BORDER_WIDTH;
        ctx.strokeRect(randomBtn.x, randomBtn.y, randomBtn.width, randomBtn.height);
        const centerX = randomBtn.x + randomBtn.width / 2;
        const centerY = randomBtn.y + randomBtn.height / 2;
        const wheelRadius = randomBtn.width * 0.35;
        const segments = 8;
        for (let i = 0; i < segments; i++) {
            const angle1 = (i / segments) * 2 * Math.PI;
            const angle2 = ((i + 1) / segments) * 2 * Math.PI;
            const hue = (i / segments) * 360;
            ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, wheelRadius, angle1, angle2);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillStyle = colors.background;
        ctx.beginPath();
        ctx.arc(centerX, centerY, wheelRadius * 0.4, 0, 2 * Math.PI);
        ctx.fill();
    }

    const removeBtn = canvasUI.removeColorButton;
    if (removeBtn) {
        ctx.strokeStyle = colors.uiDefault;
        ctx.lineWidth = C.UI_BUTTON_BORDER_WIDTH;
        ctx.strokeRect(removeBtn.x, removeBtn.y, removeBtn.width, removeBtn.height);
        ctx.beginPath();
        ctx.moveTo(removeBtn.x + C.UI_BUTTON_ICON_PADDING, removeBtn.y + removeBtn.height / 2);
        ctx.lineTo(removeBtn.x + removeBtn.width - C.UI_BUTTON_ICON_PADDING, removeBtn.y + removeBtn.height / 2);
        ctx.stroke();
    }

    canvasUI.colorSwatches.forEach((swatch) => {
        const colorItem = swatch.item;
        let hasAlpha = false;
        if (colorItem && colorItem.type === 'color') {
            const parsedColor = U.parseColor(colorItem.value);
            if (parsedColor && parsedColor.a < 1.0) hasAlpha = true;
        } else if (colorItem && colorItem.type === 'colormap') {
            if (colorItem.vertices.some(p => p.alpha !== undefined && p.alpha < 1.0)) hasAlpha = true;
        }
        if (hasAlpha) drawCheckerboard(swatch);
        if (colorItem && colorItem.type === 'colormap') {
            const gradient = ctx.createLinearGradient(swatch.x, swatch.y, swatch.x + swatch.width, swatch.y);
            colorItem.vertices.forEach(vertex => {
                let colorValue = vertex.color;
                if (typeof colorValue === 'string') colorValue = namedColors[colorValue] || [0, 0, 0];
                gradient.addColorStop(vertex.pos, `rgba(${colorValue.join(',')},${vertex.alpha || 1.0})`);
            });
            ctx.fillStyle = gradient;
        } else if (colorItem) {
            ctx.fillStyle = colorItem.value;
        }
        ctx.fillRect(swatch.x, swatch.y, swatch.width, swatch.height);
    });

    const addBtn = canvasUI.addColorButton;
    if (addBtn) {
        ctx.strokeStyle = colors.uiDefault;
        ctx.lineWidth = C.UI_BUTTON_BORDER_WIDTH;
        ctx.strokeRect(addBtn.x, addBtn.y, addBtn.width, addBtn.height);
        ctx.beginPath();
        ctx.moveTo(addBtn.x + addBtn.width / 2, addBtn.y + C.UI_BUTTON_ICON_PADDING);
        ctx.lineTo(addBtn.x + addBtn.width / 2, addBtn.y + addBtn.height - C.UI_BUTTON_ICON_PADDING);
        ctx.moveTo(addBtn.x + C.UI_BUTTON_ICON_PADDING, addBtn.y + addBtn.height / 2);
        ctx.lineTo(addBtn.x + addBtn.width - C.UI_BUTTON_ICON_PADDING, addBtn.y + addBtn.height / 2);
        ctx.stroke();
    }

    if (canvasUI.colorTargetIcons) {
        const getIconOptions = (target) => {
            let targetColorIndex = colorAssignments[target];
            if (isDraggingColorTarget && draggedColorTargetInfo && draggedColorTargetInfo.target === target && draggedColorTargetInfo.previewColorIndex !== undefined) {
                targetColorIndex = draggedColorTargetInfo.previewColorIndex;
            }

            const colorItem = (targetColorIndex === -1) ? null : allColors[targetColorIndex];

            const options = {};
            if (target === C.COLOR_TARGET_VERTEX) {
                options.vertexState = verticesVisible ? 'filled' : 'disabled';
                if (targetColorIndex === -1) {
                    options.vertexColor = 'rgba(128, 128, 128, 1)';
                } else if (colorItem && colorItem.type === 'color') {
                    options.vertexColor = colorItem.value;
                } else if (colorItem && colorItem.type === 'colormap') {
                    options.vertexColormapItem = colorItem;
                }
            } else if (target === C.COLOR_TARGET_EDGE) {
                options.edgeState = edgesVisible ? 'solid' : 'disabled';
                if (targetColorIndex === -1) {
                    options.edgeColor = 'rgba(128, 128, 128, 1)';
                } else if (colorItem && colorItem.type === 'color') {
                    options.edgeColor = colorItem.value;
                } else if (colorItem && colorItem.type === 'colormap') {
                    options.edgeColormapItem = colorItem;
                }
            } else if (target === C.COLOR_TARGET_FACE) {
                options.faceState = facesVisible ? 'filled' : 'disabled';
                if (targetColorIndex === -1) {
                    options.faceColor = 'rgba(128, 128, 128, 1)';
                } else if (colorItem && colorItem.type === 'color') {
                    options.faceColor = colorItem.value;
                } else if (colorItem && colorItem.type === 'colormap') {
                    options.faceColormapItem = colorItem;
                }
            }
            return options;
        };

        const drawOrder = [C.COLOR_TARGET_FACE, C.COLOR_TARGET_EDGE, C.COLOR_TARGET_VERTEX];
        drawOrder.forEach(targetToDraw => {
            const icon = canvasUI.colorTargetIcons.find(i => i.target === targetToDraw);
            if (icon) {
                const isActive = activeColorTargets.includes(targetToDraw);
                const iconOptions = getIconOptions(targetToDraw);

                if (isDraggingColorTarget && draggedColorTargetInfo && draggedColorTargetInfo.target === C.COLOR_TARGET_FACE && targetToDraw === C.COLOR_TARGET_FACE) {
                    const swatchUnderMouse = canvasUI.colorSwatches.find(swatch =>
                        mousePos.x >= swatch.x && mousePos.x <= swatch.x + swatch.width &&
                        mousePos.y >= swatch.y && mousePos.y <= swatch.y + swatch.height
                    );

                    if (swatchUnderMouse && swatchUnderMouse.item.type === 'colormap') {
                        const t = U.clamp((mousePos.x - swatchUnderMouse.x) / swatchUnderMouse.width, 0, 1);
                        iconOptions.faceColor = U.sampleColormap(swatchUnderMouse.item, t);
                        iconOptions.faceState = 'filled';
                    }
                }

                drawTriangleIcon(ctx, icon, iconOptions, colors, isActive);
            }
        });
    }

    const drawnBoxesForSwatches = new Set();
    activeColorTargets.forEach(target => {
        let targetColorIndex = colorAssignments[target];
        if (isDraggingColorTarget && draggedColorTargetInfo && draggedColorTargetInfo.target === target && draggedColorTargetInfo.previewColorIndex !== undefined) {
            targetColorIndex = draggedColorTargetInfo.previewColorIndex;
        }
        
        if (targetColorIndex === -1 || drawnBoxesForSwatches.has(targetColorIndex)) return;

        const swatch = canvasUI.colorSwatches.find(s => s.index === targetColorIndex);
        if (swatch) {
            const targetsForThisSwatch = Object.keys(colorAssignments).filter(t => {
                let checkIndex = colorAssignments[t];
                if (isDraggingColorTarget && draggedColorTargetInfo && draggedColorTargetInfo.target === t && draggedColorTargetInfo.previewColorIndex !== undefined) {
                    checkIndex = draggedColorTargetInfo.previewColorIndex;
                }
                return checkIndex === swatch.index && activeColorTargets.includes(t);
            });
            const iconsForThisSwatch = canvasUI.colorTargetIcons.filter(icon => targetsForThisSwatch.includes(icon.target));

            if (iconsForThisSwatch.length > 0) {
                const minY = Math.min(...iconsForThisSwatch.map(i => i.y));
                
                ctx.strokeStyle = colors.selectionGlow;
                ctx.lineWidth = C.UI_BUTTON_BORDER_WIDTH;
                const padding = 2;
                const boxX = swatch.x - padding;
                const boxY = minY - padding;
                const boxWidth = swatch.width + (padding * 2);
                const boxHeight = (swatch.y + swatch.height) - boxY + padding;
                
                ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
                drawnBoxesForSwatches.add(targetColorIndex);
            }
        }
    });
}

function drawColorToolbarPreview(ctx, rect, { verticesVisible, edgesVisible, facesVisible, colorAssignments, allColors }, colors) {
    const allDisabled = !verticesVisible && !edgesVisible && !facesVisible;

    const options = {
        vertexState: (verticesVisible || allDisabled) ? 'filled' : 'hidden',
        edgeState: (edgesVisible || allDisabled) ? 'solid' : 'hidden',
        faceState: (facesVisible || allDisabled) ? 'filled' : 'hidden',
        showAllDisabled: allDisabled
    };
    
    const vertexColorIndex = colorAssignments[C.COLOR_TARGET_VERTEX];
    if (vertexColorIndex !== -1) {
        const vertexColorItem = allColors[vertexColorIndex];
        if (vertexColorItem && vertexColorItem.type === 'colormap') {
            options.vertexColormapItem = vertexColorItem;
        } else if (vertexColorItem && vertexColorItem.type === 'color') {
            options.vertexColor = vertexColorItem.value;
        }
    } else {
        options.vertexColor = colors.vertex;
    }
    
    const edgeColorIndex = colorAssignments[C.COLOR_TARGET_EDGE];
    if (edgeColorIndex !== -1) {
        const edgeColorItem = allColors[edgeColorIndex];
        if (edgeColorItem && edgeColorItem.type === 'colormap') {
            options.edgeColormapItem = edgeColorItem;
        } else if (edgeColorItem && edgeColorItem.type === 'color') {
            options.edgeColor = edgeColorItem.value;
        }
    } else {
        options.edgeColor = colors.edge;
    }
    
    const faceColorIndex = colorAssignments[C.COLOR_TARGET_FACE];
    if (faceColorIndex !== -1) {
        const faceColorItem = allColors[faceColorIndex];
        if (faceColorItem && faceColorItem.type === 'color') {
            options.faceColor = faceColorItem.value;
        } else if (faceColorItem && faceColorItem.type === 'colormap') {
            options.faceColormapItem = faceColorItem;
        }
    } else {
        options.faceColor = colors.face;
    }
    
    drawTriangleIcon(ctx, rect, options, colors);
}

function drawTriangleIcon(ctx, rect, options, colors, isActive = false) {
    const { vertexState = 'none', edgeState = 'none', faceState = 'none', faceColor, edgeColor, vertexColor: optionsVertexColor, faceColormapItem, showAllDisabled = false } = options;
    
    ctx.save();
    
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    
    ctx.translate(center.x, center.y);
    const scale = rect.width / C.UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    
    const triangleSize = 26;
    const height = triangleSize * Math.sqrt(3) / 2;
    
    const vertices = [
        { x: 16, y: 16 - height / 1.5 },
        { x: 16 - triangleSize / 2, y: 16 + height / 3 },
        { x: 16 + triangleSize / 2, y: 16 + height / 3 }
    ];

    const facePath = new Path2D();
    facePath.moveTo(vertices[0].x, vertices[0].y);
    facePath.lineTo(vertices[1].x, vertices[1].y);
    facePath.lineTo(vertices[2].x, vertices[2].y);
    facePath.closePath();
    
    if (faceState === 'filled') {
        if (faceColormapItem && faceColormapItem.type === 'colormap') {
            const gradient = ctx.createLinearGradient(vertices[1].x, 0, vertices[2].x, 0);
            faceColormapItem.vertices.forEach(vertex => {
                const colorValue = vertex.color;
                const alpha = vertex.alpha !== undefined ? vertex.alpha : 1.0;
                const colorString = `rgba(${colorValue.join(',')},${alpha})`;
                gradient.addColorStop(vertex.pos, colorString);
            });
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = faceColor || colors.face;
        }
        ctx.fill(facePath);
    } else if (faceState === 'disabled') {
        ctx.fillStyle = '#808080';
        ctx.fill(facePath);
    }
    
    if (edgeState === 'solid' || edgeState === 'disabled') {
        ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
        ctx.setLineDash([]);
        
        const edges = [
            [vertices[0], vertices[1]],
            [vertices[1], vertices[2]],
            [vertices[2], vertices[0]]
        ];
        
        edges.forEach((edge, edgeIndex) => {
            const [start, end] = edge;
            if (options.edgeColormapItem && options.edgeColormapItem.type === 'colormap' && edgeState === 'solid') {
                const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
                const edgeOffset = edges.length > 1 ? edgeIndex / (edges.length - 1) : 0.5;
                const startT = Math.max(0, Math.min(1, edgeOffset));
                const endT = Math.max(0, Math.min(1, edgeOffset + 0.3));
                const startColor = U.sampleColormap(options.edgeColormapItem, startT);
                const endColor = U.sampleColormap(options.edgeColormapItem, endT);
                gradient.addColorStop(0, startColor);
                gradient.addColorStop(1, endColor);
                ctx.strokeStyle = gradient;
            } else if (edgeState === 'disabled') {
                ctx.strokeStyle = '#808080';
            } else {
                ctx.strokeStyle = edgeColor || colors.edge;
            }
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        });
    }
    
    if (vertexState === 'filled' || vertexState === 'disabled') {
        ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
        vertices.forEach((vertex, index) => {
            let currentVertexColor = optionsVertexColor || colors.vertex;
            if (options.vertexColormapItem && options.vertexColormapItem.type === 'colormap' && vertexState === 'filled') {
                const t = vertices.length > 1 ? index / (vertices.length - 1) : 0.5;
                currentVertexColor = U.sampleColormap(options.vertexColormapItem, t);
            }
            if (vertexState === 'disabled') {
                currentVertexColor = '#808080';
            }
            const vertexPath = new Path2D();
            vertexPath.moveTo(vertex.x + C.UI_ICON_VERTEX_RADIUS * 2, vertex.y);
            vertexPath.arc(vertex.x, vertex.y, C.UI_ICON_VERTEX_RADIUS * 2, 0, 2 * Math.PI);
            ctx.fillStyle = currentVertexColor;
            ctx.setLineDash([]);
            ctx.fill(vertexPath);
        });
    }

    const hasDisabledElements = vertexState === 'disabled' || edgeState === 'disabled' || faceState === 'disabled';
    
    if (showAllDisabled) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(2, 2);
        ctx.lineTo(30, 30);
        ctx.stroke();
    } else if (hasDisabledElements) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(2, 2);
        ctx.lineTo(30, 30);
        ctx.stroke();
    }
    
    ctx.restore();
}

export function drawFace(ctx, screenVertices, face, colors, dataToScreen, findVertexById) {
    if (!screenVertices || screenVertices.length < 3) return;

    ctx.save();

    // Create the path for the face first.
    ctx.beginPath();
    screenVertices.forEach((vertex, index) => {
        if (index === 0) {
            ctx.moveTo(vertex.x, vertex.y);
        } else {
            ctx.lineTo(vertex.x, vertex.y);
        }
    });
    ctx.closePath();

    if (face && face.colormapItem && face.localCoordSystem) {
        const isCycled = face.colormapItem.isCyclic === true;

        if (isCycled) {
            // --- Logic for REPEATING (Cycled) Colormaps ---
            const cacheKey = JSON.stringify(face.colormapItem.vertices);
            let patternCanvas = patternCache.get(cacheKey);

            if (!patternCanvas) {
                patternCanvas = document.createElement('canvas');
                patternCanvas.width = 256;
                patternCanvas.height = 1;
                const patternCtx = patternCanvas.getContext('2d');
                const grad = patternCtx.createLinearGradient(0, 0, 256, 0);
                
                face.colormapItem.vertices.forEach(vertex => {
                    const colorValue = vertex.color;
                    const alpha = vertex.alpha !== undefined ? vertex.alpha : 1.0;
                    let colorString = `rgba(255,255,255,${alpha})`;
                    if (typeof colorValue === 'string') {
                        colorString = colorValue;
                    } else if (Array.isArray(colorValue)) {
                        colorString = `rgba(${colorValue.join(',')},${alpha})`;
                    }
                    grad.addColorStop(vertex.pos, colorString);
                });
                
                patternCtx.fillStyle = grad;
                patternCtx.fillRect(0, 0, 256, 1);
                patternCache.set(cacheKey, patternCanvas);
            }
            
            const pattern = ctx.createPattern(patternCanvas, 'repeat');
            const origin_s = dataToScreen(face.localCoordSystem.origin);
            const unit_vec_global = U.localToGlobal({x: 1, y: 0}, face.localCoordSystem);
            const unit_vec_s = dataToScreen(unit_vec_global);
            
            const dx = unit_vec_s.x - origin_s.x;
            const dy = unit_vec_s.y - origin_s.y;
            
            const screen_dist = Math.hypot(dx, dy);
            const scale = screen_dist > 0 ? screen_dist / 256 : 0;
            
            const matrix = new DOMMatrix();
            matrix.translateSelf(origin_s.x, origin_s.y);
            matrix.rotateSelf(0, 0, -face.localCoordSystem.angle * 180 / Math.PI);
            matrix.scaleSelf(scale, scale);
            
            pattern.setTransform(matrix);
            
            ctx.fillStyle = pattern;
            ctx.fill();

        } else {
            // --- Logic for SATURATING (Regular) Colormaps ---
            const localStart = { x: 0, y: 0 };
            const localEnd = { x: 1, y: 0 };
            const globalStart = U.localToGlobal(localStart, face.localCoordSystem);
            const globalEnd = U.localToGlobal(localEnd, face.localCoordSystem);
            const screenStart = dataToScreen(globalStart);
            const screenEnd = dataToScreen(globalEnd);
            
            const gradient = ctx.createLinearGradient(screenStart.x, screenStart.y, screenEnd.x, screenEnd.y);
            face.colormapItem.vertices.forEach(vertex => {
                let colorValue = vertex.color;
                if (typeof colorValue === 'string') {
                    gradient.addColorStop(vertex.pos, colorValue);
                } else {
                    const alpha = vertex.alpha !== undefined ? vertex.alpha : 1.0;
                    gradient.addColorStop(vertex.pos, `rgba(${colorValue.join(',')},${alpha})`);
                }
            });
            ctx.fillStyle = gradient;
            ctx.fill();
        }
    } else {
        // Default solid color fill
        ctx.fillStyle = face?.color || colors.face;
        ctx.fill();
    }
    
    ctx.restore();
}



function drawVisibilityPanelIcon(ctx, icon, state, htmlOverlay, updateHtmlLabel, iconColors) {
    const {angleDisplayMode, distanceDisplayMode, colors } = state;
    
    const rect = { x: icon.x, y: icon.y, width: icon.width, height: icon.height };
    switch (icon.group) {
        case 'angles':
            drawAngleIcon(ctx, rect, angleDisplayMode, angleDisplayMode !== C.ANGLE_DISPLAY_MODE_NONE, htmlOverlay, updateHtmlLabel, colors);
            break;
        case 'distances':
            drawDistanceIcon(ctx, rect, distanceDisplayMode, distanceDisplayMode === C.DISTANCE_DISPLAY_MODE_ON, htmlOverlay, updateHtmlLabel, colors);
            break;
    }
}

function drawVisibilityPanel(ctx, htmlOverlay, state, updateHtmlLabel) {
    const { canvasUI, colorAssignments, allColors, colors } = state;

    const getColor = (target) => {
        if (!colorAssignments || !allColors) return colors.uiIcon;
        const colorIndex = colorAssignments[target];
        if (colorIndex === -1) return 'rgba(128, 128, 128, 1)';
        const item = allColors[colorIndex];
        if (!item) return colors.uiIcon;
        if (item.type === 'color') return item.value;
        return colors.uiIcon; 
    };

    const iconColors = {
        vertexColor: getColor(C.COLOR_TARGET_VERTEX),
        edgeColor: getColor(C.COLOR_TARGET_EDGE),
        faceColor: getColor(C.COLOR_TARGET_FACE)
    };

    canvasUI.visibilityIcons.forEach(icon => {
        drawVisibilityPanelIcon(ctx, icon, state, htmlOverlay, updateHtmlLabel, iconColors);
    });
}

function drawMainToolbar(ctx, htmlOverlay, state, updateHtmlLabel) {
   const { canvasUI, colors, activeThemeName, colorAssignments, allColors, verticesVisible, edgesVisible, facesVisible } = state;

   const btn = canvasUI.toolbarButton;
   ctx.strokeStyle = colors.uiDefault;
   ctx.lineWidth = C.UI_MENU_ICON_LINE_WIDTH;
   ctx.beginPath();
   for (let i = 0; i < 3; i++) {
       const lineY = btn.y + 5 + i * 10;
       ctx.moveTo(btn.x + 4, lineY);
       ctx.lineTo(btn.x + btn.width - 4, lineY);
   }
   ctx.stroke();

   const ctb = canvasUI.colorToolButton;
   if (ctb) {
       drawColorToolbarPreview(ctx, ctb, {
           verticesVisible,
           edgesVisible,
           facesVisible,
           colorAssignments,
           allColors
       }, colors);
   }

   const ttb = canvasUI.transformToolButton;
   if (ttb) {
       updateHtmlLabel({ id: 'transform-tool-label', content: C.UI_TRANSFORM_TOOL_LABEL_TEXT, x: ttb.x + ttb.width / 2, y: ttb.y + ttb.height / 2, color: colors.uiIcon, fontSize: C.UI_TRANSFORM_TOOL_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
   }

   const dtb = canvasUI.displayToolButton;
   if (dtb) {
       ctx.strokeStyle = colors.uiDefault;
       ctx.fillStyle = colors.uiDefault;
       ctx.lineWidth = C.UI_ICON_LINE_WIDTH;
       const barWidth = dtb.width - C.UI_DISPLAY_ICON_BAR_WIDTH_PADDING;
       for (let i = 0; i < 3; i++) {
           const y = dtb.y + C.UI_DISPLAY_ICON_Y_OFFSET + i * C.UI_DISPLAY_ICON_Y_SPACING;
           ctx.beginPath();
           ctx.moveTo(dtb.x + 6, y);
           ctx.lineTo(dtb.x + 6 + barWidth, y);
           ctx.stroke();
           ctx.beginPath();
           ctx.arc(dtb.x + 6 + barWidth * (i / 2), y, C.UI_DISPLAY_ICON_KNOB_RADIUS, 0, 2 * Math.PI);
           ctx.fill();
       }
   }

   const vtb = canvasUI.visibilityToolButton;
   if (vtb) {
       drawVisibilityIcon(ctx, vtb, colors);
   }

   const themeBtn = canvasUI.themeToggleButton;
   if (themeBtn) {
       drawThemeIcon(ctx, themeBtn, activeThemeName, colors);
   }
}



function drawTransformPanel(ctx, state) {
    const { canvasUI, colors } = state;
    canvasUI.transformIcons.forEach(icon => {
        drawUITransformationSymbols(ctx, icon, colors);
    });
}

function drawDisplayPanel(ctx, htmlOverlay, state, updateHtmlLabel) {
    const { canvasUI, colors, coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode, activeThemeName } = state;
    
    canvasUI.displayIcons.forEach(icon => {
        const rect = { x: icon.x, y: icon.y, width: icon.width, height: icon.height };
        switch (icon.group) {
            case 'coords':
                drawCoordsIcon(ctx, rect, coordsDisplayMode, coordsDisplayMode !== C.COORDS_DISPLAY_MODE_NONE, htmlOverlay, updateHtmlLabel, colors);
                break;
            case 'grid':
                drawGridIcon(ctx, rect, gridDisplayMode, gridDisplayMode !== C.GRID_DISPLAY_MODE_NONE, colors);
                break;
            case 'angles':
                drawAngleIcon(ctx, rect, angleDisplayMode, angleDisplayMode !== C.ANGLE_DISPLAY_MODE_NONE, htmlOverlay, updateHtmlLabel, colors);
                break;
            case 'distances':
                drawDistanceIcon(ctx, rect, distanceDisplayMode, distanceDisplayMode === C.DISTANCE_DISPLAY_MODE_ON, htmlOverlay, updateHtmlLabel, colors);
                break;
            case 'theme':
                drawThemeIcon(ctx, rect, activeThemeName, colors);
                break;
        }
    });
}
export function drawCanvasUI(ctx, htmlOverlay, state, updateHtmlLabel) {
    const { dpr, isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isVisibilityPanelExpanded,
        isPlacingTransform, placingTransformType, placingSnapPos, mousePos, colors } = state;

    ctx.save();
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    if (isToolbarExpanded) {
        drawMainToolbar(ctx, htmlOverlay, state, updateHtmlLabel);
    } else {
        const btn = state.canvasUI.toolbarButton;
        ctx.strokeStyle = colors.uiDefault;
        ctx.lineWidth = C.UI_MENU_ICON_LINE_WIDTH;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const lineY = btn.y + 5 + i * 10;
            ctx.moveTo(btn.x + 4, lineY);
            ctx.lineTo(btn.x + btn.width - 4, lineY);
        }
        ctx.stroke();
    }

    if (isColorPaletteExpanded) {
        drawColorPalette(ctx, htmlOverlay, state, updateHtmlLabel);
    }
    if (isTransformPanelExpanded) {
        drawTransformPanel(ctx, state);
    }
    if (isDisplayPanelExpanded) {
        drawDisplayPanel(ctx, htmlOverlay, state, updateHtmlLabel);
    }
    if (isVisibilityPanelExpanded) {
        drawVisibilityPanel(ctx, htmlOverlay, state, updateHtmlLabel);
    }

    if (isPlacingTransform) {
        const finalDrawPos = placingSnapPos || mousePos;
        if (finalDrawPos) {
            const iconHalfSize = C.UI_GHOST_ICON_SIZE / 2;
            const ghostIcon = { type: placingTransformType, x: finalDrawPos.x - iconHalfSize, y: finalDrawPos.y - iconHalfSize, width: C.UI_GHOST_ICON_SIZE, height: C.UI_GHOST_ICON_SIZE };
            drawUITransformationSymbols(ctx, ghostIcon, colors);
        }
    }

    ctx.restore();
}

export function getIconPreviewColor(target, draggedColorTargetInfo, allColors, colors) {
    if (draggedColorTargetInfo && draggedColorTargetInfo.target === target && draggedColorTargetInfo.previewColorIndex !== undefined) {
        const colorIndex = draggedColorTargetInfo.previewColorIndex;
        if (colorIndex === -1) {
            return generateRandomColor();
        }
        const item = allColors[colorIndex];
        if (item?.type === 'color') {
            return item.value;
        } else if (item?.type === 'colormap') {
            return sampleColormap(item, 0.5);
        }
    }
    
    // Fallback to current assignment
    const colorIndex = colorAssignments[target];
    if (colorIndex === -1) {
        return 'rgba(128, 128, 128, 1)';
    }
    const item = allColors[colorIndex];
    if (!item) return colors.uiIcon;
    if (item.type === 'color') return item.value;
    return colors.uiIcon;
}

export function drawSelectedEdgeDistances(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showDistances, distanceSigFigs, colors, lastGridState, currentShiftPressed }, findVertexById, getEdgeId, dataToScreen, updateHtmlLabel, currentVertexStates = null, initialDragVertexStates = null, transformIndicatorData = null) {
    if (!showDistances || selectedEdgeIds.length === 0) return;
    
    selectedEdgeIds.forEach(edgeId => {
        const edge = allEdges.find(e => getEdgeId(e) === edgeId);
        if (edge) {
            let p1 = findVertexById(edge.id1);
            let p2 = findVertexById(edge.id2);
            
            if (currentVertexStates) {
                const p1State = currentVertexStates.find(p => p.id === edge.id1);
                const p2State = currentVertexStates.find(p => p.id === edge.id2);
                if (p1State) p1 = p1State;
                if (p2State) p2 = p2State;
            }
            
            if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
                let distanceText;
                const isTransforming = currentVertexStates && transformIndicatorData;

                if (edge.labelMode === 'exact' && edge.exactValue) {
                    const [coeff, radicand] = U.simplifySquareRoot(edge.exactValue.g2gSquaredSum);
                    let finalCoeff = edge.exactValue.gridInterval * coeff;
                    
                    // Only apply scale during a live transform preview
                    if (isTransforming && transformIndicatorData.transformType !== C.TRANSFORMATION_TYPE_ROTATION) {
                        const scale = transformIndicatorData.snappedScaleValue !== null ? transformIndicatorData.snappedScaleValue : transformIndicatorData.scale;
                        finalCoeff *= scale;
                    }
                    
                    distanceText = U.formatSimplifiedRoot(parseFloat(finalCoeff.toFixed(10)), radicand);
                } else {
                    // For 'decimal' mode or if data is missing, calculate the length
                    distanceText = U.formatNumber(U.distance(p1, p2), distanceSigFigs);
                }
                
                const p1Screen = dataToScreen(p1);
                const p2Screen = dataToScreen(p2);
                const midX = (p1Screen.x + p2Screen.x) / 2;
                const midY = (p1Screen.y + p2Screen.y) / 2;
                const edgeAngleScreen = Math.atan2(p2Screen.y - p1Screen.y, p2Screen.x - p1Screen.x);
                
                let textPerpAngle = edgeAngleScreen - Math.PI / 2;
                if (Math.sin(textPerpAngle) > 0) {
                    textPerpAngle += Math.PI;
                }
                
                const distanceTextX = midX + Math.cos(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
                const distanceTextY = midY + Math.sin(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
                
                let rotationDeg = edgeAngleScreen * (180 / Math.PI);
                if (rotationDeg > 90 || rotationDeg < -90) {
                    rotationDeg += 180;
                }
                
                updateHtmlLabel({ 
                    id: `selected-edge-dist-${edgeId}`, 
                    content: distanceText, 
                    x: distanceTextX, 
                    y: distanceTextY, 
                    color: `rgba(${colors.feedbackDefault.join(',')}, 1.0)`, 
                    fontSize: C.FEEDBACK_LABEL_FONT_SIZE, 
                    options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } 
                });
            }
        }
    });
}

export function drawSelectionRectangle(ctx, startPos, currentPos, colors) {
    ctx.save();
    ctx.strokeStyle = colors.mouseCoords;
    ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
    ctx.setLineDash(C.DASH_PATTERN);

    const rX = Math.min(startPos.x, currentPos.x);
    const rY = Math.min(startPos.y, currentPos.y);
    const rW = Math.abs(startPos.x - currentPos.x);
    const rH = Math.abs(startPos.y - currentPos.y);

    ctx.strokeRect(rX, rY, rW, rH);
    ctx.restore();
}

export function drawDragFeedback(ctx, htmlOverlay, targetVertexId, currentVertexStates, { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors }, dataToScreen, findNeighbors, getEdgeId, isSnapping = false, excludedEdgeId = null, updateHtmlLabel = null, selectedVertexIds = [], isDragging = false, initialDragVertexStates = [], activeCenterId = null) {
    const feedbackColor = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;

    const liveVertices = new Map(currentVertexStates.map(p => [p.id, { ...p }]));
    const getLiveVertex = (id) => liveVertices.get(id);

    const vertex = getLiveVertex(targetVertexId);
    if (!vertex) return;

    const neighbors = findNeighbors(vertex.id).map(getLiveVertex).filter(Boolean);
    const vertexScreen = dataToScreen(vertex);
    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    const isVertexOnGrid = (vertex, interval) => {
        if (!vertex || !interval || interval <= 0) return false;
        const epsilon = interval * 1e-6;
        const isOnGridX = Math.abs(vertex.x / interval - Math.round(vertex.x / interval)) < epsilon;
        const isOnGridY = Math.abs(vertex.y / interval - Math.round(vertex.y / interval)) < epsilon;
        return isOnGridX && isOnGridY;
    };

    const allNeighborsAreDragged = neighbors.every(n => selectedVertexIds.includes(n.id));
    const originalVertexState = initialDragVertexStates.find(p => p.id === targetVertexId);

    if (!activeCenterId && isDragging && currentShiftPressed && allNeighborsAreDragged && originalVertexState && U.distance(originalVertexState, vertex) > C.GEOMETRY_CALCULATION_EPSILON) {
        const p1Screen = dataToScreen(originalVertexState);
        const p2Screen = vertexScreen;
        const dragVectorAngle = Math.atan2(p2Screen.y - p1Screen.y, p2Screen.x - p1Screen.x);

        if (showDistances) {
            let distText;
            const dragStartedOnGrid = gridInterval && isVertexOnGrid(originalVertexState, gridInterval);
            const dragEndedOnGrid = gridInterval && isVertexOnGrid(vertex, gridInterval);
            if (dragStartedOnGrid && dragEndedOnGrid) {
                const deltaX = vertex.x - originalVertexState.x;
                const deltaY = vertex.y - originalVertexState.y;
                const dx_grid = Math.round(deltaX / gridInterval);
                const dy_grid = Math.round(deltaY / gridInterval);
                const g2gSquaredSumForDisplay = dx_grid * dx_grid + dy_grid * dy_grid;
                if (g2gSquaredSumForDisplay === 0) {
                    distText = '0';
                } else {
                    const [coeff, radicand] = U.simplifySquareRoot(g2gSquaredSumForDisplay);
                    const finalCoeff = gridInterval * coeff;
                    const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                    distText = U.formatSimplifiedRoot(roundedFinalCoeff, radicand);
                }
            } else {
                distText = U.formatNumber(U.distance(originalVertexState, vertex), distanceSigFigs);
            }
            const midX = (p1Screen.x + p2Screen.x) / 2;
            const midY = (p1Screen.y + p2Screen.y) / 2;
            let textPerpAngle = dragVectorAngle - Math.PI / 2;
            if (Math.sin(textPerpAngle) > 0) {
                textPerpAngle += Math.PI;
            }
            const distanceTextX = midX + Math.cos(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
            const distanceTextY = midY + Math.sin(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
            let rotationDeg = dragVectorAngle * (180 / Math.PI);
            if (rotationDeg > 90 || rotationDeg < -90) {
                rotationDeg += 180;
            }
            updateHtmlLabel({ id: `drag-dist-vector-${vertex.id}`, content: distText, x: distanceTextX, y: distanceTextY, color: feedbackColor, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } }, htmlOverlay);
        }

        ctx.save();
        ctx.setLineDash(C.DASH_PATTERN);
        ctx.strokeStyle = feedbackColor;
        ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);
        ctx.stroke();
        ctx.restore();
        
        if (showAngles && Math.abs(dragVectorAngle) > C.GEOMETRY_CALCULATION_EPSILON) {
            const dataAngle = Math.atan2(vertex.y - originalVertexState.y, vertex.x - originalVertexState.x);
            drawAngleArc(ctx, p1Screen, 0, dataAngle, C.FEEDBACK_ARC_RADIUS_SCREEN, feedbackColor);
            
            let angleText;
            if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_DEGREES) {
                angleText = `${U.formatNumber(dataAngle * (180 / Math.PI), angleSigFigs)}^{\\circ}`;
            } else {
                angleText = U.formatNumber(dataAngle, angleSigFigs);
            }

            if (angleText) {
                const bisectorAngle = -dataAngle / 2.0;
                const angleLabelScreenPos = {
                    x: p1Screen.x + C.ANGLE_LABEL_RADIUS_SCREEN * Math.cos(bisectorAngle),
                    y: p1Screen.y + C.ANGLE_LABEL_RADIUS_SCREEN * Math.sin(bisectorAngle)
                };
                updateHtmlLabel({ id: `drag-angle-vector-${vertex.id}`, content: angleText, x: angleLabelScreenPos.x, y: angleLabelScreenPos.y, color: feedbackColor, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
            }
        }
    }
    
    if (showDistances) {
        neighbors.forEach(neighbor => {
            const isNeighborSelected = selectedVertexIds.includes(neighbor.id);
            if (!isDragging || !isNeighborSelected) {
                const p1 = vertex;
                const p2 = neighbor;
                const edgeId = getEdgeId({ id1: p1.id, id2: p2.id });
                let distanceText;
                const areBothVerticesOnGrid = gridInterval && isVertexOnGrid(p1, gridInterval) && isVertexOnGrid(p2, gridInterval);

                if (areBothVerticesOnGrid) {
                    const deltaX = p1.x - p2.x;
                    const deltaY = p1.y - p2.y;
                    const dx_grid = Math.round(deltaX / gridInterval);
                    const dy_grid = Math.round(deltaY / gridInterval);
                    const g2gSquaredSumForDisplay = dx_grid * dx_grid + dy_grid * dy_grid;
                    if (g2gSquaredSumForDisplay === 0) {
                        distanceText = '0';
                    } else {
                        const [coeff, radicand] = U.simplifySquareRoot(g2gSquaredSumForDisplay);
                        const finalCoeff = gridInterval * coeff;
                        const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                        distanceText = U.formatSimplifiedRoot(roundedFinalCoeff, radicand);
                    }
                } else {
                    const edgeLength = U.distance(p1, p2);
                    distanceText = U.formatNumber(edgeLength, distanceSigFigs);
                }
                
                const p1Screen = dataToScreen(p1);
                const p2Screen = dataToScreen(p2);
                const midX = (p1Screen.x + p2Screen.x) / 2;
                const midY = (p1Screen.y + p2Screen.y) / 2;
                const edgeAngleScreen = Math.atan2(p2Screen.y - p1Screen.y, p2Screen.x - p1Screen.x);
                
                let textPerpAngle = edgeAngleScreen - Math.PI / 2;
                if (Math.sin(textPerpAngle) > 0) {
                    textPerpAngle += Math.PI;
                }
                
                const distanceTextX = midX + Math.cos(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
                const distanceTextY = midY + Math.sin(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
                
                let rotationDeg = edgeAngleScreen * (180 / Math.PI);
                if (rotationDeg > 90 || rotationDeg < -90) {
                    rotationDeg += 180;
                }
                
                updateHtmlLabel({ 
                    id: `drag-dist-${edgeId}`, 
                    content: distanceText, 
                    x: distanceTextX, 
                    y: distanceTextY, 
                    color: feedbackColor, 
                    fontSize: C.FEEDBACK_LABEL_FONT_SIZE, 
                    options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } 
                });
            }
        });
    }
    
    if (showAngles && neighbors.length >= 2 && (!isDragging || neighbors.some(n => !selectedVertexIds.includes(n.id)))) {
        const sortedNeighbors = [...neighbors].sort((a, b) => {
            const angleA = Math.atan2(a.y - vertex.y, a.x - vertex.x);
            const angleB = Math.atan2(b.y - vertex.y, b.x - vertex.x);
            return angleA - angleB;
        });

        for (let i = 0; i < sortedNeighbors.length; i++) {
            const p1 = sortedNeighbors[i];
            const p2 = sortedNeighbors[(i + 1) % sortedNeighbors.length];
            
            const p1IsSelected = selectedVertexIds.includes(p1.id);
            const p2IsSelected = selectedVertexIds.includes(p2.id);
            const angleIsChanging = !isDragging || !p1IsSelected || !p2IsSelected;
            
            if (!angleIsChanging) continue;
            
            const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
            const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
            const angle1_data = Math.atan2(v1.y, v1.x);
            const angle2_data = Math.atan2(v2.y, v2.x);
            let angleToDisplayRad = angle2_data - angle1_data;
            if (angleToDisplayRad < 0) {
                angleToDisplayRad += 2 * Math.PI;
            }
            if (angleToDisplayRad < C.GEOMETRY_CALCULATION_EPSILON) continue;
            
            const bisectorAngle = angle1_data + (angleToDisplayRad / 2);
            ctx.save();
            ctx.strokeStyle = feedbackColor;
            ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
            ctx.beginPath();
            ctx.arc(vertexScreen.x, vertexScreen.y, C.FEEDBACK_ARC_RADIUS_SCREEN, -angle1_data, -angle2_data, false);
            ctx.stroke();
            ctx.restore();

            let angleText;
            if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_DEGREES) {
                angleText = `${U.formatNumber(angleToDisplayRad * (180 / Math.PI), angleSigFigs)}^{\\circ}`;
            } else if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_RADIANS) {
                if (currentShiftPressed) {
                    angleText = U.formatFraction(angleToDisplayRad / Math.PI, 0.015, 32) + "\\pi";
                    if (angleText.startsWith(`1\\pi`)) angleText = "\\pi";
                    if (angleText.startsWith(`-1\\pi`)) angleText = `-\\pi`;
                    if (angleText === `0\\pi`) angleText = "0";
                } else {
                    angleText = U.formatNumber(angleToDisplayRad, angleSigFigs);
                }
            }

            if (angleText) {
                const angleLabelDataPos = {
                    x: vertex.x + (C.ANGLE_LABEL_RADIUS_SCREEN / viewTransform.scale) * Math.cos(bisectorAngle),
                    y: vertex.y + (C.ANGLE_LABEL_RADIUS_SCREEN / viewTransform.scale) * Math.sin(bisectorAngle)
                };
                const angleLabelScreenPos = dataToScreen(angleLabelDataPos);
                const labelId = `drag-angle-${vertex.id}-${p1.id}-${p2.id}`;
                updateHtmlLabel({ id: labelId, content: angleText, x: angleLabelScreenPos.x, y: angleLabelScreenPos.y, color: feedbackColor, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
            }
        }
    }
}

export function drawSelectedEdgeAngles(ctx, htmlOverlay, selectedEdgeIds, allEdges, { showAngles, angleSigFigs, angleDisplayMode, currentShiftPressed, distanceSigFigs, viewTransform, lastGridState, colors }, findVertexById, getEdgeId, dataToScreen, findNeighbors, updateHtmlLabel) {
    if (!showAngles || selectedEdgeIds.length === 0) return;
    
    selectedEdgeIds.forEach(edgeId => {
        const edge = allEdges.find(e => getEdgeId(e) === edgeId);
        if (edge) {
            const p1 = findVertexById(edge.id1);
            const p2 = findVertexById(edge.id2);
            if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
                const feedbackState = {
                    lastGridState,
                    showDistances: false,
                    showAngles: true,
                    distanceSigFigs,
                    angleDisplayMode,
                    angleSigFigs,
                    currentShiftPressed,
                    viewTransform,
                    colors
                };
                
                drawDragFeedback(ctx, htmlOverlay, p1.id, [p1, p2], feedbackState, dataToScreen, findNeighbors, getEdgeId, false, null, updateHtmlLabel);
                drawDragFeedback(ctx, htmlOverlay, p2.id, [p1, p2], feedbackState, dataToScreen, findNeighbors, getEdgeId, false, null, updateHtmlLabel);
            }
        }
    });
}

export function drawFaceCoordinateSystems(ctx, { allFaces, selectedFaceIds, colors, isDragConfirmed, dragPreviewVertices, initialDragVertexStates, transformIndicatorData, highlightedEdgeForSnap, draggedFaceId, coordSystemSnapAngle, coordSystemSnapType, coordSystemSnapScale, initialCoordSystemStates }, dataToScreen, findVertexById) {
    if (selectedFaceIds.length > C.MAX_FACES_FOR_COORDS) return;

    const facesToDraw = new Set(selectedFaceIds);
    if (facesToDraw.size === 0) return;

    facesToDraw.forEach(faceId => {
        const face = allFaces.find(f => f.id === faceId);
        if (!face || !face.localCoordSystem) return;

        let systemToDraw = face.localCoordSystem;

        if (isDragConfirmed && face.vertexIds.some(vid => dragPreviewVertices.some(pv => pv.id === vid))) {
            const initialSystem = initialCoordSystemStates.get(face.id);
            systemToDraw = calculatePreviewCoordSystem(face, { initialSystem, dragPreviewVertices, initialDragVertexStates, findVertexById, transformIndicatorData });
        }
        
        if (draggedFaceId === faceId && coordSystemSnapAngle !== null) {
            const getLiveVertex = (vertexId) => {
                if (isDragConfirmed && dragPreviewVertices) {
                    const previewVertex = dragPreviewVertices.find(p => p && p.id === vertexId);
                    if (previewVertex) return previewVertex;
                }
                return findVertexById(vertexId);
            };

            const originScreen = dataToScreen(systemToDraw.origin);
            
            if (coordSystemSnapType === 'edge' && highlightedEdgeForSnap !== null) {
                const faceVertices = face.vertexIds.map(id => getLiveVertex(id)).filter(p => p && p.type === 'regular');
                if (highlightedEdgeForSnap < faceVertices.length) {
                    const edgeStart = faceVertices[highlightedEdgeForSnap];
                    const edgeEnd = faceVertices[(highlightedEdgeForSnap + 1) % faceVertices.length];
                    const startScreen = dataToScreen(edgeStart);
                    const endScreen = dataToScreen(edgeEnd);
                    
                    ctx.save();
                    ctx.strokeStyle = colors.feedbackSnapped;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(startScreen.x, startScreen.y);
                    ctx.lineTo(endScreen.x, endScreen.y);
                    ctx.stroke();
                    ctx.restore();
                }
            } else if (coordSystemSnapType === 'cardinal') {
                const lineLength = 100;
                const lineEndX = originScreen.x + Math.cos(-coordSystemSnapAngle) * lineLength;
                const lineEndY = originScreen.y + Math.sin(-coordSystemSnapAngle) * lineLength;
                const lineStartX = originScreen.x - Math.cos(-coordSystemSnapAngle) * lineLength;
                const lineStartY = originScreen.y - Math.sin(-coordSystemSnapAngle) * lineLength;
                
                ctx.save();
                ctx.strokeStyle = colors.feedbackSnapped;
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 4]);
                ctx.beginPath();
                ctx.moveTo(lineStartX, lineStartY);
                ctx.lineTo(lineEndX, lineEndY);
                ctx.stroke();
                ctx.restore();
            }
        }

        drawCoordinateSystemCross(ctx, systemToDraw, colors, dataToScreen, coordSystemSnapScale);
    });
}

function drawCoordinateSystemCross(ctx, coordSystem, colors, dataToScreen, coordSystemSnapScale = null) {
    const centerScreen = dataToScreen(coordSystem.origin);

    const xAxisEndGlobal = U.localToGlobal({ x: 1, y: 0 }, coordSystem);
    const yAxisEndGlobal = U.localToGlobal({ x: 0, y: 1 }, coordSystem);
    const xAxisScreenEnd = dataToScreen(xAxisEndGlobal);
    const yAxisScreenEnd = dataToScreen(yAxisEndGlobal);

    ctx.save();
    ctx.lineWidth = C.SELECTION_GLOW_LINE_WIDTH;
    ctx.lineCap = 'round';

    const drawArrow = (p1, p2, lineColor, arrowColor) => {
        // Draw line
        ctx.strokeStyle = lineColor;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Draw arrowhead
        ctx.fillStyle = arrowColor;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - C.AXIS_ARROW_SIZE * Math.cos(angle - C.AXIS_ARROW_ANGLE_RAD), p2.y - C.AXIS_ARROW_SIZE * Math.sin(angle - C.AXIS_ARROW_ANGLE_RAD));
        ctx.lineTo(p2.x - C.AXIS_ARROW_SIZE * Math.cos(angle + C.AXIS_ARROW_ANGLE_RAD), p2.y - C.AXIS_ARROW_SIZE * Math.sin(angle + C.AXIS_ARROW_ANGLE_RAD));
        ctx.closePath();
        ctx.fill();
    };

    // Determine arrow colors based on snap state
    const xArrowColor = coordSystemSnapScale !== null ? colors.feedbackSnapped : '#ff0000'; // Red for x-axis
    const yArrowColor = coordSystemSnapScale !== null ? colors.feedbackSnapped : '#00ff00'; // Green for y-axis

    drawArrow(centerScreen, xAxisScreenEnd, '#ff0000', xArrowColor);
    drawArrow(centerScreen, yAxisScreenEnd, '#00ff00', yArrowColor);

    // The center vertex for grabbing (blue dot)
    ctx.fillStyle = '#0000ff';
    ctx.beginPath();
    ctx.arc(centerScreen.x, centerScreen.y, 4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.restore();
}
