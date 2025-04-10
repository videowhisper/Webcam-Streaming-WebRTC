import React, { useEffect, useRef, useState } from 'react';
import { isDevMode } from '../config/devMode';
import { Wifi, WifiOff, SwitchCamera, Loader, Mic, MicOff, RefreshCcw } from 'lucide-react';

export default function BroadcastWebRTC({ config, socket }) {
  const videoRef = useRef(null);
  const hasMounted = useRef(false);
  const [error, setError] = useState(null);
  const [deviceList, setDeviceList] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState(0); // Add state for counting connected peers
  const [audioMuted, setAudioMuted] = useState(false);
  const audioTrackRef = useRef(null);
  const [forceAvailable, setForceAvailable] = useState(false);
  const [refreshDevicesHovered, setRefreshDevicesHovered] = useState(false);
  
  // States for button hover effects
  const [micButtonHovered, setMicButtonHovered] = useState(false);
  const [cameraButtonHovered, setCameraButtonHovered] = useState(false);
  const [connectionButtonHovered, setConnectionButtonHovered] = useState(false);
  
  // WebRTC peer connections state
  const [peerConfig, setPeerConfig] = useState({ 'iceServers': [] });
  const peerConnections = useRef({});
  const currentUsername = useRef(null);
  const currentChannel = useRef(null);
  const localStream = useRef(null);

  // Function to update the connected peers count
  const updateConnectedPeersCount = () => {
    const count = Object.values(peerConnections.current).filter(pc => 
      pc && pc.connectionState === 'connected'
    ).length;
    setConnectedPeers(count);
    if (isDevMode()) console.debug('BroadcastWebRTC Connected peers count updated:', count);
  };

  useEffect(() => {
    if (isDevMode() && !hasMounted.current) {
      console.debug('BroadcastWebRTC mounted with config:', config);
      hasMounted.current = true;
    }

    startPreview();

    return () => {
      // Clean up stream on unmount
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      
      // Close all peer connections
      Object.values(peerConnections.current).forEach(pc => {
        if (pc) pc.close();
      });
      peerConnections.current = {};
      
      // Remove all socket listeners
      cleanupSocketListeners();
    };
  }, [selectedDeviceId]);

  // Setup socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Setup socket event listeners for peers
    socket.on('message', handleSocketMessage);
    
    return () => {
      cleanupSocketListeners();
    };
  }, [socket]);

  // Clean up socket listeners
  function cleanupSocketListeners() {
    if (!socket) return;
    socket.off('message', handleSocketMessage);
  }

  // Handle socket messages
  function handleSocketMessage(message) {
    if (isDevMode()) console.debug('BroadcastWebRTC Socket message received:', message);

    if (message.type === "peers") {
      // Store ICE server configuration
      if (message.peerConfig) {
        setPeerConfig(message.peerConfig);
      }

      // Setup connections for all existing peers
      if (message.peers && Array.isArray(message.peers)) {
        message.peers.forEach(peer => {
          if (peer.peerID && peer.peerID !== config.username) {
            addPeerConnection(peer.peerID);
          }
        });
      }
    } else if (message.type === "peer") {
      // Add new peer connection when new viewer joins
      if (message.peerID && message.peerID !== config.username) {
        if (isDevMode()) console.debug('BroadcastWebRTC New peer joined:', message.peerID);
        
        // First ensure any existing connection for this peer is cleaned up
        if (peerConnections.current[message.peerID]) {
          if (isDevMode()) console.debug('BroadcastWebRTC Cleaning up existing connection for peer before creating new one:', message.peerID);
          peerConnections.current[message.peerID].close();
          delete peerConnections.current[message.peerID];
        }
        
        // Create new peer connection
        addPeerConnection(message.peerID);
      }
    } else if (message.type === "answer") {
      // Process answer from a peer
      if (peerConnections.current[message.from]) {
        if (isDevMode()) console.debug('BroadcastWebRTC Received answer from peer:', message.from);
        peerConnections.current[message.from]
          .setRemoteDescription(message.content)
          .catch(err => console.error('BroadcastWebRTC Error setting remote description:', err));
      }
    } else if (message.type === "candidate") {
      // Process ICE candidate from a peer
      if (peerConnections.current[message.from] && message.candidate) {
        peerConnections.current[message.from].addIceCandidate(new RTCIceCandidate(message.candidate))
          .catch(err => console.error('BroadcastWebRTC Error adding ICE candidate:', err));
      }
    } 
  }

  // Add a new peer connection
  function addPeerConnection(peerID) {
    if (peerConnections.current[peerID]) return; // Already exists
    if (!localStream.current) {
      if (isDevMode()) console.debug('BroadcastWebRTC Cannot create peer connection, local stream not available');
      return;
    }

    if (isDevMode()) console.debug('BroadcastWebRTC Adding peer connection for:', peerID);

    // Create new peer connection
    const pc = new RTCPeerConnection(peerConfig);
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
    if (senders.video && config.stream?.videoBitrate) {
      const setVideoParams = async () => {
        try {
          const params = senders.video.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings.forEach(encoding => {
            // Convert kbps to bps
            encoding.maxBitrate = config.stream.videoBitrate * 1000;
          });
          await senders.video.setParameters(params);
          if (isDevMode()) console.debug('BroadcastWebRTC Video bitrate limited to:', config.stream.videoBitrate, 'kbps');
        } catch (err) {
          console.error('BroadcastWebRTC Failed to set video bitrate:', err);
        }
      };
      setVideoParams();
    }

    if (senders.audio && config.stream?.audioBitrate) {
      const setAudioParams = async () => {
        try {
          const params = senders.audio.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings.forEach(encoding => {
            // Convert kbps to bps
            encoding.maxBitrate = config.stream.audioBitrate * 1000;
          });
          await senders.audio.setParameters(params);
          if (isDevMode()) console.debug('BroadcastWebRTC Audio bitrate limited to:', config.stream.audioBitrate, 'kbps');
        } catch (err) {
          console.error('BroadcastWebRTC Failed to set audio bitrate:', err);
        }
      };
      setAudioParams();
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (isDevMode()) console.debug('BroadcastWebRTC Sending ICE candidate to peer:', peerID);
        socket.emit("messagePeer", {
          from: config.username,
          target: peerID,
          type: "candidate",
          candidate: event.candidate
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = (event) => {
      if (isDevMode()) console.debug('BroadcastWebRTC Connection state change for peer:', peerID, pc.connectionState);
      
      // Handle connection established
      if (pc.connectionState === 'connected') {
        if (isDevMode()) console.debug('BroadcastWebRTC Connected to peer:', peerID);
        updateConnectedPeersCount(); // Update count when connection state changes
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (isDevMode()) console.debug('BroadcastWebRTC Peer disconnected or failed:', peerID);
        updateConnectedPeersCount(); // Update count when connection state changes
      }
    };

    // Handle negotiation needed - create and send offer
    pc.onnegotiationneeded = () => {
      if (isDevMode()) console.debug('BroadcastWebRTC Negotiation needed for peer:', peerID);
      
      pc.createOffer()
        .then(offer => {
          return pc.setLocalDescription(offer);
        })
        .then(() => {
          // Send the offer to the peer
          socket.emit("messagePeer", {
            from: config.username,
            target: peerID,
            type: "offer",
            content: pc.localDescription,
            peerConfig: peerConfig
          });
          if (isDevMode()) console.debug('BroadcastWebRTC Offer sent to peer:', peerID);
        })
        .catch(err => console.error('BroadcastWebRTC Error creating offer:', err));
    };
  }

  // Toggle audio mute function
  const toggleAudioMute = () => {
    if (!localStream.current) return;
    
    const audioTracks = localStream.current.getAudioTracks();
    if (audioTracks.length > 0) {
      const audioTrack = audioTracks[0];
      audioTrack.enabled = !audioTrack.enabled;
      setAudioMuted(!audioTrack.enabled);
      
      if (isDevMode()) {
        console.debug('BroadcastWebRTC Audio track ' + (audioTrack.enabled ? 'enabled' : 'disabled'));
      }
    }
  };

  async function startPreview() {
    setError(null);
    try {
      // Set up video constraints using config.stream settings
      const videoConstraints = {
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        width: { ideal: config.stream?.width || 640, max: config.stream?.width || 640 },
        height: { ideal: config.stream?.height || 360, max: config.stream?.height || 360 },
        frameRate: { ideal: config.stream?.framerate || 15, max: config.stream?.framerate || 15 }
      };
      
      const constraints = {
        video: videoConstraints,
        audio: true,
      };
  
      if (isDevMode()) console.debug('BroadcastWebRTC Using constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Enumerate devices after getting user media to ensure we have permission
      // This is important because some browsers only show device labels after permission is granted
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      // Debug device info
      if (isDevMode()) {
        console.debug('BroadcastWebRTC Available video devices:', videoDevices.length);
        videoDevices.forEach((device, idx) => {
          console.debug(`Device ${idx}: ${device.label || 'Unnamed device'} (${device.deviceId.substring(0,8)}...)`);
        });
      }
      
      setDeviceList(videoDevices);

      if (!selectedDeviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
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

      if (socket && config.channel && config.username) {
        currentUsername.current = config.username;
        currentChannel.current = config.channel;

        const handleConnect = () => {
          const streamSettings = stream.getVideoTracks()[0].getSettings();
          const publishParams = {
            width: streamSettings.width,
            height: streamSettings.height,
            frameRate: streamSettings.frameRate,
            videoBitrate: config.stream?.videoBitrate || 500,
            audioBitrate: config.stream?.audioBitrate || 32
          };

          if (isDevMode()) console.debug('BroadcastWebRTC socket connected — publishing to:', config.channel, publishParams);
          socket.emit('publish', config.username, config.channel, publishParams);
          setIsConnecting(false);
          setIsLive(true);
        };

        const handleDisconnect = () => {
          if (isDevMode()) console.debug('BroadcastWebRTC socket disconnected');
          setIsLive(false);
          setIsConnecting(false);
          
          // Clean up peer connections on disconnect
          Object.values(peerConnections.current).forEach(pc => {
            if (pc) pc.close();
          });
          peerConnections.current = {};
        };

        const handlePublishError = (err) => {
          console.error('BroadcastWebRTC  Publish error:', err);
          setError('Publishing failed: ' + err.message);
          setIsLive(false);
          setIsConnecting(false);
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('publishError', handlePublishError);

        if (socket.connected) {
          handleConnect();
        } else {
          setIsConnecting(true);
        }

        return () => {
          socket.off('connect', handleConnect);
          socket.off('disconnect', handleDisconnect);
          socket.off('publishError', handlePublishError);
        };
      }
    } catch (err) {
      console.error('Media access error:', err);
      setError(err.message || 'Unable to access camera/microphone');
    }
  }

  // Removing copyURLToClipboard function

  const disconnectStream = () => {
    if (socket) {
      socket.disconnect();
      setIsLive(false);
      setIsConnecting(false);
      
      // Clean up peer connections
      Object.values(peerConnections.current).forEach(pc => {
        if (pc) pc.close();
      });
      peerConnections.current = {};
      setConnectedPeers(0); // Reset peer count when disconnecting
      
      if (isDevMode()) console.debug('BroadcastWebRTC Manually disconnected');
    }
  };

  // Force device refresh function
  const refreshDevices = async () => {
    try {
      if (isDevMode()) console.debug('BroadcastWebRTC Forcing device refresh...');
      
      // Some browsers need a fresh getUserMedia call to detect device changes
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      
      // Always release temporary streams
      tempStream.getTracks().forEach(track => track.stop());
      
      // Now enumerate the devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      if (isDevMode()) {
        console.debug('BroadcastWebRTC Refreshed video devices:', videoDevices.length);
        videoDevices.forEach((device, idx) => {
          console.debug(`Device ${idx}: ${device.label || 'Unnamed device'} (${device.deviceId.substring(0,8)}...)`);
        });
      }
      
      setDeviceList(videoDevices);
      
      // If we still only have one device, but the user is forcing rotation
      if (videoDevices.length <= 1) {
        if (isDevMode()) console.debug('BroadcastWebRTC Still only one device found, enabling force mode');
        setForceAvailable(true);
      }
      
      return videoDevices.length > 1;
    } catch (err) {
      console.error('BroadcastWebRTC Error refreshing device list:', err);
      return false;
    }
  };

  // Improved rotateCamera function to handle force mode
  const rotateCamera = async () => {
    // Allow rotation if multiple devices or force mode
    if (deviceList.length <= 1 && !forceAvailable) {
      if (isDevMode()) console.debug('BroadcastWebRTC Cannot rotate camera, only one device available');
      
      // Try refreshing device list one time
      const foundMultiple = await refreshDevices();
      if (!foundMultiple) return;
    }
    
    try {
      // If we're in force mode or have multiple devices, proceed with rotation
      // In force mode, just reuse the same deviceId but restart the video to try another camera
      if (deviceList.length <= 1 && forceAvailable) {
        if (isDevMode()) console.debug('BroadcastWebRTC Forcing camera rotation (same ID, different constraints)');
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
          'BroadcastWebRTC Switching camera from:',
          deviceList[currentIndex]?.label || '(unknown)',
          'to:',
          nextDevice.label || '(unknown)',
          `(${currentIndex + 1} of ${deviceList.length})`
        );
      }
      
      setSelectedDeviceId(nextDevice.deviceId);
    } catch (err) {
      console.error('BroadcastWebRTC Error rotating camera:', err);
      
      // Force device refresh as fallback
      refreshDevices();
    }
  };

  return (
    <div className="absolute inset-0 m-0 p-0 bg-black">
      {error ? (
        <div className="flex flex-col items-center justify-center w-full h-full text-white p-4">
          <p className="mb-2">{error}</p>
          <button 
            className="bg-red-500 bg-opacity-70 hover:bg-opacity-100 text-white font-bold py-2 px-4 rounded transition-opacity"
            onClick={() => setError(null)}
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain bg-black"
          />
          
          {/* Audio Mute Button - Top Right */}
          <button
            onClick={toggleAudioMute}
            className="absolute top-5 right-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200"
            title={audioMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {audioMuted ? 
              <MicOff size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity" /> : 
              <Mic size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity" />
            }
          </button>
          
          {/* Only show Camera Switch Button if multiple cameras are available */}
          {(deviceList.length > 1 || forceAvailable) && (
            <button
              onClick={rotateCamera}
              className="absolute top-20 right-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200"
              title={deviceList.length > 1 ? `Switch Camera (${deviceList.length} available)` : "Switch Camera (forced mode)"}
            >
              <SwitchCamera size={24} strokeWidth={2} className="opacity-70 hover:opacity-100 transition-opacity" />
            </button>
          )}
          
          {/* Refresh devices button (only shown when only one camera is detected) */}
          {deviceList.length <= 1 && !forceAvailable && (
            <button
              onClick={refreshDevices}
              className="absolute top-20 left-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200"
              title="Refresh camera list"
            >
              <RefreshCcw size={24} strokeWidth={2} className="opacity-70 hover:opacity-100 transition-opacity" />
            </button>
          )}
          
          {/* Connection Button - Moved up when no camera button is shown */}
          <div className={`absolute ${deviceList.length > 1 || forceAvailable ? 'top-36' : 'top-20'} right-5 flex flex-col items-center`}>
            <button
              onClick={() => {
                if (isLive || isConnecting) {
                  disconnectStream();
                } else {
                  socket.connect();
                  setIsConnecting(true);
                }
              }}
              className="p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200"
              title={
                isLive ? `Connected with ${connectedPeers} viewer${connectedPeers !== 1 ? 's' : ''}`
                : isConnecting ? "Connecting..."
                : "Connect"
              }
            >
              {isLive ? 
                <Wifi size={24} strokeWidth={2} className="text-green-500" /> : 
                isConnecting ? 
                <Loader size={24} className="text-yellow-500 animate-spin" strokeWidth={2} /> : 
                <WifiOff size={24} strokeWidth={2} className="text-red-500 " />
              }
              {isLive && (
                <span className="text-xs font-bold mt-1 opacity-70 hover:opacity-100 transition-opacity">{connectedPeers}</span>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}