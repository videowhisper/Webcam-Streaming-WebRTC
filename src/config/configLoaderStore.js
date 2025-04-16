// filepath: /Users/ntm3k/React/Webcam-Streaming-WebRTC/src/config/configLoaderStore.js
import useAppStore from '../store/appStore';
import { generateId, getGETParam } from './configUtils';

/**
 * Load configuration and store it in the Zustand store
 * This function should be called during app initialization
 */
export async function loadConfigIntoStore() {
  const store = useAppStore.getState();
  
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

    // If no config file was loaded successfully, set error and return
    if (!json) {
      const error = "Failed to load any config file";
      console.error(error);
      store.setConfigError(error);
      return null;
    }

    const merged = {
      ...json,
      ...scriptConfig,
      configSource: configSource // Add source information for debugging
    };

    // Set the development mode based on the config
    if (merged.development === true) {
      store.setDevMode(true);
    } else {
      store.setDevMode(false);
    }

    // Check for deny property that blocks using unconfigured config
    if (merged.deny) {
      console.error("Configuration denied:", merged.deny);
      store.setConfig({ ...merged, error: merged.deny });
      store.setView("Denied");
      return merged;
    }

    // Allow GET parameter overrides
    if (merged.enableGET) {
      const viewGET = getGETParam("view");
      const channelGET = getGETParam("channel");
      if (viewGET) merged.view = viewGET;
      if (channelGET) merged.channel = channelGET;
    }

    // Generate channel if needed
    if (!merged.channel || merged.channel === "{generate}") {
      merged.channel = "Room" + generateId(4);
    }

    // Generate username if needed
    if (!merged.username || merged.username === "{generate}") {
      const prefix = (merged.view || "User") + generateId(3) + "_";
      merged.username = prefix + merged.channel;
    }

    if (!merged.channel || !merged.username) {
      const error = "Invalid configuration: missing channel or username";
      console.error(error, merged);
      store.setConfigError(error);
      store.setView("Error");
      return null;
    }

    // Store the config in the global state
    store.setConfig(merged);
    store.setView(merged.view || "Broadcast");
    
    return merged;
  } catch (err) {
    console.error("Error loading config:", err);
    store.setConfigError(err.message || "Unknown configuration error");
    store.setView("Error");
    return null;
  }
}
