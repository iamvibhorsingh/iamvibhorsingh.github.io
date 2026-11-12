/**
 * Interactive WebGL2 3D Particle Network, Proximity Graph & Shockwave Field.
 * Automatically falls back to 2D Canvas if WebGL2 is unavailable.
 */
(function (global) {
    'use strict';

    const FULLSCREEN_VERT = `#version 300 es
    precision highp float;
    out vec2 vUv;
    void main() {
        // Fullscreen triangle via gl_VertexID (no vertex buffer required)
        float x = float((gl_VertexID & 1) << 2) - 1.0;
        float y = float((gl_VertexID & 2) << 1) - 1.0;
        vUv = vec2(x * 0.5 + 0.5, 0.5 - y * 0.5);
        gl_Position = vec4(x, y, 0.0, 1.0);
    }`;

    const FIELD_FRAG = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;

    uniform vec2 uResolution;
    uniform vec2 uMouse;
    uniform float uMouseActive;
    uniform vec3 uPrimaryColor;
    uniform float uIsLight;
    uniform float uVelocity;
    uniform vec4 uRipples[4]; // (px, py, radiusPx, alpha)

    void main() {
        vec2 pixel = vUv * uResolution;
        vec3 col = vec3(0.0);
        float alpha = 0.0;

        // Subtle interactive pointer radial field
        if (uMouseActive > 0.001) {
            float d = length(pixel - uMouse);
            float halo = exp(-d * 0.0065) * 0.14 * uMouseActive;
            float ring = smoothstep(26.0, 0.0, abs(d - 110.0)) * 0.04 * uMouseActive;
            float strength = (halo + ring) * (uIsLight > 0.5 ? 0.55 : 1.0);
            col += uPrimaryColor * strength;
            alpha += strength;
        }

        // Click / tap expanding shockwave rings
        for (int i = 0; i < 4; i++) {
            vec4 r = uRipples[i];
            if (r.w > 0.001) {
                float d = length(pixel - r.xy);
                float band = smoothstep(28.0, 0.0, abs(d - r.z));
                float innerGlow = exp(-abs(d - r.z) * 0.035) * 0.55;
                float wave = (band * 0.22 + innerGlow * 0.12) * r.w * (uIsLight > 0.5 ? 0.65 : 1.0);
                col += uPrimaryColor * wave;
                alpha += wave;
            }
        }

        // Subtle kinetic edge energy during fast scrolling
        float speed = min(abs(uVelocity), 1.0);
        if (speed > 0.02) {
            float edge = smoothstep(0.32, 0.0, vUv.y) + smoothstep(0.68, 1.0, vUv.y);
            float streak = edge * speed * 0.055 * (uIsLight > 0.5 ? 0.5 : 1.0);
            col += uPrimaryColor * streak;
            alpha += streak;
        }

        fragColor = vec4(col, clamp(alpha, 0.0, 0.45));
    }`;

    const LINE_VERT = `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 aPos;
    layout(location = 1) in float aAlpha;
    layout(location = 2) in float aEnergy;

    uniform vec2 uResolution;

    out float vAlpha;
    out float vEnergy;

    void main() {
        vec2 ndc = (aPos / uResolution) * 2.0 - 1.0;
        ndc.y = -ndc.y;
        gl_Position = vec4(ndc, 0.0, 1.0);
        vAlpha = aAlpha;
        vEnergy = aEnergy;
    }`;

    const LINE_FRAG = `#version 300 es
    precision highp float;
    in float vAlpha;
    in float vEnergy;
    out vec4 fragColor;

    uniform vec3 uPrimaryColor;
    uniform vec3 uAccentHot;

    void main() {
        vec3 color = mix(uPrimaryColor, uAccentHot, clamp(vEnergy * 0.55, 0.0, 1.0));
        fragColor = vec4(color, vAlpha);
    }`;

    const POINT_VERT = `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 aPos;
    layout(location = 1) in float aSize;
    layout(location = 2) in float aAlpha;
    layout(location = 3) in float aEnergy;

    uniform vec2 uResolution;

    out float vAlpha;
    out float vEnergy;

    void main() {
        vec2 ndc = (aPos / uResolution) * 2.0 - 1.0;
        ndc.y = -ndc.y;
        gl_Position = vec4(ndc, 0.0, 1.0);
        gl_PointSize = aSize;
        vAlpha = aAlpha;
        vEnergy = aEnergy;
    }`;

    const POINT_FRAG = `#version 300 es
    precision highp float;
    in float vAlpha;
    in float vEnergy;
    out vec4 fragColor;

    uniform vec3 uPrimaryColor;
    uniform vec3 uAccentHot;

    void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float dist = length(uv) * 2.0;
        if (dist > 1.0) discard;

        float core = smoothstep(0.55, 0.0, dist);
        float halo = smoothstep(1.0, 0.15, dist) * (0.45 + vEnergy * 0.55);
        float intensity = clamp(core * 0.85 + halo * 0.65, 0.0, 1.0);

        vec3 color = mix(uPrimaryColor, uAccentHot, core * (0.25 + vEnergy * 0.65));
        fragColor = vec4(color, intensity * vAlpha);
    }`;

    function compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn('WebGL2 shader error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function createProgram(gl, vertSrc, fragSrc) {
        const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
        const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
        if (!vert || !frag) return null;

        const program = gl.createProgram();
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);
        gl.deleteShader(vert);
        gl.deleteShader(frag);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.warn('WebGL2 link error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    /**
     * Initialize the interactive WebGL2 background on a canvas element.
     * Falls back to 2D Canvas automatically if WebGL2 context creation fails.
     */
    function initWebGLBackground(canvas) {
        if (!canvas) return null;

        const gl = canvas.getContext('webgl2', {
            alpha: true,
            antialias: true,
            depth: false,
            stencil: false,
            powerPreference: 'high-performance'
        });

        if (!gl) {
            return initCanvas2DFallback(canvas);
        }

        const fieldProgram = createProgram(gl, FULLSCREEN_VERT, FIELD_FRAG);
        const lineProgram = createProgram(gl, LINE_VERT, LINE_FRAG);
        const pointProgram = createProgram(gl, POINT_VERT, POINT_FRAG);

        if (!fieldProgram || !lineProgram || !pointProgram) {
            return initCanvas2DFallback(canvas);
        }

        const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let reducedMotion = reducedMotionQuery.matches;
        let isLight = document.body.classList.contains('light-theme');

        const PARTICLE_COUNT = window.innerWidth < 768 ? 90 : 140;
        const CONNECT_DIST = window.innerWidth < 768 ? 115 : 140;
        const MOUSE_RADIUS = 210;
        const FOCAL = 1.65;
        const MAX_LINES = (PARTICLE_COUNT * (PARTICLE_COUNT - 1)) / 2 + PARTICLE_COUNT;

        let width = window.innerWidth;
        let height = window.innerHeight;
        let dpr = Math.min(window.devicePixelRatio || 1, 2);

        const mouse = { x: -9999, y: -9999, smoothX: width * 0.5, smoothY: height * 0.5, active: false, strength: 0 };
        const scrollState = { y: window.scrollY || 0, velocity: 0, driftOffset: 0 };
        const ripples = []; // { x, y, radius, alpha }
        const particles = [];

        // Pre-allocated typed buffers for zero-GC per-frame GPU uploads
        const lineData = new Float32Array(MAX_LINES * 2 * 4); // x, y, alpha, energy
        const pointData = new Float32Array(PARTICLE_COUNT * 5); // x, y, size, alpha, energy

        // Empty VAO for fullscreen triangle
        const emptyVao = gl.createVertexArray();

        // Lines VAO & VBO
        const lineVao = gl.createVertexArray();
        const lineVbo = gl.createBuffer();
        gl.bindVertexArray(lineVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
        gl.bufferData(gl.ARRAY_BUFFER, lineData.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 8);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 16, 12);

        // Points VAO & VBO
        const pointVao = gl.createVertexArray();
        const pointVbo = gl.createBuffer();
        gl.bindVertexArray(pointVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, pointVbo);
        gl.bufferData(gl.ARRAY_BUFFER, pointData.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 8);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 12);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 20, 16);

        gl.bindVertexArray(null);

        // Cache uniform locations
        const uField = {
            res: gl.getUniformLocation(fieldProgram, 'uResolution'),
            mouse: gl.getUniformLocation(fieldProgram, 'uMouse'),
            mouseActive: gl.getUniformLocation(fieldProgram, 'uMouseActive'),
            primary: gl.getUniformLocation(fieldProgram, 'uPrimaryColor'),
            isLight: gl.getUniformLocation(fieldProgram, 'uIsLight'),
            velocity: gl.getUniformLocation(fieldProgram, 'uVelocity'),
            ripples: gl.getUniformLocation(fieldProgram, 'uRipples')
        };

        const uLine = {
            res: gl.getUniformLocation(lineProgram, 'uResolution'),
            primary: gl.getUniformLocation(lineProgram, 'uPrimaryColor'),
            hot: gl.getUniformLocation(lineProgram, 'uAccentHot')
        };

        const uPoint = {
            res: gl.getUniformLocation(pointProgram, 'uResolution'),
            primary: gl.getUniformLocation(pointProgram, 'uPrimaryColor'),
            hot: gl.getUniformLocation(pointProgram, 'uAccentHot')
        };

        function initParticles() {
            particles.length = 0;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    z: Math.random() * 0.9 - 0.45, // depth plane [-0.45, 0.45]
                    vx: (Math.random() - 0.5) * 26,
                    vy: (Math.random() - 0.5) * 26,
                    vz: (Math.random() - 0.5) * 0.08,
                    baseR: Math.random() * 2.2 + 1.4,
                    opacity: Math.random() * 0.45 + 0.2,
                    energy: 0,
                    px: 0,
                    py: 0,
                    persp: 1
                });
            }
        }

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.max(1, Math.floor(width * dpr));
            canvas.height = Math.max(1, Math.floor(height * dpr));
            gl.viewport(0, 0, canvas.width, canvas.height);
        }

        function spawnRipple(x, y) {
            if (reducedMotion) return;
            if (ripples.length >= 4) ripples.shift();
            ripples.push({ x, y, radius: 4, alpha: 1.0 });
        }

        const onMouseMove = (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.active = true;
        };
        const onMouseLeave = () => {
            mouse.active = false;
        };
        const onTouchMove = (e) => {
            const t = e.touches[0];
            if (!t) return;
            mouse.x = t.clientX;
            mouse.y = t.clientY;
            mouse.active = true;
        };
        const onTouchEnd = () => {
            mouse.active = false;
        };
        const onPointerDown = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            spawnRipple(e.clientX, e.clientY);
        };
        const onResize = () => {
            const oldW = width;
            const oldH = height;
            resize();
            // Proportionally scale positions rather than resetting randomly
            const sx = oldW > 0 ? width / oldW : 1;
            const sy = oldH > 0 ? height / oldH : 1;
            for (const p of particles) {
                p.x *= sx;
                p.y *= sy;
            }
            if (reducedMotion) renderFrame(0);
        };

        window.addEventListener('mousemove', onMouseMove, { passive: true });
        window.addEventListener('mouseleave', onMouseLeave);
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
        window.addEventListener('pointerdown', onPointerDown, { passive: true });
        window.addEventListener('resize', onResize);

        let rafId = null;
        let lastTime = performance.now();
        let isHidden = document.hidden;

        function stepPhysics(dt) {
            // Smooth mouse strength & parallax vector
            const targetStrength = mouse.active ? 1.0 : 0.0;
            mouse.strength += (targetStrength - mouse.strength) * Math.min(1, dt * 8);
            if (mouse.active) {
                mouse.smoothX += (mouse.x - mouse.smoothX) * Math.min(1, dt * 10);
                mouse.smoothY += (mouse.y - mouse.smoothY) * Math.min(1, dt * 10);
            }

            // Advance shockwave ripples
            for (let i = ripples.length - 1; i >= 0; i--) {
                const r = ripples[i];
                r.radius += dt * 460;
                r.alpha -= dt * 1.15;
                if (r.alpha <= 0.01) {
                    ripples.splice(i, 1);
                }
            }

            const vel = scrollState.velocity; // normalized [-1, 1]
            const halfW = width * 0.5;
            const halfH = height * 0.5;
            const camParallaxX = mouse.active ? ((mouse.smoothX - halfW) / Math.max(1, halfW)) * 28 * mouse.strength : 0;
            const camParallaxY = mouse.active ? ((mouse.smoothY - halfH) / Math.max(1, halfH)) * 24 * mouse.strength : 0;

            for (const p of particles) {
                if (!reducedMotion) {
                    // Ambient + kinetic scroll current
                    const depthFactor = 0.65 + (p.z + 0.45);
                    p.x += p.vx * dt;
                    p.y += (p.vy - vel * 240 * depthFactor) * dt;
                    p.z += p.vz * dt;

                    // Wrap toroidal boundaries cleanly
                    if (p.x < 0) p.x += width;
                    else if (p.x > width) p.x -= width;
                    if (p.y < 0) p.y += height;
                    else if (p.y > height) p.y -= height;
                    if (p.z < -0.45) { p.z = -0.45; p.vz *= -1; }
                    else if (p.z > 0.45) { p.z = 0.45; p.vz *= -1; }
                }

                // Project 3D particle into 2D screen space
                const persp = FOCAL / (FOCAL - p.z);
                p.persp = persp;
                let sx = (p.x - halfW - camParallaxX * p.z * 1.4) * persp + halfW;
                let sy = (p.y - halfH - camParallaxY * p.z * 1.4) * persp + halfH;

                // Keep projected points wrapped inside viewport so edges don't clip abruptly
                sx = ((sx % width) + width) % width;
                sy = ((sy % height) + height) % height;

                let localEnergy = Math.abs(vel) * 0.35;

                // Cursor radial repulsion in screen space
                if (!reducedMotion && mouse.strength > 0.02) {
                    const mdx = p.x - mouse.x;
                    const mdy = p.y - mouse.y;
                    const mDist = Math.hypot(mdx, mdy);
                    if (mDist < MOUSE_RADIUS && mDist > 0.001) {
                        const force = (MOUSE_RADIUS - mDist) / MOUSE_RADIUS;
                        p.x += (mdx / mDist) * force * 85 * dt;
                        p.y += (mdy / mDist) * force * 85 * dt;
                        localEnergy = Math.max(localEnergy, force);
                    }
                }

                // Shockwave ring impulse
                if (!reducedMotion) {
                    for (const r of ripples) {
                        const rdx = p.x - r.x;
                        const rdy = p.y - r.y;
                        const rDist = Math.hypot(rdx, rdy);
                        const ringDelta = Math.abs(rDist - r.radius);
                        if (ringDelta < 45 && rDist > 0.001) {
                            const impulse = (1 - ringDelta / 45) * r.alpha;
                            p.x += (rdx / rDist) * impulse * 140 * dt;
                            p.y += (rdy / rDist) * impulse * 140 * dt;
                            localEnergy = Math.max(localEnergy, impulse);
                        }
                    }
                }

                p.energy += (localEnergy - p.energy) * Math.min(1, dt * 10);
                p.px = sx;
                p.py = sy;
            }
        }

        function renderFrame(dt) {
            stepPhysics(dt);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.enable(gl.BLEND);

            // Theme colors
            const primary = isLight ? [0.031, 0.569, 0.698] : [0.0, 0.949, 1.0]; // #0891b2 vs #00f2ff
            const hot = isLight ? [0.055, 0.455, 0.565] : [0.75, 0.99, 1.0];
            const alphaScale = isLight ? 0.58 : 1.0;

            if (isLight) {
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            } else {
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            }

            // 1. Fullscreen procedural field & shockwave shader
            gl.useProgram(fieldProgram);
            gl.bindVertexArray(emptyVao);
            gl.uniform2f(uField.res, canvas.width, canvas.height);
            gl.uniform2f(uField.mouse, mouse.smoothX * dpr, mouse.smoothY * dpr);
            gl.uniform1f(uField.mouseActive, reducedMotion ? 0.0 : mouse.strength);
            gl.uniform3fv(uField.primary, primary);
            gl.uniform1f(uField.isLight, isLight ? 1.0 : 0.0);
            gl.uniform1f(uField.velocity, reducedMotion ? 0.0 : scrollState.velocity);

            const rippleArray = new Float32Array(16);
            for (let i = 0; i < 4; i++) {
                const r = ripples[i];
                if (r) {
                    rippleArray[i * 4] = r.x * dpr;
                    rippleArray[i * 4 + 1] = r.y * dpr;
                    rippleArray[i * 4 + 2] = r.radius * dpr;
                    rippleArray[i * 4 + 3] = r.alpha;
                }
            }
            gl.uniform4fv(uField.ripples, rippleArray);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // 2. Build dynamic proximity graph lines + cursor tethers
            let lineFloats = 0;
            const maxLineDistSq = CONNECT_DIST * CONNECT_DIST;

            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const a = particles[i];
                for (let j = i + 1; j < PARTICLE_COUNT; j++) {
                    const b = particles[j];
                    const dx = a.px - b.px;
                    const dy = a.py - b.py;
                    // Quick axis reject prevents wrap-around screen-spanning lines
                    if (Math.abs(dx) > CONNECT_DIST || Math.abs(dy) > CONNECT_DIST) continue;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < maxLineDistSq) {
                        const dist = Math.sqrt(distSq);
                        const energy = Math.max(a.energy, b.energy);
                        const depthFade = 0.55 + ((a.persp + b.persp) * 0.5 - 0.7) * 0.5;
                        const lineAlpha = clamp(((1 - dist / CONNECT_DIST) * 0.22 + energy * 0.35) * depthFade * alphaScale, 0, 0.75);

                        lineData[lineFloats++] = a.px * dpr;
                        lineData[lineFloats++] = a.py * dpr;
                        lineData[lineFloats++] = lineAlpha;
                        lineData[lineFloats++] = energy;

                        lineData[lineFloats++] = b.px * dpr;
                        lineData[lineFloats++] = b.py * dpr;
                        lineData[lineFloats++] = lineAlpha;
                        lineData[lineFloats++] = energy;
                    }
                }
            }

            if (mouse.strength > 0.05 && !reducedMotion) {
                for (let i = 0; i < PARTICLE_COUNT; i++) {
                    const p = particles[i];
                    const dx = p.px - mouse.x;
                    const dy = p.py - mouse.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < MOUSE_RADIUS) {
                        const tetherAlpha = (1 - dist / MOUSE_RADIUS) * 0.28 * mouse.strength * alphaScale;
                        lineData[lineFloats++] = mouse.x * dpr;
                        lineData[lineFloats++] = mouse.y * dpr;
                        lineData[lineFloats++] = tetherAlpha;
                        lineData[lineFloats++] = 0.9;

                        lineData[lineFloats++] = p.px * dpr;
                        lineData[lineFloats++] = p.py * dpr;
                        lineData[lineFloats++] = tetherAlpha * 0.65;
                        lineData[lineFloats++] = p.energy;
                    }
                }
            }

            const lineVertexCount = lineFloats / 4;
            if (lineVertexCount > 0) {
                gl.useProgram(lineProgram);
                gl.bindVertexArray(lineVao);
                gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData.subarray(0, lineFloats));
                gl.uniform2f(uLine.res, canvas.width, canvas.height);
                gl.uniform3fv(uLine.primary, primary);
                gl.uniform3fv(uLine.hot, hot);
                gl.drawArrays(gl.LINES, 0, lineVertexCount);
            }

            // 3. Draw glowing 3D particle nodes
            let pointFloats = 0;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const p = particles[i];
                const size = (p.baseR * 2.2 * p.persp + p.energy * 5.0) * dpr;
                const pAlpha = clamp((p.opacity + p.energy * 0.55) * alphaScale, 0, 0.95);
                pointData[pointFloats++] = p.px * dpr;
                pointData[pointFloats++] = p.py * dpr;
                pointData[pointFloats++] = size;
                pointData[pointFloats++] = pAlpha;
                pointData[pointFloats++] = p.energy;
            }

            gl.useProgram(pointProgram);
            gl.bindVertexArray(pointVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, pointVbo);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, pointData);
            gl.uniform2f(uPoint.res, canvas.width, canvas.height);
            gl.uniform3fv(uPoint.primary, primary);
            gl.uniform3fv(uPoint.hot, hot);
            gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);

            gl.bindVertexArray(null);
        }

        function loop(now) {
            if (isHidden || reducedMotion) {
                rafId = null;
                return;
            }
            const dt = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;
            renderFrame(dt);
            rafId = requestAnimationFrame(loop);
        }

        function start() {
            if (reducedMotion) {
                renderFrame(0);
                return;
            }
            if (!rafId && !isHidden) {
                lastTime = performance.now();
                rafId = requestAnimationFrame(loop);
            }
        }

        const onVisibility = () => {
            isHidden = document.hidden;
            if (!isHidden) {
                start();
            } else if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };
        document.addEventListener('visibilitychange', onVisibility);

        const onReducedMotionChange = (e) => {
            reducedMotion = e.matches;
            if (reducedMotion && rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
                renderFrame(0);
            } else if (!reducedMotion) {
                start();
            }
        };
        reducedMotionQuery.addEventListener?.('change', onReducedMotionChange);

        resize();
        initParticles();
        start();

        return {
            setTheme(light) {
                isLight = Boolean(light);
                if (reducedMotion) renderFrame(0);
            },
            setScrollState(y, velocity) {
                scrollState.y = y;
                scrollState.velocity = clamp(velocity || 0, -1, 1);
            },
            triggerPulse(x = width * 0.5, y = height * 0.5) {
                spawnRipple(x, y);
            },
            destroy() {
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseleave', onMouseLeave);
                window.removeEventListener('touchmove', onTouchMove);
                window.removeEventListener('touchend', onTouchEnd);
                window.removeEventListener('pointerdown', onPointerDown);
                window.removeEventListener('resize', onResize);
                document.removeEventListener('visibilitychange', onVisibility);
                reducedMotionQuery.removeEventListener?.('change', onReducedMotionChange);
            }
        };
    }

    /**
     * Minimal 2D Canvas fallback for environments without WebGL2.
     */
    function initCanvas2DFallback(canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        let width = window.innerWidth;
        let height = window.innerHeight;
        let isLight = document.body.classList.contains('light-theme');
        const particles = Array.from({ length: 80 }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            dx: (Math.random() - 0.5) * 0.4,
            dy: (Math.random() - 0.5) * 0.4,
            r: Math.random() * 2 + 1
        }));

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
        }
        resize();
        window.addEventListener('resize', resize);

        let rafId = null;
        function tick() {
            ctx.clearRect(0, 0, width, height);
            const rgb = isLight ? '8, 145, 178' : '0, 242, 255';
            for (const p of particles) {
                p.x = (p.x + p.dx + width) % width;
                p.y = (p.y + p.dy + height) % height;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${rgb}, 0.4)`;
                ctx.fill();
            }
            rafId = requestAnimationFrame(tick);
        }
        tick();

        return {
            setTheme(light) { isLight = Boolean(light); },
            setScrollState() {},
            triggerPulse() {},
            destroy() {
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('resize', resize);
            }
        };
    }

    global.initWebGLBackground = initWebGLBackground;
})(window);

