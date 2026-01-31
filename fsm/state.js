export class State {
    constructor() {
        this.appMode = 'static';
        this.mode = 'idle';
        this.dragAction = null;
        this.selection = {
            transformationObjects: new Set(),
            vertices: new Set(),
            edges: new Set(),
            faces: new Set(),
            text: new Set(),
            ui: new Set()
        };
        this.hoverTarget = {
            type: 'canvas',
            id: null
        };
        this.modifiers = {
            shift: false,
            ctrl: false,
            alt: false
        };
        this.marqueeRect = {
            active: false,
            startX: 0,
            startY: 0,
            endX: 0,
            endY: 0
        };
        this.lastClickTime = 0;
        this.lastClickTarget = { type: null, id: null };
        this.clickCount = 0;
        this.selectionBeforeClick = null;
        this.zoomLevel = 1.0;
        this.activeTransformationObjectId = null;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.textInput = {
            active: false,
            x: 0,
            y: 0,
            value: ''
        };
        this.touchTimerId = null;
        this.initialTouchData = null;
    }

    clearGeometricSelection() {
        this.selection.vertices.clear();
        this.selection.edges.clear();
        this.selection.faces.clear();
        this.selection.text.clear();
    }
    
    clearTransformationObjectSelection() {
        this.selection.transformationObjects.clear();
        this.activeTransformationObjectId = null;
    }

    clearSelection() {
        this.clearGeometricSelection();
        this.clearTransformationObjectSelection();
        this.selection.ui.clear();
    }
}

export const applicationState = new State();
