document.addEventListener('DOMContentLoaded', () => {

    // ===== Loading Screen =====
    const loading = document.getElementById('loading');
    if (loading) {
        setTimeout(() => {
            loading.classList.add('fade-out');
            setTimeout(() => loading.style.display = 'none', 600);
        }, 800);
    }

    // ===== Interactive Particle Canvas =====
    const canvas = document.getElementById('particles-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        const PARTICLE_COUNT = 120;
        const CONNECT_DIST = 120;
        const MOUSE_RADIUS = 200;
        const mouse = { x: -9999, y: -9999, active: false };

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        function initParticles() {
            particles = [];
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    baseR: Math.random() * 2 + 1,
                    r: 0,
                    dx: (Math.random() - 0.5) * 0.4,
                    dy: (Math.random() - 0.5) * 0.4,
                    opacity: Math.random() * 0.5 + 0.1,
                });
            }
        }

        window.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.active = true;
        });
        window.addEventListener('mouseleave', () => { mouse.active = false; });

        window.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            mouse.x = touch.clientX;
            mouse.y = touch.clientY;
            mouse.active = true;
        }, { passive: true });
        window.addEventListener('touchend', () => { mouse.active = false; });

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (const p of particles) {
                p.x += p.dx;
                p.y += p.dy;
                if (p.x < 0) p.x = canvas.width;
                if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height;
                if (p.y > canvas.height) p.y = 0;

                const mdx = p.x - mouse.x;
                const mdy = p.y - mouse.y;
                const mDist = Math.sqrt(mdx * mdx + mdy * mdy);

                if (mouse.active && mDist < MOUSE_RADIUS) {
                    const force = (MOUSE_RADIUS - mDist) / MOUSE_RADIUS;
                    const angle = Math.atan2(mdy, mdx);
                    p.x += Math.cos(angle) * force * 1.5;
                    p.y += Math.sin(angle) * force * 1.5;
                    p.r = p.baseR + force * 3;
                    p.glow = force;
                } else {
                    p.r += (p.baseR - p.r) * 0.1;
                    p.glow = (p.glow || 0) * 0.92;
                }
            }

            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const a = particles[i], b = particles[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < CONNECT_DIST) {
                        const lineOpacity = (1 - dist / CONNECT_DIST) * 0.15;
                        const glow = Math.max(a.glow || 0, b.glow || 0);
                        const boost = glow * 0.4;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.strokeStyle = `rgba(0, 242, 255, ${lineOpacity + boost})`;
                        ctx.lineWidth = 0.5 + glow;
                        ctx.stroke();
                    }
                }
            }

            if (mouse.active) {
                for (const p of particles) {
                    const dx = p.x - mouse.x, dy = p.y - mouse.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < MOUSE_RADIUS) {
                        const lineOpacity = (1 - dist / MOUSE_RADIUS) * 0.2;
                        ctx.beginPath();
                        ctx.moveTo(mouse.x, mouse.y);
                        ctx.lineTo(p.x, p.y);
                        ctx.strokeStyle = `rgba(0, 242, 255, ${lineOpacity})`;
                        ctx.lineWidth = 0.4;
                        ctx.stroke();
                    }
                }
            }

            for (const p of particles) {
                const glow = p.glow || 0;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 242, 255, ${p.opacity + glow * 0.5})`;
                ctx.fill();
                if (glow > 0.2) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r + glow * 4, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(0, 242, 255, ${glow * 0.15})`;
                    ctx.fill();
                }
            }

            requestAnimationFrame(animate);
        }

        resize();
        initParticles();
        animate();
        window.addEventListener('resize', () => { resize(); initParticles(); });
    }

    // ===== Theme Toggle =====
    const themeToggle = document.querySelector('.theme-toggle');
    const themeIcon = themeToggle?.querySelector('i');

    function applyTheme(theme) {
        document.body.classList.toggle('light-theme', theme === 'light');
        if (themeIcon) {
            themeIcon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    applyTheme(localStorage.getItem('theme') || 'dark');

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const next = document.body.classList.contains('light-theme') ? 'dark' : 'light';
            localStorage.setItem('theme', next);
            applyTheme(next);
        });
    }

    // ===== Hamburger Menu =====
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('toggle');
        });
    }

    // ===== Smooth Scrolling =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            if (navLinks && navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                hamburger.classList.remove('toggle');
            }
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const el = document.querySelector(targetId);
            if (el) {
                const offset = 80;
                const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

    // ===== Navbar Scroll Effect =====
    const navbar = document.querySelector('.top-navbar');
    const scrollProgress = document.getElementById('scroll-progress');
    const backToTop = document.getElementById('back-to-top');

    if (navbar) {
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;

            if (scrollY > 50) {
                navbar.style.background = 'rgba(10, 10, 10, 0.95)';
                navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
            } else {
                navbar.style.background = 'rgba(10, 10, 10, 0.8)';
                navbar.style.boxShadow = 'none';
            }

            // ===== Scroll Progress Bar =====
            if (scrollProgress) {
                const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                const progress = docHeight > 0 ? (scrollY / docHeight) * 100 : 0;
                scrollProgress.style.width = progress + '%';
            }

            // ===== Back to Top =====
            if (backToTop) {
                backToTop.classList.toggle('visible', scrollY > window.innerHeight);
            }
        });
    }

    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ===== Active Nav Section Highlighting =====
    const sections = document.querySelectorAll('section[id], main[id]');
    const navLinksAll = document.querySelectorAll('.nav-links a[href^="#"]');

    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinksAll.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === '#' + id);
                });
            }
        });
    }, { rootMargin: '-20% 0px -60% 0px' });

    sections.forEach(section => sectionObserver.observe(section));

    // ===== Staggered Scroll Reveal =====
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08 });

    const revealGroups = [
        '.project-card',
        '.blog-card',
        '.about-block',
        '.gallery-item'
    ];

    revealGroups.forEach(selector => {
        document.querySelectorAll(selector).forEach((el, i) => {
            el.classList.add('reveal');
            el.style.setProperty('--reveal-delay', (i * 60) + 'ms');
            revealObserver.observe(el);
        });
    });

    // ===== Project Card Tilt on Hover =====
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (!isTouchDevice) {
        document.querySelectorAll('.project-card').forEach(card => {
            const glow = document.createElement('div');
            glow.classList.add('card-glow');
            card.appendChild(glow);

            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -4;
                const rotateY = ((x - centerX) / centerX) * 4;

                card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
                glow.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(0, 242, 255, 0.08), transparent 60%)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
                glow.style.background = '';
            });
        });
    }

    // ===== Image Modal (from portfolio/js/main.js) =====
    const imageModalTriggers = document.querySelectorAll('.image-modal-trigger');
    const galleryTriggers = Array.from(document.querySelectorAll('.gallery-image-trigger'));
    const modal = document.getElementById('image-modal');
    const modalCloseTargets = document.querySelectorAll('[data-close-modal="true"]');
    const modalEyebrow = modal?.querySelector('.image-modal-eyebrow');
    const modalTitle = modal?.querySelector('#image-modal-title');
    const modalAsset = modal?.querySelector('.image-modal-asset');
    const modalPrev = modal?.querySelector('.image-modal-prev');
    const modalNext = modal?.querySelector('.image-modal-next');
    let lastFocused = null;
    let galleryIndex = -1;

    function updateNavState() {
        const show = galleryIndex !== -1 && galleryTriggers.length > 1;
        [modalPrev, modalNext].forEach(btn => {
            if (btn) btn.classList.toggle('is-hidden', !show);
        });
    }

    function openModal(trigger, opts = {}) {
        if (!modal || !modalAsset || !modalTitle || !modalEyebrow) return;
        if (!opts.preserveFocus) lastFocused = document.activeElement;
        galleryIndex = trigger.classList.contains('gallery-image-trigger')
            ? galleryTriggers.indexOf(trigger) : -1;
        modalAsset.src = trigger.dataset.modalSrc || '';
        modalAsset.alt = trigger.dataset.modalAlt || 'Expanded image';
        modalTitle.textContent = trigger.dataset.modalTitle || 'Image preview';
        modalEyebrow.textContent = trigger.dataset.modalEyebrow || 'Preview';
        updateNavState();
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        if (!opts.preserveFocus) {
            const closeBtn = modal.querySelector('.image-modal-close');
            if (closeBtn) closeBtn.focus();
        }
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        galleryIndex = -1;
        updateNavState();
        if (lastFocused instanceof HTMLElement) lastFocused.focus();
    }

    function navigateGallery(dir) {
        if (galleryIndex === -1 || !galleryTriggers.length) return;
        galleryIndex = (galleryIndex + dir + galleryTriggers.length) % galleryTriggers.length;
        openModal(galleryTriggers[galleryIndex], { preserveFocus: true });
    }

    if (imageModalTriggers.length && modal) {
        imageModalTriggers.forEach(t => t.addEventListener('click', () => openModal(t)));
        modalCloseTargets.forEach(t => t.addEventListener('click', closeModal));
        modalPrev?.addEventListener('click', () => navigateGallery(-1));
        modalNext?.addEventListener('click', () => navigateGallery(1));
        document.addEventListener('keydown', (e) => {
            if (!modal.classList.contains('is-open')) return;
            if (e.key === 'Escape') closeModal();
            else if (e.key === 'ArrowLeft' && galleryIndex !== -1) navigateGallery(-1);
            else if (e.key === 'ArrowRight' && galleryIndex !== -1) navigateGallery(1);
        });
    }
});
