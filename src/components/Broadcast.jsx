import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Tv, ArrowDown } from 'lucide-react';
import BroadcastWebRTC from './BroadcastWebRTC';

export default function Broadcast({ config, socket }) {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const tooltipTimerRef = useRef(null);
  const hasClickedRef = useRef(false);
  
  // Keep hover states as fallback
  const [copyButtonHovered, setCopyButtonHovered] = useState(false);
  const [openButtonHovered, setOpenButtonHovered] = useState(false);

  useEffect(() => {
    if (socket) {
      const handleConnect = () => {
        setIsLive(true);
        // Reset hasClicked when connecting
        hasClickedRef.current = false;
        
        // Clear any existing timer
        if (tooltipTimerRef.current) {
          clearTimeout(tooltipTimerRef.current);
        }
        
        // Set new timer for tooltip
        tooltipTimerRef.current = setTimeout(() => {
          if (!hasClickedRef.current) {
            setShowTooltip(true);
          }
        }, 3000);
      };
      
      const handleDisconnect = () => {
        setIsLive(false);
        setShowTooltip(false);
        if (tooltipTimerRef.current) {
          clearTimeout(tooltipTimerRef.current);
          tooltipTimerRef.current = null;
        }
      };

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      if (socket.connected) {
        handleConnect();
      }

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        if (tooltipTimerRef.current) {
          clearTimeout(tooltipTimerRef.current);
        }
      };
    }
  }, [socket]);

  const copyURLToClipboard = () => {
    const url = `${window.location.origin}${window.location.pathname}?channel=${encodeURIComponent(config.channel)}&view=Play`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      // Mark as clicked and hide tooltip
      hasClickedRef.current = true;
      setShowTooltip(false);
    });
  };

  const openURLInNewTab = () => {
    const url = `${window.location.origin}${window.location.pathname}?channel=${encodeURIComponent(config.channel)}&view=Play`;
    window.open(url, '_blank');
    
    // Mark as clicked and hide tooltip
    hasClickedRef.current = true;
    setShowTooltip(false);
  };

  return (
    <div className="w-full h-full bg-black text-white">
      <BroadcastWebRTC config={config} socket={socket} />
      
      {/* URL Actions Floating Panel - Moved to bottom right */}
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
          onClick={copyURLToClipboard}
          className="p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200 group"
          title="Copy stream URL"
        >
          {copied ? 
            <Check size={24} strokeWidth={2} /> : 
            <Copy size={24} strokeWidth={2} />
          }
        </button>
        
        <button
          onClick={openURLInNewTab}
          className="p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200 group"
          title="Watch stream in new tab"
        >
          <Tv size={24} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
