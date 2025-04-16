/*
Technology stack for this app includes Taiwind CSS, Vite, Lucide Icons, React, Socket.IO, WebRTC, VideoWhisper Server, Vite Plugin PWA.
https://github.com/tailwindlabs/tailwindcss 
https://github.com/vitejs/vite 
https://github.com/lucide-icons/lucide
https://github.com/videowhisper/videowhisper-webrtc 
https://tailwindcss.com/docs/installation/using-vite
*/

import React, { useEffect } from "react";
import { Loader, AlertCircle } from "lucide-react";
import Broadcast from "./components/Broadcast";
import Play from "./components/Play";
import { isDevMode } from "./config/devMode";
import useAppStore from "./store/appStore";


// Watermark component to be displayed in all views
const Watermark = () => (
  <a 
    href="https://consult.videowhisper.com" 
    target="_blank" 
    rel="noopener noreferrer"
    title="Consult VideoWhisper"
    className="absolute top-2 left-2 z-50"
  >
    <img 
      src="./watermark.png" 
      alt="VideoWhisper" 
      className="h-16 opacity-70 hover:opacity-100 transition-opacity"
    />
  </a>
);

export default function App() {
  // Get states and actions from the Zustand store
  const { 
    config, 
    currentView, 
    configLoaded,
    getErrorMessage 
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
      if (isDevMode()) console.debug("App init - loading configuration");
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
          store.setSocketError("Failed to initialize VideoWhisper socket connection");
        }
      } catch (err) {
        console.error("App Failed to initialize socket:", err);
        
        // Ensure we show the error view on initialization exceptions
        const store = useAppStore.getState();
        store.setSocketError(`Socket initialization error: ${err.message || 'Unknown error'}`);
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
      case "Play":
        return <Play config={config} socket={socket} />;
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
    </>
  );
}
