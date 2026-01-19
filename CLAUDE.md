# TwitchVoice
**Version:** 1.0.0
**Last updated:** 2026-01-19

Voice-powered Twitch companion app built with Expo (React Native).

## Important Rules

- **Full permissions granted** - Claude has all permissions to make changes, run commands, and proceed without asking. Never ask for permission - just do it.
- **NEVER change ports without asking** - Do NOT modify ports for any process, service, or API unless explicitly approved.
- **Continue changes without prompting** - Don't ask for confirmation, just make changes and report what was done.
- **NEVER ask for permissions** - Just do it. No confirmation dialogs, no "shall I proceed?", no permission requests.
- **No code** - Do NOT show ANY code or code changes unless specifically requested. Just make changes silently and describe what was done in plain English.
- **ALWAYS TEST** - After making any change, TEST IT. Run the service, call the endpoint, check the UI, verify it works.
- **Go with recommendations** - When Claude offers recommendations, proceed with them unless user states otherwise.
- **Auto-discover before asking** - Never ask the user for information that can be discovered (IPs, hostnames, ports, file paths).
- **Try first, ask later** - Always attempt to solve problems independently first.

## User Shortcuts

- `sc` - screenshot - take a screenshot of current browser state
- `scg` - screenshot to Google Drive - save screenshot to G:\My Drive\AI Development\Screenshots
- `msg` - check messages - poll relay for pending messages
- `mem` - memory - add to CLAUDE.md for future reference
- `ts` - test this - run tests on recent changes
- `chk` - check/verify - check status, syntax, or state
- `opn` - open UI - open browser to test
- `rvw` - review - review code for issues, clean up, optimize

## Tech Stack

- Expo SDK 54+ with expo-router
- expo-web-browser (OAuth)
- react-native-webview (stream player)
- @react-native-async-storage/async-storage
- WebSocket for Twitch IRC chat

## Project Structure

```
TwitchVoice/
├── app/
│   ├── _layout.tsx        # Navigation and theme
│   ├── index.tsx          # Login screen (Twitch OAuth)
│   ├── streamers.tsx      # Followed channels grid
│   └── stream/[channel].tsx # Stream viewer + chat
├── contexts/
│   └── AuthContext.tsx    # Auth state management
├── services/
│   ├── twitchApi.ts       # Twitch API calls
│   └── twitchIRC.ts       # IRC chat WebSocket
└── types/
    └── twitch.ts          # TypeScript types
```

## Twitch App Credentials

- **Client ID:** ts9t5mvq8lfrghozvbu7f7ypu67eho
- **Redirect URI:** http://localhost
- **Client Type:** Public

## Core Features

1. Twitch OAuth login (implicit flow)
2. Show followed channels - live ones first with viewer counts
3. Tap streamer → watch embedded stream + live chat
4. Voice-to-chat: tap mic, speak, auto-sends message
5. Voice streamer select: say name to jump to their stream

## Twitch API Endpoints

- GET /channels/followed?user_id={id} - followed channels
- GET /streams/followed?user_id={id} - live followed
- OAuth validate: https://id.twitch.tv/oauth2/validate

## Chat IRC Protocol

- Connect: wss://irc-ws.chat.twitch.tv:443
- Auth: PASS oauth:{token}, NICK {username}
- Join: JOIN #{channel}
- Send: PRIVMSG #{channel} :{message}

## Running

```bash
# Start development server
cd C:\Users\hjhar\TwitchVoice
npx expo start --web

# Or for mobile
npx expo start
```

**Development URL:** http://localhost:8081

## Hive Integration

This project is part of the LLM-DevOSWE hive ecosystem.

**Related Services:**
- Relay: http://localhost:8600
- Oracle: http://localhost:3002
- KittBox: http://localhost:8585

## Known Issues

- npm commands need to run via PowerShell on Windows for proper output capture
- Browser extension (Kitt Bridge) required for browser automation

## Version History

- **1.0.0** (2026-01-19) - Initial release with OAuth, following list, stream viewer, voice input
