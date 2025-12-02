import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Platform, 
  Alert,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // ✅ FIX: Use this library for correct padding on Android
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { pick, types } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';

import SwipeCard from '../components/SwipeCard';

// -------- CONFIG ----------
const API_URL = "https://archie-savvy-app.onrender.com/chatWithTutor";
const COLORS = {
  background: "#343541",
  sidebar: "#202123",
  text: "#ECECF1",
  subText: "#ACACBE",
  primary: "#10a37f", 
  card: "#444654",
  success: "#10a37f",
  danger: "#ef4444"
};

const FlashcardScreen = () => {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // 1. Pick Document
  const pickDocument = async () => {
    try {
      const result = await pick({
        type: [types.pdf],
        allowMultiSelection: false
      });

      const file = result[0];
      setLoading(true);

      const base64 = await RNFS.readFile(file.uri, 'base64');
      generateCardsFromPDF(file.name, base64);
      
    } catch (err) {
      if (err.code === 'DOCUMENT_PICKER_CANCELED') return;
      console.error("Pick Error", err);
      Alert.alert("Error", "Could not read the file.");
      setLoading(false);
    }
  };

  // 2. Generate Cards
  const generateCardsFromPDF = async (fileName, base64Data) => {
    setCompletedCount(0);
    setCards([]); 

    try {
      const prompt = `
        Analyze the attached PDF "${fileName}".
        Generate 10 study flashcards based on the most important concepts.
        
        CRITICAL: Return ONLY a raw JSON array. No markdown, no text intro.
        Format:
        [
          { "front": "Question...", "back": "Answer...", "tag": "Concept" }
        ]
      `;

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: "chat", 
          message: prompt,
          files: [{
              name: fileName,
              type: 'pdf',
              data: base64Data
          }]
        })
      });

      if (!response.ok) throw new Error(await response.text());
      
      const data = await response.json();
      const cleanJson = data.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedCards = JSON.parse(cleanJson);

      setCards(parsedCards.reverse());

    } catch (error) {
      console.error("AI Error", error);
      Alert.alert("Generation Failed", "Could not generate flashcards from this PDF.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Swipe Logic
  const handleSwipe = useCallback((index) => {
    setCards((prev) => {
      const newCards = [...prev];
      newCards.splice(index, 1);
      return newCards;
    });
    setCompletedCount(prev => prev + 1);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* ⚡ Edges ensures safe area padding on top/bottom/sides */}
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        
        {/* HEADER */}
        <View style={styles.header}>
          {/* ⚡ Updated Title */}
          <Text style={styles.title}>🧠 Brain Forge</Text>
          <Text style={styles.subtitle}>
            {cards.length > 0 ? `${cards.length} cards remaining` : "PDF to Flashcards"}
          </Text>
        </View>

        <View style={styles.contentArea}>
          {/* LOADING */}
          {loading && (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Forging Deck...</Text>
              <Text style={styles.subText}>Extracting knowledge from your PDF.</Text>
            </View>
          )}

          {/* EMPTY STATE */}
          {!loading && cards.length === 0 && (
            <View style={styles.centerState}>
              <Text style={styles.emoji}>{completedCount > 0 ? "🔥" : "📄"}</Text>
              <Text style={styles.emptyTitle}>{completedCount > 0 ? "Deck Conquered!" : "Empty Forge"}</Text>
              <Text style={styles.emptySubtitle}>
                 {completedCount > 0 ? "You crushed it! Ready for more?" : "Upload a PDF to forge a new study deck."}
              </Text>
              <TouchableOpacity style={styles.btn} onPress={pickDocument}>
                <Text style={styles.btnText}>
                  {completedCount > 0 ? "Start New Session" : "+ Upload PDF"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* CARD STACK */}
          {cards.map((card, index) => {
            if (index >= cards.length - 2) {
              return (
                <SwipeCard 
                  key={index} 
                  data={card} 
                  index={index} 
                  onSwipeLeft={handleSwipe} 
                  onSwipeRight={handleSwipe} 
                />
              );
            }
            return null;
          })}
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { 
    paddingHorizontal: 24, 
    paddingTop: 10, // Reduced slightly as SafeAreaView handles the status bar height
    paddingBottom: 15, 
    borderBottomWidth: 1, 
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center' 
  },
  title: { 
    fontSize: 28, 
    fontWeight: '900', 
    color: COLORS.text, 
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  subtitle: { 
    fontSize: 14, 
    color: COLORS.subText, 
    marginTop: 6, 
    fontWeight: '500' 
  },
  
  contentArea: { flex: 1, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  
  centerState: { alignItems: 'center', justifyContent: 'center', marginTop: -50 },
  emoji: { fontSize: 60, marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.text, marginBottom: 10 },
  emptySubtitle: { fontSize: 15, color: COLORS.subText, textAlign: 'center', marginBottom: 30, paddingHorizontal: 50, lineHeight: 24 },
  
  loadingText: { marginTop: 20, fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  subText: { marginTop: 8, fontSize: 14, color: COLORS.subText },

  btn: { backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 30, borderRadius: 100, elevation: 4 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});

export default FlashcardScreen;