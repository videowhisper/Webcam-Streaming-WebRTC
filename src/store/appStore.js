//store/appStore
//App Models (Global State Management)

import { create } from 'zustand';
// Remove the circular import from devMode.js

// Create a store with app state
const useAppStore = create((set, get) => ({
  // Development mode state
  isDevMode: false,
  
  // Socket related state
  isSocketConnected: false,
  isSocketConnecting: false,
  socketError: null,
  
  // View management
  currentView: 'Loading',
  
  // Config and user data
  config: null,
  configLoaded: false,
  configError: null,
  
  // Actions to update socket state
  setSocketConnected: (isConnected) => set({ 
    isSocketConnected: isConnected,
    isSocketConnecting: isConnected ? false : get().isSocketConnecting,
    socketError: isConnected ? null : get().socketError
  }),
  
  setSocketConnecting: (isConnecting) => set({ isSocketConnecting: isConnecting }),
  
  // Handle socket errors
  setSocketError: (error) => {
    // Removed dependency on isDevMode to avoid circular dependency
    console.error('Socket error:', error);
    set({ 
      socketError: error,
      isSocketConnected: false,
      isSocketConnecting: false,
      currentView: 'Error' // Automatically switch to Error view on socket error
    })
  },
  
  // Development mode management
  setDevMode: (enabled) => {
    // DON'T call back to devMode.js to avoid circular dependencies
    set({ isDevMode: enabled });
    // Only log in real development mode to avoid log spam
    if (import.meta.env.DEV) {
      console.log(`Development mode ${enabled ? 'enabled' : 'disabled'}`);
    }
  },
  
  // Config management
  setConfig: (config) => set({ 
    config,
    configLoaded: true,
    configError: null,
    // If config sets development mode, update that too
    ...(config?.development !== undefined && { isDevMode: !!config.development })
  }),
  
  // Set config error
  setConfigError: (error) => set({
    configError: error,
    configLoaded: false
  }),
  
  // View management
  setView: (view) => set({ currentView: view }),
  
  // Reset error state
  clearError: () => set({ socketError: null, configError: null }),
  
  // Utility to get the current error message (from socketError, configError or config)
  getErrorMessage: () => {
    const { socketError, configError, config } = get();
    
    if (socketError) {
      if (typeof socketError === 'string') return socketError;
      if (socketError instanceof Error) return socketError.message;
      if (socketError.message) return socketError.message;
      return 'Unknown socket error';
    }
    
    if (configError) {
      if (typeof configError === 'string') return configError;
      if (configError instanceof Error) return configError.message;
      if (configError.message) return configError.message;
      return 'Configuration error';
    }
    
    if (config?.error) return config.error;
    
    return 'Unknown error';
  },
  
  // Utility for convenience - so components don't need to import from config/devMode
  isDevMode: () => get().isDevMode
}));

export default useAppStore;

/* Currently stores information about:
- Socket connection 
*/