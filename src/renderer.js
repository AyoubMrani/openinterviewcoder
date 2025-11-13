// DOM Elements
const chatHistory = document.getElementById("chat-history");
const typingIndicator = document.getElementById("typing-indicator");
const tokenProgressText = document.getElementById("token-progress-text");
const tokenProgressBar = document.getElementById("token-progress-bar");

// Chat state
let messages = [];
let currentMessageId = null;
// Debug flag
const DEBUG = true;

function debugLog(...args) {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
}
// Initialize marked with options
if (typeof marked === "undefined") {
  console.error("marked library not loaded");
} else {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
}

// Initialize the UI
document.addEventListener("DOMContentLoaded", async () => {
  document.body.classList.add("compact-mode");

  setupEventListeners();
  try {
    const tokenInfo = await window.electronAPI.getTokenInfo();
    updateTokenDisplay(tokenInfo.current, tokenInfo.max);
  } catch (error) {
    console.error("Could not get initial token info:", error);
  }

});

// Set up event listeners
function setupEventListeners() {
  // Window position update
  window.electronAPI.onWindowPositionChanged((position) => {
    document.body.setAttribute("data-position", position);
  });

  // Handle keyboard shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);

  // Handle new screenshots
  window.electronAPI.onScreenshotCaptured(addScreenshotToChat);

  // Handle chat reset
  window.electronAPI.onResetChat(resetChat);

  // Handle response updates
  window.electronAPI.onLLMResponse(handleLLMResponse);

  // +++ ADDED LISTENER FOR TOKEN UPDATES +++
  window.electronAPI.onTokenUsageUpdated((data) => {
    updateTokenDisplay(data.current, data.max);
  });


  // Handle chat scrolling
  window.electronAPI.onScrollChat((direction) => {
    const chatContainer = document.querySelector(".chat-container");
    if (chatContainer) {
      if (direction === "up") {
        chatContainer.scrollTop -= 100; // Scroll up by 100px
      } else if (direction === "down") {
        chatContainer.scrollTop += 100; // Scroll down by 100px
      }
    }
  });
  // Question input handlers
  const submitQuestionBtn = document.getElementById("submit-question");
  const cancelQuestionBtn = document.getElementById("cancel-question");
  const questionInput = document.getElementById("question-input");

  if (submitQuestionBtn) {
    submitQuestionBtn.addEventListener("click", submitQuestion);
  }

  if (cancelQuestionBtn) {
    cancelQuestionBtn.addEventListener("click", cancelQuestion);
  }

  if (questionInput) {
    // Submit on Enter (but allow Shift+Enter for new lines)
    questionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitQuestion();
      }
    });
  }

  // Text question handlers
  const submitTextQuestionBtn = document.getElementById("submit-text-question");
  const cancelTextQuestionBtn = document.getElementById("cancel-text-question");
  const textQuestionInput = document.getElementById("text-question-input");

  if (submitTextQuestionBtn) {
    submitTextQuestionBtn.addEventListener("click", submitTextQuestion);
  }

  if (cancelTextQuestionBtn) {
    cancelTextQuestionBtn.addEventListener("click", cancelTextQuestion);
  }

  if (textQuestionInput) {
    // Submit on Ctrl/Cmd+Enter
    textQuestionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitTextQuestion();
      }
    });
  }

  // Listen for text question show event
  window.electronAPI.onShowTextQuestion(showTextQuestion);

  // Listen for mode changes
  window.electronAPI.onModeChanged(handleModeChange);
  // ADD THIS LINE:
  setupMarketSelector();

}

// Save/load last market preference
function saveLastMarket(market) {
  localStorage.setItem('lastMarket', market);
}

function loadLastMarket() {
  return localStorage.getItem('lastMarket') || 'EURUSD';
}

// In setupMarketSelector function, add:
function setupMarketSelector() {
  const marketSelect = document.getElementById("market-select");
  const customMarketInput = document.getElementById("custom-market");
  const textMarketSelect = document.getElementById("text-market-select");
  const textCustomMarketInput = document.getElementById("text-custom-market");
  const lastMarket = loadLastMarket();
  if (marketSelect) marketSelect.value = lastMarket;
  if (textMarketSelect) textMarketSelect.value = lastMarket;

  if (marketSelect && customMarketInput) {
    marketSelect.addEventListener("change", (e) => {
      saveLastMarket(e.target.value);
      if (e.target.value === "CUSTOM") {
        customMarketInput.style.display = "block";
        customMarketInput.focus();
      } else {
        customMarketInput.style.display = "none";
      }
    });
  }

  if (textMarketSelect && textCustomMarketInput) {
    textMarketSelect.addEventListener("change", (e) => {
      if (e.target.value === "CUSTOM") {
        textCustomMarketInput.style.display = "block";
        textCustomMarketInput.focus();
      } else {
        textCustomMarketInput.style.display = "none";
      }
    });
  }
}

function getSelectedMarket(isTextQuestion = false) {
  const selectId = isTextQuestion ? "text-market-select" : "market-select";
  const customInputId = isTextQuestion ? "text-custom-market" : "custom-market";

  const select = document.getElementById(selectId);
  const customInput = document.getElementById(customInputId);

  if (!select) return "Not specified";

  if (select.value === "CUSTOM" && customInput.value.trim()) {
    return customInput.value.trim();
  }

  return select.value;
}

function handleModeChange(data) {
  const body = document.body;

  if (data.isCompact) {
    body.classList.remove("full-mode");
    body.classList.add("compact-mode");
    debugLog("Switched to compact mode");
  } else {
    body.classList.remove("compact-mode");
    body.classList.add("full-mode");
    debugLog("Switched to full mode");
  }

  // Scroll to bottom after mode change
  setTimeout(() => scrollToBottom(), 100);
}


function updateTokenDisplay(current, max) {
  if (!tokenProgressText || !tokenProgressBar) return;

  const percentage = max > 0 ? (current / max) * 100 : 0;
  tokenProgressText.textContent = `${current} / ${max} Tokens`;
  tokenProgressBar.style.width = `${Math.min(percentage, 100)}%`;
}

function handleLLMResponse(data) {
  debugLog("LLM Response received:", data);

  typingIndicator.classList.remove("visible");

  if (!data.success) {
    addErrorMessage(data.error || "An unknown error occurred.");
    return;
  }

  let messageEl = document.querySelector(`[data-message-id="${currentMessageId}"]`);
  if (messageEl) {
    const contentWrapper = messageEl.querySelector(".message-content");
    if (contentWrapper) {
      if (typeof marked !== 'undefined' && marked.parse) {
        contentWrapper.innerHTML = marked.parse(data.content);
      } else {
        contentWrapper.textContent = data.content;
      }
      messageEl.style.display = "block";
      messageEl.style.opacity = "1";
      scrollToBottom();
    }
  }

  // Show feedback popup after 2 seconds
  if (data.analysisId) {
    setTimeout(() => showFeedbackPopup(data.analysisId), 2000);
  }

  const messageIndex = messages.findIndex((m) => m.messageId === currentMessageId);
  if (messageIndex !== -1) {
    messages[messageIndex].content = data.content;
    messages[messageIndex].status = "completed";
  }

  currentMessageId = null;
}

let currentAnalysisId = null;

function showFeedbackPopup(analysisId) {
  currentAnalysisId = analysisId;

  // Create feedback popup
  const popup = document.createElement("div");
  popup.className = "feedback-overlay";
  popup.innerHTML = `
    <div class="feedback-container">
      <h3>How was this analysis?</h3>
      <div class="feedback-buttons">
        <button class="feedback-btn useful-btn" data-useful="true">👍 Useful</button>
        <button class="feedback-btn not-useful-btn" data-useful="false">👎 Not Useful</button>
      </div>
      <div class="trade-result" style="display: none;">
        <p>Did the trade succeed?</p>
        <div class="feedback-buttons">
          <button class="feedback-btn success-btn" data-result="true">✅ Yes</button>
          <button class="feedback-btn fail-btn" data-result="false">❌ No</button>
          <button class="feedback-btn skip-btn" data-result="null">⏭️ Skip</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  // Handle useful/not useful
  popup.querySelectorAll(".feedback-btn[data-useful]").forEach(btn => {
    btn.addEventListener("click", () => {
      const wasUseful = btn.dataset.useful === "true";
      popup.querySelector(".feedback-buttons").style.display = "none";
      popup.querySelector(".trade-result").style.display = "block";
      popup.dataset.wasUseful = wasUseful;
    });
  });

  // Handle trade result
  popup.querySelectorAll(".feedback-btn[data-result]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const wasUseful = popup.dataset.wasUseful === "true";
      const tradeResult = btn.dataset.result === "null" ? null : btn.dataset.result === "true";

      await window.electronAPI.saveFeedback({
        analysisId: currentAnalysisId,
        wasUseful: wasUseful,
        tradeSuccessful: tradeResult,
      });

      popup.remove();
    });
  });
}

// Handle keyboard shortcuts
function handleKeyboardShortcuts(event) {
  if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") {
    return;
  }

  if (event.key === "Escape") {
    window.electronAPI.hideWindow();
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "t") {
    event.preventDefault();
    handleTestResponse("write python code to print 'Hello, world!'");
  }
}

// Scroll to bottom of chat
function scrollToBottom() {
  const chatContainer = document.querySelector(".chat-container");
  if (chatContainer) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
    // Double-check scroll after a short delay to handle dynamic content
    setTimeout(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 100);
  }
}

// Create message element
function createMessageElement(messageId) {
  const messageEl = document.createElement("div");
  messageEl.className = "message assistant";
  messageEl.setAttribute("data-message-id", messageId);
  // CHANGED: Make it visible immediately
  messageEl.style.display = "block";

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "message-content markdown-body";
  messageEl.appendChild(contentWrapper);

  return messageEl;
}

// Add error message
function addErrorMessage(message) {
  const errorEl = document.createElement("div");
  errorEl.className = "message error";
  errorEl.textContent = `Error: ${message}`;
  chatHistory.appendChild(errorEl);
  scrollToBottom();
}

let currentScreenshotPath = null;

async function addScreenshotToChat(data) {
  // Store the screenshot path
  currentScreenshotPath = data.filePath;

  // Show the question overlay
  const overlay = document.getElementById("question-overlay");
  const preview = document.getElementById("question-screenshot-preview");
  const input = document.getElementById("question-input");

  if (overlay && preview && input) {
    preview.src = `file://${data.filePath}`;
    input.value = "";
    overlay.style.display = "flex";

    // Focus on input after a brief delay
    setTimeout(() => input.focus(), 100);
  }
}

async function submitQuestion() {
  const input = document.getElementById("question-input");
  const overlay = document.getElementById("question-overlay");

  if (!input || !overlay) return;

  const question = input.value.trim();
  const market = getSelectedMarket(false); // Get selected market

  // Build prompt with market info
  const prompt = question
    ? `**Market: ${market}**\n\n${question}`
    : `**Market: ${market}**\n\nAnalyze this screenshot and provide trading insights.`;

  // Hide overlay
  overlay.style.display = "none";

  // Restore mouse ignore state after submitting
  await window.electronAPI.restoreMouseIgnore();

  // Add screenshot to chat history
  const messageEl = document.createElement("div");
  messageEl.className = "message user";

  // Show market badge
  const marketBadge = document.createElement("div");
  marketBadge.className = "market-badge";
  marketBadge.textContent = market;
  messageEl.appendChild(marketBadge);

  const img = document.createElement("img");
  img.src = `file://${currentScreenshotPath}`;
  img.className = "screenshot-thumbnail";
  img.alt = "Screenshot";
  img.addEventListener("click", () => window.electronAPI.openFile(currentScreenshotPath));
  messageEl.appendChild(img);

  // If user asked a question, show it
  if (question) {
    const questionText = document.createElement("div");
    questionText.style.marginTop = "8px";
    questionText.style.fontSize = "14px";
    questionText.textContent = question;
    messageEl.appendChild(questionText);
  }

  chatHistory.appendChild(messageEl);
  scrollToBottom();
  updateNullStateVisibility();

  // Show typing indicator
  typingIndicator.classList.add("visible");

  // Add a placeholder for the assistant's response
  currentMessageId = Date.now().toString();
  const assistantMessage = {
    type: "assistant",
    timestamp: Date.now(),
    messageId: currentMessageId,
    content: "",
    status: "pending",
  };
  messages.push(assistantMessage);

  const assistantMessageEl = createMessageElement(currentMessageId);
  chatHistory.appendChild(assistantMessageEl);
  scrollToBottom();

  try {
    const result = await window.electronAPI.analyzeScreenshot({
      filePath: currentScreenshotPath,
      prompt: prompt,
      market: market, // Pass market info
    });

    if (!result.success) {
      typingIndicator.classList.remove("visible");
      addErrorMessage(result.error);
      if (assistantMessageEl) {
        assistantMessageEl.remove();
      }
    }
  } catch (error) {
    typingIndicator.classList.remove("visible");
    addErrorMessage(error.message);
    if (assistantMessageEl) {
      assistantMessageEl.remove();
    }
  }

  // Clear the stored path
  currentScreenshotPath = null;
}

function cancelQuestion() {
  const overlay = document.getElementById("question-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
  currentScreenshotPath = null;
}

// ADD THESE NEW FUNCTIONS HERE:
function showTextQuestion() {
  const overlay = document.getElementById("text-question-overlay");
  const input = document.getElementById("text-question-input");

  if (overlay && input) {
    input.value = "";
    overlay.style.display = "flex";

    // Focus on input after a brief delay
    setTimeout(() => input.focus(), 100);
  }
}

async function submitTextQuestion() {
  const input = document.getElementById("text-question-input");
  const overlay = document.getElementById("text-question-overlay");

  if (!input || !overlay) return;

  const question = input.value.trim();
  const market = getSelectedMarket(true); // Get selected market for text question

  if (!question) {
    alert("Please enter a question!");
    return;
  }

  // Build prompt with market info
  const prompt = `**Market: ${market}**\n\n${question}`;

  // Hide overlay
  overlay.style.display = "none";

  // Restore mouse ignore state after submitting
  await window.electronAPI.restoreMouseIgnore();

  // Add user message to chat with market badge
  const userMessageEl = document.createElement("div");
  userMessageEl.className = "message user";

  const marketBadge = document.createElement("div");
  marketBadge.className = "market-badge";
  marketBadge.textContent = market;
  userMessageEl.appendChild(marketBadge);

  const questionText = document.createElement("div");
  questionText.textContent = question;
  userMessageEl.appendChild(questionText);

  chatHistory.appendChild(userMessageEl);
  scrollToBottom();
  updateNullStateVisibility();

  // ... rest of existing code remains the same ...
}

async function cancelTextQuestion() {
  const overlay = document.getElementById("text-question-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }

  // Restore mouse ignore state when canceling
  await window.electronAPI.restoreMouseIgnore();
}


// Reset chat
function resetChat() {
  chatHistory.innerHTML = "";
  messages = [];
  updateNullStateVisibility();
}

function updateNullStateVisibility() {
  const nullState = document.getElementById("null-state");
  const chatHistory = document.getElementById("chat-history");

  if (nullState && chatHistory) {
    // Hide null state if there are any messages
    const hasMessages = chatHistory.children.length > 0;
    nullState.style.display = hasMessages ? "none" : "flex";
  }
}

// Handle test response
async function handleTestResponse(prompt) {
  try {
    // Add user message
    const userMessage = {
      type: "user",
      timestamp: Date.now(),
      content: prompt,
    };
    messages.push(userMessage);

    const userMessageEl = document.createElement("div");
    userMessageEl.className = "message user";
    userMessageEl.textContent = prompt;
    chatHistory.appendChild(userMessageEl);

    typingIndicator.classList.add("visible");
    console.log("Showing typing indicator for new test response");

    // Add assistant message placeholder
    currentMessageId = Date.now().toString();
    const assistantMessage = {
      type: "assistant",
      timestamp: Date.now(),
      messageId: currentMessageId,
      content: "",
      status: "pending",
    };
    messages.push(assistantMessage);

    const assistantMessageEl = createMessageElement(currentMessageId);
    chatHistory.appendChild(assistantMessageEl);
    debugLog("Created assistant message element:", assistantMessageEl);
    debugLog("Message ID:", currentMessageId);
    scrollToBottom();

    const result = await window.electronAPI.testResponse(prompt);
    if (!result.success) {
      throw new Error(result.error);
    }

    // Update the message with the response
    const contentWrapper = assistantMessageEl.querySelector(".message-content");
    if (contentWrapper) {
      if (result.content && typeof result.content === "string") {
        contentWrapper.innerHTML = marked.parse(result.content);
      } else {
        contentWrapper.innerHTML = ""; // Clear content if it's null/undefined or not a string
      }
      assistantMessageEl.classList.remove("loading");
      scrollToBottom();
    }

    // Update the message in the messages array
    assistantMessage.content = result.content;
    assistantMessage.status = "completed";

    // Hide typing indicator
    typingIndicator.classList.remove("visible");
    console.log("Test response complete, hiding typing indicator");
  } catch (error) {
    console.error("Error in handleTestResponse:", error);
    typingIndicator.classList.remove("visible");
    addErrorMessage(error.message);
  }
}