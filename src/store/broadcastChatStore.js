// Broadcast chat store using Zustand
import { create } from 'zustand';
import { isDevMode } from '../config/devMode';

const useBroadcastChatStore = create((set, get) => ({
  // Chat state
  messages: [],
  connectedPeers: 0,
  urlCopied: false,
  showTooltip: false,
  tooltipTimerRef: null,
  hasClickedRef: { current: false },
  
  // Actions
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, {
        ...message,
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
      }]
    }));
    
    if (isDevMode()) console.debug('BroadcastChatStore: Message added:', message);
  },
  
  clearMessages: () => {
    set({ messages: [] });
  },
  
  setConnectedPeers: (count) => {
    set({ connectedPeers: count });
  },
  
  setCopied: (copied) => {
    set({ urlCopied: copied });
  },
  
  setShowTooltip: (show) => {
    set({ showTooltip: show });
  },
  
  setHasClicked: (clicked) => {
    get().hasClickedRef.current = clicked;
  },
  
  // URL sharing functions
  copyURLToClipboard: (channelName) => {
    const url = `${window.location.origin}${window.location.pathname}?channel=${encodeURIComponent(channelName)}&view=PlayChat`;
    navigator.clipboard.writeText(url).then(() => {
      // Mark as clicked and hide tooltip
      get().setHasClicked(true);
      get().setShowTooltip(false);
      get().setCopied(true);
      
      // Reset copied state after 2 seconds
      setTimeout(() => get().setCopied(false), 2000);
    });
  },
  
  openURLInNewTab: (channelName) => {
    const url = `${window.location.origin}${window.location.pathname}?channel=${encodeURIComponent(channelName)}&view=PlayChat`;
    window.open(url, '_blank');
    
    // Mark as clicked and hide tooltip
    get().setHasClicked(true);
    get().setShowTooltip(false);
  },
  
  // Tooltip management
  startTooltipTimer: () => {
    // Clear any existing timer
    const existingTimer = get().tooltipTimerRef;
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Create new timer
    const timerId = setTimeout(() => {
      if (!get().hasClickedRef.current) {
        get().setShowTooltip(true);
      }
    }, 3000);
    
    set({ tooltipTimerRef: timerId });
  },
  
  clearTooltipTimer: () => {
    const existingTimer = get().tooltipTimerRef;
    if (existingTimer) {
      clearTimeout(existingTimer);
      set({ tooltipTimerRef: null });
    }
  },
  
  resetClickState: () => {
    get().setHasClicked(false);
  }
}));

export default useBroadcastChatStore;
