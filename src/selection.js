const overlay = document.getElementById("selection-overlay");
const selectionBox = document.getElementById("selection-box");
const dimensions = document.getElementById("dimensions");

let isSelecting = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;

// Start selection
overlay.addEventListener("mousedown", (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;

    selectionBox.style.left = startX + "px";
    selectionBox.style.top = startY + "px";
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    selectionBox.style.display = "block";
    dimensions.style.display = "block";
});

// Update selection
overlay.addEventListener("mousemove", (e) => {
    if (!isSelecting) return;

    currentX = e.clientX;
    currentY = e.clientY;

    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);

    selectionBox.style.left = left + "px";
    selectionBox.style.top = top + "px";
    selectionBox.style.width = width + "px";
    selectionBox.style.height = height + "px";

    // Update dimensions display
    dimensions.textContent = `${width} × ${height}`;
    dimensions.style.left = currentX + 10 + "px";
    dimensions.style.top = currentY + 10 + "px";
});

// End selection and capture
overlay.addEventListener("mouseup", async (e) => {
    if (!isSelecting) return;

    isSelecting = false;

    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    // Minimum size check
    if (width < 10 || height < 10) {
        console.log("Selection too small");
        await window.electronAPI.cancelAreaScreenshot();
        return;
    }

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);

    // Don't apply scale factor here - just use screen coordinates
    const area = {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
    };

    console.log("Selection area (screen coords):", area);

    // Hide the selection UI immediately
    selectionBox.style.display = "none";
    dimensions.style.display = "none";
    overlay.style.background = "transparent";

    // Small delay to ensure UI is hidden before capture
    await new Promise(resolve => setTimeout(resolve, 50));

    // Capture the selected area (the handler will close this window)
    await window.electronAPI.captureAreaScreenshot(area);
});

// Cancel on ESC
document.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") {
        await window.electronAPI.cancelAreaScreenshot();
        window.close();
    }
});