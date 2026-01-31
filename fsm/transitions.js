import {
    CLICK_WINDOW_MS, TOUCH_HOLD_MS, ZOOM_FACTOR, MIN_ZOOM, MAX_ZOOM,
    MODES, ENTITY_TYPES, SELECTION_KEYS, DRAG_TYPES
} from './constants.js';

function applySelection(state, type, ids) {
    if (type === ENTITY_TYPES.UI) {
        return;
    }

    const selectionKey = SELECTION_KEYS[type];

    if (!selectionKey) {
        console.warn(`No selection key for type: ${type}`);
        return;
    }
    const selectionSet = state.selection[selectionKey];

    if (!selectionSet) {
        console.warn(`No selection set for type: ${type} (key: ${selectionKey})`);
        return;
    }

    const ctrlOnly = state.modifiers.ctrl && !state.modifiers.shift;

    ids.forEach(id => {
        if (ctrlOnly) {
            if (selectionSet.has(id)) {
                selectionSet.delete(id);
            } else {
                selectionSet.add(id);
            }
        } else {
            selectionSet.add(id);
        }
    });
}

function applyMarqueeSelection(state, graph, payload) {
    const { originalSelection } = state.dragAction;
    if (!originalSelection) return;

    const ctrlHeld = payload && payload.ctrlKey;
    const shiftHeld = payload && payload.shiftKey;

    const { startX, startY, endX, endY } = state.marqueeRect;
    const rect = {
        minX: Math.min(startX, endX),
        maxX: Math.max(startX, endX),
        minY: Math.min(startY, endY),
        maxY: Math.max(startY, endY)
    };
    const entitiesInRect = graph.getEntitiesInRect(rect);

    const originalVertices = new Set(originalSelection.vertices);
    const originalEdges = new Set(originalSelection.edges);
    const originalFaces = new Set(originalSelection.faces);
    const originalText = new Set(originalSelection.text);
    const originalTransforms = new Set(originalSelection.transformationObjects);
    
    const originalGeoMap = {
        [SELECTION_KEYS[ENTITY_TYPES.VERTEX]]: originalVertices,
        [SELECTION_KEYS[ENTITY_TYPES.EDGE]]: originalEdges,
        [SELECTION_KEYS[ENTITY_TYPES.FACE]]: originalFaces,
        [SELECTION_KEYS[ENTITY_TYPES.TEXT]]: originalText,
        [SELECTION_KEYS[ENTITY_TYPES.TRANSFORMATION_OBJECT]]: originalTransforms,
    };

    const ctrlOnly = ctrlHeld && !shiftHeld;
    const shiftOnly = shiftHeld && !ctrlHeld;
    const ctrlAndShift = ctrlHeld && shiftHeld;
    const noModifiers = !ctrlHeld && !shiftHeld;

    if (noModifiers) {
        state.clearGeometricSelection();
    } else {
        state.selection.vertices = new Set(originalSelection.vertices);
        state.selection.edges = new Set(originalSelection.edges);
        state.selection.faces = new Set(originalSelection.faces);
        state.selection.text = new Set(originalSelection.text);
        state.selection.transformationObjects = new Set(originalSelection.transformationObjects);
    }

    if (entitiesInRect.length > 0) {
        entitiesInRect.forEach(entity => {
            const selectionKey = SELECTION_KEYS[entity.type];
            if (!selectionKey || !state.selection[selectionKey]) return;

            const selectionSet = state.selection[selectionKey];
            const originalSetForType = originalGeoMap[selectionKey];
            const wasOriginallySelected = originalSetForType?.has(entity.id);

            if (ctrlOnly) {
                if (wasOriginallySelected) {
                    selectionSet.delete(entity.id);
                } else {
                    selectionSet.add(entity.id);
                }
            } else {
                selectionSet.add(entity.id);
            }
        });
    }
}

function onKeyDown(state, graph, text, payload) {
    if (state.mode === MODES.TYPING) {
        payload.preventDefault();
        if (payload.key === 'Enter' || payload.key === 'Escape') {
            text.stopTyping(state);
            state.mode = MODES.IDLE;
        } else if (payload.key === 'Backspace') {
            text.backspace(state);
        } else if (payload.key.length === 1) {
            text.updateText(state, payload.key);
        }
        return;
    }

    if (payload.key === 'Shift') state.modifiers.shift = true;
    if (payload.key === 'Control') state.modifiers.ctrl = true;
    if (payload.key === 'Alt') state.modifiers.alt = true;

    if (state.modifiers.ctrl && (payload.key === 'a' || payload.key === 'A')) {
        payload.preventDefault();
        state.clearGeometricSelection();

        document.querySelectorAll('.proxy-entity').forEach(el => {
            const type = el.dataset.type;
            const id = el.dataset.id;
            const selectionKey = SELECTION_KEYS[type];

            if (selectionKey && type !== ENTITY_TYPES.TRANSFORMATION_OBJECT && type !== ENTITY_TYPES.UI) {
                const selectionSet = state.selection[selectionKey];
                if (selectionSet) {
                    selectionSet.add(id);
                }
            }
        });

        state.clickCount = 0;
        state.selectionBeforeClick = null;
        return;
    }

    if (payload.key === 'Escape' || payload.key === 'Esc') {
        state.mode = MODES.IDLE;
        state.dragAction = null;
        state.clearSelection();
        state.activeTransformationObjectId = null;
        state.marqueeRect.active = false;
        state.clickCount = 0;
        state.selectionBeforeClick = null;
    }

    if (payload.key.length === 1 && !payload.ctrlKey && !payload.metaKey && (state.mode === MODES.IDLE || state.mode === MODES.DRAWING)) {
        payload.preventDefault();
        state.mode = MODES.TYPING;
        text.startTyping(state);
        text.updateText(state, payload.key);
    }
}

function onKeyUp(state, graph, text, payload) {
    if (payload.key === 'Shift') state.modifiers.shift = false;
    if (payload.key === 'Control') state.modifiers.ctrl = false;
    if (payload.key === 'Alt') state.modifiers.alt = false;
}

function onWheel(state, graph, text, payload) {
    let newZoom = state.zoomLevel;

    if (payload.deltaY < 0) {
        newZoom *= ZOOM_FACTOR;
    } else if (payload.deltaY > 0) {
        newZoom /= ZOOM_FACTOR;
    }

    if (newZoom < MIN_ZOOM) newZoom = MIN_ZOOM;
    if (newZoom > MAX_ZOOM) newZoom = MAX_ZOOM;

    state.zoomLevel = newZoom;
}

function onHoverStart(state, graph, text, payload) {
    state.hoverTarget = { type: payload.type, id: payload.id };
}

function onHoverEnd(state, graph, text, payload) {
    if (state.hoverTarget.id === payload.id) {
        state.hoverTarget = { type: ENTITY_TYPES.CANVAS, id: null };
    }
}

function onAppModeChange(state, graph, text, payload) {
    state.appMode = payload.mode;
}

function onMouseDown(state, graph, text, payload) {
    if (state.mode === MODES.TYPING) {
        text.stopTyping(state);
        state.mode = MODES.IDLE;
    }

    if (payload.button === 0) {
        if (state.hoverTarget.type === ENTITY_TYPES.CANVAS) {
            state.clickCount = 0;
            state.selectionBeforeClick = null;
            state.dragAction = {
                hasMoved: false,
                button: 0
            };
        }
    }
}

function deepCopySelection(selection) {
    if (!selection) {
        return {
            transformationObjects: new Set(),
            vertices: new Set(),
            edges: new Set(),
            faces: new Set(),
            text: new Set(),
            ui: new Set()
        };
    }
    return {
        transformationObjects: new Set(selection.transformationObjects),
        vertices: new Set(selection.vertices),
        edges: new Set(selection.edges),
        faces: new Set(selection.faces),
        text: new Set(selection.text),
        ui: new Set(selection.ui)
    };
}

function onEntityMouseDown(state, graph, text, payload) {
    if (state.mode === MODES.TYPING) {
        text.stopTyping(state);
        state.mode = MODES.IDLE;
    }

    if (payload.button === 0) {
        if (state.modifiers.alt) {
            state.mode = MODES.DRAWING;
            state.clickCount = 0;
            state.selectionBeforeClick = null;
            return;
        }

        const now = Date.now();
        const { type, id } = payload;

        const selectionKey = SELECTION_KEYS[type];
        if (!selectionKey) {
             console.warn(`Unknown entity type for selection: ${type}`);
             return;
        }
        const selectionSet = state.selection[selectionKey];
        const isAlreadySelected = selectionSet && selectionSet.has(id);
        const isGeometric = type === ENTITY_TYPES.VERTEX || type === ENTITY_TYPES.EDGE || type === ENTITY_TYPES.FACE || type === ENTITY_TYPES.TEXT;
        const isTransform = type === ENTITY_TYPES.TRANSFORMATION_OBJECT;

        if (state.lastClickTarget.id === id && (now - state.lastClickTime < CLICK_WINDOW_MS)) {
            state.clickCount++;
        } else {
            state.clickCount = 1;
            state.selectionBeforeClick = deepCopySelection(state.selection);
        }
        state.lastClickTime = now;
        state.lastClickTarget = { type: type, id: id };

        if (type === ENTITY_TYPES.UI) {
            state.clickCount = 0;
            state.selectionBeforeClick = null;
            return;
        }

        if (state.clickCount === 1) {
            const hasModifier = state.modifiers.ctrl || state.modifiers.shift;

            if (hasModifier) {
                applySelection(state, type, [id]);
            } else {
                if (!isAlreadySelected) {
                    if (isGeometric) {
                        state.clearGeometricSelection();
                    } else if (isTransform) {
                        state.clearTransformationObjectSelection();
                    }
                    applySelection(state, type, [id]);
                }
            }
        } else {
            state.selection = deepCopySelection(state.selectionBeforeClick);
            
            if (isGeometric) {
                if (state.clickCount === 2) {
                    const neighborIDs = graph.getNeighbors(id);
                    const neighborsByType = {};
                    neighborIDs.forEach(neighborId => {
                        const neighborType = graph.getEntityType(neighborId);
                        if (!neighborType || neighborType === ENTITY_TYPES.UI) return;
                        if (!neighborsByType[neighborType]) {
                            neighborsByType[neighborType] = [];
                        }
                        neighborsByType[neighborType].push(neighborId);
                    });

                    for (const neighborType in neighborsByType) {
                        applySelection(state, neighborType, neighborsByType[neighborType]);
                    }
                    applySelection(state, type, [id]);
                    
                } else { 
                    const allConnectedIDs = graph.getAllConnected(id);
                    const targets = [];
                    allConnectedIDs.forEach(connectedId => {
                        if (graph.getEntityType(connectedId) === type) {
                            targets.push(connectedId);
                        }
                    });
                    applySelection(state, type, targets);
                }
            } else if (isTransform) {
                applySelection(state, type, [id]);
            }
        }

        if (isTransform) {
             const currentSet = state.selection.transformationObjects;
             if (currentSet.has(id)) {
                 state.activeTransformationObjectId = id;
             } else if (state.activeTransformationObjectId === id) {
                 state.activeTransformationObjectId = currentSet.size > 0 ? Array.from(currentSet)[currentSet.size - 1] : null;
             }
        }

        if (state.clickCount >= 3) {
            state.clickCount = 0;
            state.selectionBeforeClick = null;
        }

        state.dragAction = {
            hasMoved: false,
            button: 0,
            draggedEntityType: type,
            draggedEntityId: id,
            wasAlreadySelected: isAlreadySelected
        };
    }
}

function onMouseMove(state, graph, text, payload) {
    state.lastMouseX = payload.clientX;
    state.lastMouseY = payload.clientY;

    if (state.mode === MODES.TYPING) {
        state.textInput.x = payload.clientX;
        state.textInput.y = payload.clientY;
    }

    if (!state.dragAction) return;

    if (!state.dragAction.hasMoved) {
        state.dragAction.hasMoved = true;

        if (state.clickCount > 0 && state.selectionBeforeClick) {
            state.selection = deepCopySelection(state.selectionBeforeClick);
        }
        state.clickCount = 0;
        state.selectionBeforeClick = null;

        if (state.dragAction.button === 0) { 
            if (state.dragAction.draggedEntityType) { 
                const dragType = graph.getDragType(state);
                if (dragType) {
                    state.dragAction.type = dragType;
                    state.mode = MODES.DRAGGING;
                } else {
                    state.dragAction.type = DRAG_TYPES.PANNING; 
                }
            } else { 
                state.dragAction.type = DRAG_TYPES.PANNING;
                if (!payload.shiftKey && !payload.ctrlKey) {
                    state.clearGeometricSelection();
                }
            }
        } else if (state.dragAction.button === 2) { 
            state.dragAction.type = DRAG_TYPES.MARQUEE_SELECT;
            state.mode = MODES.SELECTING;
            state.marqueeRect.active = true;
            state.marqueeRect.endX = payload.clientX; 
            state.marqueeRect.endY = payload.clientY;

        }
    }

    if (state.dragAction && state.dragAction.type === DRAG_TYPES.MARQUEE_SELECT) {
        state.marqueeRect.endX = payload.clientX;
        state.marqueeRect.endY = payload.clientY;
        applyMarqueeSelection(state, graph, payload);
    }
}

function onMouseUp(state, graph, text, payload) {
    if (payload.button === 0) {
        if (state.dragAction && state.dragAction.button === 0) {
            if (!state.dragAction.hasMoved) {
                const entityType = state.dragAction.draggedEntityType;
                if (entityType) {
                    const isGeometric = entityType === ENTITY_TYPES.VERTEX || entityType === ENTITY_TYPES.EDGE || entityType === ENTITY_TYPES.FACE || entityType === ENTITY_TYPES.TEXT;
                    const isTransform = entityType === ENTITY_TYPES.TRANSFORMATION_OBJECT;
                    if (state.clickCount === 1 && state.dragAction.wasAlreadySelected && !payload.shiftKey && !payload.ctrlKey) {
                          if (isGeometric) {
                            state.clearGeometricSelection();
                            applySelection(state, entityType, [state.dragAction.draggedEntityId]); 
                          } else if (isTransform) {
                            state.clearTransformationObjectSelection();
                            applySelection(state, entityType, [state.dragAction.draggedEntityId]); 
                            state.activeTransformationObjectId = state.dragAction.draggedEntityId;
                          }
                    }
                } else {
                    if (!payload.shiftKey && !payload.ctrlKey) {
                        state.clearGeometricSelection();
                    }
                    if (state.mode !== MODES.DRAWING) {
                        state.mode = MODES.DRAWING;
                    }
                }
            } else {
                state.mode = MODES.IDLE;
            }
        } else if (!state.dragAction) {
            if (state.hoverTarget.type === ENTITY_TYPES.CANVAS) {
                if (!payload.shiftKey && !payload.ctrlKey) {
                    state.clearGeometricSelection();
                }
                if (state.mode !== MODES.DRAWING) {
                    state.mode = MODES.DRAWING;
                }
            }
        }

        if (state.clickCount > 0 && (!state.dragAction || !state.dragAction.hasMoved)) {
        } else {
            state.clickCount = 0;
            state.selectionBeforeClick = null;
        }

        state.dragAction = null;
    }
}

function onRightMouseDown(state, graph, text, payload) {
    if (state.mode === MODES.TYPING) {
        text.stopTyping(state);
        state.mode = MODES.IDLE;
    }

    state.clickCount = 0;
    state.selectionBeforeClick = null;
    if (state.mode === MODES.IDLE || state.mode === MODES.DRAWING) {
        state.dragAction = {
            hasMoved: false,
            button: 2,
            originalMode: state.mode,
            originalSelection: deepCopySelection(state.selection)
        };

        state.marqueeRect.startX = payload.clientX;
        state.marqueeRect.startY = payload.clientY;
        state.marqueeRect.endX = payload.clientX;
        state.marqueeRect.endY = payload.clientY;
    }
}

function onRightMouseUp(state, graph, text, payload) {
    if (state.dragAction && state.dragAction.button === 2) {
        if (!state.dragAction.hasMoved) {
            if (!payload.shiftKey && !payload.ctrlKey) {
                state.clearSelection();
                state.activeTransformationObjectId = null;
            }
            state.mode = MODES.IDLE;
        } else {
            state.mode = state.dragAction.originalMode;
        }
    } else if (!state.dragAction) {
        state.mode = MODES.IDLE;
    }

    state.dragAction = null;
    state.marqueeRect.active = false;
}

function onTouchStart(state, graph, text, payload) {
    if (state.mode === MODES.TYPING) {
        text.stopTyping(state);
        state.mode = MODES.IDLE;
        return;
    }

    const e = payload.event;
    
    if (e.touches.length === 1) {
        state.lastMouseX = e.touches[0].clientX;
        state.lastMouseY = e.touches[0].clientY;
        
        clearTimeout(state.touchTimerId);
        state.initialTouchData = {
            clientX: e.touches[0].clientX,
            clientY: e.touches[0].clientY,
            targetType: payload.type,
            targetId: payload.id
        };

        state.touchTimerId = setTimeout(() => {
            state.touchTimerId = null;
            
            const targetType = state.initialTouchData.targetType;
            const targetId = state.initialTouchData.targetId;
            
            if (targetType === ENTITY_TYPES.CANVAS) {
                state.dragAction = {
                    hasMoved: false,
                    button: 0
                };
            } else {
                onEntityMouseDown(state, graph, text, {
                    type: targetType,
                    id: targetId,
                    button: 0
                });
            }
            
            state.hoverTarget = { type: ENTITY_TYPES.CANVAS, id: null };

        }, TOUCH_HOLD_MS);
        
        if (payload.type !== ENTITY_TYPES.CANVAS) {
            onHoverStart(state, graph, text, { type: payload.type, id: payload.id });
        }
    } else if (e.touches.length === 2) {
        clearTimeout(state.touchTimerId);
        state.touchTimerId = null;
        state.initialTouchData = null;

        state.dragAction = {
            hasMoved: false,
            button: 0,
            type: DRAG_TYPES.PANNING,
            startDistance: Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            ),
            startCenter: {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            },
            originalMode: state.mode
        };
        state.mode = MODES.DRAGGING;
        
        state.clearGeometricSelection();
    }
}

function onTouchMove(state, graph, text, payload) {
    const touches = payload.touches;
    
    if (touches.length === 1) {
        const x = touches[0].clientX;
        const y = touches[0].clientY;
        
        state.lastMouseX = x;
        state.lastMouseY = y;
        
        if (state.touchTimerId) {
            clearTimeout(state.touchTimerId);
            state.touchTimerId = null;
        }

        if (state.dragAction && state.dragAction.button === 0) {
            onMouseMove(state, graph, text, {
                clientX: x,
                clientY: y,
                shiftKey: state.modifiers.shift,
                ctrlKey: state.modifiers.ctrl
            });
            return;
        }
    } else if (touches.length === 2 && state.dragAction && state.dragAction.type === DRAG_TYPES.PANNING) {
        state.dragAction.hasMoved = true;
        
        const currentDistance = Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
        const currentCenter = {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };

        const zoomRatio = currentDistance / state.dragAction.startDistance;
        const deltaYEquivalent = Math.log(zoomRatio) * 100;

        const deltaX = currentCenter.x - state.dragAction.startCenter.x;
        const deltaY = currentCenter.y - state.dragAction.startCenter.y;

        if (deltaYEquivalent !== 0) {
            onWheel(state, graph, text, { deltaY: -deltaYEquivalent, clientX: currentCenter.x, clientY: currentCenter.y });
        }
        
        state.lastMouseX = currentCenter.x;
        state.lastMouseY = currentCenter.y;
    }
}

function onTouchEnd(state, graph, text, payload) {
    if (state.touchTimerId) {
        clearTimeout(state.touchTimerId);
        state.touchTimerId = null;
        state.initialTouchData = null;
        
        onRightMouseUp(state, graph, text, {
            shiftKey: state.modifiers.shift,
            ctrlKey: state.modifiers.ctrl
        });
        
        if (state.mode === MODES.IDLE && !state.modifiers.shift && !state.modifiers.ctrl) {
            state.clearSelection();
        }

    } else if (state.dragAction && state.dragAction.button === 0) {
        
        onMouseUp(state, graph, text, {
            button: 0,
            shiftKey: state.modifiers.shift,
            ctrlKey: state.modifiers.ctrl
        });
        
    } else {
        state.hoverTarget = { type: ENTITY_TYPES.CANVAS, id: null };
    }
    
    if (state.dragAction && state.dragAction.button === 2) {
        onRightMouseUp(state, graph, text, { button: 2 });
    }
    
    state.dragAction = null;
    state.marqueeRect.active = false;
    
    onHoverEnd(state, graph, text, { id: state.hoverTarget.id });
}

const eventHandlers = {
    'keyDown': onKeyDown,
    'keyUp': onKeyUp,
    'wheel': onWheel,
    'hoverStart': onHoverStart,
    'hoverEnd': onHoverEnd,
    'appModeChange': onAppModeChange,
    'mouseDown': onMouseDown,
    'entityMouseDown': onEntityMouseDown,
    'mouseMove': onMouseMove,
    'mouseUp': onMouseUp,
    'rightMouseDown': onRightMouseDown,
    'rightMouseUp': onRightMouseUp,
    'touchStart': onTouchStart,
    'touchMove': onTouchMove,
    'touchEnd': onTouchEnd
};

export function handleEvent(state, graph, text, eventName, payload) {
    const handler = eventHandlers[eventName];
    if (handler) {
        handler(state, graph, text, payload);
    }
}
