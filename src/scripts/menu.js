document.addEventListener('DOMContentLoaded', function() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');

    hamburger.addEventListener('click', function() {
        navMenu.classList.toggle('show-menu');
    });

    // Cambiar transparencia al hacer scroll y volver a sólido al llegar arriba
    window.addEventListener('scroll', function() {
        const menu = document.querySelector('.hamburger-menu');
        if (window.scrollY > 0) {
            menu.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'; // Más transparente al bajar
        } else {
            menu.style.backgroundColor = 'rgba(0, 0, 0, 1)'; // Sólido al estar arriba
        }
    });
});

