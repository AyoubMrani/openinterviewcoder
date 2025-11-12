const { app, dialog, shell, systemPreferences } = require("electron");
const fs = require("fs");
const path = require("path");

// Maximum number of screenshots to keep
const MAX_SCREENSHOTS = 20;

// Checks and optionally guides user to grant macOS screen recording permission
async function ensureScreenRecordingPermission() {
  if (process.platform !== "darwin") return true; // Only needed on macOS

  const status = systemPreferences.getMediaAccessStatus("screen");
  if (status === "granted") return true;

  const result = await dialog.showMessageBox({
    type: "info",
    buttons: ["Open Settings", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Screen Recording Permission Required",
    message:
      "To capture the screen, please enable screen recording for this app in System Settings > Privacy & Security > Screen Recording.",
  });

  if (result.response === 0) {
    shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    );
  }

  return false;
}

// Ensures the screenshots directory exists
function ensureScreenshotsDirectory() {
  const screenshotsDir = path.join(app.getPath("userData"), "screenshots");

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  return screenshotsDir;
}

// Cleans up old screenshots to prevent using too much disk space
function cleanupOldScreenshots() {
  try {
    const screenshotsDir = ensureScreenshotsDirectory();
    const files = fs
      .readdirSync(screenshotsDir)
      .filter((file) => file.startsWith("screenshot-") && file.endsWith(".png"))
      .map((file) => ({
        name: file,
        path: path.join(screenshotsDir, file),
        mtime: fs.statSync(path.join(screenshotsDir, file)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Keep only the most recent MAX_SCREENSHOTS
    if (files.length > MAX_SCREENSHOTS) {
      const filesToDelete = files.slice(MAX_SCREENSHOTS);
      filesToDelete.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
          console.log(`Deleted old screenshot: ${file.name}`);
        } catch (err) {
          console.error(`Failed to delete screenshot ${file.name}:`, err);
        }
      });
    }
  } catch (err) {
    console.error("Error cleaning up screenshots:", err);
  }
}

// Gets a list of recent screenshots
function getRecentScreenshots(limit = 5) {
  try {
    const screenshotsDir = ensureScreenshotsDirectory();
    const files = fs
      .readdirSync(screenshotsDir)
      .filter((file) => file.startsWith("screenshot-") && file.endsWith(".png"))
      .map((file) => ({
        name: file,
        path: path.join(screenshotsDir, file),
        mtime: fs.statSync(path.join(screenshotsDir, file)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .slice(0, limit);

    return files;
  } catch (err) {
    console.error("Error getting recent screenshots:", err);
    return [];
  }
}

// Captures a full-screen screenshot and saves it to the app's data directory
async function captureFullScreen(desktopCapturer, screen) {
  const { width, height } = screen.getPrimaryDisplay().size;

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
  });

  if (!sources.length) {
    console.error("No screen sources found.");
    return;
  }

  const image = sources[0].thumbnail;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Save to app's user data directory instead of pictures folder
  const screenshotsDir = ensureScreenshotsDirectory();
  const outputPath = path.join(screenshotsDir, `screenshot-${timestamp}.png`);

  fs.writeFileSync(outputPath, image.toPNG());
  console.log("Screenshot saved to:", outputPath);

  // Clean up old screenshots
  cleanupOldScreenshots();

  return outputPath;
}

// Captures a specific area of the screen
// Captures a specific area of the screen
async function captureAreaScreenshot(desktopCapturer, screen, area) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;
  const scaleFactor = primaryDisplay.scaleFactor;

  console.log("=== Screenshot Debug Info ===");
  console.log("Screen bounds:", primaryDisplay.bounds);
  console.log("Screen size:", primaryDisplay.size);
  console.log("Scale factor:", scaleFactor);
  console.log("Selection area:", area);

  // Capture at full resolution
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: screenWidth * scaleFactor,
      height: screenHeight * scaleFactor
    },
  });

  if (!sources.length) {
    console.error("No screen sources found.");
    return null;
  }

  const image = sources[0].thumbnail;
  const imageSize = image.getSize();
  console.log("Captured image size:", imageSize);

  // Calculate the actual scale between captured image and screen bounds
  const actualScaleX = imageSize.width / screenWidth;
  const actualScaleY = imageSize.height / screenHeight;

  console.log("Actual scale X:", actualScaleX);
  console.log("Actual scale Y:", actualScaleY);

  // Apply the actual scale to the selection coordinates
  const cropArea = {
    x: Math.round(area.x * actualScaleX),
    y: Math.round(area.y * actualScaleY),
    width: Math.round(area.width * actualScaleX),
    height: Math.round(area.height * actualScaleY),
  };

  console.log("Scaled crop area:", cropArea);

  // Ensure crop area is within bounds
  cropArea.x = Math.max(0, Math.min(cropArea.x, imageSize.width));
  cropArea.y = Math.max(0, Math.min(cropArea.y, imageSize.height));
  cropArea.width = Math.min(cropArea.width, imageSize.width - cropArea.x);
  cropArea.height = Math.min(cropArea.height, imageSize.height - cropArea.y);

  console.log("Final crop area:", cropArea);
  console.log("===========================");

  // Validate crop area
  if (cropArea.width <= 0 || cropArea.height <= 0) {
    console.error("Invalid crop area dimensions");
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Crop the image to the selected area
  const croppedImage = image.crop(cropArea);

  // Save to app's user data directory
  const screenshotsDir = ensureScreenshotsDirectory();
  const outputPath = path.join(screenshotsDir, `screenshot-${timestamp}.png`);

  fs.writeFileSync(outputPath, croppedImage.toPNG());
  console.log("Area screenshot saved to:", outputPath);

  // Clean up old screenshots
  cleanupOldScreenshots();

  return outputPath;
}


module.exports = {
  ensureScreenRecordingPermission,
  captureFullScreen,
  captureAreaScreenshot,
  getRecentScreenshots,
  cleanupOldScreenshots,
  ensureScreenshotsDirectory,
};
