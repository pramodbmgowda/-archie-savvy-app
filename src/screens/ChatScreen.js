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
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera'; // 📸 Added Camera
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
            qualityPrioritization: 'balanced', // or 'speed'
        });
        
        // Read file as base64
        const base64 = await RNFS.readFile(photo.path, 'base64');
        
        // Add to draft files (ChatGPT Style: Attach to input)
        const newFile = {
            id: uid('img'),
            name: `Photo_${Date.now()}.jpg`,
            type: 'image',
            uri: `file://${photo.path}`, // For preview
            data: base64 // For API
        };

        setDraftFiles(prev => [...prev, newFile]);
        setCameraVisible(false); // Close camera
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
    setChatHistory(msgs && msgs.length > 0 ? msgs : [{
      id: uid(), role: 'model', text: "Hi! I'm Archie. Upload a PDF, take a photo, or ask me anything.", sent: true
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

  // --- ACTIONS (Copy, Edit) ---
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
            {!isUser && <View style={styles.avatarWrap}><Text style={styles.avatar}>🤖</Text></View>}
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
                {item.files && item.files.length > 0 && (
                    <View style={styles.bubbleFiles}>
                        {item.files.map(f => (
                            <View key={f.id} style={styles.fileChip}>
                                <Text style={styles.fileIcon}>{f.type === 'pdf' ? '📄' : '🖼️'}</Text>