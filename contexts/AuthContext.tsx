import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import { TwitchUser, AuthState } from '../types/twitch';
import { validateToken, getUser } from '../services/twitchApi';

// Only import AsyncStorage for native platforms
let AsyncStorage: any = null;
if (Platform.OS !== 'web') {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
}

interface AuthContextType extends AuthState {
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = '@twitch_token';

// Storage wrapper that uses localStorage on web for reliability
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return AsyncStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage?.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
    await AsyncStorage?.removeItem(key);
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    user: null,
    isLoading: true,
  });

  useEffect(() => {
    // Immediate fallback - never stay loading more than 1 second
    const fallback = setTimeout(() => {
      setState(prev => {
        if (prev.isLoading) {
          console.log('Fallback timeout triggered');
          return { ...prev, isLoading: false };
        }
        return prev;
      });
    }, 1000);

    loadStoredAuth();

    return () => clearTimeout(fallback);
  }, []);

  const loadStoredAuth = async () => {
    // Set a timeout to ensure we don't get stuck loading
    const timeout = setTimeout(() => {
      console.log('Auth timeout triggered');
      setState(prev => ({ ...prev, isLoading: false }));
    }, 2000);

    try {
      const storedToken = await storage.getItem(TOKEN_KEY);
      console.log('Stored token:', storedToken ? 'found' : 'none');
      if (storedToken) {
        const isValid = await validateToken(storedToken);
        console.log('Token valid:', isValid);
        if (isValid) {
          const user = await getUser(storedToken);
          clearTimeout(timeout);
          setState({
            accessToken: storedToken,
            user,
            isLoading: false,
          });
          return;
        }
      }
      clearTimeout(timeout);
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Failed to load stored auth:', error);
      clearTimeout(timeout);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const login = async (token: string) => {
    try {
      const isValid = await validateToken(token);
      if (!isValid) {
        throw new Error('Invalid token');
      }
      const user = await getUser(token);
      await storage.setItem(TOKEN_KEY, token);
      setState({
        accessToken: token,
        user,
        isLoading: false,
      });
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    await storage.removeItem(TOKEN_KEY);
    setState({
      accessToken: null,
      user: null,
      isLoading: false,
    });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
