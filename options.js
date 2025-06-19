// options.js - Script for the extension options page

document.addEventListener("DOMContentLoaded", function () {
  // Load saved settings
  chrome.storage.sync.get(["isEnabled", "geminiApiKey"], function (data) {
    document.getElementById("isEnabled").checked = data.isEnabled !== false;
    document.getElementById("apiKey").value = data.geminiApiKey || "";

    // Display current settings
    updateStatus("Settings loaded");
  });

  // Save settings when form is submitted
  document
    .getElementById("settingsForm")
    .addEventListener("submit", function (e) {
      e.preventDefault();

      const isEnabled = document.getElementById("isEnabled").checked;
      const apiKey = document.getElementById("apiKey").value.trim();

      // Basic validation
      if (!apiKey) {
        updateStatus("Please enter a valid Gemini API key", "error");
        return;
      }

      // Test API key before saving
      updateStatus("Validating API key...", "info");

      chrome.runtime.sendMessage(
        {
          action: "validateApiKey",
          apiKey: apiKey,
        },
        (response) => {
          // If the background script is inactive, response might be undefined.
          // We can check the runtime lastError as a fallback.
          if (chrome.runtime.lastError) {
            updateStatus(
              "Error validating key. The extension background may have gone inactive. Please try again.",
              "error"
            );
            console.error(chrome.runtime.lastError.message);
            return;
          }

          if (response && response.isValid) {
            // Save settings if API key is valid
            chrome.storage.sync.set(
              {
                isEnabled: isEnabled,
                geminiApiKey: apiKey,
              },
              function () {
                updateStatus("Settings saved successfully!", "success");
              }
            );
          } else {
            updateStatus(
              "API key validation failed: " +
                (response ? response.message : "Unknown error"),
              "error"
            );
          }
        }
      );
    });

  // Function to update status message
  function updateStatus(message, type = "info") {
    const statusEl = document.getElementById("status");
    statusEl.textContent = message;
    statusEl.className = "status " + type;

    // Clear message after a delay
    setTimeout(function () {
      statusEl.textContent = "";
      statusEl.className = "status";
    }, 5000); // Increased timeout for better readability
  }
});
