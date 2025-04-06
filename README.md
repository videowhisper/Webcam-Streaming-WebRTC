# Webcam Streaming WebRTC

A modern React JS application for real-time WebRTC webcam video streaming: Broadcast camera live to multiple viewers. Public source code & build included.

[Live Demo](https://demo.videowhisper.com/Webcam-Streaming-WebRTC/)

![Webcam Streaming WebRTC Illustration](images/illustration.jpg)

## Features

- **Real-time WebRTC video streaming** with peer-to-peer connections
- **Broadcast Mode**: Stream video from your camera to multiple viewers
- **Play Mode**: Watch streams from broadcasters
- **Camera Selection**: Switch between available camera devices
- **Audio Controls**: Mute/unmute microphone in broadcast mode or audio in playback mode
- **Connection Status Indicators**: Monitor connection state and viewer count
- **Responsive UI**: Built with Tailwind CSS
- **Stream URL Sharing**: Easily share links to your streams
- **Reconnection**: Handles on demand disconnect/reconnect

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
7. Test the disconnect/reconnect functionality by clicking the connection button

### Testing as a Viewer
1. From a broadcaster session, open the URL in a new tab 
2. Optionally copy the URL and open in another browser or device or share with a friend
3. Playback should start automatically 
4. Test the disconnect/reconnect functionality by clicking the connection (WiFi) button


## Installation Instructions

To install and run the application on your own server:

### Using Pre-built Distribution

1. Download or build the distribution files (the `dist` folder)
2. Upload the files from `dist` to a folder on your web server (Apache, Nginx, etc.)
3. Create a `config.json` file in the root folder (or duplicate `unconfigured.json`) and update it with your streaming server details:

```json
{
    "channel": "YourChannelName",
    "username": "{generate}",
    "view": "Broadcast",
    "enableGET": true,
    "showURL": true,
    "vwsSocket": "wss://your-webrtc-server:3000",
    "vwsToken": "your-token-here",
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

4. Replace `wss://your-webrtc-server:3000` and `your-token-here` with your VideoWhisper Server details (get a free account if you don't have own streaming server or account)
5. Access the application through your web server

### Requirements

- A web server with HTTPS (required for WebRTC in production)
- Access to a VideoWhisper Server that handles signaling, STUN/TURN (self-hosted [VideoWhisper Server](https://github.com/videowhisper/videowhisper-webrtc) or a *free* plan from [WebRTCHost](https://webrtchost.com/) )
- Modern browser with WebRTC support (Chrome, Firefox, Safari, Edge, Brave)

### Quick Demo Links

When `enableGET: true` is set in the config, you can use URL parameters to quickly access broadcast/playback for specific channels:

- Broadcasting: `/?view=Broadcast&channel=MyChannel`
- Viewing: `/?view=Play&channel=MyChannel`


## Technical Implementation

This project implements WebRTC-based video streaming using a client-server architecture with peer-to-peer connections:

### VideoWhisper WebRTC Server

The application connects to the [VideoWhisper WebRTC Server](https://github.com/videowhisper/videowhisper-webrtc) which acts as a signaling server to:
- Establish connections between peers
- Manage channel/room subscriptions
- Handle WebRTC session negotiation
- Provide ICE server configuration for NAT traversal (STUN/TURN configuration)
- Handle access and limitations for streaming

### Key Components

#### BroadcastWebRTC

The broadcaster component captures local media and establishes peer connections with viewers:

- **Media Capture**: Accesses the user's camera and microphone 
- **Multiple Connections**: Maintains separate WebRTC peer connections for each viewer
- **Connection Management**:
  - Creates and sends offers to new viewers
  - Processes ICE candidates
  - Monitors connection states
  - Tracks connected peer count
- **Camera Controls**: Provides UI to switch between available camera devices

#### PlayWebRTC

The viewer component receives and displays the broadcaster's stream:

- **Session Management**: Subscribes to channels using the signaling server
- **WebRTC Handling**:
  - Processes incoming offers from broadcasters
  - Generates and sends answers
  - Sets up media reception
  - Monitors connection quality
- **Stream Statistics**: Collects and displays info about video resolution, bitrate, and FPS
- **Auto-reconnection**: Attempts to reconnect when connections fail

### Connection Flow

1. The server connection is established using Socket.IO
2. **Broadcast flow**:
   - Publisher connects to the server and publishes to a channel
   - WebRTC peer connections are created for each viewer that joins
   - Media tracks are added to each peer connection
   - ICE candidates are exchanged via the signaling server

3. **Play flow**:
   - Viewer connects to the server and subscribes to a channel
   - Receives offer from the broadcaster
   - Generates an answer and sends it back
   - Processes incoming media tracks and renders the video

## Configuration and Setup

### Option 1: Using a private configuration file (recommended for development)

To keep your development configuration private and separate from the public repository:

1. Edit `public/config.json` with your development server details
2. This file is automatically added to `.gitignore` to prevent it from being published

The application will:
- First try to load `config.json` (your private config)
- Fall back to `unconfigured.json` if not found

### Option 2: Using the unconfigured configuration file

1. A template configuration file is provided at `public/unconfigured.json`
2. Register for a free developer account at [WebRTCHost](https://webrtchost.com/hosting-plans/#WebRTC-Only)
3. Edit the file with your own server details and remove the `deny` property:

```
{
    "channel": "{generate}",      // Will auto-generate a channel name
    "username": "{generate}",     // Will auto-generate a username
    "view": "Broadcast",          // Initial view mode: "Broadcast" or "Play"
    "enableGET": true,            // Allow URL parameters to override config
    "showURL": true,              // Show URL sharing button
    "vwsSocket": "wss://your-webrtc-server:3000",  // Your WebRTC server address
    "vwsToken": "your-token-here"  // Your authentication token,
    "deny": "Deny access to app" // for integrations deny message will prevent access when not logged in or configured
    "development": false, // Set to true for development mode and troubleshooting, logging
}
```

### Option 3: Custom configuration or integration

You can embed the application in your website and provide custom configuration through the `window.videowhisperConfig` object:

```html
<script>
window.videowhisperConfig = {
  configURL: "app-login.php" 
} 
```
You can use an integration script that only provides access to authenticated site users.

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

1. **Private Configuration**: Always use `config.json` for development and testing
2. **Environment Variables**: Consider using environment variables for sensitive data in production builds
3. **Configuration Template**: Update `config.template.json` if you add new configuration options
4. **Never Commit Credentials**: Ensure your private WebRTC server details are never committed to the repository

To prepare for publishing:
1. Ensure your private configuration (`config.json`) is added to `.gitignore`
2. Update `unconfigured.json` with placeholder values and the `deny` property
3. Update documentation as needed with any new configuration options


## Server Communication API

### Broadcaster to Server

| Event | Parameters | Description |
|-------|-----------|-------------|
| `publish` | `(username, channel, params)` | Starts broadcasting to the specified channel |
| `messagePeer` | `{from, target, type, content, ...}` | Sends WebRTC signaling data to viewers |

### Viewer to Server

| Event | Parameters | Description |
|-------|-----------|-------------|
| `subscribe` | `(username, channel)` | Subscribes to a broadcast channel |
| `messagePeer` | `{from, target, type, content, ...}` | Sends WebRTC signaling data to broadcaster |

### Server to Client

| Event | Description |
|-------|-------------|
| `message` | General WebRTC signaling data (offers, answers, candidates) |
| `peers` | List of connected peers and ICE server configuration, for Broadcaster |
| `peer` | Notification when a new peer joins, for Broadcaster |
| `publishError` | Error notification for broadcasting issues, for Broadcaster |
| `subscribeError` | Error notification for viewing issues, for Viewer  |

### WebRTC Message Types

| Type | Purpose |
|------|---------|
| `offer` | Initial connection offer from broadcaster to viewer |
| `answer` | Viewer's response to an offer |
| `candidate` | ICE candidate for connection establishment |
| `disconnect` | Notification of peer disconnection |


