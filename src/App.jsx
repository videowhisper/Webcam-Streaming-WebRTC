import React, { useEffect, useState } from "react";
import { Loader } from "lucide-react";
import Broadcast from "./components/Broadcast";
import Play from "./components/Play";
import { loadConfig } from "./config/configLoader";
import { createSocket } from "./services/videowhisperServer";

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
  const [config, setConfig] = useState(null);
  const [view, setView] = useState("Loading");
  const [socket, setSocket] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const loaded = await loadConfig();
        if (!loaded) throw new Error("Invalid or missing config");
        setConfig(loaded);
        
        // Check for deny message
        if (loaded.deny && loaded.deny.trim() !== "") {
          setView("Denied");
        } else {
          setView(loaded.view || "Broadcast");
        }
      } catch (err) {
        console.warn("Could not load config:", err);
        setView("Error");
        setConfig({ error: err.message });
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!config?.vwsSocket || !config?.vwsToken) return;
    const sock = createSocket(config);
    if (!sock) return;

    sock.on("connect", () => {
      setIsConnecting(false);
      setIsLive(true);
    });

    sock.on("disconnect", () => {
      setIsLive(false);
      setIsConnecting(false);
    });

    sock.on("connect_error", () => {
      setIsLive(false);
      setIsConnecting(false);
    });

    sock.connect();
    setIsConnecting(true);
    setSocket(sock);
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
  const MessageView = ({ title, message }) => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="bg-gray-800 text-white px-5 py-6 rounded-lg shadow-lg text-center" style={{ width: '90%', maxWidth: '400px' }}>
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
    switch (view) {
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
          message={config?.error || "Unknown error loading configuration."} 
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
          message={view} 
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
