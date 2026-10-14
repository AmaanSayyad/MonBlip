/** Browser storage names for MonBlip. Reads copy an older key forward once. */

export function readStored(key: string, legacy: string[] = []): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const current = localStorage.getItem(key);
    if (current != null) return current;
    for (const old of legacy) {
      const value = localStorage.getItem(old);
      if (value != null) {
        localStorage.setItem(key, value);
        return value;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode should not block the desk.
  }
}

export function removeStored(key: string, legacy: string[] = []) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
    legacy.forEach((old) => localStorage.removeItem(old));
  } catch {
    // Ignore storage failures.
  }
}
