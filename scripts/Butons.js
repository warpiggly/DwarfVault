// Obtén la referencia a la imagen del enano
const enanoGif = document.getElementById('enanoGif');
    
// Al pasar el ratón por encima
enanoGif.addEventListener('mouseover', function() {
    // Genera un número aleatorio entre 0 y 1
    const randomGif = Math.random() < 0.5 ? 'icons/Final Gif 2.gif' : 'icons/Final Gif 3.gif';
    
    // Cambia el src de la imagen al GIF seleccionado aleatoriamente
    enanoGif.src = randomGif;
});

// Al salir el ratón de la imagen
enanoGif.addEventListener('mouseout', function() {
    enanoGif.src = 'icons/Final Gif.gif'; // Vuelve al GIF original
});