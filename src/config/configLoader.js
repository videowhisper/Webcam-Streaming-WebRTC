function generateId(length = 3) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  while (id.length < length) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function getGETParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Import the setConfigDevMode function
import { setConfigDevMode } from './devMode';

export async function loadConfig() {
  try {
    const scriptConfig = window?.videowhisperConfig || {};
    
    // Try to load private config first, then fall back to unconfigured config
    // Use relative paths with ./ instead of absolute paths with /
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

    // If no config file was loaded successfully, return null
    if (!json) {
      console.error("Failed to load any config file");
      return null;
    }

    const merged = {
      ...json,
      ...scriptConfig,
      configSource: configSource // Add source information for debugging
    };

    // Set the development mode based on the config
    if (merged.development === true) {
      setConfigDevMode(true);
    } else {
      setConfigDevMode(false);
    }

    // Check for deny property that blocks using unconfigured config
    if (merged.deny) {
      console.error("Configuration denied:", merged.deny);
      return { ...merged, error: merged.deny };
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
      console.error("Invalid configuration: missing channel or username", merged);
      return null;
    }

    return merged;
  } catch (err) {
    console.error("Error loading config:", err);
    return null;
  }
}
