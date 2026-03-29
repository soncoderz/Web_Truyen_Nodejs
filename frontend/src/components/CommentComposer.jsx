import { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import { searchGifs, trendingGifs } from '../services/api';

const MAX_GIF_SIZE_BYTES = 2 * 1024 * 1024;
const GIF_RESULT_LIMIT = 12;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const TRENDING_CACHE_TTL_MS = 5 * 60 * 1000;
const GIF_TAGS = ['funny', 'meme', 'wow', 'sad', 'celebrate', 'cute'];
const gifFeedCache = new Map();

function normalizeSearchQuery(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function getCacheEntry(cacheKey) {
  const cachedEntry = gifFeedCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    gifFeedCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.value;
}

function setCacheEntry(cacheKey, value, ttlMs) {
  gifFeedCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  if (gifFeedCache.size > 40) {
    const oldestKey = gifFeedCache.keys().next().value;
    if (oldestKey) {
      gifFeedCache.delete(oldestKey);
    }
  }

  return value;
}

async function loadGifFeed(mode, query, signal) {
  const cacheKey = `${mode}:${query.toLowerCase()}:${GIF_RESULT_LIMIT}`;
  const cachedResults = getCacheEntry(cacheKey);
  if (cachedResults) {
    return cachedResults;
  }

  const response =
    mode === 'search'
      ? await searchGifs(query, GIF_RESULT_LIMIT, { signal, silent: true })
      : await trendingGifs(GIF_RESULT_LIMIT, { signal, silent: true });
  const nextResults = Array.isArray(response.data?.data) ? response.data.data : [];

  return setCacheEntry(
    cacheKey,
    nextResults,
    mode === 'search' ? SEARCH_CACHE_TTL_MS : TRENDING_CACHE_TTL_MS,
  );
}

function getGifPreviewUrl(gif) {
  return gif?.previewUrl || gif?.stillUrl || gif?.url || '';
}

export default function CommentComposer({
  placeholder = 'Viết bình luận...',
  submitLabel = 'Gửi',
  submitting = false,
  onSubmit,
  toolbarClassName = '',
  toolbarStyle = undefined,
  previewClassName = '',
  searchClassName = '',
  gridClassName = '',
}) {
  const [content, setContent] = useState('');
  const [selectedGif, setSelectedGif] = useState(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const deferredGifSearch = useDeferredValue(gifSearch);
  const pickerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!showGifPicker) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setShowGifPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showGifPicker]);

  useEffect(() => {
    if (!showGifPicker) {
      return undefined;
    }

    const query = normalizeSearchQuery(deferredGifSearch);
    if (query.startsWith('http')) {
      setGifLoading(false);
      setGifError('Từ khóa quá dài hoặc là URL, hãy nhập ngắn hơn.');
      startTransition(() => setGifResults([]));
      return undefined;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    const controller = new AbortController();
    const fetchDelayMs = query ? 220 : 0;
    const fetchTimer = setTimeout(async () => {
      setGifLoading(true);
      setGifError('');

      try {
        const nextResults = await loadGifFeed(
          query ? 'search' : 'trending',
          query,
          controller.signal,
        );

        if (requestIdRef.current !== currentRequestId || controller.signal.aborted) {
          return;
        }

        startTransition(() => setGifResults(nextResults));
      } catch (error) {
        if (controller.signal.aborted || requestIdRef.current !== currentRequestId) {
          return;
        }

        console.error(error);
        startTransition(() => setGifResults([]));
        setGifError(query ? 'Không tải được GIF. Thử lại sau.' : 'Không tải được GIF nổi bật.');
      } finally {
        if (!controller.signal.aborted && requestIdRef.current === currentRequestId) {
          setGifLoading(false);
        }
      }
    }, fetchDelayMs);

    return () => {
      controller.abort();
      clearTimeout(fetchTimer);
    };
  }, [deferredGifSearch, reloadKey, showGifPicker]);

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent && !selectedGif?.url) {
      return;
    }

    try {
      const submitted = await onSubmit?.({
        content: trimmedContent,
        gifUrl: selectedGif?.url || null,
        gifSize: selectedGif?.size || null,
        gif: selectedGif,
      });

      if (submitted !== true) {
        return;
      }

      setContent('');
      setSelectedGif(null);
      setShowGifPicker(false);
      setGifSearch('');
      setGifError('');
    } catch (error) {
      console.error(error);
    }
  };

  const handleSelectGif = (gif) => {
    const gifSize = Number(gif?.size || 0);
    if (gifSize > MAX_GIF_SIZE_BYTES) {
      alert('GIF lớn hơn 2MB, vui lòng chọn GIF nhỏ hơn.');
      return;
    }

    setSelectedGif(gif);
    setShowGifPicker(false);
  };

  return (
    <div ref={pickerRef}>
      <div
        className={toolbarClassName}
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          ...toolbarStyle,
        }}
      >
        <input
          className="form-control"
          style={{ flex: 1 }}
          placeholder={placeholder}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleSubmit();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-outline"
          style={{ minWidth: '64px' }}
          onClick={() => setShowGifPicker((value) => !value)}
        >
          GIF
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Đang gửi...' : submitLabel}
        </button>
      </div>

      {selectedGif?.url && (
        <div
          className={previewClassName}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '0.75rem',
          }}
        >
          <img
            src={getGifPreviewUrl(selectedGif)}
            alt={selectedGif.title || 'gif'}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            style={{
              width: 96,
              height: 96,
              objectFit: 'cover',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
            }}
            onError={(event) => {
              if (selectedGif.url && event.currentTarget.src !== selectedGif.url) {
                event.currentTarget.src = selectedGif.url;
              }
            }}
          />
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setSelectedGif(null)}
          >
            Xóa GIF
          </button>
        </div>
      )}

      {showGifPicker && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '0.75rem',
            marginBottom: '1rem',
            background: 'var(--bg-card)',
          }}
        >
          <div
            className={searchClassName}
            style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}
          >
            <input
              className="form-control"
              placeholder="Tìm GIF..."
              value={gifSearch}
              onChange={(event) => setGifSearch(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              Tìm
            </button>
          </div>

          {gifError && (
            <p style={{ color: 'var(--warning)', margin: '0 0 0.4rem 0' }}>{gifError}</p>
          )}
          {gifLoading && (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Đang tải GIF...</p>
          )}

          {!gifLoading && !gifError && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {GIF_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    setGifSearch(tag);
                    setReloadKey((value) => value + 1);
                  }}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div
            className={gridClassName}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '0.4rem',
              maxHeight: '260px',
              overflowY: 'auto',
            }}
          >
            {gifResults.map((gif) => {
              const previewUrl = getGifPreviewUrl(gif);
              const isSelected = selectedGif?.url === gif.url;

              return (
                <button
                  key={gif.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelectGif(gif)}
                  style={{
                    padding: 0,
                    width: '100%',
                    height: '90px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: isSelected
                      ? '2px solid var(--accent)'
                      : '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src={previewUrl}
                    alt={gif.title || 'gif'}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={(event) => {
                      if (gif.stillUrl && event.currentTarget.src !== gif.stillUrl) {
                        event.currentTarget.src = gif.stillUrl;
                        return;
                      }

                      if (gif.url && event.currentTarget.src !== gif.url) {
                        event.currentTarget.src = gif.url;
                      }
                    }}
                  />
                </button>
              );
            })}

            {!gifLoading && gifResults.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                {normalizeSearchQuery(gifSearch)
                  ? 'Không tìm thấy GIF.'
                  : 'Chưa có GIF gợi ý.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
