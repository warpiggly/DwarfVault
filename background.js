

// Cuando la extensión se instala o actualiza
chrome.runtime.onInstalled.addListener(() => {
    createContextMenu(); // Crear el menú contextual dinámicamente
});

// Función para crear el menú contextual con las categorías dinámicas
function createContextMenu() {
    // Primero, limpia los menús existentes
    chrome.contextMenus.removeAll(() => {
        // Crear el menú principal
        chrome.contextMenus.create({
            id: "saveText",
            title: "MINAR ⛰️​⛏️ = Guardar texto seleccionado ",
            contexts: ["selection"]
        });

        // Obtener categorías almacenadas
        chrome.storage.local.get({ categories: [] }, (result) => {
            const categories = result.categories;

            // Crear un submenú para cada categoría existente
            categories.forEach((category) => {
                chrome.contextMenus.create({
                    id: `saveText_${category}`,
                    parentId: "saveText",
                    title: category,
                    contexts: ["selection"]
                });
            });
        });
    });
}

// Manejador del clic en el menú contextual
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // Verifica si el clic se realizó en un menú que comienza con "saveText"
    if (info.menuItemId.startsWith("saveText")) {
        const selectedCategory = info.menuItemId.split("_")[1] || "Sin categoría"; // Extrae la categoría seleccionada
        if (info.selectionText.trim()) {
            chrome.storage.local.get({ savedTexts: [] }, (result) => {
                const newText = {
                    text: info.selectionText,
                    category: selectedCategory, // Usar la categoría seleccionada
                    date: new Date().toISOString(),
                    favorite: false,
                    url: tab.url
                };

                const newTexts = result.savedTexts.concat(newText);
                chrome.storage.local.set({ savedTexts: newTexts }, () => {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icon.png',
                        title: 'Texto guardado',
                        message: `El texto seleccionado ha sido guardado en la categoría "${selectedCategory}".`
                    });
                });
            });
        } else {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icon.png',
                title: 'Texto vacío',
                message: 'No se seleccionó texto para guardar.'
            });
        }
    }
});

// Actualiza el menú contextual cada vez que se cambian las categorías
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.categories && namespace === "local") {
        createContextMenu(); // Recrea el menú contextual cuando cambian las categorías
    }
});



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "saveText",
      title: "Guardar texto en Dott-y",
      contexts: ["selection"], // Este menú solo aparecerá al seleccionar texto
      icons: {
        "16": "icons/icon16.png", // Ícono que aparecerá en el menú contextual
        "32": "icons/icon48.png"  // Ícono de mayor resolución si es soportado
      }
    });
  });
  

