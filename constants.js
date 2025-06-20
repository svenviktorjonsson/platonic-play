// constants.js

// --- GEOMETRY & DRAWING ---
export const POINT_RADIUS = 5;
export const CENTER_POINT_VISUAL_RADIUS = POINT_RADIUS * 2;
export const POINT_SELECT_RADIUS = 10;
export const LINE_WIDTH = 2;
export const GRID_LINEWIDTH = 1;
export const DASH_PATTERN = [6, 6];
export const DASH_PATTERN_SMALL = [3, 3];
export const SELECTED_INDICATOR_OFFSET = 3;

// --- INTERACTION ---
export const DOUBLE_CLICK_MS = 300;
export const DRAG_THRESHOLD = 3;
export const EDGE_CLICK_THRESHOLD = 7;

// --- COLORS ---
// Colors used for dynamic alpha blending are defined as RGB arrays.
export const BACKGROUND_COLOR = 'rgba(0,0,0, 1)'; // Static color
export const GRID_COLOR = [136, 136, 136];
export const AXIS_COLOR = 'rgba(255, 255, 255, 1)'; // Static color for main axis lines
export const FROZEN_REFERENCE_COLOR = 'rgba(240, 240, 130, 0.95)'; // Static color
export const FEEDBACK_COLOR_SNAPPED = 'rgba(240, 240, 130, 0.95)'; // Static color
export const FEEDBACK_COLOR_DEFAULT = [230, 230, 230];

// --- AXES & TICKS ---
export const AXIS_LINE_WIDTH = 1.5;
export const AXIS_TICK_SIZE = 4;
export const AXIS_TICK_LABEL_COLOR = [255, 255, 255];
export const AXIS_TICK_LABEL_ALPHA = 0.9;
export const AXIS_NAME_FONT_SIZE = 24;
export const AXIS_TICK_FONT_SIZE = 10;
export const AXIS_LABEL_OFFSET = 8;
export const AXIS_LABEL_PADDING = 20;
export const AXIS_ARROW_SIZE = 12;
export const INITIAL_POLAR_REL_RADIUS = 0.309;
export const X_AXIS_LABEL_DISTANCE = 5;
export const X_AXIS_LABEL_ARROW_DIST = 20;
export const Y_AXIS_LABEL_DISTANCE = 10;
export const Y_AXIS_LABEL_ARROW_DIST = 5;
export const POLAR_THETA_LABEL_DISTANCE = 20;
export const POLAR_THETA_LABEL_ARROW_DIST = 12;

// --- DEFAULTS ---
export const DEFAULT_CALIBRATION_VIEW_SCALE = 80.0;
export const DEFAULT_REFERENCE_DISTANCE = 1.0;
export const DEFAULT_REFERENCE_ANGLE_RAD = Math.PI / 2;
export const DEFAULT_POLAR_ANGLE_DIFF = 30;

// --- UI & TOOLBAR ---
export const UI_BUTTON_PADDING = 10;
export const UI_TOOLBAR_WIDTH = 56;
export const UI_SWATCH_SIZE = 30;

// --- FEEDBACK LABELS & TEXT ---
export const FEEDBACK_LABEL_FONT_SIZE = 12;
export const FEEDBACK_ARC_RADIUS_SCREEN = 30;
export const FEEDBACK_DISTANCE_LABEL_OFFSET_SCREEN = 18;
export const FEEDBACK_LINE_VISUAL_WIDTH = 1;
export const REF_TEXT_SCREEN_PIXEL_THRESHOLD = 1.5;
export const REF_TEXT_KATEX_FONT_SIZE = 11;
export const REF_TEXT_DISTANCE_LABEL_OFFSET_SCREEN = 18;
export const REF_TEXT_ANGLE_LABEL_OFFSET_SCREEN = 50;
export const ANGLE_LABEL_RADIUS_SCREEN = 75;
export const REF_CIRCLE_MIN_DISPLAY_RADIUS = 20;
export const REF_CIRCLE_MIN_TICK_SPACING = 8;
export const REF_CIRCLE_THETA_LABEL_OFFSET = 30;
export const GEOMETRY_INFO_TEXT_COLOR = 'rgba(255, 255, 255, 0.95)'; // White text for geometry info
export const GEOMETRY_INFO_TEXT_COLOR_SNAPPED = 'rgba(240, 240, 130, 0.95)'; // Yellow when snapped

// --- GRID CALCULATIONS ---
export const GRID_TARGET_SPACING = 140;
export const GRID_ALPHA_TRANSITION_START = 0.4;
export const GRID_ALPHA_TRANSITION_END = 0.9;
export const GRID_ALPHA_CLAMP_THRESHOLD = 0.05;
export const GRID_POLAR_CIRCLE_MIN_SPACING = 10;
export const GRID_POLAR_SPOKE_MIN_SPACING = 10;
export const GRID_POLAR_SPOKE_MIN_RADIUS = 50;
export const GRID_POINT_RADIUS = 1.5;
export const ANGULAR_GRID_PREDEFINED_LEVELS = [15, 5, 1];
export const ANGULAR_GRID_TARGET_SPACING = 80;
export const ANGULAR_GRID_FADE_IN_THRESHOLD = 0.01;

// --- SNAPPING PARAMETERS ---
export const GEOMETRY_CALCULATION_EPSILON = 1e-9;
export const VERTICAL_LINE_COS_THRESHOLD = 0.1;
export const SNAP_STICKINESS_RADIUS_SCREEN = 30;
export const LINE_TO_SNAP_RADIUS_SCREEN = 10;
export const POINT_ON_LINE_SNAP_RADIUS_SCREEN = 15;
export const DRAG_SNAP_GEOMETRIC_DISTANCE_FACTORS = [0.5, 1, 1.5, 2, 3, 4, 5];
export const DRAW_SNAP_CANDIDATE_COUNT_PER_SIDE = 2;
export const DRAW_SNAP_DISTANCE_FACTOR_STEP = 0.5;
export const DRAW_SNAP_DISTANCE_FACTOR_LIMIT = 50;
export const GHOST_SNAP_RADIUS_SCREEN = 30;
export const MAX_HISTORY_SIZE = 50;

// --- SNAP GENERATION PARAMETERS ---
export const MAX_FRACTION_DENOMINATOR_FOR_ANGLE_SNAPS = 6;
export const MAX_BASE_ANGLE_MULTIPLIER_FOR_SNAPS = 2;
export const MAX_INITIAL_METER_SNAP_MULTIPLIER = 10;
export const MAX_SNAP_DENOMINATOR = 6;
export const MAX_SNAP_INTEGER = 10;

export const NINETY_DEG_ANGLE_SNAP_FRACTIONS = (() => {
    const uniqueFractions = new Set();
    const denominators = [1, 2, 3, 4, 5, 6];
    for (const q of denominators) {
        for (let p = 1; p <= q * 4; p++) {
            uniqueFractions.add(p / q);
        }
    }
    return Array.from(uniqueFractions).sort((a, b) => a - b);
})();


function generateSnapFactors(maxDenominator, maxInteger) {
    const fractionsSet = new Set();
    fractionsSet.add(0);
    for (let q = 1; q <= maxDenominator; q++) {
        for (let p = 1; p <= q * maxInteger; p++) {
            fractionsSet.add(p / q);
        }
    }
    return Array.from(fractionsSet).sort((a, b) => a - b);
}

export const SNAP_FACTORS = generateSnapFactors(MAX_SNAP_DENOMINATOR, MAX_SNAP_INTEGER);