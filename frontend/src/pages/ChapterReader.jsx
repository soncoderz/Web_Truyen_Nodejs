import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import BookmarkIcon from '../components/BookmarkIcon';
import CommentThread from '../components/CommentThread';
import ReactionBar from '../components/ReactionBar';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import useReactionSummaries from '../hooks/useReactionSummaries';
import useBookmarks, { getBookmarkLocation } from '../hooks/useBookmarks';
import { markChapterAsRead } from '../utils/readingStorage';
import { prepareTextForSpeech, repairMojibakeText } from '../utils/textRepair';
import {
  REALTIME_EVENTS,
  subscribeChapterPresence,
  subscribeCommentTargets,
  unsubscribeChapterPresence,
  unsubscribeCommentTargets,
} from '../services/realtime';
import {
  createComment,
  deleteComment,
  deleteReaderNote,
  getChapter,
  getChaptersByStory,
  getCommentThreadByChapter,
  getCommentsByPage,
  getReaderNotesByChapter,
  getReadingHistoryByStory,
  getStory,
  saveReaderNote,
  saveReadingHistory,
} from '../services/api';
import { toast, toastFromError } from '../services/toast';
import {
  buildChapterReactionTarget,
  buildMangaPageReactionTarget,
} from '../utils/reactions';

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY || '';
const READER_TTS_SETTINGS_KEY = 'reader-tts-settings';
const TTS_LANGUAGE_MODES = {
  auto: 'AUTO',
  vietnamese: 'VI',
  english: 'EN',
};
const VIETNAMESE_TTS_CHAR_PATTERN =
  /[ăâđêôơưĂÂĐÊÔƠƯáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/g;
const ENGLISH_TTS_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'he',
  'her',
  'his',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'she',
  'that',
  'the',
  'their',
  'there',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'with',
  'you',
  'your',
]);

function splitChapterContentIntoParagraphs(content) {
  if (!content) {
    return [];
  }

  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length > 0) {
    return blocks;
  }

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildParagraphSnippet(paragraph) {
  const normalized = (paragraph || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 140)}...`;
}

function getStoredTtsSettings() {
  if (typeof window === 'undefined') {
    return {
      languageMode: TTS_LANGUAGE_MODES.auto,
      vietnameseVoiceURI: '',
      englishVoiceURI: '',
      rate: 0.95,
      pitch: 1,
    };
  }

  try {
    const raw = window.localStorage.getItem(READER_TTS_SETTINGS_KEY);
    if (!raw) {
      return {
        languageMode: TTS_LANGUAGE_MODES.auto,
        vietnameseVoiceURI: '',
        englishVoiceURI: '',
        rate: 0.95,
        pitch: 1,
      };
    }

    const parsed = JSON.parse(raw);
    const legacyVoiceURI = typeof parsed?.voiceURI === 'string' ? parsed.voiceURI : '';
    const nextLanguageMode = String(parsed?.languageMode || TTS_LANGUAGE_MODES.auto).toUpperCase();
    return {
      languageMode: Object.values(TTS_LANGUAGE_MODES).includes(nextLanguageMode)
        ? nextLanguageMode
        : TTS_LANGUAGE_MODES.auto,
      vietnameseVoiceURI:
        typeof parsed?.vietnameseVoiceURI === 'string'
          ? parsed.vietnameseVoiceURI
          : legacyVoiceURI,
      englishVoiceURI:
        typeof parsed?.englishVoiceURI === 'string'
          ? parsed.englishVoiceURI
          : '',
      rate: Number.isFinite(Number(parsed?.rate)) ? Number(parsed.rate) : 0.95,
      pitch: Number.isFinite(Number(parsed?.pitch)) ? Number(parsed.pitch) : 1,
    };
  } catch {
    return {
      languageMode: TTS_LANGUAGE_MODES.auto,
      vietnameseVoiceURI: '',
      englishVoiceURI: '',
      rate: 0.95,
      pitch: 1,
    };
  }
}

function splitSpeechTextIntoChunks(text, maxLength = 360) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const chunks = [];
  const sentenceParts = normalized
    .split(/(?<=[.!?;:…])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!sentenceParts.length) {
    return [normalized];
  }

  let currentChunk = '';

  const pushChunk = () => {
    const nextChunk = currentChunk.trim();
    if (nextChunk) {
      chunks.push(nextChunk);
    }
    currentChunk = '';
  };

  sentenceParts.forEach((part) => {
    if (part.length > maxLength) {
      pushChunk();

      const words = part.split(/\s+/).filter(Boolean);
      let longChunk = '';
      words.forEach((word) => {
        const candidate = longChunk ? `${longChunk} ${word}` : word;
        if (candidate.length > maxLength) {
          if (longChunk) {
            chunks.push(longChunk);
          }
          longChunk = word;
        } else {
          longChunk = candidate;
        }
      });
      if (longChunk) {
        chunks.push(longChunk);
      }
      return;
    }

    const candidate = currentChunk ? `${currentChunk} ${part}` : part;
    if (candidate.length > maxLength) {
      pushChunk();
      currentChunk = part;
    } else {
      currentChunk = candidate;
    }
  });

  pushChunk();
  return chunks.length ? chunks : [normalized];
}

function getVietnameseCharCount(value) {
  return (String(value || '').match(VIETNAMESE_TTS_CHAR_PATTERN) || []).length;
}

function getEnglishSignalScore(value) {
  const normalizedValue = String(value || '');
  const englishWords = normalizedValue.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
  if (!englishWords.length) {
    return 0;
  }

  const stopWordCount = englishWords.filter((word) => ENGLISH_TTS_STOP_WORDS.has(word)).length;
  const alphaCount = (normalizedValue.match(/[A-Za-z]/g) || []).length;
  const nonSpaceCount = normalizedValue.replace(/\s+/g, '').length || 1;
  const asciiRatio = alphaCount / nonSpaceCount;

  return (
    stopWordCount * 3 +
    englishWords.length +
    (asciiRatio >= 0.6 ? 2 : 0) +
    (asciiRatio >= 0.8 ? 1 : 0)
  );
}

function detectSpeechLanguage(text, languageMode = TTS_LANGUAGE_MODES.auto) {
  if (languageMode === TTS_LANGUAGE_MODES.vietnamese) {
    return 'vi-VN';
  }

  if (languageMode === TTS_LANGUAGE_MODES.english) {
    return 'en-US';
  }

  const normalized = String(text || '').trim();
  if (!normalized) {
    return 'vi-VN';
  }

  if (getVietnameseCharCount(normalized) > 0) {
    return 'vi-VN';
  }

  const englishWords = normalized.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
  const stopWordCount = englishWords.filter((word) => ENGLISH_TTS_STOP_WORDS.has(word)).length;
  const asciiLetterCount = (normalized.match(/[A-Za-z]/g) || []).length;
  const asciiRatio = asciiLetterCount / (normalized.replace(/\s+/g, '').length || 1);

  if (
    (stopWordCount >= 1 && englishWords.length >= 2 && asciiRatio >= 0.55) ||
    (englishWords.length >= 3 && asciiRatio >= 0.72) ||
    getEnglishSignalScore(normalized) >= 6
  ) {
    return 'en-US';
  }

  return 'vi-VN';
}

function buildSpeechQueue(paragraphs, startParagraphIndex = 0, languageMode = TTS_LANGUAGE_MODES.auto) {
  return (Array.isArray(paragraphs) ? paragraphs : [])
    .slice(startParagraphIndex)
    .flatMap((paragraph, offset) => {
      const preparedParagraph = prepareTextForSpeech(paragraph);
      return splitSpeechTextIntoChunks(preparedParagraph).map((chunk) => ({
        paragraphIndex: startParagraphIndex + offset,
        text: chunk,
        language: detectSpeechLanguage(chunk, languageMode),
      }));
    });
}

function isVietnameseVoice(voice) {
  const voiceName = String(voice?.name || '');
  const voiceLang = String(voice?.lang || '');
  return /^vi[-_]/i.test(voiceLang) || /vietnam/i.test(voiceName);
}

function isEnglishVoice(voice) {
  const voiceName = String(voice?.name || '');
  const voiceLang = String(voice?.lang || '');
  return /^en[-_]/i.test(voiceLang) || /english|united states|united kingdom|australia|canada/i.test(voiceName);
}

function compareVoicePriority(leftVoice, rightVoice, language = 'vi-VN') {
  const leftName = String(leftVoice?.name || '').toLowerCase();
  const rightName = String(rightVoice?.name || '').toLowerCase();

  const scoreVoice = (voiceName, voice) => {
    let score = 0;
    if (voiceName.includes('natural')) score += 6;
    if (voiceName.includes('online')) score += 4;
    if (voiceName.includes('microsoft')) score += 3;
    if (voice?.default) score += 2;

    if (/^vi/i.test(language)) {
      if (voiceName.includes('hoaimy')) score += 2;
      if (voiceName.includes('namminh')) score += 2;
    }

    if (/^en/i.test(language)) {
      if (voiceName.includes('aria')) score += 2;
      if (voiceName.includes('jenny')) score += 2;
      if (voiceName.includes('guy')) score += 2;
      if (voiceName.includes('davis')) score += 2;
      if (voiceName.includes('zira')) score += 2;
      if (voiceName.includes('samantha')) score += 2;
    }

    return score;
  };

  return scoreVoice(rightName, rightVoice) - scoreVoice(leftName, leftVoice);
}

function getVoicesForLanguage(voices, language = 'vi-VN') {
  const safeVoices = Array.isArray(voices) ? voices : [];
  const matcher = /^en/i.test(language) ? isEnglishVoice : isVietnameseVoice;
  return safeVoices
    .filter(matcher)
    .sort((leftVoice, rightVoice) => compareVoicePriority(leftVoice, rightVoice, language));
}

function pickPreferredVoice(voices, preferredVoiceURI = '', language = 'vi-VN') {
  const safeVoices = Array.isArray(voices) ? voices : [];
  if (!safeVoices.length) {
    return null;
  }

  const selectableVoices = getVoicesForLanguage(safeVoices, language);
  if (!selectableVoices.length) {
    return null;
  }

  const normalizedPreferredVoiceURI = String(preferredVoiceURI || '').trim();
  if (normalizedPreferredVoiceURI) {
    const matchedVoice = selectableVoices.find(
      (voice) => String(voice?.voiceURI || '') === normalizedPreferredVoiceURI,
    );
    if (matchedVoice) {
      return matchedVoice;
    }
  }

  return selectableVoices[0] || null;
}

function normalizeReadingNote(note) {
  if (typeof note !== 'string') {
    return '';
  }

  return note.replace(/\r\n/g, '\n').trim();
}

function formatDisplayText(value) {
  const repaired = repairMojibakeText(value || '');
  if (typeof repaired !== 'string' || !repaired) {
    return repaired || '';
  }

  try {
    return repaired.normalize('NFC');
  } catch {
    return repaired;
  }
}

function getBookmarkDisplayNote(note, fallbackLabel = '') {
  const normalizedNote = normalizeReadingNote(note);
  if (!normalizedNote) {
    return '';
  }

  if (fallbackLabel && normalizedNote.localeCompare(fallbackLabel, undefined, { sensitivity: 'accent' }) === 0) {
    return '';
  }

  if (/^(?:Trang|Doan|Đoạn)\s+\d+$/i.test(normalizedNote)) {
    return '';
  }

  return normalizedNote;
}

function prependComment(list, comment) {
  if (!comment?.id) {
    return Array.isArray(list) ? list : [];
  }

  const nextList = (Array.isArray(list) ? list : []).filter(
    (item) => String(item?.id || '') !== String(comment.id),
  );
  return [comment, ...nextList];
}

function removeComment(list, commentId) {
  return (Array.isArray(list) ? list : []).filter(
    (item) => String(item?.id || '') !== String(commentId || ''),
  );
}

function getVisibleThreadComments(list, visibleCount) {
  const comments = Array.isArray(list) ? list : [];
  if (!comments.length) {
    return [];
  }

  const childrenByParentId = new Map();
  const commentIds = new Set(comments.map((comment) => String(comment?.id || '')));

  comments.forEach((comment) => {
    const parentId = String(comment?.parentCommentId || '').trim();
    if (!parentId || !commentIds.has(parentId)) {
      return;
    }

    if (!childrenByParentId.has(parentId)) {
      childrenByParentId.set(parentId, []);
    }
    childrenByParentId.get(parentId).push(String(comment.id));
  });

  const rootIds = comments
    .filter((comment) => {
      const parentId = String(comment?.parentCommentId || '').trim();
      return !parentId || !commentIds.has(parentId);
    })
    .slice(0, visibleCount)
    .map((comment) => String(comment.id));

  const visibleIds = new Set();
  const queue = [...rootIds];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visibleIds.has(currentId)) {
      continue;
    }

    visibleIds.add(currentId);
    queue.push(...(childrenByParentId.get(currentId) || []));
  }

  return comments.filter((comment) => visibleIds.has(String(comment?.id || '')));
}

function getRequiredVisibleRootCount(list, targetCommentId) {
  const comments = Array.isArray(list) ? list : [];
  const normalizedTargetCommentId = String(targetCommentId || '').trim();
  if (!normalizedTargetCommentId || !comments.length) {
    return 0;
  }

  const commentMap = new Map(
    comments.map((comment) => [String(comment?.id || ''), comment]),
  );
  if (!commentMap.has(normalizedTargetCommentId)) {
    return 0;
  }

  const rootIds = comments
    .filter((comment) => {
      const parentId = String(comment?.parentCommentId || '').trim();
      return !parentId || !commentMap.has(parentId);
    })
    .map((comment) => String(comment.id));

  let rootCommentId = normalizedTargetCommentId;
  let guard = 0;

  while (commentMap.has(rootCommentId) && guard < comments.length) {
    const parentId = String(commentMap.get(rootCommentId)?.parentCommentId || '').trim();
    if (!parentId || !commentMap.has(parentId)) {
      break;
    }
    rootCommentId = parentId;
    guard += 1;
  }

  const rootIndex = rootIds.indexOf(rootCommentId);
  return rootIndex >= 0 ? rootIndex + 1 : 0;
}

function isTypingTarget(target) {
  if (!target || typeof target.closest !== 'function') {
    return false;
  }

  const tagName = String(target.tagName || '').toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  return Boolean(target.closest('[contenteditable="true"]'));
}

function MangaPageWithComments({
  page,
  idx,
  storyId,
  chapterId,
  user,
  pageRef,
  reactionSummary = null,
  reactionLoading = false,
  bookmarkItem = null,
  noteItem = null,
  bookmarked = false,
  bookmarkBusy = false,
  noteBusy = false,
  initialComments = [],
  initialOpen = false,
  targetCommentId = '',
  showBookmarkToggle = true,
  showCommentToggle = true,
  onPageCommentsChange,
  onSaveBookmark,
  onRemoveBookmark,
  onSaveNote,
  onDeleteNote,
  onReact,
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [text, setText] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [commentCount, setCommentCount] = useState(initialComments.length);
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const btnRef = useRef(null);
  const bookmarkBtnRef = useRef(null);
  const bookmarkPanelRef = useRef(null);
  const autoOpenedTargetRef = useRef('');
  const bookmarkLabel = `Trang ${idx + 1}`;
  const savedPageNote = getBookmarkDisplayNote(noteItem?.note, bookmarkLabel);
  const fallbackBookmarkNote = getBookmarkDisplayNote(bookmarkItem?.note, bookmarkLabel);
  const noteText = savedPageNote || fallbackBookmarkNote;
  const noteFromBookmarkFallback = !savedPageNote && Boolean(fallbackBookmarkNote);
  const hasPageNote = Boolean(noteText);
  const busy = bookmarkBusy || noteBusy;
  const accessToken = user?.accessToken || user?.token || null;
  const focusedCommentIdRef = useRef('');

  useEffect(() => {
    setCommentCount(initialComments.length);
    if (!open) {
      setComments(initialComments);
    }
  }, [initialComments, open]);

  useEffect(() => {
    if (!replyTarget?.id) {
      return;
    }

    if (!comments.some((comment) => String(comment?.id || '') === String(replyTarget.id))) {
      setReplyTarget(null);
    }
  }, [comments, replyTarget]);

  useEffect(() => {
    if (!showCommentToggle) {
      setOpen(false);
    }
  }, [showCommentToggle]);

  useEffect(() => {
    if (!initialOpen || !showCommentToggle) {
      return;
    }

    const autoOpenKey = `${chapterId || ''}:${idx}:${String(targetCommentId || 'open')}`;
    if (autoOpenedTargetRef.current === autoOpenKey) {
      return;
    }

    autoOpenedTargetRef.current = autoOpenKey;
    setOpen(true);
    loadPageComments();
  }, [chapterId, idx, initialOpen, showCommentToggle, targetCommentId]);

  useEffect(() => {
    if (!showBookmarkToggle) {
      setBookmarkOpen(false);
    }
  }, [showBookmarkToggle]);

  useEffect(() => {
    if (!bookmarkOpen) {
      setNoteDraft(noteText);
    }
  }, [noteText, bookmarkOpen]);

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 120);
    const handleClickOutside = (event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        btnRef.current &&
        !btnRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !targetCommentId) {
      focusedCommentIdRef.current = '';
      setHighlightedCommentId('');
      return undefined;
    }

    if (!comments.some((comment) => String(comment?.id || '') === String(targetCommentId))) {
      focusedCommentIdRef.current = '';
      return undefined;
    }

    if (focusedCommentIdRef.current === String(targetCommentId)) {
      return undefined;
    }

    let highlightTimerId = null;
    let retryTimerId = null;

    const focusTargetComment = () => {
      const targetNode = document.getElementById(
        `page-comment-${chapterId}-${idx}-${targetCommentId}`,
      );
      if (!targetNode) {
        return false;
      }

      targetNode.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      focusedCommentIdRef.current = String(targetCommentId);
      setHighlightedCommentId(String(targetCommentId));
      highlightTimerId = window.setTimeout(() => {
        setHighlightedCommentId((currentValue) =>
          currentValue === String(targetCommentId) ? '' : currentValue,
        );
      }, 2600);
      return true;
    };

    const animationFrameId = window.requestAnimationFrame(() => {
      if (focusTargetComment()) {
        return;
      }

      retryTimerId = window.setTimeout(() => {
        focusTargetComment();
      }, 260);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      if (retryTimerId) {
        window.clearTimeout(retryTimerId);
      }
      if (highlightTimerId) {
        window.clearTimeout(highlightTimerId);
      }
    };
  }, [chapterId, comments, idx, open, targetCommentId]);

  useEffect(() => {
    if (!bookmarkOpen) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (
        bookmarkPanelRef.current &&
        !bookmarkPanelRef.current.contains(event.target) &&
        bookmarkBtnRef.current &&
        !bookmarkBtnRef.current.contains(event.target)
      ) {
        setBookmarkOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [bookmarkOpen]);

  const loadPageComments = async () => {
    setLoading(true);
    try {
      const res = await getCommentsByPage(chapterId, idx);
      const nextComments = res.data || [];
      setComments(nextComments);
      setCommentCount(nextComments.length);
      onPageCommentsChange?.(idx, nextComments);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open || !showCommentToggle || !chapterId) {
      return undefined;
    }

    const target = { scope: 'PAGE', chapterId, pageIndex: idx };
    const socket = subscribeCommentTargets(target, accessToken);
    if (!socket) {
      return undefined;
    }

    const handleCommentCreated = (payload) => {
      if (
        String(payload?.scope || '').toUpperCase() !== 'PAGE' ||
        String(payload?.chapterId || '') !== String(chapterId) ||
        Number(payload?.pageIndex) !== Number(idx) ||
        !payload?.comment
      ) {
        return;
      }

      setComments((prev) => {
        const nextComments = prependComment(prev, payload.comment);
        setCommentCount(nextComments.length);
        onPageCommentsChange?.(idx, nextComments);
        return nextComments;
      });
    };

    const handleCommentDeleted = (payload) => {
      if (
        String(payload?.scope || '').toUpperCase() !== 'PAGE' ||
        String(payload?.chapterId || '') !== String(chapterId) ||
        Number(payload?.pageIndex) !== Number(idx) ||
        !payload?.commentId
      ) {
        return;
      }

      setComments((prev) => {
        const nextComments = removeComment(prev, payload.commentId);
        setCommentCount(nextComments.length);
        onPageCommentsChange?.(idx, nextComments);
        return nextComments;
      });
    };

    socket.on(REALTIME_EVENTS.commentCreated, handleCommentCreated);
    socket.on(REALTIME_EVENTS.commentDeleted, handleCommentDeleted);

    return () => {
      socket.off(REALTIME_EVENTS.commentCreated, handleCommentCreated);
      socket.off(REALTIME_EVENTS.commentDeleted, handleCommentDeleted);
      unsubscribeCommentTargets(target);
    };
  }, [accessToken, chapterId, idx, onPageCommentsChange, open, showCommentToggle]);

  const togglePanel = (event) => {
    if (!showCommentToggle) return;
    event?.stopPropagation();
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      loadPageComments();
    }
  };

  const submitPageComment = async () => {
    if (!user) return alert('Vui lòng đăng nhập để bình luận!');
    if (!text.trim()) return;
    let createdComment = null;
    try {
      setSending(true);
      const response = await createComment({
        storyId,
        chapterId,
        pageIndex: idx,
        parentCommentId: replyTarget?.id || null,
        content: text.trim(),
      });
      createdComment = response.data || null;
      setText('');
      setReplyTarget(null);
      if (createdComment) {
        setComments((prev) => {
          const nextComments = prependComment(prev, createdComment);
          setCommentCount(nextComments.length);
          onPageCommentsChange?.(idx, nextComments);
          return nextComments;
        });
      }
      toast.success('Đã gửi bình luận.');
    } catch (e) {
      console.error(e);
      toastFromError(e, 'Không gửi được bình luận.');
    }
    setSending(false);
  };

  const handleReplyComment = (comment) => {
    if (!comment?.id) {
      return;
    }

    setReplyTarget(comment);
    setText((currentValue) => {
      if (String(currentValue || '').trim()) {
        return currentValue;
      }

      return comment?.username ? `@${comment.username} ` : '';
    });
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleDeleteComment = async (comment) => {
    if (!comment?.id) {
      return;
    }

    if (!window.confirm('Xóa bình luận này?')) {
      return;
    }

    try {
      await deleteComment(comment.id);
      if (String(replyTarget?.id || '') === String(comment.id)) {
        setReplyTarget(null);
      }
      toast.success('Đã xóa bình luận.');
    } catch (error) {
      toastFromError(error, 'Không xóa được bình luận.');
    }
  };

  const toggleBookmarkPanel = (event) => {
    event?.stopPropagation();
    if (!showBookmarkToggle) {
      return;
    }
    if (!user) {
      alert('Vui lòng đăng nhập để lưu bookmark và ghi chú.');
      return;
    }
    setBookmarkOpen((value) => !value);
  };

  const handleSaveNote = async () => {
    try {
      const normalizedDraft = normalizeReadingNote(noteDraft);
      if (!normalizedDraft) {
        const result = await onDeleteNote?.(idx);
        if (result?.requiresAuth) {
          alert('Vui lòng đăng nhập!');
          return;
        }
      } else {
        const result = await onSaveNote?.(idx, noteDraft);
        if (result?.requiresAuth) {
          alert('Vui lòng đăng nhập!');
          return;
        }
      }
      setBookmarkOpen(false);
    } catch (error) {
      alert('Không lưu được ghi chú.');
    }
  };

  const handleSaveBookmark = async () => {
    try {
      const normalizedDraft = normalizeReadingNote(noteDraft);
      const normalizedSavedNote = normalizeReadingNote(noteText);
      if (normalizedDraft !== normalizedSavedNote || noteFromBookmarkFallback) {
        if (!normalizedDraft) {
          await onDeleteNote?.(idx);
        } else {
          await onSaveNote?.(idx, noteDraft);
        }
      }

      const result = await onSaveBookmark?.(idx);
      if (result?.requiresAuth) {
        alert('Vui lòng đăng nhập!');
        return;
      }
      setBookmarkOpen(false);
    } catch (error) {
      alert('Không lưu được bookmark.');
    }
  };

  const handleRemoveBookmark = async () => {
    try {
      const normalizedDraft = normalizeReadingNote(noteDraft);
      const normalizedSavedNote = normalizeReadingNote(noteText);
      if (normalizedDraft !== normalizedSavedNote || noteFromBookmarkFallback) {
        if (!normalizedDraft) {
          await onDeleteNote?.(idx);
        } else {
          await onSaveNote?.(idx, noteDraft);
        }
      }

      const result = await onRemoveBookmark?.(idx);
      if (result?.requiresAuth) {
        alert('Vui lòng đăng nhập!');
        return;
      }
      setBookmarkOpen(false);
    } catch (error) {
      alert('Không xóa được bookmark.');
    }
  };

  return (
    <div className={`manga-page-shell ${open ? 'is-open' : ''}`} style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'row',
      flexWrap: open ? 'wrap' : 'nowrap',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: open ? '10px' : '0',
      margin: 0,
      padding: 0,
      lineHeight: 0,
      transition: 'gap 0.3s ease',
    }}>
      <div
        className="manga-page-primary"
        style={{
          flex: '1 1 0',
          minWidth: 0,
          width: '100%',
          maxWidth: '900px',
        }}
      >
      <div
        className="manga-page-media"
        ref={pageRef}
        style={{
          position: 'relative',
          width: '100%',
          margin: 0,
          padding: 0,
          scrollMarginTop: 'calc(var(--header-height, 64px) + 20px)',
        }}
      >
        <img
          src={page}
          alt={`Trang ${idx + 1}`}
          style={{
            width: '100%',
            maxWidth: '900px',
            display: 'block',
            margin: 0,
            padding: 0,
            borderRadius: 0,
            background: 'transparent',
            border: 'none',
          }}
          loading="lazy"
          onError={(e) => { e.target.style.display = 'none'; }}
        />

        <div className="manga-page-reaction-wrap">
          <ReactionBar
            compact
            className="manga-page-reaction-bar"
            summary={reactionSummary}
            loading={reactionLoading}
            promptLabel={`Trang ${idx + 1}`}
            onReact={onReact}
          />
        </div>

        {showBookmarkToggle && (
          <button
            type="button"
            className="manga-page-bookmark-toggle"
            ref={bookmarkBtnRef}
            onClick={toggleBookmarkPanel}
            title={bookmarked ? `Mở bookmark và ghi chú cho trang ${idx + 1}` : `Lưu bookmark và ghi chú cho trang ${idx + 1}`}
            aria-pressed={bookmarked}
            disabled={busy}
            style={{
              position: 'absolute',
              left: '12px',
              bottom: '12px',
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              border: '1px solid var(--badge-overlay-border)',
              background: bookmarked
                ? 'linear-gradient(135deg, var(--accent), var(--warning))'
                : 'var(--badge-overlay)',
              color: 'var(--text-h)',
              cursor: busy ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: bookmarked
                ? '0 0 18px rgba(108, 99, 255, 0.35)'
                : 'var(--shadow)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
              zIndex: 10,
            }}
          >
            <BookmarkIcon filled={bookmarked} className="story-bookmark-icon" />
            {hasPageNote && (
              <span
                style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  minWidth: '16px',
                  height: '16px',
                  borderRadius: '999px',
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
                  color: 'var(--text-inverse)',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px var(--accent-glow)',
                }}
              >
                N
              </span>
            )}
          </button>
        )}

        {showBookmarkToggle && bookmarkOpen && (
          <div
            ref={bookmarkPanelRef}
            style={{
              position: 'absolute',
              left: '12px',
              bottom: '64px',
              zIndex: 16,
              width: 'min(300px, calc(100% - 24px))',
              background: 'linear-gradient(180deg, var(--bg-card), var(--bg-secondary))',
              border: '1px solid var(--accent-border)',
              borderRadius: '14px',
              boxShadow: 'var(--shadow)',
              padding: '0.85rem',
              lineHeight: 1.4,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginBottom: '0.65rem',
              }}
            >
              <div>
                <strong style={{ display: 'block', color: 'var(--text-h)', fontSize: '0.88rem' }}>
                  {bookmarkLabel}
                </strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>
                  Ghi chú của trang này được lưu riêng, không bị mất khi đổi hoặc bỏ bookmark.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBookmarkOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  fontSize: '1rem',
                }}
              >
                ×
              </button>
            </div>

            <textarea
              className="form-control"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Thêm ghi chú riêng cho trang này..."
              rows={4}
              style={{
                width: '100%',
                resize: 'vertical',
                minHeight: '110px',
                background: 'var(--bg-primary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />

            <p style={{ margin: '0.55rem 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Bạn có thể lưu ghi chú mà không cần giữ bookmark, hoặc bỏ bookmark mà ghi chú vẫn còn.
            </p>

            <div
              style={{
                marginTop: '0.8rem',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {hasPageNote && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setNoteDraft('')}
                    disabled={busy}
                  >
                    Xóa ô nhập
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleSaveNote}
                  disabled={busy}
                >
                  {noteBusy ? 'Đang lưu...' : 'Lưu ghi chú'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {hasPageNote && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={async () => {
                      try {
                        const result = await onDeleteNote?.(idx);
                        if (!result?.requiresAuth) {
                          setNoteDraft('');
                          setBookmarkOpen(false);
                        }
                      } catch (error) {
                        alert('Không xóa được ghi chú.');
                      }
                    }}
                    disabled={busy}
                  >
                    Xóa ghi chú
                  </button>
                )}
                {bookmarked ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleRemoveBookmark}
                    disabled={busy}
                  >
                    {bookmarkBusy ? 'Đang xử lý...' : 'Bỏ bookmark'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveBookmark}
                    disabled={busy}
                  >
                    {bookmarkBusy ? 'Đang lưu...' : 'Lưu bookmark'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showCommentToggle && (
        <button
          className="manga-page-comment-toggle"
          ref={btnRef}
          onClick={togglePanel}
          title={`Bình luận trang ${idx + 1}`}
          style={{
            position: 'absolute',
            right: '12px',
            bottom: '12px',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            border: '1px solid var(--badge-overlay-border)',
            background: open
              ? 'linear-gradient(135deg, var(--accent), var(--warning))'
              : 'var(--badge-overlay)',
            color: 'var(--text-h)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            boxShadow: open
                ? '0 0 18px var(--accent-glow)'
              : 'var(--shadow)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          💬
          {commentCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              minWidth: '18px',
              height: '18px',
              borderRadius: '999px',
              background: 'linear-gradient(135deg, #ef4444, #f97316)',
              color: 'var(--text-inverse)',
              fontSize: '0.62rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              boxShadow: '0 4px 12px var(--danger-border)',
            }}>
              {commentCount > 99 ? '99+' : commentCount}
            </span>
          )}
        </button>
        )}
      </div>
      </div>

      {showCommentToggle && (
      <div
        className={`page-comment-panel ${open ? 'open' : ''}`}
        ref={panelRef}
        style={{
          width: open ? '100%' : '0px',
          maxWidth: open ? '440px' : '0px',
          maxHeight: open ? '600px' : '0px',
          opacity: open ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-width 0.3s ease, opacity 0.25s ease, max-height 0.3s ease',
          flex: open ? '1 1 440px' : '0 0 0px',
          minWidth: 0,
        }}
      >
        {open && (
          <div className="page-comment-card" style={{
            width: '100%',
            maxHeight: '600px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeSlideIn 0.28s ease',
          }}>
            <div className="page-comment-header" style={{
              padding: '0.8rem 1rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              background: 'var(--bg-header)',
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                💬 Bình luận trang {idx + 1}
              </span>
              <button
                onClick={togglePanel}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div className="page-comment-list" style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0.9rem' }}>
              {loading ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', margin: '1rem 0' }}>
                  Đang tải...
                </p>
              ) : (
                <CommentThread
                  comments={comments}
                  currentUser={user}
                  compact
                  highlightCommentId={highlightedCommentId}
                  commentDomIdPrefix={`page-comment-${chapterId}-${idx}`}
                  onReply={handleReplyComment}
                  onDelete={handleDeleteComment}
                  emptyText="Chưa có bình luận nào cho trang này."
                />
              )}
            </div>

            <div className="page-comment-input-row" style={{
              padding: '0.75rem 0.9rem',
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gap: '0.45rem',
              background: 'var(--bg-header)',
            }}>
              {replyTarget && (
                <div className="comment-reply-banner compact">
                  <div>
                    <strong>{`Đang trả lời @${replyTarget.username || 'người dùng'}`}</strong>
                    {replyTarget.content && <span>{replyTarget.content}</span>}
                  </div>
                  <button
                    type="button"
                    className="comment-reply-cancel"
                    onClick={() => setReplyTarget(null)}
                  >
                    Hủy
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.45rem' }}>
              <input
                ref={inputRef}
                className="form-control"
                style={{ flex: 1, fontSize: '0.84rem' }}
                placeholder={
                  replyTarget
                    ? `Trả lời @${replyTarget.username || 'người dùng'}...`
                    : 'Viết bình luận theo trang...'
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitPageComment()}
              />
              <button
                className="btn btn-primary"
                onClick={submitPageComment}
                disabled={sending}
                style={{ whiteSpace: 'nowrap' }}
              >
                Gửi
              </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export default function ChapterReader() {
  const { storyId, chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { themeKey } = useTheme();
  const {
    getStoryBookmark,
    getBookmark,
    isBookmarked,
    isProcessing,
    saveBookmark,
    removeBookmark,
    toggleBookmark,
  } = useBookmarks(user);

  const [story, setStory] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [comments, setComments] = useState([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [selectedGifUrl, setSelectedGifUrl] = useState(null);
  const [selectedGifSize, setSelectedGifSize] = useState(null);
  const [gifError, setGifError] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showBookmarkButtons, setShowBookmarkButtons] = useState(true);
  const [showPageCommentButtons, setShowPageCommentButtons] = useState(true);
  const [pageCommentsCache, setPageCommentsCache] = useState({});
  const [pageNotes, setPageNotes] = useState({});
  const [noteProcessingKeys, setNoteProcessingKeys] = useState([]);
  const [readingHistoryItem, setReadingHistoryItem] = useState(null);
  const [readingNote, setReadingNote] = useState('');
  const [showReadingNote, setShowReadingNote] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteStatus, setNoteStatus] = useState('');
  const [missionUpdate, setMissionUpdate] = useState(null);
  const [chapterPresenceCount, setChapterPresenceCount] = useState(null);
  const searchTimer = useRef(null);
  const noteSaveTimer = useRef(null);
  const noteHydratedRef = useRef(false);
  const lastSavedNoteRef = useRef('');

  // Reader settings
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [bgColor, setBgColor] = useState('');
  const [textColor, setTextColor] = useState('');
  const [lineHeight, setLineHeight] = useState(1.8);
  const [showSettings, setShowSettings] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(0.8);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsVoices, setTtsVoices] = useState([]);
  const [ttsLanguageMode, setTtsLanguageMode] = useState(
    () => getStoredTtsSettings().languageMode,
  );
  const [ttsVietnameseVoiceURI, setTtsVietnameseVoiceURI] = useState(
    () => getStoredTtsSettings().vietnameseVoiceURI,
  );
  const [ttsEnglishVoiceURI, setTtsEnglishVoiceURI] = useState(
    () => getStoredTtsSettings().englishVoiceURI,
  );
  const [ttsRate, setTtsRate] = useState(() => getStoredTtsSettings().rate);
  const [ttsPitch, setTtsPitch] = useState(() => getStoredTtsSettings().pitch);
  const [ttsStatus, setTtsStatus] = useState('idle');
  const [activeSpeechParagraph, setActiveSpeechParagraph] = useState(-1);
  const mangaPageRefs = useRef({});
  const paragraphRefs = useRef({});
  const commentInputRef = useRef(null);
  const autoScrollFrameRef = useRef(null);
  const focusedChapterCommentIdRef = useRef('');
  const speechSynthesisRef = useRef(null);
  const speechQueueRef = useRef([]);
  const speechQueueIndexRef = useRef(-1);
  const speechSessionRef = useRef(0);
  const targetCommentId = String(searchParams.get('comment') || '').trim();

  useEffect(() => {
    loadChapter();
  }, [chapterId, storyId, user]);

  useEffect(() => {
    setPageCommentsCache({});
    setPageNotes({});
    setNoteProcessingKeys([]);
    setMissionUpdate(null);
    setChapterPresenceCount(null);
    setReplyTarget(null);
    setAutoScrollEnabled(false);
  }, [chapterId]);

  useEffect(() => {
    if (!storyId || !chapterId) {
      setChapterPresenceCount(null);
      return undefined;
    }

    const target = { storyId, chapterId };
    const accessToken = user?.accessToken || user?.token || null;
    const socket = subscribeChapterPresence(target, accessToken);
    if (!socket) {
      return undefined;
    }

    const handleChapterPresence = (payload) => {
      if (
        String(payload?.storyId || '') !== String(storyId) ||
        String(payload?.chapterId || '') !== String(chapterId)
      ) {
        return;
      }

      const nextCount = Number(payload?.count);
      setChapterPresenceCount(
        Number.isFinite(nextCount) && nextCount >= 0 ? nextCount : null,
      );
    };

    socket.on(REALTIME_EVENTS.chapterPresence, handleChapterPresence);

    return () => {
      socket.off(REALTIME_EVENTS.chapterPresence, handleChapterPresence);
      unsubscribeChapterPresence(target);
    };
  }, [chapterId, storyId, user?.accessToken, user?.token]);

  useEffect(() => {
    if (!chapterId) {
      return undefined;
    }

    const target = { scope: 'CHAPTER', chapterId };
    const accessToken = user?.accessToken || user?.token || null;
    const socket = subscribeCommentTargets(target, accessToken);
    if (!socket) {
      return undefined;
    }

    const handleCommentCreated = (payload) => {
      if (
        String(payload?.scope || '').toUpperCase() !== 'CHAPTER' ||
        String(payload?.chapterId || '') !== String(chapterId) ||
        !payload?.comment
      ) {
        return;
      }

      setComments((prev) => prependComment(prev, payload.comment));
    };

    const handleCommentDeleted = (payload) => {
      if (
        String(payload?.scope || '').toUpperCase() !== 'CHAPTER' ||
        String(payload?.chapterId || '') !== String(chapterId) ||
        !payload?.commentId
      ) {
        return;
      }

      setComments((prev) => removeComment(prev, payload.commentId));
    };

    socket.on(REALTIME_EVENTS.commentCreated, handleCommentCreated);
    socket.on(REALTIME_EVENTS.commentDeleted, handleCommentDeleted);

    return () => {
      socket.off(REALTIME_EVENTS.commentCreated, handleCommentCreated);
      socket.off(REALTIME_EVENTS.commentDeleted, handleCommentDeleted);
      unsubscribeCommentTargets(target);
    };
  }, [chapterId, user?.accessToken, user?.token]);

  useEffect(() => {
    if (!replyTarget?.id) {
      return;
    }

    if (!comments.some((comment) => String(comment?.id || '') === String(replyTarget.id))) {
      setReplyTarget(null);
    }
  }, [comments, replyTarget]);

  useEffect(() => {
    const getVar = (name, fallback) => {
      if (typeof window === 'undefined') return fallback;
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    };
    setBgColor(getVar('--bg-card', '#ffffff'));
    setTextColor(getVar('--text-primary', '#0f172a'));
  }, [themeKey]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof window.SpeechSynthesisUtterance === 'undefined'
    ) {
      setTtsSupported(false);
      setTtsVoices([]);
      speechSynthesisRef.current = null;
      return undefined;
    }

    const synth = window.speechSynthesis;
    speechSynthesisRef.current = synth;
    setTtsSupported(true);

    const syncVoices = () => {
      const availableVoices = synth.getVoices();
      setTtsVoices(Array.isArray(availableVoices) ? availableVoices : []);
    };

    syncVoices();

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', syncVoices);
      return () => {
        synth.removeEventListener('voiceschanged', syncVoices);
      };
    }

    const previousHandler = synth.onvoiceschanged;
    synth.onvoiceschanged = syncVoices;
    return () => {
      synth.onvoiceschanged = previousHandler || null;
    };
  }, []);

  useEffect(() => {
    const preferredVietnameseVoice = pickPreferredVoice(
      ttsVoices,
      ttsVietnameseVoiceURI,
      'vi-VN',
    );
    if (preferredVietnameseVoice) {
      const nextVoiceURI = String(preferredVietnameseVoice.voiceURI || '');
      if (nextVoiceURI && nextVoiceURI !== ttsVietnameseVoiceURI) {
        setTtsVietnameseVoiceURI(nextVoiceURI);
      }
    }

    const preferredEnglishVoice = pickPreferredVoice(
      ttsVoices,
      ttsEnglishVoiceURI,
      'en-US',
    );
    if (preferredEnglishVoice) {
      const nextVoiceURI = String(preferredEnglishVoice.voiceURI || '');
      if (nextVoiceURI && nextVoiceURI !== ttsEnglishVoiceURI) {
        setTtsEnglishVoiceURI(nextVoiceURI);
      }
    }
  }, [ttsEnglishVoiceURI, ttsVietnameseVoiceURI, ttsVoices]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        READER_TTS_SETTINGS_KEY,
        JSON.stringify({
          languageMode: ttsLanguageMode,
          vietnameseVoiceURI: ttsVietnameseVoiceURI,
          englishVoiceURI: ttsEnglishVoiceURI,
          rate: ttsRate,
          pitch: ttsPitch,
        }),
      );
    } catch {}
  }, [ttsEnglishVoiceURI, ttsLanguageMode, ttsPitch, ttsRate, ttsVietnameseVoiceURI]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    };
  }, []);

  const loadChapter = async () => {
    setLoading(true);
    setLoadError('');
    setMissionUpdate(null);
    noteHydratedRef.current = false;
    try {
      const historyPromise = user
        ? getReadingHistoryByStory(storyId).catch(() => ({ data: null }))
        : Promise.resolve({ data: null });
      const pageNotesPromise = user
        ? getReaderNotesByChapter(storyId, chapterId).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] });
      const [chRes, sRes, chsRes, cmRes, historyRes, pageNotesRes] = await Promise.all([
        getChapter(chapterId),
        getStory(storyId),
        getChaptersByStory(storyId),
        getCommentThreadByChapter(chapterId),
        historyPromise,
        pageNotesPromise,
      ]);
      setChapter(chRes.data);
      setStory(sRes.data);
      setChapters(chsRes.data);
      setComments(cmRes.data);
      setVisibleCount(5);
      const historyItem = historyRes?.data || null;
      const savedNote = historyItem?.note || '';
      const nextIsManga = sRes.data?.type === 'MANGA';
      const nextPageNotes = {};
      if (nextIsManga) {
        (Array.isArray(pageNotesRes?.data) ? pageNotesRes.data : []).forEach((noteItem) => {
          if (typeof noteItem?.pageIndex === 'number') {
            nextPageNotes[noteItem.pageIndex] = noteItem;
          }
        });
      }
      setPageNotes(nextPageNotes);
      setReadingHistoryItem(historyItem);
      setReadingNote(savedNote);
      setShowReadingNote(!nextIsManga && Boolean(savedNote));
      setNoteStatus('');
      setNoteSaving(false);
      lastSavedNoteRef.current = normalizeReadingNote(savedNote);
      noteHydratedRef.current = true;
      if (user) {
        saveReadingHistory({ storyId, chapterId })
          .then((response) => {
            const mission = response?.data?.mission || null;
            if (mission?.completedNow || mission?.chapterAdded) {
              setMissionUpdate(mission);
            }
          })
          .catch(() => {});
      }
      try {
        markChapterAsRead(user?.id, chapterId);
      } catch {}
    } catch (e) {
      console.error(e);
      setChapter(null);
      setStory(null);
      setChapters([]);
      setComments([]);
      setLoadError(
          e?.response?.data?.message || 'Không mở được chương này. Hãy mở khóa truyện trước.',
      );
      setPageNotes({});
      setReadingHistoryItem(null);
      setReadingNote('');
      setShowReadingNote(false);
      setNoteStatus('');
      setNoteSaving(false);
      lastSavedNoteRef.current = '';
    }
    setLoading(false);
  };

  const currentIndex = chapters.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const isManga = story?.type === 'MANGA';
  const displayStoryTitle = useMemo(
    () => formatDisplayText(story?.title || ''),
    [story?.title],
  );
  const displayChapterTitle = useMemo(
    () => formatDisplayText(chapter?.title || ''),
    [chapter?.title],
  );
  const displayChapterSummary = useMemo(
    () => formatDisplayText(chapter?.summary || '').trim(),
    [chapter?.summary],
  );
  const paragraphBlocks = useMemo(
    () => (
      isManga
        ? []
        : splitChapterContentIntoParagraphs(
            formatDisplayText(chapter?.content || ''),
          )
    ),
    [chapter?.content, isManga],
  );
  const chapterReactionTarget = useMemo(
    () => buildChapterReactionTarget(storyId, chapterId),
    [chapterId, storyId],
  );
  const pageReactionTargets = useMemo(
    () => (
      isManga
        ? (chapter?.pages || [])
            .map((_, pageIndex) => buildMangaPageReactionTarget(storyId, chapterId, pageIndex))
            .filter(Boolean)
        : []
    ),
    [chapter?.pages, chapterId, isManga, storyId],
  );
  const reactionTargets = useMemo(
    () => [
      chapterReactionTarget,
      ...pageReactionTargets,
    ].filter(Boolean),
    [
      chapterReactionTarget,
      pageReactionTargets,
    ],
  );
  const { getSummary: getReactionSummary, loadingTarget: isReactionLoading, reactToTarget } =
    useReactionSummaries({
      targets: reactionTargets,
      user,
    });
  const targetPageIndex = Number.parseInt(searchParams.get('page') || '', 10);
  const targetParagraphIndex = Number.parseInt(searchParams.get('paragraph') || '', 10);
  const bookmarkTargetPage = Number.isInteger(targetPageIndex) ? targetPageIndex - 1 : null;
  const bookmarkTargetParagraph = Number.isInteger(targetParagraphIndex)
    ? targetParagraphIndex - 1
    : null;
  const currentStoryBookmark = getStoryBookmark(storyId);
  const chapterReactionSummary = chapterReactionTarget
    ? getReactionSummary(chapterReactionTarget)
    : null;
  const readerTopOffset = 'var(--header-height, 64px)';
  const chapterComments = comments.filter((comment) => comment.chapterId === chapterId);
  const chapterLevelComments = chapterComments.filter(
    (comment) => comment.pageIndex === null || comment.pageIndex === undefined,
  );
  const chapterRootCommentCount = chapterLevelComments.filter((comment) => {
    const parentId = String(comment?.parentCommentId || '').trim();
    if (!parentId) {
      return true;
    }

    return !chapterLevelComments.some((item) => String(item?.id || '') === parentId);
  }).length;
  const pageCommentsByIndex = {};
  chapterComments.forEach((comment) => {
    if (comment.chapterId === chapterId && comment.pageIndex !== null && comment.pageIndex !== undefined) {
      if (!pageCommentsByIndex[comment.pageIndex]) pageCommentsByIndex[comment.pageIndex] = [];
      pageCommentsByIndex[comment.pageIndex].push(comment);
    }
  });
  const targetComment = targetCommentId
    ? chapterComments.find((comment) => String(comment?.id || '') === targetCommentId) || null
    : null;
  const targetPageCommentIndex =
    targetComment?.pageIndex !== null &&
    targetComment?.pageIndex !== undefined &&
    Number.isInteger(Number(targetComment.pageIndex))
      ? Number(targetComment.pageIndex)
      : null;
  const effectiveTargetPageIndex =
    bookmarkTargetPage !== null ? bookmarkTargetPage : targetPageCommentIndex;
  const visibleComments = getVisibleThreadComments(
    chapterLevelComments,
    visibleCount,
  );
  const makePageNoteKey = (pageIndex, paragraphIndex = null) =>
    `${chapterId || ''}::${pageIndex ?? ''}::${paragraphIndex ?? ''}`;
  const isPageNoteProcessing = (pageIndex, paragraphIndex = null) =>
    noteProcessingKeys.includes(makePageNoteKey(pageIndex, paragraphIndex));
  const vietnameseTtsVoiceOptions = useMemo(
    () => getVoicesForLanguage(ttsVoices, 'vi-VN'),
    [ttsVoices],
  );
  const englishTtsVoiceOptions = useMemo(
    () => getVoicesForLanguage(ttsVoices, 'en-US'),
    [ttsVoices],
  );
  const hasVietnameseTtsVoice = useMemo(
    () => ttsVoices.some(isVietnameseVoice),
    [ttsVoices],
  );
  const hasEnglishTtsVoice = useMemo(
    () => ttsVoices.some(isEnglishVoice),
    [ttsVoices],
  );
  const selectedVietnameseTtsVoice = useMemo(
    () => pickPreferredVoice(ttsVoices, ttsVietnameseVoiceURI, 'vi-VN'),
    [ttsVietnameseVoiceURI, ttsVoices],
  );
  const selectedEnglishTtsVoice = useMemo(
    () => pickPreferredVoice(ttsVoices, ttsEnglishVoiceURI, 'en-US'),
    [ttsEnglishVoiceURI, ttsVoices],
  );

  const stopTts = (resetParagraph = true) => {
    speechSessionRef.current += 1;
    speechQueueRef.current = [];
    speechQueueIndexRef.current = -1;

    const synth = speechSynthesisRef.current;
    if (synth) {
      try {
        synth.cancel();
      } catch {}
    }

    setTtsStatus('idle');
    if (resetParagraph) {
      setActiveSpeechParagraph(-1);
    }
  };

  const speakQueueItem = (queueIndex, sessionId) => {
    const synth = speechSynthesisRef.current;
    const queue = speechQueueRef.current;
    if (!synth || sessionId !== speechSessionRef.current) {
      return;
    }

    if (!Array.isArray(queue) || queueIndex >= queue.length) {
      speechQueueRef.current = [];
      speechQueueIndexRef.current = -1;
      setTtsStatus('idle');
      setActiveSpeechParagraph(-1);
      return;
    }

    const currentItem = queue[queueIndex];
    if (!currentItem?.text) {
      speakQueueItem(queueIndex + 1, sessionId);
      return;
    }

    speechQueueIndexRef.current = queueIndex;
    const utterance = new window.SpeechSynthesisUtterance(currentItem.text);
    const effectiveLanguage = currentItem.language === 'en-US' ? 'en-US' : 'vi-VN';
    const selectedVoice =
      effectiveLanguage === 'en-US'
        ? selectedEnglishTtsVoice || selectedVietnameseTtsVoice
        : selectedVietnameseTtsVoice || selectedEnglishTtsVoice;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || effectiveLanguage;
    } else {
      utterance.lang = effectiveLanguage;
    }
    utterance.rate = ttsRate;
    utterance.pitch = ttsPitch;
    utterance.volume = 1;

    utterance.onstart = () => {
      if (sessionId !== speechSessionRef.current) {
        return;
      }

      setTtsStatus('playing');
      setActiveSpeechParagraph(currentItem.paragraphIndex);

      const paragraphNode = paragraphRefs.current[currentItem.paragraphIndex];
      if (paragraphNode) {
        paragraphNode.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    };

    utterance.onend = () => {
      if (sessionId !== speechSessionRef.current) {
        return;
      }

      speakQueueItem(queueIndex + 1, sessionId);
    };

    utterance.onerror = (event) => {
      if (
        sessionId !== speechSessionRef.current ||
        event?.error === 'interrupted' ||
        event?.error === 'canceled'
      ) {
        return;
      }

      console.error('speechSynthesis error', event);
      stopTts(false);
    };

    synth.speak(utterance);
  };

  const startTtsFromParagraph = (startParagraphIndex = 0) => {
    if (isManga || !ttsSupported || !paragraphBlocks.length) {
      return;
    }

    const synth = speechSynthesisRef.current;
    if (!synth) {
      return;
    }

    const safeStartParagraphIndex = Math.max(
      0,
      Math.min(paragraphBlocks.length - 1, Number(startParagraphIndex) || 0),
    );
    const nextQueue = buildSpeechQueue(
      paragraphBlocks,
      safeStartParagraphIndex,
      ttsLanguageMode,
    );
    if (!nextQueue.length) {
      return;
    }

    speechSessionRef.current += 1;
    const sessionId = speechSessionRef.current;
    speechQueueRef.current = nextQueue;
    speechQueueIndexRef.current = -1;

    try {
      synth.cancel();
    } catch {}

    setTtsStatus('playing');
    setActiveSpeechParagraph(safeStartParagraphIndex);
    speakQueueItem(0, sessionId);
  };

  const pauseTts = () => {
    const synth = speechSynthesisRef.current;
    if (!synth || !synth.speaking || synth.paused) {
      return;
    }

    synth.pause();
    setTtsStatus('paused');
  };

  const resumeTts = () => {
    const synth = speechSynthesisRef.current;
    if (!synth || !synth.paused) {
      return;
    }

    synth.resume();
    setTtsStatus('playing');
  };

  const toggleTtsPlayback = () => {
    if (isManga || !ttsSupported || !paragraphBlocks.length) {
      return;
    }

    if (ttsStatus === 'playing') {
      pauseTts();
      return;
    }

    if (ttsStatus === 'paused') {
      resumeTts();
      return;
    }

    const startParagraphIndex =
      activeSpeechParagraph >= 0
        ? activeSpeechParagraph
        : bookmarkTargetParagraph !== null
          ? bookmarkTargetParagraph
          : 0;
    startTtsFromParagraph(startParagraphIndex);
  };

  useEffect(() => {
    if (!targetCommentId) {
      focusedChapterCommentIdRef.current = '';
      setHighlightedCommentId('');
      return undefined;
    }

    if (!targetComment) {
      focusedChapterCommentIdRef.current = '';
      setHighlightedCommentId('');
      return undefined;
    }

    if (targetPageCommentIndex !== null) {
      focusedChapterCommentIdRef.current = '';
      setHighlightedCommentId('');
      return undefined;
    }

    if (focusedChapterCommentIdRef.current === targetCommentId) {
      return undefined;
    }

    const requiredVisibleCount = getRequiredVisibleRootCount(
      chapterLevelComments,
      targetCommentId,
    );
    if (requiredVisibleCount > visibleCount) {
      setVisibleCount(requiredVisibleCount);
      return undefined;
    }

    let highlightTimerId = null;
    let retryTimerId = null;

    const focusTargetComment = () => {
      const targetNode = document.getElementById(`chapter-comment-${targetCommentId}`);
      if (!targetNode) {
        return false;
      }

      targetNode.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      focusedChapterCommentIdRef.current = targetCommentId;
      setHighlightedCommentId(targetCommentId);
      highlightTimerId = window.setTimeout(() => {
        setHighlightedCommentId((currentValue) =>
          currentValue === targetCommentId ? '' : currentValue,
        );
      }, 2600);
      return true;
    };

    const animationFrameId = window.requestAnimationFrame(() => {
      if (focusTargetComment()) {
        return;
      }

      retryTimerId = window.setTimeout(() => {
        focusTargetComment();
      }, 260);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      if (retryTimerId) {
        window.clearTimeout(retryTimerId);
      }
      if (highlightTimerId) {
        window.clearTimeout(highlightTimerId);
      }
    };
  }, [
    chapterLevelComments,
    targetComment,
    targetCommentId,
    targetPageCommentIndex,
    visibleCount,
  ]);

  useEffect(() => {
    stopTts();
  }, [chapterId, isManga]);

  useEffect(() => () => {
    speechSessionRef.current += 1;
    const synth = speechSynthesisRef.current;
    if (synth) {
      try {
        synth.cancel();
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (
      isManga ||
      ttsStatus !== 'playing' ||
      activeSpeechParagraph < 0 ||
      !paragraphBlocks.length
    ) {
      return;
    }

    startTtsFromParagraph(activeSpeechParagraph);
  }, [
    ttsEnglishVoiceURI,
    ttsLanguageMode,
    ttsPitch,
    ttsRate,
    ttsVietnameseVoiceURI,
  ]);

  useEffect(() => {
    if (!autoScrollEnabled || typeof window === 'undefined') {
      return undefined;
    }

    let lastTime = null;
    const pixelsPerSecond = Math.max(40, autoScrollSpeed * 120);

    const step = (timestamp) => {
      if (lastTime === null) {
        lastTime = timestamp;
      }

      const delta = timestamp - lastTime;
      lastTime = timestamp;
      window.scrollBy({ top: (delta / 1000) * pixelsPerSecond, behavior: 'auto' });

      const reachedBottom =
        Math.ceil(window.innerHeight + window.scrollY) >=
        (document.documentElement?.scrollHeight || document.body?.scrollHeight || 0) - 4;
      if (reachedBottom) {
        setAutoScrollEnabled(false);
        autoScrollFrameRef.current = null;
        return;
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(step);
    };

    autoScrollFrameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (autoScrollFrameRef.current) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [autoScrollEnabled, autoScrollSpeed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === 'Escape') {
        if (showReadingNote) {
          setShowReadingNote(false);
          return;
        }

        if (showSettings) {
          setShowSettings(false);
        }
        return;
      }

      const key = String(event.key || '').toLowerCase();

      if (key === 's') {
        event.preventDefault();
        setAutoScrollEnabled((value) => !value);
        return;
      }

      if (key === '[' || key === '-') {
        event.preventDefault();
        setAutoScrollSpeed((value) => Math.max(0.4, Number((value - 0.2).toFixed(1))));
        return;
      }

      if (key === ']' || key === '=') {
        event.preventDefault();
        setAutoScrollSpeed((value) => Math.min(3, Number((value + 0.2).toFixed(1))));
        return;
      }

      if (key === 'a' || key === 'j') {
        if (!prevChapter?.id) {
          return;
        }
        event.preventDefault();
        navigate(`/story/${storyId}/chapter/${prevChapter.id}`);
        return;
      }

      if (key === 'd' || key === 'k') {
        if (!nextChapter?.id) {
          return;
        }
        event.preventDefault();
        navigate(`/story/${storyId}/chapter/${nextChapter.id}`);
        return;
      }

      if (key === 't') {
        event.preventDefault();
        setShowSettings((value) => !value);
        return;
      }

      if (key === 'b') {
        event.preventDefault();
        setShowBookmarkButtons((value) => !value);
        return;
      }

      if (isManga && key === 'c') {
        event.preventDefault();
        setShowPageCommentButtons((value) => !value);
        return;
      }

      if (!isManga && key === 'n') {
        event.preventDefault();
        setShowReadingNote((value) => !value);
        return;
      }

      if (!isManga && key === 'v') {
        event.preventDefault();
        toggleTtsPlayback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeSpeechParagraph,
    bookmarkTargetParagraph,
    isManga,
    navigate,
    nextChapter?.id,
    paragraphBlocks.length,
    prevChapter?.id,
    showReadingNote,
    showSettings,
    storyId,
    ttsSupported,
    ttsStatus,
  ]);

  useEffect(() => {
    if (isManga && showReadingNote) {
      setShowReadingNote(false);
    }
  }, [isManga, showReadingNote]);

  const goToBookmark = (bookmark) => {
    if (!bookmark?.storyId || !bookmark?.chapterId) {
      return;
    }

    const { pageIndex, paragraphIndex } = getBookmarkLocation(bookmark);
    const nextSearchParams = new URLSearchParams();
    if (typeof pageIndex === 'number') {
      nextSearchParams.set('page', String(pageIndex + 1));
    }
    if (typeof paragraphIndex === 'number') {
      nextSearchParams.set('paragraph', String(paragraphIndex + 1));
    }

    const suffix = nextSearchParams.toString();
    navigate(
      `/story/${bookmark.storyId}/chapter/${bookmark.chapterId}${suffix ? `?${suffix}` : ''}`,
    );
  };

  const persistReadingNote = async (nextNote) => {
    if (!user) {
      return;
    }

    const normalizedNextNote = normalizeReadingNote(nextNote);
    if (normalizedNextNote === lastSavedNoteRef.current) {
      return;
    }

    setNoteSaving(true);
    setNoteStatus('Đang lưu ghi chú...');
    try {
      const response = await saveReadingHistory({
        storyId,
        chapterId,
        note: nextNote,
      });
      const savedItem = response.data || null;
      const savedNote = savedItem?.note || '';
      setReadingHistoryItem(savedItem);
      lastSavedNoteRef.current = normalizeReadingNote(savedNote);
      setNoteStatus(savedNote ? 'Đã lưu ghi chú.' : 'Đã xóa ghi chú.');
    } catch (error) {
      console.error(error);
      setNoteStatus('Không lưu được ghi chú.');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleReadingNoteBlur = () => {
    if (noteSaveTimer.current) {
      clearTimeout(noteSaveTimer.current);
      noteSaveTimer.current = null;
    }

    if (!user || !noteHydratedRef.current) {
      return;
    }

    persistReadingNote(readingNote);
  };

  const handleReadingNoteToggle = () => {
    if (!user) {
      alert('Vui lòng đăng nhập để lưu ghi chú.');
      return;
    }

    setShowReadingNote((value) => !value);
  };

  const handleSavePageNote = async (pageIndex, note) => {
    if (!user) {
      return { requiresAuth: true, saved: false };
    }

    const key = makePageNoteKey(pageIndex);
    setNoteProcessingKeys((prev) => [...prev, key]);

    try {
      const response = await saveReaderNote({
        storyId,
        chapterId,
        pageIndex,
        note,
      });
      const savedNote = response.data || null;
      setPageNotes((prev) => ({
        ...prev,
        [pageIndex]: savedNote,
      }));
      return { requiresAuth: false, saved: true, note: savedNote };
    } catch (error) {
      throw error;
    } finally {
      setNoteProcessingKeys((prev) => prev.filter((value) => value !== key));
    }
  };

  const handleDeletePageNote = async (pageIndex) => {
    if (!user) {
      return { requiresAuth: true, removed: false };
    }

    const key = makePageNoteKey(pageIndex);
    setNoteProcessingKeys((prev) => [...prev, key]);

    try {
      await deleteReaderNote(storyId, chapterId, { pageIndex });
      setPageNotes((prev) => {
        const nextState = { ...prev };
        delete nextState[pageIndex];
        return nextState;
      });
      return { requiresAuth: false, removed: true };
    } catch (error) {
      throw error;
    } finally {
      setNoteProcessingKeys((prev) => prev.filter((value) => value !== key));
    }
  };

  const handlePageBookmarkSave = async (pageIndex) => {
    try {
      const result = await saveBookmark({
        storyId,
        chapterId,
        pageIndex,
        note: `Trang ${pageIndex + 1}`,
      });
      if (result.requiresAuth) {
        alert('Vui lòng đăng nhập!');
      }
      return result;
    } catch (error) {
      alert('Không cập nhật được bookmark.');
      throw error;
    }
  };

  const handlePageBookmarkRemove = async (pageIndex) => {
    try {
      const result = await removeBookmark({
        storyId,
        chapterId,
        pageIndex,
      });
      if (result?.requiresAuth) {
        alert('Vui lòng đăng nhập!');
      }
      return result;
    } catch (error) {
      alert('Không cập nhật được bookmark.');
      throw error;
    }
  };

  const handleParagraphBookmark = async (paragraph, paragraphIndex) => {
    try {
      const result = await toggleBookmark({
        storyId,
        chapterId,
        paragraphIndex,
        textSnippet: buildParagraphSnippet(paragraph),
        note: `Đoạn ${paragraphIndex + 1}`,
      });
      if (result.requiresAuth) {
        alert('Vui lòng đăng nhập!');
      }
    } catch (error) {
      alert('Không cập nhật được bookmark.');
    }
  };

  const scrollToBookmarkTarget = (targetNode) => {
    if (!targetNode || typeof window === 'undefined') {
      return;
    }

    const rootStyles = getComputedStyle(document.documentElement);
    const headerHeight = Number.parseInt(
      rootStyles.getPropertyValue('--header-height') || '64',
      10,
    );
    const topOffset = (Number.isFinite(headerHeight) ? headerHeight : 64) + 20;
    const targetTop = targetNode.getBoundingClientRect().top + window.scrollY - topOffset;

    window.scrollTo({
      top: Math.max(targetTop, 0),
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    let targetNode = null;
    if (isManga && effectiveTargetPageIndex !== null && effectiveTargetPageIndex >= 0) {
      targetNode = mangaPageRefs.current[effectiveTargetPageIndex] || null;
    } else if (!isManga && bookmarkTargetParagraph !== null && bookmarkTargetParagraph >= 0) {
      targetNode = paragraphRefs.current[bookmarkTargetParagraph] || null;
    }

    if (!targetNode) {
      return undefined;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      scrollToBookmarkTarget(targetNode);
    });
    const retryTimer = window.setTimeout(() => {
      scrollToBookmarkTarget(targetNode);
    }, 220);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(retryTimer);
    };
  }, [effectiveTargetPageIndex, bookmarkTargetParagraph, isManga, loading, chapterId]);

  useEffect(() => {
    if (!user || !noteHydratedRef.current) {
      return undefined;
    }

    const normalizedNote = normalizeReadingNote(readingNote);
    if (normalizedNote === lastSavedNoteRef.current) {
      return undefined;
    }

    if (noteSaveTimer.current) {
      clearTimeout(noteSaveTimer.current);
    }

    setNoteStatus('Đang lưu ghi chú...');
    noteSaveTimer.current = setTimeout(() => {
      persistReadingNote(readingNote);
    }, 700);

    return () => {
      if (noteSaveTimer.current) {
        clearTimeout(noteSaveTimer.current);
        noteSaveTimer.current = null;
      }
    };
  }, [chapterId, readingNote, storyId, user]);

  useEffect(() => {
    if (!showReadingNote || isManga || typeof document === 'undefined') {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowReadingNote(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isManga, showReadingNote]);

  const handleComment = async () => {
    if (!user) return alert('Vui lòng đăng nhập!');
    if (!newComment.trim() && !selectedGifUrl) return;
    if (selectedGifSize && selectedGifSize > 2 * 1024 * 1024) {
      alert('GIF lớn hơn 2MB, vui lòng chọn GIF nhỏ hơn.');
      return;
    }
    let createdComment = null;
    try {
      setSending(true);
      const response = await createComment({
        storyId,
        chapterId,
        chapterNumber: chapter?.chapterNumber,
        parentCommentId: replyTarget?.id || null,
        content: newComment,
        gifUrl: selectedGifUrl || null,
        gifSize: selectedGifSize || null,
      });
      createdComment = response.data || null;
    } catch (e) {
      if (e?.response?.status === 401) {
        alert('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
        setSending(false);
        return;
      }
      setSending(false);
      toastFromError(e, 'Không gửi được bình luận.');
      return;
    }
    setNewComment('');
    setReplyTarget(null);
    setSelectedGifUrl(null);
    setSelectedGifSize(null);
    setShowGifPicker(false);
    if (createdComment) {
      setComments((prev) => prependComment(prev, createdComment));
    }
    setVisibleCount(5);
    toast.success('Đã gửi bình luận.');
    setSending(false);
  };

  const handleReplyComment = (comment) => {
    if (!comment?.id) {
      return;
    }

    setReplyTarget(comment);
    setNewComment((currentValue) => {
      if (String(currentValue || '').trim()) {
        return currentValue;
      }

      return comment?.username ? `@${comment.username} ` : '';
    });
    window.requestAnimationFrame(() => {
      commentInputRef.current?.focus();
    });
  };

  const handleDeleteComment = async (comment) => {
    if (!comment?.id) {
      return;
    }

    if (!window.confirm('Xóa bình luận này?')) {
      return;
    }

    try {
      await deleteComment(comment.id);
      if (String(replyTarget?.id || '') === String(comment.id)) {
        setReplyTarget(null);
      }
      toast.success('Đã xóa bình luận.');
    } catch (error) {
      toastFromError(error, 'Không xóa được bình luận.');
    }
  };

  const searchGifs = async (keyword) => {
    const q = keyword.trim();
    if (q.startsWith('http') || q.length > 80) {
      setGifError('Từ khóa quá dài hoặc là một URL, hãy nhập từ khóa ngắn.');
      setGifResults([]);
      return;
    }
    setGifError('');
    if (!q) return loadTrendingGifs();
    setGifLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=12&rating=g`);
      const data = await res.json();
      setGifResults(data.data || []);
    } catch (e) {
      console.error(e);
      setGifError('Không tải được GIF. Thử lại sau.');
    }
    setGifLoading(false);
  };

  const loadTrendingGifs = async () => {
    setGifError('');
    setGifLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=12&rating=g`);
      const data = await res.json();
      setGifResults(data.data || []);
    } catch (e) {
      console.error(e);
      setGifError('Không tải được GIF nổi bật.');
    }
    setGifLoading(false);
  };

  if (loading) return <div className="loading"><div className="spinner" />Đang tải...</div>;
  if (!chapter || !story) {
    return (
      <div className="container">
        <div className="card">
          <p>{loadError || 'Không tìm thấy chương.'}</p>
          <Link to={`/story/${storyId}`} className="btn btn-outline">Quay lai truyen</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="chapter-reader-page" style={{ minHeight: '100vh', background: isManga ? 'var(--bg-primary)' : bgColor, transition: 'background 0.25s ease' }}>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(16px); }
          thành { opacity: 1; transform: translateX(0); }
        }

        .chapter-reader-content--manga,
        .chapter-reader-content--manga > div,
        .chapter-reader-content--manga .manga-page-shell,
        .chapter-reader-content--manga .manga-page-media {
          width: 100%;
        }

        .chapter-reader-content--manga .manga-page-media,
        .chapter-reader-content--manga .manga-page-media img {
          line-height: 0;
        }

        .chapter-reader-content--manga .manga-page-media img {
          display: block;
          width: 100%;
          vertical-align: top;
        }

        @media (max-width: 768px) {
          .chapter-reader-content.chapter-reader-content--manga {
            width: 100vw !important;
            max-width: none !important;
            margin-left: calc(50% - 50vw) !important;
            margin-right: calc(50% - 50vw) !important;
            padding: 0 !important;
          }

          .chapter-reader-topbar {
            padding: 0.75rem;
            gap: 0.6rem;
          }

          .chapter-reader-toplink {
            flex-basis: 100%;
            font-size: 0.85rem;
          }

          .chapter-reader-topcontrols {
            width: 100%;
            justify-content: flex-start;
          }

          .chapter-reader-select {
            max-width: none !important;
            min-width: 0 !important;
            flex: 1 1 100% !important;
          }

          .chapter-reader-settings {
            justify-content: flex-start;
            padding: 0.9rem 0.75rem;
            gap: 0.75rem;
          }

          .chapter-reader-title {
            padding: 1rem 0.75rem 0.35rem;
          }

          .chapter-reader-title h2 {
            font-size: 1.1rem !important;
          }

          .chapter-reader-content,
          .chapter-reader-comments {
            padding: 0.75rem !important;
          }

          .chapter-reader-novel {
            padding: 1rem !important;
            border-radius: 10px !important;
          }

          .manga-page-shell {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .manga-page-shell.is-open {
            gap: 0.75rem !important;
          }

          .manga-page-media {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .manga-page-comment-toggle {
            width: 38px !important;
            height: 38px !important;
            right: 10px !important;
            bottom: 10px !important;
          }

          .manga-page-bookmark-toggle {
            width: 38px !important;
            height: 38px !important;
            left: 10px !important;
            bottom: 10px !important;
          }

          .page-comment-panel.open {
            max-width: 100% !important;
            width: 100% !important;
            flex: 1 1 100% !important;
          }

          .page-comment-card {
            max-height: min(55vh, 420px) !important;
            border-radius: 12px !important;
          }

          .page-comment-input-row {
            flex-wrap: wrap;
            padding: 0.7rem !important;
          }

          .page-comment-input-row .btn {
            width: 100%;
          }

          .chapter-reader-bottomnav {
            padding: 1rem 0.75rem !important;
            gap: 0.5rem !important;
          }

          .chapter-reader-bottomnav .btn {
            flex: 1 1 calc(50% - 0.5rem);
            min-width: 0 !important;
          }

          .chapter-comment-toolbar,
          .chapter-gif-preview,
          .chapter-gif-search {
            flex-wrap: wrap;
          }

          .chapter-comment-toolbar .form-control,
          .chapter-gif-search .form-control {
            width: 100%;
            min-width: 0;
          }

          .chapter-comment-toolbar .btn,
          .chapter-gif-search .btn {
            flex: 1 1 calc(50% - 0.25rem);
          }

          .chapter-gif-grid {
            grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)) !important;
          }

          .chapter-comment-item-header {
            flex-wrap: wrap;
            align-items: flex-start !important;
          }

          .chapter-comment-gif {
            width: min(100%, 220px) !important;
            height: auto !important;
            aspect-ratio: 3 / 2;
          }
        }

        @media (max-width: 480px) {
          .chapter-reader-bottomnav .btn,
          .chapter-comment-toolbar .btn,
          .chapter-gif-search .btn {
            flex-basis: 100%;
            width: 100%;
          }

          .chapter-gif-preview img {
            width: 84px !important;
            height: 84px !important;
          }

          .page-comment-card {
            max-height: 360px !important;
          }
        }
      `}</style>

      {/* Top Navigation */}
      <div className="chapter-reader-topbar" style={{
        background: 'var(--bg-header)',
        backdropFilter: 'blur(10px)',
        padding: '0.75rem 1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem 1rem',
        position: 'sticky',
        top: readerTopOffset,
        zIndex: 80,
        borderBottom: '1px solid var(--border)',
      }}>
        <Link className="chapter-reader-toplink" to={`/story/${storyId}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600, flex: '1 1 260px', minWidth: 0, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ← {displayStoryTitle}
        </Link>
        <div className="chapter-reader-topcontrols" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', flex: '1 1 240px', minWidth: 0, maxWidth: '100%' }}>
          <select
            className="chapter-reader-select"
            value={chapterId}
            onChange={(e) => navigate(`/story/${storyId}/chapter/${e.target.value}`)}
            style={{
              flex: '1 1 220px',
              width: '100%',
              minWidth: '180px',
              maxWidth: '320px',
              padding: '0.35rem 0.6rem',
              borderRadius: '6px',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              fontSize: '0.85rem',
            }}
          >
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {`Ch.${ch.chapterNumber}: ${repairMojibakeText(ch.title || '')}`}
              </option>
            ))}
          </select>
          {currentStoryBookmark?.chapterId && (
            <button
              onClick={() => goToBookmark(currentStoryBookmark)}
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
      title="Mở lại vị trí đã bookmark"
            >
              <BookmarkIcon filled className="story-detail-bookmark-icon" />
              Vị trí đã lưu
            </button>
          )}
          {!isManga && (
            <button
              onClick={handleReadingNoteToggle}
              style={{
                background: showReadingNote ? 'var(--accent)' : 'var(--bg-card)',
                color: showReadingNote ? 'var(--text-inverse)' : 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                flexShrink: 0,
              }}
              title={showReadingNote ? 'Đóng ghi chú của bạn' : 'Mở ghi chú của bạn'}
            >
              {showReadingNote ? 'Đóng ghi chú' : readingHistoryItem?.note ? 'Mở ghi chú' : 'Ghi chú'}
            </button>
          )}
          {isManga && (
            <button
              onClick={() => setShowPageCommentButtons((value) => !value)}
              style={{
                background: showPageCommentButtons ? 'var(--accent)' : 'var(--bg-card)',
                color: showPageCommentButtons ? 'var(--text-inverse)' : 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                flexShrink: 0,
              }}
              title={showPageCommentButtons ? 'Ẩn icon bình luận trên từng ảnh' : 'Hiện icon bình luận trên từng ảnh'}
            >
              {showPageCommentButtons ? 'Ẩn icon BL' : 'Hiện icon BL'}
            </button>
          )}
          <button
            onClick={() => setShowBookmarkButtons((value) => !value)}
            style={{
              background: showBookmarkButtons ? 'var(--accent)' : 'var(--bg-card)',
              color: showBookmarkButtons ? 'var(--text-inverse)' : 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.35rem 0.65rem',
              cursor: 'pointer',
              fontSize: '0.85rem',
              flexShrink: 0,
            }}
            title={showBookmarkButtons ? 'Ẩn bookmark khi đọc' : 'Hiện bookmark khi đọc'}
          >
            {showBookmarkButtons ? 'Ẩn bookmark' : 'Hiện bookmark'}
          </button>
          {!isManga && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                background: showSettings ? 'var(--accent)' : 'var(--bg-card)',
                color: showSettings ? 'var(--text-inverse)' : 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                flexShrink: 0,
              }}
            >
              ⚙️
            </button>
          )}
        </div>
      </div>

      {missionUpdate && (
        <div
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            padding: '0.9rem 1rem',
            borderBottom: '1px solid var(--border)',
            background: missionUpdate.completedNow
              ? 'linear-gradient(135deg, var(--warning-bg), var(--accent-bg))'
              : 'var(--accent-soft)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.75rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <strong style={{ display: 'block', marginBottom: '0.2rem' }}>
                {missionUpdate.completedNow
                  ? `Nhiệm vụ hoàn thành. +${missionUpdate.rewardCoins} xu`
                  : `Tiến độ hôm nay: ${missionUpdate.progressCount}/${missionUpdate.target} chương`}
              </strong>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Streak hiện tại {missionUpdate.streak} ngày
                {missionUpdate.unlockedBadgeIds?.length
                  ? ` | Badge mới: ${missionUpdate.unlockedBadgeIds.length}`
                  : ''}
              </span>
            </div>
            <button className="btn btn-sm btn-outline" onClick={() => setMissionUpdate(null)}>
              Đóng
            </button>
          </div>
        </div>
      )}

      {showReadingNote && !isManga && (
        <div
          onClick={() => setShowReadingNote(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 140,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            className="card"
            onClick={(event) => event.stopPropagation()}
            style={{
              margin: 0,
              width: 'min(760px, 100%)',
              maxHeight: 'min(78vh, 720px)',
              overflow: 'auto',
              background: 'linear-gradient(180deg, var(--bg-card), var(--bg-secondary))',
              border: '1px solid var(--accent-border)',
              boxShadow: 'var(--shadow)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '0.75rem',
                marginBottom: '0.9rem',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  Ghi chú truyện
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Ghi chú sẽ được lưu theo truyện và mở lại khi bạn đọc tiếp.
                </p>
              </div>
              <button className="btn btn-outline" onClick={() => setShowReadingNote(false)}>
                Đóng
              </button>
            </div>

            <textarea
              className="form-control"
              value={readingNote}
              onChange={(event) => setReadingNote(event.target.value)}
              onBlur={handleReadingNoteBlur}
              placeholder="Nhập ghi chú cho truyện này..."
              rows={8}
              style={{
                width: '100%',
                resize: 'vertical',
                minHeight: '220px',
                whiteSpace: 'pre-wrap',
                background: 'var(--bg-primary)',
                borderColor: 'var(--border)',
              }}
            />

            <div
              style={{
                marginTop: '0.85rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {noteStatus || 'Ghi chú được tự động lưu khi bạn dừng gõ.'}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-outline"
                  onClick={() => setReadingNote('')}
                  disabled={noteSaving || !readingNote.trim()}
                >
                  Xóa ghi chú
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => persistReadingNote(readingNote)}
                  disabled={noteSaving}
                >
                  {noteSaving ? 'Đang lưu...' : 'Luu ngày'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Novel Settings Panel */}
      {showSettings && !isManga && (
        <div className="chapter-reader-settings" style={{
          background: 'var(--bg-card)',
          padding: '1rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
        }}>
          <label>Cỡ chữ: <input type="range" min="14" max="28" value={fontSize} onChange={(e) => setFontSize(+e.target.value)} /> {fontSize}px</label>
          <label>Dãn dòng: <input type="range" min="1.2" max="3" step="0.1" value={lineHeight} onChange={(e) => setLineHeight(+e.target.value)} /> {lineHeight}</label>
          <label>Tự cuộn: <input type="range" min="0.4" max="3" step="0.1" value={autoScrollSpeed} onChange={(e) => setAutoScrollSpeed(Number(e.target.value))} /> {autoScrollSpeed.toFixed(1)}x</label>
          <label>Font:
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              style={{
                marginLeft: '4px',
                padding: '2px 6px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
              }}
            >
              <option value="Georgia">Georgia</option>
              <option value="Inter">Inter</option>
              <option value="serif">Serif</option>
              <option value="monospace">Monospace</option>
            </select>
          </label>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setAutoScrollEnabled((value) => !value)}>
            {autoScrollEnabled ? 'Dừng auto-scroll' : 'Bật auto-scroll'}
          </button>
          <label>Nền: <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} /></label>
          <label>Chữ: <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} /></label>
          <div className="reader-tts-group">
            <span className="reader-tts-title">Đọc nghe</span>
            {ttsSupported ? (
              <>
                <label>
                  Chế độ:
                  <select
                    value={ttsLanguageMode}
                    onChange={(e) => setTtsLanguageMode(String(e.target.value || TTS_LANGUAGE_MODES.auto))}
                    style={{
                      marginLeft: '4px',
                      padding: '2px 6px',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      minWidth: '140px',
                    }}
                  >
                    <option value={TTS_LANGUAGE_MODES.auto}>Tự động VI/EN</option>
                    <option value={TTS_LANGUAGE_MODES.vietnamese}>Ưu tiên tiếng Việt</option>
                    <option value={TTS_LANGUAGE_MODES.english}>Ưu tiên tiếng Anh</option>
                  </select>
                </label>
                <label>
                  Giọng Việt:
                  <select
                    value={ttsVietnameseVoiceURI}
                    onChange={(e) => setTtsVietnameseVoiceURI(e.target.value)}
                    style={{
                      marginLeft: '4px',
                      padding: '2px 6px',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      minWidth: '170px',
                    }}
                    disabled={!vietnameseTtsVoiceOptions.length}
                  >
                    {vietnameseTtsVoiceOptions.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {`${voice.name} (${voice.lang})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Giọng Anh:
                  <select
                    value={ttsEnglishVoiceURI}
                    onChange={(e) => setTtsEnglishVoiceURI(e.target.value)}
                    style={{
                      marginLeft: '4px',
                      padding: '2px 6px',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      minWidth: '170px',
                    }}
                    disabled={!englishTtsVoiceOptions.length}
                  >
                    {englishTtsVoiceOptions.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {`${voice.name} (${voice.lang})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tốc độ đọc:
                  <input
                    type="range"
                    min="0.7"
                    max="1.6"
                    step="0.1"
                    value={ttsRate}
                    onChange={(e) => setTtsRate(Number(e.target.value))}
                  />
                  {ttsRate.toFixed(1)}x
                </label>
                <label>
                  Cao độ:
                  <input
                    type="range"
                    min="0.8"
                    max="1.4"
                    step="0.1"
                    value={ttsPitch}
                    onChange={(e) => setTtsPitch(Number(e.target.value))}
                  />
                  {ttsPitch.toFixed(1)}x
                </label>
                <div className="reader-tts-actions">
                  <button className="btn btn-outline btn-sm" type="button" onClick={toggleTtsPlayback}>
                    {ttsStatus === 'playing'
                      ? 'Tạm dừng đọc'
                      : ttsStatus === 'paused'
                        ? 'Tiếp tục đọc'
                        : 'Đọc chương'}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() => stopTts()}
                    disabled={ttsStatus === 'idle'}
                  >
                    Dừng
                  </button>
                </div>
                {!hasVietnameseTtsVoice && (
                  <span className="reader-tts-note">
                    Máy chưa có giọng tiếng Việt, nên TTS có thể phát âm chưa tự nhiên.
                  </span>
                )}
                {!hasEnglishTtsVoice && (
                  <span className="reader-tts-note">
                    Máy chưa có giọng tiếng Anh, nên đoạn English sẽ phải fallback sang giọng khác.
                  </span>
                )}
              </>
            ) : (
              <span className="reader-tts-note">Trình duyệt này chưa hỗ trợ đọc nghe.</span>
            )}
          </div>
        </div>
      )}

      {/* Chapter Title */}
      <div className="chapter-reader-title" style={{ textAlign: 'center', padding: '1.5rem 1rem 0.5rem', color: 'var(--text-primary)' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>
          {`Chương ${chapter.chapterNumber}: ${displayChapterTitle}`}
        </h2>
        <span style={{
          padding: '0.15rem 0.5rem',
          borderRadius: '4px',
          fontSize: '0.7rem',
          fontWeight: 700,
          background: isManga ? 'var(--badge-manga-bg)' : 'var(--badge-novel-bg)',
          color: isManga ? 'var(--warning)' : 'var(--accent)',
        }}>{isManga ? 'Truyện Tranh' : 'Light Novel'}</span>
        {displayChapterSummary && (
          <p
            style={{
              margin: '0.9rem auto 0',
              maxWidth: '720px',
              padding: '0.85rem 1rem',
              borderRadius: '14px',
              background: 'linear-gradient(180deg, var(--bg-card), var(--bg-secondary))',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              fontSize: '0.94rem',
              textAlign: 'left',
              boxShadow: 'var(--shadow)',
            }}
          >
            {displayChapterSummary}
          </p>
        )}
        {typeof chapterPresenceCount === 'number' && (
          <div className="chapter-presence-chip">
            <span className="chapter-presence-dot" />
            <span>{`Đang có ${chapterPresenceCount.toLocaleString('vi-VN')} người đọc chương này`}</span>
          </div>
        )}
        <div className="chapter-reader-quicktools">
          <button
            type="button"
            className={`chapter-reader-tool ${autoScrollEnabled ? 'active' : ''}`}
            onClick={() => setAutoScrollEnabled((value) => !value)}
          >
            {autoScrollEnabled ? 'Dừng auto-scroll' : 'Auto-scroll'}
          </button>
          <div className="chapter-reader-speed-group">
            <button
              type="button"
              className="chapter-reader-speed-btn"
              onClick={() => setAutoScrollSpeed((value) => Math.max(0.4, Number((value - 0.2).toFixed(1))))}
            >
              -
            </button>
            <span className="chapter-reader-speed-value">{`${autoScrollSpeed.toFixed(1)}x`}</span>
            <button
              type="button"
              className="chapter-reader-speed-btn"
              onClick={() => setAutoScrollSpeed((value) => Math.min(3, Number((value + 0.2).toFixed(1))))}
            >
              +
            </button>
          </div>
          {!isManga && (
            <>
              <button
                type="button"
                className={`chapter-reader-tool ${ttsStatus === 'playing' ? 'active' : ''}`}
                onClick={toggleTtsPlayback}
                disabled={!ttsSupported || paragraphBlocks.length === 0}
                title={ttsSupported ? 'Đọc truyện chữ bằng giọng máy' : 'Trình duyệt chưa hỗ trợ đọc nghe'}
              >
                {ttsStatus === 'playing'
                  ? 'Tạm dừng đọc'
                  : ttsStatus === 'paused'
                    ? 'Tiếp tục đọc'
                    : 'Đọc nghe'}
              </button>
              <button
                type="button"
                className="chapter-reader-tool"
                onClick={() => stopTts()}
                disabled={ttsStatus === 'idle'}
              >
                Dừng đọc
              </button>
              <span className="chapter-reader-shortcuts chapter-reader-status">
                {ttsSupported
                  ? ttsStatus === 'idle'
                    ? 'TTS đang tắt'
                    : ttsStatus === 'paused'
                      ? `Đã tạm dừng ở đoạn ${Math.max(activeSpeechParagraph + 1, 1)}/${paragraphBlocks.length}`
                      : `Đang đọc đoạn ${Math.max(activeSpeechParagraph + 1, 1)}/${paragraphBlocks.length}`
                  : 'Trình duyệt chưa hỗ trợ TTS'}
              </span>
            </>
          )}
          <span className="chapter-reader-shortcuts">
            {isManga ? 'Phím tắt: S auto, [ ] tốc độ, A/D chương, B bookmark, C comment' : 'Phím tắt: S auto, V đọc nghe, [ ] tốc độ, A/D chương, B bookmark, N ghi chú, T setting'}
          </span>
        </div>
        <div className="chapter-reaction-wrap">
          {chapterReactionTarget && chapterReactionSummary && (
            <ReactionBar
              compact
              className="chapter-reaction-bar"
              summary={chapterReactionSummary}
              loading={isReactionLoading(chapterReactionTarget)}
              promptLabel="Chuong"
              onReact={(emotion) => reactToTarget(chapterReactionTarget, emotion)}
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`chapter-reader-content ${isManga ? 'chapter-reader-content--manga' : ''}`} style={{ maxWidth: isManga ? '900px' : '750px', margin: '0 auto', padding: isManga ? '0' : '1rem' }}>
        {isManga ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', width: '100%', lineHeight: 0 }}>
            {chapter.pages && chapter.pages.length > 0 ? (
              chapter.pages.map((page, idx) => (
                <MangaPageWithComments
                  key={`${chapterId}-${idx}`}
                  page={page}
                  idx={idx}
                  storyId={storyId}
                  chapterId={chapterId}
                  user={user}
                  reactionSummary={getReactionSummary(pageReactionTargets[idx])}
                  reactionLoading={isReactionLoading(pageReactionTargets[idx])}
                  pageRef={(node) => {
                    if (node) {
                      mangaPageRefs.current[idx] = node;
                    }
                  }}
                  bookmarkItem={getBookmark(storyId, chapterId, idx, null)}
                  noteItem={pageNotes[idx] || null}
                  bookmarked={isBookmarked(storyId, chapterId, idx, null)}
                  bookmarkBusy={isProcessing(storyId, chapterId, idx, null)}
                  noteBusy={isPageNoteProcessing(idx)}
                  initialComments={pageCommentsCache[idx] || pageCommentsByIndex[idx] || []}
                  initialOpen={targetPageCommentIndex === idx}
                  targetCommentId={targetPageCommentIndex === idx ? targetCommentId : ''}
                  showBookmarkToggle={showBookmarkButtons}
                  showCommentToggle={showPageCommentButtons}
                  onPageCommentsChange={(pageIdx, nextComments) => {
                    setPageCommentsCache((prev) => ({
                      ...prev,
                      [pageIdx]: nextComments,
                    }));
                  }}
                  onSaveBookmark={handlePageBookmarkSave}
                  onRemoveBookmark={handlePageBookmarkRemove}
                  onSaveNote={handleSavePageNote}
                  onDeleteNote={handleDeletePageNote}
                  onReact={(emotion) => reactToTarget(pageReactionTargets[idx], emotion)}
                />
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎨</div>
                <p>Ch??ng n?y ch?a c? h?nh ảnh.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="chapter-reader-novel" style={{
            fontSize: `${fontSize}px`,
            fontFamily,
            color: textColor,
            lineHeight,
            textAlign: 'justify',
            padding: '1.5rem',
            background: bgColor,
            borderRadius: '12px',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
          }}>
            {paragraphBlocks.length > 0 ? (
              paragraphBlocks.map((paragraph, paragraphIndex) => {
                const bookmarked = isBookmarked(
                  storyId,
                  chapterId,
                  null,
                  paragraphIndex,
                );
                return (
                  <div
                    key={`${chapterId}-paragraph-${paragraphIndex}`}
                    className={`chapter-reader-paragraph ${activeSpeechParagraph === paragraphIndex ? 'is-speaking' : ''}`}
                    ref={(node) => {
                      if (node) {
                        paragraphRefs.current[paragraphIndex] = node;
                      }
                    }}
                    style={{
                      position: 'relative',
                      paddingRight: showBookmarkButtons ? '3rem' : '0',
                      marginBottom: '1.35rem',
                      scrollMarginTop: 'calc(var(--header-height, 64px) + 32px)',
                    }}
                  >
                    {showBookmarkButtons && (
                      <button
                        type="button"
                        className={`story-bookmark-btn ${bookmarked ? 'active' : ''}`}
                        aria-pressed={bookmarked}
                        title={bookmarked ? `Bỏ bookmark đoạn ${paragraphIndex + 1}` : `Bookmark đoạn ${paragraphIndex + 1}`}
                        disabled={isProcessing(storyId, chapterId, null, paragraphIndex)}
                        style={{
                          top: '0.1rem',
                          right: '0',
                          width: '34px',
                          height: '34px',
                        }}
                        onClick={() => handleParagraphBookmark(paragraph, paragraphIndex)}
                      >
                        <BookmarkIcon filled={bookmarked} className="story-bookmark-icon" />
                      </button>
                    )}
                    <p
                      className="chapter-reader-paragraph-text"
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {paragraph}
                    </p>
                    {activeSpeechParagraph === paragraphIndex && (
                      <div className="chapter-reader-paragraph-status">
                        Đang đọc đoạn này
                      </div>
                    )}
                    {bookmarked && (
                      <div
                        style={{
                          marginTop: '0.35rem',
                          fontSize: '0.75rem',
                          color: 'var(--accent)',
                          fontWeight: 600,
                        }}
                      >
                        Đã lưu đoạn {paragraphIndex + 1}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              'Chương này chưa có nội dung.'
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="chapter-reader-bottomnav" style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', padding: '1.5rem', flexWrap: 'wrap' }}>
        {prevChapter && (
          <Link to={`/story/${storyId}/chapter/${prevChapter.id}`} className="btn btn-outline" style={{ minWidth: '140px', textAlign: 'center' }}>← Chương trước</Link>
        )}
        <Link to={`/story/${storyId}`} className="btn btn-outline">📚 Danh sách</Link>
        {nextChapter && (
          <Link to={`/story/${storyId}/chapter/${nextChapter.id}`} className="btn btn-primary" style={{ minWidth: '140px', textAlign: 'center' }}>Chương tiếp →</Link>
        )}
      </div>

      {/* Comments */}
      <div className="chapter-reader-comments" style={{ maxWidth: '750px', margin: '0 auto', padding: '1rem' }}>
        <div className="card">
          <h3>💬 Bình luận chương ({chapterLevelComments.length})</h3>
          {replyTarget && (
            <div className="comment-reply-banner">
              <div>
                <strong>{`Đang trả lời @${replyTarget.username || 'người dùng'}`}</strong>
                {replyTarget.content && <span>{replyTarget.content}</span>}
              </div>
              <button
                type="button"
                className="comment-reply-cancel"
                onClick={() => setReplyTarget(null)}
              >
                Hủy
              </button>
            </div>
          )}
          <div className="chapter-comment-toolbar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', marginTop: '0.75rem' }}>
            <input
              ref={commentInputRef}
              className="form-control"
              style={{ flex: 1 }}
              placeholder={
                replyTarget
                  ? `Trả lời @${replyTarget.username || 'người dùng'}...`
                  : 'Viết bình luận...'
              }
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleComment()}
            />
            <button
              className="btn btn-outline"
              style={{ minWidth: '64px' }}
              onClick={() => {
                setShowGifPicker((v) => !v);
                if (!showGifPicker) {
                  setGifResults([]);
                  setGifSearch('');
                  loadTrendingGifs();
                }
              }}
            >
              GIF
            </button>
            <button className="btn btn-primary" onClick={handleComment} disabled={sending}>Gửi</button>
          </div>
          {selectedGifUrl && (
            <div className="chapter-gif-preview" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <img src={selectedGifUrl} alt="gif" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: '8px' }} />
              <button className="btn btn-outline" onClick={() => { setSelectedGifUrl(null); setSelectedGifSize(null); }}>Xóa GIF</button>
            </div>
          )}
          {showGifPicker && (
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem', background: 'var(--bg-card)' }}>
              <div className="chapter-gif-search" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  className="form-control"
                  placeholder="Tìm GIF..."
                  value={gifSearch}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (searchTimer.current) clearTimeout(searchTimer.current);
                    searchTimer.current = setTimeout(() => searchGifs(value), 350);
                    setGifSearch(value);
                  }}
                />
                <button className="btn btn-outline" onClick={() => searchGifs(gifSearch)}>Tìm</button>
              </div>
              {gifError && <p style={{ color: 'var(--warning)', margin: '0 0 0.4rem 0' }}>{gifError}</p>}
              {gifLoading && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>?ang t?i GIF...</p>}
              {!gifLoading && !gifError && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {['funny', 'meme', 'wow', 'sad', 'celebrate', 'cute'].map((tag) => (
                    <button
                      key={tag}
                      className="btn btn-outline"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      onClick={() => { setGifSearch(tag); searchGifs(tag); }}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
              <div className="chapter-gif-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto' }}>
                {gifResults.map((g) => (
                  <div key={g.id} style={{ position: 'relative', width: '100%', height: '90px' }}>
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: '8px', opacity: 0.4
                    }} />
                    <img
                      src={g.images?.downsized?.url}
                      alt={g.title}
                      loading="lazy"
                      style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer', border: selectedGifUrl === g.images?.downsized?.url ? '2px solid var(--accent)' : '1px solid var(--border)' }}
                      onLoad={(e) => { e.currentTarget.previousSibling.style.display = 'none'; }}
                      onClick={() => {
                        const size = parseInt(g.images?.downsized?.size || '0', 10);
                        if (size > 2 * 1024 * 1024) {
                          alert('GIF lớn hơn 2MB, chọn GIF khác.');
                          return;
                        }
                        const probe = new Image();
                        probe.onload = () => {
                          setSelectedGifUrl(g.images?.downsized?.url);
                          setSelectedGifSize(size || null);
                          setShowGifPicker(false);
                        };
                        probe.onerror = () => alert('Không tải được GIF này, thử cái khác.');
                        probe.src = g.images?.downsized?.url;
                      }}
                      onError={(e) => {
                        const fallback = g.images?.downsized?.url;
                        if (fallback && e.target.src !== fallback) e.target.src = fallback;
                      }}
                    />
                  </div>
                ))}
                {!gifLoading && gifResults.length === 0 && gifSearch && <p style={{ color: 'var(--text-secondary)' }}>Không tìm thấy GIF.</p>}
              </div>
            </div>
          )}
          <CommentThread
            comments={visibleComments}
            currentUser={user}
            showChapterBadge
            highlightCommentId={highlightedCommentId}
            commentDomIdPrefix="chapter-comment"
            onReply={handleReplyComment}
            onDelete={handleDeleteComment}
            emptyText="Chưa có bình luận nào cho chương này."
          />
          {chapterRootCommentCount > visibleCount && (
            <button
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => setVisibleCount((v) => Math.min(chapterRootCommentCount, v + 5))}
            >
              Xem thêm ({chapterRootCommentCount - visibleCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
