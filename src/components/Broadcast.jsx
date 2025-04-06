import React, { useState } from 'react';
import { Copy, Check, Tv } from 'lucide-react';
import BroadcastWebRTC from './BroadcastWebRTC';

export default function Broadcast({ config, socket }) {
  const [copied, setCopied] = useState(false);

  const copyURLToClipboard = () => {
    const url = `${window.location.origin}${window.location.pathname}?channel=${encodeURIComponent(config.channel)}&view=Play`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openURLInNewTab = () => {
    const url = `${window.location.origin}${window.location.pathname}?channel=${encodeURIComponent(config.channel)}&view=Play`;
    window.open(url, '_blank');
  };

  return (
    <div className="w-full h-full bg-black text-white">
      <BroadcastWebRTC config={config} socket={socket} />
      
      {/* URL Actions Floating Panel - Moved to bottom right */}
      <div className="absolute bottom-5 right-5 flex flex-row items-center space-x-2">
        <button
          onClick={copyURLToClipboard}
          className="p-3 rounded-full shadow-lg transition-all flex items-center justify-center bg-black bg-opacity-50 hover:bg-opacity-75 text-white border border-gray-700"
          title="Copy stream URL"
        >
          {copied ? <Check size={24} strokeWidth={2} className="text-green-500" /> : <Copy size={24} strokeWidth={2} />}
        </button>
        
        <button
          onClick={openURLInNewTab}
          className="p-3 rounded-full shadow-lg transition-all flex items-center justify-center bg-black bg-opacity-50 hover:bg-opacity-75 text-white border border-gray-700"
          title="Watch stream in new tab"
        >
          <Tv size={24} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
