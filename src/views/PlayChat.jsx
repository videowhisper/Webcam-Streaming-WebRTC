// src/views/PlayChat.jsx
// PlayChat view component (replicates Play view, but using MVVM and custom hook)
import React, { useRef } from 'react';
import useAppStore from '../store/appStore'; // Import useAppStore to get socket
import playWebRTC from '../hooks/playWebRTC'; // Updated import path
import ChatInterface from '../components/ChatInterface'; // Import ChatInterface
import { Wifi, WifiOff, Loader, Volume2, VolumeX, ArrowRight, Play as PlayIcon } from 'lucide-react';
import { isDevMode } from '../config/devMode';

export default function PlayChat() {
  // Development circuit breaker for render loops (optional, like BroadcastChat)
  const renderCountRef = useRef(0);
  const MAX_RENDERS = 20;
  const { setView, setErrorMessage } = useAppStore();

  if (false) if (isDevMode())
  React.useEffect(() => {
    renderCountRef.current += 1;
    if (renderCountRef.current > MAX_RENDERS) {
      setErrorMessage('Too many consecutive renders detected. This could be caused by a dependency cycle: ' + renderCountRef.current);
      setView('Error');
    }
  });

  // Get config, channel, and socket from app store
  const { config, socket } = useAppStore(); // Get socket here
  const channel = config?.channel;
  const room = channel; // Use channel as room name for chat

  // Use the custom WebRTC playback hook
  const {
    videoRef,
    isLive,
    isConnecting,
    error,
    audioMuted,
    showTapToUnmute,
    showTapToPlay,
    stats,
    setError,
    setShowTapToUnmute,
    setShowTapToPlay,
    setAudioMuted,
    toggleAudioMute
  } = playWebRTC(channel);

  // UI copied from PlayWebRTC, but using state from the hook
  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain bg-black"
      />
      {error && (
        <div 
          className="absolute inset-x-0 bottom-5 mx-auto w-fit bg-red-700 opacity-70 text-white px-4 py-2 rounded shadow-lg z-50"
        >
          <p>{error}</p>
          <button onClick={() => setError(null)} className="ml-4 underline opacity-70 hover:opacity-100 transition-opacity">Close</button>
        </div>
      )}
      {/* Stats display overlay */}
      {isLive && import.meta.env.DEV && (
        <div 
          className="absolute bottom-20 right-5 bg-black opacity-60 text-white text-xs p-2 rounded z-10" // Added z-index just in case
        >
          <div>Resolution: {stats.video.resolution}</div>
          <div>FPS: {stats.video.fps}</div>
          <div>Video: {stats.video.bitrate} kbps</div>
          <div>Audio: {stats.audio.bitrate} kbps</div>
        </div>
      )}
      {/* Audio Mute Button - Top Right */}
      <button
        onClick={toggleAudioMute}
        className="absolute top-5 right-5 p-3 rounded-full shadow-lg bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200 group"
        title={audioMuted ? "Unmute Audio" : "Mute Audio"}
      >
        {audioMuted ? 
          <VolumeX size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity" /> : 
          <Volume2 size={24} strokeWidth={2} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        }
      </button>
      {/* Tap to Unmute indicator */}
      {showTapToUnmute && (
        <div className="absolute top-6 right-20 flex items-center">
          <div className="bg-black bg-opacity-70 text-white px-3 py-2 rounded-lg text-sm">
            Tap to unmute
          </div>
          <ArrowRight size={16} className="text-white ml-2" />
        </div>
      )}
      {/* Connection Status Indicator */}
      <div
        className="absolute top-20 right-5 px-4 py-2 opacity-70 text-white group flex items-center gap-2"
        title={
          isLive ? "Connected to Stream"
          : isConnecting ? "Connecting..."
          : "Disconnected"
        }
      >
        {isLive ? 
          <Wifi size={20} strokeWidth={2} className="text-green-500" /> : 
          isConnecting ? 
          <Loader size={20} strokeWidth={2} className="text-yellow-500 animate-spin" /> : 
          <WifiOff size={20} strokeWidth={2} className="text-red-500" />
        }
      </div>
      {/* Centered Tap to Play button */}
      {showTapToPlay && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 cursor-pointer z-30" // Added z-index
          onClick={() => setShowTapToPlay(false)} // Explicitly call setShowTapToPlay
        >
          <div className="bg-black bg-opacity-70 text-white p-6 rounded-full flex flex-col items-center animate-pulse">
            <PlayIcon size={48} strokeWidth={2} />
            <span className="mt-2 font-medium">Tap to Play</span>
          </div>
        </div>
      )}

      {/* Render Chat Interface if socket and room are available */}
      {socket && room && socket.connected && (
        <ChatInterface socket={socket} room={room} /> // Render ChatInterface with default style
      )}
    </div>
  );
}
