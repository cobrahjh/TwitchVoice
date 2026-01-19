export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

export interface TwitchChannel {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  followed_at: string;
}

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
  is_live: boolean;
}

export interface StreamerDisplay {
  id: string;
  login: string;
  display_name: string;
  profile_image_url?: string;
  is_live: boolean;
  viewer_count?: number;
  game_name?: string;
  title?: string;
  thumbnail_url?: string;
}

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  color?: string;
  timestamp: Date;
}

export interface AuthState {
  accessToken: string | null;
  user: TwitchUser | null;
  isLoading: boolean;
}
