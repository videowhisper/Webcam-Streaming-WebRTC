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
      className="w-full flex items-center p-2"
      style={{ pointerEvents: 'auto' }} 
    >
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Type your message..."
        className="flex-grow text-white placeholder-gray-400 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 border border-transparent focus:border-blue-500"
        style={{
          background: 'rgba(31, 41, 55, 0.7)', // Tailwind's bg-gray-800 with 0.7 opacity
          textShadow: '1px 1px 1px rgba(0, 0, 0, 0.5)'
        }}
        aria-label="Chat message input"
      />
      <button
        type="submit"
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-r-md flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        disabled={!inputValue.trim()}
        aria-label="Send chat message"
      >
        <Send size={18} />
      </button>
    </form>
  );
};

export default ChatInput;
