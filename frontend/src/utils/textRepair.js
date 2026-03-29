const SUSPICIOUS_MOJIBAKE_PATTERN =
  /(Ã.|Â.|Ä.|Å.|Æ.|Ă.|â€|â€¦|ðŸ|ï¸|ï¿½|�|â€™|â€œ|â€|â€“|â€”)/;
const VIETNAMESE_CHAR_PATTERN =
  /[ăâđêôơưĂÂĐÊÔƠƯáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/g;

function getMojibakePenalty(value) {
  return (String(value || '').match(/(Ã.|Â.|Ä.|Å.|Æ.|Ă.|â€|â€¦|ðŸ|ï¸|ï¿½|�|â€™|â€œ|â€|â€“|â€”)/g) || [])
    .length;
}

function getVietnameseScore(value) {
  return (String(value || '').match(VIETNAMESE_CHAR_PATTERN) || []).length;
}

function normalizeDecodedText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\uFEFF]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function scoreCandidate(value) {
  const normalizedValue = String(value || '');
  return (
    getVietnameseScore(normalizedValue) * 3 -
    getMojibakePenalty(normalizedValue) * 6 -
    ((normalizedValue.match(/[�]/g) || []).length * 8) -
    ((normalizedValue.match(/[\u0080-\u009f]/g) || []).length * 2)
  );
}

function decodeBytesAsText(value, encoding) {
  const bytes = Uint8Array.from(
    Array.from(String(value || ''), (char) => char.charCodeAt(0) & 0xff),
  );
  return normalizeDecodedText(
    new TextDecoder(encoding, { fatal: false }).decode(bytes),
  );
}

export function repairMojibakeText(value) {
  if (typeof value !== 'string' || !value) {
    return value || '';
  }

  const original = normalizeDecodedText(value);
  if (!original) {
    return '';
  }

  if (!SUSPICIOUS_MOJIBAKE_PATTERN.test(original)) {
    return original;
  }

  const candidates = new Set([original]);
  let frontier = [original];

  for (let pass = 0; pass < 2; pass += 1) {
    const nextFrontier = [];

    frontier.forEach((currentValue) => {
      ['utf-8', 'windows-1252'].forEach((encoding) => {
        try {
          const decoded = decodeBytesAsText(currentValue, encoding);
          if (decoded && !candidates.has(decoded)) {
            candidates.add(decoded);
            nextFrontier.push(decoded);
          }
        } catch {
          // Ignore invalid decode attempts.
        }
      });
    });

    if (!nextFrontier.length) {
      break;
    }

    frontier = nextFrontier;
  }

  const rankedCandidates = Array.from(candidates).sort(
    (left, right) => scoreCandidate(right) - scoreCandidate(left),
  );
  const bestCandidate = rankedCandidates[0] || original;

  return scoreCandidate(bestCandidate) >= scoreCandidate(original)
    ? bestCandidate
    : original;
}

export function prepareTextForSpeech(value) {
  const repairedText = repairMojibakeText(value);

  return repairedText
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[_*#~`^=<>[\]{}|\\]+/g, ' ')
    .replace(/[•·▪▫◦]/g, ', ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s*([,.;!?])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}
