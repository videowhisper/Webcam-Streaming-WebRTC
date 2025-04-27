// BroadcastChat view component
import React, { useEffect, useRef, useState, useCallback } from 'react'; // Added useState, useCallback
import { Copy, Check, Tv, ArrowDown, Wifi, WifiOff, SwitchCamera, Loader, Mic, MicOff, RefreshCcw } from 'lucide-react';
import useBroadcastWebRTC from '../hooks/broadcastWebRTC';
import useAppStore from '../store/appStore';
// Removed import of useBroadcastChatStore
import ChatInterface from '../components/ChatInterface';
import ChatToggle from '../components/ChatToggle';
import { isDevMode } from '../config/devMode';

export default function BroadcastChat() {
  // Circuit breaker to prevent infinite rendering loops
  const renderCountRef = useRef(0);
  const MAX_RENDERS = 20;
  
  // Get setView from the app store to handle errors
  const { setView, setErrorMessage, config, socket } = useAppStore(); // Get config and socket here
  const room = config?.channel;

  // --- State moved from broadcastChatStore --- 
  const [connectedPeers, setConnectedPeers] = useState(0);
  const [urlCopied, setUrlCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimerRef = useRef(null);
  const hasClickedRef = useRef(false);
  // --- End of moved state ---

  const [isChatVisible, setIsChatVisible] = useState(true);

  if (false) if (isDevMode()) 
  React.useEffect(() => {
    renderCountRef.current += 1;
    if (renderCountRef.current > MAX_RENDERS) {
      if (isDevMode()) console.debug('BroadcastChat: Too many renders detected, activating circuit breaker', renderCountRef.current);
      setErrorMessage('Too many consecutive renders detected. This could be caused by a dependency cycle. ' + renderCountRef.current);
      setView('Error');
    }
  });
  
  // Callback for the hook to update local peer count state
  const handlePeerCountChange = useCallback((count) => {
    setConnectedPeers(count);
  }, []);

  // Use the custom WebRTC broadcast hook
  const {
    videoElementRef,
    setVideoElement,
    isLive,
    isLoading,
    isConnected,
    isConnecting, // Destructure isConnecting here
    isMicMuted,
    toggleMicMute,
    startBroadcast,
    stopBroadcast,
    rotateCamera,
    deviceList // Destructure deviceList here
  } = useBroadcastWebRTC({
    onPeerCountChange: handlePeerCountChange // Use local state updater
  });

  // --- Functions moved from broadcastChatStore --- 
  const setHasClicked = (clicked) => {
    hasClickedRef.current = clicked;
  };

  const copyURLToClipboard = useCallback(() => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?channel=${encodeURIComponent(room)}&view=PlayChat`;
    navigator.clipboard.writeText(url).then(() => {
      setHasClicked(true);
      setShowTooltip(false);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  }, [room]);

  const openURLInNewTab = useCallback(() => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?channel=${encodeURIComponent(room)}&view=PlayChat`;
    window.open(url, '_blank');
    setHasClicked(true);
    setShowTooltip(false);
  }, [room]);

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

  // Effect to start tooltip timer on mount
  useEffect(() => {
    startTooltipTimer();
    return () => clearTooltipTimer();
  }, [startTooltipTimer, clearTooltipTimer]);

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
        ref={setVideoElement}
        autoPlay 
        playsInline 
        muted={true}
        className="w-full h-full object-contain bg-black"
      />
      {/* Do not render local error overlay, global error view will be shown */}
    
      {/* Audio Mute Button - Top Right */}
      <button
        onClick={toggleMicMute}
        className="absolute top-5 right-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200"
        title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
      >
        {isMicMuted ? 
          <MicOff size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity text-red-500" /> : 
          <Mic size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        }
      </button>
      
      {/* Camera rotation button - Top Right, second position */}
      {/* Check if deviceList exists before accessing length */}
      {deviceList && (deviceList.length > 1 || deviceList.length === 1) && (
        <button
          onClick={rotateCamera}
          className="absolute top-20 right-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200"
          title="Switch camera"
        >
          <SwitchCamera size={24} strokeWidth={2} className="opacity-70 hover:opacity-100 transition-opacity" />
        </button>
      )}
      
      {/* Connection Status Indicator - Top Right, third position */}
      <div className="absolute top-36 right-5 flex flex-col items-center">
        <div
          className="p-3 opacity-70 text-white shadow-neutral-50"
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
