// Main content script for Prompt Perfecter extension
console.log("Content Script: FULL VERSION LOADED on", window.location.hostname);

// --- Helper to check if the script's context is still valid ---
function isContextValid() {
  try {
    // Accessing chrome.runtime.id is a safe, non-throwing way to check
    // if the context is still connected to the extension.
    if (chrome.runtime.id) return true;
  } catch (e) {
    // If an error is thrown, the context is invalidated.
    return false;
  }
  return false;
}

// --- Platform & Theming (No changes here, kept for brevity) ---
const LLM_PLATFORMS = {
  "chat.openai.com": { inputSelector: "#prompt-textarea" },
  "chatgpt.com": { inputSelector: "#prompt-textarea" },
  "claude.ai": { inputSelector: 'div.ProseMirror[contenteditable="true"]' },
  "gemini.google.com": { inputSelector: '[contenteditable="true"]' },
  "grok.x.ai": { inputSelector: ".chat-input-textarea" },
};
function detectPlatform() {
  const h = window.location.hostname;
  for (const p in LLM_PLATFORMS) if (h.includes(p)) return p;
  return null;
}
function getPlatformSelectors() {
  const p = detectPlatform();
  return p ? LLM_PLATFORMS[p] : null;
}
function isDarkMode() {
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return true;
  const p = detectPlatform();
  if (p === "chat.openai.com" || p === "chatgpt.com")
    return document.documentElement.classList.contains("dark");
  if (p === "claude.ai")
    return (
      document.documentElement.classList.contains("dark") ||
      document.querySelector('html[data-theme="dark"]')
    );
  if (p === "gemini.google.com")
    return document.querySelector('html[dark="true"]');
  if (p === "grok.x.ai") return document.querySelector("body.dark");
  return false;
}
function getThemeColors() {
  const d = isDarkMode();
  return {
    primary: "#1a73e8",
    text: d ? "#e0e0e0" : "#374151",
    border: d ? "#525252" : "#e5e7eb",
    cardBackground: d ? "#303134" : "white",
    codeBackground: d ? "#3c3c3c" : "#f1f5f9",
    errorBackground: d ? "#442726" : "#fce8e6",
    errorText: d ? "#ff7b72" : "#d93025",
    buttonBackground: d ? "#3c4043" : "#f5f5f5",
    buttonText: d ? "#e0e0e0" : "#333",
    buttonBorder: d ? "#5f6368" : "#ddd",
    popupBackdrop: d ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)",
    boxShadow: d ? "0 4px 24px rgba(0,0,0,0.3)" : "0 4px 24px rgba(0,0,0,0.2)",
  };
}

// --- Core Initialization & UI Setup ---

function initPromptEnhancer() {
  // - FIX: Add validity check at the start of any function calling chrome APIs.
  if (!isContextValid()) return;

  chrome.storage.sync.get("isEnabled", ({ isEnabled }) => {
    // This callback can also fire after context is invalidated. Double-check.
    if (!isContextValid()) return;

    const fab = document.querySelector(".prompt-enhancer-fab");
    if (!isEnabled) {
      if (fab) fab.remove();
      return;
    }
    const selectors = getPlatformSelectors();
    if (!selectors) return;
    const inputElement = document.querySelector(selectors.inputSelector);
    if (inputElement && !fab) {
      setupEnhancementUI(inputElement);
    }
  });
}

function setupEnhancementUI(inputElement) {
  const fab = document.createElement("button");
  fab.className = "prompt-enhancer-fab";
  fab.title = "Refine text for AI (Prompt Perfecter)";
  fab.innerHTML = "✨";
  fab.style.cssText = `
        position: fixed; bottom: 30px; right: 30px; width: 56px; height: 56px;
        background: linear-gradient(145deg, #2196F3, #1a73e8); color: white; border-radius: 50%;
        border: none; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); font-size: 24px;
        display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 99998;
        opacity: 0; transform: scale(0.5) translateY(20px);
        transition: opacity 0.2s ease-out, transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);`;
  document.body.appendChild(fab);

  const toggleFabVisibility = () => {
    const hasText = getInputText(inputElement).trim().length > 0;
    fab.style.opacity = hasText ? "1" : "0";
    fab.style.transform = hasText ? "scale(1)" : "scale(0.5) translateY(20px)";
  };

  inputElement.addEventListener("input", toggleFabVisibility);
  toggleFabVisibility();

  fab.addEventListener("click", async (event) => {
    event.preventDefault();

    // - FIX: Add validity check here as well.
    if (!isContextValid()) {
      alert("Prompt Perfecter needs to be reloaded. Please refresh the page.");
      return;
    }

    const inputText = getInputText(inputElement);
    if (inputText.trim().length < 3) {
      showFloatingPopup("Please enter some text to refine.", "error");
      return;
    }

    showFloatingPopup("Refining your text...", "loading");
    try {
      const { geminiApiKey } = await chrome.storage.sync.get("geminiApiKey");
      if (!isContextValid()) return; // Check again after await
      if (!geminiApiKey)
        throw new Error("API key missing. Please set it in extension options.");

      const [aiVersion, humanVersion] = await Promise.all([
        clarifyAndRefineForLLM(inputText, geminiApiKey),
        rephraseForHumanReadability(inputText, geminiApiKey),
      ]);
      showFloatingPopup(
        "",
        "success",
        { aiVersion, humanVersion },
        inputElement
      );
    } catch (err) {
      console.error("Prompt Perfecter: Refinement error:", err);
      // Don't show a popup if context is invalid, just fail silently.
      if (isContextValid()) {
        showFloatingPopup(`Failed to refine text: ${err.message}`, "error");
      }
    }
  });
}

// --- Text Manipulation ---
function getInputText(el) {
  return el
    ? el.getAttribute("contenteditable") === "true"
      ? el.textContent || el.innerText || ""
      : el.value || ""
    : "";
}
function setInputText(el, text) {
  if (!el) return;
  if (el.getAttribute("contenteditable") === "true") {
    el.textContent = text;
  } else {
    el.value = text;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

// --- Gemini API Calls (with safety checks) ---

async function clarifyAndRefineForLLM(inputText, apiKey) {
  if (!isContextValid()) throw new Error("Context lost before API call.");
  const systemPrompt = `You are an expert prompt engineer. Your goal is to refine the user input to make it clear, structured, and well-formed so that any Large Language Model (LLM) can fully understand the intent and provide the most accurate and helpful response. Keep the meaning intact, remove ambiguity, and rewrite it as a proper prompt that an LLM can process effectively. Avoid casual or broken language. Do not change the core request or add extra information. No explanations. Original text: "${inputText}"`;
  return callGeminiAPI(systemPrompt, apiKey, 0.3);
}

async function rephraseForHumanReadability(inputText, apiKey) {
  if (!isContextValid()) throw new Error("Context lost before API call.");
  const systemPrompt = `You are an expert writing assistant. Rephrase the following text to improve its clarity, grammar, and tone for professional human communication. Make it sound natural and well-written. Correct any errors silently. Preserve the core meaning. Return ONLY the rephrased text. No explanations. Original text: "${inputText}"`;
  return callGeminiAPI(systemPrompt, apiKey, 0.7);
}

async function rephraseWithTone(textToRephrase, tone, apiKey) {
  if (!isContextValid()) throw new Error("Context lost before API call.");
  const systemPrompt = `Rephrase the following paragraph in a ${tone} tone while preserving its original meaning. Return only the rephrased text. Paragraph: "${textToRephrase}"`;
  return callGeminiAPI(systemPrompt, apiKey, 0.7);
}

async function callGeminiAPI(prompt, apiKey, temperature) {
  if (!isContextValid()) throw new Error("Context lost before API call.");
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature, topP: 0.95, maxOutputTokens: 1024 },
  };
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.error?.message || `API error: ${response.status}`
    );
  }
  const data = await response.json();
  const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!resultText) throw new Error("Could not extract text from API response.");
  return resultText;
}

// --- Floating Popup UI (No changes needed in this function's logic) ---
function showFloatingPopup(message, type = 'info', data = {}, inputElement = null) {
  document.getElementById("prompt-perfecter-popup")?.remove();
  document.getElementById("prompt-perfecter-backdrop")?.remove();
  
  const colors = getThemeColors();
  const backdrop = document.createElement("div");
  backdrop.id = "prompt-perfecter-backdrop";
  backdrop.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: ${colors.popupBackdrop}; z-index: 99998;`;
  
  const popup = document.createElement("div");
  popup.id = "prompt-perfecter-popup";
  popup.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 800px; max-height: 85vh; display: flex; flex-direction: column; background: ${colors.cardBackground}; border-radius: 12px; box-shadow: ${colors.boxShadow}; z-index: 99999; color: ${colors.text};`;


  const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
          closeAll();
      }
  };

  const closeAll = () => {
    popup.remove();
    backdrop.remove();
    window.removeEventListener('keydown', handleKeyDown);
  };

  backdrop.addEventListener("click", closeAll);
  
  popup.innerHTML = `<div style="padding: 15px 20px; border-bottom: 1px solid ${colors.border}; display: flex; justify-content: space-between; align-items: center;"><h3 style="margin: 0; font-size: 18px; color: ${colors.primary};">✨ Prompt Perfecter</h3><button id="pp-close-btn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: ${colors.text};">✕</button></div><div id="pp-content-area" style="padding: 20px; overflow-y: auto; flex-grow: 1;"></div>`;
  
  popup.querySelector("#pp-close-btn").addEventListener("click", closeAll);
  const contentArea = popup.querySelector("#pp-content-area");
  
  if (type === "loading") {
    contentArea.innerHTML = `<div style="text-align: center; padding: 40px 0; color: ${colors.text};">${message}</div>`;
  } else if (type === "error") {
    contentArea.innerHTML = `<div style="color: ${colors.errorText}; padding: 15px; background: ${colors.errorBackground}; border-radius: 6px;">${message}</div>`;
  } else if (type === "success" && data.aiVersion && data.humanVersion) {
    contentArea.innerHTML = `
      <div style="display: flex; gap: 24px; flex-direction: row; align-items: stretch; background: light-dark(#f8f9fa, #0d1117); padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);">

      
        <!-- Left Column -->
        <div style="flex: 1; display: flex; flex-direction: column; background: light-dark(#ffffff, #1a1a1a); padding: 16px; border-radius: 8px; box-shadow: light-dark(0 2px 8px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.3)); border: light-dark(1px solid #e1e4e8, 1px solid #333);">
          <h4 style="font-weight: 500; margin-bottom: 12px; color: light-dark(#333, #fff);">🤖 Refined for AI</h4>
          <div id="ai-version-text" style="background: light-dark(#f8f9fa, #2d2d2d); color: light-dark(#333, #e0e0e0); padding: 12px; border-radius: 6px; white-space: pre-wrap; flex-grow: 1; min-height: 100px; border: light-dark(1px solid #e9ecef, 1px solid #404040);"></div>
          <button id="use-ai-btn" style="
            margin-top: 20px;
            padding: 10px 18px;
            background-color: light-dark(#007bff, #0d6efd);
            color: white;
            font-weight: 600;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.3s;
          " onmouseover="this.style.backgroundColor=light-dark('#0056b3', '#0b5ed7')" 
             onmouseout="this.style.backgroundColor=light-dark('#007bff', '#0d6efd')">
            🚀 Use AI Prompt
          </button>
        </div>
        
        <!-- Right Column -->
        <div style="flex: 1; display: flex; flex-direction: column; background: light-dark(#ffffff, #1a1a1a); padding: 16px; border-radius: 8px; box-shadow: light-dark(0 2px 8px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.3)); border: light-dark(1px solid #e1e4e8, 1px solid #333);">
          <h4 style="font-weight: 500; margin-bottom: 12px; color: light-dark(#333, #fff);">👤 Rephrased for Humans</h4>
          <div id="human-version-text" style="background: light-dark(#f8f9fa, #2d2d2d); color: light-dark(#333, #e0e0e0); padding: 12px; border-radius: 6px; white-space: pre-wrap; flex-grow: 1; min-height: 100px; border: light-dark(1px solid #e9ecef, 1px solid #404040);"></div>
          
          <div style="margin: 20px 0 10px 0; font-size: 14px; font-weight: 500; color: light-dark(#555, #ccc);">🎨 Adjust Tone:</div>
          <div id="tone-buttons" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
          
          <button id="use-human-btn" style="
            margin-top: 20px;
            padding: 10px 18px;
            background-color: light-dark(#007bff, #0d6efd);
            color: white;
            font-weight: 600;
            border: light-dark(1px solid #007bff, 1px solid #0d6efd);
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.3s, border-color 0.3s;
          " onmouseover="this.style.backgroundColor=light-dark('#0056b3', '#0b5ed7'); this.style.borderColor=light-dark('#0056b3', '#0b5ed7')" 
             onmouseout="this.style.backgroundColor=light-dark('#007bff', '#0d6efd'); this.style.borderColor=light-dark('#007bff', '#0d6efd')">
            ✨ Use Human Text
          </button>
        </div>
        
      </div>
    `;

    const aiTextDiv = contentArea.querySelector("#ai-version-text");
    const humanTextDiv = contentArea.querySelector("#human-version-text");
    aiTextDiv.innerText = data.aiVersion;
    humanTextDiv.innerText = data.humanVersion;
    contentArea.querySelector("#use-ai-btn").addEventListener("click", () => {
      setInputText(inputElement, aiTextDiv.innerText);
      closeAll();
    });
    contentArea
      .querySelector("#use-human-btn")
      .addEventListener("click", () => {
        setInputText(inputElement, humanTextDiv.innerText);
        closeAll();
      });
    const tonesContainer = contentArea.querySelector("#tone-buttons");
    const tones = [
      "formal",
      "professional",
      "conversational",
      "friendly",
      "concise",
      "detailed",
      "neutral",
    ];
    tones.forEach((tone) => {
      const toneBtn = document.createElement("button");
      toneBtn.textContent = tone.charAt(0).toUpperCase() + tone.slice(1);
      toneBtn.style.cssText = `background: ${colors.buttonBackground}; color: ${colors.buttonText}; border: 1px solid ${colors.buttonBorder}; padding: 5px 10px; border-radius: 16px; cursor: pointer; font-size: 12px;`;
      toneBtn.addEventListener("click", async () => {
        if (!isContextValid()) return;
        const originalHumanText = humanTextDiv.innerText;
        humanTextDiv.innerText = "Rephrasing...";
        try {
          const { geminiApiKey } = await chrome.storage.sync.get(
            "geminiApiKey"
          );
          humanTextDiv.innerText = await rephraseWithTone(
            originalHumanText,
            tone,
            geminiApiKey
          );
        } catch (err) {
          humanTextDiv.innerText = originalHumanText;
          console.error("Tone rephrasing error:", err);
        }
      });
      tonesContainer.appendChild(toneBtn);
    });
  }
  document.body.appendChild(backdrop);
  document.body.appendChild(popup);

  window.addEventListener('keydown', handleKeyDown);
}

// --- Lifecycle & Observers ---

// - FIX: Store the interval ID so it can be cleared.
let periodicCheckInterval;

function startLifecycle() {
  // Initial load
  setTimeout(initPromptEnhancer, 1500);

  // Re-run on URL changes for Single Page Applications (SPAs)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(initPromptEnhancer, 1500);
    }
  }).observe(document.body, { subtree: true, childList: true });

  // Clear any old interval before setting a new one
  if (periodicCheckInterval) clearInterval(periodicCheckInterval);

  // Fallback interval check that self-terminates if context is lost
  periodicCheckInterval = setInterval(() => {
    if (!isContextValid()) {
      console.log(
        "Prompt Perfecter: Context invalidated, clearing periodic check."
      );
      clearInterval(periodicCheckInterval);
      return;
    }
    initPromptEnhancer();
  }, 5000);
}

window.addEventListener("load", startLifecycle);

// Listen for messages from the background script ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "triggerRefinementFromShortcut") {
    console.log("Shortcut trigger received from background script.");
    
    // Find the floating action button and "click" it programmatically.
    // This is the cleanest way to reuse all existing logic without duplicating code.
    const fab = document.querySelector('.prompt-enhancer-fab');
    if (fab) {
      // Ensure the button is visible before clicking, otherwise it might not work
      // if the user's cursor isn't in the input box.
      const selectors = getPlatformSelectors();
      const inputElement = selectors ? document.querySelector(selectors.inputSelector) : null;
      
      if (inputElement && getInputText(inputElement).trim().length > 0) {
        fab.click();
        sendResponse({ status: "triggered" });
      } else {
        // Optionally, provide feedback if there's nothing to refine
        showFloatingPopup("Please type some text before using the shortcut.", "error");
        setTimeout(() => document.getElementById('prompt-perfecter-popup')?.remove(), 3000);
        sendResponse({ status: "no_text" });
      }
    } else {
      sendResponse({ status: "no_fab" });
    }
  }
  // Return true to indicate you might send a response asynchronously
  return true;
});