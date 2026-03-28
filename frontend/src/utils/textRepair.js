const MOJIBAKE_PATTERN = /(Ã.|Â.|Ä.|Æ.|á.|â.|ðŸ|ï¸|€™|€œ|â€”|â€“)/;

function getMojibakeScore(value) {
  return (String(value || '').match(/(Ã.|Â.|Ä.|Æ.|á.|â.|ðŸ|ï¸)/g) || []).length;
}

export function repairMojibakeText(value) {
  if (typeof value !== 'string' || !value) {
    return value || '';
  }

  let current = value;

  for (let pass = 0; pass < 2; pass += 1) {
    if (!MOJIBAKE_PATTERN.test(current)) {
      break;
    }

    try {
      const bytes = Uint8Array.from(Array.from(current, (char) => char.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

      if (!decoded || decoded === current) {
        break;
      }

      const currentScore = getMojibakeScore(current);
      const decodedScore = getMojibakeScore(decoded);

      if (decoded.includes('�') && decodedScore >= currentScore) {
        break;
      }

      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}
