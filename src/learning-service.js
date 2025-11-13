const fs = require("fs");
const path = require("path");
const { app } = require("electron");

class LearningService {
  constructor() {
    this.learningDataPath = path.join(app.getPath("userData"), "learning-data.json");
    this.learningData = this.loadLearningData();
  }

  loadLearningData() {
    try {
      if (fs.existsSync(this.learningDataPath)) {
        const data = fs.readFileSync(this.learningDataPath, "utf8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Error loading learning data:", error);
    }
    return { analyses: [], stats: { useful: 0, notUseful: 0, successful: 0, failed: 0 } };
  }

  saveLearningData() {
    try {
      fs.writeFileSync(this.learningDataPath, JSON.stringify(this.learningData, null, 2));
    } catch (error) {
      console.error("Error saving learning data:", error);
    }
  }

  saveAnalysis(analysisData) {
    const record = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    market: analysisData.market || "Not specified", // ADD THIS
    screenshot: analysisData.screenshot,
    daily: analysisData.daily,
    oneHour: analysisData.oneHour,
    prompt: analysisData.prompt,
    response: analysisData.response,
    feedback: null,
    tradeResult: null,
    };
    
    this.learningData.analyses.push(record);
    this.saveLearningData();
    return record.id;
  }

  updateFeedback(analysisId, wasUseful, tradeSuccessful) {
    const analysis = this.learningData.analyses.find(a => a.id === analysisId);
    if (analysis) {
      analysis.feedback = wasUseful;
      analysis.tradeResult = tradeSuccessful;
      
      // Update stats
      if (wasUseful) this.learningData.stats.useful++;
      else this.learningData.stats.notUseful++;
      
      if (tradeSuccessful !== null) {
        if (tradeSuccessful) this.learningData.stats.successful++;
        else this.learningData.stats.failed++;
      }
      
      this.saveLearningData();
    }
  }

  getContextForPrompt() {
    // Get recent successful analyses to improve future predictions
    const recentSuccessful = this.learningData.analyses
      .filter(a => a.feedback === true && a.tradeResult === true)
      .slice(-10); // Last 10 successful trades
    
    if (recentSuccessful.length === 0) return "";
    
    return `\n\n**LEARNING CONTEXT (Recent Successful Trades):**
${recentSuccessful.map((a, i) => `
${i + 1}. Analysis that led to successful trade:
   - Prompt: ${a.prompt}
   - Key insight: ${a.response.substring(0, 200)}...
`).join("\n")}`;
  }

  getStats() {
    return this.learningData.stats;
  }
}

module.exports = new LearningService();