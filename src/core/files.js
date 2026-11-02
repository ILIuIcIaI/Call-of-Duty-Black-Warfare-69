// The game's few files that aren't code. A packed build carries them inside itself (desktop/build.js), because a
// page opened straight from the disk may not fetch anything; everywhere else they come from the server.
export async function fileBytes(url) {
  const name = String(url).split('/').pop(), packed = globalThis.BW69_FILES && globalThis.BW69_FILES[name];
  if (packed) {
    const s = atob(packed), b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b.buffer;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(name + ': ' + r.status);
  return r.arrayBuffer();
}
