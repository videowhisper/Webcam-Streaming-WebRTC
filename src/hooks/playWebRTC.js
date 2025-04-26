// src/hooks/usePlayWebRTC.js
// Custom hook for WebRTC playback logic (extracted from PlayWebRTC)
import { useEffect, useRef, useState, useCallback } from 'react';
import useAppStore from '../store/appStore';
import { isDevMode } from '../config/devMode';

// Accept streamId (broadcaster's username) as prop
export default function usePlayWebRTC(streamId) {
  const { config, socket } = useAppStore();
  const videoRef = useRef(null);
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [showTapToUnmute, setShowTapToUnmute] = useState(false);
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const [autoplayAttempted, setAutoplayAttempted] = useState(false);
  const unmuteTipTimeoutRef = useRef(null);
  const [peerConfig, setPeerConfig] = useState({ 'iceServers': [] });
  const peerConnection = useRef(null);
  const broadcasterIdRef = useRef(null); // Store the actual broadcaster socket ID for signaling
  const targetStreamIdRef = useRef(streamId); // Store the target stream ID (broadcaster username)
  const targetChannelRef = useRef(null); // Store the WebRTC channel associated with the target stream
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;
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

  // Ref for socket only
  const socketRef = useRef(socket);
  // REMOVE: usernameRef, roomNameRef

  // Update refs when props/state change
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    targetStreamIdRef.current = streamId;
    targetChannelRef.current = null;
  }, [streamId]);


  // --- Cleanup Logic --- (No changes needed here, already uses refs correctly)
  const cleanupWebRTC = useCallback(() => {
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
    broadcasterIdRef.current = null;
  }, []);

  // --- Handlers ---
  const handleConnect = useCallback(() => {
    const currentSocket = socketRef.current;
    // Use direct config values
    const room = config?.channel;
    const user = config?.username || "Viewer";

    if (!currentSocket || !room) {
        if (isDevMode()) console.debug("PlayWebRTC: Cannot join room - missing socket or room name");
        setError("Cannot join: Missing connection details.");
        setIsConnecting(false);
        return;
    }

    if (isDevMode()) console.debug(`PlayWebRTC socket connected — joining room ${room} as ${user}`);
    currentSocket.emit("roomJoin", { room: room });
    setIsConnecting(true);
    reconnectAttempts.current = 0;
  }, [config?.channel, config?.username]); // Add config dependencies

  const handleDisconnect = useCallback(() => {
    if (isDevMode()) console.debug("PlayWebRTC socket disconnected");
    cleanupWebRTC();
  }, [cleanupWebRTC]);

  // Keep subscribeError for channel-level issues from webrtcModule
  const handleSubscribeError = useCallback((data) => {
    const errMsg = data?.message || "Subscription failed.";
    if (isDevMode()) console.debug("PlayWebRTC Subscribe error:", errMsg);
    setError(`Stream Error: ${errMsg}`);
    cleanupWebRTC();
  }, [cleanupWebRTC]);

  // Handle room-specific updates
  const handleRoomUpdate = useCallback((message) => {
    if (isDevMode()) console.debug('PlayWebRTC: Room update received:', message);

    const room = config?.channel; // Use direct config value

    // Ensure the update is for the current room
    if (!room || message.room !== room) {
        if (isDevMode()) console.debug('PlayWebRTC: Ignoring roomUpdate for different room:', message.room);
        return;
    }

    // Handle errors sent via roomUpdate
    if (message.error) {
        console.error(`PlayWebRTC: Room error for ${message.room}:`, message.error);
        setError(`Room Error: ${message.error}`);
        cleanupWebRTC(); // Clean up on room error
        return; // Stop processing if there's an error
    }

    // Process room state to find the target stream's channel
    const processRoomData = (data) => {
        if (!data || !data.streams) return;
        const targetStream = data.streams[targetStreamIdRef.current];
        if (targetStream) {
            if (isDevMode()) console.debug(`PlayWebRTC: Found target stream ${targetStreamIdRef.current} in room data. Channel: ${targetStream.channel}, Broadcaster SocketID: ${targetStream.socketId}`);
            targetChannelRef.current = targetStream.channel;
            broadcasterIdRef.current = targetStream.socketId; // Store broadcaster's socket ID for signaling
        } else {
            if (isDevMode()) console.debug(`PlayWebRTC: Target stream ${targetStreamIdRef.current} not found in room data.`);
            // Consider setting an error or status if stream not found after a delay
        }
    };

    // process other room updates here, when needed
    
  }, [config?.channel, cleanupWebRTC]); // Add config.channel dependency


  // --- Reconnect Logic --- (Depends on handleConnect, cleanupWebRTC)
  const handleReconnect = useCallback(() => {
    if (reconnectAttempts.current < maxReconnectAttempts) {
      reconnectAttempts.current += 1;
      if (isDevMode()) console.debug(`PlayWebRTC reconnection attempt ${reconnectAttempts.current} of ${maxReconnectAttempts}`);
      cleanupWebRTC(); // Clean up before attempting reconnect
      setTimeout(() => {
        const currentSocket = socketRef.current;
        if (currentSocket?.connected) {
          // Re-join the room
          handleConnect(); // handleConnect uses config values
        } else {
          if (isDevMode()) console.debug("PlayWebRTC Socket not connected during reconnection attempt");
          setIsConnecting(true);
        }
      }, 1000 + Math.random() * 2000);
    } else {
      if (isDevMode()) console.debug("PlayWebRTC max reconnection attempts reached");
      setError("Failed to connect after multiple attempts. Please try again.");
      cleanupWebRTC();
    }
  }, [cleanupWebRTC, handleConnect]); // Add handleConnect dependency

  // --- Peer Connection Setup --- (Depends on handleReconnect)
  const setupPeerConnectionHandlers = useCallback(() => {
    if (!peerConnection.current) return;

    peerConnection.current.ontrack = (event) => {
      if (isDevMode()) console.debug("PlayWebRTC Received remote track:", event.track.kind);
      if (videoRef.current && event.streams && event.streams[0]) {
        // Check if srcObject is already set to this stream to avoid unnecessary resets
        if (videoRef.current.srcObject !== event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            if (isDevMode()) console.debug("PlayWebRTC: Set video srcObject.");
        } else {
            if (isDevMode()) console.debug("PlayWebRTC: Video srcObject already set.");
        }
        setIsLive(true); // Mark as live once tracks are received
        setIsConnecting(false); // Not connecting anymore
        if (!autoplayAttempted) {
          attemptAutoplay(); // Call attemptAutoplay here
        }
      }
    };

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && broadcasterIdRef.current) {
        if (isDevMode()) console.debug("PlayWebRTC Sending ICE candidate to broadcaster:", broadcasterIdRef.current);
        socketRef.current.emit("messagePeer", {
          type: "candidate",
          from: config?.username || "Viewer", // Use direct config value
          target: broadcasterIdRef.current,
          channel: targetChannelRef.current,
          candidate: event.candidate
        });
      }
    };

    peerConnection.current.onconnectionstatechange = () => {
      if (!peerConnection.current) return;
      const connectionState = peerConnection.current.connectionState;
      if (isDevMode()) console.debug("PlayWebRTC Connection state changed:", connectionState);

      setStats(prev => ({
        ...prev,
        connection: { ...prev.connection, state: connectionState }
      }));

      switch (connectionState) {
          case 'connected':
              setIsConnecting(false);
              setIsLive(true);
              reconnectAttempts.current = 0;
              break;
          case 'disconnected':
              setTimeout(() => {
                  if (peerConnection.current && peerConnection.current.connectionState === 'disconnected') {
                      if (isDevMode()) console.debug("PlayWebRTC: Connection disconnected, attempting reconnect...");
                      setIsLive(false); // Mark as not live
                      stopStatsCollection(); // Call stopStatsCollection here
                      handleReconnect();
                  }
              }, 3000);
              break;
          case 'failed':
          case 'closed':
              setIsConnecting(false);
              setIsLive(false);
              stopStatsCollection(); // Call stopStatsCollection here
              handleReconnect();
              break;
      }
    };
    peerConnection.current.oniceconnectionstatechange = () => {
      if (!peerConnection.current) return;
      if (isDevMode()) console.debug("PlayWebRTC ICE connection state:", peerConnection.current.iceConnectionState);
      if (peerConnection.current.iceConnectionState === 'failed') {
        handleReconnect(); // Call handleReconnect
      }
    };
  }, [autoplayAttempted, handleReconnect, config?.username]);

  // --- Offer Handling --- (Depends on setupPeerConnectionHandlers, handleReconnect)
  const handleOfferMessage = useCallback(async (message) => {

    try {

     if (peerConnection.current) {
          if (isDevMode()) console.debug("PlayWebRTC: Cleaning up existing peer connection before handling new offer for message:", message);
          peerConnection.current.close();
      }

      peerConnection.current = new RTCPeerConnection(message.peerConfig);
      setupPeerConnectionHandlers(); // Setup handlers for the new connection

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.content));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      // Use the specific broadcaster socket ID stored in broadcasterIdRef
        const messageAnswer = {
        type: "answer",
        from: config?.username || "Viewer", // Use direct config value
        target:  message.from, // Target the specific broadcaster socket
        channel:  message.channel, // Include channel context
        content: answer
      };

        if (isDevMode()) console.debug("PlayWebRTC Sending answer message:", messageAnswer);

      socketRef.current.emit("messagePeer", messageAnswer);
      startStatsCollection(); // Call startStatsCollection here
    } catch (err) {
      console.error("Error handling offer:", err);
      setError(`Connection error: ${err.message}`);
      handleReconnect(); // Attempt reconnect on offer handling error
    }

  // REMOVE startStatsCollection from dependencies
  }, [peerConfig, setupPeerConnectionHandlers, handleReconnect, config?.username]);

  // Handle WebRTC signaling messages (Depends on handleOfferMessage)
  const handleMessage = useCallback((message) => {
    if (isDevMode()) console.debug("PlayWebRTC Message received:", message);

    if (message.type === "offer") {
      if (!broadcasterIdRef.current) broadcasterIdRef.current = message.from;
      if (message.peerConfig) setPeerConfig(message.peerConfig);
      handleOfferMessage(message); // Call handleOfferMessage
    } else if (message.type === "candidate" && peerConnection.current && message.candidate) {
      peerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate))
        .catch(error => console.error("Error adding received ICE candidate", error));
    }
  }, [handleOfferMessage]); // Add handleOfferMessage dependency


  // --- Autoplay logic --- (No changes needed)
  const attemptAutoplay = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = false;
    setAudioMuted(false);
    videoRef.current.play()
      .then(() => {
        if (isDevMode()) console.debug("PlayWebRTC Unmuted autoplay succeeded");
        setError(null);
        setShowTapToUnmute(false);
        setShowTapToPlay(false);
        setAutoplayAttempted(true);
      })
      .catch(err => {
        if (isDevMode()) console.debug("PlayWebRTC Unmuted autoplay failed:", err);
        videoRef.current.muted = true;
        setAudioMuted(true);
        setShowTapToUnmute(true);
        videoRef.current.play()
          .then(() => {
            if (isDevMode()) console.debug("PlayWebRTC Muted autoplay succeeded");
            setError(null);
            setShowTapToPlay(false);
            setShowTapToUnmute(true);
            setAutoplayAttempted(true);
            if (unmuteTipTimeoutRef.current) clearTimeout(unmuteTipTimeoutRef.current);
            unmuteTipTimeoutRef.current = setTimeout(() => setShowTapToUnmute(false), 5000);
          })
          .catch(mutedErr => {
            if (isDevMode()) console.debug("PlayWebRTC Muted autoplay also failed:", mutedErr);
            setShowTapToPlay(true);
            setShowTapToUnmute(false);
            setAutoplayAttempted(true);
          });
      });
  }, [autoplayAttempted]);

  // --- Stats collection logic ---
  const startStatsCollection = useCallback(() => {
    if (!isDevMode()) return;
    stopStatsCollection();
    statsRef.current = {
      resolution: '',
      fps: 0,
      lastVideoBytes: 0,
      lastAudioBytes: 0,
      lastTimestamp: Date.now()
    };
    if (videoRef.current && videoRef.current.srcObject) {
      const videoTracks = videoRef.current.srcObject.getVideoTracks();
      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        const settings = videoTrack.getSettings();
        console.debug("PlayWebRTC Initial video track settings:", settings);
      }
    }
    statsInterval.current = setInterval(() => {
      if (!peerConnection.current) return;
      const now = Date.now();
      const timeDelta = now - statsRef.current.lastTimestamp;
      peerConnection.current.getReceivers().forEach(receiver => {
        if (!receiver.track) return;
        receiver.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'inbound-rtp') {
              const kind = report.kind;
              if (kind === 'video') {
                const videoBytes = report.bytesReceived || 0;
                let videoBitrate = 0;
                if (statsRef.current.lastVideoBytes > 0 && timeDelta > 0) {
                  const bytesDelta = videoBytes - statsRef.current.lastVideoBytes;
                  videoBitrate = Math.round((bytesDelta * 8) / (timeDelta / 1000) / 1000);
                }
                statsRef.current.lastVideoBytes = videoBytes;
                const resolution = `${report.frameWidth}x${report.frameHeight}`;
                if (statsRef.current.resolution !== resolution) {
                  statsRef.current.resolution = resolution;
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
                const audioBytes = report.bytesReceived || 0;
                let audioBitrate = 0;
                if (statsRef.current.lastAudioBytes > 0 && timeDelta > 0) {
                  const bytesDelta = audioBytes - statsRef.current.lastAudioBytes;
                  audioBitrate = Math.round((bytesDelta * 8) / (timeDelta / 1000) / 1000);
                }
                statsRef.current.lastAudioBytes = audioBytes;
                setStats(prev => ({
                  ...prev,
                  audio: {
                    bitrate: audioBitrate
                  }
                }));
              }
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
      statsRef.current.lastTimestamp = now;
    }, 2000);
  }, []);

  const stopStatsCollection = useCallback(() => {
    if (statsInterval.current) {
      clearInterval(statsInterval.current);
      statsInterval.current = null;
    }
  }, []);

  // --- Toggle Audio --- (No changes needed)
  const toggleAudioMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setAudioMuted(videoRef.current.muted);
      if (showTapToUnmute) setShowTapToUnmute(false);
    }
  }, [showTapToUnmute]);


  // --- Effects ---

  // Main effect for setting up socket listeners
  useEffect(() => {
    const currentSocket = socketRef.current;
    // Use direct config value for room check
    if (!currentSocket || !config?.channel || !targetStreamIdRef.current) {
        if (isDevMode()) console.debug("PlayWebRTC: Skipping listener setup - missing socket, room, or streamId");
        cleanupWebRTC();
        return;
    }

    if (isDevMode()) console.debug("PlayWebRTC: Attaching socket listeners");
    // Use handlers directly
    currentSocket.on("connect", handleConnect);
    currentSocket.on("disconnect", handleDisconnect);
    currentSocket.on("subscribeError", handleSubscribeError);
    currentSocket.on("roomUpdate", handleRoomUpdate);
    currentSocket.on("message", handleMessage); // Reverted back to "message"

    if (currentSocket.connected) {
      if (isDevMode()) console.debug("PlayWebRTC: Socket already connected, invoking connect handler");
      handleConnect(); // Call directly
    } else {
      if (isDevMode()) console.debug("PlayWebRTC: Socket not connected, waiting for connect event");
      setIsConnecting(true);
      setIsLive(false);
    }

    return () => {
      if (currentSocket) {
        if (isDevMode()) console.debug("PlayWebRTC: Detaching socket listeners");
        currentSocket.off("connect", handleConnect);
        currentSocket.off("disconnect", handleDisconnect);
        currentSocket.off("subscribeError", handleSubscribeError);
        currentSocket.off("roomUpdate", handleRoomUpdate);
        currentSocket.off("message", handleMessage); // Reverted back to "message"
      }
    };
  // Add handlers to dependency array
  }, [socket, config?.channel, streamId, handleConnect, handleDisconnect, handleSubscribeError, handleRoomUpdate, handleMessage, cleanupWebRTC]);


  // Effect for cleaning up on unmount
  useEffect(() => {
    // Get config value at time of effect
    const cleanupRoom = config?.channel;

    return () => {
      if (isDevMode()) console.debug("PlayWebRTC: Unmounting - cleaning up...");

      const currentSocket = socketRef.current; // Use ref for socket

      if (currentSocket && currentSocket.connected && cleanupRoom) {
        if (isDevMode()) console.debug(`PlayWebRTC: Emitting roomLeave for room ${cleanupRoom}`);
        currentSocket.emit('roomLeave', { room: cleanupRoom });
      } else {
         if (isDevMode()) console.debug('PlayWebRTC: Skipping room leave emit (socket disconnected or missing info)');
      }

      cleanupWebRTC();

      if (unmuteTipTimeoutRef.current) {
        clearTimeout(unmuteTipTimeoutRef.current);
      }
    };
  }, [config?.channel, cleanupWebRTC]); // Add config.channel dependency


  return {
    videoRef,
    isLive,
    isConnecting,
    error,
    audioMuted,
    showTapToUnmute,
    showTapToPlay,
    stats,
    setError,
    toggleAudioMute,
  };
}
