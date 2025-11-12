const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const textInput = document.getElementById("text-input");

let currentTool = "pen";
let currentColor = "#ff0000";
let currentSize = 3;
let isDrawing = false;
let startX, startY;
let history = [];
let originalImageData = null;
let previewCanvas = null;
let previewCtx = null;

// NEW: Object-based drawing system
let drawnObjects = [];
let selectedObject = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// NEW: For freehand drawing
let currentPath = [];

// Object types
class DrawnObject {
    constructor(type, color, size) {
        this.type = type;
        this.color = color;
        this.size = size;
        this.id = Date.now() + Math.random();
    }

    isPointInside(x, y) {
        return false; // Override in subclasses
    }

    draw(context) {
        // Override in subclasses
    }

    drawSelection(context) {
        // Draw selection handles
        const bounds = this.getBounds();
        if (bounds) {
            context.strokeStyle = "#00ff00";
            context.lineWidth = 2;
            context.setLineDash([5, 5]);
            context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            context.setLineDash([]);
        }
    }

    getBounds() {
        return null; // Override in subclasses
    }

    move(dx, dy) {
        // Override in subclasses
    }
}

// NEW: Path object for freehand drawing (pen, highlighter, eraser)
class PathObject extends DrawnObject {
    constructor(points, color, size, type = "pen") {
        super(type, color, size);
        this.points = points; // Array of {x, y} points
    }

    draw(context) {
        if (this.points.length < 2) return;

        context.save();

        if (this.type === "pen") {
            context.strokeStyle = this.color;
            context.lineWidth = this.size;
            context.lineCap = "round";
            context.lineJoin = "round";
            context.globalCompositeOperation = "source-over";
        } else if (this.type === "highlighter") {
            context.strokeStyle = this.color;
            context.lineWidth = this.size * 3;
            context.lineCap = "round";
            context.lineJoin = "round";
            context.globalAlpha = 0.3;
            context.globalCompositeOperation = "source-over";
        } else if (this.type === "eraser") {
            context.strokeStyle = "rgba(0,0,0,1)";
            context.lineWidth = this.size * 2;
            context.lineCap = "round";
            context.lineJoin = "round";
            context.globalCompositeOperation = "destination-out";
        }

        context.beginPath();
        context.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
            context.lineTo(this.points[i].x, this.points[i].y);
        }
        context.stroke();

        context.restore();
    }

    isPointInside(x, y) {
        // Check if point is near any segment of the path
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];

            const distance = distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
            if (distance <= this.size + 5) {
                return true;
            }
        }
        return false;
    }

    getBounds() {
        if (this.points.length === 0) return null;

        let minX = this.points[0].x;
        let minY = this.points[0].y;
        let maxX = this.points[0].x;
        let maxY = this.points[0].y;

        for (const point of this.points) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }

        const padding = this.size * 2;
        return {
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + padding * 2,
            height: (maxY - minY) + padding * 2
        };
    }

    move(dx, dy) {
        for (const point of this.points) {
            point.x += dx;
            point.y += dy;
        }
    }
}

// Helper function for distance to line segment
function distanceToLineSegment(x, y, x1, y1, x2, y2) {
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

class RectangleObject extends DrawnObject {
    constructor(x, y, width, height, color, size) {
        super("rectangle", color, size);
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    draw(context) {
        context.strokeStyle = this.color;
        context.lineWidth = this.size;
        context.strokeRect(this.x, this.y, this.width, this.height);
    }

    isPointInside(x, y) {
        const bounds = this.getBounds();
        return x >= bounds.x && x <= bounds.x + bounds.width &&
            y >= bounds.y && y <= bounds.y + bounds.height;
    }

    getBounds() {
        return {
            x: Math.min(this.x, this.x + this.width),
            y: Math.min(this.y, this.y + this.height),
            width: Math.abs(this.width),
            height: Math.abs(this.height)
        };
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }
}

class CircleObject extends DrawnObject {
    constructor(x, y, radius, color, size) {
        super("circle", color, size);
        this.x = x;
        this.y = y;
        this.radius = radius;
    }

    draw(context) {
        context.strokeStyle = this.color;
        context.lineWidth = this.size;
        context.beginPath();
        context.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
        context.stroke();
    }

    isPointInside(x, y) {
        const distance = Math.sqrt(Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2));
        return distance <= this.radius + this.size;
    }

    getBounds() {
        return {
            x: this.x - this.radius,
            y: this.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
        };
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }
}

class ArrowObject extends DrawnObject {
    constructor(fromX, fromY, toX, toY, color, size) {
        super("arrow", color, size);
        this.fromX = fromX;
        this.fromY = fromY;
        this.toX = toX;
        this.toY = toY;
    }

    draw(context) {
        const headlen = 15;
        const angle = Math.atan2(this.toY - this.fromY, this.toX - this.fromX);

        context.strokeStyle = this.color;
        context.fillStyle = this.color;
        context.lineWidth = this.size;

        // Draw line
        context.beginPath();
        context.moveTo(this.fromX, this.fromY);
        context.lineTo(this.toX, this.toY);
        context.stroke();

        // Draw arrowhead
        context.beginPath();
        context.moveTo(this.toX, this.toY);
        context.lineTo(
            this.toX - headlen * Math.cos(angle - Math.PI / 6),
            this.toY - headlen * Math.sin(angle - Math.PI / 6)
        );
        context.lineTo(
            this.toX - headlen * Math.cos(angle + Math.PI / 6),
            this.toY - headlen * Math.sin(angle + Math.PI / 6)
        );
        context.lineTo(this.toX, this.toY);
        context.fill();
    }

    isPointInside(x, y) {
        // Check if point is near the line
        const A = x - this.fromX;
        const B = y - this.fromY;
        const C = this.toX - this.fromX;
        const D = this.toY - this.fromY;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = this.fromX;
            yy = this.fromY;
        } else if (param > 1) {
            xx = this.toX;
            yy = this.toY;
        } else {
            xx = this.fromX + param * C;
            yy = this.fromY + param * D;
        }

        const dx = x - xx;
        const dy = y - yy;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance <= this.size + 5;
    }

    getBounds() {
        return {
            x: Math.min(this.fromX, this.toX) - 20,
            y: Math.min(this.fromY, this.toY) - 20,
            width: Math.abs(this.toX - this.fromX) + 40,
            height: Math.abs(this.toY - this.fromY) + 40
        };
    }

    move(dx, dy) {
        this.fromX += dx;
        this.fromY += dy;
        this.toX += dx;
        this.toY += dy;
    }
}

class TextObject extends DrawnObject {
    constructor(x, y, text, color, size) {
        super("text", color, size);
        this.x = x;
        this.y = y;
        this.text = text;
    }

    draw(context) {
        context.fillStyle = this.color;
        context.font = `${this.size * 4}px Arial`;
        context.fillText(this.text, this.x, this.y);
    }

    isPointInside(x, y) {
        const bounds = this.getBounds();
        return x >= bounds.x && x <= bounds.x + bounds.width &&
            y >= bounds.y && y <= bounds.y + bounds.height;
    }

    getBounds() {
        ctx.font = `${this.size * 4}px Arial`;
        const metrics = ctx.measureText(this.text);
        return {
            x: this.x,
            y: this.y - this.size * 4,
            width: metrics.width,
            height: this.size * 4
        };
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }
}

// Load the screenshot
window.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const filePath = urlParams.get("file");

    if (!filePath) {
        console.error("No file path provided");
        return;
    }

    // Load image
    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Save original state
        saveState();
        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Create preview canvas
        createPreviewCanvas();
    };
    img.src = `file://${filePath}`;
});

// Create preview canvas
function createPreviewCanvas() {
    const container = document.getElementById("canvas-container");
    previewCanvas = document.createElement("canvas");
    previewCanvas.id = "preview-canvas";
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    previewCanvas.style.position = "absolute";
    previewCanvas.style.pointerEvents = "none";
    previewCanvas.style.maxWidth = "100%";
    previewCanvas.style.maxHeight = "100%";
    container.appendChild(previewCanvas);
    previewCtx = previewCanvas.getContext("2d");
}

// Clear preview canvas
function clearPreview() {
    if (previewCtx) {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
}

// Redraw all objects
function redrawCanvas() {
    // Clear canvas
    ctx.putImageData(originalImageData, 0, 0);

    // Draw all objects
    drawnObjects.forEach(obj => {
        obj.draw(ctx);
    });

    // Draw selection
    clearPreview();
    if (selectedObject) {
        selectedObject.drawSelection(previewCtx);
    }
}

// Tool selection
document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
            b.classList.remove("active");
        });
        btn.classList.add("active");
        currentTool = btn.dataset.tool;

        // Deselect when switching tools
        selectedObject = null;
        redrawCanvas();

        // Update cursor
        canvas.className = "";
        if (currentTool === "select") {
            canvas.classList.add("select-cursor");
        } else if (currentTool === "eraser") {
            canvas.classList.add("eraser-cursor");
        } else if (currentTool === "text") {
            canvas.classList.add("text-cursor");
        } else {
            canvas.classList.add("pen-cursor");
        }
    });
});

// Color picker
document.getElementById("color-picker").addEventListener("input", (e) => {
    currentColor = e.target.value;
});

// Size slider
const sizeSlider = document.getElementById("size-slider");
const sizeLabel = document.getElementById("size-label");
sizeSlider.addEventListener("input", (e) => {
    currentSize = parseInt(e.target.value);
    sizeLabel.textContent = `${currentSize}px`;
});

// Save state for undo
function saveState() {
    // Save objects state
    const state = {
        imageData: canvas.toDataURL(),
        objects: JSON.parse(JSON.stringify(drawnObjects.map(obj => ({
            type: obj.type,
            ...obj
        }))))
    };
    history.push(state);
    if (history.length > 20) {
        history.shift();
    }
}

// Undo
document.getElementById("undo-btn").addEventListener("click", () => {
    if (history.length > 1) {
        history.pop(); // Remove current state
        const prevState = history[history.length - 1];
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            // Restore objects (simplified - you'd need to reconstruct object instances)
            selectedObject = null;
            clearPreview();
        };
        img.src = prevState.imageData;
    }
});

// Clear all
document.getElementById("clear-btn").addEventListener("click", () => {
    if (confirm("Clear all drawings?")) {
        if (originalImageData) {
            ctx.putImageData(originalImageData, 0, 0);
            drawnObjects = [];
            selectedObject = null;
            history = [];
            saveState();
            redrawCanvas();
        }
    }
});

// Delete selected object
document.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedObject) {
        drawnObjects = drawnObjects.filter(obj => obj.id !== selectedObject.id);
        selectedObject = null;
        redrawCanvas();
        saveState();
    }
});

// Drawing functions
canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    startX = (e.clientX - rect.left) * (canvas.width / rect.width);
    startY = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Select mode
    if (currentTool === "select") {
        // Check if clicking on an object
        selectedObject = null;
        for (let i = drawnObjects.length - 1; i >= 0; i--) {
            if (drawnObjects[i].isPointInside(startX, startY)) {
                selectedObject = drawnObjects[i];
                isDragging = true;
                dragOffsetX = startX;
                dragOffsetY = startY;
                redrawCanvas();
                return;
            }
        }
        redrawCanvas();
        return;
    }

    if (currentTool === "text") {
        // Show text input
        textInput.style.display = "block";
        textInput.style.left = e.clientX + "px";
        textInput.style.top = e.clientY + "px";
        textInput.style.color = currentColor;
        textInput.style.fontSize = currentSize * 4 + "px";
        textInput.value = "";
        textInput.focus();
        return;
    }

    isDrawing = true;

    if (currentTool === "pen" || currentTool === "highlighter" || currentTool === "eraser") {
        // Start a new path
        currentPath = [{ x: startX, y: startY }];
    }
});

canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Dragging selected object
    if (isDragging && selectedObject) {
        const dx = x - dragOffsetX;
        const dy = y - dragOffsetY;
        selectedObject.move(dx, dy);
        dragOffsetX = x;
        dragOffsetY = y;
        redrawCanvas();
        return;
    }

    if (!isDrawing) return;

    if (currentTool === "pen" || currentTool === "highlighter" || currentTool === "eraser") {
        // Add point to current path
        currentPath.push({ x, y });

        // Draw preview on the preview canvas
        clearPreview();
        const tempPath = new PathObject(currentPath, currentColor, currentSize, currentTool);
        tempPath.draw(previewCtx);
    }
    // Live preview for shapes
    else if (currentTool === "rectangle" || currentTool === "circle" || currentTool === "arrow") {
        clearPreview();
        previewCtx.strokeStyle = currentColor;
        previewCtx.lineWidth = currentSize;

        if (currentTool === "rectangle") {
            previewCtx.strokeRect(startX, startY, x - startX, y - startY);
        } else if (currentTool === "circle") {
            const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
            previewCtx.beginPath();
            previewCtx.arc(startX, startY, radius, 0, 2 * Math.PI);
            previewCtx.stroke();
        } else if (currentTool === "arrow") {
            drawArrowOnContext(previewCtx, startX, startY, x, y, currentColor, currentSize);
        }
    }
});

canvas.addEventListener("mouseup", (e) => {
    if (isDragging) {
        isDragging = false;
        saveState();
        return;
    }

    if (!isDrawing) return;
    isDrawing = false;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    clearPreview();

    if (currentTool === "pen" || currentTool === "highlighter" || currentTool === "eraser") {
        // Add final point
        currentPath.push({ x, y });

        // Create path object and add to drawnObjects
        if (currentPath.length > 1) {
            const pathObj = new PathObject(currentPath, currentColor, currentSize, currentTool);
            drawnObjects.push(pathObj);
            redrawCanvas();
        }

        // Clear current path
        currentPath = [];
    } else if (currentTool === "rectangle") {
        const rectObj = new RectangleObject(startX, startY, x - startX, y - startY, currentColor, currentSize);
        drawnObjects.push(rectObj);
        redrawCanvas();
    } else if (currentTool === "circle") {
        const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        const circleObj = new CircleObject(startX, startY, radius, currentColor, currentSize);
        drawnObjects.push(circleObj);
        redrawCanvas();
    } else if (currentTool === "arrow") {
        const arrowObj = new ArrowObject(startX, startY, x, y, currentColor, currentSize);
        drawnObjects.push(arrowObj);
        redrawCanvas();
    }

    saveState();
});

// Draw arrow on context
function drawArrowOnContext(context, fromX, fromY, toX, toY, color, size) {
    const headlen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = size;

    // Draw line
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();

    // Draw arrowhead
    context.beginPath();
    context.moveTo(toX, toY);
    context.lineTo(
        toX - headlen * Math.cos(angle - Math.PI / 6),
        toY - headlen * Math.sin(angle - Math.PI / 6)
    );
    context.lineTo(
        toX - headlen * Math.cos(angle + Math.PI / 6),
        toY - headlen * Math.sin(angle + Math.PI / 6)
    );
    context.lineTo(toX, toY);
    context.fill();
}

// Text input handling
textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const text = textInput.value;
        if (text) {
            const rect = canvas.getBoundingClientRect();
            const x = (parseInt(textInput.style.left) - rect.left) * (canvas.width / rect.width);
            const y = (parseInt(textInput.style.top) - rect.top) * (canvas.height / rect.height);

            const textObj = new TextObject(x, y, text, currentColor, currentSize);
            drawnObjects.push(textObj);
            redrawCanvas();
            saveState();
        }
        textInput.style.display = "none";
        textInput.value = "";
    } else if (e.key === "Escape") {
        textInput.style.display = "none";
        textInput.value = "";
    }
});

// Cancel button
document.getElementById("cancel-btn").addEventListener("click", async () => {
    await window.electronAPI.cancelEditor();
    window.close();
});

// Done button
document.getElementById("done-btn").addEventListener("click", async () => {
    // Make sure final canvas has all objects
    redrawCanvas();

    // Convert canvas to blob
    canvas.toBlob(async (blob) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result.split(",")[1];
            await window.electronAPI.saveEditedScreenshot(base64);
            window.close();
        };
        reader.readAsDataURL(blob);
    });
});