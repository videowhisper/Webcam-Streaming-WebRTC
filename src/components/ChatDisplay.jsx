import React, { useRef, useEffect, useState, useCallback } from 'react';

// Text shadow style
const textShadowStyle = { textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)' };
// Threshold for considering scroll position "at bottom" (in pixels)
const SCROLL_BOTTOM_THRESHOLD = 10;

// Removed style prop from component definition
const ChatDisplay = ({ messages = [] }) => {
  const scrollContainerRef = useRef(null);
  const messagesEndRef = useRef(null); // Ref for the bottom marker
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const isInitialMount = useRef(true); // Track initial mount

  // --- Autoscroll Logic ---
  const scrollToBottom = useCallback((behavior = "smooth") => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: behavior
      });
    }
    // Reset scrolled up state when explicitly scrolling to bottom
    setIsUserScrolledUp(false);
  }, []);

  // Effect to scroll when new messages arrive, respecting user scroll position
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    // Always scroll instantly on initial mount if there are messages
    if (isInitialMount.current && messages.length > 0) {
      scrollToBottom('auto');
      isInitialMount.current = false;
    }
    // Otherwise, scroll smoothly only if user isn't scrolled up
    else if (!isUserScrolledUp) {
      scrollToBottom('smooth');
    }
  }, [messages, isUserScrolledUp, scrollToBottom]);

  // --- Scroll Event Handler ---
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Check if user is scrolled near the bottom
      const isAtBottom = scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD;

      // Update state only if it changes to prevent unnecessary re-renders
      if (!isAtBottom && !isUserScrolledUp) {
        setIsUserScrolledUp(true);
      } else if (isAtBottom && isUserScrolledUp) {
        setIsUserScrolledUp(false);
      }
    }
  }, [isUserScrolledUp]); // Dependency on isUserScrolledUp

  // Attach scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true }); // Use passive listener
      // Initial check
      handleScroll();
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]); // Re-attach if handleScroll changes

  return (
    <div
      ref={scrollContainerRef}
      // Updated className: flex-1, relative for mask, removed absolute positioning
      className="flex-1 w-full bg-transparent overflow-y-auto p-4 flex flex-col justify-end relative"
      style={{
        // Fade effect using mask
        maskImage: 'linear-gradient(to top, black 40%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to top, black 40%, transparent 100%)',
        pointerEvents: 'auto', // Enable scroll/interaction
      }}
      // Note: onScroll is handled by the event listener now
    >
      {/* Inner div for messages */}
      <div className="flex flex-col space-y-1">
        {messages.map((msg, index) => (
          // Use a more robust key if messages have unique IDs
          // Added break-words for long messages
          <div key={msg.id || `${msg.timestamp}-${index}` || index} className="text-white text-sm break-words" style={textShadowStyle}>
            {/* Conditionally render user span */}
            {msg.user && <span className="font-semibold mr-1">{msg.user}:</span>}
            {msg.text}
          </div>
        ))}
        {/* Dummy element to help scrolling to bottom */}
        <div ref={messagesEndRef} style={{ height: '1px' }} />
      </div>
    </div>
  );
};

export default ChatDisplay;
