// IndexedDB persistence via idb-keyval. Two logical stores:
//   - meta:  Recording metadata (index list + per-recording record incl. transcript & cached results)
//   - audio: raw audio Blobs keyed by recording id
//
// We never lose a recording: the Blob is written the instant recording stops,
// before any navigation or API call happens.

import { get, set, del, createStore } from 'idb-keyval';
import type { Recording } from './types';

const metaStore = createStore('voicenotes-meta', 'kv');
const audioStore = createStore('voicenotes-audio', 'kv');

const INDEX_KEY = '__recording_index__';

async function readIndex(): Promise<string[]> {
  return (await get<string[]>(INDEX_KEY, metaStore)) ?? [];
}

async function writeIndex(ids: string[]): Promise<void> {
  await set(INDEX_KEY, ids, metaStore);
}

/** Persist (or update) a recording's metadata. */
export async function saveRecording(rec: Recording): Promise<void> {
  await set(rec.id, rec, metaStore);
  const index = await readIndex();
  if (!index.includes(rec.id)) {
    index.unshift(rec.id); // newest first
    await writeIndex(index);
  }
}

/** Persist the audio blob for a recording. Called immediately on stop. */
export async function saveAudio(id: string, blob: Blob): Promise<void> {
  await set(id, blob, audioStore);
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  return get<Blob>(id, audioStore);
}

export async function getRecording(id: string): Promise<Recording | undefined> {
  return get<Recording>(id, metaStore);
}

/** All recordings, newest first. */
export async function listRecordings(): Promise<Recording[]> {
  const index = await readIndex();
  const out: Recording[] = [];
  for (const id of index) {
    const rec = await get<Recording>(id, metaStore);
    if (rec) out.push(rec);
  }
  return out;
}

export async function deleteRecording(id: string): Promise<void> {
  await del(id, metaStore);
  await del(id, audioStore);
  const index = await readIndex();
  await writeIndex(index.filter((x) => x !== id));
}
