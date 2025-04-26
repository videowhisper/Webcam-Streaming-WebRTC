import React, { useEffect, useCallback, useMemo } from 'react';
import useChatStore from '../store/chatStore';
import useAppStore from '../store/appStore'; // Import appStore to get config
import ChatDisplay from './ChatDisplay';
import ChatInput from './ChatInput';
import ChatToggle from './ChatToggle';
import { isDevMode } from '../config/devMode';

const ChatInterface = ({ socket, room, style }) => { // Add style prop
  const config = useAppStore(state => state.config); // Get config from appStore
  // Select the entire messages object, not a computed value
  const {
    messages: allMessages,
    isVisible,
    currentRoom,
    addMessage,
    setMessages,
    toggleVisibility,
    setCurrentRoom,
    clearMessages
  } = useChatStore();

  // Compute derived value inside the component
  const messages = useMemo(() => allMessages[room] || [], [allMessages, room]);

  // --- Configurable Positioning ---
  const baseStyle = {
    position: 'absolute',
    bottom: config?.chat?.bottom ?? '0', // Default to 0 if not in config
    // Adjust left position to be right of the toggle button (approx 4rem)
    left: config?.chat?.left ?? '5rem', // Default to 4rem
    // Adjust width to fill remaining space
    width: config?.chat?.width ?? 'calc(100% - 5rem)', // Default to calc(100% - 4rem)
    height: config?.chat?.height ?? '33.33%', // Default to 1/3
    pointerEvents: 'none', // Container doesn't block clicks
    zIndex: 40, // Add z-index (below toggle button's z-50)
  };

  // Merge baseStyle with incoming style prop
  const mergedStyle = { ...baseStyle, ...style };

  // Remove inputPositionStyle as it's handled by flex layout now
  // const inputPositionStyle = useMemo(() => ({ ... }), []);

  // Set the current room for the store
  useEffect(() => {
    if (room && room !== currentRoom) {
      setCurrentRoom(room);
      // Optionally clear messages when room changes, or load persisted ones
      // clearMessages(room); // Uncomment if messages should reset on room change
    }
  }, [room, currentRoom, setCurrentRoom, clearMessages]);

  // Handle incoming messages (updated to use addMessage/setMessages correctly)
  useEffect(() => {
    if (!socket || !room) return;

    const handleRoomUpdate = (data) => {
      if (data && data.room === room) {
        if (data.error) {
          // If error property is present, set error state and switch view
          if (isDevMode()) console.debug(`[ChatInterface] Received roomUpdate for ${room} with error:`, data.error);
          const { setView, setErrorMessage } = require('../store/appStore').default.getState();
          setErrorMessage(data.error);
          setView('Error');
          return;
        }
        // Handle full message list update
        if (Array.isArray(data.messages)) {
          if (isDevMode()) console.debug(`[ChatInterface] Received roomUpdate for ${room} with full message list:`, data.messages);
          setMessages(room, data.messages);
        }
        // Handle single new message update
        if (data.messageNew) {
          if (isDevMode()) console.debug(`[ChatInterface] Received roomUpdate for ${room} with new message:`, data.messageNew);
          // Ensure message has necessary structure if needed, e.g., self: false
          addMessage(room, { ...data.messageNew, self: false });
        }
      }
    };

    if (isDevMode()) console.debug(`[ChatInterface] Setting up socket listener for roomUpdate in room: ${room}`);
    socket.on('roomUpdate', handleRoomUpdate);

    // Cleanup listener
    return () => {
      if (isDevMode()) console.debug(`[ChatInterface] Cleaning up socket listener for roomUpdate in room: ${room}`);
      socket.off('roomUpdate', handleRoomUpdate);
    };
  }, [socket, room, addMessage, setMessages]); // Rerun if socket or room changes

  // Send message handler (updated to add own message to store)
  const handleSendMessage = useCallback((text) => {
    if (socket && room && text) {
      const messageData = { text };
      // Include user info if available from config
      if (config?.username) {
          messageData.user = config.username;
      }
      if (isDevMode()) console.debug(`[ChatInterface] Sending message to room ${room}:`, messageData);
      socket.emit('roomMessage', { 'room': room, 'message': messageData} );
      // REMOVED: Local addition of message. Server broadcast will handle it.
      // addMessage(room, { ...messageData, self: true, user: messageData.user || 'Me' }); // Mark as self
    } else {
       if (isDevMode()) console.warn(`[ChatInterface] Cannot send message. Socket connected: ${!!socket}, Room: ${room}, Text: ${text}`);
    }
  // Removed addMessage from dependency array as it's no longer called directly here
  }, [socket, room, config]);

  // Only render if socket is connected and room is set
  if (!socket || !room) {
    if (isDevMode()) console.debug(`[ChatInterface] Not rendering chat. Socket: ${!!socket}, Room: ${room}`);
    return null;
  }

  return (
    <>
      {/* Toggle remains independently positioned */}
      <ChatToggle onClick={toggleVisibility} isVisible={isVisible} />

      {/* Main Chat Container */}
      {isVisible && (
        <div
          // Use flex column, bg-transparent, overflow-hidden
          // Reverted temporary background change
          className="flex flex-col bg-transparent overflow-hidden" // Changed bg-red-500 back to bg-transparent
          style={mergedStyle} // Apply merged styles here
        >
          {/* Chat Display takes up available space */}
          {/* Pass messages directly */}
          <ChatDisplay messages={messages} />

          {/* Input area at the bottom */}
          {/* Removed style prop, positioning handled by parent flex */}
          <ChatInput onSendMessage={handleSendMessage} />
        </div>
      )}
    </>
  );
};

export default ChatInterface;
