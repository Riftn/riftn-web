import React from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Presentation, Phone, PhoneOff, RotateCcw, User, Users } from 'lucide-react';
import MicOff from '@/components/ui/cut-icons/mic-off';
import Mic from '@/components/ui/cut-icons/mic';
import Video from '@/components/ui/cut-icons/video';
import VideoOff from '@/components/ui/cut-icons/video-off';
import { toast } from 'sonner';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import type { GroupParticipant } from '@/hooks/use-call';
import { PUBLIC_CHAT_CALL_ID } from '@/lib/group-call';
import { CallDuration } from './CallDuration';
import {
  CallStage,
  CallIdentity,
  CallControl,
  CallDock,
  CallPill,
  peerInitial,
  usePeerIdentity,
} from './CallChrome';
import { CallCaptionsControl, CallCaptionsOverlay } from './CallCaptions';
import { CallBackgroundPanel, CallFxButton, useCallBackgroundAvailable } from './CallBackgroundPicker';
import { TownHall } from './TownHall';
import { CallModMenu } from './CallModMenu';
import type { CallModAction } from '@/lib/api/dehub/group-call-moderation';
import { readTownHallMode, saveTownHallMode, TOWN_HALL_FROM, type TownHallMode } from '@/lib/town-hall';

/**
 * A group call, voice or video, on the same stage as a direct call.
 *
 * Before anyone else is in the room it is the ringing screen with the group's
 * name (Public Chat: the waiting screen, nobody is rung). Once somebody joins it becomes a grid: one tile per person,
 * their camera when it is on and their picture when it is not, outlined while
 * they talk. By default it is a town hall instead (see TownHall): the
 * talker fills the stage over a strip of everyone else; the corner button
 * switches between the two and is remembered. Leaving is the one solid control; the call carries on for
 * whoever is still in it.
 */
const GroupCallModal: React.FC = () => {
  const {
    isCallActive,
    isIncoming,
    isRinging,
    currentCall,
    peerAddress,
    isConnecting,
    isMuted,
    isCameraOff,
    selfSpeaking,
    groupCamerasFull,
    groupParticipants,
    attachLocalVideo,
    attachGroupVideo,
    readGroupLevels,
    groupModeration,
    moderateGroupMember,
    endCall,
    acceptCall,
    rejectCall,
    toggleMute,
    toggleCamera,
    switchCamera,
    isMinimized,
    minimizeCall,
    callBackground,
    callBackgroundBusy,
    setCallBackground,
    callFaceFilter,
    setCallFaceFilter,
  } = useCall();
  const fxAvailable = useCallBackgroundAvailable();
  const [fxOpen, setFxOpen] = React.useState(false);
  const [layout, setLayout] = React.useState<TownHallMode>(readTownHallMode);
  const { walletAddress } = useAuth();
  const { t } = useTranslation();
  const caller = usePeerIdentity(isIncoming ? peerAddress : '');
  const self = usePeerIdentity(walletAddress ?? '');

  if (!currentCall?.group_id || isMinimized || !(isCallActive || isIncoming || isConnecting)) return null;

  const isVideo = currentCall.call_type === 'video';
  const groupName = currentCall.group_name || t('calls.group', 'Group');
  const kindLabel = isVideo ? t('calls.groupVideoCall', 'Group video call') : t('calls.groupVoiceCall', 'Group voice call');
  const stagePeer = { name: groupName, avatarUrl: isIncoming ? caller.avatarUrl : self.avatarUrl };

  if (!isCallActive) {
    const status = isIncoming
      ? t('calls.isCalling', { name: caller.name, defaultValue: '{{name}} is calling' })
      : isRinging
        ? currentCall.group_id === PUBLIC_CHAT_CALL_ID
          ? t('calls.waitingForPeople', 'Waiting for people to join...')
          : t('calls.callingGroup', 'Ringing the group...')
        : t('calls.connecting');
    return (
      <CallStage peer={stagePeer} onMinimize={isIncoming ? undefined : minimizeCall} minimizeLabel={t('calls.minimize')}>
        <CallIdentity kindIcon={isVideo ? Video : Users} kindLabel={kindLabel} peer={stagePeer} status={status} ringing={isIncoming || isRinging} />
        <div className="call-stage__foot">
          {isIncoming ? (
            <div className="call-row">
              <CallPill icon={PhoneOff} label={t('calls.decline')} onClick={rejectCall} />
              <CallPill icon={isVideo ? Video : Phone} label={t('calls.accept')} onClick={acceptCall} solid />
            </div>
          ) : (
            <CallDock>
              <CallControl
                icon={isMuted ? MicOff : Mic}
                label={isMuted ? t('calls.unmute') : t('calls.mute')}
                onClick={toggleMute}
                active={isMuted}
              />
              <CallControl icon={PhoneOff} label={t('common.cancel', 'Cancel')} onClick={endCall} primary />
            </CallDock>
          )}
        </div>
      </CallStage>
    );
  }

  const count = groupParticipants.length + 1;
  // Town hall for every group call unless the person picked the grid themselves.
  const hall = layout === 'hall' || (layout === 'auto' && count >= TOWN_HALL_FROM);
  const flipLayout = () => {
    const next: TownHallMode = hall ? 'grid' : 'hall';
    saveTownHallMode(next);
    setLayout(next);
  };
  const layoutLabel = hall ? t('calls.gridView', 'Grid') : t('calls.townHall', 'Town hall');
  const onModerate = groupModeration.canModerate
    ? (wallet: string, action: CallModAction) => {
      void moderateGroupMember(wallet, action).then(done => {
        if (!done) return;
        toast(action === 'remove'
          ? t('calls.modRemoved', 'Removed from the call')
          : action === 'mute' ? t('calls.modMuted', 'Muted for everyone') : t('calls.modUnmuted', 'Unmuted'));
      });
    }
    : undefined;
  return (
    <CallStage peer={stagePeer} video={isVideo} onMinimize={minimizeCall} minimizeLabel={t('calls.minimize')}>
      <div className="call-stage__top">
        <div className="call-stage__chip">
          <span>{groupName}</span>
          <span><CallDuration fallback={t('calls.connected')} /></span>
        </div>
      </div>
      {isVideo && fxAvailable ? (
        <CallFxButton open={fxOpen} onToggle={() => setFxOpen(open => !open)} active={callBackground !== 'none' || callFaceFilter !== 'none'} />
      ) : null}

      {/* Layout switch: town hall (talker on the big stage) or the even grid. */}
      <button
        type="button"
        className="call-stage__layout"
        data-beside-fx={isVideo && fxAvailable ? 'true' : 'false'}
        onClick={flipLayout}
        aria-label={layoutLabel}
        title={layoutLabel}
      >
        {hall ? <LayoutGrid className="h-[18px] w-[18px]" /> : <Presentation className="h-[18px] w-[18px]" />}
      </button>

      {hall ? (
        <TownHall
          isVideo={isVideo}
          self={{ name: self.name, avatarUrl: self.avatarUrl, camera: isVideo && !isCameraOff, muted: isMuted }}
          participants={groupParticipants}
          attachLocalVideo={attachLocalVideo}
          attachGroupVideo={attachGroupVideo}
          readGroupLevels={readGroupLevels}
          onModerate={onModerate}
        />
      ) : (
        <div className="group-call-grid" data-count={Math.min(count, 5)} data-video={isVideo ? 'true' : 'false'}>
          <div className="group-call-tile" data-speaking={selfSpeaking && !isMuted ? 'true' : 'false'}>
            {isVideo && !isCameraOff ? <div ref={attachLocalVideo} className="group-call-tile__video group-call-tile__video--self" /> : (
              <TileFace name={self.name} avatarUrl={self.avatarUrl} />
            )}
            <span className="group-call-tile__name">
              {isMuted ? <MicOff className="h-3 w-3" /> : null}
              <span>{t('calls.you', 'You')}</span>
            </span>
          </div>
          {groupParticipants.map(participant => (
            <GroupTile key={participant.uid} participant={participant} attach={attachGroupVideo(participant.uid)} onModerate={onModerate} />
          ))}
        </div>
      )}

      <div className="call-stage__foot">
        <CallCaptionsOverlay />
        {isVideo && fxAvailable && fxOpen ? (
          <CallBackgroundPanel value={callBackground} busy={callBackgroundBusy} onPick={setCallBackground} onClose={() => setFxOpen(false)} faceFilter={callFaceFilter} onPickFace={setCallFaceFilter} />
        ) : null}
        <CallDock crowded={isVideo}>
          <CallControl
            icon={isMuted ? MicOff : Mic}
            label={isMuted ? t('calls.unmute') : t('calls.mute')}
            onClick={toggleMute}
            active={isMuted}
          />
          {isVideo ? (
            <>
              {/* Every camera slot taken: the button says so, and a tap explains how to get one. */}
              <CallControl
                icon={isCameraOff ? VideoOff : Video}
                label={isCameraOff && groupCamerasFull ? t('calls.camerasFull', 'Cameras full') : t('calls.camera')}
                onClick={toggleCamera}
                active={isCameraOff}
                dimmed={isCameraOff && groupCamerasFull}
              />
              <CallControl icon={RotateCcw} label={t('calls.flip')} onClick={switchCamera} />
            </>
          ) : null}
          <CallCaptionsControl />
          <CallControl icon={PhoneOff} label={t('calls.leave', 'Leave')} onClick={endCall} primary />
        </CallDock>
      </div>
    </CallStage>
  );
};

function TileFace({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className="group-call-tile__face">
      {/* A bare wallet (no profile yet) gets a person, not the "0" of "0x". */}
      {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{name.startsWith('0x') ? <User className="h-1/2 w-1/2" /> : peerInitial(name)}</span>}
    </div>
  );
}

function GroupTile({ participant, attach, onModerate }: {
  participant: GroupParticipant; attach: (node: HTMLDivElement | null) => void;
  onModerate?: (wallet: string, action: CallModAction) => void;
}) {
  const peer = usePeerIdentity(participant.wallet ?? '');
  const wallet = participant.wallet;
  return (
    <div className="group-call-tile" data-speaking={participant.speaking ? 'true' : 'false'}>
      {participant.video ? <div ref={attach} className="group-call-tile__video" /> : <TileFace name={peer.name} avatarUrl={peer.avatarUrl} />}
      <span className="group-call-tile__name">
        {!participant.audio ? <MicOff className="h-3 w-3" /> : null}
        <span>{participant.wallet ? peer.name : '…'}</span>
      </span>
      {onModerate && wallet ? (
        <CallModMenu className="group-call-tile__mod" name={peer.name} modMuted={!!participant.modMuted} onModerate={action => onModerate(wallet, action)} />
      ) : null}
    </div>
  );
}

export default GroupCallModal;
