const MOVE_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 500;
const SECOND_FINGER_TAP_MAX_MS = 300;
const SECOND_FINGER_MOVE_THRESHOLD_PX = 8;

function getTouchCenter(touchA, touchB) {
    return {
        x: (touchA.clientX + touchB.clientX) / 2,
        y: (touchA.clientY + touchB.clientY) / 2
    };
}

function getTouchDistance(touchA, touchB) {
    const dx = touchA.clientX - touchB.clientX;
    const dy = touchA.clientY - touchB.clientY;
    return Math.hypot(dx, dy);
}

function createMouseLikeEvent(canvas, touch, button, baseEvent, modifiers) {
    const { shiftKey, ctrlKey, altKey, metaKey } = modifiers || {};
    return {
        button,
        clientX: touch.clientX,
        clientY: touch.clientY,
        shiftKey: Boolean(shiftKey),
        ctrlKey: Boolean(ctrlKey),
        metaKey: Boolean(metaKey),
        altKey: Boolean(altKey),
        target: canvas,
        preventDefault: () => baseEvent.preventDefault(),
        stopPropagation: () => baseEvent.stopPropagation()
    };
}

export function setupMobileInput({
    canvas,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onPinchZoom,
    onPan,
    getModifiers,
    isHoverMode,
    getHoverTarget,
    getUiTargetAt
}) {
    let activeTouchId = null;
    let lastSinglePos = null;
    let longPressTimer = null;
    let longPressFired = false;
    let isPinching = false;
    let lastPinchDistance = 0;
    let lastPinchCenter = null;
    let hoverPoint = null;
    let hoveringOnly = false;
    let pendingSecondFingerClick = false;
    let secondFingerStart = null;
    let secondFingerStartTime = 0;

    const resolveModifiers = () => (typeof getModifiers === 'function' ? getModifiers() : {});
    const hoverEnabled = () => (typeof isHoverMode === 'function' ? isHoverMode() : false);
    const getCurrentHoverTarget = () => (typeof getHoverTarget === 'function' ? getHoverTarget() : null);
    const getUiTarget = (point) => (typeof getUiTargetAt === 'function' ? getUiTargetAt(point) : null);

    const clearLongPress = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressFired = false;
    };

    const startLongPressTimer = (touch, baseEvent) => {
        clearLongPress();
        longPressTimer = setTimeout(() => {
            longPressFired = true;
            const rightDown = createMouseLikeEvent(canvas, touch, 2, baseEvent, resolveModifiers());
            onMouseDown(rightDown);
        }, LONG_PRESS_MS);
    };

    const handleTouchStart = (event) => {
        if (!event.touches || event.touches.length === 0) return;
        event.preventDefault();

        if (event.touches.length === 1) {
            const touch = event.touches[0];
            activeTouchId = touch.identifier;
            lastSinglePos = { x: touch.clientX, y: touch.clientY };
            hoverPoint = { x: touch.clientX, y: touch.clientY };
            isPinching = false;
            lastPinchDistance = 0;
            lastPinchCenter = null;
            hoveringOnly = false;
            pendingSecondFingerClick = false;
            secondFingerStart = null;

            if (!hoverEnabled()) {
                startLongPressTimer(touch, event);
                const downEvent = createMouseLikeEvent(canvas, touch, 0, event, resolveModifiers());
                onMouseDown(downEvent);
            } else {
                const moveEvent = createMouseLikeEvent(canvas, touch, 0, event, resolveModifiers());
                onMouseMove(moveEvent);
                const uiTarget = getUiTarget({ x: touch.clientX, y: touch.clientY });
                const hoverTarget = getCurrentHoverTarget();
                if (uiTarget || (hoverTarget && hoverTarget.type && hoverTarget.type !== 'canvas')) {
                    const downEvent = createMouseLikeEvent(canvas, touch, 0, event, resolveModifiers());
                    onMouseDown(downEvent);
                } else {
                    hoveringOnly = true;
                }
            }
            return;
        }

        if (event.touches.length === 2) {
            clearLongPress();
            pendingSecondFingerClick = hoverEnabled() && hoveringOnly && Boolean(hoverPoint);
            secondFingerStartTime = Date.now();
            secondFingerStart = getTouchCenter(event.touches[0], event.touches[1]);

            if (activeTouchId !== null && lastSinglePos) {
                const touch = event.touches[0];
                const upEvent = createMouseLikeEvent(canvas, touch, 0, event, resolveModifiers());
                onMouseUp(upEvent);
            }

            isPinching = true;
            activeTouchId = null;
            const [touchA, touchB] = event.touches;
            lastPinchDistance = getTouchDistance(touchA, touchB);
            lastPinchCenter = getTouchCenter(touchA, touchB);
        }
    };

    const handleTouchMove = (event) => {
        if (!event.touches || event.touches.length === 0) return;
        event.preventDefault();

        if (isPinching && event.touches.length >= 2) {
            const [touchA, touchB] = event.touches;
            const distance = getTouchDistance(touchA, touchB);
            const center = getTouchCenter(touchA, touchB);

            if (pendingSecondFingerClick && secondFingerStart) {
                const moveDist = Math.hypot(center.x - secondFingerStart.x, center.y - secondFingerStart.y);
                const distanceDelta = Math.abs(distance - lastPinchDistance);
                if (moveDist > SECOND_FINGER_MOVE_THRESHOLD_PX || distanceDelta > SECOND_FINGER_MOVE_THRESHOLD_PX) {
                    pendingSecondFingerClick = false;
                }
            }

            if (!pendingSecondFingerClick) {
            if (lastPinchDistance > 0) {
                const scaleFactor = distance / lastPinchDistance;
                if (Number.isFinite(scaleFactor) && scaleFactor !== 1) {
                    onPinchZoom(scaleFactor, center);
                }
            }

            if (lastPinchCenter) {
                const deltaX = center.x - lastPinchCenter.x;
                const deltaY = center.y - lastPinchCenter.y;
                if (deltaX !== 0 || deltaY !== 0) {
                    onPan({ x: deltaX, y: deltaY });
                }
            }
            }

            lastPinchDistance = distance;
            lastPinchCenter = center;
            return;
        }

        if (event.touches.length === 1 && activeTouchId !== null) {
            const touch = event.touches[0];
            const dx = touch.clientX - (lastSinglePos?.x ?? touch.clientX);
            const dy = touch.clientY - (lastSinglePos?.y ?? touch.clientY);
            if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
                clearLongPress();
            }
            lastSinglePos = { x: touch.clientX, y: touch.clientY };
            hoverPoint = { x: touch.clientX, y: touch.clientY };

            const moveEvent = createMouseLikeEvent(canvas, touch, 0, event, resolveModifiers());
            onMouseMove(moveEvent);
        }
    };

    const handleTouchEnd = (event) => {
        event.preventDefault();

        if (isPinching) {
            if (event.touches.length < 2) {
                isPinching = false;
                lastPinchDistance = 0;
                lastPinchCenter = null;
            }
        }

        if (pendingSecondFingerClick && hoverPoint) {
            const elapsed = Date.now() - secondFingerStartTime;
            if (elapsed <= SECOND_FINGER_TAP_MAX_MS) {
                const hoverTouch = { clientX: hoverPoint.x, clientY: hoverPoint.y };
                const downEvent = createMouseLikeEvent(canvas, hoverTouch, 0, event, resolveModifiers());
                const upEvent = createMouseLikeEvent(canvas, hoverTouch, 0, event, resolveModifiers());
                onMouseDown(downEvent);
                onMouseUp(upEvent);
            }
        } else if (activeTouchId !== null && !hoverEnabled()) {
            const endedTouch = Array.from(event.changedTouches).find(t => t.identifier === activeTouchId) || event.changedTouches[0];
            if (endedTouch) {
                if (longPressFired) {
                    const rightUp = createMouseLikeEvent(canvas, endedTouch, 2, event, resolveModifiers());
                    onMouseUp(rightUp);
                } else {
                    const upEvent = createMouseLikeEvent(canvas, endedTouch, 0, event, resolveModifiers());
                    onMouseUp(upEvent);
                }
            }
        }

        clearLongPress();
        pendingSecondFingerClick = false;
        secondFingerStart = null;
        activeTouchId = event.touches.length === 1 ? event.touches[0].identifier : null;
        if (event.touches.length === 0) {
            lastSinglePos = null;
            hoverPoint = null;
        }
    };

    canvas.style.touchAction = 'none';
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
        clearLongPress();
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
}
