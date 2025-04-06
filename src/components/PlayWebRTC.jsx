import React, { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, Loader } from "lucide-react";
import { isDevMode } from '../config/devMode';

export default function PlayWebRTC({ config, channel, socket }) {
  const videoRef = useRef(null);
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  
  // WebRTC related states and refs
  const [peerConfig, setPeerConfig] = useState({ 'iceServers': [] });
  const peerConnection = useRef(null);
  const broadcasterId = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;
  
  // Stats tracking
  const [stats, setStats] = useState({
    video: { bitrate: 0, fps: 0, resolution: '' },
    audio: { bitrate: 0 },
    connection: { state: '', quality: 'good' }
  });
  const statsInterval = useRef(null);
  const statsRef = useRef({ 
    resolution: '', 
    fps: 0,
    lastVideoBytes: 0,
    lastAudioBytes: 0,
    lastTimestamp: 0
  });

  useEffect(() => {
    if (!socket || !channel) return;

    const handleConnect = () => {
      if (isDevMode()) console.debug("PlayWebRTC socket connected — subscribing to", channel, "as", config.username || "Viewer");
      socket.emit("subscribe", config.username || "Viewer", channel);
      setIsConnecting(true);
      // Reset reconnect attempts on successful connection
      reconnectAttempts.current = 0;
    };

    const handleDisconnect = () => {
      if (isDevMode()) console.debug("PlayWebRTC socket disconnected");
      setIsLive(false);
      setIsConnecting(false);
      cleanupWebRTC();
    };

    const handleSubscribeError = (data) => {
      const errMsg = data?.message || "Subscription failed.";
      if (isDevMode()) console.debug("PlayWebRTC Subscribe error:", errMsg);
      setError(errMsg);
      setIsLive(false);
      setIsConnecting(false);
    };

    // Handle WebRTC messages from the server
    const handleMessage = (message) => {
      if (isDevMode()) console.debug("PlayWebRTC Message received:", message);
      
      if (message.type === "offer") {
        // Store the broadcaster's ID
        broadcasterId.current = message.from;
        
        // Save ICE server configuration if provided
        if (message.peerConfig) {
          setPeerConfig(message.peerConfig);
        }
        
        // Set up WebRTC connection
        handleOfferMessage(message);
      } 
      else if (message.type === "candidate" && peerConnection.current && message.candidate) {
        // Add incoming ICE candidates
        peerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate))
          .catch(error => console.error("Error adding received ICE candidate", error));
      }
      // Handle broadcaster information
      else if (message.type === "broadcaster" && message.broadcasterId) {
        broadcasterId.current = message.broadcasterId;
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("subscribeError", handleSubscribeError);
    socket.on("message", handleMessage);

    if (socket.connected) {
      handleConnect();
    } else {
      setIsConnecting(true);
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("subscribeError", handleSubscribeError);
      socket.off("message", handleMessage);
      
      cleanupWebRTC();
    };
  }, [socket, channel, config.username]);

  // Process an offer message from the broadcaster
  const handleOfferMessage = async (message) => {
    try {
      // Always clean up any existing peer connection first
      cleanupWebRTC();
      
      // Create a new peer connection with the provided config
      peerConnection.current = new RTCPeerConnection(peerConfig);
      
      // Set up event handlers for the peer connection
      setupPeerConnectionHandlers();
      
      // Set the remote description from the offer
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.content));
      
      // Create and send an answer
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      
      if (isDevMode()) console.debug("PlayWebRTC Sending answer to:", message.from);
      
      // Send the answer back through the signaling server
      socket.emit("messagePeer", {
        type: "answer",
        from: config.username || "Viewer",
        target: message.from,
        content: answer
      });
      
      // Start collecting stats
      startStatsCollection();
      
    } catch (err) {
      console.error("Error handling offer:", err);
      setError(`Connection error: ${err.message}`);
      
      // Try to reconnect if within attempt limits
      handleReconnect();
    }
  };

  // Handle reconnection logic
  const handleReconnect = () => {
    if (reconnectAttempts.current < maxReconnectAttempts) {
      reconnectAttempts.current += 1;
      
      if (isDevMode()) console.debug(`PlayWebRTC reconnection attempt ${reconnectAttempts.current} of ${maxReconnectAttempts}`);
      
      // Clean up first
      cleanupWebRTC();
      
      // Wait a bit before trying to reconnect
      setTimeout(() => {
        if (!socket.connected) {
          socket.connect();
        } else {
          // Re-subscribe to the channel
          socket.emit("subscribe", config.username || "Viewer", channel);
        }
        setIsConnecting(true);
      }, 1000);
    } else {
      if (isDevMode()) console.debug("PlayWebRTC max reconnection attempts reached");
      setError("Failed to connect after multiple attempts. Please try again.");
    }
  };

  // Set up all event listeners for the peer connection
  const setupPeerConnectionHandlers = () => {
    if (!peerConnection.current) return;
    
    // Handle incoming media tracks
    peerConnection.current.ontrack = (event) => {
      if (isDevMode()) console.debug("PlayWebRTC Received remote track:", event.track.kind);
      
      if (videoRef.current && event.streams && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        
        // Try to play the video automatically
        videoRef.current.play().catch(err => {
          console.warn("PlayWebRTC Auto-play failed:", err);
          // Show play button or notification to user
        });
      }
    };
    
    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && broadcasterId.current) {
        if (isDevMode()) console.debug("PlayWebRTC Sending ICE candidate to broadcaster");
        
        socket.emit("messagePeer", {
          type: "candidate",
          from: config.username || "Viewer",
          target: broadcasterId.current, 
          candidate: event.candidate
        });
      }
    };
    
    // Monitor connection state changes
    peerConnection.current.onconnectionstatechange = () => {
      if (!peerConnection.current) return;
      
      const connectionState = peerConnection.current.connectionState;
      if (isDevMode()) console.debug("PlayWebRTC Connection state changed:", connectionState);
      
      if (connectionState === 'connected') {
        setIsConnecting(false);
        setIsLive(true);
        reconnectAttempts.current = 0; // Reset attempts on successful connection
      } else if (connectionState === 'disconnected') {
        // Wait a bit to see if it auto-recovers
        setTimeout(() => {
          if (peerConnection.current && peerConnection.current.connectionState === 'disconnected') {
            setIsLive(false);
            stopStatsCollection();
            handleReconnect();
          }
        }, 2000);
      } else if (connectionState === 'failed' || connectionState === 'closed') {
        setIsConnecting(false);
        setIsLive(false);
        stopStatsCollection();
        handleReconnect();
      }
      
      setStats(prev => ({
        ...prev,
        connection: { ...prev.connection, state: connectionState }
      }));
    };
    
    // Monitor ICE connection state
    peerConnection.current.oniceconnectionstatechange = () => {
      if (!peerConnection.current) return;
      if (isDevMode()) console.debug("PlayWebRTC ICE connection state:", peerConnection.current.iceConnectionState);
      
      // If ICE fails, try to reconnect
      if (peerConnection.current.iceConnectionState === 'failed') {
        handleReconnect();
      }
    };
  };

  // Start collecting stats on the connection
  const startStatsCollection = () => {
    // Only collect stats in dev mode
    if (!isDevMode()) return;
    
    stopStatsCollection(); // Clear any existing interval
    
    // Reset stats reference values
    statsRef.current = {
      resolution: '',
      fps: 0,
      lastVideoBytes: 0,
      lastAudioBytes: 0,
      lastTimestamp: Date.now()
    };
    
    // Log initial stream information when media tracks are received
    if (videoRef.current && videoRef.current.srcObject) {
      const videoTracks = videoRef.current.srcObject.getVideoTracks();
      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        const settings = videoTrack.getSettings();
        console.debug("PlayWebRTC Initial video track settings:", {
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
          deviceId: settings.deviceId
        });
      }
    }
    
    statsInterval.current = setInterval(() => {
      if (!peerConnection.current) return;
      
      const now = Date.now();
      const timeDelta = now - statsRef.current.lastTimestamp; // ms since last update
      
      // Collect stats for video and audio tracks
      peerConnection.current.getReceivers().forEach(receiver => {
        if (!receiver.track) return;
        
        receiver.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'inbound-rtp') {
              const kind = report.kind;
              
              if (kind === 'video') {
                // Calculate actual bitrate based on bytes received since last check
                const videoBytes = report.bytesReceived || 0;
                let videoBitrate = 0;
                
                if (statsRef.current.lastVideoBytes > 0 && timeDelta > 0) {
                  const bytesDelta = videoBytes - statsRef.current.lastVideoBytes;
                  // Convert from bps to kbps (divide by 1000)
                  videoBitrate = Math.round((bytesDelta * 8) / (timeDelta / 1000) / 1000);
                }
                
                // Update last bytes value for next calculation
                statsRef.current.lastVideoBytes = videoBytes;
                
                const resolution = `${report.frameWidth}x${report.frameHeight}`;
                // Log detailed video stats when they change
                if (statsRef.current.resolution !== resolution || 
                   statsRef.current.packetsLost !== report.packetsLost) {
                  
                  console.debug("PlayWebRTC Video stats updated:", {
                    resolution: resolution,
                    frameRate: report.framesPerSecond,
                    bitrate: videoBitrate + ' kbps',
                    packetsLost: report.packetsLost,
                    jitter: report.jitter
                  });
                  
                  // Store current values for change detection
                  statsRef.current.resolution = resolution;
                  statsRef.current.fps = report.framesPerSecond;
                  statsRef.current.packetsLost = report.packetsLost;
                  statsRef.current.jitter = report.jitter;
                }
                
                setStats(prev => ({
                  ...prev,
                  video: {
                    bitrate: videoBitrate,
                    fps: report.framesPerSecond || 0,
                    resolution: resolution
                  }
                }));
              } else if (kind === 'audio') {
                // Calculate actual audio bitrate based on bytes since last check
                const audioBytes = report.bytesReceived || 0;
                let audioBitrate = 0;
                
                if (statsRef.current.lastAudioBytes > 0 && timeDelta > 0) {
                  const bytesDelta = audioBytes - statsRef.current.lastAudioBytes;
                  // Convert from bps to kbps (divide by 1000)
                  audioBitrate = Math.round((bytesDelta * 8) / (timeDelta / 1000) / 1000);
                }
                
                // Update last bytes value for next calculation
                statsRef.current.lastAudioBytes = audioBytes;
                
                setStats(prev => ({
                  ...prev,
                  audio: {
                    bitrate: audioBitrate
                  }
                }));
              }
              
              // Check packet loss for connection quality
              if (report.packetsLost > 0) {
                setStats(prev => ({
                  ...prev,
                  connection: { ...prev.connection, quality: 'poor' }
                }));
              }
            }
          });
        });
      });
      
      // Update timestamp for next interval
      statsRef.current.lastTimestamp = now;
    }, 2000);
  };

  // Stop stats collection
  const stopStatsCollection = () => {
    if (statsInterval.current) {
      clearInterval(statsInterval.current);
      statsInterval.current = null;
    }
  };

  // Clean up WebRTC resources
  const cleanupWebRTC = () => {
    stopStatsCollection();
    
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const disconnectStream = () => {
    if (socket) {
      socket.disconnect();
      setIsLive(false);
      setIsConnecting(false);
      
      // Ensure we completely clean up WebRTC resources
      cleanupWebRTC();
      
      // Reset the broadcasterId so we don't retain any stale connection info
      broadcasterId.current = null;
      
      if (isDevMode()) console.debug("PlayWebRTC Disconnected manually");
    }
  };

  const connectStream = () => {
    // Reset connection state and cleanup first
    setIsConnecting(true);
    reconnectAttempts.current = 0;
    
    // Ensure clean slate before reconnecting
    cleanupWebRTC();
    
    // Connect to server
    socket.connect();
    
    if (isDevMode()) console.debug("PlayWebRTC Manual connect attempt");
  };

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain bg-black"
      />
      {error && (
        <div className="absolute inset-x-0 bottom-5 mx-auto w-fit bg-red-700 text-white px-4 py-2 rounded shadow-lg z-50">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="ml-4 underline">Close</button>
        </div>
      )}
      
      {/* Stats display overlay */}
      {isLive && isDevMode() && (
        <div className="absolute bottom-5 left-5 bg-black bg-opacity-70 text-white text-xs p-2 rounded">
          <div>Resolution: {stats.video.resolution}</div>
          <div>FPS: {stats.video.fps}</div>
          <div>Video: {stats.video.bitrate} kbps</div>
          <div>Audio: {stats.audio.bitrate} kbps</div>
        </div>
      )}

      <button
        onClick={() => {
          if (isLive || isConnecting) {
            disconnectStream();
          } else {
            connectStream();
          }
        }}
        className={`absolute top-5 right-5 p-3 rounded-full shadow-lg transition-all flex items-center justify-center pointer-events-auto border
          ${isLive ? 'bg-green-600 text-white hover:bg-green-700' : isConnecting ? 'bg-yellow-600 text-white hover:bg-yellow-700' : 'bg-red-600 text-white hover:bg-red-700'}
        `}
        title={
          isLive ? "Disconnect Stream"
          : isConnecting ? "Connecting..."
          : "Connect"
        }
      >
        {isLive ? <Wifi size={20} /> : isConnecting ? <Loader size={20} className="animate-spin" /> : <WifiOff size={20} />}
      </button>
    </div>
  );
}
