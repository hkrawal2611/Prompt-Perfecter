// popup.js
document.addEventListener('DOMContentLoaded', function() {
    // Load current settings
    chrome.storage.sync.get(['isEnabled', 'geminiApiKey'], function(data) {
      document.getElementById('isEnabled').checked = data.isEnabled !== false;
      
      // Show warning if API key is not set
      if (!data.geminiApiKey) {
        showStatus('Please configure your Gemini API key in settings', 'error');
      }
    });
    
    // Toggle enable/disable
    document.getElementById('isEnabled').addEventListener('change', function(e) {
      const isEnabled = e.target.checked;
      
      chrome.storage.sync.set({isEnabled: isEnabled}, function() {
        showStatus(`Enhancement ${isEnabled ? 'enabled' : 'disabled'}`, 'success');
      });
    });
    
    // Open options page
    document.getElementById('configureBtn').addEventListener('click', function() {
      chrome.runtime.openOptionsPage();
    });
    
    // Helper function to show status messages
    function showStatus(message, type = '') {
      const statusEl = document.getElementById('status');
      statusEl.textContent = message;
      statusEl.className = 'status ' + type;
    }
  });