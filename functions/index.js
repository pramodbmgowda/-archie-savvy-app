const { onRequest } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server"); 
const fs = require("fs");
const os = require("os");
const path = require("path");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY);

// Models
const CHAT_MODEL = "gemini-2.0-flash"; 
const VISION_MODEL = "gemini-2.0-flash";
const FLASHCARD_MODEL = "gemini-2.0-flash";
const TITLE_MODEL = "gemini-2.0-flash";

// --- HELPER: Upload Base64 to Google File API ---
// ✅ FIX 1: Return Object { uri, mimeType } instead of just URI string
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
    
    // Return BOTH pieces of info
    return { 
        uri: uploadResponse.file.uri, 
        mimeType: mimeType 
    };
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
}

exports.chatWithTutor = onRequest({ timeoutSeconds: 300 }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "POST");
    res.status(200).send();
    return;
  }

  try {
    const { action, message, history = [], files = [], activeFileUris = [], image, topic } = req.body;

    // ==========================================
    // 1️⃣ ACTION: GENERATE TITLE
    // ==========================================
    if (action === "generate_title") {
      const model = genAI.getGenerativeModel({ model: TITLE_MODEL });
      const result = await model.generateContent(`Summarize this in 3-5 words for a chat title: ${message}`);
      return res.json({ title: result.response.text().trim() });
    }

    // ==========================================
    // 2️⃣ ACTION: CHAT
    // ==========================================
    if (action === "chat") {
      // A. Handle New Uploads
      let newlyUploadedFiles = [];
      if (files && files.length > 0) {
        console.log(`📂 Uploading ${files.length} new files...`);
        const uploadPromises = files.map(f => {
           // Determine Type
           const mime = f.type === 'pdf' || f.name.endsWith('.pdf') 
                ? 'application/pdf' 
                : 'image/png';
           return uploadToGemini(f.data, mime, f.name);
        });
        
        // This will be an array of objects: [{ uri: "...", mimeType: "..." }]
        newlyUploadedFiles = await Promise.all(uploadPromises);
      }

      // B. Merge Old + New Files (Memory)
      // We combine the lists. (activeFileUris might contain old strings from previous testing, so we filter them)
      const validOldFiles = activeFileUris.filter(f => typeof f === 'object' && f.uri); 
      const finalFiles = [...validOldFiles, ...newlyUploadedFiles];

      // C. Build Prompt
      const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
      
      const chatHistory = history.map(m => ({
          role: m.role,
          parts: [{ text: m.text || "" }] 
      })).slice(-15);

      const currentParts = [];
      
      // ✅ FIX 2: Loop through objects and use the STORED mimeType
      for (const fileObj of finalFiles) {
          currentParts.push({
              fileData: {
                  mimeType: fileObj.mimeType, // <--- Correct Type Used Here
                  fileUri: fileObj.uri
              }
          });
      }
      if (message) currentParts.push({ text: message });

      const result = await model.generateContent({
          contents: [...chatHistory, { role: "user", parts: currentParts }]
      });

      return res.json({
          text: result.response.text(),
          activeFileUris: finalFiles // Send OBJECTS back to frontend
      });
    }

    // ==========================================
    // 3️⃣ ACTION: ARCHIE VISION
    // ==========================================
    if (action === "math_vision") {
        if (!image) return res.status(400).json({ error: "No image provided" });

        const model = genAI.getGenerativeModel({ 
            model: VISION_MODEL,
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
          Analyze this math problem. 
          Return ONLY valid JSON:
          {
            "latex": "The LaTeX code",
            "hint": "A short hint",
            "solution": "The answer"
          }
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { mimeType: "image/png", data: image } }
        ]);

        const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return res.json(JSON.parse(cleanText));
    }

    // ==========================================
    // 4️⃣ ACTION: FLASHCARDS
    // ==========================================
    if (action === "generate_flashcards") {
        const model = genAI.getGenerativeModel({ 
            model: FLASHCARD_MODEL,
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
          Create 5 distinct flashcards about: "${topic || message}".
          Return valid JSON array:
          [
            { "front": "Question...", "back": "Answer...", "tag": "Concept" }
          ]
        `;

        const result = await model.generateContent(prompt);
        const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return res.json(JSON.parse(cleanText));
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (err) {
    console.error("🔥 Server Error:", err);
    return res.status(500).json({ error: err.message });
  }
});