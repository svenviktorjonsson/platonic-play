function addToRecentColors(color) {
    const existingIndex = recentColors.indexOf(color);
    
    if (existingIndex !== -1) {
        // Color already exists, just select it
        selectedColorIndices = [existingIndex];
        return;
    }
    
    // Add new color to the beginning
    recentColors.unshift(color);
    
    // Remove excess colors (keep max 8)
    if (recentColors.length > 8) {
        recentColors.pop();
    }
    
    // Update selected indices (shift existing indices by 1 since we added at beginning)
    selectedColorIndices = selectedColorIndices.map(index => {
        if (index >= 0) return index + 1;
        return index; // Keep -1 (random) unchanged
    });
    
    // Select the new color (now at index 0)
    if (!selectedColorIndices.includes(0)) {
        selectedColorIndices.unshift(0);
    }

    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
    }
}

// Updated color picker event handler
function setupColorPickerHandler() {
    colorPicker.addEventListener('change', (e) => {
        const newColor = e.target.value;
        setCurrentColor(newColor);
        addToRecentColors(newColor);
        
        // Ensure the new color is selected
        const newColorIndex = recentColors.indexOf(newColor);
        if (newColorIndex !== -1) {
            selectedColorIndices = [newColorIndex];
        }
        
        if (isColorPaletteExpanded) {
            buildColorPaletteUI();
        }
    });
}

// Updated toolbar color button click handler
function handleColorToolButtonClick() {
    isColorPaletteExpanded = !isColorPaletteExpanded;
    if (isColorPaletteExpanded) {
        buildColorPaletteUI();
        // Ensure current color is selected when opening palette
        if (selectedColorIndices.length === 0) {
            initializeColorPalette();
        }
    } else {
        // Keep selection when closing
        // selectedColorIndices = []; // Remove this line to maintain selection
    }
}

function initializeApp() {
    if (typeof window.katex === 'undefined') {
        console.error("KaTeX library failed to load or initialize. Math rendering will be broken.");
    }
    initializeCanvasUI();
    buildMainToolbarUI();
    resizeCanvas();

    viewTransform.scale = 70;
    viewTransform.offsetX = canvas.width / 2;
    viewTransform.offsetY = canvas.height / 2;
    coordsDisplayMode = 'regular';

    // Initialize color palette with default selection
    initializeColorPalette();
    setCurrentColor(currentColor);
    setupColorPickerHandler();
    
    saveStateForUndo();
    gameLoop();
}