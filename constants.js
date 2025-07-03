// constants.js

export const BASE_THEME = {
    background: '#1a1a1a',
    htmlBody: '#1e1e1e',
    grid: [136, 136, 136],
    axis: 'rgba(255, 255, 255, 1)',
    axisTickLabel: [255, 255, 255],
    defaultStroke: 'white',
    point: '#ffffff',
    frozenReference: 'rgba(240, 240, 130, 0.95)',
    feedbackDefault: [230, 230, 230],
    feedbackSnapped: 'rgba(240, 240, 130, 0.95)',
    geometryInfoText: 'rgba(255, 255, 255, 0.95)',
    geometryInfoTextSnapped: 'rgba(240, 240, 130, 0.95)',
    mouseCoords: 'rgba(255, 255, 255, 0.7)',
    uiIcon: 'white',
    uiIconDefault: '#9CA3AF',
    uiIconSelected: '#F9FAFB',
    uiTextSelected: '#E0F2FE',
    uiTextDefault: '#D1D5DB',
    uiDefault: 'rgba(255, 255, 255, 0.8)',
    selectionGlow: '#4da6ff',
    activeCenterGlow: '#00ffff',
    helperLine: 'rgba(200, 200, 200, 0.6)'
};

// --- GEOMETRY & DRAWING ---
export const POINT_RADIUS = 5;
export const CENTER_POINT_VISUAL_RADIUS = POINT_RADIUS * 2;
export const POINT_SELECT_RADIUS = 10;
export const LINE_WIDTH = 2;
export const GRID_LINEWIDTH = 1;
export const DASH_PATTERN = [6, 6];
export const DASH_PATTERN_SMALL = [3, 3];
export const SELECTED_INDICATOR_OFFSET = 3;
export const DEGREES_IN_CIRCLE = 360;
export const DEGREES_IN_HALF_CIRCLE = 180;
export const DEGREES_IN_QUADRANT = 90;
export const RADIANS_IN_CIRCLE = 2 * Math.PI;
export const MIN_ALPHA_FOR_DRAWING = 0.01;
export const TRIANGULAR_GRID_Y_STEP_FACTOR = Math.sqrt(3) / 2;
export const POLAR_TO_LINE_TRANSITION_RADIUS_FACTOR = 400;
export const ORIGIN_TICK_ANGLE_RAD = Math.PI / 3;
export const AXIS_MAJOR_TICK_SCALE_FACTOR = 1.5;
export const AXIS_ARROW_ANGLE_RAD = Math.PI / 6;
export const MAJOR_TICK_LINE_WIDTH = 1.5;
export const HELPER_LINE_DASH_PATTERN = [2, 3];
export const REF_LINE_DASH_PATTERN = [1, 3];

// --- INTERACTION ---
export const EDGE_ID_DELIMITER = '_EDGE_';
export const DOUBLE_CLICK_MS = 300;
export const DRAG_THRESHOLD = 3;
export const EDGE_CLICK_THRESHOLD = 7;
export const MIN_SCALE_VALUE = 1e-20;
export const ZOOM_FACTOR = 1.15;
export const KEYBOARD_ZOOM_FACTOR = 1.15;
export const ANGLE_SNAP_THRESHOLD_RAD = Math.PI / 24;
export const ON_SEGMENT_STRICT_T_MIN = 1e-5;
export const ON_SEGMENT_STRICT_T_MAX = 1 - 1e-5;
export const MIN_TRANSFORM_ACTION_THRESHOLD = 0.001;
export const BISECTOR_LINE_EXTENSION_FACTOR = 100000;
export const GRID_SNAP_THRESHOLD_FACTOR = 0.8;

// --- AXES & TICKS ---
export const AXIS_LINE_WIDTH = 1.5;
export const AXIS_TICK_SIZE = 4;
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
export const ANGLE_PRECISION_FACTOR = 1e6;
export const BOUNDARY_ANGLE_PRECISION = 7;
export const LABEL_ID_PRECISION_FACTOR = 1e15;
export const ORIGIN_LABEL_TEXT = '\\phantom{-}0';
export const POLAR_AXIS_RADIUS_BUFFER_FACTOR = 1.1;
export const TICK_LABEL_SIGFIG_THRESH_1 = 80;
export const TICK_LABEL_SIGFIG_THRESH_2 = 40;
export const TICK_LABEL_SIGFIG_THRESH_3 = 20;
export const FINE_TICK_ANGLE_THRESHOLD_DEG = 5;
export const IMAGINARY_UNIT_SYMBOL = 'i';
export const POLAR_RADIUS_SYMBOL = 'r';
export const COMPLEX_REAL_LABEL = '\\mathrm{Re}';
export const COMPLEX_IMAGINARY_LABEL = '\\mathrm{Im}';

// --- DEFAULTS ---
export const DEFAULT_CALIBRATION_VIEW_SCALE = 80.0;
export const DEFAULT_REFERENCE_DISTANCE = 1.0;
export const DEFAULT_REFERENCE_ANGLE_RAD = Math.PI / 2;
export const DEFAULT_POLAR_ANGLE_DIFF = 30;

// --- UI & TOOLBAR ---
export const UI_BUTTON_PADDING = 10;
export const UI_TOOLBAR_WIDTH = 56;
export const UI_SWATCH_SIZE = 30;
export const UI_PADDING = 10;
export const MENU_BUTTON_WIDTH = 36;
export const MENU_BUTTON_HEIGHT = 30;
export const TOOL_BUTTON_HEIGHT = 40;
export const TOOLBAR_SECTION_GAP = 20;
export const UI_ICON_BASE_SIZE = 32;
export const UI_ICON_LINE_WIDTH = 2;
export const UI_ICON_LINE_WIDTH_SMALL = 1.5;
export const UI_ICON_DASH_PATTERN = [2, 2];
export const UI_ICON_POINT_RADIUS = 1.5;
export const UI_ICON_LABEL_FONT_SIZE = 10;
export const UI_MENU_ICON_LINE_WIDTH = 3;
export const TRANSFORM_ICON_SIZE = 30;
export const TRANSFORM_ICON_PADDING = 15;
export const TRANSFORM_ICON_Y_OFFSET = 5;
export const UI_TRANSFORM_TOOL_LABEL_FONT_SIZE = 24;
export const UI_TRANSFORM_TOOL_LABEL_TEXT = 'T';
export const UI_SYMMETRY_TOOL_LABEL_FONT_SIZE = 24;
export const UI_SYMMETRY_TOOL_LABEL_TEXT = 'S';
export const DISPLAY_ICON_SIZE = 40;
export const DISPLAY_ICON_PADDING = 15;
export const UI_DISPLAY_ICON_BAR_WIDTH_PADDING = 12;
export const UI_DISPLAY_ICON_Y_OFFSET = 10;
export const UI_DISPLAY_ICON_Y_SPACING = 10;
export const UI_DISPLAY_ICON_KNOB_RADIUS = 3;
export const UI_SWATCH_SELECTED_BORDER_WIDTH = 3;
export const UI_BUTTON_BORDER_WIDTH = 2;
export const UI_BUTTON_ICON_PADDING = 7;
export const UI_GHOST_ICON_SIZE = 30;
export const COLOR_PALETTE_Y_OFFSET = 5;
export const COLOR_WHEEL_FADE_START_RADIUS_FACTOR = 0.75;
export const DEFAULT_RECENT_COLORS = ['#ffffff', '#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff', '#ffa544']

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
export const REF_ARC_RADIUS_SCREEN = 35;
export const SNAP_ANGLE_LABEL_OFFSET = 60;
export const TRANSFORM_ANGLE_LABEL_OFFSET = 20;
export const TRANSFORM_SCALE_LABEL_OFFSET = 18;
export const SCIENTIFIC_NOTATION_UPPER_BOUND = 1000;
export const SCIENTIFIC_NOTATION_LOWER_BOUND = 0.001;
export const MAX_DECIMAL_PLACES_FORMAT = 10;
export const ZERO_TOLERANCE = 0.00001;
export const FRACTION_FORMAT_TOLERANCE = 0.015;
export const FRACTION_FORMAT_MAX_DENOMINATOR = 32;
export const FRACTION_FORMAT_MAX_DENOMINATOR_TRANSFORM = 10;
export const COORD_PRECISION_FACTOR = 0.999;
export const MAX_COORD_DECIMAL_PLACES = 6;
export const MAX_ANGLE_DECIMAL_PLACES = 4;
export const MOUSE_COORD_FONT_SIZE = 14;
export const KATEX_MINUS_PHANTOM = '\\hphantom{-}';
export const PI_SYMBOL_KATEX = '\\pi';
export const DELTA_SYMBOL_KATEX = '\\delta';
export const DELTA_EQUALS_KATEX = '\\delta = ';
export const THETA_EQUALS_KATEX = '\\theta = ';
export const SELECTION_GLOW_BLUR_RADIUS = 15;
export const SELECTION_GLOW_ALPHA = 0.8;
export const SELECTION_GLOW_RADIUS_OFFSET = 3;
export const SELECTION_GLOW_LINE_WIDTH = 2;
export const EDGE_SELECTION_GLOW_WIDTH_OFFSET = 4;
export const MAX_POINTS_FOR_ANGLES = 1;
export const MAX_EDGES_FOR_LABELS = 3;

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
export const FLOATING_POINT_PRECISION_LIMIT = 1e-15;
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

export const MERGE_RADIUS_SCREEN = 5;

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

// --- ENUMS & LITERALS ---
export const POINT_TYPE_REGULAR = 'regular';
export const TRANSFORMATION_TYPE_ROTATION = ' transformation_rotation';
export const TRANSFORMATION_TYPE_SCALE = ' transformation_scale';
export const TRANSFORMATION_TYPE_DIRECTIONAL_SCALE = 'transformation_directional_scale';
export const COORDS_DISPLAY_MODE_NONE = 'none';
export const COORDS_DISPLAY_MODE_REGULAR = 'regular';
export const COORDS_DISPLAY_MODE_COMPLEX = 'complex';
export const COORDS_DISPLAY_MODE_POLAR = 'polar';
export const GRID_DISPLAY_MODE_NONE = 'none';
export const GRID_DISPLAY_MODE_LINES = 'lines';
export const GRID_DISPLAY_MODE_POINTS = 'points';
export const GRID_DISPLAY_MODE_TRIANGULAR = 'triangular';
export const GRID_DISPLAY_MODE_POLAR = 'polar';
export const ANGLE_DISPLAY_MODE_DEGREES = 'degrees';
export const ANGLE_DISPLAY_MODE_RADIANS = 'radians';
export const ANGLE_DISPLAY_MODE_NONE = 'none';
export const DISTANCE_DISPLAY_MODE_ON = 'on';
export const DISTANCE_DISPLAY_MODE_NONE = 'none';
export const KEY_SPACE = ' ';
export const KEY_ESCAPE = 'Escape';
export const KEY_DELETE = 'Delete';
export const KEY_BACKSPACE = 'Backspace';
export const KEY_REPEAT = 'r';
export const KEY_ZOOM_IN = '=';
export const KEY_ZOOM_IN_PLUS = '+';
export const KEY_ZOOM_OUT = '-';
export const KEY_COPY = 'c';
export const KEY_PASTE = 'v';
export const KEY_CUT = 'x';
export const KEY_UNDO = 'z';
export const KEY_REDO = 'y';
export const KEY_SELECT_ALL = 'a';

