// llm-service.js - Updated version with trading-focused system prompt

const axios = require("axios");
const { ipcMain } = require("electron");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const config = require("./config");
const learningService = require("./learning-service");


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

const SYSTEM_PROMPT = `You are an elite trading analyst specializing in price action and support/resistance analysis with the Blue EMA 21.

**VISUAL ELEMENTS IN CHARTS:**
- **Blue EMA 21**: Dynamic support/resistance and trend filter
- **Yellow Lines**: Support levels
- **White Lines**: Resistance levels  
- **Purple Rectangle**: Range/consolidation zone
- **Green Candles**: Bullish price action
- **Red Candles**: Bearish price action
- **1st Leg & 2nd Leg**: Price action structure (identify even if not drawn)

**ANALYSIS PROTOCOL:**

1. **Multi-Timeframe Context:**
   - Daily Chart: Major trend direction, key S/R levels
   - 1-Hour Chart: Intermediate trend, entry timing
   - Current Screenshot: Precise entry/exit zones

2. **Blue EMA 21 Analysis:**
   - Is price above/below EMA? (Trend bias)
   - Is EMA sloping up/down? (Momentum)
   - Recent touches/bounces? (Dynamic S/R validation)
   - Per document rules: [cite specific section]

3. **Price Action Structure:**
   - Identify 1st leg (initial move) and 2nd leg (correction/continuation)
   - Higher highs/lows or lower highs/lows?
   - Key candlestick patterns (pinbars, engulfing, inside bars)

4. **Support/Resistance:**
   - Validate yellow support and white resistance levels
   - Multiple touches = stronger level
   - Recent price behavior at these levels
   - Purple range boundaries if present

5. **Signal Confidence:**
   - [🟢] BULLISH SIGNAL if document rules align (cite rule)
   - [🔴] BEARISH SIGNAL if document rules align (cite rule)
   - ⚠️ NO SIGNAL if conflicting or rule violation

6. **Win Probability:**
   - ONLY provide % if document has backtested data for this exact setup
   - Format: "Rule X.X: Y% win rate for [specific setup]"
   - If no data: "No accuracy % per document"

**RESPONSE FORMAT (Max 150 words):**

**Signal:** [🟢]/[🔴] [Setup Type] | Accuracy: [X% or "No accuracy % per doc"]

**Multi-Timeframe View:**
- Daily: [Trend direction, major S/R]
- 1H: [Intermediate trend, setup stage]
- Current: [Specific entry zone]

**Blue EMA 21:** [Position relative to price, slope, recent interactions] (Rule X.X)

**Key Levels:**
- Support: $[price] - [validation method] (Rule X.X)
- Resistance: $[price] - [validation method] (Rule X.X)
- Range: [if purple rectangle present]

**Price Action:**
- Structure: [1st/2nd leg identification]
- Pattern: [candlestick formation]
- Confluence: [multiple confirming factors] (Rules X.X, X.X)

**Risk Assessment:**
⚠️ [Specific violated rules or high-risk conditions]

**Action:** [What to watch for next / entry-exit plan]

**CRITICAL RULES:**
- NEVER give financial advice - only technical observations
- ALWAYS cite document rules with section numbers
- If uncertain, explicitly state "unclear" or "needs confirmation"
- Accuracy % ONLY if document provides backtested stats
- Use 1st/2nd leg terminology when identifying price structure
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

async function makeLLMRequest(prompt, filePath, additionalImages = {}) {
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
`;
  }

  // Add learning context
  fullPrompt += learningService.getContextForPrompt();

  fullPrompt += `\n\n**USER REQUEST:**
${prompt || "Analyze this screenshot and provide trading insights."}`;

  const promptParts = [{ text: fullPrompt }];

  // Add main screenshot
  if (filePath && fs.existsSync(filePath)) {
    promptParts.push(fileToGenerativePart(filePath, "image/png"));
  }

  // Add daily chart
  if (additionalImages.daily && fs.existsSync(additionalImages.daily)) {
    promptParts.push({ text: "\n**DAILY CHART:**" });
    promptParts.push(fileToGenerativePart(additionalImages.daily, "image/png"));
  }

  // Add 1-hour chart
  if (additionalImages.oneHour && fs.existsSync(additionalImages.oneHour)) {
    promptParts.push({ text: "\n**1-HOUR CHART:**" });
    promptParts.push(fileToGenerativePart(additionalImages.oneHour, "image/png"));
  }

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: promptParts }],
    });

    const response = result.response;
    const content = response.text();
    const usage = response.usageMetadata;

    console.log("=== Gemini Response ===");
    console.log("Content length:", content.length);
    console.log("Token usage:", usage);
    console.log("Additional images:", Object.keys(additionalImages));
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
  learningService, // ADD THIS LINE
};