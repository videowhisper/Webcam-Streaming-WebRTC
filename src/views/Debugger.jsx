import React from 'react';
import useAppStore from '../store/appStore';
import { isDevMode } from '../config/devMode';
import { getFormattedBuildInfo, getVersionString } from "../config/buildInfo"; // Import build info

const Debugger = () => {
  const { 
    config, 
    currentView, 
    errorMessage, 
    configError,
    peerConfig,
    setView // Correctly destructure setView instead of setCurrentView
  } = useAppStore();
  
  const socket = useAppStore.getState().socket; // Access socket directly if needed, careful with reactivity

  if (!isDevMode()) {
    // Optionally redirect or show an error if accessed in production
    // For now, just render nothing or a message
    return <div className="p-4 text-red-500">Debugger view is only available in development mode.</div>;
  }

  // Basic socket status check (more robust checks might be needed)
  const socketStatus = socket ? (socket.connected ? 'Connected' : 'Disconnected') : 'Not Initialized';

  const handleViewChange = (event) => {
    if (isDevMode()) {
      console.log('Debugger changing view to:', event.target.value);
    }
    setView(event.target.value); // Call setView instead of setCurrentView
  };

  return (
    <div className="w-full h-full text-white">
      <h1 className="text-2xl font-bold text-center mb-6">Debugger</h1>
      
      {/* View Selector Dropdown */}
      <div className="mb-6 p-4 bg-gray-900 rounded-lg shadow-lg">
        <h2 className="text-lg font-medium mb-3 text-gray-300 border-b border-gray-700 pb-2"> View</h2>
        <select 
          id="view-selector"
          value={currentView} 
          onChange={handleViewChange}
          className="w-full p-2 bg-gray-800 text-white rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <option value="Debugger">Debugger</option>
          <option value="BroadcastChat">Broadcast Chat</option>
          <option value="PlayChat">Play Chat</option>
          <option value="Broadcast">Broadcast</option>
          <option value="Play">Play</option>
          <option value="Chat">Chat</option>
          <option value="Loading">Loading</option>
          <option value="Error">Error</option>
          <option value="Denied">Denied</option>
          <option value="Unknown">Unknown</option>
          {/* Add other views here if needed */}
        </select>
      </div>

      <div className="mb-6 p-4 bg-gray-900 rounded-lg shadow-lg">
        <h2 className="text-lg font-medium mb-3 text-gray-300 border-b border-gray-700 pb-2">App State</h2>
        <div className="grid grid-cols-2 gap-2">
          <span className="text-gray-400">Current View:</span> <span>{currentView}</span>
          <span className="text-gray-400">Socket Status:</span> <span>{socketStatus}</span>
          {errorMessage && (
            <>
              <span className="text-gray-400">Error:</span> <span className="text-red-400">{errorMessage}</span>
            </>
          )}
          {configError && (
            <>
              <span className="text-gray-400">Config Error:</span> <span className="text-red-400">{configError}</span>
            </>
          )}
        </div>
      </div>

      <div className="p-4 bg-gray-900 rounded-lg shadow-lg">
        <h2 className="text-lg font-medium mb-3 text-gray-300 border-b border-gray-700 pb-2">Configuration</h2>
        <pre className="whitespace-pre-wrap break-all bg-gray-800 p-3 rounded text-sm overflow-auto max-h-60">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>

      <div className="p-4 bg-gray-900 rounded-lg shadow-lg mt-6">
        <h2 className="text-lg font-medium mb-3 text-gray-300 border-b border-gray-700 pb-2">Build Information</h2>
        <div className="grid grid-cols-2 gap-2">
          <span className="text-gray-400">Version:</span> <span>{getVersionString()}</span>
          <span className="text-gray-400">Build:</span> <span>{getFormattedBuildInfo()}</span>
        </div>
      </div>
    </div>
  );
};

export default Debugger;