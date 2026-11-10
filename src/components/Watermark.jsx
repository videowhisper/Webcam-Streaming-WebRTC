import React from 'react';
import { isDevMode } from '../config/devMode';
import { Settings } from 'lucide-react'; // Import Settings icon
import useAppStore from '../store/appStore'; // Import Zustand store

// Watermark component to be displayed in all views
const Watermark = () => {

  const { currentView, setView, watermark, config, configLoaded } = useAppStore();
  
  // Function to switch to Debugger view
  const switchToDebugger = () => {
    setView("Debugger"); // Call setView instead of setCurrentView
  };
  
  // Don't render watermark until config is loaded (prevents 404 error with default path)
  if (!configLoaded) return null;
  
  // Check if watermark should be shown
  // Watermark is hidden in demo mode (config.demoMode === true) and in Debugger view
  const showWatermark = watermark.enabled && watermark.image && currentView !== 'Debugger';
  const showLink = watermark.url && !config?.demoMode;
  const watermarkImageStyle = {
    height: '48px',
    maxHeight: '48px',
    width: '48px',
    maxWidth: '48px',
    objectFit: 'contain',
  };
  
  return (
  <>
    {showWatermark && (
      showLink ? (
        <a 
          href={watermark.url} 
          target="_blank" 
          rel="noopener noreferrer"
          title="Consult VideoWhisper"
          className="absolute top-2 left-2 z-50"
        >
          <img 
            src={watermark.image}
            alt="VideoWhisper" 
            className="h-12 w-12 opacity-70 hover:opacity-100 transition-opacity"
            style={watermarkImageStyle}
          />
        </a>
      ) : (
        <div className="absolute top-2 left-2 z-50">
          <img 
            src={watermark.image}
            alt="VideoWhisper" 
            className="h-12 w-12 opacity-70"
            style={watermarkImageStyle}
          />
        </div>
      )
    )}
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
