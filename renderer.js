import {
    formatNumber,
    normalizeAngleToPi,
    normalizeAngleDegrees,
    distance,
    formatFraction,
    hslToRgb,
    formatSnapFactor,
    simplifySquareRoot,
    formatSimplifiedRoot,
    gcd
} from './utils.js';

import {
    // --- GEOMETRY & DRAWING ---
    POINT_RADIUS,
    CENTER_POINT_VISUAL_RADIUS,
    LINE_WIDTH,
    GRID_LINEWIDTH,
    DASH_PATTERN,
    DASH_PATTERN_SMALL,
    
    // --- COLORS ---
    GRID_COLOR,
    AXIS_COLOR,
    FROZEN_REFERENCE_COLOR,
    FEEDBACK_COLOR_SNAPPED,
    FEEDBACK_COLOR_DEFAULT,
    GEOMETRY_INFO_TEXT_COLOR,
    GEOMETRY_INFO_TEXT_COLOR_SNAPPED,
    
    // --- AXES & TICKS ---
    AXIS_LINE_WIDTH,
    AXIS_TICK_SIZE,
    AXIS_TICK_LABEL_COLOR,
    AXIS_TICK_LABEL_ALPHA,
    AXIS_NAME_FONT_SIZE,
    AXIS_TICK_FONT_SIZE,
    AXIS_LABEL_OFFSET,
    AXIS_LABEL_PADDING,
    AXIS_ARROW_SIZE,
    Y_AXIS_LABEL_DISTANCE,
    Y_AXIS_LABEL_ARROW_DIST,
    
    // --- DEFAULTS ---
    DEFAULT_REFERENCE_DISTANCE,
    
    // --- FEEDBACK LABELS & TEXT ---
    FEEDBACK_LABEL_FONT_SIZE,
    FEEDBACK_ARC_RADIUS_SCREEN,
    FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN,
    FEEDBACK_LINE_VISUAL_WIDTH,
    REF_TEXT_SCREEN_PIXEL_THRESHOLD,
    REF_TEXT_KATEX_FONT_SIZE,
    REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN,
    REF_TEXT_ANGLE_LABEL_OFFSET_SCREEN,
    ANGLE_LABEL_RADIUS_SCREEN,
    REF_CIRCLE_MIN_DISPLAY_RADIUS,
    REF_CIRCLE_MIN_TICK_SPACING,
    REF_CIRCLE_THETA_LABEL_OFFSET,
    
    // --- GRID CALCULATIONS ---
    GRID_TARGET_SPACING,
    GRID_ALPHA_TRANSITION_START,
    GRID_ALPHA_TRANSITION_END,
    GRID_ALPHA_CLAMP_THRESHOLD,
    GRID_POLAR_CIRCLE_MIN_SPACING,
    GRID_POLAR_SPOKE_MIN_SPACING,
    GRID_POLAR_SPOKE_MIN_RADIUS,
    GRID_POINT_RADIUS,
    ANGULAR_GRID_PREDEFINED_LEVELS,
    ANGULAR_GRID_TARGET_SPACING,
    ANGULAR_GRID_FADE_IN_THRESHOLD,
    
    // --- SNAPPING PARAMETERS ---
    GEOMETRY_CALCULATION_EPSILON,
    VERTICAL_LINE_COS_THRESHOLD,
    NINETY_DEG_ANGLE_SNAP_FRACTIONS,
    SNAP_FACTORS
} from './constants.js';





let colorWheelIcon = null



export function calculateGridIntervals(viewTransformScale) {
    const effectiveDataInterval = GRID_TARGET_SPACING / viewTransformScale;

    let lowerPowerOf10 = Math.pow(10, Math.floor(Math.log10(effectiveDataInterval)));
    let higherPowerOf10 = Math.pow(10, Math.ceil(Math.log10(effectiveDataInterval)));

    if (Math.abs(lowerPowerOf10 - higherPowerOf10) < GEOMETRY_CALCULATION_EPSILON || lowerPowerOf10 === 0) {
        higherPowerOf10 = lowerPowerOf10 === 0 ? 0.001 : lowerPowerOf10 * 10;
        if (lowerPowerOf10 === 0) lowerPowerOf10 = 0.0001;
    }

    const grid1Interval = lowerPowerOf10;
    const grid2Interval = higherPowerOf10;

    let logInterpFactor = 0;
    if (grid2Interval > grid1Interval && grid1Interval > 0) {
        logInterpFactor = (Math.log10(effectiveDataInterval) - Math.log10(grid1Interval)) / (Math.log10(grid2Interval) - Math.log10(grid1Interval));
    }

    let interpValue = (logInterpFactor - GRID_ALPHA_TRANSITION_START) / (GRID_ALPHA_TRANSITION_END - GRID_ALPHA_TRANSITION_START);
    interpValue = Math.max(0, Math.min(1, interpValue));
    interpValue = interpValue * interpValue * (3 - 2 * interpValue);

    let alpha1 = 1 - interpValue;
    let alpha2 = interpValue;

    if (alpha1 < GRID_ALPHA_CLAMP_THRESHOLD) alpha1 = 0; else if (alpha1 > 1 - GRID_ALPHA_CLAMP_THRESHOLD) alpha1 = 1;
    if (alpha2 < GRID_ALPHA_CLAMP_THRESHOLD) alpha2 = 0; else if (alpha2 > 1 - GRID_ALPHA_CLAMP_THRESHOLD) alpha2 = 1;

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

    const radiusToCenterScreen = distance(originScreen, screenCenter);
    let targetAngleDeg;

    // Calculate targetAngleDeg. If origin is very close to center, default to a larger angle.
    // This helps stabilize calculations when zoom is extremely high and originScreen is pan-aligned.
    if (radiusToCenterScreen < 1e-6) { // Use a very small epsilon for near-zero distance
        targetAngleDeg = ANGULAR_GRID_TARGET_SPACING; // Use target spacing directly if effectively at origin
    } else {
        const targetAngleRad = ANGULAR_GRID_TARGET_SPACING / radiusToCenterScreen;
        targetAngleDeg = targetAngleRad * (180 / Math.PI);
    }

    // Ensure targetAngleDeg is always a positive, meaningful value.
    // If it becomes extremely small (due to massive zoom), set a practical minimum
    // to avoid log(0) or log(negative) issues and floating point precision problems.
    if (isNaN(targetAngleDeg) || targetAngleDeg <= GEOMETRY_CALCULATION_EPSILON) {
        targetAngleDeg = GEOMETRY_CALCULATION_EPSILON; // Ensures log10 is valid and a very small angle is processed
    }

    const results = [];
    let allLevels = [...ANGULAR_GRID_PREDEFINED_LEVELS];

    // Dynamically generate finer levels.
    // FIXED: Generate many more levels to handle extreme zoom scenarios
    let lastGeneratedLevel = allLevels[allLevels.length - 1];
    
    // Generate levels down to extremely fine detail - only limited by floating point precision
    // We'll generate at least 20 orders of magnitude finer than the current finest level
    const absoluteMinimum = 1e-15; // Close to JavaScript's floating point precision limit
    
    while (lastGeneratedLevel > absoluteMinimum) {
        lastGeneratedLevel /= 10;
        // Avoid adding duplicates if the predefined levels already contain this
        if (!allLevels.includes(lastGeneratedLevel)) {
            allLevels.push(lastGeneratedLevel);
        }
    }

    // Sort all levels in descending order (largest to smallest). This is crucial for
    // iterating through them to find the primary and secondary levels correctly.
    allLevels.sort((a, b) => b - a);

    let primaryLevel = null;
    let secondaryLevel = null;

    // Find the 'primaryLevel': the coarsest level that is still coarser than targetAngleDeg
    // and 'secondaryLevel': the next finer level for smooth transitions.
    for (let i = allLevels.length - 1; i >= 0; i--) {
        const currentLevel = allLevels[i];

        if (targetAngleDeg < currentLevel) {
            // Found the primary level (coarsest that's still coarser than target)
            primaryLevel = { angle: currentLevel, alpha: 1.0 };
            // The next finer level is a candidate for secondaryLevel
            if (i + 1 < allLevels.length) {
                secondaryLevel = { angle: allLevels[i + 1], alpha: 0 };
            }
            break; // Found our primary, exit loop
        }
    }

    // Edge case: If targetAngleDeg is larger than *all* generated levels,
    // then use the largest level as primary and second largest as secondary.
    if (!primaryLevel && allLevels.length > 0) {
        primaryLevel = { angle: allLevels[0], alpha: 1.0 }; // Largest level
        if (allLevels.length > 1) {
            secondaryLevel = { angle: allLevels[1], alpha: 0 };
        }
    } else if (!primaryLevel && allLevels.length === 0) {
        // Fallback if no levels were generated (should not happen if PREDEFINED_LEVELS is not empty)
        primaryLevel = { angle: ANGULAR_GRID_PREDEFINED_LEVELS[0], alpha: 1.0 };
    }

    results.push(primaryLevel);

    // Calculate alpha for the secondary level if it exists
    if (secondaryLevel) {
        const logPrimary = Math.log10(primaryLevel.angle);
        const logSecondary = Math.log10(secondaryLevel.angle);
        const logTarget = Math.log10(targetAngleDeg);

        // Interpolate 'interpValue' based on where targetAngleDeg falls between primary and secondary levels.
        // If targetAngleDeg is exactly primaryLevel, interpValue should be 0.
        // If targetAngleDeg is exactly secondaryLevel, interpValue should be 1.
        let interpValue;
        if (logSecondary === logPrimary) { // Avoid division by zero
            interpValue = 0;
        } else {
            // Normalize targetAngleDeg's position between primary and secondary log scales
            interpValue = (logTarget - logPrimary) / (logSecondary - logPrimary);
        }

        interpValue = Math.max(0, Math.min(1, interpValue)); // Clamp between 0 and 1

        // Apply smoothstep for a visually pleasing fade.
        const fadeInAlpha = interpValue * interpValue * (3 - 2 * interpValue);

        // Only add secondary level if its alpha is sufficiently high
        if (fadeInAlpha > ANGULAR_GRID_FADE_IN_THRESHOLD) {
            secondaryLevel.alpha = fadeInAlpha;
            results.push(secondaryLevel);
        }
    }

    // Final filtering for unique angles and ensuring proper order (largest angle first for draw order)
    const uniqueResults = [];
    const seenAngles = new Set();
    // Re-sort results by angle descending to ensure consistent drawing order in `drawPolarReferenceCircle`
    // (though `forEach` on `lastAngularGridState` doesn't strictly guarantee order, it's good practice)
    results.sort((a, b) => b.angle - a.angle);

    for (const res of results) {
        if (!seenAngles.has(res.angle)) {
            uniqueResults.push(res);
            seenAngles.add(res.angle);
        }
    }

    // If for some reason uniqueResults is empty, add a default coarse level
    if (uniqueResults.length === 0) {
        uniqueResults.push({ angle: ANGULAR_GRID_PREDEFINED_LEVELS[0], alpha: 1.0 });
    }

    return uniqueResults;
}




function calculateVisibleAngleRange(originScreen, screenRadius, canvasWidth, canvasHeight) {
    const margin = AXIS_LABEL_PADDING + REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN;
    const expandedRect = {
        left: -margin,
        right: canvasWidth + margin,
        top: -margin,
        bottom: canvasHeight + margin
    };

    if (originScreen.x + screenRadius < expandedRect.left || 
        originScreen.x - screenRadius > expandedRect.right ||
        originScreen.y + screenRadius < expandedRect.top || 
        originScreen.y - screenRadius > expandedRect.bottom) {
        return null;
    }

    const corners = [
        { x: expandedRect.left, y: expandedRect.top },
        { x: expandedRect.right, y: expandedRect.top },
        { x: expandedRect.right, y: expandedRect.bottom },
        { x: expandedRect.left, y: expandedRect.bottom }
    ];

    const visibleAngles = [];
    
    corners.forEach(corner => {
        const dx = corner.x - originScreen.x;
        const dy = corner.y - originScreen.y;
        const angle = Math.atan2(-dy, dx);
        const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
        visibleAngles.push(normalizedAngle * 180 / Math.PI);
    });

    const edges = [
        { x1: expandedRect.left, y1: expandedRect.top, x2: expandedRect.right, y2: expandedRect.top },
        { x1: expandedRect.right, y1: expandedRect.top, x2: expandedRect.right, y2: expandedRect.bottom },
        { x1: expandedRect.right, y1: expandedRect.bottom, x2: expandedRect.left, y2: expandedRect.bottom },
        { x1: expandedRect.left, y1: expandedRect.bottom, x2: expandedRect.left, y2: expandedRect.top }
    ];

    edges.forEach(edge => {
        const intersections = getLineCircleIntersections(
            edge.x1, edge.y1, edge.x2, edge.y2,
            originScreen.x, originScreen.y, screenRadius
        );
        
        intersections.forEach(point => {
            const dx = point.x - originScreen.x;
            const dy = point.y - originScreen.y;
            const angle = Math.atan2(-dy, dx);
            const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
            visibleAngles.push(normalizedAngle * 180 / Math.PI);
        });
    });

    if (visibleAngles.length === 0) {
        return { minAngle: 0, maxAngle: 360, isFullCircle: true };
    }

    const sortedAngles = visibleAngles.sort((a, b) => a - b);
    const anglePadding = 20;
    
    let minAngle = sortedAngles[0] - anglePadding;
    let maxAngle = sortedAngles[sortedAngles.length - 1] + anglePadding;
    
    const angleSpan = maxAngle - minAngle;
    
    if (angleSpan >= 300) {
        return { minAngle: 0, maxAngle: 360, isFullCircle: true };
    }
    
    minAngle = Math.max(0, minAngle);
    maxAngle = Math.min(360, maxAngle);

    return { minAngle, maxAngle, isFullCircle: false };
}

function getLineCircleIntersections(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = (fx * fx + fy * fy) - r * r;

    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) {
        return [];
    }

    const discriminantSqrt = Math.sqrt(discriminant);
    const t1 = (-b - discriminantSqrt) / (2 * a);
    const t2 = (-b + discriminantSqrt) / (2 * a);

    const intersections = [];
    
    if (t1 >= 0 && t1 <= 1) {
        intersections.push({
            x: x1 + t1 * dx,
            y: y1 + t1 * dy
        });
    }
    
    if (t2 >= 0 && t2 <= 1 && Math.abs(t2 - t1) > 1e-10) {
        intersections.push({
            x: x1 + t2 * dx,
            y: y1 + t2 * dy
        });
    }

    return intersections;
}

function generateOptimizedAngleSequence(angleStep, minAngle, maxAngle) {
    const angles = [];
    
    if (maxAngle > minAngle) {
        const startAngle = Math.floor(minAngle / angleStep) * angleStep;
        for (let angle = startAngle; angle <= maxAngle + angleStep; angle += angleStep) {
            if (angle >= 0 && angle < 360) {
                angles.push(angle);
            }
        }
    } else {
        const startAngle1 = Math.floor(minAngle / angleStep) * angleStep;
        for (let angle = startAngle1; angle < 360; angle += angleStep) {
            angles.push(angle);
        }
        
        for (let angle = 0; angle <= maxAngle + angleStep; angle += angleStep) {
            angles.push(angle);
        }
    }
    
    return [...new Set(angles)].sort((a, b) => a - b);
}

function shouldUseOptimizedFiltering(level, screenRadius, canvasWidth, canvasHeight) {
    const screenSeparation = screenRadius * (level.angle * Math.PI / 180);
    const minCanvasDimension = Math.min(canvasWidth, canvasHeight);
    
    return screenSeparation < minCanvasDimension / 50 && level.angle < 5;
}

function isTickVisible(tickEnd, canvasWidth, canvasHeight) {
    return tickEnd.x >= -AXIS_LABEL_PADDING && 
           tickEnd.x <= canvasWidth + AXIS_LABEL_PADDING && 
           tickEnd.y >= -AXIS_LABEL_PADDING && 
           tickEnd.y <= canvasHeight + AXIS_LABEL_PADDING;
}

export function drawPolarReferenceCircle(ctx, htmlOverlay, updateHtmlLabel, radius, alpha, state, dataToScreen, lastAngularGridState) {
    if (typeof dataToScreen !== 'function' || typeof updateHtmlLabel !== 'function') {
        return;
    }

    const { canvas, dpr, viewTransform, angleDisplayMode } = state;
    const originScreen = dataToScreen({ x: 0, y: 0 });
    const canvasWidthCSS = canvas.width / dpr;
    const canvasHeightCSS = canvas.height / dpr;
    const screenCenter = { x: canvasWidthCSS / 2, y: canvasHeightCSS / 2 };
    const baseRadius = Math.min(canvasWidthCSS, canvasHeightCSS) / 4;
    const panDistance = distance(originScreen, screenCenter);
    const screenRadius = baseRadius + panDistance;

    if (screenRadius < REF_CIRCLE_MIN_DISPLAY_RADIUS || !isCircleInView(originScreen.x, originScreen.y, screenRadius, canvasWidthCSS, canvasHeightCSS)) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = `rgba(${FEEDBACK_COLOR_DEFAULT.join(',')}, 1.0)`;
    ctx.lineWidth = FEEDBACK_LINE_VISUAL_WIDTH;
    
    const transitionRadius = Math.min(canvasWidthCSS, canvasHeightCSS) * 400;
    
    if (screenRadius > transitionRadius) {
        const screenRect = { x: 0, y: 0, w: canvasWidthCSS, h: canvasHeightCSS };
        const circle = { x: originScreen.x, y: originScreen.y, r: screenRadius };
        const intersections = getCircleRectIntersections(circle, screenRect);
        
        if (intersections.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(intersections[0].x, intersections[0].y);
            ctx.lineTo(intersections[1].x, intersections[1].y);
            ctx.stroke();
        }
    } else {
        ctx.beginPath();
        ctx.arc(originScreen.x, originScreen.y, screenRadius, 0, 2 * Math.PI);
        ctx.stroke();
    }
    
    ctx.restore();

    const dataRadius = screenRadius / (viewTransform.scale / dpr);
    const drawnAngles = new Set();

    lastAngularGridState.forEach(level => {
    const tickAlpha = level.alpha;
    if (tickAlpha < 0.01) return;

    const screenSeparation = screenRadius * (level.angle * Math.PI / 180);
    
    if (screenSeparation < REF_CIRCLE_MIN_TICK_SPACING * 0.5) return;

    const finalColor = `rgba(${FEEDBACK_COLOR_DEFAULT.join(',')}, ${tickAlpha * 0.95})`;

    const useOptimizedFiltering = shouldUseOptimizedFiltering(level, screenRadius, canvasWidthCSS, canvasHeightCSS);
    let anglesToProcess;

    if (useOptimizedFiltering) {
        const visibleRange = calculateVisibleAngleRange(originScreen, screenRadius, canvasWidthCSS, canvasHeightCSS);
        
        if (!visibleRange) {
            return;
        }

        if (visibleRange.isFullCircle) {
            anglesToProcess = [];
            for (let deg = 0; deg < 360; deg += level.angle) {
                anglesToProcess.push(deg);
            }
        } else {
            anglesToProcess = generateOptimizedAngleSequence(
                level.angle, 
                visibleRange.minAngle, 
                visibleRange.maxAngle
            );
        }
    } else {
        anglesToProcess = [];
        for (let deg = 0; deg < 360; deg += level.angle) {
            anglesToProcess.push(deg);
        }
    }

    let ticksProcessed = 0;
    const maxTicksToProcess = 1000;

    anglesToProcess.forEach(deg => {
        if (ticksProcessed >= maxTicksToProcess) return;

        if (drawnAngles.has(deg) && deg !== 0) return;
        if (deg === 0 && drawnAngles.has(deg) && level.angle !== 360) return;

        const angleRad = deg * Math.PI / 180;
        
        const tickStart = { 
            x: originScreen.x + (screenRadius - POINT_RADIUS) * Math.cos(angleRad), 
            y: originScreen.y - (screenRadius - POINT_RADIUS) * Math.sin(angleRad) 
        };
        const tickEnd = { 
            x: originScreen.x + (screenRadius + POINT_RADIUS) * Math.cos(angleRad), 
            y: originScreen.y - (screenRadius + POINT_RADIUS) * Math.sin(angleRad) 
        };

        if (!isTickVisible(tickEnd, canvasWidthCSS, canvasHeightCSS)) {
            return;
        }

        ticksProcessed++;

        ctx.save();
        ctx.strokeStyle = finalColor;
        ctx.lineWidth = GRID_LINEWIDTH;
        ctx.beginPath();
        ctx.moveTo(tickStart.x, tickStart.y);
        ctx.lineTo(tickEnd.x, tickEnd.y);
        ctx.stroke();
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
            if (deg === 0) {
                angleText = ''; // Don't show 0
            } else {
                // Check if this is a fine tick spacing (5 degrees or smaller)
                const isFineTick = level.angle <= 5;
                
                if (isFineTick) {
                    // Use raw radian values for fine ticks
                    const radianValue = deg * Math.PI / 180;
                    
                    // Calculate precision based on the angular interval (level.angle)
                    // The smaller the interval, the more precision we need
                    let precision;
                    if (level.angle >= 1) {
                        precision = 3; // 1 degree intervals: 0.017, 0.035, etc.
                    } else if (level.angle >= 0.1) {
                        precision = 4; // 0.1 degree intervals: 0.0017, 0.0035, etc.
                    } else if (level.angle >= 0.01) {
                        precision = 5; // 0.01 degree intervals: 0.00017, etc.
                    } else if (level.angle >= 0.001) {
                        precision = 6; // 0.001 degree intervals
                    } else {
                        precision = 7; // Even finer intervals
                    }
                    
                    // Always use the full precision - don't remove trailing zeros for fine ticks
                    let formattedRadian = radianValue.toFixed(precision);
                    
                    if (formattedRadian !== '0' && parseFloat(formattedRadian) !== 0) {
                        angleText = formattedRadian;
                    }
                } else {
                    // Use exact fractions of π for larger intervals
                    const numerator = deg;
                    const denominator = 180;
                    
                    // Simplify the fraction deg/180
                    const gcdValue = gcd(numerator, denominator);
                    const simplifiedNum = numerator / gcdValue;
                    const simplifiedDen = denominator / gcdValue;
                    
                    if (simplifiedDen === 1) {
                        // It's a whole number multiple of π
                        if (simplifiedNum === 1) {
                            angleText = '\\pi';
                        } else if (simplifiedNum === -1) {
                            angleText = '-\\pi';
                        } else {
                            angleText = `${simplifiedNum}\\pi`;
                        }
                    } else {
                        // It's a proper fraction of π
                        if (simplifiedNum === 1) {
                            angleText = `\\frac{\\pi}{${simplifiedDen}}`;
                        } else if (simplifiedNum === -1) {
                            angleText = `-\\frac{\\pi}{${simplifiedDen}}`;
                        } else if (simplifiedNum < 0) {
                            angleText = `-\\frac{${Math.abs(simplifiedNum)}\\pi}{${simplifiedDen}}`;
                        } else {
                            angleText = `\\frac{${simplifiedNum}\\pi}{${simplifiedDen}}`;
                        }
                    }
                }
            }
        }

        if (angleText) {
            const labelRadius = screenRadius + REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN;
            const labelPos = { 
                x: originScreen.x + labelRadius * Math.cos(angleRad), 
                y: originScreen.y - labelRadius * Math.sin(angleRad) 
            };
            const labelId = `circ-label-${deg}-${dataRadius.toExponential(15)}`;
            updateHtmlLabel({ 
                id: labelId, 
                content: angleText, 
                x: labelPos.x, 
                y: labelPos.y, 
                color: finalColor, 
                fontSize: REF_TEXT_KATEX_FONT_SIZE, 
                options: { textAlign: 'center', textBaseline: 'middle' } 
            });
        }
        
        drawnAngles.add(deg);
    });
});

    const arrowColor = FEEDBACK_COLOR_DEFAULT;
    let stickyArrowAngle = -Infinity;
    const zeroDegPoint = { x: originScreen.x + screenRadius, y: originScreen.y };
    if (zeroDegPoint.x > -AXIS_LABEL_PADDING && zeroDegPoint.x < canvasWidthCSS + AXIS_LABEL_PADDING && zeroDegPoint.y > -AXIS_LABEL_PADDING && zeroDegPoint.y < canvasHeightCSS + AXIS_LABEL_PADDING) {
        stickyArrowAngle = 0;
    } else {
        const screenRect = { x: 0, y: 0, w: canvasWidthCSS, h: canvasHeightCSS };
        const circle = { x: originScreen.x, y: originScreen.y, r: screenRadius };
        const intersections = getCircleRectIntersections(circle, screenRect);
        let boundaryAngles = intersections.map(p => Math.atan2(originScreen.y - p.y, p.x - originScreen.x));
        const corners = [{x:0,y:0}, {x:screenRect.w,y:0}, {x:screenRect.w,y:screenRect.h}, {x:0,y:screenRect.h}];
        corners.forEach(c => {
            if (distance(c, circle) < circle.r) {
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
                    const midPoint = { x: circle.x + circle.r * Math.cos(midAngle), y: circle.y - circle.r * Math.sin(midAngle) };
                    if (midPoint.x > 0 && midPoint.x < screenRect.w && midPoint.y > 0 && midPoint.y < screenRect.h) {
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
        const p1 = { x: tipPos.x - AXIS_ARROW_SIZE * tangentVec.x + (AXIS_ARROW_SIZE / 2) * radialVec.x, y: tipPos.y - AXIS_ARROW_SIZE * tangentVec.y + (AXIS_ARROW_SIZE / 2) * radialVec.y };
        const p2 = { x: tipPos.x - AXIS_ARROW_SIZE * tangentVec.x - (AXIS_ARROW_SIZE / 2) * radialVec.x, y: tipPos.y - AXIS_ARROW_SIZE * tangentVec.y - (AXIS_ARROW_SIZE / 2) * radialVec.y };
        ctx.save();
        ctx.fillStyle = `rgba(${arrowColor.join(',')}, 1.0)`;
        ctx.beginPath();
        ctx.moveTo(tipPos.x, tipPos.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const labelRadius = screenRadius - REF_CIRCLE_THETA_LABEL_OFFSET;
        const labelPos = { x: originScreen.x + labelRadius * Math.cos(arrowAngle), y: originScreen.y - labelRadius * Math.sin(arrowAngle) +2 };
        updateHtmlLabel({ id: `theta-label-sticky`, content: '\\theta', x: labelPos.x, y: labelPos.y, color: `rgba(${arrowColor.join(',')}, 1.0)`, fontSize: AXIS_NAME_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } });
    }
}

function getCircleRectIntersections(circle, rect) {
    // This function has no constants to refactor
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
    // This function has no constants to refactor
    if (circleX + circleRadius < 0 ||
        circleX - circleRadius > canvasWidth ||
        circleY + circleRadius < 0 ||
        circleY - circleRadius > canvasHeight) {
        return false;
    }
    return true;
}


function drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel) {
    const tickColor = `rgba(${AXIS_TICK_LABEL_COLOR.join(',')}, ${AXIS_TICK_LABEL_ALPHA})`;
    const longTickSize = AXIS_TICK_SIZE * 1.5;
    
    ctx.save();
    ctx.strokeStyle = tickColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    
    // Draw from origin going down-left at 60 degrees, with length measured in y-direction
    const angle = 60 * Math.PI / 180; // 60 degrees
    const yLength = longTickSize; // Length in y-direction
    const xLength = yLength / Math.tan(angle); // Calculate x-component for 60 degree angle
    
    const endX = origin.x - xLength; // Going left (negative x)
    const endY = origin.y + yLength; // Going down (positive y in canvas coordinates)
    
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    ctx.restore();
    
    updateHtmlLabel({
        id: 'tick-label-origin',
        content: '\\phantom{-}0',
        x: origin.x - AXIS_TICK_SIZE - AXIS_LABEL_OFFSET,
        y: origin.y + AXIS_TICK_SIZE + AXIS_LABEL_OFFSET,
        color: tickColor,
        fontSize: AXIS_TICK_FONT_SIZE,
        options: { textAlign: 'right', textBaseline: 'top' }
    });
}

export function drawAxes(ctx, htmlOverlay, state, dataToScreen, screenToData, lastGridState, lastAngularGridState, updateHtmlLabel) {
    const { canvas, dpr, coordsDisplayMode, viewTransform, angleDisplayMode } = state;
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
        ctx.lineTo(x2 - AXIS_ARROW_SIZE * Math.cos(angle - Math.PI / 6), y2 - AXIS_ARROW_SIZE * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - AXIS_ARROW_SIZE * Math.cos(angle + Math.PI / 6), y2 - AXIS_ARROW_SIZE * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    };

    ctx.lineWidth = AXIS_LINE_WIDTH;
    ctx.strokeStyle = AXIS_COLOR;
    ctx.fillStyle = AXIS_COLOR;

    if (coordsDisplayMode === 'polar') {
        const { interval1, interval2, alpha1, alpha2 } = lastGridState;
        ctx.lineWidth = GRID_LINEWIDTH;
        const topLeftData = screenToData({ x: 0, y: 0 });
        const bottomRightData = screenToData({ x: canvasWidth, y: canvasHeight });
        const maxRadiusData = Math.hypot(Math.max(Math.abs(topLeftData.x), Math.abs(bottomRightData.x)), Math.max(Math.abs(topLeftData.y), Math.abs(bottomRightData.y))) * 1.1;
        
        // Check if each axis endpoint is visible before drawing arrow and label
        const posXVisible = canvasWidth > origin.x;
        const negXVisible = 0 < origin.x;
        const posYVisible = 0 < origin.y;
        const negYVisible = canvasHeight > origin.y;
        
        if (posXVisible) {
            drawAxisWithArrows(origin.x, origin.y, canvasWidth, origin.y);
            updateHtmlLabel({ id: 'axis-label-r-posx', content: 'r', x: canvasWidth - AXIS_ARROW_SIZE - 20, y: origin.y - 10, color: AXIS_COLOR, fontSize: AXIS_NAME_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'bottom' } });
        }
        
        if (negXVisible) {
            drawAxisWithArrows(origin.x, origin.y, 0, origin.y);
            updateHtmlLabel({ id: 'axis-label-r-negx', content: 'r', x: AXIS_ARROW_SIZE + 20, y: origin.y - 10, color: AXIS_COLOR, fontSize: AXIS_NAME_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'bottom' } });
        }
        
        if (posYVisible) {
            drawAxisWithArrows(origin.x, origin.y, origin.x, 0);
            updateHtmlLabel({ id: 'axis-label-r-posy', content: 'r', x: origin.x + 15, y: AXIS_ARROW_SIZE + 20, color: AXIS_COLOR, fontSize: AXIS_NAME_FONT_SIZE, options: { textAlign: 'left', textBaseline: 'middle' } });
        }
        
        if (negYVisible) {
            drawAxisWithArrows(origin.x, origin.y, origin.x, canvasHeight);
            updateHtmlLabel({ id: 'axis-label-r-negy', content: 'r', x: origin.x + 15, y: canvasHeight - AXIS_ARROW_SIZE - 20, color: AXIS_COLOR, fontSize: AXIS_NAME_FONT_SIZE, options: { textAlign: 'left', textBaseline: 'middle' } });
        }
        
        const drawTicksAndLabelsPolar = (interval1, alpha1, interval2, alpha2) => {
            // Collect all tick positions and their maximum alpha
            const drawnPositions = new Map();
            
            const addTicksForInterval = (interval, alpha) => {
                if (!interval || alpha < 0.01) return;
                const screenSpacing = interval * viewTransform.scale;
                if (screenSpacing < 40) return;
                
                for (let r_data = interval; r_data <= maxRadiusData; r_data += interval) {
                    if (Math.abs(r_data) < GEOMETRY_CALCULATION_EPSILON) continue;
                    
                    const currentAlpha = drawnPositions.get(r_data) || 0;
                    drawnPositions.set(r_data, Math.max(currentAlpha, alpha));
                }
            };
            
            addTicksForInterval(interval1, alpha1);
            addTicksForInterval(interval2, alpha2);
            
            // Draw all ticks with their maximum alpha
            drawnPositions.forEach((maxAlpha, r_data) => {
                const currentTickLabelColor = `rgba(${AXIS_TICK_LABEL_COLOR.join(',')}, ${AXIS_TICK_LABEL_ALPHA * maxAlpha})`;
                ctx.strokeStyle = currentTickLabelColor;
                let sigFigsForLabel = 0;
                const screenSpacing = Math.max(
                    interval1 ? interval1 * viewTransform.scale : 0,
                    interval2 ? interval2 * viewTransform.scale : 0
                );
                if (screenSpacing > 80) sigFigsForLabel = 3; else if (screenSpacing > 40) sigFigsForLabel = 2; else if (screenSpacing > 20) sigFigsForLabel = 1; else sigFigsForLabel = 0;
                
                // Determine which interval this tick belongs to for decimal places
                let sourceInterval = interval1;
                if (interval2 && Math.abs(r_data % interval2) < Math.abs(r_data % interval1)) {
                    sourceInterval = interval2;
                }
                const decimalPlacesInInterval = sourceInterval > 0 ? -Math.floor(Math.log10(sourceInterval)) : 0;
                if (decimalPlacesInInterval > 0) {
                    sigFigsForLabel = Math.max(sigFigsForLabel, decimalPlacesInInterval + 1);
                }
                
                const labelText = formatNumber(r_data, sigFigsForLabel);
                const stableIdPart = r_data.toExponential(15);
                
                const pX = dataToScreen({ x: r_data, y: 0 });
                if (pX.x > -AXIS_LABEL_PADDING && pX.x < canvasWidth + AXIS_LABEL_PADDING) {
                    ctx.beginPath(); ctx.moveTo(pX.x, origin.y - AXIS_TICK_SIZE / 2); ctx.lineTo(pX.x, origin.y + AXIS_TICK_SIZE / 2); ctx.stroke();
                    updateHtmlLabel({ id: `polartick-r-x-${stableIdPart}`, content: labelText, x: pX.x, y: origin.y + AXIS_TICK_SIZE + AXIS_LABEL_OFFSET, color: currentTickLabelColor, fontSize: AXIS_TICK_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'top' } });
                }
                const pNegX = dataToScreen({ x: -r_data, y: 0 });
                if (pNegX.x > -AXIS_LABEL_PADDING && pNegX.x < canvasWidth + AXIS_LABEL_PADDING) {
                    ctx.beginPath(); ctx.moveTo(pNegX.x, origin.y - AXIS_TICK_SIZE / 2); ctx.lineTo(pNegX.x, origin.y + AXIS_TICK_SIZE / 2); ctx.stroke();
                    updateHtmlLabel({ id: `polartick-r-negx-${stableIdPart}`, content: labelText, x: pNegX.x, y: origin.y + AXIS_TICK_SIZE + AXIS_LABEL_OFFSET, color: currentTickLabelColor, fontSize: AXIS_TICK_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'top' } });
                }
                const pPosY = dataToScreen({ x: 0, y: r_data });
                if (pPosY.y > -AXIS_LABEL_PADDING && pPosY.y < canvasHeight + AXIS_LABEL_PADDING) {
                    ctx.beginPath(); ctx.moveTo(origin.x - AXIS_TICK_SIZE / 2, pPosY.y); ctx.lineTo(origin.x + AXIS_TICK_SIZE / 2, pPosY.y); ctx.stroke();
                    updateHtmlLabel({ id: `polartick-r-posy-${stableIdPart}`, content: labelText, x: origin.x - AXIS_TICK_SIZE - AXIS_LABEL_OFFSET, y: pPosY.y, color: currentTickLabelColor, fontSize: AXIS_TICK_FONT_SIZE, options: { textAlign: 'right', textBaseline: 'middle' } });
                }
                const pNegY = dataToScreen({ x: 0, y: -r_data });
                if (pNegY.y > -AXIS_LABEL_PADDING && pNegY.y < canvasHeight + AXIS_LABEL_PADDING) {
                    ctx.beginPath(); ctx.moveTo(origin.x - AXIS_TICK_SIZE / 2, pNegY.y); ctx.lineTo(origin.x + AXIS_TICK_SIZE / 2, pNegY.y); ctx.stroke();
                    updateHtmlLabel({ id: `polartick-r-negy-${stableIdPart}`, content: labelText, x: origin.x - AXIS_TICK_SIZE - AXIS_LABEL_OFFSET, y: pNegY.y, color: currentTickLabelColor, fontSize: AXIS_TICK_FONT_SIZE, options: { textAlign: 'right', textBaseline: 'middle' } });
                }
            });
        };
        
        drawTicksAndLabelsPolar(interval1, alpha1, interval2, alpha2);
        drawPolarReferenceCircle(ctx, htmlOverlay, updateHtmlLabel, 0, 0, state, dataToScreen, lastAngularGridState);
    } else {
        if (origin.y > 0 && origin.y < canvasHeight) drawAxisWithArrows(0, origin.y, canvasWidth, origin.y);
        if (origin.x > 0 && origin.x < canvasWidth) drawAxisWithArrows(origin.x, canvasHeight, origin.x, 0);
        let xLabel = 'x';
        let yLabel = 'y';
        if (coordsDisplayMode === 'complex') {
            xLabel = '\\mathrm{Re}';
            yLabel = '\\mathrm{Im}';
        }
        updateHtmlLabel({ id: 'axis-label-x', content: xLabel, x: canvasWidth - AXIS_ARROW_SIZE - 20, y: origin.y - 10, color: AXIS_COLOR, fontSize: AXIS_NAME_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'bottom' } });
        updateHtmlLabel({ id: 'axis-label-y', content: yLabel, x: origin.x + 15, y: AXIS_ARROW_SIZE + 20, color: AXIS_COLOR, fontSize: AXIS_NAME_FONT_SIZE, options: { textAlign: 'left', textBaseline: 'middle' } });
        
        const drawTicksAndLabelsRectilinear = (interval1, alpha1, interval2, alpha2) => {
            // Collect all tick positions and their maximum alpha
            const drawnXPositions = new Map();
            const drawnYPositions = new Map();
            
            const addTicksForInterval = (interval, alpha) => {
                if (!interval || alpha < 0.01) return;
                const topLeftData = screenToData({ x: 0, y: 0 });
                const bottomRightData = screenToData({ x: canvasWidth, y: canvasHeight });
                const localZeroThreshold = interval * 1e-6;
                const startTickX = Math.floor(topLeftData.x / interval) * interval;
                const endTickX = Math.ceil(bottomRightData.x / interval) * interval;
                const startTickY = Math.floor(bottomRightData.y / interval) * interval;
                const endTickY = Math.ceil(topLeftData.y / interval) * interval;
                
                for (let x_data = startTickX; x_data <= endTickX; x_data += interval) {
                    if (Math.abs(x_data) < localZeroThreshold) continue;
                    const currentAlpha = drawnXPositions.get(x_data) || 0;
                    drawnXPositions.set(x_data, Math.max(currentAlpha, alpha));
                }
                
                for (let y_data = startTickY; y_data <= endTickY; y_data += interval) {
                    if (Math.abs(y_data) < localZeroThreshold) continue;
                    const currentAlpha = drawnYPositions.get(y_data) || 0;
                    drawnYPositions.set(y_data, Math.max(currentAlpha, alpha));
                }
            };
            
            addTicksForInterval(interval1, alpha1);
            addTicksForInterval(interval2, alpha2);
            
            // Draw X ticks with maximum alpha
            drawnXPositions.forEach((maxAlpha, x_data) => {
                const tickLabelColor = `rgba(${AXIS_TICK_LABEL_COLOR.join(',')}, ${AXIS_TICK_LABEL_ALPHA * maxAlpha})`;
                ctx.strokeStyle = tickLabelColor;
                ctx.lineWidth = GRID_LINEWIDTH;
                
                // Determine source interval for formatting
                let sourceInterval = interval1;
                if (interval2 && Math.abs(x_data % interval2) < Math.abs(x_data % interval1)) {
                    sourceInterval = interval2;
                }
                const screenSpacing = sourceInterval * viewTransform.scale;
                let sigFigsForLabel = 0;
                if (screenSpacing > 80) sigFigsForLabel = 3; else if (screenSpacing > 40) sigFigsForLabel = 2; else if (screenSpacing > 20) sigFigsForLabel = 1; else sigFigsForLabel = 0;
                const decimalPlacesInInterval = sourceInterval > 0 ? -Math.floor(Math.log10(sourceInterval)) : 0;
                if (decimalPlacesInInterval > 0) {
                    sigFigsForLabel = Math.max(sigFigsForLabel, decimalPlacesInInterval + 1);
                }
                
                const screenX = dataToScreen({ x: x_data, y: 0 }).x;
                ctx.beginPath(); ctx.moveTo(screenX, origin.y); ctx.lineTo(screenX, origin.y + AXIS_TICK_SIZE); ctx.stroke();
                const getStableId = (prefix, num) => `${prefix}-${num.toExponential(15)}`;
                updateHtmlLabel({ id: getStableId('tick-label-x', x_data), content: formatNumber(x_data, sigFigsForLabel), x: screenX, y: origin.y + AXIS_TICK_SIZE + AXIS_LABEL_OFFSET, color: tickLabelColor, fontSize: AXIS_TICK_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'top' } });
            });
            
            // Draw Y ticks with maximum alpha
            drawnYPositions.forEach((maxAlpha, y_data) => {
                const tickLabelColor = `rgba(${AXIS_TICK_LABEL_COLOR.join(',')}, ${AXIS_TICK_LABEL_ALPHA * maxAlpha})`;
                ctx.strokeStyle = tickLabelColor;
                ctx.lineWidth = GRID_LINEWIDTH;
                
                // Determine source interval for formatting
                let sourceInterval = interval1;
                if (interval2 && Math.abs(y_data % interval2) < Math.abs(y_data % interval1)) {
                    sourceInterval = interval2;
                }
                const screenSpacing = sourceInterval * viewTransform.scale;
                let sigFigsForLabel = 0;
                if (screenSpacing > 80) sigFigsForLabel = 3; else if (screenSpacing > 40) sigFigsForLabel = 2; else if (screenSpacing > 20) sigFigsForLabel = 1; else sigFigsForLabel = 0;
                const decimalPlacesInInterval = sourceInterval > 0 ? -Math.floor(Math.log10(sourceInterval)) : 0;
                if (decimalPlacesInInterval > 0) {
                    sigFigsForLabel = Math.max(sigFigsForLabel, decimalPlacesInInterval + 1);
                }
                
                const screenY = dataToScreen({ x: 0, y: y_data }).y;
                let yLabelContent = formatNumber(y_data, sigFigsForLabel);
                if (coordsDisplayMode === 'complex' && yLabelContent !== "0") {
                    if (yLabelContent === '1') yLabelContent = 'i';
                    else if (yLabelContent === '-1') yLabelContent = '-i';
                    else yLabelContent += 'i';
                }
                ctx.beginPath(); ctx.moveTo(origin.x, screenY); ctx.lineTo(origin.x - AXIS_TICK_SIZE, screenY); ctx.stroke();
                const getStableId = (prefix, num) => `${prefix}-${num.toExponential(15)}`;
                updateHtmlLabel({ id: getStableId('tick-label-y', y_data), content: yLabelContent, x: origin.x - AXIS_TICK_SIZE - AXIS_LABEL_OFFSET, y: screenY, color: tickLabelColor, fontSize: AXIS_TICK_FONT_SIZE, options: { textAlign: 'right', textBaseline: 'middle' } });
            });
        };
        
        drawTicksAndLabelsRectilinear(lastGridState.interval1, lastGridState.alpha1, lastGridState.interval2, lastGridState.alpha2);
    }

    drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel);

    ctx.restore();
}

export function drawGrid(ctx, state, dataToScreen, screenToData, lastGridState, lastAngularGridState) {
    const { gridDisplayMode, canvas, dpr, viewTransform, gridAlpha } = state;
    if (gridDisplayMode === 'none') return;

    ctx.save();

    const origin = dataToScreen({ x: 0, y: 0 });
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;

    if (gridDisplayMode === 'polar') {
        const topLeftData = screenToData({ x: 0, y: 0 });
        const bottomRightData = screenToData({ x: canvasWidth, y: canvasHeight });
        const maxDataRadius = Math.hypot(Math.max(Math.abs(topLeftData.x), Math.abs(bottomRightData.x)), Math.max(Math.abs(topLeftData.y), Math.abs(bottomRightData.y)));

        const drawPolarCircles = (interval, alpha) => {
            if (!interval || alpha < 0.01) return;
            
            const screenSpacing = interval * viewTransform.scale / dpr;
            if (screenSpacing < GRID_POLAR_CIRCLE_MIN_SPACING) return;

            ctx.strokeStyle = `rgba(${GRID_COLOR.join(',')}, ${alpha * gridAlpha})`;
            ctx.lineWidth = GRID_LINEWIDTH;
            for (let r = interval; r <= maxDataRadius; r += interval) {
                const screenRadius = r * viewTransform.scale / dpr;
                // Assuming isCircleInView function is available from elsewhere
                if (isCircleInView(origin.x, origin.y, screenRadius, canvasWidth, canvasHeight)) {
                    ctx.beginPath();
                    ctx.arc(origin.x, origin.y, screenRadius, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            }
        };

        drawPolarCircles(lastGridState.interval1, lastGridState.alpha1);
        drawPolarCircles(lastGridState.interval2, lastGridState.alpha2);

        const screenRadiusForSpokes = maxDataRadius * viewTransform.scale / dpr;
        const drawnAngles = new Set();

        lastAngularGridState.forEach(level => {
            if (level.alpha < 0.01) return;

            const screenSeparation = screenRadiusForSpokes * (level.angle * Math.PI / 180);
            if (screenSeparation < GRID_POLAR_SPOKE_MIN_SPACING && screenRadiusForSpokes > GRID_POLAR_SPOKE_MIN_RADIUS) return;

            ctx.strokeStyle = `rgba(${GRID_COLOR.join(',')}, ${level.alpha * gridAlpha})`;
            ctx.lineWidth = GRID_LINEWIDTH;

            for (let angle = 0; angle < 360; angle += level.angle) {
                if (drawnAngles.has(angle)) continue;

                const rad = angle * Math.PI / 180;
                const endX = origin.x + screenRadiusForSpokes * Math.cos(rad);
                const endY = origin.y + screenRadiusForSpokes * Math.sin(rad);
                ctx.beginPath();
                ctx.moveTo(origin.x, origin.y);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                drawnAngles.add(angle);
            }
        });

    } else {
        const drawGridElements = (interval, alpha) => {
            if (!interval || alpha < 0.01) return;
            const gridElementColor = `rgba(${GRID_COLOR.join(',')}, ${alpha * gridAlpha})`;

            const start = screenToData({ x: 0, y: canvasHeight });
            const end = screenToData({ x: canvasWidth, y: 0 });
            const startTickX = Math.floor(start.x / interval) * interval;
            const endTickX = Math.ceil(end.x / interval) * interval;
            const startTickY = Math.floor(start.y / interval) * interval;
            const endTickY = Math.ceil(end.y / interval) * interval;

            if (gridDisplayMode === 'lines') {
                ctx.strokeStyle = gridElementColor;
                ctx.lineWidth = GRID_LINEWIDTH;
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
            } else if (gridDisplayMode === 'points') {
                ctx.fillStyle = gridElementColor;
                const pointRadius = GRID_POINT_RADIUS * dpr;
                for (let x = startTickX; x <= endTickX; x += interval) {
                    for (let y = startTickY; y <= endTickY; y += interval) {
                        const screenPos = dataToScreen({ x: x, y: y });
                        ctx.beginPath();
                        ctx.arc(screenPos.x, screenPos.y, pointRadius, 0, 2 * Math.PI);
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
    ctx.lineWidth = GRID_LINEWIDTH;
    ctx.setLineDash(isDashed ? DASH_PATTERN_SMALL : []);
    const canvasStartAngle = -dataStartAngleRad;
    const canvasEndAngle = -dataEndAngleRad;
    let signedAngleDiffData = normalizeAngleToPi(dataEndAngleRad - dataStartAngleRad);
    ctx.beginPath();
    ctx.arc(centerScreen.x, centerScreen.y, radius, canvasStartAngle, canvasEndAngle, signedAngleDiffData > 0);
    ctx.stroke();
    ctx.restore();
}

function drawCenterSymbol(ctx, point, dataToScreen) {
    const screenPos = dataToScreen(point); const radius = CENTER_POINT_VISUAL_RADIUS;
    ctx.strokeStyle = 'white';
    ctx.setLineDash([]); ctx.lineWidth = LINE_WIDTH;
    if (point.type === 'center_rotate_scale') {
        ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x - radius, screenPos.y); ctx.lineTo(screenPos.x + radius, screenPos.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x, screenPos.y - radius); ctx.lineTo(screenPos.x, screenPos.y + radius); ctx.stroke();
    } else if (point.type === 'center_rotate_only') {
        ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI); ctx.stroke();
    } else if (point.type === 'center_scale_only') {
        ctx.beginPath(); ctx.moveTo(screenPos.x - radius, screenPos.y); ctx.lineTo(screenPos.x + radius, screenPos.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(screenPos.x, screenPos.y - radius); ctx.lineTo(screenPos.x, screenPos.y + radius); ctx.stroke();
    }
}

export function drawPoint(ctx, point, state, dataToScreen) {
    const { selectedPointIds, selectedCenterIds, activeCenterId, currentColor } = state;
    let isSelected;
    if (point.type === 'regular') {
        isSelected = selectedPointIds.includes(point.id);
    } else {
        isSelected = selectedCenterIds.includes(point.id);
    }

    const pointColor = point.color || currentColor;
    const screenPos = dataToScreen(point);

    if (point.type !== 'regular') {
        drawCenterSymbol(ctx, point, dataToScreen);
    } else {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = pointColor;
        ctx.fill();
    }

    if (isSelected) {
        ctx.save();
        ctx.shadowColor = point.id === activeCenterId ? '#00ffff' : '#4da6ff';
        ctx.shadowBlur = 15;
        ctx.globalAlpha = 0.8;

        ctx.beginPath();
        const glowRadius = point.type !== 'regular' ? CENTER_POINT_VISUAL_RADIUS + 3 : POINT_RADIUS + 3;
        ctx.arc(screenPos.x, screenPos.y, glowRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = point.id === activeCenterId ? '#00ffff' : '#4da6ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }
}

export function drawAllEdges(ctx, state, dataToScreen, findPointById, getEdgeId) {
    const { allEdges, selectedEdgeIds, isDragConfirmed, dragPreviewPoints, currentColor } = state;
    ctx.lineWidth = LINE_WIDTH;
    allEdges.forEach(edge => {
        const p1_orig = findPointById(edge.id1);
        const p2_orig = findPointById(edge.id2);
        if (!p1_orig || !p2_orig || p1_orig.type !== 'regular' || p2_orig.type !== 'regular') return;

        let p1_render = { ...p1_orig };
        let p2_render = { ...p2_orig };
        let isBeingDragged = false;

        if (isDragConfirmed && dragPreviewPoints.length > 0) {
            const p1Preview = dragPreviewPoints.find(dp => dp.id === p1_orig.id);
            const p2Preview = dragPreviewPoints.find(dp => dp.id === p2_orig.id);
            if (p1Preview) { p1_render.x = p1Preview.x; p1_render.y = p1Preview.y; }
            if (p2Preview) { p2_render.x = p2Preview.x; p2_render.y = p2Preview.y; }
            if (p1Preview || p2Preview) isBeingDragged = true;
        }

        const p1Screen = dataToScreen(p1_render);
        const p2Screen = dataToScreen(p2_render);
        const edgeId = getEdgeId(edge);
        const isSelected = selectedEdgeIds.includes(edgeId);

        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);

        const color1 = p1_orig.color || currentColor;
        const color2 = p2_orig.color || currentColor;
        if (color1 === color2) {
            ctx.strokeStyle = color1;
        } else {
            const gradient = ctx.createLinearGradient(p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y);
            gradient.addColorStop(0, color1);
            gradient.addColorStop(1, color2);
            ctx.strokeStyle = gradient;
        }

        ctx.setLineDash(isBeingDragged ? DASH_PATTERN : []);
        ctx.lineWidth = LINE_WIDTH;
        ctx.stroke();
        ctx.setLineDash([]);

        if (isSelected) {
            ctx.beginPath();
            ctx.moveTo(p1Screen.x, p1Screen.y);
            ctx.lineTo(p2Screen.x, p2Screen.y);
            ctx.strokeStyle = '#4da6ff';
            ctx.globalAlpha = 0.8;
            ctx.lineWidth = LINE_WIDTH + 4;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    });
    ctx.setLineDash([]);
    ctx.strokeStyle = 'white';
}

export function drawDragFeedback(ctx, htmlOverlay, targetPointId, currentPointStates, state, dataToScreen, findNeighbors, getEdgeId, isSnapping = false, excludedEdgeId = null, updateHtmlLabel = null) {
    const { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed } = state;
    const feedbackColor = isSnapping ? FEEDBACK_COLOR_SNAPPED : `rgba(${FEEDBACK_COLOR_DEFAULT.join(',')}, 1.0)`;
    const katexFontSize = FEEDBACK_LABEL_FONT_SIZE;
    const ARC_RADIUS_SCREEN = FEEDBACK_ARC_RADIUS_SCREEN;
    const LABEL_OFFSET_DIST_SCREEN = FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;

    const livePoints = new Map(currentPointStates.map(p => [p.id, { ...p }]));
    const getLivePoint = (id) => livePoints.get(id);

    const vertex = getLivePoint(targetPointId);
    if (!vertex) return;

    const neighbors = findNeighbors(vertex.id).map(getLivePoint).filter(Boolean);
    if (neighbors.length === 0) return;

    const gridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;

    const isPointOnGrid = (point, interval) => {
        if (!interval || interval <= 0) return false;
        const epsilon = interval * GEOMETRY_CALCULATION_EPSILON;
        const isOnGridX = Math.abs(point.x / interval - Math.round(point.x / interval)) < epsilon;
        const isOnGridY = Math.abs(point.y / interval - Math.round(point.y / interval)) < epsilon;
        return isOnGridX && isOnGridY;
    };

    const vertexScreen = dataToScreen(vertex);

    neighbors.forEach(neighbor => {
        const dist = distance(vertex, neighbor);
        if (dist < GEOMETRY_CALCULATION_EPSILON) return;

        const currentEdgeId = getEdgeId({ id1: vertex.id, id2: neighbor.id });

        if (currentEdgeId !== excludedEdgeId) {
            if (showDistances) {
                let distText;
                const areBothPointsOnGrid = gridInterval && isPointOnGrid(vertex, gridInterval) && isPointOnGrid(neighbor, gridInterval);
                if (areBothPointsOnGrid) {
                    const deltaX = vertex.x - neighbor.x;
                    const deltaY = vertex.y - neighbor.y;
                    const dx_grid = Math.round(deltaX / gridInterval);
                    const dy_grid = Math.round(deltaY / gridInterval);
                    const g2gSquaredSumForDisplay = dx_grid * dx_grid + dy_grid * dy_grid;
                    if (g2gSquaredSumForDisplay === 0) {
                        distText = '0';
                    } else {
                        const [coeff, radicand] = simplifySquareRoot(g2gSquaredSumForDisplay);
                        const finalCoeff = gridInterval * coeff;
                        const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                        distText = formatSimplifiedRoot(roundedFinalCoeff, radicand);
                    }
                } else {
                    distText = formatNumber(dist, distanceSigFigs);
                }

                const neighborScreen = dataToScreen(neighbor);
                const edgeAngleScreen = Math.atan2(neighborScreen.y - vertexScreen.y, neighborScreen.x - vertexScreen.x);

                const midX = (vertexScreen.x + neighborScreen.x) / 2;
                const midY = (vertexScreen.y + neighborScreen.y) / 2;

                let textOffset = LABEL_OFFSET_DIST_SCREEN;

                const labelId = `drag-dist-${vertex.id}-${neighbor.id}`;

                if (Math.abs(Math.cos(edgeAngleScreen)) < VERTICAL_LINE_COS_THRESHOLD) {
                    const distanceTextX = midX + textOffset;
                    const distanceTextY = midY;
                    updateHtmlLabel({ id: labelId, content: distText, x: distanceTextX, y: distanceTextY, color: feedbackColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle', rotation: 90 } }, htmlOverlay);
                } else {
                    let textPerpAngle = edgeAngleScreen - Math.PI / 2;
                    if (Math.sin(textPerpAngle) > 0) {
                        textPerpAngle += Math.PI;
                    }
                    const distanceTextX = midX + Math.cos(textPerpAngle) * textOffset;
                    const distanceTextY = midY + Math.sin(textPerpAngle) * textOffset;

                    let rotationDeg = edgeAngleScreen * (180 / Math.PI);
                    if (rotationDeg > 90 || rotationDeg < -90) {
                        rotationDeg += 180;
                    }

                    updateHtmlLabel({ id: labelId, content: distText, x: distanceTextX, y: distanceTextY, color: feedbackColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } }, htmlOverlay);
                }
            } else {
                
            }
        }
    });

    if (showAngles && neighbors.length >= 2) {
        const sortedNeighbors = [...neighbors].sort((a, b) => {
            const angleA = Math.atan2(a.y - vertex.y, a.x - vertex.x);
            const angleB = Math.atan2(b.y - vertex.y, b.x - vertex.x);
            return angleA - angleB;
        });

        for (let i = 0; i < sortedNeighbors.length; i++) {
            const p1 = sortedNeighbors[i];
            const p2 = sortedNeighbors[(i + 1) % sortedNeighbors.length];
            const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
            const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
            const angle1_data = Math.atan2(v1.y, v1.x);
            const angle2_data = Math.atan2(v2.y, v2.x);
            let angleToDisplayRad = angle2_data - angle1_data;
            if (angleToDisplayRad < 0) {
                angleToDisplayRad += 2 * Math.PI;
            }
            if (angleToDisplayRad < GEOMETRY_CALCULATION_EPSILON) continue;
            const LABEL_RADIUS_SCREEN = ANGLE_LABEL_RADIUS_SCREEN;
            const bisectorAngle = angle1_data + (angleToDisplayRad / 2);
            ctx.save();
            ctx.strokeStyle = feedbackColor;
            ctx.lineWidth = FEEDBACK_LINE_VISUAL_WIDTH;
            ctx.beginPath();
            ctx.arc(vertexScreen.x, vertexScreen.y, ARC_RADIUS_SCREEN, -angle1_data, -angle2_data, false);
            ctx.stroke();
            ctx.restore();

            let angleText;
            if (angleDisplayMode === 'degrees') {
                angleText = `${formatNumber(angleToDisplayRad * (180 / Math.PI), angleSigFigs)}^{\\circ}`;
            } else if (angleDisplayMode === 'radians') {
                if (currentShiftPressed) {
                    angleText = formatFraction(angleToDisplayRad / Math.PI, 0.001, 6) + '\\pi';
                    if (angleText.startsWith("1\\pi")) angleText = "\\pi";
                    if (angleText.startsWith("-1\\pi")) angleText = "-\\pi";
                    if (angleText === "0\\pi") angleText = "0";
                } else {
                    angleText = formatNumber(angleToDisplayRad, angleSigFigs);
                }
            }

            if (angleText) {
                const angleLabelDataPos = {
                    x: vertex.x + (LABEL_RADIUS_SCREEN / state.viewTransform.scale) * Math.cos(bisectorAngle),
                    y: vertex.y + (LABEL_RADIUS_SCREEN / state.viewTransform.scale) * Math.sin(bisectorAngle)
                };
                const angleLabelScreenPos = dataToScreen(angleLabelDataPos);
                const labelId = `drag-angle-${vertex.id}-${p1.id}-${p2.id}`;
                updateHtmlLabel({ id: labelId, content: angleText, x: angleLabelScreenPos.x, y: angleLabelScreenPos.y, color: feedbackColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
            } else {
                
            }
        }
    } else {
        neighbors.forEach(neighbor1 => {
            neighbors.forEach(neighbor2 => {
                if (neighbor1.id !== neighbor2.id) {
                    
                }
            });
        });
    }
}

export function drawTransformIndicators(ctx, htmlOverlay, state, dataToScreen, updateHtmlLabel) {
    const { transformIndicatorData, angleSigFigs, distanceSigFigs } = state;
    if (!transformIndicatorData) return;

    const { center, startPos, currentPos, rotation, scale, isSnapping, snappedScaleValue, transformType } = transformIndicatorData;

    const centerScreen = dataToScreen(center);
    const startScreen = dataToScreen(startPos);
    const currentScreen = dataToScreen(currentPos);

    const color = isSnapping ? 'rgba(240, 240, 130, 0.95)' : 'rgba(230, 230, 230, 0.95)';
    const katexFontSize = 12;

    const startVecScreen = { x: startScreen.x - centerScreen.x, y: startScreen.y - centerScreen.y };
    const currentVecScreen = { x: currentScreen.x - centerScreen.x, y: currentScreen.y - centerScreen.y };

    const startAngleScreen = Math.atan2(startVecScreen.y, startVecScreen.x);
    const currentAngleScreen = Math.atan2(currentVecScreen.y, currentVecScreen.x);
    const arcRadius = Math.hypot(startVecScreen.x, startVecScreen.y);

    ctx.save();
    ctx.setLineDash(DASH_PATTERN);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(centerScreen.x, centerScreen.y);
    ctx.lineTo(startScreen.x, startScreen.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerScreen.x, centerScreen.y);
    ctx.lineTo(currentScreen.x, currentScreen.y);
    ctx.stroke();

    ctx.setLineDash([]);

    if (transformType !== 'center_scale_only' && Math.abs(rotation) > 0.001) {
        const screenRotation = -rotation;
        const anticlockwise = screenRotation < 0;
        ctx.beginPath();
        ctx.arc(centerScreen.x, centerScreen.y, arcRadius, startAngleScreen, startAngleScreen + screenRotation, anticlockwise);
        ctx.stroke();
    }
    ctx.restore();

    if (transformType !== 'center_scale_only' && Math.abs(rotation) > 0.001) {
        const angleDeg = rotation * (180 / Math.PI);
        const angleText = `${formatNumber(angleDeg, angleSigFigs)}^{\\circ}`;
        const angleDiff = normalizeAngleToPi(currentAngleScreen - startAngleScreen);
        const bisectorAngle = startAngleScreen + angleDiff / 2;
        const labelRadius = arcRadius + 20;
        const angleTextX = centerScreen.x + labelRadius * Math.cos(bisectorAngle);
        const angleTextY = centerScreen.y + labelRadius * Math.sin(bisectorAngle);

        updateHtmlLabel({ id: 'transform-angle-indicator', content: angleText, x: angleTextX, y: angleTextY, color: color, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }

    if (transformType !== 'center_rotate_only' && Math.abs(scale - 1) > 0.001) {
        let scaleText;
        if (isSnapping && snappedScaleValue !== null) {
            scaleText = `\\times ${formatFraction(snappedScaleValue, 0.001, 10)}`;
        } else {
            scaleText = `\\times ${formatNumber(scale, distanceSigFigs)}`;
        }

        const midX = (centerScreen.x + currentScreen.x) / 2;
        const midY = (centerScreen.y + currentScreen.y) / 2;
        let textPerpAngle = currentAngleScreen - Math.PI / 2;
        const textOffset = 18;
        const scaleTextX = midX + Math.cos(textPerpAngle) * textOffset;
        const scaleTextY = midY + Math.sin(textPerpAngle) * textOffset;

        let rotationDeg = currentAngleScreen * (180 / Math.PI);
        if (rotationDeg > 90 || rotationDeg < -90) {
            rotationDeg += 180;
        }

        updateHtmlLabel({ id: 'transform-scale-indicator', content: scaleText, x: scaleTextX, y: scaleTextY, color: color, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'bottom', rotation: rotationDeg } }, htmlOverlay);
    }
}

export function drawReferenceElementsGeometry(ctx, context, dataToScreen, screenToData, state) {
    if ((!state.showAngles && !state.showDistances) || !context.frozen_Origin_Data_to_display) return;
    const { viewTransform } = state;

    const startPointData = context.frozen_Origin_Data_to_display;
    const mouseDataPos = screenToData(state.mousePos);
    const previewDistance = distance(startPointData, mouseDataPos);
    const epsilon = 1e-6;
    if (previewDistance < epsilon) return;

    const refElementColor = FROZEN_REFERENCE_COLOR;
    const ARC_RADIUS_SCREEN_REF = 35;

    const turnAngleData = context.displayAngleA_valueRad_for_A_equals_label;
    const baseAngleData = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
    const distanceData = context.frozen_D_du_to_display;

    if (!startPointData) return;

    const frozenOriginScreen = dataToScreen(startPointData);
    const absoluteAngleForRefLine = baseAngleData + turnAngleData;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = refElementColor;

    if (state.showAngles && context.displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(context.displayAngleA_valueRad_for_A_equals_label) > epsilon) {
        const effectiveRadiusForLine = ARC_RADIUS_SCREEN_REF + ctx.lineWidth / 2;

        const dottedLineEndPointData = {
            x: startPointData.x + Math.cos(baseAngleData) * (effectiveRadiusForLine / viewTransform.scale),
            y: startPointData.y + Math.sin(baseAngleData) * (effectiveRadiusForLine / viewTransform.scale)
        };
        const dottedLineEndPointScreen = dataToScreen(dottedLineEndPointData);

        ctx.beginPath();
        ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y);
        ctx.lineTo(dottedLineEndPointScreen.x, dottedLineEndPointScreen.y);
        ctx.setLineDash([1, 3]);
        ctx.stroke();

        drawAngleArc(ctx, frozenOriginScreen, baseAngleData, absoluteAngleForRefLine, ARC_RADIUS_SCREEN_REF, refElementColor, false);
    }
    ctx.restore();
}

export function prepareSnapInfoTexts(ctx, htmlOverlay, startPointData, targetDataPos, snappedOutput, state, dataToScreen, drawingContext, updateHtmlLabel) {
    const { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform } = state;
    const epsilon = GEOMETRY_CALCULATION_EPSILON;
    if ((!showAngles && !showDistances) || snappedOutput.distance < epsilon) {
        return;
    }

    const startScreen = dataToScreen(startPointData);
    const { angle: snappedAbsoluteAngleDeg, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn, gridToGridSquaredSum, gridInterval } = snappedOutput;
    const { offsetAngleRad, isFirstSegmentBeingDrawn, currentSegmentReferenceA_for_display, currentSegmentReferenceD } = drawingContext;
    const currentElementColor = currentShiftPressed ? GEOMETRY_INFO_TEXT_COLOR_SNAPPED : GEOMETRY_INFO_TEXT_COLOR;
    const katexFontSize = 12;
    const ARC_RADIUS_SCREEN_SNAP = 30;
    const currentLineAbsoluteAngle = Math.atan2(targetDataPos.y - startPointData.y, targetDataPos.x - startPointData.x);

    if (showDistances) {
        let distanceText = '';

        if (currentShiftPressed && !isFirstSegmentBeingDrawn && state.frozenReference_D_du !== null) {
            const currentExactDistance = snappedDistanceData;

            if (gridToGridSquaredSum !== null && gridInterval) {
                const actualGridDistance = gridInterval * Math.sqrt(gridToGridSquaredSum);
                if (Math.abs(actualGridDistance - state.frozenReference_D_du) < epsilon) {
                    distanceText = '\\delta';
                } else {
                    const ratio = actualGridDistance / state.frozenReference_D_du;
                    let foundFraction = false;
                    for (const factor of SNAP_FACTORS) {
                        if (Math.abs(ratio - factor) < epsilon) {
                            distanceText = formatSnapFactor(factor, 'D');
                            foundFraction = true;
                            break;
                        }
                    }
                    if (!foundFraction) {
                        const [coeff, radicand] = simplifySquareRoot(gridToGridSquaredSum);
                        const finalCoeff = gridInterval * coeff;
                        const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                        distanceText = formatSimplifiedRoot(roundedFinalCoeff, radicand);
                    }
                }
            } else if (state.frozenReference_D_du > epsilon) {
                const ratio = currentExactDistance / state.frozenReference_D_du;
                let foundFraction = false;
                for (const factor of SNAP_FACTORS) {
                    if (Math.abs(ratio - factor) < epsilon) {
                        distanceText = formatSnapFactor(factor, 'D');
                        foundFraction = true;
                        break;
                    }
                }
                if (!foundFraction) {
                    distanceText = formatNumber(snappedDistanceData, distanceSigFigs);
                }
            } else {
                distanceText = formatNumber(snappedDistanceData, distanceSigFigs);
            }
        } else if (currentShiftPressed && isFirstSegmentBeingDrawn && state.gridDisplayMode !== 'none' && gridInterval) {
            if (gridToGridSquaredSum !== null && gridInterval) {
                if (gridToGridSquaredSum >= 0) {
                    const [coeff, radicand] = simplifySquareRoot(gridToGridSquaredSum);
                    const finalCoeff = gridInterval * coeff;
                    const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
                    distanceText = formatSimplifiedRoot(roundedFinalCoeff, radicand);
                }
            } else {
                distanceText = formatNumber(snappedDistanceData, distanceSigFigs);
            }
        } else {
            distanceText = formatNumber(snappedDistanceData, distanceSigFigs);
        }

        if (distanceText) {
            const startScreenPos = dataToScreen(startPointData);
            const endScreenPos = dataToScreen(targetDataPos);
            const edgeAngleScreen = Math.atan2(endScreenPos.y - startScreenPos.y, endScreenPos.x - startScreenPos.x);
            const midX = (startScreenPos.x + endScreenPos.x) / 2;
            const midY = (startScreenPos.y + endScreenPos.y) / 2;
            let textOffset = 18;

            if (Math.abs(Math.cos(edgeAngleScreen)) < VERTICAL_LINE_COS_THRESHOLD) {
                const distanceTextX = midX + textOffset;
                const distanceTextY = midY;
                updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle', rotation: 90 } }, htmlOverlay);
            } else {
                let textPerpAngle;
                const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad;

                if (showAngles && snappedDistanceData > epsilon && Math.abs(angleTurn) > epsilon) {
                    const canvasStartAngle = -baseAngleForArc;
                    const canvasEndAngle = -currentLineAbsoluteAngle;
                    const sumCos = Math.cos(canvasStartAngle) + Math.cos(canvasEndAngle);
                    const sumSin = Math.sin(canvasStartAngle) + Math.sin(canvasEndAngle);
                    const angleLabelBisectorRad = Math.atan2(sumSin, sumCos);
                    const perp1 = edgeAngleScreen - Math.PI / 2;
                    const perp2 = edgeAngleScreen + Math.PI / 2;
                    const diff1 = Math.abs(normalizeAngleToPi(perp1 - angleLabelBisectorRad));
                    const diff2 = Math.abs(normalizeAngleToPi(perp2 - angleLabelBisectorRad));
                    textPerpAngle = diff1 > diff2 ? perp1 : perp2;
                } else {
                    textPerpAngle = edgeAngleScreen - Math.PI / 2;
                    if (Math.sin(textPerpAngle) > 0) {
                        textPerpAngle += Math.PI;
                    }
                }
                const distanceTextX = midX + Math.cos(textPerpAngle) * textOffset;
                const distanceTextY = midY + Math.sin(textPerpAngle) * textOffset;
                let rotationDeg = edgeAngleScreen * (180 / Math.PI);
                if (rotationDeg > 90 || rotationDeg < -90) {
                    rotationDeg += 180;
                }
                updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } }, htmlOverlay);
            }
        }
    }

    if (showAngles && snappedDistanceData > epsilon && Math.abs(angleTurn) > epsilon) {
        const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad;

        drawAngleArc(ctx, startScreen, baseAngleForArc, currentLineAbsoluteAngle, ARC_RADIUS_SCREEN_SNAP, currentElementColor);

        ctx.save();
        ctx.beginPath();
        const effectiveRadiusForLine = ARC_RADIUS_SCREEN_SNAP + ctx.lineWidth / 2;
        const baseLineEndData = {
            x: startPointData.x + (effectiveRadiusForLine / viewTransform.scale) * Math.cos(baseAngleForArc),
            y: startPointData.y + (effectiveRadiusForLine / viewTransform.scale) * Math.sin(baseAngleForArc)
        };
        const baseLineEndScreen = dataToScreen(baseLineEndData);
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(baseLineEndScreen.x, baseLineEndScreen.y);
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.6)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        let angleText = '';
        const canReferToTheta = !isFirstSegmentBeingDrawn && state.frozenReference_A_rad !== null && Math.abs(state.frozenReference_A_rad) > epsilon;

        if (angleDisplayMode === 'degrees') {
            if (currentShiftPressed && canReferToTheta) {
                const referenceAngleRad = Math.abs(currentSegmentReferenceA_for_display);
                let potentialFactor = null;

                if (typeof angleSnapFactor === 'number') {
                    potentialFactor = angleSnapFactor;
                } else if (angleTurn !== null) {
                    if (Math.abs(referenceAngleRad) > epsilon) {
                        const calculatedFactor = angleTurn / referenceAngleRad;
                        for (const frac of NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
                            if (Math.abs(Math.abs(calculatedFactor) - frac) < epsilon) {
                                potentialFactor = calculatedFactor < 0 ? -frac : frac;
                                break;
                            }
                        }
                    }
                }
                if (potentialFactor !== null && Math.abs(potentialFactor) > epsilon) {
                    angleText = formatSnapFactor(potentialFactor, 'A');
                } else {
                    // Keep the original sign of angleTurn for consistent display
                    let degrees = angleTurn * (180 / Math.PI);
                    if (Math.abs(degrees) > epsilon) {
                        angleText = `${formatNumber(degrees, angleSigFigs)}^{\\circ}`;
                    }
                }
            } else {
                let angleToFormatRad = isFirstSegmentBeingDrawn ? currentLineAbsoluteAngle : angleTurn;
                // For drawing mode with shift, preserve the natural sign of the angle
                if (currentShiftPressed && !isFirstSegmentBeingDrawn) {
                    // Keep angleTurn as is, don't normalize to [-π, π]
                    let angleToFormatDeg = angleToFormatRad * (180 / Math.PI);
                    if (Math.abs(angleToFormatDeg) > epsilon) {
                        angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
                    }
                } else {
                    let angleToFormatDeg = normalizeAngleToPi(angleToFormatRad) * (180 / Math.PI);
                    if (Math.abs(angleToFormatDeg) > epsilon) {
                        angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
                    }
                }
            }
        } else if (angleDisplayMode === 'radians') {
            if (currentShiftPressed && canReferToTheta) {
                const referenceAngleRad = Math.abs(currentSegmentReferenceA_for_display);
                let potentialFactor = null;

                if (typeof angleSnapFactor === 'number') {
                    potentialFactor = angleSnapFactor;
                } else if (angleTurn !== null) {
                    if (Math.abs(referenceAngleRad) > epsilon) {
                        const calculatedFactor = angleTurn / referenceAngleRad;
                        for (const frac of NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
                            if (Math.abs(Math.abs(calculatedFactor) - frac) < epsilon) {
                                potentialFactor = calculatedFactor < 0 ? -frac : frac;
                                break;
                            }
                        }
                    }
                }
                if (potentialFactor !== null && Math.abs(potentialFactor) > epsilon) {
                    const fracStr = formatSnapFactor(potentialFactor, null);
                    angleText = `${fracStr === '0' ? '0' : fracStr + '\\pi'}`;
                    if (angleText.startsWith("1\\pi")) angleText = "\\pi";
                    if (angleText.startsWith("-1\\pi")) angleText = "-\\pi";
                } else {
                    // Keep the original sign of angleTurn for consistent display
                    let radians = angleTurn;
                    if (Math.abs(radians) > epsilon) {
                        angleText = formatNumber(radians, angleSigFigs);
                    }
                }
            } else {
                let angleToFormatRad = isFirstSegmentBeingDrawn ? currentLineAbsoluteAngle : angleTurn;
                // For drawing mode with shift, preserve the natural sign of the angle
                if (currentShiftPressed && !isFirstSegmentBeingDrawn) {
                    // Keep angleTurn as is, don't normalize to [-π, π]
                    let radians = angleToFormatRad;
                    if (Math.abs(radians) > epsilon) {
                        angleText = formatNumber(radians, angleSigFigs);
                    }
                } else {
                    let radians = normalizeAngleToPi(angleToFormatRad);
                    if (Math.abs(radians) > epsilon) {
                        angleText = formatNumber(radians, angleSigFigs);
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
            const labelDistance = 60;
            const angleTextX = startScreen.x + Math.cos(bisectorCanvasAngle) * labelDistance;
            const angleTextY = startScreen.y + Math.sin(bisectorCanvasAngle) * labelDistance;
            updateHtmlLabel({ id: 'snap-angle', content: angleText, x: angleTextX, y: angleTextY, color: currentElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
        }
    }
}

export function prepareReferenceElementsTexts(htmlOverlay, context, state, screenToData, dataToScreen, updateHtmlLabel) {
    const { showAngles, showDistances, viewTransform, mousePos, frozenReference_D_du, distanceSigFigs, angleDisplayMode } = state;
    const screenPixelThreshold = REF_TEXT_SCREEN_PIXEL_THRESHOLD;
    const dataThreshold = screenPixelThreshold / viewTransform.scale;
    const angleThreshold = GEOMETRY_CALCULATION_EPSILON;

    let previewDistance = -1;
    if (context.frozen_Origin_Data_to_display) {
        const startPointData = context.frozen_Origin_Data_to_display;
        const mouseDataPos = screenToData(mousePos);
        previewDistance = distance(startPointData, mouseDataPos);
    }

    if ((!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display || previewDistance < dataThreshold) {
        return;
    }

    const refElementColor = FROZEN_REFERENCE_COLOR;
    const katexFontSize = REF_TEXT_KATEX_FONT_SIZE;

    const startPointData = context.frozen_Origin_Data_to_display;
    const turnAngleData = context.displayAngleA_valueRad_for_A_equals_label;
    const baseAngleData = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
    const distanceData = context.frozen_D_du_to_display;
    const frozenG2GSquaredSum = context.frozen_D_g2g_to_display ? context.frozen_D_g2g_to_display.g2gSquaredSum : null;
    const frozenG2GInterval = context.frozen_D_g2g_to_display ? context.frozen_D_g2g_to_display.interval : null;

    if (!startPointData) {
        return;
    }

    const absoluteAngleForRefLine = baseAngleData + turnAngleData;
    const endPointData = {
        x: startPointData.x + distanceData * Math.cos(absoluteAngleForRefLine),
        y: startPointData.y + distanceData * Math.sin(absoluteAngleForRefLine)
    };

    const startPointScreen = dataToScreen(startPointData);
    const endPointScreen = dataToScreen(endPointData);

    if (showDistances && distanceData !== null && distanceData > dataThreshold && frozenReference_D_du !== null) {
        let distanceText = '';

        if (frozenG2GSquaredSum !== null && frozenG2GSquaredSum > 0 && frozenG2GInterval) {
            const [coeff, radicand] = simplifySquareRoot(frozenG2GSquaredSum);
            const finalCoeff = frozenG2GInterval * coeff;
            const roundedFinalCoeff = parseFloat(finalCoeff.toFixed(10));
            distanceText = `\\delta = ${formatSimplifiedRoot(roundedFinalCoeff, radicand)}`;
        } else {
            const platonicValue = distanceData / DEFAULT_REFERENCE_DISTANCE;
            distanceText = `\\delta = ${formatNumber(platonicValue, distanceSigFigs)}`;
        }

        const edgeAngleScreen = Math.atan2(endPointScreen.y - startPointScreen.y, endPointScreen.x - startPointScreen.x);
        const midX_screen = (startPointScreen.x + endPointScreen.x) / 2;
        const midY_screen = (startPointScreen.y + endPointScreen.y) / 2;
        const textOffset = REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN;

        let rotationDeg = edgeAngleScreen * (180 / Math.PI);
        if (rotationDeg > 90 || rotationDeg < -90) {
            rotationDeg += 180;
        }
        let textPerpAngle;

        if (showAngles && turnAngleData !== null && Math.abs(turnAngleData) > angleThreshold) {
            const canvasStartAngle = -baseAngleData;
            const canvasEndAngle = -(baseAngleData + turnAngleData);
            const sumCos = Math.cos(canvasStartAngle) + Math.cos(canvasEndAngle);
            const sumSin = Math.sin(canvasStartAngle) + Math.sin(canvasEndAngle);
            const angleLabelBisectorRad = Math.atan2(sumSin, sumCos);
            const perp1 = edgeAngleScreen - Math.PI / 2;
            const perp2 = edgeAngleScreen + Math.PI / 2;
            const diff1 = Math.abs(normalizeAngleToPi(perp1 - angleLabelBisectorRad));
            const diff2 = Math.abs(normalizeAngleToPi(perp2 - angleLabelBisectorRad));
            textPerpAngle = diff1 > diff2 ? perp1 : perp2;
        } else {
            textPerpAngle = edgeAngleScreen - Math.PI / 2;
            if (Math.sin(textPerpAngle) > 0) {
                textPerpAngle += Math.PI;
            }
        }
        const textDistLabelX_D = midX_screen + Math.cos(textPerpAngle) * textOffset;
        const textDistLabelY_D = midY_screen + Math.sin(textPerpAngle) * textOffset;

        updateHtmlLabel({ id: 'ref-dist', content: distanceText, x: textDistLabelX_D, y: textDistLabelY_D, color: refElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } }, htmlOverlay);
    }

    if (showAngles && turnAngleData !== null && Math.abs(turnAngleData) > angleThreshold) {
        const startAngleCanvas = -baseAngleData;
        const endAngleCanvas = -(baseAngleData + turnAngleData);

        const sumCos = Math.cos(startAngleCanvas) + Math.cos(endAngleCanvas);
        const sumSin = Math.sin(startAngleCanvas) + Math.sin(endAngleCanvas);
        let bisectorCanvasAngle = Math.atan2(sumSin, sumCos);
        const angleLabelOffsetDistance = REF_TEXT_ANGLE_LABEL_OFFSET_SCREEN;

        const textAngleLabelX_A = startPointScreen.x + Math.cos(bisectorCanvasAngle) * angleLabelOffsetDistance;
        const textAngleLabelY_A = startPointScreen.y + Math.sin(bisectorCanvasAngle) * angleLabelOffsetDistance;

        let aKatexText = '';
        if (angleDisplayMode === 'degrees') {
            // For drawing mode with shift, preserve the natural sign of the angle without normalization
            let aValueDeg = turnAngleData * (180 / Math.PI);
            aKatexText = `\\theta = ${formatNumber(aValueDeg, state.angleSigFigs)}^{\\circ}`;
        } else if (angleDisplayMode === 'radians') {
            // For drawing mode with shift, preserve the natural sign of the angle without normalization
            let aValueRad = turnAngleData;
            aKatexText = `\\theta = ${formatFraction(aValueRad / Math.PI, 0.001, 6)}\\pi`;
            if (aKatexText === "\\theta = 1\\pi") aKatexText = "\\pi";
            if (aKatexText === "\\theta = -1\\pi") aKatexText = "-\\pi";
            if (aKatexText === "\\theta = 0\\pi") aKatexText = "0";
        }

        updateHtmlLabel({ id: 'ref-angle', content: aKatexText, x: textAngleLabelX_A, y: textAngleLabelY_A, color: refElementColor, fontSize: katexFontSize, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }
}

export function updateMouseCoordinates(htmlOverlay, state, screenToData, updateHtmlLabel) {
    const { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostPointPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos} = state;

    // If the coordinates should NOT be displayed, simply return.
    // The main cleanup function in script.js will handle removing the old label
    // because it wasn't updated on this frame.
    if (coordsDisplayMode === 'none' || !mousePos || !isMouseOverCanvas) {
        return;
    }

    // If we get here, it means we SHOULD display the coordinates.
    // The rest of the function calculates and updates the label.

    let displayPos;
    if (currentShiftPressed && ghostPointPosition) {
        displayPos = ghostPointPosition;
    } else {
        displayPos = screenToData(mousePos);
    }

    let effectiveGridInterval = 1;
    if (gridDisplayMode !== 'none' && lastGridState && lastGridState.interval1) {
        effectiveGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
    }

    let decimalPlaces = 0;
    if (effectiveGridInterval > 0) {
        decimalPlaces = Math.max(0, -Math.floor(Math.log10(effectiveGridInterval * 0.999)));
        decimalPlaces = Math.min(decimalPlaces + 1, 6);
    }

    const angleDecimalPlaces = Math.min(decimalPlaces + 1, 4);
    let textContent = '';

    switch (coordsDisplayMode) {
        case 'regular': {
            let xValue = displayPos.x;
            let yValue = displayPos.y;
            let xText = xValue.toFixed(decimalPlaces);
            if (xValue >= 0) xText = `\\hphantom{-}${xText}`;
            let yText = yValue.toFixed(decimalPlaces);
            if (yValue >= 0) yText = `\\hphantom{-}${yText}`;
            textContent = `\\begin{pmatrix*}[r] x \\\\ y \\end{pmatrix*} = \\begin{pmatrix*}[r] ${xText} \\\\ ${yText} \\end{pmatrix*}`;
            break;
        }
        case 'complex': {
            let reValue = displayPos.x;
            let imValue = displayPos.y;
            let rePart = reValue.toFixed(decimalPlaces);
            if (reValue >= 0) rePart = `\\hphantom{-}${rePart}`;
            let imPartAbs = Math.abs(imValue).toFixed(decimalPlaces);
            const sign = imValue < 0 ? '-' : '+';
            textContent = `z = ${rePart} ${sign} ${imPartAbs}i`;
            break;
        }
        case 'polar': {
            let rValue = Math.hypot(displayPos.x, displayPos.y);
            let thetaRaw = Math.atan2(displayPos.y, displayPos.x);
            let rText = rValue.toFixed(decimalPlaces);
            if (rValue >= 0) rText = `\\hphantom{-}${rText}`;
            let angleStr;
            if (angleDisplayMode === 'degrees') {
                let thetaDeg = normalizeAngleDegrees(thetaRaw * 180 / Math.PI);
                angleStr = thetaDeg.toFixed(angleDecimalPlaces);
                if (thetaDeg >= 0) angleStr = `\\hphantom{-}${angleStr}`;
                angleStr += `^{\\circ}`;
            } else {
                let thetaRad = normalizeAngleToPi(thetaRaw);
                angleStr = thetaRad.toFixed(angleDecimalPlaces);
                if (thetaRad >= 0) angleStr = `\\hphantom{-}${angleStr}`;
            }
            textContent = `\\begin{pmatrix*}[r] r \\\\ \\theta \\end{pmatrix*} = \\begin{pmatrix*}[r] ${rText} \\\\ ${angleStr} \\end{pmatrix*}`;
            break;
        }
    }

    const canvasWidth = canvas.width / dpr;
    const padding = 10;
    updateHtmlLabel({ id: 'mouse-coord-text', content: textContent, x: canvasWidth - padding, y: padding, color: 'rgba(255, 255, 255, 0.7)', fontSize: 14, options: { textAlign: 'right', textBaseline: 'top' } }, htmlOverlay);
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
            const fadeStartRadius = radius * 0.75;
            if (dist < fadeStartRadius) {
                alpha = 1.0;
            } else {
                const fadeDistance = radius - fadeStartRadius;
                alpha = 1.0 - ((dist - fadeStartRadius) / fadeDistance);
            }
            const [R, G, B] = hslToRgb(hue / 360, saturation / 100, lightness / 100);
            pixels[i] = R;
            pixels[i + 1] = G;
            pixels[i + 2] = B;
            pixels[i + 3] = Math.round(Math.max(0, alpha) * 255);
        }
    }
    tempCtx.putImageData(imageData, 0, 0);
    return tempCanvas;
}

export function drawUITransformSymbol(ctx, icon) {
    const screenPos = { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 };
    const radius = icon.width / 2;
    ctx.strokeStyle = 'white';
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    if (icon.type === 'center_rotate_scale') {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(screenPos.x - radius, screenPos.y);
        ctx.lineTo(screenPos.x + radius, screenPos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y - radius);
        ctx.lineTo(screenPos.x, screenPos.y + radius);
        ctx.stroke();
    } else if (icon.type === 'center_rotate_only') {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
    } else if (icon.type === 'center_scale_only') {
        ctx.beginPath();
        ctx.moveTo(screenPos.x - radius, screenPos.y);
        ctx.lineTo(screenPos.x + radius, screenPos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y - radius);
        ctx.lineTo(screenPos.x, screenPos.y + radius);
        ctx.stroke();
    }
}

export function drawCoordsIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel) {
    const colorStrong = isSelected ? '#F9FAFB' : '#9CA3AF';
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / 32;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    const x_offset = 1;
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2 + x_offset, 30); ctx.lineTo(30 + x_offset, 30);
    ctx.moveTo(2 + x_offset, 30); ctx.lineTo(2 + x_offset, 2);
    ctx.stroke();
    ctx.fillStyle = colorStrong;
    const point = { x: 16 + x_offset, y: 16 };
    let labelPos = { x: 17 + x_offset, y: 8 };
    let label = '';
    switch (mode) {
        case 'regular':
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(point.x, point.y); ctx.lineTo(point.x, 30);
            ctx.moveTo(point.x, point.y); ctx.lineTo(2 + x_offset, point.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(point.x, point.y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
            label = '(x,y)';
            break;
        case 'complex':
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(2 + x_offset, 30); ctx.lineTo(point.x, point.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(point.x, point.y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
            label = 'x+iy';
            break;
        case 'polar':
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(2 + x_offset, 30); ctx.lineTo(point.x, point.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(2 + x_offset, 30, 8, -Math.atan2(30 - point.y, point.x - (2 + x_offset)), 0);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(point.x, point.y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
            label = '(r,\\theta)';
            break;
        case 'none':
            break;
    }
    ctx.restore();
    if (label) {
        const labelId = 'icon-label-coords';
        updateHtmlLabel({ id: labelId, content: label, x: center.x + (labelPos.x - 16) * scale, y: center.y + (labelPos.y - 16) * scale, color: isSelected ? '#E0F2FE' : '#D1D5DB', fontSize: 10, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
        
    }
}

export function drawAngleIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel) {
    const colorStrong = isSelected ? '#F9FAFB' : '#9CA3AF';
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / 32;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = 1.5;
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
    if (mode !== 'none') {
        ctx.beginPath();
        const angle = Math.atan2(p3.y - p2.y, p3.x - p2.x);
        ctx.arc(p2.x, p2.y, 8, angle, 0);
        ctx.stroke();
        if (mode === 'degrees') {
            label = '60^\\circ';
        } else if (mode === 'radians') {
            label = '\\pi/3';
        }
    }
    ctx.restore();
    if (label) {
        const labelId = 'icon-label-angles';
        updateHtmlLabel({ id: labelId, content: label, x: center.x + (labelPos.x - 16) * scale, y: center.y + (labelPos.y - 16) * scale, color: isSelected ? '#E0F2FE' : '#D1D5DB', fontSize: 10, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
        
    }
}

export function drawDistanceIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel) {
    const colorStrong = isSelected ? '#F9FAFB' : '#9CA3AF';
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / 32;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(2, 30);
    ctx.lineTo(30, 30);
    ctx.stroke();
    let label = '';
    let labelPos = { x: 16, y: 22 };
    if (mode === 'on') {
        label = '3.14';
    }
    ctx.restore();
    if (label) {
        const labelId = 'icon-label-distances';
        updateHtmlLabel({ id: labelId, content: label, x: center.x + (labelPos.x - 16) * scale, y: center.y + (labelPos.y - 16) * scale, color: isSelected ? '#E0F2FE' : '#D1D5DB', fontSize: 12, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
        
    }
}

export function drawGridIcon(ctx, rect, mode, isSelected) {
    const colorStrong = isSelected ? '#F9FAFB' : '#9CA3AF';
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / 32;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    ctx.strokeStyle = colorStrong;
    ctx.fillStyle = colorStrong;
    ctx.lineWidth = 1.5;
    switch (mode) {
        case 'lines':
            ctx.strokeRect(2, 2, 28, 28);
            ctx.beginPath();
            ctx.moveTo(2, 16); ctx.lineTo(30, 16);
            ctx.moveTo(16, 2); ctx.lineTo(16, 30);
            ctx.stroke();
            break;
        case 'points':
            ctx.strokeRect(2, 2, 28, 28);
            ctx.beginPath();
            [8, 16, 24].forEach(x => {
                [8, 16, 24].forEach(y => {
                    ctx.moveTo(x, y);
                    ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
                });
            });
            ctx.fill();
            break;
        case 'polar':
            ctx.beginPath();
            ctx.arc(16, 16, 14, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(16, 16, 7, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(2, 16); ctx.lineTo(30, 16);
            ctx.moveTo(16, 2); ctx.lineTo(16, 30);
            ctx.stroke();
            break;
        case 'none':
            ctx.strokeRect(2, 2, 28, 28);
            break;
    }
    ctx.restore();
}

export function drawDisplayIcon(ctx, icon, state, htmlOverlay, updateHtmlLabel) {
    const { coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode } = state;
    let isSelected = false;
    switch (icon.group) {
        case 'coords':
            isSelected = coordsDisplayMode !== 'none';
            break;
        case 'grid':
            isSelected = gridDisplayMode !== 'none';
            break;
        case 'angles':
            isSelected = angleDisplayMode !== 'none';
            break;
        case 'distances':
            isSelected = distanceDisplayMode === 'on';
            break;
    }
    const rect = { x: icon.x, y: icon.y, width: icon.width, height: icon.height };
    switch (icon.group) {
        case 'coords':
            drawCoordsIcon(ctx, rect, coordsDisplayMode, isSelected, htmlOverlay, updateHtmlLabel);
            break;
        case 'grid':
            drawGridIcon(ctx, rect, gridDisplayMode, isSelected);
            break;
        case 'angles':
            drawAngleIcon(ctx, rect, angleDisplayMode, isSelected, htmlOverlay, updateHtmlLabel);
            break;
        case 'distances':
            drawDistanceIcon(ctx, rect, distanceDisplayMode, isSelected, htmlOverlay, updateHtmlLabel);
            break;
    }
}

export function drawCanvasUI(ctx, htmlOverlay, state, updateHtmlLabel) {
    const { dpr, canvasUI, isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isPlacingTransform, placingTransformType, placingSnapPos, mousePos, selectedSwatchIndex, recentColors } = state;
    ctx.save();
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    const btn = canvasUI.toolbarButton;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
        const lineY = btn.y + 5 + i * 10;
        ctx.moveTo(btn.x + 4, lineY);
        ctx.lineTo(btn.x + btn.width - 4, lineY);
    }
    ctx.stroke();

    if (isToolbarExpanded) {
        const ctb = canvasUI.colorToolButton;
        if (ctb) {
            if (!colorWheelIcon) {
                colorWheelIcon = createColorWheelIcon(ctb.width, dpr);
            }
            ctx.drawImage(colorWheelIcon, ctb.x, ctb.y, ctb.width, ctb.height);
        }

        const ttb = canvasUI.transformToolButton;
        if (ttb) {
            const ttbLabelColor = "white";
            updateHtmlLabel({ id: 'transform-tool-label', content: 'T', x: ttb.x + ttb.width / 2, y: ttb.y + ttb.height / 2, color: ttbLabelColor, fontSize: 24, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
            
        }

        const dtb = canvasUI.displayToolButton;
        if (dtb) {
            const displayButtonColor = "rgba(255, 255, 255, 0.8)";
            ctx.strokeStyle = displayButtonColor;
            ctx.fillStyle = displayButtonColor;
            ctx.lineWidth = 2;
            const barWidth = dtb.width - 12;
            for (let i = 0; i < 3; i++) {
                const y = dtb.y + 10 + i * 10;
                ctx.beginPath();
                ctx.moveTo(dtb.x + 6, y);
                ctx.lineTo(dtb.x + 6 + barWidth, y);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(dtb.x + 6 + barWidth * (i / 2), y, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }

    if (!isToolbarExpanded) {
        
    }

    if (isColorPaletteExpanded) {
        const removeBtn = canvasUI.removeColorButton;
        if (removeBtn) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx.lineWidth = 2;
            ctx.strokeRect(removeBtn.x, removeBtn.y, removeBtn.width, removeBtn.height);
            ctx.beginPath();
            ctx.moveTo(removeBtn.x + 7, removeBtn.y + removeBtn.height / 2);
            ctx.lineTo(removeBtn.x + removeBtn.width - 7, removeBtn.y + removeBtn.height / 2);
            ctx.stroke();
        }
        canvasUI.colorSwatches.forEach((swatch, index) => {
            ctx.fillStyle = swatch.color;
            ctx.fillRect(swatch.x, swatch.y, swatch.width, swatch.height);
            if (index === selectedSwatchIndex) {
                ctx.strokeStyle = "#00ffff";
                ctx.lineWidth = 3;
                ctx.strokeRect(swatch.x - 1, swatch.y - 1, swatch.width + 2, swatch.height + 2);
            }
        });
        const addBtn = canvasUI.addColorButton;
        if (addBtn) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx.lineWidth = 2;
            ctx.strokeRect(addBtn.x, addBtn.y, addBtn.width, addBtn.height);
            ctx.beginPath();
            ctx.moveTo(addBtn.x + addBtn.width / 2, addBtn.y + 7);
            ctx.lineTo(addBtn.x + addBtn.width / 2, addBtn.y + addBtn.height - 7);
            ctx.moveTo(addBtn.x + 7, addBtn.y + addBtn.height / 2);
            ctx.lineTo(addBtn.x + addBtn.width - 7, addBtn.y + addBtn.height / 2);
            ctx.stroke();
        }
    }

    if (isTransformPanelExpanded) {
        canvasUI.transformIcons.forEach(icon => {
            drawUITransformSymbol(ctx, icon);
        });
    }

    if (isDisplayPanelExpanded) {
        canvasUI.displayIcons.forEach(icon => {
            drawDisplayIcon(ctx, icon, state, htmlOverlay, updateHtmlLabel);
        });
    }

    if (isPlacingTransform) {
        const finalDrawPos = placingSnapPos || mousePos;
        const ghostIcon = { type: placingTransformType, x: finalDrawPos.x - 15, y: finalDrawPos.y - 15, width: 30, height: 30 };
        drawUITransformSymbol(ctx, ghostIcon);
    }

    ctx.restore();
}
