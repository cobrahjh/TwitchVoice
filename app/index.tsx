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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../contexts/AuthContext';
import { getOAuthUrl, getClientId } from '../services/twitchApi';

// Required for proper auth session handling on mobile
WebBrowser.maybeCompleteAuthSession();

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

  // Check for OAuth callback token in URL hash or localStorage
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Check URL hash first (direct redirect from Twitch)
      const hash = window.location.hash;
      if (hash && hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        if (token) {
          // Clear the hash from URL
          window.history.replaceState(null, '', window.location.pathname);
          setLoggingIn(true);
          login(token);
          return;
        }
      }

      // Check localStorage fallback
      const pendingToken = localStorage.getItem('twitch_pending_token');
      if (pendingToken) {
        localStorage.removeItem('twitch_pending_token');
        setLoggingIn(true);
        login(pendingToken);
      }
    }
  }, []);

  const handleLogin = async () => {
    try {
      if (Platform.OS === 'web') {
        const authUrl = getOAuthUrl('web');
        // Open Twitch OAuth in new tab
        window.open(authUrl, '_blank');
        setShowTokenInput(true);
      } else {
        // On native, open Twitch auth and show manual token input
        // Twitch doesn't support custom URL schemes, so we use manual token flow
        const redirectUri = 'http://localhost';

        const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
          `client_id=${getClientId()}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=token&` +
          `scope=${encodeURIComponent('user:read:follows chat:read chat:edit')}`;

        // Open auth in browser - user will need to copy token after redirect
        await WebBrowser.openBrowserAsync(authUrl);
        setShowTokenInput(true);
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
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#9147ff" />
        <Text style={{ color: '#adadb8', marginTop: 16 }}>
          {loggingIn ? 'Logging in...' : 'Loading...'}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
            1. Authorize in Twitch browser{'\n'}
            2. After "This site can't be reached" page{'\n'}
            3. Copy token from URL (after "access_token=")
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
    </SafeAreaView>
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
