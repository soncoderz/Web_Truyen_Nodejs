import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import BookmarkIcon from '../components/BookmarkIcon';
import CommentComposer from '../components/CommentComposer';
import CommentIdentity from '../components/CommentIdentity';
import ReactionBar from '../components/ReactionBar';
import { useAuth } from '../context/AuthContext';
import useReactionSummaries from '../hooks/useReactionSummaries';
import useBookmarks, { getBookmarkLocation } from '../hooks/useBookmarks';
import {
  getStory, getChaptersByStory, getCommentsByStory, getStoryRating, getUserRating,
  incrementViews, followStory, isFollowing, createComment, rateStory,
  createMomoTopUp, createReport, confirmMomoTopUp, getReadingHistoryByStory,
  getRelatedStories, getWalletSummary, rentStory, supportAuthor, unlockChapter,
  unlockChapterBundle, unlockLicensedStory
} from '../services/api';
import { toast, toastFromError } from '../services/toast';
import {
  REALTIME_EVENTS,
  subscribeCommentTargets,
  unsubscribeCommentTargets,
} from '../services/realtime';
import { calculateStoryCoinPrice } from '../utils/rewards';
import { buildStoryReactionTarget } from '../utils/reactions';

const SUPPORT_MIN_AMOUNT = 1000;

function normalizeMoney(value) {
  return Math.max(0, Number(value) || 0);
}

function roundBundlePrice(value) {
  const amount = normalizeMoney(value);
  if (!amount) {
    return 0;
  }
  return Math.max(1000, Math.round(amount / 1000) * 1000);
}

function getActiveRentalEntry(entries, storyId) {
  const now = Date.now();
  return (Array.isArray(entries) ? entries : []).find((entry) => {
    if (!entry?.storyId || String(entry.storyId) !== String(storyId)) {
      return false;
    }
    const expiresAt = new Date(entry.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt > now;
  }) || null;
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

function buildBundleOffers(story, chapters, purchasedChapterIds) {
  if (!story?.chapterBundleEnabled) {
    return [];
  }

  const bundleSize = Math.max(2, Number(story.chapterBundleSize) || 3);
  const discountPercent = Math.min(90, Math.max(0, Number(story.chapterBundleDiscountPercent) || 15));
  const purchasedSet = new Set((Array.isArray(purchasedChapterIds) ? purchasedChapterIds : []).map(String));
  const payableChapters = (Array.isArray(chapters) ? chapters : [])
    .filter((chapter) => normalizeMoney(chapter?.accessPrice) > 0 && chapter?.accessMode && chapter.accessMode !== 'FREE')
    .sort((left, right) => Number(left.chapterNumber || 0) - Number(right.chapterNumber || 0));

  const offers = [];
  for (let index = 0; index < payableChapters.length; index += bundleSize) {
    const group = payableChapters.slice(index, index + bundleSize);
    if (group.length < 2) {
      continue;
    }

    const chapterIds = group.map((chapter) => chapter.id).filter(Boolean);
    const originalPrice = group.reduce(
      (sum, chapter) => sum + normalizeMoney(chapter.accessPrice),
      0,
    );
    const price = roundBundlePrice(originalPrice * ((100 - discountPercent) / 100));
    const unlockedCount = chapterIds.filter((chapterId) => purchasedSet.has(String(chapterId))).length;

    offers.push({
      id: `${story.id}:${chapterIds[0]}:${chapterIds[chapterIds.length - 1]}`,
      title: `Combo Ch.${group[0].chapterNumber} - Ch.${group[group.length - 1].chapterNumber}`,
      chapterIds,
      chapters: group,
      chapterCount: group.length,
      originalPrice,
      price,
      discountPercent,
      unlockedCount,
      fullyOwned: unlockedCount >= chapterIds.length,
    });
  }

  return offers;
}

export default function StoryDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const storyReactionTarget = useMemo(() => buildStoryReactionTarget(id), [id]);
  const { getSummary, loadingTarget, reactToTarget } = useReactionSummaries({
    targets: storyReactionTarget ? [storyReactionTarget] : [],
    user,
  });
  const { getStoryBookmark } = useBookmarks(user);
  const [story, setStory] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [comments, setComments] = useState([]);
  const [rating, setRating] = useState({ averageRating: 0, totalRatings: 0 });
  const [userRating, setUserRating] = useState(0);
  const [following, setFollowing] = useState(false);
  const [relatedStories, setRelatedStories] = useState([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [commentSending, setCommentSending] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [readingHistoryItem, setReadingHistoryItem] = useState(null);
  const [walletSummary, setWalletSummary] = useState(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(1000);
  const [supportAmount, setSupportAmount] = useState(10000);
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

  useEffect(() => {
    if (!id) {
      return undefined;
    }

    const target = { scope: 'STORY', storyId: id };
    const accessToken = user?.accessToken || user?.token || null;
    const socket = subscribeCommentTargets(target, accessToken);
    if (!socket) {
      return undefined;
    }

    const handleCommentCreated = (payload) => {
      if (
        String(payload?.scope || '').toUpperCase() !== 'STORY' ||
        String(payload?.storyId || '') !== String(id) ||
        !payload?.comment
      ) {
        return;
      }

      setComments((prev) => prependComment(prev, payload.comment));
    };

    const handleCommentDeleted = (payload) => {
      if (
        String(payload?.scope || '').toUpperCase() !== 'STORY' ||
        String(payload?.storyId || '') !== String(id) ||
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
  }, [id, user?.accessToken, user?.token]);

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

  const handleRentStory = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      setPaymentBusy(true);
      const response = await rentStory(id);
      const expiresAt = response.data?.expiresAt;
      toast.success('Da thue truyen thanh cong.');
      setPaymentMessage(
        expiresAt
          ? `Da thue truyen den ${new Date(expiresAt).toLocaleString('vi-VN')}.`
          : 'Da thue truyen thanh cong.',
      );
      await loadStory();
    } catch (error) {
      toastFromError(error, 'Khong the thue truyen nay.');
      setPaymentMessage(
        error?.response?.data?.message || 'Khong the thue truyen nay.',
      );
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleUnlockChapter = async (chapter) => {
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      setPaymentBusy(true);
      await unlockChapter(chapter.id);
      toast.success(`Da mo khoa Chuong ${chapter.chapterNumber}.`);
      setPaymentMessage(`Da mo khoa Chuong ${chapter.chapterNumber}.`);
      await loadStory();
    } catch (error) {
      toastFromError(error, 'Khong the mo khoa chuong nay.');
      setPaymentMessage(
        error?.response?.data?.message || 'Khong the mo khoa chuong nay.',
      );
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleUnlockBundle = async (bundleOffer) => {
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      setPaymentBusy(true);
      await unlockChapterBundle(id, bundleOffer.chapterIds);
      toast.success(`Da mua ${bundleOffer.title}.`);
      setPaymentMessage(`Da mo khoa ${bundleOffer.title}.`);
      await loadStory();
    } catch (error) {
      toastFromError(error, 'Khong the mua combo chuong nay.');
      setPaymentMessage(
        error?.response?.data?.message || 'Khong the mua combo chuong nay.',
      );
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleSupportAuthor = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if ((Number(supportAmount) || 0) < SUPPORT_MIN_AMOUNT) {
      setPaymentMessage('So tien ung ho toi thieu la 1.000 VND.');
      return;
    }

    try {
      setPaymentBusy(true);
      await supportAuthor(id, Number(supportAmount));
      toast.success('Da ung ho tac gia thanh cong.');
      setPaymentMessage(
        `Da gui ${Number(supportAmount).toLocaleString('vi-VN')} VND den tac gia.`,
      );
      await loadStory();
    } catch (error) {
      toastFromError(error, 'Khong the ung ho tac gia luc nay.');
      setPaymentMessage(
        error?.response?.data?.message || 'Khong the ung ho tac gia luc nay.',
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
    let createdComment = null;
    try {
      setCommentSending(true);
      const response = await createComment({
        storyId: id,
        content: newComment,
        gifUrl: selectedGifUrl || null,
        gifSize: selectedGifSize || null,
      });
      createdComment = response.data || null;
      if (createdComment) {
        setComments((prev) => prependComment(prev, createdComment));
      } else {
        const cmRes = await getCommentsByStory(id);
        setComments(cmRes.data);
      }
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
      setCommentSending(false);
    }
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

  if (loading) return <div className="loading"><div className="spinner" />Đang tải...</div>;
  if (!story) return <div className="container"><p>{loadError || 'Không tìm thấy truyện.'}</p></div>;
  const storyBookmark = getStoryBookmark(id);
  const continueChapter =
    chapters.find((chapterItem) => chapterItem.id === readingHistoryItem?.chapterId) || null;
  const readingNotePreview = story?.type === 'MANGA' ? '' : (readingHistoryItem?.note?.trim() || '');
  const isAdminUser = Boolean(user?.roles?.includes('ROLE_ADMIN'));
  const isStoryOwner = Boolean(user?.id && story?.uploaderId === user.id);
  const unlockPrice = normalizeMoney(story?.unlockPrice);
  const isLicensedStory = Boolean(story?.licensed) && unlockPrice > 0;
  const walletBalance = normalizeMoney(walletSummary?.balance);
  const coinBalance = normalizeMoney(walletSummary?.coinBalance);
  const storyCoinPrice = calculateStoryCoinPrice(story);
  const purchasedStoryIds = Array.isArray(walletSummary?.purchasedStoryIds)
    ? walletSummary.purchasedStoryIds
    : [];
  const purchasedChapterIds = Array.isArray(walletSummary?.purchasedChapterIds)
    ? walletSummary.purchasedChapterIds
    : [];
  const activeRental = getActiveRentalEntry(walletSummary?.rentedStoryAccesses, id);
  const rentalPrice = normalizeMoney(story?.rentalPrice);
  const rentalEnabled = Boolean(story?.rentalEnabled) && rentalPrice > 0;
  const supportEnabled = Boolean(story?.supportEnabled);
  const supportTotalAmount = normalizeMoney(story?.supportTotalAmount);
  const supportCount = normalizeMoney(story?.supportCount);
  const isStoryUnlocked =
    !isLicensedStory ||
    isAdminUser ||
    isStoryOwner ||
    purchasedStoryIds.includes(id) ||
    Boolean(activeRental);
  const chapterBundleOffers = [];
  const hasCommercePanel =
    isLicensedStory || rentalEnabled || supportEnabled;
  const canOpenReader = chapters.length > 0 && isStoryUnlocked;
  const storyReactionSummary = storyReactionTarget
    ? getSummary(storyReactionTarget)
    : null;
  const walletShortfall = Math.max(unlockPrice - walletBalance, 0);
  const coinShortfall = Math.max(storyCoinPrice - coinBalance, 0);
  const rentalShortfall = Math.max(rentalPrice - walletBalance, 0);
  const formattedRentalExpiry = activeRental
    ? new Date(activeRental.expiresAt).toLocaleDateString('vi-VN')
    : '';
  const commerceTitle = isLicensedStory
    ? 'Truyện tính phí'
    : rentalEnabled
      ? 'Thuê truyện 7 ngày'
      : 'Ủng hộ tác giả';
  const commerceStateLabel = isStoryUnlocked
    ? activeRental
      ? 'Đang thuê'
      : 'Đã mở khóa'
    : isLicensedStory
      ? 'Premium'
      : rentalEnabled
        ? 'Cho thuê'
        : 'Mở';
  const commerceDescription = isStoryUnlocked
    ? activeRental
      ? `Bạn đang thuê truyện này đến ${formattedRentalExpiry} và có thể đọc toàn bộ chương.`
      : isAdminUser
        ? 'Tài khoản quản trị có thể đọc toàn bộ truyện này.'
        : isStoryOwner
          ? 'Bạn là người đăng truyện này và có toàn quyền truy cập.'
          : 'Bạn đã mở khóa truyện này và có thể đọc tất cả chương.'
    : isLicensedStory
      ? `Mở khóa trọn bộ với ${unlockPrice.toLocaleString('vi-VN')} VND${storyCoinPrice > 0 ? ` hoặc ${storyCoinPrice.toLocaleString('vi-VN')} xu` : ''}.`
      : rentalEnabled
        ? `Thuê truyện trong 7 ngày với ${rentalPrice.toLocaleString('vi-VN')} VND để đọc toàn bộ chương.`
        : 'Bạn có thể ủng hộ tác giả trực tiếp từ ví.';

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
          {hasCommercePanel && (
            <div className="story-commerce-panel">
              <div className="story-commerce-head">
                <div className="story-commerce-copy">
                  <div className="story-commerce-kicker">
                    <strong>{commerceTitle}</strong>
                    <span className={`story-commerce-state ${isStoryUnlocked ? 'is-open' : 'is-locked'}`}>
                      {commerceStateLabel}
                    </span>
                  </div>
                  <p className="story-commerce-description">{commerceDescription}</p>
                </div>
                {user && (
                  <div className="story-commerce-wallet">
                    <span className="story-commerce-wallet-label">Số dư ví</span>
                    <strong className="story-commerce-wallet-balance">
                      {walletBalance.toLocaleString('vi-VN')} VND
                    </strong>
                    <span className="story-commerce-wallet-coins">
                      {coinBalance.toLocaleString('vi-VN')} xu
                    </span>
                  </div>
                )}
              </div>
              <div className="story-commerce-badges">
                {isLicensedStory && (
                  <span className="story-commerce-badge is-warning">
                    Mua trọn bộ {unlockPrice.toLocaleString('vi-VN')} VND
                  </span>
                )}
                {storyCoinPrice > 0 && isLicensedStory && (
                  <span className="story-commerce-badge is-accent">
                    Mở khóa bằng {storyCoinPrice.toLocaleString('vi-VN')} xu
                  </span>
                )}
                {rentalEnabled && (
                  <span className="story-commerce-badge is-accent">
                    Thuê 7 ngày {rentalPrice.toLocaleString('vi-VN')} VND
                  </span>
                )}
                {supportEnabled && (
                  <span className="story-commerce-badge">
                    Ủng hộ tác giả mở
                  </span>
                )}
                {activeRental && (
                  <span className="story-commerce-badge is-open">
                    Đã thuê đến {formattedRentalExpiry}
                  </span>
                )}
              </div>
              <div className="story-commerce-actions">
                {!isStoryUnlocked && !user && (
                  <Link to="/login" className="btn btn-primary">
                    Đăng nhập để mở khóa
                  </Link>
                )}
                {!isStoryUnlocked && user && isLicensedStory && walletBalance >= unlockPrice && (
                  <button className="btn btn-primary" onClick={handleUnlockStory} disabled={paymentBusy}>
                    {paymentBusy ? 'Đang xử lý...' : `Mua truyện ${unlockPrice.toLocaleString('vi-VN')} VND`}
                  </button>
                )}
                {!isStoryUnlocked && user && isLicensedStory && walletBalance < unlockPrice && (
                  <button className="btn btn-primary" onClick={handleOpenTopUp} disabled={paymentBusy}>
                    Nạp MoMo
                  </button>
                )}
                {!isStoryUnlocked && user && isLicensedStory && storyCoinPrice > 0 && coinBalance >= storyCoinPrice && (
                  <button
                    className="btn btn-outline"
                    onClick={() => handleUnlockStory('COINS')}
                    disabled={paymentBusy}
                  >
                    {paymentBusy ? 'Đang xử lý...' : `Mở khóa bằng ${storyCoinPrice.toLocaleString('vi-VN')} xu`}
                  </button>
                )}
                {!isStoryUnlocked && user && rentalEnabled && walletBalance >= rentalPrice && (
                  <button className="btn btn-outline" onClick={handleRentStory} disabled={paymentBusy}>
                    {paymentBusy ? 'Đang xử lý...' : `Thuê 7 ngày ${rentalPrice.toLocaleString('vi-VN')} VND`}
                  </button>
                )}
                {supportEnabled && !user && (
                  <Link to="/login" className="btn btn-outline">
                    Đăng nhập để ủng hộ
                  </Link>
                )}
                {supportEnabled && user && !isStoryOwner && (
                  <div className="story-support-inline">
                    <input
                      className="form-control story-support-input"
                      type="number"
                      min={SUPPORT_MIN_AMOUNT}
                      step="1000"
                      value={supportAmount}
                      onChange={(event) => setSupportAmount(Number(event.target.value) || 0)}
                    />
                    <button className="btn btn-outline" onClick={handleSupportAuthor} disabled={paymentBusy}>
                      {paymentBusy ? 'Đang xử lý...' : 'Ủng hộ tác giả'}
                    </button>
                  </div>
                )}
              </div>
              <div className="story-commerce-note-row">
                {!isStoryUnlocked && user && isLicensedStory && walletShortfall > 0 && (
                  <span className="story-commerce-note is-warning">
                    Còn thiếu {walletShortfall.toLocaleString('vi-VN')} VND để mua
                  </span>
                )}
                {!isStoryUnlocked && user && isLicensedStory && storyCoinPrice > 0 && coinShortfall > 0 && (
                  <span className="story-commerce-note is-accent">
                    Còn thiếu {coinShortfall.toLocaleString('vi-VN')} xu để mở khóa
                  </span>
                )}
                {!isStoryUnlocked && user && rentalEnabled && rentalShortfall > 0 && (
                  <span className="story-commerce-note is-accent">
                    Thiếu {rentalShortfall.toLocaleString('vi-VN')} VND để thuê 7 ngày
                  </span>
                )}
                {supportEnabled && user && isStoryOwner && (
                  <span className="story-commerce-note">
                    Bạn là tác giả của truyện này.
                  </span>
                )}
              </div>
              {paymentMessage && (
                <p className="story-commerce-message">{paymentMessage}</p>
              )}
            </div>
          )}
          {false && hasCommercePanel && (
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
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {isLicensedStory && (
                  <span className="status-badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                    Mua truyen {unlockPrice.toLocaleString('vi-VN')} VND
                  </span>
                )}
                {rentalEnabled && (
                  <span className="status-badge" style={{ background: 'var(--accent-soft-2)', color: 'var(--accent)' }}>
                    Thue 7 ngay {rentalPrice.toLocaleString('vi-VN')} VND
                  </span>
                )}
                {supportEnabled && (
                  <span className="status-badge" style={{ background: 'var(--bg-glass)', color: 'var(--text-primary)' }}>
                    Ung ho tac gia mo
                  </span>
                )}
                {activeRental && (
                  <span className="status-badge" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                    Da thue den {new Date(activeRental.expiresAt).toLocaleDateString('vi-VN')}
                  </span>
                )}
              </div>
              {paymentMessage && (
                <p style={{ margin: '0.75rem 0 0', color: 'var(--warning)' }}>{paymentMessage}</p>
              )}{/*
              {supportEnabled && (
                <div
                  style={{
                    marginTop: '0.85rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong>Ung ho tac gia</strong>
                      <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)' }}>
                        Da nhan {supportTotalAmount.toLocaleString('vi-VN')} VND tu {supportCount.toLocaleString('vi-VN')} luot.
                      </p>
                    </div>
                    {!isStoryOwner && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          className="form-control"
                          type="number"
                          min={SUPPORT_MIN_AMOUNT}
                          step="1000"
                          value={supportAmount}
                          onChange={(event) => setSupportAmount(Number(event.target.value) || 0)}
                          style={{ width: '160px' }}
                        />
                        <button className="btn btn-outline" onClick={handleSupportAuthor} disabled={paymentBusy}>
                          Ung ho
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}{/*
                          {offer.chapterCount} chuong · giam {offer.discountPercent}% · da co {offer.unlockedCount}/{offer.chapterCount}
*/}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {canOpenReader && (
              <Link to={`/story/${id}/chapter/${chapters[0].id}`} className="btn btn-primary">📖 Đọc từ đầu</Link>
            )}
            {false && !isStoryUnlocked && !user && (
              <Link to="/login" className="btn btn-primary">Đăng nhập để mua</Link>
            )}
            {false && !isStoryUnlocked && user && walletBalance >= unlockPrice && (
              <button className="btn btn-primary" onClick={handleUnlockStory} disabled={paymentBusy}>
                {paymentBusy ? 'Đang xử lý...' : `Mua truyện ${unlockPrice.toLocaleString('vi-VN')} VND`}
              </button>
            )}
            {false && !isStoryUnlocked && user && storyCoinPrice > 0 && coinBalance >= storyCoinPrice && (
              <button
                className="btn btn-outline"
                onClick={() => handleUnlockStory('COINS')}
                disabled={paymentBusy}
              >
                {paymentBusy ? 'Đang xử lý...' : `Mở khóa bằng ${storyCoinPrice.toLocaleString('vi-VN')} xu`}
              </button>
            )}
            {false && !isStoryUnlocked && user && walletBalance < unlockPrice && (
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
            {false && !isStoryUnlocked && user && storyCoinPrice > 0 && coinBalance < storyCoinPrice && (
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
            {false && !isStoryUnlocked && user && rentalEnabled && walletBalance >= rentalPrice && (
              <button className="btn btn-outline" onClick={handleRentStory} disabled={paymentBusy}>
                {paymentBusy ? 'Dang xu ly...' : `Thue 7 ngay ${rentalPrice.toLocaleString('vi-VN')} VND`}
              </button>
            )}
            {false && !isStoryUnlocked && user && rentalEnabled && walletBalance < rentalPrice && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.65rem 0.9rem',
                  borderRadius: '999px',
                  background: 'var(--accent-soft-2)',
                  color: 'var(--accent)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                Thieu {(rentalPrice - walletBalance).toLocaleString('vi-VN')} VND de thue 7 ngay
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
          {storyReactionTarget && storyReactionSummary && (
            <div style={{ marginTop: '1rem' }}>
              <ReactionBar
                summary={storyReactionSummary}
                loading={loadingTarget(storyReactionTarget)}
                promptLabel="Cam xuc voi truyen"
                onReact={(emotion) => reactToTarget(storyReactionTarget, emotion)}
              />
            </div>
          )}
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
          {!isStoryUnlocked && chapters.some((chapter) => chapter.accessMode && chapter.accessMode !== 'FREE') && (
            <p style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
              Cac chuong gan nhan "Mua rieng" hoac "Early access" co the mo khoa tung chuong ma khong can mua tron bo.
            </p>
          )}
          {chapters.length > 0 ? (
            <ul className="chapter-list">
              {chapters.map(ch => (
                <li key={ch.id} className="chapter-item" style={{ alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {ch.canRead ? (
                    <Link to={`/story/${id}/chapter/${ch.id}`} className="chapter-title" style={{ textDecoration: 'none', color: 'inherit' }}>
                      Chương {ch.chapterNumber}: {ch.title}
                    </Link>
                  ) : (
                    <span className="chapter-title" style={{ color: 'var(--text-secondary)', cursor: 'not-allowed' }}>
                      Chương {ch.chapterNumber}: {ch.title}
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
                    <span
                      className="status-badge"
                      style={{
                        background:
                          ch.accessMode === 'EARLY_ACCESS'
                            ? 'var(--warning-bg)'
                            : ch.accessMode === 'PURCHASE'
                              ? 'var(--accent-soft-2)'
                              : 'var(--bg-glass)',
                        color:
                          ch.accessMode === 'EARLY_ACCESS'
                            ? 'var(--warning)'
                            : ch.accessMode === 'PURCHASE'
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                      }}
                    >
                      {ch.accessMode === 'EARLY_ACCESS'
                        ? `Early access · ${normalizeMoney(ch.accessPrice).toLocaleString('vi-VN')} VND`
                        : ch.accessMode === 'PURCHASE'
                          ? `Mua rieng · ${normalizeMoney(ch.accessPrice).toLocaleString('vi-VN')} VND`
                          : 'Mo theo truyện'}
                    </span>
                    {!ch.canRead && ch.lockReason && (
                      <span className="status-badge" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                        {ch.lockReason === 'EARLY_ACCESS_REQUIRED'
                          ? 'Can mo khoa early access'
                          : ch.lockReason === 'CHAPTER_PURCHASE_REQUIRED'
                            ? 'Can mua rieng chuong'
                            : 'Can mo khoa truyện'}
                      </span>
                    )}
                    {!ch.canRead && ch.accessMode !== 'FREE' && (
                      user ? (
                        <button className="btn btn-sm btn-outline" onClick={() => handleUnlockChapter(ch)} disabled={paymentBusy}>
                          Mua chuong
                        </button>
                      ) : (
                        <Link to="/login" className="btn btn-sm btn-outline">Dang nhap de mua</Link>
                      )
                    )}
                    {!ch.canRead && ch.accessMode === 'FREE' && rentalEnabled && user && (
                      <button className="btn btn-sm btn-outline" onClick={handleRentStory} disabled={paymentBusy}>
                        Thue 7 ngay
                      </button>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                      {new Date(ch.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p>Chưa có chương nào.</p>}
        </div>
      )}

      {/* Comments */}
      {tab === 'comments' && (
        <div className="card">
          <CommentComposer
            placeholder="Viết bình luận... (có thể bình luận nhiều lần)"
            submitting={commentSending}
            onSubmit={handleComment}
          />
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
