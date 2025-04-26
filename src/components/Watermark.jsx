import React from 'react';
import { isDevMode } from '../config/devMode';
import { Settings } from 'lucide-react'; // Import Settings icon
import useAppStore from '../store/appStore'; // Import Zustand store

// Watermark component to be displayed in all views
const Watermark = () => {

  const { currentView, setView } = useAppStore();
  
  // Function to switch to Debugger view
  const switchToDebugger = () => {
    setView("Debugger"); // Call setView instead of setCurrentView
  };
  
  return (
  <>
    <a 
      href="https://consult.videowhisper.com" 
      target="_blank" 
      rel="noopener noreferrer"
      title="Consult VideoWhisper"
      className="absolute top-2 left-2 z-50"
    >
      <img 
        src="watermark.png" // Use absolute path from public folder
        alt="VideoWhisper" 
        className="h-16 opacity-70 hover:opacity-100 transition-opacity"
      />
    </a>
    {/* Floating Debug Button - Only in Dev Mode and not already in Debugger view */}
    {isDevMode() && currentView !== 'Debugger' && (
      <button
        onClick={switchToDebugger}
        className="fixed top-4 left-20 z-50 bg-black opacity-50 hover:opacity-90 text-white border border-gray-700/50 transition-opacity duration-200" // Added text-white
        title={currentView + " - Switch to Debugger View"}
        aria-label="Switch to Debugger View"
      >
        <Settings className="h-6 w-6" />
      </button>
    )}
  </>
);

};

export default Watermark;
