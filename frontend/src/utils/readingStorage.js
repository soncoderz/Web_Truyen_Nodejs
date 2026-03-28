export function getReadChaptersStorageKey(userId) {
  return `readChapters:${userId || "guest"}`;
}

export function getReadChapters(userId) {
  try {
    return JSON.parse(localStorage.getItem(getReadChaptersStorageKey(userId)) || "[]");
  } catch {
    return [];
  }
}

export function markChapterAsRead(userId, chapterId) {
  if (!chapterId) {
    return;
  }

  const current = getReadChapters(userId);
  if (current.includes(chapterId)) {
    return;
  }

  localStorage.setItem(
    getReadChaptersStorageKey(userId),
    JSON.stringify([...current, chapterId]),
  );
}
