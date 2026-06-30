// ---------------------------------------------------------------------------
// Secure session storage adapter for Supabase Auth (Expo SecureStore).
//
// The Supabase JS client persists the session (access + refresh token) under a
// single key. SecureStore stores values in the device Keychain/Keystore, but
// warns/limits values around ~2 KB on Android — a full session JSON can exceed
// that. So we transparently CHUNK large values across multiple SecureStore keys
// and reassemble on read. Tokens are kept in the OS secure store only; they are
// never written to plain AsyncStorage and never logged.
// ---------------------------------------------------------------------------
import * as SecureStore from "expo-secure-store";

// Stay safely under SecureStore's per-value size guidance.
const CHUNK_SIZE = 1800;
// Suffix marking how many chunks a key was split into.
const COUNT_SUFFIX = "::count";

function chunkKey(key: string, index: number): string {
  return `${key}::${index}`;
}

async function clearChunks(key: string, count: number): Promise<void> {
  const deletions: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    deletions.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  }
  deletions.push(SecureStore.deleteItemAsync(`${key}${COUNT_SUFFIX}`));
  await Promise.all(deletions);
}

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(`${key}${COUNT_SUFFIX}`);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    // Fast path: a small value stored directly under the key.
    const direct = await SecureStore.getItemAsync(key);
    if (direct !== null) return direct;

    // Chunked path.
    const count = await readCount(key);
    if (count === 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) {
        // Corrupted/partial write — drop the lot so auth re-initialises cleanly.
        await clearChunks(key, count);
        return null;
      }
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    // Always clear any previous representation (direct or chunked) first.
    const prevCount = await readCount(key);
    if (prevCount > 0) await clearChunks(key, prevCount);
    await SecureStore.deleteItemAsync(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    await SecureStore.setItemAsync(`${key}${COUNT_SUFFIX}`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const count = await readCount(key);
    if (count > 0) await clearChunks(key, count);
    await SecureStore.deleteItemAsync(key);
  },
};
