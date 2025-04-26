import React, { useEffect } from 'react';
import useAppStore from '../store/appStore'; // Use appStore for config
import ChatInterface from '../components/ChatInterface'; // Import the new ChatInterface
import { isDevMode } from '../config/devMode';

// This view is primarily for testing the ChatInterface component.
// It receives the socket as a prop from App.jsx.
const Chat = ({ socket }) => {
  // Get config and potentially other needed state from appStore
  const config = useAppStore(state => state.config);
  const room = config?.channel; // Get room name from config

  // Effect to join the room when socket is connected and room is defined
  useEffect(() => {
    if (!socket || !room) return;

    // Handler to join room when socket connects
    const handleConnect = () => {
      if (isDevMode()) console.debug(`[ChatView] roomJoin ${room}`);
      socket.emit('roomJoin', { room: room });
    };

    // If already connected, join immediately
    if (socket.connected) {
      handleConnect();
    }
    // Listen for connect event
    socket.on('connect', handleConnect);

    // Cleanup: leave room and remove listener
    return () => {
      socket.off('connect', handleConnect);
      if (socket.connected) {
        if (isDevMode()) console.debug(`[ChatView] roomLeave ${room}`);
        socket.emit('roomLeave', { room: room });
      }
    };
  }, [socket, room]); // Dependencies: socket and room

  // Render loading state or message if socket/config not ready (App.jsx handles primary loading)

  // Add logging to check conditions
  if (isDevMode()) {
    console.debug(`[ChatView] Rendering check: socket=${!!socket}, room=${room}, connected=${socket?.connected}`);
  }

  // Render the ChatInterface
  return (
    <div className="relative w-full h-full bg-gray-900">
      {/* You can add other UI elements for the test view here if needed */}

      {/* Render the chat interface, passing the socket prop */}
      {/* config is retrieved from store within ChatInterface itself */}
      {socket && room && socket.connected && <ChatInterface socket={socket} room={room} />}
    </div>
  );
};

export default Chat;
