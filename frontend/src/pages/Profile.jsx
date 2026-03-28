import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BookmarkIcon from '../components/BookmarkIcon';
import RankedAvatar from '../components/RankedAvatar';
import { useAuth } from '../context/AuthContext';
import useBookmarks, { getBookmarkLocation } from '../hooks/useBookmarks';
import {
  confirmMomoTopUp,
  createMomoTopUp,
  deleteReadingHistoryItem,
  equipProfileSkin,
  exchangeWalletToCoins,
  getChapter,
  getChaptersByStory,
  getFollowedStories,
  getReadingHistory,
  getStory,
  getWalletSummary,
  unlockProfileSkin,
} from '../services/api';
import { toast, toastFromError } from '../services/toast';
import { getReadChapters } from '../utils/readingStorage';

function isValidMongoId(id) {
  return Boolean(id) && typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';

  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} ngày truoc`;

  return new Date(dateStr).toLocaleDateString('vi-VN');
}

function buildBookmarkStory(bookmark) {
  const story = bookmark?.story || null;
  const fallbackTitle = story?.title || 'Truyện không còn khả dụng';

  return {
    id: story?.id || '',
    title: fallbackTitle,
    coverImage: story?.coverImage || '',
    type: story?.type || null,
    views: typeof story?.views === 'number' ? story.views : null,
    averageRating:
      typeof story?.averageRating === 'number' ? story.averageRating : null,
  };
}

function getBookmarkNote(bookmark) {
  if (bookmark?.textSnippet) {
    return bookmark.textSnippet;
  }

  const note = bookmark?.note?.trim();
  if (!note) {
    return '';
  }

  const storyTitle = bookmark?.story?.title?.trim();
  if (storyTitle && note === storyTitle) {
    return '';
  }

  if (/^(?:Trang|Doan|Đoạn)\s+\d+$/i.test(note)) {
    return '';
  }

  return note;
}

function getBookmarkLocationLabel(bookmark) {
  const chapterNumber = bookmark?.chapter?.chapterNumber;
  const chapterLabel =
    typeof chapterNumber === 'number' ? `Ch.${chapterNumber}` : bookmark?.chapter?.title || '';

  if (typeof bookmark?.pageIndex === 'number') {
    return chapterLabel
      ? `${chapterLabel} · Trang ${bookmark.pageIndex + 1}`
      : `Trang ${bookmark.pageIndex + 1}`;
  }

  if (typeof bookmark?.paragraphIndex === 'number') {
    return chapterLabel
      ? `${chapterLabel} · Đoạn ${bookmark.paragraphIndex + 1}`
      : `Đoạn ${bookmark.paragraphIndex + 1}`;
  }

  return chapterLabel;
}

function getBookmarkAction(bookmark) {
  if (!bookmark?.story?.id) {
    return { href: '#', label: 'Không khả dụng', disabled: true };
  }

  if (bookmark.chapterId && !bookmark.chapter?.id) {
    return { href: '#', label: 'Không mở được vị trí', disabled: true };
  }

  if (bookmark.chapter?.id) {
    const params = new URLSearchParams();
    if (typeof bookmark.pageIndex === 'number') {
      params.set('page', String(bookmark.pageIndex + 1));
    }
    if (typeof bookmark.paragraphIndex === 'number') {
      params.set('paragraph', String(bookmark.paragraphIndex + 1));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';

    return {
      href: `/story/${bookmark.story.id}/chapter/${bookmark.chapter.id}${suffix}`,
      label: typeof bookmark.pageIndex === 'number'
        ? `Đọc Trang ${bookmark.pageIndex + 1}`
        : typeof bookmark.paragraphIndex === 'number'
          ? `Đọc Đoạn ${bookmark.paragraphIndex + 1}`
          : typeof bookmark.chapter.chapterNumber === 'number'
            ? `Đọc Ch.${bookmark.chapter.chapterNumber}`
            : 'Đọc ngay',
      disabled: false,
    };
  }

  return {
    href: `/story/${bookmark.story.id}`,
    label: 'Đọc ngay',
    disabled: false,
  };
}

function getBookmarkChapterLabel(bookmark) {
  if (typeof bookmark?.chapter?.chapterNumber === 'number') {
    const chapterTitle = bookmark?.chapter?.title?.trim();
    return chapterTitle
      ? `Ch.${bookmark.chapter.chapterNumber}: ${chapterTitle}`
      : `Ch.${bookmark.chapter.chapterNumber}`;
  }

  const chapterTitle = bookmark?.chapter?.title?.trim();
  if (chapterTitle) {
    return chapterTitle;
  }

  if (bookmark?.chapterId) {
    return 'Chương đã lưu';
  }

  return 'Bookmark tong quat';
}

function getBookmarkPositionLabel(bookmark) {
  const { pageIndex, paragraphIndex } = getBookmarkLocation(bookmark);

  if (typeof pageIndex === 'number') {
    return `Trang ${pageIndex + 1}`;
  }

  if (typeof paragraphIndex === 'number') {
    return `Đoạn ${paragraphIndex + 1}`;
  }

  return 'Vị trí đã lưu';
}

function getBookmarkProfileAction(bookmark) {
  if (!bookmark?.story?.id) {
    return { href: '#', label: 'Không khả dụng', disabled: true };
  }

  if (bookmark.chapterId && !bookmark.chapter?.id) {
    return { href: '#', label: 'Không mở được vị trí', disabled: true };
  }

  if (bookmark.chapter?.id) {
    const { pageIndex, paragraphIndex } = getBookmarkLocation(bookmark);
    const params = new URLSearchParams();
    if (typeof pageIndex === 'number') {
      params.set('page', String(pageIndex + 1));
    }
    if (typeof paragraphIndex === 'number') {
      params.set('paragraph', String(paragraphIndex + 1));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';

    return {
      href: `/story/${bookmark.story.id}/chapter/${bookmark.chapter.id}${suffix}`,
      label: 'Đọc',
      disabled: false,
    };
  }

  return {
    href: `/story/${bookmark.story.id}`,
    label: 'Đọc',
    disabled: false,
  };
}

function getEquippedProfileSkin(walletSummary) {
  return (
    walletSummary?.profileSkins?.find((skin) => skin.equipped) ||
    walletSummary?.profileSkins?.[0] ||
    null
  );
}

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'history');
  const [history, setHistory] = useState([]);
  const [followedStories, setFollowedStories] = useState([]);
  const [purchasedStories, setPurchasedStories] = useState([]);
  const [chaptersMap, setChaptersMap] = useState({});
  const [purchasedChaptersMap, setPurchasedChaptersMap] = useState({});
  const [storyCache, setStoryCache] = useState({});
  const [chapterCache, setChapterCache] = useState({});
  const [walletSummary, setWalletSummary] = useState(null);
  const [skinBusyId, setSkinBusyId] = useState('');
  const [topUpAmount, setTopUpAmount] = useState(1000);
  const [exchangeAmount, setExchangeAmount] = useState(1000);
  const [financeBusy, setFinanceBusy] = useState(false);
  const [financeMessage, setFinanceMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const {
    bookmarks,
    loading: bookmarksLoading,
    isProcessing: isBookmarkProcessing,
    toggleBookmark,
  } = useBookmarks(user);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      navigate('/login');
      return;
    }

    loadData();
  }, [user, authLoading]);

  useEffect(() => {
    const nextTab = searchParams.get('tab');
    if (nextTab) {
      setTab(nextTab);
    }
  }, [searchParams]);

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

        setFinanceMessage(
          response.data?.status === 'COMPLETED'
            ? 'Nạp tiền vào ví thành công.'
            : response.data?.message || 'Giao dịch MoMo chưa thành công.',
        );
        if (response.data?.status === 'COMPLETED') {
          toast.success('Đã nạp tiền vào ví.');
        } else {
          toast.info(response.data?.message || 'Giao dịch MoMo chưa hoàn tất.');
        }
        await loadData();
      } catch (error) {
        if (!cancelled) {
          toastFromError(error, 'Không xác nhận được giao dịch MoMo.');
          setFinanceMessage(
            error?.response?.data?.message || 'Không xác nhận được giao dịch MoMo.',
          );
        }
      } finally {
        if (!cancelled) {
          navigate('/profile?tab=rewards', { replace: true });
        }
      }
    };

    confirmPayment();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  const loadData = async () => {
    setLoading(true);

    try {
      const [historyRes, followedRes, walletRes] = await Promise.all([
        getReadingHistory(),
        getFollowedStories(),
        getWalletSummary(),
      ]);

      const historyItems = historyRes.data || [];
      const followedItems = (followedRes.data || []).filter((story) => story?.id || story?._id);
      const wallet = walletRes.data || null;
      const purchasedIds = wallet?.purchasedStoryIds || [];

      setHistory(historyItems);
      setFollowedStories(followedItems);
      setWalletSummary(wallet);

      const storyIds = Array.from(
        new Set(historyItems.map((item) => item.storyId).filter(isValidMongoId)),
      );

      const storyResults = await Promise.all(
        storyIds.map((storyId) =>
          getStory(storyId, { optional: true })
            .then((response) => ({ storyId, story: response.data }))
            .catch(() => ({ storyId, story: null })),
        ),
      );

      const nextStoryCache = {};
      storyResults.forEach(({ storyId, story }) => {
        nextStoryCache[storyId] = story;
      });
      setStoryCache(nextStoryCache);

      const chapterIds = Array.from(
        new Set(historyItems.map((item) => item.chapterId).filter(isValidMongoId)),
      );

      const chapterResults = await Promise.all(
        chapterIds.map((chapterId) =>
          getChapter(chapterId, { optional: true })
            .then((response) => ({ chapterId, chapter: response.data }))
            .catch(() => ({ chapterId, chapter: null })),
        ),
      );

      const nextChapterCache = {};
      chapterResults.forEach(({ chapterId, chapter }) => {
        nextChapterCache[chapterId] = chapter;
      });
      setChapterCache(nextChapterCache);

      if (followedItems.length > 0) {
        const followedChapterResults = await Promise.all(
          followedItems.map((story) =>
            getChaptersByStory(story.id || story._id)
              .then((response) => ({
                storyId: story.id || story._id,
                chapters: response.data || [],
              }))
              .catch(() => ({ storyId: story.id || story._id, chapters: [] })),
          ),
        );

        const nextChaptersMap = {};
        followedChapterResults.forEach(({ storyId, chapters }) => {
          const sorted = [...chapters].sort(
            (a, b) => b.chapterNumber - a.chapterNumber,
          );
          nextChaptersMap[storyId] = sorted.slice(0, 2);
        });
        setChaptersMap(nextChaptersMap);
      } else {
        setChaptersMap({});
      }

      if (purchasedIds.length > 0) {
        const purchasedStoryResults = await Promise.all(
          purchasedIds.map((storyId) =>
            getStory(storyId, { optional: true })
              .then((response) => response.data)
              .catch(() => null),
          ),
        );

        const purchasedItems = purchasedStoryResults.filter((story) => story?.id);
        setPurchasedStories(purchasedItems);

        const purchasedChapterResults = await Promise.all(
          purchasedItems.map((story) =>
            getChaptersByStory(story.id)
              .then((response) => ({
                storyId: story.id,
                chapters: response.data || [],
              }))
              .catch(() => ({ storyId: story.id, chapters: [] })),
          ),
        );

        const nextPurchasedChaptersMap = {};
        purchasedChapterResults.forEach(({ storyId, chapters }) => {
          const sorted = [...chapters].sort(
            (a, b) => b.chapterNumber - a.chapterNumber,
          );
          nextPurchasedChaptersMap[storyId] = sorted.slice(0, 2);
        });
        setPurchasedChaptersMap(nextPurchasedChaptersMap);
      } else {
        setPurchasedStories([]);
        setPurchasedChaptersMap({});
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = async (id) => {
    try {
      await deleteReadingHistoryItem(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      toast.success('Đã xóa lịch sử đọc.');
    } catch (error) {
      toastFromError(error, 'Không xóa được lịch sử đọc.');
    }
  };

  const handleDeleteBookmark = async (bookmark) => {
    try {
      await toggleBookmark({
        storyId: bookmark.storyId,
        chapterId: bookmark.chapterId,
        pageIndex: bookmark.pageIndex,
        paragraphIndex: bookmark.paragraphIndex,
      });
    } catch (error) {
      alert('Không cập nhật được bookmark.');
    }
  };

  const mergeWalletSummary = (payload) => {
    if (!payload) {
      return;
    }

    setWalletSummary((prev) => ({
      ...(prev || {}),
      ...payload,
      profileSkins: payload.profileSkins || prev?.profileSkins || [],
    }));
  };

  const handleStartWalletTopUp = async () => {
    if ((Number(topUpAmount) || 0) < 1000) {
      setFinanceMessage('So tien nap toi thieu la 1.000 VND.');
      return;
    }

    try {
      setFinanceBusy(true);
      setFinanceMessage('');
      const response = await createMomoTopUp({
        amount: Number(topUpAmount),
        returnPath: '/profile?tab=rewards',
      });
      const payUrl = response.data?.payUrl;
      if (!payUrl) {
        throw new Error('Không tạo được link thanh toán MoMo.');
      }

      window.location.assign(payUrl);
    } catch (error) {
      toastFromError(error, 'Không tạo được giao dịch MoMo.');
      setFinanceMessage(
        error?.response?.data?.message || error.message || 'Không tạo được giao dịch MoMo.',
      );
      setFinanceBusy(false);
    }
  };

  const handleExchangeToCoins = async () => {
    if ((Number(exchangeAmount) || 0) < 1000) {
      setFinanceMessage('So tien doi toi thieu la 1.000 VND.');
      return;
    }

    try {
      setFinanceBusy(true);
      setFinanceMessage('');
      const response = await exchangeWalletToCoins(Number(exchangeAmount));
      mergeWalletSummary(response.data || null);
      toast.success(
        `Đã đổi ${Number(exchangeAmount).toLocaleString('vi-VN')} VND thành ${Number(response.data?.receivedCoins || 0).toLocaleString('vi-VN')} xu.`,
      );
      setFinanceMessage(
        `Đã đổi ${Number(exchangeAmount).toLocaleString('vi-VN')} VND thành ${Number(response.data?.receivedCoins || 0).toLocaleString('vi-VN')} xu.`,
      );
    } catch (error) {
      toastFromError(error, 'Không đổi được tiền trong ví sang xu.');
      setFinanceMessage(
        error?.response?.data?.message || 'Không đổi được tiền trong ví sang xu.',
      );
    } finally {
      setFinanceBusy(false);
    }
  };

  const handleUnlockSkin = async (skinId) => {
    try {
      setSkinBusyId(skinId);
      const response = await unlockProfileSkin(skinId);
      mergeWalletSummary(response.data || null);
      toast.success('Đã mở khóa skin hồ sơ.');
    } catch (error) {
      toastFromError(error, 'Không mở khóa được skin này.');
    } finally {
      setSkinBusyId('');
    }
  };

  const handleEquipSkin = async (skinId) => {
    try {
      setSkinBusyId(skinId);
      const response = await equipProfileSkin(skinId);
      mergeWalletSummary(response.data || null);
      toast.success('Đã đổi giao diện hồ sơ.');
    } catch (error) {
      toastFromError(error, 'Không đổi được skin này.');
    } finally {
      setSkinBusyId('');
    }
  };

  if (!user) {
    return null;
  }

  const pageLoading = loading || bookmarksLoading;
  const activeProfileSkin = getEquippedProfileSkin(walletSummary);
  const mission = walletSummary?.mission || null;
  const badges = walletSummary?.badges || [];
  const profileSkins = walletSummary?.profileSkins || [];
  const coinExchangeRate = Number(walletSummary?.coinExchangeRate || 10);
  const exchangePreviewCoins = Math.floor((Number(exchangeAmount) || 0) / coinExchangeRate);
  const profileHeaderStyle = activeProfileSkin
    ? {
        padding: '1.5rem',
        borderRadius: '24px',
        border: `1px solid ${activeProfileSkin.border}`,
        background: `linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0) 42%), ${activeProfileSkin.background}`,
        boxShadow: `0 24px 44px ${activeProfileSkin.glow || 'rgba(0,0,0,0.18)'}`,
      }
    : {};

  return (
    <div className="container">
      <div className="profile-header profile-rank-header" style={profileHeaderStyle}>
        <RankedAvatar
          user={{ username: user.username, avatar: user.avatar }}
          skin={activeProfileSkin}
          size="xl"
          showRibbon
        />

        <div className="profile-rank-main">
          <div className="profile-rank-copy">
            <h1 style={{ fontSize: '1.7rem', fontWeight: 800 }}>{user.username}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
              {user.email}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
              {user.roles?.map((role) => (
                <span key={role} className="category-tag">
                  {role.replace('ROLE_', '')}
                </span>
              ))}
            </div>
            <div className="profile-rank-chip-row">
              {activeProfileSkin && (
                <span className="profile-rank-chip">
                  Khung {activeProfileSkin.tier || 'Starter'} • {activeProfileSkin.name}
                </span>
              )}
              {mission && (
                <span className="profile-rank-chip">
                  Streak {mission.streak || 0} ngày
                </span>
              )}
              {walletSummary && (
                <span className="profile-rank-chip">
                  Ví {(walletSummary.balance || 0).toLocaleString('vi-VN')} VND
                </span>
              )}
              {walletSummary && (
                <span className="profile-rank-chip">
                  {(walletSummary.coinBalance || 0).toLocaleString('vi-VN')} xu
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              marginTop: '1.1rem',
              flexWrap: 'wrap',
            }}
          >
            <Link to="/studio" className="btn btn-primary btn-sm">
              Đăng truyện và thêm chương
            </Link>
            <Link to={`/users/${user.id}`} className="btn btn-outline btn-sm">
              Xem profile công khai
            </Link>
          </div>
        </div>
      </div>

      <div className="tabs"> 
        <button
          className={`tab ${tab === 'history' ? 'active' : ''}`}
          onClick={() => setTab('history')}
        >
          Lịch sử đọc ({history.length})
        </button>
        <button
          className={`tab ${tab === 'bookmarks' ? 'active' : ''}`}
          onClick={() => setTab('bookmarks')}
        >
          Bookmark ({bookmarks.length})
        </button>
        <button
          className={`tab ${tab === 'following' ? 'active' : ''}`}
          onClick={() => setTab('following')}
        >
          Theo dõi ({followedStories.length})
        </button>
        <button
          className={`tab ${tab === 'purchased' ? 'active' : ''}`}
          onClick={() => setTab('purchased')}
        >
          Da mua ({purchasedStories.length})
        </button>
        <button
          className={`tab ${tab === 'rewards' ? 'active' : ''}`}
          onClick={() => setTab('rewards')}
        >
          Nhiệm vụ và skin
        </button>
      </div>

      {pageLoading ? (
        <div className="loading">
          <div className="spinner" />
          Đang tải...
        </div>
      ) : (
        <>
          {tab === 'history' && (
            <div>
              {history.length > 0 ? (
                <div className="story-grid">
                  {history.map((item) => {
                    const story = storyCache[item.storyId];
                    const chapter = item.chapterId ? chapterCache[item.chapterId] : null;
                    const hasStory = Boolean(story?.id);

                    return (
                      <LibraryStoryCard
                        key={item.id}
                        story={
                          story || {
                            id: '',
                            title: 'Truyện không còn khả dụng',
                            coverImage: '',
                            type: null,
                            views: null,
                            averageRating: null,
                          }
                        }
                        chapter={chapter}
                        note={item.note?.trim() || ''}
                        timestampLabel={`Đọc lần cuối ${formatTimeAgo(item.lastReadAt)}`}
                        actionHref={
                          hasStory
                            ? chapter?.id
                              ? `/story/${story.id}/chapter/${chapter.id}`
                              : `/story/${story.id}`
                            : '#'
                        }
                        actionLabel={
                          hasStory
                            ? chapter?.chapterNumber
                              ? `Đọc tiếp Ch.${chapter.chapterNumber}`
                              : 'Đọc tiếp'
                            : 'Không khả dụng'
                        }
                        actionDisabled={!hasStory}
                        statusLabel={!hasStory ? 'Không còn truy cập' : ''}
                        onDelete={() => handleDeleteHistory(item.id)}
                        deleteLabel="Xóa lịch sử"
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="card">
                  <div className="empty-state">
                    <p>Chưa có lịch sử đọc.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'bookmarks' && (
            <div>
              {bookmarks.length > 0 ? (
                <div className="bookmark-list">
                  {bookmarks.map((bookmark) => {
                    const action = getBookmarkProfileAction(bookmark);

                    return (
                      <BookmarkLibraryItem
                        key={bookmark.id}
                        bookmark={bookmark}
                        story={buildBookmarkStory(bookmark)}
                        chapterLabel={getBookmarkChapterLabel(bookmark)}
                        positionLabel={getBookmarkPositionLabel(bookmark)}
                        note={getBookmarkNote(bookmark)}
                        timestampLabel={`Đã lưu ${formatTimeAgo(bookmark.createdAt)}`}
                        action={action}
                        onDelete={() => handleDeleteBookmark(bookmark)}
                        deleteDisabled={isBookmarkProcessing(
                          bookmark.storyId,
                          bookmark.chapterId,
                          bookmark.pageIndex,
                          bookmark.paragraphIndex,
                        )}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="card">
                  <div className="empty-state">
                    <p>Chưa có bookmark nào.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'following' &&
            (followedStories.length > 0 ? (
              <div className="story-grid">
                {followedStories.map((story) => (
                  <FollowedStoryCard
                    key={story.id}
                    story={story}
                    chapters={chaptersMap[story.id] || []}
                    userId={user?.id}
                  />
                ))}
              </div>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <p>Chua theo doi truyen nao.</p>
                </div>
              </div>
            ))}

          {tab === 'purchased' &&
            (purchasedStories.length > 0 ? (
              <div className="story-grid">
                {purchasedStories.map((story) => (
                  <PurchasedStoryCard
                    key={story.id}
                    story={story}
                    chapters={purchasedChaptersMap[story.id] || []}
                    userId={user?.id}
                  />
                ))}
              </div>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <p>Chua mua truyen nao.</p>
                </div>
              </div>
            ))}

          {tab === 'rewards' && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div
                className="card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      marginBottom: '0.4rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <h2 style={{ fontSize: '1.05rem' }}>Nạp tiền vào ví</h2>
                    <span className="category-tag">
                      Số dư: {(walletSummary?.balance || 0).toLocaleString('vi-VN')} VND
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.85rem' }}>
                    Nạp tiền trực tiếp vào ví để mua premium hoặc đổi sang xu ngay trong hồ sơ.
                  </p>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label>So tien nap (VND)</label>
                    <input
                      className="form-control"
                      type="number"
                      min="1000"
                      step="1000"
                      value={topUpAmount}
                      onChange={(event) => setTopUpAmount(Number(event.target.value) || 0)}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleStartWalletTopUp}
                    disabled={financeBusy}
                  >
                    {financeBusy ? 'Đang tạo giao dịch...' : 'Nạp tiền vào ví'}
                  </button>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      marginBottom: '0.4rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <h2 style={{ fontSize: '1.05rem' }}>Doi tien sang xu</h2>
                    <span className="category-tag">
                      {coinExchangeRate.toLocaleString('vi-VN')} VND = 1 xu
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.85rem' }}>
                    Doi tu vi sang xu de mo khoa premium va mua skin profile.
                  </p>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label>So tien muon doi (VND)</label>
                    <input
                      className="form-control"
                      type="number"
                      min={walletSummary?.coinExchangeMinAmount || 1000}
                      step={coinExchangeRate}
                      value={exchangeAmount}
                      onChange={(event) => setExchangeAmount(Number(event.target.value) || 0)}
                    />
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '0.85rem', fontSize: '0.9rem' }}>
                    Ban se nhan khoang {exchangePreviewCoins.toLocaleString('vi-VN')} xu.
                  </p>
                  <button
                    className="btn btn-outline"
                    onClick={handleExchangeToCoins}
                    disabled={financeBusy}
                  >
                    {financeBusy ? 'Đang xử lý...' : 'Đổi sang xu'}
                  </button>
                </div>

                {financeMessage && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      padding: '0.85rem 1rem',
                      borderRadius: '14px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {financeMessage}
                  </div>
                )}
              </div>

              <div
                className="card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Nhiệm vụ hôm nay
                  </div>
                  <div style={{ fontSize: '1.9rem', fontWeight: 800, marginTop: '0.2rem' }}>
                    {mission?.progressCount || 0}/{mission?.target || 3}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '0.45rem' }}>
                    Đọc đủ {mission?.target || 3} chương trong ngày để nhận{' '}
                    {(mission?.rewardCoins || 120).toLocaleString('vi-VN')} xu.
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Streak hiện tại
                  </div>
                  <div style={{ fontSize: '1.9rem', fontWeight: 800, marginTop: '0.2rem' }}>
                    {mission?.streak || 0} ngày
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '0.45rem' }}>
                    Ky luc: {mission?.longestStreak || 0} ngày lien tiep
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Số dư xu
                  </div>
                  <div style={{ fontSize: '1.9rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--warning)' }}>
                    {(walletSummary?.coinBalance || 0).toLocaleString('vi-VN')}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '0.45rem' }}>
                    Xu dung de mo khoa premium va skin profile.
                  </p>
                </div>
              </div>

              <div className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Huy hiệu streak</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Mở khóa khi gi? streak ??c li?n ti?p.
                    </p>
                  </div>
                  <span className="category-tag">
                    Đã mở khóa {badges.filter((badge) => badge.unlocked).length}/{badges.length}
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.85rem',
                  }}
                >
                  {badges.map((badge) => (
                    <div
                      key={badge.id}
                      style={{
                        padding: '1rem',
                        borderRadius: '16px',
                        border: badge.unlocked
                          ? '1px solid var(--success-border)'
                          : '1px solid var(--border)',
                        background: badge.unlocked
                          ? 'linear-gradient(135deg, var(--success-bg), var(--bg-secondary))'
                          : 'var(--bg-card)',
                        opacity: badge.unlocked ? 1 : 0.72,
                      }}
                    >
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {badge.requiredStreak} ngày
                      </div>
                      <strong style={{ display: 'block', marginTop: '0.35rem' }}>{badge.name}</strong>
                      <p style={{ marginTop: '0.4rem', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                        {badge.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Skin profile</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Mua bang xu va equip ngày trong ho so.
                    </p>
                  </div>
                  {activeProfileSkin && (
                    <span className="category-tag">Đang dùng: {activeProfileSkin.name}</span>
                  )}
                </div>
                <div className="profile-skin-grid">
                  {profileSkins.map((skin) => (
                    <div
                      key={skin.id}
                      className={`profile-skin-card ${skin.equipped ? 'active' : ''}`}
                      style={{
                        '--skin-bg': skin.background,
                        '--skin-border': skin.border,
                        '--skin-glow': skin.glow || 'rgba(0,0,0,0.18)',
                        '--skin-text': skin.textColor,
                      }}
                    >
                      <div className="profile-skin-card-head">
                        <RankedAvatar
                          user={{ username: user.username, avatar: user.avatar }}
                          skin={skin}
                          size="lg"
                          showRibbon
                        />
                        <div className="profile-skin-copy">
                          <div className="profile-skin-tier-row">
                            <span className="profile-skin-pill">{skin.tier || 'Starter'}</span>
                            {skin.equipped && <span className="profile-skin-pill state">Đang dùng</span>}
                            {!skin.owned && <span className="profile-skin-pill state">Chưa mở khóa</span>}
                          </div>
                          <strong>{skin.name}</strong>
                          <p>{skin.description}</p>
                        </div>
                      </div>

                      <div className="profile-skin-meta">
                        <span className="profile-skin-price">
                          {skin.priceCoins > 0
                            ? `${skin.priceCoins.toLocaleString('vi-VN')} xu`
                            : 'Miễn phí'}
                        </span>
                        <span className="profile-skin-crest">
                          Huy hiệu {skin.crest || skin.ribbon || skin.tier || 'I'}
                        </span>
                      </div>

                      <div className="profile-skin-actions">
                        {skin.owned ? (
                          <button
                            className={`btn btn-sm ${skin.equipped ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => handleEquipSkin(skin.id)}
                            disabled={skinBusyId === skin.id || skin.equipped}
                          >
                            {skin.equipped
                              ? 'Đang sử dụng'
                              : skinBusyId === skin.id
                                ? 'Đang cập nhật...'
                                : 'Sử dụng'}
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleUnlockSkin(skin.id)}
                            disabled={skinBusyId === skin.id}
                          >
                            {skinBusyId === skin.id ? 'Đang mở khóa...' : 'Mở khóa'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FollowedStoryCard({ story, chapters, userId }) {
  const readChapters = getReadChapters(userId);
  const recentChapter = chapters?.[0];
  const actionHref = recentChapter
    ? `/story/${story.id}/chapter/${recentChapter.id}`
    : `/story/${story.id}`;

  return (
    <div className="story-card">
      <Link to={`/story/${story.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="story-cover">
          {story.coverImage ? (
            <img
              src={story.coverImage}
              alt={story.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            'Truyện'
          )}
        </div>
        <div className="story-info">
          <h3>{story.title}</h3>
          <div className="story-meta">
            <span
              style={{
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
                fontSize: '0.65rem',
                fontWeight: 700,
                background:
                  story.type === 'MANGA'
                    ? 'var(--badge-manga-bg)'
                    : 'var(--badge-novel-bg)',
                color: story.type === 'MANGA' ? 'var(--warning)' : 'var(--accent)',
              }}
            >
              {story.type === 'MANGA' ? 'Manga' : 'Novel'}
            </span>
            <span>Lượt xem {story.views || 0}</span>
            <span>Đánh giá {story.averageRating || 0}</span>
          </div>
          {recentChapter && (
            <div className="story-meta" style={{ marginTop: 6, fontSize: '0.82rem' }}>
              <strong>Ch.{recentChapter.chapterNumber}</strong> · {recentChapter.title}
            </div>
          )}
        </div>
      </Link>

      {chapters.length > 0 && (
        <div className="story-card-chapters">
          {chapters.map((chapter) => {
            const isRead = readChapters.includes(chapter.id);
            return (
              <Link
                key={chapter.id}
                to={`/story/${story.id}/chapter/${chapter.id}`}
                className={`story-card-chapter ${isRead ? 'read' : 'unread'}`}
                title={`Ch.${chapter.chapterNumber}: ${chapter.title}`}
              >
                <span className="ch-name">Ch.{chapter.chapterNumber}</span>
                <span className="ch-time">{formatTimeAgo(chapter.createdAt)}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="story-card-footer">
        <div className="story-footer-left">
          {recentChapter && (
            <span className="muted">
              Cập nhật {formatTimeAgo(recentChapter.createdAt)}
            </span>
          )}
        </div>
        <div className="story-actions">
          <Link to={actionHref} className="btn btn-sm btn-primary">
            {recentChapter ? `Đọc Ch.${recentChapter.chapterNumber}` : 'Xem truyện'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function PurchasedStoryCard({ story, chapters, userId }) {
  const readChapters = getReadChapters(userId);
  const recentChapter = chapters?.[0];
  const actionHref = recentChapter
    ? `/story/${story.id}/chapter/${recentChapter.id}`
    : `/story/${story.id}`;

  return (
    <div className="story-card">
      <Link to={`/story/${story.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="story-cover">
          {story.coverImage ? (
            <img
              src={story.coverImage}
              alt={story.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            'Truyện'
          )}
        </div>
        <div className="story-info">
          <h3>{story.title}</h3>
          <div className="story-meta">
            <span
              style={{
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
                fontSize: '0.65rem',
                fontWeight: 700,
                background:
                  story.type === 'MANGA'
                    ? 'var(--badge-manga-bg)'
                    : 'var(--badge-novel-bg)',
                color: story.type === 'MANGA' ? 'var(--warning)' : 'var(--accent)',
              }}
            >
              {story.type === 'MANGA' ? 'Manga' : 'Novel'}
            </span>
            <span style={{ color: 'var(--warning)' }}>
              Da mua · {(story.unlockPrice || 0).toLocaleString('vi-VN')} VND
            </span>
          </div>
          {recentChapter && (
            <div className="story-meta" style={{ marginTop: 6, fontSize: '0.82rem' }}>
              <strong>Ch.{recentChapter.chapterNumber}</strong> - {recentChapter.title}
            </div>
          )}
        </div>
      </Link>

      {chapters.length > 0 && (
        <div className="story-card-chapters">
          {chapters.map((chapter) => {
            const isRead = readChapters.includes(chapter.id);
            return (
              <Link
                key={chapter.id}
                to={`/story/${story.id}/chapter/${chapter.id}`}
                className={`story-card-chapter ${isRead ? 'read' : 'unread'}`}
                title={`Ch.${chapter.chapterNumber}: ${chapter.title}`}
              >
                <span className="ch-name">Ch.{chapter.chapterNumber}</span>
                <span className="ch-time">{formatTimeAgo(chapter.createdAt)}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="story-card-footer">
        <div className="story-footer-left">
          <span className="muted">
            {recentChapter ? `Cập nhật ${formatTimeAgo(recentChapter.createdAt)}` : 'Đã mở khóa'}
          </span>
        </div>
        <div className="story-actions">
          <Link to={actionHref} className="btn btn-sm btn-primary">
            {recentChapter ? `Đọc Ch.${recentChapter.chapterNumber}` : 'Đọc truyện'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function LibraryStoryCard({
  story,
  chapter,
  detailLabel,
  actionHref,
  actionLabel,
  actionDisabled = false,
  timestampLabel,
  note,
  statusLabel,
  showBookmarkBadge = false,
  onDelete,
  deleteLabel,
  deleteDisabled = false,
}) {
  const isManga = story?.type === 'MANGA';
  const hasStory = Boolean(story?.id);
  const hasMeta =
    Boolean(story?.type) ||
    typeof story?.views === 'number' ||
    typeof story?.averageRating === 'number';

  return (
    <div className="story-card">
      <Link
        to={hasStory ? `/story/${story.id}` : '#'}
        onClick={(event) => {
          if (!hasStory) {
            event.preventDefault();
          }
        }}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <div className="story-cover">
          {showBookmarkBadge && (
            <span className="story-bookmark-badge" aria-hidden="true">
              <BookmarkIcon filled className="story-bookmark-badge-icon" />
            </span>
          )}
          {story?.coverImage ? (
            <img
              src={story.coverImage}
              alt={story?.title || 'Truyện'}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            'Bookmark'
          )}
        </div>
        <div className="story-info">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.5rem',
              alignItems: 'flex-start',
            }}
          >
            <h3>{story?.title || 'Truyện không còn khả dụng'}</h3>
            {statusLabel && <span className="story-library-state">{statusLabel}</span>}
          </div>

          {hasMeta && (
            <div className="story-meta">
              {story?.type && (
                <span
                  style={{
                    padding: '0.15rem 0.4rem',
                    borderRadius: '4px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    background: isManga
                      ? 'var(--badge-manga-bg)'
                      : 'var(--badge-novel-bg)',
                    color: isManga ? 'var(--warning)' : 'var(--accent)',
                  }}
                >
                  {isManga ? 'Manga' : 'Novel'}
                </span>
              )}
              {typeof story?.views === 'number' && <span>Lượt xem {story.views}</span>}
              {typeof story?.averageRating === 'number' && (
                <span>Đánh giá {story.averageRating}</span>
              )}
            </div>
          )}

          {detailLabel ? (
            <div className="story-meta" style={{ marginTop: 6, fontSize: '0.82rem' }}>
              <strong>{detailLabel}</strong>
            </div>
          ) : chapter && (
            <div className="story-meta" style={{ marginTop: 6, fontSize: '0.82rem' }}>
              <strong>Ch.{chapter.chapterNumber}</strong> - {chapter.title}
            </div>
          )}

          {note && <div className="story-note">{note}</div>}
        </div>
      </Link>

      <div className="story-card-footer">
        <div className="story-footer-left">
          {timestampLabel && <span className="muted">{timestampLabel}</span>}
        </div>
        <div className="story-actions">
          {actionDisabled ? (
            <span className="btn btn-sm btn-outline btn-disabled">{actionLabel}</span>
          ) : (
            <Link to={actionHref} className="btn btn-sm btn-primary">
              {actionLabel}
            </Link>
          )}
          <button
            className="btn btn-sm btn-outline"
            onClick={onDelete}
            disabled={deleteDisabled}
          >
            {deleteLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BookmarkLibraryItem({
  bookmark,
  story,
  chapterLabel,
  positionLabel,
  note,
  timestampLabel,
  action,
  onDelete,
  deleteDisabled = false,
}) {
  const hasStory = Boolean(story?.id);
  const isManga = story?.type === 'MANGA';
  const typeLabel = story?.type ? (isManga ? 'Manga' : 'Novel') : '';
  const storyHref = hasStory ? `/story/${story.id}` : '#';
  const chapterUnavailable = Boolean(bookmark?.chapterId && !bookmark?.chapter?.id);

  return (
    <article className="bookmark-item">
      <Link
        to={storyHref}
        className={`bookmark-cover-link ${hasStory ? '' : 'disabled'}`.trim()}
        onClick={(event) => {
          if (!hasStory) {
            event.preventDefault();
          }
        }}
      >
        <div className="bookmark-cover-thumb">
          <span className="bookmark-cover-badge" aria-hidden="true">
            <BookmarkIcon filled className="story-bookmark-badge-icon" />
          </span>
          {story?.coverImage ? (
            <img src={story.coverImage} alt={story?.title || 'Bookmark'} />
          ) : (
            <div className="bookmark-cover-fallback">{isManga ? 'M' : 'B'}</div>
          )}
        </div>
      </Link>

      <div className="bookmark-main">
        <div className="bookmark-body">
          <div className="bookmark-title-row">
            <BookmarkIcon filled className="story-detail-bookmark-icon" />
            {hasStory ? (
              <Link to={storyHref} className="bookmark-title">
                {story.title}
              </Link>
            ) : (
              <span className="bookmark-title bookmark-title-muted">{story.title}</span>
            )}
          </div>

          <div className="bookmark-chip-row">
            {chapterLabel && <span className="bookmark-chip">{chapterLabel}</span>}
            {positionLabel && (
              <span className="bookmark-chip bookmark-chip-position">{positionLabel}</span>
            )}
            {typeLabel && <span className="bookmark-chip bookmark-chip-type">{typeLabel}</span>}
          </div>

          {note && <p className="bookmark-note">{note}</p>}

          <div className="bookmark-meta-row">
            {timestampLabel && <span>{timestampLabel}</span>}
            {chapterUnavailable && <span>Không còn truy cập chương đã bookmark</span>}
            {!bookmark?.story && <span>Truyện này không còn khả dụng</span>}
          </div>
        </div>

        <div className="bookmark-action-row">
          {action?.disabled ? (
            <span className="btn btn-sm btn-outline btn-disabled">{action.label}</span>
          ) : (
            <Link to={action.href} className="btn btn-sm btn-outline">
              {action.label}
            </Link>
          )}
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={onDelete}
            disabled={deleteDisabled}
          >
            Xoa
          </button>
        </div>
      </div>
    </article>
  );
}
