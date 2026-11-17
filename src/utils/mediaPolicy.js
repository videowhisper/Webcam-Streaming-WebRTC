import { normalizeStream } from './streamProfile';
export function mediaPolicy(mode = 'video') {
  const selected = ['video', 'audio', 'text'].includes(mode) ? mode : 'video';
  return { mode: selected, audio: selected !== 'text', video: selected === 'video', text: selected === 'text' };
}

export function captureConstraints(policy, settings = {}, camera, microphone) {
  if (policy.text) return null;
  settings = normalizeStream(settings);
  return {
    video: policy.video ? { deviceId: camera ? { exact: camera } : undefined, width: { ideal: settings.width || 640 }, height: { ideal: settings.height || 360 }, frameRate: { ideal: settings.framerate || 15, max: settings.framerate || 15 } } : false,
    audio: { deviceId: microphone ? { exact: microphone } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  };
}
