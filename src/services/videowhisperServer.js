// src/services/videowhisperServer.js
// This file manages the shared connection to the VideoWhisper Server (vws) : https://github.com/videowhisper/videowhisper-webrtc 

import { io } from "socket.io-client";
import { isDevMode } from '../config/devMode';

let socket = null;

export const createSocket = (config) => {
  if (!socket && config?.vwsSocket && config?.vwsToken) {
    socket = new io(config.vwsSocket, {
      auth: { token: config.vwsToken },
      transports: ["websocket"],
      secure: true,
      autoConnect: false,
      reconnection: false,
    });
  }
  return socket;
};

export const getSocket = () => socket;
export const destroySocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    if (isDevMode()) {
      console.log("VideoWhisperServer: Socket disconnected and destroyed.");
    }
  }
};