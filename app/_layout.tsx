import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { AuthProvider } from '../contexts/AuthContext';

const TwitchTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#9147ff',
    background: '#0e0e10',
    card: '#18181b',
    text: '#efeff1',
    border: '#3d3d3d',
  },
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={TwitchTheme}>
        <Stack screenOptions={{ headerStyle: { backgroundColor: '#18181b' }, headerTintColor: '#efeff1' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="streamers" options={{ title: 'Following', headerBackVisible: false }} />
          <Stack.Screen name="stream/[channel]" options={{ title: 'Stream', headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </AuthProvider>
  );
}
