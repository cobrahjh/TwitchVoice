import { ChatMessage } from '../types/twitch';

type MessageCallback = (message: ChatMessage) => void;
type ConnectionCallback = (connected: boolean) => void;

export class TwitchIRC {
  private ws: WebSocket | null = null;
  private token: string;
  private username: string;
  private channel: string | null = null;
  private onMessage: MessageCallback | null = null;
  private onConnectionChange: ConnectionCallback | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageId = 0;
  private hasJoined = false;

  constructor(token: string, username: string) {
    this.token = token;
    this.username = username.toLowerCase();
  }

  connect(channel: string, onMessage: MessageCallback, onConnectionChange?: ConnectionCallback) {
    this.channel = channel.toLowerCase();
    this.onMessage = onMessage;
    this.onConnectionChange = onConnectionChange || null;

    this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    this.ws.onopen = () => {
      console.log('IRC WebSocket connected');
      this.reconnectAttempts = 0;
      this.authenticate();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onerror = (error) => {
      console.error('IRC WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('IRC WebSocket closed');
      this.onConnectionChange?.(false);
      this.attemptReconnect();
    };
  }

  private authenticate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(`PASS oauth:${this.token}`);
    this.ws.send(`NICK ${this.username}`);
    this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
  }

  private handleMessage(data: string) {
    const lines = data.split('\r\n').filter(line => line.length > 0);

    for (const line of lines) {
      // Handle PING
      if (line.startsWith('PING')) {
        this.ws?.send('PONG :tmi.twitch.tv');
        continue;
      }

      // Handle successful auth
      if (line.includes('001') && !this.hasJoined) {
        console.log('IRC authenticated, joining channel:', this.channel);
        this.hasJoined = true;
        this.joinChannel();
        continue;
      }

      // Handle join confirmation
      if (line.includes('JOIN') && this.channel) {
        this.onConnectionChange?.(true);
        continue;
      }

      // Parse PRIVMSG
      if (line.includes('PRIVMSG')) {
        const message = this.parsePrivmsg(line);
        if (message) {
          this.onMessage?.(message);
        }
      }
    }
  }

  private parsePrivmsg(line: string): ChatMessage | null {
    try {
      // Parse tags
      let color: string | undefined;
      let displayName: string | undefined;

      if (line.startsWith('@')) {
        const tagsEnd = line.indexOf(' ');
        const tagsStr = line.substring(1, tagsEnd);
        const tags = Object.fromEntries(
          tagsStr.split(';').map(t => t.split('='))
        );
        color = tags['color'] || undefined;
        displayName = tags['display-name'] || undefined;
      }

      // Parse message content
      const privmsgIndex = line.indexOf('PRIVMSG');
      if (privmsgIndex === -1) return null;

      const afterPrivmsg = line.substring(privmsgIndex);
      const colonIndex = afterPrivmsg.indexOf(' :');
      if (colonIndex === -1) return null;

      const messageText = afterPrivmsg.substring(colonIndex + 2);

      // Parse username from prefix
      const prefixMatch = line.match(/:(\w+)!/);
      const username = displayName || prefixMatch?.[1] || 'unknown';

      return {
        id: `msg-${++this.messageId}`,
        username,
        message: messageText,
        color,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error parsing PRIVMSG:', error);
      return null;
    }
  }

  private joinChannel() {
    if (!this.ws || !this.channel) return;
    this.ws.send(`JOIN #${this.channel}`);
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.channel && this.onMessage) {
        this.connect(this.channel, this.onMessage, this.onConnectionChange || undefined);
      }
    }, delay);
  }

  sendMessage(message: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.channel) {
      console.error('Cannot send message: not connected');
      return false;
    }

    this.ws.send(`PRIVMSG #${this.channel} :${message}`);

    // Add our own message to the chat
    this.onMessage?.({
      id: `msg-${++this.messageId}`,
      username: this.username,
      message,
      color: '#9147ff',
      timestamp: new Date(),
    });

    return true;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.channel = null;
    this.onMessage = null;
    this.onConnectionChange = null;
    this.hasJoined = false;
  }

  changeChannel(newChannel: string) {
    if (this.channel) {
      this.ws?.send(`PART #${this.channel}`);
    }
    this.channel = newChannel.toLowerCase();
    this.joinChannel();
  }
}
