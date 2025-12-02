import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid'; 

const KEYS = {
  SESSIONS: '@archie_sessions_v1',       // Stores array of { id, title, preview, date, attachment... }
  SESSION_PREFIX: '@archie_chat_v1_',    // Stores messages for a specific ID
  FLASHCARDS: '@archie_flashcards',
};

export const StorageService = {
  // --- SESSION MANAGEMENT ---

  // 1. Get the list of all chat sessions (for the sidebar)
  getAllSessions: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(KEYS.SESSIONS);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      console.error("Failed to load sessions", e);
      return [];
    }
  },

  // 2. Create a new blank session
  createSession: async (title = "New Chat") => {
    try {
      const newSession = {
        id: uuidv4(), // Unique ID
        title: title,
        timestamp: Date.now(),
        preview: "Start a new conversation...",
        attachmentName: null, // Stores the name of the pinned PDF
        attachmentPath: null  // Stores the local URI of the pinned PDF
      };
      
      const sessions = await StorageService.getAllSessions();
      const updatedSessions = [newSession, ...sessions]; // Add new session to the top
      await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(updatedSessions));
      
      return newSession;
    } catch (e) {
      console.error("Failed to create session", e);
      return null;
    }
  },

  // 3. Save messages for a SPECIFIC session
  saveSessionMessages: async (sessionId, messages) => {
    try {
      await AsyncStorage.setItem(KEYS.SESSION_PREFIX + sessionId, JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save messages", e);
    }
  },

  // 4. Load messages for a SPECIFIC session
  loadSessionMessages: async (sessionId) => {
    try {
      const jsonValue = await AsyncStorage.getItem(KEYS.SESSION_PREFIX + sessionId);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      console.error("Failed to load messages", e);
      return [];
    }
  },

  // 5. Update Session Metadata (Rename title, update preview text, or save attachment info)
  updateSessionMeta: async (sessionId, newTitle, newPreview, attachmentName, attachmentPath) => {
    try {
      const sessions = await StorageService.getAllSessions();
      const updated = sessions.map(s => 
        s.id === sessionId 
          ? { 
              ...s, 
              title: newTitle || s.title, 
              preview: newPreview || s.preview,
              // Update attachment info if provided, otherwise keep existing
              attachmentName: attachmentName !== undefined ? attachmentName : s.attachmentName,
              attachmentPath: attachmentPath !== undefined ? attachmentPath : s.attachmentPath,
              timestamp: Date.now() 
            } 
          : s
      );
      await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to update session", e);
    }
  },
  
  // --- FLASHCARDS (Legacy Support) ---
  saveDeck: async (cards) => {
    try {
      const jsonValue = JSON.stringify(cards);
      await AsyncStorage.setItem(KEYS.FLASHCARDS, jsonValue);
    } catch (e) { console.error(e); }
  },

  loadDeck: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(KEYS.FLASHCARDS);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) { return []; }
  },
};