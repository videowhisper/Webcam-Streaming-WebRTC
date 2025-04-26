import React from 'react';


/**
 * Shared message component for errors, denied access and unknown views
 * @param {Object} props - Component props
 * @param {string} props.title - Message title
 * @param {string} props.message - Message content
 * @param {React.ReactNode} [props.icon] - Optional icon to display
 * @param {Function} [props.onReload] - Handler for reload button
 * @param {Function} [props.onSupport] - Handler for support button
 * @param {string} [props.reloadText='Reload Page'] - Text for reload button
 * @param {string} [props.supportText='Consult Support'] - Text for support button
 * @param {string} [props.supportUrl='https://consult.videowhisper.com'] - Support URL
 */
const MessageView = ({ 
  title, 
  message, 
  icon,
  onReload = () => window.location.reload(),
  onSupport = () => window.open("https://consult.videowhisper.com", "_blank"),
  reloadText = "Reload Page",
  supportText = "Consult Support"
}) => (
  <div className="absolute inset-0 flex items-center justify-center">
    <div className="bg-gray-800 text-white px-5 py-6 rounded-lg shadow-lg text-center" style={{ width: '90%', maxWidth: '400px' }}>
      {icon}
      <h1 className="text-lg md:text-xl font-bold mb-4">{title}</h1>
      <p className="mb-6">{message}</p>
      <div className="flex flex-col md:flex-row justify-center space-y-3 md:space-y-0 md:space-x-4">
        <button 
          onClick={onReload}
          className="bg-gray-700 bg-opacity-70 hover:bg-opacity-100 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline transition-opacity"
        >
          {reloadText}
        </button>
        <button 
          onClick={onSupport}
          className="bg-gray-700 bg-opacity-70 hover:bg-opacity-100 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline transition-opacity"
        >
          {supportText}
        </button>
      </div>
    </div>
  </div>
);

export default MessageView;
