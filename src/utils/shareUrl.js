export function getShareQueryKey(config) {
  return config?.room ? 'room' : 'channel';
}

export function buildShareUrl(config, targetRoom, view) {
  const params = new URLSearchParams();
  const queryKey = getShareQueryKey(config);

  if (targetRoom) {
    params.set(queryKey, targetRoom);
  }

  if (view) {
    params.set('view', view);
  }

  const query = params.toString();
  return `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`;
}