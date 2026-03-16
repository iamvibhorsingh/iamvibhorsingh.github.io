document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const imageModalTriggers = document.querySelectorAll('.image-modal-trigger');
    const galleryImageTriggers = Array.from(document.querySelectorAll('.gallery-image-trigger'));
    const heroImageModal = document.querySelector('#hero-image-modal');
    const heroImageModalCloseTargets = document.querySelectorAll('[data-close-modal="true"]');
    const heroImageModalEyebrow = heroImageModal?.querySelector('.image-modal-eyebrow');
    const heroImageModalTitle = heroImageModal?.querySelector('#hero-image-modal-title');
    const heroImageModalAsset = heroImageModal?.querySelector('.image-modal-asset');
    const heroImageModalPrev = heroImageModal?.querySelector('.image-modal-prev');
    const heroImageModalNext = heroImageModal?.querySelector('.image-modal-next');
    let lastFocusedElement = null;
    let currentGalleryIndex = -1;
    
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('toggle');
        });
    }

    // Theme Toggle
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

    // Smooth Scrolling for Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            // Close mobile menu if open
            if (navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                hamburger.classList.remove('toggle');
            }

            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
    
                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
            }
        });
    });

    // Navbar Scroll Effect
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(10, 10, 10, 0.95)';
            navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
        } else {
            navbar.style.background = 'rgba(10, 10, 10, 0.8)';
            navbar.style.boxShadow = 'none';
        }
    });

    const updateGalleryNavigationState = () => {
        const hasGalleryNavigation = currentGalleryIndex !== -1 && galleryImageTriggers.length > 1;
        [heroImageModalPrev, heroImageModalNext].forEach(button => {
            if (!button) return;
            button.classList.toggle('is-hidden', !hasGalleryNavigation);
        });
    };

    const openHeroImageModal = (trigger, options = {}) => {
        if (!heroImageModal || !heroImageModalAsset || !heroImageModalTitle || !heroImageModalEyebrow) return;
        const { preserveFocus = false } = options;

        if (!preserveFocus) {
            lastFocusedElement = document.activeElement;
        }

        currentGalleryIndex = trigger.classList.contains('gallery-image-trigger')
            ? galleryImageTriggers.indexOf(trigger)
            : -1;
        heroImageModalAsset.src = trigger.dataset.modalSrc || heroImageModalAsset.src;
        heroImageModalAsset.alt = trigger.dataset.modalAlt || trigger.querySelector('img')?.alt || 'Expanded image';
        heroImageModalTitle.textContent = trigger.dataset.modalTitle || 'Image preview';
        heroImageModalEyebrow.textContent = trigger.dataset.modalEyebrow || 'Preview';
        updateGalleryNavigationState();
        heroImageModal.classList.add('is-open');
        heroImageModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        const closeButton = heroImageModal.querySelector('.image-modal-close');
        if (closeButton && !preserveFocus) {
            closeButton.focus();
        }
    };

    const closeHeroImageModal = () => {
        if (!heroImageModal) return;
        heroImageModal.classList.remove('is-open');
        heroImageModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        currentGalleryIndex = -1;
        updateGalleryNavigationState();

        if (lastFocusedElement instanceof HTMLElement) {
            lastFocusedElement.focus();
        }
    };

    const navigateGalleryModal = (direction) => {
        if (currentGalleryIndex === -1 || !galleryImageTriggers.length) return;
        currentGalleryIndex = (currentGalleryIndex + direction + galleryImageTriggers.length) % galleryImageTriggers.length;
        openHeroImageModal(galleryImageTriggers[currentGalleryIndex], { preserveFocus: true });
    };

    if (imageModalTriggers.length && heroImageModal) {
        imageModalTriggers.forEach(trigger => {
            trigger.addEventListener('click', () => openHeroImageModal(trigger));
        });

        heroImageModalCloseTargets.forEach(target => {
            target.addEventListener('click', closeHeroImageModal);
        });

        heroImageModalPrev?.addEventListener('click', () => navigateGalleryModal(-1));
        heroImageModalNext?.addEventListener('click', () => navigateGalleryModal(1));

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && heroImageModal.classList.contains('is-open')) {
                closeHeroImageModal();
            } else if (event.key === 'ArrowLeft' && heroImageModal.classList.contains('is-open') && currentGalleryIndex !== -1) {
                navigateGalleryModal(-1);
            } else if (event.key === 'ArrowRight' && heroImageModal.classList.contains('is-open') && currentGalleryIndex !== -1) {
                navigateGalleryModal(1);
            }
        });
    }

    // Intersection Observer for Fade-in Animations
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.project-card, .section-title, .about-content').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(el);
    });
    
    // Add class for fade-in animation
    const style = document.createElement('style');
    style.innerHTML = `
        .fade-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
        
        @media (max-width: 768px) {
            .nav-links.active {
                display: flex;
                flex-direction: column;
                position: absolute;
                top: 80px;
                left: 0;
                width: 100%;
                background: var(--bg-secondary);
                padding: 2rem;
                border-bottom: 1px solid var(--border-color);
                animation: slideDown 0.3s ease forwards;
            }
            
            @keyframes slideDown {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        }
    `;
    document.head.appendChild(style);
});
