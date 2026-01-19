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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Only import WebView for native platforms
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}
import { useAuth } from '../../contexts/AuthContext';
import { TwitchIRC } from '../../services/twitchIRC';
import { ChatMessage } from '../../types/twitch';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function StreamScreen() {
  const { channel } = useLocalSearchParams<{ channel: string }>();
  const router = useRouter();
  const { accessToken, user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showChat, setShowChat] = useState(true);

  const ircRef = useRef<TwitchIRC | null>(null);
  const flatListRef = useRef<FlatList>(null);

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

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !ircRef.current) return;

    ircRef.current.sendMessage(inputMessage.trim());
    setInputMessage('');
  };

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
    const parent = Platform.OS === 'web' ? window.location.hostname : 'localhost';
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
          src="https://player.twitch.tv/?channel=${channel}&parent=${parent}&muted=false&autoplay=true"
          allowfullscreen
          allow="autoplay; fullscreen">
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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#efeff1" />
        </TouchableOpacity>
        <Text style={styles.channelName}>{channel}</Text>
        <View style={styles.headerRight}>
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
          <iframe
            src={`https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}&muted=false&autoplay=true`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allowFullScreen
            allow="autoplay; fullscreen"
          />
        ) : WebView ? (
          <WebView
            source={{ html: getTwitchEmbedHtml() }}
            style={styles.webview}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e10',
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
    padding: 4,
  },
  channelName: {
    color: '#efeff1',
    fontSize: 18,
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
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
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
    fontSize: 14,
  },
  messageText: {
    color: '#efeff1',
    fontSize: 14,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyChatText: {
    color: '#adadb8',
    fontSize: 14,
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
    height: 40,
    backgroundColor: '#3d3d3d',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#efeff1',
    fontSize: 14,
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
});
