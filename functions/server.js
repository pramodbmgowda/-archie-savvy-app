console.log("🚀 Starting Server Script...");

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const os = require("os");
const path = require("path");
require("dotenv").config();

// Google AI SDK
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json({ limit: "50mb" }));

/* ---------------------------------------------------------
   ✅ ENVIRONMENT VALIDATION
--------------------------------------------------------- */
if (!process.env.GOOGLE_API_KEY) {
  console.error("❌ ERROR: Missing GOOGLE_API_KEY in environment.");
  process.exit(1);
}

const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

/* ---------------------------------------------------------
   🔧 MODEL CONFIG
--------------------------------------------------------- */
const MODEL = "gemini-2.0-flash";

/* ---------------------------------------------------------
   📤 HELPER: Upload Files to Gemini
--------------------------------------------------------- */
async function uploadToGemini(base64Data, mimeType, displayName) {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const tempFile = path.join(os.tmpdir(), displayName || `temp_${Date.now()}`);

    fs.writeFileSync(tempFile, buffer);

    const uploaded = await fileManager.uploadFile(tempFile, {
      mimeType,
      displayName,
    });

    fs.unlinkSync(tempFile);

    return { uri: uploaded.file.uri, mimeType };
  } catch (err) {
    console.error("❌ File Upload Error:", err);
    throw new Error("File upload to Gemini failed.");
  }
}

/* ---------------------------------------------------------
   🏠 ROOT ROUTE (Fixes Render 404 Issue)
--------------------------------------------------------- */
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "ArchieSavvy Backend is Live 🚀",
    timestamp: new Date().toISOString(),
  });
});

/* ---------------------------------------------------------
   🎓 TITLING
--------------------------------------------------------- */
app.post("/generate-title", async (req, res) => {
  try {
    const { message } = req.body;

    const model = genAI.getGenerativeModel({ model: MODEL });
    const output = await model.generateContent(
      `Summarize this in 3–5 words for a chat title: ${message}`
    );

    return res.json({ title: output.response.text().trim() });
  } catch (err) {
    console.error("❌ Title Error:", err);
    res.status(500).json({ error: "Failed to generate title." });
  }
});

/* ---------------------------------------------------------
   💬 MAIN CHAT ENDPOINT
--------------------------------------------------------- */
app.post("/chatWithTutor", async (req, res) => {
  try {
    const {
      action,
      message,
      history = [],
      files = [],
      activeFileUris = [],
      image,
      topic,
    } = req.body;

    /* -----------------------------
       ACTION: Title generation
    ----------------------------- */
    if (action === "generate_title") {
      const model = genAI.getGenerativeModel({ model: MODEL });
      const output = await model.generateContent(
        `Summarize this in 3–5 words: ${message}`
      );
      return res.json({ title: output.response.text().trim() });
    }

    /* -----------------------------
       ACTION: Chat
    ----------------------------- */
    if (action === "chat") {
      let newUploads = [];

      // Upload new files
      if (files?.length > 0) {
        const uploads = files.map((file) =>
          uploadToGemini(
            file.data,
            file.type === "pdf" ? "application/pdf" : "image/png",
            file.name
          )
        );

        newUploads = await Promise.all(uploads);
      }

      const existingFiles = activeFileUris.filter(
        (f) => typeof f === "object" && f.uri
      );

      const finalFileList = [...existingFiles, ...newUploads];

      const model = genAI.getGenerativeModel({ model: MODEL });

      const chatHistory = history
        .map((m) => ({ role: m.role, parts: [{ text: m.text || "" }] }))
        .slice(-15);

      const parts = [];

      // Attach files as parts
      finalFileList.forEach((file) => {
        parts.push({
          fileData: { mimeType: file.mimeType, fileUri: file.uri },
        });
      });

      if (message) parts.push({ text: message });

      const result = await model.generateContent({
        contents: [...chatHistory, { role: "user", parts }],
      });

      return res.json({
        text: result.response.text(),
        activeFileUris: finalFileList,
      });
    }

    /* -----------------------------
       ACTION: Math Vision
    ----------------------------- */
    if (action === "math_vision") {
      if (!image) return res.status(400).json({ error: "Image missing." });

      const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: { responseMimeType: "application/json" },
      });

      const result = await model.generateContent([
        `Analyze this math problem. Return ONLY JSON:
        { "latex": "...", "hint": "...", "solution": "..." }`,
        { inlineData: { mimeType: "image/png", data: image } },
      ]);

      return res.json(JSON.parse(result.response.text()));
    }

    /* -----------------------------
       ACTION: Flashcards
    ----------------------------- */
    if (action === "generate_flashcards") {
      const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: { responseMimeType: "application/json" },
      });

      const result = await model.generateContent(`
        Create 5 flashcards about "${topic || message}".
        JSON ONLY:
        [
          { "front": "...", "back": "...", "tag": "..." }
        ]
      `);

      return res.json(JSON.parse(result.response.text()));
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error("🔥 Server Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------------
   🚀 START SERVER
--------------------------------------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});