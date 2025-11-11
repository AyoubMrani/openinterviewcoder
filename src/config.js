const Store = require("electron-store");

const store = new Store({
  defaults: {
    gemini: {
      apiKey: "AIzaSyDFwGZwsu8eRTDlaMxp987PeCKG79EeXBM",
    },
  },
});

module.exports = {
  getGeminiKey: () => store.get("gemini.apiKey") || "",
  setGeminiKey: (key) => store.set("gemini.apiKey", key),
  hasGeminiKey: () => !!store.get("gemini.apiKey"),
};
