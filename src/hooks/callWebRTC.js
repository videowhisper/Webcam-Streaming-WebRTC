import { useCallback, useEffect, useRef, useState } from 'react';
import useAppStore from '../store/appStore';
import { isDevMode } from '../config/devMode';

function logCallWebRTC(view, message, payload = undefined) {
  if (!isDevMode()) {
    return;
  }

  if (payload === undefined) {
    console.log(`[useCallWebRTC:${view}] ${message}`);
    return;
  }

  console.log(`[useCallWebRTC:${view}] ${message}`, payload);
}

export default function useCallWebRTC({ room, view = 'CallChat' }) {
  const config = useAppStore((state) => state.config);
  const setPeerConfig = useAppStore((state) => state.setPeerConfig);
  const socket = useAppStore((state) => state.socket);

  const socketRef = useRef(socket);
  const roomRef = useRef(room);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const outgoingPeerConnections = useRef({});
  const incomingPeerConnection = useRef(null);
  const incomingChannelRef = useRef(null);
  const previousRoomRef = useRef(null);
  const joinedRoomRef = useRef(null);
  const publishedStreamIdRef = useRef(null);
  const publishedRef = useRef(false);
  const mediaReadyRef = useRef(false);
  const isStartingPreview = useRef(false);
  const isScreenSharingRef = useRef(false);
  const isMicMutedRef = useRef(false);

  const username = config?.username;
  const streamSettings = config?.stream || {};

  const [deviceList, setDeviceList] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [roomError, setRoomError] = useState(null);
  const [isRoomFull, setIsRoomFull] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [roomMeta, setRoomMeta] = useState({});
  const [participants, setParticipants] = useState({});
  const [remoteParticipantName, setRemoteParticipantName] = useState(null);
  const [isRemoteLive, setIsRemoteLive] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    mediaReadyRef.current = mediaReady;
  }, [mediaReady]);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  const updateRemoteParticipant = useCallback((nextParticipants) => {
    const remoteParticipant = Object.values(nextParticipants || {}).find(
      (participant) => participant?.name && participant.name !== username,
    );
    setRemoteParticipantName(remoteParticipant?.name || null);
    setParticipantCount(Object.keys(nextParticipants || {}).length);
  }, [username]);

  const syncRemoteStreamSnapshot = useCallback((streams) => {
    const remoteStream = Object.values(streams || {}).find(
      (stream) => stream?.user && stream.user !== username,
    );

    if (remoteStream) {
      incomingChannelRef.current = remoteStream.channel || null;
      setRemoteParticipantName(remoteStream.user);
      logCallWebRTC(view, 'remote stream snapshot', {
        room,
        streamId: remoteStream.streamId || null,
        channel: remoteStream.channel || null,
        user: remoteStream.user,
        socketId: remoteStream.socketId || null,
      });
      return;
    }

    logCallWebRTC(view, 'remote stream snapshot empty', {
      room,
      streamCount: Object.keys(streams || {}).length,
    });
  }, [room, username, view]);

  const setLocalVideoElement = useCallback((element) => {
    localVideoRef.current = element;
    if (element && localStreamRef.current) {
      element.srcObject = localStreamRef.current;
    }
  }, []);

  const setRemoteVideoElement = useCallback((element) => {
    remoteVideoRef.current = element;
    if (element) {
      element.muted = isSpeakerMuted;
      if (element.srcObject) {
        element.play().catch(() => {});
      }
    }
  }, [isSpeakerMuted]);

  const cleanupOutgoingConnections = useCallback(() => {
    Object.values(outgoingPeerConnections.current).forEach((connection) => {
      if (connection) connection.close();
    });
    outgoingPeerConnections.current = {};
  }, []);

  const cleanupOutgoingPeerConnection = useCallback((peerID, reason = 'replace') => {
    const connection = outgoingPeerConnections.current[peerID];
    if (!connection) {
      return;
    }

    logCallWebRTC(view, 'cleanup outgoing peer', {
      peerID,
      reason,
      state: connection.connectionState || null,
    });

    connection.close();
    delete outgoingPeerConnections.current[peerID];
  }, [view]);

  const cleanupIncomingConnection = useCallback(() => {
    if (incomingPeerConnection.current) {
      incomingPeerConnection.current.close();
      incomingPeerConnection.current = null;
    }
    incomingChannelRef.current = null;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setIsRemoteLive(false);
  }, []);

  const leaveRoom = useCallback((roomName = joinedRoomRef.current || previousRoomRef.current) => {
    const currentSocket = socketRef.current;

    logCallWebRTC(view, 'leaveRoom', {
      roomName,
      socketConnected: currentSocket?.connected || false,
      socketId: currentSocket?.id || null,
      publishedStream: publishedStreamIdRef.current,
    });

    if (currentSocket?.connected && roomName) {
      if (publishedStreamIdRef.current) {
        currentSocket.emit('roomUnpublish', {
          room: roomName,
          stream: publishedStreamIdRef.current,
        });
      }
      currentSocket.emit('roomLeave', { room: roomName });
    }

    joinedRoomRef.current = null;
    publishedRef.current = false;
    publishedStreamIdRef.current = null;
    setIsJoined(false);
    setIsJoining(false);
    setIsRoomFull(false);
    setParticipantCount(0);
    setParticipants({});
    setRemoteParticipantName(null);
    setRoomMeta({});
    cleanupOutgoingConnections();
    cleanupIncomingConnection();
  }, [cleanupIncomingConnection, cleanupOutgoingConnections]);

  const replaceOutgoingTracks = useCallback((stream) => {
    Object.values(outgoingPeerConnections.current).forEach((connection) => {
      if (!connection || connection.connectionState === 'closed') return;
      connection.getSenders().forEach((sender) => {
        if (sender.track?.kind === 'video') {
          const nextVideoTrack = stream.getVideoTracks()[0];
          if (nextVideoTrack) sender.replaceTrack(nextVideoTrack);
        }
        if (sender.track?.kind === 'audio') {
          const nextAudioTrack = stream.getAudioTracks()[0];
          if (nextAudioTrack) sender.replaceTrack(nextAudioTrack);
        }
      });
    });
  }, []);

  const updateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      setDeviceList(videoDevices);

      if (!selectedDeviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (error) {
      console.error('useCallWebRTC: Failed to enumerate devices', error);
    }
  }, [selectedDeviceId]);

  const publishCurrentStream = useCallback(() => {
    const currentSocket = socketRef.current;
    const activeRoom = room;
    const currentStream = localStreamRef.current;

    if (!currentSocket?.connected || !activeRoom || roomRef.current !== activeRoom || !currentStream || !username || publishedRef.current) {
      return;
    }

    const videoSettings = currentStream.getVideoTracks()[0]?.getSettings() || {};
    const streamId = `${activeRoom}:${username}`;
    publishedStreamIdRef.current = streamId;
    publishedRef.current = true;

    logCallWebRTC(view, 'roomPublish emit', {
      room: activeRoom,
      username,
      streamId,
      socketId: currentSocket.id,
    });

    currentSocket.emit('roomPublish', {
      room: activeRoom,
      stream: streamId,
      parameters: {
        width: videoSettings.width || streamSettings.width || 640,
        height: videoSettings.height || streamSettings.height || 360,
        frameRate: videoSettings.frameRate || streamSettings.framerate || 15,
        videoBitrate: streamSettings.videoBitrate || 500,
        audioBitrate: streamSettings.audioBitrate || 32,
        type: 'webrtc',
      },
    });
  }, [room, streamSettings.audioBitrate, streamSettings.framerate, streamSettings.height, streamSettings.videoBitrate, streamSettings.width, username, view]);

  const joinRoom = useCallback(() => {
    const currentSocket = socketRef.current;

    if (!room || roomRef.current !== room || !username || !mediaReadyRef.current || !currentSocket?.connected) {
      logCallWebRTC(view, 'joinRoom skipped', {
        room,
        currentRoom: roomRef.current,
        username,
        mediaReady: mediaReadyRef.current,
        socketConnected: currentSocket?.connected || false,
        socketId: currentSocket?.id || null,
      });
      return false;
    }

    logCallWebRTC(view, 'joinRoom emit', {
      room,
      username,
      socketId: currentSocket.id,
    });

    setRoomError(null);
    setIsRoomFull(false);
    setIsJoining(true);
    setRoomMeta({});

    currentSocket.emit('roomJoin', {
      room,
      options: {
        maxParticipants: 2,
        privateRoom: true,
        view,
      },
    });

    return true;
  }, [room, username, view]);

  const applyLocalStream = useCallback(async (nextStream, previousStream = localStreamRef.current) => {
    nextStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMicMutedRef.current;
    });

    localStreamRef.current = nextStream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = nextStream;
    }

    await updateDevices();

    if (previousStream) {
      replaceOutgoingTracks(nextStream);
      previousStream.getTracks().forEach((track) => {
        if (!nextStream.getTracks().includes(track)) {
          track.stop();
        }
      });
    }

    setMediaReady(true);

    if (socketRef.current?.connected && room && roomRef.current === room) {
      joinRoom();
    }
  }, [joinRoom, replaceOutgoingTracks, room, updateDevices]);

  const handleIncomingOffer = useCallback(async (message) => {
    if (!message?.channel || message.channel === publishedStreamIdRef.current) {
      return;
    }

    cleanupIncomingConnection();

    const peerConfig = message.peerConfig || useAppStore.getState().peerConfig;
    const connection = new RTCPeerConnection(peerConfig);
    incomingPeerConnection.current = connection;
    incomingChannelRef.current = message.channel;
    setRemoteParticipantName(message.from || null);

    connection.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (!stream || !remoteVideoRef.current) return;
      if (remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
      }
      remoteVideoRef.current.muted = isSpeakerMuted;
      remoteVideoRef.current.play().catch(() => {});
      setIsRemoteLive(true);
    };

    connection.onicecandidate = (event) => {
      if (!event.candidate || !socketRef.current?.connected) return;
      socketRef.current.emit('messagePeer', {
        type: 'candidate',
        from: username,
        target: message.from,
        channel: message.channel,
        candidate: event.candidate,
      });
    };

    connection.onconnectionstatechange = () => {
      if (!incomingPeerConnection.current) return;
      const state = incomingPeerConnection.current.connectionState;
      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        cleanupIncomingConnection();
      }
    };

    try {
      await connection.setRemoteDescription(new RTCSessionDescription(message.content));
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      socketRef.current.emit('messagePeer', {
        type: 'answer',
        from: username,
        target: message.from,
        channel: message.channel,
        content: answer,
      });
    } catch (error) {
      console.error('useCallWebRTC: Failed to handle offer', error);
      setRoomError(error.message || 'Failed to establish call');
      cleanupIncomingConnection();
    }
  }, [cleanupIncomingConnection, isSpeakerMuted, username]);

  const addOutgoingPeerConnection = useCallback((peerID) => {
    const currentSocket = socketRef.current;
    const currentStream = localStreamRef.current;
    const currentChannel = publishedStreamIdRef.current;

    if (!peerID || peerID === username || !currentSocket || !currentStream || !currentChannel) {
      return;
    }

    if (outgoingPeerConnections.current[peerID]) {
      cleanupOutgoingPeerConnection(peerID, 'recreate');
    }

    logCallWebRTC(view, 'create outgoing peer', {
      peerID,
      channel: currentChannel,
      socketId: currentSocket.id,
    });

    const connection = new RTCPeerConnection(useAppStore.getState().peerConfig);
    outgoingPeerConnections.current[peerID] = connection;

    currentStream.getTracks().forEach((track) => {
      connection.addTrack(track, currentStream);
    });

    connection.onicecandidate = (event) => {
      if (!event.candidate || !socketRef.current?.connected) return;
      socketRef.current.emit('messagePeer', {
        type: 'candidate',
        from: username,
        target: peerID,
        channel: currentChannel,
        candidate: event.candidate,
      });
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed' || connection.connectionState === 'disconnected') {
        cleanupOutgoingPeerConnection(peerID, 'state-change');
      }
    };

    connection.onnegotiationneeded = async () => {
      try {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);

        socketRef.current.emit('messagePeer', {
          type: 'offer',
          from: username,
          target: peerID,
          channel: currentChannel,
          content: connection.localDescription,
          peerConfig: useAppStore.getState().peerConfig,
        });
      } catch (error) {
        console.error('useCallWebRTC: Failed to negotiate outgoing connection', error);
      }
    };
  }, [cleanupOutgoingPeerConnection, username, view]);

  const handleSocketMessage = useCallback((message) => {
    if (!message) return;

    if (message.type === 'peers') {
      logCallWebRTC(view, 'message peers', {
        peerCount: (message.peers || []).length,
        publishedStreamId: publishedStreamIdRef.current,
      });
      if (message.peerConfig) {
        setPeerConfig(message.peerConfig);
      }
      (message.peers || []).forEach((peer) => {
        if (peer.peerID && peer.peerID !== username) {
          addOutgoingPeerConnection(peer.peerID);
        }
      });
      return;
    }

    if (message.type === 'peer') {
      logCallWebRTC(view, 'message peer', {
        peerID: message.peerID || null,
        publishedStreamId: publishedStreamIdRef.current,
      });
      if (message.peerID && message.peerID !== username) {
        addOutgoingPeerConnection(message.peerID);
      }
      return;
    }

    if (message.type === 'offer') {
      logCallWebRTC(view, 'message offer', {
        from: message.from || null,
        channel: message.channel || null,
      });
      handleIncomingOffer(message);
      return;
    }

    if (message.type === 'answer' && message.channel === publishedStreamIdRef.current) {
      logCallWebRTC(view, 'message answer', {
        from: message.from || null,
        channel: message.channel || null,
      });
      const connection = outgoingPeerConnections.current[message.from];
      if (connection) {
        connection.setRemoteDescription(new RTCSessionDescription(message.content)).catch((error) => {
          console.error('useCallWebRTC: Failed to handle answer', error);
        });
      }
      return;
    }

    if (message.type === 'candidate') {
      logCallWebRTC(view, 'message candidate', {
        from: message.from || null,
        channel: message.channel || null,
        target: message.target || null,
      });
      if (message.channel === publishedStreamIdRef.current) {
        const connection = outgoingPeerConnections.current[message.from];
        if (connection) {
          connection.addIceCandidate(new RTCIceCandidate(message.candidate)).catch((error) => {
            console.error('useCallWebRTC: Failed to add outgoing ICE candidate', error);
          });
        }
        return;
      }

      if (incomingPeerConnection.current && message.channel === incomingChannelRef.current) {
        incomingPeerConnection.current.addIceCandidate(new RTCIceCandidate(message.candidate)).catch((error) => {
          console.error('useCallWebRTC: Failed to add incoming ICE candidate', error);
        });
      }
    }
  }, [addOutgoingPeerConnection, handleIncomingOffer, setPeerConfig, username, view]);

  const handleRoomUpdate = useCallback((message) => {
    if (!room || message?.room !== room) {
      return;
    }

    logCallWebRTC(view, 'roomUpdate', {
      room,
      type: message?.type || null,
      error: message?.error || null,
      participantCount: message?.meta?.participantCount,
      streamCount: Object.keys(message?.streams || {}).length,
      streamNew: message?.streamNew?.channel || null,
      streamRemove: message?.streamRemove || null,
    });

    if (message.meta) {
      setRoomMeta(message.meta);
      if (typeof message.meta.participantCount === 'number') {
        setParticipantCount(message.meta.participantCount);
      }
      if (message.meta.availableSlots > 0) {
        setIsRoomFull(false);
      }
    }

    if (message.participants) {
      setParticipants(message.participants);
      updateRemoteParticipant(message.participants);

      const isParticipant = Object.keys(message.participants).some(
        (participantId) => message.participants[participantId]?.name === username,
      );

      if (isParticipant) {
        joinedRoomRef.current = room;
        setIsJoined(true);
        setIsJoining(false);

        if (mediaReadyRef.current) {
          publishCurrentStream();
        }
      }
    }

    if (message.streams) {
      syncRemoteStreamSnapshot(message.streams);
    }

    if (message.error) {
      setRoomError(message.error);
      setIsRoomFull(message.type === 'roomFull');
      setIsJoining(false);
      setIsJoined(false);
      return;
    }

    if (message.type === 'roomJoin') {
      joinedRoomRef.current = room;
      setIsJoined(true);
      setIsJoining(false);
      publishCurrentStream();
    }

    if (message.participantJoin?.name && message.participantJoin.name !== username) {
      setRemoteParticipantName(message.participantJoin.name);
    }

    if (message.participantLeft?.name && message.participantLeft.name !== username) {
      cleanupOutgoingPeerConnection(message.participantLeft.name, 'participant-left');
      cleanupIncomingConnection();
      setRemoteParticipantName(null);
      setRoomError(null);
      setIsRoomFull(false);
    }

    if (message.streamNew?.user && message.streamNew.user !== username) {
      incomingChannelRef.current = message.streamNew.channel;
      setRemoteParticipantName(message.streamNew.user);
    }

    if (message.streamRemove) {
      if (message.streamRemove === publishedStreamIdRef.current) {
        logCallWebRTC(view, 'own stream removed, retrying publish', {
          room,
          streamId: message.streamRemove,
          socketId: socketRef.current?.id || null,
        });
        publishedRef.current = false;

        if (socketRef.current?.connected && joinedRoomRef.current === room && mediaReadyRef.current) {
          publishCurrentStream();
        }
        return;
      }

      const remoteStreamIdPrefix = `${room}:`;
      if (message.streamRemove.startsWith(remoteStreamIdPrefix)) {
        const removedUser = message.streamRemove.slice(remoteStreamIdPrefix.length);
        if (removedUser && removedUser !== username) {
          cleanupOutgoingPeerConnection(removedUser, 'stream-remove');
        }
      }

      cleanupIncomingConnection();
    }
  }, [cleanupIncomingConnection, cleanupOutgoingPeerConnection, publishCurrentStream, room, updateRemoteParticipant, username, view]);

  useEffect(() => {
    logCallWebRTC(view, 'hook init', {
      room,
      username,
      socketConnected: socketRef.current?.connected || false,
      socketId: socketRef.current?.id || null,
      devMode: isDevMode(),
    });
  }, [room, username, view]);

  const handleDisconnect = useCallback(() => {
    logCallWebRTC(view, 'socket disconnect cleanup', {
      room,
      joinedRoom: joinedRoomRef.current,
      socketId: socketRef.current?.id || null,
    });
    joinedRoomRef.current = null;
    publishedRef.current = false;
    publishedStreamIdRef.current = null;
    setIsJoined(false);
    setIsJoining(false);
    cleanupOutgoingConnections();
    cleanupIncomingConnection();
  }, [cleanupIncomingConnection, cleanupOutgoingConnections, room, view]);

  const handleServerError = useCallback((message) => {
    if (!message) return;
    setRoomError(message.message || message.error || 'Server error');
  }, []);

  const startPreview = useCallback(async () => {
    if (isStartingPreview.current) {
      return;
    }

    isStartingPreview.current = true;

    try {
      const constraints = {
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          width: { ideal: streamSettings.width || 640 },
          height: { ideal: streamSettings.height || 360 },
          frameRate: { ideal: streamSettings.framerate || 15 },
        },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const previousStream = localStreamRef.current;
      setIsScreenSharing(false);

      logCallWebRTC(view, 'local media ready', {
        room,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        selectedDeviceId,
      });

      await applyLocalStream(stream, previousStream);
    } catch (error) {
      console.error('useCallWebRTC: Failed to get local media', error);
      logCallWebRTC(view, 'local media failed', {
        room,
        message: error.message || 'Unable to access camera/microphone',
        name: error.name || null,
      });
      setRoomError(error.message || 'Unable to access camera/microphone');
      setMediaReady(false);
    } finally {
      isStartingPreview.current = false;
    }
  }, [applyLocalStream, room, selectedDeviceId, streamSettings.framerate, streamSettings.height, streamSettings.width, view]);

  const startScreenShare = useCallback(async () => {
    if (isStartingPreview.current || isScreenSharingRef.current) {
      return;
    }

    isStartingPreview.current = true;

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const previousStream = localStreamRef.current;
      const audioTracks = previousStream?.getAudioTracks().filter((track) => track.readyState === 'live') || [];
      const composedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...audioTracks,
      ]);

      const [screenTrack] = displayStream.getVideoTracks();
      if (screenTrack) {
        screenTrack.onended = () => {
          if (isScreenSharingRef.current) {
            startPreview();
          }
        };
      }

      setSelectedDeviceId(null);
      setIsScreenSharing(true);

      logCallWebRTC(view, 'screen share ready', {
        room,
        videoTracks: composedStream.getVideoTracks().length,
        audioTracks: composedStream.getAudioTracks().length,
      });

      await applyLocalStream(composedStream, previousStream);
    } catch (error) {
      logCallWebRTC(view, 'screen share failed', {
        room,
        message: error.message || 'Unable to share screen',
        name: error.name || null,
      });
    } finally {
      isStartingPreview.current = false;
    }
  }, [applyLocalStream, room, startPreview, view]);

  const rotateCamera = useCallback(async () => {
    if (isScreenSharingRef.current) {
      await startPreview();
      return;
    }

    if (deviceList.length > 1) {
      const currentIndex = deviceList.findIndex((device) => device.deviceId === selectedDeviceId);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % deviceList.length : 0;
      setSelectedDeviceId(deviceList[nextIndex].deviceId);
      return;
    }

    setSelectedDeviceId((currentValue) => currentValue || null);
    await startPreview();
  }, [deviceList, selectedDeviceId, startPreview]);

  const toggleMicMute = useCallback(() => {
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];
    audioTracks.forEach((track) => {
      track.enabled = !track.enabled;
      setIsMicMuted(!track.enabled);
    });
  }, []);

  const toggleSpeakerMute = useCallback(() => {
    setIsSpeakerMuted((currentValue) => {
      const nextValue = !currentValue;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.muted = nextValue;
        if (!nextValue) {
          remoteVideoRef.current.play().catch(() => {});
        }
      }
      return nextValue;
    });
  }, []);

  useEffect(() => {
    startPreview();
  }, [startPreview]);

  useEffect(() => {
    const currentSocket = socketRef.current;
    if (!currentSocket) return undefined;

    const onConnect = () => {
      logCallWebRTC(view, 'socket connected listener', {
        room,
        mediaReady: mediaReadyRef.current,
        socketId: currentSocket.id,
      });
      if (room && mediaReadyRef.current) {
        joinRoom();
      }
    };

    currentSocket.on('connect', onConnect);
    currentSocket.on('disconnect', handleDisconnect);
    currentSocket.on('message', handleSocketMessage);
    currentSocket.on('roomUpdate', handleRoomUpdate);
    currentSocket.on('publishError', handleServerError);
    currentSocket.on('subscribeError', handleServerError);

    if (currentSocket.connected && room && mediaReadyRef.current) {
      joinRoom();
    }

    return () => {
      currentSocket.off('connect', onConnect);
      currentSocket.off('disconnect', handleDisconnect);
      currentSocket.off('message', handleSocketMessage);
      currentSocket.off('roomUpdate', handleRoomUpdate);
      currentSocket.off('publishError', handleServerError);
      currentSocket.off('subscribeError', handleServerError);
    };
  }, [handleDisconnect, handleRoomUpdate, handleServerError, handleSocketMessage, joinRoom, room, socket]);

  useEffect(() => {
    const previousRoom = previousRoomRef.current;
    if (previousRoom && previousRoom !== room) {
      leaveRoom(previousRoom);
      setRoomError(null);
      setParticipants({});
      setParticipantCount(0);
    }

    previousRoomRef.current = room || null;

    if (room && socketRef.current?.connected && mediaReadyRef.current) {
      joinRoom();
    }
  }, [joinRoom, leaveRoom, room]);

  useEffect(() => () => {
    leaveRoom(previousRoomRef.current);
    cleanupOutgoingConnections();
    cleanupIncomingConnection();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }, [cleanupIncomingConnection, cleanupOutgoingConnections, leaveRoom]);

  return {
    setLocalVideoElement,
    setRemoteVideoElement,
    deviceList,
    isJoined,
    isJoining,
    isRemoteLive,
    isMicMuted,
    isSpeakerMuted,
    isRoomFull,
    mediaReady,
    participantCount,
    participants,
    remoteParticipantName,
    roomError,
    roomMeta,
    isScreenSharing,
    rotateCamera,
    startScreenShare,
    toggleMicMute,
    toggleSpeakerMute,
    joinRoom,
    leaveRoom,
  };
}
