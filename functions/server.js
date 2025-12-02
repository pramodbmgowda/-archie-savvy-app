console.log("Starting Server Script..."); // 👈 Verification Log

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require("fs");
const os = require("os");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json({ limit: '50mb' })); // Allow large files

// Initialize Gemini
// Ensure GOOGLE_API_KEY is in your .env file or hardcoded for testing
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
    console.error("❌ ERROR: GOOGLE_API_KEY is missing from .env file");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

const CHAT_MODEL = "gemini-2.0-flash"; 
const VISION_MODEL = "gemini-2.0-flash";
const FLASHCARD_MODEL = "gemini-2.0-flash";
const TITLE_MODEL = "gemini-2.0-flash";


// Helper: Upload to Gemini
async function uploadToGemini(base64Data, mimeType, displayName) {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const tempFilePath = path.join(os.tmpdir(), displayName || `temp_${Date.now()}`);
    fs.writeFileSync(tempFilePath, buffer);

    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: mimeType,
      displayName: displayName,
    });

    fs.unlinkSync(tempFilePath);
    return { uri: uploadResponse.file.uri, mimeType: mimeType };
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
}

// The Main Route
app.post('/chatWithTutor', async (req, res) => {
  try {
    const { action, message, history = [], files = [], activeFileUris = [], image, topic } = req.body;

    // 1. Generate Title
    if (action === "generate_title") {
      const model = genAI.getGenerativeModel({ model: TITLE_MODEL });
      const result = await model.generateContent(`Summarize this in 3-5 words for a chat title: ${message}`);
      return res.json({ title: result.response.text().trim() });
    }

    // 2. Chat
    if (action === "chat") {
      let newlyUploadedFiles = [];
      if (files && files.length > 0) {
        console.log(`📂 Uploading ${files.length} new files...`);
        const uploadPromises = files.map(f => {
           const mime = f.type === 'pdf' || f.name.endsWith('.pdf') ? 'application/pdf' : 'image/png';
           return uploadToGemini(f.data, mime, f.name);
        });
        newlyUploadedFiles = await Promise.all(uploadPromises);
      }

      const validOldFiles = activeFileUris.filter(f => typeof f === 'object' && f.uri); 
      const finalFiles = [...validOldFiles, ...newlyUploadedFiles];

      const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
      const chatHistory = history.map(m => ({ role: m.role, parts: [{ text: m.text || "" }] })).slice(-15);

      const currentParts = [];
      for (const fileObj of finalFiles) {
          currentParts.push({
              fileData: { mimeType: fileObj.mimeType, fileUri: fileObj.uri }
          });
      }
      if (message) currentParts.push({ text: message });

      const result = await model.generateContent({
          contents: [...chatHistory, { role: "user", parts: currentParts }]
      });

      return res.json({
          text: result.response.text(),
          activeFileUris: finalFiles 
      });
    }

    // 3. Vision
    if (action === "math_vision") {
        if (!image) return res.status(400).json({ error: "No image" });
        const model = genAI.getGenerativeModel({ model: VISION_MODEL, generationConfig: { responseMimeType: "application/json" } });
        const result = await model.generateContent([
            `Analyze this math problem. Return ONLY valid JSON: { "latex": "...", "hint": "...", "solution": "..." }`,
            { inlineData: { mimeType: "image/png", data: image } }
        ]);
        return res.json(JSON.parse(result.response.text()));
    }

    // 4. Flashcards
    if (action === "generate_flashcards") {
        const model = genAI.getGenerativeModel({ model: FLASHCARD_MODEL, generationConfig: { responseMimeType: "application/json" } });
        const result = await model.generateContent(`Create 5 distinct flashcards about: "${topic || message}". Return valid JSON array: [{ "front": "...", "back": "...", "tag": "..." }]`);
        return res.json(JSON.parse(result.response.text()));
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (err) {
    console.error("🔥 Server Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));