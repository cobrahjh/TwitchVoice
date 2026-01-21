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

## Screenshot Workflow

- After reading/analyzing images from `G:\My Drive\AI Development\Screenshots`, move them to `G:\My Drive\AI Development\Screenshots\backup`

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
- **Client Type:** Public
- **Redirect URIs (register ALL in Twitch Developer Console):**
  - `http://localhost` (web)
  - `http://127.0.0.1` (web fallback)
  - `twitchvoice://auth/callback` (mobile production)
  - `exp://localhost:8081/--/auth/callback` (Expo Go iOS)
  - `exp://127.0.0.1:8081/--/auth/callback` (Expo Go Android)

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
- Browser automation uses **Kitt Browser Bridge** (NOT Claude extension)
  - Extension connects to WebSocket relay at ws://localhost:8620
  - mcp__claude-in-chrome tools do NOT work with Kitt - use relay commands instead
  - Always use full URLs (e.g., http://localhost:8081 not just localhost:8081)

## TODO

- ~~**Fix pointerEvents deprecation**~~ - Fixed: suppressed via LogBox (warning from expo-router internals, not app code)
- **Kitt Bridge Relay (8620)** - Add features needed for Claude integration:
  - Response routing back to requesting client
  - Command acknowledgment/confirmation
  - Screenshot capture and return as base64
  - Tab listing API
  - Navigate/click/type commands with response
- ~~**Auto-start stream**~~ - Set muted=true for autoplay, but Twitch player still requires one click due to browser policy

## Version History

- **1.0.0** (2026-01-19) - Initial release with OAuth, following list, stream viewer, voice input
