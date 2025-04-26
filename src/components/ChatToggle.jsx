import React from 'react';
import { MessageSquare, MessageSquareOff } from 'lucide-react';

const ChatToggle = ({ onClick, isVisible, style }) => {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-4 z-50 p-2 bg-gray-700 opacity-70 hover:opacity-100 text-white rounded-full focus:outline-none focus:ring-2 focus:ring-white transition-opacity"
      title={isVisible ? "Hide Chat" : "Show Chat"}
      style={style} // Allow custom positioning
    >
      {isVisible ? <MessageSquareOff size={24} /> : <MessageSquare size={24} />}
    </button>
  );
};

export default ChatToggle;
