import * as C from './constants.js';


export function formatNumber(value, sigFigs, forceScientific = false) {
    if (value === 0) return "0";
    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    let formattedString;
    if (forceScientific || absValue >= C.SCIENTIFIC_NOTATION_UPPER_BOUND || (absValue !== 0 && absValue < C.SCIENTIFIC_NOTATION_LOWER_BOUND)) {
        if (value === 0) return "0";
        const expStr = absValue.toExponential(Math.max(0, sigFigs - 1));
        const parts = expStr.split('e');
        let coefficient = parseFloat(parts[0]).toString();
        let exponent = parseInt(parts[1], 10);
        formattedString = `${coefficient} \\cdot 10^{${exponent}}`;
    } else {
        const integerDigits = absValue < 1 ? 0 : Math.floor(Math.log10(absValue)) + 1;
        let decimalPlacesToDisplay;
        if (absValue === 0) {
            decimalPlacesToDisplay = sigFigs - 1;
        } else if (absValue < 1) {
            let k = 0;
            let temp = absValue;
            while (temp < 1 && k < sigFigs + 5) {
                temp *= 10;
                k++;
            }
            decimalPlacesToDisplay = Math.max(0, (k - 1) + sigFigs);
        } else {
            decimalPlacesToDisplay = Math.max(0, sigFigs - integerDigits);
        }
        let fixedStr = absValue.toFixed(decimalPlacesToDisplay);
        let num = parseFloat(fixedStr);
        if (Math.abs(num) === 0 && value !== 0) {
            return "0";
        }
        formattedString = Math.abs(num).toString();
    }
    return sign + formattedString;
}

export function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

export function getEdgeId(edge) {
    return edge.id1 < edge.id2 
        ? `${edge.id1}${C.EDGE_ID_DELIMITER}${edge.id2}` 
        : `${edge.id2}${C.EDGE_ID_DELIMITER}${edge.id1}`;
}

export function distanceToSegment(px, py, x1, y1, x2, y2) {
    // Compute vector AB = (x2 - x1, y2 - y1)
    const abX = x2 - x1;
    const abY = y2 - y1;
    
    // Compute squared length
    const lSquared = abX * abX + abY * abY;
    
    // If points are the same, distance is to that point
    if (lSquared === 0) {
        const dx = px - x1;
        const dy = py - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Compute projection parameter t = -((x1 - px) * (x2 - x1) + (y1 - py) * (y2 - y1)) / l_squared
    let t = -((x1 - px) * abX + (y1 - py) * abY) / lSquared;
    
    // Clamp t to [0, 1]
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    
    // Compute closest point C = (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    const cX = x1 + t * abX;
    const cY = y1 + t * abY;
    
    // Compute distance from point to closest point
    const dx = px - cX;
    const dy = py - cY;
    return Math.sqrt(dx * dx + dy * dy);
}

export function getFaceId(face) {
    if (face.id) return face.id;
    if (face.vertexIds) {
        return `face_${[...face.vertexIds].sort().join('_')}`;
    }
    return null;
}

export function getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, angularGridState, getMultipleRect = false) {
    const candidates = [];
    if (gridDisplayMode === 'none' || !gridInterval || gridInterval <= 0) {
        return candidates;
    }

    if (gridDisplayMode === 'polar') {
        const mouseAngleDeg = (Math.atan2(mouseDataPos.y, mouseDataPos.x) * 180 / Math.PI + 360) % 360;
        const mouseRadius = Math.hypot(mouseDataPos.x, mouseDataPos.y);
        const snappedRadius = Math.round(mouseRadius / gridInterval) * gridInterval;

        angularGridState.forEach(level => {
            if (level.alpha > 0.01 && level.angle > 0) {
                const angularInterval = level.angle;
                const snappedAngleDeg = Math.round(mouseAngleDeg / angularInterval) * angularInterval;
                const snappedAngleRad = snappedAngleDeg * Math.PI / 180;
                candidates.push({ x: snappedRadius * Math.cos(snappedAngleRad), y: snappedRadius * Math.sin(snappedAngleRad), isGridPoint: true });
            }
        });
    } else if (gridDisplayMode === 'triangular') {
        const y_step = gridInterval * C.TRIANGULAR_GRID_Y_STEP_FACTOR;
        const i_f = (mouseDataPos.x / gridInterval) - (mouseDataPos.y / (gridInterval * Math.sqrt(3)));
        const j_f = mouseDataPos.y / y_step;

        let i_r = Math.round(i_f);
        let j_r = Math.round(j_f);
        let k_r = Math.round(-i_f - j_f);

        const i_diff = Math.abs(i_r - i_f);
        const j_diff = Math.abs(j_r - j_f);
        const k_diff = Math.abs(k_r - (-i_f - j_f));

        if (i_diff > j_diff && i_diff > k_diff) {
            i_r = -j_r - k_r;
        } else if (j_diff > k_diff) {
            j_r = -i_r - k_r;
        }

        const snappedX = i_r * gridInterval + j_r * gridInterval / 2;
        const snappedY = j_r * y_step;
        candidates.push({ x: snappedX, y: snappedY, isGridPoint: true });
    } else {
        if (getMultipleRect) {
            const gridX = Math.floor(mouseDataPos.x / gridInterval) * gridInterval;
            const gridY = Math.floor(mouseDataPos.y / gridInterval) * gridInterval;
            candidates.push(
                { x: gridX, y: gridY, isGridPoint: true },
                { x: gridX + gridInterval, y: gridY, isGridPoint: true },
                { x: gridX, y: gridY + gridInterval, isGridPoint: true },
                { x: gridX + gridInterval, y: gridY + gridInterval, isGridPoint: true }
            );
        } else {
            candidates.push({ x: Math.round(mouseDataPos.x / gridInterval) * gridInterval, y: Math.round(mouseDataPos.y / gridInterval) * gridInterval, isGridPoint: true });
        }
    }
    return candidates;
}

export function findAllVertexMerges(sourceVertices, targetVertices, snapRadius) {
    const mergeCandidates = [];

    for (const source of sourceVertices) {
        for (const target of targetVertices) {
            // A vertex cannot snap to itself.
            // This checks if they represent the same original vertex at the same transformation step.
            if (source.originalId === target.originalId && source.transformIndex === target.transformIndex) {
                continue;
            }

            const dist = distance(source, target);
            if (dist < snapRadius) {
                mergeCandidates.push({
                    dist,
                    sourceVertex: source,
                    targetVertex: target,
                    // A target is "static" if it's not a moving copy (i.e., it has no transformIndex or its index is 0).
                    targetIsStatic: target.transformIndex === undefined || target.transformIndex === 0
                });
            }
        }
    }
    return mergeCandidates;
}

export function findVertexToEdgeSnaps(sourceVertices, targetEdges, snapRadius) {
    const candidates = [];
    console.log(`[DEBUG-4] findVertexToEdgeSnaps: Checking ${sourceVertices.length} sources against ${targetEdges.length} targets.`);

    for (const sourceVertex of sourceVertices) {
        for (const targetEdge of targetEdges) {
            if (!targetEdge || !targetEdge.originalEdge || !targetEdge.p1 || !targetEdge.p2) {
                continue;
            }
            
            const isSameInstance = sourceVertex.transformIndex === targetEdge.transformIndex;
            const isOwnEndpoint = sourceVertex.originalId === targetEdge.originalEdge.id1 || sourceVertex.originalId === targetEdge.originalEdge.id2;

            if (isSameInstance && isOwnEndpoint) {
                continue;
            }

            const closest = getClosestPointOnLineSegment(sourceVertex, targetEdge.p1, targetEdge.p2);
            const shouldSnap = closest.distance < snapRadius && closest.onSegmentStrict;

            if (shouldSnap) {
                const edgeId = getEdgeId(targetEdge.originalEdge);
                console.log(`[DEBUG-5] findVertexToEdgeSnaps: SUCCESS! V:${sourceVertex.originalId} is snapping to E:${edgeId}. Dist: ${closest.distance.toFixed(4)}`);
                candidates.push({
                    dist: closest.distance,
                    sourceVertex: sourceVertex,
                    targetEdge: targetEdge,
                    snapPoint: { x: closest.x, y: closest.y },
                    snapType: 'vertex-to-edge'
                });
            }
        }
    }
    return candidates;
}

export function generateUniqueId() {
    return crypto.randomUUID();
}

export function normalizeAngle(angleRad) {
    while (angleRad < 0) angleRad += C.RADIANS_IN_CIRCLE;
    while (angleRad >= C.RADIANS_IN_CIRCLE) angleRad -= C.RADIANS_IN_CIRCLE;
    return angleRad;
}

export function calculateRotationAngle(initialStartAngle, currentMouseAngle, totalAccumulatedRotationFromStart = 0) {
    let rawDeltaAngle = currentMouseAngle - initialStartAngle;
    let numRevolutions = Math.round((totalAccumulatedRotationFromStart - rawDeltaAngle) / (2 * Math.PI));
    let continuousDeltaAngle = rawDeltaAngle + numRevolutions * (2 * Math.PI);
    return continuousDeltaAngle;
}

export function normalizeAngleToPi(angleRad) {
    angleRad = normalizeAngle(angleRad);
    if (angleRad > Math.PI) {
        angleRad -= C.RADIANS_IN_CIRCLE;
    }
    return angleRad;
}

export function normalizeAngleDegrees(angleDeg) {
    while (angleDeg < 0) angleDeg += C.DEGREES_IN_CIRCLE;
    while (angleDeg >= C.DEGREES_IN_CIRCLE) angleDeg -= C.DEGREES_IN_CIRCLE;
    return angleDeg;
}

export function getLineCircleIntersection(line, circle) {
    const { p1, p2 } = line;
    const { center, radius } = circle;
    const d = { x: p2.x - p1.x, y: p2.y - p1.y };
    const f = { x: p1.x - center.x, y: p1.y - center.y };
    const a = d.x * d.x + d.y * d.y;
    const b = 2 * (f.x * d.x + f.y * d.y);
    const c = f.x * f.x + f.y * f.y - radius * radius;
    let discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return [];

    discriminant = Math.sqrt(discriminant);
    const t1 = (-b - discriminant) / (2 * a);
    const t2 = (-b + discriminant) / (2 * a);

    return [
        { x: p1.x + t1 * d.x, y: p1.y + t1 * d.y },
        { x: p1.x + t2 * d.x, y: p1.y + t2 * d.y }
    ];
}

export function getLineLineIntersection(line1, line2) {
    const p1 = line1.p1, p2 = line1.p2, p3 = line2.p1, p4 = line2.p2;
    const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(den) < C.GEOMETRY_CALCULATION_EPSILON) return null;
    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
    
    if (u >= 0 && u <= 1) {
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }
    return null;
}

export function simplifySquareRoot(n) {
    if (n < 0 || !Number.isInteger(n)) return [null, null];
    if (n === 0) return [0, 1];
    
    let coefficient = 1;
    let radicand = n;

    for (let i = 2; i * i <= radicand; i++) {
        while (radicand % (i * i) === 0) {
            radicand /= (i * i);
            coefficient *= i;
        }
    }

    return [coefficient, radicand];
}

export function formatSimplifiedRoot(coeff, radicand, symbol = '') {
    const symString = symbol ? `\\${symbol}` : '';

    if (radicand === 1) {
        if (coeff === 1 && symbol) return symString;
        return `${coeff}${symString}`;
    }
    if (coeff === 1) {
        return `\\sqrt{${radicand}}${symString}`;
    }
    return `${coeff}\\sqrt{${radicand}}${symString}`;
}

export function distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

export function formatFraction(decimal, tolerance = C.FRACTION_FORMAT_TOLERANCE, maxDisplayDenominator = C.FRACTION_FORMAT_MAX_DENOMINATOR) {
    if (Math.abs(decimal) < C.ZERO_TOLERANCE) return "0";
    const originalSign = decimal < 0 ? "-" : "";
    const absDecimal = Math.abs(decimal);

    if (Math.abs(absDecimal - Math.round(absDecimal)) < tolerance) {
        const rounded = Math.round(absDecimal);
        return originalSign + rounded.toString();
    }

    const fractions = [
        [1,2],[1,3],[2,3],[1,4],[3,4],[1,5],[2,5],[3,5],[4,5],[1,6],[5,6],
        [1,8],[3,8],[5,8],[7,8],[1,10],[3,10],[7,10],[9,10],
        [1,12],[5,12],[7,12],[11,12],[1,16],[3,16],[5,16],[7,16],[9,16],[11,16],[13,16],[15,16]
    ];

    for (const [num, den] of fractions) {
        if (den <= maxDisplayDenominator) {
            if (Math.abs(absDecimal - num/den) < tolerance) {
                return originalSign + `${num}/${den}`;
            }
        }
    }

    for (let currentDen = 1; currentDen <= maxDisplayDenominator; currentDen++) {
        const currentNum = Math.round(absDecimal * currentDen);
        if (currentNum === 0 && absDecimal > C.ZERO_TOLERANCE) continue;
        if (Math.abs(absDecimal - currentNum / currentDen) < tolerance / currentDen) {
            const common = gcd(currentNum, currentDen);
            const n = currentNum/common;
            const d = currentDen/common;
            if (d === 1) return originalSign + `${n}`;
            return originalSign + `${n}/${d}`;
        }
    }
    let fixedPrecision = 2;
        if (absDecimal < 0.01) fixedPrecision = 3;
    else if (absDecimal < 0.1)  fixedPrecision = 2;
    else if (absDecimal < 10)   fixedPrecision = 1;
    else                        fixedPrecision = 0;
    
    return originalSign + absDecimal.toFixed(fixedPrecision);
}

export function isVertexInPolygon(vertex, vertices) {
    if (vertices.length < 3) return false;

    const x = vertex.x;
    const y = vertex.y;
    let inside = false;

    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].x;
        const yi = vertices[i].y;
        const xj = vertices[j].x;
        const yj = vertices[j].y;

        // Check if the point is on a vertex of the polygon
        if ((xi === x && yi === y)) {
            return true;
        }

        // Check if the point is on a horizontal or vertical edge
        if (yi === yj && yi === y && x >= Math.min(xi, xj) && x <= Math.max(xi, xj)) {
            return true; // On a horizontal edge
        }
        if (xi === xj && xi === x && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) {
            return true; // On a vertical edge
        }

        // Standard ray-casting intersection test, which now correctly handles non-horizontal edges
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}

export function applyDirectionalProjection(vertex, center, startVector) {
    const vec = { x: vertex.x - center.x, y: vertex.y - center.y };
    const axis_dist = Math.hypot(startVector.x, startVector.y);
    const axis_norm = { x: startVector.x / axis_dist, y: startVector.y / axis_dist };
    const parallel_dist = vec.x * axis_norm.x + vec.y * axis_norm.y;
    const perp_vec = { x: vec.x - parallel_dist * axis_norm.x, y: vec.y - parallel_dist * axis_norm.y };
    
    return {
        x: center.x + perp_vec.x,
        y: center.y + perp_vec.y
    };
}

export function parseColor(colorString) {
    if (!colorString || typeof colorString !== 'string') {
        return { r: 255, g: 255, b: 255, a: 1.0 };
    }
    
    if (colorString.startsWith('rgba(')) {
        const match = colorString.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
        if (match) {
            return {
                r: Math.max(0, Math.min(255, parseInt(match[1]))),
                g: Math.max(0, Math.min(255, parseInt(match[2]))),
                b: Math.max(0, Math.min(255, parseInt(match[3]))),
                a: Math.max(0, Math.min(1, parseFloat(match[4])))
            };
        }
    }
    
    if (colorString.startsWith('rgb(')) {
        const match = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return {
                r: Math.max(0, Math.min(255, parseInt(match[1]))),
                g: Math.max(0, Math.min(255, parseInt(match[2]))),
                b: Math.max(0, Math.min(255, parseInt(match[3]))),
                a: 1.0
            };
        }
    }
    
    if (colorString.startsWith('#')) {
        const hex = colorString.slice(1);
        if (hex.length === 6) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
                a: 1.0
            };
        }
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
                a: 1.0
            };
        }
    }
    
    return { r: 255, g: 255, b: 255, a: 1.0 };
}

export function findCoordinateSystemElement(screenPos, face, dataToScreen) {
    const coordSystem = face.localCoordSystem;
    if (!coordSystem) return null;

    const centerScreen = dataToScreen(coordSystem.origin);
    const centerSelectRadius = C.COORD_SYSTEM_ELEMENT_SELECT_RADIUS;

    if (distance(screenPos, centerScreen) < centerSelectRadius) {
        return { face, type: 'center' };
    }

    const armSelectThreshold = C.COORD_SYSTEM_AXIS_SELECT_THRESHOLD;

    const xAxisEndGlobal = localToGlobal({ x: 1, y: 0 }, coordSystem);
    const xAxisScreenEnd = dataToScreen(xAxisEndGlobal);
    const closestOnX = getClosestPointOnLineSegment(screenPos, centerScreen, xAxisScreenEnd);
    if (closestOnX.distance < armSelectThreshold) {
        return { face, type: 'x_axis' };
    }

    const yAxisEndGlobal = localToGlobal({ x: 0, y: 1 }, coordSystem);
    const yAxisScreenEnd = dataToScreen(yAxisEndGlobal);
    const closestOnY = getClosestPointOnLineSegment(screenPos, centerScreen, yAxisScreenEnd);
    if (closestOnY.distance < armSelectThreshold) {
        return { face, type: 'y_axis' };
    }

    return null;
}

export function clampPointToPolygon(point, vertices) {
    if (isVertexInPolygon(point, vertices)) {
        return point;
    }
    
    let closestPoint = point;
    let minDistance = Infinity;
    
    // Check distance to each edge and find closest point
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const edgeClosest = getClosestPointOnLineSegment(point, v1, v2);
        
        if (edgeClosest.distance < minDistance) {
            minDistance = edgeClosest.distance;
            closestPoint = { x: edgeClosest.x, y: edgeClosest.y };
        }
    }
    
    return closestPoint;
}

export function getClickedUIElement(screenPos, canvasUI, { isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isVisibilityPanelExpanded }) {
    const isInside = (pos, rect) => {
        if (!rect) return false;
        return pos.x >= rect.x && pos.x <= rect.x + rect.width &&
               pos.y >= rect.y && pos.y <= rect.y + rect.height;
    };

    if (isColorPaletteExpanded) {
        for (const icon of (canvasUI.colorTargetIcons || [])) {
            if (isInside(screenPos, icon)) return { ...icon, type: 'colorTargetIcon' };
        }
        for (const swatch of (canvasUI.colorSwatches || [])) {
            if (isInside(screenPos, swatch)) return { ...swatch, type: 'colorSwatch' };
        }
        if (isInside(screenPos, canvasUI.applyColorsButton)) return { ...canvasUI.applyColorsButton, type: 'button' };
        if (isInside(screenPos, canvasUI.randomColorButton)) return { ...canvasUI.randomColorButton, type: 'button' };
        if (isInside(screenPos, canvasUI.removeColorButton)) return { ...canvasUI.removeColorButton, type: 'button' };
        if (isInside(screenPos, canvasUI.addColorButton)) return { ...canvasUI.addColorButton, type: 'button' };
    }

    if (isTransformPanelExpanded) {
        for (const icon of (canvasUI.transformIcons || [])) {
            if (isInside(screenPos, icon)) return { ...icon, type: 'transformIcon' };
        }
    }
    
    if (isDisplayPanelExpanded) {
        for (const icon of (canvasUI.displayIcons || [])) {
            if (isInside(screenPos, icon)) return { ...icon, type: 'displayIcon' };
        }
    }
    
    if (isVisibilityPanelExpanded) {
        for (const icon of (canvasUI.visibilityIcons || [])) {
            if (isInside(screenPos, icon)) return { ...icon, type: 'visibilityIcon' };
        }
    }

    if (isToolbarExpanded) {
        if (isInside(screenPos, canvasUI.colorToolButton)) return { ...canvasUI.colorToolButton, type: 'toolButton' };
        if (isInside(screenPos, canvasUI.transformToolButton)) return { ...canvasUI.transformToolButton, type: 'toolButton' };
        if (isInside(screenPos, canvasUI.displayToolButton)) return { ...canvasUI.displayToolButton, type: 'toolButton' };
        if (isInside(screenPos, canvasUI.visibilityToolButton)) return { ...canvasUI.visibilityToolButton, type: 'toolButton' };
        if (isInside(screenPos, canvasUI.themeToggleButton)) return { ...canvasUI.themeToggleButton, type: 'toolButton' };
    }

    if (isInside(screenPos, canvasUI.toolbarButton)) return { ...canvasUI.toolbarButton, type: 'menuButton' };

    return null;
}

export function normalize(v) {
    const mag = Math.hypot(v.x, v.y);
    if (mag === 0) return { x: 0, y: 0 };
    return { x: v.x / mag, y: v.y / mag };
}

export function getClosestPointOnLineSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const acx = p.x - a.x;
    const acy = p.y - a.y;
    const lenSqAB = abx * abx + aby * aby;

    if (lenSqAB === 0) {
        return { x: a.x, y: a.y, distance: distance(p, a), onSegmentStrict: true, t: 0 };
    }
    let t = (acx * abx + acy * aby) / lenSqAB;
    const onSegmentStrict = t > C.ON_SEGMENT_STRICT_T_MIN && t < C.ON_SEGMENT_STRICT_T_MAX;
    const clampedT = Math.max(0, Math.min(1, t));
    const closestX = a.x + clampedT * abx;
    const closestY = a.y + clampedT * aby;
    const dist = distance(p, { x: closestX, y: closestY });
    return { x: closestX, y: closestY, distance: dist, onSegmentStrict: onSegmentStrict, t: clampedT };
}

export function getClosestPointOnLine(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const acx = p.x - a.x;
    const acy = p.y - a.y;
    const lenSqAB = abx * abx + aby * aby;

    if (lenSqAB === 0) {
        return { x: a.x, y: a.y, distance: distance(p, a) };
    }
    let t = (acx * abx + acy * aby) / lenSqAB;
    const closestX = a.x + t * abx;
    const closestY = a.y + t * aby;
    const dist = distance(p, { x: closestX, y: closestY });
    return { x: closestX, y: closestY, distance: dist };
}

export function findCircleFromPointsAndAngle(p1, p2, referenceAngle, referencePointForSide) {
    if (Math.abs(referenceAngle) < C.GEOMETRY_CALCULATION_EPSILON || Math.abs(referenceAngle - Math.PI) < C.GEOMETRY_CALCULATION_EPSILON) {
        return null;
    }

    const d = distance(p1, p2);
    const radius = Math.abs((d / 2) / Math.sin(referenceAngle));
    
    const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const h = Math.sqrt(Math.max(0, radius * radius - (d / 2) * (d / 2)));
    
    const perpVec = { x: -(p2.y - p1.y), y: p2.x - p1.x };
    const perpVecMag = Math.hypot(perpVec.x, perpVec.y);
    const perpVecNorm = { x: perpVec.x / perpVecMag, y: perpVec.y / perpVecMag };
    
    const center1 = { x: midPoint.x + h * perpVecNorm.x, y: midPoint.y + h * perpVecNorm.y };
    const center2 = { x: midPoint.x - h * perpVecNorm.x, y: midPoint.y - h * perpVecNorm.y };

    const crossProduct = (p2.x - p1.x) * (referencePointForSide.y - p1.y) - (p2.y - p1.y) * (referencePointForSide.x - p1.x);
    const crossProductCenter1 = (p2.x - p1.x) * (center1.y - p1.y) - (p2.y - p1.y) * (center1.x - p1.x);

    const center = (crossProduct * crossProductCenter1 > 0) ? center1 : center2;
    
    return { center, radius };
}

export function getMousePosOnCanvas(event, canvasElement) {
    const rect = canvasElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function findFacesToSplit(vertexId1, vertexId2, allFaces, findVertexById) {
    const facesToSplit = [];
    
    allFaces.forEach(face => {
        if (!face.vertexIds || face.vertexIds.length < 3) return;
        
        const hasVertex1 = face.vertexIds.includes(vertexId1);
        const hasVertex2 = face.vertexIds.includes(vertexId2);
        
        
        if (hasVertex1 && hasVertex2) {
            const index1 = face.vertexIds.indexOf(vertexId1);
            const index2 = face.vertexIds.indexOf(vertexId2);
            const faceLength = face.vertexIds.length;
            
            const areAdjacent = 
                (index1 === (index2 + 1) % faceLength) || 
                (index2 === (index1 + 1) % faceLength);
            
            
            if (!areAdjacent) {
                facesToSplit.push(face);
            }
        }
    });
    
    return facesToSplit;
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
}

export function getCoordinateSystemSnapPosition(mouseDataPos, snapTargets, isShiftPressed, gridDisplayMode, lastGridState, lastAngularGridState) {
    if (!isShiftPressed) {
        return mouseDataPos;
    }
    
    let closestSnap = null;
    let minDistance = Infinity;
    
    if (snapTargets) {
        // Check vertex snaps
        snapTargets.vertices.forEach(vertex => {
            const dist = distance(mouseDataPos, vertex);
            if (dist < minDistance) {
                minDistance = dist;
                closestSnap = vertex;
            }
        });
        
        // Check edge midpoints
        snapTargets.edgeMidvertices.forEach(midpoint => {
            const dist = distance(mouseDataPos, midpoint);
            if (dist < minDistance) {
                minDistance = dist;
                closestSnap = midpoint;
            }
        });
        
        // Check other face centers
        snapTargets.faceCenters.forEach(center => {
            const dist = distance(mouseDataPos, center);
            if (dist < minDistance) {
                minDistance = dist;
                closestSnap = center;
            }
        });
    }
    
    // Check grid snaps
    if (gridDisplayMode && gridDisplayMode !== 'none' && lastGridState && lastGridState.interval1) {
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) 
            ? lastGridState.interval2 
            : lastGridState.interval1;
        
        const gridCandidates = getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true);
        gridCandidates.forEach(gridPoint => {
            const dist = distance(mouseDataPos, gridPoint);
            if (dist < minDistance) {
                minDistance = dist;
                closestSnap = gridPoint;
            }
        });
    }
    
    return closestSnap || mouseDataPos;
}

export function getAxisSnapAngle(mouseDataPos, origin, isShiftPressed, snapTargets, snapRadius = null) {
    const rawAngle = Math.atan2(mouseDataPos.y - origin.y, mouseDataPos.x - origin.x);
    
    if (!isShiftPressed || !snapTargets) {
        return { angle: rawAngle, edgeIndex: null, snapType: null, snapped: false, targetVertexId: null };
    }
    
    const snapThreshold = C.COORD_SYSTEM_AXIS_SNAP_THRESHOLD_RAD;
    let bestSnap = { angle: rawAngle, difference: Infinity, edgeIndex: null, snapType: null, targetVertexId: null };

    const priorities = {
        edge: 1,
        vertex_direction: 2,
        cardinal: 3
    };

    const checkSnap = (snapAngle, snapType, edgeIndex = null, targetVertexId = null) => {
        const normalizedSnap = normalizeAngleToPi(snapAngle);
        const diff = Math.abs(normalizeAngleToPi(rawAngle - normalizedSnap));

        if (diff < snapThreshold) {
            const newSnapPriority = priorities[snapType];
            const oldSnapPriority = bestSnap.snapType ? priorities[bestSnap.snapType] : Infinity;
            
            if (newSnapPriority < oldSnapPriority) {
                bestSnap = { angle: normalizedSnap, difference: diff, edgeIndex, snapType, targetVertexId };
            } else if (newSnapPriority === oldSnapPriority && diff < bestSnap.difference) {
                bestSnap = { angle: normalizedSnap, difference: diff, edgeIndex, snapType, targetVertexId };
            }
        }
    };

    // Check for snaps in order of priority (lower is better)
    
    // Priority 1: Edges
    if (snapTargets.edgeAngles) {
        snapTargets.edgeAngles.forEach((angle, edgeIndex) => {
            [angle, angle + Math.PI / 2, angle - Math.PI / 2, angle + Math.PI].forEach(checkAngle => {
                checkSnap(checkAngle, 'edge', edgeIndex);
            });
        });
    }

    // Priority 2: Vertices
    if (snapTargets.vertices) {
        snapTargets.vertices.forEach(vertex => {
            if (distance(origin, vertex) > C.GEOMETRY_CALCULATION_EPSILON) {
                const angleToVertex = Math.atan2(vertex.y - origin.y, vertex.x - origin.x);
                checkSnap(angleToVertex, 'vertex_direction', null, vertex.id);
            }
        });
    }

    // Priority 3: Cardinal Directions
    const cardinalAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    cardinalAngles.forEach(angle => checkSnap(angle, 'cardinal'));
    
    return {
        angle: bestSnap.angle,
        edgeIndex: bestSnap.edgeIndex,
        snapType: bestSnap.snapType,
        snapped: bestSnap.difference < Infinity,
        targetVertexId: bestSnap.targetVertexId
    };
}

export function getAxisScaleSnap(origin, axisAngle, snapTargets, face, findVertexById, currentScale = null, viewTransform = null, draggedAxisType = 'x_axis') {
    if (!currentScale || !viewTransform || !snapTargets.alignedEdgeInfo) {
        return { snapped: false };
    }
    
    const pixelSnapThreshold = C.COORD_SYSTEM_AXIS_SCALE_SNAP_THRESHOLD_PIXELS / viewTransform.scale;
    let snapCandidates = [];
    
    const { v1Id, v2Id } = snapTargets.alignedEdgeInfo;
    const v1 = findVertexById(v1Id);
    const v2 = findVertexById(v2Id);
    
    if (v1 && v2 && v1.type === 'regular' && v2.type === 'regular') {
        const edgeLength = distance(v1, v2);
        const fractions = [0.25, 1/3, 0.5, 2/3, 0.75, 1.0];
        
        fractions.forEach(frac => {
            const targetScale = edgeLength * frac;
            const scaleDifference = Math.abs(currentScale - targetScale);
            
            snapCandidates.push({
                scale: targetScale,
                distance: scaleDifference,
                type: 'edge_fraction',
                priority: frac === 0.5 ? 1 : (frac === 1.0 ? 2 : 3),
                fraction: frac
            });
        });
    }
    
    if (snapCandidates.length === 0) {
        return { snapped: false };
    }

    snapCandidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.distance - b.distance;
    });
    
    const closestSnap = snapCandidates.find(candidate => candidate.distance < pixelSnapThreshold);
    
    if (closestSnap) {
        return {
            snapped: true,
            scale: closestSnap.scale,
            snapType: 'edge_fraction',
            edgeFraction: closestSnap.fraction
        };
    }
    
    return { snapped: false };
}

export function getCoordinateSystemCenterSnap(mouseDataPos, snapTargets, gridDisplayMode, lastGridState, lastAngularGridState) {
    let bestSnap = null;
    let minDistance = Infinity;
    
    if (snapTargets) {
        // Check vertex snaps
        if (snapTargets.vertices) {
            snapTargets.vertices.forEach(vertex => {
                const dist = distance(mouseDataPos, vertex);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestSnap = {
                        snapped: true,
                        snapPoint: vertex,
                        snapType: 'vertex',
                        vertexId: vertex.id
                    };
                }
            });
        }
        
        // Check edge midpoints
        if (snapTargets.edgeMidvertices) {
            snapTargets.edgeMidvertices.forEach(midpoint => {
                const dist = distance(mouseDataPos, midpoint);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestSnap = {
                        snapped: true,
                        snapPoint: { x: midpoint.x, y: midpoint.y },
                        snapType: 'edge',
                        edgeInfo: { v1: midpoint.v1, v2: midpoint.v2 }
                    };
                }
            });
        }
        
        // Check other face centers
        if (snapTargets.faceCenters) {
            snapTargets.faceCenters.forEach(center => {
                const dist = distance(mouseDataPos, center);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestSnap = {
                        snapped: true,
                        snapPoint: center,
                        snapType: 'faceCenter'
                    };
                }
            });
        }
    }
    
    // Check grid snaps
    if (gridDisplayMode && gridDisplayMode !== 'none' && lastGridState && lastGridState.interval1) {
        const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) 
            ? lastGridState.interval2 
            : lastGridState.interval1;
        
        const gridCandidates = getGridSnapCandidates(mouseDataPos, gridDisplayMode, gridInterval, lastAngularGridState, true);
        gridCandidates.forEach(gridPoint => {
            const dist = distance(mouseDataPos, gridPoint);
            if (dist < minDistance) {
                minDistance = dist;
                bestSnap = {
                    snapped: true,
                    snapPoint: gridPoint,
                    snapType: 'grid'
                };
            }
        });
    }
    
    return bestSnap || { snapped: false };
}

export function invertGrayscaleValue(value) {
    if (Array.isArray(value)) {
        const [h, s, l] = rgbToHsl(value[0], value[1], value[2]);
        const invertedL = 1 - l;
        const [newR, newG, newB] = hslToRgb(h, s, invertedL);
        return [newR, newG, newB];
    }
    
    if (typeof value === 'string') {
        if (value.startsWith('rgba(')) {
            const match = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (match) {
                const [, r, g, b, a] = match;
                const rVal = parseInt(r), gVal = parseInt(g), bVal = parseInt(b);
                const [h, s, l] = rgbToHsl(rVal, gVal, bVal);
                const invertedL = 1 - l;
                const [newR, newG, newB] = hslToRgb(h, s, invertedL);
                return `rgba(${newR}, ${newG}, ${newB}, ${a})`;
            }
        }
        
        if (value.startsWith('#')) {
            if (value.length === 7) {
                const r = parseInt(value.slice(1, 3), 16);
                const g = parseInt(value.slice(3, 5), 16);
                const b = parseInt(value.slice(5, 7), 16);
                const [h, s, l] = rgbToHsl(r, g, b);
                const invertedL = 1 - l;
                const [newR, newG, newB] = hslToRgb(h, s, invertedL);
                return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
            }
        }
        
        if (value === 'white') return 'black';
        if (value === 'black') return 'white';
    }
    
    return value;
}

export function shoelaceArea(vertices) {
    let area = 0.0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += vertices[i].x * vertices[j].y;
        area -= vertices[j].x * vertices[i].y;
    }
    return area / 2.0;
}

export function clamp(v, minv, maxv) {
    return Math.max(minv, Math.min(maxv, v));
}

export function computeAngle(prev, curr, next) {
    const u = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v = { x: next.x - curr.x, y: next.y - curr.y };
    const dot = u.x * v.x + u.y * v.y;
    const mag_u = Math.hypot(u.x, u.y);
    const mag_v = Math.hypot(v.x, v.y);
    if (mag_u === 0 || mag_v === 0) return Math.PI;
    const cos_theta = dot / (mag_u * mag_v);
    return Math.acos(clamp(cos_theta, -1, 1));
}

export function triangulatePolygon(vertices) {
    let n = vertices.length;
    if (n < 3) return [];
    
    let area = shoelaceArea(vertices);
    let windingSign = area > 0 ? 1 : (area < 0 ? -1 : 1);
    
    const triangles = [];
    const indices = Array.from({length: n}, (_, i) => i);
    
    function isEar(i, verts, indices, windingSign) {
        const prevIdx = (i - 1 + indices.length) % indices.length;
        const currIdx = i;
        const nextIdx = (i + 1) % indices.length;
        
        const prev = verts[indices[prevIdx]];
        const curr = verts[indices[currIdx]];
        const next = verts[indices[nextIdx]];
        
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        const cross = dx1 * dy2 - dy1 * dx2;
        if (cross * windingSign <= 0) return false;
        
        const tri = [prev, curr, next];
        for (let j = 0; j < indices.length; j++) {
            const idx = indices[j];
            if (idx === indices[prevIdx] || idx === indices[currIdx] || idx === indices[nextIdx]) continue;
            if (vertexInTriangle(verts[idx], tri)) return false;
        }
        return true;
    }
    
    function vertexInTriangle(pt, tri) {
        const [p1, p2, p3] = tri;
        const denom = (p2.y - p3.y) * (p1.x - p3.x) + (p3.x - p2.x) * (p1.y - p3.y);
        if (Math.abs(denom) < 1e-10) return false;
        
        const a = ((p2.y - p3.y) * (pt.x - p3.x) + (p3.x - p2.x) * (pt.y - p3.y)) / denom;
        const b = ((p3.y - p1.y) * (pt.x - p3.x) + (p1.x - p3.x) * (pt.y - p3.y)) / denom;
        const c = 1 - a - b;
        
        return a >= 0 && a <= 1 && b >= 0 && b <= 1 && c >= 0 && c <= 1;
    }
    
    while (indices.length > 3) {
        const ears = [];
        for (let i = 0; i < indices.length; i++) {
            if (isEar(i, vertices, indices, windingSign)) {
                const prevIdx = (i - 1 + indices.length) % indices.length;
                const currIdx = i;
                const nextIdx = (i + 1) % indices.length;
                const angle = computeAngle(vertices[indices[prevIdx]], vertices[indices[currIdx]], vertices[indices[nextIdx]]);
                ears.push({ index: i, angle });
            }
        }
        
        if (ears.length === 0) break;
        
        ears.sort((a, b) => a.angle - b.angle);
        
        const earToClip = ears[0];
        const i = earToClip.index;
        
        const prev = indices[(i - 1 + indices.length) % indices.length];
        const curr = indices[i];
        const next = indices[(i + 1) % indices.length];
        
        triangles.push([prev, curr, next]);
        indices.splice(i, 1);
    }
    
    if (indices.length === 3) {
        triangles.push([indices[0], indices[1], indices[2]]);
    }
    
    return triangles;
}

export function getCurrentTheme(activeThemeName, darkTheme) {
    if (activeThemeName === 'light') {
        return C.LIGHT_THEME;
    }
    return darkTheme;
}

export function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (6 * (2 / 3 - t));
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function formatSnapFactor(factor, symbol) {
    const fractionStr = formatFraction(factor, 0.001);
    const newSymbol = symbol === 'A' ? '\\theta' : (symbol === 'D' ? '\\delta' : symbol);
    
    if (fractionStr === "0") return `0${newSymbol}`;
    if (fractionStr === "1") return newSymbol;
    if (fractionStr === "-1") return `-${newSymbol}`;

    if (fractionStr.endsWith("/1")) {
        return `${fractionStr.slice(0, -2)}${newSymbol}`;
    }

    if (fractionStr.includes('/')) {
        let sign = '';
        let workStr = fractionStr;
        if (workStr.startsWith('-')) {
            sign = '-';
            workStr = workStr.substring(1);
        }

        const parts = workStr.split('/');
        const num = parts[0];
        const den = parts[1];
        
        if (num === "1") return `${sign}\\frac{1}{${den}}${newSymbol}`;
        return `${sign}\\frac{${num}}{${den}}${newSymbol}`;
    }
    return `${fractionStr}${newSymbol}`;
}

export function applyTransformToVertex(vertex, center, rotation, scale, directionalScale, startVector) {
    const pointVector = { x: vertex.x - center.x, y: vertex.y - center.y };

    if (directionalScale) {
        const startDist = Math.hypot(startVector.x, startVector.y);
        if (startDist > C.GEOMETRY_CALCULATION_EPSILON) {
            const startNormalized = { x: startVector.x / startDist, y: startVector.y / startDist };

            const parallelComponent = (pointVector.x * startNormalized.x + pointVector.y * startNormalized.y);
            const perpVector = {
                x: pointVector.x - parallelComponent * startNormalized.x,
                y: pointVector.y - parallelComponent * startNormalized.y
            };

            const scaledParallelComponent = parallelComponent * scale;

            const newVector = {
                x: scaledParallelComponent * startNormalized.x + perpVector.x,
                y: scaledParallelComponent * startNormalized.y + perpVector.y
            };

            return { x: center.x + newVector.x, y: center.y + newVector.y };
        }
        return { x: vertex.x, y: vertex.y };
    } else {
        let transformedVector = { ...pointVector };

        transformedVector.x *= scale;
        transformedVector.y *= scale;

        const x = transformedVector.x;
        const y = transformedVector.y;
        transformedVector.x = x * Math.cos(rotation) - y * Math.sin(rotation);
        transformedVector.y = x * Math.sin(rotation) + y * Math.cos(rotation);

        return { x: center.x + transformedVector.x, y: center.y + transformedVector.y };
    }
}

export function calculateIncenter(vertices) {
    if (vertices.length < 3) return null;

    if (vertices.length === 3) {
        const [a, b, c] = vertices;
        const sideA = distance(b, c);
        const sideB = distance(a, c);
        const sideC = distance(a, b);
        const perimeter = sideA + sideB + sideC;
        if (perimeter < C.GEOMETRY_CALCULATION_EPSILON) return null;
        const incenterX = (sideA * a.x + sideB * b.x + sideC * c.x) / perimeter;
        const incenterY = (sideA * a.y + sideB * b.y + sideC * c.y) / perimeter;
        const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
        const inradius = (2 * area) / perimeter;
        return {
            center: { x: incenterX, y: incenterY },
            radius: inradius
        };
    }

    return findLargestInscribedCircle(vertices);
}


export function getCorrectionVectorForCircleSnap(point, circleCenter, circleRadius) {
    const vectorToPoint = { x: point.x - circleCenter.x, y: point.y - circleCenter.y };
    const mag = Math.hypot(vectorToPoint.x, vectorToPoint.y);

    if (mag < C.GEOMETRY_CALCULATION_EPSILON) {
        return { x: 0, y: 0 };
    }

    const snappedPoint = {
        x: circleCenter.x + (vectorToPoint.x / mag) * circleRadius,
        y: circleCenter.y + (vectorToPoint.y / mag) * circleRadius
    };
    
    return {
        x: snappedPoint.x - point.x,
        y: snappedPoint.y - point.y
    };
}

export function getBestFractionalSnap(pointOnEdge, p1, p2) {
    const bestFraction = C.ALT_SNAP_FRACTIONS.reduce((best, current) => {
        return Math.abs(current - pointOnEdge.t) < Math.abs(best - pointOnEdge.t) ? current : best;
    });
    
    const finalPoint = {
        x: p1.x + bestFraction * (p2.x - p1.x),
        y: p1.y + bestFraction * (p2.y - p1.y)
    };
    
    return {
        fraction: bestFraction,
        point: finalPoint
    };
}

export function findLargestInscribedCircle(vertices) {
    if (vertices.length < 3) return null;

    let centroid = {
        x: vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length,
        y: vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length
    };

    if (!isVertexInPolygon(centroid, vertices)) {
        centroid.x = (vertices[0].x + vertices[1].x + vertices[2].x) / 3;
        centroid.y = (vertices[0].y + vertices[1].y + vertices[2].y) / 3;
    }

    let bestCenter = centroid;
    let bestRadius = distanceToPolygonEdges(centroid, vertices);

    for (let iter = 0; iter < C.INSCRIBED_CIRCLE_ITERATIONS; iter++) {
        let improved = false;
        const stepSize = bestRadius * C.INSCRIBED_CIRCLE_STEP_FACTOR;

        const directions = [
            { x: stepSize, y: 0 }, { x: -stepSize, y: 0 },
            { x: 0, y: stepSize }, { x: 0, y: -stepSize },
            { x: stepSize * Math.SQRT1_2, y: stepSize * Math.SQRT1_2 },
            { x: -stepSize * Math.SQRT1_2, y: stepSize * Math.SQRT1_2 },
            { x: stepSize * Math.SQRT1_2, y: -stepSize * Math.SQRT1_2 },
            { x: -stepSize * Math.SQRT1_2, y: -stepSize * Math.SQRT1_2 }
        ];

        for (const dir of directions) {
            const testPoint = {
                x: bestCenter.x + dir.x,
                y: bestCenter.y + dir.y
            };

            if (isVertexInPolygon(testPoint, vertices)) {
                const testRadius = distanceToPolygonEdges(testPoint, vertices);
                if (testRadius > bestRadius) {
                    bestCenter = testPoint;
                    bestRadius = testRadius;
                    improved = true;
                }
            }
        }

        if (!improved) break;
    }

    return {
        center: bestCenter,
        radius: Math.max(bestRadius, C.GEOMETRY_CALCULATION_EPSILON)
    };
}

export function distanceToPolygonEdges(point, vertices) {
    let minDistance = Infinity;
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const edgeDistance = distancePointToLineSegment(point, v1, v2);
        minDistance = Math.min(minDistance, edgeDistance);
    }
    return minDistance;
}

export function distancePointToLineSegment(point, lineStart, lineEnd) {
    return getClosestPointOnLineSegment(point, lineStart, lineEnd).distance;
}

export function updateFaceLocalCoordinateSystems(allFaces, findPointById) {
    allFaces.forEach(face => {
        if (!face.localCoordSystem) {
            face.localCoordSystem = createFaceLocalCoordinateSystem(face, findPointById);
        } else if (!face.localCoordSystem.isCustom) {
            // Recalculate if not manually positioned
            const newSystem = createFaceLocalCoordinateSystem(face, findPointById);
            if (newSystem) {
                face.localCoordSystem.origin = newSystem.origin;
                face.localCoordSystem.scale = newSystem.scale;
            }
        }
    });
}

function walkMinimalFaceDirected(startVertex, secondVertex, adjacencyMap) {
    const facePath = [startVertex];
    let prevNode = startVertex;
    let currentNode = secondVertex;
    
    const maxSteps = adjacencyMap.size + 2;
    for (let stepCount = 0; stepCount < maxSteps; stepCount++) {
        facePath.push(currentNode);

        if (currentNode === startVertex) {
            facePath.pop();
            return facePath;
        }

        const neighbors = adjacencyMap.get(currentNode);
        if (!neighbors || neighbors.length < 1) return null; 

        const prevNodeIndex = neighbors.indexOf(prevNode);
        if (prevNodeIndex === -1) return null;

        const nextNodeIndex = (prevNodeIndex + 1) % neighbors.length;
        const nextNode = neighbors[nextNodeIndex];
        
        prevNode = currentNode;
        currentNode = nextNode;
    }
    return null;
}

function filterCompositeFaces(allFaces, allEdges, findPointById) {
    if (allFaces.length <= 1) return allFaces;

    const edgeSet = new Set(allEdges.map(edge => [edge.id1, edge.id2].sort().join('_')));

    return allFaces.filter(face => {
        const faceVertexIds = face.vertexIds;
        if (faceVertexIds.length < 3) return false;

        for (let i = 0; i < faceVertexIds.length; i++) {
            for (let j = i + 2; j < faceVertexIds.length; j++) {
                if (i === 0 && j === faceVertexIds.length - 1) continue;

                const v1 = faceVertexIds[i];
                const v2 = faceVertexIds[j];
                const edgeKey = [v1, v2].sort().join('_');
                
                if (edgeSet.has(edgeKey)) {
                    return false;
                }
            }
        }
        return true;
    });
}

export function detectClosedPolygons(allEdges, findPointById) {
    const adjacencyMap = new Map();
    const vertices = new Map();

    allEdges.forEach(edge => {
        const p1 = findPointById(edge.id1);
        const p2 = findPointById(edge.id2);
        if (!p1 || !p2 || p1.type !== 'regular' || p2.type !== 'regular') return;
        if (!vertices.has(p1.id)) vertices.set(p1.id, p1);
        if (!vertices.has(p2.id)) vertices.set(p2.id, p2);
        if (!adjacencyMap.has(edge.id1)) adjacencyMap.set(edge.id1, []);
        if (!adjacencyMap.has(edge.id2)) adjacencyMap.set(edge.id2, []);
        adjacencyMap.get(edge.id1).push(edge.id2);
        adjacencyMap.get(edge.id2).push(edge.id1);
    });

    for (const [vertexId, neighbors] of adjacencyMap.entries()) {
        const centerPoint = vertices.get(vertexId);
        if (!centerPoint) continue;
        neighbors.sort((a, b) => {
            const pA = vertices.get(a);
            const pB = vertices.get(b);
            if (!pA || !pB) return 0;
            const angleA = Math.atan2(pA.y - centerPoint.y, pA.x - centerPoint.x);
            const angleB = Math.atan2(pB.y - centerPoint.y, pB.x - centerPoint.x);
            return angleA - angleB;
        });
    }

    const allPossibleFaces = [];
    const processedDirectedEdges = new Set();
    
    for (const [startVertex, neighbors] of adjacencyMap.entries()) {
        for (const nextVertex of neighbors) {
            const directedEdgeKey = `${startVertex}->${nextVertex}`;
            if (processedDirectedEdges.has(directedEdgeKey)) continue;

            const facePath = walkMinimalFaceDirected(startVertex, nextVertex, adjacencyMap);
            
            if (facePath && facePath.length >= 3) {
                const uniqueVertices = new Set(facePath);
                if (uniqueVertices.size === facePath.length) {
                    for (let i = 0; i < facePath.length; i++) {
                        const v1 = facePath[i];
                        const v2 = facePath[(i + 1) % facePath.length];
                        processedDirectedEdges.add(`${v1}->${v2}`);
                    }
                    
                    const newFace = { vertexIds: facePath };
                    newFace.id = getFaceId(newFace);
                    allPossibleFaces.push(newFace);
                }
            }
        }
    }

    const principleFaces = filterCompositeFaces(allPossibleFaces, allEdges, findPointById);

    const uniqueFaces = [];
    const seenFaceVertexSets = new Set();
    
    principleFaces.forEach(face => {
        const sortedVertexIds = [...face.vertexIds].sort().join('_');
        if (!seenFaceVertexSets.has(sortedVertexIds)) {
            uniqueFaces.push(face);
            seenFaceVertexSets.add(sortedVertexIds);
        }
    });

    return uniqueFaces;
}

export function createEdge(v1, v2, gridInterval, getColorForTarget) {
    const newEdge = { id1: v1.id, id2: v2.id };

    const deltaX = v1.x - v2.x;
    const deltaY = v1.y - v2.y;
    const dx_grid_float = deltaX / gridInterval;
    const dy_grid_float = deltaY / gridInterval;
    const epsilon = 1e-5;

    const isGridVector = gridInterval &&
        Math.abs(dx_grid_float - Math.round(dx_grid_float)) < epsilon &&
        Math.abs(dy_grid_float - Math.round(dy_grid_float)) < epsilon;

    if (isGridVector) {
        newEdge.labelMode = 'exact';
        const dx_grid = Math.round(dx_grid_float);
        const dy_grid = Math.round(dy_grid_float);
        newEdge.exactValue = {
            g2gSquaredSum: dx_grid * dx_grid + dy_grid * dy_grid,
            gridInterval: gridInterval
        };
    } else {
        newEdge.labelMode = 'decimal';
    }
    
    newEdge.color = getColorForTarget(C.COLOR_TARGET_EDGE);
    return newEdge;
}

export function detectFacesFromNewEdge(newEdge, allEdges, findPointById, deletedFaceIds = new Set()) {
    // Get all possible faces with the current edge set
    const allPossibleFaces = detectClosedPolygons(allEdges, findPointById);
    
    // Create a set of edges before adding the new edge
    const edgesWithoutNew = allEdges.filter(e => 
        !(e.id1 === newEdge.id1 && e.id2 === newEdge.id2) && 
        !(e.id1 === newEdge.id2 && e.id2 === newEdge.id1)
    );
    
    // Get faces that existed before
    const facesBefore = detectClosedPolygons(edgesWithoutNew, findPointById);
    const faceIdsBefore = new Set(facesBefore.map(f => `face_${[...f.vertexIds].sort().join('_')}`));
    
    // Return only the new faces that weren't there before and aren't blacklisted
    const newFaces = allPossibleFaces.filter(face => {
        if (!face.vertexIds || face.vertexIds.length < 3) return false;
        
        const faceId = `face_${[...face.vertexIds].sort().join('_')}`;
        
        // Skip if blacklisted or existed before
        if (deletedFaceIds.has(faceId) || faceIdsBefore.has(faceId)) return false;
        
        return true;
    });
    
    return newFaces.map(face => ({
        ...face,
        id: `face_${[...face.vertexIds].sort().join('_')}`
    }));
}

export function findClosestUIElement(pos, elements) {
    let closest = null;
    let minDist = Infinity;
    elements.forEach(el => {
        if (!el) return;
        const dist = Math.abs(pos.x - (el.x + el.width / 2));
        if (dist < minDist && dist < (el.width / 2 + C.UI_BUTTON_PADDING)) {
            minDist = dist;
            closest = el;
        }
    });
    return closest;
}

export function convertColorToColormapFormat(colormapData) {
    // Handle colormap selector format (uses 'points' instead of 'vertices')
    if (colormapData && colormapData.points) {
        const processedVertices = colormapData.points.map(p => ({
            pos: p.pos,
            color: Array.isArray(p.color) ? p.color : [p.color.r || 0, p.color.g || 0, p.color.b || 0],
            alpha: p.alpha !== undefined ? p.alpha : 1.0
        }));
        
        if (processedVertices.length === 1) {
            const singlePoint = processedVertices[0];
            const colorValue = (singlePoint.alpha !== undefined && singlePoint.alpha < 1)
                ? `rgba(${singlePoint.color.join(',')},${singlePoint.alpha})`
                : `rgb(${singlePoint.color.join(',')})`;
            return { type: 'color', value: colorValue };
        }
        
        return {
            type: 'colormap',
            vertices: processedVertices,
            isCyclic: colormapData.isCyclic === true
        };
    }
    
    if (colormapData && colormapData.vertices && colormapData.vertices.length === 1) {
        const singlePoint = colormapData.vertices[0];
        const colorValue = (singlePoint.alpha !== undefined && singlePoint.alpha < 1)
            ? `rgba(${singlePoint.color.join(',')},${singlePoint.alpha})`
            : `rgb(${singlePoint.color.join(',')})`;
        return { type: 'color', value: colorValue };
    } else if (colormapData && colormapData.vertices) {
        const processedVertices = colormapData.vertices.map(p => ({
            ...p,
            alpha: p.alpha !== undefined ? p.alpha : 1.0
        }));
        return {
            type: 'colormap',
            vertices: processedVertices,
            isCyclic: colormapData.isCyclic === true
        };
    }
    return colormapData;
}

export function sampleColormap(colormapItem, t) {
    if (!colormapItem || colormapItem.type !== 'colormap' || !colormapItem.vertices) {
        return '#ffffff';
    }

    const vertices = colormapItem.vertices;
    if (vertices.length === 0) return '#ffffff';
    if (vertices.length === 1) {
        const p = vertices[0];
        const alpha = p.alpha !== undefined ? p.alpha : 1.0;
        return `rgba(${p.color.join(',')},${alpha})`;
    }

    // Clamp t to [0, 1]
    t = Math.max(0, Math.min(1, t));

    // Find the two vertices to interpolate between
    let leftPoint = vertices[0];
    let rightPoint = vertices[vertices.length - 1];

    for (let i = 0; i < vertices.length - 1; i++) {
        if (t >= vertices[i].pos && t <= vertices[i + 1].pos) {
            leftPoint = vertices[i];
            rightPoint = vertices[i + 1];
            break;
        }
    }

    // Interpolate between the two vertices
    const range = rightPoint.pos - leftPoint.pos;
    const localT = range > 0 ? (t - leftPoint.pos) / range : 0;

    const r = Math.round(leftPoint.color[0] + (rightPoint.color[0] - leftPoint.color[0]) * localT);
    const g = Math.round(leftPoint.color[1] + (rightPoint.color[1] - leftPoint.color[1]) * localT);
    const b = Math.round(leftPoint.color[2] + (rightPoint.color[2] - leftPoint.color[2]) * localT);

    const leftAlpha = leftPoint.alpha !== undefined ? leftPoint.alpha : 1.0;
    const rightAlpha = rightPoint.alpha !== undefined ? rightPoint.alpha : 1.0;
    const alpha = leftAlpha + (rightAlpha - leftAlpha) * localT;

    return `rgba(${r},${g},${b},${alpha})`;
}

export function createFaceLocalCoordinateSystem(face, findPointById) {
    const vertices = face.vertexIds
        .map(id => findPointById(id))
        .filter(p => p && p.type === 'regular');
    
    if (vertices.length < 3) return null;
    
    const incircle = calculateIncenter(vertices);
    if (!incircle) return null;
    
    return {
        origin: { ...incircle.center },
        angle: 0,
        scale: incircle.radius,
        isCustom: false,
        showCoordSystem: false
    };
}
export function globalToLocal(globalPoint, coordSystem) {
    if (!coordSystem) return globalPoint;
    const translated = {
        x: globalPoint.x - coordSystem.origin.x,
        y: globalPoint.y - coordSystem.origin.y
    };
    const cos = Math.cos(-coordSystem.angle);
    const sin = Math.sin(-coordSystem.angle);
    const rotated = {
        x: translated.x * cos - translated.y * sin,
        y: translated.x * sin + translated.y * cos
    };
    if (coordSystem.scale === 0) return { x: 0, y: 0 };
    return {
        x: rotated.x / coordSystem.scale,
        y: rotated.y / coordSystem.scale
    };
}

export function findNeighbors(vertexId, allEdges) {
    const neighbors = new Set();
    allEdges.forEach(edge => {
        if (edge.id1 === vertexId) {
            neighbors.add(edge.id2);
        } else if (edge.id2 === vertexId) {
            neighbors.add(edge.id1);
        }
    });
    return Array.from(neighbors);
}

export function localToGlobal(localPoint, coordSystem) {
    if (!coordSystem) return localPoint;

    const scaled = {
        x: localPoint.x * coordSystem.scale,
        y: localPoint.y * coordSystem.scale
    };

    const cos = Math.cos(coordSystem.angle);
    const sin = Math.sin(coordSystem.angle);
    const rotated = {
        x: scaled.x * cos - scaled.y * sin,
        y: scaled.x * sin + scaled.y * cos
    };
    return {
        x: rotated.x + coordSystem.origin.x,
        y: rotated.y + coordSystem.origin.y
    };
}

export function getPerpendicularBisector(p1, p2) {
    const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const perpVector = { x: -(p2.y - p1.y), y: p2.x - p1.x };
    return {
        p1: midPoint,
        p2: {
            x: midPoint.x + perpVector.x,
            y: midPoint.y + perpVector.y
        }
    };
}

export function getCircleCircleIntersection(c1, c2) {
    const d = distance(c1.center, c2.center);

    if (d > c1.radius + c2.radius || d < Math.abs(c1.radius - c2.radius) || d === 0) {
        return [];
    }

    const a = (c1.radius * c1.radius - c2.radius * c2.radius + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, c1.radius * c1.radius - a * a));
    const p2x = c1.center.x + a * (c2.center.x - c1.center.x) / d;
    const p2y = c1.center.y + a * (c2.center.y - c1.center.y) / d;

    const p3x_offset = h * (c2.center.y - c1.center.y) / d;
    const p3y_offset = h * (c2.center.x - c1.center.x) / d;

    const pA = { x: p2x + p3x_offset, y: p2y - p3y_offset };
    const pB = { x: p2x - p3x_offset, y: p2y + p3y_offset };

    if (h === 0) return [pA];
    return [pA, pB];
}

function getLineSegmentIntersection(p1, p2, p3, p4) {
    const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(den) < C.GEOMETRY_CALCULATION_EPSILON) {
        return null; // Lines are parallel or collinear
    }

    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;

    // Check if intersection occurs strictly within both line segments (not at endpoints)
    if (t > C.GEOMETRY_CALCULATION_EPSILON && t < 1 - C.GEOMETRY_CALCULATION_EPSILON &&
        u > C.GEOMETRY_CALCULATION_EPSILON && u < 1 - C.GEOMETRY_CALCULATION_EPSILON) {
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }

    return null;
}

export function areVerticesContainedInPolygon(verticesToCheck, boundaryVertices) {
    if (!verticesToCheck || !boundaryVertices || verticesToCheck.length === 0 || boundaryVertices.length < 3) {
        return false;
    }

    for (const vertex of verticesToCheck) {
        // First, check if the vertex is on the boundary of the parent polygon.
        // If it is, it's not strictly inside, so we return false.
        for (let i = 0; i < boundaryVertices.length; i++) {
            const p1 = boundaryVertices[i];
            const p2 = boundaryVertices[(i + 1) % boundaryVertices.length];
            if (distancePointToLineSegment(vertex, p1, p2) < C.GEOMETRY_CALCULATION_EPSILON) {
                return false; // On the boundary, so not strictly contained.
            }
        }

        // If it's not on the boundary, check if it's inside using the standard algorithm.
        if (!isVertexInPolygon(vertex, boundaryVertices)) {
            return false; // Not on boundary and not inside.
        }
    }
    
    // All vertices are strictly inside.
    return true;
}

export function doGraphEdgesIntersectPolygon(childEdges, parentBoundaryVertices, findVertexById) {
    const parentEdges = [];
    for (let i = 0; i < parentBoundaryVertices.length; i++) {
        parentEdges.push({
            p1: parentBoundaryVertices[i],
            p2: parentBoundaryVertices[(i + 1) % parentBoundaryVertices.length]
        });
    }

    for (const childEdge of childEdges) {
        const c1 = findVertexById(childEdge.id1);
        const c2 = findVertexById(childEdge.id2);
        if (!c1 || !c2) continue;

        for (const parentEdge of parentEdges) {
            if (getLineSegmentIntersection(c1, c2, parentEdge.p1, parentEdge.p2)) {
                // A proper intersection was found, meaning the child graph is not fully contained.
                return true;
            }
        }
    }

    return false;
}

export function getRaySegmentIntersection(rayOrigin, rayPoint, segP1, segP2) {
    const p1 = rayOrigin, p2 = rayPoint, p3 = segP1, p4 = segP2;
    const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(den) < C.GEOMETRY_CALCULATION_EPSILON) return null;

    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
    
    if (t >= -C.GEOMETRY_CALCULATION_EPSILON && u >= -C.GEOMETRY_CALCULATION_EPSILON && u <= 1 + C.GEOMETRY_CALCULATION_EPSILON) {
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }
    return null;
}