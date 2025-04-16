// filepath: /Users/ntm3k/React/Webcam-Streaming-WebRTC/src/config/configUtils.js
/**
 * Generate a random ID with specified length
 * @param {number} length - Length of the ID to generate
 * @returns {string} - Random ID
 */
export function generateId(length = 3) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  while (id.length < length) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Get a URL parameter from the current location
 * @param {string} param - Parameter name
 * @returns {string|null} - Parameter value or null if not found
 */
export function getGETParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}
