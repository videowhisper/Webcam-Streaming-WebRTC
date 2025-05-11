import React from 'react';
import { getVersionString } from '../config/buildInfo';
import { isDevMode } from '../config/devMode';

/**
 * BuildInfo component displays the application's version in the corner of the screen.
 * Only visible in development mode or when showAlways prop is true.
 */
const BuildInfo = ({ showAlways = false }) => {
  // Only show if in dev mode or explicitly requested
  if (!isDevMode() && !showAlways) {
    return null;
  }
  
  return (
    <div className="fixed bottom-1 right-1 text-xs text-gray-500 opacity-50 hover:opacity-100 transition-opacity z-10">
      {getVersionString()}
    </div>
  );
};

export default BuildInfo;
