require("dotenv").config();
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  desktopCapturer,
  Menu,
  Tray,
} = require("electron");
const fs = require("fs");
app.disableHardwareAcceleration();
const path = require("path");
const {
  ensureScreenRecordingPermission,
  captureFullScreen,
  captureAreaScreenshot,
  getRecentScreenshots,
} = require("./screenshot");
const {
  initializeLLMService,
  getModelInfo,
  makeLLMRequest,
  loadTradingDocument,
  clearTradingDocument,
  getTradingDocumentStatus,
  learningService,
} = require("./llm-service");
const config = require("./config");

let sessionTotalTokens = 0;
let maxInputTokens = 1048576; // Default, will be updated
let isCompactMode = true; // Start in compact mode
const COMPACT_SIZE = 400; // Square size (400x400)
const COMPACT_MARGIN = 20; // Margin from screen edge

// IMPORTANT: Declare these variables at the top
let invisibleWindow;
let settingsWindow = null;
let tray = null;
let selectionWindow = null;
let editorWindow = null;

// IPC handler to load trading document
ipcMain.handle("load-trading-document", async (event, filePath) => {
  try {
    const success = loadTradingDocument(filePath);
    if (success) {
      // Notify renderer that document is loaded
      if (invisibleWindow) {
        invisibleWindow.webContents.send("trading-document-loaded", {
          loaded: true,
          path: filePath,
        });
      }
      return { success: true, message: "Trading document loaded successfully" };
    } else {
      return { success: false, error: "Failed to load document" };
    }
  } catch (error) {
    console.error("Error loading trading document:", error);
    return { success: false, error: error.message };
  }
});

// IPC handler to clear trading document
ipcMain.handle("clear-trading-document", async () => {
  try {
    clearTradingDocument();
    if (invisibleWindow) {
      invisibleWindow.webContents.send("trading-document-loaded", {
        loaded: false,
      });
    }
    return { success: true };
  } catch (error) {
    console.error("Error clearing trading document:", error);
    return { success: false, error: error.message };
  }
});

// IPC handler to get document status
ipcMain.handle("get-trading-document-status", () => {
  return { loaded: getTradingDocumentStatus() };
});

// IPC handler to open file dialog for selecting trading document
ipcMain.handle("select-trading-document", async () => {
  const { dialog } = require("electron");

  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Text Files", extensions: ["txt", "md"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const loadResult = loadTradingDocument(filePath);

    if (loadResult) {
      if (invisibleWindow) {
        invisibleWindow.webContents.send("trading-document-loaded", {
          loaded: true,
          path: filePath,
        });
      }
      return { success: true, path: filePath };
    } else {
      return { success: false, error: "Failed to load document" };
    }
  }

  return { success: false, error: "No file selected" };
});

// IPC handlers for settings
ipcMain.handle("get-settings", () => {
  return {
    geminiKey: config.getGeminiKey(),
  };
});

// IPC handler for token info
ipcMain.handle("get-token-info", () => {
  return {
    current: sessionTotalTokens,
    max: maxInputTokens,
  };
});

// IPC handler for scrolling chat
ipcMain.handle("scroll-chat", (event, direction) => {
  if (invisibleWindow) {
    invisibleWindow.webContents.send("scroll-chat", direction);
  }
  return true;
});

ipcMain.handle("save-settings", async (event, settings) => {
  if (settings.geminiKey) {
    config.setGeminiKey(settings.geminiKey);
    // Reinitialize LLM service with new API key
    await initializeLLMService();
  }
  return true;
});

// IPC handler for settings window visibility
ipcMain.handle("show-settings", () => {
  createSettingsWindow();
});

// IPC handler for chat reset
ipcMain.handle("reset-chat", (event) => {
  if (invisibleWindow) {
    invisibleWindow.webContents.send("reset-chat");
  }
  return true;
});

// IPC handler for context menu
ipcMain.handle("build-context-menu", (event) => {
  const menu = Menu.buildFromTemplate([
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { type: "separator" },
    { role: "selectAll" },
  ]);
  return menu;
});

// IPC handlers for screenshots
ipcMain.handle("get-screenshots-directory", () => {
  const { ensureScreenshotsDirectory } = require("./screenshot");
  return ensureScreenshotsDirectory();
});

ipcMain.handle("get-recent-screenshots", () => {
  return getRecentScreenshots();
});

// IPC handlers for window controls
ipcMain.handle("minimize-window", () => {
  if (invisibleWindow) {
    invisibleWindow.minimize();
  }
});

ipcMain.handle("hide-window", () => {
  if (invisibleWindow) {
    invisibleWindow.hide();
  }
});

// FIXED: IPC handler for analyzing screenshot
ipcMain.handle("analyze-screenshot", async (event, data) => {
  try {
    // Get the market from data
    const market = data.market || "default";
    
    // Build path to data folder for this market
    const dataFolder = path.join(app.getPath("userData"), "data", market);
    
    console.log("=== Analyze Screenshot Debug ===");
    console.log("Market:", market);
    console.log("Data folder:", dataFolder);
    console.log("Screenshot path:", data.filePath);
    
    // Ensure data folder exists
    if (!fs.existsSync(dataFolder)) {
      fs.mkdirSync(dataFolder, { recursive: true });
      console.log("Created data folder:", dataFolder);
    }

    // Get daily and 1-hour charts
    const dailyPath = path.join(dataFolder, "daily.png");
    const oneHourPath = path.join(dataFolder, "1hour.png");
    
    const dataImages = {
      daily: fs.existsSync(dailyPath) ? dailyPath : null,
      oneHour: fs.existsSync(oneHourPath) ? oneHourPath : null,
    };
    
    console.log("Daily chart:", dataImages.daily ? "Found" : "Not found");
    console.log("1-hour chart:", dataImages.oneHour ? "Found" : "Not found");
    console.log("================================");

    const prompt = data.prompt || "Analyze this screenshot and provide trading insights.";

    const result = await makeLLMRequest(
      prompt,
      data.filePath,
      dataImages // Pass the additional images
    );

    if (result.success) {
      sessionTotalTokens += result.tokensUsed;

      // Save analysis to learning service
      const analysisId = learningService.saveAnalysis({
        market: data.market || "Not specified",
        screenshot: data.filePath,
        daily: dataImages.daily,
        oneHour: dataImages.oneHour,
        prompt: prompt,
        response: result.content,
      });

      event.sender.send("llm-response", {
        success: true,
        content: result.content,
        analysisId: analysisId,
      });

      event.sender.send("token-usage-updated", {
        current: sessionTotalTokens,
        max: maxInputTokens,
      });
    }
    return { success: true };
  } catch (error) {
    console.error("Analyze screenshot error:", error);
    event.sender.send("llm-response", {
      success: false,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
});

ipcMain.handle("restore-mouse-ignore", () => {
  if (invisibleWindow) {
    invisibleWindow.setIgnoreMouseEvents(true);
    invisibleWindow.webContents.isIgnoringMouseEvents = true;
  }
  return true;
});

// IPC handler for starting area screenshot
ipcMain.handle("start-area-screenshot", async () => {
  try {
    // Hide the main window
    if (invisibleWindow) {
      invisibleWindow.hide();
    }

    // Wait for window to hide
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check permission
    const hasPermission = await ensureScreenRecordingPermission();
    if (!hasPermission) {
      console.log("Permission not granted. Skipping screenshot.");
      if (invisibleWindow) {
        invisibleWindow.showInactive();
      }
      return { success: false, error: "Permission denied" };
    }

    // Create selection window
    createSelectionWindow();

    return { success: true };
  } catch (error) {
    console.error("Failed to start area screenshot:", error);
    if (invisibleWindow) {
      invisibleWindow.showInactive();
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle("capture-area-screenshot", async (event, area) => {
  try {
    // Close the selection window first
    if (selectionWindow) {
      selectionWindow.close();
      selectionWindow = null;
    }

    // Wait for selection window to close completely
    await new Promise((resolve) => setTimeout(resolve, 150));

    const screenshotPath = await captureAreaScreenshot(desktopCapturer, screen, area);

    if (screenshotPath) {
      console.log("Area screenshot saved:", screenshotPath);
      createEditorWindow(screenshotPath);

      return { success: true, filePath: screenshotPath };
    }

    // If screenshot failed, restore window
    if (invisibleWindow) {
      invisibleWindow.show();
    }

    return { success: false, error: "Failed to capture screenshot" };
  } catch (error) {
    console.error("Area screenshot failed:", error);

    // Close selection window if still open
    if (selectionWindow) {
      selectionWindow.close();
      selectionWindow = null;
    }

    // Restore main window
    if (invisibleWindow) {
      invisibleWindow.show();
    }

    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-editor", async (event, filePath) => {
  try {
    createEditorWindow(filePath);
    return { success: true };
  } catch (error) {
    console.error("Failed to open editor:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("save-edited-screenshot", async (event, base64Data) => {
  try {
    const { ensureScreenshotsDirectory } = require("./screenshot");
    const screenshotsDir = ensureScreenshotsDirectory();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(screenshotsDir, `screenshot-edited-${timestamp}.png`);

    // Convert base64 to buffer and save
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(outputPath, buffer);

    console.log("Edited screenshot saved:", outputPath);

    // Close editor
    if (editorWindow) {
      editorWindow.close();
      editorWindow = null;
    }

    // Show main window and enable interaction
    if (invisibleWindow) {
      invisibleWindow.show();
      invisibleWindow.focus();
      invisibleWindow.setIgnoreMouseEvents(false);
      invisibleWindow.webContents.isIgnoringMouseEvents = false;
    }

    // Send the edited screenshot to the chat
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (invisibleWindow) {
      invisibleWindow.webContents.send("screenshot-captured", {
        filePath: outputPath,
        timestamp: Date.now(),
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to save edited screenshot:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("cancel-editor", () => {
  if (editorWindow) {
    editorWindow.close();
    editorWindow = null;
  }
  if (invisibleWindow) {
    invisibleWindow.show();
  }
  return true;
});

ipcMain.handle("cancel-area-screenshot", () => {
  // Close selection window
  if (selectionWindow) {
    selectionWindow.close();
    selectionWindow = null;
  }

  // Restore main window
  if (invisibleWindow) {
    invisibleWindow.show();
  }

  return true;
});

ipcMain.handle("test-response", async (event, prompt) => {
  try {
    const result = await makeLLMRequest(prompt, null); // No file for test

    if (result.success) {
      sessionTotalTokens += result.tokensUsed;
      event.sender.send("llm-response", {
        success: true,
        content: result.content,
      });
      event.sender.send("token-usage-updated", {
        current: sessionTotalTokens,
        max: maxInputTokens,
      });
    }
    return { success: true };
  } catch (error) {
    event.sender.send("llm-response", {
      success: false,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
});

// FIXED: IPC handler for getting data folder images
ipcMain.handle("get-data-images", (event, market) => {
  const marketFolder = market || "default";
  const dataFolder = path.join(app.getPath("userData"), "data", marketFolder);

  console.log("=== Get Data Images ===");
  console.log("Market:", marketFolder);
  console.log("Checking data images in:", dataFolder);

  if (!fs.existsSync(dataFolder)) {
    console.log("Data folder doesn't exist, creating:", dataFolder);
    fs.mkdirSync(dataFolder, { recursive: true });
  }

  const dailyPath = path.join(dataFolder, "daily.png");
  const oneHourPath = path.join(dataFolder, "1hour.png");

  console.log("daily.png exists:", fs.existsSync(dailyPath));
  console.log("1hour.png exists:", fs.existsSync(oneHourPath));
  console.log("=======================");

  return {
    daily: fs.existsSync(dailyPath) ? dailyPath : null,
    oneHour: fs.existsSync(oneHourPath) ? oneHourPath : null,
  };
});

// IPC handler for feedback
ipcMain.handle("save-feedback", async (event, data) => {
  try {
    learningService.updateFeedback(data.analysisId, data.wasUseful, data.tradeSuccessful);
    return { success: true };
  } catch (error) {
    console.error("Error saving feedback:", error);
    return { success: false, error: error.message };
  }
});

// IPC handler for learning stats
ipcMain.handle("get-learning-stats", () => {
  return learningService.getStats();
});

// Create shared menu template
function createMenuTemplate() {
  return [
    ...(process.platform === "darwin"
      ? [
        {
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            {
              label: "Preferences...",
              accelerator: "Command+,",
              click: () => createSettingsWindow(),
            },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
      ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Developer Tools",
          accelerator:
            process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: (_, window) => {
            if (window) {
              window.webContents.toggleDevTools();
            }
          },
        },
      ],
    },
  ];
}

function createInvisibleWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Calculate compact mode position (right side of screen)
  const compactX = screenWidth - COMPACT_SIZE - COMPACT_MARGIN;
  const compactY = COMPACT_MARGIN;

  invisibleWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    // Start in compact mode
    x: compactX,
    y: compactY,
    width: COMPACT_SIZE,
    height: COMPACT_SIZE,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Set window type to utility on macOS
  if (process.platform === "darwin") {
    invisibleWindow.setAlwaysOnTop(true, "utility", 1);
    // Hide window buttons but keep functionality
    invisibleWindow.setWindowButtonVisibility(false);
  }

  // Set content protection to prevent screen capture
  invisibleWindow.setContentProtection(true);

  // Initially ignore mouse events
  invisibleWindow.setIgnoreMouseEvents(true);
  invisibleWindow.webContents.isIgnoringMouseEvents = true;

  invisibleWindow.loadFile("index.html");

  // Open DevTools in development
  if (process.argv.includes("--debug")) {
    invisibleWindow.webContents.openDevTools();
  }

  // Prevent the window from being closed with mouse
  invisibleWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      invisibleWindow.hide();
    }
    return false;
  });

  // Set the menu for the invisible window
  const menu = Menu.buildFromTemplate(createMenuTemplate());
  Menu.setApplicationMenu(menu);

  // Show window initially
  invisibleWindow.showInactive();

  // Notify renderer about initial mode
  invisibleWindow.webContents.once("did-finish-load", () => {
    invisibleWindow.webContents.send("mode-changed", { isCompact: isCompactMode });
  });
}

function toggleWindowMode() {
  if (!invisibleWindow) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  isCompactMode = !isCompactMode;

  if (isCompactMode) {
    // Switch to compact mode - square at right side
    const compactX = screenWidth - COMPACT_SIZE - COMPACT_MARGIN;
    const compactY = COMPACT_MARGIN;

    invisibleWindow.setBounds({
      x: compactX,
      y: compactY,
      width: COMPACT_SIZE,
      height: COMPACT_SIZE,
    });
  } else {
    // Switch to full screen mode
    invisibleWindow.setBounds({
      x: 0,
      y: 0,
      width: screenWidth,
      height: screenHeight,
    });
  }

  // Notify renderer about mode change
  invisibleWindow.webContents.send("mode-changed", { isCompact: isCompactMode });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    return;
  }

  settingsWindow = new BrowserWindow({
    resizable: true,
    minimizable: true,
    maximizable: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  settingsWindow.loadFile("settings.html");

  // Open DevTools in development
  if (process.argv.includes("--debug")) {
    settingsWindow.webContents.openDevTools();
  }

  settingsWindow.once("ready-to-show", () => {
    settingsWindow.show();
  });

  // Handle window close
  settingsWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      settingsWindow.hide();
    }
    return false;
  });
}

function createSelectionWindow() {
  if (selectionWindow) {
    selectionWindow.close();
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  selectionWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Set window type to screen saver level on macOS
  if (process.platform === "darwin") {
    selectionWindow.setAlwaysOnTop(true, "screen-saver");
  }

  selectionWindow.loadFile("selection.html");

  // Open DevTools in development
  if (process.argv.includes("--debug")) {
    selectionWindow.webContents.openDevTools();
  }

  selectionWindow.on("closed", () => {
    selectionWindow = null;
    if (invisibleWindow) {
      invisibleWindow.showInactive();
    }
  });
}

function createEditorWindow(filePath) {
  if (editorWindow) {
    editorWindow.close();
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  editorWindow = new BrowserWindow({
    width: Math.min(1200, width - 100),
    height: Math.min(800, height - 100),
    frame: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  editorWindow.loadFile("editor.html", {
    query: { file: filePath },
  });

  // Open DevTools in development
  if (process.argv.includes("--debug")) {
    editorWindow.webContents.openDevTools();
  }

  editorWindow.on("closed", () => {
    editorWindow = null;
    if (invisibleWindow) {
      invisibleWindow.show();
    }
  });
}

// Register global shortcuts
function registerShortcuts() {
  // Screenshot shortcut (Command/Ctrl + H)
  globalShortcut.register("CommandOrControl+H", async () => {
    try {
      // Hide window before taking screenshot
      if (invisibleWindow && invisibleWindow.isVisible()) {
        invisibleWindow.hide();
      }

      // Wait for window to hide
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check permission and take screenshot
      const hasPermission = await ensureScreenRecordingPermission();
      if (!hasPermission) {
        console.log("Permission not granted. Skipping screenshot.");
        return;
      }

      const screenshotPath = await captureFullScreen(desktopCapturer, screen);
      if (screenshotPath) {
        console.log("Screenshot saved:", screenshotPath);
        createEditorWindow(screenshotPath);
      }
    } catch (error) {
      console.error("Screenshot failed:", error);
      if (invisibleWindow) {
        invisibleWindow.show();
      }
    }
  });

  // Area screenshot shortcut (Command/Ctrl + Shift + H)
  globalShortcut.register("CommandOrControl+Shift+H", async () => {
    if (invisibleWindow) {
      await invisibleWindow.webContents.executeJavaScript(`
        window.electronAPI.startAreaScreenshot();
      `);
    }
  });

  // Toggle visibility shortcut (Command/Ctrl + B)
  globalShortcut.register("CommandOrControl+B", () => {
    if (invisibleWindow.isVisible()) {
      invisibleWindow.hide();
    } else {
      invisibleWindow.showInactive();
    }
  });

  // Test response shortcut (Command/Ctrl + Shift + T)
  globalShortcut.register("CommandOrControl+Shift+T", async () => {
    if (invisibleWindow) {
      try {
        await invisibleWindow.webContents.executeJavaScript(`
          window.electronAPI.testResponse("write python code to print 'Hello, world!'");
        `);
      } catch (error) {
        console.error("Failed to test response:", error);
      }
    }
  });

  // Text question shortcut (Command/Ctrl + Shift + C)
  globalShortcut.register("CommandOrControl+Shift+C", () => {
    if (invisibleWindow) {
      // Enable mouse events so user can interact with input dialog
      invisibleWindow.setIgnoreMouseEvents(false);
      invisibleWindow.webContents.isIgnoringMouseEvents = false;

      // Show the text question overlay
      invisibleWindow.webContents.send("show-text-question");
    }
  });

  // Toggle window mode (Command/Ctrl + Space)
  globalShortcut.register("CommandOrControl+Space", () => {
    toggleWindowMode();
  });

  // Window movement shortcuts
  const NUDGE_AMOUNT = 50;
  const screenBounds = screen.getPrimaryDisplay().workAreaSize;

  // Nudge window with arrow keys
  globalShortcut.register("CommandOrControl+Left", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x - NUDGE_AMOUNT, y);
    }
  });

  globalShortcut.register("CommandOrControl+Right", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x + NUDGE_AMOUNT, y);
    }
  });

  globalShortcut.register("CommandOrControl+Up", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x, y - NUDGE_AMOUNT);
    }
  });

  globalShortcut.register("CommandOrControl+Down", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x, y + NUDGE_AMOUNT);
    }
  });

  // Snap window to screen edges
  globalShortcut.register("CommandOrControl+Shift+Left", () => {
    if (invisibleWindow) {
      invisibleWindow.setPosition(0, 0);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Right", () => {
    if (invisibleWindow) {
      const windowBounds = invisibleWindow.getBounds();
      invisibleWindow.setPosition(screenBounds.width - windowBounds.width, 0);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Up", () => {
    if (invisibleWindow) {
      invisibleWindow.setPosition(0, 0);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Down", () => {
    if (invisibleWindow) {
      const windowBounds = invisibleWindow.getBounds();
      invisibleWindow.setPosition(0, screenBounds.height - windowBounds.height);
    }
  });

  // Reset chat shortcut (Command/Ctrl + Shift + R)
  globalShortcut.register("CommandOrControl+Shift+R", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("reset-chat");
    }
  });

  // Chat scrolling shortcuts
  globalShortcut.register("Alt+Up", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("scroll-chat", "up");
    }
  });

  globalShortcut.register("Alt+Down", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("scroll-chat", "down");
    }
  });

  // For macOS, also register Option key combinations
  if (process.platform === "darwin") {
    globalShortcut.register("Option+Up", () => {
      if (invisibleWindow) {
        invisibleWindow.webContents.send("scroll-chat", "up");
      }
    });

    globalShortcut.register("Option+Down", () => {
      if (invisibleWindow) {
        invisibleWindow.webContents.send("scroll-chat", "down");
      }
    });
  }
}

// When app is ready
app.whenReady().then(async () => {
  // Load API key from config before initializing services
  const apiKey = config.getGeminiKey();
  if (apiKey) {
    initializeLLMService();
    try {
      // Fetch model info on startup
      const info = await getModelInfo();
      maxInputTokens = info.input_token_limit;
      console.log(`Model initialized. Max tokens: ${maxInputTokens}`);
    } catch (e) {
      console.error("Could not fetch model info on startup.", e.message);
    }
  }

  createInvisibleWindow();
  registerShortcuts();

  // Create tray icon for Windows
  if (process.platform === "win32") {
    const trayIconPath = path.join(__dirname, "../assets/OCTO.png");
    if (fs.existsSync(trayIconPath)) {
      tray = new Tray(trayIconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: "Show", click: () => invisibleWindow.show() },
        { label: "Hide", click: () => invisibleWindow.hide() },
        { label: "Settings...", click: () => createSettingsWindow() },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]);
      tray.setToolTip("Open Interview Coder");
      tray.setContextMenu(contextMenu);
    }
  }

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createInvisibleWindow();
    }
  });
});

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Clean up on app quit
app.on("before-quit", () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
});