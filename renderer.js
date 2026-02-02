import * as U from './utils.js';
import * as C from './constants.js';

const patternCache = new Map();
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const toRgba = (value, fallback) => {
    const parsed = U.parseColor(value);
    if (!parsed) return fallback;
    return parsed;
};
const toRgbaString = (color) => `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${color.a ?? 1})`;
const lerp = (a, b, t) => a + (b - a) * t;
const mixColors = (colors, weights) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let total = 0;
    colors.forEach((color, index) => {
        const w = weights[index] || 0;
        total += w;
        r += color.r * w;
        g += color.g * w;
        b += color.b * w;
        a += color.a * w;
    });
    if (total <= 0) return { r: 0, g: 0, b: 0, a: 1 };
    return { r: r / total, g: g / total, b: b / total, a: a / total };
};

function buildInterpolatedEdgePath(edge, edgeStyle, p1, p2, allEdges, getRenderVertexById, dataToScreen) {
    if (!edgeStyle) return [p1, p2];
    const fromId = edge.directionFrom || edge.id1;
    const toId = edge.directionTo || edge.id2;
    const fromVertex = getRenderVertexById(fromId) || p1;
    const toVertex = getRenderVertexById(toId) || p2;
    const edgeDirVec = {
        x: toVertex.x - fromVertex.x,
        y: toVertex.y - fromVertex.y
    };
    const edgeDirLen = Math.hypot(edgeDirVec.x, edgeDirVec.y) || 1;
    edgeDirVec.x /= edgeDirLen;
    edgeDirVec.y /= edgeDirLen;
    const currentStyleId = edge.interpolationStyleId || null;
    const getNeighborCandidates = (vertexId, excludeId) => {
        const candidates = [];
        allEdges.forEach(e => {
            const isSameEdge = (e.id1 === edge.id1 && e.id2 === edge.id2) || (e.id1 === edge.id2 && e.id2 === edge.id1);
            if (isSameEdge) return;
            if (e.id1 === vertexId && e.id2 !== excludeId) candidates.push(e);
            if (e.id2 === vertexId && e.id1 !== excludeId) candidates.push(e);
        });
        return candidates;
    };
    const pickDirectionalNeighbor = (vertexId, excludeId, preferAligned) => {
        const neighborEdges = getNeighborCandidates(vertexId, excludeId).filter(e => (e.interpolationStyleId || null) === currentStyleId);
        if (neighborEdges.length !== 1) return null; // Junctions or mismatched styles use anchors only
        const neighborEdge = neighborEdges[0];
        const neighborId = neighborEdge.id1 === vertexId ? neighborEdge.id2 : neighborEdge.id1;
        const candidates = [neighborId];
        let best = null;
        let bestScore = preferAligned ? -Infinity : Infinity;
        candidates.forEach(id => {
            const neighbor = getRenderVertexById(id);
            if (!neighbor || neighbor.type !== C.VERTEX_TYPE_REGULAR) return;
            const origin = getRenderVertexById(vertexId);
            if (!origin) return;
            const vec = { x: neighbor.x - origin.x, y: neighbor.y - origin.y };
            const len = Math.hypot(vec.x, vec.y);
            if (len <= C.GEOMETRY_CALCULATION_EPSILON) return;
            const dot = (vec.x / len) * edgeDirVec.x + (vec.y / len) * edgeDirVec.y;
            if (preferAligned) {
                if (dot > bestScore) {
                    bestScore = dot;
                    best = neighbor;
                }
            } else if (dot < bestScore) {
                bestScore = dot;
                best = neighbor;
            }
        });
        return best;
    };
    const n1 = pickDirectionalNeighbor(fromId, toId, false);
    const n2 = pickDirectionalNeighbor(toId, fromId, true);
    const base = [fromVertex, toVertex];
    if (n1) base.unshift(n1);
    if (n2) base.push(n2);
    const interpolated = U.buildInterpolatedPath(base, edgeStyle, false, dataToScreen);
    if (!interpolated || interpolated.length < 2) return [p1, p2];
    let idx1 = 0;
    let idx2 = interpolated.length - 1;
    let min1 = Infinity;
    let min2 = Infinity;
    interpolated.forEach((pt, idx) => {
        const d1 = U.distance(pt, p1);
        if (d1 < min1) {
            min1 = d1;
            idx1 = idx;
        }
        const d2 = U.distance(pt, p2);
        if (d2 < min2) {
            min2 = d2;
            idx2 = idx;
        }
    });
    if (idx1 === idx2) return [p1, p2];
    const start = Math.min(idx1, idx2);
    const end = Math.max(idx1, idx2);
    return interpolated.slice(start, end + 1);
}

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

export function drawFaceGlows(ctx, { allFaces, hoveredFaceId, selectedFaceIds, colors, isDragConfirmed, dragPreviewVertices, currentAltPressed }, dataToScreen, findVertexById, getFaceId) {
    if (!hoveredFaceId && selectedFaceIds.length === 0) return;

    const previewVertexMap = new Map();
    if (isDragConfirmed && dragPreviewVertices) {
        dragPreviewVertices.forEach(v => {
            if (v && v.id) {
                const originalId = v.originalId || v.id;
                previewVertexMap.set(originalId, v);
            }
        });
    }

    const getLiveVertex = (vertexId) => {
        if (isDragConfirmed && previewVertexMap.has(vertexId)) {
            return previewVertexMap.get(vertexId);
        }
        return findVertexById(vertexId);
    };

    allFaces.forEach(face => {
        const faceId = getFaceId(face);
        const isSelected = selectedFaceIds.includes(faceId);
        const isHovered = !currentAltPressed && faceId === hoveredFaceId;
        const isFaceBeingDragged = isDragConfirmed && face.vertexIds.some(id => previewVertexMap.has(id));

        if ((isSelected || isHovered) && face.color !== 'transparent') {
            ctx.save();
            ctx.fillStyle = colors.selectionGlow;
            ctx.globalAlpha = C.FACE_GLOW_ALPHA;
            ctx.beginPath();
            const vertices = face.vertexIds.map(id => getLiveVertex(id)).filter(p => p && p.type === 'regular');

            if (vertices.length < 3) {
                ctx.restore();
                return;
            }
            const screenVertices = vertices.map(v => dataToScreen(v));
            screenVertices.forEach((vertex, index) => {
                if (index === 0) {
                    ctx.moveTo(vertex.x, vertex.y);
                } else {
                    ctx.lineTo(vertex.x, vertex.y);
                }
            });
            ctx.closePath();

            if (face.childFaceIds && face.childFaceIds.length > 0) {
                face.childFaceIds.forEach(childId => {
                    const childFace = allFaces.find(f => f.id === childId);
                    if (childFace) {
                        const childLiveVertices = childFace.vertexIds.map(id => getLiveVertex(id)).filter(p => p && p.type === 'regular');
                        if (childLiveVertices.length >= 3) {
                            const childScreenVertices = childLiveVertices.map(v => dataToScreen(v));
                            ctx.moveTo(childScreenVertices[0].x, childScreenVertices[0].y);
                            childScreenVertices.slice(1).forEach(vertex => ctx.lineTo(vertex.x, vertex.y));
                            ctx.closePath();
                        }
                    }
                });
            }
            ctx.fill('evenodd');
            ctx.restore();
        }
    });
}

export function drawVertexBaseOnly(ctx, vertex, { colors, verticesVisible = true, isSnapped = false }, dataToScreen) {
    // Basic visibility check
    if (vertex.type === C.VERTEX_TYPE_REGULAR && !verticesVisible && !isSnapped) {
         return;
    }

    const screenPos = dataToScreen(vertex);

    switch (vertex.type) {
        case C.VERTEX_TYPE_REGULAR:
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, C.VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
            // Use snap color for base if snapped, otherwise assigned color or default
            ctx.fillStyle = isSnapped ? colors.feedbackSnapped : (vertex.color || colors.vertex);
            ctx.fill();
            break;
        case C.TRANSFORMATION_TYPE_ROTATION:
        case C.TRANSFORMATION_TYPE_SCALE:
        case C.TRANSFORMATION_TYPE_ROTATE_SCALE:
        case C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE:
            const onCanvasIconSize = C.CENTER_POINT_VISUAL_RADIUS * 2;
            const icon = {
                type: vertex.type,
                x: screenPos.x - onCanvasIconSize / 2,
                y: screenPos.y - onCanvasIconSize / 2,
                width: onCanvasIconSize,
                height: onCanvasIconSize
            };
            // We assume drawUITransformationSymbols doesn't have selection state logic
            drawUITransformationSymbols(ctx, icon, colors);
            break;
    }
}

function calculateVisibleAngleRange(originScreen, screenRadius, canvasWidth, canvasHeight) {
    // If origin is inside the viewport, we can see the full circle
    if (originScreen.x >= 0 && originScreen.x <= canvasWidth && 
        originScreen.y >= 0 && originScreen.y <= canvasHeight) {
        return { ranges: [[0, 360]], isFullCircle: true };
    }

    const rect = {
        left: 0,
        right: canvasWidth,
        top: 0,
        bottom: canvasHeight
    };

    // If circle doesn't intersect the viewport at all
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

    // If all corners are inside the circle, we see the full circle
    const allCornersInside = corners.every(corner => {
        const distSq = (corner.x - originScreen.x) ** 2 + (corner.y - originScreen.y) ** 2;
        return distSq <= screenRadius ** 2;
    });

    if (allCornersInside) {
        return { ranges: [[0, 360]], isFullCircle: true };
    }

    // Find all intersection points and angles
    const intersectionAngles = [];

    // Check corners that are outside the circle
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

    // Check intersections with rectangle edges
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
        return { ranges: [[0, 360]], isFullCircle: true };
    }

    // Remove duplicates and sort
    const uniqueAngles = [...new Set(intersectionAngles.map(a => Math.round(a * 1e6) / 1e6))].sort((a, b) => a - b);

    if (uniqueAngles.length < 2) {
        return { ranges: [[0, 360]], isFullCircle: true };
    }

    // Find the largest gap between consecutive angles (this is the invisible range)
    let maxGap = 0;
    let maxGapStartAngle = 0;
    let maxGapEndAngle = 0;

    for (let i = 0; i < uniqueAngles.length; i++) {
        const currentAngle = uniqueAngles[i];
        const nextAngle = uniqueAngles[(i + 1) % uniqueAngles.length];
        
        let gap;
        if (i === uniqueAngles.length - 1) {
            // Wrap around gap
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

    // The visible range is everything EXCEPT the largest gap
    // So we need to return the complement of the gap
    if (maxGapEndAngle > maxGapStartAngle) {
        // Simple case: gap doesn't wrap around
        return {
            ranges: [[maxGapEndAngle, maxGapStartAngle + 360]],
            isFullCircle: false
        };
    } else {
        // Gap wraps around 0/360
        return {
            ranges: [[maxGapEndAngle, maxGapStartAngle]],
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

function getEdgeMode(edge, fallback) {
    return edge?.colorMode || fallback;
}

function getFaceMode(face, fallback) {
    return face?.colorMode || fallback;
}

export function drawFaces(ctx, { allFaces, allEdges, facesVisible, isDragConfirmed, dragPreviewVertices, transformIndicatorData, initialDragVertexStates, colors, initialCoordSystemStates, interpolationStyle, getInterpolationStyleById, faceColorMode = 'fixed', edgeColorMode = 'fixed', faceColorExpression = 'x', faceColorPolarExpression = 'r', edgeColorExpression = 'x', edgeWeightExpression = 'r', faceVertexWeightExpression = '1/(r+0.001)', faceEdgeWeightExpression = '1/(r+0.001)', angleDisplayMode = 'degrees' }, dataToScreen, findVertexById) {
    if (!facesVisible || !allFaces || !colors || !ctx) return;

    const getLiveVertex = (vertexId) => {
        if (isDragConfirmed && dragPreviewVertices) {
            // Find the preview vertex matching the original ID, if available
            const previewVertex = dragPreviewVertices.find(p => p && (p.id === vertexId || p.originalId === vertexId));
            if (previewVertex) return previewVertex;
        }
        // Fallback to the original vertex from the main state
        return findVertexById(vertexId);
    };

    // First pass: Draw top-level faces with their holes
    const topLevelFaces = allFaces.filter(f => !f.parentFaceId);
    topLevelFaces.forEach((face) => {
        if (!face || !face.vertexIds || face.vertexIds.length < 3) return;

        const liveVertices = face.vertexIds.map(id => getLiveVertex(id)).filter(p => p && p.type === 'regular');
        if (liveVertices.length < 3) return;

        const faceStyle = face.interpolationStyleId && getInterpolationStyleById
            ? getInterpolationStyleById(face.interpolationStyleId)
            : null;
        const pathVertices = faceStyle
            ? U.buildInterpolatedPath(liveVertices, faceStyle, true, dataToScreen)
            : liveVertices;
        const screenVertices = pathVertices.map(v => dataToScreen(v));

        let faceToDraw = face;
        let systemToUse = face.localCoordSystem; // Use the current system by default

        // Check if any vertex of this face is being dragged
        const isFaceBeingDragged = isDragConfirmed && face.vertexIds.some(vid => dragPreviewVertices.some(pv => pv.id === vid));

        if (isFaceBeingDragged && face.localCoordSystem) {
             const initialSystem = initialCoordSystemStates.get(face.id);
             // Always calculate the preview system if dragging and system exists
             systemToUse = calculatePreviewCoordSystem(face, { initialSystem, dragPreviewVertices, initialDragVertexStates, findVertexById, transformIndicatorData });
             faceToDraw = { ...face, localCoordSystem: systemToUse }; // Update face data for drawing function
        }


        if (screenVertices.every(v => v && typeof v.x === 'number' && typeof v.y === 'number')) {
            drawFace(ctx, screenVertices, faceToDraw, colors, dataToScreen, findVertexById, allEdges, allFaces, getLiveVertex, true, interpolationStyle, {
                faceColorMode: getFaceMode(face, faceColorMode),
                edgeColorMode,
                faceColorExpression,
                faceColorPolarExpression,
                edgeColorExpression,
                edgeWeightExpression,
                faceVertexWeightExpression,
                faceEdgeWeightExpression,
                angleDisplayMode
            }); // Pass true to draw holes
        }
    });

    // Second pass: Draw the fills for child faces that are NOT holes
    const childFaces = allFaces.filter(f => f.parentFaceId && f.color !== 'transparent');
    childFaces.forEach((face) => {
        if (!face || !face.vertexIds || face.vertexIds.length < 3) return;

        const liveVertices = face.vertexIds.map(id => getLiveVertex(id)).filter(p => p && p.type === 'regular');
        if (liveVertices.length < 3) return;

        const faceStyle = face.interpolationStyleId && getInterpolationStyleById
            ? getInterpolationStyleById(face.interpolationStyleId)
            : null;
        const pathVertices = faceStyle
            ? U.buildInterpolatedPath(liveVertices, faceStyle, true, dataToScreen)
            : liveVertices;
        const screenVertices = pathVertices.map(v => dataToScreen(v));

        let faceToDraw = face;
        let systemToUse = face.localCoordSystem;

        const isFaceBeingDragged = isDragConfirmed && face.vertexIds.some(vid => dragPreviewVertices.some(pv => pv.id === vid));

        if (isFaceBeingDragged && face.localCoordSystem) {
            const initialSystem = initialCoordSystemStates.get(face.id);
            systemToUse = calculatePreviewCoordSystem(face, { initialSystem, dragPreviewVertices, initialDragVertexStates, findVertexById, transformIndicatorData });
            faceToDraw = { ...face, localCoordSystem: systemToUse };
        }

        if (screenVertices.every(v => v && typeof v.x === 'number' && typeof v.y === 'number')) {
             drawFace(ctx, screenVertices, faceToDraw, colors, dataToScreen, findVertexById, allEdges, allFaces, getLiveVertex, false, interpolationStyle, {
                 faceColorMode: getFaceMode(face, faceColorMode),
                 edgeColorMode,
                 faceColorExpression,
                 faceColorPolarExpression,
                 edgeColorExpression,
                 edgeWeightExpression,
                 faceVertexWeightExpression,
                 faceEdgeWeightExpression,
                 angleDisplayMode
             }); // Pass false, don't draw holes within children
        }
    });
}

function calculatePreviewCoordSystem(face, { initialSystem, dragPreviewVertices, initialDragVertexStates, findVertexById, transformIndicatorData }) {
    if (!initialSystem) return face.localCoordSystem;

    const faceVertexIds = new Set(face.vertexIds);
    const draggedVertexIds = new Set(initialDragVertexStates.map(v => v.id));
    const isRigidDrag = [...faceVertexIds].every(id => draggedVertexIds.has(id));

    if (isRigidDrag) {
        const previewSystem = JSON.parse(JSON.stringify(initialSystem));
        if (transformIndicatorData) {
            const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
            const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
            previewSystem.origin = U.applyTransformToVertex(initialSystem.origin, center, rotation, scale, directionalScale, startVector);
            
            if (directionalScale) {
                const p_unit_x_initial = U.localToGlobal({ x: 1, y: 0 }, initialSystem);
                const p_unit_x_final = U.applyTransformToVertex(p_unit_x_initial, center, rotation, scale, directionalScale, startVector);
                previewSystem.scale = U.distance(previewSystem.origin, p_unit_x_final);
            } else {
                previewSystem.angle = U.normalizeAngle(initialSystem.angle + rotation);
                previewSystem.scale = initialSystem.scale * scale;
            }
        } else {
            if (initialDragVertexStates.length > 0 && dragPreviewVertices.length > 0) {
                 const originalDraggedVertex = initialDragVertexStates.find(v => faceVertexIds.has(v.id));
                 const previewDraggedVertex = originalDraggedVertex ? dragPreviewVertices.find(v => v.id === originalDraggedVertex.id) : null;
                 if (previewDraggedVertex) {
                    const deltaX = previewDraggedVertex.x - originalDraggedVertex.x;
                    const deltaY = previewDraggedVertex.y - originalDraggedVertex.y;
                    previewSystem.origin.x += deltaX;
                    previewSystem.origin.y += deltaY;
                 }
            }
        }
        return previewSystem;
    }

    const liveVertices = face.vertexIds
        .map(id => dragPreviewVertices.find(p => p && p.id === id) || findVertexById(id))
        .filter(p => p && p.type === 'regular');

    if (!initialSystem.isCustom) {
        const incircle = U.calculateIncenter(liveVertices);
        if (incircle) {
            const rotation = transformIndicatorData ? transformIndicatorData.rotation : 0;
            return {
                ...initialSystem,
                origin: incircle.center,
                scale: incircle.radius,
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

        if (directionalScale) {
            const p_unit_x_initial = U.localToGlobal({ x: 1, y: 0 }, initialSystem);
            const p_unit_x_final = U.applyTransformToVertex(p_unit_x_initial, center, rotation, scale, directionalScale, startVector);
            previewSystem.scale = U.distance(previewSystem.origin, p_unit_x_final);
        } else {
            previewSystem.angle = U.normalizeAngle(initialSystem.angle + rotation);
            previewSystem.scale = initialSystem.scale * scale;
        }
    }

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

export function drawRigidDragPreview(ctx, params, dataToScreen) {
    const { copyCount, isDragConfirmed, initialDragVertexStates, dragPreviewVertices, transformIndicatorData, allEdges, allFaces, findVertexById, colors, snappedEdgesInfo, snappedVertexIds, edgeColorMode = 'fixed', faceColorMode = 'fixed', edgeColorExpression = 'x', edgeWeightExpression = 'r', faceColorExpression = 'x', faceColorPolarExpression = 'r', faceVertexWeightExpression = '1/(r+0.001)', faceEdgeWeightExpression = '1/(r+0.001)', angleDisplayMode = 'degrees', initialCoordSystemStates = new Map(), getInterpolationStyleById } = params;

    const isDeformingDrag = initialDragVertexStates.length === 1 && !transformIndicatorData && initialDragVertexStates[0].type === 'regular';
    if (!isDragConfirmed || !initialDragVertexStates.length || copyCount <= 0 || isDeformingDrag) {
        return;
    }

    const verticesToDraw = initialDragVertexStates.filter(p => p.type === 'regular');
    if (verticesToDraw.length === 0) return;

    const originalIds = new Set(verticesToDraw.map(p => p.id));
    const incidentEdges = allEdges.filter(edge => originalIds.has(edge.id1) && originalIds.has(edge.id2));
    const boundaryEdges = allEdges.filter(edge => (originalIds.has(edge.id1) && !originalIds.has(edge.id2)) || (originalIds.has(edge.id2) && !originalIds.has(edge.id1)));
    const affectedFaces = allFaces.filter(face => face.vertexIds.every(vId => originalIds.has(vId)));

    ctx.save();
    ctx.globalAlpha = 1.0;

    for (let i = 0; i < copyCount; i++) {
        i += copyCount == 1; // Added line

        // Loop condition i < copyCount is checked naturally at the start of the next iteration.

        const copyIndex = i;
        const positionMultiplier = i;

        let verticesForThisCopy;
        const currentIdMap = new Map();

        if (transformIndicatorData) {
            const { center, rotation, scale, directionalScale, startPos } = transformIndicatorData;
            const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
            verticesForThisCopy = verticesToDraw.map(p => {
                const newPos = U.applyTransformToVertex(p, center, rotation * positionMultiplier, Math.pow(scale, positionMultiplier), directionalScale, startVector);
                return { ...p, ...newPos, id: `preview_${p.id}_${copyIndex}`, originalId: p.id, transformIndex: copyIndex };
            });
        } else { // Translation
             // i now starts at 1 if copyCount is 1
             const deltaX_1x = dragPreviewVertices.length > 0 ? dragPreviewVertices[0].x - initialDragVertexStates[0].x : 0;
             const deltaY_1x = dragPreviewVertices.length > 0 ? dragPreviewVertices[0].y - initialDragVertexStates[0].y : 0;
             verticesForThisCopy = verticesToDraw.map(p => ({
                 ...p, x: p.x + deltaX_1x * positionMultiplier, y: p.y + deltaY_1x * positionMultiplier, id: `preview_${p.id}_${copyIndex}`, originalId: p.id, transformIndex: copyIndex
             }));
        }

        // It's possible i is now >= copyCount if copyCount was 1. Check before proceeding.
        if (!verticesForThisCopy || verticesForThisCopy.length === 0) continue;
        verticesForThisCopy.forEach(pv => currentIdMap.set(pv.originalId, pv));

        affectedFaces.forEach(face => { /* Draw faces */
            const faceVertices = face.vertexIds.map(id => currentIdMap.get(id)).filter(Boolean);
            if (faceVertices.length === face.vertexIds.length) {
                const faceStyle = face.interpolationStyleId && getInterpolationStyleById
                    ? getInterpolationStyleById(face.interpolationStyleId)
                    : null;
                const pathVertices = faceStyle
                    ? U.buildInterpolatedPath(faceVertices, faceStyle, true, dataToScreen)
                    : faceVertices;
                const faceVerticesScreen = pathVertices.map(v => dataToScreen(v));
                let faceToDraw = face;
                if (face.localCoordSystem) {
                    const initialSystem = initialCoordSystemStates.get(face.id) || face.localCoordSystem;
                    const previewSystem = calculatePreviewCoordSystem(face, { initialSystem, dragPreviewVertices, initialDragVertexStates, findVertexById, transformIndicatorData });
                    faceToDraw = { ...face, localCoordSystem: previewSystem };
                }
                drawFace(ctx, faceVerticesScreen, faceToDraw, colors, dataToScreen, findVertexById, allEdges, [], id => currentIdMap.get(id), false, null, {
                    faceColorMode: getFaceMode(face, faceColorMode),
                    edgeColorMode,
                    faceColorExpression,
                    faceColorPolarExpression,
                    edgeColorExpression,
                    edgeWeightExpression,
                    faceVertexWeightExpression,
                    faceEdgeWeightExpression,
                    angleDisplayMode
                });
            }
        });

        ctx.setLineDash([]);
        ctx.lineWidth = C.LINE_WIDTH;

        const fallbackColor = toRgba(colors.edge, { r: 255, g: 255, b: 255, a: 1 });
        const getVertexColor = (vertex) => toRgba(vertex?.color || colors.vertex || colors.edge, fallbackColor);
        const getEdgeColorAtT = (edge, t, v1, v2) => {
            const mode = getEdgeMode(edge, edgeColorMode);
            if (mode === 'inherit_vertices' && v1 && v2) {
                const c1 = getVertexColor(v1);
                const c2 = getVertexColor(v2);
                const expression = edge.weightExpression || edgeWeightExpression;
                const len = U.distance(v1, v2) || 1;
                const d1 = t * len;
                const d2 = (1 - t) * len;
                const d1Norm = d1 / len;
                const d2Norm = d2 / len;
                const w1 = U.evaluateExpression(expression, { x: 0, y: 0, r: d1Norm, a: 0 }, 1);
                const w2 = U.evaluateExpression(expression, { x: 0, y: 0, r: d2Norm, a: 0 }, 1);
                return mixColors([c1, c2], [w1, w2]);
            }
            if (mode === 'colormap' && edge.colormapItem) {
                const expression = edge.colorExpression || edgeColorExpression;
                const value = U.evaluateExpression(expression, { x: t }, t);
                const sampled = U.sampleColormap(edge.colormapItem, value);
                return toRgba(sampled, fallbackColor);
            }
            return toRgba(edge.color || colors.edge, fallbackColor);
        };

        const getRenderVertexById = (id) => currentIdMap.get(id) || findVertexById(id);
        incidentEdges.forEach(edge => { /* Draw incident edges + snaps */
            const p1 = currentIdMap.get(edge.id1); const p2 = currentIdMap.get(edge.id2);
            if (p1 && p2) {
                const edgeStyle = edge.interpolationStyleId && getInterpolationStyleById
                    ? getInterpolationStyleById(edge.interpolationStyleId)
                    : null;
                const pathPoints = buildInterpolatedEdgePath(edge, edgeStyle, p1, p2, allEdges, getRenderVertexById, dataToScreen);
                const pathScreen = pathPoints.map(pt => dataToScreen(pt));
                if (pathScreen.length < 2) return;
                const p1Screen = pathScreen[0];
                const p2Screen = pathScreen[pathScreen.length - 1];
                const mode = getEdgeMode(edge, edgeColorMode);
                if (mode === 'inherit_vertices' || mode === 'colormap') {
                    const c1 = getVertexColor(p1);
                    const c2 = getVertexColor(p2);
                    let totalLength = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        totalLength += Math.hypot(pathScreen[i].x - pathScreen[i - 1].x, pathScreen[i].y - pathScreen[i - 1].y);
                    }
                    let cursor = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        const segStart = pathScreen[i - 1];
                        const segEnd = pathScreen[i];
                        const segLength = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
                        const startT = totalLength > 0 ? cursor / totalLength : 0;
                        const endT = totalLength > 0 ? (cursor + segLength) / totalLength : 1;
                        const midT = (startT + endT) / 2;
                        const color = getEdgeColorAtT(edge, midT, p1, p2);
                        ctx.strokeStyle = toRgbaString(color);
                        ctx.beginPath();
                        ctx.moveTo(segStart.x, segStart.y);
                        ctx.lineTo(segEnd.x, segEnd.y);
                        ctx.stroke();
                        cursor += segLength;
                    }
                } else if (edge.colormapItem) {
                    let totalLength = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        totalLength += Math.hypot(pathScreen[i].x - pathScreen[i - 1].x, pathScreen[i].y - pathScreen[i - 1].y);
                    }
                    let cursor = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        const segStart = pathScreen[i - 1];
                        const segEnd = pathScreen[i];
                        const segLength = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
                        const startT = totalLength > 0 ? cursor / totalLength : 0;
                        const endT = totalLength > 0 ? (cursor + segLength) / totalLength : 1;
                        const midT = (startT + endT) / 2;
                        const t = edge.gradientStart + (edge.gradientEnd - edge.gradientStart) * midT;
                        const color = U.sampleColormap(edge.colormapItem, t);
                        ctx.strokeStyle = color;
                        ctx.beginPath();
                        ctx.moveTo(segStart.x, segStart.y);
                        ctx.lineTo(segEnd.x, segEnd.y);
                        ctx.stroke();
                        cursor += segLength;
                    }
                } else {
                    ctx.strokeStyle = edge.color || colors.edge;
                    ctx.beginPath();
                    ctx.moveTo(pathScreen[0].x, pathScreen[0].y);
                    for (let i = 1; i < pathScreen.length; i++) {
                        ctx.lineTo(pathScreen[i].x, pathScreen[i].y);
                    }
                    ctx.stroke();
                }
                const originalEdgeId = U.getEdgeId(edge);
                const snapEntries = snappedEdgesInfo?.get(originalEdgeId) || [];
                if (snapEntries.some(s => s.copyIndex === copyIndex)) { /* Draw snap glow */
                    ctx.save();
                    ctx.strokeStyle = colors.feedbackSnapped; ctx.globalAlpha = C.SELECTION_GLOW_ALPHA; ctx.lineWidth = C.SELECTION_GLOW_LINE_WIDTH;
                    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    const vecX = p2Screen.x - p1Screen.x; const vecY = p2Screen.y - p1Screen.y;
                    const mag = Math.hypot(vecX, vecY); const offsetDist = C.EDGE_GLOW_OFFSET_DISTANCE;
                    if (mag > C.GEOMETRY_CALCULATION_EPSILON) {
                        const normPerpX = -vecY / mag; const normPerpY = vecX / mag;
                        const offsetX = normPerpX * offsetDist; const offsetY = normPerpY * offsetDist;
                        ctx.beginPath();
                        ctx.arc(p1Screen.x, p1Screen.y, offsetDist, Math.atan2(offsetY, offsetX), Math.atan2(-offsetY, -offsetX));
                        ctx.lineTo(p2Screen.x - offsetX, p2Screen.y - offsetY);
                        ctx.arc(p2Screen.x, p2Screen.y, offsetDist, Math.atan2(-offsetY, -offsetX), Math.atan2(offsetY, offsetX));
                        ctx.closePath(); ctx.stroke();
                    } else { ctx.beginPath(); ctx.arc(p1Screen.x, p1Screen.y, offsetDist, 0, C.RADIANS_IN_CIRCLE); ctx.stroke(); }
                    ctx.restore();
                }
            }
        });
        boundaryEdges.forEach(edge => { /* Draw boundary edges + snaps */
            const staticVertexId = originalIds.has(edge.id1) ? edge.id2 : edge.id1;
            const originalDraggedVertexId = originalIds.has(edge.id1) ? edge.id1 : edge.id2;
            const p1_moving = currentIdMap.get(originalDraggedVertexId);
            const p2_static = findVertexById(staticVertexId);
            if (p1_moving && p2_static) {
                const edgeStyle = edge.interpolationStyleId && getInterpolationStyleById
                    ? getInterpolationStyleById(edge.interpolationStyleId)
                    : null;
                const pathPoints = buildInterpolatedEdgePath(edge, edgeStyle, p1_moving, p2_static, allEdges, getRenderVertexById, dataToScreen);
                const pathScreen = pathPoints.map(pt => dataToScreen(pt));
                if (pathScreen.length < 2) return;
                const p1Screen = pathScreen[0];
                const p2Screen = pathScreen[pathScreen.length - 1];
                const mode = getEdgeMode(edge, edgeColorMode);
                if (mode === 'inherit_vertices' || mode === 'colormap') {
                    const c1 = getVertexColor(p1_moving);
                    const c2 = getVertexColor(p2_static);
                    let totalLength = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        totalLength += Math.hypot(pathScreen[i].x - pathScreen[i - 1].x, pathScreen[i].y - pathScreen[i - 1].y);
                    }
                    let cursor = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        const segStart = pathScreen[i - 1];
                        const segEnd = pathScreen[i];
                        const segLength = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
                        const startT = totalLength > 0 ? cursor / totalLength : 0;
                        const endT = totalLength > 0 ? (cursor + segLength) / totalLength : 1;
                        const midT = (startT + endT) / 2;
                        const color = getEdgeColorAtT(edge, midT, p1_moving, p2_static);
                        ctx.strokeStyle = toRgbaString(color);
                        ctx.beginPath();
                        ctx.moveTo(segStart.x, segStart.y);
                        ctx.lineTo(segEnd.x, segEnd.y);
                        ctx.stroke();
                        cursor += segLength;
                    }
                } else if (edge.colormapItem) { /* Colormap logic */
                    let totalLength = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        totalLength += Math.hypot(pathScreen[i].x - pathScreen[i - 1].x, pathScreen[i].y - pathScreen[i - 1].y);
                    }
                    let cursor = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        const segStart = pathScreen[i - 1];
                        const segEnd = pathScreen[i];
                        const segLength = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
                        const startT = totalLength > 0 ? cursor / totalLength : 0;
                        const endT = totalLength > 0 ? (cursor + segLength) / totalLength : 1;
                        const midT = (startT + endT) / 2;
                        const t = edge.gradientStart + (edge.gradientEnd - edge.gradientStart) * midT;
                        const color = U.sampleColormap(edge.colormapItem, t);
                        ctx.strokeStyle = color;
                        ctx.beginPath();
                        ctx.moveTo(segStart.x, segStart.y);
                        ctx.lineTo(segEnd.x, segEnd.y);
                        ctx.stroke();
                        cursor += segLength;
                    }
                } else {
                    ctx.strokeStyle = edge.color || colors.edge;
                    ctx.beginPath();
                    ctx.moveTo(pathScreen[0].x, pathScreen[0].y);
                    for (let i = 1; i < pathScreen.length; i++) {
                        ctx.lineTo(pathScreen[i].x, pathScreen[i].y);
                    }
                    ctx.stroke();
                }
                const originalEdgeId = U.getEdgeId(edge);
                const snapEntries = snappedEdgesInfo?.get(originalEdgeId) || [];
                 if (snapEntries.some(s => s.copyIndex === copyIndex)) { /* Draw snap glow */
                     ctx.save();
                     ctx.strokeStyle = colors.feedbackSnapped; ctx.globalAlpha = C.SELECTION_GLOW_ALPHA; ctx.lineWidth = C.SELECTION_GLOW_LINE_WIDTH;
                     ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                     const vecX = p2Screen.x - p1Screen.x; const vecY = p2Screen.y - p1Screen.y;
                     const mag = Math.hypot(vecX, vecY); const offsetDist = C.EDGE_GLOW_OFFSET_DISTANCE;
                     if (mag > C.GEOMETRY_CALCULATION_EPSILON) {
                         const normPerpX = -vecY / mag; const normPerpY = vecX / mag;
                         const offsetX = normPerpX * offsetDist; const offsetY = normPerpY * offsetDist;
                         ctx.beginPath();
                         ctx.arc(p1Screen.x, p1Screen.y, offsetDist, Math.atan2(offsetY, offsetX), Math.atan2(-offsetY, -offsetX));
                         ctx.lineTo(p2Screen.x - offsetX, p2Screen.y - offsetY);
                         ctx.arc(p2Screen.x, p2Screen.y, offsetDist, Math.atan2(-offsetY, -offsetX), Math.atan2(offsetY, offsetX));
                         ctx.closePath(); ctx.stroke();
                     } else { ctx.beginPath(); ctx.arc(p1Screen.x, p1Screen.y, offsetDist, 0, C.RADIANS_IN_CIRCLE); ctx.stroke(); }
                     ctx.restore();
                 }
            }
        });

        verticesForThisCopy.forEach((vertex) => { /* Draw vertices + snaps */
             const originalVertexId = vertex.originalId;
             const snapEntries = snappedVertexIds.get(originalVertexId) || [];
             const isSnapped = snapEntries.some(s => s.copyIndex === copyIndex);
             const relevantSnap = snapEntries.find(s => s.copyIndex === copyIndex);
             const snapType = relevantSnap ? relevantSnap.type : null;
             drawVertexBaseOnly(ctx, vertex, { colors, verticesVisible: true, isSnapped: false }, dataToScreen);
             if (isSnapped) {
                 drawVertexGlowsOnly(ctx, vertex, {
                     selectedVertexIds: [], selectedCenterIds: [], activeCenterId: null, colors,
                     verticesVisible: true, isHovered: false, isSnapped: true, snapType: snapType, currentAltPressed: false
                 }, dataToScreen, () => {});
             }
        });
    }
    ctx.restore();
}

export function drawEdgeGlowsOnly(ctx, { allEdges, selectedEdgeIds, isDragConfirmed, dragPreviewVertices, colors, edgesVisible, snappedEdgeIds, previewVertices, currentCopyIndex, snappedEdgesInfo }, dataToScreen, findVertexById, getEdgeId) {
    ctx.save();
    ctx.globalAlpha = C.SELECTION_GLOW_ALPHA;
    ctx.lineWidth = C.LINE_WIDTH + C.EDGE_SELECTION_GLOW_WIDTH_OFFSET;

    // Glows for static/original edges
    allEdges.forEach(edge => {
        const edgeId = getEdgeId(edge);
        const isSelected = selectedEdgeIds.includes(edgeId);
        const isSnapped = snappedEdgeIds && snappedEdgeIds.has(edgeId) && snappedEdgeIds.get(edgeId).some(snap => snap.copyIndex === undefined || snap.copyIndex === 0); // Check for non-copy snaps

        if (edgesVisible || isSelected || isSnapped) { // Only process if potentially visible or highlighted
             let p1_orig = findVertexById(edge.id1);
             let p2_orig = findVertexById(edge.id2);
             if (!p1_orig || !p2_orig || p1_orig.type !== C.VERTEX_TYPE_REGULAR || p2_orig.type !== C.VERTEX_TYPE_REGULAR) return;

             let p1_render = { ...p1_orig };
             let p2_render = { ...p2_orig };

             if (isDragConfirmed && dragPreviewVertices.length > 0) {
                 const p1Preview = dragPreviewVertices.find(dp => dp.id === p1_orig.id);
                 const p2Preview = dragPreviewVertices.find(dp => dp.id === p2_orig.id);
                 if (p1Preview) { p1_render.x = p1Preview.x; p1_render.y = p1Preview.y; }
                 if (p2Preview) { p2_render.x = p2Preview.x; p2_render.y = p2Preview.y; }
             }

            if (isSelected || isSnapped) {
                const p1Screen = dataToScreen(p1_render);
                const p2Screen = dataToScreen(p2_render);
                ctx.beginPath();
                ctx.moveTo(p1Screen.x, p1Screen.y);
                ctx.lineTo(p2Screen.x, p2Screen.y);
                ctx.strokeStyle = isSnapped ? colors.feedbackSnapped : colors.selectionGlow;
                ctx.stroke();
            }
        }
    });

    // Glows for preview edges (if applicable)
    if (previewVertices && currentCopyIndex !== undefined) {
         const previewIdMap = new Map();
         previewVertices.forEach(pv => previewIdMap.set(pv.originalId || pv.id, pv));

        allEdges.forEach(originalEdge => {
             const p1_preview = previewIdMap.get(originalEdge.id1);
             const p2_preview = previewIdMap.get(originalEdge.id2);

             if (p1_preview && p2_preview) { // Check if this edge exists in the preview copy
                 const originalEdgeId = getEdgeId(originalEdge);
                 const snapEntries = snappedEdgesInfo?.get(originalEdgeId) || []; // Use snappedEdgesInfo passed in params
                 const isSnappedInPreview = snapEntries.some(s => s.copyIndex === currentCopyIndex);

                 if (isSnappedInPreview) { // Only draw glow if snapped
                     const p1Screen = dataToScreen(p1_preview);
                     const p2Screen = dataToScreen(p2_preview);
                     ctx.beginPath();
                     ctx.moveTo(p1Screen.x, p1Screen.y);
                     ctx.lineTo(p2Screen.x, p2Screen.y);
                     ctx.strokeStyle = colors.feedbackSnapped;
                     ctx.stroke();
                 }
             }
        });
    }


    ctx.restore();
}

export function drawVertexGlowsOnly(ctx, vertex, options, dataToScreen, updateHtmlLabel) {
    const { selectedVertexIds, selectedCenterIds, activeCenterId, colors, verticesVisible = true, isHovered = false, isSnapped = false, snapType = null, currentAltPressed } = options;

    if (currentAltPressed && isHovered) return;

    let isSelected;
    if (vertex.type === C.VERTEX_TYPE_REGULAR) {
        isSelected = selectedVertexIds.includes(vertex.id);
        if (!verticesVisible && !isSelected && !isHovered && !isSnapped) return;
    } else {
        isSelected = selectedCenterIds.includes(vertex.id);
    }

    const shouldGlow = isSelected || isHovered || isSnapped; // Simplified glow condition

    if (shouldGlow) {
        const screenPos = dataToScreen(vertex);
        ctx.save();
        let glowColor = colors.selectionGlow;
        if (vertex.id === activeCenterId && vertex.type !== 'regular') {
             glowColor = colors.activeCenterGlow;
        }
        else if (isSnapped) { // Use snap color if snapped
             glowColor = colors.feedbackSnapped;
        }
        else if (isHovered) {
             glowColor = colors.selectionGlow;
        }

        ctx.shadowColor = glowColor;
        ctx.shadowBlur = C.SELECTION_GLOW_BLUR_RADIUS;
        ctx.globalAlpha = C.SELECTION_GLOW_ALPHA;
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = C.SELECTION_GLOW_LINE_WIDTH;
        ctx.beginPath();
        let glowRadius;
        if (vertex.type === C.VERTEX_TYPE_REGULAR) {
            glowRadius = C.VERTEX_RADIUS + C.SELECTION_GLOW_RADIUS_OFFSET;
        } else {
            glowRadius = C.CENTER_POINT_VISUAL_RADIUS + C.SELECTION_GLOW_RADIUS_OFFSET;
        }
        ctx.arc(screenPos.x, screenPos.y, glowRadius, 0, C.RADIANS_IN_CIRCLE);
        ctx.stroke();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

export function drawDeformingDragPreview(ctx, params, dataToScreen) {
    const { copyCount = 1, initialDragVertexStates, dragPreviewVertices, allEdges, allFaces, findVertexById, findNeighbors, findAllVerticesInSubgraph, colors, snappedEdgesInfo, snappedVertexIds, edgeColorMode = 'fixed', faceColorMode = 'fixed', edgeColorExpression = 'x', edgeWeightExpression = 'r', faceColorExpression = 'x', faceColorPolarExpression = 'r', faceVertexWeightExpression = '1/(r+0.001)', faceEdgeWeightExpression = '1/(r+0.001)', angleDisplayMode = 'degrees', initialCoordSystemStates = new Map(), getInterpolationStyleById } = params;

    if (!initialDragVertexStates || initialDragVertexStates.length !== 1 || !dragPreviewVertices || dragPreviewVertices.length === 0) {
        return;
    }

    const originalVertex = initialDragVertexStates[0];

    for (let i = 0; i < copyCount; i++) {
        i += copyCount == 1;

        const copyIndex = i;
        const positionMultiplier = i;

        let currentPreviewVertexPos;
        const deltaX_1x = dragPreviewVertices.length > 0 ? dragPreviewVertices[0].x - initialDragVertexStates[0].x : 0;
        const deltaY_1x = dragPreviewVertices.length > 0 ? dragPreviewVertices[0].y - initialDragVertexStates[0].y : 0;
        currentPreviewVertexPos = {
            x: originalVertex.x + deltaX_1x * positionMultiplier,
            y: originalVertex.y + deltaY_1x * positionMultiplier
        };
        const previewVertexForCopy = { ...originalVertex, ...currentPreviewVertexPos, originalId: originalVertex.id, transformIndex: copyIndex };

        const componentVertexIds = new Set(findAllVerticesInSubgraph(originalVertex.id));
        const componentEdges = allEdges.filter(e => componentVertexIds.has(e.id1) && componentVertexIds.has(e.id2));
        const componentFaces = allFaces.filter(f => f.vertexIds.every(id => componentVertexIds.has(id)));

        const getLiveVertexForDeformCopy = (vertexId) => {
            if (vertexId === originalVertex.id) {
                return previewVertexForCopy;
            }
            if (componentVertexIds.has(vertexId)) {
                 return findVertexById(vertexId);
            }
            return null;
        };

        componentFaces.forEach(compFace => {
            const faceVerticesForPreview = compFace.vertexIds.map(getLiveVertexForDeformCopy).filter(Boolean);
            if (faceVerticesForPreview.length >= 3) {
                const faceStyle = compFace.interpolationStyleId && getInterpolationStyleById
                    ? getInterpolationStyleById(compFace.interpolationStyleId)
                    : null;
                const pathVertices = faceStyle
                    ? U.buildInterpolatedPath(faceVerticesForPreview, faceStyle, true, dataToScreen)
                    : faceVerticesForPreview;
                const screenVertices = pathVertices.map(v => dataToScreen(v));
                let faceToDraw = compFace;
                if (compFace.localCoordSystem) {
                    const initialSystem = initialCoordSystemStates.get(compFace.id) || compFace.localCoordSystem;
                    const previewSystem = calculatePreviewCoordSystem(compFace, { initialSystem, dragPreviewVertices, initialDragVertexStates, findVertexById, transformIndicatorData: null });
                    faceToDraw = { ...compFace, localCoordSystem: previewSystem };
                }
                drawFace(ctx, screenVertices, faceToDraw, colors, dataToScreen, findVertexById, allEdges, allFaces, getLiveVertexForDeformCopy, true, null, {
                    faceColorMode: getFaceMode(compFace, faceColorMode),
                    edgeColorMode,
                    faceColorExpression,
                    faceColorPolarExpression,
                    edgeColorExpression,
                    edgeWeightExpression,
                    faceVertexWeightExpression,
                    faceEdgeWeightExpression,
                    angleDisplayMode
                });
            }
        });

        ctx.save();
        ctx.lineWidth = C.LINE_WIDTH;
        ctx.setLineDash([]);
        const fallbackColor = toRgba(colors.edge, { r: 255, g: 255, b: 255, a: 1 });
        const getVertexColor = (vertex) => toRgba(vertex?.color || colors.vertex || colors.edge, fallbackColor);
        const getEdgeColorAtT = (edge, t, v1, v2) => {
            const mode = getEdgeMode(edge, edgeColorMode);
            if (mode === 'inherit_vertices' && v1 && v2) {
                const c1 = getVertexColor(v1);
                const c2 = getVertexColor(v2);
                const expression = edge.weightExpression || edgeWeightExpression;
                const len = U.distance(v1, v2) || 1;
                const d1 = t * len;
                const d2 = (1 - t) * len;
                const d1Norm = d1 / len;
                const d2Norm = d2 / len;
                const w1 = U.evaluateExpression(expression, { x: 0, y: 0, r: d1Norm, a: 0 }, 1);
                const w2 = U.evaluateExpression(expression, { x: 0, y: 0, r: d2Norm, a: 0 }, 1);
                return mixColors([c1, c2], [w1, w2]);
            }
            if (mode === 'colormap' && edge.colormapItem) {
                const expression = edge.colorExpression || edgeColorExpression;
                const value = U.evaluateExpression(expression, { x: t }, t);
                const sampled = U.sampleColormap(edge.colormapItem, value);
                return toRgba(sampled, fallbackColor);
            }
            return toRgba(edge.color || colors.edge, fallbackColor);
        };

        componentEdges.forEach(compEdge => {
            const p1 = getLiveVertexForDeformCopy(compEdge.id1);
            const p2 = getLiveVertexForDeformCopy(compEdge.id2);
            if (p1 && p2) {
                const edgeStyle = compEdge.interpolationStyleId && getInterpolationStyleById
                    ? getInterpolationStyleById(compEdge.interpolationStyleId)
                    : null;
                const getRenderVertexById = (id) => getLiveVertexForDeformCopy(id);
                const pathPoints = buildInterpolatedEdgePath(compEdge, edgeStyle, p1, p2, allEdges, getRenderVertexById, dataToScreen);
                const pathScreen = pathPoints.map(pt => dataToScreen(pt));
                if (pathScreen.length < 2) return;
                const p1Screen = pathScreen[0];
                const p2Screen = pathScreen[pathScreen.length - 1];

                const mode = getEdgeMode(compEdge, edgeColorMode);
                if (mode === 'inherit_vertices' || mode === 'colormap') {
                    let totalLength = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        totalLength += Math.hypot(pathScreen[i].x - pathScreen[i - 1].x, pathScreen[i].y - pathScreen[i - 1].y);
                    }
                    let cursor = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        const segStart = pathScreen[i - 1];
                        const segEnd = pathScreen[i];
                        const segLength = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
                        const startT = totalLength > 0 ? cursor / totalLength : 0;
                        const endT = totalLength > 0 ? (cursor + segLength) / totalLength : 1;
                        const midT = (startT + endT) / 2;
                        const color = getEdgeColorAtT(compEdge, midT, p1, p2);
                        ctx.strokeStyle = toRgbaString(color);
                        ctx.beginPath();
                        ctx.moveTo(segStart.x, segStart.y);
                        ctx.lineTo(segEnd.x, segEnd.y);
                        ctx.stroke();
                        cursor += segLength;
                    }
                } else if (compEdge.colormapItem) {
                    let totalLength = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        totalLength += Math.hypot(pathScreen[i].x - pathScreen[i - 1].x, pathScreen[i].y - pathScreen[i - 1].y);
                    }
                    let cursor = 0;
                    for (let i = 1; i < pathScreen.length; i++) {
                        const segStart = pathScreen[i - 1];
                        const segEnd = pathScreen[i];
                        const segLength = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
                        const startT = totalLength > 0 ? cursor / totalLength : 0;
                        const endT = totalLength > 0 ? (cursor + segLength) / totalLength : 1;
                        const midT = (startT + endT) / 2;
                        const t = compEdge.gradientStart + (compEdge.gradientEnd - compEdge.gradientStart) * midT;
                        const color = U.sampleColormap(compEdge.colormapItem, t);
                        ctx.strokeStyle = color;
                        ctx.beginPath();
                        ctx.moveTo(segStart.x, segStart.y);
                        ctx.lineTo(segEnd.x, segEnd.y);
                        ctx.stroke();
                        cursor += segLength;
                    }
                } else {
                    ctx.strokeStyle = compEdge.color || colors.edge;
                    ctx.beginPath();
                    ctx.moveTo(pathScreen[0].x, pathScreen[0].y);
                    for (let i = 1; i < pathScreen.length; i++) {
                        ctx.lineTo(pathScreen[i].x, pathScreen[i].y);
                    }
                    ctx.stroke();
                }

                const originalEdgeId = U.getEdgeId(compEdge);
                const snapEntries = snappedEdgesInfo?.get(originalEdgeId) || [];
                if (snapEntries.some(s => s.copyIndex === copyIndex)) {
                     ctx.save();
                     ctx.strokeStyle = colors.feedbackSnapped; ctx.globalAlpha = C.SELECTION_GLOW_ALPHA; ctx.lineWidth = C.SELECTION_GLOW_LINE_WIDTH;
                     ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    const vecX = p2Screen.x - p1Screen.x; const vecY = p2Screen.y - p1Screen.y;
                     const mag = Math.hypot(vecX, vecY); const offsetDist = C.EDGE_GLOW_OFFSET_DISTANCE;
                     if (mag > C.GEOMETRY_CALCULATION_EPSILON) {
                         const normPerpX = -vecY / mag; const normPerpY = vecX / mag;
                         const offsetX = normPerpX * offsetDist; const offsetY = normPerpY * offsetDist;
                         ctx.beginPath();
                         ctx.arc(p1Screen.x, p1Screen.y, offsetDist, Math.atan2(offsetY, offsetX), Math.atan2(-offsetY, -offsetX));
                         ctx.lineTo(p2Screen.x - offsetX, p2Screen.y - offsetY);
                         ctx.arc(p2Screen.x, p2Screen.y, offsetDist, Math.atan2(-offsetY, -offsetX), Math.atan2(offsetY, offsetX));
                         ctx.closePath(); ctx.stroke();
                     } else { ctx.beginPath(); ctx.arc(p1Screen.x, p1Screen.y, offsetDist, 0, C.RADIANS_IN_CIRCLE); ctx.stroke(); }
                     ctx.restore();
                 }
            }
        });
        ctx.restore();

        componentVertexIds.forEach(vertexId => {
            const vertex = getLiveVertexForDeformCopy(vertexId);
            if (!vertex) return;

            const isTheDraggedVertex = (vertexId === originalVertex.id);
            const snapEntries = snappedVertexIds.get(originalVertex.id) || [];
            const isSnapped = isTheDraggedVertex && snapEntries.some(s => s.copyIndex === copyIndex);
            const relevantSnap = isTheDraggedVertex ? snapEntries.find(s => s.copyIndex === copyIndex) : null;
            const snapType = relevantSnap ? relevantSnap.type : null;

            const vertexToDraw = { ...vertex, id: `preview_${vertex.originalId || vertex.id}_${copyIndex}`, originalId: vertex.originalId || vertex.id, transformIndex: copyIndex };

            drawVertexBaseOnly(ctx, vertexToDraw, { colors, verticesVisible: true, isSnapped: false }, dataToScreen);
            if (isSnapped) {
                drawVertexGlowsOnly(ctx, vertexToDraw, {
                    selectedVertexIds: [], selectedCenterIds: [], activeCenterId: null, colors,
                    verticesVisible: true, isHovered: false, isSnapped: true, snapType: snapType, currentAltPressed: false
                }, dataToScreen, () => {});
            }
        });
    }
}


export function drawDrawingPreview(ctx, { startVertex, snappedData, isShiftPressed, currentColor, nextCreationColor, nextEdgeColor, colors, edgeColormapInfo, interpolationStyle }, dataToScreen) {
    const startScreen = dataToScreen(startVertex);
    const targetScreen = dataToScreen(snappedData);

    // --- Draw Dashed Line ---
    ctx.save();
    let previewPath = [
        { x: startVertex.x, y: startVertex.y },
        { x: snappedData.x, y: snappedData.y }
    ];
    const shouldInterpolate = interpolationStyle && interpolationStyle.type && interpolationStyle.type !== 'linear';
    if (shouldInterpolate) {
        previewPath = U.buildInterpolatedPath(previewPath, interpolationStyle, false, null);
        ctx.setLineDash([]);
    } else {
        ctx.setLineDash(C.DASH_PATTERN);
    }

    if (edgeColormapInfo && edgeColormapInfo.colormapItem) {
        const gradient = ctx.createLinearGradient(startScreen.x, startScreen.y, targetScreen.x, targetScreen.y);
        const startColor = U.sampleColormap(edgeColormapInfo.colormapItem, edgeColormapInfo.startT);
        const endColor = U.sampleColormap(edgeColormapInfo.colormapItem, edgeColormapInfo.endT);
        gradient.addColorStop(0, startColor);
        gradient.addColorStop(1, endColor);
        ctx.strokeStyle = gradient;
    } else if (snappedData.snapped) {
        ctx.strokeStyle = colors.feedbackSnapped;
    } else if (isShiftPressed) { // Keep shift-line yellow even without snap if geometric construction is active
        ctx.strokeStyle = colors.feedbackSnapped;
    } else {
        ctx.strokeStyle = nextEdgeColor;
    }

    ctx.lineWidth = C.LINE_WIDTH;
    const previewScreen = previewPath.map(p => dataToScreen(p));
    ctx.beginPath();
    ctx.moveTo(previewScreen[0].x, previewScreen[0].y);
    for (let i = 1; i < previewScreen.length; i++) {
        ctx.lineTo(previewScreen[i].x, previewScreen[i].y);
    }
    ctx.stroke();
    ctx.restore();

    if (interpolationStyle?.linearStyle === 'arrows' && previewScreen.length >= 2) {
        const drawArrowHead = (from, to) => {
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const size = C.AXIS_ARROW_SIZE * 0.6;
            const left = {
                x: to.x - Math.cos(angle) * size + Math.cos(angle + Math.PI / 2) * size * 0.6,
                y: to.y - Math.sin(angle) * size + Math.sin(angle + Math.PI / 2) * size * 0.6
            };
            const right = {
                x: to.x - Math.cos(angle) * size + Math.cos(angle - Math.PI / 2) * size * 0.6,
                y: to.y - Math.sin(angle) * size + Math.sin(angle - Math.PI / 2) * size * 0.6
            };
            ctx.beginPath();
            ctx.moveTo(to.x, to.y);
            ctx.lineTo(left.x, left.y);
            ctx.lineTo(right.x, right.y);
            ctx.closePath();
            ctx.fill();
        };
        ctx.save();
        const from = previewScreen[previewScreen.length - 2];
        const to = previewScreen[previewScreen.length - 1];
        ctx.fillStyle = ctx.strokeStyle || nextEdgeColor;
        drawArrowHead(from, to);
        ctx.restore();
    }

    // --- Draw Target Vertex ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(targetScreen.x, targetScreen.y, C.VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);

    // Fill color: Yellow if snapped, otherwise assigned creation color
    if (snappedData.snapped) {
        ctx.fillStyle = colors.feedbackSnapped;
    } else {
        ctx.fillStyle = nextCreationColor;
    }
    ctx.fill();

    // Glow effect: Yellow ring ONLY for merge snaps (vertex, edge, edge_fraction)
    const isMergeSnap = snappedData.snapped && (snappedData.snapType === 'vertex' || snappedData.snapType === 'edge' || snappedData.snapType === 'edge_fraction');

    if (isMergeSnap) {
        ctx.shadowColor = colors.feedbackSnapped;
        ctx.shadowBlur = C.SELECTION_GLOW_BLUR_RADIUS;
        ctx.globalAlpha = C.SELECTION_GLOW_ALPHA;
        ctx.strokeStyle = colors.feedbackSnapped;
        ctx.lineWidth = C.SELECTION_GLOW_LINE_WIDTH;
        const glowRadius = C.VERTEX_RADIUS + C.SELECTION_GLOW_RADIUS_OFFSET;
        // Need to redraw the arc path for the stroke/shadow
        ctx.beginPath();
        ctx.arc(targetScreen.x, targetScreen.y, glowRadius, 0, C.RADIANS_IN_CIRCLE);
        ctx.stroke(); // Draw the glow ring
        // Reset shadow immediately after drawing glow, before restoring context
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }
    ctx.restore();
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
        if (tickAlpha < C.POLAR_REF_TICK_ALPHA_THRESHOLD) return;

        const screenSeparation = screenRadius * (level.angle * Math.PI / 180);
        
        if (screenSeparation < C.REF_CIRCLE_MIN_TICK_SPACING * 0.5) return;

        const finalColor = `rgba(${colors.feedbackDefault.join(',')}, ${tickAlpha * C.POLAR_REF_TICK_LABEL_ALPHA_FACTOR})`;

        let anglesToProcess;
        if (visibleAngleRange.isFullCircle) {
            anglesToProcess = [];
            for (let deg = 0; deg < 360; deg += level.angle) {
                anglesToProcess.push(deg);
            }
        } else {
            anglesToProcess = [];
            if (visibleAngleRange.ranges && Array.isArray(visibleAngleRange.ranges)) {
                visibleAngleRange.ranges.forEach(range => {
                    const [minAngle, maxAngle] = range;
                    const rangeAngles = generateOptimizedAngleSequence(level.angle, minAngle, maxAngle);
                    anglesToProcess.push(...rangeAngles);
                });
            } else if (visibleAngleRange.minAngle !== undefined && visibleAngleRange.maxAngle !== undefined) {
                anglesToProcess = generateOptimizedAngleSequence(level.angle, visibleAngleRange.minAngle, visibleAngleRange.maxAngle);
            }
            anglesToProcess = [...new Set(anglesToProcess)];
        }

        anglesToProcess.forEach(deg => {
            deg = Math.round(deg * 1e10) / 1e10;
            
            if (angleDisplayMode === 'degrees') {
                if (drawnAnglesSimple.has(deg)) return;
            }
            else if (angleDisplayMode === 'radians') {
                const levelKey = `${deg}-${level.angle}`;
                if (drawnAnglesComplex.has(levelKey)) return;
            }

            const angleRad = deg * Math.PI / 180;
            
            const labelPos = { 
                x: originScreen.x + (screenRadius + C.REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN) * Math.cos(angleRad), 
                y: originScreen.y - (screenRadius + C.REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN) * Math.sin(angleRad) 
            };
            
            const labelMargin = C.POLAR_REF_LABEL_MARGIN;
            const isLabelVisible = labelPos.x > -labelMargin && labelPos.x < canvasWidthCSS + labelMargin && 
                                   labelPos.y > -labelMargin && labelPos.y < canvasHeightCSS + labelMargin;
            
            if (!isLabelVisible) {
                return;
            }
            
            let labelOptions = { textAlign: 'center', textBaseline: 'middle' };
            
            if (angleDisplayMode === 'radians') {
                labelOptions = { textAlign: 'left', textBaseline: 'middle' };
            }

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

                ctx.lineWidth = C.POLAR_REF_LINE_WIDTH;
                ctx.beginPath();
                ctx.moveTo(vertexOnCircle.x, vertexOnCircle.y);
                ctx.lineTo(tickEnd.x, tickEnd.y);
                ctx.stroke();
                
                labelPos.x = tickEnd.x;
                labelPos.y = tickEnd.y;

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
            }
            
            ctx.restore();
            
            let angleText = '';
            if (angleDisplayMode === 'degrees') {
                let precision = Math.max(0, (level.angle.toString().split('.')[1] || '').length);
                
                if (level.angle < 1) {
                    precision = Math.max(precision, Math.ceil(-Math.log10(level.angle)) + 1);
                }
                
                const cleanDeg = Math.round(deg * Math.pow(10, precision)) / Math.pow(10, precision);
                const formattedDeg = parseFloat(cleanDeg.toFixed(precision));
                
                const displayValue = Math.round(formattedDeg * 1e10) / 1e10;
                angleText = `${displayValue}^{\\circ}`;
            } else {
                if (deg === 0 && angleDisplayMode === 'radians') {
                    angleText = '0';
                } else if (deg !== 0) {
                    const isFineTick = level.angle <= 5;
                    
                    if (isFineTick) {
                        const radianValue = deg * Math.PI / 180;
                        
                        const levelAnglePrecision = Math.max(0, (level.angle.toString().split('.')[1] || '').length);
                        const radianPrecision = Math.max(3, levelAnglePrecision + 2);
                        
                        let formattedRadian = radianValue.toFixed(radianPrecision);
                        formattedRadian = parseFloat(formattedRadian).toString();
                        
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
        
        if (intersections.length > 0) {
            let largestVisibleAngle = -Infinity;
            
            intersections.forEach(p => {
                const angle = Math.atan2(originScreen.y - p.y, p.x - originScreen.x);
                const normalizedAngle = angle >= 0 ? angle : angle + 2 * Math.PI;
                
                const testPoint = { 
                    x: originScreen.x + screenRadius * Math.cos(normalizedAngle), 
                    y: originScreen.y - screenRadius * Math.sin(normalizedAngle) 
                };
                
                const margin = C.AXIS_LABEL_PADDING;
                const isVisible = testPoint.x > -margin && testPoint.x < canvasWidthCSS + margin && 
                                 testPoint.y > -margin && testPoint.y < canvasHeightCSS + margin;
                
                if (isVisible && normalizedAngle > largestVisibleAngle) {
                    largestVisibleAngle = normalizedAngle;
                }
            });
            
            const corners = [{x:0,y:0}, {x:screenRect.w,y:0}, {x:screenRect.w,y:screenRect.h}, {x:0,y:screenRect.h}];
            corners.forEach(c => {
                if (U.distance(c, originScreen) < circle.r) {
                    const angle = Math.atan2(originScreen.y - c.y, c.x - originScreen.x);
                    const normalizedAngle = angle >= 0 ? angle : angle + 2 * Math.PI;
                    
                    const testPoint = { 
                        x: originScreen.x + screenRadius * Math.cos(normalizedAngle), 
                        y: originScreen.y - screenRadius * Math.sin(normalizedAngle) 
                    };
                    
                    const margin = C.AXIS_LABEL_PADDING;
                    const isVisible = testPoint.x > -margin && testPoint.x < canvasWidthCSS + margin && 
                                     testPoint.y > -margin && testPoint.y < canvasHeightCSS + margin;
                    
                    if (isVisible && normalizedAngle > largestVisibleAngle) {
                        largestVisibleAngle = normalizedAngle;
                    }
                }
            });
            
            if (largestVisibleAngle > -Infinity) {
                stickyArrowAngle = largestVisibleAngle;
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
    
    const circleForUtils = { center: { x: cx, y: cy }, radius: r };
    
    const checkLine = (x1, y1, x2, y2) => {
        const line = { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
        const points = U.getLineCircleIntersection(line, circleForUtils);
        
        points.forEach(point => {
            const dx = x2 - x1;
            const dy = y2 - y1;
            
            let t;
            if (Math.abs(dx) > Math.abs(dy)) {
                t = (point.x - x1) / dx;
            } else {
                t = (point.y - y1) / dy;
            }
            
            if (t >= 0 && t <= 1) {
                intersections.push({ x: point.x, y: point.y });
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
                const startMultiplier = 1;
                const endMultiplier = Math.ceil(maxRadiusData / interval);
                
                for (let i = startMultiplier; i <= endMultiplier; i++) {
                    const r_data = i * interval;
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
                const startMultiplierX = Math.floor(topLeftData.x / interval);
                const endMultiplierX = Math.ceil(bottomRightData.x / interval);
                const startMultiplierY = Math.floor(bottomRightData.y / interval);
                const endMultiplierY = Math.ceil(topLeftData.y / interval);
                
                for (let i = startMultiplierX; i <= endMultiplierX; i++) {
                    const x_data = i * interval;
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
                
                for (let i = startMultiplierY; i <= endMultiplierY; i++) {
                    const y_data = i * interval;
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

        // Check if scientific notation should be used for ANY visible value
        let useScientific = false;
        const checkScientific = (val) => {
            const absValue = Math.abs(val);
            if (absValue >= C.SCIENTIFIC_NOTATION_UPPER_BOUND || (absValue > 0 && absValue < C.SCIENTIFIC_NOTATION_LOWER_BOUND)) {
                useScientific = true;
            }
        };
        
        // Check all axis tick values
        drawnXPositions.forEach((_, x_data) => checkScientific(x_data));
        drawnYPositions.forEach((_, y_data) => checkScientific(y_data));
        
        // Also check the current viewport bounds to ensure mouse coordinates will be consistent
        const topLeftData = screenToData({ x: 0, y: 0 });
        const bottomRightData = screenToData({ x: canvasWidth, y: canvasHeight });
        checkScientific(topLeftData.x);
        checkScientific(topLeftData.y);
        checkScientific(bottomRightData.x);
        checkScientific(bottomRightData.y);
        
        // Calculate decimal places based on the primary interval
        const primaryInterval = interval1 || interval2 || 1;
        const decimalPlaces = primaryInterval > 0 ? Math.max(0, -Math.floor(Math.log10(primaryInterval))) : 0;
        
        drawnXPositions.forEach((tickInfo, x_data) => {
            const effectiveAlpha = tickInfo.isCoarser ? 1.0 : tickInfo.alpha;
            const tickLabelColor = `rgba(${colors.axisTickLabel.join(',')}, ${C.AXIS_TICK_LABEL_ALPHA * effectiveAlpha})`;
            ctx.strokeStyle = tickLabelColor;
            ctx.lineWidth = C.GRID_LINEWIDTH;
            
            if (isPolar) {
                let labelText;
                if (useScientific) {
                    // Calculate how many decimal places needed in scientific notation coefficient
                    // to distinguish between consecutive tick values
                    const logValue = Math.log10(Math.abs(x_data));
                    const exponent = Math.floor(logValue);
                    const coefficient = x_data / Math.pow(10, exponent);
                    
                    // Determine precision needed based on tick interval
                    const intervalInSameScale = primaryInterval / Math.pow(10, exponent);
                    const decimalPlacesNeeded = Math.max(0, -Math.floor(Math.log10(intervalInSameScale)) + 1);
                    
                    const expStr = Math.abs(x_data).toExponential(decimalPlacesNeeded);
                    const parts = expStr.split('e');
                    let coefficientStr = parts[0];
                    let exp = parseInt(parts[1], 10);
                    const sign = x_data < 0 ? "-" : "";
                    labelText = `${sign}${coefficientStr} \\cdot 10^{${exp}}`;
                } else {
                    labelText = x_data.toFixed(decimalPlaces).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
                }
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
                
                let tickLabel;
                if (useScientific) {
                    // Calculate precision needed for scientific notation
                    const logValue = Math.log10(Math.abs(x_data));
                    const exponent = Math.floor(logValue);
                    
                    // Determine precision needed based on tick interval
                    const intervalInSameScale = primaryInterval / Math.pow(10, exponent);
                    const decimalPlacesNeeded = Math.max(0, -Math.floor(Math.log10(intervalInSameScale)) + 1);
                    
                    const expStr = Math.abs(x_data).toExponential(decimalPlacesNeeded);
                    const parts = expStr.split('e');
                    let coefficientStr = parts[0];
                    // Remove trailing zeros from coefficient
                    coefficientStr = coefficientStr.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
                    let exp = parseInt(parts[1], 10);
                    const sign = x_data < 0 ? "-" : "";
                    tickLabel = `${sign}${coefficientStr} \\cdot 10^{${exp}}`;
                } else {
                    tickLabel = x_data.toFixed(decimalPlaces).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
                }
                
                const getStableId = (prefix, num) => `${prefix}-${num.toExponential(15)}`;
                updateHtmlLabel({ 
                    id: getStableId('tick-label-x', x_data), 
                    content: tickLabel, 
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
                
                const screenY = dataToScreen({ x: 0, y: y_data }).y;
                let yLabelContent;
                if (useScientific) {
                    // Calculate precision needed for scientific notation
                    const logValue = Math.log10(Math.abs(y_data));
                    const exponent = Math.floor(logValue);
                    
                    // Determine precision needed based on tick interval
                    const intervalInSameScale = primaryInterval / Math.pow(10, exponent);
                    const decimalPlacesNeeded = Math.max(0, -Math.floor(Math.log10(intervalInSameScale)) + 1);
                    
                    const expStr = Math.abs(y_data).toExponential(decimalPlacesNeeded);
                    const parts = expStr.split('e');
                    let coefficientStr = parts[0];
                    // Remove trailing zeros from coefficient
                    coefficientStr = coefficientStr.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
                    let exp = parseInt(parts[1], 10);
                    const sign = y_data < 0 ? "-" : "";
                    yLabelContent = `${sign}${coefficientStr} \\cdot 10^{${exp}}`;
                } else {
                    yLabelContent = y_data.toFixed(decimalPlaces).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
                }
                
                if (coordsDisplayMode === C.COORDS_DISPLAY_MODE_COMPLEX && Math.abs(y_data) > C.GEOMETRY_CALCULATION_EPSILON) {
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
        return { useScientific };
    };

    ctx.lineWidth = C.AXIS_LINE_WIDTH;
    ctx.strokeStyle = colors.axis;
    ctx.fillStyle = colors.axis;

    let formatInfo = { useScientific: false };
    if (coordsDisplayMode === C.COORDS_DISPLAY_MODE_POLAR) {
        const { interval1, interval2, alpha1, alpha2 } = lastGridState;
        
        // Draw polar axis lines with arrows and labels
        drawPolarAxisLines(ctx, htmlOverlay, { canvas, dpr, colors }, dataToScreen, updateHtmlLabel);
        
        // Calculate scientific notation decision for consistency
        let useScientific = false;
        const checkScientific = (val) => {
            const absValue = Math.abs(val);
            if (absValue >= C.SCIENTIFIC_NOTATION_UPPER_BOUND || (absValue > 0 && absValue < C.SCIENTIFIC_NOTATION_LOWER_BOUND)) {
                useScientific = true;
            }
        };
        
        // Check viewport bounds for scientific notation decision
        const topLeftData = screenToData({ x: 0, y: 0 });
        const bottomRightData = screenToData({ x: canvasWidth, y: canvasHeight });
        checkScientific(topLeftData.x);
        checkScientific(topLeftData.y);
        checkScientific(bottomRightData.x);
        checkScientific(bottomRightData.y);
        
        // Draw polar radius ticks and labels
        drawPolarRadiusTicks(ctx, htmlOverlay, { canvas, dpr, colors }, dataToScreen, screenToData, lastGridState, updateHtmlLabel, useScientific);
        
        // Draw polar reference circles (angle ticks)
        drawPolarReferenceCircle(ctx, htmlOverlay, updateHtmlLabel, 0, 0, { canvas, dpr, coordsDisplayMode, viewTransform, angleDisplayMode, colors }, dataToScreen, lastAngularGridState);
        
        formatInfo = { useScientific };
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
        
        formatInfo = drawTicksAndLabels(lastGridState.interval1, lastGridState.alpha1, lastGridState.interval2, lastGridState.alpha2, false);
    }

    drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel, colors);

    ctx.restore();
    return formatInfo;
}

export function drawPolarRadiusTicks(ctx, htmlOverlay, { canvas, dpr, colors }, dataToScreen, screenToData, lastGridState, updateHtmlLabel, useScientific) {
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;
    const origin = dataToScreen({ x: 0, y: 0 });
    
    // Check if origin axes are visible on screen
    const isYAxisOnScreen = origin.y > -C.AXIS_LABEL_PADDING && origin.y < canvasHeight + C.AXIS_LABEL_PADDING;
    const isXAxisOnScreen = origin.x > -C.AXIS_LABEL_PADDING && origin.x < canvasWidth + C.AXIS_LABEL_PADDING;
    
    // Early exit if no axes are visible
    if (!isYAxisOnScreen && !isXAxisOnScreen) {
        return;
    }
    
    const { interval1, interval2, alpha1, alpha2 } = lastGridState;
    const drawnRadiusPositions = new Map();
    
    // Calculate decimal places based on the primary interval
    const primaryInterval = interval1 || interval2 || 1;
    const decimalPlaces = primaryInterval > 0 ? Math.max(0, -Math.floor(Math.log10(primaryInterval))) : 0;
    
    const addTicksForInterval = (interval, alpha, isCoarser) => {
        if (!interval || alpha < C.MIN_ALPHA_FOR_DRAWING) return;
        
        // Calculate only the radius range that could be visible on the current axes
        let maxRadius = 0;
        
        if (isYAxisOnScreen) {
            // Check X-axis visibility range
            const leftData = screenToData({ x: 0, y: origin.y });
            const rightData = screenToData({ x: canvasWidth, y: origin.y });
            maxRadius = Math.max(maxRadius, Math.abs(leftData.x), Math.abs(rightData.x));
        }
        
        if (isXAxisOnScreen) {
            // Check Y-axis visibility range  
            const topData = screenToData({ x: origin.x, y: 0 });
            const bottomData = screenToData({ x: origin.x, y: canvasHeight });
            maxRadius = Math.max(maxRadius, Math.abs(topData.y), Math.abs(bottomData.y));
        }
        
        // Add small buffer
        maxRadius *= 1.1;
        
        const startMultiplier = 1;
        const endMultiplier = Math.ceil(maxRadius / interval);
        
        // Limit calculations to prevent performance issues
        const maxCalculations = 1000;
        const actualEndMultiplier = Math.min(endMultiplier, startMultiplier + maxCalculations);
        
        for (let i = startMultiplier; i <= actualEndMultiplier; i++) {
            const r_data = i * interval;
            
            // Check if any tick for this radius will be visible
            let willBeVisible = false;
            
            if (isYAxisOnScreen) {
                const xPos = dataToScreen({ x: r_data, y: 0 }).x;
                const xNegPos = dataToScreen({ x: -r_data, y: 0 }).x;
                if ((xPos >= -C.AXIS_LABEL_PADDING && xPos <= canvasWidth + C.AXIS_LABEL_PADDING) ||
                    (xNegPos >= -C.AXIS_LABEL_PADDING && xNegPos <= canvasWidth + C.AXIS_LABEL_PADDING)) {
                    willBeVisible = true;
                }
            }
            
            if (!willBeVisible && isXAxisOnScreen) {
                const yPos = dataToScreen({ x: 0, y: r_data }).y;
                const yNegPos = dataToScreen({ x: 0, y: -r_data }).y;
                if ((yPos >= -C.AXIS_LABEL_PADDING && yPos <= canvasHeight + C.AXIS_LABEL_PADDING) ||
                    (yNegPos >= -C.AXIS_LABEL_PADDING && yNegPos <= canvasHeight + C.AXIS_LABEL_PADDING)) {
                    willBeVisible = true;
                }
            }
            
            // Only add if it will be visible
            if (willBeVisible) {
                const existing = drawnRadiusPositions.get(r_data);
                if (!existing) {
                    drawnRadiusPositions.set(r_data, { alpha, isCoarser });
                } else if (isCoarser) {
                    drawnRadiusPositions.set(r_data, { alpha: Math.max(existing.alpha, alpha), isCoarser: true });
                } else {
                    if (!existing.isCoarser) {
                        drawnRadiusPositions.set(r_data, { alpha: Math.max(existing.alpha, alpha), isCoarser: false });
                    }
                }
            }
        }
    };
    
    const interval1IsCoarser = !interval2 || interval1 >= interval2;
    addTicksForInterval(interval1, alpha1, interval1IsCoarser);
    addTicksForInterval(interval2, alpha2, !interval1IsCoarser);
    
    // Draw radius ticks and labels
    drawnRadiusPositions.forEach((tickInfo, r_data) => {
        const effectiveAlpha = tickInfo.isCoarser ? 1.0 : tickInfo.alpha;
        const tickLabelColor = `rgba(${colors.axisTickLabel.join(',')}, ${C.AXIS_TICK_LABEL_ALPHA * effectiveAlpha})`;
        ctx.strokeStyle = tickLabelColor;
        ctx.lineWidth = C.GRID_LINEWIDTH;
        
        // Format the label text
        let labelText;
        if (useScientific) {
            const logValue = Math.log10(Math.abs(r_data));
            const exponent = Math.floor(logValue);
            const intervalInSameScale = primaryInterval / Math.pow(10, exponent);
            const decimalPlacesNeeded = Math.max(0, -Math.floor(Math.log10(intervalInSameScale)) + 1);
            
            const expStr = Math.abs(r_data).toExponential(decimalPlacesNeeded);
            const parts = expStr.split('e');
            let coefficientStr = parts[0];
            coefficientStr = coefficientStr.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
            let exp = parseInt(parts[1], 10);
            const sign = r_data < 0 ? "-" : "";
            labelText = `${sign}${coefficientStr} \\cdot 10^{${exp}}`;
        } else {
            labelText = r_data.toFixed(decimalPlaces).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
        }
        
        const stableIdPart = r_data.toExponential(15);

        // Draw ticks on X-axis (only if Y axis is visible)
        if (isYAxisOnScreen) {
            const pX = dataToScreen({ x: r_data, y: 0 });
            if (pX.x > -C.AXIS_LABEL_PADDING && pX.x < canvasWidth + C.AXIS_LABEL_PADDING) {
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
            
            const pNegX = dataToScreen({ x: -r_data, y: 0 });
            if (pNegX.x > -C.AXIS_LABEL_PADDING && pNegX.x < canvasWidth + C.AXIS_LABEL_PADDING) {
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
        }
        
        // Draw ticks on Y-axis (only if X axis is visible)
        if (isXAxisOnScreen) {
            const pPosY = dataToScreen({ x: 0, y: r_data });
            if (pPosY.y > -C.AXIS_LABEL_PADDING && pPosY.y < canvasHeight + C.AXIS_LABEL_PADDING) {
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
            
            const pNegY = dataToScreen({ x: 0, y: -r_data });
            if (pNegY.y > -C.AXIS_LABEL_PADDING && pNegY.y < canvasHeight + C.AXIS_LABEL_PADDING) {
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
        }
    });
}

export function drawPolarAxisLines(ctx, htmlOverlay, { canvas, dpr, colors }, dataToScreen, updateHtmlLabel) {
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
}

export function drawPolarGrid(ctx, { canvas, dpr, colors, gridAlpha }, origin, maxDataRadius, viewTransform, lastGridState, lastAngularGridState) {
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;
    const transitionRadius = Math.min(canvasWidth, canvasHeight) * C.POLAR_TO_LINE_TRANSITION_RADIUS_FACTOR;

    let minViewRadius, maxViewRadius;
    if (origin.x >= 0 && origin.x <= canvasWidth && origin.y >= 0 && origin.y <= canvasHeight) {
        minViewRadius = 0;
    } else {
        const distances = [
            U.distanceToSegment(origin.x, origin.y, 0, 0, canvasWidth, 0),
            U.distanceToSegment(origin.x, origin.y, canvasWidth, 0, canvasWidth, canvasHeight),
            U.distanceToSegment(origin.x, origin.y, canvasWidth, canvasHeight, 0, canvasHeight),
            U.distanceToSegment(origin.x, origin.y, 0, canvasHeight, 0, 0)
        ];
        minViewRadius = Math.min(...distances);
    }
    
    const corners = [
        { x: 0, y: 0 },
        { x: canvasWidth, y: 0 },
        { x: canvasWidth, y: canvasHeight },
        { x: 0, y: canvasHeight }
    ];
    
    const cornerDistances = corners.map(corner => 
        Math.sqrt((corner.x - origin.x) ** 2 + (corner.y - origin.y) ** 2)
    );
    
    maxViewRadius = Math.max(...cornerDistances);

    const minViewRadiusData = minViewRadius * dpr / viewTransform.scale;
    const maxViewRadiusData = maxViewRadius * dpr / viewTransform.scale;

    const drawPolarCircles = (interval, alpha) => {
        if (!interval || alpha < C.MIN_ALPHA_FOR_DRAWING) return;
        
        const screenSpacing = interval * viewTransform.scale / dpr;
        if (screenSpacing < C.GRID_POLAR_CIRCLE_MIN_SPACING) return;

        ctx.strokeStyle = `rgba(${colors.grid.join(',')}, ${alpha * gridAlpha})`;
        ctx.lineWidth = C.GRID_LINEWIDTH;
        
        const startMultiplier = minViewRadiusData === 0 ? 1 : Math.ceil(minViewRadiusData / interval);
        const endMultiplier = Math.floor(maxViewRadiusData / interval);
        
        for (let i = startMultiplier; i <= endMultiplier; i++) {
            const r = i * interval;
            const screenRadius = r * viewTransform.scale / dpr;
            
            if (screenRadius > transitionRadius) {
                const intersections = [];
                const circle = { center: { x: origin.x, y: origin.y }, radius: screenRadius };
                
                const edges = [
                    { p1: { x: 0, y: 0 }, p2: { x: canvasWidth, y: 0 } },
                    { p1: { x: canvasWidth, y: 0 }, p2: { x: canvasWidth, y: canvasHeight } },
                    { p1: { x: canvasWidth, y: canvasHeight }, p2: { x: 0, y: canvasHeight } },
                    { p1: { x: 0, y: canvasHeight }, p2: { x: 0, y: 0 } }
                ];
                
                edges.forEach(edge => {
                    const edgeIntersections = U.getLineCircleIntersection(edge, circle);
                    edgeIntersections.forEach(point => {
                        if (point.x >= 0 && point.x <= canvasWidth && point.y >= 0 && point.y <= canvasHeight) {
                            intersections.push(point);
                        }
                    });
                });
                
                if (intersections.length >= 2) {
                    let p1 = intersections[0], p2 = intersections[1], maxDistSq = 0;
                    for (let j = 0; j < intersections.length; j++) {
                        for (let k = j + 1; k < intersections.length; k++) {
                            const dSq = (intersections[j].x - intersections[k].x)**2 + (intersections[j].y - intersections[k].y)**2;
                            if (dSq > maxDistSq) {
                                maxDistSq = dSq;
                                p1 = intersections[j];
                                p2 = intersections[k];
                            }
                        }
                    }
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            } else {
                ctx.beginPath();
                ctx.arc(origin.x, origin.y, screenRadius, 0, C.RADIANS_IN_CIRCLE);
                ctx.stroke();
            }
        }
    };

    drawPolarCircles(lastGridState.interval1, lastGridState.alpha1);
    drawPolarCircles(lastGridState.interval2, lastGridState.alpha2);

    if (!lastAngularGridState || !Array.isArray(lastAngularGridState)) {
        return;
    }

    const screenCenter = { x: canvasWidth / 2, y: canvasHeight / 2 };
    const baseRadius = Math.min(canvasWidth, canvasHeight) / 4;
    const panDistance = Math.sqrt((origin.x - screenCenter.x) ** 2 + (origin.y - screenCenter.y) ** 2);
    const spokeReferenceRadius = baseRadius + panDistance;

    if (spokeReferenceRadius < C.REF_CIRCLE_MIN_DISPLAY_RADIUS || !isCircleInView(origin.x, origin.y, spokeReferenceRadius, canvasWidth, canvasHeight)) {
        return;
    }

    const isLineMode = spokeReferenceRadius > transitionRadius;
    let visibleAngleRange = null;

    if (isLineMode) {
        const screenRect = { x: 0, y: 0, w: canvasWidth, h: canvasHeight };
        const circle = { x: origin.x, y: origin.y, r: spokeReferenceRadius };
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
            const angle1 = (Math.atan2(origin.y - p1.y, p1.x - origin.x) * 180 / Math.PI + 360) % 360;
            const angle2 = (Math.atan2(origin.y - p2.y, p2.x - origin.x) * 180 / Math.PI + 360) % 360;
            visibleAngleRange = { minAngle: Math.min(angle1, angle2), maxAngle: Math.max(angle1, angle2), isFullCircle: false };
            if (Math.abs(angle1 - angle2) > 180) {
                visibleAngleRange = { minAngle: Math.max(angle1, angle2), maxAngle: Math.min(angle1, angle2) + 360, isFullCircle: false };
            }
        }
    } else {
        visibleAngleRange = calculateVisibleAngleRange(origin, spokeReferenceRadius, canvasWidth, canvasHeight);
    }
    
    if (!visibleAngleRange) return;

    const drawnAngles = new Set();

    lastAngularGridState.forEach(level => {
        const tickAlpha = level.alpha;
        if (tickAlpha < C.POLAR_REF_TICK_ALPHA_THRESHOLD) return;

        const screenSeparation = spokeReferenceRadius * (level.angle * Math.PI / 180);
        if (screenSeparation < C.REF_CIRCLE_MIN_TICK_SPACING * 0.5) return;

        ctx.strokeStyle = `rgba(${colors.grid.join(',')}, ${tickAlpha * gridAlpha})`;
        ctx.lineWidth = C.GRID_LINEWIDTH * C.POLAR_GRID_SPOKE_WIDTH_FACTOR;

        let anglesToProcess;
        if (visibleAngleRange.isFullCircle) {
            anglesToProcess = [];
            for (let deg = 0; deg < 360; deg += level.angle) {
                anglesToProcess.push(deg);
            }
        } else {
            anglesToProcess = [];
            if (visibleAngleRange.ranges && Array.isArray(visibleAngleRange.ranges)) {
                visibleAngleRange.ranges.forEach(range => {
                    let [minAngle, maxAngle] = range;
                    
                    if (isLineMode) {
                        const corners = [
                            { x: 0, y: 0 },
                            { x: canvasWidth, y: 0 },
                            { x: canvasWidth, y: canvasHeight },
                            { x: 0, y: canvasHeight }
                        ];
                        
                        const cornerAngles = corners.map(corner => {
                            return (Math.atan2(origin.y - corner.y, corner.x - origin.x) * 180 / Math.PI + 360) % 360;
                        });
                        
                        const allAngles = [...cornerAngles, minAngle, maxAngle].sort((a, b) => a - b);
                        const extendedMinAngle = Math.min(...allAngles) - level.angle * 2;
                        const extendedMaxAngle = Math.max(...allAngles) + level.angle * 2;
                        
                        minAngle = extendedMinAngle;
                        maxAngle = extendedMaxAngle;
                    }
                    
                    const rangeAngles = generateOptimizedAngleSequence(level.angle, minAngle, maxAngle);
                    anglesToProcess.push(...rangeAngles);
                });
            } else if (visibleAngleRange.minAngle !== undefined && visibleAngleRange.maxAngle !== undefined) {
                let minAngle = visibleAngleRange.minAngle;
                let maxAngle = visibleAngleRange.maxAngle;
                
                if (isLineMode) {
                    const corners = [
                        { x: 0, y: 0 },
                        { x: canvasWidth, y: 0 },
                        { x: canvasWidth, y: canvasHeight },
                        { x: 0, y: canvasHeight }
                    ];
                    
                    const cornerAngles = corners.map(corner => {
                        return (Math.atan2(origin.y - corner.y, corner.x - origin.x) * 180 / Math.PI + 360) % 360;
                    });
                    
                    const allAngles = [...cornerAngles, minAngle, maxAngle].sort((a, b) => a - b);
                    const extendedMinAngle = Math.min(...allAngles) - level.angle * 2;
                    const extendedMaxAngle = Math.max(...allAngles) + level.angle * 2;
                    
                    minAngle = extendedMinAngle;
                    maxAngle = extendedMaxAngle;
                }
                
                anglesToProcess = generateOptimizedAngleSequence(level.angle, minAngle, maxAngle);
            }
            anglesToProcess = [...new Set(anglesToProcess)];
        }

        anglesToProcess.forEach(deg => {
            deg = Math.round(deg * 1e10) / 1e10;
            if (drawnAngles.has(deg)) return;

            const angleRad = deg * Math.PI / 180;
            
            const tickStart = {
                x: origin.x + (minViewRadiusData * viewTransform.scale / dpr) * Math.cos(angleRad),
                y: origin.y - (minViewRadiusData * viewTransform.scale / dpr) * Math.sin(angleRad)
            };
            const tickEnd = {
                x: origin.x + (maxViewRadiusData * viewTransform.scale / dpr) * Math.cos(angleRad),
                y: origin.y - (maxViewRadiusData * viewTransform.scale / dpr) * Math.sin(angleRad)
            };

            ctx.beginPath();
            ctx.moveTo(tickStart.x, tickStart.y);
            ctx.lineTo(tickEnd.x, tickEnd.y);
            ctx.stroke();
            
            drawnAngles.add(deg);
        });
    });
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

        // Call the new unified polar grid drawing function
        drawPolarGrid(ctx, { canvas, dpr, colors, gridAlpha }, origin, maxDataRadius, viewTransform, lastGridState, lastAngularGridState);

    } else {
        // Rectangular grid modes (lines, points, triangular)
        const drawGridElements = (interval, alpha) => {
            if (!interval || alpha < C.MIN_ALPHA_FOR_DRAWING) return;
            const gridElementColor = `rgba(${colors.grid.join(',')}, ${alpha * gridAlpha})`;

            const start = screenToData({ x: 0, y: canvasHeight });
            const end = screenToData({ x: canvasWidth, y: 0 });
            
            const startMultiplierX = Math.floor(start.x / interval);
            const endMultiplierX = Math.ceil(end.x / interval);
            const startMultiplierY = Math.floor(start.y / interval);
            const endMultiplierY = Math.ceil(end.y / interval);

            if (gridDisplayMode === C.GRID_DISPLAY_MODE_LINES) {
                ctx.strokeStyle = gridElementColor;
                ctx.lineWidth = C.GRID_LINEWIDTH;
                for (let i = startMultiplierX; i <= endMultiplierX; i++) {
                    const x = i * interval;
                    const screenX = dataToScreen({ x: x, y: 0 }).x;
                    ctx.beginPath();
                    ctx.moveTo(screenX, 0);
                    ctx.lineTo(screenX, canvasHeight);
                    ctx.stroke();
                }
                for (let i = startMultiplierY; i <= endMultiplierY; i++) {
                    const y = i * interval;
                    const screenY = dataToScreen({ x: 0, y: y }).y;
                    ctx.beginPath();
                    ctx.moveTo(0, screenY);
                    ctx.lineTo(canvasWidth, screenY);
                    ctx.stroke();
                }
            } else if (gridDisplayMode === C.GRID_DISPLAY_MODE_POINTS) {
                ctx.fillStyle = gridElementColor;
                const vertexRadius = C.GRID_POINT_RADIUS * dpr;
                for (let i = startMultiplierX; i <= endMultiplierX; i++) {
                    const x = i * interval;
                    for (let j = startMultiplierY; j <= endMultiplierY; j++) {
                        const y = j * interval;
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
                
                const startMultiplierY_tri = Math.floor(start.y / y_step);
                const endMultiplierY_tri = Math.ceil(end.y / y_step);
                
                for (let j = startMultiplierY_tri; j <= endMultiplierY_tri; j++) {
                    const y = j * y_step;
                    const rowIndex = j;
                    const x_offset = (rowIndex % 2 !== 0) ? interval / 2 : 0;
                    for (let i = startMultiplierX; i <= endMultiplierX; i++) {
                        const x = i * interval;
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

function drawFractionalSnapLabels(ctx, { info, colors, idPrefix, startVertexScreen }, dataToScreen, findVertexById, updateHtmlLabel) {
    if (!info || !info.edge) return;

    const { edge, fraction, snapPoint } = info;
    const p1 = findVertexById(edge.id1);
    const p2 = findVertexById(edge.id2);
    if (!p1 || !p2) return;

    const p1Screen = dataToScreen(p1);
    const p2Screen = dataToScreen(p2);
    const snapPointScreen = dataToScreen(snapPoint);
    const color = colors.feedbackSnapped;

    const perpVec = U.normalize({ x: -(p2Screen.y - p1Screen.y), y: p2Screen.x - p1Screen.x });
    
    let offsetMultiplier = 1;
    if (startVertexScreen) { // This logic is specific to draw mode to place the label on the correct side
        const side = (p2Screen.x - p1Screen.x) * (startVertexScreen.y - p1Screen.y) - (p2Screen.y - p1Screen.y) * (startVertexScreen.x - p1Screen.x);
        offsetMultiplier = side > 0 ? -1 : 1;
    }

    const offset = C.COORD_SYSTEM_EDGE_FRACTION_LABEL_OFFSET;

    const mid1 = { x: (p1Screen.x + snapPointScreen.x) / 2, y: (p1Screen.y + snapPointScreen.y) / 2 };
    const labelPos1 = { x: mid1.x + offsetMultiplier * perpVec.x * offset, y: mid1.y + offsetMultiplier * perpVec.y * offset };
    const text1 = U.formatFraction(fraction, 0.001, 8);

    updateHtmlLabel({
        id: `${idPrefix}-1`,
        content: text1,
        x: labelPos1.x,
        y: labelPos1.y,
        color: color,
        fontSize: C.FRACTION_LABEL_FONT_SIZE,
        options: { textAlign: 'center', textBaseline: 'middle' }
    });

    const mid2 = { x: (snapPointScreen.x + p2Screen.x) / 2, y: (snapPointScreen.y + p2Screen.y) / 2 };
    const labelPos2 = { x: mid2.x + offsetMultiplier * perpVec.x * offset, y: mid2.y + offsetMultiplier * perpVec.y * offset };
    const text2 = U.formatFraction(1 - fraction, 0.001, 8);

    updateHtmlLabel({
        id: `${idPrefix}-2`,
        content: text2,
        x: labelPos2.x,
        y: labelPos2.y,
        color: color,
        fontSize: C.FRACTION_LABEL_FONT_SIZE,
        options: { textAlign: 'center', textBaseline: 'middle' }
    });
}

export function drawAllEdges(ctx, { allEdges, selectedEdgeIds, hoveredEdgeId, isDragConfirmed, dragPreviewVertices, colors, edgesVisible, snappedEdgeIds, currentAltPressed, interpolationStyle, getInterpolationStyleById, edgeColorMode = 'fixed', edgeColorExpression = 'x', edgeWeightExpression = 'r' }, dataToScreen, findVertexById, getEdgeId) {
    ctx.lineWidth = C.LINE_WIDTH;
    const fallbackColor = toRgba(colors.defaultStroke, { r: 255, g: 255, b: 255, a: 1 });

    const getVertexColor = (vertex) => {
        const colorValue = vertex?.color || colors.vertex || colors.defaultStroke;
        return toRgba(colorValue, fallbackColor);
    };

    const getEdgeColorAtT = (edge, t, v1, v2) => {
        const mode = getEdgeMode(edge, edgeColorMode);
        if (mode === 'inherit_vertices' && v1 && v2) {
            const c1 = getVertexColor(v1);
            const c2 = getVertexColor(v2);
            const expression = edge.weightExpression || edgeWeightExpression;
            const len = U.distance(v1, v2) || 1;
            const d1 = t * len;
            const d2 = (1 - t) * len;
            const d1Norm = d1 / len;
            const d2Norm = d2 / len;
            const w1 = U.evaluateExpression(expression, { x: 0, y: 0, r: d1Norm, a: 0 }, 1);
            const w2 = U.evaluateExpression(expression, { x: 0, y: 0, r: d2Norm, a: 0 }, 1);
            return mixColors([c1, c2], [w1, w2]);
        }
        if (mode === 'colormap' && edge.colormapItem) {
            const expression = edge.colorExpression || edgeColorExpression;
            const value = U.evaluateExpression(expression, { x: t }, t);
            const sampled = U.sampleColormap(edge.colormapItem, value);
            return toRgba(sampled, fallbackColor);
        }
        return toRgba(edge.color || colors.defaultStroke, fallbackColor);
    };
    allEdges.forEach(edge => {
        const p1_orig = findVertexById(edge.id1);
        const p2_orig = findVertexById(edge.id2);
        if (!p1_orig || !p2_orig || p1_orig.type !== C.VERTEX_TYPE_REGULAR || p2_orig.type !== C.VERTEX_TYPE_REGULAR) return;

        const edgeId = getEdgeId(edge);
        const isSelected = selectedEdgeIds.includes(edgeId);
        const isSnapped = snappedEdgeIds && snappedEdgeIds.has(edgeId) && snappedEdgeIds.get(edgeId).some(snap => snap.copyIndex === undefined || snap.copyIndex === 0);
        const isHovered = !currentAltPressed && edgeId === hoveredEdgeId;

        if (!edgesVisible && !isSelected && !isSnapped && !isHovered) return;

        let p1_render = p1_orig;
        let p2_render = p2_orig;

        if (isDragConfirmed && dragPreviewVertices && dragPreviewVertices.length > 0) {
            const p1Preview = dragPreviewVertices.find(dp => dp && dp.id === p1_orig.id);
            const p2Preview = dragPreviewVertices.find(dp => dp && dp.id === p2_orig.id);
            if (p1Preview) { p1_render = p1Preview; }
            if (p2Preview) { p2_render = p2Preview; }
        }

        const edgeStyle = edge.interpolationStyleId && getInterpolationStyleById
            ? getInterpolationStyleById(edge.interpolationStyleId)
            : null;
        const edgeStyleNonLinear = edgeStyle && edgeStyle.type !== 'linear';
        const previewVertexMap = new Map();
        if (isDragConfirmed && dragPreviewVertices && dragPreviewVertices.length > 0) {
            dragPreviewVertices.forEach(v => {
                if (!v || !v.id) return;
                previewVertexMap.set(v.originalId || v.id, v);
            });
        }
        const getRenderVertexById = (id) => previewVertexMap.get(id) || findVertexById(id);
        const pathPoints = buildInterpolatedEdgePath(edge, edgeStyle, p1_render, p2_render, allEdges, getRenderVertexById, dataToScreen);
        const pathScreen = pathPoints.map(p => dataToScreen(p));
        if (pathScreen.length < 2) return;
        const p1Screen = pathScreen[0];
        const p2Screen = pathScreen[pathScreen.length - 1];
        const p1ScreenRaw = dataToScreen(p1_render);
        const p2ScreenRaw = dataToScreen(p2_render);

        ctx.beginPath();
        ctx.moveTo(pathScreen[0].x, pathScreen[0].y);
        for (let i = 1; i < pathScreen.length; i++) {
            ctx.lineTo(pathScreen[i].x, pathScreen[i].y);
        }

        const mode = getEdgeMode(edge, edgeColorMode);
        if (mode === 'colormap' || mode === 'inherit_vertices') {
            let totalLength = 0;
            for (let i = 1; i < pathScreen.length; i++) {
                totalLength += Math.hypot(pathScreen[i].x - pathScreen[i - 1].x, pathScreen[i].y - pathScreen[i - 1].y);
            }
            let cursor = 0;
            for (let i = 1; i < pathScreen.length; i++) {
                const segStart = pathScreen[i - 1];
                const segEnd = pathScreen[i];
                const segLength = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
                const startT = totalLength > 0 ? cursor / totalLength : 0;
                const endT = totalLength > 0 ? (cursor + segLength) / totalLength : 1;
                const midT = (startT + endT) / 2;
                const color = getEdgeColorAtT(edge, midT, p1_render, p2_render);
                ctx.strokeStyle = `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${color.a})`;
                ctx.beginPath();
                ctx.moveTo(segStart.x, segStart.y);
                ctx.lineTo(segEnd.x, segEnd.y);
                ctx.setLineDash([]);
                ctx.lineWidth = C.LINE_WIDTH;
                ctx.stroke();
                cursor += segLength;
            }
        } else if (edge.colormapItem) {
            const gradient = ctx.createLinearGradient(p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y);
            const startColor = U.sampleColormap(edge.colormapItem, edge.gradientStart);
            const endColor = U.sampleColormap(edge.colormapItem, edge.gradientEnd);
            gradient.addColorStop(0, startColor);
            gradient.addColorStop(1, endColor);
            ctx.strokeStyle = gradient;
            ctx.setLineDash([]);
            ctx.lineWidth = C.LINE_WIDTH;
            ctx.stroke();
        } else {
            ctx.strokeStyle = edge.color || colors.defaultStroke;
            ctx.setLineDash([]);
            ctx.lineWidth = C.LINE_WIDTH;
            ctx.stroke();
        }

        if (isSelected || isSnapped || isHovered) {
            ctx.save();
            ctx.globalAlpha = C.SELECTION_GLOW_ALPHA;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (isSelected || isSnapped || isHovered) {
                const color = isSnapped ? colors.feedbackSnapped : colors.selectionGlow;
                const offsetDist = C.EDGE_GLOW_OFFSET_DISTANCE;
                const vecX = p2ScreenRaw.x - p1ScreenRaw.x;
                const vecY = p2ScreenRaw.y - p1ScreenRaw.y;
                const mag = Math.hypot(vecX, vecY);
                ctx.strokeStyle = color;
                ctx.lineWidth = C.SELECTION_GLOW_LINE_WIDTH;
                if (mag > C.GEOMETRY_CALCULATION_EPSILON) {
                    const normPerpX = -vecY / mag;
                    const normPerpY = vecX / mag;
                    const offsetX = normPerpX * offsetDist;
                    const offsetY = normPerpY * offsetDist;
                    ctx.beginPath();
                    ctx.arc(p1ScreenRaw.x, p1ScreenRaw.y, offsetDist, Math.atan2(offsetY, offsetX), Math.atan2(-offsetY, -offsetX));
                    ctx.lineTo(p2ScreenRaw.x - offsetX, p2ScreenRaw.y - offsetY);
                    ctx.arc(p2ScreenRaw.x, p2ScreenRaw.y, offsetDist, Math.atan2(-offsetY, -offsetX), Math.atan2(offsetY, offsetX));
                    ctx.closePath();
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.arc(p1ScreenRaw.x, p1ScreenRaw.y, offsetDist, 0, C.RADIANS_IN_CIRCLE);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }
    });
    ctx.setLineDash([]);
    ctx.strokeStyle = colors.defaultStroke;
    ctx.globalAlpha = 1.0;
}

export function drawVertex(ctx, vertex, options, dataToScreen, updateHtmlLabel) {
    const { selectedVertexIds, selectedCenterIds, activeCenterId, colors, verticesVisible = true, isHovered = false, snappedVertexIds, isDragConfirmed, dragPreviewVertices, currentAltPressed } = options;

    let vertexToRender = vertex;
    let isSnapped = false;
    let snapType = null;
    let copyIndex = undefined;

    if (isDragConfirmed && dragPreviewVertices) {
        const previewVertex = dragPreviewVertices.find(dp => dp && (dp.id === vertex.id || dp.originalId === vertex.id));
        if (previewVertex) {
            vertexToRender = previewVertex;
            copyIndex = previewVertex.transformIndex;
        }
    }

    if (snappedVertexIds && vertexToRender.originalId && snappedVertexIds.has(vertexToRender.originalId)) {
         const snapEntries = snappedVertexIds.get(vertexToRender.originalId);
         const relevantSnap = snapEntries.find(snap => snap.copyIndex === copyIndex);
         if (relevantSnap) {
             isSnapped = true;
             snapType = relevantSnap.type;
         }
    } else if (snappedVertexIds && !vertexToRender.originalId && snappedVertexIds.has(vertexToRender.id)) {
         const snapEntries = snappedVertexIds.get(vertexToRender.id);
         const relevantSnap = snapEntries.find(snap => snap.copyIndex === copyIndex);
         if (relevantSnap) {
             isSnapped = true;
             snapType = relevantSnap.type;
         }
    }


    let isSelected;
    if (vertexToRender.type === C.VERTEX_TYPE_REGULAR) {
        isSelected = selectedVertexIds.includes(vertexToRender.id);
        if (!verticesVisible && !isSelected && !isHovered && !isSnapped && !(currentAltPressed && isHovered)) {
            return;
        }
    } else {
        isSelected = selectedCenterIds.includes(vertexToRender.id);
    }

    const screenPos = dataToScreen(vertexToRender);

    switch (vertexToRender.type) {
        case C.VERTEX_TYPE_REGULAR:
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, C.VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
            ctx.fillStyle = vertexToRender.color || colors.vertex; // Always use assigned/default color
            ctx.fill();
            break;
        case C.TRANSFORMATION_TYPE_ROTATION:
        case C.TRANSFORMATION_TYPE_SCALE:
        case C.TRANSFORMATION_TYPE_ROTATE_SCALE:
        case C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE:
            const onCanvasIconSize = C.CENTER_POINT_VISUAL_RADIUS * 2;
            const icon = {
                type: vertexToRender.type,
                x: screenPos.x - onCanvasIconSize / 2,
                y: screenPos.y - onCanvasIconSize / 2,
                width: onCanvasIconSize,
                height: onCanvasIconSize
            };
            drawUITransformationSymbols(ctx, icon, colors);
            break;
    }

    const glowOptions = {
        ...options,
        isSnapped: isSnapped,
        snapType: snapType
    };
    drawVertexGlowsOnly(ctx, vertexToRender, glowOptions, dataToScreen, updateHtmlLabel);
}

export function drawAltHoverIndicator(ctx, { altHoverInfo, colors }, dataToScreen, findVertexById, updateHtmlLabel) {
    if (!altHoverInfo) return;

    const { point, element, shiftKey, fraction } = altHoverInfo;
    const screenPos = dataToScreen(point);

    // Always use the snap color for the Alt indicator
    const fillColor = colors.feedbackSnapped;
    const glowColor = colors.feedbackSnapped;

    // Draw the glow
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = C.SELECTION_GLOW_BLUR_RADIUS;
    ctx.globalAlpha = C.SELECTION_GLOW_ALPHA;
    ctx.beginPath();
    const glowRadius = C.VERTEX_RADIUS + C.SELECTION_GLOW_RADIUS_OFFSET;
    ctx.arc(screenPos.x, screenPos.y, glowRadius, 0, C.RADIANS_IN_CIRCLE);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = C.SELECTION_GLOW_LINE_WIDTH;
    ctx.stroke();
    ctx.restore();

    // Draw the main point
    ctx.save();
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, C.VERTEX_RADIUS, 0, C.RADIANS_IN_CIRCLE);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.restore();

    if (element.type === 'edge' && shiftKey) {
        drawAltHoverSnapLabels(ctx, { info: { edge: element.edge, fraction, snapPoint: point }, colors }, dataToScreen, findVertexById, updateHtmlLabel);
    }
}


function drawAltHoverSnapLabels(ctx, { info, colors }, dataToScreen, findVertexById, updateHtmlLabel) {
    drawFractionalSnapLabels(ctx, { info, colors, idPrefix: 'alt-snap-label' }, dataToScreen, findVertexById, updateHtmlLabel);
}

export function drawDrawingSnapLabels(ctx, { info, colors }, dataToScreen, findVertexById, updateHtmlLabel) {
    if (!info || !info.startVertex) return;
    const startVertexScreen = dataToScreen(info.startVertex);
    drawFractionalSnapLabels(ctx, { info, colors, idPrefix: 'snap-label', startVertexScreen }, dataToScreen, findVertexById, updateHtmlLabel);
}

function drawRotationIndicator(ctx, { transformIndicatorData, colors, currentShiftPressed }, dataToScreen) {
    const { center, startPos, currentPos, rotation, isSnapping, snapType } = transformIndicatorData;
    const color = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;
    const centerScreen = dataToScreen(center);
    const startScreen = dataToScreen(startPos);
    const currentScreen = dataToScreen(currentPos); // The "cursor"

    ctx.save();
    ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
    ctx.strokeStyle = color;

    // Helper 1: Dashed line from center to the original handle position.
    ctx.setLineDash(C.DASH_PATTERN);
    ctx.beginPath();
    ctx.moveTo(centerScreen.x, centerScreen.y);
    ctx.lineTo(startScreen.x, startScreen.y);
    ctx.stroke();

    const shouldDrawProjectionHelper = !currentShiftPressed || (currentShiftPressed && snapType === 'projection');
    if (shouldDrawProjectionHelper) {
        // This is the "target" point, the end of the pure rotation arc.
        const rotatedHandlePos = U.applyTransformToVertex(startPos, center, rotation, 1.0);
        const rotatedHandleScreen = dataToScreen(rotatedHandlePos);


        ctx.beginPath();
        ctx.moveTo(rotatedHandleScreen.x, rotatedHandleScreen.y);
        ctx.lineTo(currentScreen.x, currentScreen.y);
        ctx.stroke();
    }
    
    // Path: The solid arc representing the pure rotation.
    if (Math.abs(rotation) > C.MIN_TRANSFORM_ACTION_THRESHOLD) {
        ctx.setLineDash([]);
        const arcRadius = U.distance(centerScreen, startScreen);
        const startAngleScreen = Math.atan2(startScreen.y - centerScreen.y, startScreen.x - centerScreen.x);
        const screenRotation = -rotation;
        const anticlockwise = rotation > 0;
        ctx.beginPath();
        ctx.arc(centerScreen.x, centerScreen.y, arcRadius, startAngleScreen, startAngleScreen + screenRotation, anticlockwise);
        ctx.stroke();
    }
    ctx.restore();
}

function drawScaleIndicator(ctx, { transformIndicatorData, colors, currentShiftPressed }, dataToScreen) {
    const { center, startPos, scale, isSnapping, snapType, currentPos } = transformIndicatorData;
    const color = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;
    const centerScreen = dataToScreen(center);
    const startScreen = dataToScreen(startPos);
    const currentScreen = dataToScreen(currentPos);

    ctx.save();
    ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
    ctx.strokeStyle = color;

    ctx.setLineDash(C.DASH_PATTERN);
    ctx.beginPath();
    ctx.moveTo(centerScreen.x, centerScreen.y);
    ctx.lineTo(startScreen.x, startScreen.y);
    ctx.stroke();

    const shouldDrawProjectionHelper = !currentShiftPressed;
    if (shouldDrawProjectionHelper) {
        const arcRadius = U.distance(centerScreen, currentScreen);
        const handleAngle = Math.atan2(startScreen.y - centerScreen.y, startScreen.x - centerScreen.x);
        const cursorAngle = Math.atan2(currentScreen.y - centerScreen.y, currentScreen.x - centerScreen.x);

        // --- THIS IS THE FIX ---
        // Calculate the shortest angular distance to determine the correct direction.
        let angularDifference = cursorAngle - handleAngle;
        if (angularDifference > Math.PI) {
            angularDifference -= 2 * Math.PI;
        } else if (angularDifference < -Math.PI) {
            angularDifference += 2 * Math.PI;
        }

        // Reverse the logic: draw CCW only if the shortest angle is negative.
        const anticlockwise = angularDifference < 0;

        ctx.beginPath();
        ctx.arc(centerScreen.x, centerScreen.y, arcRadius, handleAngle, cursorAngle, anticlockwise);
        ctx.stroke();
        // --- END OF FIX ---
    }

    // Path: Solid line for scaling (always visible)
    const scaledStartPos = { x: center.x + (startPos.x - center.x) * scale, y: center.y + (startPos.y - center.y) * scale };
    const scaledStartScreen = dataToScreen(scaledStartPos);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(scaledStartScreen.x, scaledStartScreen.y);
    ctx.stroke();
    
    ctx.restore();
}

function drawDirectionalScaleIndicator(ctx, { transformIndicatorData, colors, currentShiftPressed }, dataToScreen) {
    const { center, startPos, currentPos, scale, startVector, isSnapping, snapType, projectionSource } = transformIndicatorData;
    const color = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;
    const centerScreen = dataToScreen(center);
    const startScreen = dataToScreen(startPos);
    const currentScreen = dataToScreen(currentPos);

    ctx.save();
    ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
    ctx.strokeStyle = color;

    // Helper: Dashed line from center to start (always visible)
    ctx.setLineDash(C.DASH_PATTERN);
    ctx.beginPath();
    ctx.moveTo(centerScreen.x, centerScreen.y);
    ctx.lineTo(startScreen.x, startScreen.y);
    ctx.stroke();

    const scaledStartPos = U.applyTransformToVertex(startPos, center, 0, scale, true, startVector);
    const scaledStartScreen = dataToScreen(scaledStartPos);
    
    // Helper: Dashed cursor projection line (conditionally visible)
    const shouldDrawProjectionHelper = !currentShiftPressed || (currentShiftPressed && snapType === 'projection');
    if (shouldDrawProjectionHelper) {
        ctx.setLineDash(C.DASH_PATTERN);
        ctx.beginPath();
        ctx.moveTo(currentScreen.x, currentScreen.y);
        ctx.lineTo(scaledStartScreen.x, scaledStartScreen.y);
        ctx.stroke();
    }
    
    // Path: Solid scaling line (always visible)
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(scaledStartScreen.x, scaledStartScreen.y);
    ctx.stroke();
    
    // Helper: Perpendicular line for explicit projection snapping
    if (isSnapping && snapType === 'projection' && projectionSource) {
        const sourceScreen = dataToScreen(projectionSource);
        const axisP1 = center;
        const axisP2 = { x: center.x + startVector.x, y: center.y + startVector.y };
        const projectedSourcePoint = U.getClosestPointOnLine(projectionSource, axisP1, axisP2);
        const projectedSourceScreen = dataToScreen(projectedSourcePoint);
        
        ctx.setLineDash(C.DASH_PATTERN);
        ctx.beginPath();
        ctx.moveTo(sourceScreen.x, sourceScreen.y);
        ctx.lineTo(projectedSourceScreen.x, projectedSourceScreen.y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawRotateScaleIndicator(ctx, { transformIndicatorData, colors }, dataToScreen) {
    const { center, startPos, rotation, scale, isSnapping } = transformIndicatorData;
    const color = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;
    const centerScreen = dataToScreen(center);
    const startScreen = dataToScreen(startPos);
    
    ctx.save();
    ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
    ctx.strokeStyle = color;
    
    // Helper: Dashed line from center to start (always visible)
    ctx.setLineDash(C.DASH_PATTERN);
    ctx.beginPath();
    ctx.moveTo(centerScreen.x, centerScreen.y);
    ctx.lineTo(startScreen.x, startScreen.y);
    ctx.stroke();

    const scaledStartPos = { x: center.x + (startPos.x - center.x) * scale, y: center.y + (startPos.y - center.y) * scale };
    const scaledStartScreen = dataToScreen(scaledStartPos);

    // Path (Scaling): Solid line (always visible)
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(scaledStartScreen.x, scaledStartScreen.y);
    ctx.stroke();

    // Path (Rotation): Solid arc (always visible)
    if (Math.abs(rotation) > C.MIN_TRANSFORM_ACTION_THRESHOLD) {
        const arcRadius = U.distance(centerScreen, scaledStartScreen);
        const startAngleScreen = Math.atan2(startScreen.y - centerScreen.y, startScreen.x - centerScreen.x);
        const screenRotation = -rotation;
        const anticlockwise = rotation > 0;
        
        ctx.beginPath();
        ctx.arc(centerScreen.x, centerScreen.y, arcRadius, startAngleScreen, startAngleScreen + screenRotation, anticlockwise);
        ctx.stroke();
    }
    ctx.restore();
}

export function drawTransformIndicators(ctx, htmlOverlay, { transformIndicatorData, colors, coordSystemTransformIndicatorData, currentShiftPressed }, dataToScreen, updateHtmlLabel) {
    if (transformIndicatorData) {
        const { isSnapping, snapType, transformType } = transformIndicatorData;

        ctx.save();
        ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;

        switch (transformType) {
            case C.TRANSFORMATION_TYPE_ROTATE_SCALE:
                drawRotateScaleIndicator(ctx, { transformIndicatorData, colors, currentShiftPressed }, dataToScreen);
                break;
            case C.TRANSFORMATION_TYPE_ROTATION:
                drawRotationIndicator(ctx, { transformIndicatorData, colors, currentShiftPressed }, dataToScreen);
                break;
            case C.TRANSFORMATION_TYPE_SCALE:
                drawScaleIndicator(ctx, { transformIndicatorData, colors, currentShiftPressed }, dataToScreen);
                break;
            case C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE:
                drawDirectionalScaleIndicator(ctx, { transformIndicatorData, colors, currentShiftPressed }, dataToScreen);
                break;
        }
        
        if (isSnapping && snapType === 'projection' && currentShiftPressed) {
            drawProjectionSnapIndicator(ctx, { transformIndicatorData, colors }, dataToScreen);
        }
        
        ctx.restore();

        drawTransformLabels(htmlOverlay, { transformIndicatorData, colors }, dataToScreen, updateHtmlLabel);
    }

    if (coordSystemTransformIndicatorData) {
        drawCoordSystemTransformIndicator(htmlOverlay, { coordSystemTransformIndicatorData, colors }, dataToScreen, updateHtmlLabel);
    }
}

function drawProjectionSnapIndicator(ctx, { transformIndicatorData, colors }, dataToScreen) {
    const { transformType, projectionSource, projectionCenter, projectionPoint, currentPos } = transformIndicatorData;

    if (transformType === C.TRANSFORMATION_TYPE_ROTATE_SCALE) {
        return;
    }

    ctx.setLineDash(C.DASH_PATTERN);
    ctx.strokeStyle = colors.feedbackSnapped;

    if (transformType === C.TRANSFORMATION_TYPE_ROTATION && projectionPoint) {
        const currentScreen = dataToScreen(currentPos);
        const projectionScreen = dataToScreen(projectionPoint);
        const sourceScreen = dataToScreen(projectionSource);
        
        ctx.beginPath();
        ctx.moveTo(sourceScreen.x, sourceScreen.y);
        ctx.lineTo(projectionScreen.x, projectionScreen.y);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(currentScreen.x, currentScreen.y);
        ctx.lineTo(projectionScreen.x, projectionScreen.y);
        ctx.stroke();
    } else if (transformType === C.TRANSFORMATION_TYPE_SCALE && projectionCenter) {
        const projectionCenterScreen = dataToScreen(projectionCenter);
        const projectionSourceScreen = dataToScreen(projectionSource);
        const currentScreen = dataToScreen(currentPos);
        
        const radius = U.distance(projectionCenterScreen, projectionSourceScreen);
        let startAngle = Math.atan2(projectionSourceScreen.y - projectionCenterScreen.y, projectionSourceScreen.x - projectionCenterScreen.x);
        let endAngle = Math.atan2(currentScreen.y - projectionCenterScreen.y, currentScreen.x - projectionCenterScreen.x);
        
        const twoPi = 2 * Math.PI;
        startAngle = (startAngle + twoPi) % twoPi;
        endAngle = (endAngle + twoPi) % twoPi;
        const clockwiseDistance = (endAngle - startAngle + twoPi) % twoPi;
        const counterClockwiseDistance = (startAngle - endAngle + twoPi) % twoPi;
        const anticlockwise = counterClockwiseDistance < clockwiseDistance;
        
        ctx.beginPath();
        ctx.arc(projectionCenterScreen.x, projectionCenterScreen.y, radius, startAngle, endAngle, anticlockwise);
        ctx.stroke();
    }
}

function drawTransformLabels(htmlOverlay, { transformIndicatorData, colors }, dataToScreen, updateHtmlLabel) {
    const { center, startPos, rotation, scale, isSnapping, snapType, snappedScaleValue, transformType } = transformIndicatorData;
    const centerScreen = dataToScreen(center);
    const startScreen = dataToScreen(startPos);
    const color = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;

    if ((transformType === C.TRANSFORMATION_TYPE_SCALE || transformType === C.TRANSFORMATION_TYPE_ROTATE_SCALE || transformType === C.TRANSFORMATION_TYPE_DIRECTIONAL_SCALE)) {
        let scaleText;
        const effectiveScale = snappedScaleValue !== null ? snappedScaleValue : scale;
        
        const isHighPrecisionSnap = (snapType === 'projection') || (snapType === 'merge' && transformType === C.TRANSFORMATION_TYPE_ROTATE_SCALE);

        if (isHighPrecisionSnap) {
            scaleText = `\\times ${parseFloat(effectiveScale.toFixed(C.TRANSFORM_INDICATOR_PRECISION)).toString()}`;
        } else if (isSnapping && snappedScaleValue !== null) {
            scaleText = `\\times ${U.formatFraction(snappedScaleValue, C.FRACTION_FORMAT_TOLERANCE, C.FRACTION_FORMAT_MAX_DENOMINATOR_TRANSFORM)}`;
        } else {
            scaleText = `\\times ${parseFloat(effectiveScale.toFixed(C.TRANSFORM_INDICATOR_PRECISION)).toString()}`;
        }
        const midX = (centerScreen.x + startScreen.x) / 2;
        const midY = (centerScreen.y + startScreen.y) / 2;
        const lineAngle = Math.atan2(startScreen.y - centerScreen.y, startScreen.x - centerScreen.x);
        const textPerpAngle = lineAngle - Math.PI / 2;
        const scaleTextX = midX + Math.cos(textPerpAngle) * C.TRANSFORM_SCALE_LABEL_OFFSET;
        const scaleTextY = midY + Math.sin(textPerpAngle) * C.TRANSFORM_SCALE_LABEL_OFFSET;
        let rotationDeg = lineAngle * (180 / Math.PI);
        if (rotationDeg > 90 || rotationDeg < -90) rotationDeg += 180;
        updateHtmlLabel({ id: 'transform-scale-indicator', content: scaleText, x: scaleTextX, y: scaleTextY, color: color, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'bottom', rotation: rotationDeg } });
    } else {
        updateHtmlLabel({ id: 'transform-scale-indicator', content: '', x: 0, y: 0, color: color, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: {} });
    }

    if ((transformType === C.TRANSFORMATION_TYPE_ROTATION || transformType === C.TRANSFORMATION_TYPE_ROTATE_SCALE) && Math.abs(rotation) > C.MIN_TRANSFORM_ACTION_THRESHOLD) {
        const angleDeg = rotation * (180 / Math.PI);
        const angleText = `${parseFloat(angleDeg.toFixed(C.TRANSFORM_INDICATOR_PRECISION)).toString()}^{\\circ}`;
        const startVecScreen = { x: startScreen.x - centerScreen.x, y: startScreen.y - centerScreen.y };
        const bisectorAngle = Math.atan2(startVecScreen.y, startVecScreen.x) + (-rotation) / 2;
        const arcRadius = Math.hypot(startVecScreen.x, startVecScreen.y);
        const labelRadius = arcRadius + C.TRANSFORM_ANGLE_LABEL_OFFSET;
        const angleTextX = centerScreen.x + labelRadius * Math.cos(bisectorAngle);
        const angleTextY = centerScreen.y + labelRadius * Math.sin(bisectorAngle);
        let rotationDeg = bisectorAngle * (180 / Math.PI);
        if (rotationDeg > 90 || rotationDeg < -90) rotationDeg += 180;
        updateHtmlLabel({ id: 'transform-angle-indicator', content: angleText, x: angleTextX, y: angleTextY, color: color, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { rotation: rotationDeg } });
    } else {
        updateHtmlLabel({ id: 'transform-angle-indicator', content: '', x: 0, y: 0, color: color, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: {} });
    }
}

function drawCoordSystemTransformIndicator(htmlOverlay, { coordSystemTransformIndicatorData, colors }, dataToScreen, updateHtmlLabel) {
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
            fontSize: C.FRACTION_LABEL_FONT_SIZE, 
            options: { textAlign: 'center', textBaseline: 'middle' } 
        });
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
        const effectiveRadiusForLine = C.FEEDBACK_ARC_RADIUS_SCREEN + ctx.lineWidth / 2;

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

        drawAngleArc(ctx, frozenOriginScreen, baseAngleData, absoluteAngleForRefLine, C.FEEDBACK_ARC_RADIUS_SCREEN, refElementColor, false);
    }
    ctx.restore();
}

export function prepareSnapInfoTexts(ctx, htmlOverlay, startVertexData, targetDataPos, snappedOutput, { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors, lastGridState }, dataToScreen, drawingContext, updateHtmlLabel) {
    if ((!showAngles && !showDistances) || snappedOutput.distance < C.GEOMETRY_CALCULATION_EPSILON) {
        updateHtmlLabel({ id: 'snap-dist', content: '', x: 0, y: 0 });
        updateHtmlLabel({ id: 'snap-angle', content: '', x: 0, y: 0 });
        return;
    }

    const startScreen = dataToScreen(startVertexData);
    const { angle: snappedAbsoluteAngleDeg, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn, gridToGridSquaredSum, gridInterval, snapType } = snappedOutput;
    const { offsetAngleRad, isFirstSegmentBeingDrawn, currentSegmentReferenceD } = drawingContext;
    const currentElementColor = snappedOutput.snapped ? colors.feedbackSnapped : (currentShiftPressed ? colors.feedbackSnapped : colors.geometryInfoText);
    const currentLineAbsoluteAngle = Math.atan2(targetDataPos.y - startVertexData.y, targetDataPos.x - startVertexData.x);

    if (snappedDistanceData * viewTransform.scale / window.devicePixelRatio < C.REF_TEXT_SCREEN_PIXEL_THRESHOLD) {
         updateHtmlLabel({ id: 'snap-dist', content: '', x: 0, y: 0 });
         updateHtmlLabel({ id: 'snap-angle', content: '', x: 0, y: 0 });
        return;
    }

    // Angle feedback depends on angleTurn normally, but on absolute angle for the first segment
    const isAngleFeedbackActive = showAngles && snappedDistanceData > C.GEOMETRY_CALCULATION_EPSILON && (isFirstSegmentBeingDrawn || Math.abs(angleTurn) > C.GEOMETRY_CALCULATION_EPSILON);


    if (showDistances) {
        let distanceText = '';
        let effectiveGridInterval = snappedOutput.gridInterval || null;
        if (!effectiveGridInterval && lastGridState && typeof lastGridState.alpha1 === 'number' && typeof lastGridState.alpha2 === 'number') {
            effectiveGridInterval = (lastGridState.alpha2 >= lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
        }

        if (currentShiftPressed && snappedOutput.snapped) {
            if (isFirstSegmentBeingDrawn) {
                if (snapType === 'grid' && gridToGridSquaredSum !== null && effectiveGridInterval) {
                     if (gridToGridSquaredSum === 0) {
                         distanceText = '0';
                     } else {
                         const [coeff, radicand] = U.simplifySquareRoot(gridToGridSquaredSum);
                         const finalCoeff = effectiveGridInterval * coeff;
                         const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                         distanceText = U.formatSimplifiedRoot(roundedFinalCoeff, radicand);
                     }
                } else if (snapType === 'geometric' && lengthSnapFactor !== null) {
                     const actualDistance = lengthSnapFactor * currentSegmentReferenceD;
                     distanceText = U.formatFraction(actualDistance, C.FRACTION_FORMAT_TOLERANCE, C.FRACTION_FORMAT_MAX_DENOMINATOR);
                     if (distanceText === actualDistance.toFixed(2) || distanceText === String(Math.round(actualDistance))) {
                        distanceText = U.formatNumber(actualDistance, distanceSigFigs);
                     }
                } else if (snapType === 'vertex' || snapType === 'edge_fraction' || snapType === 'edge') {
                     let foundGridRepresentation = false;
                     if (effectiveGridInterval) {
                         const deltaX = snappedOutput.x - startVertexData.x;
                         const deltaY = snappedOutput.y - startVertexData.y;
                         const dx_grid_float = deltaX / effectiveGridInterval;
                         const dy_grid_float = deltaY / effectiveGridInterval;
                         if (Math.abs(dx_grid_float - Math.round(dx_grid_float)) < 1e-5 && Math.abs(dy_grid_float - Math.round(dy_grid_float)) < 1e-5) {
                            const dx_grid = Math.round(dx_grid_float);
                            const dy_grid = Math.round(dy_grid_float);
                            const g2gSum = dx_grid * dx_grid + dy_grid * dy_grid;
                            if (g2gSum === 0) {
                                distanceText = '0';
                            } else {
                                const [coeff, radicand] = U.simplifySquareRoot(g2gSum);
                                const finalCoeff = effectiveGridInterval * coeff;
                                const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                                distanceText = U.formatSimplifiedRoot(roundedFinalCoeff, radicand);
                            }
                            foundGridRepresentation = true;
                         }
                     }
                     if (!foundGridRepresentation) {
                         distanceText = U.formatNumber(snappedDistanceData, distanceSigFigs);
                     }
                } else {
                     distanceText = U.formatNumber(snappedDistanceData, distanceSigFigs);
                }
            } else {
                 if (snapType === 'geometric' && lengthSnapFactor !== null) {
                     distanceText = U.formatSnapFactor(lengthSnapFactor, 'D');
                 } else if (snapType === 'grid' && gridToGridSquaredSum !== null && effectiveGridInterval && frozenReference_D_du !== null && frozenReference_D_du > C.GEOMETRY_CALCULATION_EPSILON) {
                    const actualGridDistance = effectiveGridInterval * Math.sqrt(gridToGridSquaredSum);
                    const ratio = actualGridDistance / frozenReference_D_du;
                    let foundFraction = false;
                    for (const factor of C.SNAP_FACTORS) {
                        if (Math.abs(ratio - factor) < C.GEOMETRY_CALCULATION_EPSILON) {
                            distanceText = U.formatSnapFactor(factor, 'D');
                            foundFraction = true;
                            break;
                        }
                    }
                    if (!foundFraction) {
                         if (gridToGridSquaredSum === 0) {
                             distanceText = '0';
                         } else {
                             const [coeff, radicand] = U.simplifySquareRoot(gridToGridSquaredSum);
                             const finalCoeff = effectiveGridInterval * coeff;
                             const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                             distanceText = U.formatSimplifiedRoot(roundedFinalCoeff, radicand);
                         }
                    }
                } else if (snapType === 'vertex' || snapType === 'edge_fraction' || snapType === 'edge') {
                     if (frozenReference_D_du !== null && frozenReference_D_du > C.GEOMETRY_CALCULATION_EPSILON) {
                          const ratio = snappedDistanceData / frozenReference_D_du;
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
                } else {
                     distanceText = U.formatNumber(snappedDistanceData, distanceSigFigs);
                }
            }
        } else {
              if (!isFirstSegmentBeingDrawn && frozenReference_D_du !== null && frozenReference_D_du > C.GEOMETRY_CALCULATION_EPSILON) {
                 const ratio = snappedDistanceData / frozenReference_D_du;
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
        }

        if (distanceText) {
            const startScreenPos = dataToScreen(startVertexData);
            const endScreenPos = dataToScreen(targetDataPos);
            const edgeAngleScreen = Math.atan2(endScreenPos.y - startScreenPos.y, endScreenPos.x - startScreenPos.x);
            const midX = (startScreenPos.x + endScreenPos.x) / 2;
            const midY = (startScreenPos.y + endScreenPos.y) / 2;
            let textPerpAngle;

            if (isAngleFeedbackActive) {
                // Use absolute angle for first segment placement, turn angle otherwise
                const angleForPlacement = isFirstSegmentBeingDrawn ? -currentLineAbsoluteAngle : -(angleTurn);
                if (angleForPlacement < 0 && angleForPlacement > -Math.PI || angleForPlacement > Math.PI) { // Clockwise turn/angle on screen
                    textPerpAngle = edgeAngleScreen - Math.PI / 2;
                } else { // Counter-clockwise turn/angle on screen (or straight)
                    textPerpAngle = edgeAngleScreen + Math.PI / 2;
                }
            } else {
                textPerpAngle = edgeAngleScreen - Math.PI / 2;
                if (Math.sin(textPerpAngle) > 0) {
                     textPerpAngle += Math.PI;
                }
            }

            const distanceTextX = midX + Math.cos(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
            const distanceTextY = midY + Math.sin(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
            let rotationDeg = edgeAngleScreen * (C.DEGREES_IN_HALF_CIRCLE / Math.PI);
            if (rotationDeg > C.DEGREES_IN_QUADRANT || rotationDeg < -C.DEGREES_IN_QUADRANT) {
                rotationDeg += C.DEGREES_IN_HALF_CIRCLE;
            }
            updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { rotation: rotationDeg } }, htmlOverlay);
        } else {
             updateHtmlLabel({ id: 'snap-dist', content: '', x: 0, y: 0 });
        }
    } else {
         updateHtmlLabel({ id: 'snap-dist', content: '', x: 0, y: 0 });
    }

    if (isAngleFeedbackActive) {
        // Adjust base angle and line for first segment
        const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad; // Use 0 (x-axis) for first segment
        drawAngleArc(ctx, startScreen, baseAngleForArc, currentLineAbsoluteAngle, C.FEEDBACK_ARC_RADIUS_SCREEN, currentElementColor);

        ctx.save();
        ctx.beginPath();
        const effectiveRadiusForLine = C.FEEDBACK_ARC_RADIUS_SCREEN + ctx.lineWidth / 2;
        // Reference line always starts from vertex, points along baseAngleForArc
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
        const referenceAngleForSnapping = drawingContext.currentSegmentReferenceA_for_display;
        // Use absolute angle for display if it's the first segment, otherwise use turn angle
        const angleToFormatRad = isFirstSegmentBeingDrawn ? currentLineAbsoluteAngle : angleTurn;

        if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_DEGREES) {
            let displayDegrees = U.normalizeAngleToPi(angleToFormatRad) * (180 / Math.PI);
            // Angle snapping logic remains the same (relative format if snapped during shift)
            if (currentShiftPressed && !isFirstSegmentBeingDrawn && snappedOutput.snapped && snapType === 'geometric' && angleSnapFactor !== null) {
                 angleText = U.formatSnapFactor(angleSnapFactor, 'A');
            } else if (currentShiftPressed && canReferToTheta && angleSnapFactor !== null && snappedOutput.snapped && snapType !== 'geometric') {
                  angleText = U.formatSnapFactor(angleSnapFactor, 'A');
            } else {
                 // Display absolute angle for first segment, relative turn for others
                 if (Math.abs(displayDegrees) > C.ZERO_TOLERANCE) {
                      angleText = `${U.formatNumber(displayDegrees, angleSigFigs)}^{\\circ}`;
                 }
            }
        } else if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_RADIANS) {
             let displayRadians = U.normalizeAngleToPi(angleToFormatRad);
             // Angle snapping logic remains the same
             if (currentShiftPressed && !isFirstSegmentBeingDrawn && snappedOutput.snapped && snapType === 'geometric' && angleSnapFactor !== null && referenceAngleForSnapping) {
                  const fracStr = U.formatFraction(angleSnapFactor * (referenceAngleForSnapping / Math.PI), C.FRACTION_FORMAT_TOLERANCE, C.FRACTION_FORMAT_MAX_DENOMINATOR);
                  if (fracStr === '0') angleText = '0';
                  else if (fracStr === '1') angleText = C.PI_SYMBOL_KATEX;
                  else if (fracStr === '-1') angleText = `-${C.PI_SYMBOL_KATEX}`;
                  else angleText = `${fracStr}${C.PI_SYMBOL_KATEX}`;
             } else if (currentShiftPressed && canReferToTheta && angleSnapFactor !== null && snappedOutput.snapped && snapType !== 'geometric' && referenceAngleForSnapping) {
                 const fracStr = U.formatFraction(angleSnapFactor * (referenceAngleForSnapping / Math.PI), C.FRACTION_FORMAT_TOLERANCE, C.FRACTION_FORMAT_MAX_DENOMINATOR);
                 if (fracStr === '0') angleText = '0';
                 else if (fracStr === '1') angleText = C.PI_SYMBOL_KATEX;
                 else if (fracStr === '-1') angleText = `-${C.PI_SYMBOL_KATEX}`;
                 else angleText = `${fracStr}${C.PI_SYMBOL_KATEX}`;
             } else {
                  // Display absolute angle for first segment, relative turn for others
                  if (Math.abs(displayRadians) > C.ZERO_TOLERANCE) {
                       const fracOfPi = U.formatFraction(displayRadians / Math.PI, C.FRACTION_FORMAT_TOLERANCE, C.FRACTION_FORMAT_MAX_DENOMINATOR);
                       if (fracOfPi !== displayRadians.toFixed(2)) { // Check if formatting worked
                           if (fracOfPi === '0') angleText = '0';
                           else if (fracOfPi === '1') angleText = C.PI_SYMBOL_KATEX;
                           else if (fracOfPi === '-1') angleText = `-${C.PI_SYMBOL_KATEX}`;
                            else angleText = `${fracOfPi}${C.PI_SYMBOL_KATEX}`;
                       } else {
                           angleText = U.formatNumber(displayRadians, angleSigFigs);
                       }
                  }
             }
        }

        if (angleText) {
            // Adjust label placement for first segment vs subsequent
            const canvasStartAngle = -baseAngleForArc; // Will be 0 for first segment
            const canvasEndAngle = -currentLineAbsoluteAngle;
            const sumCos = Math.cos(canvasStartAngle) + Math.cos(canvasEndAngle);
            const sumSin = Math.sin(canvasStartAngle) + Math.sin(canvasEndAngle);
            const bisectorCanvasAngle = Math.atan2(sumSin, sumCos);
            const offset = C.UI_ANGLE_LABEL_OFFSET;
            let rotationDeg = bisectorCanvasAngle * (180 / Math.PI);

            const rotatedPoint = {
                x: offset * Math.cos(bisectorCanvasAngle),
                y: offset * Math.sin(bisectorCanvasAngle)
            };
            const labelScreenPos = {
                x: startScreen.x + rotatedPoint.x,
                y: startScreen.y + rotatedPoint.y
            };
            if (rotationDeg > 90 || rotationDeg < -90) {
                 rotationDeg += 180;
            }
            updateHtmlLabel({ id: 'snap-angle', content: angleText, x: labelScreenPos.x, y: labelScreenPos.y, color: currentElementColor, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: { rotation: rotationDeg } }, htmlOverlay);
        } else {
             updateHtmlLabel({ id: 'snap-angle', content: '', x: 0, y: 0 });
        }
    } else {
         updateHtmlLabel({ id: 'snap-angle', content: '', x: 0, y: 0 });
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

    if (showDistances && distanceData !== null && distanceData > dataThreshold) {
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
        if (turnAngleData !== null && Math.abs(turnAngleData) > C.GEOMETRY_CALCULATION_EPSILON) {
            const angleTurnScreen = -turnAngleData;
            if (angleTurnScreen < 0) { // Clockwise angle on screen (CCW in data)
                textPerpAngle = edgeAngleScreen - Math.PI / 2; // Place label on the opposite side
            } else { // Counter-clockwise angle on screen (CW in data)
                textPerpAngle = edgeAngleScreen + Math.PI / 2; // Place label on the opposite side
            }
        } else {
            textPerpAngle = edgeAngleScreen - Math.PI / 2;
            if (Math.sin(textPerpAngle) > 0) {
                textPerpAngle += Math.PI;
            }
        }
        const textDistLabelX_D = midX_screen + Math.cos(textPerpAngle) * C.REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN;
        const textDistLabelY_D = midY_screen + Math.sin(textPerpAngle) * C.REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN;

        updateHtmlLabel({ id: 'ref-dist', content: distanceText, x: textDistLabelX_D, y: textDistLabelY_D, color: refElementColor, fontSize: C.REF_TEXT_KATEX_FONT_SIZE, options: {  rotation: rotationDeg } }, htmlOverlay);
    }

    if (showAngles && turnAngleData !== null && Math.abs(turnAngleData) > C.GEOMETRY_CALCULATION_EPSILON) {
        const startAngleCanvas = -baseAngleData;
        const endAngleCanvas = -(baseAngleData + turnAngleData);

        const sumCos = Math.cos(startAngleCanvas) + Math.cos(endAngleCanvas);
        const sumSin = Math.sin(startAngleCanvas) + Math.sin(endAngleCanvas);
        const bisectorCanvasAngle = Math.atan2(sumSin, sumCos);
        const angleLabelOffsetDistance = C.UI_ANGLE_LABEL_OFFSET;

        const textAngleLabelX_A = startVertexScreen.x + Math.cos(bisectorCanvasAngle) * angleLabelOffsetDistance;
        const textAngleLabelY_A = startVertexScreen.y + Math.sin(bisectorCanvasAngle) * angleLabelOffsetDistance;
        
        let rotationDeg = bisectorCanvasAngle * (180 / Math.PI);
        if (rotationDeg > 90 || rotationDeg < -90) {
            rotationDeg += 180;
        }

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

        updateHtmlLabel({ id: 'ref-angle', content: aKatexText, x: textAngleLabelX_A, y: textAngleLabelY_A, color: refElementColor, fontSize: C.REF_TEXT_KATEX_FONT_SIZE, options: {  rotation: rotationDeg } }, htmlOverlay);
    }
}

export function updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostVertexPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors, useScientific }, screenToData, updateHtmlLabel) {
    
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
        effectiveGridInterval = lastGridState.interval1;
    }

    // Mouse coordinates should be 1 decimal place more precise than the finest tick spacing
    let finestInterval = effectiveGridInterval;
    if (lastGridState && lastGridState.interval2 && lastGridState.interval2 < finestInterval) {
        finestInterval = lastGridState.interval2;
    }
    
    // Mouse coordinates precision based on tick interval:
    // - 10000+ → round to nearest 100 (2 fewer sig figs)
    // - 1000 → round to nearest 10 (1 fewer sig fig)  
    // - 100 → round to nearest 1 (0 decimals)
    // - 10 → 1 decimal place
    // - 1 → 2 decimal places
    // - 0.1 → 3 decimal places, etc.
    
    let mouseDecimalPlaces;
    let roundingFactor = 1;
    
    if (finestInterval >= 10000) {
        // Round to nearest 100, show as integers
        roundingFactor = 100;
        mouseDecimalPlaces = 0;
    } else if (finestInterval >= 1000) {
        // Round to nearest 10, show as integers  
        roundingFactor = 10;
        mouseDecimalPlaces = 0;
    } else if (finestInterval >= 100) {
        // Round to nearest 1, show as integers
        roundingFactor = 1;
        mouseDecimalPlaces = 0;
    } else if (finestInterval >= 10) {
        // Show 1 decimal place
        mouseDecimalPlaces = 1;
    } else {
        // For smaller intervals, add 2 more decimal places than tick precision
        const tickDecimalPlaces = Math.max(0, -Math.floor(Math.log10(finestInterval)));
        mouseDecimalPlaces = tickDecimalPlaces + 2;
    }
    
    // Calculate how many significant figures the tick interval has
    const getSignificantFigures = (value) => {
        if (value === 0) return 1;
        // For tick intervals like 100000, 10000, 1000, 100, 10, 1, 0.1, 0.01 etc.
        // These are typically 1 significant figure
        return 1;
    };
    
    const tickSigFigs = getSignificantFigures(finestInterval);
    const mouseSigFigs = tickSigFigs + 2; // Always 2 more sig figs than ticks
    
    // Format coordinates with consistent precision
    const formatCoordinate = (value) => {
        if (useScientific) {
            // For scientific notation, ensure both x and y have same decimal places in coefficient
            // Always use mouseSigFigs - 1 decimal places (since first digit is before decimal)
            const decimalPlacesInCoeff = mouseSigFigs - 1;
            const expStr = Math.abs(value).toExponential(decimalPlacesInCoeff);
            const parts = expStr.split('e');
            let coefficient = parts[0];
            let exponent = parseInt(parts[1], 10);
            const sign = value < 0 ? "-" : "";
            return `${sign}${coefficient} \\cdot 10^{${exponent}}`;
        } else {
            if (roundingFactor > 1) {
                // Only round for large intervals (≥100)
                const roundedValue = Math.round(value / roundingFactor) * roundingFactor;
                return roundedValue.toFixed(mouseDecimalPlaces);
            } else {
                // For smaller intervals, just use fixed decimal places without rounding
                return value.toFixed(mouseDecimalPlaces);
            }
        }
    };

    const angleDecimalPlaces = Math.min(mouseDecimalPlaces, C.MAX_ANGLE_DECIMAL_PLACES);
    
    let textContent = '';

    switch (coordsDisplayMode) {
        case C.COORDS_DISPLAY_MODE_REGULAR: {
            // Both x and y use the same decimal places
            let xText = formatCoordinate(displayPos.x);
            if (displayPos.x >= 0 && !xText.includes('cdot')) xText = `${C.KATEX_MINUS_PHANTOM}${xText}`;
            let yText = formatCoordinate(displayPos.y);
            if (displayPos.y >= 0 && !yText.includes('cdot')) yText = `${C.KATEX_MINUS_PHANTOM}${yText}`;
            textContent = `\\begin{pmatrix*}[r] x \\\\ y \\end{pmatrix*} = \\begin{pmatrix*}[r] ${xText} \\\\ ${yText} \\end{pmatrix*}`;
            break;
        }
        case C.COORDS_DISPLAY_MODE_COMPLEX: {
            // Both real and imaginary parts use the same decimal places
            let rePart = formatCoordinate(displayPos.x);
            if (displayPos.x >= 0 && !rePart.includes('cdot')) rePart = `${C.KATEX_MINUS_PHANTOM}${rePart}`;
            const imAbs = Math.abs(displayPos.y);
            let imPartAbs = formatCoordinate(imAbs);
            const sign = displayPos.y < 0 ? '-' : '+';
            textContent = `z = ${rePart} ${sign} ${imPartAbs}${C.IMAGINARY_UNIT_SYMBOL}`;
            break;
        }
        case C.COORDS_DISPLAY_MODE_POLAR: {
            const rValue = Math.hypot(displayPos.x, displayPos.y);
            const thetaRaw = Math.atan2(displayPos.y, displayPos.x);
            
            let rText = formatCoordinate(rValue);
            if (rValue >= 0 && !rText.includes('cdot')) rText = `${C.KATEX_MINUS_PHANTOM}${rText}`;
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
    updateHtmlLabel({ 
        id: 'mouse-coord-text', 
        content: textContent, 
        x: canvasWidth - C.UI_PADDING, 
        y: C.UI_PADDING, 
        color: colors.mouseCoords, 
        fontSize: C.MOUSE_COORD_FONT_SIZE, 
        options: { textAlign: 'right', textBaseline: 'top' } 
    });
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
    const x_offset = 0;
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0 + x_offset, 32); ctx.lineTo(32 + x_offset, 32);
    ctx.moveTo(0 + x_offset, 32); ctx.lineTo(0 + x_offset, 0);
    ctx.stroke();
    ctx.fillStyle = colorStrong;
    const vertex = { x: 16 + x_offset, y: 16 };
    let labelPos = { x: 16 + x_offset, y: 8 };
    let label = '';
    switch (mode) {
        case C.COORDS_DISPLAY_MODE_REGULAR:
            ctx.setLineDash(C.UI_ICON_DASH_PATTERN);
            ctx.beginPath();
            ctx.moveTo(vertex.x, vertex.y); ctx.lineTo(vertex.x, 32);
            ctx.moveTo(vertex.x, vertex.y); ctx.lineTo(0 + x_offset, vertex.y);
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
            ctx.moveTo(0 + x_offset, 32); ctx.lineTo(vertex.x, vertex.y);
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
            ctx.moveTo(0 + x_offset, 32); ctx.lineTo(vertex.x, vertex.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0 + x_offset, 32, 8, -Math.atan2(32 - vertex.y, vertex.x - (0 + x_offset)), 0);
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
    const p1 = { x: 32, y: 32 };
    const p2 = { x: 0, y: 32 };
    const p3 = { x: 16, y: 0 };
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
    ctx.moveTo(0, 32);
    ctx.lineTo(32, 32);
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
            ctx.strokeRect(0, 0, 32, 32);
            ctx.beginPath();
            ctx.moveTo(0, 16); ctx.lineTo(32, 16);
            ctx.moveTo(16, 0); ctx.lineTo(16, 32);
            ctx.stroke();
            break;
        case C.GRID_DISPLAY_MODE_POINTS:
            ctx.strokeRect(0, 0, 32, 32);
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
            ctx.strokeRect(0, 0, 32, 32);
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

        case C.TRANSFORMATION_TYPE_ROTATE_SCALE: {
            // Rotation part
            const arcAngle = -Math.PI / 4;
            
            ctx.beginPath();
            ctx.arc(0, 0, radius,  arcAngle,-arcAngle);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(0, 0, radius, Math.PI+arcAngle, Math.PI-arcAngle);
            ctx.stroke();
            
            let arrowSize = radius * 0.25;
            
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

            // Scale part
            const lineLength = radius * 0.8;
            arrowSize = radius * 0.25;
            
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
    const { canvasUI, colors, allColors, namedColors, colorAssignments, activeColorTargets, lastSelectedSwatchIndex, verticesVisible, edgesVisible, facesVisible, isDraggingColorTarget, draggedColorTargetInfo, mousePos } = state;

    const checkerboardColor1 = colors.checkerboardColor1;
    const checkerboardColor2 = colors.checkerboardColor2;
    
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
        const resolveTargetIndex = (target) => {
            let targetColorIndex = colorAssignments[target];
            if (isDraggingColorTarget && draggedColorTargetInfo && draggedColorTargetInfo.target === target && draggedColorTargetInfo.previewColorIndex !== undefined) {
                targetColorIndex = draggedColorTargetInfo.previewColorIndex;
            }
            return targetColorIndex;
        };

        const getIconOptions = (target) => {
            let targetColorIndex = resolveTargetIndex(target);

            const colorItem = (targetColorIndex === -1) ? null : allColors[targetColorIndex];

            const options = {};
            if (target === C.COLOR_TARGET_VERTEX) {
                options.vertexState = verticesVisible ? 'filled' : 'disabled';
                if (targetColorIndex === -1) {
                    options.vertexColor = C.UI_COLOR_TARGET_UNASSIGNED;
                } else if (colorItem && colorItem.type === 'color') {
                    options.vertexColor = colorItem.value;
                } else if (colorItem && colorItem.type === 'colormap') {
                    options.vertexColormapItem = colorItem;
                }
            } else if (target === C.COLOR_TARGET_EDGE) {
                options.edgeState = edgesVisible ? 'solid' : 'disabled';
                if (targetColorIndex === -1) {
                    options.edgeColor = C.UI_COLOR_TARGET_UNASSIGNED;
                } else if (colorItem && colorItem.type === 'color') {
                    options.edgeColor = colorItem.value;
                } else if (colorItem && colorItem.type === 'colormap') {
                    options.edgeColormapItem = colorItem;
                }
            } else if (target === C.COLOR_TARGET_FACE) {
                options.faceState = facesVisible ? 'filled' : 'disabled';
                if (targetColorIndex === -1) {
                    options.faceColor = C.UI_COLOR_TARGET_UNASSIGNED;
                } else if (colorItem && colorItem.type === 'color') {
                    options.faceColor = colorItem.value;
                } else if (colorItem && colorItem.type === 'colormap') {
                    options.faceColormapItem = colorItem;
                }
            } else if (target === C.COLOR_TARGET_TEXT) {
                if (targetColorIndex === -1) {
                    options.textColor = C.UI_COLOR_TARGET_UNASSIGNED;
                } else if (colorItem && colorItem.type === 'color') {
                    options.textColor = colorItem.value;
                } else if (colorItem && colorItem.type === 'colormap') {
                    options.textColor = U.sampleColormap(colorItem, 0.5);
                }
                const faceTargetIndex = resolveTargetIndex(C.COLOR_TARGET_FACE);
                if (faceTargetIndex === targetColorIndex) {
                    const faceItem = faceTargetIndex === -1 ? null : allColors[faceTargetIndex];
                    if (!faceItem) {
                        options.faceColorForContrast = C.UI_COLOR_TARGET_UNASSIGNED;
                    } else if (faceItem.type === 'color') {
                        options.faceColorForContrast = faceItem.value;
                    } else if (faceItem.type === 'colormap') {
                        options.faceColorForContrast = U.sampleColormap(faceItem, 0.5);
                    }
                }
            }
            return options;
        };

        const drawOrder = [C.COLOR_TARGET_FACE, C.COLOR_TARGET_EDGE, C.COLOR_TARGET_VERTEX, C.COLOR_TARGET_TEXT];
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

                if (targetToDraw === C.COLOR_TARGET_TEXT) {
                    drawTextTargetIcon(ctx, icon, iconOptions, colors, false);
                } else {
                    drawTriangleIcon(ctx, icon, iconOptions, colors, false);
                }
            }
        });
    }

    const drawnBoxesForSwatches = new Set();
    if (lastSelectedSwatchIndex !== null && lastSelectedSwatchIndex !== undefined) {
        const swatch = canvasUI.colorSwatches.find(s => s.index === lastSelectedSwatchIndex);
        if (swatch) {
            const padding = 2;
            const iconAbove = canvasUI.colorTargetIcons.find(icon =>
                icon.x + icon.width / 2 >= swatch.x &&
                icon.x + icon.width / 2 <= swatch.x + swatch.width
            );
            const boxY = iconAbove ? Math.min(iconAbove.y, swatch.y) : swatch.y;
            ctx.strokeStyle = colors.selectionGlow;
            ctx.lineWidth = C.UI_BUTTON_BORDER_WIDTH;
            ctx.strokeRect(
                swatch.x - padding,
                boxY - padding,
                swatch.width + padding * 2,
                (swatch.y + swatch.height - boxY) + padding * 2
            );
            drawnBoxesForSwatches.add(lastSelectedSwatchIndex);
        }
    }
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

function drawColorModePanel(ctx, htmlOverlay, state, updateHtmlLabel) {
    const { canvasUI, colors, allColors, activeThemeName, edgeColorMode, faceColorMode, selectedEdgeModes, selectedFaceModes, edgeWeightExpression, faceVertexWeightExpression, faceEdgeWeightExpression, faceColorExpression, edgeColorExpression, angleDisplayMode } = state;
    const icons = canvasUI.colorModeIcons || [];
    if (!icons.length) return;
    const rgbVertexColors = ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)'];
    const edgeActiveModes = selectedEdgeModes && selectedEdgeModes.length > 0 ? selectedEdgeModes : [edgeColorMode];
    const faceActiveModes = selectedFaceModes && selectedFaceModes.length > 0 ? selectedFaceModes : [faceColorMode];

    const getPreviewColormap = () => {
        if (!allColors) return null;
        return allColors.find(item => item && item.type === 'colormap') || null;
    };
    const previewColormap = getPreviewColormap();
    const rgbColormap = {
        type: 'colormap',
        vertices: [
            { pos: 0, color: [255, 0, 0], alpha: 1 },
            { pos: 0.5, color: [0, 255, 0], alpha: 1 },
            { pos: 1, color: [0, 0, 255], alpha: 1 }
        ],
        isCyclic: false
    };

    icons.forEach(icon => {
        ctx.save();
        ctx.strokeStyle = colors.uiIcon;
        ctx.fillStyle = colors.uiIcon;
        ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;

        const baseOptions = {
            vertexState: 'none',
            edgeState: 'none',
            faceState: 'none',
            faceColor: colors.uiIcon,
            edgeColor: colors.uiIcon,
            vertexColor: colors.uiIcon
        };
        if (icon.group === 'edge') {
            const opts = { ...baseOptions, edgeState: 'solid', edgeWeightExpression, angleDisplayMode };
            if (icon.mode === 'inherit_vertices') {
                opts.vertexState = 'filled';
                opts.vertexColors = rgbVertexColors;
                opts.edgeVertexColors = rgbVertexColors;
            }
            if (icon.mode === 'colormap') {
                opts.edgeColormapItem = rgbColormap;
                opts.edgeExpression = edgeColorExpression;
                opts.edgeColormapEdges = null;
            }
            const isActive = edgeActiveModes.includes(icon.mode);
            drawTriangleIcon(ctx, icon, opts, colors, isActive);
        } else if (icon.group === 'face') {
            const opts = { ...baseOptions, faceState: 'filled', vertexWeightExpression: faceVertexWeightExpression, edgeWeightExpression: faceEdgeWeightExpression, angleDisplayMode };
            if (icon.mode === 'inherit_vertices') {
                opts.vertexState = 'filled';
                opts.faceVertexColors = rgbVertexColors;
                opts.vertexColors = rgbVertexColors;
                opts.edgeVertexColors = rgbVertexColors;
            }
            if (icon.mode === 'inherit_edges') {
                opts.edgeState = 'solid';
                opts.edgeColors = rgbVertexColors;
                opts.faceEdgeColors = rgbVertexColors;
            }
            if (icon.mode === 'colormap_xy') {
                opts.faceColormapItem = rgbColormap;
                opts.faceExpression = faceColorExpression;
            }
            const isActive = faceActiveModes.includes(icon.mode);
            drawTriangleIcon(ctx, icon, opts, colors, isActive);
        }
        ctx.restore();
    });

}

function drawSessionPreview(ctx, rect, sessionState, colors) {
    const vertices = (sessionState?.vertices || []).filter(v => v && v.type === 'regular');
    if (!vertices.length) {
        ctx.save();
        ctx.fillStyle = colors.uiIconDefault;
        ctx.beginPath();
        ctx.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width * 0.08, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
        return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    vertices.forEach(v => {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
    });

    const pad = 3;
    const width = Math.max(rect.width - pad * 2, 1);
    const height = Math.max(rect.height - pad * 2, 1);
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    const scale = Math.min(width / spanX, height / spanY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const offsetX = rect.x + rect.width / 2;
    const offsetY = rect.y + rect.height / 2;

    const toIcon = (p) => ({
        x: offsetX + (p.x - centerX) * scale,
        y: offsetY + (p.y - centerY) * scale
    });

    const edges = sessionState?.edges || [];
    const faces = sessionState?.faces || [];
    const vertexById = new Map(vertices.map(v => [v.id, v]));

    ctx.save();
    ctx.lineWidth = 1;

    if (faces.length > 0) {
        ctx.fillStyle = colors.uiIconDefault;
        ctx.globalAlpha = 0.2;
        faces.forEach(face => {
            const faceVerts = (face.vertexIds || []).map(id => vertexById.get(id)).filter(Boolean);
            if (faceVerts.length < 3) return;
            ctx.beginPath();
            const start = toIcon(faceVerts[0]);
            ctx.moveTo(start.x, start.y);
            for (let i = 1; i < faceVerts.length; i++) {
                const p = toIcon(faceVerts[i]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = colors.uiIconDefault;
    edges.forEach(edge => {
        const v1 = vertexById.get(edge.id1);
        const v2 = vertexById.get(edge.id2);
        if (!v1 || !v2) return;
        const p1 = toIcon(v1);
        const p2 = toIcon(v2);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    });

    ctx.fillStyle = colors.uiIconDefault;
    vertices.forEach(v => {
        const p = toIcon(v);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, 2 * Math.PI);
        ctx.fill();
    });

    ctx.restore();
}

function drawSessionsPanel(ctx, state) {
    const { canvasUI, colors, sessions, activeSessionIndex, selectedSessionIndex } = state;

    const removeBtn = canvasUI.removeSessionButton;
    if (removeBtn) {
        ctx.strokeStyle = colors.uiDefault;
        ctx.lineWidth = C.UI_BUTTON_BORDER_WIDTH;
        ctx.strokeRect(removeBtn.x, removeBtn.y, removeBtn.width, removeBtn.height);
        ctx.beginPath();
        ctx.moveTo(removeBtn.x + C.UI_BUTTON_ICON_PADDING, removeBtn.y + removeBtn.height / 2);
        ctx.lineTo(removeBtn.x + removeBtn.width - C.UI_BUTTON_ICON_PADDING, removeBtn.y + removeBtn.height / 2);
        ctx.stroke();
    }

    (canvasUI.sessionIcons || []).forEach(icon => {
        const isSelected = icon.index === selectedSessionIndex;
        const isActive = icon.index === activeSessionIndex;
        ctx.save();
        ctx.strokeStyle = isSelected ? colors.selectionGlow : colors.uiDefault;
        ctx.lineWidth = C.UI_MENU_ICON_BORDER_WIDTH;
        ctx.strokeRect(icon.x, icon.y, icon.width, icon.height);
        if (isActive && !isSelected) {
            ctx.strokeStyle = colors.selectionGlow;
            ctx.lineWidth = C.UI_MENU_ICON_BORDER_WIDTH;
            ctx.strokeRect(icon.x + 2, icon.y + 2, icon.width - 4, icon.height - 4);
        }
        drawSessionPreview(ctx, icon, icon.session?.state, colors);
        ctx.restore();
    });

    const addBtn = canvasUI.addSessionButton;
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

function getTriangleIconGeometry(rect) {
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const scale = rect.width / C.UI_ICON_BASE_SIZE;
    const triangleSize = 26 * scale;
    const height = triangleSize * Math.sqrt(3) / 2;
    const vertices = [
        { x: center.x, y: center.y - height / 1.5 },
        { x: center.x - triangleSize / 2, y: center.y + height / 3 },
        { x: center.x + triangleSize / 2, y: center.y + height / 3 }
    ];
    const facePath = new Path2D();
    facePath.moveTo(vertices[0].x, vertices[0].y);
    facePath.lineTo(vertices[1].x, vertices[1].y);
    facePath.lineTo(vertices[2].x, vertices[2].y);
    facePath.closePath();
    const minX = Math.min(vertices[0].x, vertices[1].x, vertices[2].x);
    const maxX = Math.max(vertices[0].x, vertices[1].x, vertices[2].x);
    const minY = Math.min(vertices[0].y, vertices[1].y, vertices[2].y);
    const maxY = Math.max(vertices[0].y, vertices[1].y, vertices[2].y);
    return { vertices, facePath, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

function drawTriangleIcon(ctx, rect, options, colors, isActive = false) {
    const { vertexState = 'none', edgeState = 'none', faceState = 'none', faceColor, edgeColor, vertexColor: optionsVertexColor, vertexColors, edgeVertexColors, edgeColors, faceColormapItem, faceExpression, faceVertexColors, faceEdgeColors, vertexWeightExpression, edgeWeightExpression, edgeColormapItem, edgeExpression, edgeColormapEdges, angleDisplayMode = 'degrees', showAllDisabled = false } = options;

    ctx.save();

    const { vertices, facePath } = getTriangleIconGeometry(rect);
    
    const resolveColor = (value) => {
        if (!value) return { r: 0, g: 0, b: 0, a: 1 };
        if (Array.isArray(value)) return { r: value[0], g: value[1], b: value[2], a: 1 };
        return U.parseColor(value);
    };

    const mixWeightedColors = (colorsResolved, weights) => {
        const sum = weights.reduce((acc, w) => acc + w, 0) || 1;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        colorsResolved.forEach((color, idx) => {
            const w = weights[idx] / sum;
            r += w * color.r;
            g += w * color.g;
            b += w * color.b;
            a += w * color.a;
        });
        return { r, g, b, a };
    };

    const drawTriangleGradient = (vertices, bounds, mode, colorList, weightExpression) => {
        const width = Math.max(1, Math.ceil(bounds.w));
        const height = Math.max(1, Math.ceil(bounds.h));
        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const tctx = temp.getContext('2d');
        const image = tctx.createImageData(width, height);
        const data = image.data;

        const v0 = vertices[0];
        const v1 = vertices[1];
        const v2 = vertices[2];
        const denom = (v1.y - v2.y) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.y - v2.y);
        const colorsResolved = colorList.map(resolveColor);
        const edgePairs = [
            [v0, v1],
            [v1, v2],
            [v2, v0]
        ];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const px = bounds.x + x + 0.5;
                const py = bounds.y + y + 0.5;
                const w0 = ((v1.y - v2.y) * (px - v2.x) + (v2.x - v1.x) * (py - v2.y)) / denom;
                const w1 = ((v2.y - v0.y) * (px - v2.x) + (v0.x - v2.x) * (py - v2.y)) / denom;
                const w2 = 1 - w0 - w1;
                const idx = (y * width + x) * 4;
                if (w0 >= -0.001 && w1 >= -0.001 && w2 >= -0.001) {
                    let color;
                    if (mode === 'vertices') {
                        if (weightExpression) {
                            const weights = vertices.map(vertex => {
                                const dx = px - vertex.x;
                                const dy = py - vertex.y;
                                const dist = Math.hypot(dx, dy);
                                const angle = Math.atan2(dy, dx);
                                const a = angleDisplayMode === 'degrees'
                                    ? ((angle * 180 / Math.PI + 360) % 360)
                                    : ((angle + C.RADIANS_IN_CIRCLE) % C.RADIANS_IN_CIRCLE);
                                return U.evaluateExpression(weightExpression, { x: dx, y: dy, r: dist, a }, 1);
                            });
                            color = mixWeightedColors(colorsResolved, weights);
                        } else {
                            color = {
                                r: w0 * colorsResolved[0].r + w1 * colorsResolved[1].r + w2 * colorsResolved[2].r,
                                g: w0 * colorsResolved[0].g + w1 * colorsResolved[1].g + w2 * colorsResolved[2].g,
                                b: w0 * colorsResolved[0].b + w1 * colorsResolved[1].b + w2 * colorsResolved[2].b,
                                a: w0 * colorsResolved[0].a + w1 * colorsResolved[1].a + w2 * colorsResolved[2].a
                            };
                        }
                    } else {
                        const weights = edgePairs.map(edge => {
                            const closest = U.getClosestPointOnLineSegment({ x: px, y: py }, edge[0], edge[1]);
                            if (weightExpression) {
                                return U.evaluateExpression(weightExpression, { x: 0, y: 0, r: closest.distance, a: 0 }, 1);
                            }
                            return 1 / Math.max(closest.distance, 1e-4);
                        });
                        color = mixWeightedColors(colorsResolved, weights);
                    }
                    data[idx] = Math.round(color.r);
                    data[idx + 1] = Math.round(color.g);
                    data[idx + 2] = Math.round(color.b);
                    data[idx + 3] = Math.round((color.a ?? 1) * 255);
                } else {
                    data[idx + 3] = 0;
                }
            }
        }

        tctx.putImageData(image, 0, 0);
        ctx.drawImage(temp, bounds.x, bounds.y);
    };

    const drawTriangleExpressionFill = (vertices, bounds, colormapItem, expression) => {
        const width = Math.max(1, Math.ceil(bounds.w));
        const height = Math.max(1, Math.ceil(bounds.h));
        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const tctx = temp.getContext('2d');
        const image = tctx.createImageData(width, height);
        const data = image.data;

        const v0 = vertices[0];
        const v1 = vertices[1];
        const v2 = vertices[2];
        const denom = (v1.y - v2.y) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.y - v2.y);
        const center = {
            x: (v0.x + v1.x + v2.x) / 3,
            y: (v0.y + v1.y + v2.y) / 3
        };
        const edgeLength = Math.hypot(v1.x - v0.x, v1.y - v0.y) || 1;
        const axisScale = edgeLength / 2;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const px = bounds.x + x + 0.5;
                const py = bounds.y + y + 0.5;
                const w0 = ((v1.y - v2.y) * (px - v2.x) + (v2.x - v1.x) * (py - v2.y)) / denom;
                const w1 = ((v2.y - v0.y) * (px - v2.x) + (v0.x - v2.x) * (py - v2.y)) / denom;
                const w2 = 1 - w0 - w1;
                const idx = (y * width + x) * 4;
                if (w0 >= -0.001 && w1 >= -0.001 && w2 >= -0.001) {
                    const localX = (px - center.x) / axisScale;
                    const localY = (py - center.y) / axisScale;
                    const r = Math.hypot(localX, localY);
                    const angle = Math.atan2(localY, localX);
                    const a = angleDisplayMode === 'degrees'
                        ? ((angle * 180 / Math.PI + 360) % 360)
                        : ((angle + C.RADIANS_IN_CIRCLE) % C.RADIANS_IN_CIRCLE);
                    const t = U.evaluateExpression(expression, { x: localX, y: localY, r, a }, 0);
                    const color = U.sampleColormap(colormapItem, t);
                    const parsed = U.parseColor(color) || { r: 0, g: 0, b: 0, a: 1 };
                    data[idx] = Math.round(parsed.r);
                    data[idx + 1] = Math.round(parsed.g);
                    data[idx + 2] = Math.round(parsed.b);
                    data[idx + 3] = Math.round((parsed.a ?? 1) * 255);
                } else {
                    data[idx + 3] = 0;
                }
            }
        }

        tctx.putImageData(image, 0, 0);
        ctx.drawImage(temp, bounds.x, bounds.y);
    };

    if (faceState === 'filled') {
        let faceFilledByImage = false;
        if (faceColormapItem && faceColormapItem.type === 'colormap' && faceExpression) {
            const { bounds } = getTriangleIconGeometry(rect);
            drawTriangleExpressionFill(vertices, bounds, faceColormapItem, faceExpression);
            faceFilledByImage = true;
        } else if (faceColormapItem && faceColormapItem.type === 'colormap') {
            const gradient = ctx.createLinearGradient(vertices[1].x, 0, vertices[2].x, 0);
            faceColormapItem.vertices.forEach(vertex => {
                const colorValue = vertex.color;
                const alpha = vertex.alpha !== undefined ? vertex.alpha : 1.0;
                const colorString = `rgba(${colorValue.join(',')},${alpha})`;
                gradient.addColorStop(vertex.pos, colorString);
            });
            ctx.fillStyle = gradient;
        } else if (faceVertexColors && faceVertexColors.length >= 3) {
            const { bounds } = getTriangleIconGeometry(rect);
            drawTriangleGradient(vertices, bounds, 'vertices', faceVertexColors, vertexWeightExpression);
            faceFilledByImage = true;
        } else if (faceEdgeColors && faceEdgeColors.length >= 3) {
            const { bounds } = getTriangleIconGeometry(rect);
            drawTriangleGradient(vertices, bounds, 'edges', faceEdgeColors, edgeWeightExpression);
            faceFilledByImage = true;
        } else {
            ctx.fillStyle = faceColor || colors.face;
        }
        if (!faceFilledByImage) {
            ctx.fill(facePath);
        }
    } else if (faceState === 'disabled') {
        ctx.fillStyle = C.UI_ICON_DISABLED_FILL;
        ctx.fill(facePath);
    }
    
    if (edgeState === 'solid' || edgeState === 'disabled') {
        ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
        ctx.setLineDash([]);
        
        const edges = [
            [0, 1],
            [1, 2],
            [2, 0]
        ];
        
        edges.forEach((edge, edgeIndex) => {
            const [startIndex, endIndex] = edge;
            const start = vertices[startIndex];
            const end = vertices[endIndex];
            if (edgeColors && edgeColors.length >= 3) {
                ctx.strokeStyle = edgeColors[edgeIndex];
            } else if (edgeVertexColors && edgeVertexColors.length >= 3 && edgeWeightExpression) {
                const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
                const samples = 5;
                const len = U.distance(start, end) || 1;
                for (let i = 0; i < samples; i++) {
                    const t = samples === 1 ? 0.5 : i / (samples - 1);
                    const d1 = t * len;
                    const d2 = (1 - t) * len;
                    const d1Norm = d1 / len;
                    const d2Norm = d2 / len;
                    const w1 = U.evaluateExpression(edgeWeightExpression, { x: 0, y: 0, r: d1Norm, a: 0 }, 1);
                    const w2 = U.evaluateExpression(edgeWeightExpression, { x: 0, y: 0, r: d2Norm, a: 0 }, 1);
                    const color = mixWeightedColors(
                        [resolveColor(edgeVertexColors[startIndex]), resolveColor(edgeVertexColors[endIndex])],
                        [w1, w2]
                    );
                    gradient.addColorStop(t, `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${color.a ?? 1})`);
                }
                ctx.strokeStyle = gradient;
            } else if (edgeColormapItem && edgeColormapItem.type === 'colormap' && edgeState === 'solid') {
                const resolvedExpression = edgeExpression && edgeExpression.trim() ? edgeExpression : 'x';
                const useExpression = (!edgeColormapEdges || edgeColormapEdges.includes(edgeIndex));
                const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
                const samples = useExpression ? 5 : 2;
                for (let i = 0; i < samples; i++) {
                    const t = samples === 1 ? 0.5 : i / (samples - 1);
                    const value = useExpression ? U.evaluateExpression(resolvedExpression, { x: t }, t) : t;
                    const color = U.sampleColormap(edgeColormapItem, value);
                    gradient.addColorStop(t, color);
                }
                ctx.strokeStyle = gradient;
            } else if (edgeVertexColors && edgeVertexColors.length >= 3) {
                const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
                gradient.addColorStop(0, edgeVertexColors[startIndex]);
                gradient.addColorStop(1, edgeVertexColors[endIndex]);
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
            let currentVertexColor = (vertexColors && vertexColors[index]) || optionsVertexColor || colors.vertex;
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
        ctx.strokeStyle = colors.uiIconDisabled;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(2, 2);
        ctx.lineTo(30, 30);
        ctx.stroke();
    } else if (hasDisabledElements) {
        ctx.strokeStyle = colors.uiIconDisabled;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(2, 2);
        ctx.lineTo(30, 30);
        ctx.stroke();
    }

    if (isActive) {
        const padding = 2;
        ctx.strokeStyle = colors.selectionGlow;
        ctx.lineWidth = C.UI_BUTTON_BORDER_WIDTH;
        ctx.setLineDash([]);
        ctx.strokeRect(rect.x - padding, rect.y - padding, rect.width + padding * 2, rect.height + padding * 2);
    }
    
    ctx.restore();
}

function drawTextTargetIcon(ctx, rect, options, colors, isActive = false) {
    ctx.save();

    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.translate(center.x, center.y);
    const scale = rect.width / C.UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);

    let textFill = options.textColor || colors.uiTextDefault;
    if (options.faceColorForContrast) {
        const faceColor = U.parseColor(options.faceColorForContrast);
        const brightness = (0.2126 * faceColor.r + 0.7152 * faceColor.g + 0.0722 * faceColor.b) / 255;
        textFill = brightness > 0.5 ? '#000000' : '#ffffff';
    }
    ctx.fillStyle = textFill;
    ctx.font = `bold 14px KaTeX_Main, Times New Roman, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', 16, 16);

    ctx.restore();
}

export function drawFace(ctx, screenVertices, face, colors, dataToScreen, findVertexById, allEdges, allFaces, getLiveVertex, drawHoles, interpolationStyle, colorModeConfig = {}) {
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

    // If instructed, add child face boundaries to the path to create holes.
    if (drawHoles && face.childFaceIds && face.childFaceIds.length > 0) {
        face.childFaceIds.forEach(childId => {
            const childFace = allFaces.find(f => f.id === childId);
            if (childFace) {
                const childLiveVertices = childFace.vertexIds.map(id => getLiveVertex(id)).filter(p => p && p.type === 'regular');
                if (childLiveVertices.length >= 3) {
                    const childPathVertices = interpolationStyle
                        ? U.buildInterpolatedPath(childLiveVertices, interpolationStyle, true, dataToScreen)
                        : childLiveVertices;
                    const childScreenVertices = childPathVertices.map(v => dataToScreen(v));
                    ctx.moveTo(childScreenVertices[0].x, childScreenVertices[0].y);
                    childScreenVertices.slice(1).forEach(vertex => {
                        ctx.lineTo(vertex.x, vertex.y);
                    });
                    ctx.closePath();
                }
            }
        });
    }

    const {
        faceColorMode = 'fixed',
        edgeColorMode = 'fixed',
        faceColorExpression = 'x',
        faceColorPolarExpression = 'r',
        edgeColorExpression = 'x',
        edgeWeightExpression = 'r',
        faceVertexWeightExpression = '1/(r+0.001)',
        faceEdgeWeightExpression = '1/(r+0.001)',
        angleDisplayMode = 'degrees'
    } = colorModeConfig;
    const faceMode = getFaceMode(face, faceColorMode);

    const faceVertices = face?.vertexIds ? face.vertexIds.map(id => getLiveVertex(id)).filter(Boolean) : [];
    const getVertexColorValue = (vertex) => vertex?.color || colors.face;
    const fallbackColor = toRgba(colors.face, { r: 255, g: 255, b: 255, a: 1 });

    const makePatternFromCanvas = (patternCanvas, coordSystem, bounds) => {
        const pattern = ctx.createPattern(patternCanvas, 'no-repeat');
        const origin_s = dataToScreen(coordSystem.origin);
        const xAxisGlobal = U.localToGlobal({ x: 1, y: 0 }, coordSystem);
        const yAxisGlobal = U.localToGlobal({ x: 0, y: 1 }, coordSystem);
        const xAxis_s = dataToScreen(xAxisGlobal);
        const yAxis_s = dataToScreen(yAxisGlobal);
        const dx = xAxis_s.x - origin_s.x;
        const dy = xAxis_s.y - origin_s.y;
        const ex = yAxis_s.x - origin_s.x;
        const ey = yAxis_s.y - origin_s.y;
        const size = patternCanvas.width;
        const boundsWidth = Math.max(bounds?.width || 0, 1e-6);
        const boundsHeight = Math.max(bounds?.height || 0, 1e-6);
        const localStepX = boundsWidth / (size - 1);
        const localStepY = boundsHeight / (size - 1);
        const a = dx * localStepX;
        const b = dy * localStepX;
        const c = ex * localStepY;
        const d = ey * localStepY;
        const localOrigin = { x: bounds?.minX || 0, y: bounds?.minY || 0 };
        const originGlobal = U.localToGlobal(localOrigin, coordSystem);
        const originLocal_s = dataToScreen(originGlobal);
        const e = originLocal_s.x;
        const f = originLocal_s.y;
        const matrix = new DOMMatrix([a, b, c, d, e, f]);
        pattern.setTransform(matrix);
        return pattern;
    };

    const buildFaceShaderCanvas = (mode, coordSystem) => {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const cctx = canvas.getContext('2d');
        const image = cctx.createImageData(size, size);
        const data = image.data;
        const inv = 1 / (size - 1);

        const vertices = faceVertices.filter(v => v.type === 'regular');
        const localVertices = vertices.map(v => U.globalToLocal(v, coordSystem));
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxRadius = 1;
        localVertices.forEach(v => {
            if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return;
            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
            maxRadius = Math.max(maxRadius, Math.hypot(v.x, v.y));
        });
        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            minX = -1; minY = -1; maxX = 1; maxY = 1;
        }
        const bounds = {
            minX,
            minY,
            width: Math.max(maxX - minX, 1e-6),
            height: Math.max(maxY - minY, 1e-6),
            maxRadius: Math.max(maxRadius, 1e-6)
        };
        const minBlendDistance = 0.02;
        const blendPower = 2;
        const vertexColors = vertices.map(v => toRgba(getVertexColorValue(v), fallbackColor));
        const normalizeLocal = (v) => ({
            x: (v.x - minX) / bounds.width,
            y: (v.y - minY) / bounds.height
        });
        const localVerticesNormalized = localVertices.map(normalizeLocal);

        const edges = [];
        if (face?.vertexIds && face.vertexIds.length > 1) {
            for (let i = 0; i < face.vertexIds.length; i++) {
                const id1 = face.vertexIds[i];
                const id2 = face.vertexIds[(i + 1) % face.vertexIds.length];
                const edge = allEdges?.find(e => (e.id1 === id1 && e.id2 === id2) || (e.id1 === id2 && e.id2 === id1)) || { id1, id2 };
                const v1 = getLiveVertex(edge.id1);
                const v2 = getLiveVertex(edge.id2);
                if (v1 && v2) {
                    edges.push({
                        edge,
                        mode: getEdgeMode(edge, edgeColorMode),
                        v1,
                        v2,
                        v1Local: U.globalToLocal(v1, coordSystem),
                        v2Local: U.globalToLocal(v2, coordSystem),
                        v1Norm: normalizeLocal(U.globalToLocal(v1, coordSystem)),
                        v2Norm: normalizeLocal(U.globalToLocal(v2, coordSystem))
                    });
                }
            }
        }

        const getEdgeColorAtT = (edgeEntry, t) => {
            const { edge, v1, v2, mode } = edgeEntry;
            if (mode === 'inherit_vertices' && v1 && v2) {
                const c1 = toRgba(getVertexColorValue(v1), fallbackColor);
                const c2 = toRgba(getVertexColorValue(v2), fallbackColor);
                const expression = edge.weightExpression || edgeWeightExpression;
                const len = U.distance(v1, v2) || 1;
                const d1 = t * len;
                const d2 = (1 - t) * len;
                const d1Norm = d1 / len;
                const d2Norm = d2 / len;
                const w1 = U.evaluateExpression(expression, { x: 0, y: 0, r: d1Norm, a: 0 }, 1);
                const w2 = U.evaluateExpression(expression, { x: 0, y: 0, r: d2Norm, a: 0 }, 1);
                return mixColors([c1, c2], [w1, w2]);
            }
            if (mode === 'colormap' && edge.colormapItem) {
                const expression = edge.colorExpression || edgeColorExpression;
                const value = U.evaluateExpression(expression, { x: t }, t);
                const sampled = U.sampleColormap(edge.colormapItem, value);
                return toRgba(sampled, fallbackColor);
            }
            return toRgba(edge.color || colors.edge, fallbackColor);
        };

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const localX = bounds.minX + x * inv * bounds.width;
                const localY = bounds.minY + y * inv * bounds.height;
                const normalizedX = clamp01((localX - bounds.minX) / bounds.width);
                const normalizedY = clamp01((localY - bounds.minY) / bounds.height);
                let color = fallbackColor;

                if (mode === 'colormap_xy' || mode === 'colormap_polar') {
                    if (face?.colormapItem) {
                        const normalizedR = Math.hypot(localX, localY);
                        let angle = Math.atan2(localY, localX);
                        if (angle < 0) angle += C.RADIANS_IN_CIRCLE;
                        const angleValue = angleDisplayMode === 'degrees' ? angle * (180 / Math.PI) : angle;
                        const expression = face?.colorExpression || faceColorExpression || faceColorPolarExpression || 'x';
                        const t = U.evaluateExpression(
                            expression,
                            { x: normalizedX, y: normalizedY, r: normalizedR, a: angleValue },
                            normalizedX
                        );
                        const isSingleStop = Array.isArray(face.colormapItem.vertices) && face.colormapItem.vertices.length === 1;
                        if (isSingleStop) {
                            const sampled = U.sampleColormap(face.colormapItem, 0);
                            color = toRgba(sampled, fallbackColor);
                        } else if (face.colormapItem.isCyclic) {
                            const sampled = U.sampleColormap(face.colormapItem, t);
                            color = toRgba(sampled, fallbackColor);
                        } else if (t < 0) {
                            color = { ...fallbackColor, a: 0 };
                        } else if (t > 1) {
                            const sampled = U.sampleColormap(face.colormapItem, 1);
                            color = toRgba(sampled, fallbackColor);
                        } else {
                            const sampled = U.sampleColormap(face.colormapItem, t);
                            color = toRgba(sampled, fallbackColor);
                        }
                    } else {
                        color = fallbackColor;
                    }
                } else if (mode === 'inherit_vertices' && localVertices.length > 0) {
                    const expression = face.vertexWeightExpression || faceVertexWeightExpression;
                    const weights = localVerticesNormalized.map(v => {
                        const dx = normalizedX - v.x;
                        const dy = normalizedY - v.y;
                        const dist = Math.hypot(dx, dy);
                        const angle = Math.atan2(dy, dx);
                        const a = angleDisplayMode === 'degrees' ? ((angle * 180 / Math.PI + 360) % 360) : ((angle + C.RADIANS_IN_CIRCLE) % C.RADIANS_IN_CIRCLE);
                        return U.evaluateExpression(expression, { x: dx, y: dy, r: dist, a }, 1);
                    });
                    color = mixColors(vertexColors, weights);
                } else if (mode === 'inherit_edges' && edges.length > 0) {
                    const expression = face.edgeWeightExpression || faceEdgeWeightExpression;
                    const weights = edges.map(entry => {
                        const closest = U.getClosestPointOnLineSegment({ x: normalizedX, y: normalizedY }, entry.v1Norm, entry.v2Norm);
                        return U.evaluateExpression(expression, { x: 0, y: 0, r: closest.distance, a: 0 }, 1);
                    });
                    const edgeColors = edges.map(entry => {
                        const closest = U.getClosestPointOnLineSegment({ x: normalizedX, y: normalizedY }, entry.v1Norm, entry.v2Norm);
                        return getEdgeColorAtT(entry, closest.t);
                    });
                    color = mixColors(edgeColors, weights);
                }

                const idx = (y * size + x) * 4;
                data[idx] = Math.round(color.r);
                data[idx + 1] = Math.round(color.g);
                data[idx + 2] = Math.round(color.b);
                data[idx + 3] = Math.round(clamp01(color.a) * 255);
            }
        }
        cctx.putImageData(image, 0, 0);
        return { canvas, bounds };
    };

    if (faceMode === 'fixed') {
        ctx.fillStyle = face?.color || colors.face;
        ctx.fill(drawHoles ? 'evenodd' : 'nonzero');
    } else if (face.localCoordSystem) {
        const shader = buildFaceShaderCanvas(faceMode, face.localCoordSystem);
        const pattern = makePatternFromCanvas(shader.canvas, face.localCoordSystem, shader.bounds);
        ctx.fillStyle = pattern || (face?.color || colors.face);
        ctx.fill(drawHoles ? 'evenodd' : 'nonzero');
    } else if (face?.colormapItem && face.localCoordSystem) {
        ctx.fillStyle = face?.color || colors.face;
        ctx.fill(drawHoles ? 'evenodd' : 'nonzero');
    } else {
        ctx.fillStyle = face?.color || colors.face;
        ctx.fill(drawHoles ? 'evenodd' : 'nonzero');
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
        if (colorIndex === -1) return C.UI_COLOR_TARGET_UNASSIGNED;
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

function drawInterpolationToolIcon(ctx, rect, colors, style) {
    const p1 = { x: rect.x + rect.width * 0.22, y: rect.y + rect.height * 0.78 };
    const p2 = { x: rect.x + rect.width * 0.22, y: rect.y + rect.height * 0.22 };
    const p3 = { x: rect.x + rect.width * 0.78, y: rect.y + rect.height * 0.22 };
    const basePoints = [p1, p2, p3];
    const isLinear = !style || style.type === 'linear';
    const iconPath = isLinear
        ? basePoints
        : U.buildInterpolatedPath(basePoints, style, false, null);

    const drawArrowHead = (from, to) => {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const size = rect.width * 0.08;
        const left = {
            x: to.x - Math.cos(angle) * size + Math.cos(angle + Math.PI / 2) * size * 0.6,
            y: to.y - Math.sin(angle) * size + Math.sin(angle + Math.PI / 2) * size * 0.6
        };
        const right = {
            x: to.x - Math.cos(angle) * size + Math.cos(angle - Math.PI / 2) * size * 0.6,
            y: to.y - Math.sin(angle) * size + Math.sin(angle - Math.PI / 2) * size * 0.6
        };
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.closePath();
        ctx.fill();
    };

    ctx.save();
    ctx.strokeStyle = colors.uiIcon;
    ctx.lineWidth = C.UI_ICON_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(iconPath[0].x, iconPath[0].y);
    for (let i = 1; i < iconPath.length; i++) {
        ctx.lineTo(iconPath[i].x, iconPath[i].y);
    }
    ctx.stroke();

    ctx.fillStyle = colors.uiIcon;
    basePoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, C.UI_ICON_VERTEX_RADIUS + 0.5, 0, Math.PI * 2);
        ctx.fill();
    });

    if (style?.linearStyle === 'arrows') {
        drawArrowHead(p1, p2);
        drawArrowHead(p2, p3);
    }
    ctx.restore();
}

function drawInterpolationPanel(ctx, htmlOverlay, state, updateHtmlLabel) {
    const { canvasUI, colors, activeInterpolationStyleId, selectedInterpolationStyleId, interpolationStyles } = state;

    canvasUI.interpolationIcons.forEach(icon => {
        const rect = { x: icon.x, y: icon.y, width: icon.width, height: icon.height };
        if (icon.type === 'interpolationStyle') {
            const isActive = icon.styleId === (selectedInterpolationStyleId || activeInterpolationStyleId);
            ctx.strokeStyle = colors.uiDefault;
            ctx.lineWidth = C.UI_MENU_ICON_BORDER_WIDTH;
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
            if (isActive) {
                const padding = 2;
                ctx.strokeStyle = colors.selectionGlow;
                ctx.lineWidth = C.UI_BUTTON_BORDER_WIDTH;
                ctx.strokeRect(
                    rect.x - padding,
                    rect.y - padding,
                    rect.width + padding * 2,
                    rect.height + padding * 2
                );
            }
            const style = interpolationStyles.find(item => item.id === icon.styleId);
            drawInterpolationToolIcon(ctx, rect, colors, style);

            const styleName = style?.name || '';
            if (styleName && styleName.toLowerCase() !== 'linear') {
                updateHtmlLabel({
                    id: `interpolation-label-${icon.styleId}`,
                    content: styleName.length > 6 ? `${styleName.slice(0, 6)}...` : styleName,
                    x: rect.x + rect.width / 2,
                    y: rect.y + rect.height + 10,
                    color: colors.uiTextDefault,
                    fontSize: C.UI_ICON_LABEL_FONT_SIZE,
                    options: { textAlign: 'center', textBaseline: 'top' }
                }, htmlOverlay);
            }
        } else if (icon.type === 'interpolationRemove') {
            ctx.strokeStyle = colors.uiDefault;
            ctx.lineWidth = C.UI_MENU_ICON_BORDER_WIDTH;
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
            ctx.beginPath();
            ctx.moveTo(rect.x + rect.width * 0.25, rect.y + rect.height / 2);
            ctx.lineTo(rect.x + rect.width * 0.75, rect.y + rect.height / 2);
            ctx.strokeStyle = colors.uiIcon;
            ctx.lineWidth = C.UI_ICON_LINE_WIDTH;
            ctx.stroke();
        } else if (icon.type === 'interpolationAdd') {
            ctx.strokeStyle = colors.uiDefault;
            ctx.lineWidth = C.UI_MENU_ICON_BORDER_WIDTH;
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
            ctx.beginPath();
            ctx.moveTo(rect.x + rect.width / 2, rect.y + rect.height * 0.25);
            ctx.lineTo(rect.x + rect.width / 2, rect.y + rect.height * 0.75);
            ctx.moveTo(rect.x + rect.width * 0.25, rect.y + rect.height / 2);
            ctx.lineTo(rect.x + rect.width * 0.75, rect.y + rect.height / 2);
            ctx.stroke();
        }
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

   const cmb = canvasUI.colorModeToolButton;
   if (cmb) {
       const rect = cmb;
       const iconRect = {
           x: rect.x,
           y: rect.y,
           width: rect.width,
           height: rect.height
       };
       const drawRgbTriangleEdges = (rect) => {
           const { vertices } = getTriangleIconGeometry(rect);
           const edgePairs = [
               [vertices[0], vertices[1]],
               [vertices[1], vertices[2]],
               [vertices[2], vertices[0]]
           ];
           const edgeColors = ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)'];
           edgePairs.forEach((pair, index) => {
               ctx.strokeStyle = edgeColors[index];
               ctx.lineWidth = 2;
               ctx.beginPath();
               ctx.moveTo(pair[0].x, pair[0].y);
               ctx.lineTo(pair[1].x, pair[1].y);
               ctx.stroke();
           });
       };
       drawRgbTriangleEdges(iconRect);
       ctx.fillStyle = '#ffffff';
       drawTriangleIcon(ctx, iconRect, { edgeState: 'none', faceState: 'filled', vertexState: 'none', faceColor: '#ffffff' }, colors);
   }

   const ttb = canvasUI.transformToolButton;
   if (ttb) {
       updateHtmlLabel({ id: 'transform-tool-label', content: C.UI_TRANSFORM_TOOL_LABEL_TEXT, x: ttb.x + ttb.width / 2, y: ttb.y + ttb.height / 2, color: colors.uiIcon, fontSize: C.UI_TRANSFORM_TOOL_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
   }

   const itb = canvasUI.interpolationToolButton;
   if (itb) {
       drawInterpolationToolIcon(ctx, itb, colors);
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

   const stb = canvasUI.sessionsToolButton;
   if (stb) {
       ctx.save();
       ctx.strokeStyle = colors.uiDefault;
       ctx.lineWidth = C.UI_ICON_LINE_WIDTH_SMALL;
       const inset = 6;
       const size = Math.min(stb.width, stb.height) - inset * 2;
       const x = stb.x + inset;
       const y = stb.y + inset;
       ctx.strokeRect(x + 4, y + 2, size, size);
       ctx.strokeRect(x, y + 6, size, size);
       ctx.restore();
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
    const { dpr, isToolbarExpanded, isColorPaletteExpanded, isColorModePanelExpanded, isInterpolationPanelExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isVisibilityPanelExpanded, isSessionsPanelExpanded,
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
    if (isColorModePanelExpanded) {
        drawColorModePanel(ctx, htmlOverlay, state, updateHtmlLabel);
    }
    if (isInterpolationPanelExpanded) {
        drawInterpolationPanel(ctx, htmlOverlay, state, updateHtmlLabel);
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
    if (isSessionsPanelExpanded) {
        drawSessionsPanel(ctx, state);
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
        return C.UI_COLOR_TARGET_UNASSIGNED;
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
                    options: {  rotation: rotationDeg } 
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

export function drawDragFeedback(ctx, htmlOverlay, targetVertexId, currentVertexStates, { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors }, dataToScreen, findNeighbors, getEdgeId, isSnapping = false, excludedEdgeId = null, updateHtmlLabel = null, selectedVertexIds = [], isDragging = false, initialDragVertexStates = [], activeCenterId = null, snappedVertexIds = new Map()) {
    const feedbackColor = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;

    const liveVertices = new Map(currentVertexStates.map(p => [p.id, { ...p }]));
    const getLiveVertex = (id) => liveVertices.get(id);

    const vertex = getLiveVertex(targetVertexId);
    if (!vertex) return;

    const neighbors = findNeighbors(vertex.id).map(getLiveVertex).filter(Boolean);
    const vertexScreen = dataToScreen(vertex);
    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    const snapEntries = snappedVertexIds.get(targetVertexId) || [];
    const projectionSnap = snapEntries.find(s => s.type === 'projection' && s.projectionLine);

    if (projectionSnap) {
        const [p1, p2] = projectionSnap.projectionLine;
        const p1Screen = dataToScreen(p1);
        const p2Screen = dataToScreen(p2);

        const lineVec = { x: p2Screen.x - p1Screen.x, y: p2Screen.y - p1Screen.y };
        const lineLen = Math.hypot(lineVec.x, lineVec.y);
        if (lineLen > 0) {
            const lineNorm = { x: lineVec.x / lineLen, y: lineVec.y / lineLen };

            const ext = 10000;
            const start = { x: p1Screen.x - lineNorm.x * ext, y: p1Screen.y - lineNorm.y * ext };
            const end = { x: p1Screen.x + lineNorm.x * ext, y: p1Screen.y + lineNorm.y * ext };

            ctx.save();
            ctx.strokeStyle = feedbackColor;
            ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
            ctx.setLineDash(C.DASH_PATTERN_SMALL);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ... (the rest of the function remains unchanged) ...

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
        const dataAngle = Math.atan2(vertex.y - originalVertexState.y, vertex.x - originalVertexState.x);

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
                const highPrecisionSigFigs = distanceSigFigs + 2;
                distText = U.formatNumber(U.distance(originalVertexState, vertex), highPrecisionSigFigs);
            }
            const midX = (p1Screen.x + p2Screen.x) / 2;
            const midY = (p1Screen.y + p2Screen.y) / 2;

            let textPerpAngle;
            if (showAngles && Math.abs(dataAngle) > C.GEOMETRY_CALCULATION_EPSILON) {
                const angleTurnScreen = -dataAngle;
                if (angleTurnScreen < 0) {
                    textPerpAngle = dragVectorAngle - Math.PI / 2;
                } else {
                    textPerpAngle = dragVectorAngle + Math.PI / 2;
                }
            } else {
                textPerpAngle = dragVectorAngle - Math.PI / 2;
                if (Math.sin(textPerpAngle) > 0) {
                    textPerpAngle += Math.PI;
                }
            }

            const distanceTextX = midX + Math.cos(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
            const distanceTextY = midY + Math.sin(textPerpAngle) * C.FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
            let rotationDeg = dragVectorAngle * (180 / Math.PI);
            if (rotationDeg > 90 || rotationDeg < -90) {
                rotationDeg += 180;
            }
            updateHtmlLabel({ id: `drag-dist-vector-${vertex.id}`, content: distText, x: distanceTextX, y: distanceTextY, color: feedbackColor, fontSize: C.FEEDBACK_LABEL_FONT_SIZE, options: {  rotation: rotationDeg } }, htmlOverlay);
        }

        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = feedbackColor;
        ctx.lineWidth = C.FEEDBACK_LINE_VISUAL_WIDTH;
        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);
        ctx.stroke();
        ctx.restore();

        if (showAngles && Math.abs(dragVectorAngle) > C.GEOMETRY_CALCULATION_EPSILON) {
            drawAngleArc(ctx, p1Screen, 0, dataAngle, C.FEEDBACK_ARC_RADIUS_SCREEN, feedbackColor);

            let angleText;
            if (angleDisplayMode === C.ANGLE_DISPLAY_MODE_DEGREES) {
                angleText = `${U.formatNumber(dataAngle * (180 / Math.PI), angleSigFigs)}^{\\circ}`;
            } else {
                angleText = U.formatNumber(dataAngle, angleSigFigs);
            }

            if (angleText) {
                const bisectorAngleRad = -dataAngle / 2.0;
                const offset = C.UI_ANGLE_LABEL_OFFSET;

                const rotatedPoint = {
                    x: offset * Math.cos(bisectorAngleRad),
                    y: offset * Math.sin(bisectorAngleRad)
                };
                const labelScreenPos = {
                    x: p1Screen.x + rotatedPoint.x,
                    y: p1Screen.y + rotatedPoint.y
                };

                let rotationDeg = bisectorAngleRad * (180 / Math.PI);
                if (rotationDeg > 90 || rotationDeg < -90) {
                    rotationDeg += 180;
                }

                updateHtmlLabel({
                    id: `drag-angle-vector-${vertex.id}`,
                    content: angleText,
                    x: labelScreenPos.x,
                    y: labelScreenPos.y,
                    color: feedbackColor,
                    fontSize: C.FEEDBACK_LABEL_FONT_SIZE,
                    options: { rotation: rotationDeg }
                }, htmlOverlay);
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
                    options: {  rotation: rotationDeg } 
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
                const labelId = `drag-angle-${vertex.id}-${p1.id}-${p2.id}`;

                const pointOnBisectorData = {
                    x: vertex.x + Math.cos(bisectorAngle),
                    y: vertex.y + Math.sin(bisectorAngle)
                };
                const pointOnBisectorScreen = dataToScreen(pointOnBisectorData);
                const screenBisectorAngleRad = Math.atan2(pointOnBisectorScreen.y - vertexScreen.y, pointOnBisectorScreen.x - vertexScreen.x);

                const offset = C.UI_ANGLE_LABEL_OFFSET;

                const rotatedPoint = {
                    x: offset * Math.cos(screenBisectorAngleRad),
                    y: offset * Math.sin(screenBisectorAngleRad)
                };
                const labelScreenPos = {
                    x: vertexScreen.x + rotatedPoint.x,
                    y: vertexScreen.y + rotatedPoint.y
                };

                let rotationDeg = screenBisectorAngleRad * (180 / Math.PI);
                if (rotationDeg > 90 || rotationDeg < -90) {
                    rotationDeg += 180;
                }

                updateHtmlLabel({
                    id: labelId,
                    content: angleText,
                    x: labelScreenPos.x,
                    y: labelScreenPos.y,
                    color: feedbackColor,
                    fontSize: C.FEEDBACK_LABEL_FONT_SIZE,
                    options: { rotation: rotationDeg }
                }, htmlOverlay);
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
    const xColor = coordSystemSnapScale !== null ? colors.feedbackSnapped : colors.coordSysX;
    const yColor = coordSystemSnapScale !== null ? colors.feedbackSnapped : colors.coordSysY;

    drawArrow(centerScreen, xAxisScreenEnd, xColor, xColor);
    drawArrow(centerScreen, yAxisScreenEnd, yColor, yColor);

    ctx.fillStyle = colors.coordSysOrigin;
    ctx.beginPath();
    ctx.arc(centerScreen.x, centerScreen.y, C.FACE_COORD_SYSTEM_ORIGIN_RADIUS, 0, 2 * Math.PI);
    ctx.fill();

    ctx.restore();
}
