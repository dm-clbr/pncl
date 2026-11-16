export const PORTAL_TEAM_CACHE_MS = 60_000;
const clearers = new Set<() => void>();

/** Session-only memory: never persist team data or share it between tokens. */
export function createPortalTeamCache<T>() {
  let owner: string | undefined;
  const entries = new Map<string, { data: T; expiresAt: number }>();
  const clear = () => { owner = undefined; entries.clear(); };
  clearers.add(clear);
  return {
    read(token: string | undefined, key: string) {
      if (!token || token !== owner) { clear(); owner = token; }
      const entry = entries.get(key);
      if (entry && entry.expiresAt > Date.now()) return entry;
      entries.delete(key);
      return undefined;
    },
    write(token: string, key: string, data: T) {
      if (owner !== token) { clear(); owner = token; }
      entries.set(key, { data, expiresAt: Date.now() + PORTAL_TEAM_CACHE_MS });
    },
    remove(key: string) { entries.delete(key); },
  };
}

export function clearPortalTeamCaches() { clearers.forEach(clear => clear()); }
