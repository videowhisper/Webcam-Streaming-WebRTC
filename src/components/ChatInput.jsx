import React, { useState } from 'react';
import { Send } from 'lucide-react';

const ChatInput = ({ onSendMessage }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      // Remove flex from form, apply to wrapper div
      className="w-full p-2"
      style={{ pointerEvents: 'auto' }} 
    >
      {/* Add relative positioning to this wrapper */}
      <div className="relative flex items-center w-full">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your message..."
          // Add padding-right (pr-12) to avoid text overlapping button
          className="flex-grow text-white placeholder-gray-400 pl-3 pr-12 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 border border-transparent focus:border-blue-500"
          style={{
            background: 'rgba(31, 41, 55, 0.7)', // Tailwind's bg-gray-800 with 0.7 opacity
            textShadow: '1px 1px 1px rgba(0, 0, 0, 0.5)'
          }}
          aria-label="Chat message input"
        />
        <button
          type="submit"
          // Position absolutely inside the relative wrapper
          // Adjust right padding/position (right-1), center vertically
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600"
          disabled={!inputValue.trim()}
          aria-label="Send chat message"
        >
          <Send size={18} />
        </button>
      </div>
    </form>
  );
};

export default ChatInput;
