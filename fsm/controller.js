import { handleEvent } from './transitions.js';
import { ENTITY_TYPES } from './constants.js';

export class FSMController {
    constructor(state, graph, text, elements, renderCallback) {
        this.state = state;
        this.graph = graph;
        this.text = text;
        this.elements = elements;
        this.render = renderCallback;
        this.dispatch = this.dispatch.bind(this);
    }

    dispatch(eventName, payload) {
        handleEvent(this.state, this.graph, this.text, eventName, payload);
        if (typeof this.render === 'function') {
            this.render(this.state);
        } else {
            console.error("Render callback is not a function:", this.render);
        }
    }

    attach() {
        const { canvas, appModeButtons, modifierButtons, allEntities } = this.elements;

        if (!canvas || !appModeButtons || !modifierButtons || !allEntities) {
            console.error("One or more essential elements not found for attaching listeners.");
            return;
        }

        window.addEventListener('keydown', (e) => this.dispatch('keyDown', e));
        window.addEventListener('keyup', (e) => this.dispatch('keyUp', e));

        appModeButtons.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                this.dispatch('appModeChange', { mode: e.target.dataset.mode });
            }
        });
        
        // Listener for the modifier buttons (Ctrl, Shift, Alt)
        modifierButtons.addEventListener('click', (e) => {
            const button = e.target;
            if (button.tagName === 'BUTTON') {
                const mod = button.dataset.mod;
                const key = mod === 'ctrl' ? 'Control' : mod.charAt(0).toUpperCase() + mod.slice(1);
                
                if (button.classList.contains('active')) {
                    // Deactivate: Simulate keyUp
                    button.classList.remove('active');
                    this.dispatch('keyUp', { key: key });
                } else {
                    // Activate: Simulate keyDown
                    button.classList.add('active');
                    this.dispatch('keyDown', { key: key, ctrlKey: mod === 'ctrl', shiftKey: mod === 'shift', altKey: mod === 'alt' });
                }
            }
        });

        allEntities.forEach(el => {
            el.addEventListener('mouseenter', (e) => {
                this.dispatch('hoverStart', { type: el.dataset.type, id: el.dataset.id });
            });
            el.addEventListener('mouseleave', (e) => {
                this.dispatch('hoverEnd', { id: el.dataset.id });
            });
            el.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    e.stopPropagation();
                }
                this.dispatch('entityMouseDown', { 
                    type: el.dataset.type, 
                    id: el.dataset.id, 
                    button: e.button 
                });
            });
            el.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                this.dispatch('touchStart', { 
                    type: el.dataset.type, 
                    id: el.dataset.id,
                    event: e
                });
            });
        });

        canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.dispatch('mouseDown', e);
        });

        canvas.addEventListener('mousemove', (e) => {
            this.dispatch('mouseMove', e);
        });

        canvas.addEventListener('mouseup', (e) => {
            this.dispatch('mouseUp', e);
        });
        
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.dispatch('wheel', e);
        });
        
        canvas.addEventListener('touchstart', (e) => {
            this.dispatch('touchStart', { type: ENTITY_TYPES.CANVAS, id: null, event: e });
        });
        window.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.dispatch('touchMove', e);
        }, { passive: false });
        window.addEventListener('touchend', (e) => {
            this.dispatch('touchEnd', e);
        });
        window.addEventListener('touchcancel', (e) => {
            this.dispatch('touchEnd', e);
        });
        
        window.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                this.dispatch('rightMouseDown', e);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                this.dispatch('rightMouseUp', e);
            }
        });
        
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
}
