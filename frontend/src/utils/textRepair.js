const SUSPICIOUS_SEQUENCES = [
  "\u00c3",
  "\u00c2",
  "\u00c4",
  "\u00c5",
  "\u00c6",
  "\u0102",
  "\u00e2\u20ac",
  "\u00e2\u201a",
  "\u00f0\u0178",
  "\u00ef\u00b8",
];

const VIETNAMESE_CHAR_PATTERN =
  /[\u0103\u00e2\u0111\u00ea\u00f4\u01a1\u01b0\u0102\u00c2\u0110\u00ca\u00d4\u01a0\u01af\u00e1\u00e0\u1ea3\u00e3\u1ea1\u1eaf\u1eb1\u1eb3\u1eb5\u1eb7\u1ea5\u1ea7\u1ea9\u1eab\u1ead\u00e9\u00e8\u1ebb\u1ebd\u1eb9\u1ebf\u1ec1\u1ec3\u1ec5\u1ec7\u00ed\u00ec\u1ec9\u0129\u1ecb\u00f3\u00f2\u1ecf\u00f5\u1ecd\u1ed1\u1ed3\u1ed5\u1ed7\u1ed9\u1edb\u1edd\u1edf\u1ee1\u1ee3\u00fa\u00f9\u1ee7\u0169\u1ee5\u1ee9\u1eeb\u1eed\u1eef\u1ef1\u00fd\u1ef3\u1ef7\u1ef9\u1ef5]/g;

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

function getVietnameseScore(value) {
  return (String(value || "").match(VIETNAMESE_CHAR_PATTERN) || []).length;
}

function normalizeDecodedText(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function scoreCandidate(value) {
  const text = String(value || "");
  return (
    getVietnameseScore(text) * 3 -
    getSuspiciousSequenceCount(text) * 6 -
    getReplacementCharCount(text) * 8 -
    getControlCharCount(text) * 10
  );
}

function decodeBytesAsText(value, encoding) {
  const bytes = Uint8Array.from(
    Array.from(String(value || ""), (char) => char.codePointAt(0) & 0xff),
  );

  return normalizeDecodedText(
    new TextDecoder(encoding, { fatal: false }).decode(bytes),
  );
}

export function repairMojibakeText(value) {
  if (typeof value !== "string" || !value) {
    return value || "";
  }

  const original = normalizeDecodedText(value);
  if (!original) {
    return "";
  }

  const originalScore = scoreCandidate(original);
  if (originalScore >= 0 && getSuspiciousSequenceCount(original) === 0) {
    return original;
  }

  const candidates = new Set([original]);
  let frontier = [original];

  for (let pass = 0; pass < 3; pass += 1) {
    const nextFrontier = [];

    frontier.forEach((currentValue) => {
      ["utf-8", "windows-1252"].forEach((encoding) => {
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

  return scoreCandidate(bestCandidate) >= originalScore ? bestCandidate : original;
}

export function prepareTextForSpeech(value) {
  const repairedText = repairMojibakeText(value);

  return repairedText
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[_*#~`^=<>[\]{}|\\]+/g, " ")
    .replace(/[\u2022\u00B7\u25AA\u25AB\u25E6]/g, ", ")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2026/g, "...")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\s*([,.;!?])/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}
