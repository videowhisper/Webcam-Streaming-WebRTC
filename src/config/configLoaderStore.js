import useAppStore from '../store/appStore';
import { generateId, getGETParam } from './configUtils';

// Singleton promise to ensure config loads only once
let configLoadPromise = null;

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
        } catch (e) {
          console.log(`Config file ${configFile} not found, trying next option...`);
        }
      }

      // If no config file was loaded successfully, set error and throw
      if (!json) {
        const error = "Failed to load any config file";
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
        if (viewGET) merged.view = viewGET;
        if (channelGET) merged.channel = channelGET;
      }

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
      if (store.currentView !== (merged.view || "Broadcast")) {
        store.setView(merged.view || "Broadcast");
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
