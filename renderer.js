import {
    formatNumber,
    normalizeAngle,
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
    DEGREES_IN_CIRCLE,
    DEGREES_IN_HALF_CIRCLE,
    DEGREES_IN_QUADRANT,
    RADIANS_IN_CIRCLE,
    MIN_ALPHA_FOR_DRAWING,
    TRIANGULAR_GRID_Y_STEP_FACTOR,
    POLAR_TO_LINE_TRANSITION_RADIUS_FACTOR,
    ORIGIN_TICK_ANGLE_RAD,
    AXIS_MAJOR_TICK_SCALE_FACTOR,
    AXIS_ARROW_ANGLE_RAD,
    MAJOR_TICK_LINE_WIDTH,
    HELPER_LINE_DASH_PATTERN,
    REF_LINE_DASH_PATTERN,

    // --- INTERACTION ---
    MIN_TRANSFORM_ACTION_THRESHOLD,

    // --- AXES & TICKS ---
    AXIS_LINE_WIDTH,
    AXIS_TICK_SIZE,
    AXIS_TICK_LABEL_ALPHA,
    AXIS_NAME_FONT_SIZE,
    AXIS_TICK_FONT_SIZE,
    AXIS_LABEL_OFFSET,
    AXIS_LABEL_PADDING,
    AXIS_ARROW_SIZE,
    X_AXIS_LABEL_DISTANCE,
    X_AXIS_LABEL_ARROW_DIST,
    Y_AXIS_LABEL_DISTANCE,
    Y_AXIS_LABEL_ARROW_DIST,
    POLAR_THETA_LABEL_DISTANCE,
    POLAR_THETA_LABEL_ARROW_DIST,
    ANGLE_PRECISION_FACTOR,
    BOUNDARY_ANGLE_PRECISION,
    LABEL_ID_PRECISION_FACTOR,
    ORIGIN_LABEL_TEXT,
    POLAR_AXIS_RADIUS_BUFFER_FACTOR,
    TICK_LABEL_SIGFIG_THRESH_1,
    TICK_LABEL_SIGFIG_THRESH_2,
    TICK_LABEL_SIGFIG_THRESH_3,
    FINE_TICK_ANGLE_THRESHOLD_DEG,
    IMAGINARY_UNIT_SYMBOL,
    POLAR_RADIUS_SYMBOL,
    COMPLEX_REAL_LABEL,
    COMPLEX_IMAGINARY_LABEL,

    // --- DEFAULTS ---
    DEFAULT_REFERENCE_DISTANCE,

    // --- UI & TOOLBAR ---
    UI_PADDING,
    UI_ICON_BASE_SIZE,
    UI_ICON_LINE_WIDTH,
    UI_ICON_LINE_WIDTH_SMALL,
    UI_ICON_DASH_PATTERN,
    UI_ICON_POINT_RADIUS,
    UI_ICON_LABEL_FONT_SIZE,
    UI_MENU_ICON_LINE_WIDTH,
    UI_TRANSFORM_TOOL_LABEL_FONT_SIZE,
    UI_TRANSFORM_TOOL_LABEL_TEXT,
    UI_DISPLAY_ICON_BAR_WIDTH_PADDING,
    UI_DISPLAY_ICON_Y_OFFSET,
    UI_DISPLAY_ICON_Y_SPACING,
    UI_DISPLAY_ICON_KNOB_RADIUS,
    UI_SWATCH_SELECTED_BORDER_WIDTH,
    UI_BUTTON_BORDER_WIDTH,
    UI_BUTTON_ICON_PADDING,
    UI_GHOST_ICON_SIZE,

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
    REF_ARC_RADIUS_SCREEN,
    SNAP_ANGLE_LABEL_OFFSET,
    TRANSFORM_ANGLE_LABEL_OFFSET,
    TRANSFORM_SCALE_LABEL_OFFSET,
    FRACTION_FORMAT_TOLERANCE,
    FRACTION_FORMAT_MAX_DENOMINATOR,
    FRACTION_FORMAT_MAX_DENOMINATOR_TRANSFORM,
    COORD_PRECISION_FACTOR,
    MAX_COORD_DECIMAL_PLACES,
    MAX_ANGLE_DECIMAL_PLACES,
    MOUSE_COORD_FONT_SIZE,
    KATEX_MINUS_PHANTOM,
    PI_SYMBOL_KATEX,
    DELTA_SYMBOL_KATEX,
    DELTA_EQUALS_KATEX,
    THETA_EQUALS_KATEX,
    SELECTION_GLOW_BLUR_RADIUS,
    SELECTION_GLOW_ALPHA,
    SELECTION_GLOW_RADIUS_OFFSET,
    SELECTION_GLOW_LINE_WIDTH,
    EDGE_SELECTION_GLOW_WIDTH_OFFSET,

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
    SNAP_FACTORS,

    // --- ENUMS & LITERALS ---
    POINT_TYPE_REGULAR,
    TRANSFORMATION_TYPE_ROTATION,
    TRANSFORMATION_TYPE_SCALE,
    TRANSFORMATION_TYPE_DIRECTIONAL_SCALE,
    COORDS_DISPLAY_MODE_NONE,
    COORDS_DISPLAY_MODE_REGULAR,
    COORDS_DISPLAY_MODE_COMPLEX,
    COORDS_DISPLAY_MODE_POLAR,
    GRID_DISPLAY_MODE_NONE,
    GRID_DISPLAY_MODE_LINES,
    GRID_DISPLAY_MODE_POINTS,
    GRID_DISPLAY_MODE_TRIANGULAR,
    GRID_DISPLAY_MODE_POLAR,
    ANGLE_DISPLAY_MODE_DEGREES,
    ANGLE_DISPLAY_MODE_RADIANS,
    ANGLE_DISPLAY_MODE_NONE,
    DISTANCE_DISPLAY_MODE_ON,
    DISTANCE_DISPLAY_MODE_NONE
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

function calculateVisibleAngleRange(originScreen, screenRadius, canvasWidth, canvasHeight) {
    // If origin is visible, show all angles
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

    // Check if circle is completely outside viewport
    if (originScreen.x + screenRadius < rect.left || 
        originScreen.x - screenRadius > rect.right ||
        originScreen.y + screenRadius < rect.top || 
        originScreen.y - screenRadius > rect.bottom) {
        return null;
    }

    // Check if circle completely contains the viewport
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

    // Collect all intersection angles
    const intersectionAngles = [];

    // Add corner angles if corners are outside the circle
    corners.forEach(corner => {
        const distSq = (corner.x - originScreen.x) ** 2 + (corner.y - originScreen.y) ** 2;
        if (distSq > screenRadius ** 2) {
            const dx = corner.x - originScreen.x;
            const dy = corner.y - originScreen.y;
            const angle = Math.atan2(-dy, dx); // Note: -dy for screen coordinates
            const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
            intersectionAngles.push(normalizedAngle * 180 / Math.PI);
        }
    });

    // Add edge-circle intersections
    const edges = [
        { x1: rect.left, y1: rect.top, x2: rect.right, y2: rect.top },      // top
        { x1: rect.right, y1: rect.top, x2: rect.right, y2: rect.bottom },  // right
        { x1: rect.right, y1: rect.bottom, x2: rect.left, y2: rect.bottom }, // bottom
        { x1: rect.left, y1: rect.bottom, x2: rect.left, y2: rect.top }     // left
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
            intersectionAngles.push(normalizedAngle * 180 / Math.PI);
        });
    });

    if (intersectionAngles.length === 0) {
        return { minAngle: 0, maxAngle: 360, isFullCircle: true };
    }

    // Remove duplicates and sort
    const uniqueAngles = [...new Set(intersectionAngles.map(a => Math.round(a * 1e6) / 1e6))].sort((a, b) => a - b);

    if (uniqueAngles.length < 2) {
        return { minAngle: 0, maxAngle: 360, isFullCircle: true };
    }

    // Find the largest gap between consecutive angles to determine the invisible sector
    let maxGap = 0;
    let maxGapStartAngle = 0;
    let maxGapEndAngle = 0;

    for (let i = 0; i < uniqueAngles.length; i++) {
        const currentAngle = uniqueAngles[i];
        const nextAngle = uniqueAngles[(i + 1) % uniqueAngles.length];
        
        let gap;
        if (i === uniqueAngles.length - 1) {
            // Gap from last angle to first angle (wrapping around)
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

    // FIXED: The largest gap represents the INVISIBLE area
    // The visible range is everything EXCEPT the largest gap
    if (maxGapEndAngle > maxGapStartAngle) {
        // Invisible gap doesn't cross 0°, so visible range wraps around 0°
        return {
            minAngle: maxGapEndAngle,
            maxAngle: maxGapStartAngle + 360,
            isFullCircle: false
        };
    } else {
        // Invisible gap crosses 0°, so visible range is normal
        return {
            minAngle: maxGapEndAngle,
            maxAngle: maxGapStartAngle,
            isFullCircle: false
        };
    }
}

function generateOptimizedAngleSequence(angleStep, minAngle, maxAngle) {
    const angles = [];
    
    // FIXED: Properly detect wraparound case
    const isWraparound = maxAngle > 360;
    
    if (isWraparound) {
        // Handle wraparound case
        const actualMaxAngle = maxAngle - 360;
        
        // Add angles from minAngle to 360
        const startAngle1 = Math.floor(minAngle / angleStep) * angleStep;
        for (let angle = startAngle1; angle < 360; angle += angleStep) {
            if (angle >= minAngle) {
                angles.push(angle);
            }
        }
        
        // Add angles from 0 to actualMaxAngle
        for (let angle = 0; angle <= actualMaxAngle + angleStep; angle += angleStep) {
            if (angle <= actualMaxAngle) {
                angles.push(angle);
            }
        }
    } else {
        // Normal case - no wraparound
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
    return tickEnd.x >= -AXIS_LABEL_PADDING && 
           tickEnd.x <= canvasWidth + AXIS_LABEL_PADDING && 
           tickEnd.y >= -AXIS_LABEL_PADDING && 
           tickEnd.y <= canvasHeight + AXIS_LABEL_PADDING;
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
    const panDistance = distance(originScreen, screenCenter);
    const screenRadius = baseRadius + panDistance;

    if (screenRadius < REF_CIRCLE_MIN_DISPLAY_RADIUS || !isCircleInView(originScreen.x, originScreen.y, screenRadius, canvasWidthCSS, canvasHeightCSS)) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;
    ctx.lineWidth = FEEDBACK_LINE_VISUAL_WIDTH;

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
    const drawnAnglesSimple = new Set(); // For degrees mode
    const drawnAnglesComplex = new Map(); // For radians mode - key: "deg-levelAngle"

    lastAngularGridState.forEach(level => {
        const tickAlpha = level.alpha;
        if (tickAlpha < 0.01) return;

        const screenSeparation = screenRadius * (level.angle * Math.PI / 180);
        
        if (screenSeparation < REF_CIRCLE_MIN_TICK_SPACING * 0.5) return;

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
            // Original simple behavior for degrees mode
            if (angleDisplayMode === 'degrees') {
                if (drawnAnglesSimple.has(deg)) return;
            }
            // For radians mode, allow multiple levels per angle
            else if (angleDisplayMode === 'radians') {
                const levelKey = `${deg}-${level.angle}`;
                if (drawnAnglesComplex.has(levelKey)) return; // This specific level already drawn
            }

            const angleRad = deg * Math.PI / 180;
            let labelOptions = { textAlign: 'center', textBaseline: 'middle' };
            
            // In radians mode, use left alignment to minimize visual overlap
            if (angleDisplayMode === 'radians') {
                labelOptions = { textAlign: 'left', textBaseline: 'middle' };
            }
            
            let labelPos;

            ctx.save();
            ctx.strokeStyle = finalColor;
            ctx.lineWidth = GRID_LINEWIDTH;

            if (deg % 90 === 0 && deg < 360) {
                const pointOnCircle = { 
                    x: originScreen.x + screenRadius * Math.cos(angleRad), 
                    y: originScreen.y - screenRadius * Math.sin(angleRad) 
                };

                let tickVec;
                const tickLength = AXIS_TICK_SIZE * 1.5;
                
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
                    x: pointOnCircle.x + tickVec.x * tickLength,
                    y: pointOnCircle.y + tickVec.y * tickLength
                };

                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(pointOnCircle.x, pointOnCircle.y);
                ctx.lineTo(tickEnd.x, tickEnd.y);
                ctx.stroke();
                
                labelPos = { x: tickEnd.x, y: tickEnd.y };

            } else {
                const tickStart = { 
                    x: originScreen.x + (screenRadius - POINT_RADIUS) * Math.cos(angleRad), 
                    y: originScreen.y - (screenRadius - POINT_RADIUS) * Math.sin(angleRad) 
                };
                const tickEnd = { 
                    x: originScreen.x + (screenRadius + POINT_RADIUS) * Math.cos(angleRad), 
                    y: originScreen.y - (screenRadius + POINT_RADIUS) * Math.sin(angleRad) 
                };
                if (isTickVisible(tickEnd, canvasWidthCSS, canvasHeightCSS)) {
                    ctx.beginPath();
                    ctx.moveTo(tickStart.x, tickStart.y);
                    ctx.lineTo(tickEnd.x, tickEnd.y);
                    ctx.stroke();
                }
                labelPos = { 
                    x: originScreen.x + (screenRadius + REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN) * Math.cos(angleRad), 
                    y: originScreen.y - (screenRadius + REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN) * Math.sin(angleRad) 
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
                        
                        const gcdValue = gcd(numerator, denominator);
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
                    fontSize: REF_TEXT_KATEX_FONT_SIZE, 
                    options: labelOptions
                });
                
                // Store tracking info differently for each mode
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

        let labelPos;
        if (arrowAngle === 0) {
            labelPos = {
                x: tipPos.x - POLAR_THETA_LABEL_DISTANCE,
                y: tipPos.y + POLAR_THETA_LABEL_ARROW_DIST + AXIS_ARROW_SIZE
            };
        } else {
            const radialVecInward = { x: -Math.cos(arrowAngle), y: Math.sin(arrowAngle) };
            labelPos = {
                x: tipPos.x + radialVecInward.x * (POLAR_THETA_LABEL_ARROW_DIST + AXIS_ARROW_SIZE) + tangentVec.x * POLAR_THETA_LABEL_DISTANCE,
                y: tipPos.y + radialVecInward.y * (POLAR_THETA_LABEL_ARROW_DIST + AXIS_ARROW_SIZE) + tangentVec.y * POLAR_THETA_LABEL_DISTANCE
            };
        }
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

function drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel, colors) {
    const tickColor = `rgba(${colors.axisTickLabel.join(',')}, ${AXIS_TICK_LABEL_ALPHA})`;
    const longTickSize = AXIS_TICK_SIZE * AXIS_MAJOR_TICK_SCALE_FACTOR;
    
    ctx.save();
    ctx.strokeStyle = tickColor;
    ctx.lineWidth = MAJOR_TICK_LINE_WIDTH;
    ctx.setLineDash([]);
    
    const yLength = longTickSize;
    const xLength = yLength / Math.tan(ORIGIN_TICK_ANGLE_RAD);
    
    const endX = origin.x - xLength;
    const endY = origin.y + yLength;
    
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    ctx.restore();
    
    updateHtmlLabel({
        id: 'tick-label-origin',
        content: ORIGIN_LABEL_TEXT,
        x: origin.x - AXIS_TICK_SIZE - AXIS_LABEL_OFFSET,
        y: origin.y + AXIS_TICK_SIZE + AXIS_LABEL_OFFSET,
        color: tickColor,
        fontSize: AXIS_TICK_FONT_SIZE,
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
        ctx.lineTo(x2 - AXIS_ARROW_SIZE * Math.cos(angle - AXIS_ARROW_ANGLE_RAD), y2 - AXIS_ARROW_SIZE * Math.sin(angle - AXIS_ARROW_ANGLE_RAD));
        ctx.lineTo(x2 - AXIS_ARROW_SIZE * Math.cos(angle + AXIS_ARROW_ANGLE_RAD), y2 - AXIS_ARROW_SIZE * Math.sin(angle + AXIS_ARROW_ANGLE_RAD));
        ctx.closePath();
        ctx.fill();
    };

    const drawTicksAndLabels = (interval1, alpha1, interval2, alpha2, isPolar) => {
        const drawnXPositions = new Map();
        const drawnYPositions = new Map();
        
        const addTicksForInterval = (interval, alpha, isCoarser) => {
            if (!interval || alpha < MIN_ALPHA_FOR_DRAWING) return;
            const topLeftData = screenToData({ x: 0, y: 0 });
            const bottomRightData = screenToData({ x: canvasWidth, y: canvasHeight });
            const localZeroThreshold = interval * GEOMETRY_CALCULATION_EPSILON;
            
            if (isPolar) {
                const maxRadiusData = Math.hypot(Math.max(Math.abs(topLeftData.x), Math.abs(bottomRightData.x)), Math.max(Math.abs(topLeftData.y), Math.abs(bottomRightData.y))) * POLAR_AXIS_RADIUS_BUFFER_FACTOR;
                
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
            const tickLabelColor = `rgba(${colors.axisTickLabel.join(',')}, ${AXIS_TICK_LABEL_ALPHA * effectiveAlpha})`;
            ctx.strokeStyle = tickLabelColor;
            ctx.lineWidth = GRID_LINEWIDTH;
            
            let sourceInterval = interval1;
            if (interval2 && Math.abs(x_data % interval2) < Math.abs(x_data % interval1)) {
                sourceInterval = interval2;
            }
            const screenSpacing = sourceInterval * viewTransform.scale;
            let sigFigsForLabel = 0;
            if (screenSpacing > TICK_LABEL_SIGFIG_THRESH_1) sigFigsForLabel = 3; 
            else if (screenSpacing > TICK_LABEL_SIGFIG_THRESH_2) sigFigsForLabel = 2; 
            else if (screenSpacing > TICK_LABEL_SIGFIG_THRESH_3) sigFigsForLabel = 1; 
            else sigFigsForLabel = 0;
            
            const decimalPlacesInInterval = sourceInterval > 0 ? -Math.floor(Math.log10(sourceInterval)) : 0;
            if (decimalPlacesInInterval > 0) {
                sigFigsForLabel = Math.max(sigFigsForLabel, decimalPlacesInInterval + 1);
            }
            
            if (isPolar) {
                const labelText = formatNumber(x_data, sigFigsForLabel);
                const stableIdPart = x_data.toExponential(15);
                
                const isYAxisOnScreen = origin.y > -AXIS_LABEL_PADDING && origin.y < canvasHeight + AXIS_LABEL_PADDING;
                const isXAxisOnScreen = origin.x > -AXIS_LABEL_PADDING && origin.x < canvasWidth + AXIS_LABEL_PADDING;

                const pX = dataToScreen({ x: x_data, y: 0 });
                if (isYAxisOnScreen && pX.x > -AXIS_LABEL_PADDING && pX.x < canvasWidth + AXIS_LABEL_PADDING) {
                    ctx.beginPath(); 
                    ctx.moveTo(pX.x, origin.y - AXIS_TICK_SIZE / 2); 
                    ctx.lineTo(pX.x, origin.y + AXIS_TICK_SIZE / 2); 
                    ctx.stroke();
                    updateHtmlLabel({ 
                        id: `polartick-r-x-${stableIdPart}`, 
                        content: labelText, 
                        x: pX.x, 
                        y: origin.y + AXIS_TICK_SIZE + AXIS_LABEL_OFFSET, 
                        color: tickLabelColor, 
                        fontSize: AXIS_TICK_FONT_SIZE, 
                        options: { textAlign: 'center', textBaseline: 'top' } 
                    });
                }
                
                const pNegX = dataToScreen({ x: -x_data, y: 0 });
                if (isYAxisOnScreen && pNegX.x > -AXIS_LABEL_PADDING && pNegX.x < canvasWidth + AXIS_LABEL_PADDING) {
                    ctx.beginPath(); 
                    ctx.moveTo(pNegX.x, origin.y - AXIS_TICK_SIZE / 2); 
                    ctx.lineTo(pNegX.x, origin.y + AXIS_TICK_SIZE / 2); 
                    ctx.stroke();
                    updateHtmlLabel({ 
                        id: `polartick-r-negx-${stableIdPart}`, 
                        content: labelText, 
                        x: pNegX.x, 
                        y: origin.y + AXIS_TICK_SIZE + AXIS_LABEL_OFFSET, 
                        color: tickLabelColor, 
                        fontSize: AXIS_TICK_FONT_SIZE, 
                        options: { textAlign: 'center', textBaseline: 'top' } 
                    });
                }
                
                const pPosY = dataToScreen({ x: 0, y: x_data });
                if (isXAxisOnScreen && pPosY.y > -AXIS_LABEL_PADDING && pPosY.y < canvasHeight + AXIS_LABEL_PADDING) {
                    ctx.beginPath(); 
                    ctx.moveTo(origin.x - AXIS_TICK_SIZE / 2, pPosY.y); 
                    ctx.lineTo(origin.x + AXIS_TICK_SIZE / 2, pPosY.y); 
                    ctx.stroke();
                    updateHtmlLabel({ 
                        id: `polartick-r-posy-${stableIdPart}`, 
                        content: labelText, 
                        x: origin.x - AXIS_TICK_SIZE - AXIS_LABEL_OFFSET, 
                        y: pPosY.y, 
                        color: tickLabelColor, 
                        fontSize: AXIS_TICK_FONT_SIZE, 
                        options: { textAlign: 'right', textBaseline: 'middle' } 
                    });
                }
                
                const pNegY = dataToScreen({ x: 0, y: -x_data });
                if (isXAxisOnScreen && pNegY.y > -AXIS_LABEL_PADDING && pNegY.y < canvasHeight + AXIS_LABEL_PADDING) {
                    ctx.beginPath(); 
                    ctx.moveTo(origin.x - AXIS_TICK_SIZE / 2, pNegY.y); 
                    ctx.lineTo(origin.x + AXIS_TICK_SIZE / 2, pNegY.y); 
                    ctx.stroke();
                    updateHtmlLabel({ 
                        id: `polartick-r-negy-${stableIdPart}`, 
                        content: labelText, 
                        x: origin.x - AXIS_TICK_SIZE - AXIS_LABEL_OFFSET, 
                        y: pNegY.y, 
                        color: tickLabelColor, 
                        fontSize: AXIS_TICK_FONT_SIZE, 
                        options: { textAlign: 'right', textBaseline: 'middle' } 
                    });
                }
            } else {
                const screenX = dataToScreen({ x: x_data, y: 0 }).x;
                ctx.beginPath(); 
                ctx.moveTo(screenX, origin.y); 
                ctx.lineTo(screenX, origin.y + AXIS_TICK_SIZE); 
                ctx.stroke();
                
                const getStableId = (prefix, num) => `${prefix}-${num.toExponential(15)}`;
                updateHtmlLabel({ 
                    id: getStableId('tick-label-x', x_data), 
                    content: formatNumber(x_data, sigFigsForLabel), 
                    x: screenX, 
                    y: origin.y + AXIS_TICK_SIZE + AXIS_LABEL_OFFSET, 
                    color: tickLabelColor, 
                    fontSize: AXIS_TICK_FONT_SIZE, 
                    options: { textAlign: 'center', textBaseline: 'top' } 
                });
            }
        });
        
        if (!isPolar) {
            drawnYPositions.forEach((tickInfo, y_data) => {
                const effectiveAlpha = tickInfo.isCoarser ? 1.0 : tickInfo.alpha;
                const tickLabelColor = `rgba(${colors.axisTickLabel.join(',')}, ${AXIS_TICK_LABEL_ALPHA * effectiveAlpha})`;
                ctx.strokeStyle = tickLabelColor;
                ctx.lineWidth = GRID_LINEWIDTH;
                
                let sourceInterval = interval1;
                if (interval2 && Math.abs(y_data % interval2) < Math.abs(y_data % interval1)) {
                    sourceInterval = interval2;
                }
                const screenSpacing = sourceInterval * viewTransform.scale;
                let sigFigsForLabel = 0;
                if (screenSpacing > TICK_LABEL_SIGFIG_THRESH_1) sigFigsForLabel = 3; 
                else if (screenSpacing > TICK_LABEL_SIGFIG_THRESH_2) sigFigsForLabel = 2; 
                else if (screenSpacing > TICK_LABEL_SIGFIG_THRESH_3) sigFigsForLabel = 1; 
                else sigFigsForLabel = 0;
                
                const decimalPlacesInInterval = sourceInterval > 0 ? -Math.floor(Math.log10(sourceInterval)) : 0;
                if (decimalPlacesInInterval > 0) {
                    sigFigsForLabel = Math.max(sigFigsForLabel, decimalPlacesInInterval + 1);
                }
                
                const screenY = dataToScreen({ x: 0, y: y_data }).y;
                let yLabelContent = formatNumber(y_data, sigFigsForLabel);
                if (coordsDisplayMode === COORDS_DISPLAY_MODE_COMPLEX && yLabelContent !== "0") {
                    if (yLabelContent === '1') yLabelContent = IMAGINARY_UNIT_SYMBOL;
                    else if (yLabelContent === '-1') yLabelContent = `-${IMAGINARY_UNIT_SYMBOL}`;
                    else yLabelContent += IMAGINARY_UNIT_SYMBOL;
                }
                
                ctx.beginPath(); 
                ctx.moveTo(origin.x, screenY); 
                ctx.lineTo(origin.x - AXIS_TICK_SIZE, screenY); 
                ctx.stroke();
                
                const getStableId = (prefix, num) => `${prefix}-${num.toExponential(15)}`;
                updateHtmlLabel({ 
                    id: getStableId('tick-label-y', y_data), 
                    content: yLabelContent, 
                    x: origin.x - AXIS_TICK_SIZE - AXIS_LABEL_OFFSET, 
                    y: screenY, 
                    color: tickLabelColor, 
                    fontSize: AXIS_TICK_FONT_SIZE, 
                    options: { textAlign: 'right', textBaseline: 'middle' } 
                });
            });
        }
    };

    ctx.lineWidth = AXIS_LINE_WIDTH;
    ctx.strokeStyle = colors.axis;
    ctx.fillStyle = colors.axis;

    if (coordsDisplayMode === COORDS_DISPLAY_MODE_POLAR) {
        const { interval1, interval2, alpha1, alpha2 } = lastGridState;
        ctx.lineWidth = GRID_LINEWIDTH;
        
        const posXVisible = canvasWidth > origin.x;
        const negXVisible = 0 < origin.x;
        const posYVisible = 0 < origin.y;
        const negYVisible = canvasHeight > origin.y;
        
        if (posXVisible) {
            drawAxisWithArrows(origin.x, origin.y, canvasWidth, origin.y);
            updateHtmlLabel({ 
                id: 'axis-label-r-posx', 
                content: POLAR_RADIUS_SYMBOL, 
                x: canvasWidth - AXIS_ARROW_SIZE - X_AXIS_LABEL_ARROW_DIST, 
                y: origin.y - X_AXIS_LABEL_DISTANCE, 
                color: colors.axis, 
                fontSize: AXIS_NAME_FONT_SIZE, 
                options: { textAlign: 'center', textBaseline: 'bottom' } 
            });
        }
        
        if (negXVisible) {
            drawAxisWithArrows(origin.x, origin.y, 0, origin.y);
            updateHtmlLabel({ 
                id: 'axis-label-r-negx', 
                content: POLAR_RADIUS_SYMBOL, 
                x: AXIS_ARROW_SIZE + X_AXIS_LABEL_ARROW_DIST, 
                y: origin.y - X_AXIS_LABEL_DISTANCE, 
                color: colors.axis, 
                fontSize: AXIS_NAME_FONT_SIZE, 
                options: { textAlign: 'center', textBaseline: 'bottom' } 
            });
        }
        
        if (posYVisible) {
            drawAxisWithArrows(origin.x, origin.y, origin.x, 0);
            updateHtmlLabel({ 
                id: 'axis-label-r-posy', 
                content: POLAR_RADIUS_SYMBOL, 
                x: origin.x + Y_AXIS_LABEL_DISTANCE, 
                y: AXIS_ARROW_SIZE + Y_AXIS_LABEL_ARROW_DIST, 
                color: colors.axis, 
                fontSize: AXIS_NAME_FONT_SIZE, 
                options: { textAlign: 'left', textBaseline: 'middle' } 
            });
        }
        
        if (negYVisible) {
            drawAxisWithArrows(origin.x, origin.y, origin.x, canvasHeight);
            updateHtmlLabel({ 
                id: 'axis-label-r-negy', 
                content: POLAR_RADIUS_SYMBOL, 
                x: origin.x + Y_AXIS_LABEL_DISTANCE, 
                y: canvasHeight - AXIS_ARROW_SIZE - Y_AXIS_LABEL_ARROW_DIST, 
                color: colors.axis, 
                fontSize: AXIS_NAME_FONT_SIZE, 
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
        if (coordsDisplayMode === COORDS_DISPLAY_MODE_COMPLEX) {
            xLabel = COMPLEX_REAL_LABEL;
            yLabel = COMPLEX_IMAGINARY_LABEL;
        }
        
        updateHtmlLabel({ 
            id: 'axis-label-x', 
            content: xLabel, 
            x: canvasWidth - AXIS_ARROW_SIZE - X_AXIS_LABEL_ARROW_DIST, 
            y: origin.y - X_AXIS_LABEL_DISTANCE, 
            color: colors.axis, 
            fontSize: AXIS_NAME_FONT_SIZE, 
            options: { textAlign: 'center', textBaseline: 'bottom' } 
        });
        
        updateHtmlLabel({ 
            id: 'axis-label-y', 
            content: yLabel, 
            x: origin.x + Y_AXIS_LABEL_DISTANCE, 
            y: AXIS_ARROW_SIZE + Y_AXIS_LABEL_ARROW_DIST, 
            color: colors.axis, 
            fontSize: AXIS_NAME_FONT_SIZE, 
            options: { textAlign: 'left', textBaseline: 'middle' } 
        });
        
        drawTicksAndLabels(lastGridState.interval1, lastGridState.alpha1, lastGridState.interval2, lastGridState.alpha2, false);
    }

    drawZeroTickAndTickLabel(ctx, origin, canvasWidth, canvasHeight, coordsDisplayMode, updateHtmlLabel, colors);

    ctx.restore();
}

export function drawGrid(ctx, { gridDisplayMode, canvas, dpr, viewTransform, gridAlpha, colors }, dataToScreen, screenToData, lastGridState, lastAngularGridState) {
    
    if (gridDisplayMode === GRID_DISPLAY_MODE_NONE) return;

    ctx.save();

    const origin = dataToScreen({ x: 0, y: 0 });
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;

    if (gridDisplayMode === GRID_DISPLAY_MODE_POLAR) {
        const topLeftData = screenToData({ x: 0, y: 0 });
        const bottomRightData = screenToData({ x: canvasWidth, y: canvasHeight });
        const maxDataRadius = Math.hypot(Math.max(Math.abs(topLeftData.x), Math.abs(bottomRightData.x)), Math.max(Math.abs(topLeftData.y), Math.abs(bottomRightData.y)));
        const transitionRadius = Math.min(canvasWidth, canvasHeight) * POLAR_TO_LINE_TRANSITION_RADIUS_FACTOR;

        const drawPolarCircles = (interval, alpha) => {
            if (!interval || alpha < MIN_ALPHA_FOR_DRAWING) return;
            
            const screenSpacing = interval * viewTransform.scale / dpr;
            if (screenSpacing < GRID_POLAR_CIRCLE_MIN_SPACING) return;

            ctx.strokeStyle = `rgba(${colors.grid.join(',')}, ${alpha * gridAlpha})`;
            ctx.lineWidth = GRID_LINEWIDTH;
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
                        ctx.arc(origin.x, origin.y, screenRadius, 0, RADIANS_IN_CIRCLE);
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
            if (level.alpha < MIN_ALPHA_FOR_DRAWING) return;

            const screenSeparation = screenRadiusForSpokes * (level.angle * Math.PI / 180);
            if (screenSeparation < GRID_POLAR_SPOKE_MIN_SPACING && screenRadiusForSpokes > GRID_POLAR_SPOKE_MIN_RADIUS) return;

            ctx.strokeStyle = `rgba(${colors.grid.join(',')}, ${level.alpha * gridAlpha})`;
            ctx.lineWidth = GRID_LINEWIDTH;

            let anglesToProcess = [];
            if (visibleAngleInfo.isFullCircle) {
                for (let deg = 0; deg < DEGREES_IN_CIRCLE; deg += level.angle) {
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
            if (!interval || alpha < MIN_ALPHA_FOR_DRAWING) return;
            const gridElementColor = `rgba(${colors.grid.join(',')}, ${alpha * gridAlpha})`;

            const start = screenToData({ x: 0, y: canvasHeight });
            const end = screenToData({ x: canvasWidth, y: 0 });
            const startTickX = Math.floor(start.x / interval) * interval;
            const endTickX = Math.ceil(end.x / interval) * interval;
            const startTickY = Math.floor(start.y / interval) * interval;
            const endTickY = Math.ceil(end.y / interval) * interval;

            if (gridDisplayMode === GRID_DISPLAY_MODE_LINES) {
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
            } else if (gridDisplayMode === GRID_DISPLAY_MODE_POINTS) {
                ctx.fillStyle = gridElementColor;
                const pointRadius = GRID_POINT_RADIUS * dpr;
                for (let x = startTickX; x <= endTickX; x += interval) {
                    for (let y = startTickY; y <= endTickY; y += interval) {
                        const screenPos = dataToScreen({ x: x, y: y });
                        ctx.beginPath();
                        ctx.arc(screenPos.x, screenPos.y, pointRadius, 0, RADIANS_IN_CIRCLE);
                        ctx.fill();
                    }
                }
            } else if (gridDisplayMode === GRID_DISPLAY_MODE_TRIANGULAR) {
                ctx.fillStyle = gridElementColor;
                const pointRadius = GRID_POINT_RADIUS * dpr;
                const y_step = interval * TRIANGULAR_GRID_Y_STEP_FACTOR;
                
                const startTickY_tri = Math.floor(start.y / y_step) * y_step;
                const endTickY_tri = Math.ceil(end.y / y_step) * y_step;
                
                for (let y = startTickY_tri; y <= endTickY_tri; y += y_step) {
                    const rowIndex = Math.round(y / y_step);
                    const x_offset = (rowIndex % 2 !== 0) ? interval / 2 : 0;
                    for (let x = startTickX; x <= endTickX; x += interval) {
                        const finalX = x + x_offset;
                        const screenPos = dataToScreen({ x: finalX, y: y });
                        ctx.beginPath();
                        ctx.arc(screenPos.x, screenPos.y, pointRadius, 0, RADIANS_IN_CIRCLE);
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

function drawCenterSymbol(ctx, point, dataToScreen, colors) {
    const screenPos = dataToScreen(point); const radius = CENTER_POINT_VISUAL_RADIUS;
    ctx.strokeStyle = colors.defaultStroke;
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

export function drawPoint(ctx, point, { selectedPointIds, selectedCenterIds, activeCenterId, currentColor, colors }, dataToScreen, updateHtmlLabel) {
    let isSelected;
    if (point.type === POINT_TYPE_REGULAR) {
        isSelected = selectedPointIds.includes(point.id);
    } else {
        isSelected = selectedCenterIds.includes(point.id);
    }

    const pointColor = point.color || currentColor;
    const screenPos = dataToScreen(point);

    switch (point.type) {
        case POINT_TYPE_REGULAR:
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, POINT_RADIUS, 0, RADIANS_IN_CIRCLE);
            ctx.fillStyle = pointColor;
            ctx.fill();
            break;
        case TRANSFORMATION_TYPE_ROTATION:
        case TRANSFORMATION_TYPE_SCALE:
        case TRANSFORMATION_TYPE_DIRECTIONAL_SCALE:
            const onCanvasIconSize = CENTER_POINT_VISUAL_RADIUS * 2;
            const icon = {
                type: point.type,
                x: screenPos.x - onCanvasIconSize / 2,
                y: screenPos.y - onCanvasIconSize / 2,
                width: onCanvasIconSize,
                height: onCanvasIconSize
            };
            drawUITransformationSymbols(ctx, icon, colors);
            break;
    }

    if (isSelected) {
        ctx.save();
        ctx.shadowColor = point.id === activeCenterId ? colors.activeCenterGlow : colors.selectionGlow;
        ctx.shadowBlur = SELECTION_GLOW_BLUR_RADIUS;
        ctx.globalAlpha = SELECTION_GLOW_ALPHA;

        ctx.beginPath();
        let glowRadius;
        if (point.type === POINT_TYPE_REGULAR) {
            glowRadius = POINT_RADIUS + SELECTION_GLOW_RADIUS_OFFSET;
        } else {
            glowRadius = CENTER_POINT_VISUAL_RADIUS + SELECTION_GLOW_RADIUS_OFFSET;
        }
        ctx.arc(screenPos.x, screenPos.y, glowRadius, 0, RADIANS_IN_CIRCLE);
        ctx.strokeStyle = point.id === activeCenterId ? colors.activeCenterGlow : colors.selectionGlow;
        ctx.lineWidth = SELECTION_GLOW_LINE_WIDTH;
        ctx.stroke();

        ctx.restore();
    }
}

export function drawAllEdges(ctx, { allEdges, selectedEdgeIds, isDragConfirmed, dragPreviewPoints, currentColor, colors }, dataToScreen, findPointById, getEdgeId) {
    ctx.lineWidth = LINE_WIDTH;
    allEdges.forEach(edge => {
        const p1_orig = findPointById(edge.id1);
        const p2_orig = findPointById(edge.id2);
        if (!p1_orig || !p2_orig || p1_orig.type !== POINT_TYPE_REGULAR || p2_orig.type !== POINT_TYPE_REGULAR) return;

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
            ctx.strokeStyle = colors.selectionGlow;
            ctx.globalAlpha = SELECTION_GLOW_ALPHA;
            ctx.lineWidth = LINE_WIDTH + EDGE_SELECTION_GLOW_WIDTH_OFFSET;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    });
    ctx.setLineDash([]);
    ctx.strokeStyle = colors.defaultStroke;
}

export function drawDragFeedback(ctx, htmlOverlay, targetPointId, currentPointStates, { lastGridState, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, currentShiftPressed, viewTransform, colors }, dataToScreen, findNeighbors, getEdgeId, isSnapping = false, excludedEdgeId = null, updateHtmlLabel = null) {
    const feedbackColor = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;

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

                const labelId = `drag-dist-${vertex.id}-${neighbor.id}`;

                if (Math.abs(Math.cos(edgeAngleScreen)) < VERTICAL_LINE_COS_THRESHOLD) {
                    const distanceTextX = midX + FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
                    const distanceTextY = midY;
                    updateHtmlLabel({ id: labelId, content: distText, x: distanceTextX, y: distanceTextY, color: feedbackColor, fontSize: FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle', rotation: 90 } }, htmlOverlay);
                } else {
                    let textPerpAngle = edgeAngleScreen - Math.PI / 2;
                    if (Math.sin(textPerpAngle) > 0) {
                        textPerpAngle += Math.PI;
                    }
                    const distanceTextX = midX + Math.cos(textPerpAngle) * FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
                    const distanceTextY = midY + Math.sin(textPerpAngle) * FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;

                    let rotationDeg = edgeAngleScreen * (180 / Math.PI);
                    if (rotationDeg > 90 || rotationDeg < -90) {
                        rotationDeg += 180;
                    }

                    updateHtmlLabel({ id: labelId, content: distText, x: distanceTextX, y: distanceTextY, color: feedbackColor, fontSize: FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } }, htmlOverlay);
                }
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
                angleToDisplayRad += RADIANS_IN_CIRCLE;
            }
            if (angleToDisplayRad < GEOMETRY_CALCULATION_EPSILON) continue;
            
            const bisectorAngle = angle1_data + (angleToDisplayRad / 2);
            ctx.save();
            ctx.strokeStyle = feedbackColor;
            ctx.lineWidth = FEEDBACK_LINE_VISUAL_WIDTH;
            ctx.beginPath();
            ctx.arc(vertexScreen.x, vertexScreen.y, FEEDBACK_ARC_RADIUS_SCREEN, -angle1_data, -angle2_data, false);
            ctx.stroke();
            ctx.restore();

            let angleText;
            if (angleDisplayMode === ANGLE_DISPLAY_MODE_DEGREES) {
                angleText = `${formatNumber(angleToDisplayRad * (DEGREES_IN_HALF_CIRCLE / Math.PI), angleSigFigs)}^{\\circ}`;
            } else if (angleDisplayMode === ANGLE_DISPLAY_MODE_RADIANS) {
                if (currentShiftPressed) {
                    angleText = formatFraction(angleToDisplayRad / Math.PI, FRACTION_FORMAT_TOLERANCE, FRACTION_FORMAT_MAX_DENOMINATOR) + PI_SYMBOL_KATEX;
                    if (angleText.startsWith(`1${PI_SYMBOL_KATEX}`)) angleText = PI_SYMBOL_KATEX;
                    if (angleText.startsWith(`-1${PI_SYMBOL_KATEX}`)) angleText = `-${PI_SYMBOL_KATEX}`;
                    if (angleText === `0${PI_SYMBOL_KATEX}`) angleText = "0";
                } else {
                    angleText = formatNumber(angleToDisplayRad, angleSigFigs);
                }
            }

            if (angleText) {
                const angleLabelDataPos = {
                    x: vertex.x + (ANGLE_LABEL_RADIUS_SCREEN / viewTransform.scale) * Math.cos(bisectorAngle),
                    y: vertex.y + (ANGLE_LABEL_RADIUS_SCREEN / viewTransform.scale) * Math.sin(bisectorAngle)
                };
                const angleLabelScreenPos = dataToScreen(angleLabelDataPos);
                const labelId = `drag-angle-${vertex.id}-${p1.id}-${p2.id}`;
                updateHtmlLabel({ id: labelId, content: angleText, x: angleLabelScreenPos.x, y: angleLabelScreenPos.y, color: feedbackColor, fontSize: FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
            }
        }
    }
}

export function drawTransformIndicators(ctx, htmlOverlay, { transformIndicatorData, angleSigFigs, distanceSigFigs, colors }, dataToScreen, updateHtmlLabel) {
    if (!transformIndicatorData) return;

    const { center, startPos, currentPos, rotation, scale, isSnapping, snappedScaleValue, gridToGridInfo, transformType, directionalScale } = transformIndicatorData;

    const centerScreen = dataToScreen(center);
    const startScreen = dataToScreen(startPos);
    const color = isSnapping ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;

    ctx.save();
    ctx.setLineDash(DASH_PATTERN);
    ctx.strokeStyle = color;
    ctx.lineWidth = FEEDBACK_LINE_VISUAL_WIDTH;

    if (transformType === TRANSFORMATION_TYPE_ROTATION) {
        const currentScreen = dataToScreen(currentPos);
        const startVecScreen = { x: startScreen.x - centerScreen.x, y: startScreen.y - centerScreen.y };
        const currentVecScreen = { x: currentScreen.x - centerScreen.x, y: currentScreen.y - centerScreen.y };
        const startAngleScreen = Math.atan2(startVecScreen.y, startVecScreen.x);
        const currentAngleScreen = Math.atan2(currentVecScreen.y, currentVecScreen.x);
        const arcRadius = Math.hypot(startVecScreen.x, startVecScreen.y);

        ctx.beginPath();
        ctx.moveTo(centerScreen.x, centerScreen.y);
        ctx.lineTo(startScreen.x, startScreen.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(centerScreen.x, centerScreen.y);
        ctx.lineTo(currentScreen.x, currentScreen.y);
        ctx.stroke();

        if (Math.abs(rotation) > MIN_TRANSFORM_ACTION_THRESHOLD) {
            // Convert data rotation to screen rotation (flip Y)
            const screenRotation = -rotation;
            const anticlockwise = rotation > 0; // Use data rotation for direction
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(centerScreen.x, centerScreen.y, arcRadius, startAngleScreen, startAngleScreen + screenRotation, anticlockwise);
            ctx.stroke();
        }
    } else if (transformType === TRANSFORMATION_TYPE_SCALE || transformType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) {
        const scaledPos = {
            x: center.x + (startPos.x - center.x) * scale,
            y: center.y + (startPos.y - center.y) * scale
        };
        const scaledScreen = dataToScreen(scaledPos);

        ctx.beginPath();
        ctx.moveTo(centerScreen.x, centerScreen.y);
        ctx.lineTo(startScreen.x, startScreen.y);
        ctx.stroke();

        if (Math.abs(scale - 1) > MIN_TRANSFORM_ACTION_THRESHOLD) {
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(centerScreen.x, centerScreen.y);
            ctx.lineTo(scaledScreen.x, scaledScreen.y);
            ctx.stroke();
        }
    }

    ctx.setLineDash([]);
    ctx.restore();

    if (transformType === TRANSFORMATION_TYPE_ROTATION && Math.abs(rotation) > MIN_TRANSFORM_ACTION_THRESHOLD) {
        // Display the actual rotation angle in degrees (maintain sign)
        const angleDeg = rotation * (180 / Math.PI);
        const angleText = `${parseFloat(angleDeg.toFixed(4)).toString()}^{\\circ}`;
        const startVecScreen = { x: startScreen.x - centerScreen.x, y: startScreen.y - centerScreen.y };
        const currentVecScreen = { x: dataToScreen(currentPos).x - centerScreen.x, y: dataToScreen(currentPos).y - centerScreen.y };
        const startAngleScreen = Math.atan2(startVecScreen.y, startVecScreen.x);
        const currentAngleScreen = Math.atan2(currentVecScreen.y, currentVecScreen.x);
        
        // Calculate bisector for label placement
        const bisectorAngle = startAngleScreen + (-rotation) / 2; // Use negative rotation for screen space
        const arcRadius = Math.hypot(startVecScreen.x, startVecScreen.y);
        const labelRadius = arcRadius + TRANSFORM_ANGLE_LABEL_OFFSET;
        const angleTextX = centerScreen.x + labelRadius * Math.cos(bisectorAngle);
        const angleTextY = centerScreen.y + labelRadius * Math.sin(bisectorAngle);

        updateHtmlLabel({ id: 'transform-angle-indicator', content: angleText, x: angleTextX, y: angleTextY, color: color, fontSize: FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } });
    } else {
        updateHtmlLabel({ id: 'transform-angle-indicator', content: '', x: 0, y: 0, color: color, fontSize: FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }

    if ((transformType === TRANSFORMATION_TYPE_SCALE || transformType === TRANSFORMATION_TYPE_DIRECTIONAL_SCALE) && Math.abs(scale - 1) > MIN_TRANSFORM_ACTION_THRESHOLD) {
        let scaleText;
        const effectiveScale = isSnapping && snappedScaleValue !== null ? snappedScaleValue : scale;
        
        if (Math.abs(effectiveScale - 1) < 0.001) {
            scaleText = `\\times 1`;
        } else if (isSnapping && gridToGridInfo) {
            const { startSquaredSum, snapSquaredSum, gridInterval } = gridToGridInfo;
            const [startCoeff, startRadicand] = simplifySquareRoot(startSquaredSum);
            const [snapCoeff, snapRadicand] = simplifySquareRoot(snapSquaredSum);
            
            if (startRadicand === 1 && snapRadicand === 1) {
                scaleText = `\\times \\frac{${snapCoeff}}{${startCoeff}}`;
            } else if (startRadicand === snapRadicand) {
                scaleText = `\\times \\frac{${snapCoeff}}{${startCoeff}}`;
            } else {
                const numerator = formatSimplifiedRoot(snapCoeff, snapRadicand);
                const denominator = formatSimplifiedRoot(startCoeff, startRadicand);
                scaleText = `\\times \\frac{${numerator}}{${denominator}}`;
            }
        } else if (isSnapping && snappedScaleValue !== null) {
            scaleText = `\\times ${formatFraction(snappedScaleValue, FRACTION_FORMAT_TOLERANCE, FRACTION_FORMAT_MAX_DENOMINATOR_TRANSFORM)}`;
        } else {
            const formattedScale = parseFloat(effectiveScale.toFixed(4)).toString();
            scaleText = `\\times ${formattedScale}`;
        }

        const midX = (centerScreen.x + startScreen.x) / 2;
        const midY = (centerScreen.y + startScreen.y) / 2;
        const lineAngle = Math.atan2(startScreen.y - centerScreen.y, startScreen.x - centerScreen.x);
        let textPerpAngle = lineAngle - Math.PI / 2;
        const scaleTextX = midX + Math.cos(textPerpAngle) * TRANSFORM_SCALE_LABEL_OFFSET;
        const scaleTextY = midY + Math.sin(textPerpAngle) * TRANSFORM_SCALE_LABEL_OFFSET;

        let rotationDeg = lineAngle * (DEGREES_IN_HALF_CIRCLE / Math.PI);
        if (rotationDeg > DEGREES_IN_QUADRANT || rotationDeg < -DEGREES_IN_QUADRANT) {
            rotationDeg += DEGREES_IN_HALF_CIRCLE;
        }

        updateHtmlLabel({ id: 'transform-scale-indicator', content: scaleText, x: scaleTextX, y: scaleTextY, color: color, fontSize: FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'bottom', rotation: rotationDeg } }, htmlOverlay);
    } else {
        updateHtmlLabel({ id: 'transform-scale-indicator', content: '', x: 0, y: 0, color: color, fontSize: FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'bottom' } }, htmlOverlay);
    }
}

export function drawTranslationFeedback(ctx, htmlOverlay, { dragOrigin, snappedData, drawingContext, showDistances, showAngles, distanceSigFigs, angleDisplayMode, angleSigFigs, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors }, dataToScreen, updateHtmlLabel) {
    const dragOriginScreen = dataToScreen(dragOrigin);
    const targetDataPos = { x: snappedData.x, y: snappedData.y };
    const targetScreen = dataToScreen(targetDataPos);
    
    const feedbackColor = snappedData.snapped ? colors.feedbackSnapped : `rgba(${colors.feedbackDefault.join(',')}, 1.0)`;
    
    ctx.save();
    ctx.setLineDash(DASH_PATTERN);
    ctx.strokeStyle = feedbackColor;
    ctx.lineWidth = FEEDBACK_LINE_VISUAL_WIDTH;

    ctx.beginPath();
    ctx.moveTo(dragOriginScreen.x, dragOriginScreen.y);
    ctx.lineTo(targetScreen.x, targetScreen.y);
    ctx.stroke();
    
    ctx.setLineDash([]);
    ctx.restore();

    const stateForSnapInfo = { 
        showDistances, 
        showAngles, 
        currentShiftPressed: true,
        distanceSigFigs, 
        angleSigFigs, 
        angleDisplayMode, 
        viewTransform, 
        frozenReference_D_du, 
        gridDisplayMode, 
        frozenReference_A_rad, 
        colors 
    };
    
    prepareSnapInfoTexts(ctx, htmlOverlay, dragOrigin, targetDataPos, snappedData, stateForSnapInfo, dataToScreen, drawingContext, updateHtmlLabel);

}

export function drawReferenceElementsGeometry(ctx, context, dataToScreen, screenToData, { showAngles, showDistances, viewTransform, mousePos, colors }) {
    if ((!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display) return;
    
    const startPointData = context.frozen_Origin_Data_to_display;
    const mouseDataPos = screenToData(mousePos);
    const previewDistance = distance(startPointData, mouseDataPos);
    
    if (previewDistance < GEOMETRY_CALCULATION_EPSILON) return;

    const refElementColor = colors.frozenReference;

    const turnAngleData = context.displayAngleA_valueRad_for_A_equals_label;
    const baseAngleData = context.frozen_A_baseRad_to_display !== null ? context.frozen_A_baseRad_to_display : 0;
    const distanceData = context.frozen_D_du_to_display;

    if (!startPointData) return;

    const frozenOriginScreen = dataToScreen(startPointData);
    const absoluteAngleForRefLine = baseAngleData + turnAngleData;

    ctx.save();
    ctx.lineWidth = FEEDBACK_LINE_VISUAL_WIDTH;
    ctx.strokeStyle = refElementColor;

    if (showAngles && context.displayAngleA_valueRad_for_A_equals_label !== null && Math.abs(context.displayAngleA_valueRad_for_A_equals_label) > GEOMETRY_CALCULATION_EPSILON) {
        const effectiveRadiusForLine = REF_ARC_RADIUS_SCREEN + ctx.lineWidth / 2;

        const dottedLineEndPointData = {
            x: startPointData.x + Math.cos(baseAngleData) * (effectiveRadiusForLine / viewTransform.scale),
            y: startPointData.y + Math.sin(baseAngleData) * (effectiveRadiusForLine / viewTransform.scale)
        };
        const dottedLineEndPointScreen = dataToScreen(dottedLineEndPointData);

        ctx.beginPath();
        ctx.moveTo(frozenOriginScreen.x, frozenOriginScreen.y);
        ctx.lineTo(dottedLineEndPointScreen.x, dottedLineEndPointScreen.y);
        ctx.setLineDash(REF_LINE_DASH_PATTERN);
        ctx.stroke();

        drawAngleArc(ctx, frozenOriginScreen, baseAngleData, absoluteAngleForRefLine, REF_ARC_RADIUS_SCREEN, refElementColor, false);
    }
    ctx.restore();
}

// renderer.js
export function prepareSnapInfoTexts(ctx, htmlOverlay, startPointData, targetDataPos, snappedOutput, { showDistances, showAngles, currentShiftPressed, distanceSigFigs, angleSigFigs, angleDisplayMode, viewTransform, frozenReference_D_du, gridDisplayMode, frozenReference_A_rad, colors }, dataToScreen, drawingContext, updateHtmlLabel) {
  if ((!showAngles && !showDistances) || snappedOutput.distance < GEOMETRY_CALCULATION_EPSILON) {
    return;
  }

  const startScreen = dataToScreen(startPointData);
  const { angle: snappedAbsoluteAngleDeg, distance: snappedDistanceData, lengthSnapFactor, angleSnapFactor, angleTurn, gridToGridSquaredSum, gridInterval } = snappedOutput;
  const { offsetAngleRad, isFirstSegmentBeingDrawn } = drawingContext;
  const currentElementColor = currentShiftPressed ? colors.feedbackSnapped : colors.geometryInfoText;
  const currentLineAbsoluteAngle = Math.atan2(targetDataPos.y - startPointData.y, targetDataPos.x - startPointData.x);

  if (snappedDistanceData * viewTransform.scale / window.devicePixelRatio < POINT_RADIUS) {
    return;
  }

  const isAngleFeedbackActive = showAngles && snappedDistanceData > GEOMETRY_CALCULATION_EPSILON && Math.abs(angleTurn) > GEOMETRY_CALCULATION_EPSILON;

  if (showDistances) {
    let distanceText = '';

    if (currentShiftPressed && !isFirstSegmentBeingDrawn && frozenReference_D_du !== null) {
      const currentExactDistance = snappedDistanceData;

      if (gridToGridSquaredSum !== null && gridInterval) {
        const actualGridDistance = gridInterval * Math.sqrt(gridToGridSquaredSum);
        if (Math.abs(actualGridDistance - frozenReference_D_du) < GEOMETRY_CALCULATION_EPSILON) {
          distanceText = DELTA_SYMBOL_KATEX;
        } else {
          let foundFraction = false;
          for (const factor of SNAP_FACTORS) {
            if (Math.abs(currentExactDistance / frozenReference_D_du - factor) < GEOMETRY_CALCULATION_EPSILON) {
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
      } else if (frozenReference_D_du > GEOMETRY_CALCULATION_EPSILON) {
        const ratio = currentExactDistance / frozenReference_D_du;
        let foundFraction = false;
        for (const factor of SNAP_FACTORS) {
          if (Math.abs(ratio - factor) < GEOMETRY_CALCULATION_EPSILON) {
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
    } else if (currentShiftPressed && isFirstSegmentBeingDrawn && gridDisplayMode !== GRID_DISPLAY_MODE_NONE && gridInterval) {
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

      let textPerpAngle;

      if (isAngleFeedbackActive) {
        // If angleTurn is positive, the arc is drawn counter-clockwise relative to the base/previous segment.
        // On canvas (Y-down), this means the arc visually appears on the "right" side of the initial segment,
        // or for subsequent segments, it appears on the "right" of the line if `angleTurn` is positive.
        // We want the distance label on the *opposite* side.

        if (angleTurn > GEOMETRY_CALCULATION_EPSILON) { // Angle arc is visually on the "right" side of the segment (CW from segment)
            textPerpAngle = edgeAngleScreen - Math.PI / 2; // Place distance label on the "left" side (CCW from segment)
        } else if (angleTurn < -GEOMETRY_CALCULATION_EPSILON) { // Angle arc is visually on the "left" side of the segment (CCW from segment)
            textPerpAngle = edgeAngleScreen + Math.PI / 2; // Place distance label on the "right" side (CW from segment)
        } else { // Very small angle, treat as straight.
            // For a straight line, default to above/below depending on line slope.
            textPerpAngle = edgeAngleScreen - Math.PI / 2;
        }
      } else {
        // No angle feedback, use default side (e.g., typically "above" for horizontal, or based on visual space)
        // This is a simple heuristic. For horizontal lines, place above. For others, default perpendicular.
        if (Math.abs(Math.sin(edgeAngleScreen)) < VERTICAL_LINE_COS_THRESHOLD) { // Near horizontal
            textPerpAngle = edgeAngleScreen - Math.PI / 2; // Directly above (Y-down)
        } else if (Math.abs(Math.cos(edgeAngleScreen)) < VERTICAL_LINE_COS_THRESHOLD) { // Near vertical
            textPerpAngle = edgeAngleScreen; // Directly beside (X-right for upward slope, X-left for downward)
            if (Math.sin(edgeAngleScreen) < 0) { // Segment goes upwards (Y decreases)
                textPerpAngle += Math.PI / 2; // Place label on right side
            } else { // Segment goes downwards (Y increases)
                textPerpAngle -= Math.PI / 2; // Place label on right side
            }
        } else {
            textPerpAngle = edgeAngleScreen - Math.PI / 2;
            // Ensure it generally points "upwards" relative to reading direction
            if (Math.sin(textPerpAngle) > 0) {
                textPerpAngle += Math.PI;
            }
        }
      }
      
      const distanceTextX = midX + Math.cos(textPerpAngle) * FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
      const distanceTextY = midY + Math.sin(textPerpAngle) * FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN;
      let rotationDeg = edgeAngleScreen * (DEGREES_IN_HALF_CIRCLE / Math.PI);
      if (rotationDeg > DEGREES_IN_QUADRANT || rotationDeg < -DEGREES_IN_QUADRANT) {
        rotationDeg += DEGREES_IN_HALF_CIRCLE;
      }
      updateHtmlLabel({ id: 'snap-dist', content: distanceText, x: distanceTextX, y: distanceTextY, color: currentElementColor, fontSize: FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } }, htmlOverlay);
    }
  }

  if (isAngleFeedbackActive) {
    const baseAngleForArc = isFirstSegmentBeingDrawn ? 0 : offsetAngleRad;

    drawAngleArc(ctx, startScreen, baseAngleForArc, currentLineAbsoluteAngle, FEEDBACK_ARC_RADIUS_SCREEN, currentElementColor);

    ctx.save();
    ctx.beginPath();
    const effectiveRadiusForLine = FEEDBACK_ARC_RADIUS_SCREEN + ctx.lineWidth / 2;
    const baseLineEndData = {
      x: startPointData.x + (effectiveRadiusForLine / viewTransform.scale) * Math.cos(baseAngleForArc),
      y: startPointData.y + (effectiveRadiusForLine / viewTransform.scale) * Math.sin(baseAngleForArc)
    };
    const baseLineEndScreen = dataToScreen(baseLineEndData);
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(baseLineEndScreen.x, baseLineEndScreen.y);
    ctx.strokeStyle = colors.helperLine;
    ctx.setLineDash(HELPER_LINE_DASH_PATTERN);
    ctx.lineWidth = FEEDBACK_LINE_VISUAL_WIDTH;
    ctx.stroke();
    ctx.restore();

    let angleText = '';
    const canReferToTheta = !isFirstSegmentBeingDrawn && frozenReference_A_rad !== null && Math.abs(frozenReference_A_rad) > GEOMETRY_CALCULATION_EPSILON;

    if (angleDisplayMode === ANGLE_DISPLAY_MODE_DEGREES) {
      if (currentShiftPressed && canReferToTheta) {
        const referenceAngleRad = Math.abs(drawingContext.currentSegmentReferenceA_for_display);
        let potentialFactor = null;

        if (typeof angleSnapFactor === 'number') {
          potentialFactor = angleSnapFactor;
        } else if (angleTurn !== null) {
          if (Math.abs(referenceAngleRad) > GEOMETRY_CALCULATION_EPSILON) {
            const calculatedFactor = angleTurn / referenceAngleRad;
            for (const frac of NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
              if (Math.abs(Math.abs(calculatedFactor) - frac) < GEOMETRY_CALCULATION_EPSILON) {
                potentialFactor = calculatedFactor < 0 ? -frac : frac;
                break;
              }
            }
          }
        }
        if (potentialFactor !== null && Math.abs(potentialFactor) > GEOMETRY_CALCULATION_EPSILON) {
          angleText = formatSnapFactor(potentialFactor, 'A');
        } else {
          let degrees = angleTurn * (DEGREES_IN_HALF_CIRCLE / Math.PI);
          if (Math.abs(degrees) > GEOMETRY_CALCULATION_EPSILON) {
            angleText = `${formatNumber(degrees, angleSigFigs)}^{\\circ}`;
          }
        }
      } else {
        let angleToFormatRad = isFirstSegmentBeingDrawn ? currentLineAbsoluteAngle : angleTurn;
        if (currentShiftPressed && !isFirstSegmentBeingDrawn) {
          let angleToFormatDeg = angleToFormatRad * (DEGREES_IN_HALF_CIRCLE / Math.PI);
          if (Math.abs(angleToFormatDeg) > GEOMETRY_CALCULATION_EPSILON) {
            angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
          }
        } else {
          let angleToFormatDeg = normalizeAngleToPi(angleToFormatRad) * (DEGREES_IN_HALF_CIRCLE / Math.PI);
          if (Math.abs(angleToFormatDeg) > GEOMETRY_CALCULATION_EPSILON) {
            angleText = `${formatNumber(angleToFormatDeg, angleSigFigs)}^{\\circ}`;
          }
        }
      }
    } else if (angleDisplayMode === ANGLE_DISPLAY_MODE_RADIANS) {
      if (currentShiftPressed && canReferToTheta) {
        const referenceAngleRad = Math.abs(drawingContext.currentSegmentReferenceA_for_display);
        let potentialFactor = null;

        if (typeof angleSnapFactor === 'number') {
          potentialFactor = angleSnapFactor;
        } else if (angleTurn !== null) {
          if (Math.abs(referenceAngleRad) > GEOMETRY_CALCULATION_EPSILON) {
            const calculatedFactor = angleTurn / referenceAngleRad;
            for (const frac of NINETY_DEG_ANGLE_SNAP_FRACTIONS) {
              if (Math.abs(Math.abs(calculatedFactor) - frac) < GEOMETRY_CALCULATION_EPSILON) {
                potentialFactor = calculatedFactor < 0 ? -frac : frac;
                break;
              }
            }
          }
        }
        if (potentialFactor !== null && Math.abs(potentialFactor) > GEOMETRY_CALCULATION_EPSILON) {
          const fracStr = formatSnapFactor(potentialFactor, null);
          angleText = `${fracStr === '0' ? '0' : fracStr + PI_SYMBOL_KATEX}`;
          if (angleText.startsWith(`1${PI_SYMBOL_KATEX}`)) angleText = PI_SYMBOL_KATEX;
          if (angleText.startsWith(`-1${PI_SYMBOL_KATEX}`)) angleText = `-${PI_SYMBOL_KATEX}`;
          if (angleText === `0${PI_SYMBOL_KATEX}`) angleText = "0";
        } else {
          let radians = angleTurn;
          if (Math.abs(radians) > GEOMETRY_CALCULATION_EPSILON) {
            angleText = formatNumber(radians, angleSigFigs);
          }
        }
      } else {
        let angleToFormatRad = isFirstSegmentBeingDrawn ? currentLineAbsoluteAngle : angleTurn;
        if (currentShiftPressed && !isFirstSegmentBeingDrawn) {
          let radians = angleToFormatRad;
          if (Math.abs(radians) > GEOMETRY_CALCULATION_EPSILON) {
            angleText = formatNumber(radians, angleSigFigs);
          }
        } else {
          let radians = normalizeAngleToPi(angleToFormatRad);
          if (Math.abs(radians) > GEOMETRY_CALCULATION_EPSILON) {
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
      const angleTextX = startScreen.x + Math.cos(bisectorCanvasAngle) * SNAP_ANGLE_LABEL_OFFSET;
      const angleTextY = startScreen.y + Math.sin(bisectorCanvasAngle) * SNAP_ANGLE_LABEL_OFFSET;
      updateHtmlLabel({ id: 'snap-angle', content: angleText, x: angleTextX, y: angleTextY, color: currentElementColor, fontSize: FEEDBACK_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }
  }
}

export function prepareReferenceElementsTexts(htmlOverlay, context, { showAngles, showDistances, viewTransform, mousePos, frozenReference_D_du, distanceSigFigs, angleSigFigs, angleDisplayMode, colors }, screenToData, dataToScreen, updateHtmlLabel) {
    const dataThreshold = REF_TEXT_SCREEN_PIXEL_THRESHOLD / viewTransform.scale;

    let previewDistance = -1;
    if (context.frozen_Origin_Data_to_display) {
        const startPointData = context.frozen_Origin_Data_to_display;
        const mouseDataPos = screenToData(mousePos);
        previewDistance = distance(startPointData, mouseDataPos);
    }

    if ((!showAngles && !showDistances) || !context.frozen_Origin_Data_to_display || previewDistance < dataThreshold) {
        return;
    }

    const refElementColor = colors.frozenReference;

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
            distanceText = `${DELTA_EQUALS_KATEX}${formatSimplifiedRoot(roundedFinalCoeff, radicand)}`;
        } else {
            const platonicValue = distanceData / DEFAULT_REFERENCE_DISTANCE;
            distanceText = `${DELTA_EQUALS_KATEX}${formatNumber(platonicValue, distanceSigFigs)}`;
        }

        const edgeAngleScreen = Math.atan2(endPointScreen.y - startPointScreen.y, endPointScreen.x - startPointScreen.x);
        const midX_screen = (startPointScreen.x + endPointScreen.x) / 2;
        const midY_screen = (startPointScreen.y + endPointScreen.y) / 2;
        
        let rotationDeg = edgeAngleScreen * (DEGREES_IN_HALF_CIRCLE / Math.PI);
        if (rotationDeg > DEGREES_IN_QUADRANT || rotationDeg < -DEGREES_IN_QUADRANT) {
            rotationDeg += DEGREES_IN_HALF_CIRCLE;
        }
        let textPerpAngle;

        if (showAngles && turnAngleData !== null && Math.abs(turnAngleData) > GEOMETRY_CALCULATION_EPSILON) {
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
        const textDistLabelX_D = midX_screen + Math.cos(textPerpAngle) * REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN;
        const textDistLabelY_D = midY_screen + Math.sin(textPerpAngle) * REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN;

        updateHtmlLabel({ id: 'ref-dist', content: distanceText, x: textDistLabelX_D, y: textDistLabelY_D, color: refElementColor, fontSize: REF_TEXT_KATEX_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle', rotation: rotationDeg } }, htmlOverlay);
    }

    if (showAngles && turnAngleData !== null && Math.abs(turnAngleData) > GEOMETRY_CALCULATION_EPSILON) {
        const startAngleCanvas = -baseAngleData;
        const endAngleCanvas = -(baseAngleData + turnAngleData);

        const sumCos = Math.cos(startAngleCanvas) + Math.cos(endAngleCanvas);
        const sumSin = Math.sin(startAngleCanvas) + Math.sin(endAngleCanvas);
        let bisectorCanvasAngle = Math.atan2(sumSin, sumCos);
        const angleLabelOffsetDistance = REF_TEXT_ANGLE_LABEL_OFFSET_SCREEN;

        const textAngleLabelX_A = startPointScreen.x + Math.cos(bisectorCanvasAngle) * angleLabelOffsetDistance;
        const textAngleLabelY_A = startPointScreen.y + Math.sin(bisectorCanvasAngle) * angleLabelOffsetDistance;

        let aKatexText = '';
        if (angleDisplayMode === ANGLE_DISPLAY_MODE_DEGREES) {
            let aValueDeg = turnAngleData * (DEGREES_IN_HALF_CIRCLE / Math.PI);
            aKatexText = `${THETA_EQUALS_KATEX}${formatNumber(aValueDeg, angleSigFigs)}^{\\circ}`;
        } else if (angleDisplayMode === ANGLE_DISPLAY_MODE_RADIANS) {
            let aValueRad = turnAngleData;
            aKatexText = `${THETA_EQUALS_KATEX}${formatFraction(aValueRad / Math.PI, FRACTION_FORMAT_TOLERANCE, FRACTION_FORMAT_MAX_DENOMINATOR)}${PI_SYMBOL_KATEX}`;
            if (aKatexText === `${THETA_EQUALS_KATEX}1${PI_SYMBOL_KATEX}`) aKatexText = PI_SYMBOL_KATEX;
            if (aKatexText === `${THETA_EQUALS_KATEX}-1${PI_SYMBOL_KATEX}`) aKatexText = `-${PI_SYMBOL_KATEX}`;
            if (aKatexText === `${THETA_EQUALS_KATEX}0${PI_SYMBOL_KATEX}`) aKatexText = "0";
        }

        updateHtmlLabel({ id: 'ref-angle', content: aKatexText, x: textAngleLabelX_A, y: textAngleLabelY_A, color: refElementColor, fontSize: REF_TEXT_KATEX_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }
}

export function updateMouseCoordinates(htmlOverlay, { coordsDisplayMode, isMouseOverCanvas, currentShiftPressed, ghostPointPosition, gridDisplayMode, lastGridState, angleDisplayMode, canvas, dpr, mousePos, colors}, screenToData, updateHtmlLabel) {
    
    if (coordsDisplayMode === COORDS_DISPLAY_MODE_NONE || !mousePos || !isMouseOverCanvas) {
        return;
    }

    let displayPos;
    if (currentShiftPressed && ghostPointPosition) {
        displayPos = ghostPointPosition;
    } else {
        displayPos = screenToData(mousePos);
    }

    let effectiveGridInterval = 1;
    if (gridDisplayMode !== GRID_DISPLAY_MODE_NONE && lastGridState && lastGridState.interval1) {
        effectiveGridInterval = (lastGridState.alpha2 > lastGridState.alpha1 && lastGridState.interval2) ? lastGridState.interval2 : lastGridState.interval1;
    }

    let decimalPlaces = 0;
    if (effectiveGridInterval > 0) {
        decimalPlaces = Math.max(0, -Math.floor(Math.log10(effectiveGridInterval * COORD_PRECISION_FACTOR)));
        decimalPlaces = Math.min(decimalPlaces + 1, MAX_COORD_DECIMAL_PLACES);
    }

    const angleDecimalPlaces = Math.min(decimalPlaces + 1, MAX_ANGLE_DECIMAL_PLACES);
    let textContent = '';

    switch (coordsDisplayMode) {
        case COORDS_DISPLAY_MODE_REGULAR: {
            let xValue = displayPos.x;
            let yValue = displayPos.y;
            let xText = xValue.toFixed(decimalPlaces);
            if (xValue >= 0) xText = `${KATEX_MINUS_PHANTOM}${xText}`;
            let yText = yValue.toFixed(decimalPlaces);
            if (yValue >= 0) yText = `${KATEX_MINUS_PHANTOM}${yText}`;
            textContent = `\\begin{pmatrix*}[r] x \\\\ y \\end{pmatrix*} = \\begin{pmatrix*}[r] ${xText} \\\\ ${yText} \\end{pmatrix*}`;
            break;
        }
        case COORDS_DISPLAY_MODE_COMPLEX: {
            let reValue = displayPos.x;
            let imValue = displayPos.y;
            let rePart = reValue.toFixed(decimalPlaces);
            if (reValue >= 0) rePart = `${KATEX_MINUS_PHANTOM}${rePart}`;
            let imPartAbs = Math.abs(imValue).toFixed(decimalPlaces);
            const sign = imValue < 0 ? '-' : '+';
            textContent = `z = ${rePart} ${sign} ${imPartAbs}${IMAGINARY_UNIT_SYMBOL}`;
            break;
        }
        case COORDS_DISPLAY_MODE_POLAR: {
            let rValue = Math.hypot(displayPos.x, displayPos.y);
            let thetaRaw = Math.atan2(displayPos.y, displayPos.x);
            let rText = rValue.toFixed(decimalPlaces);
            if (rValue >= 0) rText = `${KATEX_MINUS_PHANTOM}${rText}`;
            let angleStr;
            if (angleDisplayMode === ANGLE_DISPLAY_MODE_DEGREES) {
                let thetaDeg = normalizeAngleDegrees(thetaRaw * 180 / Math.PI);
                angleStr = thetaDeg.toFixed(angleDecimalPlaces);
                if (thetaDeg >= 0) angleStr = `${KATEX_MINUS_PHANTOM}${angleStr}`;
                angleStr += `^{\\circ}`;
            } else {
                let thetaRad = normalizeAngleToPi(thetaRaw);
                angleStr = thetaRad.toFixed(angleDecimalPlaces);
                if (thetaRad >= 0) angleStr = `${KATEX_MINUS_PHANTOM}${angleStr}`;
            }
            textContent = `\\begin{pmatrix*}[r] r \\\\ \\theta \\end{pmatrix*} = \\begin{pmatrix*}[r] ${rText} \\\\ ${angleStr} \\end{pmatrix*}`;
            break;
        }
    }

    const canvasWidth = canvas.width / dpr;
    updateHtmlLabel({ id: 'mouse-coord-text', content: textContent, x: canvasWidth - UI_PADDING, y: UI_PADDING, color: colors.mouseCoords, fontSize: MOUSE_COORD_FONT_SIZE, options: { textAlign: 'right', textBaseline: 'top' } }, htmlOverlay);
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

function drawThemeIcon(ctx, rect, activeThemeName, colors) {
    ctx.save();
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const radius = rect.width / 2 * 0.6; // Make icon slightly smaller than button bounds

    ctx.strokeStyle = colors.uiIcon;
    ctx.fillStyle = colors.uiIcon;
    ctx.lineWidth = 2;

    if (activeThemeName === 'dark') {
        // Draw a Sun Icon
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
        // Draw a Moon Icon
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(centerX - 5, centerY - 3, radius, 0, 2 * Math.PI);
        ctx.fillStyle = colors.background; // Use background color to "cut out" the crescent
        ctx.fill();
    }
    ctx.restore();
}

export function drawCoordsIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel, colors) {
    const colorStrong = isSelected ? colors.uiIconSelected : colors.uiIconDefault;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    const x_offset = 1;
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = UI_ICON_LINE_WIDTH_SMALL;
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
        case COORDS_DISPLAY_MODE_REGULAR:
            ctx.setLineDash(UI_ICON_DASH_PATTERN);
            ctx.beginPath();
            ctx.moveTo(point.x, point.y); ctx.lineTo(point.x, 30);
            ctx.moveTo(point.x, point.y); ctx.lineTo(2 + x_offset, point.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(point.x, point.y, UI_ICON_POINT_RADIUS, 0, RADIANS_IN_CIRCLE);
            ctx.fill();
            label = '(x,y)';
            break;
        case COORDS_DISPLAY_MODE_COMPLEX:
            ctx.setLineDash(UI_ICON_DASH_PATTERN);
            ctx.beginPath();
            ctx.moveTo(2 + x_offset, 30); ctx.lineTo(point.x, point.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(point.x, point.y, UI_ICON_POINT_RADIUS, 0, RADIANS_IN_CIRCLE);
            ctx.fill();
            label = 'x+iy';
            break;
        case COORDS_DISPLAY_MODE_POLAR:
            ctx.setLineDash(UI_ICON_DASH_PATTERN);
            ctx.beginPath();
            ctx.moveTo(2 + x_offset, 30); ctx.lineTo(point.x, point.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(2 + x_offset, 30, 8, -Math.atan2(30 - point.y, point.x - (2 + x_offset)), 0);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(point.x, point.y, UI_ICON_POINT_RADIUS, 0, RADIANS_IN_CIRCLE);
            ctx.fill();
            label = '(r,\\theta)';
            break;
        case COORDS_DISPLAY_MODE_NONE:
            break;
    }
    ctx.restore();
    if (label) {
        const labelId = 'icon-label-coords';
        const labelColor = isSelected ? colors.uiTextSelected : colors.uiTextDefault;
        updateHtmlLabel({ id: labelId, content: label, x: center.x + (labelPos.x - 16) * scale, y: center.y + (labelPos.y - 16) * scale, color: labelColor, fontSize: UI_ICON_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }
}

export function drawAngleIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel, colors) {
    const colorStrong = isSelected ? colors.uiIconSelected : colors.uiIconDefault;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    let sizeIncrease = 0;
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = UI_ICON_LINE_WIDTH_SMALL;
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
    if (mode !== ANGLE_DISPLAY_MODE_NONE) {
        ctx.beginPath();
        const angle = Math.atan2(p3.y - p2.y, p3.x - p2.x);
        ctx.arc(p2.x, p2.y, 8, angle, 0);
        ctx.stroke();
        if (mode === ANGLE_DISPLAY_MODE_DEGREES) {
            label = '60^\\circ';
        } else if (mode === ANGLE_DISPLAY_MODE_RADIANS) {
            label = '\\frac{\\pi}{3}';
            sizeIncrease = 2
        }
    }
    ctx.restore();
    if (label) {
        const labelId = 'icon-label-angles';
        const labelColor = isSelected ? colors.uiTextSelected : colors.uiTextDefault;
        updateHtmlLabel({ id: labelId, content: label, x: center.x + (labelPos.x - 16) * scale, y: center.y + (labelPos.y - 20) * scale, color: labelColor, fontSize: UI_ICON_LABEL_FONT_SIZE+sizeIncrease, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
    }
}

export function drawDistanceIcon(ctx, rect, mode, isSelected, htmlOverlay, updateHtmlLabel, colors) {
    const colorStrong = isSelected ? colors.uiIconSelected : colors.uiIconDefault;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    ctx.save();
    ctx.translate(center.x, center.y);
    const scale = rect.width / UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    ctx.strokeStyle = colorStrong;
    ctx.lineWidth = UI_ICON_LINE_WIDTH_SMALL;
    ctx.beginPath();
    ctx.moveTo(2, 30);
    ctx.lineTo(30, 30);
    ctx.stroke();
    let label = '';
    let labelPos = { x: 16, y: 22 };
    if (mode === DISTANCE_DISPLAY_MODE_ON) {
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
    const scale = rect.width / UI_ICON_BASE_SIZE;
    ctx.scale(scale, scale);
    ctx.translate(-16, -16);
    ctx.strokeStyle = colorStrong;
    ctx.fillStyle = colorStrong;
    ctx.lineWidth = UI_ICON_LINE_WIDTH_SMALL;
    switch (mode) {
        case GRID_DISPLAY_MODE_LINES:
            ctx.strokeRect(2, 2, 28, 28);
            ctx.beginPath();
            ctx.moveTo(2, 16); ctx.lineTo(30, 16);
            ctx.moveTo(16, 2); ctx.lineTo(16, 30);
            ctx.stroke();
            break;
        case GRID_DISPLAY_MODE_POINTS:
            ctx.strokeRect(2, 2, 28, 28);
            ctx.beginPath();
            [8, 16, 24].forEach(x => {
                [8, 16, 24].forEach(y => {
                    ctx.moveTo(x, y);
                    ctx.arc(x, y, UI_ICON_POINT_RADIUS, 0, RADIANS_IN_CIRCLE);
                });
            });
            ctx.fill();
            break;
        case GRID_DISPLAY_MODE_TRIANGULAR:
            ctx.strokeRect(2, 2, 28, 28);
            const triRadius = 8;
            const triCenterX = 16;
            const triCenterY = 16;
            ctx.beginPath();
            ctx.arc(triCenterX, triCenterY, UI_ICON_POINT_RADIUS, 0, RADIANS_IN_CIRCLE);
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 3 * i;
                const x = triCenterX + triRadius * Math.cos(angle);
                const y = triCenterY + triRadius * Math.sin(angle);
                ctx.moveTo(x, y);
                ctx.arc(x, y, UI_ICON_POINT_RADIUS, 0, RADIANS_IN_CIRCLE);
            }
            ctx.fill();
            break;
        case GRID_DISPLAY_MODE_POLAR:
            ctx.beginPath();
            ctx.arc(16, 16, 14, 0, RADIANS_IN_CIRCLE);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(16, 16, 7, 0, RADIANS_IN_CIRCLE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(2, 16); ctx.lineTo(30, 16);
            ctx.moveTo(16, 2); ctx.lineTo(16, 30);
            ctx.stroke();
            break;
        case GRID_DISPLAY_MODE_NONE:
            ctx.strokeRect(2, 2, 28, 28);
            break;
    }
    ctx.restore();
}

export function drawDisplayIcon(ctx, icon, state, htmlOverlay, updateHtmlLabel) {
    const { coordsDisplayMode, gridDisplayMode, angleDisplayMode, distanceDisplayMode, colors } = state;
    console.log(`Drawing ${icon.group} icon:`, {
        coordsDisplayMode,
        gridDisplayMode, 
        angleDisplayMode,
        distanceDisplayMode
    });
    let isSelected = false;
    switch (icon.group) {
        case 'coords':
            isSelected = coordsDisplayMode !== COORDS_DISPLAY_MODE_NONE;
            break;
        case 'grid':
            isSelected = gridDisplayMode !== GRID_DISPLAY_MODE_NONE;
            break;
        case 'angles':
            isSelected = angleDisplayMode !== ANGLE_DISPLAY_MODE_NONE;
            break;
        case 'distances':
            isSelected = distanceDisplayMode === DISTANCE_DISPLAY_MODE_ON;
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
    ctx.lineWidth = UI_ICON_LINE_WIDTH_SMALL;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);

    switch (icon.type) {
        case TRANSFORMATION_TYPE_ROTATION: {
            for (let i = 0; i < 3; i++) {
                const angle = i * (Math.PI / 3);
                ctx.save();
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.moveTo(-radius, 0);
                ctx.lineTo(radius, 0);
                ctx.stroke();
                ctx.restore();
            }
            break;
        }

        case TRANSFORMATION_TYPE_SCALE: {
            const radii = [0.33, 0.66, 1.0];
            radii.forEach(r => {
                ctx.beginPath();
                ctx.arc(0, 0, radius * r, 0, 2 * Math.PI);
                ctx.stroke();
            });
            break;
        }

        case TRANSFORMATION_TYPE_DIRECTIONAL_SCALE: {
            const lineSpacing = radius * 0.25;
            const lineHeight = radius * 1.6;
            for (let i = -1.5; i <= 1.5; i++) {
                ctx.beginPath();
                ctx.moveTo(i * lineSpacing, -lineHeight / 2);
                ctx.lineTo(i * lineSpacing, lineHeight / 2);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.15, 0, 2 * Math.PI);
            ctx.fill();
            break;
        }
    }
    ctx.restore();
}

export function drawCanvasUI(ctx, htmlOverlay, state, updateHtmlLabel) {
    const { dpr, canvasUI, isToolbarExpanded, isColorPaletteExpanded, isTransformPanelExpanded, isDisplayPanelExpanded, isPlacingTransform, placingTransformType, placingSnapPos, mousePos, selectedSwatchIndex, recentColors, activeThemeName, colors } = state;

    ctx.save();
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    const btn = canvasUI.toolbarButton;
    ctx.strokeStyle = colors.uiDefault;
    ctx.lineWidth = UI_MENU_ICON_LINE_WIDTH;
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
            updateHtmlLabel({ id: 'transform-tool-label', content: UI_TRANSFORM_TOOL_LABEL_TEXT, x: ttb.x + ttb.width / 2, y: ttb.y + ttb.height / 2, color: colors.uiIcon, fontSize: UI_TRANSFORM_TOOL_LABEL_FONT_SIZE, options: { textAlign: 'center', textBaseline: 'middle' } }, htmlOverlay);
        }

        const dtb = canvasUI.displayToolButton;
        if (dtb) {
            ctx.strokeStyle = colors.uiDefault;
            ctx.fillStyle = colors.uiDefault;
            ctx.lineWidth = UI_ICON_LINE_WIDTH;
            const barWidth = dtb.width - UI_DISPLAY_ICON_BAR_WIDTH_PADDING;
            for (let i = 0; i < 3; i++) {
                const y = dtb.y + UI_DISPLAY_ICON_Y_OFFSET + i * UI_DISPLAY_ICON_Y_SPACING;
                ctx.beginPath();
                ctx.moveTo(dtb.x + 6, y);
                ctx.lineTo(dtb.x + 6 + barWidth, y);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(dtb.x + 6 + barWidth * (i / 2), y, UI_DISPLAY_ICON_KNOB_RADIUS, 0, RADIANS_IN_CIRCLE);
                ctx.fill();
            }
        }

        const themeBtn = canvasUI.themeToggleButton;
        if (themeBtn) {
            drawThemeIcon(ctx, themeBtn, activeThemeName, colors);
        }
    }

    if (isColorPaletteExpanded) {
        const removeBtn = canvasUI.removeColorButton;
        if (removeBtn) {
            ctx.strokeStyle = colors.uiDefault;
            ctx.lineWidth = UI_BUTTON_BORDER_WIDTH;
            ctx.strokeRect(removeBtn.x, removeBtn.y, removeBtn.width, removeBtn.height);
            ctx.beginPath();
            ctx.moveTo(removeBtn.x + UI_BUTTON_ICON_PADDING, removeBtn.y + removeBtn.height / 2);
            ctx.lineTo(removeBtn.x + removeBtn.width - UI_BUTTON_ICON_PADDING, removeBtn.y + removeBtn.height / 2);
            ctx.stroke();
        }
        canvasUI.colorSwatches.forEach((swatch, index) => {
            ctx.fillStyle = swatch.color;
            ctx.fillRect(swatch.x, swatch.y, swatch.width, swatch.height);
            if (index === selectedSwatchIndex) {
                ctx.strokeStyle = colors.activeCenterGlow;
                ctx.lineWidth = UI_SWATCH_SELECTED_BORDER_WIDTH;
                ctx.strokeRect(swatch.x - 1, swatch.y - 1, swatch.width + 2, swatch.height + 2);
            }
        });
        const addBtn = canvasUI.addColorButton;
        if (addBtn) {
            ctx.strokeStyle = colors.uiDefault;
            ctx.lineWidth = UI_BUTTON_BORDER_WIDTH;
            ctx.strokeRect(addBtn.x, addBtn.y, addBtn.width, addBtn.height);
            ctx.beginPath();
            ctx.moveTo(addBtn.x + addBtn.width / 2, addBtn.y + UI_BUTTON_ICON_PADDING);
            ctx.lineTo(addBtn.x + addBtn.width / 2, addBtn.y + addBtn.height - UI_BUTTON_ICON_PADDING);
            ctx.moveTo(addBtn.x + UI_BUTTON_ICON_PADDING, addBtn.y + addBtn.height / 2);
            ctx.lineTo(addBtn.x + addBtn.width - UI_BUTTON_ICON_PADDING, addBtn.y + addBtn.height / 2);
            ctx.stroke();
        }
    }

    if (isTransformPanelExpanded) {
        canvasUI.transformIcons.forEach(icon => {
            drawUITransformationSymbols(ctx, icon, colors);
        });
    }

    if (isDisplayPanelExpanded) {
        canvasUI.displayIcons.forEach(icon => {
            drawDisplayIcon(ctx, icon, state, htmlOverlay, updateHtmlLabel);
        });
    }

    if (isPlacingTransform) {
        const finalDrawPos = placingSnapPos || mousePos;
        if (finalDrawPos) {
            const iconHalfSize = UI_GHOST_ICON_SIZE / 2;
            const ghostIcon = { type: placingTransformType, x: finalDrawPos.x - iconHalfSize, y: finalDrawPos.y - iconHalfSize, width: UI_GHOST_ICON_SIZE, height: UI_GHOST_ICON_SIZE };
            drawUITransformationSymbols(ctx, ghostIcon, colors);
        }
    }

    ctx.restore();
}