import { useCallback, useEffect, useMemo, useState } from 'react';
import { addBookmark, deleteBookmark, getBookmarks } from '../services/api';

const makeBookmarkKey = (
  storyId,
  chapterId = null,
  pageIndex = null,
  paragraphIndex = null,
) => `${storyId || ''}::${chapterId || ''}::${pageIndex ?? ''}::${paragraphIndex ?? ''}`;

const getLocationFromNote = (note) => {
  const normalizedNote = note?.trim();
  if (!normalizedNote) {
    return { pageIndex: null, paragraphIndex: null };
  }

  const pageMatch = normalizedNote.match(/^Trang\s+(\d+)$/i);
  if (pageMatch) {
    return {
      pageIndex: Math.max(Number.parseInt(pageMatch[1], 10) - 1, 0),
      paragraphIndex: null,
    };
  }

  const paragraphMatch = normalizedNote.match(/^(?:Doan|Đoạn)\s+(\d+)$/i);
  if (paragraphMatch) {
    return {
      pageIndex: null,
      paragraphIndex: Math.max(Number.parseInt(paragraphMatch[1], 10) - 1, 0),
    };
  }

  return { pageIndex: null, paragraphIndex: null };
};

const getBookmarkLocation = (bookmark) => {
  if (typeof bookmark?.pageIndex === 'number' || typeof bookmark?.paragraphIndex === 'number') {
    return {
      pageIndex: typeof bookmark?.pageIndex === 'number' ? bookmark.pageIndex : null,
      paragraphIndex:
        typeof bookmark?.paragraphIndex === 'number' ? bookmark.paragraphIndex : null,
    };
  }

  return getLocationFromNote(bookmark?.note);
};

const hasBookmarkLocation = (bookmark) =>
  typeof getBookmarkLocation(bookmark).pageIndex === 'number' ||
  typeof getBookmarkLocation(bookmark).paragraphIndex === 'number';

const compareBookmarks = (left, right) => {
  const leftHasLocation = hasBookmarkLocation(left);
  const rightHasLocation = hasBookmarkLocation(right);

  if (leftHasLocation !== rightHasLocation) {
    return leftHasLocation ? -1 : 1;
  }

  const leftHasChapter = Boolean(left?.chapterId);
  const rightHasChapter = Boolean(right?.chapterId);
  if (leftHasChapter !== rightHasChapter) {
    return leftHasChapter ? -1 : 1;
  }

  const leftCreatedAt = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
  const rightCreatedAt = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
  return rightCreatedAt - leftCreatedAt;
};

const pickStoryBookmark = (bookmarks, storyId) =>
  bookmarks
    .filter((bookmark) => bookmark.storyId === storyId)
    .sort(compareBookmarks)[0] || null;

export default function useBookmarks(user) {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingKeys, setProcessingKeys] = useState([]);

  const refreshBookmarks = useCallback(async () => {
    if (!user) {
      setBookmarks([]);
      return [];
    }

    setLoading(true);
    try {
      const response = await getBookmarks();
      const nextBookmarks = Array.isArray(response.data) ? response.data : [];
      setBookmarks(nextBookmarks);
      return nextBookmarks;
    } catch (error) {
      console.error(error);
      setBookmarks([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshBookmarks();
  }, [refreshBookmarks]);

  const bookmarkMap = useMemo(() => {
      const map = new Map();
      bookmarks.forEach((bookmark) => {
      const key = makeBookmarkKey(
        bookmark.storyId,
        bookmark.chapterId,
        bookmark.pageIndex,
        bookmark.paragraphIndex,
      );
        if (!map.has(key)) {
          map.set(key, bookmark);
        }
    });
    return map;
  }, [bookmarks]);

  const isBookmarked = useCallback(
    (storyId, chapterId = null, pageIndex = null, paragraphIndex = null) =>
      bookmarkMap.has(makeBookmarkKey(storyId, chapterId, pageIndex, paragraphIndex)),
    [bookmarkMap],
  );

  const isProcessing = useCallback(
    (storyId, chapterId = null, pageIndex = null, paragraphIndex = null) =>
      processingKeys.includes(
        makeBookmarkKey(storyId, chapterId, pageIndex, paragraphIndex),
      ),
    [processingKeys],
  );

  const getStoryBookmark = useCallback(
    (storyId) => pickStoryBookmark(bookmarks, storyId),
    [bookmarks],
  );

  const getBookmark = useCallback(
    (storyId, chapterId = null, pageIndex = null, paragraphIndex = null) =>
      bookmarkMap.get(makeBookmarkKey(storyId, chapterId, pageIndex, paragraphIndex)) || null,
    [bookmarkMap],
  );

  const saveBookmark = useCallback(
    async ({
      storyId,
      chapterId = null,
      pageIndex = null,
      paragraphIndex = null,
      textSnippet = null,
      note = null,
    }) => {
      if (!user) {
        return { requiresAuth: true, bookmarked: false };
      }

      const key = makeBookmarkKey(storyId, chapterId, pageIndex, paragraphIndex);
      setProcessingKeys((prev) => [...prev, key]);

      try {
        const response = await addBookmark({
          storyId,
          chapterId,
          pageIndex,
          paragraphIndex,
          textSnippet,
          note,
        });
        const savedBookmark = response.data;
        setBookmarks((prev) => [
          savedBookmark,
          ...prev.filter((bookmark) => bookmark.storyId !== storyId),
        ]);
        return {
          requiresAuth: false,
          bookmarked: true,
          bookmark: savedBookmark,
        };
      } catch (error) {
        console.error(error);
        throw error;
      } finally {
        setProcessingKeys((prev) => prev.filter((value) => value !== key));
      }
    },
    [user],
  );

  const removeBookmark = useCallback(
    async ({ storyId, chapterId = null, pageIndex = null, paragraphIndex = null }) => {
      if (!user) {
        return { requiresAuth: true, removed: false };
      }

      const key = makeBookmarkKey(storyId, chapterId, pageIndex, paragraphIndex);
      setProcessingKeys((prev) => [...prev, key]);

      try {
        const existingBookmark =
          bookmarkMap.get(key) ||
          bookmarks.find((bookmark) => bookmark.storyId === storyId) ||
          null;

        if (!existingBookmark) {
          return { requiresAuth: false, removed: false };
        }

        await deleteBookmark(existingBookmark.id);
        setBookmarks((prev) => prev.filter((bookmark) => bookmark.storyId !== storyId));
        return { requiresAuth: false, removed: true };
      } catch (error) {
        console.error(error);
        throw error;
      } finally {
        setProcessingKeys((prev) => prev.filter((value) => value !== key));
      }
    },
    [bookmarkMap, bookmarks, user],
  );

  const toggleBookmark = useCallback(
    async ({
      storyId,
      chapterId = null,
      pageIndex = null,
      paragraphIndex = null,
      textSnippet = null,
      note = null,
    }) => {
      if (!user) {
        return { requiresAuth: true, bookmarked: false };
      }

      const key = makeBookmarkKey(storyId, chapterId, pageIndex, paragraphIndex);
      setProcessingKeys((prev) => [...prev, key]);

      try {
        const existingBookmark = bookmarkMap.get(key);

        if (existingBookmark) {
          await deleteBookmark(existingBookmark.id);
          setBookmarks((prev) =>
            prev.filter((bookmark) => bookmark.storyId !== storyId),
          );
          return { requiresAuth: false, bookmarked: false };
        }

        const response = await addBookmark({
          storyId,
          chapterId,
          pageIndex,
          paragraphIndex,
          textSnippet,
          note,
        });
        const savedBookmark = response.data;
        setBookmarks((prev) => [
          savedBookmark,
          ...prev.filter((bookmark) => bookmark.storyId !== storyId),
        ]);
        return {
          requiresAuth: false,
          bookmarked: true,
          bookmark: savedBookmark,
        };
      } catch (error) {
        console.error(error);
        throw error;
      } finally {
        setProcessingKeys((prev) => prev.filter((value) => value !== key));
      }
    },
    [bookmarkMap, user],
  );

  return {
    bookmarks,
    loading,
    refreshBookmarks,
    getStoryBookmark,
    getBookmark,
    isBookmarked,
    isProcessing,
    saveBookmark,
    removeBookmark,
    toggleBookmark,
  };
}

export { getBookmarkLocation, makeBookmarkKey };
