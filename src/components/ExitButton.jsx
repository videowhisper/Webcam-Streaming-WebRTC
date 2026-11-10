// Configurable Exit button - navigates away from the app (e.g. back to performer dashboard or webcams list)
// Only rendered when a URL is provided by config (config.exitUrl), set by the WordPress integration.
import { DoorOpen } from 'lucide-react';

export default function ExitButton({ url, className = '' }) {
  if (!url) return null;

  return (
    <button
      onClick={() => { window.location.href = url; }}
      className={`bg-gray-700 bg-opacity-50 hover:bg-opacity-75 text-white p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-white transition-colors ${className}`}
      title="Exit"
    >
      <DoorOpen size={20} />
    </button>
  );
}
