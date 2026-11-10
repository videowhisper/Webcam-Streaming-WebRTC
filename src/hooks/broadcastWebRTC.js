// Custom hook for WebRTC functionality with fixed dependency management
import { useState, useEffect, useRef, useCallback } from 'react';
import { isDevMode } from '../config/devMode';

import useAppStore from '../store/appStore';

// Remove roomName from props, it will be derived from config.channel
export default function useBroadcastWebRTC({
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
    if (isDevMode()) console.debug('useBroadcastWebRTC: Socket reference updated:', socket ? 'available' : 'null');
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
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // WebRTC state
  // Remove the local peerConfig state as we're now using it from appStore
  const peerConnections = useRef({});
  const localStream = useRef(null);
  const videoRef = useRef(null);

  // Ref to hold the latest peerConfig to avoid stale closures
  const peerConfigRef = useRef(peerConfig);

  // Only keep refs for mutable objects that we don't want to trigger re-renders
  const streamSettingsRef = useRef(streamSettings);
  const isScreenSharingRef = useRef(false);
  const audioMutedRef = useRef(false);
  const isPausedRef = useRef(false);

  // Update refs when props/state change
  useEffect(() => {
    streamSettingsRef.current = streamSettings;
  }, [streamSettings]);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  useEffect(() => {
    audioMutedRef.current = audioMuted;
  }, [audioMuted]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Keep peerConfigRef updated
  useEffect(() => {
    peerConfigRef.current = peerConfig;
    if (isDevMode()) console.debug('useBroadcastWebRTC: peerConfigRef updated:', peerConfigRef.current);
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

    if (isDevMode()) console.debug('useBroadcastWebRTC: Connected peers count updated:', count);
  }, [onPeerCountChange]);

  // Clean up all peer connections
  const cleanupPeerConnections = useCallback(() => {
    if (isDevMode()) console.debug('useBroadcastWebRTC: Cleaning up all peer connections');
    Object.values(peerConnections.current).forEach(pc => {
      if (pc) pc.close();
    });
    peerConnections.current = {};
    updateConnectedPeersCount(); // Reset peer count when cleaning up
  }, [updateConnectedPeersCount]);

  // Handle socket disconnect
  const handleDisconnect = useCallback(() => {
    if (isDevMode()) console.debug('useBroadcastWebRTC: Socket disconnected');
    setIsLive(false);
    setIsConnecting(false);

    // Clean up peer connections on disconnect
    cleanupPeerConnections();
  }, [cleanupPeerConnections]);

  // Reinstate handlePublishError
  const handlePublishError = useCallback((err) => {
    console.error('useBroadcastWebRTC: Publish error received:', err);
    setError(`Publish Error: ${err.message || 'Unknown error'}`);
    setIsLive(false);
    setIsConnecting(false);
    // Clean up peer connections on publish error
    cleanupPeerConnections();
  }, [cleanupPeerConnections]);


  // Replace tracks in all peer connections when camera changes
  const replaceTracks = useCallback((newStream) => {
    if (!newStream || Object.keys(peerConnections.current).length === 0) return;

    if (isDevMode()) console.debug('useBroadcastWebRTC: Replacing tracks in existing peer connections');

    const newVideoTrack = newStream.getVideoTracks()[0];
    const newAudioTrack = newStream.getAudioTracks()[0];

    if (!newVideoTrack) {
      console.error('useBroadcastWebRTC: No video track available in new stream');
      return;
    }

    // For each peer connection, replace the tracks
    Object.values(peerConnections.current).forEach(pc => {
      if (!pc || pc.connectionState === 'closed') return;

      pc.getSenders().forEach(sender => {
        if (sender.track.kind === 'video' && newVideoTrack) {
          if (isDevMode()) console.debug('useBroadcastWebRTC: Replacing video track');
          sender.replaceTrack(newVideoTrack);
        } else if (sender.track.kind === 'audio' && newAudioTrack) {
          if (isDevMode()) console.debug('useBroadcastWebRTC: Replacing audio track');
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
      if (isDevMode()) console.debug('useBroadcastWebRTC: Cannot join room/publish - missing stream, socket, room, or user');
      return;
    }

    const streamSettings = localStream.current.getVideoTracks()[0]?.getSettings();
    if (!streamSettings) {
      if (isDevMode()) console.debug('useBroadcastWebRTC: Cannot get stream settings for publishing');
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

    if (isDevMode()) console.debug(`useBroadcastWebRTC: Socket connected, joining room: ${room}`);
    currentSocket.emit('roomJoin', { room: room });

    // Use room name (channel) as the streamId for publishing in this context
    const streamId = room;
    if (isDevMode()) console.debug(`useBroadcastWebRTC: Publishing stream ${streamId} to room ${room} with params:`, publishParams);
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
    if (isDevMode()) console.debug('useBroadcastWebRTC: Socket message received:', message);

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
        if (isDevMode()) console.debug('useBroadcastWebRTC: New peer joined:', message.peerID);

        // Clean up existing connection first
        if (peerConnections.current[message.peerID]) {
          if (isDevMode()) console.debug('useBroadcastWebRTC: Cleaning up existing connection for peer before creating new one:', message.peerID);
          peerConnections.current[message.peerID].close();
          delete peerConnections.current[message.peerID];
        }

        // Create new peer connection
        addPeerConnection(message.peerID);
      }
    } else if (message.type === "answer") {
      // Process answer from a peer
      if (peerConnections.current[message.from]) {
        if (isDevMode()) console.debug('useBroadcastWebRTC: Received answer from peer:', message.from);
        peerConnections.current[message.from]
          .setRemoteDescription(new RTCSessionDescription(message.content)) // Use RTCSessionDescription constructor
          .catch(err => console.error('useBroadcastWebRTC: Error setting remote description:', err));
      }
    } else if (message.type === "candidate") {
      // Process ICE candidate from a peer
      if (peerConnections.current[message.from] && message.candidate) {

        if (isDevMode()) {
          console.debug('useBroadcastWebRTC: Adding ICE candidate', message.from, message.candidate);
        }

        peerConnections.current[message.from].addIceCandidate(new RTCIceCandidate(message.candidate))
          .catch(err => console.error('useBroadcastWebRTC: Error adding ICE candidate:', err));

      }
    }
  }, [username]);

  // Handle room-specific updates from the server
  const handleRoomUpdate = useCallback((message) => {
    if (isDevMode()) console.debug('useBroadcastWebRTC: Room update received:', message);

    const room = config?.channel; // Get current room name

    // Ensure the update is for the current room
    if (!room || message.room !== room) {
        if (isDevMode()) console.debug('useBroadcastWebRTC: Ignoring roomUpdate for different room:', message.room, 'expected:', room);
        return;
    }

    // Handle errors sent via roomUpdate
    if (message.error) {
        console.error(`useBroadcastWebRTC: Room error for ${message.room}:`, message.error);
        setError(`Room Error: ${message.error}`);
        setIsLive(false);
        setIsConnecting(false);
    }

  }, [config?.channel]); // Add config.channel dependency


  // Clean up socket listeners - only remove our specific handlers
  const _cleanupSocketListeners = useCallback(() => {
    const currentSocket = socketRef.current;
    if (!currentSocket) return;

    if (isDevMode()) console.debug('useBroadcastWebRTC: Cleaning up socket listeners');

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
        if (isDevMode()) console.debug('useBroadcastWebRTC addPeerConnection: Peer connection already exists for:', peerID);
        return; // Already exists
    }

    if (!localStream.current) {
      if (isDevMode()) console.debug('useBroadcastWebRTC addPeerConnection: Cannot create peer connection, local stream not available');
      return;
    }

    //skip if peer is self
    if (peerID === username) { // Use direct username
      if (isDevMode()) console.debug('useBroadcastWebRTC addPeerConnection: Skipping self peer:', peerID);
      return;
    }

    // Get the current socket from ref instead of closure
    const currentSocket = socketRef.current;

    // Skip if socket is not available
    if (!currentSocket) {
      if (isDevMode()) console.debug('useBroadcastWebRTC addPeerConnection: Socket instance during call:', currentSocket, 'from ref:', socketRef.current);
      console.error('useBroadcastWebRTC: Cannot create peer connection, socket not available');
      return;
    }

    if (isDevMode()) console.debug('useBroadcastWebRTC: Add RTCPeerConnection', peerID, peerConfigRef.current);

    // Create new peer connection using current peerConfig from store (not ref)
    // Use getState() to get the most recent peerConfig, bypassing ref timing issues
    const currentPeerConfig = useAppStore.getState().peerConfig;
    if (isDevMode()) console.debug('useBroadcastWebRTC: Using peerConfig from store:', currentPeerConfig);
    const pc = new RTCPeerConnection(currentPeerConfig);
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
          if (isDevMode()) console.debug('useBroadcastWebRTC: Video bitrate limited to:', streamSettingsRef.current.videoBitrate, 'kbps');
        } catch (err) {
          console.error('useBroadcastWebRTC: Failed to set video bitrate:', err);
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
          if (isDevMode()) console.debug('useBroadcastWebRTC: Audio bitrate limited to:', streamSettingsRef.current.audioBitrate, 'kbps');
        } catch (err) {
          console.error('useBroadcastWebRTC: Failed to set audio bitrate:', err);
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
          console.error('useBroadcastWebRTC: Cannot send ICE candidate, socket not available');
          return;
        }
        let message = {
          from: username, // Use direct username
          target: peerID,
          type: "candidate",
          candidate: event.candidate,
          channel: roomName // Send the room name
        };
        if (isDevMode()) console.debug('useBroadcastWebRTC onicecandidate sending with messagePeer', event.candidate.type, message);
        currentSocket.emit("messagePeer", message);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (isDevMode()) console.debug('useBroadcastWebRTC: Connection state change for peer:', peerID, pc.connectionState);

      /*
          if (isDevMode()) {
          //troubleshoot webrtc on state change
          pc.getStats().then(stats => {
            stats.forEach(report => {
                console.debug("useBroadcastWebRTC peerConnection", peerID, report);      
            });
          });
        }
      */

      // Use updateConnectedPeersCount which reads peerConnections ref
      updateConnectedPeersCount();

      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (isDevMode()) console.debug('useBroadcastWebRTC: Peer disconnected or failed:', peerID);
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
      if (isDevMode()) console.debug('useBroadcastWebRTC: Negotiation needed for peer:', peerID);

      pc.createOffer()
        .then(offer => {
          return pc.setLocalDescription(offer);
        })
        .then(() => {
          // Get current socket from ref
          const currentSocket = socketRef.current;

          // Check if socket is available before sending
          if (!currentSocket) {
            console.error('useBroadcastWebRTC: Cannot send offer, socket not available');
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
          if (isDevMode()) console.debug('useBroadcastWebRTC: Sending offer with messagePeer', message);
          currentSocket.emit("messagePeer", message);
        })
        .catch(err => console.error('useBroadcastWebRTC: Error creating offer:', err));
    };
  }, [updateConnectedPeersCount, username]); // Remove peerConfig from dependency array

  // Force device refresh function
  const refreshDevices = useCallback(async () => {
    try {
      if (isDevMode()) console.debug('useBroadcastWebRTC: Forcing device refresh...');

      // Some browsers need a fresh getUserMedia call to detect device changes
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      // Always release temporary streams
      tempStream.getTracks().forEach(track => track.stop());

      // Now enumerate the devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      if (isDevMode()) {
        console.debug('useBroadcastWebRTC: Refreshed video devices:', videoDevices.length);
        videoDevices.forEach((device, idx) => {
          console.debug(`Device ${idx}: ${device.label || 'Unnamed device'} (${device.deviceId.substring(0,8)}...)`);
        });
      }

      setDeviceList(videoDevices);

      // If we still only have one device, but the user is forcing rotation
      if (videoDevices.length <= 1) {
        if (isDevMode()) console.debug('useBroadcastWebRTC: Still only one device found, enabling force mode');
        setForceAvailable(true);
      }

      return videoDevices.length > 1;
    } catch (err) {
      console.error('useBroadcastWebRTC: Error refreshing device list:', err);
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
        console.debug('useBroadcastWebRTC: Audio track ' + (audioTrack.enabled ? 'enabled' : 'disabled'));
      }
    }
  }, []);

  // Toggle broadcast pause (freezes outgoing video while keeping the connection/audio alive)
  const togglePause = useCallback(() => {
    if (!localStream.current) return;

    const videoTracks = localStream.current.getVideoTracks();
    if (videoTracks.length === 0) return;

    const newPaused = !isPausedRef.current;
    videoTracks.forEach((track) => {
      track.enabled = !newPaused;
    });
    setIsPaused(newPaused);

    if (isDevMode()) {
      console.debug('useBroadcastWebRTC: Broadcast ' + (newPaused ? 'paused' : 'resumed'));
    }
  }, []);

  const applyLocalStream = useCallback((stream, previousStream = localStream.current) => {
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !audioMutedRef.current;
    });

    stream.getVideoTracks().forEach((track) => {
      track.enabled = !isPausedRef.current;
    });

    localStream.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    if (socketRef.current && config?.channel && username) {
      if (isLive && Object.keys(peerConnections.current).length > 0) {
        if (isDevMode()) console.debug('useBroadcastWebRTC: Replacing media tracks instead of republishing');
        replaceTracks(stream);
      } else if (socketRef.current.connected) {
        if (isDevMode()) console.debug('useBroadcastWebRTC: Stream ready with socket connected, joining room and publishing');
        handleConnect();
      } else {
        setIsConnecting(true);
        if (isDevMode()) console.debug('useBroadcastWebRTC: Stream ready but socket not connected, waiting for connect event');
      }
    }

    if (previousStream) {
      previousStream.getTracks().forEach((track) => {
        if (!stream.getTracks().includes(track)) {
          track.stop();
        }
      });
    }
  }, [config?.channel, handleConnect, isLive, replaceTracks, username]);

  const revertToCameraRef = useRef(() => {});

  const revertToCamera = useCallback(async () => {
    await revertToCameraRef.current();
  }, []);

  // Rotate camera function
  const rotateCamera = useCallback(async () => {
    if (isScreenSharingRef.current) {
      await revertToCamera();
      return;
    }

    // Allow rotation if multiple devices or force mode
    if (deviceList.length <= 1 && !forceAvailable) {
      if (isDevMode()) console.debug('useBroadcastWebRTC: Cannot rotate camera, only one device available');

      // Try refreshing device list one time
      const foundMultiple = await refreshDevices();
      if (!foundMultiple) return;
    }

    try {
      // If we're in force mode or have multiple devices, proceed with rotation
      // In force mode, just reuse the same deviceId but restart the video to try another camera
      if (deviceList.length <= 1 && forceAvailable) {
        if (isDevMode()) console.debug('useBroadcastWebRTC: Forcing camera rotation (same ID, different constraints)');
        // Toggle between front/back by changing facingMode
        const currentFacingMode = localStream.current?.getVideoTracks()[0]?.getSettings()?.facingMode;
        const _newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

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
          'useBroadcastWebRTC: Rotating camera from',
          deviceList[currentIndex]?.label || 'unknown',
          'to',
          nextDevice?.label || 'unknown'
        );
      }

      setSelectedDeviceId(nextDevice.deviceId);
    } catch (err) {
      console.error('useBroadcastWebRTC: Error rotating camera', err);
    }
  }, [deviceList, forceAvailable, selectedDeviceId, refreshDevices, revertToCamera]);

  // Guard to prevent parallel startPreview calls
  const isStartingPreview = useRef(false);

  // Start camera preview
  const startPreview = useCallback(async () => {
    if (isStartingPreview.current) {
      if (isDevMode()) console.debug('useBroadcastWebRTC: startPreview already running, skipping duplicate call');
      return;
    }
    isStartingPreview.current = true;
    setError(null);
    try {
      if (isDevMode()) console.debug('useBroadcastWebRTC: startPreview called. selectedDeviceId:', selectedDeviceId, 'streamSettings:', streamSettingsRef.current);
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
      if (isDevMode()) console.debug('useBroadcastWebRTC: Using constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const previousStream = localStream.current;
      setIsScreenSharing(false);
      // Enumerate devices after getting user media to ensure we have permission
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      // Only update deviceList if changed
      setDeviceList(prev => {
        const prevIds = prev.map(d => d.deviceId).join(',');
        const newIds = videoDevices.map(d => d.deviceId).join(',');
        if (prevIds === newIds) return prev;
        if (isDevMode()) console.debug('useBroadcastWebRTC: Updating deviceList. New devices:', videoDevices.length);
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

      applyLocalStream(stream, previousStream);
    } catch (err) {
      console.error('Media access error:', err);
      setError(err.message || 'Unable to access camera/microphone');
    } finally {
      isStartingPreview.current = false;
    }
  }, [applyLocalStream, selectedDeviceId]); // Use username in dependency array

  useEffect(() => {
    revertToCameraRef.current = startPreview;
  }, [startPreview]);

  const startScreenShare = useCallback(async () => {
    if (isStartingPreview.current || isScreenSharingRef.current) {
      return;
    }

    isStartingPreview.current = true;
    setError(null);

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const previousStream = localStream.current;
      const audioTracks = previousStream?.getAudioTracks().filter((track) => track.readyState === 'live') || [];
      const composedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...audioTracks,
      ]);

      const [screenTrack] = displayStream.getVideoTracks();
      if (screenTrack) {
        screenTrack.onended = () => {
          if (isScreenSharingRef.current) {
            revertToCameraRef.current();
          }
        };
      }

      setIsScreenSharing(true);
      applyLocalStream(composedStream, previousStream);
    } catch (err) {
      console.error('useBroadcastWebRTC: Screen share error', err);
      setError(err.message || 'Unable to share screen');
    } finally {
      isStartingPreview.current = false;
    }
  }, [applyLocalStream]);


  // Set up socket event listeners
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) {
        setIsConnecting(false);
        setIsLive(false);
        return;
    }

    if (isDevMode()) console.debug('useBroadcastWebRTC: Attaching socket listeners');

    // Use the handlers directly - they capture necessary dependencies
    sock.on('connect', handleConnect);
    sock.on('message', handleSocketMessage);
    sock.on('roomUpdate', handleRoomUpdate);
    sock.on('disconnect', handleDisconnect);
    sock.on('publishError', handlePublishError);

    // If already connected when hook mounts/socket changes
    if (sock.connected && localStream.current) {
      if (isDevMode()) console.debug('useBroadcastWebRTC: Socket already connected, invoking connect handler');
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
          if (isDevMode()) console.debug('useBroadcastWebRTC: Detached socket listeners');
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
      if (isDevMode()) console.debug('useBroadcastWebRTC: Unmounting - cleaning up...');

      const currentSocket = socketRef.current; // Use ref for socket
      const nextView = useAppStore.getState().currentView;
      const keepSocketForDebugger = nextView === 'Debugger';

      // Emit roomUnpublish and roomLeave if socket is still connected
      if (!keepSocketForDebugger && currentSocket && currentSocket.connected && cleanupRoom && cleanupStreamId) {
        if (isDevMode()) console.debug(`useBroadcastWebRTC: Emitting roomUnpublish for stream ${cleanupStreamId} in room ${cleanupRoom}`);
        // Use room name as streamId for unpublish
        currentSocket.emit('roomUnpublish', { room: cleanupRoom, stream: cleanupStreamId });

        if (isDevMode()) console.debug(`useBroadcastWebRTC: Emitting roomLeave for room ${cleanupRoom}`);
        currentSocket.emit('roomLeave', { room: cleanupRoom });
      } else if (keepSocketForDebugger) {
        if (isDevMode()) console.debug('useBroadcastWebRTC: Keeping socket connected for Debugger view transition');
      } else {
         if (isDevMode()) console.debug('useBroadcastWebRTC: Skipping room unpublish/leave emit (socket disconnected or missing info)');
      }

      // Cleanup peer connections
      cleanupPeerConnections();

      // Stop local media stream
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
        localStream.current = null;
        if (isDevMode()) console.debug('useBroadcastWebRTC: Local stream stopped');
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
    isMicMuted: audioMuted,
    isScreenSharing,
    isPaused,

    // Functions
    setVideoElement,
    toggleAudioMute,
    toggleMicMute: toggleAudioMute,
    rotateCamera,
    startScreenShare,
    togglePause,

    // Refs
    videoRef,
    // peerConnections: peerConnections.current, // Avoid returning raw ref content directly
  };
}
