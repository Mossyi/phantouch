const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export const decodeBase64Audio = (value: unknown, maxBytes: number = 20_000_000): Uint8Array | null => {
  if (typeof value !== 'string') return null;
  const encoded = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const compact = encoded.replace(/\s+/g, '');
  if (!compact || compact.length > Math.ceil(maxBytes / 3) * 4 + 4 || !BASE64_PATTERN.test(compact)) return null;
  try {
    const binary = atob(compact);
    if (!binary.length || binary.length > maxBytes) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

