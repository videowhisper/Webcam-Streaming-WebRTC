import useAppStore from '../store/appStore';

// Keep local variables for backwards compatibility and to avoid circular dependencies
let devMode = import.meta.env.DEV || false;
let configDevMode = false;

// These functions will be used during the transition period 
// and by the store itself (to prevent circular dependencies)
export const setDevMode = (value) => {
  devMode = !!value;
  
  // If the store is initialized, update it too
  try {
    const store = useAppStore.getState();
    if (store && store.setDevMode) {
      store.setDevMode(devMode || configDevMode);
    }
  } catch (e) {
    // Silent fail if store isn't initialized yet
  }
};

export const setConfigDevMode = (value) => {
  configDevMode = !!value;
  
  // If the store is initialized, update it too
  try {
    const store = useAppStore.getState();
    if (store && store.setDevMode) {
      store.setDevMode(devMode || configDevMode);
    }
  } catch (e) {
    // Silent fail if store isn't initialized yet
  }
};

// This maintains backward compatibility while using the store when possible
export const isDevMode = () => {
  // Try to use the store value first
  try {
    const store = useAppStore.getState();
    if (store) {
      return store.isDevMode;
    }
  } catch (e) {
    // Fall back to local variables if store isn't ready
  }
  
  // Fall back to local variables
  return devMode || configDevMode;
};