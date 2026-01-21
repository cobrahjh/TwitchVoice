import { TwitchUser, TwitchChannel, TwitchStream, StreamerDisplay } from '../types/twitch';

const CLIENT_ID = 'ts9t5mvq8lfrghozvbu7f7ypu67eho';
const API_BASE = 'https://api.twitch.tv/helix';
const AUTH_BASE = 'https://id.twitch.tv/oauth2';

export async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${AUTH_BASE}/validate`, {
      headers: {
        'Authorization': `OAuth ${token}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

export async function getUser(token: string): Promise<TwitchUser> {
  const response = await fetch(`${API_BASE}/users`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Client-Id': CLIENT_ID,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }

  const data = await response.json();
  return data.data[0];
}

export async function getFollowedChannels(token: string, userId: string): Promise<TwitchChannel[]> {
  const channels: TwitchChannel[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${API_BASE}/channels/followed`);
    url.searchParams.set('user_id', userId);
    url.searchParams.set('first', '100');
    if (cursor) {
      url.searchParams.set('after', cursor);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': CLIENT_ID,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch followed channels');
    }

    const data = await response.json();
    channels.push(...data.data);
    cursor = data.pagination?.cursor;
  } while (cursor);

  return channels;
}

export async function getLiveStreams(token: string, userIds: string[]): Promise<TwitchStream[]> {
  if (userIds.length === 0) return [];

  const streams: TwitchStream[] = [];
  const chunks = chunkArray(userIds, 100);

  for (const chunk of chunks) {
    const url = new URL(`${API_BASE}/streams`);
    chunk.forEach(id => url.searchParams.append('user_id', id));

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': CLIENT_ID,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch live streams');
    }

    const data = await response.json();
    streams.push(...data.data);
  }

  return streams;
}

export async function getUsersByIds(token: string, userIds: string[]): Promise<TwitchUser[]> {
  if (userIds.length === 0) return [];

  const users: TwitchUser[] = [];
  const chunks = chunkArray(userIds, 100);

  for (const chunk of chunks) {
    const url = new URL(`${API_BASE}/users`);
    chunk.forEach(id => url.searchParams.append('id', id));

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': CLIENT_ID,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    const data = await response.json();
    users.push(...data.data);
  }

  return users;
}

export async function getFollowedStreamers(token: string, userId: string): Promise<StreamerDisplay[]> {
  const channels = await getFollowedChannels(token, userId);
  const userIds = channels.map(c => c.broadcaster_id);

  const [users, streams] = await Promise.all([
    getUsersByIds(token, userIds),
    getLiveStreams(token, userIds),
  ]);

  const userMap = new Map(users.map(u => [u.id, u]));
  const streamMap = new Map(streams.map(s => [s.user_id, s]));

  const streamers: StreamerDisplay[] = channels.map(channel => {
    const user = userMap.get(channel.broadcaster_id);
    const stream = streamMap.get(channel.broadcaster_id);

    return {
      id: channel.broadcaster_id,
      login: channel.broadcaster_login,
      display_name: channel.broadcaster_name,
      profile_image_url: user?.profile_image_url,
      is_live: !!stream,
      viewer_count: stream?.viewer_count,
      game_name: stream?.game_name,
      title: stream?.title,
      thumbnail_url: stream?.thumbnail_url?.replace('{width}', '320').replace('{height}', '180'),
    };
  });

  // Sort: live first (by viewer count), then offline alphabetically
  streamers.sort((a, b) => {
    if (a.is_live && !b.is_live) return -1;
    if (!a.is_live && b.is_live) return 1;
    if (a.is_live && b.is_live) {
      return (b.viewer_count || 0) - (a.viewer_count || 0);
    }
    return a.display_name.localeCompare(b.display_name);
  });

  return streamers;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function getOAuthUrl(platform: 'web' | 'native'): string {
  // Web uses localhost, native uses 127.0.0.1 (both registered in Twitch)
  const redirectUri = platform === 'web' ? 'http://localhost' : 'http://127.0.0.1';

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'user:read:follows chat:read chat:edit',
  });

  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

export function getClientId(): string {
  return CLIENT_ID;
}
