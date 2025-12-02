import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Alert,
  Keyboard, Animated, Dimensions, StatusBar
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pick, types } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { StorageService } from '../services/storage';

// -------- CONFIG ----------
// ⚡ Replace with your actual Render URL
const API_URL = "https://archie-savvy-app.onrender.com/chatWithTutor";

// --- CHATGPT THEME COLORS ---
const COLORS = {
  background: "#343541",   // Main App Background (Dark)
  sidebar: "#202123",      // Sidebar Background (Darker)
  inputBg: "#40414F",      // Input Field Background
  
  // Bubbles
  userBubble: "#10a37f",   // ChatGPT Green for User
  aiBubble: "#444654",     // Lighter Grey for AI (Classic ChatGPT Web Look)
  
  text: "#ECECF1",         // Main Text Color (Off-White)
  subText: "#ACACBE",      // Secondary Text
  border: "rgba(255,255,255,0.1)",
  primary: "#10a37f",
  danger: "#ef4444",
  overlay: "rgba(0,0,0,0.6)"
};

const { width } = Dimensions.get('window');
const SIDEBAR_WIDTH = width * 0.75;
const uid = (prefix = '') => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2,9)}`;

const ChatScreen = () => {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [draftFiles, setDraftFiles] = useState([]); 
  const [isUploading, setIsUploading] = useState(false);
  const [allSessions, setAllSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  
  // --- CAMERA STATE ---
  const [isCameraVisible, setCameraVisible] = useState(false);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef(null);

  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameText, setRenameText] = useState('');

  // ⚡ Message Options State
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [editingMsgId, setEditingMsgId] = useState(null);

  const flatListRef = useRef();

  // --- INIT & STORAGE ---
  useEffect(() => {
    const init = async () => {
      try {
        const sessions = await StorageService.getAllSessions();
        const validSessions = (sessions || []).filter(s => s.title !== "DELETED");
        
        // Always start fresh (ChatGPT style)
        const newSession = await StorageService.createSession();

        setAllSessions([newSession, ...validSessions]);
        loadSession(newSession);

      } catch (err) { 
        await createNewSession(); 
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (currentSession && chatHistory.length > 0 && currentSession.title !== "DELETED") {
      StorageService.saveSessionMessages(currentSession.id, chatHistory).catch(()=>{});
    }
  }, [chatHistory, currentSession]);

  // --- CAMERA LOGIC ---
  const handleCameraLaunch = async () => {
    if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
            Alert.alert("Permission Denied", "Camera access is needed to take photos.");
            return;
        }
    }
    setCameraVisible(true);
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
        const photo = await cameraRef.current.takePhoto({
            flash: 'off',
            enableShutterSound: false,
            qualityPrioritization: 'balanced', 
        });
        const base64 = await RNFS.readFile(photo.path, 'base64');
        
        const newFile = {
            id: uid('img'),
            name: `Photo_${Date.now()}.jpg`,
            type: 'image',
            uri: `file://${photo.path}`, 
            data: base64
        };
        setDraftFiles(prev => [...prev, newFile]);
        setCameraVisible(false);
    } catch (e) {
        console.error("Camera Error:", e);
        Alert.alert("Error", "Could not capture image.");
    }
  };

  // --- SIDEBAR & SESSION LOGIC ---
  const toggleSidebar = (open) => {
    if (open) {
      setSidebarOpen(true);
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: -SIDEBAR_WIDTH, duration: 200, useNativeDriver: true }).start(() => setSidebarOpen(false));
    }
  };

  const createNewSession = async () => {
    toggleSidebar(false);
    const newSession = await StorageService.createSession();
    setAllSessions(prev => [newSession, ...prev]);
    loadSession(newSession);
  };

  const loadSession = async (session) => {
    toggleSidebar(false);
    setCurrentSession(session);
    setDraftFiles([]); setMessage('');
    setEditingMsgId(null);
    const msgs = await StorageService.loadSessionMessages(session.id);
    
    // Start empty (No "Hi I'm Archie" message)
    setChatHistory(msgs && msgs.length > 0 ? msgs : []); 
  };

  const deleteCurrentSession = async () => {
    if (!currentSession) return;
    Alert.alert("Delete Chat", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
            const id = currentSession.id;
            const remaining = allSessions.filter(s => s.id !== id);
            setAllSessions(remaining);
            await StorageService.updateSessionMeta(id, "DELETED").catch(()=>{});
            setShowChatSettings(false);
            if (remaining.length > 0) loadSession(remaining[0]);
            else createNewSession();
        }}
    ]);
  };

  const saveRename = async () => {
    if (currentSession && renameText.trim()) {
        await StorageService.updateSessionMeta(currentSession.id, renameText, null).catch(()=>{});
        setAllSessions(prev => prev.map(s => s.id === currentSession.id ? { ...s, title: renameText } : s));
        setCurrentSession(prev => ({ ...prev, title: renameText }));
        setRenameModalVisible(false);
    }
  };

  // --- ACTIONS ---
  const handleCopy = (text) => { Clipboard.setString(text); setActiveMessageId(null); };
  const handleEdit = (item) => { setMessage(item.text); setEditingMsgId(item.id); setActiveMessageId(null); };
  const cancelEdit = () => { setMessage(''); setEditingMsgId(null); Keyboard.dismiss(); };

  // --- ATTACH FILES ---
  const handleAttachFiles = async () => {
    try {
      setIsUploading(true);
      const results = await pick({ type: [types.pdf, types.images], allowMultiSelection: true });
      if (!results) { setIsUploading(false); return; }
      const newFiles = [];
      for (const file of results) {
          if (file.size && file.size > 10 * 1024 * 1024) { Alert.alert("Too Large", "Max 10MB"); continue; }
          const base64 = await RNFS.readFile(file.uri, 'base64');
          newFiles.push({ id: uid(), name: file.name, type: file.type?.includes('pdf') || file.name.endsWith('.pdf') ? 'pdf' : 'image', uri: file.uri, data: base64 });
      }
      setDraftFiles(prev => [...prev, ...newFiles]);
    } catch (err) { if (err?.code !== 'DOCUMENT_PICKER_CANCELED') Alert.alert('Error', 'Attachment failed.'); } 
    finally { setIsUploading(false); }
  };

  // --- SEND MESSAGE ---
  const sendMessage = async () => {
    if ((!message.trim()) && draftFiles.length === 0) return;

    let updatedHistory = [...chatHistory];
    let userMessage;

    if (editingMsgId) {
        const editIndex = chatHistory.findIndex(m => m.id === editingMsgId);
        if (editIndex === -1) { cancelEdit(); return; }
        userMessage = {
            ...chatHistory[editIndex],
            text: message.trim(),
            files: draftFiles.length > 0 ? draftFiles.map(f=>({id:f.id, name:f.name, type:f.type, uri:f.uri})) : chatHistory[editIndex].files
        };
        updatedHistory = chatHistory.slice(0, editIndex);
        updatedHistory.push(userMessage);
    } else {
        userMessage = {
            id: uid(), role: 'user', text: message.trim(),
            files: draftFiles.map(f => ({ id: f.id, name: f.name, type: f.type, uri: f.uri })), 
            sent: true,
        };
        updatedHistory.push(userMessage);
    }

    const apiFiles = draftFiles.map(f => ({ name: f.name, type: f.type, data: f.data }));

    setChatHistory(updatedHistory);
    setMessage('');
    setDraftFiles([]);
    setEditingMsgId(null); 
    Keyboard.dismiss();
    setLoading(true);

    try {
      const contextHistory = updatedHistory.slice(-15).map(m => ({ role: m.role, text: m.text || "" }));
      
      const response = await fetch(API_URL, {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            action: "chat",
            message: userMessage.text,
            history: contextHistory,
            files: apiFiles,
            activeFileUris: currentSession?.activeFileUris || [] 
        })
      });

      const data = await response.json();
      if (data.activeFileUris) {
         setCurrentSession(prev => ({ ...prev, activeFileUris: data.activeFileUris }));
         StorageService.updateSessionMeta(currentSession.id, null, data.activeFileUris).catch(()=>{});
      }
      setChatHistory(prev => [...prev, { id: uid(), role: 'model', text: data.text, sent: true }]);

      if (currentSession?.title === "New Chat" || updatedHistory.length <= 3) {
          generateTitle(userMessage.text);
      }
    } catch (error) {
      console.error(error);
      setChatHistory(prev => [...prev, { id: uid(), role: 'model', text: "⚠️ Server Error." }]);
    } finally {
      setLoading(false);
    }
  };

  const generateTitle = (text) => {
      if (!text || text.length < 2) return;
      fetch(API_URL, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ action: "generate_title", message: text })
      }).then(r => r.json()).then(d => {
        if(d.title && currentSession) {
            const cleanTitle = d.title.replace(/"/g, '').trim();
            setAllSessions(prev => prev.map(s => s.id === currentSession.id ? {...s, title: cleanTitle} : s));
            setCurrentSession(prev => ({ ...prev, title: cleanTitle }));
            StorageService.updateSessionMeta(currentSession.id, cleanTitle).catch(()=>{});
        }
      }).catch(e => console.log("Title generation failed silently", e));
  };

  const renderBubble = ({ item }) => {
    const isUser = item.role === 'user';
    const isActive = activeMessageId === item.id;

    return (
      <View style={{ marginBottom: 20 }}>
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={() => setActiveMessageId(isActive ? null : item.id)} 
            style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI]}
          >
            {/* Avatar for AI */}
            {!isUser && (
                <View style={styles.avatarWrap}>
                    <Text style={styles.avatar}>🤖</Text>
                </View>
            )}
            
            {/* Message Bubble */}
            <View style={[
                styles.bubble, 
                isUser ? styles.bubbleUser : styles.bubbleAi,
                // If it's AI, ensure no white background
                !isUser && { backgroundColor: COLORS.aiBubble } 
            ]}>
                {item.files && item.files.length > 0 && (
                    <View style={styles.bubbleFiles}>
                        {item.files.map(f => (
                            <View key={f.id} style={styles.fileChip}>
                                <Text style={styles.fileIcon}>{f.type === 'pdf' ? '\uD83D\uDCC4' : '\uD83D\uDDBC'}</Text>
                                <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                            </View>
                        ))}
                    </View>
                )}
                {item.text ? (
                    <Text 
                        style={[styles.text, { color: COLORS.text }]} 
                        selectable={true} 
                        selectionColor={COLORS.primary}
                    >
                        {item.text}
                    </Text>
                ) : null}
            </View>
          </TouchableOpacity>
          {isActive && (
              <View style={[styles.actionRow, isUser ? { justifyContent: 'flex-end', paddingRight: 10 } : { justifyContent: 'flex-start', paddingLeft: 50 }]}>
                  <TouchableOpacity onPress={() => handleCopy(item.text)} style={styles.actionBtn}><Text style={styles.actionBtnText}>❐ Copy All</Text></TouchableOpacity>
                  {isUser && <TouchableOpacity onPress={() => handleEdit(item)} style={[styles.actionBtn, { marginLeft: 15 }]}><Text style={styles.actionBtnText}>✎ Edit</Text></TouchableOpacity>}
              </View>
          )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      {/* HEADER */}
      <View style={styles.header}>
         <TouchableOpacity onPress={() => toggleSidebar(true)} style={styles.iconBtn}><Text style={styles.menuIcon}>☰</Text></TouchableOpacity>
         <View style={{flex:1, alignItems:'center'}}><Text numberOfLines={1} style={styles.headerTitle}>{currentSession?.title || "New Chat"}</Text></View>
         <TouchableOpacity onPress={() => setShowChatSettings(true)} style={styles.iconBtn}><Text style={styles.menuIcon}>⋮</Text></TouchableOpacity>
      </View>

      {/* CHAT LIST */}
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <FlatList 
            ref={flatListRef}
            data={[...chatHistory].reverse()} 
            renderItem={renderBubble}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            inverted={true} 
            keyboardDismissMode="on-drag" 
            keyboardShouldPersistTaps="handled"
        />

        {/* INPUT AREA */}
        <View style={styles.inputWrapper}>
            {draftFiles.length > 0 && (
                <View style={styles.innerDraftList}>
                    {draftFiles.map(f => (
                        <View key={f.id} style={styles.draftChip}>
                            <Text style={styles.draftIcon}>{f.type === 'pdf' ? '\uD83D\uDCC4' : '\uD83D\uDDBC'}</Text>
                            <Text numberOfLines={1} style={styles.draftName}>{f.name}</Text>
                            <TouchableOpacity onPress={() => setDraftFiles(p => p.filter(x => x.id !== f.id))}><Text style={styles.delIcon}>✕</Text></TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}
            
            {editingMsgId && (
                <View style={styles.editIndicator}>
                    <Text style={{color: COLORS.primary, fontWeight:'bold', fontSize:12}}>✎ Editing Message</Text>
                    <TouchableOpacity onPress={cancelEdit}><Text style={{color: COLORS.danger, fontWeight:'bold', fontSize:12}}>Cancel</Text></TouchableOpacity>
                </View>
            )}

            <View style={styles.inputContainer}>
                <TouchableOpacity onPress={handleCameraLaunch} style={styles.iconBtnSmall}>
                    <Text style={styles.attachIcon}>📸</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleAttachFiles} style={styles.iconBtnSmall}>
                    {isUploading ? <ActivityIndicator color="#ccc" /> : <Text style={styles.attachIcon}>＋</Text>}
                </TouchableOpacity>

                <TextInput 
                    style={styles.input} 
                    value={message} onChangeText={setMessage} 
                    placeholder={editingMsgId ? "Edit..." : "Message..."}
                    placeholderTextColor="#8e8ea0"
                    multiline
                />
                <TouchableOpacity onPress={sendMessage} style={[styles.sendBtn, (!message && draftFiles.length===0) && styles.disabledBtn]}>
                    {loading ? <ActivityIndicator size="small" color="#FFF"/> : <Text style={styles.sendText}>{editingMsgId ? "✓" : "↑"}</Text>}
                </TouchableOpacity>
            </View>
        </View>
      </KeyboardAvoidingView>

      {/* SIDEBAR */}
      {isSidebarOpen && (
        <View style={styles.absoluteFill}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => toggleSidebar(false)} />
            <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
                <TouchableOpacity style={styles.newChatBtn} onPress={createNewSession}><Text style={styles.newChatText}>+ New Chat</Text></TouchableOpacity>
                <Text style={styles.sidebarLabel}>History</Text>
                <FlatList
                    data={allSessions}
                    keyExtractor={item => item.id}
                    renderItem={({item}) => (
                        <TouchableOpacity style={[styles.histItem, item.id === currentSession?.id && styles.activeHistItem]} onPress={() => loadSession(item)}>
                            <Text style={styles.histText} numberOfLines={1}>{item.title}</Text>
                        </TouchableOpacity>
                    )}
                />
            </Animated.View>
        </View>
      )}

      {/* CAMERA MODAL */}
      <Modal visible={isCameraVisible} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.cameraContainer}>
            {device ? (
                <Camera
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={isCameraVisible}
                    photo={true}
                    ref={cameraRef}
                />
            ) : <View style={styles.center}><Text style={{color:'white'}}>No Device</Text></View>}

            <TouchableOpacity style={styles.closeCamBtn} onPress={() => setCameraVisible(false)}>
                <Text style={styles.closeCamText}>✕</Text>
            </TouchableOpacity>

            <View style={styles.cameraControls}>
                 <TouchableOpacity style={styles.snapBtn} onPress={takePhoto}>
                     <View style={styles.snapInner} />
                 </TouchableOpacity>
            </View>
        </View>
      </Modal>

      {/* RENAME MODAL */}
      <Modal visible={renameModalVisible} transparent animationType="fade">
          <View style={styles.centerOverlay}>
              <View style={styles.dialogBox}>
                  <Text style={styles.dialogTitle}>Rename Chat</Text>
                  <TextInput value={renameText} onChangeText={setRenameText} style={styles.dialogInput} autoFocus />
                  <View style={styles.dialogButtons}>
                      <TouchableOpacity onPress={() => setRenameModalVisible(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                      <TouchableOpacity onPress={saveRename}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>
      
      {/* SETTINGS MODAL */}
      <Modal visible={showChatSettings} transparent animationType="fade">
         <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowChatSettings(false)}>
             <View style={styles.settingsBox}>
                 <TouchableOpacity style={styles.settingRow} onPress={() => { setShowChatSettings(false); setRenameText(currentSession?.title); setRenameModalVisible(true); }}>
                     <Text style={styles.settingText}>✎  Rename Chat</Text>
                 </TouchableOpacity>
                 <View style={styles.divider} />
                 <TouchableOpacity style={styles.settingRow} onPress={deleteCurrentSession}>
                     <Text style={[styles.settingText, {color: COLORS.danger}]}>🗑️  Delete Chat</Text>
                 </TouchableOpacity>
             </View>
         </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 100 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  headerTitle: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
  menuIcon: { fontSize: 24, color: COLORS.text, paddingHorizontal: 5 },
  iconBtn: { padding: 5 },
  sidebar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_WIDTH, backgroundColor: COLORS.sidebar, padding: 20, paddingTop: 60, zIndex: 101 },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 6, marginBottom: 20 },
  newChatText: { color: COLORS.text, flex: 1 },
  sidebarLabel: { color: COLORS.subText, fontSize: 12, marginBottom: 10, fontWeight:'bold' },
  histItem: { padding: 12, borderRadius: 6, marginBottom: 4 },
  activeHistItem: { backgroundColor: '#343541' },
  histText: { color: COLORS.text },
  list: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 20 },
  bubbleRow: { flexDirection: 'row', marginBottom: 5 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAI: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 12 },
  bubbleUser: { backgroundColor: COLORS.userBubble },
  bubbleAi: { backgroundColor: COLORS.aiBubble },
  text: { color: COLORS.text, fontSize: 16, lineHeight: 24 },
  avatarWrap: { marginRight: 8, marginTop: 4 }, avatar: { fontSize: 20 },
  bubbleFiles: { marginBottom: 8 },
  fileChip: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', padding: 6, borderRadius: 6, marginBottom: 4, alignItems: 'center' },
  fileIcon: { marginRight: 6 }, fileName: { color: '#eee', fontSize: 13 },
  actionRow: { flexDirection: 'row', marginTop: 2, marginBottom: 15 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', padding: 5 },
  actionBtnText: { color: COLORS.subText, fontSize: 12, fontWeight: '600' },
  inputWrapper: { padding: 10, backgroundColor: COLORS.background, borderTopWidth: 1, borderColor: COLORS.border },
  innerDraftList: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 10 },
  draftChip: { flexDirection: 'row', backgroundColor: '#444654', padding: 6, borderRadius: 10, marginRight: 8, marginBottom: 6, alignItems:'center' },
  draftName: { color: '#fff', fontSize: 12, maxWidth: 100 }, delIcon: { color: '#ff6666', marginLeft: 6 },
  editIndicator: { flexDirection:'row', justifyContent:'space-between', marginBottom: 5, paddingHorizontal: 10 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: COLORS.inputBg, borderRadius: 20, padding: 6 },
  iconBtnSmall: { padding: 8, marginRight: 2 },
  attachIcon: { fontSize: 22, color: '#ccc' },
  input: { flex: 1, color: '#fff', maxHeight: 100, fontSize: 16, paddingHorizontal: 10 },
  sendBtn: { padding: 8, backgroundColor: COLORS.primary, borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: 'bold' },
  disabledBtn: { backgroundColor: '#555' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  settingsBox: { position: 'absolute', top: 50, right: 10, backgroundColor: COLORS.sidebar, borderRadius: 12, width: 200, padding: 5, borderWidth: 1, borderColor: COLORS.border, elevation: 5 },
  settingRow: { padding: 15 }, settingText: { color: COLORS.text, fontSize: 16 },
  divider: { height: 1, backgroundColor: COLORS.border },
  centerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  dialogBox: { width: '80%', backgroundColor: COLORS.sidebar, padding: 20, borderRadius: 10 },
  dialogTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  dialogInput: { backgroundColor: COLORS.inputBg, color: COLORS.text, padding: 10, borderRadius: 5, marginBottom: 20 },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  cancelText: { color: '#aaa', fontSize: 16, marginRight: 20 },
  saveText: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold' },
  cameraContainer: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, justifyContent:'center', alignItems:'center' },
  closeCamBtn: { position: 'absolute', top: 50, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center', zIndex:50 },
  closeCamText: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  cameraControls: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  snapBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFF' },
  snapInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF' }
});

export default ChatScreen;