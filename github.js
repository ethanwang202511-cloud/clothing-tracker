// Thin wrapper over the GitHub Contents API. Config lives in localStorage.
window.GH = (() => {
  const KEY = 'clothing-tracker-config';

  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  }

  function setConfig(cfg) {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  }

  function isConfigured() {
    const c = getConfig();
    return Boolean(c.token && c.owner && c.repo);
  }

  // Best guess when hosted at https://<owner>.github.io/<repo>/
  function guessFromLocation() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return {};
    const repo = location.pathname.split('/').filter(Boolean)[0];
    return { owner: m[1], repo: repo || `${m[1]}.github.io` };
  }

  class GHError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  async function request(path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
    const c = getConfig();
    const branch = c.branch || 'main';
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    let url = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${encoded}`;
    if (method === 'GET') url += `?ref=${encodeURIComponent(branch)}&t=${Date.now()}`;
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${c.token}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify({ ...body, branch }) : undefined,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (await res.json()).message || msg;
      } catch {}
      throw new GHError(res.status, `GitHub ${res.status}: ${msg}`);
    }
    return res;
  }

  function bytesToBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function base64ToText(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  // Returns { data, sha }. Missing file -> { data: null, sha: null }.
  async function getJson(path) {
    let meta;
    try {
      meta = await (await request(path)).json();
    } catch (e) {
      if (e.status === 404) return { data: null, sha: null };
      throw e;
    }
    let text;
    if (meta.content && meta.encoding === 'base64') {
      text = base64ToText(meta.content);
    } else {
      // Files > 1MB come back without inline content.
      text = await (await request(path, { accept: 'application/vnd.github.raw+json' })).text();
    }
    return { data: JSON.parse(text), sha: meta.sha };
  }

  // Returns new sha. Throws GHError 409/422 when sha is stale.
  async function putJson(path, data, sha, message) {
    const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2) + '\n');
    return putBase64(path, bytesToBase64(bytes), sha, message);
  }

  async function putBase64(path, base64, sha, message) {
    const res = await request(path, {
      method: 'PUT',
      body: { message, content: base64, ...(sha ? { sha } : {}) },
    });
    return (await res.json()).content.sha;
  }

  async function getBlob(path) {
    return (await request(path, { accept: 'application/vnd.github.raw+json' })).blob();
  }

  async function deleteFile(path, message) {
    const meta = await (await request(path)).json();
    await request(path, { method: 'DELETE', body: { message, sha: meta.sha } });
  }

  return { getConfig, setConfig, isConfigured, guessFromLocation, getJson, putJson, putBase64, getBlob, deleteFile };
})();
