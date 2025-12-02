import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';

import ChatScreen from '../screens/ChatScreen';
import FlashcardScreen from '../screens/FlashcardScreen';
import ArchieScreen from '../screens/ArchieScreen';

const Tab = createBottomTabNavigator();

// --- UNIFIED DARK THEME ---
// Matches the Sidebar color from ChatScreen for a seamless look
const COLORS = {
  background: "#202123", // Dark Tab Bar Background
  activeBg: "#343541",   // Slightly lighter for active pill
  primary: "#10a37f",    // ChatGPT Green
  text: "#ECECF1",
  subText: "#ACACBE",
  border: "rgba(255,255,255,0.1)"
};

const TabNavigator = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarShowLabel: false,
          // Hide keyboard on Android when typing
          tabBarHideOnKeyboard: true, 
          tabBarIcon: ({ focused }) => {
            let icon = "";
            let label = "";

            if (route.name === 'Chat') {
              icon = "💬";
              label = "Tutor";
            } else if (route.name === 'Flashcards') {
              icon = "🗂️";
              label = "Decks";
            } else if (route.name === 'Archie') {
              icon = "👁️";
              label = "Vision";
            }

            return (
              <View style={[styles.iconContainer, focused && styles.activeIcon]}>
                <Text style={styles.emoji}>{icon}</Text>
                {focused && <Text style={styles.label}>{label}</Text>}
              </View>
            );
          },
        })}
      >
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Archie" component={ArchieScreen} />
        <Tab.Screen name="Flashcards" component={FlashcardScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.background,
    height: Platform.OS === 'ios' ? 90 : 70, 
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    elevation: 0, // Flat look matches modern dark apps
    shadowOpacity: 0, // Remove shadow for flat dark theme
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
  },
  activeIcon: {
    backgroundColor: COLORS.activeBg,
    width: 'auto', // Allow width to expand for label
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 22,
    color: COLORS.text
  },
  label: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary, // Green text for active state
  }
});

export default TabNavigator;