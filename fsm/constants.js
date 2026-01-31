export const CLICK_WINDOW_MS = 300;
export const TOUCH_HOLD_MS = 500;
export const ZOOM_FACTOR = 1.1;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 5.0;

export const MODES = {
    IDLE: 'idle',
    DRAWING: 'drawing',
    DRAGGING: 'dragging',
    SELECTING: 'selecting',
    TYPING: 'typing',
};

export const ENTITY_TYPES = {
    VERTEX: 'vertex',
    EDGE: 'edge',
    FACE: 'face',
    TEXT: 'text',
    TRANSFORMATION_OBJECT: 'transformationObject',
    MANIFOLD: 'manifold',
    UI: 'ui',
    CANVAS: 'canvas',
};

export const SELECTION_KEYS = {
    [ENTITY_TYPES.VERTEX]: 'vertices',
    [ENTITY_TYPES.EDGE]: 'edges',
    [ENTITY_TYPES.FACE]: 'faces',
    [ENTITY_TYPES.TEXT]: 'text',
    [ENTITY_TYPES.TRANSFORMATION_OBJECT]: 'transformationObjects',
    [ENTITY_TYPES.MANIFOLD]: 'manifolds',
    [ENTITY_TYPES.UI]: 'ui',
};

export const DRAG_TYPES = {
    PANNING: 'panning',
    MARQUEE_SELECT: 'marqueeSelect',
    RIGID_DRAG: 'rigidDrag',
    PARTIAL_DRAG: 'partialDrag',
};
