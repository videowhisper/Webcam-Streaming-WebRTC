import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader,
  MessageSquare,
  MessageSquareOff,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  RefreshCcw,
  RotateCcw,
  SwitchCamera,
  UserRound,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import useAppStore from '../store/appStore';
import useCallWebRTC from '../hooks/callWebRTC';
import ChatInterface from '../components/ChatInterface';
import { buildShareUrl } from '../utils/shareUrl';

function shareUrlForRoom(config, room, view = 'CallChat') {
  return buildShareUrl(config, room, view);
}

export function CallScreen({
  title,
  subtitle,
  room,
  shareRoom,
  shareView = 'CallChat',
  call,
  overlay,
  extraAction,
  showChatToggle = true,
  showInfoCard = true,
  showWaitingTitle = true,
  showWaitingOverlay = true,
  showWaitingInvite = true,
  showScreenShare = false,
  showInviteButton = true,
  showFooterStatus = true,
  footerLabel = '',
}) {
  const { socket, config } = useAppStore();
  const [urlCopied, setUrlCopied] = useState(false);
  const [chatVisible, setChatVisible] = useState(true);
  const [selfPreviewVisible, setSelfPreviewVisible] = useState(true);
  const [bottomBarHeight, setBottomBarHeight] = useState(88);
  const bottomBarRef = useRef(null);

  const shareUrl = useMemo(() => shareUrlForRoom(config, shareRoom || room, shareView), [config, room, shareRoom, shareView]);
  const chatBottom = `calc(${bottomBarHeight}px + 1.25rem)`;

  useEffect(() => {
    const bottomBar = bottomBarRef.current;
    if (!bottomBar) {
      return undefined;
    }

    const updateBottomBarHeight = () => {
      setBottomBarHeight(Math.ceil(bottomBar.getBoundingClientRect().height));
    };

    updateBottomBarHeight();
    window.addEventListener('resize', updateBottomBarHeight);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', updateBottomBarHeight);
      };
    }

    const resizeObserver = new ResizeObserver(updateBottomBarHeight);
    resizeObserver.observe(bottomBar);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBottomBarHeight);
    };
  }, []);

  const copyInviteUrl = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setUrlCopied(true);
    window.setTimeout(() => setUrlCopied(false), 2000);
  };

  const connectionIcon = call.isRemoteLive
    ? <Wifi size={18} className="text-green-400" />
    : call.roomError
      ? <WifiOff size={18} className="text-red-400" />
      : (call.isJoined || call.participantCount > 0)
        ? <Wifi size={18} className="text-amber-300" />
        : call.isJoining
          ? <Loader size={18} className="animate-spin text-yellow-400" />
          : <WifiOff size={18} className="text-white/60" />;

  return (
    <div className="relative h-full min-h-[30rem] w-full overflow-hidden bg-neutral-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#1f2937,transparent_45%),radial-gradient(circle_at_bottom,#0f766e,transparent_35%)]" />

      <video
        ref={call.setRemoteVideoElement}
        autoPlay
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {showWaitingOverlay && !call.isRemoteLive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 px-6 text-center">
          <div className="max-w-md rounded-3xl border border-white/10 bg-black/50 p-6 backdrop-blur">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
              <UserRound size={28} />
            </div>
            {showWaitingTitle && (
              <>
                <h1 className="text-2xl font-semibold">{title}</h1>
                <p className="mt-2 text-sm text-white/70">{subtitle}</p>
              </>
            )}
            <p className="mt-4 text-sm text-white/70">
              {call.isRoomFull
                ? call.roomError
                : call.remoteParticipantName
                  ? `Waiting for ${call.remoteParticipantName} video...`
                  : 'Waiting for another participant to join this private room.'}
            </p>
            {showWaitingInvite && (shareRoom || room) && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={copyInviteUrl}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                >
                  {urlCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  {urlCopied ? 'Copied' : 'Copy Invite Link'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="absolute left-4 top-4 right-4 flex items-start justify-between gap-3">
        {showInfoCard ? (
          <div className="max-w-sm rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
              <span>{title}</span>
            </div>
            <p className="mt-1 text-xs text-white/70">{call.roomError || subtitle}</p>
            {room && <p className="mt-2 text-xs uppercase tracking-[0.25em] text-white/40">Room {room}</p>}
          </div>
        ) : <div />}

        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-sm backdrop-blur">
          {connectionIcon}
          <span className="text-white/70">Participants</span>
          <span className="font-semibold">{call.participantCount}</span>
        </div>
      </div>

      {selfPreviewVisible && (
        <div className="absolute right-4 top-20 z-20">
          <div
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-2xl backdrop-blur"
            style={{ width: 'min(16rem, 42vw)' }}
          >
          <video
            ref={call.setLocalVideoElement}
            autoPlay
            playsInline
            muted
            className="aspect-video w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-3 py-2 text-xs text-white/80">
            <span>{call.isScreenSharing ? 'Screen' : 'You'}</span>
            <div className="flex items-center gap-2">
              {showScreenShare && (
                <button
                  type="button"
                  onClick={() => {
                    call.startScreenShare();
                  }}
                  className={`inline-flex rounded-full border border-white/10 p-1.5 transition ${call.isScreenSharing ? 'bg-emerald-500 text-black hover:bg-emerald-400' : 'bg-black/45 text-white hover:bg-black/60'}`}
                  title={call.isScreenSharing ? 'Sharing screen' : 'Share screen'}
                >
                  <MonitorUp size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={call.rotateCamera}
                className="inline-flex rounded-full border border-white/10 bg-black/45 p-1.5 text-white transition hover:bg-black/60"
                title={call.isScreenSharing ? 'Switch back to camera' : 'Rotate camera'}
              >
                <SwitchCamera size={14} />
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      <div
        ref={bottomBarRef}
        className={`absolute bottom-4 left-4 right-4 z-30 flex flex-wrap items-end gap-3 ${showFooterStatus ? 'justify-center sm:justify-between' : 'justify-center'}`}
      >
        <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-black/45 px-3 py-3 backdrop-blur">
          <button
            onClick={call.toggleMicMute}
            className="rounded-full border border-white/10 bg-white/10 p-3 transition hover:bg-white/20"
            title={call.isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {call.isMicMuted ? <MicOff size={18} className="text-red-400" /> : <Mic size={18} />}
          </button>
          <button
            onClick={call.toggleSpeakerMute}
            className="rounded-full border border-white/10 bg-white/10 p-3 transition hover:bg-white/20"
            title={call.isSpeakerMuted ? 'Unmute remote audio' : 'Mute remote audio'}
          >
            {call.isSpeakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {showInviteButton && (
            <button
              onClick={copyInviteUrl}
              className="rounded-full border border-white/10 bg-white/10 p-3 transition hover:bg-white/20"
              title="Copy invite link"
            >
              {urlCopied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
            </button>
          )}
          <button
            onClick={() => setSelfPreviewVisible((currentValue) => !currentValue)}
            className="rounded-full border border-white/10 bg-white/10 p-3 transition hover:bg-white/20"
            title={selfPreviewVisible ? 'Hide own preview' : 'Show own preview'}
          >
            {selfPreviewVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          {showChatToggle && (
            <button
              onClick={() => setChatVisible((currentValue) => !currentValue)}
              className="rounded-full border border-white/10 bg-white/10 p-3 transition hover:bg-white/20"
              title={chatVisible ? 'Hide chat' : 'Show chat'}
            >
              {chatVisible ? <MessageSquareOff size={18} /> : <MessageSquare size={18} />}
            </button>
          )}
          {extraAction}
        </div>

        {showFooterStatus && (
          <div className="flex max-w-full items-center gap-2 rounded-3xl border border-white/10 bg-black/45 px-4 py-3 text-sm backdrop-blur">
            <Phone size={16} className={call.isRemoteLive ? 'text-emerald-400' : 'text-white/50'} />
            <span className="truncate">{footerLabel || call.remoteParticipantName || 'Open invite link to join'}</span>
          </div>
        )}
      </div>

      {overlay}

      {socket?.connected && room && chatVisible && (
        <ChatInterface
          socket={socket}
          room={room}
          showToggle={false}
          style={{
            left: '50%',
            right: 'auto',
            transform: 'translateX(-50%)',
            width: 'min(42rem, calc(100% - 2rem))',
            bottom: chatBottom,
            height: '28%',
          }}
        />
      )}
    </div>
  );
}

export default function CallChat() {
  const { config } = useAppStore();
  const room = config?.channel;
  const call = useCallWebRTC({ room, view: 'CallChat' });
  const [retryAvailableAt, setRetryAvailableAt] = useState(0);

  useEffect(() => {
    if (call.isRoomFull) {
      setRetryAvailableAt(Date.now() + 10000);
    }
  }, [call.isRoomFull]);

  const retrySeconds = Math.max(0, Math.ceil((retryAvailableAt - Date.now()) / 1000));
  const canRetry = retrySeconds <= 0;

  const retryButton = (
    <button
      onClick={canRetry ? () => call.joinRoom() : undefined}
      className={`rounded-full border border-white/10 p-3 transition ${canRetry ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-white/10 text-white/50'}`}
      title="Retry room access"
    >
      {canRetry ? <RefreshCcw size={18} /> : <RotateCcw size={18} />}
    </button>
  );

  const overlay = call.isRoomFull ? (
    <div className="absolute inset-x-0 top-24 mx-auto w-[min(92vw,24rem)] rounded-3xl border border-amber-400/30 bg-black/65 p-5 text-center backdrop-blur">
      <p className="text-sm text-white/75">This private call room is currently full.</p>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/40">Retry after another participant leaves</p>
      <div className="mt-4 flex items-center justify-center gap-3">
        {retryButton}
        <span className="text-sm text-white/65">{canRetry ? 'Retry now' : `Retry in ${retrySeconds}s`}</span>
      </div>
    </div>
  ) : null;

  return (
    <CallScreen
      title="Call Chat"
      subtitle="Two-way private video chat with picture-in-picture self preview."
      room={room}
      shareRoom={room}
      call={call}
      overlay={overlay}
      extraAction={retryButton}
      showChatToggle={false}
      showInfoCard={false}
      showWaitingTitle={false}
      showScreenShare
      footerLabel={room ? `Room ${room}` : 'Open invite link to join'}
    />
  );
}
