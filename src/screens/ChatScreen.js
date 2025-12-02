import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Alert,
  Keyboard, Animated, Dimensions
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pick, types } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import { StorageService } from '../services/storage';

// -------- CONFIG ----------
const API_URL = "https://archie-savvy-app.onrender.com/chatWithTutor";
const COLORS = {
  background: "#343541",
  sidebar: "#202123",
  inputBg: "#40414F",
  userBubble: "#343541", 
  aiBubble: "#444654",   
  text: "#ECECF1",
  subText: "#ACACBE",
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
        setAllSessions(sessions || []);
        if (sessions && sessions.length > 0) loadSession(sessions[0]);
        else createNewSession();
      } catch (err) { await createNewSession(); }
    };
    init();
  }, []);

  useEffect(() => {
    if (currentSession && chatHistory.length > 0) {
      StorageService.saveSessionMessages(currentSession.id, chatHistory).catch(()=>{});
    }
  }, [chatHistory, currentSession]);

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
    setChatHistory(msgs && msgs.length > 0 ? msgs : [{
      id: uid(), role: 'model', text: "Hi! I'm Archie. Upload a PDF or ask me anything.", sent: true
    }]);
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

  // --- ACTIONS (Copy, Edit, Delete) ---
  const handleCopy = (text) => {
      Clipboard.setString(text); 
      setActiveMessageId(null); 
  };

  const handleEdit = (item) => {
      setMessage(item.text); 
      setEditingMsgId(item.id); 
      setActiveMessageId(null); 
  };

  const cancelEdit = () => {
      setMessage('');
      setEditingMsgId(null);
      Keyboard.dismiss();
  };

  const handleDeleteMessage = () => {
      // Logic handled via long press or menu if needed, but not exposed in tap menu for simplicity
      // Keeping generic handler structure if you want to add it back
  };

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

    // ... (Edit logic remains the same) ...
    // 🅰️ EDIT MODE
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
    } 
    // 🅱️ NEW MESSAGE
    else {
        userMessage = {
            id: uid(),
            role: 'user',
            text: message.trim(),
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

      // ✅ FIX IS HERE: Increased limit to 3 to account for Greeting + User Msg + AI Msg
      // We check if the session title is still the default "New Chat"
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

  // --- GENERATE TITLE (Improved Safety) ---
  const generateTitle = (text) => {
      // Don't generate titles for very short messages (like "Hi")
      if (!text || text.length < 2) return;

      fetch(API_URL, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ action: "generate_title", message: text })
      }).then(r => r.json()).then(d => {
        if(d.title && currentSession) {
            // Clean title (remove quotes if AI adds them)
            const cleanTitle = d.title.replace(/"/g, '').trim();
            
            setAllSessions(prev => prev.map(s => s.id === currentSession.id ? {...s, title: cleanTitle} : s));
            setCurrentSession(prev => ({ ...prev, title: cleanTitle }));
            StorageService.updateSessionMeta(currentSession.id, cleanTitle).catch(()=>{});
        }
      }).catch(e => console.log("Title generation failed silently", e));
  };
  // --- RENDER BUBBLE ---
  const renderBubble = ({ item }) => {
    const isUser = item.role === 'user';
    const isActive = activeMessageId === item.id;

    return (
      <View style={{ marginBottom: 20 }}>
          <TouchableOpacity 
            activeOpacity={0.9}
            // ⚡ Toggle Actions on Tap
            onPress={() => setActiveMessageId(isActive ? null : item.id)} 
            style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI]}
          >
            {!isUser && <View style={styles.avatarWrap}><Text style={styles.avatar}>🤖</Text></View>}
            
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
                {item.files && item.files.length > 0 && (
                    <View style={styles.bubbleFiles}>
                        {item.files.map(f => (
                            <View key={f.id} style={styles.fileChip}>
                                <Text style={styles.fileIcon}>{f.type === 'pdf' ? '📄' : '🖼️'}</Text>
                                <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                            </View>
                        ))}
                    </View>
                )}
                {/* ⚡ Selectable Text */}
                {item.text ? (
                    <Text 
                        style={styles.text} 
                        selectable={true} 
                        selectionColor={COLORS.primary} 
                    >
                        {item.text}
                    </Text>
                ) : null}
            </View>
          </TouchableOpacity>

          {/* ⚡ Action Toolbar */}
          {isActive && (
              <View style={[styles.actionRow, isUser ? { justifyContent: 'flex-end', paddingRight: 10 } : { justifyContent: 'flex-start', paddingLeft: 50 }]}>
                  <TouchableOpacity onPress={() => handleCopy(item.text)} style={styles.actionBtn}>
                      <Text style={styles.actionBtnText}>❐ Copy All</Text>
                  </TouchableOpacity>
                  {isUser && (
                      <TouchableOpacity onPress={() => handleEdit(item)} style={[styles.actionBtn, { marginLeft: 15 }]}>
                          <Text style={styles.actionBtnText}>✎ Edit</Text>
                      </TouchableOpacity>
                  )}
              </View>
          )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      
      {/* 1. HEADER */}
      <View style={styles.header}>
         <TouchableOpacity onPress={() => toggleSidebar(true)} style={styles.iconBtn}>
            <Text style={styles.menuIcon}>☰</Text>
         </TouchableOpacity>
         <View style={{flex:1, alignItems:'center'}}>
            <Text numberOfLines={1} style={styles.headerTitle}>{currentSession?.title || "New Chat"}</Text>
         </View>
         <TouchableOpacity onPress={() => setShowChatSettings(true)} style={styles.iconBtn}>
            <Text style={styles.menuIcon}>⋮</Text> 
         </TouchableOpacity>
      </View>

      {/* 2. CHAT AREA */}
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        // 🚨 CRITICAL FIX: "height" for Android adjustResize
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <FlatList 
            ref={flatListRef}
            // 🚨 CRITICAL FIX: Inverted List (Bottom-to-Top)
            data={[...chatHistory].reverse()} 
            renderItem={renderBubble}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            inverted={true} 
            keyboardDismissMode="on-drag" 
            keyboardShouldPersistTaps="handled"
        />

        {/* INPUT */}
        <View style={styles.inputWrapper}>
            {draftFiles.length > 0 && (
                <View style={styles.innerDraftList}>
                    {draftFiles.map(f => (
                        <View key={f.id} style={styles.draftChip}>
                            <Text style={styles.draftIcon}>{f.type === 'pdf' ? '📄' : '🖼️'}</Text>
                            <Text numberOfLines={1} style={styles.draftName}>{f.name}</Text>
                            <TouchableOpacity onPress={() => setDraftFiles(p => p.filter(x => x.id !== f.id))}>
                                <Text style={styles.delIcon}>✕</Text>
                            </TouchableOpacity>
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
                <TouchableOpacity onPress={handleAttachFiles} style={styles.attachBtn}>
                    {isUploading ? <ActivityIndicator color="#ccc" /> : <Text style={styles.attachIcon}>＋</Text>}
                </TouchableOpacity>
                <TextInput 
                    style={styles.input} 
                    value={message} onChangeText={setMessage} 
                    placeholder={editingMsgId ? "Edit your message..." : "Message..."}
                    placeholderTextColor="#8e8ea0"
                    multiline
                />
                <TouchableOpacity onPress={sendMessage} style={[styles.sendBtn, (!message && draftFiles.length===0) && styles.disabledBtn]}>
                    {loading ? <ActivityIndicator size="small" color="#FFF"/> : <Text style={styles.sendText}>
                        {editingMsgId ? "✓" : "↑"}
                    </Text>}
                </TouchableOpacity>
            </View>
        </View>
      </KeyboardAvoidingView>

      {/* 3. SIDEBAR */}
      {isSidebarOpen && (
        <View style={styles.absoluteFill}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => toggleSidebar(false)} />
            <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
                <TouchableOpacity style={styles.newChatBtn} onPress={createNewSession}>
                    <Text style={styles.newChatText}>+ New Chat</Text>
                </TouchableOpacity>
                <Text style={styles.sidebarLabel}>History</Text>
                <FlatList
                    data={allSessions}
                    keyExtractor={item => item.id}
                    renderItem={({item}) => (
                        <TouchableOpacity 
                            style={[styles.histItem, item.id === currentSession?.id && styles.activeHistItem]} 
                            onPress={() => loadSession(item)}
                        >
                            <Text style={styles.histText} numberOfLines={1}>{item.title}</Text>
                        </TouchableOpacity>
                    )}
                />
            </Animated.View>
        </View>
      )}

      {/* MODALS */}
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

// --- STYLES ---
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
  
  // 🚨 FIXED LIST PADDING FOR INVERTED MODE
  list: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 20 },
  
  bubbleRow: { flexDirection: 'row', marginBottom: 5 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAI: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 12 },
  bubbleUser: { backgroundColor: COLORS.primary },
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
  attachBtn: { padding: 10 }, attachIcon: { fontSize: 24, color: '#ccc' },
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
  saveText: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold' }
});

export default ChatScreen;