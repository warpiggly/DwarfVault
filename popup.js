let currentIndex = null; // Para almacenar el índice del texto actualmente editado

document.addEventListener('DOMContentLoaded', () => {
    loadTexts();
    loadCategories(); // Nueva función para cargar categorías
    loadCategoriesIntoSelect();

    // Evento para guardar texto editado
    document.getElementById('saveEdit').addEventListener('click', () => {
        const newTextValue = document.getElementById('editText').value;
        const newCategoryValue = document.getElementById('editCategory').value;
        const isFavorite = document.getElementById('favoriteCheckbox').checked;
        const newURLValue = document.getElementById('editURL').value;
        if (currentIndex !== null && newTextValue) {
            updateText(currentIndex, newTextValue, newCategoryValue, isFavorite, newURLValue);
        }
    });

//////////////////////////////////////////////////////////////////////////////////////////Añadir Categoria///////////////////////////////////////////////////////////////////
    // Evento para añadir nueva categoría
    document.getElementById('addCategory').addEventListener('click', () => {
        const newCategory = document.getElementById('newCategory').value.trim();
        if (newCategory) {
            chrome.storage.local.get({ categories: [] }, (result) => {
                const categories = result.categories;
                if (!categories.includes(newCategory)) {
                    categories.push(newCategory);
                    chrome.storage.local.set({ categories: categories }, () => {
                        loadCategoriesIntoSelect();
                        loadCategories();
                        alert('Categoría añadida exitosamente.');
                    });
                } else {
                    alert('La categoría ya existe.');
                }
            });
        }
    });

    

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

});



// Modificar la función `loadTexts` para agregar el favicon
function loadTexts() {
    chrome.storage.local.get({ savedTexts: [] }, (result) => {
        const textList = document.getElementById('textList');
        textList.innerHTML = ''; // Limpiar la lista antes de agregar los nuevos elementos
        result.savedTexts.forEach((textObj, index) => {
            const li = document.createElement('li');


            // Obtener el favicon y mostrarlo en grande antes de la categoría
            const faviconUrl = getFaviconUrl(textObj.url);
            if (faviconUrl) {
                const faviconImgLarge = document.createElement('img');
                faviconImgLarge.src = faviconUrl;
                faviconImgLarge.alt = 'Favicon';
                faviconImgLarge.style.width = '32px'; // Tamaño más grande para la visualización
                faviconImgLarge.style.height = '32px';
                faviconImgLarge.style.marginRight = '10px'; // Espacio entre el icono y la categoría
                li.appendChild(faviconImgLarge); // Agregar favicon grande al principio del item
            }

            // Categoría
            const categoryDetail = document.createElement('div');
            categoryDetail.classList.add('item-detail');
            categoryDetail.innerHTML = `<span class="item-label">Categoría:</span> ${textObj.category}`;
            const copyCategoryButton = createCopyButton(textObj.category);
            categoryDetail.appendChild(copyCategoryButton);
            li.appendChild(categoryDetail);

            // Texto
            const textDetail = document.createElement('div');
            textDetail.classList.add('item-detail');
            textDetail.innerHTML = `<span class="item-label">Texto:</span> ${textObj.text}`;
            const copyTextButton = createCopyButton(textObj.text);
            textDetail.appendChild(copyTextButton);
            li.appendChild(textDetail);

            // URL
            const urlDetail = document.createElement('div');
            urlDetail.classList.add('item-detail');
            const urlSpan = document.createElement('span');
            urlSpan.classList.add('item-label');
            urlSpan.textContent = "URL: ";
            const urlText = document.createElement('span');
            urlText.textContent = textObj.url;
            urlText.title = textObj.url; // Tooltip con URL completa
            urlDetail.appendChild(urlSpan);
            urlDetail.appendChild(urlText);
            const copyUrlButton = createCopyButton(textObj.url);
            urlDetail.appendChild(copyUrlButton);

            // Obtener el favicon y mostrarlo
            const getFaviconUrll = getFaviconUrl(textObj.url);
            if (faviconUrl) {
                const faviconImg = document.createElement('img');
                faviconImg.src = faviconUrl;
                faviconImg.alt = 'Favicon';
                faviconImg.style.width = '16px';
                faviconImg.style.height = '16px';
                faviconImg.style.marginRight = '5px';
                urlDetail.prepend(faviconImg); // Insertar el favicon antes del texto de la URL
            }

            li.appendChild(urlDetail);

            // Botones de acción
            const actions = document.createElement('div');
            actions.classList.add('actions');

            // Botón de eliminar
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Eliminar';
            deleteButton.style.marginTop = '5px';
            deleteButton.addEventListener('click', () => {
                deleteText(index);
            });
            actions.appendChild(deleteButton);

            // Botón de editar
            const editButton = document.createElement('button');
            editButton.textContent = 'Editar';
            editButton.style.marginTop = '5px';
            editButton.addEventListener('click', () => {
                editText(index, textObj);
            });
            actions.appendChild(editButton);

            li.appendChild(actions);

            textList.appendChild(li);
        });
    });
}


// Función para extraer el dominio de la URL y construir la URL del favicon
function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        return `${urlObj.origin}/favicon.ico`; // Construye la URL del favicon
    } catch (e) {
        console.error('URL inválida:', e);
        return ''; // Retorna una cadena vacía si la URL es inválida
    }
}

function createCopyButton(content) {
    const button = document.createElement('button');
    button.classList.add('copy-btn');
    button.textContent = 'Copiar';
    button.addEventListener('click', () => {
        copyToClipboard(content);
    });
    return button;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Texto copiado al portapapeles');
    }).catch(err => {
        console.error('Error al copiar el texto: ', err);
    });
}

function deleteText(index) {
    chrome.storage.local.get({ savedTexts: [] }, (result) => {
        const updatedTexts = result.savedTexts;
        updatedTexts.splice(index, 1); // Eliminar el texto del array
        chrome.storage.local.set({ savedTexts: updatedTexts }, () => {
            loadTexts(); // Refrescar la lista después de eliminar
        });
    });
}

function editText(index, textObj) {
    document.getElementById('editText').value = textObj.text;
    document.getElementById('editCategory').value = textObj.category;
    document.getElementById('favoriteCheckbox').checked = textObj.favorite;
    document.getElementById('editURL').value = textObj.url; // Mostrar la URL en el campo de edición
    currentIndex = index; // Establecer el índice del texto a editar
}

function updateText(index, newTextValue, newCategoryValue, isFavorite, newURLValue) {
    chrome.storage.local.get({ savedTexts: [] }, (result) => {
        const updatedTexts = result.savedTexts;
        updatedTexts[index].text = newTextValue; // Actualizar el texto
        updatedTexts[index].category = newCategoryValue; // Actualizar la categoría
        updatedTexts[index].favorite = isFavorite; // Actualizar el estado de favorito
        updatedTexts[index].url = newURLValue; // Actualizar la URL
        chrome.storage.local.set({ savedTexts: updatedTexts }, () => {
            loadTexts(); // Refrescar la lista después de actualizar
            currentIndex = null; // Resetear el índice de edición
            const editText = document.getElementById('editText');
            const editCategory = document.getElementById('editCategory');
            const favoriteCheckbox = document.getElementById('favoriteCheckbox');
            const editURL = document.getElementById('editURL');
            
            editText.value = '';
            editCategory.value = '';
            favoriteCheckbox.checked = false;
            editURL.value = '';
        });
    });
}

// //////////////////////////////////////////////////////////////////////////////////////////Añadir Categoria///////////////////////////////////////////////////////////////////

// Cargar categorías y agregar opciones de edición y eliminación
// Cargar categorías en el selector
function loadCategoriesIntoSelect() {
    chrome.storage.local.get({ categories: [] }, (result) => {
        const categorySelect = document.getElementById('categorySelect');
        categorySelect.innerHTML = ''; // Limpiar el selector de categorías

        // Si hay categorías, agregarlas como opciones al selector
        result.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });

        // Si no hay categorías, mostrar una opción por defecto
        if (result.categories.length === 0) {
            const defaultOption = document.createElement('option');
            defaultOption.textContent = "Sin categoría";
            defaultOption.value = "";
            categorySelect.appendChild(defaultOption);
        }

        // Agregar un event listener al selector de categorías
        categorySelect.addEventListener('change', () => {
            const selectedCategory = categorySelect.value;
            loadCategories(selectedCategory); // Cargar solo la categoría seleccionada
        });

        // Cargar la primera categoría por defecto al cargar la página si hay categorías
        if (result.categories.length > 0) {
            const defaultCategory = result.categories[0];
            categorySelect.value = defaultCategory;
            loadCategories(defaultCategory);
        }
    });
}

// Cargar categorías en la lista para editar/eliminar
function loadCategories(selectedCategory = null) {
    chrome.storage.local.get({ categories: [] }, (result) => {
        const categoryList = document.getElementById('categoryList');
        categoryList.innerHTML = ''; // Limpiar la lista de categorías

        // Mostrar solo la categoría seleccionada
        if (selectedCategory) {
            // Encontrar el índice de la categoría seleccionada
            const index = result.categories.indexOf(selectedCategory);
            if (index !== -1) {
                const li = document.createElement('li');

                // Mostrar el nombre de la categoría
                const categoryName = document.createElement('span');
                categoryName.textContent = selectedCategory;
                li.appendChild(categoryName);

                // Botón de eliminar categoría
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Eliminar';
                deleteButton.style.marginLeft = '10px';
                deleteButton.addEventListener('click', () => {
                    deleteCategory(index);
                });
                li.appendChild(deleteButton);

                // Botón de editar categoría
                const editButton = document.createElement('button');
                editButton.textContent = 'Editar';
                editButton.style.marginLeft = '10px';
                editButton.addEventListener('click', () => {
                    editCategory(index, selectedCategory);
                });
                li.appendChild(editButton);

                categoryList.appendChild(li);
            }
        }
    });
}

// Función para eliminar una categoría
function deleteCategory(index) {
    chrome.storage.local.get({ categories: [] }, (result) => {
        const updatedCategories = result.categories;
        updatedCategories.splice(index, 1); // Eliminar la categoría del array
        chrome.storage.local.set({ categories: updatedCategories }, () => {
            // Actualizar el selector y la lista después de eliminar
            loadCategoriesIntoSelect();
            loadCategories(); // Si no se pasa una categoría, se cargarán todas
        });
    });
}

// Función para editar una categoría
function editCategory(index, oldCategory) {
    const newCategory = prompt(`Editar categoría: ${oldCategory}`, oldCategory); // Solicitar al usuario la nueva categoría
    if (newCategory && newCategory.trim() !== "") {
        chrome.storage.local.get({ categories: [] }, (result) => {
            const updatedCategories = result.categories;
            updatedCategories[index] = newCategory; // Actualizar la categoría
            chrome.storage.local.set({ categories: updatedCategories }, () => {
                // Actualizar el selector y la lista después de editar
                loadCategoriesIntoSelect();
                loadCategories(newCategory); // Cargar la categoría editada
            });
        });
    }
}

// Llamar a esta función cuando se cargue el documento
document.addEventListener('DOMContentLoaded', () => {
    loadCategoriesIntoSelect();
});




/////////////////////////////////////////////////////////////// Función para manejar el clic en los botones de acordeón/////////////////////////////////////////////////////////////// 
function setupAccordion() {
    const buttons = document.querySelectorAll('.accordion-button');

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const content = button.nextElementSibling;
            const isVisible = content.style.display === 'block';

            // Ocultar todos los contenidos
            document.querySelectorAll('.accordion-content').forEach(content => {
                content.style.display = 'none';
            });

            // Mostrar el contenido correspondiente
            if (!isVisible) {
                content.style.display = 'block';
            }
        });
    });
}

// Llamar a la función al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    setupAccordion();

    // Inicializar otras funciones
    loadCategoriesIntoSelect(); // Cargar categorías en el selector
    loadCategories(); // Cargar categorías en la lista para editar/eliminar
});

