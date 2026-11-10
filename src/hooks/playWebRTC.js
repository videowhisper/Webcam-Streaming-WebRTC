// src/hooks/usePlayWebRTC.js
// Custom hook for WebRTC playback logic (extracted from PlayWebRTC)
import { useEffect, useRef, useState, useCallback } from 'react';
import useAppStore from '../store/appStore';
import { isDevMode } from '../config/devMode';

// Accept streamId (broadcaster's username) as prop
export default function usePlayWebRTC(streamId) {
  const { config, socket } = useAppStore();
  const peerConfig = useAppStore(state => state.peerConfig);
  const setPeerConfig = useAppStore(state => state.setPeerConfig);
  
  const videoRef = useRef(null);
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [showTapToUnmute, setShowTapToUnmute] = useState(false);
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const autoplayAttemptedRef = useRef(false); // Use ref for immediate updates
  const unmuteTipTimeoutRef = useRef(null);
  const peerConnection = useRef(null);
  const broadcasterIdRef = useRef(null); // Store the actual broadcaster socket ID for signaling
  const targetStreamIdRef = useRef(streamId); // Store the target stream ID (broadcaster username)
  const targetChannelRef = useRef(null); // Store the WebRTC channel associated with the target stream
  const reconnectAttempts = useRef(0);
  const waitingForOffer = useRef(false); // Track if we're waiting for offer after streamNew
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
  
  // Refs for handlers to keep socket listener effect stable
  const handleConnectRef = useRef(null);
  const handleDisconnectRef = useRef(null);
  const handleSubscribeErrorRef = useRef(null);
  const handleRoomUpdateRef = useRef(null);
  const handleMessageRef = useRef(null);

  // Update refs when props/state change
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    targetStreamIdRef.current = streamId;
    targetChannelRef.current = null;
  }, [streamId]);

  // Define stopStatsCollection early so it can be used by cleanupWebRTC
  const stopStatsCollection = useCallback(() => {
    if (statsInterval.current) {
      clearInterval(statsInterval.current);
      statsInterval.current = null;
    }
  }, []);

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
    // Reset autoplayAttempted so video will auto-play on reconnection
    autoplayAttemptedRef.current = false;
  }, []);

  // --- Handlers ---
  const handleConnect = useCallback(() => {
    const currentSocket = socketRef.current;
    // Use direct config values
    const room = config?.channel;
    const user = config?.username || "Viewer";

    if (!currentSocket || !room) {
        if (isDevMode()) console.debug("PlayWebRTC: Cannot join room - missing socket or room name");
        setError(`Socket connection issue: ${!currentSocket ? 'No socket' : 'Missing room name'}`);
        setIsConnecting(false);
        return;
    }

    if (isDevMode()) console.debug(`PlayWebRTC socket connected — joining room ${room} as ${user}`);
    currentSocket.emit("roomJoin", { room: room });
    setIsConnecting(true);
    reconnectAttempts.current = 0;
  }, [config?.channel, config?.username]); // Add config dependencies

  const handleDisconnect = useCallback((reason) => {
    if (isDevMode()) console.debug("PlayWebRTC socket disconnected:", reason);
    cleanupWebRTC();
    // Set error state with the original reason if we were previously connecting or live
    if (isConnecting || isLive) {
      setError(`Socket disconnected: ${reason || 'Unknown reason'}`);
    }
  }, [cleanupWebRTC, isConnecting, isLive]);

  // Keep subscribeError for channel-level issues from webrtcModule
  const handleSubscribeError = useCallback((data) => {
    const errMsg = data?.message || "Subscription failed.";
    if (isDevMode()) console.debug("PlayWebRTC Subscribe error:", errMsg);
    setError(`${errMsg}`); // Use original error message as received from server
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
        setError(`${message.error}`); // Use original error message as received from server
        cleanupWebRTC(); // Clean up on room error
        return; // Stop processing if there's an error
    }

    // Handle streamRemove event - broadcaster stopped streaming
    if (message.streamRemove) {
        const removedStreamId = message.streamRemove;
        if (isDevMode()) console.debug(`PlayWebRTC: Stream removed: ${removedStreamId}`);
        
        // Check if this is the stream we're watching
        if (removedStreamId === targetStreamIdRef.current) {
            if (isDevMode()) console.debug(`PlayWebRTC: Target stream ${targetStreamIdRef.current} removed, cleaning up connection`);
            setIsLive(false);
            setIsConnecting(false);
            stopStatsCollection();
            // Clean up peer connection
            if (peerConnection.current) {
                peerConnection.current.close();
                peerConnection.current = null;
            }
            broadcasterIdRef.current = null;
            targetChannelRef.current = null;
            waitingForOffer.current = false; // Reset waiting state
        }
        return;
    }

    // Handle streamNew event - new stream published (or broadcaster reconnected)
    if (message.streamNew) {
        const newStream = message.streamNew;
        if (isDevMode()) console.debug(`PlayWebRTC: New stream published:`, newStream);
        
        // Check if this is the stream we're interested in
        if (newStream.streamId === targetStreamIdRef.current) {
            if (isDevMode()) console.debug(`PlayWebRTC: Target stream ${targetStreamIdRef.current} is now available. Preparing for reconnection.`);
            
            // Clean up any existing peer connection to allow fresh connection
            if (peerConnection.current) {
                if (isDevMode()) console.debug(`PlayWebRTC: Closing existing peer connection for clean reconnection`);
                peerConnection.current.close();
                peerConnection.current = null;
            }
            
            // Update stream information
            targetChannelRef.current = newStream.channel;
            broadcasterIdRef.current = newStream.socketId;
            
            // Reset state to allow new connection
            setIsLive(false);
            setIsConnecting(true);
            reconnectAttempts.current = 0; // Reset reconnect attempts
            waitingForOffer.current = true; // Mark as waiting for offer
            
            // The offer will arrive via the 'message' event and handleOfferMessage will establish the connection
            if (isDevMode()) console.debug(`PlayWebRTC: Ready to receive offer from broadcaster ${broadcasterIdRef.current}`);
        }
        return;
    }

    // Process room state to find the target stream's channel (for initial room join)
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

    // Handle participantLeft event - might be the broadcaster
    if (message.participantLeft) {
        if (isDevMode()) console.debug(`PlayWebRTC: Participant left:`, message.participantLeft);
        // Connection state will be handled by onconnectionstatechange if it's the broadcaster
    }

    // Handle participantJoin event
    if (message.participantJoin) {
        if (isDevMode()) console.debug(`PlayWebRTC: Participant joined:`, message.participantJoin);
    }

    // Initial room snapshot (sent on join) carries currently active streams - use it to
    // recognize a broadcaster that was already live before this viewer joined.
    processRoomData(message);

  }, [config?.channel, cleanupWebRTC]); // Removed stopStatsCollection - it's stable and doesn't need to be in deps


  // --- Autoplay logic --- (Must be defined before setupPeerConnectionHandlers)
  const attemptAutoplay = useCallback(() => {
    if (isDevMode()) console.debug("PlayWebRTC: Attempting autoplay (unmuted)...");
    if (!videoRef.current) {
      if (isDevMode()) console.debug("PlayWebRTC: No videoRef, cannot autoplay");
      return;
    }
    videoRef.current.muted = false;
    setAudioMuted(false);
    videoRef.current.play()
      .then(() => {
        if (isDevMode()) console.debug("PlayWebRTC Unmuted autoplay succeeded");
        setError(null);
        setShowTapToUnmute(false);
        setShowTapToPlay(false);
        autoplayAttemptedRef.current = true;
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
            autoplayAttemptedRef.current = true;
            if (unmuteTipTimeoutRef.current) clearTimeout(unmuteTipTimeoutRef.current);
            unmuteTipTimeoutRef.current = setTimeout(() => setShowTapToUnmute(false), 5000);
          })
          .catch(mutedErr => {
            if (isDevMode()) console.debug("PlayWebRTC Muted autoplay also failed:", mutedErr);
            setShowTapToPlay(true);
            setShowTapToUnmute(false);
            autoplayAttemptedRef.current = true;
          });
      });
  }, []);

  // --- Reconnect Logic --- (Depends on handleConnect, cleanupWebRTC)
  const handleReconnect = useCallback(() => {
    // Don't reconnect if we're waiting for offer after broadcaster reload (streamNew)
    if (waitingForOffer.current) {
      if (isDevMode()) console.debug("PlayWebRTC: Skipping reconnect - waiting for broadcaster's new offer");
      return;
    }
    
    if (reconnectAttempts.current < maxReconnectAttempts) {
      reconnectAttempts.current += 1;
      if (isDevMode()) console.debug(`PlayWebRTC reconnection attempt ${reconnectAttempts.current} of ${maxReconnectAttempts}`);
      cleanupWebRTC(); // Clean up before attempting reconnect
      
      // CRITICAL FIX: Leave the room first to clean up server-side state
      // This ensures the broadcaster gets notified when we rejoin
      const currentSocket = socketRef.current;
      const room = config?.channel;
      
      if (currentSocket?.connected && room) {
        if (isDevMode()) console.debug("PlayWebRTC: Leaving room before reconnect to clean up server state");
        currentSocket.emit("roomLeave", { room: room });
      }
      
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
      setError(`Connection failed after ${maxReconnectAttempts} attempts`);
      cleanupWebRTC();
    }
  }, [cleanupWebRTC, handleConnect, config?.channel]); // Add config?.channel dependency

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
        if (isDevMode()) console.debug("PlayWebRTC: Checking autoplay - autoplayAttempted:", autoplayAttemptedRef.current);
        if (!autoplayAttemptedRef.current) {
          if (isDevMode()) console.debug("PlayWebRTC: Calling attemptAutoplay");
          attemptAutoplay(); // Call attemptAutoplay here
        } else {
          if (isDevMode()) console.debug("PlayWebRTC: Skipping autoplay - already attempted");
        }
      }
    };


    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && broadcasterIdRef.current) {
        if (isDevMode()) console.debug("PlayWebRTC onicecandidate Sending ICE candidate to broadcaster:", broadcasterIdRef.current, event.candidate.type, event.candidate);
        socketRef.current.emit("messagePeer", {
          type: "candidate",
          from: config?.username || "Viewer", // Use direct config value
          target: broadcasterIdRef.current,
          channel: targetChannelRef.current,
          candidate: event.candidate
        });

      if (isDevMode()) {
          peerConnection.current.getStats().then(stats => {
            let candidateCount = 0;
            stats.forEach(report => {
          if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
            candidateCount++;
          }
            });
            console.debug("PlayWebRTC: Current ICE candidate count:", candidateCount);
          });
        }
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
      if (isDevMode()) console.debug("PlayWebRTC iceConnectionState:", peerConnection.current.iceConnectionState);

      /*
          if (isDevMode()) {
          //troubleshoot webrtc playback on state change
          peerConnection.current.getStats().then(stats => {
            stats.forEach(report => {
                console.debug("PlayWebRTC peerConnection:", report);      
            });
          });
        }
  */
      if (peerConnection.current.iceConnectionState === 'failed') {
        // Note: onconnectionstatechange also handles 'failed', so this may be redundant
        // Keeping it for backwards compatibility
        handleReconnect();
      }
    };
  }, [attemptAutoplay, handleReconnect, config?.username]);

  // --- Offer Handling --- (Depends on setupPeerConnectionHandlers, handleReconnect)
  const handleOfferMessage = useCallback(async (message) => {

    try {

     if (peerConnection.current) {
          if (isDevMode()) console.debug("PlayWebRTC: Cleaning up existing peer connection before handling new offer for message:", message);
          peerConnection.current.close();
      }

      if (isDevMode()) console.debug("PlayWebRTC Add RTCPeerConnection (broadcaster)", message.from, message.channel, message.peerConfig);

      peerConnection.current = new RTCPeerConnection(message.peerConfig);
      
      // Reset autoplayAttempted for new connection
      autoplayAttemptedRef.current = false;
      
      setupPeerConnectionHandlers(); // Setup handlers for the new connection
      waitingForOffer.current = false; // Clear waiting state once offer is received

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
      setError(`${err.message}`); // Use the raw error message
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

        if (isDevMode()) {
          peerConnection.current.getStats().then(stats => {
            let candidateCount = 0;
            stats.forEach(report => {
          if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
            candidateCount++;
          }
            });
            console.debug("PlayWebRTC: Current ICE candidate count:", candidateCount);
          });
        }

    }
  }, [handleOfferMessage]); // Add handleOfferMessage dependency


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

  // --- Toggle Audio --- (No changes needed)
  const toggleAudioMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setAudioMuted(videoRef.current.muted);
      if (showTapToUnmute) setShowTapToUnmute(false);
    }
  }, [showTapToUnmute]);


  // --- Effects ---

  // Update handler refs when handlers change (keeps socket listeners stable)
  useEffect(() => {
    handleConnectRef.current = handleConnect;
  }, [handleConnect]);

  useEffect(() => {
    handleDisconnectRef.current = handleDisconnect;
  }, [handleDisconnect]);

  useEffect(() => {
    handleSubscribeErrorRef.current = handleSubscribeError;
  }, [handleSubscribeError]);

  useEffect(() => {
    handleRoomUpdateRef.current = handleRoomUpdate;
  }, [handleRoomUpdate]);

  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

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
    
    // Create stable wrapper functions that call through to the latest handlers via refs
    const connectWrapper = () => handleConnectRef.current?.();
    const disconnectWrapper = () => handleDisconnectRef.current?.();
    const subscribeErrorWrapper = (data) => handleSubscribeErrorRef.current?.(data);
    const roomUpdateWrapper = (data) => handleRoomUpdateRef.current?.(data);
    const messageWrapper = (data) => handleMessageRef.current?.(data);
    
    // Attach stable wrappers
    currentSocket.on("connect", connectWrapper);
    currentSocket.on("disconnect", disconnectWrapper);
    currentSocket.on("subscribeError", subscribeErrorWrapper);
    currentSocket.on("roomUpdate", roomUpdateWrapper);
    currentSocket.on("message", messageWrapper);

    if (currentSocket.connected) {
      if (isDevMode()) console.debug("PlayWebRTC: Socket already connected, invoking connect handler");
      connectWrapper();
    } else {
      if (isDevMode()) console.debug("PlayWebRTC: Socket not connected, waiting for connect event");
      setIsConnecting(true);
      setIsLive(false);
    }

    return () => {
      if (currentSocket) {
        if (isDevMode()) console.debug("PlayWebRTC: Detaching socket listeners");
        currentSocket.off("connect", connectWrapper);
        currentSocket.off("disconnect", disconnectWrapper);
        currentSocket.off("subscribeError", subscribeErrorWrapper);
        currentSocket.off("roomUpdate", roomUpdateWrapper);
        currentSocket.off("message", messageWrapper);
      }
    };
  // Only depend on socket and streamId - handlers are accessed via stable refs
  }, [socket, streamId, config?.channel]);


  // Effect for cleaning up on unmount
  useEffect(() => {
    // Get config value at time of effect
    const cleanupRoom = config?.channel;

    return () => {
      if (isDevMode()) console.debug("PlayWebRTC: Unmounting - cleaning up...");

      const currentSocket = socketRef.current; // Use ref for socket
      const nextView = useAppStore.getState().currentView;
      const keepSocketForDebugger = nextView === 'Debugger';

      if (!keepSocketForDebugger && currentSocket && currentSocket.connected && cleanupRoom) {
        if (isDevMode()) console.debug(`PlayWebRTC: Emitting roomLeave for room ${cleanupRoom}`);
        currentSocket.emit('roomLeave', { room: cleanupRoom });
      } else if (keepSocketForDebugger) {
        if (isDevMode()) console.debug('PlayWebRTC: Keeping socket connected for Debugger view transition');
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
    setShowTapToPlay,       // Add these missing state setters
    setShowTapToUnmute,     // Add these missing state setters
    setAudioMuted,          // Add this for completeness
  };
}
