import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getNotifications,
  getWalletSummary,
  markAllAsRead,
  markAsRead,
} from '../services/api';
import { connectRealtime, disconnectRealtime, REALTIME_EVENTS } from '../services/realtime';
import { toast } from '../services/toast';
import { useTheme } from '../context/ThemeContext';

function getNotificationTarget(notification) {
  if (notification?.storyId && notification?.chapterId) {
    return `/story/${notification.storyId}/chapter/${notification.chapterId}`;
  }

  if (notification?.storyId) {
    return `/story/${notification.storyId}`;
  }

  return null;
}

function getNotificationCover(notification) {
  return notification?.storyCoverImage || null;
}

function getNotificationHeadline(notification) {
  if (notification?.storyTitle) {
    return notification.storyTitle;
  }

  return "Truyen moi cap nhat";
}

function getNotificationSubline(notification) {
  if (Number.isFinite(Number(notification?.chapterNumber))) {
    const chapterTitle = String(notification?.chapterTitle || "").trim();
    return chapterTitle
      ? `Chuong ${notification.chapterNumber}: ${chapterTitle}`
      : `Chuong ${notification.chapterNumber}`;
  }

  if (notification?.chapterTitle) {
    return notification.chapterTitle;
  }

  return notification?.message || "";
}

function mergeNotification(items, notification) {
  if (!notification?.id) {
    return items;
  }

  const existingIndex = items.findIndex((item) => item.id === notification.id);
  if (existingIndex === -1) {
    return [notification, ...items];
  }

  const next = [...items];
  next[existingIndex] = {
    ...next[existingIndex],
    ...notification,
  };
  return next;
}

function markNotificationAsRead(items, notificationId) {
  return items.map((item) =>
    item.id === notificationId
      ? { ...item, isRead: true }
      : item,
  );
}

export default function Header() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [rewardPreview, setRewardPreview] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const themeRef = useRef(null);
  const { themeKey, setTheme, themes } = useTheme();
  const activeProfileTab = new URLSearchParams(location.search).get('tab');
  const isRewardsActive =
    location.pathname === '/profile' && activeProfileTab === 'rewards';
  const missionSummary = rewardPreview?.mission || null;
  const coinBalance = Number(rewardPreview?.coinBalance || 0);
  const unreadCount = notifications.reduce(
    (count, item) => count + (item.isRead ? 0 : 1),
    0,
  );

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    getNotifications()
      .then((response) => setNotifications(response.data))
      .catch(() => setNotifications([]));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRewardPreview(null);
      return;
    }

    getWalletSummary()
      .then((response) =>
        setRewardPreview({
          mission: response.data?.mission || null,
          coinBalance: Number(response.data?.coinBalance || 0),
        }),
      )
      .catch(() => setRewardPreview(null));
  }, [user, location.pathname, location.search]);

  useEffect(() => {
    if (!user) {
      disconnectRealtime();
      return undefined;
    }

    const accessToken = user.accessToken || user.token;
    const socket = connectRealtime(accessToken);
    if (!socket) {
      return undefined;
    }

    const handleNewNotification = (notification) => {
      setNotifications((items) => mergeNotification(items, notification));
      toast.info(notification?.message || 'Co thong bao moi.', {
        title: 'Thong bao moi',
        actionLabel: notification?.chapterId ? 'Mo chuong' : 'Mo truyen',
        imageUrl: getNotificationCover(notification),
        imageAlt: getNotificationHeadline(notification),
        imageFallback: getNotificationHeadline(notification),
        duration: 7000,
        onClick: () => {
          if (!notification?.isRead && notification?.id) {
            setNotifications((items) => markNotificationAsRead(items, notification.id));
            markAsRead(notification.id).catch(() => {});
          }

          const target = getNotificationTarget(notification);
          if (target) {
            navigate(target);
          }
        },
      });
    };

    socket.on(REALTIME_EVENTS.notificationNew, handleNewNotification);

    return () => {
      socket.off(REALTIME_EVENTS.notificationNew, handleNewNotification);
      disconnectRealtime();
    };
  }, [user, navigate]);

  useEffect(() => {
    const handler = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotif(false);
      }
      if (themeRef.current && !themeRef.current.contains(event.target)) {
        setShowTheme(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    disconnectRealtime();
    logout();
    navigate('/login');
  };

  const handleNotifClick = (notification) => {
    if (!notification?.id) {
      return;
    }

    if (!notification.isRead) {
      setNotifications((items) => markNotificationAsRead(items, notification.id));
      markAsRead(notification.id).catch(() => {});
    }

    setShowNotif(false);
    const target = getNotificationTarget(notification);
    if (target) {
      navigate(target);
    }
  };

  const handleMarkAll = async () => {
    await markAllAsRead();
    setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
  };

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo">
          TruyenHub
        </Link>

        <button className="hamburger" onClick={() => setMobileOpen((value) => !value)}>
          <span />
          <span />
          <span />
        </button>

        <nav className={`nav-links ${mobileOpen ? 'open' : ''}`}>
          <Link
            to="/"
            className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            Trang chu
          </Link>
          <Link
            to="/stories"
            className={`nav-link ${location.pathname === '/stories' ? 'active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            Danh sach truyen
          </Link>
          {user && (
            <Link
              to="/studio"
              className={`nav-link ${location.pathname === '/studio' ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              Dang truyen
            </Link>
          )}
          {isAdmin() && (
            <Link
              to="/admin"
              className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              Quan tri
            </Link>
          )}
        </nav>

        <div className="nav-actions">
          <div ref={themeRef} className="theme-switcher">
            <button
              className="btn-icon"
              title="Doi mau giao dien"
              onClick={() => setShowTheme((value) => !value)}
            >
              &#127912;
            </button>
            {showTheme && (
              <div className="theme-dropdown">
                <div className="theme-title">Chon giao dien</div>
                {Object.entries(themes).map(([key, preset]) => (
                  <button
                    key={key}
                    className={`theme-option ${themeKey === key ? 'active' : ''}`}
                    onClick={() => {
                      setTheme(key);
                      setShowTheme(false);
                    }}
                    type="button"
                  >
                    <div className="theme-swatches">
                      {preset.colors.map((color, index) => (
                        <span key={index} style={{ background: color }} />
                      ))}
                    </div>
                    <div className="theme-info">
                      <strong>{preset.name}</strong>
                      <small>{preset.description}</small>
                    </div>
                    {themeKey === key && <span className="theme-check">&#10003;</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {user ? (
            <>
              <div className="mission-preview">
                <Link
                  to="/profile?tab=rewards"
                  className="btn-icon"
                  title={
                    missionSummary
                      ? missionSummary.completed
                        ? 'Nhiem vu hom nay da hoan thanh'
                        : `Nhiem vu hom nay: ${missionSummary.progressCount}/${missionSummary.target}`
                      : 'Nhiem vu hang ngay'
                  }
                  style={
                    isRewardsActive
                      ? {
                          color: 'var(--accent)',
                          background: 'var(--accent-bg)',
                          borderColor: 'var(--accent-border)',
                        }
                      : undefined
                  }
                >
                  &#127919;
                  {missionSummary &&
                    !missionSummary.completed &&
                    missionSummary.remainingCount > 0 && (
                      <span className="badge">{missionSummary.remainingCount}</span>
                    )}
                </Link>
                <div className="mission-preview-dropdown">
                  <div className="mission-preview-title">Nhiem vu hom nay</div>
                  <div className="mission-preview-value">
                    {missionSummary
                      ? `${missionSummary.progressCount}/${missionSummary.target}`
                      : '0/3'}
                  </div>
                  <div className="mission-preview-meta">
                    {missionSummary?.completed
                      ? 'Da hoan thanh va nhan thuong.'
                      : `Con ${missionSummary?.remainingCount || 3} chuong de nhan xu.`}
                  </div>
                  <div className="mission-preview-stats">
                    <span>Streak</span>
                    <strong>{missionSummary?.streak || 0} ngay</strong>
                  </div>
                  <div className="mission-preview-stats">
                    <span>Xu hien co</span>
                    <strong>{coinBalance.toLocaleString('vi-VN')}</strong>
                  </div>
                </div>
              </div>

              <div ref={notifRef} style={{ position: 'relative' }}>
                <button className="btn-icon" onClick={() => setShowNotif((value) => !value)}>
                  &#128276;
                  {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
                </button>
                {showNotif && (
                  <div className="notification-dropdown">
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <strong style={{ fontSize: '0.9rem' }}>Thong bao</strong>
                      {unreadCount > 0 && (
                        <button className="btn btn-sm btn-outline" onClick={handleMarkAll}>
                          Doc tat ca
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <div
                        style={{
                          padding: '2rem',
                          textAlign: 'center',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Khong co thong bao
                      </div>
                    ) : (
                      notifications.slice(0, 20).map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          className={`notification-item ${!notification.isRead ? 'unread' : ''}`}
                          onClick={() => handleNotifClick(notification)}
                        >
                          <span className="notification-story-cover" aria-hidden="true">
                            {getNotificationCover(notification) ? (
                              <img
                                src={getNotificationCover(notification)}
                                alt={getNotificationHeadline(notification)}
                              />
                            ) : (
                              <span className="notification-story-cover-fallback">
                                {getNotificationHeadline(notification).slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </span>
                          <span className="notification-content">
                            <strong className="notification-title">
                              {getNotificationHeadline(notification)}
                            </strong>
                            <span className="notification-subline">
                              {getNotificationSubline(notification)}
                            </span>
                            <span className="notification-message">{notification.message}</span>
                            <small className="notification-date">
                              {new Date(notification.createdAt).toLocaleDateString('vi-VN')}
                            </small>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div ref={menuRef} className="user-menu">
                <button className="user-menu-btn" onClick={() => setShowMenu((value) => !value)}>
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="user-avatar-img"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="user-avatar">{user.username?.[0]?.toUpperCase()}</span>
                  )}
                  {user.username}
                </button>
                {showMenu && (
                  <div className="user-dropdown">
                    <Link to="/studio" onClick={() => setShowMenu(false)}>
                      Dang truyen
                    </Link>
                    <Link to="/profile" onClick={() => setShowMenu(false)}>
                      Ho so
                    </Link>
                    <Link to="/profile?tab=bookmarks" onClick={() => setShowMenu(false)}>
                      Bookmark
                    </Link>
                    <Link to="/profile?tab=history" onClick={() => setShowMenu(false)}>
                      Lich su doc
                    </Link>
                    <Link to="/profile?tab=rewards" onClick={() => setShowMenu(false)}>
                      Nhiem vu va skin
                    </Link>
                    <button onClick={handleLogout}>Dang xuat</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline btn-sm">
                Dang nhap
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Dang ky
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
