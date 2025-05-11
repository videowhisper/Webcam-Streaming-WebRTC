/**
 * This file provides access to build information that is injected during build process by Vite.
 * These globals are defined in vite.config.js
 */

// Get the build information from the globals defined by Vite
export const getBuildInfo = () => {
  return {
    timestamp: typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : null,
    date: typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : null,
    time: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null,
    // Backward compatibility with the previous implementation
    buildTime: typeof __BUILD_TIMESTAMP__ !== 'undefined' 
      ? __BUILD_TIMESTAMP__ 
      : (import.meta.env.VITE_BUILD_TIME || "unknown")
  };
};

// Get formatted build information
export const getFormattedBuildInfo = () => {
  const info = getBuildInfo();
  
  if (!info.date || !info.time) {
    return "Unknown build";
  }
  
  return `Built on ${info.date} at ${info.time}`;
};

// Function to get version string (useful for display in UI)
export const getVersionString = () => {
  const info = getBuildInfo();
  
  if (!info.date) {
    return "Version unknown";
  }
  
  return `v${info.date.replace(/\//g, '.')}`;
};
