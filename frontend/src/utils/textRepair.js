const SUSPICIOUS_SEQUENCES = [
  "\u00C3",
  "\u00C2",
  "\u00C4",
  "\u00C6",
  "\u00D0",
  "\u00D1",
  "\u00E2\u20AC",
  "\u00E2\u201A",
  "\u00E1\u00BB",
  "\u00E1\u00BA",
  "\u00E1\u00BC",
  "\u00E1\u00BD",
  "\u00F0\u0178",
  "\u00EF\u00B8",
];

function countOccurrences(value, token) {
  if (!value || !token) {
    return 0;
  }

  let count = 0;
  let searchIndex = 0;

  while (searchIndex < value.length) {
    const matchIndex = value.indexOf(token, searchIndex);
    if (matchIndex === -1) {
      break;
    }

    count += 1;
    searchIndex = matchIndex + token.length;
  }

  return count;
}

function getSuspiciousSequenceCount(value) {
  return SUSPICIOUS_SEQUENCES.reduce(
    (total, token) => total + countOccurrences(value, token),
    0,
  );
}

function getReplacementCharCount(value) {
  return countOccurrences(value, "\uFFFD");
}

function getControlCharCount(value) {
  const matches = String(value || "").match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g);
  return matches ? matches.length : 0;
}

function getRepairPenalty(value) {
  const text = String(value || "");
  return (
    getSuspiciousSequenceCount(text) * 6 +
    getReplacementCharCount(text) * 8 +
    getControlCharCount(text) * 10
  );
}

function decodeLatin1AsUtf8(value) {
  const bytes = Uint8Array.from(
    Array.from(String(value || ""), (char) => char.codePointAt(0) & 0xff),
  );

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function repairMojibakeText(value) {
  if (typeof value !== "string" || !value) {
    return value || "";
  }

  let current = value;
  let currentPenalty = getRepairPenalty(current);

  // Keep already-correct Vietnamese text untouched.
  if (currentPenalty === 0) {
    return current;
  }

  for (let pass = 0; pass < 3; pass += 1) {
    let decoded;

    try {
      decoded = decodeLatin1AsUtf8(current);
    } catch {
      break;
    }

    if (!decoded || decoded === current) {
      break;
    }

    const decodedPenalty = getRepairPenalty(decoded);
    const currentSuspiciousCount = getSuspiciousSequenceCount(current);
    const decodedSuspiciousCount = getSuspiciousSequenceCount(decoded);

    if (decodedPenalty > currentPenalty) {
      break;
    }

    if (
      decodedPenalty === currentPenalty &&
      decodedSuspiciousCount >= currentSuspiciousCount
    ) {
      break;
    }

    current = decoded;
    currentPenalty = decodedPenalty;

    if (currentPenalty === 0) {
      break;
    }
  }

  return current;
}
