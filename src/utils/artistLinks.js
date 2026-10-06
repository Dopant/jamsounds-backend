const keys = ['facebook', 'x', 'spotify', 'youtube', 'apple_music', 'tiktok', 'instagram', 'website'];
export function normalizeArtistLinks(raw) {
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { throw new Error('Artist links must be valid JSON'); } }
  if (raw === null) return null;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new Error('Artist links must be an object');
  const links = {};
  for (const key of keys) {
    if (raw[key] === undefined || raw[key] === null || raw[key] === '') continue;
    if (typeof raw[key] !== 'string') throw new Error(`Invalid ${key} link`);
    const value = raw[key].trim();
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { throw new Error(`Invalid ${key} URL`); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(`Invalid ${key} URL`);
    links[key] = url.href;
  }
  return links;
}

export function normalizeRetainedMediaIds(raw) {
  if (raw === undefined) return undefined;
  let ids;
  try { ids = JSON.parse(raw); } catch { throw new Error('Invalid retained media IDs'); }
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) < 1)) throw new Error('Invalid retained media IDs');
  return [...new Set(ids.map(Number))];
}
