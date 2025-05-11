// Custom hook for WebRTC functionality with fixed dependency management
import { useState, useEffect, useRef, useCallback } from 'react';
import { isDevMode } from '../config/devMode';

import useAppStore from '../store/appStore';

// Remove roomName from props, it will be derived from config.channel
export default function broadcastWebRTC({
  onPeerCountChange = () => {},
}) {
  // Get all configuration from appStore
  const config = useAppStore(state => state.config);
  const peerConfig = useAppStore(state => state.peerConfig);
  const setPeerConfig = useAppStore(state => state.setPeerConfig);

  // Use a ref for socket to always have the latest reference
  // This helps prevent stale closures
  const socketRef = useRef(null);

  // Get socket from the store and update ref whenever it changes
  const socket = useAppStore(state => state.socket);
  useEffect(() => {
    socketRef.current = socket;
    if (isDevMode()) console.debug('broadcastWebRTC: Socket reference updated:', socket ? 'available' : 'null');
  }, [socket]);

  // Get configuration values
  const username = config?.username;
  const streamSettings = config?.stream || {};
  const roomName = config?.channel; // Use config.channel as roomName

  const [error, setError] = useState(null);
  const [deviceList, setDeviceList] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [forceAvailable, setForceAvailable] = useState(false);

  // WebRTC state
  // Remove the local peerConfig state as we're now using it from appStore
  const peerConnections = useRef({});
  const localStream = useRef(null);
  const videoRef = useRef(null);

  // Ref to hold the latest peerConfig to avoid stale closures
  const peerConfigRef = useRef(peerConfig);

  // Only keep refs for mutable objects that we don't want to trigger re-renders
  const streamSettingsRef = useRef(streamSettings);

  // Update refs when props/state change
  useEffect(() => {
    streamSettingsRef.current = streamSettings;
  }, [streamSettings]);

  // Keep peerConfigRef updated
  useEffect(() => {
    peerConfigRef.current = peerConfig;
    if (isDevMode()) console.debug('broadcastWebRTC: peerConfigRef updated:', peerConfigRef.current);
  }, [peerConfig]);

  // Set video ref to be used by the component
  const setVideoElement = useCallback((element) => {
    videoRef.current = element;
  }, []);

  // Function to update the connected peers count
  const updateConnectedPeersCount = useCallback(() => {
    const count = Object.values(peerConnections.current).filter(pc =>
      pc && pc.connectionState === 'connected'
    ).length;

    onPeerCountChange(count);

    if (isDevMode()) console.debug('broadcastWebRTC: Connected peers count updated:', count);
  }, [onPeerCountChange]);

  // Clean up all peer connections
  const cleanupPeerConnections = useCallback(() => {
    if (isDevMode()) console.debug('broadcastWebRTC: Cleaning up all peer connections');
    Object.values(peerConnections.current).forEach(pc => {
      if (pc) pc.close();
    });
    peerConnections.current = {};
    updateConnectedPeersCount(); // Reset peer count when cleaning up
  }, [updateConnectedPeersCount]);

  // Handle socket disconnect
  const handleDisconnect = useCallback(() => {
    if (isDevMode()) console.debug('broadcastWebRTC: Socket disconnected');
    setIsLive(false);
    setIsConnecting(false);

    // Clean up peer connections on disconnect
    cleanupPeerConnections();
  }, [cleanupPeerConnections]);

  // Reinstate handlePublishError
  const handlePublishError = useCallback((err) => {
    console.error('broadcastWebRTC: Publish error received:', err);
    setError(`Publish Error: ${err.message || 'Unknown error'}`);
    setIsLive(false);
    setIsConnecting(false);
    // Clean up peer connections on publish error
    cleanupPeerConnections();
  }, [cleanupPeerConnections]);


  // Replace tracks in all peer connections when camera changes
  const replaceTracks = useCallback((newStream) => {
    if (!newStream || Object.keys(peerConnections.current).length === 0) return;

    if (isDevMode()) console.debug('broadcastWebRTC: Replacing tracks in existing peer connections');

    const newVideoTrack = newStream.getVideoTracks()[0];
    const newAudioTrack = newStream.getAudioTracks()[0];

    if (!newVideoTrack) {
      console.error('broadcastWebRTC: No video track available in new stream');
      return;
    }

    // For each peer connection, replace the tracks
    Object.values(peerConnections.current).forEach(pc => {
      if (!pc || pc.connectionState === 'closed') return;

      pc.getSenders().forEach(sender => {
        if (sender.track.kind === 'video' && newVideoTrack) {
          if (isDevMode()) console.debug('broadcastWebRTC: Replacing video track');
          sender.replaceTrack(newVideoTrack);
        } else if (sender.track.kind === 'audio' && newAudioTrack) {
          if (isDevMode()) console.debug('broadcastWebRTC: Replacing audio track');
          sender.replaceTrack(newAudioTrack);
        }
      });
    });
  }, []);

  // Handle socket connection and room logic
  const handleConnect = useCallback(() => {
    const currentSocket = socketRef.current;
    // Always use the latest config values inside the function
    const room = config?.channel;

    if (!localStream.current || !currentSocket || !room || !username) { // Still need username check for context
      if (isDevMode()) console.debug('broadcastWebRTC: Cannot join room/publish - missing stream, socket, room, or user');
      return;
    }

    const streamSettings = localStream.current.getVideoTracks()[0]?.getSettings();
    if (!streamSettings) {
      if (isDevMode()) console.debug('broadcastWebRTC: Cannot get stream settings for publishing');
      return;
    }

    const publishParams = {
      width: streamSettings.width,
      height: streamSettings.height,
      frameRate: streamSettings.frameRate,
      videoBitrate: streamSettingsRef.current?.videoBitrate || 500,
      audioBitrate: streamSettingsRef.current?.audioBitrate || 32,
      type: 'webrtc' // Specify stream type
    };

    if (isDevMode()) console.debug(`broadcastWebRTC: Socket connected, joining room: ${room}`);
    currentSocket.emit('roomJoin', { room: room });

    // Use room name (channel) as the streamId for publishing in this context
    const streamId = room;
    if (isDevMode()) console.debug(`broadcastWebRTC: Publishing stream ${streamId} to room ${room} with params:`, publishParams);
    currentSocket.emit('roomPublish', {
      room: room,
      stream: streamId, // Use room name as streamId
      parameters: publishParams
    });

    setIsConnecting(false);
    setIsLive(true);

  }, [username]); // Remove config?.channel from dependency array, always use latest inside


  // Handle generic socket messages (WebRTC signaling)
  const handleSocketMessage = useCallback((message) => {
    if (isDevMode()) console.debug('broadcastWebRTC: Socket message received:', message);

    if (!username) return; // Need username to filter self

    if (message.type === "peers") {
      // Store ICE server configuration
      if (message.peerConfig) {
        setPeerConfig(message.peerConfig);
      }

      // Setup connections for all existing peers
      if (message.peers && Array.isArray(message.peers)) {
        message.peers.forEach(peer => {
          if (peer.peerID && peer.peerID !== username) { // Use direct username
            // addPeerConnection is defined below and captures its own dependencies
            addPeerConnection(peer.peerID);
          }
        });
      }
    } else if (message.type === "peer") {
      // Add new peer connection when new viewer joins
      if (message.peerID && message.peerID !== username) { // Use direct username
        if (isDevMode()) console.debug('broadcastWebRTC: New peer joined:', message.peerID);

        // Clean up existing connection first
        if (peerConnections.current[message.peerID]) {
          if (isDevMode()) console.debug('broadcastWebRTC: Cleaning up existing connection for peer before creating new one:', message.peerID);
          peerConnections.current[message.peerID].close();
          delete peerConnections.current[message.peerID];
        }

        // Create new peer connection
        addPeerConnection(message.peerID);
      }
    } else if (message.type === "answer") {
      // Process answer from a peer
      if (peerConnections.current[message.from]) {
        if (isDevMode()) console.debug('broadcastWebRTC: Received answer from peer:', message.from);
        peerConnections.current[message.from]
          .setRemoteDescription(new RTCSessionDescription(message.content)) // Use RTCSessionDescription constructor
          .catch(err => console.error('broadcastWebRTC: Error setting remote description:', err));
      }
    } else if (message.type === "candidate") {
      // Process ICE candidate from a peer
      if (peerConnections.current[message.from] && message.candidate) {

        if (isDevMode()) {
          console.debug('broadcastWebRTC: Adding ICE candidate', message.from, message.candidate);
        }

        peerConnections.current[message.from].addIceCandidate(new RTCIceCandidate(message.candidate))
          .catch(err => console.error('broadcastWebRTC: Error adding ICE candidate:', err));

      }
    }
  }, [username]);

  // Handle room-specific updates from the server
  const handleRoomUpdate = useCallback((message) => {
    if (isDevMode()) console.debug('broadcastWebRTC: Room update received:', message);

    const room = config?.channel; // Get current room name

    // Ensure the update is for the current room
    if (!room || message.room !== room) {
        if (isDevMode()) console.debug('broadcastWebRTC: Ignoring roomUpdate for different room:', message.room, 'expected:', room);
        return;
    }

    // Handle errors sent via roomUpdate
    if (message.error) {
        console.error(`broadcastWebRTC: Room error for ${message.room}:`, message.error);
        setError(`Room Error: ${message.error}`);
        setIsLive(false);
        setIsConnecting(false);
    }

  }, [config?.channel]); // Add config.channel dependency


  // Clean up socket listeners - only remove our specific handlers
  const cleanupSocketListeners = useCallback(() => {
    const currentSocket = socketRef.current;
    if (!currentSocket) return;

    if (isDevMode()) console.debug('broadcastWebRTC: Cleaning up socket listeners');

    // Only remove our specific handlers, not all listeners
    currentSocket.off('message', handleSocketMessage);
    currentSocket.off('roomUpdate', handleRoomUpdate);
    currentSocket.off('connect', handleConnect);
    currentSocket.off('disconnect', handleDisconnect);
    currentSocket.off('publishError', handlePublishError); // Add back publishError

  }, [handleSocketMessage, handleRoomUpdate, handleConnect, handleDisconnect, handlePublishError]); // Add handlePublishError


  // Add a new peer connection
  const addPeerConnection = useCallback((peerID) => {
    if (!username) return;

    if (peerConnections.current[peerID]) {
        if (isDevMode()) console.debug('broadcastWebRTC addPeerConnection: Peer connection already exists for:', peerID);
        return; // Already exists
    }

    if (!localStream.current) {
      if (isDevMode()) console.debug('broadcastWebRTC addPeerConnection: Cannot create peer connection, local stream not available');
      return;
    }

    //skip if peer is self
    if (peerID === username) { // Use direct username
      if (isDevMode()) console.debug('broadcastWebRTC addPeerConnection: Skipping self peer:', peerID);
      return;
    }

    // Get the current socket from ref instead of closure
    const currentSocket = socketRef.current;

    // Skip if socket is not available
    if (!currentSocket) {
      if (isDevMode()) console.debug('broadcastWebRTC addPeerConnection: Socket instance during call:', currentSocket, 'from ref:', socketRef.current);
      console.error('broadcastWebRTC: Cannot create peer connection, socket not available');
      return;
    }

    if (isDevMode()) console.debug('broadcastWebRTC: Add RTCPeerConnection', peerID, peerConfigRef.current);

    // Create new peer connection using current peerConfig state
    // Always use the latest peerConfig from the ref (fixes stale ICE config issue)
    const pc = new RTCPeerConnection(peerConfigRef.current);
    peerConnections.current[peerID] = pc;

    // Track senders to apply bitrate limits
    const senders = {
      video: null,
      audio: null
    };

    // Add local stream tracks to peer connection
    localStream.current.getTracks().forEach(track => {
      const sender = pc.addTrack(track, localStream.current);

      // Store senders by track type for bitrate limiting
      if (track.kind === 'video') {
        senders.video = sender;
      } else if (track.kind === 'audio') {
        senders.audio = sender;
      }
    });

    // Apply bitrate limits to video and audio tracks
    if (senders.video && streamSettingsRef.current?.videoBitrate) {
      const setVideoParams = async () => {
        try {
          const params = senders.video.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings.forEach(encoding => {
            // Convert kbps to bps
            encoding.maxBitrate = streamSettingsRef.current.videoBitrate * 1000;
          });
          await senders.video.setParameters(params);
          if (isDevMode()) console.debug('broadcastWebRTC: Video bitrate limited to:', streamSettingsRef.current.videoBitrate, 'kbps');
        } catch (err) {
          console.error('broadcastWebRTC: Failed to set video bitrate:', err);
        }
      };
      setVideoParams();
    }

    if (senders.audio && streamSettingsRef.current?.audioBitrate) {
      const setAudioParams = async () => {
        try {
          const params = senders.audio.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings.forEach(encoding => {
            // Convert kbps to bps
            encoding.maxBitrate = streamSettingsRef.current.audioBitrate * 1000;
          });
          await senders.audio.setParameters(params);
          if (isDevMode()) console.debug('broadcastWebRTC: Audio bitrate limited to:', streamSettingsRef.current.audioBitrate, 'kbps');
        } catch (err) {
          console.error('broadcastWebRTC: Failed to set audio bitrate:', err);
        }
      };
      setAudioParams();
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Use the current socket ref here
        const currentSocket = socketRef.current;
        if (!currentSocket) {
          console.error('broadcastWebRTC: Cannot send ICE candidate, socket not available');
          return;
        }
        let message = {
          from: username, // Use direct username
          target: peerID,
          type: "candidate",
          candidate: event.candidate,
          channel: roomName // Send the room name
        };
        if (isDevMode()) console.debug('broadcastWebRTC onicecandidate sending with messagePeer', event.candidate.type, message);
        currentSocket.emit("messagePeer", message);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (isDevMode()) console.debug('broadcastWebRTC: Connection state change for peer:', peerID, pc.connectionState);

      /*
          if (isDevMode()) {
          //troubleshoot webrtc on state change
          pc.getStats().then(stats => {
            stats.forEach(report => {
                console.debug("broadcastWebRTC peerConnection", peerID, report);      
            });
          });
        }
      */

      // Use updateConnectedPeersCount which reads peerConnections ref
      updateConnectedPeersCount();

      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (isDevMode()) console.debug('broadcastWebRTC: Peer disconnected or failed:', peerID);
        // Clean up the specific peer connection
        if (peerConnections.current[peerID]) {
            peerConnections.current[peerID].close();
            delete peerConnections.current[peerID];
            updateConnectedPeersCount(); // Update count after removal
        }
      }
    };

    // Handle negotiation needed - create and send offer
    pc.onnegotiationneeded = () => {
      if (isDevMode()) console.debug('broadcastWebRTC: Negotiation needed for peer:', peerID);

      pc.createOffer()
        .then(offer => {
          return pc.setLocalDescription(offer);
        })
        .then(() => {
          // Get current socket from ref
          const currentSocket = socketRef.current;

          // Check if socket is available before sending
          if (!currentSocket) {
            console.error('broadcastWebRTC: Cannot send offer, socket not available');
            return;
          }

          // Send the offer to the peer
          let message = {
            from: username, // Use direct username
            target: peerID,
            type: "offer",
            content: pc.localDescription,
            peerConfig: peerConfigRef.current, // Send current peerConfig from ref
            channel: roomName // Send the room name
          };
          if (isDevMode()) console.debug('broadcastWebRTC: Sending offer with messagePeer', message);
          currentSocket.emit("messagePeer", message);
        })
        .catch(err => console.error('broadcastWebRTC: Error creating offer:', err));
    };
  }, [updateConnectedPeersCount, username]); // Remove peerConfig from dependency array

  // Force device refresh function
  const refreshDevices = useCallback(async () => {
    try {
      if (isDevMode()) console.debug('broadcastWebRTC: Forcing device refresh...');

      // Some browsers need a fresh getUserMedia call to detect device changes
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      // Always release temporary streams
      tempStream.getTracks().forEach(track => track.stop());

      // Now enumerate the devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      if (isDevMode()) {
        console.debug('broadcastWebRTC: Refreshed video devices:', videoDevices.length);
        videoDevices.forEach((device, idx) => {
          console.debug(`Device ${idx}: ${device.label || 'Unnamed device'} (${device.deviceId.substring(0,8)}...)`);
        });
      }

      setDeviceList(videoDevices);

      // If we still only have one device, but the user is forcing rotation
      if (videoDevices.length <= 1) {
        if (isDevMode()) console.debug('broadcastWebRTC: Still only one device found, enabling force mode');
        setForceAvailable(true);
      }

      return videoDevices.length > 1;
    } catch (err) {
      console.error('broadcastWebRTC: Error refreshing device list:', err);
      return false;
    }
  }, []);

  // Toggle audio mute function
  const toggleAudioMute = useCallback(() => {
    if (!localStream.current) return;

    const audioTracks = localStream.current.getAudioTracks();
    if (audioTracks.length > 0) {
      const audioTrack = audioTracks[0];
      audioTrack.enabled = !audioTrack.enabled;
      setAudioMuted(!audioTrack.enabled);

      if (isDevMode()) {
        console.debug('broadcastWebRTC: Audio track ' + (audioTrack.enabled ? 'enabled' : 'disabled'));
      }
    }
  }, []);

  // Rotate camera function
  const rotateCamera = useCallback(async () => {
    // Allow rotation if multiple devices or force mode
    if (deviceList.length <= 1 && !forceAvailable) {
      if (isDevMode()) console.debug('broadcastWebRTC: Cannot rotate camera, only one device available');

      // Try refreshing device list one time
      const foundMultiple = await refreshDevices();
      if (!foundMultiple) return;
    }

    try {
      // If we're in force mode or have multiple devices, proceed with rotation
      // In force mode, just reuse the same deviceId but restart the video to try another camera
      if (deviceList.length <= 1 && forceAvailable) {
        if (isDevMode()) console.debug('broadcastWebRTC: Forcing camera rotation (same ID, different constraints)');
        // Toggle between front/back by changing facingMode
        const currentFacingMode = localStream.current?.getVideoTracks()[0]?.getSettings()?.facingMode;
        const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

        // Just force a new device selection with the desired facing mode
        const tempDeviceId = selectedDeviceId;
        setSelectedDeviceId(null); // Force restart

        // Wait a moment to ensure state update
        setTimeout(() => {
          setSelectedDeviceId(tempDeviceId);
        }, 50);

        return;
      }

      // Normal rotation between multiple detected devices
      const currentIndex = deviceList.findIndex(d => d.deviceId === selectedDeviceId);
      const nextIndex = (currentIndex + 1) % deviceList.length;

      const nextDevice = deviceList[nextIndex];
      if (isDevMode()) {
        console.debug(
          'broadcastWebRTC: Rotating camera from',
          deviceList[currentIndex]?.label || 'unknown',
          'to',
          nextDevice?.label || 'unknown'
        );
      }

      setSelectedDeviceId(nextDevice.deviceId);
    } catch (err) {
      console.error('broadcastWebRTC: Error rotating camera', err);
    }
  }, [deviceList, forceAvailable, selectedDeviceId, refreshDevices]);

  // Guard to prevent parallel startPreview calls
  const isStartingPreview = useRef(false);

  // Start camera preview
  const startPreview = useCallback(async () => {
    if (isStartingPreview.current) {
      if (isDevMode()) console.debug('broadcastWebRTC: startPreview already running, skipping duplicate call');
      return;
    }
    isStartingPreview.current = true;
    setError(null);
    try {
      if (isDevMode()) console.debug('broadcastWebRTC: startPreview called. selectedDeviceId:', selectedDeviceId, 'streamSettings:', streamSettingsRef.current);
      // Set up video constraints using streamSettings
      const videoConstraints = {
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        width: { ideal: streamSettingsRef.current?.width || 640, max: streamSettingsRef.current?.width || 640 },
        height: { ideal: streamSettingsRef.current?.height || 360, max: streamSettingsRef.current?.height || 360 },
        frameRate: { ideal: streamSettingsRef.current?.framerate || 15, max: streamSettingsRef.current?.framerate || 15 }
      };
      const constraints = {
        video: videoConstraints,
        audio: true,
      };
      if (isDevMode()) console.debug('broadcastWebRTC: Using constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      // Enumerate devices after getting user media to ensure we have permission
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      // Only update deviceList if changed
      setDeviceList(prev => {
        const prevIds = prev.map(d => d.deviceId).join(',');
        const newIds = videoDevices.map(d => d.deviceId).join(',');
        if (prevIds === newIds) return prev;
        if (isDevMode()) console.debug('broadcastWebRTC: Updating deviceList. New devices:', videoDevices.length);
        return videoDevices;
      });
      // Only update selectedDeviceId if not set or not in list
      if (!selectedDeviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      } else if (selectedDeviceId && !videoDevices.some(d => d.deviceId === selectedDeviceId)) {
        setSelectedDeviceId(videoDevices[0]?.deviceId);
      }

      const selected = videoDevices.find(d => d.deviceId === selectedDeviceId);
      if (isDevMode() && selected) {
        console.debug(
          'Selected camera:',
          selected.label || '(unlabeled)',
          'of',
          videoDevices.length
        );
      }

      // Check connection status and initiate room join/publish if needed
      // Use direct config values
      if (socketRef.current && config?.channel && username) { // Use username
        // Check if we're already live - this means we're just switching cameras
        if (isLive && Object.keys(peerConnections.current).length > 0) {
          // If we're already live, just replace the media tracks in existing connections
          // instead of re-publishing to the channel
          if (isDevMode()) console.debug('broadcastWebRTC: Already live, replacing media tracks instead of republishing');
          replaceTracks(stream);
        }
        // Not already live, need to publish
        else if (socketRef.current.connected) { // Use ref
          // Call handleConnect to publish for the first time
          if (isDevMode()) console.debug('broadcastWebRTC: Stream ready with socket connected, joining room and publishing');
          handleConnect(); // handleConnect now uses config values
        } else {
          // Wait for socket connection
          setIsConnecting(true);
          if (isDevMode()) console.debug('broadcastWebRTC: Stream ready but socket not connected, waiting for connect event');
        }
      }
    } catch (err) {
      console.error('Media access error:', err);
      setError(err.message || 'Unable to access camera/microphone');
    } finally {
      isStartingPreview.current = false;
    }
  }, [selectedDeviceId, handleConnect, replaceTracks, isLive, config?.channel, username]); // Use username in dependency array


  // Set up socket event listeners
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) {
        setIsConnecting(false);
        setIsLive(false);
        return;
    }

    if (isDevMode()) console.debug('broadcastWebRTC: Attaching socket listeners');

    // Use the handlers directly - they capture necessary dependencies
    sock.on('connect', handleConnect);
    sock.on('message', handleSocketMessage);
    sock.on('roomUpdate', handleRoomUpdate);
    sock.on('disconnect', handleDisconnect);
    sock.on('publishError', handlePublishError);

    // If already connected when hook mounts/socket changes
    if (sock.connected && localStream.current) {
      if (isDevMode()) console.debug('broadcastWebRTC: Socket already connected, invoking connect handler');
      setIsConnecting(false);
      handleConnect(); // Call handleConnect directly
    } else if (!sock.connected) {
        setIsConnecting(true);
        setIsLive(false);
    }

    // Cleanup function for this effect
    return () => {
      if (sock) {
          sock.off('connect', handleConnect);
          sock.off('message', handleSocketMessage);
          sock.off('roomUpdate', handleRoomUpdate);
          sock.off('disconnect', handleDisconnect);
          sock.off('publishError', handlePublishError);
          if (isDevMode()) console.debug('broadcastWebRTC: Detached socket listeners');
      }
    };
  // Dependencies now include the handlers themselves
  }, [socket, handleConnect, handleSocketMessage, handleRoomUpdate, handleDisconnect, handlePublishError]);

  // Clean up on unmount
  useEffect(() => {
    // Get config values at the time the effect runs
    const cleanupRoom = config?.channel;
    // Use room name (channel) as the streamId for unpublishing
    const cleanupStreamId = cleanupRoom;

    return () => {
      if (isDevMode()) console.debug('broadcastWebRTC: Unmounting - cleaning up...');

      const currentSocket = socketRef.current; // Use ref for socket

      // Emit roomUnpublish and roomLeave if socket is still connected
      if (currentSocket && currentSocket.connected && cleanupRoom && cleanupStreamId) {
        if (isDevMode()) console.debug(`broadcastWebRTC: Emitting roomUnpublish for stream ${cleanupStreamId} in room ${cleanupRoom}`);
        // Use room name as streamId for unpublish
        currentSocket.emit('roomUnpublish', { room: cleanupRoom, stream: cleanupStreamId });

        if (isDevMode()) console.debug(`broadcastWebRTC: Emitting roomLeave for room ${cleanupRoom}`);
        currentSocket.emit('roomLeave', { room: cleanupRoom });
      } else {
         if (isDevMode()) console.debug('broadcastWebRTC: Skipping room unpublish/leave emit (socket disconnected or missing info)');
      }

      // Cleanup peer connections
      cleanupPeerConnections();

      // Stop local media stream
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
        localStream.current = null;
        if (isDevMode()) console.debug('broadcastWebRTC: Local stream stopped');
      }
    };
  }, [config?.channel, cleanupPeerConnections]);

  // Initialize preview when component mounts or device changes
  useEffect(() => {
    startPreview(); // startPreview captures its dependencies

    return () => {
      // Clean up media when changing devices or unmounting preview part
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [selectedDeviceId, startPreview]);

  return {
    // State
    error,
    deviceList,
    selectedDeviceId,
    isLive,
    isConnecting,
    audioMuted,

    // Functions
    setVideoElement,
    toggleAudioMute,
    rotateCamera,

    // Refs
    videoRef,
    // peerConnections: peerConnections.current, // Avoid returning raw ref content directly
  };
}
