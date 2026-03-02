document.addEventListener('DOMContentLoaded', () => {
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();

            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Hero section and CTA animation on scroll
    const heroSection = document.querySelector('.hero');
    const heroContent = document.querySelector('.hero-content');
    const heroCTAs = document.querySelector('.hero-ctas');

    const fadeInOnScroll = (element, delay = 0) => {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        element.classList.add('fade-in');
                    }, delay);
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        observer.observe(element);
    };

    fadeInOnScroll(heroContent);
    fadeInOnScroll(heroCTAs, 500); // Slight delay for CTAs

    // Feature cards animation on scroll
    document.querySelectorAll('.feature-card').forEach((card, index) => {
        fadeInOnScroll(card, index * 150); // Staggered animation
    });

    // Testimonial carousel functionality (simple example)
    const testimonials = document.querySelectorAll('.testimonial-item');
    const prevBtn = document.getElementById('prevTestimonial');
    const nextBtn = document.getElementById('nextTestimonial');
    let currentTestimonialIndex = 0;

    const showTestimonial = (index) => {
        testimonials.forEach((item, i) => {
            item.style.display = i === index ? 'flex' : 'none';
        });
    };

    if (testimonials.length > 0) {
        showTestimonial(currentTestimonialIndex);

        prevBtn.addEventListener('click', () => {
            currentTestimonialIndex = (currentTestimonialIndex - 1 + testimonials.length) % testimonials.length;
            showTestimonial(currentTestimonialIndex);
        });

        nextBtn.addEventListener('click', () => {
            currentTestimonialIndex = (currentTestimonialIndex + 1) % testimonials.length;
            showTestimonial(currentTestimonialIndex);
        });
    }

    // Modal functionality for "Contact Us" or "Get a Quote"
    const modal = document.getElementById('contactModal');
    const openModalBtn = document.getElementById('openContactModal');
    const closeModalBtn = document.querySelector('.close-button');

    if (openModalBtn && modal && closeModalBtn) {
        openModalBtn.addEventListener('click', () => {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden'; // Prevent scrolling when modal is open
        });

        closeModalBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto'; // Restore scrolling
        });

        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    }


    // Form submission handling
    const contactForm = document.getElementById('contactForm');
    const formMessage = document.getElementById('formMessage');

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formMessage.style.display = 'none'; // Hide previous messages

        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());

        // Basic client-side validation
        if (!data.name || !data.email || !data.message) {
            formMessage.textContent = 'Por favor, completa todos los campos requeridos.';
            formMessage.className = 'error-message';
            formMessage.style.display = 'block';
            return;
        }

        if (!/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(data.email)) {
            formMessage.textContent = 'Por favor, introduce un correo electrónico válido.';
            formMessage.className = 'error-message';
            formMessage.style.display = 'block';
            return;
        }

        try {
            // Simulate API call
            formMessage.textContent = 'Enviando...';
            formMessage.className = 'info-message';
            formMessage.style.display = 'block';

            // In a real application, replace this with an actual API endpoint
            // const response = await fetch('/api/contact', {
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json'
            //     },
            //     body: JSON.stringify(data)
            // });

            // const result = await response.json();

            await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

            const success = true; // Replace with result.success or similar from API

            if (success) { // Based on actual API response
                formMessage.textContent = 'Mensaje enviado con éxito. ¡Te contactaremos pronto!';
                formMessage.className = 'success-message';
                contactForm.reset();
                // Optionally close modal after successful submission
                // modal.style.display = 'none';
                // document.body.style.overflow = 'auto';
            } else {
                // If API returns an error or specific message
                formMessage.textContent = 'Hubo un error al enviar tu mensaje. Por favor, inténtalo de nuevo más tarde.';
                formMessage.className = 'error-message';
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            formMessage.textContent = 'Error de conexión. Por favor, inténtalo de nuevo más tarde.';
            formMessage.className = 'error-message';
        } finally {
            formMessage.style.display = 'block';
        }

        // Store form data (e.g., email) in LocalStorage for future use if desired
        try {
            localStorage.setItem('lastContactEmail', data.email);
            // console.log('Email saved to localStorage:', data.email);
        } catch (error) {
            console.warn('LocalStorage not available or full:', error);
        }
    });

    // Populate email field from LocalStorage if available on modal open
    if (modal) {
        modal.addEventListener('transitionend', () => { // Wait for modal to open
             if (modal.style.display === 'block') {
                try {
                const lastEmail = localStorage.getItem('lastContactEmail');
                if (lastEmail) {
                    document.getElementById('email').value = lastEmail;
                }
            } catch (error) {
                console.warn('Could not read from LocalStorage:', error);
            }
        }
        });
    }


    // Dynamic year for footer
    const currentYear = new Date().getFullYear();
    const yearSpan = document.getElementById('currentYear');
    if (yearSpan) {
        yearSpan.textContent = currentYear;
    }

    // Header scroll background change
    const header = document.querySelector('.main-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) { // Adjust scroll threshold as needed
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Parallax effect for hero section (optional, can be performance intensive)
    // window.addEventListener('scroll', () => {
    //     const scrollPosition = window.scrollY;
    //     heroSection.style.backgroundPositionY = -scrollPosition * 0.5 + 'px';
    // });
});