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
    };
    img.src = `file://${filePath}`;
});

// Tool selection
document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
            b.classList.remove("active");
        });
        btn.classList.add("active");
        currentTool = btn.dataset.tool;

        // Update cursor
        canvas.className = "";
        if (currentTool === "eraser") {
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
    history.push(canvas.toDataURL());
    if (history.length > 20) {
        history.shift(); // Limit history to 20 states
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
        };
        img.src = prevState;
    }
});

// Clear all
document.getElementById("clear-btn").addEventListener("click", () => {
    if (confirm("Clear all drawings?")) {
        if (originalImageData) {
            ctx.putImageData(originalImageData, 0, 0);
            history = [];
            saveState();
        }
    }
});

// Drawing functions
canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

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
        ctx.beginPath();
        ctx.moveTo(startX, startY);
    }
});

canvas.addEventListener("mousemove", (e) => {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === "pen") {
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineTo(x, y);
        ctx.stroke();
    } else if (currentTool === "highlighter") {
        ctx.strokeStyle = currentColor;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = currentSize * 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    } else if (currentTool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = currentSize * 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
    }
});

canvas.addEventListener("mouseup", (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === "rectangle") {
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentSize;
        ctx.strokeRect(startX, startY, x - startX, y - startY);
    } else if (currentTool === "circle") {
        const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentSize;
        ctx.beginPath();
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
        ctx.stroke();
    } else if (currentTool === "arrow") {
        drawArrow(startX, startY, x, y);
    }

    saveState();
});

// Draw arrow
function drawArrow(fromX, fromY, toX, toY) {
    const headlen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.strokeStyle = currentColor;
    ctx.fillStyle = currentColor;
    ctx.lineWidth = currentSize;

    // Draw line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - headlen * Math.cos(angle - Math.PI / 6),
        toY - headlen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        toX - headlen * Math.cos(angle + Math.PI / 6),
        toY - headlen * Math.sin(angle + Math.PI / 6)
    );
    ctx.lineTo(toX, toY);
    ctx.fill();
}

// Text input handling
textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const text = textInput.value;
        if (text) {
            const rect = canvas.getBoundingClientRect();
            const x = parseInt(textInput.style.left) - rect.left;
            const y = parseInt(textInput.style.top) - rect.top;

            ctx.fillStyle = currentColor;
            ctx.font = `${currentSize * 4}px Arial`;
            ctx.fillText(text, x, y);
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