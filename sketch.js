// ================
// GLOBAL VARIABLES
// ===============
let splines = [];
let staticShapes = [];
let draggedPoint = null;
let draggedStaticShape = null;
let draggedSpline = null; 
let dragStartPos = null; 
let backgroundImg = null;
let selectedSpline = null;
let selectedStaticShape = null;
let selectedPoint = null;
let selectedPointIndex = -1;
let selectedSplineIndex = -1;
let isExporting = false;
let exportProgress = 0;
let exportTotalFrames = 0;
let exportFPS = 0;
let exportDuration = 0;
let exportCanvas;
let mediaRecorder;
let recordedChunks = [];
let exportStream = null;
// The authoritative dimensions for the project's aspect ratio and export resolution.
let originalImageDimensions = { width: 1920, height: 800 }; 
// Stores the original dimensions of a loaded background image for the reset function.
let trueOriginalImageDimensions = null;
let canvas;
let appStartTime;
let loopingPreview = true; 
let loopPreviewButton; 
let themeToggleButton;
let exportOverlay, progressBarFill, exportPercentage, exportFrameCount;

// Undo/Redo variables
let history = [];
let historyIndex = -1;
let dragOccurred = false;

// Multi-selection variables
let multiSelection = [];
let selectionBox = null;
let isDraggingSelection = false;

// New variables for spline colors
const splineColors = [
  '#4CAF50', '#F44336', '#FF9800', '#2196F3', '#9C27B0', 
  '#FFEB3B', '#009688', '#E91E63', '#3F51B5', '#B71C1C', 
  '#E65100', '#0D47A1', '#4A148C', '#F57F17'
];
let splineColorIndex = 0;


// New variables for playback control
let isPlayingOnce = false;
const METADATA_MARKER = "SPLINEDATA::";

// =========
// SETUP
// =========
function setup() {
  canvas = createCanvas(originalImageDimensions.width, originalImageDimensions.height); 
  canvas.parent('canvas-container');
  pixelDensity(1);
  appStartTime = millis();
  canvas.drop(gotFile);
  // Prevent the default browser context menu on right-click
  canvas.elt.addEventListener('contextmenu', e => e.preventDefault());
  
  exportOverlay = document.getElementById('export-overlay');
  progressBarFill = document.getElementById('progress-bar-fill');
  exportPercentage = document.getElementById('export-percentage');
  exportFrameCount = document.getElementById('export-frame-count');
  
  // Default to dark mode if no theme is saved or if the saved theme is 'dark'
  const savedTheme = localStorage.getItem('splineEditorTheme');
  if (savedTheme !== 'light') { 
    document.body.classList.add('dark-mode');
  }

  setupEventListeners();
  addNewSpline(); // This will also create the first history state
  
  // A short delay to ensure the DOM layout is complete before the first resize.
  setTimeout(() => {
    windowResized();
  }, 100);
}

function setupCollapsibles() {
    const headers = document.querySelectorAll('.collapsible-header');
    headers.forEach(header => {
        const content = header.nextElementSibling;
        
        // Respect the initial 'collapsed' state from the HTML
        if (!header.classList.contains('collapsed')) {
            // A short timeout can help ensure the DOM is ready for scrollHeight calculation on initial load
            setTimeout(() => {
                 content.style.maxHeight = content.scrollHeight + 'px';
            }, 100);
        }

        header.addEventListener('click', function() {
            this.classList.toggle('collapsed');
            if (content.style.maxHeight && content.style.maxHeight !== '0px'){
              content.style.maxHeight = null; // Collapse it
            } else {
              content.style.maxHeight = content.scrollHeight + "px"; // Expand it
            } 
        });
        
        // Add a listener for when the CSS transition completes to resize the canvas
        content.addEventListener('transitionend', () => {
            // Check if the panel was just opened (maxHeight is not null or 0)
            if (content.style.maxHeight && content.style.maxHeight !== '0px') {
                const scaleCurveEditorEl = content.querySelector('#curve-editor-container');
                const easingCurveEditorEl = content.querySelector('#easing-curve-editor-container');

                // If the corresponding editor exists, trigger its resize function
                if (scaleCurveEditorEl && animCurveEditor) {
                    animCurveEditor.windowResized();
                }
                if (easingCurveEditorEl && easingCurveEditor) {
                    easingCurveEditor.windowResized();
                }
            }
        });
    });
}

function setupEventListeners() {
  setupCollapsibles();

  document.getElementById('deleteSpline').addEventListener('click', deleteSelectedSpline);
  document.getElementById('exportVideo').addEventListener('click', startExport);
  document.getElementById('cancelExport').addEventListener('click', cancelExport);
  document.getElementById('removePoint').addEventListener('click', removeSelectedItem);
  document.getElementById('newSpline').addEventListener('click', addNewSpline);
  document.getElementById('clearAll').addEventListener('click', clearAll);
  document.getElementById('clearBg').addEventListener('click', () => { backgroundImg = null; document.getElementById('bgImage').value = ''; recordState(); });
  document.getElementById('bgImage').addEventListener('change', handleSceneFile);
  document.getElementById('addPoint').addEventListener('click', addPointToSpline);
  document.getElementById('flipX').addEventListener('click', () => flipSpline(true));
  document.getElementById('flipY').addEventListener('click', () => flipSpline(false));
  document.getElementById('addShape').addEventListener('click', addStaticShape);
  document.getElementById('updateCanvasSize').addEventListener('click', updateCanvasSize);
  document.getElementById('resetCanvasSize').addEventListener('click', resetCanvasSize);
  document.getElementById('cloneItem').addEventListener('click', cloneSelectedItem);
  document.getElementById('playOnce').addEventListener('click', playOnce);
  loopPreviewButton = document.getElementById('loopPreview');
  loopPreviewButton.addEventListener('click', toggleLooping);
  themeToggleButton = document.getElementById('themeToggle');
  themeToggleButton.addEventListener('click', toggleTheme);
  
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  
  document.getElementById('exportCanvas').addEventListener('click', exportScene);
  document.getElementById('loadCanvasBtn').addEventListener('click', () => document.getElementById('loadCanvas').click());
  document.getElementById('loadCanvas').addEventListener('change', handleSceneFile);

  // Add listeners for the reset buttons
  document.getElementById('resetCurveBtn').addEventListener('click', resetSelectedCurve);
  document.getElementById('resetEasingCurveBtn').addEventListener('click', resetSelectedEasingCurve);
  
  // Add paste event listener
  window.addEventListener('paste', handlePaste);

  if (document.body.classList.contains('dark-mode')) {
    themeToggleButton.textContent = 'Switch to Light Mode';
  } else {
    themeToggleButton.textContent = 'Switch to Dark Mode';
  }
  
  // NEW: Consolidated event listeners for multi-edit
  const allControls = [
      // Spline Settings
      'selectedStartFrame', 'selectedTotalFrames', 'selectedTension', 'selectedHideOnComplete',
      // Anchor Settings
      'anchorStartFrame', 'anchorTotalFrames', 'anchorHideOnComplete',
      // Shape Settings
      'selectedType', 'selectedFillColor', 'selectedStrokeColor', 'selectedStrokeWeight',
      'selectedSizeX', 'selectedSizeY'
  ];

  allControls.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
          element.addEventListener('input', handleSettingChange);
          element.addEventListener('change', recordState); // Record state on final change
      }
  });

  document.getElementById('exportFPS').addEventListener('change', recordState);
  document.getElementById('exportTotalFrames').addEventListener('change', recordState);


  const canvasContainer = document.getElementById('canvas-container');
  canvasContainer.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); canvasContainer.classList.add('dragging-over'); });
  canvasContainer.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); canvasContainer.classList.remove('dragging-over'); });
  canvasContainer.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); canvasContainer.classList.remove('dragging-over'); });

  setupDraggableInputs();
  
  // Add a small delay to ensure editor instances are created before we override their callbacks.
  setTimeout(() => {
    if (animCurveEditor) {
        // Override the default callback to our multi-edit handler.
        animCurveEditor.onCurveChanged = handleScaleCurveChange;
    }
    if (easingCurveEditor) {
        // Override the default callback to our multi-edit handler.
        easingCurveEditor.onCurveChanged = handleEasingCurveChange;
    }
  }, 100);
}

// =========
// DRAW
// =========
function draw() {
  clear(); 
  
  if (backgroundImg) {
    image(backgroundImg, 0, 0, width, height);
  }

  push();
  const borderColor = document.body.classList.contains('dark-mode') ? '#212529' : '#C5C5C5';
  stroke(borderColor);
  strokeWeight(5);
  noFill();
  rect(0, 0, width - 1, height - 1);
  pop();
  
  drawAllSplines();
  drawStaticShapes();
  drawSelectionBox();

  if (isPlayingOnce) {
    const exportFpsValue = parseInt(document.getElementById('exportFPS').value) || 16;
    const exportTotalFramesValue = parseInt(document.getElementById('exportTotalFrames').value) || 80;
    const playOnceDurationMs = (exportTotalFramesValue / exportFpsValue) * 1000;
    if (millis() - appStartTime >= playOnceDurationMs) {
      isPlayingOnce = false; 
    }
  }

  drawMovingShapes();
  if (draggedPoint) { drawDragIndicator(); }
}

// ======================================
// UNDO / REDO SYSTEM
// ======================================
function captureState() {
    const serializableSplines = splines.map(s => {
        const splineCopy = { ...s };
        splineCopy.points = s.points.map(p => ({ x: p.x, y: p.y }));
        splineCopy.scaleCurve = s.scaleCurve.map(pt => ({ ...pt }));
        splineCopy.easingCurve = s.easingCurve.map(pt => ({ ...pt }));
        return splineCopy;
    });

    const serializableStaticShapes = staticShapes.map(s => {
        const shapeCopy = { ...s };
        shapeCopy.pos = { x: s.pos.x, y: s.pos.y };
        shapeCopy.scaleCurve = s.scaleCurve.map(pt => ({ ...pt }));
        return shapeCopy;
    });

    return {
        splines: serializableSplines,
        staticShapes: serializableStaticShapes,
        exportFPS: parseInt(document.getElementById('exportFPS').value),
        exportTotalFrames: parseInt(document.getElementById('exportTotalFrames').value),
        splineColorIndex: splineColorIndex,
    };
}

function applyState(state) {
    splines = state.splines.map(s => {
        const splineCopy = { ...s };
        splineCopy.points = s.points.map(p => createVector(p.x, p.y));
        splineCopy.scaleCurve = s.scaleCurve ? s.scaleCurve.map(pt => ({ ...pt })) : [{x: 0, y: 0}, {x: 1, y: 0}];
        splineCopy.easingCurve = s.easingCurve ? s.easingCurve.map(pt => ({...pt})) : [{x: 0, y: 0}, {x: 1, y: 1}];
        return splineCopy;
    });

    staticShapes = state.staticShapes.map(s => {
        const shapeCopy = { ...s };
        shapeCopy.pos = createVector(s.pos.x, s.pos.y);
        shapeCopy.scaleCurve = s.scaleCurve ? s.scaleCurve.map(pt => ({ ...pt })) : [{x: 0, y: 0}, {x: 1, y: 0}];
        return shapeCopy;
    });

    document.getElementById('exportFPS').value = state.exportFPS;
    document.getElementById('exportTotalFrames').value = state.exportTotalFrames;
    splineColorIndex = state.splineColorIndex;

    selectedSpline = null;
    selectedStaticShape = null;
    selectedPoint = null;
    multiSelection = [];
    if (splines.length > 0) {
        selectSpline(splines[splines.length - 1]);
    } else if (staticShapes.length > 0) {
        selectStaticShape(staticShapes[staticShapes.length - 1]);
    } else {
        updateSelectedItemUI();
    }
}

function recordState() {
    historyIndex++;
    history[historyIndex] = captureState();
    history.length = historyIndex + 1;
    updateUndoRedoButtons();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        applyState(history[historyIndex]);
        updateUndoRedoButtons();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        applyState(history[historyIndex]);
        updateUndoRedoButtons();
    }
}

function updateUndoRedoButtons() {
    document.getElementById('undoBtn').disabled = historyIndex <= 0;
    document.getElementById('redoBtn').disabled = historyIndex >= history.length - 1;
}

// ======================================
// MULTI-EDIT AND UI MANAGEMENT
// ======================================

/**
 * Helper function to get the owner object (spline or static shape) of a selection item.
 * An "owner" is the object that holds the properties we want to edit.
 * @param {any} item - The selected item (can be a point, a spline, or a static shape).
 * @returns {object|null} The owner object or null if not found.
 */
function getOwnerOfItem(item) {
    if (!item) return null;
    // If item is a static shape, it's its own owner.
    if (item.isStatic) {
        return item;
    }
    // If item is a spline object itself (from a single selection)
    if (item.points && Array.isArray(item.points)) {
        return item;
    }
    // If item is a point (p5.Vector), find its parent spline.
    for (const spline of splines) {
        if (spline.points.includes(item)) {
            return spline;
        }
    }
    return null; // Not a recognized ownable item
}

/**
 * Central handler for all setting changes from the UI controls.
 * Applies the new value to all selected items that have the corresponding property.
 * @param {Event} event - The input event from a UI control element.
 */
function handleSettingChange(event) {
    const element = event.target;
    const propertyMap = {
        'selectedStartFrame': { name: 'startFrame', type: 'int' },
        'selectedTotalFrames': { name: 'totalFrames', type: 'int' },
        'selectedTension': { name: 'tension', type: 'float' },
        'selectedHideOnComplete': { name: 'hideOnComplete', type: 'bool' },
        'anchorStartFrame': { name: 'startFrame', type: 'int' },
        'anchorTotalFrames': { name: 'totalFrames', type: 'int' },
        'anchorHideOnComplete': { name: 'hideOnComplete', type: 'bool' },
        'selectedType': { name: 'shapeType', type: 'string' },
        'selectedFillColor': { name: 'fillColor', type: 'string' },
        'selectedStrokeColor': { name: 'strokeColor', type: 'string' },
        'selectedStrokeWeight': { name: 'strokeWeight', type: 'float' },
        'selectedSizeX': { name: 'shapeSizeX', type: 'int' },
        'selectedSizeY': { name: 'shapeSizeY', type: 'int' },
    };

    const mapping = propertyMap[element.id];
    if (!mapping) return;

    let value;
    switch (mapping.type) {
        case 'int':
            value = parseInt(element.value, 10);
            break;
        case 'float':
            value = parseFloat(element.value);
            break;
        case 'bool':
            value = element.checked;
            break;
        default:
            value = element.value;
    }
    
    // Determine which items to update based on the current selection mode
    const itemsToUpdate = multiSelection.length > 0 
        ? multiSelection 
        : [selectedSpline, selectedStaticShape].filter(Boolean);
    
    // Get a unique set of owner objects to avoid applying changes multiple times
    const uniqueOwners = new Set(itemsToUpdate.map(getOwnerOfItem).filter(Boolean));
    
    uniqueOwners.forEach(owner => {
        // Only apply the property if the owner actually has it
        if (owner.hasOwnProperty(mapping.name)) {
            owner[mapping.name] = value;
        }
    });
}

/**
 * Updates the sidebar UI based on the current selection (single or multiple).
 * Manages which control panels are visible and what values they display.
 */
function updateSelectedItemUI() {
    const splineSection = document.getElementById('spline-settings-section');
    const anchorSection = document.getElementById('anchor-settings-section');
    const shapeSection = document.getElementById('shape-settings-section');
    const allSections = document.querySelectorAll('#spline-controls .collapsible-section');
    const settingsHeader = document.getElementById('spline-controls').querySelector('h3');

    // Determine what is selected
    const itemsInSelection = multiSelection.length > 0 
        ? multiSelection 
        : [selectedSpline, selectedStaticShape].filter(Boolean);

    // Hide all item-specific sections initially
    splineSection.style.display = 'none';
    anchorSection.style.display = 'none';
    shapeSection.style.display = 'none';

    if (itemsInSelection.length === 0) {
        settingsHeader.textContent = 'Settings';
        if (animCurveEditor) animCurveEditor.setActiveCurve(null);
        if (easingCurveEditor) easingCurveEditor.setActiveCurve(null);
    } else {
        if (multiSelection.length > 0) {
            settingsHeader.textContent = `(${multiSelection.length} Items Selected)`;
        } else {
            settingsHeader.textContent = 'Settings';
        }

        const owners = itemsInSelection.map(getOwnerOfItem).filter(Boolean);
        const uniqueOwners = [...new Set(owners)];
        
        if (uniqueOwners.length === 0) return;

        // Use the first owner for populating UI, and the first spline owner for spline-specific fields
        const firstOwner = uniqueOwners[0];
        const firstSplineOwner = uniqueOwners.find(o => !o.isStatic) || firstOwner;

        const hasSpline = uniqueOwners.some(o => !o.isStatic);
        const hasAnchor = uniqueOwners.some(o => o.isStatic);

        // VISIBILITY LOGIC: Show panels based on selection and user rules
        shapeSection.style.display = 'block'; // Always show shape settings
        if (hasSpline) {
            splineSection.style.display = 'block'; // If any spline is selected, show spline settings
        } else if (hasAnchor) {
            anchorSection.style.display = 'block'; // Otherwise, if only anchors, show anchor settings
        }

        // POPULATE UI: Use values from the first selected item as a baseline
        // Shape Settings (shared by all)
        document.getElementById('selectedType').value = firstOwner.shapeType;
        document.getElementById('selectedFillColor').value = firstOwner.fillColor;
        document.getElementById('selectedStrokeColor').value = firstOwner.strokeColor;
        document.getElementById('selectedStrokeWeight').value = firstOwner.strokeWeight;
        document.getElementById('selectedSizeX').value = firstOwner.shapeSizeX;
        document.getElementById('selectedSizeY').value = firstOwner.shapeSizeY;

        // Spline/Anchor Settings
        if (splineSection.style.display === 'block') {
            document.getElementById('selectedStartFrame').value = firstSplineOwner.startFrame;
            document.getElementById('selectedTotalFrames').value = firstSplineOwner.totalFrames;
            document.getElementById('selectedHideOnComplete').checked = firstSplineOwner.hideOnComplete;
            document.getElementById('selectedTension').value = firstSplineOwner.tension;
        } else if (anchorSection.style.display === 'block') {
            document.getElementById('anchorStartFrame').value = firstOwner.startFrame;
            document.getElementById('anchorTotalFrames').value = firstOwner.totalFrames;
            document.getElementById('anchorHideOnComplete').checked = firstOwner.hideOnComplete;
        }

        // CURVE EDITORS: Set the active curve based on the first item in the selection
        if (animCurveEditor) animCurveEditor.setActiveCurve(firstOwner.scaleCurve);
        if (easingCurveEditor) {
            easingCurveEditor.setActiveCurve(hasSpline ? firstSplineOwner.easingCurve : null);
        }
    }

    // DIVIDER FIX LOGIC: Ensure separators appear correctly between visible sections
    let firstVisibleFound = false;
    allSections.forEach(section => {
        const isVisible = section.style.display !== 'none';
        section.classList.remove('has-top-divider');
        if (isVisible) {
            if (firstVisibleFound) {
                section.classList.add('has-top-divider');
            }
            firstVisibleFound = true;
        }
    });
}

/**
 * Handles changes from the scale curve editor and applies them to all selected items.
 * This function is set as the callback for the animCurveEditor.
 * @param {boolean} [isFinal=true] - True if this is the final change (e.g., mouse release), false if it's a live update (e.g., mouse drag).
 */
function handleScaleCurveChange(isFinal = true) {
    const itemsToUpdate = multiSelection.length > 0 
        ? multiSelection 
        : [selectedSpline, selectedStaticShape].filter(Boolean);

    const uniqueOwners = [...new Set(itemsToUpdate.map(getOwnerOfItem).filter(Boolean))];

    if (uniqueOwners.length > 1) { 
        const masterCurve = uniqueOwners[0].scaleCurve;
        if (masterCurve) {
            // Apply this master curve to all other selected owners, skipping the first one.
            for (let i = 1; i < uniqueOwners.length; i++) {
                const owner = uniqueOwners[i];
                if (owner.hasOwnProperty('scaleCurve')) {
                    owner.scaleCurve = JSON.parse(JSON.stringify(masterCurve));
                }
            }
        }
    }
    
    // Only record state for the undo system if it's the final change.
    if (isFinal) {
        recordState();
    }
}

/**
 * Handles changes from the path easing curve editor and applies them to all selected splines.
 * This function is set as the callback for the easingCurveEditor.
 * @param {boolean} [isFinal=true] - True if this is the final change, false for live updates.
 */
function handleEasingCurveChange(isFinal = true) {
    const itemsToUpdate = multiSelection.length > 0 
        ? multiSelection 
        : [selectedSpline].filter(Boolean);

    const uniqueOwners = [...new Set(itemsToUpdate.map(getOwnerOfItem).filter(o => o && !o.isStatic))];

    if (uniqueOwners.length > 1) {
        const masterCurve = uniqueOwners[0].easingCurve;
        if (masterCurve) {
            // Apply this master curve to all other selected spline owners, skipping the first one.
            for (let i = 1; i < uniqueOwners.length; i++) {
                const owner = uniqueOwners[i];
                if (owner.hasOwnProperty('easingCurve')) {
                    owner.easingCurve = JSON.parse(JSON.stringify(masterCurve));
                }
            }
        }
    }

    if (isFinal) {
        recordState();
    }
}

// ======================================
// ITEM CREATION AND SELECTION LOGIC
// ======================================
function addNewSpline() {
  const exportFrames = parseInt(document.getElementById('exportTotalFrames').value) || 80;
  const defaultSettings = {
    startFrame: 0, 
    totalFrames: exportFrames, 
    shapeSizeX: 15, 
    shapeSizeY: 15, 
    shapeType: 'square',
    fillColor: '#000000', 
    strokeColor: '#ffffff', 
    strokeWeight: 0.5, 
    tension: 0,
    hideOnComplete: true, 
    scaleCurve: [{x: 0, y: 0}, {x: 1, y: 0}], // Default scale is 1x (factor of 0)
    easingCurve: [{x: 0, y: 0}, {x: 1, y: 1}] // Default easing is linear
  };
  const yOffset = (splines.length % 10) * 20;
  const newSpline = { 
    ...defaultSettings, 
    points: [createVector(width * 0.25, height / 2 - 50 + yOffset), createVector(width * 0.75, height / 2 - 50 + yOffset)],
    lineColor: splineColors[splineColorIndex]
  };
  splineColorIndex = (splineColorIndex + 1) % splineColors.length;
  splines.push(newSpline);
  selectSpline(newSpline);
  recordState();
}

function addStaticShape() {
  const exportFrames = parseInt(document.getElementById('exportTotalFrames').value) || 80;
  const defaultSettings = {
    shapeSizeX: 15, 
    shapeSizeY: 15, 
    shapeType: 'square',
    fillColor: '#000000', 
    strokeColor: '#ffffff', 
    strokeWeight: 0.5,
    startFrame: 0, 
    totalFrames: exportFrames, 
    hideOnComplete: true, 
    isStatic: true,
    scaleCurve: [{x: 0, y: 0}, {x: 1, y: 0}]
  };
  const xOffset = (staticShapes.length % 5) * 20;
  const yOffset = (staticShapes.length % 5) * 20;
  const newShape = { ...defaultSettings, pos: createVector(width / 2 + xOffset, height / 2 + yOffset) };
  staticShapes.push(newShape);
  selectStaticShape(newShape);
  recordState();
}

/**
 * Resets the scale animation curve of the currently selected item(s) to its default state.
 */
function resetSelectedCurve() {
    const itemsToUpdate = multiSelection.length > 0 ? multiSelection : [selectedSpline, selectedStaticShape].filter(Boolean);
    const uniqueOwners = new Set(itemsToUpdate.map(getOwnerOfItem).filter(Boolean));

    if (uniqueOwners.size > 0) {
        uniqueOwners.forEach(owner => {
            if (owner.hasOwnProperty('scaleCurve')) {
                owner.scaleCurve = [{x: 0, y: 0}, {x: 1, y: 0}];
            }
        });
        // Update the editor to show the curve of the first affected item
        if (animCurveEditor) animCurveEditor.setActiveCurve([...uniqueOwners][0].scaleCurve);
        recordState();
    }
}

/**
 * Resets the path easing curve of the currently selected spline(s) to its default state.
 */
function resetSelectedEasingCurve() {
    const itemsToUpdate = multiSelection.length > 0 ? multiSelection : [selectedSpline].filter(Boolean);
    const uniqueOwners = new Set(itemsToUpdate.map(getOwnerOfItem).filter(Boolean));
    
    let firstEasingCurve = null;

    if (uniqueOwners.size > 0) {
        uniqueOwners.forEach(owner => {
            // Only apply to splines, which have easing curves
            if (owner.hasOwnProperty('easingCurve')) {
                owner.easingCurve = [{x: 0, y: 0}, {x: 1, y: 1}];
                if (!firstEasingCurve) {
                    firstEasingCurve = owner.easingCurve;
                }
            }
        });
        
        if (easingCurveEditor && firstEasingCurve) {
            easingCurveEditor.setActiveCurve(firstEasingCurve);
        }
        recordState();
    }
}

function deleteSelectedSpline() {
  if (multiSelection.length > 0) {
    removeSelectedItem();
    return;
  }
  
  if (selectedSpline) {
    const index = splines.indexOf(selectedSpline);
    if (index > -1) {
      splines.splice(index, 1);
      selectedSpline = null;
      selectedPoint = null;
      if (splines.length > 0) {
        selectSpline(splines[splines.length - 1]);
      } else if (staticShapes.length > 0) {
        selectStaticShape(staticShapes[staticShapes.length - 1]);
      } else {
        updateSelectedItemUI();
      }
      recordState();
    }
  } else {
    alert("No spline selected to delete.");
  }
}


function selectSpline(spline) {
  selectedSpline = spline;
  selectedStaticShape = null;
  multiSelection = [];
  updateSelectedItemUI();
}

function selectStaticShape(shape) {
  selectedStaticShape = shape;
  selectedSpline = null;
  selectedPoint = null;
  multiSelection = [];
  updateSelectedItemUI();
}


function clearAll() {
  splines = [];
  staticShapes = [];
  selectedSpline = null;
  selectedStaticShape = null;
  selectedPoint = null;
  multiSelection = [];
  appStartTime = millis();
  splineColorIndex = 0;
  recordState();
  addNewSpline();
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  let theme;
  if (document.body.classList.contains('dark-mode')) {
    theme = 'dark';
    themeToggleButton.textContent = 'Switch to Light Mode';
  } else {
    theme = 'light';
    themeToggleButton.textContent = 'Switch to Dark Mode';
  }
  localStorage.setItem('splineEditorTheme', theme);
  if (animCurveEditor) animCurveEditor.redraw();
  if (easingCurveEditor) easingCurveEditor.redraw();
}

// ==============
// DRAWING (Helper functions)
// ==============
function drawAllSplines(c = window) {
  for (let spline of splines) {
    drawSpline(spline, spline === selectedSpline, c);
    for (let i = 0; i < spline.points.length; i++) {
      drawDirectionalArrow(spline.points[i], spline, i, c);
    }
  }
}

function drawStaticShapes(c = window) {
  for (const shape of staticShapes) {
    const playbackState = getObjectPlaybackState(shape);
    const isMultiSelected = multiSelection.includes(shape);
    
    c.push();

    let finalSizeX = shape.shapeSizeX;
    let finalSizeY = shape.shapeSizeY;

    if (playbackState.isVisible && animCurveEditor) {
        let scaleMultiplier = animCurveEditor.getScaleAtTime(shape.scaleCurve, playbackState.rawProgress);
        finalSizeX *= scaleMultiplier;
        finalSizeY *= scaleMultiplier;
    }
    
    if (!playbackState.isVisible) {
      let f = color(shape.fillColor);
      let s = color(shape.strokeColor);
      f.setAlpha(60);
      s.setAlpha(100);
      c.fill(f);
      c.stroke(s);
    } else {
      c.fill(shape.fillColor);
      c.stroke(shape.strokeColor);
    }

    c.strokeWeight(shape.strokeWeight);
    
    c.push();
    c.translate(shape.pos.x, shape.pos.y);
    drawShapeOnCanvas(c, shape.shapeType, finalSizeX, finalSizeY);
    c.pop();

    if (shape === selectedStaticShape || isMultiSelected) {
      let highlightColor = color(isMultiSelected ? '#FF8C00' : '#0095E8');
      if (!playbackState.isVisible) {
        highlightColor.setAlpha(150);
      }
      c.noFill();
      c.stroke(highlightColor);
      c.strokeWeight(isMultiSelected ? 2 : 3);
      c.rectMode(CENTER);
      c.rect(shape.pos.x, shape.pos.y, shape.shapeSizeX + 15, shape.shapeSizeY + 15);
    }
    
    c.pop();
  }
}

function drawSpline(spline, isSelected, c = window) {
  if (spline.points.length < 2) return;
  
  const allPointsSelected = spline.points.length > 0 && spline.points.every(p => multiSelection.includes(p));

  c.noFill();
  c.stroke(isSelected || allPointsSelected ? '#ff0000' : spline.lineColor);
  c.strokeWeight(isSelected || allPointsSelected ? 3 : 2);
  c.beginShape();
  c.vertex(spline.points[0].x, spline.points[0].y);
  const tension = spline.tension / 6.0;
  for (let i = 0; i < spline.points.length - 1; i++) {
    const p1 = spline.points[i];
    const p2 = spline.points[i + 1];
    const p0 = i > 0 ? spline.points[i - 1] : p1;
    const p3 = i < spline.points.length - 2 ? spline.points[i + 2] : p2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    c.bezierVertex(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  c.endShape();
}

function drawDirectionalArrow(p, spline, pointIndex, c = window) {
    if (spline.points.length < 2) return;
    let direction;
    const arrowSize = 12;

    if (spline.points.length >= 2) {
        if (pointIndex === 0) {
            if (spline.points.length > 1) direction = p5.Vector.sub(getPointOnSegment(spline, 0, 0.01), p);
        } else if (pointIndex === spline.points.length - 1) {
             if (spline.points.length > 1) direction = p5.Vector.sub(p, getPointOnSegment(spline, pointIndex - 1, 0.99));
        } else {
            const prev = spline.points[pointIndex - 1];
            const next = spline.points[pointIndex + 1];
            direction = createVector(next.x - prev.x, next.y - prev.y);
        }
    }
    if (!direction) direction = createVector(1, 0);

    direction.normalize().mult(arrowSize);
    const isSelected = (selectedPoint === p);
    const isMultiSelected = multiSelection.includes(p);
    c.push();
    c.translate(p.x, p.y);
    c.rotate(direction.heading());
    if (isSelected || isMultiSelected) {
        fill(isMultiSelected ? '#FF8C00' : '#FF0000');
        stroke(isMultiSelected ? '#cc7000' : '#cc0000');
    } else {
        fill(0, 150, 255, 153);
        stroke(0, 100, 255);
    }
    c.strokeWeight(1.5);
    c.beginShape();
    c.vertex(arrowSize, 0);
    c.vertex(-arrowSize * 0.6, arrowSize * 0.5);
    c.vertex(-arrowSize * 0.3, 0);
    c.vertex(-arrowSize * 0.6, -arrowSize * 0.5);
    c.endShape(CLOSE);
    c.pop();
}

function drawMovingShapes(c = window) {
  for (let spline of splines) {
    if (spline.points.length < 2) continue;
    
    const state = getObjectPlaybackState(spline);
    
    if (!state.isVisible) {
        continue;
    }

    const pos = getPointAtDistance(spline, state.easedProgress * calculateSplineLength(spline))?.point;
    if (!pos) continue;

    // Get scale from animation curve
    let scaleMultiplier = 1;
    if (animCurveEditor) {
        scaleMultiplier = animCurveEditor.getScaleAtTime(spline.scaleCurve, state.rawProgress);
    }

    c.fill(spline.fillColor);
    c.stroke(spline.strokeColor);
    c.strokeWeight(spline.strokeWeight);
    c.push();
    c.translate(pos.x, pos.y);
    drawShapeOnCanvas(c, spline.shapeType, spline.shapeSizeX * scaleMultiplier, spline.shapeSizeY * scaleMultiplier);
    c.pop();
  }
}

function drawSelectionBox() {
    if (selectionBox) {
        push();
        fill(0, 100, 255, 50);
        stroke(0, 100, 255, 200);
        strokeWeight(1.5);
        drawingContext.setLineDash([6, 3]);

        const x = selectionBox.w > 0 ? selectionBox.x : selectionBox.x + selectionBox.w;
        const y = selectionBox.h > 0 ? selectionBox.y : selectionBox.y + selectionBox.h;
        const w = abs(selectionBox.w);
        const h = abs(selectionBox.h);
        rect(x, y, w, h);

        drawingContext.setLineDash([]);
        pop();
    }
}

function drawDragIndicator() { /* ... */ }


// ======================================
// SELECTION HELPER FUNCTIONS
// ======================================
function toggleItemInMultiSelection(item) {
    const index = multiSelection.indexOf(item);
    if (index > -1) {
        multiSelection.splice(index, 1);
    } else {
        multiSelection.push(item);
    }
}

function toggleSplineInMultiSelection(spline) {
    const allPointsSelected = spline.points.length > 0 && spline.points.every(p => multiSelection.includes(p));

    if (allPointsSelected) {
        multiSelection = multiSelection.filter(item => !spline.points.includes(item));
    } else {
        spline.points.forEach(p => {
            if (!multiSelection.includes(p)) {
                multiSelection.push(p);
            }
        });
    }
}


// ==============
// INTERACTION
// ==============
function keyPressed() {
    // Check if an input field is focused. If so, don't trigger hotkeys.
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "SELECT")) {
        return;
    }
    
    if (keyIsDown(CONTROL)) {
        if (key.toLowerCase() === 'z') {
            undo();
        } else if (key.toLowerCase() === 'y') {
            redo();
        }
    }
    
    // Check for the "Delete" key
    if (keyCode === DELETE) {
        removeSelectedItem();
    }
}

function mousePressed(event) {
    // First, check if the mouse press was on the canvas itself.
    if (event && event.target.id !== 'defaultCanvas0') {
        return;
    }
    
    if (isExporting) return;

    // Handle right-click for deletion with priority: Point > Anchor > Spline
    if (mouseButton === RIGHT) {
        // Priority 1: Delete a point on a spline
        for (let s = splines.length - 1; s >= 0; s--) {
            const spline = splines[s];
            // A spline must have at least 3 points to allow one to be deleted.
            if (spline.points.length > 2) {
                for (let i = 0; i < spline.points.length; i++) {
                    const p = spline.points[i];
                    if (dist(mouseX, mouseY, p.x, p.y) < 15) {
                        // Remove the point from the spline
                        spline.points.splice(i, 1);

                        // If the point was in multi-selection, remove it
                        const multiIndex = multiSelection.indexOf(p);
                        if (multiIndex > -1) multiSelection.splice(multiIndex, 1);

                        // Clear single-point selection if it was this point
                        if (selectedPoint === p) {
                            selectedPoint = null;
                            selectedPointIndex = -1;
                        }

                        recordState();
                        updateSelectedItemUI();
                        return; // Point deleted, action is complete.
                    }
                }
            }
        }
        
        // Priority 2: Delete a static shape (anchor)
        for (let i = staticShapes.length - 1; i >= 0; i--) {
            const shape = staticShapes[i];
            // Use a bounding box check to see if the click is on the anchor
            if (mouseX > shape.pos.x - shape.shapeSizeX / 2 && mouseX < shape.pos.x + shape.shapeSizeX / 2 &&
                mouseY > shape.pos.y - shape.shapeSizeY / 2 && mouseY < shape.pos.y + shape.shapeSizeY / 2) {
                
                const deletedShape = staticShapes.splice(i, 1)[0];
                
                // Update selection if the deleted shape was selected
                const multiIndex = multiSelection.indexOf(deletedShape);
                if (multiIndex > -1) multiSelection.splice(multiIndex, 1);
                if (selectedStaticShape === deletedShape) selectedStaticShape = null;

                recordState();
                updateSelectedItemUI();
                return; // Anchor deleted, action is complete.
            }
        }

        // Priority 3: Delete a whole spline
        for (let i = splines.length - 1; i >= 0; i--) {
            const spline = splines[i];
            if (isMouseOnSpline(spline, 20)) {
                const deletedSpline = splines.splice(i, 1)[0];
                
                // Remove any of the deleted spline's points from multi-selection
                multiSelection = multiSelection.filter(item => !deletedSpline.points.includes(item));
                
                // Update selection if the deleted spline was selected
                if (selectedSpline === deletedSpline) {
                    selectedSpline = null;
                    selectedPoint = null;
                }

                recordState();
                updateSelectedItemUI();
                return; // Spline deleted, action is complete.
            }
        }
    }


    if (mouseButton === LEFT) {
        if (keyIsDown(CONTROL)) {
            if (selectedStaticShape) {
                if (!multiSelection.includes(selectedStaticShape)) multiSelection.push(selectedStaticShape);
            }
            if (selectedSpline) {
                const targetItems = selectedPoint ? [selectedPoint] : selectedSpline.points;
                targetItems.forEach(p => {
                    if (!multiSelection.includes(p)) {
                        multiSelection.push(p);
                    }
                });
            }
            
            selectedSpline = null;
            selectedStaticShape = null;
            selectedPoint = null;

            let clickedOnSomething = false;
            
            for (let i = staticShapes.length - 1; i >= 0; i--) {
                const shape = staticShapes[i];
                if (mouseX > shape.pos.x - shape.shapeSizeX / 2 && mouseX < shape.pos.x + shape.shapeSizeX / 2 &&
                    mouseY > shape.pos.y - shape.shapeSizeY / 2 && mouseY < shape.pos.y + shape.shapeSizeY / 2) {
                    toggleItemInMultiSelection(shape);
                    clickedOnSomething = true;
                    break;
                }
            }

            if (!clickedOnSomething) {
                for (let s = splines.length - 1; s >= 0; s--) {
                    const spline = splines[s];
                    for (let i = 0; i < spline.points.length; i++) {
                        const p = spline.points[i];
                        if (dist(mouseX, mouseY, p.x, p.y) < 15) {
                            toggleItemInMultiSelection(p);
                            clickedOnSomething = true;
                            break;
                        }
                    }
                    if (clickedOnSomething) break;
                }
            }

            if (!clickedOnSomething) {
                for (let i = splines.length - 1; i >= 0; i--) {
                    const spline = splines[i];
                    if (isMouseOnSpline(spline, 20)) {
                        toggleSplineInMultiSelection(spline);
                        clickedOnSomething = true;
                        break;
                    }
                }
            }

            if (!clickedOnSomething) {
                multiSelection = [];
                selectionBox = { x: mouseX, y: mouseY, w: 0, h: 0 };
            }

            updateSelectedItemUI();
            return;
        }

        if (multiSelection.length > 0) {
            let canStartDrag = false;
            for (const item of multiSelection) {
                const itemPos = item.pos || item;
                if (itemPos && dist(mouseX, mouseY, itemPos.x, itemPos.y) < 20) {
                    canStartDrag = true;
                    break;
                }
            }
            if (!canStartDrag) {
                for (const spline of splines) {
                    const isSplineSelected = spline.points.length > 0 && spline.points.every(p => multiSelection.includes(p));
                    if (isSplineSelected && isMouseOnSpline(spline, 20)) {
                        canStartDrag = true;
                        break;
                    }
                }
            }
            
            if (canStartDrag) {
                isDraggingSelection = true;
                dragStartPos = createVector(mouseX, mouseY);
                return;
            }
        }

        multiSelection = [];
        isDraggingSelection = false;
        
        for (let i = staticShapes.length - 1; i >= 0; i--) {
            const shape = staticShapes[i];
            if (mouseX > shape.pos.x - shape.shapeSizeX / 2 && mouseX < shape.pos.x + shape.shapeSizeX / 2 &&
                mouseY > shape.pos.y - shape.shapeSizeY / 2 && mouseY < shape.pos.y + shape.shapeSizeY / 2) {
                draggedStaticShape = shape;
                selectStaticShape(shape);
                return;
            }
        }

        for (let s = splines.length - 1; s >= 0; s--) {
            const spline = splines[s];
            for (let i = 0; i < spline.points.length; i++) {
                const p = spline.points[i];
                if (dist(mouseX, mouseY, p.x, p.y) < 15) {
                    draggedPoint = p;
                    selectedPoint = p;
                    selectedPointIndex = i;
                    selectedSplineIndex = s;
                    selectSpline(spline);
                    return;
                }
            }
        }

        for (let i = splines.length - 1; i >= 0; i--) {
            const spline = splines[i];
            if (isMouseOnSpline(spline, 20)) { 
                draggedSpline = spline;
                selectSpline(spline);
                dragStartPos = createVector(mouseX, mouseY);
                return;
            }
        }
    
        // This part of the code runs if the click did not land on any interactive item.
        selectedSpline = null;
        selectedStaticShape = null;
        selectedPoint = null;
        updateSelectedItemUI();
    }
}

function mouseDragged() {
    if (isExporting) return;
    
    if (selectionBox) {
        selectionBox.w = mouseX - selectionBox.x;
        selectionBox.h = mouseY - selectionBox.y;
    } else if (isDraggingSelection) {
        const currentMousePos = createVector(mouseX, mouseY);
        const delta = p5.Vector.sub(currentMousePos, dragStartPos);
        const itemsToMove = new Set(multiSelection);
        
        itemsToMove.forEach(item => {
            if (item) {
                 const itemPos = item.pos || item;
                 if (itemPos && typeof itemPos.add === 'function') {
                    itemPos.add(delta);
                 }
            }
        });
       
        dragStartPos = currentMousePos;
        dragOccurred = true;
    } else if (draggedStaticShape) {
        draggedStaticShape.pos.x = constrain(mouseX, 0, width);
        draggedStaticShape.pos.y = constrain(mouseY, 0, height);
        dragOccurred = true;
    } else if (draggedPoint) {
        draggedPoint.x = constrain(mouseX, 0, width);
        draggedPoint.y = constrain(mouseY, 0, height);
        dragOccurred = true;
    } else if (draggedSpline) {
        const currentMousePos = createVector(mouseX, mouseY);
        const delta = p5.Vector.sub(currentMousePos, dragStartPos);
        for (let point of draggedSpline.points) {
            point.add(delta);
        }
        dragStartPos = currentMousePos;
        dragOccurred = true;
    }
}


function mouseReleased() {
  if (selectionBox) {
      selectItemsInBox(selectionBox);
      selectionBox = null;
      updateSelectedItemUI();
  } else if (dragOccurred) {
      recordState();
  }
  
  draggedPoint = null;
  draggedStaticShape = null;
  draggedSpline = null;
  dragStartPos = null;
  isDraggingSelection = false;
  dragOccurred = false;
}

function selectItemsInBox(box) {
    const r = {
        x: box.w < 0 ? box.x + box.w : box.x,
        y: box.h < 0 ? box.y + box.h : box.y,
        w: abs(box.w),
        h: abs(box.h)
    };

    multiSelection = [];
    
    for (const shape of staticShapes) {
        if (shape.pos.x > r.x && shape.pos.x < r.x + r.w && shape.pos.y > r.y && shape.pos.y < r.y + r.h) {
            multiSelection.push(shape);
        }
    }
    for (const spline of splines) {
        for (const point of spline.points) {
            if (point.x > r.x && point.x < r.x + r.w && point.y > r.y && point.y < r.y + r.h) {
                multiSelection.push(point);
            }
        }
    }
}


function doubleClicked() {
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
  if (isExporting) return;
  const mousePos = createVector(mouseX, mouseY);
  let bestMatch = { spline: null, pointData: { distance: Infinity } };

  for (const spline of splines) {
    if (spline.points.length < 2) continue;
    const closestPointData = findClosestPointOnSpline(spline, mousePos);
    if (closestPointData.distance < bestMatch.pointData.distance) {
      bestMatch.spline = spline;
      bestMatch.pointData = closestPointData;
    }
  }

  if (bestMatch.spline && bestMatch.pointData.distance < 20) {
    const targetSpline = bestMatch.spline;
    const newPoint = bestMatch.pointData.point;
    const segmentIndex = bestMatch.pointData.segmentIndex;
    targetSpline.points.splice(segmentIndex + 1, 0, newPoint);
    selectSpline(targetSpline);
    selectedPoint = newPoint;
    selectedPointIndex = segmentIndex + 1;
    recordState();
  }
}

function findClosestPointOnSpline(spline, pos) {
  let closest = { point: null, distance: Infinity, segmentIndex: -1, t: 0 };
  for (let i = 0; i < spline.points.length - 1; i++) {
    for (let t = 0; t <= 1; t += 0.01) {
      const p = getPointOnSegment(spline, i, t);
      if (p) {
        const d = dist(pos.x, pos.y, p.x, p.y);
        if (d < closest.distance) {
          closest.distance = d;
          closest.point = p;
          closest.segmentIndex = i;
          closest.t = t;
        }
      }
    }
  }
  return closest;
}

function isMouseOnSpline(spline, tolerance) {
  if (spline.points.length < 2) return false;
  for (let i = 0; i < spline.points.length - 1; i++) {
    for (let t = 0; t <= 1; t += 0.05) {
      const p = getPointOnSegment(spline, i, t);
      if (p) {
        const d = dist(mouseX, mouseY, p.x, p.y);
        if (d < tolerance) { return true; }
      }
    }
  }
  return false;
}

// ==============================
// POINT & SHAPE MANAGEMENT
// ==============================

function cloneSelectedItem() {
  const offset = createVector(20, 20);
  let newSelection = [];
  let didClone = false;

  function cloneItem(item) {
    if (!item) {
        console.error("cloneItem was called with a null or undefined item.");
        return null;
    }

    const newItem = { ...item };

    if (item.pos && typeof item.pos.copy === 'function') {
        newItem.pos = item.pos.copy().add(offset);
    } 

    if (item.points && Array.isArray(item.points)) {
        newItem.points = item.points.map(p => {
            if (p && typeof p.copy === 'function') {
                return p.copy().add(offset);
            }
            return p;
        });
    }

    if (item.scaleCurve && Array.isArray(item.scaleCurve)) {
        newItem.scaleCurve = item.scaleCurve.map(pt => ({ ...pt }));
    } else {
        newItem.scaleCurve = [{x: 0, y: 0}, {x: 1, y: 0}];
    }

    if (item.easingCurve && Array.isArray(item.easingCurve)) {
        newItem.easingCurve = item.easingCurve.map(pt => ({ ...pt }));
    } else if (item.points) {
        newItem.easingCurve = [{x: 0, y: 0}, {x: 1, y: 1}];
    }

    if (newItem.points) {
      newItem.lineColor = splineColors[splineColorIndex];
      splineColorIndex = (splineColorIndex + 1) % splineColors.length;
    }
    
    return newItem;
  }

  if (multiSelection.length > 0) {
    const splinesToClone = new Map();
    const shapesToClone = [];
    
    multiSelection.forEach(item => {
      if (item && item.isStatic) {
        shapesToClone.push(item);
      } else if (item) {
        splines.forEach((spline, index) => {
          if (spline.points && spline.points.includes(item)) {
            if (!splinesToClone.has(index)) {
              const clonedSpline = cloneItem(spline);
              if (clonedSpline) {
                  splinesToClone.set(index, clonedSpline);
              }
            }
          }
        });
      }
    });
    
    splinesToClone.forEach(newSpline => {
      splines.push(newSpline);
      newSelection.push(...newSpline.points);
    });

    shapesToClone.forEach(shape => {
      const newShape = cloneItem(shape);
      if (newShape) {
        staticShapes.push(newShape);
        newSelection.push(newShape);
      }
    });

    if (splinesToClone.size > 0 || shapesToClone.length > 0) {
        didClone = true;
        multiSelection = newSelection;
    }
    
  } else if (selectedSpline) {
    const newSpline = cloneItem(selectedSpline);
    if (newSpline) {
      splines.push(newSpline);
      selectSpline(newSpline);
      didClone = true;
    }
  } else if (selectedStaticShape) {
    const newShape = cloneItem(selectedStaticShape);
    if (newShape) {
      staticShapes.push(newShape);
      selectStaticShape(newShape);
      didClone = true;
    }
  }

  if (didClone) {
    updateSelectedItemUI();
    recordState();
  }
}


function removeSelectedItem() {
  let stateChanged = false;

  if (multiSelection.length > 0) {
      const pointsToDelete = new Set(multiSelection.filter(item => !item.isStatic));
      const shapesToDelete = new Set(multiSelection.filter(item => item.isStatic));
      const splinesToRemoveCompletely = new Set();

      if (shapesToDelete.size > 0) {
          staticShapes = staticShapes.filter(shape => !shapesToDelete.has(shape));
          stateChanged = true;
      }

      splines.forEach(spline => {
          const pointsInSplineToDelete = spline.points.filter(p => pointsToDelete.has(p));
          if (pointsInSplineToDelete.length > 0 && (spline.points.length - pointsInSplineToDelete.length < 2)) {
              splinesToRemoveCompletely.add(spline);
          }
      });
      
      splines.forEach(spline => {
          if (!splinesToRemoveCompletely.has(spline)) {
              const initialCount = spline.points.length;
              spline.points = spline.points.filter(p => !pointsToDelete.has(p));
              if (spline.points.length < initialCount) {
                  stateChanged = true;
              }
          }
      });

      if (splinesToRemoveCompletely.size > 0) {
          splines = splines.filter(spline => !splinesToRemoveCompletely.has(spline));
          stateChanged = true;
      }
      
      multiSelection = [];
  } else if (selectedStaticShape) {
    const index = staticShapes.indexOf(selectedStaticShape);
    if (index > -1) { 
        staticShapes.splice(index, 1);
        stateChanged = true;
    }
    selectedStaticShape = null;
  } else if (selectedPoint && selectedSpline) {
    if (selectedSpline.points.length > 2) {
      selectedSpline.points.splice(selectedPointIndex, 1);
      selectedPoint = null;
      selectedPointIndex = -1;
      stateChanged = true;
    } else {
      const splineIndex = splines.indexOf(selectedSpline);
      if (splineIndex > -1) {
          splines.splice(splineIndex, 1);
          stateChanged = true;
      }
    }
  } else if (selectedSpline) { // Handle deleting a selected spline (when no points are selected)
    const index = splines.indexOf(selectedSpline);
    if (index > -1) {
      splines.splice(index, 1);
      stateChanged = true;
    }
  }


  if (stateChanged) {
      selectedPoint = null;
      selectedSpline = null;
      selectedStaticShape = null;
      updateSelectedItemUI();
      recordState();
  }
}


function addPointToSpline() {
    let splinesToModify = new Set();
    let stateChanged = false;
    const newlyAddedPoints = [];

    if (multiSelection.length > 0) {
        // If there's a multi-selection, find all unique splines associated with the selected items.
        multiSelection.forEach(item => {
            const owner = getOwnerOfItem(item);
            // Add the owner to the set if it's a spline (i.e., not a static shape)
            if (owner && !owner.isStatic) {
                splinesToModify.add(owner);
            }
        });
    } else if (selectedSpline) {
        // If no multi-selection, just use the currently selected spline.
        splinesToModify.add(selectedSpline);
    }

    if (splinesToModify.size === 0) {
        // No valid splines to add points to.
        return;
    }
    
    // Iterate through the unique set of splines and add a point to each.
    splinesToModify.forEach(spline => {
        if (spline.points.length < 2) return; // continue to next spline

        let longestSegment = { index: -1, length: 0 };
        for (let i = 0; i < spline.points.length - 1; i++) {
            let segmentLength = 0;
            const steps = 20;
            let lastPoint = getPointOnSegment(spline, i, 0);
            for (let j = 1; j <= steps; j++) {
                const t = j / steps;
                const currentPoint = getPointOnSegment(spline, i, t);
                segmentLength += dist(lastPoint.x, lastPoint.y, currentPoint.x, currentPoint.y);
                lastPoint = currentPoint;
            }
            if (segmentLength > longestSegment.length) {
                longestSegment.length = segmentLength;
                longestSegment.index = i;
            }
        }
        if (longestSegment.index !== -1) {
            const newPoint = getPointOnSegment(spline, longestSegment.index, 0.5);
            spline.points.splice(longestSegment.index + 1, 0, newPoint);
            newlyAddedPoints.push(newPoint);
            stateChanged = true;
        }
    });

    if (stateChanged) {
        if (multiSelection.length > 0) {
            multiSelection.push(...newlyAddedPoints);
            updateSelectedItemUI();
        }
        recordState();
    }
}

/**
 * Flips the spline about the specified axis at the center of the bounding box of all points
 */
function flipSpline(horizontal) {
  const splinesToFlip = new Set();

  if (multiSelection.length > 0) {
    multiSelection.forEach(item => {
      const owner = getOwnerOfItem(item);
      if (owner && !owner.isStatic) {
        splinesToFlip.add(owner);
      }
    });
  } else if (selectedSpline) {
    splinesToFlip.add(selectedSpline);
  }

  if (splinesToFlip.size === 0) {
    return;
  }

  splinesToFlip.forEach(spline => {
    if (spline.points.length === 0) return;

    const coord = horizontal ? 'x' : 'y';
    const coords = spline.points.map(p => p[coord]);
    const min = Math.min(...coords);
    const max = Math.max(...coords);
    const center = (min + max) / 2;

    spline.points.forEach(p => {
      p[coord] = center - (p[coord] - center);
    });
  });

  recordState();
}

// ==============================
// PREVIEW CONTROLS
// ==============================
function toggleLooping() {
  loopingPreview = !loopingPreview;
  isPlayingOnce = false;
  if (loopingPreview) {
    loopPreviewButton.textContent = 'Loop Preview: ON';
    loopPreviewButton.style.backgroundColor = 'var(--accent-success)';
    appStartTime = millis();
  } else {
    loopPreviewButton.textContent = 'Loop Preview: OFF';
    loopPreviewButton.style.backgroundColor = 'var(--accent-danger)';
  }
}

function playOnce() {
  if (loopingPreview) toggleLooping();
  isPlayingOnce = true;
  appStartTime = millis();
}

// ==============================
// SPLINE & CANVAS MATH/LOGIC
// ==============================
function applyEasing(progress, spline) {
    // Check if the easing curve editor and the specific curve exist
    if (easingCurveEditor && spline && spline.easingCurve) {
        return easingCurveEditor.getEasingAtTime(spline.easingCurve, progress);
    }
    // Fallback to linear if the editor isn't available for some reason
    return progress;
}

function getObjectPlaybackState(obj) {
  const elapsedTime = millis() - appStartTime;
  let rawProgress = 0; 
  let isVisible = false;
  const exportFps = parseInt(document.getElementById('exportFPS').value) || 16;
  const totalTimelineFrames = parseInt(document.getElementById('exportTotalFrames').value) || 80;

  let currentTimeMs;
  if (isPlayingOnce) {
    currentTimeMs = elapsedTime;
  } else if (loopingPreview) {
    const mainTimelineDurationMs = (totalTimelineFrames / exportFps) * 1000;
    currentTimeMs = mainTimelineDurationMs > 0 ? elapsedTime % mainTimelineDurationMs : 0;
  } else {
    currentTimeMs = 0;
  }
  
  const startMs = (obj.startFrame / exportFps) * 1000;
  const durationMs = (obj.totalFrames / exportFps) * 1000 || 1;
  const endMs = startMs + durationMs;

  if (currentTimeMs >= startMs && currentTimeMs < endMs) {
    isVisible = true;
    rawProgress = (currentTimeMs - startMs) / durationMs;
  } else if (currentTimeMs >= endMs) {
    rawProgress = 1;
    isVisible = !obj.hideOnComplete;
  } else {
    rawProgress = 0;
    isVisible = false;
  }
  
  const easedProgress = applyEasing(rawProgress, obj);

  return { isVisible, rawProgress: constrain(rawProgress, 0, 1), easedProgress };
}

function calculateSplineLength(spline) {
  if (spline.points.length < 2) return 0;
  let totalLength = 0;
  const segments = 100;
  for (let i = 0; i < spline.points.length - 1; i++) {
    let prevPoint = getPointOnSegment(spline, i, 0);
    for (let j = 1; j <= segments; j++) {
      const t = j / segments;
      const currentPoint = getPointOnSegment(spline, i, t);
      totalLength += dist(prevPoint.x, prevPoint.y, currentPoint.x, currentPoint.y);
      prevPoint = currentPoint;
    }
  }
  return totalLength;
}

function getPointAtDistance(spline, targetDistance) {
  if (spline.points.length < 2) return null;
  let accumulatedDistance = 0;
  const segments = 100;
  if (targetDistance <= 0) return { point: spline.points[0], segmentIndex: 0, t: 0 };
  for (let i = 0; i < spline.points.length - 1; i++) {
    let segmentStart = getPointOnSegment(spline, i, 0);
    for (let j = 1; j <= segments; j++) {
      const t = j / segments;
      const segmentEnd = getPointOnSegment(spline, i, t);
      const segmentLength = dist(segmentStart.x, segmentStart.y, segmentEnd.x, segmentEnd.y);
      if (accumulatedDistance + segmentLength >= targetDistance) {
        const ratio = (targetDistance - accumulatedDistance) / segmentLength;
        const point = p5.Vector.lerp(segmentStart, segmentEnd, ratio);
        return { point: point, segmentIndex: i, t: (j - 1 + ratio) / segments };
      }
      accumulatedDistance += segmentLength;
      segmentStart = segmentEnd;
    }
  }
  return { point: spline.points[spline.points.length - 1], segmentIndex: spline.points.length - 2, t: 1 };
}

function getPointOnSegment(spline, segmentIndex, t) {
  if (segmentIndex < 0 || segmentIndex >= spline.points.length - 1) return null;
  const p1 = spline.points[segmentIndex];
  const p2 = spline.points[segmentIndex + 1];
  if (!p1 || !p2) return null;
  if (spline.points.length < 3) return p5.Vector.lerp(p1, p2, t);
  const p0 = segmentIndex > 0 ? spline.points[segmentIndex - 1] : p1;
  const p3 = segmentIndex < spline.points.length - 2 ? spline.points[segmentIndex + 2] : p2;
  const tension = spline.tension / 6.0;
  const cp1x = p1.x + (p2.x - p0.x) * tension;
  const cp1y = p1.y + (p2.y - p0.y) * tension;
  const cp2x = p2.x - (p3.x - p1.x) * tension;
  const cp2y = p2.y - (p3.y - p1.y) * tension;
  const x = bezierPoint(p1.x, cp1x, cp2x, p2.x, t);
  const y = bezierPoint(p1.y, cp1y, cp2y, p2.y, t);
  return createVector(x, y);
}

function windowResized() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    const availableWidth = container.clientWidth;
    const availableHeight = container.clientHeight;

    const projWidth = originalImageDimensions.width;
    const projHeight = originalImageDimensions.height;
    
    const ratio = Math.min(availableWidth / projWidth, availableHeight / projHeight);
    
    const newWidth = Math.floor(projWidth * ratio);
    const newHeight = Math.floor(projHeight * ratio);

    if (newWidth > 0 && newHeight > 0 && (newWidth !== width || newHeight !== height)) {
        const originalCanvasWidth = width;
        const originalCanvasHeight = height;
        resizeCanvas(newWidth, newHeight);

        const scaleX = newWidth / originalCanvasWidth;
        const scaleY = newHeight / originalCanvasHeight;

        if (isFinite(scaleX) && isFinite(scaleY)) {
            for (let spline of splines) {
                for (let point of spline.points) {
                    point.x *= scaleX;
                    point.y *= scaleY;
                }
            }
            for (let shape of staticShapes) {
                shape.pos.x *= scaleX;
                shape.pos.y *= scaleY;
            }
        }
    }
    
    if (animCurveEditor) animCurveEditor.windowResized();
    if (easingCurveEditor) easingCurveEditor.windowResized();
}

function updateCanvasSize() {
  const newWidth = parseInt(document.getElementById('canvasWidth').value);
  const newHeight = parseInt(document.getElementById('canvasHeight').value);
  if (newWidth > 0 && newHeight > 0) {
    originalImageDimensions.width = newWidth;
    originalImageDimensions.height = newHeight;
    windowResized();
    recordState();
  }
}

function resetCanvasSize() {
  let targetDimensions;
  if (trueOriginalImageDimensions) {
    targetDimensions = trueOriginalImageDimensions;
  } else {
    targetDimensions = { width: 1920, height: 800 };
  }
  
  document.getElementById('canvasWidth').value = targetDimensions.width;
  document.getElementById('canvasHeight').value = targetDimensions.height;
  
  updateCanvasSize();
}

// ======================================
// SCENE SAVE/LOAD
// ======================================
function handlePaste(event) {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            loadAsRegularImage(file);
            break; 
        }
    }
}

function handleSceneFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    loadSceneFromFile(file);
}

function gotFile(file) {
    if (file.type === 'image') {
        loadSceneFromFile(file.file);
    } else {
        console.log('Not an image file!');
    }
}

function loadSceneFromFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const markerIndex = text.lastIndexOf(METADATA_MARKER);

        if (markerIndex !== -1) {
            const jsonData = text.substring(markerIndex + METADATA_MARKER.length);
            try {
                const sceneData = JSON.parse(jsonData);
                loadScene(sceneData); 
            } catch (err) {
                console.error("Failed to parse scene data, loading as regular image.", err);
                loadAsRegularImage(file);
            }
        } else {
            loadAsRegularImage(file);
        }
    };
    reader.readAsBinaryString(file);
}

function loadAsRegularImage(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        backgroundImg = loadImage(e.target.result,
            img => {
                originalImageDimensions = { width: img.width, height: img.height };
                trueOriginalImageDimensions = { width: img.width, height: img.height };

                document.getElementById('canvasWidth').value = img.width;
                document.getElementById('canvasHeight').value = img.height;

                windowResized();
                recordState();
            },
            err => console.error('Error loading image:', err)
        );
    };
    reader.readAsDataURL(file);
}

function loadScene(sceneData) {
    const savedCanvasDimensions = sceneData.originalImageDimensions || { width: 1000, height: 562 };
    const currentWidth = width;
    const currentHeight = height;
    const scaleX = currentWidth / savedCanvasDimensions.width;
    const scaleY = currentHeight / savedCanvasDimensions.height;
    const avgScale = (scaleX + scaleY) / 2;

    splines = [];
    staticShapes = [];

    if (sceneData.splines) {
        sceneData.splines.forEach(sData => {
            const newSpline = { ...sData };
            newSpline.points = sData.points.map(p => createVector(p.x * scaleX, p.y * scaleY));
            newSpline.shapeSizeX = (sData.shapeSizeX || 10) * avgScale;
            newSpline.shapeSizeY = (sData.shapeSizeY || 10) * avgScale;
            if (!newSpline.scaleCurve) newSpline.scaleCurve = [{x:0, y:0}, {x:1, y:0}];
            if (!newSpline.easingCurve) newSpline.easingCurve = [{x: 0, y: 0}, {x: 1, y: 1}];
            splines.push(newSpline);
        });
    }

    if (sceneData.staticShapes) {
        sceneData.staticShapes.forEach(sData => {
            const newShape = { ...sData };
            newShape.pos = createVector(sData.pos.x * scaleX, sData.pos.y * scaleY);
            newShape.shapeSizeX = (sData.shapeSizeX || 10) * avgScale;
            newShape.shapeSizeY = (sData.shapeSizeY || 10) * avgScale;
            
            // Add defaults for backward compatibility with older save files
            if (newShape.startFrame === undefined) newShape.startFrame = 0;
            if (newShape.totalFrames === undefined) newShape.totalFrames = 80;
            if (newShape.hideOnComplete === undefined) newShape.hideOnComplete = true;

            if (!newShape.scaleCurve) newShape.scaleCurve = [{x:0, y:0}, {x:1, y:0}];
            staticShapes.push(newShape);
        });
    }
    
    splineColorIndex = sceneData.splineColorIndex || 0;
    selectedSpline = null;
    selectedStaticShape = null;
    selectedPoint = null;
    appStartTime = millis();

    if (splines.length > 0) selectSpline(splines[0]);
    else if (staticShapes.length > 0) selectStaticShape(staticShapes[0]);
    else updateSelectedItemUI();

    recordState();
}

function exportScene() {
    const sceneData = {
        splines: splines.map(s => ({ ...s, 
            points: s.points.map(p => ({ x: p.x, y: p.y })), 
            scaleCurve: s.scaleCurve.map(pt => ({...pt})),
            easingCurve: s.easingCurve.map(pt => ({...pt}))
        })),
        staticShapes: staticShapes.map(s => ({ ...s, 
            pos: { x: s.pos.x, y: s.pos.y }, 
            scaleCurve: s.scaleCurve.map(pt => ({...pt})) 
        })),
        originalImageDimensions: { width: width, height: height },
        splineColorIndex: splineColorIndex
    };
    const jsonDataString = JSON.stringify(sceneData);
    const tempCanvas = createGraphics(width, height);
    tempCanvas.background(255);
    drawAllSplines(tempCanvas);
    drawStaticShapes(tempCanvas);
    drawMovingShapes(tempCanvas);
    const imageDataUrl = tempCanvas.elt.toDataURL('image/png');
    
    fetch(imageDataUrl).then(res => res.blob()).then(imageBlob => {
        const metadataBlob = new Blob([METADATA_MARKER + jsonDataString], { type: 'text/plain' });
        const combinedBlob = new Blob([imageBlob, metadataBlob], { type: 'image/png' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(combinedBlob);
        a.download = 'spline-animation.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });
    tempCanvas.remove();
}

// ==============
// EXPORT
// ==============
function startExport() {
  if (splines.length === 0 && staticShapes.length === 0) { alert("There is nothing to export."); return; }
  const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  let supportedMimeType = null;
  if (window.MediaRecorder) {
    for (const mimeType of mimeTypes) { if (MediaRecorder.isTypeSupported(mimeType)) { supportedMimeType = mimeType; break; } }
  }
  if (!supportedMimeType) { alert("Video export not supported in this browser."); return; }
  if (isExporting) return;
  isExporting = true;
  exportOverlay.style.display = 'flex';
  progressBarFill.style.width = '0%';
  exportPercentage.textContent = '0%';
  exportFPS = parseInt(document.getElementById('exportFPS').value);
  exportTotalFrames = parseInt(document.getElementById('exportTotalFrames').value);
  exportDuration = exportTotalFrames / exportFPS;

  exportFrameCount.textContent = `Frame 0 of ${exportTotalFrames}`;
  exportProgress = 0;
  recordedChunks = [];
  const exportWidth = originalImageDimensions.width;
  const exportHeight = originalImageDimensions.height;
  exportCanvas = createGraphics(exportWidth, exportHeight);
  exportCanvas.pixelDensity(1);
  exportCanvas.hide();
  exportStream = exportCanvas.elt.captureStream(exportFPS);
  mediaRecorder = new MediaRecorder(exportStream, { mimeType: supportedMimeType, videoBitsPerSecond: 2500000 });
  mediaRecorder.ondataavailable = e => e.data.size > 0 && recordedChunks.push(e.data);
  mediaRecorder.onstop = handleExportFinish;
  mediaRecorder.start();
  renderNextFrame();
}

function drawExportFrame(overallProgress) {
  exportCanvas.background(0);
  const exportCurrentFrame = overallProgress * exportTotalFrames;
  
  // Draw Static Shapes (Anchors)
  for (const shape of staticShapes) {
    const endFrame = shape.startFrame + shape.totalFrames;
    const isVisible = exportCurrentFrame >= shape.startFrame && (exportCurrentFrame < endFrame || !shape.hideOnComplete);
    
    if (isVisible) {
      const shapeProgress = constrain((exportCurrentFrame - shape.startFrame) / shape.totalFrames, 0, 1);
      const scaleMultiplier = animCurveEditor.getScaleAtTime(shape.scaleCurve, shapeProgress);

      const scaleX = exportCanvas.width / width;
      const scaleY = exportCanvas.height / height;
      exportCanvas.push();
      exportCanvas.fill(shape.fillColor);
      exportCanvas.stroke(shape.strokeColor);
      exportCanvas.strokeWeight(shape.strokeWeight * ((scaleX + scaleY) / 2));
      exportCanvas.translate(shape.pos.x * scaleX, shape.pos.y * scaleY);
      drawShapeOnCanvas(exportCanvas, shape.shapeType, shape.shapeSizeX * scaleX * scaleMultiplier, shape.shapeSizeY * scaleY * scaleMultiplier); 
      exportCanvas.pop();
    }
  }

  // Draw Moving Shapes (from Splines)
  for (const spline of splines) {
    const endFrame = spline.startFrame + spline.totalFrames;
    if (exportCurrentFrame >= spline.startFrame && (exportCurrentFrame < endFrame || !spline.hideOnComplete)) {
      const splineProgress = constrain((exportCurrentFrame - spline.startFrame) / spline.totalFrames, 0, 1);
      const easedProgress = applyEasing(splineProgress, spline);
      const scaleMultiplier = animCurveEditor.getScaleAtTime(spline.scaleCurve, splineProgress);

      const totalLength = calculateSplineLength(spline);
      const targetDistance = easedProgress * totalLength;
      const pos = getPointAtDistance(spline, targetDistance);

      if (pos) {
        const scaleX = exportCanvas.width / width;
        const scaleY = exportCanvas.height / height;
        exportCanvas.push();
        exportCanvas.fill(spline.fillColor);
        exportCanvas.stroke(spline.strokeColor);
        exportCanvas.strokeWeight(spline.strokeWeight * ((scaleX + scaleY) / 2));
        exportCanvas.translate(pos.point.x * scaleX, pos.point.y * scaleY);
        drawShapeOnCanvas(exportCanvas, spline.shapeType, spline.shapeSizeX * scaleX * scaleMultiplier, spline.shapeSizeY * scaleY * scaleMultiplier);
        exportCanvas.pop();
      }
    }
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.requestData();
  }
}

function renderNextFrame() {
  if (!isExporting) return;
  if (exportProgress < exportTotalFrames) {
    drawExportFrame(exportProgress / exportTotalFrames);
    const progressPercent = (exportProgress / exportTotalFrames) * 100;
    progressBarFill.style.width = `${progressPercent}%`;
    exportPercentage.textContent = `${Math.round(progressPercent)}%`;
    exportFrameCount.textContent = `Frame ${exportProgress} of ${exportTotalFrames}`;
    exportProgress++;

    setTimeout(renderNextFrame, 1000 / exportFPS);
  } else {
    progressBarFill.style.width = '100%';
    exportPercentage.textContent = '100%';
    exportFrameCount.textContent = `Frame ${exportTotalFrames} of ${exportTotalFrames}`;
    finishExport();
  }
}

function drawShapeOnCanvas(canvas, type, sizeX, sizeY) {
  switch (type) {
    case 'circle': canvas.ellipse(0, 0, sizeX, sizeY); break;
    case 'square': canvas.rectMode(canvas.CENTER); canvas.rect(0, 0, sizeX, sizeY); break;
    case 'triangle': canvas.triangle(-sizeX / 2, sizeY / 2, sizeX / 2, sizeY / 2, 0, -sizeY / 2); break;
  }
}

function handleExportFinish() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'spline-animation.webm';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
  cleanupExport();
}

function finishExport() {
  if (mediaRecorder?.state !== 'inactive') { mediaRecorder.stop(); }
  else { cleanupExport(); }
}

function cancelExport() {
  if (isExporting) {
    isExporting = false;
    if (mediaRecorder?.state !== 'inactive') { mediaRecorder.stop(); }
  }
}

function cleanupExport() {
  if (exportOverlay) { exportOverlay.style.display = 'none'; }
  exportCanvas?.remove();
  exportStream?.getTracks().forEach(track => track.stop());
  exportCanvas = null;
  exportStream = null;
  mediaRecorder = null;
  isExporting = false;
}

// --- MODIFICATION: Add logic for draggable number inputs with double-click select ---
/**
 * Attaches event listeners to all number inputs to allow
 * changing their value by dragging the mouse horizontally,
 * and selecting all text on double-click.
 */
function setupDraggableInputs() {
    const numberInputs = document.querySelectorAll('input[type="number"]');

    numberInputs.forEach(input => {
        let isDragging = false;
        let startX;
        let startValue;
        let lastDownTime = 0; // Tracks the time of the last mousedown event

        const onMouseDown = (e) => {
            const currentTime = performance.now();

            // If the time between this click and the last is less than a threshold (e.g., 300ms),
            // treat it as a double-click.
            if (currentTime - lastDownTime < 300) {
                input.select(); // Select all text in the input
                lastDownTime = 0; // Reset the timer to prevent a third click from being a double-click
                e.preventDefault(); // Prevent the browser's default double-click behavior (like highlighting a word)
                return; // Exit the function to prevent starting a drag
            }
            lastDownTime = currentTime; // Record the time of this click

            // --- Standard Drag Initiation ---
            isDragging = true;
            startX = e.clientX;
            startValue = parseFloat(input.value) || 0;
            document.body.style.cursor = 'ew-resize';
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            
            e.preventDefault();

            const dx = e.clientX - startX;
            const step = parseFloat(input.step) || 1;
            const min = parseFloat(input.min);
            const max = parseFloat(input.max);
            
            const sensitivity = 5; // Lower number = more sensitive
            const valueChange = Math.round(dx / sensitivity) * step;
            let newValue = startValue + valueChange;

            if (!isNaN(min)) newValue = Math.max(min, newValue);
            if (!isNaN(max)) newValue = Math.min(max, newValue);

            const stepString = step.toString();
            const decimalPlaces = stepString.includes('.') ? stepString.split('.')[1].length : 0;
            
            input.value = newValue.toFixed(decimalPlaces);
            
            input.dispatchEvent(new Event('input', { bubbles: true }));
        };

        const onMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = 'default';
                
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };

        input.addEventListener('mousedown', onMouseDown);
    });
}
