import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import BookmarkIcon from '../components/BookmarkIcon';
import CommentComposer from '../components/CommentComposer';
import CommentIdentity from '../components/CommentIdentity';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import useBookmarks, { getBookmarkLocation } from '../hooks/useBookmarks';
import { markChapterAsRead } from '../utils/readingStorage';
import { repairMojibakeText } from '../utils/textRepair';
import {
  createComment,
  deleteReaderNote,
  getChapter,
  getChaptersByStory,
  getCommentsByPage,
  getReaderNotesByChapter,
  getCommentsByStory,
  getReadingHistoryByStory,
  getStory,
  saveReaderNote,
  saveReadingHistory,
} from '../services/api';
import { toast, toastFromError } from '../services/toast';

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

function normalizeReadingNote(note) {
  if (typeof note !== 'string') {
    return '';
  }

  return note.replace(/\r\n/g, '\n').trim();
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

function MangaPageWithComments({
  page,
  idx,
  storyId,
  chapterId,
  user,
  pageRef,
  bookmarkItem = null,
  noteItem = null,
  bookmarked = false,
  bookmarkBusy = false,
  noteBusy = false,
  initialComments = [],
  showBookmarkToggle = true,
  showCommentToggle = true,
  onPageCommentsChange,
  onSaveBookmark,
  onRemoveBookmark,
  onSaveNote,
  onDeleteNote,
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [text, setText] = useState('');
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
  const bookmarkLabel = `Trang ${idx + 1}`;
  const savedPageNote = getBookmarkDisplayNote(noteItem?.note, bookmarkLabel);
  const fallbackBookmarkNote = getBookmarkDisplayNote(bookmarkItem?.note, bookmarkLabel);
  const noteText = savedPageNote || fallbackBookmarkNote;
  const noteFromBookmarkFallback = !savedPageNote && Boolean(fallbackBookmarkNote);
  const hasPageNote = Boolean(noteText);
  const busy = bookmarkBusy || noteBusy;

  useEffect(() => {
    setCommentCount(initialComments.length);
    if (!open) {
      setComments(initialComments);
    }
  }, [initialComments, open]);

  useEffect(() => {
    if (!showCommentToggle) {
      setOpen(false);
    }
  }, [showCommentToggle]);

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
    try {
      setSending(true);
      await createComment({
        storyId,
        chapterId,
        pageIndex: idx,
        content: text.trim(),
      });
      setText('');
      await loadPageComments();
      toast.success('Đã gửi bình luận.');
    } catch (e) {
      console.error(e);
      toastFromError(e, 'Không gửi được bình luận.');
    }
    setSending(false);
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
        className="manga-page-media"
        ref={pageRef}
        style={{
          position: 'relative',
          flex: '1 1 0',
          minWidth: 0,
          width: '100%',
          maxWidth: '900px',
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

      {showCommentToggle && (
      <div
        className={`page-comment-panel ${open ? 'open' : ''}`}
        ref={panelRef}
        style={{
          width: open ? '100%' : '0px',
          maxWidth: open ? '340px' : '0px',
          maxHeight: open ? '600px' : '0px',
          opacity: open ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-width 0.3s ease, opacity 0.25s ease, max-height 0.3s ease',
          flex: open ? '1 1 340px' : '0 0 0px',
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
              ) : comments.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', margin: '1.25rem 0' }}>
                  Chưa có bình luận nào cho trang này.
                </p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} style={{ padding: '0.55rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.55rem',
                        alignItems: 'center',
                        marginBottom: '0.25rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <CommentIdentity comment={comment} compact />
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                        {new Date(comment.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                      {comment.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="page-comment-input-row" style={{
              padding: '0.75rem 0.9rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: '0.45rem',
              background: 'var(--bg-header)',
            }}>
              <input
                ref={inputRef}
                className="form-control"
                style={{ flex: 1, fontSize: '0.84rem' }}
                placeholder="Viết bình luận theo trang..."
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
  const noteSaveTimer = useRef(null);
  const noteHydratedRef = useRef(false);
  const lastSavedNoteRef = useRef('');

  // Reader settings
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState('Georgia');
  const [bgColor, setBgColor] = useState('');
  const [textColor, setTextColor] = useState('');
  const [lineHeight, setLineHeight] = useState(1.8);
  const [showSettings, setShowSettings] = useState(false);
  const mangaPageRefs = useRef({});
  const paragraphRefs = useRef({});

  useEffect(() => {
    loadChapter();
  }, [chapterId, storyId, user]);

  useEffect(() => {
    setPageCommentsCache({});
    setPageNotes({});
    setNoteProcessingKeys([]);
    setMissionUpdate(null);
  }, [chapterId]);

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
    return () => {
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
        getCommentsByStory(storyId),
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
    () => repairMojibakeText(story?.title || ''),
    [story?.title],
  );
  const displayChapterTitle = useMemo(
    () => repairMojibakeText(chapter?.title || ''),
    [chapter?.title],
  );
  const paragraphBlocks = useMemo(
    () => (
      isManga
        ? []
        : splitChapterContentIntoParagraphs(
            repairMojibakeText(chapter?.content || ''),
          )
    ),
    [chapter?.content, isManga],
  );
  const targetPageIndex = Number.parseInt(searchParams.get('page') || '', 10);
  const targetParagraphIndex = Number.parseInt(searchParams.get('paragraph') || '', 10);
  const bookmarkTargetPage = Number.isInteger(targetPageIndex) ? targetPageIndex - 1 : null;
  const bookmarkTargetParagraph = Number.isInteger(targetParagraphIndex)
    ? targetParagraphIndex - 1
    : null;
  const currentStoryBookmark = getStoryBookmark(storyId);
  const readerTopOffset = 'var(--header-height, 64px)';
  const chapterComments = comments.filter((comment) => comment.chapterId === chapterId);
  const pageCommentsByIndex = {};
  chapterComments.forEach((comment) => {
    if (comment.chapterId === chapterId && comment.pageIndex !== null && comment.pageIndex !== undefined) {
      if (!pageCommentsByIndex[comment.pageIndex]) pageCommentsByIndex[comment.pageIndex] = [];
      pageCommentsByIndex[comment.pageIndex].push(comment);
    }
  });
  const visibleComments = chapterComments.filter((comment) => comment.pageIndex === null || comment.pageIndex === undefined);
  const makePageNoteKey = (pageIndex, paragraphIndex = null) =>
    `${chapterId || ''}::${pageIndex ?? ''}::${paragraphIndex ?? ''}`;
  const isPageNoteProcessing = (pageIndex, paragraphIndex = null) =>
    noteProcessingKeys.includes(makePageNoteKey(pageIndex, paragraphIndex));

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
    if (isManga && bookmarkTargetPage !== null && bookmarkTargetPage >= 0) {
      targetNode = mangaPageRefs.current[bookmarkTargetPage] || null;
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
  }, [bookmarkTargetPage, bookmarkTargetParagraph, isManga, loading, chapterId]);

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

  const handleComment = async ({ content, gifUrl, gifSize }) => {
    const newComment = content || '';
    const selectedGifUrl = gifUrl || null;
    const selectedGifSize = gifSize || null;

    if (!user) {
      alert('Vui lòng đăng nhập!');
      return false;
    }

    if (!newComment.trim() && !selectedGifUrl) {
      return false;
    }

    if (selectedGifSize && selectedGifSize > 2 * 1024 * 1024) {
      alert('GIF lớn hơn 2MB, vui lòng chọn GIF nhỏ hơn.');
      return false;
    }

    try {
      setSending(true);
      await createComment({
        storyId,
        chapterId,
        chapterNumber: chapter?.chapterNumber,
        content: newComment,
        gifUrl: selectedGifUrl || null,
        gifSize: selectedGifSize || null,
      });
      const cmRes = await getCommentsByStory(storyId);
      setComments(cmRes.data);
      setVisibleCount(5);
      toast.success('Đã gửi bình luận.');
      return true;
    } catch (e) {
      if (e?.response?.status === 401) {
        alert('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
        return false;
      }
      toastFromError(e, 'Không gửi được bình luận.');
      return false;
    } finally {
      setSending(false);
    }
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
          <label>Nền: <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} /></label>
          <label>Chữ: <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} /></label>
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
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {paragraph}
                    </p>
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
          <h3>💬 Bình luận truyện ({visibleComments.length})</h3>
          <CommentComposer
            placeholder="Viết bình luận..."
            submitting={sending}
            onSubmit={handleComment}
            toolbarClassName="chapter-comment-toolbar"
            toolbarStyle={{ marginTop: '0.75rem' }}
            previewClassName="chapter-gif-preview"
            searchClassName="chapter-gif-search"
            gridClassName="chapter-gif-grid"
          />
          {visibleComments.slice(0, visibleCount).map((c) => (
            <div key={c.id} style={{ padding: '0.8rem', borderBottom: '1px solid var(--border)', marginBottom: '0.4rem' }}>
              <div
                className="chapter-comment-item-header"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  alignItems: 'center',
                  marginBottom: '0.35rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <CommentIdentity comment={c} />
                  {c.chapterNumber && (
                    <span style={{
                      background: 'var(--bg-card)',
                      color: 'var(--accent)',
                      borderRadius: '999px',
                      padding: '0.1rem 0.55rem',
                      fontSize: '0.72rem',
                      border: '1px solid var(--border)'
                    }}>
                      Chương {c.chapterNumber}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {new Date(c.createdAt).toLocaleString('vi-VN')}
                </span>
              </div>
              {c.content && (
                <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{c.content}</p>
              )}
              {c.gifUrl && (!c.gifSize || c.gifSize <= 2 * 1024 * 1024) && (
                <img
                  className="chapter-comment-gif"
                  src={c.gifUrl}
                  alt="gif"
                  loading="lazy"
                  decoding="async"
                  style={{
                    marginTop: '0.35rem',
                    width: '180px',
                    height: '120px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    objectFit: 'cover'
                  }}
                  onError={(e) => {
                    if (c.gifUrl && e.target.src !== c.gifUrl) e.target.src = c.gifUrl;
                  }}
                />
              )}
              {c.gifUrl && c.gifSize && c.gifSize > 2 * 1024 * 1024 && (
                <p style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: 'var(--warning)' }}>
                  GIF &gt; 2MB không hiển thị.
                </p>
              )}
            </div>
          ))}
          {visibleComments.length > visibleCount && (
            <button
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => setVisibleCount((v) => Math.min(visibleComments.length, v + 5))}
            >
              Xem thêm ({visibleComments.length - visibleCount})
            </button>
          )}
          {visibleComments.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Chưa có bình luận nào cho truyện này.</p>}
        </div>
      </div>
    </div>
  );
}
