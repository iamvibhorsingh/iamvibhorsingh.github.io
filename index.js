document.addEventListener('DOMContentLoaded', () => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // ===== Loading Screen =====
    const loading = document.getElementById('loading');
    if (loading) {
        setTimeout(() => {
            loading.classList.add('fade-out');
            setTimeout(() => { loading.style.display = 'none'; }, 600);
        }, 800);
    }

    // ===== Interactive WebGL2 Background =====
    const canvas = document.getElementById('particles-canvas');
    const webglBg = typeof window.initWebGLBackground === 'function'
        ? window.initWebGLBackground(canvas)
        : null;

    // ===== Theme Toggle =====
    const themeToggle = document.querySelector('.theme-toggle');
    const themeIcon = themeToggle?.querySelector('i');

    function applyTheme(theme) {
        const isLight = theme === 'light';
        document.body.classList.toggle('light-theme', isLight);
        if (themeIcon) {
            themeIcon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
        }
        webglBg?.setTheme(isLight);
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

    // ===== Kinetic Scroll & Scroll-Driven Motion =====
    const navbar = document.querySelector('.top-navbar');
    const scrollProgress = document.getElementById('scroll-progress');
    const backToTop = document.getElementById('back-to-top');
    const heroContent = document.querySelector('.hero-content');
    const heroVisual = document.querySelector('.hero-visual');
    const sectionTitles = Array.from(document.querySelectorAll('.section-title'));
    const modal = document.getElementById('image-modal');
    const rootStyle = document.documentElement.style;

    function updateScrollVisuals({ y, velocity, maxScroll }) {
        const speed = Math.min(1, Math.abs(velocity));
        const reduced = reducedMotionQuery.matches;

        if (navbar) {
            navbar.classList.toggle('scrolled', y > 50);
        }

        if (scrollProgress) {
            const progress = maxScroll > 0 ? Math.min(1, Math.max(0, y / maxScroll)) : 0;
            scrollProgress.style.transform = `scaleX(${progress.toFixed(4)})`;
        }

        if (backToTop) {
            backToTop.classList.toggle('visible', y > window.innerHeight);
        }

        webglBg?.setScrollState(y, velocity);

        if (reduced) {
            rootStyle.setProperty('--scroll-v', '0');
            rootStyle.setProperty('--scroll-speed', '0');
            if (heroContent) {
                heroContent.style.transform = '';
                heroContent.style.opacity = '';
            }
            if (heroVisual) {
                heroVisual.style.transform = '';
                heroVisual.style.opacity = '';
            }
            return;
        }

        rootStyle.setProperty('--scroll-v', velocity.toFixed(4));
        rootStyle.setProperty('--scroll-speed', speed.toFixed(4));

        // Hero kinetic parallax exit
        const vh = Math.max(1, window.innerHeight);
        const heroExit = Math.min(1, Math.max(0, y / vh));
        const isDesktop = window.innerWidth > 800;

        if (heroContent) {
            heroContent.style.transform = isDesktop
                ? `translate3d(0, ${(heroExit * 34).toFixed(2)}px, 0)`
                : '';
            heroContent.style.opacity = heroExit > 0.01 ? (1 - heroExit * 0.45).toFixed(3) : '';
        }
        if (heroVisual && isDesktop) {
            const scale = (1 - heroExit * 0.04).toFixed(4);
            heroVisual.style.transform = `translate3d(0, ${(heroExit * -26).toFixed(2)}px, 0) scale(${scale})`;
            heroVisual.style.opacity = heroExit > 0.01 ? (1 - heroExit * 0.45).toFixed(3) : '';
        }

        // Section title kinetic underline & tracking scrub
        for (const title of sectionTitles) {
            const rect = title.getBoundingClientRect();
            const progress = Math.min(1, Math.max(0, 1 - (rect.top / (vh * 0.9))));
            title.style.setProperty('--title-progress', (0.16 + progress * 0.84).toFixed(3));
            title.style.setProperty('--title-shift', ((1 - progress) * 14).toFixed(2));
        }
    }

    const kineticScroll = typeof window.initKineticScroll === 'function'
        ? window.initKineticScroll({
            onScroll: updateScrollVisuals,
            isLocked: () => modal?.classList.contains('is-open') || document.body.style.overflow === 'hidden'
        })
        : null;

    window.__kineticScroll = kineticScroll;

    function scrollToY(top) {
        if (kineticScroll) {
            kineticScroll.scrollTo(top);
        } else {
            window.scrollTo({ top, behavior: 'smooth' });
        }
    }

    // ===== Smooth Anchor Scrolling =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            if (navLinks && navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                hamburger?.classList.remove('toggle');
            }
            const targetId = this.getAttribute('href');
            if (targetId === '#') {
                scrollToY(0);
                return;
            }
            const el = document.querySelector(targetId);
            if (el) {
                const offset = 80;
                const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
                scrollToY(top);
            }
        });
    });

    if (backToTop) {
        backToTop.addEventListener('click', () => {
            scrollToY(0);
        });
    }

    // ===== Active Nav & Sidenav Section Highlighting =====
    const sections = document.querySelectorAll('section[id], main[id]');
    const navLinksAll = document.querySelectorAll('.nav-links a[href^="#"]');
    const sideNavLinks = document.querySelectorAll('.sidenav-tab[href^="#"]');

    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                const targetHref = '#' + id;
                navLinksAll.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === targetHref);
                });
                sideNavLinks.forEach(tab => {
                    tab.classList.toggle('active', tab.getAttribute('href') === targetHref);
                });
            }
        });
    }, { rootMargin: '-20% 0px -60% 0px' });

    sections.forEach(section => sectionObserver.observe(section));

    // ===== Staggered Scroll Reveal =====
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                el.classList.add('visible');
                const delayMs = parseInt(el.style.getPropertyValue('--reveal-delay') || '0', 10) || 0;
                setTimeout(() => {
                    el.classList.add('reveal-settled');
                }, Math.min(delayMs, 360) + 620);
                revealObserver.unobserve(el);
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
            el.style.setProperty('--reveal-delay', (Math.min(i, 6) * 60) + 'ms');
            el.style.setProperty('--kinetic-dir', i % 2 === 0 ? '1' : '-1');
            revealObserver.observe(el);
        });
    });

    // ===== Interactive 3D Pointer Tilt =====
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    function attachPointerTilt(el, { maxDeg = 4, liftPx = 0, withGlow = false } = {}) {
        let glow = null;
        if (withGlow) {
            glow = document.createElement('div');
            glow.classList.add('card-glow');
            el.appendChild(glow);
        }

        el.addEventListener('mousemove', (e) => {
            if (reducedMotionQuery.matches) return;
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -maxDeg;
            const rotateY = ((x - centerX) / centerX) * maxDeg;

            el.classList.add('is-tilting');
            el.style.setProperty('--tilt-x', rotateX.toFixed(2) + 'deg');
            el.style.setProperty('--tilt-y', rotateY.toFixed(2) + 'deg');
            if (liftPx) {
                el.style.setProperty('--card-lift', liftPx + 'px');
            }
            if (glow) {
                glow.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(0, 242, 255, 0.08), transparent 60%)`;
            }
        });

        el.addEventListener('mouseleave', () => {
            el.classList.remove('is-tilting');
            el.style.setProperty('--tilt-x', '0deg');
            el.style.setProperty('--tilt-y', '0deg');
            if (liftPx) {
                el.style.setProperty('--card-lift', '0px');
            }
            if (glow) {
                glow.style.background = '';
            }
        });
    }

    if (!isTouchDevice) {
        document.querySelectorAll('.project-card').forEach(card => {
            attachPointerTilt(card, { maxDeg: 4, liftPx: -4, withGlow: true });
        });
        const heroCard = document.querySelector('.hero-visual-card');
        if (heroCard) {
            attachPointerTilt(heroCard, { maxDeg: 6, liftPx: 0, withGlow: false });
        }
    }

    // ===== Project Category Filters =====
    const filterButtons = document.querySelectorAll('.filter-pill');
    const projectCards = document.querySelectorAll('.project-card');

    if (filterButtons.length && projectCards.length) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter || 'all';
                filterButtons.forEach(b => {
                    const active = b === btn;
                    b.classList.toggle('active', active);
                    b.setAttribute('aria-pressed', active ? 'true' : 'false');
                });

                projectCards.forEach(card => {
                    const categories = (card.dataset.categories || '').split(/\s+/).filter(Boolean);
                    const matches = filter === 'all' || categories.includes(filter);
                    card.classList.toggle('is-filtered-out', !matches);
                    if (matches) {
                        card.classList.add('visible', 'reveal-settled');
                    }
                });

                kineticScroll?.sync();
            });
        });
    }

    // ===== Copy Email Action =====
    const copyEmailBtn = document.querySelector('.copy-email-btn');
    if (copyEmailBtn) {
        const label = copyEmailBtn.querySelector('span');
        let resetTimer = null;

        copyEmailBtn.addEventListener('click', async () => {
            const email = copyEmailBtn.dataset.email || 'contact@vibhorsingh.com';
            try {
                await navigator.clipboard.writeText(email);
                copyEmailBtn.classList.add('is-copied');
                if (label) label.textContent = 'Copied!';
                clearTimeout(resetTimer);
                resetTimer = setTimeout(() => {
                    copyEmailBtn.classList.remove('is-copied');
                    if (label) label.textContent = 'Copy email';
                }, 2000);
            } catch {
                window.location.href = `mailto:${email}`;
            }
        });
    }

    // ===== Image Modal (from portfolio/js/main.js) =====
    const imageModalTriggers = document.querySelectorAll('.image-modal-trigger');
    const galleryTriggers = Array.from(document.querySelectorAll('.gallery-image-trigger'));
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
        kineticScroll?.sync();
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

// ===== WebMCP — Expose site tools to AI agents via the browser =====
// https://webmachinelearning.github.io/webmcp/
if (typeof navigator !== 'undefined' && navigator.modelContext) {
    const controller = new AbortController();

    navigator.modelContext.registerTool({
        name: 'navigate_to_section',
        description: 'Scroll to a named section of the portfolio page. Sections: about, work (projects), blog (write-ups), gallery, contact.',
        inputSchema: {
            type: 'object',
            properties: {
                section: {
                    type: 'string',
                    enum: ['about', 'work', 'blog', 'gallery', 'contact'],
                    description: 'The section to navigate to.'
                }
            },
            required: ['section']
        },
        execute({ section }) {
            const sectionMap = {
                about:   '#about_container',
                work:    '#work_container',
                blog:    '#blog_container',
                gallery: '#gallery_container',
                contact: '#contact_container'
            };
            const el = document.querySelector(sectionMap[section]);
            if (!el) return { error: `Section "${section}" not found.` };
            const offset = 80;
            const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
            if (window.__kineticScroll) {
                window.__kineticScroll.scrollTo(top);
            } else {
                window.scrollTo({ top, behavior: 'smooth' });
            }
            return { navigated: section };
        },
        signal: controller.signal
    });

    navigator.modelContext.registerTool({
        name: 'open_tool',
        description: 'Open one of the developer tools built by Vibhor Singh: BoundingBox (GIS coordinate tool), Supercharged Overpass (OSM query tool for GeoGuessr), or LookStuffUp (Chrome extension).',
        inputSchema: {
            type: 'object',
            properties: {
                tool: {
                    type: 'string',
                    enum: ['boundingbox', 'supercharged-overpass', 'lookstuffup'],
                    description: 'The tool to open.'
                }
            },
            required: ['tool']
        },
        execute({ tool }) {
            const urls = {
                'boundingbox':          '/boundingbox/',
                'supercharged-overpass': '/supercharged-overpass/',
                'lookstuffup':          'https://chromewebstore.google.com/detail/lookstuffup/boagbbfpkdeklbfneiegcdgmfofckhfc'
            };
            const url = urls[tool];
            if (!url) return { error: `Unknown tool "${tool}".` };
            window.open(url, '_blank', 'noopener,noreferrer');
            return { opened: tool, url };
        },
        signal: controller.signal
    });

    navigator.modelContext.registerTool({
        name: 'get_contact_info',
        description: 'Return contact and social profile links for Vibhor Singh.',
        inputSchema: { type: 'object', properties: {} },
        execute() {
            return {
                email:    'contact@vibhorsingh.com',
                linkedin: 'https://www.linkedin.com/in/iamvibhorsingh/',
                github:   'https://github.com/iamvibhorsingh',
                website:  'https://vibhorsingh.com'
            };
        },
        signal: controller.signal
    });
}
