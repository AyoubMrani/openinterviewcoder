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
  window.electronAPI.onWindowPositionChanged((position) => {
    document.body.setAttribute("data-position", position);
  });

  document.addEventListener("keydown", handleKeyboardShortcuts);
  window.electronAPI.onScreenshotCaptured(addScreenshotToChat);
  window.electronAPI.onResetChat(resetChat);
  window.electronAPI.onLLMResponse(handleLLMResponse);
  window.electronAPI.onTokenUsageUpdated((data) => {
    updateTokenDisplay(data.current, data.max);
  });

  window.electronAPI.onScrollChat((direction) => {
    const chatContainer = document.querySelector(".chat-container");
    if (chatContainer) {
      if (direction === "up") {
        chatContainer.scrollTop -= 100;
      } else if (direction === "down") {
        chatContainer.scrollTop += 100;
      }
    }
  });

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
    questionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitQuestion();
      }
    });
  }

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
    textQuestionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitTextQuestion();
      }
    });
  }

  window.electronAPI.onShowTextQuestion(showTextQuestion);
  // Listen for mode changes
  window.electronAPI.onModeChanged(handleModeChange);

  // Listen for interaction mode changes
  window.electronAPI.onInteractionModeChanged(handleInteractionModeChange);

  setupMarketSelector();
}

function saveLastMarket(market) {
  localStorage.setItem('lastMarket', market);
}

function loadLastMarket() {
  return localStorage.getItem('lastMarket') || 'EURUSD';
}

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

  setTimeout(() => scrollToBottom(), 100);
}

function handleInteractionModeChange(data) {
  const body = document.body;

  if (data.interactive) {
    body.classList.add("interactive-mode");
    debugLog("Interaction mode: ENABLED");
  } else {
    body.classList.remove("interactive-mode");
    debugLog("Interaction mode: DISABLED");
  }
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

      // Add inline feedback UI if analysisId exists
      if (data.analysisId) {
        addInlineFeedback(messageEl, data.analysisId);
      }

      scrollToBottom();
    }
  }

  const messageIndex = messages.findIndex((m) => m.messageId === currentMessageId);
  if (messageIndex !== -1) {
    messages[messageIndex].content = data.content;
    messages[messageIndex].status = "completed";
  }

  currentMessageId = null;
}

// NEW: Create inline feedback UI under each response
function addInlineFeedback(messageEl, analysisId) {
  const feedbackContainer = document.createElement("div");
  feedbackContainer.className = "inline-feedback";
  feedbackContainer.innerHTML = `
    <div class="feedback-question">Was this analysis helpful?</div>
    <div class="feedback-actions">
      <button class="feedback-btn useful-btn" data-useful="true">
        👍 Useful
      </button>
      <button class="feedback-btn not-useful-btn" data-useful="false">
        👎 Not Useful
      </button>
    </div>
    <div class="trade-result-section" style="display: none;">
      <div class="feedback-question">Did the trade succeed?</div>
      <div class="feedback-actions">
        <button class="feedback-btn success-btn" data-result="true">
          ✅ Yes
        </button>
        <button class="feedback-btn fail-btn" data-result="false">
          ❌ No
        </button>
        <button class="feedback-btn skip-btn" data-result="null">
          ⏭️ Skip
        </button>
      </div>
    </div>
  `;

  messageEl.appendChild(feedbackContainer);

  // Handle useful/not useful
  const usefulBtns = feedbackContainer.querySelectorAll(".feedback-btn[data-useful]");
  usefulBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const wasUseful = btn.dataset.useful === "true";

      // Disable useful/not useful buttons and show selected state
      usefulBtns.forEach(b => {
        b.disabled = true;
        b.style.opacity = b === btn ? "1" : "0.3";
      });

      // Show trade result section
      const tradeSection = feedbackContainer.querySelector(".trade-result-section");
      tradeSection.style.display = "block";
      feedbackContainer.dataset.wasUseful = wasUseful;

      scrollToBottom();
    });
  });

  // Handle trade result
  const resultBtns = feedbackContainer.querySelectorAll(".feedback-btn[data-result]");
  resultBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const wasUseful = feedbackContainer.dataset.wasUseful === "true";
      const tradeResult = btn.dataset.result === "null" ? null : btn.dataset.result === "true";

      try {
        const result = await window.electronAPI.saveFeedback({
          analysisId: analysisId,
          wasUseful: wasUseful,
          tradeSuccessful: tradeResult,
        });

        // Show confirmation
        feedbackContainer.innerHTML = `
          <div class="feedback-complete">
            ✓ Thank you for your feedback!
          </div>
        `;

        debugLog("Feedback saved:", result);
      } catch (error) {
        console.error("Failed to save feedback:", error);
        feedbackContainer.innerHTML = `
          <div class="feedback-error">
            ⚠️ Failed to save feedback
          </div>
        `;
      }
    });
  });
}

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

function scrollToBottom() {
  const chatContainer = document.querySelector(".chat-container");
  if (chatContainer) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
    setTimeout(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 100);
  }
}

function createMessageElement(messageId) {
  const messageEl = document.createElement("div");
  messageEl.className = "message assistant";
  messageEl.setAttribute("data-message-id", messageId);
  messageEl.style.display = "block";

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "message-content markdown-body";
  messageEl.appendChild(contentWrapper);

  return messageEl;
}

function addErrorMessage(message) {
  const errorEl = document.createElement("div");
  errorEl.className = "message error";
  errorEl.textContent = `Error: ${message}`;
  chatHistory.appendChild(errorEl);
  scrollToBottom();
}

let currentScreenshotPath = null;

async function addScreenshotToChat(data) {
  currentScreenshotPath = data.filePath;

  const overlay = document.getElementById("question-overlay");
  const preview = document.getElementById("question-screenshot-preview");
  const input = document.getElementById("question-input");

  if (overlay && preview && input) {
    preview.src = `file://${data.filePath}`;
    input.value = "";
    overlay.style.display = "flex";

    setTimeout(() => input.focus(), 100);
  }
}

async function submitQuestion() {
  const input = document.getElementById("question-input");
  const overlay = document.getElementById("question-overlay");

  if (!input || !overlay) return;

  const question = input.value.trim();
  const market = getSelectedMarket(false);

  const prompt = question
    ? `**Market: ${market}**\n\n${question}`
    : `**Market: ${market}**\n\nAnalyze this screenshot and provide trading insights.`;

  overlay.style.display = "none";

  await window.electronAPI.restoreMouseIgnore();

  const messageEl = document.createElement("div");
  messageEl.className = "message user";

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

  typingIndicator.classList.add("visible");

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
      market: market,
    });

    if (!result.success) {
      typingIndicator.classList.remove("visible");
      addErrorMessage(result.error);
      if (assistantMessageEl) {
        assistantMessageEl.remove();
      }
    } else if (result.missingCharts) {
      showChartWarning(market);
    }
  } catch (error) {
    typingIndicator.classList.remove("visible");
    addErrorMessage(error.message);
    if (assistantMessageEl) {
      assistantMessageEl.remove();
    }
  }

  currentScreenshotPath = null;
}

function showChartWarning(market) {
  const warningEl = document.createElement("div");
  warningEl.className = "message warning";
  warningEl.innerHTML = `
    <div style="padding: 8px; background: rgba(255, 193, 7, 0.1); border-left: 3px solid #ffc107; border-radius: 4px;">
      ⚠️ <strong>Charts not found for ${market}</strong><br>
      <span style="font-size: 12px; color: rgba(255, 255, 255, 0.7);">
        Add daily.png and 1hour.png to:<br>
        <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px;">
          %AppData%/open-interview-coder/data/${market}/
        </code>
      </span>
    </div>
  `;
  chatHistory.appendChild(warningEl);
  scrollToBottom();
}

function cancelQuestion() {
  const overlay = document.getElementById("question-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
  currentScreenshotPath = null;
}

function showTextQuestion() {
  const overlay = document.getElementById("text-question-overlay");
  const input = document.getElementById("text-question-input");

  if (overlay && input) {
    input.value = "";
    overlay.style.display = "flex";

    setTimeout(() => input.focus(), 100);
  }
}

async function submitTextQuestion() {
  const input = document.getElementById("text-question-input");
  const overlay = document.getElementById("text-question-overlay");

  if (!input || !overlay) return;

  const question = input.value.trim();
  const market = getSelectedMarket(true);

  if (!question) {
    alert("Please enter a question!");
    return;
  }

  const prompt = `**Market: ${market}**\n\n${question}`;

  overlay.style.display = "none";

  await window.electronAPI.restoreMouseIgnore();

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

  typingIndicator.classList.add("visible");

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
    const result = await window.electronAPI.testResponse(prompt);

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
}

async function cancelTextQuestion() {
  const overlay = document.getElementById("text-question-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }

  await window.electronAPI.restoreMouseIgnore();
}

function resetChat() {
  chatHistory.innerHTML = "";
  messages = [];
  updateNullStateVisibility();
}

function updateNullStateVisibility() {
  const nullState = document.getElementById("null-state");
  const chatHistory = document.getElementById("chat-history");

  if (nullState && chatHistory) {
    const hasMessages = chatHistory.children.length > 0;
    nullState.style.display = hasMessages ? "none" : "flex";
  }
}

async function handleTestResponse(prompt) {
  try {
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

    const contentWrapper = assistantMessageEl.querySelector(".message-content");
    if (contentWrapper) {
      if (result.content && typeof result.content === "string") {
        contentWrapper.innerHTML = marked.parse(result.content);
      } else {
        contentWrapper.innerHTML = "";
      }
      assistantMessageEl.classList.remove("loading");
      scrollToBottom();
    }

    assistantMessage.content = result.content;
    assistantMessage.status = "completed";

    typingIndicator.classList.remove("visible");
    console.log("Test response complete, hiding typing indicator");
  } catch (error) {
    console.error("Error in handleTestResponse:", error);
    typingIndicator.classList.remove("visible");
    addErrorMessage(error.message);
  }
}