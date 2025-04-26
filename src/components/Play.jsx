import React from 'react'; 
import PlayWebRTC from './PlayWebRTC';
import useAppStore from '../store/appStore';

export default function Play() {
  const { config, socket } = useAppStore();
  
  return (
    <div className="w-full h-full bg-black text-white">
      <PlayWebRTC channel={config.channel} />
    </div>
  );
}