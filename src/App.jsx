/*
Webcam Streaming App: https://github.com/videowhisper/Webcam-Streaming-WebRTC
Technology stack includes: Zustand, React, Tailwind CSS, Vite, Lucide Icons, VideoWhisper Server, Socket.IO .
*/

import React, { useEffect } from "react";
import { Loader, AlertCircle, Settings } from "lucide-react"; // Import Settings icon
import Broadcast from "./components/Broadcast"; // Corrected path
import Play from "./components/Play";       // Corrected path
import Debugger from "./views/Debugger"; // Updated import path
import BroadcastChat from "./views/BroadcastChat"; // Import the new BroadcastChat view
import PlayChat from "./views/PlayChat"; // Import the new PlayChat view
import Chat from "./views/Chat"; // Import the new Chat view
import { isDevMode } from "./config/devMode";
import useAppStore from "./store/appStore";
import Watermark from "./components/Watermark"; // Import the Watermark component
import BuildInfo from "./components/BuildInfo"; // Import the BuildInfo component
import { getFormattedBuildInfo, getVersionString } from "./config/buildInfo"; // Import build info

export default function App() {
  // Get states and actions from the Zustand store
  const { 
    config, 
    currentView, 
    configLoaded,
    getErrorMessage,
    setView // Correctly destructure setView instead of setCurrentView
  } = useAppStore();
  
  // Socket reference
  const [socket, setSocket] = React.useState(null);
  
  // Track initialization to prevent duplicate loads in Strict Mode
  const hasInitialized = React.useRef(false);

  // Load configuration once
  useEffect(() => {
    // Skip if already initialized or config is already loaded
    if (hasInitialized.current || configLoaded) {
      return;
    }
    
    const init = async () => {
      if (isDevMode()) {
        // Show build info using our new utility
        const buildInfo = getFormattedBuildInfo();
        const version = getVersionString();
        console.debug(`Webcam Streaming App init (${version}, ${buildInfo})`);
      }
      try {
        // Use the store-integrated config loader
        await import('./config/configLoaderStore').then(module => {
          module.loadConfigIntoStore();
        });
        
        // Mark as initialized to prevent duplicate loads
        hasInitialized.current = true;
      } catch (err) {
        console.error("Failed to import configuration module:", err);
      }
    };
    
    init();
  }, [configLoaded]);

  // Initialize VideoWhisper socket once configuration is loaded
  useEffect(() => {
    // Skip if no configuration is available yet
    if (!config?.videowhisperServer) {
      // Avoid excessive logging, this is called very frequently
      // if (isDevMode()) console.debug("App VideoWhisper Server configuration NOT available in config (yet)");
      return;
    }
    
    // Use the centralized socket initialization from videowhisperServer.js
    const initSocket = async () => {
      try {
        // Import the videowhisperServer module with all needed functions
        const { initializeVideoWhisperConnection } = await import('./services/videowhisperServer');
        
        // Use the proper initialization function that handles all event setup
        const sock = initializeVideoWhisperConnection(config);
        
        if (sock) {
          // Just save the socket reference for passing to components
          setSocket(sock);
          
          if (isDevMode()) console.debug("App VideoWhisper socket initialized successfully");
        } else {
          console.error("App VideoWhisper socket initialization failed");
          
          // Ensure we show the error view even if socket initialization fails
          const store = useAppStore.getState();
          store.setErrorMessage("Failed to initialize VideoWhisper socket connection");
        }
      } catch (err) {
        console.error("App Failed to initialize socket:", err);
        
        // Ensure we show the error view on initialization exceptions
        const store = useAppStore.getState();
        store.setErrorMessage(`Socket initialization error: ${err.message || 'Unknown error'}`);
      }
    };
    
    initSocket();
    
    // Clean up socket on unmount
    return () => {
      if (socket) {
        socket.off("connect");
        socket.off("connect_error");
      }
    };
  }, [config]);

  // Handle reload page action
  const handleReload = () => {
    window.location.reload();
  };
  
  // Handle consulting support action
  const handleConsultSupport = () => {
    window.open("https://consult.videowhisper.com", "_blank");
  };

  // Shared message component for errors, denied access and unknown view
  const MessageView = ({ title, message, icon }) => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="bg-gray-800 text-white px-5 py-6 rounded-lg shadow-lg text-center" style={{ width: '90%', maxWidth: '400px' }}>
        {icon}
        <h1 className="text-lg md:text-xl font-bold mb-4">{title}</h1>
        <p className="mb-6">{message}</p>
        <div className="flex flex-col md:flex-row justify-center space-y-3 md:space-y-0 md:space-x-4">
          <button 
            onClick={handleReload}
            className="bg-gray-700 bg-opacity-70 hover:bg-opacity-100 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline transition-opacity"
          >
            Reload Page
          </button>
          <button 
            onClick={handleConsultSupport}
            className="bg-gray-700 bg-opacity-70 hover:bg-opacity-100 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline transition-opacity"
          >
            Consult Support
          </button>
        </div>
      </div>
    </div>
  );

  const renderView = () => {
    switch (currentView) {
      case "Broadcast":
        return <Broadcast config={config} socket={socket} />;
      case "BroadcastChat":
        return <BroadcastChat />;
      case "PlayChat":
        return <PlayChat />;
      case "Chat":
        // Pass socket prop to Chat view
        return <Chat socket={socket} />;

      case "Play":
        return <Play config={config} socket={socket} />;
      case "Debugger": // Add the Debugger case
        return <Debugger />;
      case "Denied":
        return <MessageView 
          title="Unauthorized" 
          message={config?.deny} 
        />;
      case "Error":
        return <MessageView 
          title="Error" 
          message={getErrorMessage()} 
          icon={<AlertCircle className="h-10 w-10 text-red-500 mb-2 mx-auto" />}
        />;
      case "Loading":
        return (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Loader className="h-8 w-8 animate-spin mb-4 mx-auto" />
              <p>Loading configuration...</p>
            </div>
          </div>
        );
      default:
        return <MessageView 
          title="Unknown View" 
          message={currentView} 
        />;
    }
  };

  return (
    <>
      {renderView()}
      <Watermark />
      <BuildInfo />
    </>
  );
}

/* Technology stack (context) for reference:
Tailwind CSS  https://github.com/tailwindlabs/tailwindcss 
Vite https://github.com/vitejs/vite 
Lucide Icons https://github.com/lucide-icons/lucide
Zustand https://github.com/pmndrs/zustand
VideoWhisper WebRTC https://github.com/videowhisper/videowhisper-webrtc 
*/