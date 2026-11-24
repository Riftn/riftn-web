import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, User } from 'lucide-react';
import MicOff from '@/components/ui/cut-icons/mic-off';
import type { GroupParticipant } from '@/hooks/use-call';
import { createStageDirector, readTownHallFx, TALK_LEVEL, type TownHallKey, type TownHallState } from '@/lib/town-hall';
import { formatCount } from '@/lib/format-count';
import { peerInitial, usePeerIdentity } from './CallChrome';

/**
 * Town hall: whoever is talking fills the stage, everyone else sits in the
 * strip underneath. When several people talk at once the stage keeps cutting
 * between them (the cut style is `fx`) until it settles on one voice. Tap
 * someone in the strip to pin them to the stage; tap the stage pin to let go.
 */
export interface TownHallProps {
  isVideo: boolean;
  self: { name: string; avatarUrl: string | null; camera: boolean; muted: boolean };
  participants: GroupParticipant[];
  attachLocalVideo: (node: HTMLDivElement | null) => void;
  attachGroupVideo: (uid: number) => (node: HTMLDivElement | null) => void;
  readGroupLevels: () => Map<number, number>;
}

const TICK_MS = 90;

/** Where the signal bars of one cut land: different on every cut, the same on every render of it. */
function cutBars(cut: number): React.CSSProperties[] {
  let seed = (cut * 2654435761) >>> 0;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: 5 }, () => ({
    '--y': `${Math.round(next() * 92)}%`,
    '--h': `${(1 + next() * 5).toFixed(1)}%`,
    '--x': `${Math.round((next() - 0.5) * 60)}%`,
  }) as React.CSSProperties);
}

export function TownHall({ isVideo, self, participants, attachLocalVideo, attachGroupVideo, readGroupLevels }: TownHallProps) {
  const { t } = useTranslation();
  const fx = React.useMemo(readTownHallFx, []);
  const [pinned, setPinned] = React.useState<TownHallKey | null>(null);
  const [state, setState] = React.useState<TownHallState>({ stage: null, talkers: [], contested: false, cut: 0 });
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const director = React.useMemo(createStageDirector, []);

  // Everything the loop reads, kept current without restarting it.
  const live = React.useRef({ participants, self, pinned, readGroupLevels });
  live.current = { participants, self, pinned, readGroupLevels };

  React.useEffect(() => {
    let previous = '';
    const tick = () => {
      const { participants: people, self: me, pinned: pin, readGroupLevels: read } = live.current;
      const present: TownHallKey[] = [0, ...people.map(person => person.uid)];
      const levels = read();
      // No live levels (old track, or a muted mic): fall back on who the call says is talking.
      for (const person of people) {
        if (!person.audio) levels.set(person.uid, 0);
        else if (!levels.has(person.uid)) levels.set(person.uid, person.speaking ? TALK_LEVEL * 3 : 0);
      }
      if (me.muted) levels.set(0, 0);
      const next = director.update(levels, present, performance.now(), pin);
      // The stage glow follows the voice on it, straight on the element (no re-render).
      const node = stageRef.current;
      if (node && next.stage != null) node.style.setProperty('--th-level', String(Math.min(1, (levels.get(next.stage) ?? 0) * 2.4)));
      const key = `${next.stage}|${next.cut}|${next.contested}|${next.talkers.join(',')}`;
      if (key !== previous) { previous = key; setState(next); }
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [director]);

  // A pinned person who leaves lets go of the stage.
  React.useEffect(() => {
    if (pinned != null && pinned !== 0 && !participants.some(person => person.uid === pinned)) setPinned(null);
  }, [participants, pinned]);

  const stage = state.stage ?? participants[0]?.uid ?? 0;
  const talking = new Set(state.talkers);
  const onStage = stage === 0 ? null : participants.find(person => person.uid === stage) ?? null;
  const togglePin = (key: TownHallKey) => setPinned(current => (current === key ? null : key));

  return (
    <div className="th" data-fx={fx} data-video={isVideo ? 'true' : 'false'} data-contested={state.contested ? 'true' : 'false'}>
      <div ref={stageRef} className="th-stage" data-talking={talking.has(stage) ? 'true' : 'false'}>
        {stage === 0 ? (
          <StageShot key={`0-${state.cut}`} name={self.name} avatarUrl={self.avatarUrl} attach={isVideo && self.camera ? attachLocalVideo : null} mirrored />
        ) : onStage ? (
          <RemoteStageShot key={`${stage}-${state.cut}`} participant={onStage} attach={attachGroupVideo(stage)} />
        ) : null}
        <div key={`fx-${state.cut}`} className="th-cut" aria-hidden>
          {cutBars(state.cut).map((bar, index) => <i key={index} style={bar} />)}
        </div>
        <div className="th-scan" aria-hidden />
        <StageName
          name={stage === 0 ? t('calls.you', 'You') : null}
          participant={onStage}
          muted={stage === 0 ? self.muted : !onStage?.audio}
          talking={talking.has(stage)}
        />
        {state.contested && state.talkers.length > 1 ? (
          <span className="th-crowd" role="status">
            {t('calls.townHallTalking', { count: state.talkers.length, n: formatCount(state.talkers.length), defaultValue: '{{n}} talking' })}
          </span>
        ) : null}
        {pinned != null ? (
          <button type="button" className="th-pin" onClick={() => setPinned(null)} aria-label={t('calls.unpin', 'Unpin')}>
            <Pin className="h-3.5 w-3.5" />
            <span>{t('calls.unpin', 'Unpin')}</span>
          </button>
        ) : null}
      </div>

      <div className="th-strip" role="list">
        <StripTile
          name={t('calls.you', 'You')}
          avatarUrl={self.avatarUrl}
          muted={self.muted}
          talking={talking.has(0)}
          onStage={stage === 0}
          pinned={pinned === 0}
          attach={isVideo && self.camera && stage !== 0 ? attachLocalVideo : null}
          mirrored
          onPress={() => togglePin(0)}
        />
        {participants.map(person => (
          <RemoteStripTile
            key={person.uid}
            participant={person}
            talking={talking.has(person.uid)}
            onStage={stage === person.uid}
            pinned={pinned === person.uid}
            attach={person.video && stage !== person.uid ? attachGroupVideo(person.uid) : null}
            onPress={() => togglePin(person.uid)}
          />
        ))}
      </div>
    </div>
  );
}

function Face({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{name.startsWith('0x') ? <User className="h-1/2 w-1/2" /> : peerInitial(name)}</span>;
}

function StageShot({ name, avatarUrl, attach, mirrored }: { name: string; avatarUrl: string | null; attach: ((node: HTMLDivElement | null) => void) | null; mirrored?: boolean }) {
  return (
    <div className="th-shot">
      {attach ? (
        <div ref={attach} className="th-shot__video" data-mirrored={mirrored ? 'true' : 'false'} />
      ) : (
        <>
          {avatarUrl ? <div className="th-shot__wash" style={{ backgroundImage: `url("${avatarUrl}")` }} /> : null}
          <div className="th-shot__face"><Face name={name} avatarUrl={avatarUrl} /></div>
        </>
      )}
    </div>
  );
}

function RemoteStageShot({ participant, attach }: { participant: GroupParticipant; attach: (node: HTMLDivElement | null) => void }) {
  const peer = usePeerIdentity(participant.wallet ?? '');
  return <StageShot name={peer.name} avatarUrl={peer.avatarUrl} attach={participant.video ? attach : null} />;
}

function StageName({ name, participant, muted, talking }: { name: string | null; participant: GroupParticipant | null; muted: boolean; talking: boolean }) {
  const peer = usePeerIdentity(participant?.wallet ?? '');
  const shown = name ?? (participant?.wallet ? peer.name : '…');
  return (
    <span className="th-name">
      {muted ? <MicOff className="h-3.5 w-3.5" /> : <span className="th-meter" data-on={talking ? 'true' : 'false'} aria-hidden><i /><i /><i /></span>}
      <span>{shown}</span>
    </span>
  );
}

function StripTile({ name, avatarUrl, muted, talking, onStage, pinned, attach, mirrored, onPress }: {
  name: string; avatarUrl: string | null; muted: boolean; talking: boolean; onStage: boolean; pinned: boolean;
  attach: ((node: HTMLDivElement | null) => void) | null; mirrored?: boolean; onPress: () => void;
}) {
  return (
    <button
      type="button"
      role="listitem"
      className="th-tile"
      data-talking={talking ? 'true' : 'false'}
      data-on-stage={onStage ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      aria-pressed={pinned}
      onClick={onPress}
    >
      {attach ? <div ref={attach} className="th-tile__video" data-mirrored={mirrored ? 'true' : 'false'} /> : (
        <span className="th-tile__face"><Face name={name} avatarUrl={avatarUrl} /></span>
      )}
      <span className="th-tile__name">
        {muted ? <MicOff className="h-2.5 w-2.5" /> : null}
        <span>{name}</span>
      </span>
    </button>
  );
}

function RemoteStripTile({ participant, ...rest }: { participant: GroupParticipant } & Omit<React.ComponentProps<typeof StripTile>, 'name' | 'avatarUrl' | 'muted'>) {
  const peer = usePeerIdentity(participant.wallet ?? '');
  return <StripTile {...rest} name={participant.wallet ? peer.name : '…'} avatarUrl={peer.avatarUrl} muted={!participant.audio} />;
}
