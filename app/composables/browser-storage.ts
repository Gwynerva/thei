/**
 * `localStorage`, as this browser lets a page use it. A private window or
 * blocked site data may refuse it: then nothing is read and what is written
 * is lost, without an error. What a page keeps here is only ever a
 * convenience of this browser — an order, a view, what was searched for —
 * never what it cannot do without.
 */
export interface BrowserStorage {
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
  remove: (key: string) => void;
}

export const browserStorage: BrowserStorage = {
  read: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};
