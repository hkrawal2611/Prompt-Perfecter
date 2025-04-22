// Main content script for Prompt Perfecter extension
console.log('Content Script: FULL VERSION LOADED on', window.location.hostname);

// Mapping for different LLM platforms and their input selectors
const LLM_PLATFORMS = {
  'chat.openai.com': {  
    inputSelector: '#prompt-textarea',
    submitSelector: 'button[data-testid="send-button"]'
  },
  'chatgpt.com': {
    inputSelector: '#prompt-textarea',
    submitSelector: 'button[data-testid="send-button"]'
  },
  'claude.ai': {
    inputSelector: '[data-testid="input-field"]',
    submitSelector: 'button[data-testid="send-button"]'
  },
  'gemini.google.com': {
    inputSelector: '[contenteditable="true"]',
    submitSelector: 'button[aria-label="Send message"]'
  },
  'grok.x.ai': {
    inputSelector: '.chat-input-textarea',
    submitSelector: 'button.chat-input-send-btn'
  }
};

// Detect which platform we're on
function detectPlatform() {
  const hostname = window.location.hostname;
  for (const platform in LLM_PLATFORMS) {
    if (hostname.includes(platform)) {
      return platform;
    }
  }
  return null;
}

// Get platform-specific selectors
function getPlatformSelectors() {
  const platform = detectPlatform();
  return platform ? LLM_PLATFORMS[platform] : null;
}

// Detect dark mode
function isDarkMode() {
  // Check for dark mode at system level
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return true;
  }
  
  // Check for dark mode in DOM (platform specific)
  const platform = detectPlatform();
  if (platform === 'chat.openai.com' || platform === 'chatgpt.com') {
    return document.documentElement.classList.contains('dark');
  } else if (platform === 'claude.ai') {
    return document.documentElement.classList.contains('dark') || 
           document.querySelector('html[data-theme="dark"]') !== null;
  } else if (platform === 'gemini.google.com') {
    return document.querySelector('html[dark="true"]') !== null;
  } else if (platform === 'grok.x.ai') {
    return document.querySelector('body.dark') !== null;
  }
  
  // Fallback: check for dark background
  const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
  const rgbValues = bodyBgColor.match(/\d+/g);
  if (rgbValues && rgbValues.length >= 3) {
    const [r, g, b] = rgbValues.map(Number);
    // If average RGB value is low, it's likely dark mode
    return (r + g + b) / 3 < 128;
  }
  
  return false;
}

// Get theme colors based on dark/light mode
function getThemeColors() {
  const darkMode = isDarkMode();
  
  return {
    primary: '#1a73e8', // Blue primary stays consistent
    text: darkMode ? '#e0e0e0' : '#374151',
    background: darkMode ? '#202124' : 'white',
    border: darkMode ? '#525252' : '#e5e7eb',
    cardBackground: darkMode ? '#303134' : 'white',
    codeBackground: darkMode ? '#3c3c3c' : '#f1f5f9',
    errorBackground: darkMode ? '#442726' : '#fce8e6',
    errorText: darkMode ? '#ff7b72' : '#d93025',
    buttonBackground: darkMode ? '#3c4043' : '#f5f5f5',
    buttonText: darkMode ? '#e0e0e0' : '#333',
    buttonBorder: darkMode ? '#5f6368' : '#ddd',
    popupBackdrop: darkMode ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)',
    boxShadow: darkMode ? '0 4px 24px rgba(0,0,0,0.3)' : '0 4px 24px rgba(0,0,0,0.2)'
  };
}

// Check if extension context is valid
function isExtensionContextValid() {
  try {
    // Try to access the runtime ID
    if (chrome.runtime && chrome.runtime.id) {
      return true;
    }
    
    // If we got here without an error but no ID, context is invalid
    return false;
  } catch (error) {
    console.error('Extension context check error:', error);
    return false;
  }
}

function executeWithValidContext(callback, maxRetries = 3, delay = 500) {
  let retryCount = 0;
  
  function attemptExecution() {
    if (isExtensionContextValid()) {
      // Context is valid, execute the callback
      callback();
    } else if (retryCount < maxRetries) {
      // Context invalid but we have retries left
      retryCount++;
      console.log(`Extension context invalid. Retry ${retryCount}/${maxRetries} in ${delay}ms...`);
      setTimeout(attemptExecution, delay);
    } else {
      // Out of retries
      console.error('Extension context remains invalid after retries. Please refresh the page.');
      showFloatingPopup('Extension context invalid after multiple attempts. Please refresh the page.', 'error');
    }
  }
  
  attemptExecution();
}

// Main initialization function
function initPromptEnhancer() {
  console.log('Prompt Perfecter: initPromptEnhancer called');
  
  executeWithValidContext(() => {
    try {
      chrome.storage.sync.get(['isEnabled', 'geminiApiKey'], function(data) {
        console.log('Prompt Perfecter: Storage data retrieved:', data);
      
        if (!data.isEnabled) {
          console.log('Prompt Perfecter: Enhancement is disabled in settings.');
          return;
        }
        
        const platform = detectPlatform();
        console.log('Prompt Perfecter: Detected platform:', platform);
        if (!platform) {
          console.log('Prompt Perfecter: Unsupported platform.');
          return;
        }
      
        const platformSelectors = getPlatformSelectors();
        console.log('Prompt Perfecter: Using selectors:', platformSelectors);
        if (!platformSelectors) {
          console.log('Prompt Perfecter: Could not get platform selectors.');
          return;
        }
        
        const inputSelector = platformSelectors.inputSelector;
        const inputElement = document.querySelector(inputSelector);
        console.log(`Prompt Perfecter: Trying to find input element with selector "${inputSelector}"`);
        
        if (!inputElement) {
          console.log('Prompt Perfecter: Input element NOT FOUND. Retrying...');
          // Retry with a more robust approach
          setTimeout(initPromptEnhancer, 2000);
          return;
        }
        
        console.log('Prompt Perfecter: Input element FOUND:', inputElement);
        setupEnhancementUI(inputElement);
      });
    } catch (error) {
      console.error('Prompt Perfecter: Error initializing:', error);
    }
  });
}

function setupEnhancementUI(inputElement) {
    console.log('Prompt Perfecter: Setting up UI for element:', inputElement);
    const colors = getThemeColors();
  
    // Check if button already exists to prevent duplicates
    const existingButton = document.querySelector('.prompt-enhancer-button');
    if (existingButton) {
      console.log('Prompt Perfecter: Enhance button already exists. Skipping UI setup.');
      return;
    }
  
    // Find the actions container - look for the flex container near the input
    const actionsContainer = document.querySelector('div[class*="max-xs:gap-1 flex items-center gap-2 overflow-x-auto [scrollbar-width:none]"]') || 
                             document.querySelector('div[class*="gap-2"][class*="flex"]');
    
    let enhanceButton;
    
    if (!actionsContainer) {
      console.log('Prompt Perfecter: Actions container not found. Falling back to absolute positioning.');
      // Fall back to the original absolute positioning if container not found
      enhanceButton = document.createElement('button');
      enhanceButton.textContent = '✨ Enhance';
      enhanceButton.className = 'prompt-enhancer-button';
      enhanceButton.style.cssText = `
        position: absolute;
        top: -30px;
        right: 10px;
        background-color: ${colors.primary};
        color: white;
        border: none;
        border-radius: 4px;
        padding: 5px 10px;
        font-size: 12px;
        cursor: pointer;
        z-index: 9999;
      `;
      
      inputElement.parentElement.appendChild(enhanceButton);
    } else {
      console.log('Prompt Perfecter: Actions container found, inserting button inline.');
      
      // Create the button with exact matching style
      enhanceButton = document.createElement('button');
      enhanceButton.className = 'prompt-enhancer-button';
      
      // Copy the exact style for a pill-shaped button with border
      enhanceButton.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background-color: transparent;
        border: 1px solid ${colors.border};
        border-radius: 9999px;
        padding: 7px 12px;
        color: ${colors.text};
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s, border-color 0.2s;
        height: 36px;
        outline: none;
      `;
      
      // Add hover effect
      enhanceButton.addEventListener('mouseover', function() {
        enhanceButton.style.backgroundColor = isDarkMode() ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
      });
      
      enhanceButton.addEventListener('mouseout', function() {
        enhanceButton.style.backgroundColor = 'transparent';
      });
      
      // Create the content with icon and text like the other buttons
      const iconSpan = document.createElement('span');
      iconSpan.innerHTML = '✨'; // Sparkle emoji as icon
      iconSpan.style.cssText = `
        display: inline-flex;
        color: #f59e0b; /* Amber/yellow color for the sparkle icon */
        font-size: 16px;
      `;
      
      const textSpan = document.createElement('span');
      textSpan.textContent = 'Perfecter';
      textSpan.style.cssText = `
        font-size: 14px;
      `;
      
      enhanceButton.appendChild(iconSpan);
      enhanceButton.appendChild(textSpan);
      
      // Set accessibility attributes
      enhanceButton.setAttribute('aria-label', 'Enhance prompt');
      enhanceButton.setAttribute('title', 'Enhance your prompt with AI');
      
      // Insert the button into the container
      actionsContainer.appendChild(enhanceButton);
    }
  
    // Create floating popup for suggestions (rather than attaching it to the DOM)
    const popupId = 'prompt-perfecter-popup';
  
    // Add click event listener to the enhance button
    if (enhanceButton) {
      enhanceButton.addEventListener('click', function(event) {
        event.stopPropagation();
        event.preventDefault();
        console.log('Prompt Perfecter: Enhance button clicked!');
        
        // Check extension context again before proceeding
        if (!isExtensionContextValid()) {
          showFloatingPopup('Extension context is invalid. Please refresh the page.', 'error');
          return;
        }
        
        const inputText = getInputText(inputElement);
        console.log('Prompt Perfecter: Input text:', inputText ? 'Found' : 'Not found');
        
        if (!inputText || inputText.trim().length < 3) {
          showFloatingPopup('Please enter a prompt to enhance', 'error');
          return;
        }
        
        console.log('Prompt Perfecter: Calling enhancePrompt with input text:', inputText.substring(0, 20) + '...');
        // Show loading state
        showFloatingPopup('Enhancing your prompt... ✨', 'loading');
        // Call enhance prompt with the new popup approach
        enhancePrompt(inputText, inputElement);
      });
    }
  }
  
// Create and show a floating popup
function showFloatingPopup(message, type = 'info', enhancedText = null, inputElement = null) {
    console.log(`Showing floating popup (${type}):`, message);
    const colors = getThemeColors();
    
    // Remove any existing popup and backdrop
    const existingPopup = document.getElementById('prompt-perfecter-popup');
    const existingBackdrop = document.getElementById('prompt-perfecter-backdrop');
    if (existingPopup) existingPopup.remove();
    if (existingBackdrop) existingBackdrop.remove();
    
    // Create popup container
    const popup = document.createElement('div');
    popup.id = 'prompt-perfecter-popup';
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80%;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      background: ${colors.cardBackground};
      border-radius: 12px;
      box-shadow: ${colors.boxShadow};
      padding: 20px;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: ${colors.text};
    `;
    
    // Create backdrop early to avoid reference errors
    const backdrop = document.createElement('div');
    backdrop.id = 'prompt-perfecter-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: ${colors.popupBackdrop};
      z-index: 99998;
    `;
    
    // Function to close both popup and backdrop
    const closeAll = () => {
      popup.remove();
      backdrop.remove();
    };
    
    // Set up event listener for backdrop
    backdrop.addEventListener('click', closeAll);
    
    // Create header with close button
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 15px;
      border-bottom: 1px solid ${colors.border};
    `;
    
    const title = document.createElement('h3');
    title.textContent = '✨ Prompt Perfecter';
    title.style.cssText = `
      margin: 0;
      font-size: 18px;
      color: ${colors.primary};
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: ${colors.text};
    `;
    closeBtn.addEventListener('click', closeAll);
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    popup.appendChild(header);
    
    // Create content area
    const content = document.createElement('div');
    
    if (type === 'loading') {
      content.innerHTML = `
        <div style="text-align: center; padding: 30px 0;">
          <div style="margin-bottom: 20px; color: ${colors.text};">${message}</div>
          <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid ${colors.border}; 
          border-top: 3px solid ${colors.primary}; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;
    } else if (type === 'error') {
      content.innerHTML = `
        <div style="color: ${colors.errorText}; padding: 10px; background: ${colors.errorBackground}; border-radius: 6px;">
          ${message}
        </div>
      `;
    } else if (type === 'success' && enhancedText) {
      content.innerHTML = `
        <div style="margin-bottom: 15px; color: ${colors.text};">✨ <strong>Enhanced Prompt:</strong></div>
        <div style="background: ${colors.codeBackground}; padding: 15px; border-radius: 6px; white-space: pre-wrap; margin-bottom: 15px; color: ${colors.text};">
          ${enhancedText}
        </div>
      `;
      
      // Add action buttons
      const actions = document.createElement('div');
      actions.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      `;
      
      const useBtn = document.createElement('button');
      useBtn.textContent = 'Use This Prompt';
      useBtn.style.cssText = `
        background: ${colors.primary};
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
      `;
      useBtn.addEventListener('click', () => {
        if (inputElement) {
          setInputText(inputElement, enhancedText);
        }
        closeAll();
      });
      
      const closeButton = document.createElement('button');
      closeButton.textContent = 'Close';
      closeButton.style.cssText = `
        background: ${colors.buttonBackground};
        color: ${colors.buttonText};
        border: 1px solid ${colors.buttonBorder};
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      `;
      closeButton.addEventListener('click', closeAll);
      
      actions.appendChild(closeButton);
      actions.appendChild(useBtn);
      content.appendChild(actions);
    } else {
      content.textContent = message;
    }
    
    popup.appendChild(content);
    
    // Add to body
    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    
    return popup;
  }

// Get text from input (handles different input types)
function getInputText(inputElement) {
  console.log('Getting input text from:', inputElement);
  
  // For ChatGPT's contenteditable div
  if (inputElement.getAttribute('contenteditable') === 'true') {
    return inputElement.textContent || inputElement.innerText || '';
  }
  // For standard input fields
  else if (inputElement.value !== undefined) {
    return inputElement.value;
  }
  // For textareas
  else if (inputElement.textContent !== undefined) {
    return inputElement.textContent;
  }
  
  return '';
}

// Set text to input (handles different input types)
function setInputText(inputElement, text) {
  console.log('Setting input text to:', text.substring(0, 20) + '...');
  
  // For ChatGPT's contenteditable div
  if (inputElement.getAttribute('contenteditable') === 'true') {
    inputElement.textContent = text;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.focus();
    return true;
  }
  // For standard input fields
  else if (inputElement.value !== undefined) {
    inputElement.value = text;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  // For textareas
  else if (inputElement.textContent !== undefined) {
    inputElement.textContent = text;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  
  return false;
}

// Show message in the suggestion container
function showMessage(container, message, type = 'info') {
    console.log(`Showing message (${type}):`, message);
    const colors = getThemeColors();
    
    container.innerHTML = `<div style="color: ${
      type === 'error' ? colors.errorText : 
      type === 'success' ? 'green' : 
      colors.text
    };">${message}</div>`;
    container.style.display = 'block';
    
    // Add this to debug visibility
    console.log('Container display style after setting to block:', container.style.display);
    console.log('Container computed style:', window.getComputedStyle(container).display);
    console.log('Container bounding rect:', container.getBoundingClientRect());
  }

// Enhance prompt using direct fetch call (avoid background script)
function enhancePrompt(inputText, inputElement) {
  console.log('Prompt Perfecter: enhancePrompt called');

  executeWithValidContext(() => {
  
  try {
    chrome.storage.sync.get(['geminiApiKey', 'enhancementStyle'], function(data) {
      console.log('Prompt Perfecter: Retrieved storage data for enhancement');
      const apiKey = data.geminiApiKey;
      const style = data.enhancementStyle || 'general';
  
      if (!apiKey) {
        console.log('Prompt Perfecter: API key missing');
        showFloatingPopup('API key missing. Please set it in the extension options.', 'error');
        return;
      }
      
      console.log('Prompt Perfecter: API key found, style:', style);
  
      // Define system instruction based on style
      const styleInstructions = {
        general: 'Improve this prompt for clarity and effectiveness.',
        detailed: 'Make this prompt more specific and detailed.',
        concise: 'Make this prompt shorter and clearer.',
        technical: 'Make this prompt more technical and precise.'
      };
  
      const promptInstruction = styleInstructions[style] || styleInstructions.general;
      console.log('Prompt Perfecter: Using instruction:', promptInstruction);
      
      // Create the API URL and body separately for clarity
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const requestBody = {
        contents: [
          {
            parts: [
              { text: `You are a prompt optimization expert. Your only job is to enhance the user's prompt to make it more effective. 
      
      Please enhance this prompt to make it ${style === 'concise' ? 'shorter and' : ''} more ${style} and effective. Return ONLY the enhanced prompt with no explanations, no options, no commentary, and no additional text.
      
      Original: ${inputText}` }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 512,
        }
      };
      // Direct API call (skipping background script for simplicity)
      console.log('Prompt Perfecter: Sending API request to Gemini');
      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      .then(response => {
        console.log('Prompt Perfecter: Response received, status:', response.status);
        if (!response.ok) {
          return response.json().then(errorData => {
            console.error('Prompt Perfecter: API error:', errorData);
            throw new Error(errorData.error?.message || `API error: ${response.status}`);
          });
        }
        return response.json();
      })
      .then(data => {
        console.log('Prompt Perfecter: Parsed API response data');
        console.log('Prompt Perfecter: Attempting to extract text...');
        const enhancedText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        console.log('Prompt Perfecter: Extracted enhancedText variable:', enhancedText);
        if (enhancedText) {
          console.log('Prompt Perfecter: SUCCESS - enhancedText is valid. Proceeding to display.');
          showFloatingPopup('', 'success', enhancedText, inputElement);
        } else {
          console.error('Prompt Perfecter: FAILURE - enhancedText is null or undefined.');
          const blockReason = data?.candidates?.[0]?.finishReason;
          const safetyRatings = data?.promptFeedback?.safetyRatings;
          let errorMsg = 'Could not extract enhanced prompt from the API response.';
          if (blockReason === 'SAFETY' || safetyRatings?.some(r => r.blocked)) {
            errorMsg = 'Enhancement failed due to safety settings or blocked content.';
            console.warn('Prompt Perfecter: Enhancement blocked by safety settings:', safetyRatings);
          } else if (blockReason) {
            errorMsg += ` (Finish Reason: ${blockReason})`;
          }
          showFloatingPopup(errorMsg, 'error');
        }
      })
      .catch(err => {
        console.error('Prompt Perfecter: Gemini API error:', err);
        showFloatingPopup(`Failed to enhance prompt: ${err.message}`, 'error');
      });
    });
  } catch (error) {
    console.error('Prompt Perfecter: Error accessing Chrome storage:', error);
    showFloatingPopup('Extension error. Please refresh the page and try again.', 'error');
  }
});
}

// Add theme change listener
function setupThemeChangeListener() {
  // Listen for system preference changes
  if (window.matchMedia) {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkModeMediaQuery.addEventListener('change', () => {
      console.log('Prompt Perfecter: System theme changed, updating UI');
      // Update any visible UI components
      updateUIForCurrentTheme();
    });
  }
  
  // Platform-specific theme change observers (DOM mutations)
  const platform = detectPlatform();
  if (platform) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme')) {
          console.log('Prompt Perfecter: Theme-related attribute changed, updating UI');
          updateUIForCurrentTheme();
          break;
        }
      }
    });
    
    // Observe the html or body element for class changes
    observer.observe(document.documentElement, { attributes: true });
    observer.observe(document.body, { attributes: true });
  }
}

// Update UI for current theme
function updateUIForCurrentTheme() {
  // Find and update the enhance button
  const enhanceButton = document.querySelector('.prompt-enhancer-button');
  if (enhanceButton) {
    const colors = getThemeColors();
    
    // Update button styles
    enhanceButton.style.color = colors.text;
    enhanceButton.style.borderColor = colors.border;
    
    // Update any other visible components
    const popup = document.getElementById('prompt-perfecter-popup');
    if (popup) {
      popup.style.backgroundColor = colors.cardBackground;
      popup.style.color = colors.text;
      popup.style.boxShadow = colors.boxShadow;
      
      // Update popup content color schemes
      const contentDivs = popup.querySelectorAll('div');
      for (const div of contentDivs) {
        if (div.style.background === colors.codeBackground) {
          div.style.color = colors.text;
        }
      }
    }
    
    const backdrop = document.getElementById('prompt-perfecter-backdrop');
    if (backdrop) {
      backdrop.style.background = colors.popupBackdrop;
    }
  }
}

// Initialize when the page is loaded
window.addEventListener('load', function() {
  // Wait a bit for dynamic content to load
  console.log('Prompt Perfecter: Window loaded. Initializing...');
  setTimeout(() => {
    initPromptEnhancer();
    setupThemeChangeListener();
  }, 1500);
});

// Re-initialize when URL changes (for SPAs)
let lastUrl = location.href;
let observer;

function startObserving() {
  // Stop any existing observer
  if (observer) {
    observer.disconnect();
  }
  
  // Create new observer
  observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      console.log('Prompt Perfecter: URL changed detected. Re-initializing...');
      lastUrl = currentUrl;
      // Add a slight delay after URL change before trying to find elements
      setTimeout(() => {
        initPromptEnhancer();
        updateUIForCurrentTheme();
      }, 1500);
    }
  });
  
  // Start observing with error handling
  try {
    observer.observe(document.body, {subtree: true, childList: true});
  } catch (error) {
    console.error('Failed to start MutationObserver:', error);
  }
}

// Start observing with a slight delay to ensure document is ready
setTimeout(startObserving, 1000);

// Add periodic check for UI changes and theme changes
setInterval(() => {
  const platform = detectPlatform();
  if (!platform) return;
  
  const selectors = getPlatformSelectors();
  if (!selectors) return;
  
  const inputElement = document.querySelector(selectors.inputSelector);
  if (!inputElement) return;
  
  const enhanceButton = document.querySelector('.prompt-enhancer-button');
  if (!enhanceButton) {
    console.log('Prompt Perfecter: Button not found during periodic check, reinitializing');
    setupEnhancementUI(inputElement);
  } else {
    // Ensure button styles are updated for current theme
    updateUIForCurrentTheme();
  }
}, 10000); // Check every 10 seconds