// BroadcastChat view component
import React, { useEffect, useRef, useState, useCallback } from 'react'; // Added useState, useCallback
import { Copy, Check, Tv, ArrowDown, Wifi, WifiOff, SwitchCamera, Loader, Mic, MicOff, RefreshCcw, MonitorUp, Pause, Play } from 'lucide-react';
import useBroadcastWebRTC from '../hooks/broadcastWebRTC';
import useAppStore from '../store/appStore';
import { buildShareUrl } from '../utils/shareUrl';
// Removed import of useBroadcastChatStore
import ChatInterface from '../components/ChatInterface';
import ChatToggle from '../components/ChatToggle';
import ExitButton from '../components/ExitButton';
import { isDevMode } from '../config/devMode';

export default function BroadcastChat() {
  // Circuit breaker to prevent infinite rendering loops


  
  // Get setView from the app store to handle errors
  const { config, socket } = useAppStore(); // Get config and socket here
  const room = config?.channel;

  // --- State moved from broadcastChatStore --- 
  const [connectedPeers, setConnectedPeers] = useState(0);
  const [urlCopied, setUrlCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimerRef = useRef(null);
  const hasClickedRef = useRef(false);
  // --- End of moved state ---

  const [isChatVisible, setIsChatVisible] = useState(true);
  const localVideoRef = useRef(null);
  const snapshotFirstTimeoutRef = useRef(null);
  const snapshotIntervalRef = useRef(null);
  const snapshotInFlightRef = useRef(false);


  
  // Callback for the hook to update local peer count state
  const handlePeerCountChange = useCallback((count) => {
    setConnectedPeers(count);
  }, []);

  // Use the custom WebRTC broadcast hook
  const {
    setVideoElement,
    isLive,
    isLoading: _isLoading,
    isConnected: _isConnected,
    isConnecting, // Destructure isConnecting here
    isMicMuted,
    isScreenSharing,
    isPaused,
    toggleMicMute,
    togglePause,
    startBroadcast: _startBroadcast,
    stopBroadcast: _stopBroadcast,
    rotateCamera,
    startScreenShare,
    deviceList // Destructure deviceList here
  } = useBroadcastWebRTC({
    onPeerCountChange: handlePeerCountChange // Use local state updater
  });

  const setBroadcastVideoElement = useCallback((element) => {
    localVideoRef.current = element;
    setVideoElement(element);
  }, [setVideoElement]);

  // --- Functions moved from broadcastChatStore --- 
  const setHasClicked = (clicked) => {
    hasClickedRef.current = clicked;
  };

  const copyURLToClipboard = useCallback(() => {
    if (!room) return;
    const url = buildShareUrl(config, config?.room || room, 'PlayChat');
    navigator.clipboard.writeText(url).then(() => {
      setHasClicked(true);
      setShowTooltip(false);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  }, [config, room]);

  const openURLInNewTab = useCallback(() => {
    if (!room) return;
    const url = buildShareUrl(config, config?.room || room, 'PlayChat');
    window.open(url, '_blank');
    setHasClicked(true);
    setShowTooltip(false);
  }, [config, room]);

  const startTooltipTimer = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
    }
    tooltipTimerRef.current = setTimeout(() => {
      if (!hasClickedRef.current) {
        setShowTooltip(true);
      }
    }, 3000);
  }, []);

  const clearTooltipTimer = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  const resetClickState = useCallback(() => {
    setHasClicked(false);
  }, []);
  // --- End of moved functions ---

  const clearSnapshotTimers = useCallback(() => {
    if (snapshotFirstTimeoutRef.current) {
      clearTimeout(snapshotFirstTimeoutRef.current);
      snapshotFirstTimeoutRef.current = null;
    }
    if (snapshotIntervalRef.current) {
      clearInterval(snapshotIntervalRef.current);
      snapshotIntervalRef.current = null;
    }
  }, []);

  const sendSnapshot = useCallback(async () => {
    const snapshotConfig = config?.snapshots || {};
    const videoElement = localVideoRef.current;

    if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
      return;
    }

    if (!snapshotConfig.url || snapshotInFlightRef.current) {
      return;
    }

    const user = config?.videowhisperServer?.user || config?.username || '';
    const pin = config?.videowhisperServer?.pin || '';
    const roomName = config?.room || room;

    if (!user || !pin || !roomName) {
      return;
    }

    snapshotInFlightRef.current = true;

    try {
      const maxWidth = Number(snapshotConfig.maxWidth || 0);
      const maxHeight = Number(snapshotConfig.maxHeight || 0);
      const sourceWidth = videoElement.videoWidth;
      const sourceHeight = videoElement.videoHeight;

      let targetWidth = sourceWidth;
      let targetHeight = sourceHeight;

      if (maxWidth > 0 || maxHeight > 0) {
        const widthScale = maxWidth > 0 ? maxWidth / sourceWidth : Number.POSITIVE_INFINITY;
        const heightScale = maxHeight > 0 ? maxHeight / sourceHeight : Number.POSITIVE_INFINITY;
        const scale = Math.min(widthScale, heightScale, 1);
        targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        targetHeight = Math.max(1, Math.round(sourceHeight * scale));
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.drawImage(videoElement, 0, 0, targetWidth, targetHeight);

      const quality = Number(snapshotConfig.quality || 0.9);
      const jpegQuality = Number.isFinite(quality) ? Math.min(1, Math.max(0.1, quality)) : 0.9;
      const imageData = canvas.toDataURL('image/jpeg', jpegQuality);

      const payload = new FormData();
      payload.append('room', roomName);
      payload.append('channel', roomName);
      payload.append('user', user);
      payload.append('pin', String(pin));
      payload.append('width', String(targetWidth));
      payload.append('height', String(targetHeight));
      payload.append('data', imageData);

      const response = await fetch(snapshotConfig.url, {
        method: 'POST',
        credentials: 'same-origin',
        body: payload,
      });

      if (!response.ok && isDevMode()) {
        console.warn('BroadcastChat snapshot upload failed with status', response.status);
      }
    } catch (error) {
      if (isDevMode()) {
        console.warn('BroadcastChat snapshot upload error', error);
      }
    } finally {
      snapshotInFlightRef.current = false;
    }
  }, [config, room]);

  // Effect to start tooltip timer on mount
  useEffect(() => {
    startTooltipTimer();
    return () => clearTooltipTimer();
  }, [startTooltipTimer, clearTooltipTimer]);

  useEffect(() => {
    const snapshotConfig = config?.snapshots || {};
    const snapshotsEnabled = Boolean(snapshotConfig.enabled);

    clearSnapshotTimers();

    if (!snapshotsEnabled || !isLive || !snapshotConfig.url) {
      return;
    }

    const timeoutMs = Math.max(0, Number(snapshotConfig.timeout || 0));
    const intervalMs = Math.max(0, Number(snapshotConfig.interval || 0));

    snapshotFirstTimeoutRef.current = setTimeout(() => {
      sendSnapshot();

      if (intervalMs > 0) {
        snapshotIntervalRef.current = setInterval(() => {
          sendSnapshot();
        }, intervalMs);
      }
    }, timeoutMs);

    return () => {
      clearSnapshotTimers();
    };
  }, [config, isLive, clearSnapshotTimers, sendSnapshot]);

  // Toggle chat visibility
  const toggleChat = () => {
    setIsChatVisible(!isChatVisible);
  };

  // Define custom style for ChatInterface in this view
  const chatStyle = {
    left: '5rem', 
    right: '5rem', // Reduce right offset as buttons are now vertical
    width: 'auto',
  };

  return (
    <div className="absolute inset-0 m-0 p-0 bg-black">
      <video 
        ref={setBroadcastVideoElement}
        autoPlay 
        playsInline 
        muted={true}
        className="w-full h-full object-contain bg-black"
      />
      {/* Do not render local error overlay, global error view will be shown */}
    
      {/* Pause/Resume Broadcast Button - Top Right, first position */}
      <button
        onClick={togglePause}
        disabled={!isLive}
        className={`absolute top-5 right-5 p-3 rounded-full shadow-lg border border-gray-700/50 text-white transition-opacity duration-200 ${isLive ? 'bg-black opacity-50 hover:opacity-90' : 'bg-black opacity-30 cursor-not-allowed'}`}
        title={isPaused ? "Resume Broadcast" : "Pause Broadcast"}
      >
        {isPaused ?
          <Play size={24} strokeWidth={2} className="opacity-70 transition-opacity text-yellow-500" /> :
          <Pause size={24} strokeWidth={2} className="opacity-70 transition-opacity" />
        }
      </button>

      {/* Audio Mute Button - Top Right, second position */}
      <button
        onClick={toggleMicMute}
        className="absolute top-20 right-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200"
        title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
      >
        {isMicMuted ?
          <MicOff size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity text-red-500" /> :
          <Mic size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        }
      </button>

      {/* Camera rotation button - Top Right, third position */}
      {/* Check if deviceList exists before accessing length */}
      {deviceList && (deviceList.length > 1 || deviceList.length === 1) && (
        <button
          onClick={rotateCamera}
          className="absolute top-36 right-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200"
          title={isScreenSharing ? 'Switch back to camera' : 'Switch camera'}
        >
          <SwitchCamera size={24} strokeWidth={2} className="opacity-70 hover:opacity-100 transition-opacity" />
        </button>
      )}

      <button
        onClick={startScreenShare}
        className={`absolute top-52 right-5 p-3 rounded-full shadow-lg border border-gray-700/50 text-white transition-opacity duration-200 ${isScreenSharing ? 'bg-emerald-500/90 hover:bg-emerald-400 text-black' : 'bg-black opacity-50 hover:opacity-90'}`}
        title={isScreenSharing ? 'Sharing screen' : 'Share screen'}
      >
        <MonitorUp size={24} strokeWidth={2} className="opacity-70 hover:opacity-100 transition-opacity" />
      </button>

      {/* Connection Status Indicator - Top Right, fifth position */}
      <div className="absolute top-64 right-5 flex flex-col items-center">
        <div
          className="p-3 opacity-70 text-white shadow-neutral-50 flex flex-col items-center"
          title={
            isLive ? `Connected with ${connectedPeers} viewer${connectedPeers !== 1 ? 's' : ''}`
            : isConnecting ? "Connecting..."
            : "Disconnected"
          }
        >
          {isConnecting ?
            <Loader size={24} className="text-yellow-500 animate-spin" strokeWidth={2} /> :
            isLive ?
            <Wifi size={24} strokeWidth={2} className="text-green-500" /> :
            <WifiOff size={24} strokeWidth={2} className="text-red-500" />
          }
          {isLive && (
            <span className="text-xs font-bold mt-1 opacity-70 transition-opacity text-center">{connectedPeers}</span>
          )}
        </div>
      </div>
    
      {/* URL Actions Floating Panel */}
      <div 
        // Change flex-row to flex-col and space-x-2 to space-y-2
        className="absolute bottom-5 right-5 flex flex-col items-center space-y-2 z-20"
        onMouseEnter={clearTooltipTimer} 
        onMouseLeave={resetClickState} // Reset click state when mouse leaves the area
      >
        {/* Tooltip */} 
        {showTooltip && (
          // Adjust tooltip position slightly if needed due to vertical layout
          <div className="absolute bottom-full right-0 mb-2 w-max bg-gray-700 text-white text-xs rounded py-1 px-2 shadow-lg">
            Copy or open stream URL for viewers
            <div className="absolute bottom-0 right-2 w-2 h-2 bg-gray-700 transform rotate-45 translate-y-1/2"></div>
          </div>
        )}
        
        {/* Copy URL Button */}
        <button
          onClick={copyURLToClipboard}
          className={`p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-white transition-colors ${urlCopied ? 'bg-green-600' : 'bg-gray-700 bg-opacity-50 hover:bg-opacity-75'}`}
          title={urlCopied ? "Copied!" : "Copy Stream URL"}
        >
          {urlCopied ? <Check size={20} /> : <Copy size={20} />}
        </button>

        {/* Open URL Button */}
        <button
          onClick={openURLInNewTab}
          className="bg-gray-700 bg-opacity-50 hover:bg-opacity-75 text-white p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-white transition-opacity"
          title="Open Stream URL in New Tab"
        >
          <Tv size={20} />
        </button>

        {/* Exit Button - shown when an exit URL is configured, below the share URL buttons */}
        <ExitButton url={config?.exitUrl} />
      </div>

      {/* Chat Toggle Button */}
      <ChatToggle onClick={toggleChat} isVisible={isChatVisible} />

      {/* Render Chat Interface */}
      {/* Conditionally render based on socket connection and room */}
      {socket && room && socket.connected && isChatVisible && (
        <ChatInterface socket={socket} room={room} style={chatStyle} />
      )}
    </div>
  );
}
