import * as C from './constants.js';

export function formatNumber(value, sigFigs) {
    if (value === 0) return "0";
    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    let formattedString;
    if (absValue >= C.SCIENTIFIC_NOTATION_UPPER_BOUND || (absValue !== 0 && absValue < C.SCIENTIFIC_NOTATION_LOWER_BOUND)) {
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
        decimalPlacesToDisplay = Math.min(decimalPlacesToDisplay, C.MAX_DECIMAL_PLACES_FORMAT);
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
    
    let inside = false;
    const x = vertex.x;
    const y = vertex.y;
    
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].x;
        const yi = vertices[i].y;
        const xj = vertices[j].x;
        const yj = vertices[j].y;
        
        if (((yi > y) !== (yj > y)) && 
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    
    return inside;
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
    const centerSelectRadius = 10; // in screen pixels

    if (distance(screenPos, centerScreen) < centerSelectRadius) {
        return { face, type: 'center' };
    }

    const armEndSelectRadius = 10; // in screen pixels

    const checkArm = (x, y, type) => {
        const armEndGlobal = localToGlobal({ x, y }, coordSystem);
        if (distance(screenPos, dataToScreen(armEndGlobal)) < armEndSelectRadius) {
            return { face, type };
        }
        return null;
    };

    return checkArm(1, 0, 'x_axis') ||
           checkArm(-1, 0, 'x_axis') ||
           checkArm(0, 1, 'y_axis') ||
           checkArm(0, -1, 'y_axis');
}

export function detectClosedPolygons(allEdges, findPointById) {
    const adjacencyMap = new Map();
    const vertices = new Map();

    // Build adjacency map
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

    // Sort neighbors by angle
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

    // Simple face finding: only keep minimal faces
    const allCycles = findAllSimpleCycles(adjacencyMap, vertices);
    const minimalFaces = filterToMinimalFaces(allCycles, vertices);
    
    return minimalFaces.map(face => ({
        vertexIds: face,
        id: `face_${[...face].sort().join('_')}`
    }));
}

function findAllSimpleCycles(adjacencyMap, vertices) {
    const visitedEdges = new Set();
    const cycles = [];

    for (const [start, neighbors] of adjacencyMap.entries()) {
        for (const next of neighbors) {
            const edgeKey = `${start}-${next}`;
            if (visitedEdges.has(edgeKey)) continue;

            const cycle = findCycleFromEdge(start, next, adjacencyMap, visitedEdges);
            if (cycle && cycle.length >= 3 && cycle.length <= 6) {
                cycles.push(cycle);
            }
        }
    }

    return cycles;
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

function filterToMinimalFaces(cycles, vertices) {
    if (cycles.length <= 1) return cycles;

    // Calculate areas and sort by area (smallest first)
    const cyclesWithAreas = cycles.map(cycle => {
        const cycleVertices = cycle.map(id => vertices.get(id));
        const area = Math.abs(shoelaceArea(cycleVertices));
        return { cycle, area };
    }).filter(c => c.area > 0.001) // Remove degenerate faces
    .sort((a, b) => a.area - b.area);

    const result = [];
    
    // Only keep faces that are not completely contained by other faces
    for (const candidate of cyclesWithAreas) {
        const candidateVertices = candidate.cycle.map(id => vertices.get(id));
        let isContained = false;
        
        for (const existing of result) {
            const existingVertices = existing.cycle.map(id => vertices.get(id));
            
            // Check if candidate is completely inside existing face
            if (candidate.area < existing.area && 
                candidateVertices.every(v => isVertexInPolygon(v, existingVertices))) {
                isContained = true;
                break;
            }
        }
        
        if (!isContained) {
            // Also check if this face would contain any existing faces
            // If so, don't add it (keep the smaller ones)
            const wouldContainExisting = result.some(existing => {
                const existingVertices = existing.cycle.map(id => vertices.get(id));
                return existing.area < candidate.area && 
                       existingVertices.every(v => isVertexInPolygon(v, candidateVertices));
            });
            
            if (!wouldContainExisting) {
                result.push(candidate);
            }
        }
    }

    return result.map(r => r.cycle);
}

function findCycleFromEdge(start, second, adjacencyMap, visitedEdges) {
    const path = [start];
    let current = start;
    let next = second;
    const maxSteps = 10; // Prevent infinite loops
    let steps = 0;

    while (steps < maxSteps) {
        steps++;
        visitedEdges.add(`${current}-${next}`);
        path.push(next);

        if (next === start) {
            path.pop(); // Remove duplicate start
            return path.length >= 3 ? path : null;
        }

        const neighbors = adjacencyMap.get(next);
        if (!neighbors) return null;

        const prevIndex = neighbors.indexOf(current);
        if (prevIndex === -1) return null;

        // Take next neighbor (counter-clockwise)
        const nextIndex = (prevIndex + 1) % neighbors.length;
        current = next;
        next = neighbors[nextIndex];
    }

    return null;
}


export function debugFaceDetection(allEdges, findPointById) {
    console.log('=== FACE DETECTION DEBUG ===');
    console.log('Edges:', allEdges.map(e => `${e.id1}-${e.id2}`));
    
    // Debug the adjacency map
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

    console.log('Adjacency map:');
    for (const [vertexId, neighbors] of adjacencyMap.entries()) {
        console.log(`  ${vertexId}: [${neighbors.join(', ')}]`);
    }

    // Sort neighbors and show the result
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

    console.log('Sorted adjacency map:');
    for (const [vertexId, neighbors] of adjacencyMap.entries()) {
        console.log(`  ${vertexId}: [${neighbors.join(', ')}]`);
    }

    const faces = detectClosedPolygons(allEdges, findPointById);
    console.log('Detected faces:');
    faces.forEach((face, i) => {
        console.log(`Face ${i}:`, face.vertexIds);
        const vertices = face.vertexIds.map(id => findPointById(id));
        const area = Math.abs(shoelaceArea(vertices));
        console.log(`  Area: ${area.toFixed(4)}`);
    });
    
    return faces;
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

export function validateAndFilterFaces(faces, findPointById) {
    if (faces.length <= 1) return faces;
    
    const validFaces = [];
    const facesByArea = faces.map(face => {
        const vertices = face.vertexIds.map(id => findPointById(id)).filter(v => v && v.type === 'regular');
        const area = vertices.length >= 3 ? Math.abs(shoelaceArea(vertices)) : 0;
        return { face, area, vertices };
    }).filter(f => f.area > 0).sort((a, b) => a.area - b.area);
    
    for (const candidateData of facesByArea) {
        const candidate = candidateData.face;
        let isComposite = false;
        
        // Check if this face can be decomposed into smaller existing faces
        const candidateEdges = new Set();
        for (let i = 0; i < candidate.vertexIds.length; i++) {
            const v1 = candidate.vertexIds[i];
            const v2 = candidate.vertexIds[(i + 1) % candidate.vertexIds.length];
            candidateEdges.add(getEdgeId({ id1: v1, id2: v2 }));
        }
        
        // Look for combinations of existing faces that could form this candidate
        for (let i = 0; i < validFaces.length && !isComposite; i++) {
            for (let j = i + 1; j < validFaces.length && !isComposite; j++) {
                const face1 = validFaces[i].face;
                const face2 = validFaces[j].face;
                
                if (canCombineToForm(face1, face2, candidate)) {
                    isComposite = true;
                }
            }
        }
        
        if (!isComposite) {
            validFaces.push(candidateData);
        }
    }
    
    return validFaces.map(f => f.face);
}

function canCombineToForm(face1, face2, targetFace) {
    // Get edges for each face
    const face1Edges = new Set();
    const face2Edges = new Set();
    const targetEdges = new Set();
    
    for (let i = 0; i < face1.vertexIds.length; i++) {
        const v1 = face1.vertexIds[i];
        const v2 = face1.vertexIds[(i + 1) % face1.vertexIds.length];
        face1Edges.add(getEdgeId({ id1: v1, id2: v2 }));
    }
    
    for (let i = 0; i < face2.vertexIds.length; i++) {
        const v1 = face2.vertexIds[i];
        const v2 = face2.vertexIds[(i + 1) % face2.vertexIds.length];
        face2Edges.add(getEdgeId({ id1: v1, id2: v2 }));
    }
    
    for (let i = 0; i < targetFace.vertexIds.length; i++) {
        const v1 = targetFace.vertexIds[i];
        const v2 = targetFace.vertexIds[(i + 1) % targetFace.vertexIds.length];
        targetEdges.add(getEdgeId({ id1: v1, id2: v2 }));
    }
    
    // Find shared edges (internal edges that should be removed)
    const sharedEdges = new Set();
    for (const edge of face1Edges) {
        if (face2Edges.has(edge)) {
            sharedEdges.add(edge);
        }
    }
    
    // Union of boundary edges (removing shared internal edges)
    const unionBoundary = new Set();
    for (const edge of face1Edges) {
        if (!sharedEdges.has(edge)) {
            unionBoundary.add(edge);
        }
    }
    for (const edge of face2Edges) {
        if (!sharedEdges.has(edge)) {
            unionBoundary.add(edge);
        }
    }
    
    // Check if union boundary matches target
    if (unionBoundary.size !== targetEdges.size) return false;
    
    for (const edge of targetEdges) {
        if (!unionBoundary.has(edge)) return false;
    }
    
    return true;
}

export function getMousePosOnCanvas(event, canvasElement) {
    const rect = canvasElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
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

export function isSelfIntersecting(vertices) {
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const p1 = vertices[i];
        const p2 = vertices[(i + 1) % n];
        for (let j = i + 2; j < n; j++) {
            const q1 = vertices[j];
            const q2 = vertices[(j + 1) % n];
            if ((j + 1) % n === i || j === (i + 1) % n) continue;
            if (linesIntersect(p1, p2, q1, q2)) return true;
        }
    }
    return false;
}

function linesIntersect(a, b, c, d) {
    function ccw(A, B, C) {
        return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    }
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
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

export function getCurrentTheme(activeThemeName, baseTheme) {
    if (activeThemeName === 'dark') {
        return baseTheme;
    } else {
        const lightTheme = {};
        for (const [key, value] of Object.entries(baseTheme)) {
            if (key === 'frozenReference' || key === 'feedbackSnapped' || key === 'geometryInfoTextSnapped') {
                lightTheme[key] = 'rgba(217, 119, 6, 0.95)';
            } else {
                lightTheme[key] = invertGrayscaleValue(value);
            }
        }
        return lightTheme;
    }
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
            vertices: processedVertices
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
            vertices: processedVertices
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
        scale: incircle.radius / 4,
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
