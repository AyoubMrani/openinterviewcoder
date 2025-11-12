// llm-service.js - Updated version with trading-focused system prompt

const axios = require("axios");
const { ipcMain } = require("electron");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const config = require("./config");

// Use a model that supports multimodal inputs (text and image)
const MODEL_NAME = "gemini-2.5-flash";
let genAI;
let generativeModel;

// Trading-focused system prompt
// const SYSTEM_PROMPT = `You are an expert trading analyst assistant with deep knowledge of technical analysis, market patterns, and trading strategies.

// Your primary responsibilities:
// 1. Analyze trading charts, screenshots, and market data with precision
// 2. Identify key technical indicators, patterns, and signals
// 3. Provide actionable trading insights based on the provided context
// 4. Answer questions strictly based on the provided trading documentation/rules
// 5. Flag potential entry/exit points, support/resistance levels, and trend analysis

// **CRITICAL RULES:**
// - Always reference the provided trading strategy document when answering questions
// - If a screenshot shows a chart, analyze: timeframe, trend direction, key levels, indicators, volume, patterns
// - Never provide financial advice - only technical analysis and observations
// - Be concise but thorough - traders need quick, actionable information
// - Use trading terminology appropriately (e.g., bullish/bearish, breakout, consolidation)
// - If uncertain about something, explicitly state it
// - Always cite specific rules or sections from the provided document when applicable

// **Response Format:**
// For chart analysis:
// • **Market Context**: Current trend and phase
// • **Key Levels**: Support/resistance, entry/exit zones
// • **Technical Signals**: Indicators, patterns, confirmations
// • **Risk Assessment**: Potential risks and considerations
// • **Action Items**: What to watch for or consider next

// For strategy questions:
// • **Rule Reference**: Quote the relevant section from the document
// • **Explanation**: Clarify how it applies to the situation
// • **Example**: Provide practical application if relevant

// Keep responses under 250 words unless detailed analysis is requested.`;

const SYSTEM_PROMPT = `Final Optimized Prompt: Price Action/S&R + Blue EMA 21 Focus (Strict Document Compliance)
Role: Pure price action/S&R specialist. Only use the blue 21 EMA if explicitly defined in your strategy document (e.g., "dynamic support/resistance" or "trend filter").

Critical Rules
⚠️ Blue EMA 21 Handling:

Reference the blue 21 EMA only when your document cites it (e.g., "Section 2.1: Price holding above blue 21 EMA confirms uptrend").
Ignore color if document doesn't specify it - focus on EMA's function per rules.
⚠️ Accuracy % Requirement:
Assign win probability only if document provides backtested stats for the exact setup (e.g., "Rule 5.3: 82% win rate for bullish reversals at S/R with blue EMA slope").
If no stat: "No accuracy % per document" (never estimate).
⚠️ Emoji Protocol:
[🟢] = Document-compliant bullish signal (cite rule)
[🔴] = Document-compliant bearish signal (cite rule)
⚠️ = Rule violation or high-risk condition
⚠️ Zero Financial Advice: Use observable terms only ("price tests resistance," not "sell here").
Response Format (Max 120 words)
[🟢]/[🔴] Signal Type | Accuracy: X% (or "No accuracy % per doc")
• S/R Level: Exact price + validation (e.g., "$150.50 support (3 touches - Rule 1.2)")
• Blue EMA Context: Only if doc-allowed (e.g., "Price > rising blue 21 EMA (Rule 2.4)")
• Confluence: Rule-backed reasons (e.g., "Pinbar rejection + volume confirmation (Rules 3.1, 4.2)")
• Risk: ⚠️ + violated rules (e.g., "⚠️ Break of blue EMA invalidates setup (Rule 2.5)")
`;


let isInitialized = false;
let tradingDocumentContext = "./base.txt"; // Store the trading document content

// Initialize the LLM service
function initializeGemini() {
  const apiKey = config.getGeminiKey();
  if (!apiKey) {
    console.log("Gemini API key not configured.");
    return false;
  }
  genAI = new GoogleGenerativeAI(apiKey);
  generativeModel = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT,
  });
  return true;
}

async function getModelInfo() {
  if (!initializeGemini()) {
    throw new Error("Gemini not initialized. API key may be missing.");
  }
  try {
    const modelInfo = await genAI.getGenerativeModel({ model: MODEL_NAME });
    return {
      input_token_limit: 1048576,
    };
  } catch (error) {
    console.error("Failed to get model info:", error);
    throw new Error(`API Error: ${error.message}`);
  }
}

// Function to convert a file to a GenerativePart object
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

// NEW: Function to load trading document
function loadTradingDocument(documentPath) {
  try {
    if (fs.existsSync(documentPath)) {
      tradingDocumentContext = fs.readFileSync(documentPath, 'utf8');
      console.log("Trading document loaded successfully");
      console.log("Document length:", tradingDocumentContext.length, "characters");
      return true;
    } else {
      console.error("Trading document not found at:", documentPath);
      tradingDocumentContext = null;
      return false;
    }
  } catch (error) {
    console.error("Error loading trading document:", error);
    tradingDocumentContext = null;
    return false;
  }
}

// NEW: Function to clear trading document
function clearTradingDocument() {
  tradingDocumentContext = null;
  console.log("Trading document cleared");
}

async function makeLLMRequest(prompt, filePath) {
  if (!initializeGemini()) {
    throw new Error(
      "Gemini API key not configured. Please set your API key in the settings."
    );
  }

  // Build the prompt with context
  let fullPrompt = "";

  // Add trading document context if available
  if (tradingDocumentContext) {
    fullPrompt += `**TRADING STRATEGY DOCUMENT:**
\`\`\`
${tradingDocumentContext}
\`\`\`

**USER REQUEST:**
`;
  }

  // Add user's prompt
  fullPrompt += prompt || "Analyze this screenshot and provide trading insights.";

  const promptParts = [{ text: fullPrompt }];

  if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error("Screenshot file not found");
    }
    // Add the image part to our prompt
    promptParts.push(fileToGenerativePart(filePath, "image/png"));
  }

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: promptParts }],
    });

    const response = result.response;

    // Extract text content directly using the text() method
    const content = response.text();
    const usage = response.usageMetadata;

    console.log("=== Gemini Response ===");
    console.log("Content length:", content.length);
    console.log("Token usage:", usage);
    console.log("Document context included:", !!tradingDocumentContext);
    console.log("======================");

    return {
      success: true,
      content: content,
      tokensUsed: usage ? usage.totalTokenCount : 0,
      model: MODEL_NAME,
    };
  } catch (error) {
    console.error("Gemini API request failed:", error);
    throw new Error(`API Request Error: ${error.message}`);
  }
}

module.exports = {
  initializeLLMService: initializeGemini,
  getModelInfo,
  makeLLMRequest,
  loadTradingDocument,
  clearTradingDocument,
  getTradingDocumentStatus: () => !!tradingDocumentContext,
};