/**
 * Kinetic Smooth Scroll & Velocity Engine.
 * Provides frame-rate-independent wheel/anchor inertia on desktop while staying
 * synchronized with native scrollbar, keyboard, and touch momentum scrolling.
 */
(function (global) {
    'use strict';

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function hasScrollableParent(target, deltaY) {
        let el = target instanceof Element ? target : null;
        while (el && el !== document.body && el !== document.documentElement) {
            const style = window.getComputedStyle(el);
            const overflowY = style.overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                const atTop = el.scrollTop <= 0 && deltaY < 0;
                const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && deltaY > 0;
                if (!atTop && !atBottom) return true;
            }
            el = el.parentElement;
        }
        return false;
    }

    function normalizeWheelDelta(e) {
        if (e.deltaMode === 1) return e.deltaY * 32;
        if (e.deltaMode === 2) return e.deltaY * window.innerHeight * 0.85;
        return e.deltaY;
    }

    /**
     * Initialize kinetic scrolling and velocity tracking.
     * @param {{ onScroll?: (state: { y: number, velocity: number, maxScroll: number }) => void, isLocked?: () => boolean }} options
     */
    function initKineticScroll(options = {}) {
        const onScroll = typeof options.onScroll === 'function' ? options.onScroll : () => {};
        const isLocked = typeof options.isLocked === 'function' ? options.isLocked : () => false;

        const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let reducedMotion = reducedMotionQuery.matches;

        let currentY = window.scrollY || 0;
        let targetY = currentY;
        let lastAppliedY = currentY;
        let smoothV = 0;
        let nativeSampleV = 0;
        let lastNativeTime = performance.now();
        let lastNativeY = currentY;
        let rafId = null;
        let lastFrameTime = performance.now();
        let isProgrammaticStep = false;

        function getMaxScroll() {
            return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        }

        function updateRootClass() {
            document.documentElement.classList.toggle('kinetic-active', !reducedMotion);
        }
        updateRootClass();

        function emit() {
            onScroll({
                y: currentY,
                velocity: reducedMotion ? 0 : smoothV,
                maxScroll: getMaxScroll()
            });
        }

        function tick(now) {
            const dt = clamp((now - lastFrameTime) / 1000, 0.001, 0.05);
            lastFrameTime = now;

            const maxScroll = getMaxScroll();
            targetY = clamp(targetY, 0, maxScroll);
            const diff = targetY - currentY;

            if (!reducedMotion && Math.abs(diff) > 0.35) {
                const ease = 1 - Math.exp(-10.5 * dt);
                const nextY = currentY + diff * ease;
                const instVel = (nextY - currentY) / dt;
                currentY = nextY;

                isProgrammaticStep = true;
                lastAppliedY = currentY;
                window.scrollTo(0, currentY);
                isProgrammaticStep = false;

                const normV = clamp(instVel / 2200, -1, 1);
                smoothV += (normV - smoothV) * (1 - Math.exp(-14 * dt));
            } else {
                if (Math.abs(diff) > 0.01 && Math.abs(diff) <= 0.35) {
                    currentY = targetY;
                    isProgrammaticStep = true;
                    lastAppliedY = currentY;
                    window.scrollTo(0, currentY);
                    isProgrammaticStep = false;
                }
                const targetVel = nativeSampleV;
                nativeSampleV *= Math.exp(-12 * dt);
                smoothV += (targetVel - smoothV) * (1 - Math.exp(-12 * dt));
            }

            emit();

            if (!reducedMotion && (Math.abs(targetY - currentY) > 0.35 || Math.abs(smoothV) > 0.002)) {
                rafId = requestAnimationFrame(tick);
            } else {
                rafId = null;
                smoothV = 0;
                nativeSampleV = 0;
                currentY = window.scrollY || currentY;
                targetY = currentY;
                emit();
            }
        }

        function startLoop() {
            if (!rafId) {
                lastFrameTime = performance.now();
                rafId = requestAnimationFrame(tick);
            }
        }

        function onWheel(e) {
            if (reducedMotion || e.ctrlKey || e.metaKey || isLocked()) return;
            if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // Preserve horizontal trackpad gestures
            if (hasScrollableParent(e.target, e.deltaY)) return;

            e.preventDefault();
            const delta = normalizeWheelDelta(e);
            targetY = clamp(targetY + delta, 0, getMaxScroll());
            startLoop();
        }

        function onNativeScroll() {
            const actualY = window.scrollY || 0;
            if (isProgrammaticStep || (rafId && Math.abs(actualY - lastAppliedY) <= 2.5)) {
                return;
            }

            // Native scroll (touch flick, scrollbar drag, keyboard, find-in-page)
            const now = performance.now();
            const dt = clamp((now - lastNativeTime) / 1000, 0.004, 0.1);
            const rawV = (actualY - lastNativeY) / dt;
            lastNativeTime = now;
            lastNativeY = actualY;

            currentY = actualY;
            targetY = actualY;
            lastAppliedY = actualY;

            if (!reducedMotion) {
                nativeSampleV = clamp(rawV / 2200, -1, 1);
                smoothV += (nativeSampleV - smoothV) * 0.45;
                startLoop();
            } else {
                emit();
            }
        }

        function onResize() {
            const maxScroll = getMaxScroll();
            currentY = clamp(window.scrollY || currentY, 0, maxScroll);
            targetY = clamp(targetY, 0, maxScroll);
            emit();
        }

        const onReducedMotionChange = (e) => {
            reducedMotion = e.matches;
            updateRootClass();
            if (reducedMotion && rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            smoothV = 0;
            nativeSampleV = 0;
            currentY = window.scrollY || 0;
            targetY = currentY;
            emit();
        };

        window.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('scroll', onNativeScroll, { passive: true });
        window.addEventListener('resize', onResize, { passive: true });
        reducedMotionQuery.addEventListener?.('change', onReducedMotionChange);

        // Emit initial state on boot
        emit();

        return {
            scrollTo(y) {
                const dest = clamp(y, 0, getMaxScroll());
                if (reducedMotion) {
                    currentY = dest;
                    targetY = dest;
                    window.scrollTo(0, dest);
                    emit();
                    return;
                }
                currentY = window.scrollY || currentY;
                targetY = dest;
                startLoop();
            },
            sync() {
                currentY = window.scrollY || 0;
                targetY = currentY;
                lastAppliedY = currentY;
                emit();
            },
            getState() {
                return { y: currentY, velocity: smoothV, maxScroll: getMaxScroll() };
            },
            destroy() {
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('wheel', onWheel);
                window.removeEventListener('scroll', onNativeScroll);
                window.removeEventListener('resize', onResize);
                reducedMotionQuery.removeEventListener?.('change', onReducedMotionChange);
                document.documentElement.classList.remove('kinetic-active');
            }
        };
    }

    global.initKineticScroll = initKineticScroll;
})(window);

