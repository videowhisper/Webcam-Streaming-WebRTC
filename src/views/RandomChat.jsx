import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader, PhoneOff, Settings2, Shuffle } from 'lucide-react';
import useAppStore from '../store/appStore';
import useCallWebRTC from '../hooks/callWebRTC';
import { isDevMode } from '../config/devMode';
import { CallScreen } from './CallChat';

function logRandomChat(...args) {
  if (isDevMode()) {
    console.log('[RandomChat]', ...args);
  }
}

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeFilters(config) {
  const includeAnyOption = config?.randomChat?.includeAnyOption !== false;
  const rawFilters = config?.randomChat?.filters || [];

  const normalized = rawFilters.map((filter) => {
    const label = filter.label || filter.key || 'Filter';
    const key = filter.key || slugify(label);
    const rawOptions = Array.isArray(filter.options)
      ? filter.options
      : String(filter.options || '')
        .split('|')
        .map((option) => option.trim())
        .filter(Boolean);
    const options = includeAnyOption ? [''].concat(rawOptions) : rawOptions;

    return {
      ...filter,
      key,
      label,
      options,
    };
  });

  const keysByLabel = Object.fromEntries(normalized.map((filter) => [filter.label, filter.key]));
  const explicitKeys = new Set(normalized.map((filter) => filter.key));
  const expanded = [];

  normalized.forEach((filter) => {
    expanded.push(filter);

    if (!filter.mirror) {
      return;
    }

    const mirrorLabel = String(filter.mirror || '').trim();
    const mirrorKey = keysByLabel[mirrorLabel] || slugify(mirrorLabel);

    if (!mirrorLabel || explicitKeys.has(mirrorKey)) {
      return;
    }

    explicitKeys.add(mirrorKey);
    expanded.push({
      ...filter,
      label: mirrorLabel,
      key: mirrorKey,
      mirror: filter.key,
    });
  });

  const expandedKeysByLabel = Object.fromEntries(expanded.map((filter) => [filter.label, filter.key]));

  return expanded.map((filter) => ({
    ...filter,
    mirror: filter.mirror ? (expandedKeysByLabel[filter.mirror] || filter.mirror) : '',
  }));
}

export default function RandomChat() {
  const {
    config,
    socket,
    isSocketConnected,
    isSocketConnecting,
  } = useAppStore();
  const filters = useMemo(() => normalizeFilters(config), [config]);
  const defaultValues = useMemo(
    () => Object.fromEntries(filters.map((filter) => [filter.key, ''])),
    [filters],
  );
  const [filterValues, setFilterValues] = useState(defaultValues);
  const [filtersOpen, setFiltersOpen] = useState(filters.length > 0);
  const [isQueued, setIsQueued] = useState(false);
  const [waitingCount, setWaitingCount] = useState(0);
  const [activeRoom, setActiveRoom] = useState(null);
  const [matchedPeer, setMatchedPeer] = useState(null);
  const hasInteractedWithFilters = useRef(false);
  const hadPeerInRoomRef = useRef(false);
  const suppressAutoRematchRef = useRef(false);
  const queueIntentRef = useRef(false);
  const activeRoomRef = useRef(null);
  const socketRef = useRef(null);
  const queueNameRef = useRef('default');
  const leaveRoomRef = useRef(() => {});
  const queueName = config?.randomChat?.queue || 'default';

  const call = useCallWebRTC({ room: activeRoom, view: 'RandomChat' });

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    queueNameRef.current = queueName;
  }, [queueName]);

  useEffect(() => {
    leaveRoomRef.current = call.leaveRoom;
  }, [call.leaveRoom]);

  useEffect(() => {
    setFilterValues(defaultValues);
  }, [defaultValues]);

  useEffect(() => {
    if (!filters.length || !filtersOpen) {
      return undefined;
    }

    const collapseDelay = config?.randomChat?.collapseAfterMs || 10000;
    const timeoutId = window.setTimeout(() => {
      if (!hasInteractedWithFilters.current) {
        setFiltersOpen(false);
      }
    }, collapseDelay);

    return () => window.clearTimeout(timeoutId);
  }, [config?.randomChat?.collapseAfterMs, filters.length, filtersOpen]);

  const queuePayload = useMemo(() => ({
    queue: queueName,
    filters: filterValues,
    definitions: filters.map((filter) => ({
      key: filter.key,
      label: filter.label,
      mirror: filter.mirror,
    })),
    roomPrefix: config?.randomChat?.roomPrefix || 'Call',
    roomOptions: {
      maxParticipants: 2,
      privateRoom: true,
      view: 'RandomChat',
    },
    view: 'RandomChat',
  }), [config?.randomChat?.roomPrefix, filterValues, filters, queueName]);

  const queueForMatch = useCallback(() => {
    if (activeRoomRef.current) {
      logRandomChat('queueForMatch skipped: active room still leaving', {
        queueName,
        activeRoom: activeRoomRef.current,
      });
      return;
    }

    if (queueIntentRef.current) {
      logRandomChat('queueForMatch skipped: queue already requested', {
        queueName,
        socketId: socket?.id || null,
      });
      return;
    }

    if (!socket?.connected) {
      logRandomChat('queueForMatch skipped: socket not connected', {
        queueName,
        activeRoom: activeRoomRef.current,
      });
      return;
    }

    logRandomChat('queueForMatch emit', {
      queueName,
      filters: queuePayload.filters,
      definitions: queuePayload.definitions,
      socketId: socket.id,
    });
    queueIntentRef.current = true;
    socket.emit('randomQueueLeave', { queue: queueName });
    socket.emit('randomQueueJoin', queuePayload);
    setIsQueued(true);
    setMatchedPeer(null);
  }, [queueName, queuePayload, socket]);

  const leaveCurrentCall = useCallback(() => {
    call.leaveRoom(activeRoom);
    activeRoomRef.current = null;
    setActiveRoom(null);
    setMatchedPeer(null);
  }, [activeRoom, call]);

  const handleEndChat = useCallback(() => {
    suppressAutoRematchRef.current = true;
    queueIntentRef.current = false;
    hadPeerInRoomRef.current = false;
    leaveCurrentCall();
  }, [leaveCurrentCall]);

  const handleNext = useCallback(() => {
    suppressAutoRematchRef.current = false;
    leaveCurrentCall();
    queueIntentRef.current = false;
    queueForMatch();
  }, [leaveCurrentCall, queueForMatch]);

  const handleApplyFilters = useCallback(() => {
    suppressAutoRematchRef.current = false;
    if (activeRoomRef.current) {
      leaveCurrentCall();
    }
    queueIntentRef.current = false;
    queueForMatch();
  }, [leaveCurrentCall, queueForMatch]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleMatchStatus = (data) => {
      logRandomChat('matchStatus', data);
      if (data?.queue && data.queue !== queueName) {
        return;
      }
      setIsQueued(!!data?.queued);
      setWaitingCount(data?.waiting || 0);
    };

    const handleMatchFound = (data) => {
      logRandomChat('matchFound', data);
      if (data?.queue && data.queue !== queueName) {
        return;
      }
      if (activeRoomRef.current && data?.room && data.room !== activeRoomRef.current) {
        logRandomChat('matchFound ignored: already in active room', {
          activeRoom: activeRoomRef.current,
          ignoredRoom: data.room,
        });
        return;
      }
      queueIntentRef.current = false;
      setIsQueued(false);
      setWaitingCount(0);
      setMatchedPeer(data?.peer?.user || null);
      activeRoomRef.current = data?.room || null;
      setFiltersOpen(false);
      setActiveRoom(data?.room || null);
    };

    socket.on('matchStatus', handleMatchStatus);
    socket.on('matchFound', handleMatchFound);

    return () => {
      socket.off('matchStatus', handleMatchStatus);
      socket.off('matchFound', handleMatchFound);
    };
  }, [queueName, socket]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleSocketConnect = () => {
      logRandomChat('socket connected', {
        socketId: socket.id,
        activeRoom,
      });
      if (!activeRoomRef.current && !queueIntentRef.current && !suppressAutoRematchRef.current) {
        queueForMatch();
      }
    };

    const handleSocketDisconnect = (reason) => {
      logRandomChat('socket disconnected', {
        reason,
        socketId: socket.id,
        activeRoom,
      });
      if (!activeRoomRef.current) {
        queueIntentRef.current = false;
        setIsQueued(false);
      }
    };

    socket.on('connect', handleSocketConnect);
    socket.on('disconnect', handleSocketDisconnect);

    if (socket.connected && !activeRoomRef.current && !queueIntentRef.current && !suppressAutoRematchRef.current) {
      handleSocketConnect();
    }

    return () => {
      socket.off('connect', handleSocketConnect);
      socket.off('disconnect', handleSocketDisconnect);
    };
  }, [activeRoom, queueForMatch, socket]);

  useEffect(() => {
    logRandomChat('state update', {
      isQueued,
      waitingCount,
      activeRoom,
      matchedPeer,
      socketConnected: socket?.connected || false,
      socketId: socket?.id || null,
    });
  }, [activeRoom, isQueued, matchedPeer, socket, waitingCount]);

  useEffect(() => {
    if (!activeRoom) {
      hadPeerInRoomRef.current = false;
      if (!suppressAutoRematchRef.current) {
        return;
      }

      suppressAutoRematchRef.current = false;
      return;
    }

    if (call.participantCount > 1 || call.isRemoteLive) {
      hadPeerInRoomRef.current = true;
    }

    if (!call.isJoined || !hadPeerInRoomRef.current || suppressAutoRematchRef.current) {
      return;
    }

    if (call.participantCount <= 1 && !call.isRemoteLive) {
      logRandomChat('peer left active room, requeueing remaining participant', {
        activeRoom,
        participantCount: call.participantCount,
      });
      hadPeerInRoomRef.current = false;
      leaveCurrentCall();
      queueIntentRef.current = false;
      queueForMatch();
    }
  }, [
    activeRoom,
    call.isJoined,
    call.isRemoteLive,
    call.participantCount,
    leaveCurrentCall,
    queueForMatch,
  ]);

  useEffect(() => () => {
    const currentSocket = socketRef.current;
    const currentRoom = activeRoomRef.current;
    const currentQueueName = queueNameRef.current;

    logRandomChat('cleanup', {
      queueName: currentQueueName,
      activeRoom: currentRoom,
      socketId: currentSocket?.id || null,
    });

    currentSocket?.emit('randomQueueLeave', { queue: currentQueueName });
    leaveRoomRef.current(currentRoom);
  }, []);

  const queueStatusLabel = call.roomError
    ? call.roomError
    : isQueued
      ? `Waiting for a compatible participant${waitingCount > 1 ? ` (${waitingCount} queued)` : ''}.`
      : isSocketConnecting
        ? 'Connecting to signaling server...'
        : isSocketConnected
          ? 'Queue stopped.'
          : 'Waiting for signaling connection.';

  const footerText = call.roomError
    ? call.roomError
    : activeRoom
      ? (matchedPeer ? `Matched with ${matchedPeer}` : 'Random chat active')
      : isQueued
        ? 'Looking for a compatible participant'
        : isSocketConnecting
          ? 'Connecting to signaling server'
          : 'Waiting for signaling connection';

  const overlay = (
    <>
      {!activeRoom && (
        <div className="absolute inset-x-0 top-24 mx-auto w-[min(92vw,28rem)] rounded-3xl border border-white/10 bg-black/65 p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Random Chat</h2>
              <p className="mt-1 text-sm text-white/70">
                {queueStatusLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  hasInteractedWithFilters.current = true;
                  setFiltersOpen((currentValue) => !currentValue);
                }}
                className="rounded-full border border-white/10 bg-white/10 p-3 transition hover:bg-white/20"
                title="Toggle filters"
              >
                <Settings2 size={18} />
              </button>
              <button
                onClick={handleNext}
                className="rounded-full border border-white/10 bg-emerald-600 p-3 text-white transition hover:bg-emerald-500"
                title="Find another match"
              >
                <Shuffle size={18} />
              </button>
            </div>
          </div>

          {filtersOpen && filters.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {filters.map((filter) => (
                <label key={filter.key} className="block text-sm text-white/70">
                  <span className="mb-2 block">{filter.label}</span>
                  <select
                    value={filterValues[filter.key] || ''}
                    onChange={(event) => {
                      hasInteractedWithFilters.current = true;
                      setFilterValues((currentValue) => ({
                        ...currentValue,
                        [filter.key]: event.target.value,
                      }));
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  >
                    {filter.options.map((option) => (
                      <option key={`${filter.key}-${option || 'any'}`} value={option} className="text-black">
                        {option || 'Any'}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                onClick={handleApplyFilters}
                className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-medium text-black transition hover:bg-white/90"
              >
                {isQueued ? <Loader size={16} className="animate-spin" /> : <Shuffle size={16} />}
                Apply Filters
              </button>
            </div>
          )}
        </div>
      )}

      {activeRoom && filtersOpen && filters.length > 0 && (
        <div className="absolute inset-x-0 top-24 z-50 mx-auto w-[min(92vw,28rem)] rounded-3xl border border-white/10 bg-black/70 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Match Filters</h2>
              <p className="mt-1 text-sm text-white/70">
                Change filters and apply to leave this chat and find a new match.
              </p>
            </div>
            <button
              onClick={() => setFiltersOpen(false)}
              className="rounded-full border border-white/10 bg-white/10 p-3 transition hover:bg-white/20"
              title="Hide filters"
            >
              <Settings2 size={18} />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {filters.map((filter) => (
              <label key={filter.key} className="block text-sm text-white/70">
                <span className="mb-2 block">{filter.label}</span>
                <select
                  value={filterValues[filter.key] || ''}
                  onChange={(event) => {
                    hasInteractedWithFilters.current = true;
                    setFilterValues((currentValue) => ({
                      ...currentValue,
                      [filter.key]: event.target.value,
                    }));
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                >
                  {filter.options.map((option) => (
                    <option key={`${filter.key}-${option || 'any'}`} value={option} className="text-black">
                      {option || 'Any'}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button
              onClick={handleApplyFilters}
              className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-medium text-black transition hover:bg-white/90"
            >
              <Shuffle size={16} />
              Apply Filters and Find Next
            </button>
          </div>
        </div>
      )}

      {activeRoom && call.isRoomFull && (
        <div className="absolute inset-x-0 top-24 mx-auto w-[min(92vw,24rem)] rounded-3xl border border-amber-400/30 bg-black/65 p-5 text-center backdrop-blur">
          <p className="text-sm text-white/80">This random room filled before you could join.</p>
          <button
            onClick={handleNext}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-3 font-medium text-white transition hover:bg-amber-500"
          >
            <Shuffle size={16} />
            Next Match
          </button>
        </div>
      )}
    </>
  );

  const extraAction = (
    <>
      {activeRoom && (
        <button
          onClick={handleEndChat}
          className="rounded-full border border-white/10 bg-rose-500 p-3 text-white transition hover:bg-rose-400"
          title="End current chat"
        >
          <PhoneOff size={18} />
        </button>
      )}
      {activeRoom && filters.length > 0 && (
        <button
          onClick={() => {
            hasInteractedWithFilters.current = true;
            setFiltersOpen((currentValue) => !currentValue);
          }}
          className="rounded-full border border-white/10 bg-white/10 p-3 text-white transition hover:bg-white/20"
          title={filtersOpen ? 'Hide filters' : 'Show filters'}
        >
          <Settings2 size={18} />
        </button>
      )}
      <button
        onClick={handleNext}
        className="rounded-full border border-white/10 bg-emerald-600 p-3 text-white transition hover:bg-emerald-500"
        title="Next match"
      >
        <Shuffle size={18} />
      </button>
    </>
  );

  return (
    <CallScreen
      title="Random Chat"
      subtitle={matchedPeer ? `Matched with ${matchedPeer}` : 'Queue for a private two-way call using your selected filters.'}
      room={activeRoom}
      shareRoom={activeRoom || ''}
      shareView={activeRoom ? 'CallChat' : 'RandomChat'}
      call={call}
      overlay={overlay}
      extraAction={extraAction}
      showInfoCard={false}
      showWaitingOverlay={false}
      showInviteButton={false}
      showFooterStatus={false}
      footerLabel={footerText}
    />
  );
}
