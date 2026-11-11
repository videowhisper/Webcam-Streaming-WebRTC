# Webcam Streaming WebRTC
## PHP demo maintenance — 2026-11-10

The live demo now keeps its account token in private server configuration and issues browser-session-bound, five-minute PINs. `credentialsURL` renews the PIN for each connection. Manual account/PIN and legacy token integrations remain supported.

To use the PHP host, copy `demo/php/` beside the built `dist` files on PHP 8.2+ over HTTPS. Set `VWS_DEMO_CONFIG` to an owner-readable JSON file outside the web root containing `socket`, `account` and `token`. Set the dedicated streaming account callback to this installation's `auth.php`. The PHP index selects `config.php`, generates a separate tab identity, and validates the browser session when renewing. `.htaccess` selects the PHP index and denies retired public `config.json`/`login.json` files. Configure equivalent rules on other web servers. No account registration, token rotation or remote executable download is performed by the app.

The build now publishes only approved public templates/assets; private configuration and login files never enter `dist` or the service-worker precache. Deploy only the built assets and reviewed PHP host files, retain a runtime/configuration backup, and verify broadcast/playback, calls, RandomChat, chat, PIN renewal and cleanup before accepting the update. Use synthetic devices first; physical devices and separate networks need manual checks.

Pre-publishing checks: `npm ci`, `npm run lint` (existing hook-dependency warnings need review), `npm run test:e2e`, `npm run build`, and `npm audit --omit=dev`. Browser fixtures run on loopback with synthetic configuration; set `VWC_CHROMIUM_PATH` if using an existing Chromium executable. Runtime audit is clear on 2026-11-10; four development-only findings remain in the service-worker build chain after compatible fixes.

For small group meetings, try the separate [Video Conference demo](https://demo.videowhisper.com/video-conference/). [Current webcam/microphone/screen recorder](https://demo.videowhisper.com/webcam-microphone-screen-recorder/).


React JS application for real-time WebRTC webcam video streaming: broadcast live, join 2-way private calls, or use random video chat with configurable matching filters. Public source code & build included.

[Live Demo](https://demo.videowhisper.com/Webcam-Streaming-WebRTC/)

## Screenshots

Captured from the current application with AI-generated fictional participant
portraits supplied as synthetic camera feeds. The app renders its own controls
and video layout.

### Live webcam broadcasting

![Webcam broadcasting with camera controls and text chat](images/webcam-broadcast-v2.png)

[Try broadcasting](https://demo.videowhisper.com/Webcam-Streaming-WebRTC/).

### Private video calls

![Full-screen private call with a self-preview, visible controls and text chat](images/webcam-call-v2.png)

[Try a private call](https://demo.videowhisper.com/Webcam-Streaming-WebRTC/?view=CallChat).
Copy the first session's invite link into another browser to join the same room.

### Random video chat

![Random video chat with full-screen video, self-preview and matching controls](images/webcam-random-v2.png)

[Try RandomChat](https://demo.videowhisper.com/Webcam-Streaming-WebRTC/?view=RandomChat).


## Index

- [Features](#features)
- [Testing the Demo](#testing-the-demo)
- [Installation Instructions](#installation-instructions)
- [Requirements](#requirements)
- [Quick Demo Links](#quick-demo-links)
- [Technical Implementation](#technical-implementation)
- [Configuration and Setup](#configuration-and-setup)
- [Building and Development](#building-and-development)
- [Development Best Practices](#development-best-practices)
- [Server Signaling](#server-signaling)
- [Authentication Methods](#authentication-methods)
- [Styling and UI](#styling-and-ui)
- [Technologies Used](#technologies-used)


## Key Features

- **Real-time WebRTC video streaming** 100% web based, with peer-to-peer connections
- **Broadcast Mode**: Publish live video from your camera to multiple viewers
- **Play Mode**: Watch live streams from broadcaster
- **CallChat Mode**: Private 2-way video chat with picture-in-picture local preview and mobile-friendly camera rotation
- **RandomChat Mode**: Random 2-way matching with Next button and configurable match filters
- **Video Chat**: Real-time text chat within broadcast, call, and play views.
- **Camera Selection**: Switch/rotate between available camera devices (mobile friendly)
- **Audio Controls**: Mute/unmute microphone in broadcast mode or audio in playback mode
- **Stream Status Indicator**: Monitor streaming state and viewer count
- **Room URL Sharing**: Easily share links to your channel
- **Multiple Authentication Options**: Support for both token-based and account/user/pin authentication
- **Autoplay**: Gracefully handles autoplay restrictions in modern browsers with Tap to Unmute / Play
- **Error Handling**: Displays error messages for issues
- **Responsive UI**: Built with Tailwind CSS, tested on mobile and desktop browsers


## Testing the Demo

You can test the application without installation by visiting the official demo:

### Demo Site
Visit [https://demo.videowhisper.com/Webcam-Streaming-WebRTC/](https://demo.videowhisper.com/Webcam-Streaming-WebRTC/) to try out the application.


### Testing as a Broadcaster 
1. Access the demo link above
2. Allow camera and microphone permissions when prompted
3. The app should start broadcasting automatically
4. Test camera switching if you have multiple cameras
5. Click the TV button in the bottom right to open playback in a new tab
5. Use the URL copy buttons in the bottom right to share your stream
6. Note the viewer count on the connection button once connected (green)
7. Test sending chat messages, toggle chat visibility

### Testing as a Viewer (Playback)
1. From a broadcaster session, open the URL in a new tab or
2. Copy the URL and open in another browser/device or share with a friend
3. Playback should start automatically when page opens 
4. You may need to click Tap to Play/Unmute if autoplay is restricted by browser
5. Test muting/unmuting the audio
6. Test sending chat messages, toggle chat visibility


## Installation Instructions

To install and run the application on your own server:

### Deploy Pre-built Distribution (Demo)

1. Download or build the distribution files (the `dist` folder)
2. Upload the files from `dist` to a folder on your web server (Apache, Nginx, etc.)
3. Duplicate `unconfigured.json` in the root folder and update it with your streaming server details:

```json
{
    "channel": "YourChannelName",
    "username": "{generate}",
    "view": "BroadcastChat",
    "enableGET": true,
    "showURL": true,
    "videowhisperServer": {
        "socket": "wss://your-webrtc-server:3000",  
        "authentication": "token",
        "token": "your-account-token-here"
      },
    "stream": {
        "width": 640,
        "height": 360,
        "framerate": 15,
        "videoBitrate": 500,
        "audioBitrate": 32
    },
    "development": false
}
```
4. Replace `wss://your-webrtc-server:3000` and `your-token-here` with your VideoWhisper Server details (get a free account if you don't have own streaming server or account - see Requirements below)
5. Access the application through your web server

*Warning*: This is a demo setup for development and testing purposes with publicly accessible configuration file. For production, you should implement the more advanced authentication and integration methods where streaming settings are provided only to authenticated users, authentication is per user and further restrictions are implemented on server side.

### Requirements

- A web server with HTTPS (required for WebRTC in production)
- Access to a VideoWhisper Server that handles signaling, STUN/TURN (self-hosted [VideoWhisper Server](https://github.com/videowhisper/videowhisper-webrtc) or a *free* plan from [WebRTCHost](https://webrtchost.com/hosting-plans/#Streaming-Only) )
- Modern browser with WebRTC support (Chrome, Safari, Edge, Brave, Firefox)
- Consult VideoWhisper support if you need a free consultation or clarifications: [https://consult.videowhisper.com/](https://consult.videowhisper.com/)

### Quick Demo Links

When `enableGET: true` is set in the config, you can use URL parameters to quickly access broadcast, call, and playback views for specific channels:

- Broadcasting: `/?view=BroadcastChat&channel=MyChannel`
- Viewing: `/?view=PlayChat&channel=MyChannel`
- Direct call: `/?view=CallChat&channel=MyPrivateRoom`
- Random chat: `/?view=RandomChat`


## Technical Implementation

This project implements WebRTC-based video streaming using a client-server architecture with peer-to-peer connections:

### VideoWhisper WebRTC Server

The application connects to the [VideoWhisper WebRTC Server](https://github.com/videowhisper/videowhisper-webrtc) which acts as a signaling server to:
- Establish connections between peers
- Manage channel/room subscriptions
- Handle WebRTC session negotiation
- Provide ICE server configuration for NAT traversal (STUN/TURN configuration)
- Handle access and limitations for streaming


### Key Views
The application supports multiple views that can be set in the configuration file or through URL `view` parameter:
- `BroadcastChat`: Camera controls, room chat, share buttons (default)
- `PlayChat`: Player with room chat
- `CallChat`: Private 2-way video chat with remote video main stage and local PiP preview
- `RandomChat`: Queue-based 2-way matching with filter form, Next button, and invite link sharing
- `Broadcast`: Simple broadcaster view with camera selection and broadcasting controls, no room & chat
- `Play`: Simple player view, no room & chat
- `Chat`: Text chat-only room view
- `Debugger`: Only available in development mode, when a troubleshooting button is also available to switch at runtime.

### Key Components

#### BroadcastWebRTC & Broadcast 

The broadcaster component captures local media and establishes peer connections with viewers:

- **Media Capture**: Accesses the user's camera and microphone 
- **Multiple Connections**: Maintains separate WebRTC peer connections for each viewer
- **Connection Management**:
  - Creates and sends offers to new viewers
  - Processes ICE candidates
  - Monitors connection states
  - Tracks connected peer count
- **Camera Controls**: Provides UI to switch between available camera devices

#### PlayWebRTC & Play

The player component receives and displays the live stream:

- **Session Management**: Subscribes to channels using the signaling server
- **WebRTC Handling**:
  - Processes incoming offers from broadcasters
  - Generates and sends answers
  - Sets up media reception
  - Monitors connection quality
- **Stream Statistics**: Collects and displays info about video resolution, bitrate, and FPS
- **Auto-reconnection**: Attempts to reconnect when connections fail

#### Chat Components

- **`ChatInterface`**: Main container for the chat UI, handling message sending and receiving.
- **`ChatDisplay`**: Displays incoming chat messages with auto-scroll and fade effects.
- **`ChatInput`**: Provides the text input field and send button.
- **`ChatToggle`**: Button to show/hide the chat interface.

### Key Hooks
- **broadcastWebRTC**: Custom hook for managing the broadcaster's WebRTC connections, including media capture and signaling.
- **playWebRTC**: Custom hook for managing the player's WebRTC connections, including session management and media reception.
- **callWebRTC**: Custom hook for bidirectional room calls, handling local publish plus remote subscribe in the same room.

### Matching Filters Configuration

Random chat filters are provided through the `randomChat.filters` configuration section. Each filter can define a `mirror` key to match against a different field from the other user. When `mirror` is omitted, both users must share the same value. Blank values are treated as `Any` wildcards. If a filter points to a `mirror` label that is not explicitly defined elsewhere, the app auto-creates the mirrored companion dropdown with the same options.

```json
{
   "view": "RandomChat",
   "randomChat": {
      "includeAnyOption": true,
      "collapseAfterMs": 10000,
      "roomPrefix": "Call",
      "filters": [
         {
            "label": "I am",
            "options": "Male|Female",
            "mirror": "Looking for"
         },
         {
            "label": "Language",
            "key": "language",
            "options": "English|Spanish|French|German"
         }
      ]
   }
}
```

### WebRTC Signaling Flow

1. The server connection is established using Socket.IO, either by using token or account/user/pin authentication. Room support requires account/user/pin authentication.

2. **Broadcaster flow**:
   - Broadcaster publishes to a channel (directly or in a room after joining)
   - WebRTC peer connections is created and offer is sent for each channel viewer
   - Media tracks are added to each peer connection
   - ICE candidates are exchanged via the signaling server

3. **Player flow**:
   - Viewer joins a room or subscribes to a channel (when not using rooms)
   - Receives offer from the broadcaster
   - Generates an answer and sends it back
   - ICE candidates are exchanged via the signaling server
   - Processes incoming media tracks and renders the video

## Configuration and Setup

### Demo: Using a configuration file (recommended for development)

To keep your development configuration private and separate from the public repository:

1. Copy `public/unconfigured.json` to `public/config.json`:
2. Register for a free developer account at [WebRTCHost](https://webrtchost.com/hosting-plans/#WebRTC-Only) or setup your self-hosted [VideoWhisper Server](https://github.com/videowhisper/videowhisper-webrtc)
3. Edit `public/config.json` and fill your development server details, set `deny` to `false` to allow access
  This file is automatically added to `.gitignore` to prevent it from being published

The application will:
- First try to load `config.json` (your private config)
- Fall back to `unconfigured.json` if not found

Copy `unconfigured.json` to `config.json` file in the public folder with settings like:

```
{
    "channel": "{generate}",      // Will auto-generate a channel name
    "username": "{generate}",     // Will auto-generate a username
    "view": "BroadcastChat",          // Initial view mode, see Views section below
    "enableGET": true,            // Allow URL parameters to override config
   "configLock": false,          // true or ["channel","view"] to keep selected config keys authoritative
    "showURL": true,              // Show URL sharing button
    
    // Server configuration and authentication
    "videowhisperServer": {
        "socket": "wss://your-webrtc-server:3000",  // Your WebRTC server address
        
        // Authentication Option 1: Token-based authentication
        "authentication": "token",
        "token": "your-account-token-here",
        
        // Authentication Option 2: Account/User/Pin authentication
        // "authentication": "pin",
        // "account": "your-account-name",
        // "pin": "user-pin",
        // "user": "username" // Optional, defaults to the "username" value above
    },
    
    "stream": {
        "width": 640,
        "height": 360,
        "framerate": 15,
        "videoBitrate": 500,
        "audioBitrate": 32
    },
    "development": false  // Set to true for development mode and troubleshooting/logging
}
```


### Real Use: Custom configuration or integration

You can embed the application in your website and provide custom configuration through the `window.videowhisperConfig` object:

```html
<script>
window.videowhisperConfig = {
  configURL: "app-login.php" 
} 
</script>
```

You can use an integration script that provides streaming server details only to authenticated site users.
Further restrictions can be implemented on server side to limit access to streaming.

When `enableGET` is enabled but an integration must keep fetched config values authoritative, set `configLock`.

- `configLock: true` locks every key already provided by the fetched config or `window.videowhisperConfig`.
- `configLock: ["channel", "view"]` locks only those keys while leaving other GET overrides enabled.

## Building and Development

### Prerequisites

- Node.js 18.x or higher
- npm or pnpm package manager

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/videowhisper/Webcam-Streaming-WebRTC.git
   cd Webcam-Streaming-WebRTC
   ```

2. Install dependencies:
   ```bash
   npm install
   # or using pnpm
   pnpm install
   ```

3. Create a development configuration:
   - Copy `public/unconfigured.json` to `public/config.json`
   - Edit `public/config.json` with your WebRTC server details
   - Remove the `deny` property to enable access

4. Start the development server:
   ```bash
   npm run dev
   # or using pnpm
   pnpm dev
   ```

5. Access the application at `http://localhost:5173`

### Local View Testing

- Allow camera and microphone access in each browser profile you use for testing. `CallChat` and `RandomChat` will not join or publish media until `getUserMedia()` succeeds.
- `BroadcastChat`: open `http://localhost:5173/?view=BroadcastChat&channel=LocalBroadcast` and verify local preview, publish, chat, and share actions.
- `PlayChat`: open `http://localhost:5173/?view=PlayChat&channel=LocalBroadcast` in a second tab or browser while the broadcaster is live.
- `CallChat`: open the same URL such as `http://localhost:5173/?view=CallChat&channel=RoomTest` in two different browsers or browser profiles.
- `RandomChat`: open `http://localhost:5173/?view=RandomChat` in two different browsers or browser profiles and wait for `matchFound` to place both users into the same private room.
- `Chat`: open `http://localhost:5173/?view=Chat&channel=RoomTest` to verify room text chat without media.
- `Debugger`: with `"development": true` in `public/config.json`, use the debugger button in the watermark area to switch views at runtime.

### Local Auth Notes

- `Broadcast` and `Play` flows can work with account token auth.
- `CallChat`, `RandomChat`, and other room-based flows require `videowhisperServer.authentication: "pin"` plus an account that supports `user/pin` authentication through a configured `loginURL` on the signaling server.
- If room views fail with `connect_error` or `Authentication error`, verify the server account exists, has a valid `loginURL`, and that the `user` and `pin` values you are sending are accepted by that endpoint.

### Building for Production

1. Make sure your `vite.config.js` is set up correctly (the `config.json` will be excluded from the build)

2. Run the build command:
   ```bash
   npm run build
   # or using pnpm
   pnpm build
   ```

3. The build will be created in the `dist` directory

4. Deploy the contents of the `dist` directory to your web server
   - Note: You'll need to create a `config.json` file on your server as described in the installation instructions

When deploying, remember that the application requires a WebRTC signaling server to function properly.

## Development Best Practices

When developing or contributing to this project:

1. **Private Configuration**: Always use `config.json` for development and testing, not the public `unconfigured.json`
   - This file should contain your streaming server/account details and should not be shared publicly
   - The `unconfigured.json` file is a public template with out of the box values
2. **Environment Variables**: Consider using environment variables for sensitive data in production builds
3. **Configuration Template**: Update `unconfigured.json` if you add new configuration options
4. **Never Commit Credentials**: Ensure your private WebRTC server details are never committed to the repository

Use develoment mode for testing and debugging. The `development` property in `config.json` should be set to `true` during development. This enables:
- Verbose console logging for debugging
- Troubleshooting button in the UI to switch between views
- Force relay for WebRTC connections (useful for testing NAT traversal and TURN server functionality)

To prepare for publishing:
1. Ensure your private configuration (`config.json`) is added to `.gitignore`
2. Update `unconfigured.json` with placeholder values and the `deny` property
3. Update documentation as needed with any new configuration options

## Server Signaling

### Room Participant to Server
| Event | Parameters | Description |
|-------|-----------|-------------|
|`roomJoin` | `{room, options}` |  Joins a specific room/channel and can declare room meta such as `maxParticipants` |
|`roomLeave` | `{room}` |  Leaves a specific room/channel |
|`message` | `{from, target, type, content, ...}` | Sends a message to a specific target (peer or room) |

Rooms require account/user/pin authentication to join. Joining room also handles channel subscriptions for players.

### Broadcaster to Server

| Event | Parameters | Description |
|-------|-----------|-------------|
| `publish` | `(username, channel, params)` | Starts broadcasting to the specified channel |
| `messagePeer` | `{from, target, type, content, ...}` | Sends WebRTC signaling data to viewers |
| `roomPublish` | `{room, channel, parameters}` |  Publishes a channel in room |
| `roomUnpublish` | `{room, channel}` |  Stops publishing a room channel |

### Player (Viewer) to Server

| Event | Parameters | Description |
|-------|-----------|-------------|
| `subscribe` | `(username, channel)` | Subscribes to a broadcast channel |
| `messagePeer` | `{from, target, type, content, ...}` | Sends WebRTC signaling data to broadcaster |

### Server to Client

| Event | Description |
|-------|-------------|
| `message` | General WebRTC signaling data (offers, answers, candidates) |
| `peers` | List of connected WebRTC peers and ICE server configuration, for Broadcaster |
| `peer` | Notification when a new WebRTC peer joins, for Broadcaster |
| `publishError` | Error notification for broadcasting issues, for Broadcaster |
| `subscribeError` | Error notification for playback issues, for Viewer  |
| `roomUpdate` | Room updates that may include participants, messages, messageNew|
| `matchStatus` | Random queue status update with waiting count |
| `matchFound` | Random queue match result with the private room to join |

### WebRTC Message Types between Peers (messagePeer)

| Type | Purpose |
|------|---------|
| `offer` | Initial connection offer from broadcaster to viewer, includes and ICE config |
| `answer` | Viewer's response to an offer |
| `candidate` | ICE candidate for connection establishment |

### roomUpdate elements
Room updates are sent to participants in the room and may include the following elements:
| Element | Description |
|---------|-------------|
| `error` | Error message, in example for trying to use room without previously joining |
| `messages` | List of messages |
| `messageNew` | New message in room |
| `participants` | List of participants in the room |
| `meta` | Room metadata including participant counts and participant limit |

### Random Match Flow

`RandomChat` uses socket queue events on top of the room module:

| Event | Parameters | Description |
|-------|-----------|-------------|
| `randomQueueJoin` | `{queue, filters, definitions, roomPrefix, roomOptions}` | Queue the current user for random matching |
| `randomQueueLeave` | `{queue}` | Leave the random matching queue |

When a compatible peer is found, both clients receive `matchFound` with a private 2-user room and then join it through the regular `roomJoin` / `roomPublish` flow.

### 2 Authentication Methods

The application supports two methods for authenticating with the VideoWhisper WebRTC Server:

#### 1. Token-Based Authentication (Development/Internal Use)

```json
"videowhisperServer": {
    "socket": "wss://VideoWhisper-Server:3000",
    "authentication": "token",
    "token": "your-account-token-here"
}
```

This method connects to the server using a token that validates against a static token or an account token in the server's database. 
Because the token is disclosed to client browser, it is recommended to use this method only for development or internal use.

#### 2. Account/User/Pin Authentication (Production Use)

```json
"videowhisperServer": {
    "socket": "wss://VideoWhisper-Server:3000",
    "authentication": "pin",
    "account": "account-name",
    "user": "user-name",
    "pin": "user-pin"
}
```
`videowhisperServer.user` defaults to `username` value in the config.

This method authenticates using an account name, username, and PIN. The server needs to have the account configured with a `loginURL` property. The server will validate the credentials by making a POST request to this URL. 
As authentication Pin is per client, this is the recommended method for public production use.

A sample `loginURL` endpoint is provided in `public/login.json` for reference/testing:
```json
 {
   "login": true, 
   "message": "Login accepted for user"
   }
```

The server will make a POST request to this URL with these parameters (that an integration script can use to authenticate user and return login true/false):
```json
{
   "token": "account-token", 
   "user": "username", 
   "pin": "user-pin"
}
```

When implementing channel names take into consideration that server supports a `restrictPublish` setting per account for quck publishing authorization:
- `no` - no restrictions
- `username` - channel name should match the username
- `prefix` - channel name should start with the username
This is a quick way to prevent hijacking of channels by other users. Prefix can be used when you want to implement random channel names.

Benefits of using account/user/pin authentication:
- No need to store sensitive account tokens in client-side configurations
- Better user-specific access control
- Ability to implement custom authentication logic through the loginURL endpoint

## Styling and UI
Project uses [Tailwind CSS](https://tailwindcss.com/) for styling and [Vite](https://vite.dev). The UI is responsive and designed to work well on various screen sizes. For documentation on how to customize the styles, refer to the [Tailwind CSS + Vite documentation](https://tailwindcss.com/docs/installation/using-vite).

## Technologies Used
- **React**: JavaScript library for building user interfaces
- **Vite**: Build tool for fast development and production builds
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Socket.IO**: Library for real-time communication between client and server
- **WebRTC**: Technology for real-time peer-to-peer communication
- **Zustand**: State management library for React
- **VideoWhisper Server**: Signaling server for WebRTC connections