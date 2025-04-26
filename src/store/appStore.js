//store/appStore
//App Models (Global State Management)

import { create } from 'zustand';
import { isDevMode } from '../config/devMode';
// Remove the circular import from devMode.js

// Create a store with app state
const useAppStore = create((set, get) => ({
  // Development mode state
  isDevMode: false,
  
  // Socket related state
  isSocketConnected: false,
  isSocketConnecting: false,
  errorMessage: null,
  
  // View management
  currentView: 'Loading',
  
  // Config and user data
  config: null,
  configLoaded: false,
  configError: null,

  // Socket instance
  socket: null,

    //setSocket is used to set the socket instance
  setSocket: (socket) => {
    set({ socket });
  },

  // Actions to update socket state
  setSocketConnected: (isConnected) => set({ 
    isSocketConnected: isConnected,
    isSocketConnecting: isConnected ? false : get().isSocketConnecting,
    errorMessage: isConnected ? null : get().errorMessage
  }),
  
  setSocketConnecting: (isConnecting) => set({ isSocketConnecting: isConnecting }),
  
  // Handle socket errors
  setSocketError: (error) => {
    // Removed dependency on isDevMode to avoid circular dependency
    console.error('Socket error:', error);
    set({ 
      errorMessage: error,
      isSocketConnected: false,
      isSocketConnecting: false,
      currentView: 'Error' // Automatically switch to Error view on socket error
    })
  },
  
  setErrorMessage: (error) => {
    set({ errorMessage: error})
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
  setConfig: (config) => {
    const currentConfig = get().config;
    const configLoaded = get().configLoaded;
    // Only set config if different
    if (JSON.stringify(currentConfig) === JSON.stringify(config)) {
      if (import.meta.env.DEV) console.log('appStore: setConfig called but config is unchanged, skipping.');
      return;
    }
    if (configLoaded && currentConfig && JSON.stringify(currentConfig) !== JSON.stringify(config)) {
      console.warn('appStore: setConfig called with a different config after configLoaded=true. This should not happen!');
    }
    if (isDevMode) console.log('appStore Setting config:', config);
    set({ 
      config,
      configLoaded: true,
      configError: null,
      // If config sets development mode, update that too
      ...(config?.development !== undefined && { isDevMode: !!config.development })
    });
  },
  
  // Set config error
  setConfigError: (error) => set({
    configError: error,
    configLoaded: false
  }),
  
  // View management
  setView: (view) => 
    {
      if (isDevMode) console.log('appStore Switching view to:', view);
      set({ currentView: view })
    },
  
  // Reset error state
  clearError: () => set({ errorMessage: null, configError: null }),
  
  // Utility to get the current error message (from socketError, configError or config)
  getErrorMessage: () => {
    const { errorMessage, configError, config } = get();
    
    if (errorMessage) {
      if (typeof errorMessage === 'string') return errorMessage;
      if (errorMessage instanceof Error) return errorMessage.message;
      if (errorMessage.message) return errorMessage.message;
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