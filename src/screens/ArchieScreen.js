import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  Platform,
  Linking,
  StatusBar
} from 'react-native';
import SignatureScreen from "react-native-signature-canvas";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import RNFS from 'react-native-fs'; 

// -------- CONFIG ----------
const API_URL = "https://archie-savvy-app.onrender.com/chatWithTutor";

// --- UNIFIED DARK THEME ---
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
  const [mode, setMode] = useState("draw"); // 'draw' | 'camera'
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef(null);
  const signatureRef = useRef(null);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  const handlePermissionRequest = async () => {
    const granted = await requestPermission();
    if (!granted) {
        Alert.alert("Camera Permission", "Please enable camera access.", [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
        ]);
    }
  };

  const handleSignatureOK = (signature) => {
    const cleanBase64 = signature.replace("data:image/png;base64,", "");
    sendToBrain(cleanBase64);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
        qualityPrioritization: 'balanced',
      });
      const base64 = await RNFS.readFile(photo.path, 'base64');
      sendToBrain(base64);
    } catch (e) {
      console.error("Camera Error:", e);
      Alert.alert("Error", "Could not capture image.");
    }
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
      // Automatically switch back to 'draw' mode to show results cleanly
      setMode("draw"); 
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Archie couldn't analyze that.");
    } finally {
      setLoading(false);
    }
  };

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.permissionText}>Archie needs camera access.</Text>
        <TouchableOpacity onPress={handlePermissionRequest} style={styles.btn}>
           <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      {/* 1. HEADER (Now with Z-Index to stay on top of Camera) */}
      <SafeAreaView edges={['top']} style={styles.header}>
          <Text style={styles.title}>👁️ Archie Vision</Text>
          <View style={styles.tabs}>
              <TouchableOpacity 
                onPress={() => { setMode("draw"); setResult(null); }} 
                style={[styles.tab, mode==="draw" && styles.activeTab]}
              >
                  <Text style={mode==="draw" ? styles.activeText : styles.text}>✏️ Draw</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => { setMode("camera"); setResult(null); }} 
                style={[styles.tab, mode==="camera" && styles.activeTab]}
              >
                  <Text style={mode==="camera" ? styles.activeText : styles.text}>📸 Camera</Text>
              </TouchableOpacity>
          </View>
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
          // --- INPUT VIEW ---
          <>
            {mode === "draw" ? (
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
            ) : (
                <View style={{flex: 1, backgroundColor: '#000', overflow:'hidden'}}>
                   {device ? (
                    <>
                      <Camera 
                        style={StyleSheet.absoluteFill} 
                        device={device} 
                        isActive={mode === "camera" && !result} 
                        photo={true} 
                        ref={cameraRef} 
                      />
                      
                      {/* CLOSE BUTTON (Backup way to exit camera) */}
                      <TouchableOpacity 
                          style={styles.closeCameraBtn} 
                          onPress={() => setMode("draw")}
                      >
                          <Text style={styles.closeCameraText}>✕</Text>
                      </TouchableOpacity>

                      {/* CAMERA CONTROLS */}
                      <View style={styles.cameraControls}>
                          <TouchableOpacity style={styles.snapBtn} onPress={takePicture}>
                              <View style={styles.snapInner} />
                          </TouchableOpacity>
                      </View>
                    </>
                   ) : <Text style={styles.centerText}>No Camera Device</Text>}
                </View>
            )}
          </>
        )}

        {/* LOADING OVERLAY */}
        {loading && (
            <View style={styles.overlay}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Archie is thinking...</Text>
            </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  
  // Header - Added Z-Index and Elevation to stay above Camera
  header: { 
    backgroundColor: COLORS.sidebar, 
    borderBottomWidth: 1, 
    borderColor: COLORS.border, 
    paddingBottom: 10,
    zIndex: 20, 
    elevation: 20 
  },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginVertical: 10, color: COLORS.text },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.inputBg, borderRadius: 8, marginHorizontal: 20, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: COLORS.sidebar },
  text: { fontWeight: '500', color: COLORS.subText, fontSize: 14 },
  activeText: { fontWeight: 'bold', color: COLORS.text, fontSize: 14 },
  
  content: { flex: 1 },
  permissionText: { color: COLORS.text, marginBottom: 20, fontSize: 16 },
  centerText: { color: COLORS.subText, alignSelf: 'center', marginTop: 100 },

  // Canvas
  canvasContainer: { flex: 1, margin: 15, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  controls: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 30 },
  clearBtn: { padding: 15 },
  clearText: { color: COLORS.danger, fontWeight: '600' },
  solveBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 40, borderRadius: 25 },
  
  // Camera
  cameraControls: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center' },
  snapBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFF' },
  snapInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF' },
  
  // Close Camera Button
  closeCameraBtn: {
      position: 'absolute',
      top: 20,
      left: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 30
  },
  closeCameraText: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },

  // Common Buttons
  btn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  
  // Loading
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(52, 53, 65, 0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 50 },
  loadingText: { color: COLORS.text, marginTop: 15, fontSize: 16, fontWeight: '500' },

  // Results
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