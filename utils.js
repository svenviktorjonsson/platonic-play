export function formatNumber(value, sigFigs) {
    if (value === 0) return "0";
    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    let formattedString;
    if (absValue >= 1000 || (absValue !== 0 && absValue < 0.001)) {
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
        decimalPlacesToDisplay = Math.min(decimalPlacesToDisplay, 10);
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
        for (let p = 0; p <= q * maxResultingMultipleOfBase; p++) { // p can be 0 for 0A or 0D
            fractionsSet.add(p / q);
        }
    }
    return Array.from(fractionsSet).sort((a, b) => a - b);
}

export function generateDistanceSnapFactors() {
    const fractionsSet = new Set();
    fractionsSet.add(0);
    // Denominators up to 6 for factors <= 1
    for (let q = 1; q <= 6; q++) {
        for (let p = 1; p <= q; p++) {
            fractionsSet.add(p / q);
        }
    }
    // Denominators 1 and 2 for factors > 1
    for (let i = 1; i <= 10; i++) {
        fractionsSet.add(i);
        if (i > 1) {
            fractionsSet.add(i - 0.5);
        }
    }
    return Array.from(fractionsSet).sort((a, b) => a - b);
}


export function generateUniqueId() { return crypto.randomUUID(); }



export function normalizeAngle(angleRad) {
    while (angleRad < 0) angleRad += 2 * Math.PI;
    while (angleRad >= 2 * Math.PI) angleRad -= 2 * Math.PI;
    return angleRad;
}

export function normalizeAngleToPi(angleRad) {
    angleRad = normalizeAngle(angleRad);
    if (angleRad > Math.PI) {
        angleRad -= 2 * Math.PI;
    }
    return angleRad;
}

export function normalizeAngleDegrees(angleDeg) {
    while (angleDeg < 0) angleDeg += 360;
    while (angleDeg >= 360) angleDeg -= 360;
    return angleDeg;
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
        // It's a perfect square, no root symbol needed.
        if (coeff === 1 && symbol) return symString;
        return `${coeff}${symString}`;
    }
    if (coeff === 1) {
        // No coefficient needed.
        return `\\sqrt{${radicand}}${symString}`;
    }
    // Default case
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

export function distance(p1, p2) { return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)); }

export function formatFraction(decimal, tolerance = 0.015, maxDisplayDenominator = 32) {
    if (Math.abs(decimal) < 0.00001) return "0";
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
        if (currentNum === 0 && absDecimal > 0.00001) continue;
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
    const onSegmentStrict = t > 0.00001 && t < 0.99999;
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
    if (isNaN(targetAngleRad) || isNaN(offsetAngleRad) || Math.abs(baseReferenceAngleRad) < 1e-9) {
        const defaultAngle = isNaN(offsetAngleRad) ? 0 : offsetAngleRad;
        return { angle: defaultAngle, turn: 0, factor: null };
    }
    let bestSnappedAngleRad = targetAngleRad;
    let minAngleDifference = Infinity;
    let bestTurn = normalizeAngleToPi(targetAngleRad - offsetAngleRad);
    let bestFactor = null;

    // Calculate the maximum allowed snap factor to keep the turn <= 180 degrees (PI).
    // Add a small tolerance to avoid floating point inaccuracies.
    const maxAllowedFactor = (Math.PI + 0.0001) / Math.abs(baseReferenceAngleRad);

    for (const fraction of angleSnapFractionsArray) {
        // Ensure the snap factor does not result in a turn greater than a half circle.
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

    const snapThresholdRad = Math.PI / 24;
    if (forceSnap || minAngleDifference < snapThresholdRad) {
        return { angle: bestSnappedAngleRad, turn: bestTurn, factor: bestFactor };
    }

    return { angle: targetAngleRad, turn: normalizeAngleToPi(targetAngleRad - offsetAngleRad), factor: null };
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