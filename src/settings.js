// Settings management
document.addEventListener("DOMContentLoaded", async () => {
  // Get all form elements
  const geminiKeyInput = document.getElementById("geminiKey");
  const saveButton = document.getElementById("saveButton");

  // Verify all elements exist
  if (!geminiKeyInput || !saveButton) {
    console.error("Required DOM elements not found");
    return;
  }

  // Load current settings
  try {
    const settings = await window.electronAPI.getSettings();

    // Apply settings to form elements
    if (settings && settings.geminiKey) { // +++ CHANGED +++
      geminiKeyInput.value = settings.geminiKey; // +++ CHANGED +++
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }

  // Handle save button click
  saveButton.addEventListener("click", async () => {
    const settings = {
      geminiKey: geminiKeyInput.value.trim(), // +++ CHANGED +++
    };

    try {
      await window.electronAPI.saveSettings(settings);
      // Show success message
      saveButton.textContent = "Saved!";
      setTimeout(() => {
        saveButton.textContent = "Save";
      }, 2000);
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings. Please try again.");
    }

  });
});
