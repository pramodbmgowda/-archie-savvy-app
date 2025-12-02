console.log("🚀 Starting Server Script...");

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const os = require("os");
const path = require("path");
require("dotenv").config();

// Google AI (Gemini)
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const app = express();
app.use(cors({ origin: true }));

// Increased limit to handle base64 images/PDFs
app.use(bodyParser.json({ limit: "50mb" }));

/* ---------------------------------------------------------
   VALIDATE API KEY
--------------------------------------------------------- */
if (!process.env.GOOGLE_API_KEY) {
  console.error("❌ ERROR: Missing GOOGLE_API_KEY in .env");
  process.exit(1);
}

const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

/* ---------------------------------------------------------
   MODEL CONFIG
--------------------------------------------------------- */
const MODEL = "gemini-2.0-flash";

/* ---------------------------------------------------------
   📤 Upload helper: Base64 → Gemini File API
--------------------------------------------------------- */
async function uploadToGemini(base64Data, mimeType, displayName) {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const tempPath = path.join(os.tmpdir(), displayName || `file_${Date.now()}`);

    fs.writeFileSync(tempPath, buffer);

    const uploadResponse = await fileManager.uploadFile(tempPath, {
      mimeType,
      displayName,
    });

    fs.unlinkSync(tempPath);

    return {
      uri: uploadResponse.file.uri,
      mimeType: mimeType,
    };
  } catch (err) {
    console.error("❌ Upload failed:", err);
    throw new Error("File upload error");
  }
}

/* ---------------------------------------------------------
   ROOT CHECK (Fix for Render 404)
--------------------------------------------------------- */
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "ArchieSavvy Backend",
    time: new Date().toISOString(),
  });
});

/* ---------------------------------------------------------
   ✨ Generate Title Endpoint (Optional standalone)
--------------------------------------------------------- */
app.post("/generate-title", async (req, res) => {
  try {
    const { message } = req.body;
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(
      `Summarize this into a short 3-5 word title: ${message}`
    );
    res.json({ title: result.response.text().trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Title generation failed" });
  }
});

/* ---------------------------------------------------------
   💬 MAIN CHAT (All-in-one endpoint)
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
       ACTION: Generate Title (Inside main route)
    ----------------------------- */
    if (action === "generate_title") {
      const model = genAI.getGenerativeModel({ model: MODEL });
      const result = await model.generateContent(
        `Summarize this into a short title: ${message}`
      );
      return res.json({ title: result.response.text().trim() });
    }

    /* -----------------------------
       ACTION: Chat (The Smart Camera Handler)
    ----------------------------- */
    if (action === "chat") {
      let newUploads = [];

      // 1. Upload new files if present
      if (files?.length > 0) {
        const uploadJobs = files.map((f) => {
          // 🛠️ FIX: Better MIME type detection (Camera sends JPEGs)
          let mimeType = "image/jpeg"; // Default to JPEG for camera photos

          if (f.type === "pdf" || (f.name && f.name.toLowerCase().endsWith(".pdf"))) {
            mimeType = "application/pdf";
          } else if (f.name && f.name.toLowerCase().endsWith(".png")) {
            mimeType = "image/png";
          }
          
          return uploadToGemini(f.data, mimeType, f.name);
        });
        
        newUploads = await Promise.all(uploadJobs);
      }

      // 2. Combine old active files with new uploads
      const oldFiles = activeFileUris.filter(
        (f) => typeof f === "object" && f.uri
      );
      const finalFiles = [...oldFiles, ...newUploads];

      // 3. Initialize Model with SMART SYSTEM INSTRUCTION
      // This ensures it handles general images AND math problems accurately.
      const model = genAI.getGenerativeModel({ 
          model: MODEL,
          systemInstruction: "You are Archie, an intelligent AI tutor. You are capable of general image analysis (identifying objects, reading text, explaining scenes) but you also specialize in Mathematics and Coding. If the user provides an image of a math problem, solve it step-by-step with high accuracy. If the image is general, describe or answer the user's question about it naturally."
      });

      // 4. Format history
      const chatHistory = history
        .map((m) => ({
          role: m.role,
          parts: [{ text: m.text || "" }],
        }))
        .slice(-15); 

      // 5. Prepare current message
      const parts = [];

      finalFiles.forEach((file) =>
        parts.push({ fileData: { mimeType: file.mimeType, fileUri: file.uri } })
      );

      if (message) parts.push({ text: message });

      // 6. Generate Response
      const result = await model.generateContent({
        contents: [...chatHistory, { role: "user", parts }],
      });

      return res.json({
        text: result.response.text(),
        activeFileUris: finalFiles,
      });
    }

    /* -----------------------------
       ACTION: Math Vision (Archie Screen Specific)
    ----------------------------- */
    if (action === "math_vision") {
      if (!image)
        return res.status(400).json({ error: "Image is required for math vision" });

      const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: { responseMimeType: "application/json" },
      });

      const result = await model.generateContent([
        `Analyze this math problem & return JSON ONLY:
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

      const prompt = `
        Create 5 flashcards about "${topic || message}".
        Return JSON ONLY:
        [
          { "front": "...", "back": "...", "tag": "..." }
        ]
      `;

      const result = await model.generateContent(prompt);
      return res.json(JSON.parse(result.response.text()));
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("🔥 Server Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------------
   START SERVER
--------------------------------------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌍 ArchieSavvy Server running on PORT ${PORT}`)
);