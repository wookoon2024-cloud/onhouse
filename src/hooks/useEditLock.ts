import { useEffect, useState } from 'react';
import {
  acquireLock,
  getLockHolder,
  isSelf,
  onLocksChanged,
  releaseLock,
  type EditLockHolder,
  type EditLockKind
} from '../services/editLock';

export interface EditLockState {
  /** Someone else holds this asset — the editor must stay read-only. */
  isReadOnly: boolean;
  /** Nickname to show in the banner, when isReadOnly. */
  lockedBy: string | null;
  holder: EditLockHolder | null;
}

/**
 * Claim `id` for editing while this component is mounted with a non-null id, and report whether
 * someone else got there first. Pass a null id (editor closed, nothing selected) to hold nothing.
 *
 * The claim is released on unmount, so closing the editor — or the tab — frees the asset.
 */
export const useEditLock = (kind: EditLockKind, id: string | null): EditLockState => {
  const [, forceUpdate] = useState(0);

  useEffect(() => onLocksChanged(() => forceUpdate((n) => n + 1)), []);

  // A holder that stops heartbeating expires on a timer, not on an event, so nothing would tell
  // a waiting viewer that the lock just went stale. Re-check on our own while mounted.
  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => forceUpdate((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (!id) {
      releaseLock();
      return;
    }
    acquireLock(kind, id);
    return () => releaseLock();
  }, [kind, id]);

  if (!id) return { isReadOnly: false, lockedBy: null, holder: null };

  const holder = getLockHolder(kind, id);
  if (!holder || isSelf(holder)) {
    return { isReadOnly: false, lockedBy: null, holder };
  }
  return { isReadOnly: true, lockedBy: holder.nickname, holder };
};
