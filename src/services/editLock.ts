import type { RealtimeChannel } from '@supabase/supabase-js';

// Advisory edit locks, carried on the house channel's Presence payload.
//
// Presence is the right transport here rather than a DB row: Supabase drops a client's presence
// the moment its socket goes away, so a closed tab, a crash, or dead wifi releases the lock by
// itself. A lock row in house_assets would need a heartbeat plus stale-lock reaping, and a client
// that died mid-edit would leave the asset locked for everyone.
//
// These locks are advisory. RLS on house_assets is open and the publishable key ships in the
// bundle, so a client that ignores the lock can still write. This stops two people editing the
// same asset by accident, which is the actual failure mode; it is not a security boundary.

export type EditLockKind = 'char' | 'map_tileset' | 'map';

export interface EditLockHolder {
  deviceId: string;
  nickname: string;
  lockedAt: number;
}

export const lockKey = (kind: EditLockKind, id: string) => `${kind}:${id}`;

let channel: RealtimeChannel | null = null;
let selfId = '';
let readNickname: () => string = () => '플레이어';
let myLock: { key: string; lockedAt: number } | null = null;

// Every track() call adds another presence entry under our key instead of replacing the previous
// one, so presenceState() hands back the whole history: a client that locked and then released
// shows up as [no lock, lock, no lock]. This counter marks which entry is current — reading the
// newest by seq is what makes a release actually visible to everyone else.
let seq = 0;

// Presence is supposed to drop a client the moment its socket dies, but that is not prompt: a tab
// killed without a clean close stayed in presenceState() well past 40s in testing, which would
// leave everyone else locked out with no way back. So a holder re-announces on this interval and
// a claim that has gone quiet for STALE_AFTER_MS is ignored, bounding a ghost lock either way.
const HEARTBEAT_MS = 15000;
const STALE_AFTER_MS = 45000;
let heartbeat: ReturnType<typeof setInterval> | null = null;

const startHeartbeat = () => {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    if (!myLock) return;
    trackPresence();
    notify();
  }, HEARTBEAT_MS);
};

const stopHeartbeat = () => {
  if (!heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = null;
};

const listeners = new Set<() => void>();
const notify = () => {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {}
  });
};

/** Called by App once the house channel is subscribed. */
export const registerLockChannel = (
  ch: RealtimeChannel,
  deviceId: string,
  nicknameGetter: () => string
) => {
  channel = ch;
  selfId = deviceId;
  readNickname = nicknameGetter;
};

export const clearLockChannel = (ch: RealtimeChannel) => {
  if (channel === ch) {
    channel = null;
    notify();
  }
};

/**
 * Push our presence payload. The base fields are what the rest of the app already relies on for
 * its online check, so anything tracking presence must send them too — track() replaces the whole
 * payload rather than merging.
 */
export const trackPresence = () => {
  if (!channel) return;
  try {
    channel.track({
      id: selfId,
      nickname: readNickname(),
      online_at: new Date().toISOString(),
      seq: ++seq,
      editing: myLock ? { ...myLock, beat: Date.now() } : null
    });
  } catch (e) {}
};

export const acquireLock = (kind: EditLockKind, id: string) => {
  const key = lockKey(kind, id);
  if (myLock && myLock.key === key) return;
  myLock = { key, lockedAt: Date.now() };
  startHeartbeat();
  trackPresence();
  notify();
};

export const releaseLock = () => {
  if (!myLock) return;
  myLock = null;
  stopHeartbeat();
  trackPresence();
  notify();
};

/** Presence sync fired — recompute every subscriber's view of the locks. */
export const notifyLocksChanged = notify;

export const onLocksChanged = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

interface Claim extends EditLockHolder {
  key: string;
}

const collectClaims = (): Claim[] => {
  const claims: Claim[] = [];

  if (myLock) {
    claims.push({ key: myLock.key, deviceId: selfId, nickname: readNickname(), lockedAt: myLock.lockedAt });
  }

  if (!channel) return claims;

  let state: Record<string, any[]> = {};
  try {
    state = channel.presenceState() as Record<string, any[]>;
  } catch (e) {
    return claims;
  }

  Object.values(state).forEach((presences) => {
    if (!Array.isArray(presences) || presences.length === 0) return;

    // Collapse the entry history down to the current one. Highest seq wins; entries from before
    // this change carry no seq, so fall back to the last element, which is the newest in practice.
    let current: any = null;
    presences.forEach((p: any) => {
      if (!p || !p.id) return;
      if (!current) {
        current = p;
      } else if (typeof p.seq === 'number' && typeof current.seq === 'number') {
        if (p.seq > current.seq) current = p;
      } else {
        current = p;
      }
    });

    if (!current || !current.id) return;
    // Our own claim is already in the list from myLock, which is always the freshest copy
    if (current.id === selfId) return;
    if (!current.editing || !current.editing.key) return;

    // A claim whose holder stopped heartbeating is a ghost — presence has not caught up with a
    // client that went away. Claims from before this change carry no beat, so they never expire.
    const beat = current.editing.beat;
    if (typeof beat === 'number' && Date.now() - beat > STALE_AFTER_MS) return;

    claims.push({
      key: current.editing.key,
      deviceId: current.id,
      nickname: current.nickname || '플레이어',
      lockedAt: typeof current.editing.lockedAt === 'number' ? current.editing.lockedAt : 0
    });
  });

  return claims;
};

/**
 * Who owns this resource right now, or null if it is free.
 *
 * Two clients can both claim before either sees the other's presence, so the winner is decided
 * from the claim itself rather than from arrival order: earliest lockedAt wins, deviceId breaks
 * an exact tie. Every client runs the same comparison over the same data and agrees, so the
 * loser flips itself to read-only on the next sync instead of both believing they hold it.
 */
export const getLockHolder = (kind: EditLockKind, id: string): EditLockHolder | null => {
  const key = lockKey(kind, id);
  const claims = collectClaims().filter((c) => c.key === key);
  if (claims.length === 0) return null;

  claims.sort((a, b) => (a.lockedAt - b.lockedAt) || a.deviceId.localeCompare(b.deviceId));
  return claims[0];
};

export const isSelf = (holder: EditLockHolder | null) => !!holder && holder.deviceId === selfId;
