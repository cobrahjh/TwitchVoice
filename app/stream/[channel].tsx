import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  ScrollView,
  PixelRatio,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Only import WebView for native platforms
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}
import * as Speech from 'expo-speech';
import { useAuth } from '../../contexts/AuthContext';
import { TwitchIRC } from '../../services/twitchIRC';
import { ChatMessage } from '../../types/twitch';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PIXEL_RATIO = PixelRatio.get();

// Responsive scaling for different screen sizes
// S25 Ultra has ~3.0 pixel ratio, base iPhone is ~2.0
const baseScale = SCREEN_WIDTH / 375;
const fontScale = Math.min(baseScale, 1.5); // Cap font scaling
const normalize = (size: number) => {
  const newSize = size * fontScale;
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

export default function StreamScreen() {
  const { channel } = useLocalSearchParams<{ channel: string }>();
  const router = useRouter();
  const { accessToken, user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isReadingChat, setIsReadingChat] = useState(true); // Start ON by default
  const [showChat, setShowChat] = useState(true);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  const [speechRate, setSpeechRate] = useState(1.2);
  const [twitchChatHidden, setTwitchChatHidden] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings - all enabled by default
  const [settings, setSettings] = useState({
    autoPlay: true,
    autoUnmute: true,
    playerOnlyMode: true,  // Start in player-only (no Twitch chat)
    ttsEnabled: true,
  });

  // Keyboard shortcuts - customizable
  const [shortcuts, setShortcuts] = useState({
    toggleTTS: 't',
    toggleTwitchChat: 'c',
    toggleOurChat: 'h',
    openSettings: 's',
    voiceInput: 'v',
    back: 'Escape',
  });
  const [showShortcutSettings, setShowShortcutSettings] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Show toast notification
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 1500);
  };

  // Load settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await AsyncStorage.getItem('streamSettings');
        if (saved) {
          setSettings(JSON.parse(saved));
        }
        const savedShortcuts = await AsyncStorage.getItem('keyboardShortcuts');
        if (savedShortcuts) {
          setShortcuts(JSON.parse(savedShortcuts));
        }
      } catch (e) {
        console.log('Failed to load settings');
      }
    };
    loadSettings();
  }, []);

  // Save shortcuts when changed
  const updateShortcut = async (key: keyof typeof shortcuts, value: string) => {
    const newShortcuts = { ...shortcuts, [key]: value.toLowerCase() };
    setShortcuts(newShortcuts);
    try {
      await AsyncStorage.setItem('keyboardShortcuts', JSON.stringify(newShortcuts));
    } catch (e) {
      console.log('Failed to save shortcuts');
    }
  };

  // Keyboard event listener (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Don't trigger if modal is open for editing shortcuts
      if (editingShortcut) return;

      const key = e.key.toLowerCase();

      if (key === shortcuts.toggleTTS) {
        e.preventDefault();
        setIsReadingChat(prev => {
          const newState = !prev;
          showToast(newState ? 'TTS ON' : 'TTS OFF');
          return newState;
        });
      } else if (key === shortcuts.toggleTwitchChat) {
        e.preventDefault();
        setPlayerOnly(prev => {
          const newState = !prev;
          setTwitchChatHidden(newState);
          showToast(newState ? 'Player Only' : 'With Twitch Chat');
          return newState;
        });
      } else if (key === shortcuts.toggleOurChat) {
        e.preventDefault();
        setShowChat(prev => {
          showToast(!prev ? 'Chat ON' : 'Chat OFF');
          return !prev;
        });
      } else if (key === shortcuts.openSettings) {
        e.preventDefault();
        setShowSettings(true);
      } else if (key === shortcuts.voiceInput) {
        e.preventDefault();
        handleVoiceInput();
      } else if (key === shortcuts.back || e.key === 'Escape') {
        e.preventDefault();
        if (showSettings) setShowSettings(false);
        else if (showVoiceSettings) setShowVoiceSettings(false);
        else if (showShortcutSettings) setShowShortcutSettings(false);
        else router.push('/streamers');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, editingShortcut, showSettings, showVoiceSettings, showShortcutSettings]);

  // Save settings when changed
  const updateSetting = async (key: keyof typeof settings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    try {
      await AsyncStorage.setItem('streamSettings', JSON.stringify(newSettings));
    } catch (e) {
      console.log('Failed to save settings');
    }
  };

  const lastReadIndexRef = useRef(0);

  const ircRef = useRef<TwitchIRC | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const webViewRef = useRef<any>(null);

  // Toggle between full site and player-only
  const [playerOnly, setPlayerOnly] = useState(true); // Start with player-only by default

  // Sync settings on load
  useEffect(() => {
    setPlayerOnly(settings.playerOnlyMode);
    setTwitchChatHidden(settings.playerOnlyMode);
    setIsReadingChat(settings.ttsEnabled);
  }, [settings.playerOnlyMode, settings.ttsEnabled]);

  const toggleTwitchChat = () => {
    setPlayerOnly(!playerOnly);
    setTwitchChatHidden(!twitchChatHidden);
  };

  // Get the appropriate URL based on mode
  const getStreamUrl = () => {
    if (playerOnly) {
      // Player-only embed - no chat
      return `https://player.twitch.tv/?channel=${channel}&parent=twitch.tv&muted=false&autoplay=true`;
    }
    return `https://m.twitch.tv/${channel}`;
  };

  useEffect(() => {
    if (!accessToken || !user || !channel) return;

    const irc = new TwitchIRC(accessToken, user.login);
    ircRef.current = irc;

    irc.connect(
      channel,
      (message) => {
        setMessages((prev) => [...prev.slice(-200), message]);
      },
      (connected) => {
        setIsConnected(connected);
      }
    );

    return () => {
      irc.disconnect();
    };
  }, [accessToken, user, channel]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Load available TTS voices
  useEffect(() => {
    if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          setAvailableVoices(voices);
          // Try to find a good default voice (Microsoft or Google natural)
          const preferredIndex = voices.findIndex(v =>
            v.name.includes('Microsoft') && v.name.includes('Natural') ||
            v.name.includes('Google') && v.lang.startsWith('en')
          );
          if (preferredIndex >= 0) setSelectedVoiceIndex(preferredIndex);
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !ircRef.current) return;

    ircRef.current.sendMessage(inputMessage.trim());
    setInputMessage('');
  };

  // Remove consecutive duplicate words (e.g., "lol lol lol" -> "lol")
  const cleanRepeatedWords = (text: string): string => {
    const words = text.split(/\s+/);
    const cleaned: string[] = [];
    for (const word of words) {
      const lastWord = cleaned[cleaned.length - 1];
      if (!lastWord || lastWord.toLowerCase() !== word.toLowerCase()) {
        cleaned.push(word);
      }
    }
    return cleaned.join(' ');
  };

  // TTS: Read chat messages aloud
  const speakMessage = (text: string) => {
    const cleanedText = cleanRepeatedWords(text);

    if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(cleanedText);
      utterance.rate = speechRate;
      utterance.pitch = 1;
      if (availableVoices[selectedVoiceIndex]) {
        utterance.voice = availableVoices[selectedVoiceIndex];
      }
      window.speechSynthesis.speak(utterance);
    } else if (Platform.OS !== 'web') {
      // Mobile TTS using expo-speech
      Speech.speak(cleanedText, {
        rate: speechRate,
        pitch: 1,
        language: 'en-US',
      });
    }
  };

  const toggleReadChat = () => {
    if (isReadingChat) {
      // Stop reading
      if (Platform.OS === 'web' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      } else if (Platform.OS !== 'web') {
        Speech.stop();
      }
      setIsReadingChat(false);
    } else {
      // Start reading - set index to current messages length so we only read NEW messages
      lastReadIndexRef.current = messages.length;
      setIsReadingChat(true);
    }
  };

  // Read new messages when isReadingChat is enabled and TTS is allowed
  useEffect(() => {
    if (isReadingChat && settings.ttsEnabled && messages.length > lastReadIndexRef.current) {
      const newMessages = messages.slice(lastReadIndexRef.current);
      newMessages.forEach((msg) => {
        speakMessage(`${msg.username} says: ${msg.message}`);
      });
      lastReadIndexRef.current = messages.length;
    }
  }, [messages, isReadingChat, settings.ttsEnabled]);

  const handleVoiceInput = async () => {
    setIsListening(true);

    if (Platform.OS === 'web' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setIsListening(false);

        if (transcript && ircRef.current) {
          ircRef.current.sendMessage(transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } else {
      setIsListening(false);
      alert('Voice recognition not available on this platform');
    }
  };

  const getTwitchEmbedHtml = () => {
    // For mobile WebView, use the mobile Twitch site directly
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <iframe
          src="https://m.twitch.tv/${channel}/chat?no-hierarchical-chat=true"
          style="display:none">
        </iframe>
        <iframe
          src="https://player.twitch.tv/?channel=${channel}&parent=twitch.tv&muted=false&autoplay=true&controls=true"
          allowfullscreen
          allow="autoplay; fullscreen; encrypted-media">
        </iframe>
      </body>
      </html>
    `;
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageContainer}>
      <Text style={[styles.username, { color: item.color || '#9147ff' }]}>
        {item.username}:
      </Text>
      <Text style={styles.messageText}> {item.message}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/streamers')}>
          <Ionicons name="arrow-back" size={24} color="#efeff1" />
        </TouchableOpacity>
        <Text style={styles.channelName}>{channel}</Text>
        <View style={styles.headerRight}>
          {/* Voice Input Button */}
          {Platform.OS === 'web' ? (
            <div
              id="header-mic-btn"
              onClick={handleVoiceInput}
              style={{
                padding: 8,
                marginRight: 4,
                borderRadius: 20,
                cursor: 'pointer',
                backgroundColor: isListening ? '#eb0400' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={isListening ? 'radio' : 'mic'}
                size={22}
                color={isListening ? '#fff' : '#efeff1'}
              />
            </div>
          ) : (
            <TouchableOpacity
              style={[styles.headerMicButton, isListening && styles.headerMicButtonActive]}
              onPress={handleVoiceInput}
              accessibilityRole="button"
            >
              <Ionicons
                name={isListening ? 'radio' : 'mic'}
                size={22}
                color={isListening ? '#fff' : '#efeff1'}
              />
            </TouchableOpacity>
          )}
          {/* Read Chat Aloud Button */}
          {Platform.OS === 'web' ? (
            <>
              <div
                id="header-tts-btn"
                onClick={toggleReadChat}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setShowVoiceSettings(true);
                }}
                title="Click: Toggle TTS | Right-click: Voice Settings"
                style={{
                  padding: 8,
                  marginRight: 4,
                  borderRadius: 20,
                  cursor: 'pointer',
                  backgroundColor: isReadingChat ? '#00b894' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={isReadingChat ? 'volume-high' : 'volume-medium'}
                  size={22}
                  color={isReadingChat ? '#fff' : '#efeff1'}
                />
              </div>
              <div
                id="header-voice-settings"
                onClick={() => setShowVoiceSettings(true)}
                title="Voice Settings"
                style={{
                  padding: 6,
                  marginRight: 4,
                  borderRadius: 20,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name="settings-outline"
                  size={18}
                  color="#adadb8"
                />
              </div>
              {/* Chat Toggle - Web */}
              <div
                id="header-chat-toggle"
                onClick={toggleTwitchChat}
                title="Toggle Twitch Chat Panel"
                style={{
                  padding: 8,
                  marginRight: 4,
                  borderRadius: 20,
                  cursor: 'pointer',
                  backgroundColor: twitchChatHidden ? '#00b894' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={twitchChatHidden ? 'chatbubble' : 'chatbubble-ellipses'}
                  size={22}
                  color={twitchChatHidden ? '#fff' : '#efeff1'}
                />
              </div>
              {/* Stream Settings - Web */}
              <div
                id="header-stream-settings"
                onClick={() => setShowSettings(true)}
                title="Stream Settings"
                style={{
                  padding: 8,
                  marginRight: 8,
                  borderRadius: 20,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name="cog"
                  size={22}
                  color="#efeff1"
                />
              </div>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.headerMicButton, isReadingChat && styles.headerTTSActive]}
                onPress={toggleReadChat}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isReadingChat ? 'volume-high' : 'volume-medium'}
                  size={22}
                  color={isReadingChat ? '#fff' : '#efeff1'}
                />
              </TouchableOpacity>
              {/* Toggle Twitch Chat Button - Mobile Only */}
              <TouchableOpacity
                style={[styles.headerMicButton, twitchChatHidden && styles.headerTTSActive]}
                onPress={toggleTwitchChat}
                accessibilityRole="button"
              >
                <Ionicons
                  name={twitchChatHidden ? 'chatbubble' : 'chatbubble-ellipses'}
                  size={22}
                  color={twitchChatHidden ? '#fff' : '#efeff1'}
                />
              </TouchableOpacity>
              {/* Settings Button */}
              <TouchableOpacity
                style={styles.headerMicButton}
                onPress={() => setShowSettings(true)}
                accessibilityRole="button"
              >
                <Ionicons name="settings-outline" size={22} color="#efeff1" />
              </TouchableOpacity>
            </>
          )}
          <View
            style={[
              styles.connectionDot,
              { backgroundColor: isConnected ? '#00ff7f' : '#ff4444' },
            ]}
          />
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setShowChat(!showChat)}
          >
            <Ionicons
              name={showChat ? 'chatbox' : 'chatbox-outline'}
              size={24}
              color="#efeff1"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Video Player */}
      <View style={[styles.playerContainer, !showChat && styles.playerFullHeight]}>
        {Platform.OS === 'web' ? (
          playerOnly ? (
            <iframe
              key="player-only"
              src={`https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}&muted=${!settings.autoUnmute}&autoplay=${settings.autoPlay}`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allowFullScreen
              allow="autoplay; fullscreen; encrypted-media"
            />
          ) : (
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              <iframe
                key="video"
                src={`https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}&muted=${!settings.autoUnmute}&autoplay=${settings.autoPlay}`}
                style={{ flex: 2, height: '100%', border: 'none' }}
                allowFullScreen
                allow="autoplay; fullscreen; encrypted-media"
              />
              <iframe
                key="chat"
                src={`https://www.twitch.tv/embed/${channel}/chat?parent=${window.location.hostname}&darkpopout`}
                style={{ flex: 1, height: '100%', border: 'none', minWidth: 300 }}
              />
            </div>
          )
        ) : WebView ? (
          <WebView
            ref={webViewRef}
            key={playerOnly ? 'player' : 'full'}
            source={{ uri: getStreamUrl() }}
            style={styles.webview}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            onLoadEnd={() => {
              // Auto-play and unmute based on settings
              if (!settings.autoPlay && !settings.autoUnmute) return;

              const tryAutoPlay = (delay: number) => {
                setTimeout(() => {
                  webViewRef.current?.injectJavaScript(`
                    (function() {
                      var autoPlay = ${settings.autoPlay};
                      var autoUnmute = ${settings.autoUnmute};

                      // Click on video/player area to activate
                      var player = document.querySelector('video') ||
                                   document.querySelector('[data-a-target="video-player"]') ||
                                   document.querySelector('.video-player');
                      if (player) player.click();

                      if (autoPlay) {
                        // Find play button
                        var playSelectors = [
                          '[data-a-target="player-play-pause-button"]',
                          '[aria-label*="Play"]', '[aria-label*="play"]',
                          'button[aria-label*="Play"]',
                          '[class*="play-button"]', '[class*="PlayButton"]',
                          '.player-button--play'
                        ];
                        for (var i = 0; i < playSelectors.length; i++) {
                          var btn = document.querySelector(playSelectors[i]);
                          if (btn) { btn.click(); break; }
                        }
                      }

                      if (autoUnmute) {
                        // Find unmute button
                        var muteSelectors = [
                          '[data-a-target="player-mute-unmute-button"]',
                          '[aria-label*="Unmute"]', '[aria-label*="unmute"]',
                          'button[aria-label*="Unmute"]',
                          '[class*="mute-button"]', '[class*="MuteButton"]',
                          '.player-button--volume'
                        ];
                        for (var i = 0; i < muteSelectors.length; i++) {
                          var btn = document.querySelector(muteSelectors[i]);
                          if (btn) {
                            var label = btn.getAttribute('aria-label') || '';
                            if (label.toLowerCase().includes('unmute')) {
                              btn.click();
                              break;
                            }
                          }
                        }
                      }

                      // Direct video element control
                      var videos = document.querySelectorAll('video');
                      videos.forEach(function(v) {
                        if (autoUnmute) v.muted = false;
                        if (autoPlay) v.play().catch(function(){});
                      });
                    })();
                    true;
                  `);
                }, delay);
              };
              // Try at multiple intervals
              tryAutoPlay(1500);
              tryAutoPlay(3000);
              tryAutoPlay(5000);
            }}
          />
        ) : (
          <View style={styles.webview}>
            <Text style={{ color: '#fff' }}>Video not available</Text>
          </View>
        )}
      </View>

      {/* Chat */}
      {showChat && (
        <View style={styles.chatContainer}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>
                  {isConnected ? 'Waiting for messages...' : 'Connecting to chat...'}
                </Text>
              </View>
            }
          />

          {/* Chat Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Send a message"
              placeholderTextColor="#adadb8"
              value={inputMessage}
              onChangeText={setInputMessage}
              onSubmitEditing={handleSendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
              onPress={handleVoiceInput}
            >
              <Ionicons
                name={isListening ? 'radio' : 'mic'}
                size={22}
                color={isListening ? '#fff' : '#adadb8'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendMessage}
              disabled={!inputMessage.trim()}
            >
              <Ionicons
                name="send"
                size={20}
                color={inputMessage.trim() ? '#9147ff' : '#3d3d3d'}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Toast Notification */}
      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* Floating Voice Button - rendered last to be on top */}
      <TouchableOpacity
        style={[styles.floatingVoiceButton, isListening && styles.floatingVoiceButtonActive]}
        onPress={handleVoiceInput}
      >
        <Ionicons
          name={isListening ? 'radio' : 'mic'}
          size={28}
          color="#fff"
        />
        {isListening && <Text style={styles.listeningText}>Listening...</Text>}
      </TouchableOpacity>

      {/* Voice Settings Modal */}
      <Modal
        visible={showVoiceSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVoiceSettings(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowVoiceSettings(false)}
        >
          <View style={styles.voiceSettingsModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Voice Settings</Text>

            <Text style={styles.modalLabel}>Select Voice:</Text>
            <ScrollView style={styles.voiceList}>
              {availableVoices.map((voice, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.voiceOption,
                    selectedVoiceIndex === index && styles.voiceOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedVoiceIndex(index);
                    // Test the voice
                    const utterance = new SpeechSynthesisUtterance('Hello, this is a test.');
                    utterance.voice = voice;
                    utterance.rate = speechRate;
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(utterance);
                  }}
                >
                  <Text style={[
                    styles.voiceOptionText,
                    selectedVoiceIndex === index && styles.voiceOptionTextSelected,
                  ]}>
                    {voice.name}
                  </Text>
                  <Text style={styles.voiceLang}>{voice.lang}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.modalLabel}>Speed: {speechRate.toFixed(1)}x</Text>
            <View style={styles.speedButtons}>
              {[0.8, 1.0, 1.2, 1.5, 2.0].map((rate) => (
                <TouchableOpacity
                  key={rate}
                  style={[
                    styles.speedButton,
                    speechRate === rate && styles.speedButtonSelected,
                  ]}
                  onPress={() => setSpeechRate(rate)}
                >
                  <Text style={[
                    styles.speedButtonText,
                    speechRate === rate && styles.speedButtonTextSelected,
                  ]}>{rate}x</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowVoiceSettings(false)}
            >
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Stream Settings Modal */}
      <Modal
        visible={showSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        >
          <View style={styles.voiceSettingsModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Stream Settings</Text>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Auto-Play Video</Text>
                <Text style={styles.settingDesc}>Start video automatically</Text>
              </View>
              <Switch
                value={settings.autoPlay}
                onValueChange={(v) => updateSetting('autoPlay', v)}
                trackColor={{ false: '#3d3d3d', true: '#9147ff' }}
                thumbColor={settings.autoPlay ? '#fff' : '#888'}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Auto-Unmute</Text>
                <Text style={styles.settingDesc}>Enable audio automatically</Text>
              </View>
              <Switch
                value={settings.autoUnmute}
                onValueChange={(v) => updateSetting('autoUnmute', v)}
                trackColor={{ false: '#3d3d3d', true: '#9147ff' }}
                thumbColor={settings.autoUnmute ? '#fff' : '#888'}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Player-Only Mode</Text>
                <Text style={styles.settingDesc}>Hide Twitch side chat by default</Text>
              </View>
              <Switch
                value={settings.playerOnlyMode}
                onValueChange={(v) => updateSetting('playerOnlyMode', v)}
                trackColor={{ false: '#3d3d3d', true: '#9147ff' }}
                thumbColor={settings.playerOnlyMode ? '#fff' : '#888'}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>TTS Enabled</Text>
                <Text style={styles.settingDesc}>Read chat messages aloud</Text>
              </View>
              <Switch
                value={settings.ttsEnabled}
                onValueChange={(v) => updateSetting('ttsEnabled', v)}
                trackColor={{ false: '#3d3d3d', true: '#9147ff' }}
                thumbColor={settings.ttsEnabled ? '#fff' : '#888'}
              />
            </View>

            {Platform.OS === 'web' && (
              <TouchableOpacity
                style={styles.shortcutButton}
                onPress={() => {
                  setShowSettings(false);
                  setShowShortcutSettings(true);
                }}
              >
                <Ionicons name="keyboard-outline" size={20} color="#efeff1" />
                <Text style={styles.shortcutButtonText}>Keyboard Shortcuts</Text>
                <Ionicons name="chevron-forward" size={20} color="#adadb8" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowSettings(false)}
            >
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Keyboard Shortcuts Modal */}
      <Modal
        visible={showShortcutSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShortcutSettings(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            if (!editingShortcut) setShowShortcutSettings(false);
          }}
        >
          <View style={styles.voiceSettingsModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Keyboard Shortcuts</Text>
            <Text style={styles.shortcutHint}>Click a shortcut to change it, then press the new key</Text>

            {Object.entries(shortcuts).map(([key, value]) => (
              <TouchableOpacity
                key={key}
                style={[styles.shortcutRow, editingShortcut === key && styles.shortcutRowEditing]}
                onPress={() => {
                  setEditingShortcut(key);
                  // Listen for next keypress
                  const handler = (e: KeyboardEvent) => {
                    e.preventDefault();
                    updateShortcut(key as keyof typeof shortcuts, e.key);
                    setEditingShortcut(null);
                    window.removeEventListener('keydown', handler);
                  };
                  window.addEventListener('keydown', handler);
                }}
              >
                <Text style={styles.shortcutName}>
                  {key === 'toggleTTS' ? 'Toggle TTS' :
                   key === 'toggleTwitchChat' ? 'Toggle Twitch Chat' :
                   key === 'toggleOurChat' ? 'Toggle Our Chat' :
                   key === 'openSettings' ? 'Open Settings' :
                   key === 'voiceInput' ? 'Voice Input' :
                   key === 'back' ? 'Go Back / Close' : key}
                </Text>
                <Text style={[styles.shortcutKey, editingShortcut === key && styles.shortcutKeyEditing]}>
                  {editingShortcut === key ? 'Press a key...' : value.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setEditingShortcut(null);
                setShowShortcutSettings(false);
              }}
            >
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e10',
  },
  floatingVoiceButton: {
    position: 'absolute',
    bottom: normalize(24),
    right: normalize(20),
    width: normalize(64),
    height: normalize(64),
    borderRadius: normalize(32),
    backgroundColor: '#9147ff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  floatingVoiceButtonActive: {
    backgroundColor: '#eb0400',
    width: normalize(88),
    borderRadius: normalize(44),
  },
  listeningText: {
    color: '#fff',
    fontSize: normalize(11),
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingTop: Platform.OS === 'ios' ? 50 : 10,
    backgroundColor: '#18181b',
  },
  backButton: {
    padding: 12,
    marginLeft: -8,
  },
  channelName: {
    color: '#efeff1',
    fontSize: normalize(20),
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  toggleButton: {
    padding: 4,
  },
  headerMicButton: {
    padding: 8,
    marginRight: 8,
    borderRadius: 20,
  },
  headerMicButtonActive: {
    backgroundColor: '#eb0400',
  },
  headerTTSActive: {
    backgroundColor: '#00b894',
  },
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: '50%',
    backgroundColor: '#000',
  },
  playerFullHeight: {
    flex: 1,
    aspectRatio: undefined,
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#18181b',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 12,
  },
  messageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  username: {
    fontWeight: '600',
    fontSize: normalize(16),
  },
  messageText: {
    color: '#efeff1',
    fontSize: normalize(16),
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyChatText: {
    color: '#adadb8',
    fontSize: normalize(16),
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#3d3d3d',
    backgroundColor: '#18181b',
  },
  textInput: {
    flex: 1,
    height: normalize(44),
    backgroundColor: '#3d3d3d',
    borderRadius: 8,
    paddingHorizontal: normalize(14),
    color: '#efeff1',
    fontSize: normalize(16),
  },
  voiceButton: {
    marginLeft: 10,
    padding: 8,
    borderRadius: 20,
  },
  voiceButtonActive: {
    backgroundColor: '#eb0400',
  },
  sendButton: {
    marginLeft: 8,
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceSettingsModal: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    color: '#efeff1',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalLabel: {
    color: '#adadb8',
    fontSize: 14,
    marginTop: 12,
    marginBottom: 8,
  },
  voiceList: {
    maxHeight: 200,
    borderRadius: 8,
    backgroundColor: '#0e0e10',
  },
  voiceOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3d3d3d',
  },
  voiceOptionSelected: {
    backgroundColor: '#9147ff',
  },
  voiceOptionText: {
    color: '#efeff1',
    fontSize: 14,
  },
  voiceOptionTextSelected: {
    fontWeight: 'bold',
  },
  voiceLang: {
    color: '#adadb8',
    fontSize: 12,
    marginTop: 2,
  },
  speedButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  speedButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#3d3d3d',
  },
  speedButtonSelected: {
    backgroundColor: '#9147ff',
  },
  speedButtonText: {
    color: '#efeff1',
    fontSize: 14,
  },
  speedButtonTextSelected: {
    fontWeight: 'bold',
  },
  closeButton: {
    marginTop: 20,
    backgroundColor: '#9147ff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3d3d3d',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    color: '#efeff1',
    fontSize: 16,
    fontWeight: '500',
  },
  settingDesc: {
    color: '#adadb8',
    fontSize: 12,
    marginTop: 2,
  },
  shortcutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#3d3d3d',
  },
  shortcutButtonText: {
    flex: 1,
    color: '#efeff1',
    fontSize: 16,
    marginLeft: 12,
  },
  shortcutHint: {
    color: '#adadb8',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3d3d3d',
    borderRadius: 8,
  },
  shortcutRowEditing: {
    backgroundColor: '#9147ff33',
    borderColor: '#9147ff',
  },
  shortcutName: {
    color: '#efeff1',
    fontSize: 14,
  },
  shortcutKey: {
    color: '#9147ff',
    fontSize: 14,
    fontWeight: 'bold',
    backgroundColor: '#3d3d3d',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 50,
    textAlign: 'center',
  },
  shortcutKeyEditing: {
    backgroundColor: '#9147ff',
    color: '#fff',
  },
  toast: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -60 }, { translateY: -20 }],
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    zIndex: 10000,
  },
  toastText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
