const axios = require("axios");
const { ipcMain } = require("electron");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const config = require("./config");

// Use a model that supports multimodal inputs (text and image)
const MODEL_NAME = "gemini-2.5-flash";
let genAI;
let generativeModel;

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are an invisible AI assistant that analyzes screenshots during meetings and presentations.

Key Responsibilities:
1. Analyze visual content quickly and efficiently
2. Provide concise, actionable insights
3. Identify key information, patterns, and potential issues
4. Suggest relevant follow-up questions or actions

Guidelines:
- Keep responses brief and scannable (max 200 words)
- Use bullet points and clear formatting
- Highlight important terms using **bold**
- Focus on actionable insights
- If code is shown, provide quick technical insights
- For data/charts, emphasize key trends and anomalies
- During presentations, note key takeaways and action items

Format your responses in sections:
â€¢ Quick Summary (2-3 sentences)
â€¢ Key Points (3-5 bullets)
â€¢ Suggested Actions (if applicable)
â€¢ Technical Notes (if code/data is present)`;

let isInitialized = false;

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
    // Note: The Node.js library does not directly expose token limits in the same way.
    // We will use a known default for gemini-1.5-flash, which is very large.
    // The API response's usageMetadata is the reliable source for actual usage.
    return {
      // Gemini 1.5 Flash has a massive context window, often 1M tokens.
      // Setting a practical limit for UI purposes might be better.
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


async function makeLLMRequest(prompt, filePath) {
  if (!initializeGemini()) {
    throw new Error(
      "Gemini API key not configured. Please set your API key in the settings."
    );
  }

  // +++ THIS IS THE CORRECTED LINE +++
  // The prompt string is now correctly wrapped in an object.
  const promptParts = [{ text: prompt }];

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

    console.log("Full Gemini API Result:", JSON.stringify(result, null, 2));

    const response = result.response;
    const content = response.text();
    const usage = response.usageMetadata;

    return {
      success: true,
      content,
      tokensUsed: usage.totalTokens,
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
};
