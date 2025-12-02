import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  StatusBar
} from 'react-native';
import SignatureScreen from "react-native-signature-canvas";
import { SafeAreaView } from "react-native-safe-area-context";

// -------- CONFIG ----------
const API_URL = "https://archie-savvy-app.onrender.com/chatWithTutor";

// --- THEME ---
const COLORS = {
  background: "#343541",
  sidebar: "#202123",
  inputBg: "#40414F",
  text: "#ECECF1",
  subText: "#ACACBE",
  primary: "#10a37f", 
  danger: "#ef4444",
  warning: "#eab308", 
  border: "rgba(255,255,255,0.1)",
  canvas: "#FFFFFF"
};

const ArchieScreen = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const signatureRef = useRef(null);

  const handleSignatureOK = (signature) => {
    const cleanBase64 = signature.replace("data:image/png;base64,", "");
    sendToBrain(cleanBase64);
  };

  const sendToBrain = async (base64Image) => {
    setLoading(true);
    setResult(null);
    setShowAnswer(false);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "math_vision", image: base64Image })
      });
      if (!response.ok) throw new Error(await response.text());
      setResult(await response.json());
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Archie couldn't analyze that.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      <SafeAreaView edges={['top']} style={styles.header}>
          <Text style={styles.title}>✏️ Math Canvas</Text>
      </SafeAreaView>

      <View style={styles.content}>
        {result ? (
            // --- RESULT VIEW ---
            <View style={styles.resultContainer}>
                <Text style={styles.latexLabel}>DETECTED PROBLEM:</Text>
                <View style={styles.latexBox}>
                    <Text style={styles.latex}>{result.latex || "..."}</Text>
                </View>
                
                <View style={[styles.card, styles.hintCard]}>
                    <Text style={[styles.cardTitle, {color: COLORS.warning}]}>💡 Hint</Text>
                    <Text style={styles.cardText}>{result.hint}</Text>
                </View>

                {showAnswer ? (
                    <View style={[styles.card, styles.solutionCard]}>
                        <Text style={[styles.cardTitle, {color: COLORS.primary}]}>✅ Final Answer</Text>
                        <Text style={[styles.cardText, {fontWeight:'bold', fontSize: 20}]}>{result.solution}</Text>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.revealBtn} onPress={() => setShowAnswer(true)}>
                        <Text style={styles.revealText}>👀 Reveal Answer</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.btn} onPress={() => setResult(null)}>
                    <Text style={styles.btnText}>Solve Another</Text>
                </TouchableOpacity>
            </View>
        ) : (
          // --- DRAWING VIEW ---
            <View style={{flex: 1}}>
                <View style={styles.canvasContainer}>
                    <SignatureScreen
                        ref={signatureRef}
                        onOK={handleSignatureOK}
                        backgroundColor={COLORS.canvas}
                        penColor="#000000"
                        imageType="image/png"
                        minWidth={3}
                        webStyle={`.m-signature-pad--footer { display: none; } body,html { width: 100%; height: 100%; background-color: #ffffff; }`} 
                    />
                </View>
                <View style={styles.controls}>
                    <TouchableOpacity style={styles.clearBtn} onPress={() => signatureRef.current.clearSignature()}>
                        <Text style={styles.clearText}>Clear</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.solveBtn} onPress={() => signatureRef.current.readSignature()}>
                        <Text style={styles.btnText}>Solve</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )}

        {loading && (
            <View style={styles.overlay}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Analyzing Math...</Text>
            </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { 
    backgroundColor: COLORS.sidebar, 
    borderBottomWidth: 1, 
    borderColor: COLORS.border, 
    paddingBottom: 15,
    alignItems: 'center'
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 5 },
  content: { flex: 1 },
  canvasContainer: { flex: 1, margin: 15, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  controls: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 30 },
  clearBtn: { padding: 15 },
  clearText: { color: COLORS.danger, fontWeight: '600' },
  solveBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 40, borderRadius: 25 },
  btn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(52, 53, 65, 0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 50 },
  loadingText: { color: COLORS.text, marginTop: 15, fontSize: 16, fontWeight: '500' },
  resultContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  latexLabel: { fontSize: 11, color: COLORS.subText, fontWeight: '700', letterSpacing: 1, marginBottom: 8, textTransform:'uppercase' },
  latexBox: { backgroundColor: COLORS.inputBg, padding: 15, borderRadius: 8, marginBottom: 20, alignItems:'center' },
  latex: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
  card: { backgroundColor: COLORS.sidebar, padding: 16, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: COLORS.border },
  hintCard: { borderLeftWidth: 4, borderLeftColor: COLORS.warning },
  solutionCard: { borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  cardTitle: { fontWeight: '700', marginBottom: 6, fontSize: 14 },
  cardText: { fontSize: 16, color: COLORS.text, lineHeight: 24 },
  revealBtn: { backgroundColor: COLORS.inputBg, padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },
  revealText: { color: COLORS.subText, fontWeight: '600' }
});

export default ArchieScreen;