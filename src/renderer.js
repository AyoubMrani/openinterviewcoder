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
}

function updateTokenDisplay(current, max) {
  if (!tokenProgressText || !tokenProgressBar) return;

  const percentage = max > 0 ? (current / max) * 100 : 0;
  tokenProgressText.textContent = `${current} / ${max} Tokens`;
  tokenProgressBar.style.width = `${Math.min(percentage, 100)}%`;
}

function handleLLMResponse(data) {
  debugLog("LLM Response received:", data);
  debugLog("Current message ID:", currentMessageId);
  debugLog("Chat history element:", chatHistory);

  console.log("LLM Response received by UI:", data);
  typingIndicator.classList.remove("visible"); // Hide typing indicator

  if (!data.success) {
    addErrorMessage(data.error || "An unknown error occurred.");
    return;
  }

  // Find the pending message element and update it
  let messageEl = document.querySelector(`[data-message-id="${currentMessageId}"]`);
  if (messageEl) {
    const contentWrapper = messageEl.querySelector(".message-content");
    if (contentWrapper) {
      // Make sure marked is available
      if (typeof marked !== 'undefined' && marked.parse) {
        contentWrapper.innerHTML = marked.parse(data.content);
      } else {
        // Fallback if marked is not available
        contentWrapper.textContent = data.content;
      }

      // Ensure the message is visible
      messageEl.style.display = "block";
      messageEl.style.opacity = "1";

      scrollToBottom();
    }
  } else {
    console.error("Message element not found for ID:", currentMessageId);
    // Create it if it doesn't exist
    messageEl = createMessageElement(currentMessageId);
    chatHistory.appendChild(messageEl);
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

  // Update the message in the state array
  const messageIndex = messages.findIndex((m) => m.messageId === currentMessageId);
  if (messageIndex !== -1) {
    messages[messageIndex].content = data.content;
    messages[messageIndex].status = "completed";
  }

  currentMessageId = null; // Reset for the next request
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
  const submitBtn = document.getElementById("submit-question");

  if (!input || !overlay) return;

  const question = input.value.trim();

  // If no question, use default prompt
  const prompt = question || "Analyze this screenshot and provide insights.";

  // Hide overlay
  overlay.style.display = "none";

  // Restore mouse ignore state after submitting
  await window.electronAPI.restoreMouseIgnore();

  // Add screenshot to chat history
  const messageEl = document.createElement("div");
  messageEl.className = "message user";
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

  // ADD THIS LINE:
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