import {
    SCIENTIFIC_NOTATION_UPPER_BOUND,
    SCIENTIFIC_NOTATION_LOWER_BOUND,
    MAX_DECIMAL_PLACES_FORMAT,
    GEOMETRY_CALCULATION_EPSILON,
    RADIANS_IN_CIRCLE,
    DEGREES_IN_CIRCLE,
    ZERO_TOLERANCE,
    FRACTION_FORMAT_TOLERANCE,
    FRACTION_FORMAT_MAX_DENOMINATOR,
    KATEX_MINUS_PHANTOM,
    ON_SEGMENT_STRICT_T_MIN,
    ON_SEGMENT_STRICT_T_MAX,
    ANGLE_SNAP_THRESHOLD_RAD,
} from './constants.js';

export function formatNumber(value, sigFigs) {
    if (value === 0) return "0";
    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    let formattedString;
    if (absValue >= SCIENTIFIC_NOTATION_UPPER_BOUND || (absValue !== 0 && absValue < SCIENTIFIC_NOTATION_LOWER_BOUND)) {
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
        decimalPlacesToDisplay = Math.min(decimalPlacesToDisplay, MAX_DECIMAL_PLACES_FORMAT);
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


export function generateAngleSnapFractions(maxDenominator, maxResultingMultipleOfBase) {
    const fractionsSet = new Set();
    fractionsSet.add(0);
    for (let q = 1; q <= maxDenominator; q++) {
        for (let p = 0; p <= q * maxResultingMultipleOfBase; p++) {
            fractionsSet.add(p / q);
        }
    }
    return Array.from(fractionsSet).sort((a, b) => a - b);
}

export function getNearestGridPoints(mouseDataPos, gridInterval) {
    if (!gridInterval || gridInterval <= 0) return [];
    
    // Find the grid cell that contains the mouse position
    const gridX = Math.floor(mouseDataPos.x / gridInterval) * gridInterval;
    const gridY = Math.floor(mouseDataPos.y / gridInterval) * gridInterval;
    
    // Return the 4 corners of this grid cell
    return [
        { x: gridX, y: gridY, isGridPoint: true },
        { x: gridX + gridInterval, y: gridY, isGridPoint: true },
        { x: gridX, y: gridY + gridInterval, isGridPoint: true },
        { x: gridX + gridInterval, y: gridY + gridInterval, isGridPoint: true }
    ];
}

export function solveForPoint(N1, N2, d1, alpha) {
    const d_n = distance(N1, N2);
    if (d_n < GEOMETRY_CALCULATION_EPSILON || Math.sin(alpha) < GEOMETRY_CALCULATION_EPSILON) return [];
    const solutions = [];
    const A = 1,
        B = -2 * d1 * Math.cos(alpha),
        C = d1 * d1 - d_n * d_n;
    const discriminant = B * B - 4 * A * C;
    if (discriminant < 0) return [];

    [(-B + Math.sqrt(discriminant)) / (2 * A), (-B - Math.sqrt(discriminant)) / (2 * A)].forEach(d2 => {
        if (d2 <= 0) return;
        const a = (d1 * d1 - d2 * d2 + d_n * d_n) / (2 * d_n);
        const h = Math.sqrt(Math.max(0, d1 * d1 - a * a));
        const x_mid = N1.x + a * (N2.x - N1.x) / d_n;
        const y_mid = N1.y + a * (N2.y - N1.y) / d_n;
        solutions.push({ x: x_mid + h * (N2.y - N1.y) / d_n, y: y_mid - h * (N2.x - N1.x) / d_n, dist: d1, angle: alpha });
        solutions.push({ x: x_mid - h * (N2.y - N1.y) / d_n, y: y_mid + h * (N2.x - N1.x) / d_n, dist: d1, angle: alpha });
    });
    return solutions;
}

export function generateDistanceSnapFactors() {
    const fractionsSet = new Set();
    fractionsSet.add(0);
    for (let q = 1; q <= 6; q++) {
        for (let p = 1; p <= q; p++) {
            fractionsSet.add(p / q);
        }
    }
    for (let i = 1; i <= 10; i++) {
        fractionsSet.add(i);
        if (i > 1) {
            fractionsSet.add(i - 0.5);
        }
    }
    return Array.from(fractionsSet).sort((a, b) => a - b);
}

export function generateUniqueId() {
    return crypto.randomUUID();
}

export function normalizeAngle(angleRad) {
    while (angleRad < 0) angleRad += RADIANS_IN_CIRCLE;
    while (angleRad >= RADIANS_IN_CIRCLE) angleRad -= RADIANS_IN_CIRCLE;
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
        angleRad -= RADIANS_IN_CIRCLE;
    }
    return angleRad;
}

export function normalizeAngleDegrees(angleDeg) {
    while (angleDeg < 0) angleDeg += DEGREES_IN_CIRCLE;
    while (angleDeg >= DEGREES_IN_CIRCLE) angleDeg -= DEGREES_IN_CIRCLE;
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
    if (Math.abs(den) < GEOMETRY_CALCULATION_EPSILON) return null;
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

export function snapTValue(t, fractions, snapThreshold = 0.05) {
    let bestSnappedT = t;
    let minDiff = snapThreshold;

    if (t < -snapThreshold || t > 1 + snapThreshold) {
        return Math.max(0, Math.min(1, t));
    }

    for (const snapFraction of fractions) {
        const diff = Math.abs(t - snapFraction);
        if (diff < minDiff) {
            minDiff = diff;
            bestSnappedT = snapFraction;
        }
    }
    return Math.max(0, Math.min(1, bestSnappedT));
}

export function distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

export function formatFraction(decimal, tolerance = FRACTION_FORMAT_TOLERANCE, maxDisplayDenominator = FRACTION_FORMAT_MAX_DENOMINATOR) {
    if (Math.abs(decimal) < ZERO_TOLERANCE) return "0";
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
        if (currentNum === 0 && absDecimal > ZERO_TOLERANCE) continue;
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

export function formatCoordinateValue(value, decimalPlaces) {
    if (typeof value !== 'number' || isNaN(value)) {
        return '...';
    }
    const sign = value < 0 ? "-" : KATEX_MINUS_PHANTOM;
    const fixedValue = Math.abs(value).toFixed(decimalPlaces);
    return sign + fixedValue;
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
    const onSegmentStrict = t > ON_SEGMENT_STRICT_T_MIN && t < ON_SEGMENT_STRICT_T_MAX;
    const clampedT = Math.max(0, Math.min(1, t));
    const closestX = a.x + clampedT * abx;
    const closestY = a.y + clampedT * aby;
    const dist = distance(p, { x: closestX, y: closestY });
    return { x: closestX, y: closestY, distance: dist, onSegmentStrict: onSegmentStrict, t: clampedT };
}

export function getMousePosOnCanvas(event, canvasElement) {
    const rect = canvasElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function snapToAngle(targetAngleRad, offsetAngleRad, angleSnapFractionsArray, baseReferenceAngleRad, forceSnap = false) {
    if (isNaN(targetAngleRad) || isNaN(offsetAngleRad) || Math.abs(baseReferenceAngleRad) < GEOMETRY_CALCULATION_EPSILON) {
        const defaultAngle = isNaN(offsetAngleRad) ? 0 : offsetAngleRad;
        return { angle: defaultAngle, turn: 0, factor: null };
    }
    let bestSnappedAngleRad = targetAngleRad;
    let minAngleDifference = Infinity;
    let bestTurn = normalizeAngleToPi(targetAngleRad - offsetAngleRad);
    let bestFactor = null;

    const maxAllowedFactor = (Math.PI + 0.0001) / Math.abs(baseReferenceAngleRad);

    for (const fraction of angleSnapFractionsArray) {
        if (fraction > maxAllowedFactor) {
            continue;
        }

        const snapIncrementRad = baseReferenceAngleRad * fraction;

        const potentialSnapAngleCCW = normalizeAngle(offsetAngleRad + snapIncrementRad);
        let diffCCW = Math.abs(normalizeAngleToPi(targetAngleRad - potentialSnapAngleCCW));
        if (diffCCW < minAngleDifference) {
            minAngleDifference = diffCCW;
            bestSnappedAngleRad = potentialSnapAngleCCW;
            bestTurn = snapIncrementRad;
            bestFactor = fraction;
        }

        if (fraction !== 0) {
            const potentialSnapAngleCW = normalizeAngle(offsetAngleRad - snapIncrementRad);
            let diffCW = Math.abs(normalizeAngleToPi(targetAngleRad - potentialSnapAngleCW));
            if (diffCW < minAngleDifference) {
                minAngleDifference = diffCW;
                bestSnappedAngleRad = potentialSnapAngleCW;
                bestTurn = -snapIncrementRad;
                bestFactor = -fraction;
            }
        }
    }

    if (forceSnap || minAngleDifference < ANGLE_SNAP_THRESHOLD_RAD) {
        return { angle: bestSnappedAngleRad, turn: bestTurn, factor: bestFactor };
    }

    return { angle: targetAngleRad, turn: normalizeAngleToPi(targetAngleRad - offsetAngleRad), factor: null };
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
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
        const invertedL = 1 - l; // Invert lightness
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
        
        // Handle named colors
        if (value === 'white') return 'black';
        if (value === 'black') return 'white';
    }
    
    return value;
}

// Function to get the current theme based on active theme name
export function getCurrentTheme(activeThemeName, baseTheme) {
    if (activeThemeName === 'dark') {
        return baseTheme;
    } else {
        // Generate light theme by inverting the base (dark) theme
        const lightTheme = {};
        for (const [key, value] of Object.entries(baseTheme)) {
            // Keep some colors the same for light theme (like accent colors)
            if (key === 'frozenReference' || key === 'feedbackSnapped' || key === 'geometryInfoTextSnapped') {
                lightTheme[key] = 'rgba(217, 119, 6, 0.95)'; // Orange accent for light theme
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