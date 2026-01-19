import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../contexts/AuthContext';
import { getOAuthUrl } from '../services/twitchApi';

export default function LoginScreen() {
  const router = useRouter();
  const { accessToken, isLoading, login } = useAuth();
  const [loggingIn, setLoggingIn] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [manualToken, setManualToken] = useState('');

  useEffect(() => {
    if (accessToken && !isLoading) {
      router.replace('/streamers');
    }
  }, [accessToken, isLoading]);

  const handleLogin = async () => {
    try {
      const authUrl = getOAuthUrl();

      if (Platform.OS === 'web') {
        // Open popup for OAuth
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          authUrl,
          'TwitchAuth',
          `width=${width},height=${height},left=${left},top=${top}`
        );

        // Poll for token in popup URL
        const pollTimer = setInterval(() => {
          try {
            if (!popup || popup.closed) {
              clearInterval(pollTimer);
              setShowTokenInput(true);
              return;
            }

            const popupUrl = popup.location.href;
            if (popupUrl.includes('access_token=')) {
              clearInterval(pollTimer);
              const hash = popupUrl.split('#')[1];
              const params = new URLSearchParams(hash);
              const token = params.get('access_token');
              popup.close();

              if (token) {
                setLoggingIn(true);
                login(token);
              }
            }
          } catch (e) {
            // Cross-origin error - popup is on different domain, keep polling
          }
        }, 500);

        // Show manual input after 60 seconds
        setTimeout(() => {
          clearInterval(pollTimer);
          if (!loggingIn) {
            setShowTokenInput(true);
          }
        }, 60000);

      } else {
        // On native, use WebBrowser
        const result = await WebBrowser.openAuthSessionAsync(
          authUrl,
          'http://localhost'
        );

        if (result.type === 'success' && result.url) {
          const url = result.url;
          const hashIndex = url.indexOf('#');
          if (hashIndex !== -1) {
            const fragment = url.substring(hashIndex + 1);
            const params = new URLSearchParams(fragment);
            const token = params.get('access_token');

            if (token) {
              await login(token);
            }
          }
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setShowTokenInput(true);
    }
  };

  const handleManualToken = async () => {
    if (manualToken.trim()) {
      setLoggingIn(true);
      await login(manualToken.trim());
    }
  };

  if (isLoading || loggingIn) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#9147ff" />
        <Text style={{ color: '#adadb8', marginTop: 16 }}>
          {loggingIn ? 'Logging in...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>TwitchVoice</Text>
        <Text style={styles.subtitle}>Voice-powered Twitch companion</Text>
      </View>

      <View style={styles.features}>
        <FeatureItem icon="🎙️" text="Voice to chat" />
        <FeatureItem icon="🎮" text="Watch your favorite streamers" />
        <FeatureItem icon="🗣️" text="Say streamer name to switch" />
      </View>

      {!showTokenInput ? (
        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>Login with Twitch</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.tokenInputContainer}>
          <Text style={styles.tokenInstructions}>
            After authorizing, copy the token from the URL{'\n'}
            (the part after "access_token=")
          </Text>
          <TextInput
            style={styles.tokenInput}
            placeholder="Paste access token here"
            placeholderTextColor="#666"
            value={manualToken}
            onChangeText={setManualToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.loginButton} onPress={handleManualToken}>
            <Text style={styles.loginButtonText}>Submit Token</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowTokenInput(false)}>
            <Text style={styles.backLink}>← Try login again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e10',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logo: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#9147ff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#adadb8',
  },
  features: {
    marginBottom: 60,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  featureText: {
    fontSize: 18,
    color: '#efeff1',
  },
  loginButton: {
    backgroundColor: '#9147ff',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  tokenInputContainer: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  tokenInstructions: {
    color: '#adadb8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  tokenInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#18181b',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#efeff1',
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3d3d3d',
  },
  backLink: {
    color: '#9147ff',
    fontSize: 14,
    marginTop: 16,
  },
});
