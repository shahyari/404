// Storage for 404 Pages experiences (requires "storage" in meta.json).
// Inside the site, data is kept by the shell. Opened standalone, it's kept
// in memory for the current visit. Copied from docs/PERMISSIONS.md.
export const storage = (() => {
  const framed = window.parent !== window;
  const memory = new Map();
  const pending = new Map();
  let nextId = 0;

  addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || data?.type !== '404:storage' || !pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.ok ? resolve(data.value ?? null) : reject(new Error(data.error));
  });

  const call = (op, key, value) => new Promise((resolve, reject) => {
    if (!framed) {
      if (op === 'get') return resolve(memory.get(key) ?? null);
      if (op === 'set') return resolve(void memory.set(key, String(value)));
      if (op === 'remove') return resolve(void memory.delete(key));
      if (op === 'keys') return resolve([...memory.keys()]);
      if (op === 'clear') return resolve(memory.clear());
    }
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    window.parent.postMessage({ type: '404:storage', id, op, key, value }, '*');
    setTimeout(() => pending.delete(id) && reject(new Error('Storage timed out')), 3000);
  });

  return {
    get: (key) => call('get', key),
    set: (key, value) => call('set', key, value),
    remove: (key) => call('remove', key),
    keys: () => call('keys'),
    clear: () => call('clear'),
  };
})();
