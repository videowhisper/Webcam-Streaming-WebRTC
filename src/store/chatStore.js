import { create } from 'zustand';
import { isDevMode } from '../config/devMode';

const useChatStore = create((set, get) => ({
  messages: {}, // { roomName: [message1, message2, ...] }
  isVisible: true,
  currentRoom: null,

  setCurrentRoom: (room) => {
    if (isDevMode()) console.debug(`[ChatStore] Setting current room: ${room}`);
    set({ currentRoom: room });
    // Ensure messages array exists for the new room
    if (!get().messages[room]) {
      set(state => ({
        messages: { ...state.messages, [room]: [] }
      }));
    }
  },

  addMessage: (room, message) => {
    if (isDevMode()) console.debug(`[ChatStore] Adding message to room ${room}:`, message );
    set(state => {
      const roomMessages = state.messages[room] || [];
      // Avoid adding duplicate messages if server sends confirmation
      if (roomMessages.some(m => m.id === message.id && message.id)) {
         if (isDevMode()) console.debug(`[ChatStore] Duplicate message ignored:`, message);
         return {}; // No state change
      }
      
      if (isDevMode()) console.debug(`[ChatStore] Total messages in room ${room}:`, roomMessages.length + 1);

      return {
        messages: {
          ...state.messages,
          [room]: [...roomMessages, message]
        }
      };
    });
  },

  setMessages: (room, messages) => {
    if (isDevMode()) console.debug(`[ChatStore] Setting all messages for room ${room}:`, messages);
    set(state => ({
      messages: {
        ...state.messages,
        [room]: messages
      }
    }));
  },

  toggleVisibility: () => {
    set(state => {
      if (isDevMode()) console.debug(`[ChatStore] Toggling visibility: ${!state.isVisible}`);
      return { isVisible: !state.isVisible };
    });
  },

  clearMessages: (room) => {
     if (isDevMode()) console.debug(`[ChatStore] Clearing messages for room ${room}`);
     set(state => ({
        messages: {
            ...state.messages,
            [room]: []
        }
     }));
  }
}));

export default useChatStore;
