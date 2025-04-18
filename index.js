// Function to set the current year in the footer
document.getElementById('year').textContent = new Date().getFullYear();

// Navigation Toggle
const menuToggle = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('.nav-menu');

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });
}

// Close menu when clicking a nav item
const navLinks = document.querySelectorAll('.nav-menu a');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
    });
});

// Back to top button
const backToTopButton = document.getElementById('back-to-top');

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        backToTopButton.classList.add('visible');
    } else {
        backToTopButton.classList.remove('visible');
    }
});

// Loading screen
setTimeout(function() {
    document.getElementById('loading').classList.add('animate__animated', 'animate__fadeOut');
    setTimeout(function() {
        document.getElementById('loading').style.display = 'none';
    }, 1000);
}, 1500);

// Show/hide sections
function showabout() {
    document.getElementById('about_container').style.display = 'block';
    document.getElementById('about_container').classList.add('animate__animated', 'animate__slideInLeft');
    setTimeout(function() {
        document.getElementById('about_container').classList.remove('animate__slideInLeft');
    }, 800);
}

function closeabout() {
    document.getElementById('about_container').classList.add('animate__animated', 'animate__slideOutLeft');
    setTimeout(function() {
        document.getElementById('about_container').classList.remove('animate__slideOutLeft');
        document.getElementById('about_container').style.display = 'none';
    }, 800);
}

function showwork() {
    document.getElementById('work_container').style.display = 'block';
    document.getElementById('work_container').classList.add('animate__animated', 'animate__slideInRight');
    setTimeout(function() {
        document.getElementById('work_container').classList.remove('animate__slideInRight');
    }, 800);
}

function closework() {
    document.getElementById('work_container').classList.add('animate__animated', 'animate__slideOutRight');
    setTimeout(function() {
        document.getElementById('work_container').classList.remove('animate__slideOutRight');
        document.getElementById('work_container').style.display = 'none';
    }, 800);
}

function showExperience() {
    document.getElementById('experience_container').style.display = 'block';
    document.getElementById('experience_container').classList.add('animate__animated', 'animate__slideInRight');
    setTimeout(function() {
        document.getElementById('experience_container').classList.remove('animate__slideInRight');
    }, 800);
}

function closeExperience() {
    document.getElementById('experience_container').classList.add('animate__animated', 'animate__slideOutRight');
    setTimeout(function() {
        document.getElementById('experience_container').classList.remove('animate__slideOutRight');
        document.getElementById('experience_container').style.display = 'none';
    }, 800);
}

function showcontact() {
    document.getElementById('contact_container').style.display = 'block';
    document.getElementById('contact_container').classList.add('animate__animated', 'animate__slideInUp');
    setTimeout(function() {
        document.getElementById('contact_container').classList.remove('animate__slideInUp');
    }, 800);
}

function closecontact() {
    document.getElementById('contact_container').classList.add('animate__animated', 'animate__slideOutDown');
    setTimeout(function() {
        document.getElementById('contact_container').classList.remove('animate__slideOutDown');
        document.getElementById('contact_container').style.display = 'none';
    }, 800);
}

function showHome() {
    // Close all other sections first
    closeabout();
    closework();
    closeExperience();
    closecontact();
}

// Contact form submission (optional - add your form handling logic here)
const contactForm = document.querySelector('.contact-form form');
if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        // Add your form submission logic here
        alert('Your message has been sent!');
        contactForm.reset();
    });
}