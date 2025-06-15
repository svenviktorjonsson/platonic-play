function getBestSnapPosition(mouseDataPos) {
    const candidates = [];
    const distanceSq = (p1, p2) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
    const snapRadiusDataSq = Math.pow(GHOST_SNAP_RADIUS_SCREEN / viewTransform.scale, 2);
    
    if (gridDisplayMode !== 'none') {
        if (gridDisplayMode === 'polar') {
            const dominantRadialInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (dominantRadialInterval > 0) {
                const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180 / Math.PI + 360) % 360;
                const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
                const snappedRadius = Math.round(mouseRadius / dominantRadialInterval) * dominantRadialInterval;

                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        const angularInterval = level.angle;
                        const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                        const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                        const gridPoint = { x: snappedRadius * Math.cos(snappedAngleRad), y: snappedRadius * Math.sin(snappedAngleRad) };
                        candidates.push({ pos: gridPoint, distSq: distanceSq(mouseDataPos, gridPoint) });
                    }
                });
            }
        } else {
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (gridInterval > 0) {
                const gridPoint = { x: Math.round(mouseDataPos.x / gridInterval) * gridInterval, y: Math.round(mouseDataPos.y / gridInterval) * gridInterval };
                candidates.push({ pos: gridPoint, distSq: distanceSq(mouseDataPos, gridPoint) });
            }
        }
    }

    allPoints.forEach(p => { if (p.type === 'regular') candidates.push({ pos: p, distSq: distanceSq(mouseDataPos, p) }); });
    allEdges.forEach(edge => {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === 'regular' && p2.type === 'regular') {
            const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            candidates.push({ pos: midpoint, distSq: distanceSq(mouseDataPos, midpoint) });
        }
    });
    if (candidates.length === 0) return null;
    const bestCandidate = candidates.sort((a, b) => a.distSq - b.distSq)[0];
    if (bestCandidate.distSq < snapRadiusDataSq) return bestCandidate.pos;
    return null;
}

function getTransformSnap(center, mouseDataPos, startReferencePoint, transformType) {
    const allCandidates = [];
    const startVector = { x: startReferencePoint.x - center.x, y: startReferencePoint.y - center.y };
    const startDist = Math.hypot(startVector.x, startVector.y);
    const startAngle = Math.atan2(startVector.y, startVector.x);

    if (gridDisplayMode !== 'none') {
        const mouseRelativeToCenter = { x: mouseDataPos.x - center.x, y: mouseDataPos.y - center.y };

        if (gridDisplayMode === 'polar') {
            const dominantRadialInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (dominantRadialInterval > 0) {
                const mouseAngleDeg = (Math.atan2(mouseRelativeToCenter.y, mouseRelativeToCenter.x) * 180 / Math.PI + 360) % 360;
                const mouseRadius = Math.hypot(mouseRelativeToCenter.x, mouseRelativeToCenter.y);
                const snappedRadius = Math.round(mouseRadius / dominantRadialInterval) * dominantRadialInterval;
                
                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        const angularInterval = level.angle;
                        const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                        const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                        allCandidates.push({
                            pos: { x: center.x + snappedRadius * Math.cos(snappedAngleRad), y: center.y + snappedRadius * Math.sin(snappedAngleRad) },
                            type: 'grid', pureRotation: null, pureScale: null
                        });
                    }
                });
            }
        } else {
            const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (gridInterval > 0) {
                const snappedRelativeX = Math.round(mouseRelativeToCenter.x / gridInterval) * gridInterval;
                const snappedRelativeY = Math.round(mouseRelativeToCenter.y / gridInterval) * gridInterval;
                allCandidates.push({
                    pos: { x: center.x + snappedRelativeX, y: center.y + snappedRelativeY },
                    type: 'grid', pureRotation: null, pureScale: null
                });
            }
        }
    }

    if (startDist > GEOMETRY_CALCULATION_EPSILON) {
        const scaleSnapFactors = SNAP_FACTORS.filter(f => f > 0);
        const angleSnapFractions = NINETY_DEG_ANGLE_SNAP_FRACTIONS;
        const useAngleSnaps = transformType !== 'center_scale_only';
        const useScaleSnaps = transformType !== 'center_rotate_only';
        const rotationSnaps = useAngleSnaps ? angleSnapFractions.flatMap(f => (f === 0 ? [0] : [f * Math.PI / 2, -f * Math.PI / 2])) : [0];
        const scaleSnaps = useScaleSnaps ? scaleSnapFactors : [1];
        for (const rot of rotationSnaps) {
            for (const factor of scaleSnaps) {
                const dist = startDist * factor;
                allCandidates.push({
                    pos: { x: center.x + dist * Math.cos(startAngle + rot), y: center.y + dist * Math.sin(startAngle + rot) },
                    type: 'transform', pureRotation: rot, pureScale: factor
                });
            }
        }
    }

    if (allCandidates.length === 0) return { snapped: false };

    let bestCandidate = allCandidates.reduce((best, current) => {
        const distSq = (p, c) => (p.x - c.pos.x) ** 2 + (p.y - c.pos.y) ** 2;
        return distSq(mouseDataPos, current) < distSq(mouseDataPos, best) ? current : best;
    });

    const finalVec = { x: bestCandidate.pos.x - center.x, y: bestCandidate.pos.y - center.y };
    const finalScale = (startDist > GEOMETRY_CALCULATION_EPSILON) ? Math.hypot(finalVec.x, finalVec.y) / startDist : 1;
    let finalRotation;
    if (bestCandidate.pureRotation !== null) {
        const rawMouseRotation = normalizeAngleToPi(Math.atan2(mouseDataPos.y - center.y, mouseDataPos.x - center.x) - startAngle);
        const pureRot = bestCandidate.pureRotation;
        const rotationsToTest = [pureRot, pureRot + 2 * Math.PI, pureRot - 2 * Math.PI];
        finalRotation = rotationsToTest.reduce((best, current) => {
            return Math.abs(current - rawMouseRotation) < Math.abs(best - rawMouseRotation) ? current : best;
        });
    } else {
        finalRotation = normalizeAngleToPi(Math.atan2(finalVec.y, finalVec.x) - startAngle);
    }
    return {
        snapped: true, pos: bestCandidate.pos, rotation: finalRotation,
        scale: bestCandidate.pureScale ?? finalScale,
        pureScaleForDisplay: bestCandidate.pureScale
    };
}

function getSnappedPosition(startPoint, mouseScreenPos, shiftPressed) {
    const mouseDataPos = screenToData(mouseScreenPos);
    const drawingContext = getDrawingContext(startPoint.id);
    const snapStickinessRadius = SNAP_STICKINESS_RADIUS_SCREEN / viewTransform.scale;
    const snapRadiusData = POINT_SELECT_RADIUS / viewTransform.scale;
    for (const p of allPoints) {
        if (p.id !== startPoint.id && p.type === "regular" && distance(mouseDataPos, p) < snapRadiusData) {
            const finalAngleRad = Math.atan2(p.y - startPoint.y, p.x - startPoint.x) || 0;
            return { x: p.x, y: p.y, angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, p), snapped: true, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null, angleTurn: normalizeAngleToPi(finalAngleRad, 0), gridToGridSquaredSum: null, gridInterval: null };
        }
    }
    const segmentSnapThresholdData = EDGE_CLICK_THRESHOLD / viewTransform.scale;
    for (const edge of allEdges) {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (p1 && p2 && p1.type === "regular" && p2.type === "regular" && p1.id !== startPoint.id && p2.id !== startPoint.id) {
            const closest = getClosestPointOnLineSegment(mouseDataPos, p1, p2);
            if (closest.distance < segmentSnapThresholdData && closest.onSegmentStrict) {
                const finalAngleRad = Math.atan2(closest.y - startPoint.y, closest.x - startPoint.x) || 0;
                return { x: closest.x, y: closest.y, angle: finalAngleRad * (180 / Math.PI), distance: distance(startPoint, closest), snapped: true, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null, angleTurn: normalizeAngleToPi(finalAngleRad, 0), gridToGridSquaredSum: null, gridInterval: null };
            }
        }
    }
    if (isDrawingMode && shiftPressed) {
        const allCandidates = [];
        if (gridDisplayMode !== 'none' && lastGridState.interval1) {
            if (gridDisplayMode === 'polar') {
                const dominantRadialInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                if (dominantRadialInterval > 0) {
                    const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180 / Math.PI + 360) % 360;
                    const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
                    const snappedRadius = Math.round(mouseRadius / dominantRadialInterval) * dominantRadialInterval;
                    lastAngularGridState.forEach(level => {
                        if (level.alpha > 0.01 && level.angle > 0) {
                            const angularInterval = level.angle;
                            const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                            const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                            allCandidates.push({
                                x: snappedRadius * Math.cos(snappedAngleRad),
                                y: snappedRadius * Math.sin(snappedAngleRad),
                                isGridPoint: true
                            });
                        }
                    });
                }
            } else {
                const dominantGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                const baseGridX = Math.round(mouseDataPos.x / dominantGridInterval) * dominantGridInterval;
                const baseGridY = Math.round(mouseDataPos.y / dominantGridInterval) * dominantGridInterval;
                allCandidates.push({ x: baseGridX, y: baseGridY, isGridPoint: true });
            }
        }
        const rawAngle = normalizeAngleToPi(Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x));
        const rawDist = distance(startPoint, mouseDataPos);
        const referenceAngleForSnapping = drawingContext.currentSegmentReferenceA_for_display;
        const baseUnitDistance = drawingContext.currentSegmentReferenceD;
        const symmetricalAngleFractions = new Set([0, ...NINETY_DEG_ANGLE_SNAP_FRACTIONS.flatMap(f => [f, -f])]);
        const sortedSymmetricalFractions = Array.from(symmetricalAngleFractions).sort((a, b) => a - b);
        const allSnapAngles = sortedSymmetricalFractions.map(f => ({ factor: f, angle: normalizeAngleToPi(drawingContext.offsetAngleRad + (f * referenceAngleForSnapping)), turn: normalizeAngleToPi(f * referenceAngleForSnapping) }));
        const allSnapDistances = [];
        for (let i = 1; i <= DRAW_SNAP_DISTANCE_FACTOR_LIMIT / DRAW_SNAP_DISTANCE_FACTOR_STEP; i++) {
            const factor = i * DRAW_SNAP_DISTANCE_FACTOR_STEP;
            allSnapDistances.push({ factor: factor, dist: factor * baseUnitDistance });
        }
        if (allSnapAngles.length > 0 && allSnapDistances.length > 0) {
            const closestAngleIndex = allSnapAngles.reduce((bestI, current, i) => Math.abs(normalizeAngleToPi(current.angle - rawAngle)) < Math.abs(normalizeAngleToPi(allSnapAngles[bestI].angle - rawAngle)) ? i : bestI, 0);
            const closestDistIndex = allSnapDistances.reduce((bestI, current, i) => Math.abs(current.dist - rawDist) < Math.abs(allSnapDistances[bestI].dist - rawDist) ? i : bestI, 0);
            const candidateAngles = [];
            for (let i = -DRAW_SNAP_CANDIDATE_COUNT_PER_SIDE; i <= DRAW_SNAP_CANDIDATE_COUNT_PER_SIDE; i++) {
                const index = (closestAngleIndex + i + allSnapAngles.length) % allSnapAngles.length;
                candidateAngles.push(allSnapAngles[index]);
            }
            const candidateDistances = [];
            for (let i = -DRAW_SNAP_CANDIDATE_COUNT_PER_SIDE; i <= DRAW_SNAP_CANDIDATE_COUNT_PER_SIDE; i++) {
                const index = closestDistIndex + i;
                if (index >= 0 && index < allSnapDistances.length) { candidateDistances.push(allSnapDistances[index]); }
            }
            candidateAngles.forEach(angleData => {
                candidateDistances.forEach(distData => {
                    allCandidates.push({ x: startPoint.x + distData.dist * Math.cos(angleData.angle), y: startPoint.y + distData.dist * Math.sin(angleData.angle), isGridPoint: false, lengthSnapFactor: distData.factor, angleSnapFactor: angleData.factor, angleTurn: angleData.turn });
                });
            });
        }
        if (allCandidates.length > 0) {
            const bestSnapPoint = allCandidates.reduce((best, current) => distance(mouseDataPos, current) < distance(mouseDataPos, best) ? current : best);
            if (distance(mouseDataPos, bestSnapPoint) < snapStickinessRadius) {
                const finalAngle = Math.atan2(bestSnapPoint.y - startPoint.y, bestSnapPoint.x - startPoint.x);
                let gridToGridSquaredSum = null;
                let finalGridInterval = null;
                if (bestSnapPoint.isGridPoint && gridDisplayMode !== 'polar') {
                    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                    const epsilon = gridInterval * GEOMETRY_CALCULATION_EPSILON;
                    const startIsOnGridX = Math.abs(startPoint.x / gridInterval - Math.round(startPoint.x / gridInterval)) < epsilon;
                    const startIsOnGridY = Math.abs(startPoint.y / gridInterval - Math.round(startPoint.y / gridInterval)) < epsilon;
                    if (startIsOnGridX && startIsOnGridY) {
                        const deltaX = bestSnapPoint.x - startPoint.x;
                        const deltaY = bestSnapPoint.y - startPoint.y;
                        const dx_grid = Math.round(deltaX / gridInterval);
                        const dy_grid = Math.round(deltaY / gridInterval);
                        gridToGridSquaredSum = dx_grid * dx_grid + dy_grid * dy_grid;
                        finalGridInterval = gridInterval;
                    }
                }
                return {
                    x: bestSnapPoint.x, y: bestSnapPoint.y,
                    angle: finalAngle * (180 / Math.PI),
                    distance: distance(startPoint, bestSnapPoint),
                    snapped: true, gridSnapped: !!bestSnapPoint.isGridPoint,
                    lengthSnapFactor: bestSnapPoint.lengthSnapFactor || null,
                    angleSnapFactor: bestSnapPoint.angleSnapFactor || null,
                    angleTurn: bestSnapPoint.angleTurn ?? normalizeAngleToPi(finalAngle, 0),
                    gridToGridSquaredSum: gridToGridSquaredSum, gridInterval: finalGridInterval,
                };
            }
        }
    }
    const finalAngleRad = Math.atan2(mouseDataPos.y - startPoint.y, mouseDataPos.x - startPoint.x) || 0;
    return {
        x: mouseDataPos.x, y: mouseDataPos.y,
        angle: finalAngleRad * (180 / Math.PI),
        distance: distance(startPoint, mouseDataPos),
        snapped: false, gridSnapped: false, lengthSnapFactor: null, angleSnapFactor: null,
        angleTurn: normalizeAngleToPi(finalAngleRad, 0),
        gridToGridSquaredSum: null, gridInterval: null
    };
}

function getDragSnapPosition(dragOrigin, mouseDataPos) {
    const neighbors = findNeighbors(dragOrigin.id).map(id => allPoints.find(p => p.id === id)).filter(Boolean);
    const distanceSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    const lineToSnapRadius = LINE_TO_SNAP_RADIUS_SCREEN / viewTransform.scale;
    const pointOnLineSnapRadius = POINT_ON_LINE_SNAP_RADIUS_SCREEN / viewTransform.scale;
    let bestBisector = null;
    let minDistToBisector = Infinity;
    let bestBisectorNeighbors = null;
    for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
            const p1 = neighbors[i];
            const p2 = neighbors[j];
            const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const perpVec = { x: -(p2.y - p1.y), y: p2.x - p1.x };
            if (Math.hypot(perpVec.x, perpVec.y) < GEOMETRY_CALCULATION_EPSILON) continue;
            const bisectorP1 = { x: midPoint.x - perpVec.x * 100000, y: midPoint.y - perpVec.y * 100000 };
            const bisectorP2 = { x: midPoint.x + perpVec.x * 100000, y: midPoint.y + perpVec.y * 100000 };
            const closestPointOnLine = getClosestPointOnLineSegment(mouseDataPos, bisectorP1, bisectorP2);
            if (closestPointOnLine.distance < minDistToBisector) {
                minDistToBisector = closestPointOnLine.distance;
                bestBisector = { p1: bisectorP1, p2: bisectorP2, projection: closestPointOnLine };
                bestBisectorNeighbors = [p1, p2];
            }
        }
    }
    if (bestBisector && minDistToBisector < lineToSnapRadius) {
        const secondOrderCandidates = [];
        const [p1, p2] = bestBisectorNeighbors;
        const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const d_half = distance(p1, midPoint);
        const perpVec = { x: -(p2.y - p1.y), y: p2.x - p1.x };
        const perpVecMag = Math.hypot(perpVec.x, perpVec.y);
        if (d_half > GEOMETRY_CALCULATION_EPSILON && perpVecMag > GEOMETRY_CALCULATION_EPSILON) {
            const normPerpVec = { x: perpVec.x / perpVecMag, y: perpVec.y / perpVecMag };
            const geometricSnapAnglesRad = NINETY_DEG_ANGLE_SNAP_FRACTIONS
                .map(f => f * (Math.PI / 2))
                .filter(angle => angle > GEOMETRY_CALCULATION_EPSILON && angle < Math.PI);
            geometricSnapAnglesRad.forEach(angleRad => {
                const tanHalfTheta = Math.tan(angleRad / 2);
                if (Math.abs(tanHalfTheta) > GEOMETRY_CALCULATION_EPSILON) {
                    const h = d_half / tanHalfTheta;
                    secondOrderCandidates.push({ x: midPoint.x + h * normPerpVec.x, y: midPoint.y + h * normPerpVec.y });
                }
            });
        }
        if (gridDisplayMode !== 'none') {
            const topLeftData = screenToData({ x: 0, y: 0 });
            const bottomRightData = screenToData({ x: canvas.width / dpr, y: canvas.height / dpr });
            const maxViewDim = Math.max(Math.abs(bottomRightData.x - topLeftData.x), Math.abs(topLeftData.y - bottomRightData.y));
            if (gridDisplayMode === 'polar') {
                const dominantRadialInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                for(let r = dominantRadialInterval; r < maxViewDim; r += dominantRadialInterval) {
                    secondOrderCandidates.push(...getLineCircleIntersection(bestBisector, { center: {x:0, y:0}, radius: r }));
                }
                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        for (let angle = 0; angle < 360; angle += level.angle) {
                            const rad = angle * Math.PI / 180;
                            const rayLine = { p1: {x:0, y:0}, p2: {x: Math.cos(rad), y: Math.sin(rad)} };
                            const intersection = getLineLineIntersection(bestBisector, rayLine);
                            if(intersection) secondOrderCandidates.push(intersection);
                        }
                    }
                });
            } else {
                const dominantGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
                const startX = Math.floor(topLeftData.x / dominantGridInterval) * dominantGridInterval;
                const endX = Math.ceil(bottomRightData.x / dominantGridInterval) * dominantGridInterval;
                const startY = Math.floor(bottomRightData.y / dominantGridInterval) * dominantGridInterval;
                const endY = Math.ceil(topLeftData.y / dominantGridInterval) * dominantGridInterval;
                for (let x = startX; x <= endX; x += dominantGridInterval) {
                    const intersection = getLineLineIntersection(bestBisector, { p1: { x: x, y: -100000 }, p2: { x: x, y: 100000 } });
                    if (intersection) secondOrderCandidates.push(intersection);
                }
                for (let y = startY; y <= endY; y += dominantGridInterval) {
                    const intersection = getLineLineIntersection(bestBisector, { p1: { x: -100000, y: y }, p2: { x: 100000, y: y } });
                    if (intersection) secondOrderCandidates.push(intersection);
                }
            }
        }
        if (secondOrderCandidates.length > 0) {
            const projectedPos = { x: bestBisector.projection.x, y: bestBisector.projection.y };
            const bestOnLineCandidate = secondOrderCandidates.reduce((best, current) => distanceSq(projectedPos, current) < distanceSq(projectedPos, best) ? current : best);
            if (distance(projectedPos, bestOnLineCandidate) < pointOnLineSnapRadius) {
                return { point: bestOnLineCandidate, snapped: true, constraints: null };
            }
        }
        return { point: { x: bestBisector.projection.x, y: bestBisector.projection.y }, snapped: true, constraints: null };
    }
    let allCandidates = [];
    if (gridDisplayMode !== 'none') {
        if(gridDisplayMode === 'polar') {
            const dominantRadialInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            if (dominantRadialInterval > 0) {
                const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180/Math.PI + 360) % 360;
                const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
                const snappedRadius = Math.round(mouseRadius / dominantRadialInterval) * dominantRadialInterval;
                lastAngularGridState.forEach(level => {
                    if (level.alpha > 0.01 && level.angle > 0) {
                        const angularInterval = level.angle;
                        const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                        const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                        allCandidates.push({x: snappedRadius * Math.cos(snappedAngleRad), y: snappedRadius * Math.sin(snappedAngleRad)});
                    }
                });
            }
        } else {
            const dominantGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
            const baseGridX = Math.round(mouseDataPos.x / dominantGridInterval) * dominantGridInterval;
            const baseGridY = Math.round(mouseDataPos.y / dominantGridInterval) * dominantGridInterval;
            allCandidates.push({ x: baseGridX, y: baseGridY});
        }
    }
    for (const p of allPoints) {
        if (p.id !== dragOrigin.id && p.type === 'regular') {
            allCandidates.push({ x: p.x, y: p.y });
        }
    }
    if (gridDisplayMode !== 'polar') {
        const majorSnapAnglesRad = NINETY_DEG_ANGLE_SNAP_FRACTIONS.map(f => f * (Math.PI / 2)).filter(angle => angle > GEOMETRY_CALCULATION_EPSILON && angle < Math.PI);
        const majorSortedSnapDistances = DRAG_SNAP_GEOMETRIC_DISTANCE_FACTORS.map(f => f * DEFAULT_REFERENCE_DISTANCE);
        for (let i = 0; i < neighbors.length; i++) {
            for (let j = i + 1; j < neighbors.length; j++) {
                for (const d1 of majorSortedSnapDistances) {
                    for (const alpha of majorSnapAnglesRad) {
                        allCandidates.push(...solveForPoint(neighbors[i], neighbors[j], d1, alpha));
                    }
                }
            }
        }
    }
    if (allCandidates.length === 0) return { point: mouseDataPos, snapped: false };
    const bestCandidate = allCandidates.reduce((best, current) => distanceSq(mouseDataPos, current) < distanceSq(mouseDataPos, best) ? current : best);
    const snapStickinessRadius = SNAP_STICKINESS_RADIUS_SCREEN / viewTransform.scale;
    if (distance(mouseDataPos, bestCandidate) < snapStickinessRadius) {
        return { point: bestCandidate, snapped: true, constraints: { dist: bestCandidate.dist || null, angle: bestCandidate.angle || null } };
    }
    return { point: mouseDataPos, snapped: false };
}