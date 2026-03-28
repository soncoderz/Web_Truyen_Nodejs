import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import BookmarkIcon from '../components/BookmarkIcon';
import CommentIdentity from '../components/CommentIdentity';
import { useAuth } from '../context/AuthContext';
import useBookmarks, { getBookmarkLocation } from '../hooks/useBookmarks';
import {
  getStory, getChaptersByStory, getCommentsByStory, getStoryRating, getUserRating,
  incrementViews, followStory, isFollowing, createComment, rateStory,
  createMomoTopUp, createReport, confirmMomoTopUp, getReadingHistoryByStory,
  getRelatedStories, getWalletSummary, unlockLicensedStory
} from '../services/api';
import { toast, toastFromError } from '../services/toast';
import { calculateStoryCoinPrice } from '../utils/rewards';

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY || '';

export default function StoryDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getStoryBookmark } = useBookmarks(user);
  const [story, setStory] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [comments, setComments] = useState([]);
  const [rating, setRating] = useState({ averageRating: 0, totalRatings: 0 });
  const [userRating, setUserRating] = useState(0);
  const [following, setFollowing] = useState(false);
  const [relatedStories, setRelatedStories] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [selectedGifUrl, setSelectedGifUrl] = useState(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState('');
  const [visibleCount, setVisibleCount] = useState(5);
  const [selectedGifSize, setSelectedGifSize] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [readingHistoryItem, setReadingHistoryItem] = useState(null);
  const [walletSummary, setWalletSummary] = useState(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(1000);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('chapters');

  useEffect(() => {
    loadStory();
  }, [id, user]);

  useEffect(() => {
    incrementViews(id).catch(() => {});
  }, [id]);

  useEffect(() => {
    const orderId = searchParams.get('orderId');
    const requestId = searchParams.get('requestId');
    const signature = searchParams.get('signature');

    if (!orderId || !requestId || !signature) {
      return;
    }

    let cancelled = false;

    const confirmPayment = async () => {
      try {
        const payload = Object.fromEntries(searchParams.entries());
        const response = await confirmMomoTopUp(payload);
        if (cancelled) {
          return;
        }

        setPaymentMessage(
          response.data?.status === 'COMPLETED'
            ? 'Nạp tiền MoMo thành công. Số dư đã được cập nhật.'
            : response.data?.message || 'Giao dịch MoMo chưa thành công.',
        );
        if (response.data?.status === 'COMPLETED') {
          toast.success('Đã nạp tiền MoMo thành công.');
        } else {
          toast.info(response.data?.message || 'Giao dịch MoMo chưa hoàn tất.');
        }
        await loadStory();
      } catch (error) {
        if (!cancelled) {
          toastFromError(error, 'Không xác nhận được giao dịch MoMo.');
          setPaymentMessage(
            error?.response?.data?.message || 'Không xác nhận được giao dịch MoMo.',
          );
        }
      } finally {
        if (!cancelled) {
          navigate(`/story/${id}`, { replace: true });
        }
      }
    };

    confirmPayment();

    return () => {
      cancelled = true;
    };
  }, [id, navigate, searchParams]);

  const loadStory = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [
        storyResult,
        chaptersResult,
        commentsResult,
        ratingResult,
        relatedResult,
        historyResult,
        walletResult,
      ] = await Promise.allSettled([
        getStory(id),
        getChaptersByStory(id),
        getCommentsByStory(id),
        getStoryRating(id),
        getRelatedStories(id),
        user ? getReadingHistoryByStory(id) : Promise.resolve({ data: null }),
        user ? getWalletSummary() : Promise.resolve({ data: null }),
      ]);

      if (storyResult.status !== 'fulfilled') {
        throw storyResult.reason;
      }

      setStory(storyResult.value.data || null);
      setChapters(
        chaptersResult.status === 'fulfilled' ? chaptersResult.value.data || [] : [],
      );
      setComments(
        commentsResult.status === 'fulfilled' ? commentsResult.value.data || [] : [],
      );
      setVisibleCount(5);
      setRating(
        ratingResult.status === 'fulfilled'
          ? ratingResult.value.data || { averageRating: 0, totalRatings: 0 }
          : { averageRating: 0, totalRatings: 0 },
      );
      setRelatedStories(
        relatedResult.status === 'fulfilled' ? relatedResult.value.data || [] : [],
      );
      setReadingHistoryItem(
        historyResult.status === 'fulfilled' ? historyResult.value.data || null : null,
      );
      setWalletSummary(
        walletResult.status === 'fulfilled' ? walletResult.value.data || null : null,
      );

      if (user) {
        const [followingResult, userRatingResult] = await Promise.allSettled([
          isFollowing(id),
          getUserRating(id),
        ]);
        setFollowing(
          followingResult.status === 'fulfilled'
            ? Boolean(followingResult.value.data?.isFollowing)
            : false,
        );
        setUserRating(
          userRatingResult.status === 'fulfilled' && userRatingResult.value.data?.score
            ? userRatingResult.value.data.score
            : 0,
        );
      } else {
        setFollowing(false);
        setUserRating(0);
      }
    } catch (e) {
      console.error(e);
      setStory(null);
      setChapters([]);
      setComments([]);
      setRating({ averageRating: 0, totalRatings: 0 });
      setRelatedStories([]);
      setReadingHistoryItem(null);
      setWalletSummary(null);
      setFollowing(false);
      setUserRating(0);
      setLoadError('Không tải được truyện này. Thử tải lại sau.');
    }
    setLoading(false);
  };

  const handleFollow = async () => {
    if (!user) return alert('Vui lòng đăng nhập!');
    try {
      const res = await followStory(id);
      const nextFollowing = Boolean(res.data?.isFollowing);
      setFollowing(nextFollowing);
      toast.success(nextFollowing ? 'Đã theo dõi truyện.' : 'Đã bỏ theo dõi truyện.');
    } catch (error) {
      toastFromError(error, 'Không cập nhật được trạng thái theo dõi.');
    }
  };

  const handleBookmark = async () => {
    if (!user) return alert('Vui lòng đăng nhập!');

    const bookmark = getStoryBookmark(id);
    if (!bookmark?.chapterId) {
      alert('Bookmark duoc dat trong luc doc chuong.');
      return;
    }

    const { pageIndex, paragraphIndex } = getBookmarkLocation(bookmark);
    const params = new URLSearchParams();
    if (typeof pageIndex === 'number') {
      params.set('page', String(pageIndex + 1));
    }
    if (typeof paragraphIndex === 'number') {
      params.set('paragraph', String(paragraphIndex + 1));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    navigate(`/story/${bookmark.storyId}/chapter/${bookmark.chapterId}${suffix}`);
  };

  const handleContinueReading = () => {
    if (!readingHistoryItem?.chapterId) {
      return;
    }

    navigate(`/story/${id}/chapter/${readingHistoryItem.chapterId}`);
  };

  const handleOpenTopUp = () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setPaymentMessage('');
    const requiredAmount = Math.max(
      Number(story?.unlockPrice || 0) - Number(walletSummary?.balance || 0),
      1000,
    );
    setTopUpAmount(requiredAmount);
    setShowTopUpModal(true);
  };

  const handleStartMomoTopUp = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if ((Number(topUpAmount) || 0) < 1000) {
      setPaymentMessage('So tien nap toi thieu la 1.000 VND.');
      return;
    }

    try {
      setPaymentBusy(true);
      const response = await createMomoTopUp({
        amount: Number(topUpAmount),
        returnPath: `/story/${id}`,
      });
      const payUrl = response.data?.payUrl;
      if (!payUrl) {
        throw new Error('Không tạo được link thanh toán MoMo.');
      }

      window.location.assign(payUrl);
    } catch (error) {
      setPaymentBusy(false);
      toastFromError(error, 'Không tạo được giao dịch MoMo.');
      setPaymentMessage(
        error?.response?.data?.message || error.message || 'Không tạo được giao dịch MoMo.',
      );
    }
  };

  const handleUnlockStory = async (paymentMethod = 'WALLET') => {
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      setPaymentBusy(true);
      await unlockLicensedStory(id, paymentMethod);
      toast.success(
        paymentMethod === 'COINS'
          ? 'Đã mở khóa premium bằng xu.'
          : 'Đã mua truyện thành công.',
      );
      setPaymentMessage(
        paymentMethod === 'COINS'
          ? 'Đã mở khóa premium bằng xu.'
          : 'Đã mua truyện thành công.',
      );
      await loadStory();
    } catch (error) {
      toastFromError(error, 'Không mở khóa được nội dung này.');
      setPaymentMessage(
        error?.response?.data?.message || 'Không mở khóa được nội dung này.',
      );
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleRate = async (score) => {
    if (!user) return alert('Vui lòng đăng nhập!');
    try {
      await rateStory({ storyId: id, score });
      setUserRating(score);
      const rRes = await getStoryRating(id);
      setRating(rRes.data);
      toast.success('Đã gửi đánh giá của bạn.');
    } catch (error) {
      toastFromError(error, 'Không gửi được đánh giá.');
    }
  };

  const handleComment = async () => {
    if (!user) return alert('Vui lòng đăng nhập!');
    if (!newComment.trim() && !selectedGifUrl) return;
    if (selectedGifSize && selectedGifSize > 2 * 1024 * 1024) {
      alert('GIF lớn hơn 2MB, vui lòng chọn GIF nhỏ hơn.');
      return;
    }
    try {
      await createComment({ storyId: id, content: newComment, gifUrl: selectedGifUrl || null, gifSize: selectedGifSize || null });
    } catch (e) {
      if (e?.response?.status === 401) {
        alert('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
        return;
      }
      toastFromError(e, 'Không gửi được bình luận.');
      return;
    }
    setNewComment('');
    setSelectedGifUrl(null);
    setSelectedGifSize(null);
    setShowGifPicker(false);
    const cmRes = await getCommentsByStory(id);
    setComments(cmRes.data);
    setVisibleCount(5);
    toast.success('Đã gửi bình luận.');
  };

  const handleReport = async () => {
    if (!reportReason.trim()) return;
    try {
      await createReport({ storyId: id, reason: reportReason });
      setShowReport(false);
      setReportReason('');
      toast.success('Đã gửi báo lỗi cho admin.');
    } catch (error) {
      toastFromError(error, 'Không gửi được báo lỗi.');
    }
  };

  const loadTrendingGifs = async () => {
    setGifError('');
    setGifLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=12&rating=g`);
      const data = await res.json();
      setGifResults(data.data || []);
    } catch (e) { console.error(e); setGifError('Không tải được GIF nổi bật.'); }
    setGifLoading(false);
  };

  const searchGifs = async (keyword) => {
    const q = keyword.trim();
    if (q.startsWith('http') || q.length > 80) {
      setGifError('Từ khóa quá dài hoặc là URL, hãy nhập ngắn hơn.');
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
    } catch (e) { console.error(e); setGifError('Không tải được GIF.'); }
    setGifLoading(false);
  };

  if (loading) return <div className="loading"><div className="spinner" />Đang tải...</div>;
  if (!story) return <div className="container"><p>{loadError || 'Không tìm thấy truyện.'}</p></div>;
  const storyBookmark = getStoryBookmark(id);
  const continueChapter =
    chapters.find((chapterItem) => chapterItem.id === readingHistoryItem?.chapterId) || null;
  const readingNotePreview = story?.type === 'MANGA' ? '' : (readingHistoryItem?.note?.trim() || '');
  const isAdminUser = Boolean(user?.roles?.includes('ROLE_ADMIN'));
  const isStoryOwner = Boolean(user?.id && story?.uploaderId === user.id);
  const unlockPrice = Number(story?.unlockPrice || 0);
  const isLicensedStory = Boolean(story?.licensed) && unlockPrice > 0;
  const walletBalance = Number(walletSummary?.balance || 0);
  const coinBalance = Number(walletSummary?.coinBalance || 0);
  const storyCoinPrice = calculateStoryCoinPrice(story);
  const purchasedStoryIds = walletSummary?.purchasedStoryIds || [];
  const isStoryUnlocked =
    !isLicensedStory || isAdminUser || isStoryOwner || purchasedStoryIds.includes(id);
  const canOpenReader = chapters.length > 0 && isStoryUnlocked;

  return (
    <div className="container">
      {/* Story Header */}
      <div className="card" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div style={{ width: '200px', minWidth: '200px', height: '280px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
          {story.coverImage ? (
            <img src={story.coverImage} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : <div style={{ width: '100%', height: '100%', background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem' }}>📖</div>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{
              padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
              background: story.type === 'MANGA' ? 'var(--badge-manga-bg)' : 'var(--badge-novel-bg)',
              color: story.type === 'MANGA' ? 'var(--warning)' : 'var(--accent)'
            }}>{story.type === 'MANGA' ? '🎨 Truyện Tranh' : '📝 Light Novel'}</span>
            <span className={`status-badge status-${story.status}`}>{story.status === 'COMPLETED' ? 'Hoàn thành' : story.status === 'ONGOING' ? 'Đang ra' : 'Ngừng'}</span>
          </div>
          <h1 style={{ marginBottom: '0.5rem' }}>{story.title}</h1>
          {story.authors?.length > 0 && <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>✍️ {story.authors.map(a => a.name).join(', ')}</p>}
          {story.categories?.length > 0 && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {story.categories.map(c => <span key={c.id} className="category-tag" style={{ fontSize: '0.75rem' }}>{c.name}</span>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <span>👁 {story.views || 0} lượt xem</span>
            <span>📖 {chapters.length} chương</span>
            <span>⭐ {rating.averageRating} ({rating.totalRatings} đánh giá)</span>
            <span>❤️ {story.followers || 0} theo dõi</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '1rem' }}>{story.description}</p>
          {isLicensedStory && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '1rem',
                borderRadius: '14px',
                border: '1px solid var(--warning-border)',
                background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-card))',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: 'var(--warning)' }}>Truyện tính phí</strong>
                  <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {isStoryUnlocked
                      ? 'Bạn đã mua truyện này và có thể đọc tất cả chương.'
                      : `Mua trọn bộ truyện với giá ${unlockPrice.toLocaleString('vi-VN')} VND.`}
                  </p>
                </div>
                {user && (
                  <div style={{ textAlign: 'right', minWidth: '180px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Số dư hiện tại</div>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                      {walletBalance.toLocaleString('vi-VN')} VND
                    </strong>
                    <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--warning)' }}>
                      {coinBalance.toLocaleString('vi-VN')} xu
                    </div>
                  </div>
                )}
              </div>
              {paymentMessage && (
                <p style={{ margin: '0.75rem 0 0', color: 'var(--warning)' }}>{paymentMessage}</p>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {canOpenReader && (
              <Link to={`/story/${id}/chapter/${chapters[0].id}`} className="btn btn-primary">📖 Đọc từ đầu</Link>
            )}
            {!isStoryUnlocked && !user && (
              <Link to="/login" className="btn btn-primary">Đăng nhập để mua</Link>
            )}
            {!isStoryUnlocked && user && walletBalance >= unlockPrice && (
              <button className="btn btn-primary" onClick={handleUnlockStory} disabled={paymentBusy}>
                {paymentBusy ? 'Đang xử lý...' : `Mua truyện ${unlockPrice.toLocaleString('vi-VN')} VND`}
              </button>
            )}
            {!isStoryUnlocked && user && storyCoinPrice > 0 && coinBalance >= storyCoinPrice && (
              <button
                className="btn btn-outline"
                onClick={() => handleUnlockStory('COINS')}
                disabled={paymentBusy}
              >
                {paymentBusy ? 'Đang xử lý...' : `Mở khóa bằng ${storyCoinPrice.toLocaleString('vi-VN')} xu`}
              </button>
            )}
            {!isStoryUnlocked && user && walletBalance < unlockPrice && (
              <>
                <button className="btn btn-primary" onClick={handleOpenTopUp} disabled={paymentBusy}>
                  Nạp MoMo để mua
                </button>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.65rem 0.9rem',
                    borderRadius: '999px',
                    background: 'var(--warning-bg)',
                    color: 'var(--warning)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  Còn thiếu {(unlockPrice - walletBalance).toLocaleString('vi-VN')} VND
                </span>
              </>
            )}
            {!isStoryUnlocked && user && storyCoinPrice > 0 && coinBalance < storyCoinPrice && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.65rem 0.9rem',
                  borderRadius: '999px',
                  background: 'var(--accent-bg)',
                  color: 'var(--accent)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                Còn thieu {(storyCoinPrice - coinBalance).toLocaleString('vi-VN')} xu
              </span>
            )}
            {readingHistoryItem?.chapterId && isStoryUnlocked && (
              <button className="btn btn-outline" onClick={handleContinueReading}>
                {continueChapter?.chapterNumber
                  ? `Đọc tiếp Ch.${continueChapter.chapterNumber}`
                  : 'Đọc tiếp'}
              </button>
            )}
            <button className={`btn ${following ? 'btn-danger' : 'btn-outline'}`} onClick={handleFollow}>
              {following ? '❤️ Đang theo dõi' : '🤍 Theo dõi'}
            </button>
            {isStoryUnlocked && (
              <button
                className={`btn ${storyBookmark ? 'btn-primary' : 'btn-outline'}`}
                onClick={handleBookmark}
              >
                <BookmarkIcon filled={Boolean(storyBookmark)} className="story-detail-bookmark-icon" />
                {storyBookmark ? 'Mở bookmark' : 'Bookmark trong trình đọc'}
              </button>
            )}
            <button className="btn btn-outline" onClick={() => setShowReport(true)} style={{ color: 'var(--warning)' }}>
              Báo lỗi
            </button>
          </div>
          {(readingHistoryItem?.chapterId || readingNotePreview) && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.9rem 1rem',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--accent)' }}>Lần đọc gần đây</strong>
                {readingHistoryItem?.lastReadAt && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {new Date(readingHistoryItem.lastReadAt).toLocaleString('vi-VN')}
                  </span>
                )}
              </div>
              {continueChapter && (
                <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)' }}>
                  Đang đọc đến Chương {continueChapter.chapterNumber}: {continueChapter.title}
                </p>
              )}
              {readingNotePreview && (
                <p
                  style={{
                    margin: '0.6rem 0 0',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {readingNotePreview}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Related Stories */}
      {relatedStories.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>🔗 Phiên bản liên quan</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {relatedStories.map(rs => (
              <Link key={rs.id} to={`/story/${rs.id}`} className="story-card" style={{ textDecoration: 'none', color: 'inherit', maxWidth: '200px' }}>
                <div className="story-cover" style={{ height: '120px' }}>
                  {rs.coverImage ? <img src={rs.coverImage} alt={rs.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📖'}
                </div>
                <div className="story-info">
                  <h3 style={{ fontSize: '0.8rem' }}>{rs.title}</h3>
                  <div className="story-meta">
                    <span style={{
                      padding: '0.1rem 0.3rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700,
                      background: rs.type === 'MANGA' ? 'var(--badge-manga-bg)' : 'var(--badge-novel-bg)',
                      color: rs.type === 'MANGA' ? 'var(--warning)' : 'var(--accent)'
                    }}>{rs.type === 'MANGA' ? '🎨 Manga' : '📝 Novel'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      <div className="card" style={{ marginTop: '1rem', textAlign: 'center' }}>
        <h3>Đánh giá truyện</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Mỗi người chỉ được đánh giá 1 lần</p>
        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', fontSize: '1.8rem', cursor: 'pointer' }}>
          {[1, 2, 3, 4, 5].map(star => (
            <span key={star} onClick={() => handleRate(star)} style={{ color: star <= userRating ? 'var(--warning)' : 'var(--text-secondary)', transition: 'transform 0.2s' }}
              onMouseEnter={e => e.target.style.transform = 'scale(1.2)'} onMouseLeave={e => e.target.style.transform = 'scale(1)'}>★</span>
          ))}
        </div>
        <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
          ⭐ {rating.averageRating} trung bình · {rating.totalRatings} đánh giá
        </p>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginTop: '1.5rem' }}>
        <button className={`tab ${tab === 'chapters' ? 'active' : ''}`} onClick={() => setTab('chapters')}>📖 Danh sách chương ({chapters.length})</button>
        <button className={`tab ${tab === 'comments' ? 'active' : ''}`} onClick={() => setTab('comments')}>💬 Bình luận ({comments.length})</button>
      </div>

      {/* Chapters */}
      {tab === 'chapters' && (
        <div className="card">
          {isLicensedStory && !isStoryUnlocked && (
            <p style={{ marginBottom: '0.75rem', color: 'var(--warning)' }}>
              Mua truyện để đọc các chương bên dưới.
            </p>
          )}
          {chapters.length > 0 ? (
            <ul className="chapter-list">
              {chapters.map(ch => (
                <li key={ch.id} className="chapter-item">
                  {isStoryUnlocked ? (
                    <Link to={`/story/${id}/chapter/${ch.id}`} className="chapter-title" style={{ textDecoration: 'none', color: 'inherit' }}>
                      Chương {ch.chapterNumber}: {ch.title}
                    </Link>
                  ) : (
                    <span className="chapter-title" style={{ color: 'var(--text-secondary)', cursor: 'not-allowed' }}>
                      Chương {ch.chapterNumber}: {ch.title}
                    </span>
                  )}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(ch.createdAt).toLocaleDateString('vi-VN')}</span>
                </li>
              ))}
            </ul>
          ) : <p>Chưa có chương nào.</p>}
        </div>
      )}

      {/* Comments */}
      {tab === 'comments' && (
        <div className="card">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input className="form-control" style={{ flex: 1 }} placeholder="Viết bình luận... (có thể bình luận nhiều lần)" value={newComment} onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleComment()} />
            <button className="btn btn-outline" onClick={() => {
              setShowGifPicker(v => !v);
              if (!showGifPicker) { setGifResults([]); setGifSearch(''); loadTrendingGifs(); }
            }}>GIF</button>
            <button className="btn btn-primary" onClick={handleComment}>Gửi</button>
          </div>
          {selectedGifUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <img src={selectedGifUrl} alt="gif" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: '8px' }} />
              <button className="btn btn-outline" onClick={() => setSelectedGifUrl(null)}>Xóa GIF</button>
            </div>
          )}
          {showGifPicker && (
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  className="form-control"
                  placeholder="Tìm GIF..."
                  value={gifSearch}
                  onChange={(e) => { setGifSearch(e.target.value); searchGifs(e.target.value); }}
                />
                <button className="btn btn-outline" onClick={() => searchGifs(gifSearch)}>Tìm</button>
              </div>
              {gifError && <p style={{ color: 'var(--warning)', margin: '0 0 0.4rem 0' }}>{gifError}</p>}
              {gifLoading && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Đang tải GIF...</p>}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto' }}>
                {gifResults.map(g => (
                  <img
                    key={g.id}
                    src={g.images?.downsized?.url}
                    alt={g.title}
                    loading="lazy"
                    style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer', border: selectedGifUrl === g.images?.downsized?.url ? '2px solid var(--accent)' : '1px solid var(--border)' }}
                    onClick={() => {
                      const size = parseInt(g.images?.downsized?.size || '0', 10);
                      if (size > 2 * 1024 * 1024) {
                        alert('GIF lớn hơn 2MB, chọn GIF khác.');
                        return;
                      }
                      setSelectedGifUrl(g.images?.downsized?.url);
                      setSelectedGifSize(size || null);
                      setShowGifPicker(false);
                    }}
                    onError={(e) => {
                      const fallback = g.images?.downsized?.url;
                      if (fallback && e.target.src !== fallback) e.target.src = fallback;
                    }}
                  />
                ))}
                {!gifLoading && gifResults.length === 0 && gifSearch && <p style={{ color: 'var(--text-secondary)' }}>Không tìm thấy GIF.</p>}
              </div>
            </div>
          )}
          {comments.length > 0 ? comments.slice(0, visibleCount).map(c => (
            <div key={c.id} style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)', marginBottom: '0.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  marginBottom: '0.45rem',
                  alignItems: 'center',
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
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {new Date(c.createdAt).toLocaleString('vi-VN')}
                </span>
              </div>
              <p style={{ margin: 0 }}>{c.content}</p>
              {c.gifUrl && (!c.gifSize || c.gifSize <= 2 * 1024 * 1024) && (
                <img
                  src={c.gifUrl}
                  alt="gif"
                  loading="lazy"
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
          )) : <p>Chưa có bình luận. Hãy là người đầu tiên!</p>}
          {comments.length > visibleCount && (
            <button
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => setVisibleCount((v) => Math.min(comments.length, v + 5))}
            >
              Xem thêm ({comments.length - visibleCount})
            </button>
          )}
        </div>
      )}

      {showTopUpModal && (
        <div className="modal-overlay" onClick={() => !paymentBusy && setShowTopUpModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Nạp tiền bằng MoMo</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Nạp vào ví để mua truyện tính phí. Tiền sẽ được cộng vào số dư sau khi giao dịch thành công.
            </p>
            <div className="form-group">
              <label>So tien nap (VND)</label>
              <input
                className="form-control"
                type="number"
                min="1000"
                step="1000"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(Number(e.target.value) || 0)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowTopUpModal(false)} disabled={paymentBusy}>
                Hủy
              </button>
              <button className="btn btn-primary" onClick={handleStartMomoTopUp} disabled={paymentBusy}>
                {paymentBusy ? 'Đang tạo giao dịch...' : 'Tiếp tục với MoMo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReport && (
        <div className="modal-overlay" onClick={() => setShowReport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>⚠️ Báo lỗi nội dung</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nội dung sẽ được gửi đến admin để xử lý.</p>
            <div className="form-group">
              <label>Lý do</label>
              <textarea className="form-control" value={reportReason} onChange={e => setReportReason(e.target.value)}
                placeholder="Mô tả lỗi chi tiết..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowReport(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleReport}>Gửi báo lỗi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
