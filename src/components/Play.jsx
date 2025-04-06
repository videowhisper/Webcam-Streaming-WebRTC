import React, { useEffect } from 'react'; 
import PlayWebRTC from './PlayWebRTC';

export default function Play({ config, socket }) {
  return (
    <div className="w-full h-full bg-black text-white">
      <PlayWebRTC config={config} channel={config.channel} socket={socket} />
    </div>
  );
}