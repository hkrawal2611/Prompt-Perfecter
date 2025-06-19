// Background script for Prompt Perfecter extension
console.log("Background Script Loaded");

// --- Listens for the keyboard shortcut command ---
chrome.commands.onCommand.addListener((command) => {
  console.log(`Command received: ${command}`);

  if (command === "trigger-refinement") {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        // Send a message to the content script in the active tab
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "triggerRefinementFromShortcut"
        });
      }
    });
  }
});

// Handle extension install or update
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('Extension installed or updated:', details.reason);
  
  // Set default values if it's a fresh install
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      isEnabled: true,
      enhancementStyle: 'general',
      geminiApiKey: '' // Placeholder for API key that user will need to set
    }, function() {
      console.log('Default settings initialized');
      
      // Open options page for first install to prompt API key input
      chrome.runtime.openOptionsPage();
    });
  }
});

// Listen for API key validation requests from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'validateApiKey') {
    const apiKey = message.apiKey;
    
    // Simple validation to check if key is properly formatted
    if (!apiKey || apiKey.trim().length < 10) {
      sendResponse({isValid: false, message: 'API key appears too short or invalid'});
      return true;
    }
    
    // Test the API key with a simple request
    fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
      .then(response => {
        if (response.ok) {
          sendResponse({isValid: true, message: 'API key validated successfully'});
        } else {
          sendResponse({isValid: false, message: 'API key validation failed'});
        }
      })
      .catch(error => {
        console.error('API validation error:', error);
        sendResponse({isValid: false, message: 'Error validating API key'});
      });
    
    return true; // Indicates async response
  }
});