import React, { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, Loader, Volume2, VolumeX, ArrowRight, Play } from "lucide-react";
import { isDevMode } from '../config/devMode';
import useAppStore from '../store/appStore';

export default function PlayWebRTC({ channel }) {
  const { config, socket } = useAppStore();
  const videoRef = useRef(null);
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [audioMuted, setAudioMuted] = useState(false);
  
  // Autoplay status tracking
  const [showTapToUnmute, setShowTapToUnmute] = useState(false);
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const [autoplayAttempted, setAutoplayAttempted] = useState(false);
  const unmuteTipTimeoutRef = useRef(null);
  
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
    lastTimestamp: Date.now()
  });

  useEffect(() => {
    if (!socket || !channel) return;

    // Setup socket event handlers
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("subscribeError", handleSubscribeError);
    socket.on("message", handleMessage);

    // Check initial socket state
    if (socket.connected) {
      handleConnect();
    } else {
      setIsConnecting(true);
    }

    return () => {
      // Clean up listeners
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("subscribeError", handleSubscribeError);
      socket.off("message", handleMessage);
      
      cleanupWebRTC();
    };
  }, [socket, channel, config.username]);

  // Handle socket connection
  const handleConnect = () => {
    if (isDevMode()) console.debug("PlayWebRTC socket connected — subscribing to", channel, "as", config.username || "Viewer");
    socket.emit("subscribe", config.username || "Viewer", channel);
    setIsConnecting(true);
    // Reset reconnect attempts on successful connection
    reconnectAttempts.current = 0;
  };

  // Handle socket disconnection
  const handleDisconnect = () => {
    if (isDevMode()) console.debug("PlayWebRTC socket disconnected");
    setIsLive(false);
    setIsConnecting(false);
    cleanupWebRTC();
  };

  // Handle subscription error
  const handleSubscribeError = (data) => {
    const errMsg = data?.message || "Subscription failed.";
    if (isDevMode()) console.debug("PlayWebRTC Subscribe error:", errMsg);
    setError(errMsg);
    setIsLive(false);
    setIsConnecting(false);
  };

  // Handle socket messages
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
  };

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
      
      // Wait a bit before trying to resubscribe
      setTimeout(() => {
        if (socket?.connected) {
          // Only re-subscribe to the channel if socket is connected
          socket.emit("subscribe", config.username || "Viewer", channel);
          setIsConnecting(true);
        } else {
          if (isDevMode()) console.debug("PlayWebRTC Socket not connected during reconnection attempt");
          // Reset UI state to connecting while waiting for socket to reconnect naturally
          setIsConnecting(true);
        }
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
        setIsLive(true); // Set live state immediately when we have tracks
        
        // Implement tiered autoplay approach
        const attemptAutoplay = () => {
          // Step 1: Try unmuted autoplay first (preferred)
          if (isDevMode()) console.debug("PlayWebRTC Attempting unmuted autoplay");
          
          videoRef.current.muted = false;
          setAudioMuted(false);
          
          videoRef.current.play()
            .then(() => {
              // Successful unmuted autoplay
              if (isDevMode()) console.debug("PlayWebRTC Unmuted autoplay succeeded");
              setError(null);
              setShowTapToUnmute(false);
              setShowTapToPlay(false);
              setAutoplayAttempted(true);
            })
            .catch(err => {
              // Step 2: If unmuted fails, try muted autoplay
              console.debug("PlayWebRTC Unmuted autoplay failed:", err);
              
              if (isDevMode()) console.debug("PlayWebRTC Attempting muted autoplay");
              videoRef.current.muted = true;
              setAudioMuted(true);
              setShowTapToUnmute(true);
              
              videoRef.current.play()
                .then(() => {
                  // Muted autoplay succeeded
                  if (isDevMode()) console.debug("PlayWebRTC Muted autoplay succeeded");
                  setError(null);
                  setShowTapToPlay(false);
                  setShowTapToUnmute(true);
                  setAutoplayAttempted(true);
                  
                  // Set timeout to hide the unmute tooltip after 5 seconds
                  if (unmuteTipTimeoutRef.current) {
                    clearTimeout(unmuteTipTimeoutRef.current);
                  }
                  unmuteTipTimeoutRef.current = setTimeout(() => {
                    setShowTapToUnmute(false);
                  }, 5000);
                })
                .catch(mutedErr => {
                  // Step 3: All autoplay attempts failed, show central play button
                  console.debug("PlayWebRTC Muted autoplay also failed:", mutedErr);
                  setShowTapToPlay(true);
                  setShowTapToUnmute(false);
                  setAutoplayAttempted(true);
                });
            });
        };
        
        // Start the tiered autoplay process if not already attempted
        if (!autoplayAttempted) {
          attemptAutoplay();
        }
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
    
    // Reset the broadcasterId so we don't retain any stale connection info
    broadcasterId.current = null;
  };

  // Toggle audio mute function
  const toggleAudioMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setAudioMuted(videoRef.current.muted);
      
      // Hide the unmute tooltip when the mute button is clicked
      if (showTapToUnmute) {
        setShowTapToUnmute(false);
        // Clear timeout to prevent it from being hidden twice
        if (unmuteTipTimeoutRef.current) {
          clearTimeout(unmuteTipTimeoutRef.current);
          unmuteTipTimeoutRef.current = null;
        }
      }
      
      if (isDevMode()) {
        console.debug('PlayWebRTC Audio ' + (videoRef.current.muted ? 'muted' : 'unmuted'));
      }
      
      // If we have an active peer connection, we could also try to stop receiving audio track
      if (peerConnection.current && videoRef.current.muted) {
        try {
          // This is an advanced approach that attempts to stop receiving the audio track completely
          // It may not be supported in all browsers and situations
          const transceivers = peerConnection.current.getTransceivers();
          transceivers.forEach(transceiver => {
            if (transceiver.receiver && transceiver.receiver.track && transceiver.receiver.track.kind === 'audio') {
              if (isDevMode()) console.debug('PlayWebRTC Found audio transceiver, setting direction to recvonly/inactive');
              // Try to stop receiving audio data - browser support varies
              transceiver.direction = "inactive";
            }
          });
        } catch (err) {
          console.debug('PlayWebRTC Unable to modify audio transceiver direction:', err);
          // Fallback to just muting the audio element, which we've already done
        }
      } else if (peerConnection.current && !videoRef.current.muted) {
        // If unmuting and we have a connection, ensure we're receiving audio again
        try {
          const transceivers = peerConnection.current.getTransceivers();
          transceivers.forEach(transceiver => {
            if (transceiver.receiver && transceiver.receiver.track && transceiver.receiver.track.kind === 'audio') {
              if (isDevMode()) console.debug('PlayWebRTC Found audio transceiver, setting direction back to recvonly');
              transceiver.direction = "recvonly";
            }
          });
        } catch (err) {
          console.debug('PlayWebRTC Unable to modify audio transceiver direction:', err);
          // Video is already unmuted from earlier, so no need for additional fallback
        }
      }
    }
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
        <div 
          className="absolute inset-x-0 bottom-5 mx-auto w-fit bg-red-700 opacity-70 text-white px-4 py-2 rounded shadow-lg z-50"
        >
          <p>{error}</p>
          <button onClick={() => setError(null)} className="ml-4 underline opacity-70 hover:opacity-100 transition-opacity">Close</button>
        </div>
      )}
      
      {/* Stats display overlay */}
      {isLive && isDevMode() && (
        <div 
          className="absolute bottom-5 left-5 bg-black opacity-60 text-white text-xs p-2 rounded"
        >
          <div>Resolution: {stats.video.resolution}</div>
          <div>FPS: {stats.video.fps}</div>
          <div>Video: {stats.video.bitrate} kbps</div>
          <div>Audio: {stats.audio.bitrate} kbps</div>
        </div>
      )}
      
      {/* Audio Mute Button - Top Right */}
      <button
        onClick={toggleAudioMute}
        className="absolute top-5 right-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200 group"
        title={audioMuted ? "Unmute Audio" : "Mute Audio"}
      >
        {audioMuted ? 
          <VolumeX size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity" /> : 
          <Volume2 size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        }
      </button>

      {/* Tap to Unmute indicator - shows to the left of the mute button when video is playing but muted */}
      {showTapToUnmute && (
        <div className="absolute top-6 right-20 flex items-center">
          <div className="bg-black bg-opacity-70 text-white px-3 py-2 rounded-lg text-sm">
            Tap to unmute
          </div>
          {/* Arrow pointing to the mute button using Lucide ArrowRight */}
          <ArrowRight size={16} className="text-white ml-2" />
        </div>
      )}

      {/* Connection Status Indicator */}
        <div
          className="absolute top-20 right-5 px-4 py-2 opacity-70 text-white group flex items-center gap-2"
          title={
            isLive ? "Connected to Stream"
            : isConnecting ? "Connecting..."
            : "Disconnected"
          }
        >
          {isLive ? 
            <Wifi size={20} strokeWidth={2} className="text-green-500" /> : 
            isConnecting ? 
            <Loader size={20} strokeWidth={2} className="text-yellow-500 animate-spin" /> : 
            <WifiOff size={20} strokeWidth={2} className="text-red-500" />
          }
        </div>
        
        {/* Centered Tap to Play button - shows when all autoplay attempts fail */}
      {showTapToPlay && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 cursor-pointer"
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.muted = false; // Try to play unmuted first
              setAudioMuted(false);
              
              videoRef.current.play()
                .then(() => {
                  // Successful play
                  setShowTapToPlay(false);
                  setError(null);
                })
                .catch(err => {
                  console.debug("PlayWebRTC Manual unmuted play failed, trying muted:", err);
                  
                  // If unmuted fails, try muted
                  videoRef.current.muted = true;
                  setAudioMuted(true);
                  setShowTapToUnmute(true);
                  
                  videoRef.current.play()
                    .then(() => {
                      // Muted play succeeded
                      setShowTapToPlay(false);
                    })
                    .catch(mutedErr => {
                      console.error("PlayWebRTC All play attempts failed:", mutedErr);
                      setError("Could not play video: " + mutedErr.message);
                    });
                });
            }
          }}
        >
          <div className="bg-black bg-opacity-70 text-white p-6 rounded-full flex flex-col items-center animate-pulse">
            <Play size={48} strokeWidth={2} />
            <span className="mt-2 font-medium">Tap to Play</span>
          </div>
        </div>
      )}
    </div>
  );
}