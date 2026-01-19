import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { getFollowedStreamers } from '../services/twitchApi';
import { StreamerDisplay } from '../types/twitch';

export default function StreamerListScreen() {
  const router = useRouter();
  const { accessToken, user, logout } = useAuth();
  const [streamers, setStreamers] = useState<StreamerDisplay[]>([]);
  const [filteredStreamers, setFilteredStreamers] = useState<StreamerDisplay[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const loadStreamers = useCallback(async () => {
    if (!accessToken || !user) return;

    try {
      const data = await getFollowedStreamers(accessToken, user.id);
      setStreamers(data);
      setFilteredStreamers(data);
    } catch (error) {
      console.error('Failed to load streamers:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, user]);

  useEffect(() => {
    loadStreamers();
  }, [loadStreamers]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredStreamers(streamers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredStreamers(
        streamers.filter(
          s =>
            s.display_name.toLowerCase().includes(query) ||
            s.login.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, streamers]);

  const onRefresh = () => {
    setRefreshing(true);
    loadStreamers();
  };

  const handleStreamerPress = (streamer: StreamerDisplay) => {
    router.push(`/stream/${streamer.login}`);
  };

  const handleVoiceSelect = async () => {
    // Voice recognition for streamer selection
    setIsListening(true);

    // For now, we'll use a simple approach that works on web
    // On native, you'd use expo-speech-recognition
    if (Platform.OS === 'web' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        setIsListening(false);

        // Find matching streamer
        const match = streamers.find(
          s =>
            s.display_name.toLowerCase().includes(transcript) ||
            s.login.toLowerCase().includes(transcript)
        );

        if (match) {
          handleStreamerPress(match);
        } else {
          setSearchQuery(transcript);
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
      // Fallback for platforms without speech recognition
      setIsListening(false);
      alert('Voice recognition not available on this platform');
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  const formatViewerCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const renderStreamer = ({ item }: { item: StreamerDisplay }) => (
    <TouchableOpacity
      style={styles.streamerCard}
      onPress={() => handleStreamerPress(item)}
      activeOpacity={0.7}
    >
      {item.is_live && item.thumbnail_url ? (
        <Image source={{ uri: item.thumbnail_url }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.offlineThumbnail]}>
          {item.profile_image_url ? (
            <Image
              source={{ uri: item.profile_image_url }}
              style={styles.profileImage}
            />
          ) : (
            <Ionicons name="person" size={40} color="#adadb8" />
          )}
        </View>
      )}

      <View style={styles.streamerInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.streamerName} numberOfLines={1}>
            {item.display_name}
          </Text>
          {item.is_live && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
        </View>

        {item.is_live ? (
          <>
            <Text style={styles.gameName} numberOfLines={1}>
              {item.game_name || 'No category'}
            </Text>
            <Text style={styles.viewerCount}>
              {formatViewerCount(item.viewer_count || 0)} viewers
            </Text>
          </>
        ) : (
          <Text style={styles.offlineText}>Offline</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#9147ff" />
      </View>
    );
  }

  const liveCount = streamers.filter(s => s.is_live).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#adadb8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search streamers..."
            placeholderTextColor="#adadb8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity
            style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
            onPress={handleVoiceSelect}
          >
            <Ionicons
              name={isListening ? 'radio' : 'mic'}
              size={20}
              color={isListening ? '#fff' : '#adadb8'}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#adadb8" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {liveCount} live · {streamers.length} following
        </Text>
      </View>

      <FlatList
        data={filteredStreamers}
        renderItem={renderStreamer}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#9147ff"
            colors={['#9147ff']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No streamers found' : 'Not following anyone yet'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e10',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0e0e10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    backgroundColor: '#18181b',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3d3d3d',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: '#efeff1',
    fontSize: 16,
  },
  voiceButton: {
    padding: 8,
    marginLeft: 4,
  },
  voiceButtonActive: {
    backgroundColor: '#9147ff',
    borderRadius: 20,
  },
  logoutButton: {
    marginLeft: 12,
    padding: 8,
  },
  statsBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#18181b',
    borderBottomWidth: 1,
    borderBottomColor: '#3d3d3d',
  },
  statsText: {
    color: '#adadb8',
    fontSize: 14,
  },
  listContent: {
    padding: 8,
  },
  row: {
    justifyContent: 'space-between',
  },
  streamerCard: {
    width: '48%',
    backgroundColor: '#18181b',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#26262c',
  },
  offlineThumbnail: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  streamerInfo: {
    padding: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  streamerName: {
    flex: 1,
    color: '#efeff1',
    fontSize: 14,
    fontWeight: '600',
  },
  liveBadge: {
    backgroundColor: '#eb0400',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  gameName: {
    color: '#adadb8',
    fontSize: 12,
    marginBottom: 2,
  },
  viewerCount: {
    color: '#eb0400',
    fontSize: 12,
    fontWeight: '500',
  },
  offlineText: {
    color: '#adadb8',
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: '#adadb8',
    fontSize: 16,
  },
});
