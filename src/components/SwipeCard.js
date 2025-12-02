import React, { useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Dimensions, 
  Animated, 
  PanResponder 
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const CARD_HEIGHT = 420;

const COLORS = {
  card: "#202123",
  text: "#ECECF1",
  subText: "#ACACBE",
  primary: "#10a37f",
  border: "rgba(255,255,255,0.1)",
  tagBg: "rgba(16, 163, 127, 0.2)",
  divider: "rgba(255,255,255,0.05)"
};

const SwipeCard = ({ data, onSwipeLeft, onSwipeRight, index }) => {
  const position = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: 0 });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) forceSwipe('right');
        else if (gesture.dx < -SWIPE_THRESHOLD) forceSwipe('left');
        else resetPosition();
      },
    })
  ).current;

  const forceSwipe = (direction) => {
    const x = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 250,
      useNativeDriver: true,
    }).start(() => direction === 'right' ? onSwipeRight(index) : onSwipeLeft(index));
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 5,
      useNativeDriver: true,
    }).start();
  };

  const getCardStyle = () => {
    const rotate = position.x.interpolate({
      inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
      outputRange: ['-120deg', '0deg', '120deg'],
    });

    return {
      transform: [{ translateX: position.x }, { rotate }],
    };
  };

  return (
    <Animated.View
      style={[styles.card, getCardStyle()]}
      {...panResponder.panHandlers}
    >
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.label}>QUESTION</Text>
          <View style={styles.tagContainer}>
            <Text style={styles.tagText}>{data.tag || "Concept"}</Text>
          </View>
        </View>
        
        <Text style={styles.question}>{data.front}</Text>
        <View style={styles.divider} />
        
        <Text style={styles.label}>ANSWER</Text>
        <Text style={styles.answer}>{data.back}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: SCREEN_WIDTH - 40,
    height: CARD_HEIGHT,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    position: 'absolute',
    alignSelf: 'center',
    top: '50%', 
    marginTop: -(CARD_HEIGHT / 2),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 10
  },
  content: { padding: 24, flex: 1, justifyContent: 'center' },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  label: { 
    fontSize: 12,
    fontWeight: '800', 
    color: COLORS.subText, 
    letterSpacing: 1,
    textTransform: 'uppercase' 
  },
  question: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 24, lineHeight: 32 },
  answer: { fontSize: 18, fontWeight: '500', color: COLORS.text, lineHeight: 26 },
  divider: { height: 1, backgroundColor: COLORS.divider, marginVertical: 24 },
  tagContainer: { 
    backgroundColor: COLORS.tagBg, 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 12,
    justifyContent: 'center', // Fix vertical alignment of text container
    alignItems: 'center'
  },
  tagText: { 
    color: COLORS.primary, 
    fontWeight: '700', 
    fontSize: 11,
    textTransform: 'uppercase',
    includeFontPadding: false, // Fix vertical alignment of text on Android
    textAlignVertical: 'center' // Fix vertical alignment of text on Android
  }
});

export default SwipeCard;