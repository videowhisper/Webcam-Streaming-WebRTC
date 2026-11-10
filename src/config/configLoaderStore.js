import useAppStore from '../store/appStore';
import { generateId, getGETParam } from './configUtils';

// Singleton promise to ensure config loads only once
let configLoadPromise = null;

function isConfigKeyLocked(configLock, config, key) {
  if (!configLock) {
    return false;
  }

  if (configLock === true) {
    return Object.prototype.hasOwnProperty.call(config, key);
  }

  if (typeof configLock === 'string') {
    return configLock.split(',').map((entry) => entry.trim()).includes(key);
  }

  if (Array.isArray(configLock)) {
    return configLock.includes(key);
  }

  return false;
}

/**
 * Load configuration and store it in the Zustand store
 * This function should be called during app initialization
 */
export function loadConfigIntoStore() {
  const store = useAppStore.getState();

  // 1. Already loaded? Return immediately.
  if (store.configLoaded && store.config) {
    if (import.meta.env.DEV) console.log("Config already loaded in store, returning existing config.");
    return Promise.resolve(store.config);
  }

  // 2. Load already in progress? Return the existing promise.
  if (configLoadPromise) {
    if (import.meta.env.DEV) console.log("Config load already in progress, returning existing promise.");
    return configLoadPromise;
  }

  // 3. Start the loading process
  configLoadPromise = (async () => {
    if (import.meta.env.DEV) console.log("Starting config load process...");
    try {
      const scriptConfig = window?.videowhisperConfig || {};

      // Try to load private config first, then fall back to unconfigured config
      const configFiles = ["./config.json", "./unconfigured.json"];
      let json = null;
      let configSource = null;

      // Try each config file in order until one loads successfully
      for (const configFile of configFiles) {
        try {
          const configUrl = scriptConfig.configUrl || configFile;
          const res = await fetch(configUrl);
          if (res.ok) {
            json = await res.json();
            configSource = configFile;
            break;
          }
        } catch {
          console.log(`Config file ${configFile} not found, trying next option...`);
        }
      }

      // If no config file was loaded successfully, set error and throw
      if (!json) {
        const error = "Failed to load an application configuration.";
        console.error(error);
        store.setConfigError(error);
        throw new Error(error);
      }

      const merged = {
        ...json,
        ...scriptConfig,
        configSource: configSource // Add source information for debugging
      };

      // Set the development mode based on the config
      store.setDevMode(!!merged.development);

      // Check for deny property that blocks using unconfigured config
      if (merged.deny) {
        console.error("Configuration denied:", merged.deny);
        store.setConfig({ ...merged, error: merged.deny });
        store.setView("Denied");
        return merged; // Still resolve with the denied config
      }

      // Allow GET parameter overrides
      if (merged.enableGET) {
        const viewGET = getGETParam("view");
        const channelGET = getGETParam("channel");
        const roomGET = getGETParam("room");
        if (viewGET && !isConfigKeyLocked(merged.configLock, merged, 'view')) merged.view = viewGET;
        if (channelGET && !isConfigKeyLocked(merged.configLock, merged, 'channel')) merged.channel = channelGET;
        if (roomGET && !isConfigKeyLocked(merged.configLock, merged, 'room')) merged.room = roomGET;
      }

      if (merged.room && !merged.channel) {
        merged.channel = merged.room;
      }

      // Snapshot defaults for BroadcastChat thumbnail uploads.
      merged.snapshots = {
        enabled: false,
        url: '',
        timeout: 2000,
        interval: 30000,
        maxWidth: 0,
        maxHeight: 0,
        quality: 0.9,
        ...(merged.snapshots || {}),
      };

      // Use existing generated channel/username if present in store
      // Note: This check is less critical now due to the singleton promise,
      // but kept for safety.
      const prevConfig = store.config || {};

      // Generate channel if needed
      if (!merged.channel || merged.channel === "{generate}") {
        merged.channel = prevConfig.channel || ("Room" + generateId(4));
      }

      // Generate username if needed
      if (!merged.username || merged.username === "{generate}") {
        const prefix = (merged.view || "User") + generateId(3) + "_";
        merged.username = prevConfig.username || (prefix + merged.channel);
      }

      if (!merged.channel || !merged.username) {
        const error = "Invalid configuration: missing channel or username";
        console.error(error, merged);
        store.setConfigError(error);
        store.setView("Error");
        throw new Error(error);
      }

      // Check one last time if another concurrent call finished first
      if (store.configLoaded && store.config) {
         if (import.meta.env.DEV) console.log("Config was loaded by another call during processing, using existing config.");
         return store.config;
      }

      // Set the config in the store
      if (import.meta.env.DEV) console.log('Setting config in store.');
      store.setConfig(merged);
      
      // Only set view if different from current
      if (store.currentView !== (merged.view || "BroadcastChat")) {
        store.setView(merged.view || "BroadcastChat");
      }

      return merged;
    } catch (err) {
      console.error("Error loading config:", err);
      store.setConfigError(err.message || "Unknown configuration error");
      store.setView("Error");
      configLoadPromise = null; // Reset promise on error so it can be retried
      throw err; // Re-throw error so the caller promise rejects
    }
  })();

  return configLoadPromise;
}
