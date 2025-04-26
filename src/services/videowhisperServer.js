// src/services/videowhisperServer.js
// This file manages the shared connection to the VideoWhisper Server (vws) : https://github.com/videowhisper/videowhisper-webrtc 

import { io } from "socket.io-client";
import { isDevMode } from '../config/devMode';
import useAppStore from '../store/appStore';

// Single socket instance shared across the application
let socket = null;
let isInitialized = false;

// Event handler arrays
let errorHandlers = [];
let connectionHandlers = [];
let disconnectionHandlers = [];

/**
 * Cleanup socket event handlers to prevent duplicates
 */
function cleanupSocketEventHandlers(sock) {
  if (!sock) return;
  
  // Remove all listeners for specific events
  sock.off("connect");
  sock.off("disconnect");
  sock.off("error");
  sock.off("connect_error");
}

/**
 * Initialize the VideoWhisper server connection and setup event handlers
 * This should be called once when the app initializes
 */
export const initializeVideoWhisperConnection = (config) => {
  // Return existing socket if it's already connected to avoid reconnections
  if (socket && socket.connected) {
    if (isDevMode()) console.debug("VideoWhisperServer: Using existing connected socket");
    return socket;
  }
  
  // If we have a disconnected socket, clean it up completely and create a new one
  if (socket) {
    if (isDevMode()) console.debug("VideoWhisperServer: Cleaning up existing socket and creating new one");
    
    // Clean up event handlers
    cleanupSocketEventHandlers(socket);
    
    // Disconnect if not already disconnected
    if (socket.connected) {
      socket.disconnect();
    }
    
    // Reset socket variable
    socket = null;
    isInitialized = false;
  }
  
  // Create a new socket
  const createdSocket = createSocket(config);
  
  if (!createdSocket) {
    if (isDevMode()) console.error("VideoWhisperServer: Failed to create socket");
    // Update the store with the error
    try {
      const store = useAppStore.getState();
      store.setErrorMessage("Could not create socket connection to VideoWhisper Server");
    } catch (e) {
      console.error("VideoWhisperServer: Failed to update store with error", e);
    }
    return null;
  }
  
  //save socket to store
  try {
    const store = useAppStore.getState();
    store.setSocket(socket) // Save the socket to the store for global access
    // store.setSocketConnecting(true); // Set connecting state
  }
  catch (e) {
    console.error("VideoWhisperServer: Failed to save socket to store", e);
  }

  
  // Connect the server (event handlers are already set up in createSocket)
  createdSocket.connect();
  
  // Get the store to update connection state
  try {
    const store = useAppStore.getState();
    store.setSocketConnecting(true);
  } catch (e) {
    console.error("VideoWhisperServer: Failed to update connection state in store", e);
  }
  
  isInitialized = true;
  return createdSocket;
};

/**
 * Create a socket connection to the VideoWhisper server
 * This is a lower-level function used by initializeVideoWhisperConnection
 */
export const createSocket = (config) => {
  // If socket already exists, return it
  if (socket) return socket;

  const videowhisperServer = config?.videowhisperServer || false;

  // Check if we have a socket URL
  if (!videowhisperServer || !videowhisperServer.socket) {  
    const error = "Missing socket address configuration";
    console.error("VideoWhisperServer", error);
    return null;
  }

     // Prepare authentication object
     const authObj = {};
    
     // Determine authentication method based on configuration
     if (videowhisperServer.authentication === 'pin' && videowhisperServer.account && videowhisperServer.pin) {
       // Account/user/pin authentication
       authObj.account = videowhisperServer.account;
       authObj.pin = videowhisperServer.pin;
       authObj.user = videowhisperServer.user || config.username; // Use provided user or fallback to username
       
       if (isDevMode()) {
         console.log("VideoWhisperServer: Using account/pin authentication", authObj);
       }

     } else if (videowhisperServer.token) {
       // Token authentication
       authObj.token = videowhisperServer.token;
       
       if (isDevMode()) {
         console.log("VideoWhisperServer: Using token authentication");
       }

     } else {
       const error = "Missing authentication details (token or account/pin)";
       console.error("VideoWhisper Server:", error);
       return null;
     }
    
    // Create socket with appropriate authentication
    socket = new io(videowhisperServer.socket, {
      auth: authObj,
      transports: ["websocket"],
      secure: true,
      autoConnect: false,
      reconnection: false,
    });

    // Set up internal event handlers
    setupSocketEventHandlers(socket);

  return socket;
};

/**
 * Setup socket event handlers with Zustand store integration
 */
function setupSocketEventHandlers(sock) {
  const store = useAppStore.getState();
  
  // Handle socket connection
  sock.on("connect", () => {
    if (isDevMode()) console.debug("VideoWhisperServer: Socket connected");
    store.setSocketConnected(true);
    store.setSocketConnecting(false);
    
    // Call any registered connection handlers
    connectionHandlers.forEach(handler => handler());
  });

  // Handle socket disconnection
  sock.on("disconnect", (reason) => {
    if (isDevMode()) console.debug("VideoWhisperServer: Socket disconnected:", reason);
    store.setSocketConnected(false);
    
    // update error view and message
    store.setErrorMessage(`VideoWhisper Server connection lost: ${reason}`);
    store.setView('Error'); // Explicitly set Error view
    
    // Call any registered disconnection handlers
    disconnectionHandlers.forEach(handler => handler(reason));
  });

  // Handle connection errors
  sock.on("connect_error", (err) => {
    const errorMessage = `Connection error: ${err.message || 'Could not connect to server'}`;
    if (isDevMode()) console.error("VideoWhisperServer: Socket connection error:", err);
    store.setErrorMessage(errorMessage);
    
    // Call any registered error handlers
    errorHandlers.forEach(handler => handler(err));
  });

  // Handle general errors
  sock.on("error", (err) => {
    const errorMessage = `Socket error: ${err.message || 'Unknown error'}`;
    if (isDevMode()) console.error("VideoWhisperServer: Socket error:", err);
    store.setErrorMessage(errorMessage);
    
    // Call any registered error handlers
    errorHandlers.forEach(handler => handler(err));
  });
}