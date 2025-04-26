// BroadcastChat view component
import React, { useEffect, useRef } from 'react';
import { Copy, Check, Tv, ArrowDown, Wifi, WifiOff, SwitchCamera, Loader, Mic, MicOff, RefreshCcw } from 'lucide-react';
import useBroadcastWebRTC from '../hooks/broadcastWebRTC'; // Updated import path and name
import useAppStore from '../store/appStore';
import useBroadcastChatStore from '../store/broadcastChatStore';
import { isDevMode } from '../config/devMode';
import ChatInterface from '../components/ChatInterface'; // Import ChatInterface

export default function BroadcastChat() {
  // Circuit breaker to prevent infinite rendering loops
  const renderCountRef = useRef(0);
  const MAX_RENDERS = 20;
  
  // Get setView from the app store to handle errors
  const { setView, setErrorMessage } = useAppStore();
  
  if (false) if (isDevMode()) 
  React.useEffect(() => {
    renderCountRef.current += 1;
    if (renderCountRef.current > MAX_RENDERS) {
      if (isDevMode()) console.debug('BroadcastChat: Too many renders detected, activating circuit breaker', renderCountRef.current);
      setErrorMessage('Too many consecutive renders detected. This could be caused by a dependency cycle. ' + renderCountRef.current);
      setView('Error');
    }
  });
  
  // Get app configuration from the main store
  const { config, socket } = useAppStore();
  const room = config?.channel; // Get room name from config
  
  // Get broadcast chat specific state from the dedicated store
  const {
    connectedPeers,
    urlCopied,
    showTooltip,
    setConnectedPeers,
    setShowTooltip,
    copyURLToClipboard,
    openURLInNewTab,
    startTooltipTimer,
    clearTooltipTimer,
    resetClickState
  } = useBroadcastChatStore();

  // Use the WebRTC hook to handle all WebRTC functionality
  const {
    error,
    deviceList,
    isLive,
    isConnecting,
    audioMuted,
    setVideoElement,
    toggleAudioMute,
    rotateCamera,
  } = useBroadcastWebRTC({
    onPeerCountChange: setConnectedPeers,
  });

  // Show global error view if a publish error or any error occurs
  React.useEffect(() => {
    if (error) {
      setErrorMessage(error);
      setView('Error');
    }
  }, [error, setErrorMessage, setView]);

  // Prevent local error overlay rendering if error exists (handled globally)
  
  // Handle socket connection/disconnection for tooltip management
  useEffect(() => {
    if (socket) {
      const handleConnect = () => {
        resetClickState();
        startTooltipTimer();
      };
      
      const handleDisconnect = () => {
        setShowTooltip(false);
        clearTooltipTimer();
      };

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      if (socket.connected) {
        handleConnect();
      }

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        clearTooltipTimer();
      };
    }
  }, [socket, resetClickState, startTooltipTimer, setShowTooltip, clearTooltipTimer]);

  // Define custom style for ChatInterface in this view
  const chatStyle = {
    left: '5rem', // Keep the left offset for the toggle button
    right: '10rem', // Add a right offset to avoid overlapping bottom-right buttons
    width: 'auto', // Let left and right define the width
    // height: '33.33%' // Keep default height or adjust if needed
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
        onClick={toggleAudioMute}
        className="absolute top-5 right-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200"
        title={audioMuted ? "Unmute Microphone" : "Mute Microphone"}
      >
        {audioMuted ? 
          <MicOff size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity text-red-500" /> : 
          <Mic size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        }
      </button>
      
      {/* Camera rotation button - Top Right, second position */}
      {(deviceList.length > 1 || deviceList.length === 1) && (
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
      <div className="absolute bottom-5 right-5 flex flex-row items-center space-x-2 z-20">
        {/* Tooltip */}
        {isLive && showTooltip && (
          <div 
            className="absolute bottom-16 right-0 bg-black opacity-80 text-white px-4 py-2 rounded-lg shadow-lg flex flex-col items-center mb-2"
          >
            <p className="text-sm mb-1">Use buttons below to share your stream.</p>
            <ArrowDown size={20} className="text-white animate-bounce opacity-70" />
          </div>
        )}
        
        <button
          onClick={() => copyURLToClipboard(config.channel)}
          className="p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200 group"
          title="Copy stream URL"
        >
          {urlCopied ? 
            <Check size={24} strokeWidth={2} /> : 
            <Copy size={24} strokeWidth={2} />
          }
        </button>
        
        <button
          onClick={() => openURLInNewTab(config.channel)}
          className="p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200 group"
          title="Watch stream in new tab"
        >
          <Tv size={24} strokeWidth={2} />
        </button>
      </div>
    
      {/* Render Chat Interface */}
      {/* Conditionally render based on socket connection and room */}
      {socket && room && socket.connected && (
        <ChatInterface socket={socket} room={room} style={chatStyle} />
      )}
    </div>
  );
}
