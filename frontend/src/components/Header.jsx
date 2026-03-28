import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getNotifications,
  getUnreadCount,
  getWalletSummary,
  markAllAsRead,
  markAsRead,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function Header() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
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

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setRewardPreview(null);
      return;
    }

    getUnreadCount()
      .then((response) => setUnreadCount(response.data.count))
      .catch(() => {});
    getNotifications()
      .then((response) => setNotifications(response.data))
      .catch(() => {});
    getWalletSummary()
      .then((response) =>
        setRewardPreview({
          mission: response.data?.mission || null,
          coinBalance: Number(response.data?.coinBalance || 0),
        }),
      )
      .catch(() => setRewardPreview(null));
  }, [user, location]);

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
    logout();
    navigate('/login');
  };

  const handleNotifClick = async (notification) => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
      setUnreadCount((count) => Math.max(0, count - 1));
    }

    setShowNotif(false);
    if (notification.storyId) {
      navigate(`/story/${notification.storyId}`);
    }
  };

  const handleMarkAll = async () => {
    await markAllAsRead();
    setUnreadCount(0);
    setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
  };

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo">
          TruyệnHub
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
            Trang chủ
          </Link>
          <Link
            to="/stories"
            className={`nav-link ${location.pathname === '/stories' ? 'active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            Danh sách truyện
          </Link>
          {user && (
            <Link
              to="/studio"
              className={`nav-link ${location.pathname === '/studio' ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              Đăng truyện
            </Link>
          )}
          {isAdmin() && (
            <Link
              to="/admin"
              className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              Quản trị
            </Link>
          )}
        </nav>

        <div className="nav-actions">
          <div ref={themeRef} className="theme-switcher">
            <button
              className="btn-icon"
              title="Đổi màu giao diện"
              onClick={() => setShowTheme((value) => !value)}
            >
              🎨
            </button>
            {showTheme && (
              <div className="theme-dropdown">
                <div className="theme-title">Chọn giao diện</div>
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
                    {themeKey === key && <span className="theme-check">✓</span>}
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
                        ? 'Nhiệm vụ hôm nay đã hoàn thành'
                        : `Nhiệm vụ hôm nay: ${missionSummary.progressCount}/${missionSummary.target}`
                      : 'Nhiệm vụ hằng ngày'
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
                  🎯
                  {missionSummary &&
                    !missionSummary.completed &&
                    missionSummary.remainingCount > 0 && (
                      <span className="badge">{missionSummary.remainingCount}</span>
                    )}
                </Link>
                <div className="mission-preview-dropdown">
                  <div className="mission-preview-title">Nhiệm vụ hôm nay</div>
                  <div className="mission-preview-value">
                    {missionSummary
                      ? `${missionSummary.progressCount}/${missionSummary.target}`
                      : '0/3'}
                  </div>
                  <div className="mission-preview-meta">
                    {missionSummary?.completed
                      ? 'Đã hoàn thành và nhận thưởng.'
                      : `Còn ${missionSummary?.remainingCount || 3} chương để nhận xu.`}
                  </div>
                  <div className="mission-preview-stats">
                    <span>Streak</span>
                    <strong>{missionSummary?.streak || 0} ngày</strong>
                  </div>
                  <div className="mission-preview-stats">
                    <span>Xu hiện có</span>
                    <strong>{coinBalance.toLocaleString('vi-VN')}</strong>
                  </div>
                </div>
              </div>

              <div ref={notifRef} style={{ position: 'relative' }}>
                <button className="btn-icon" onClick={() => setShowNotif((value) => !value)}>
                  🔔
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
                          Đọc tất cả
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
                        Không có thông báo
                      </div>
                    ) : (
                      notifications.slice(0, 20).map((notification) => (
                        <div
                          key={notification.id}
                          className={`notification-item ${!notification.isRead ? 'unread' : ''}`}
                          onClick={() => handleNotifClick(notification)}
                        >
                          <div>{notification.message}</div>
                          <small style={{ color: 'var(--text-secondary)' }}>
                            {new Date(notification.createdAt).toLocaleDateString('vi-VN')}
                          </small>
                        </div>
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
                      Đăng truyện
                    </Link>
                    <Link to="/profile" onClick={() => setShowMenu(false)}>
                      Ho so
                    </Link>
                    <Link to="/profile?tab=bookmarks" onClick={() => setShowMenu(false)}>
                      Bookmark
                    </Link>
                    <Link to="/profile?tab=history" onClick={() => setShowMenu(false)}>
                      Lịch sử đọc
                    </Link>
                    <Link to="/profile?tab=rewards" onClick={() => setShowMenu(false)}>
                      Nhiệm vụ và skin
                    </Link>
                    <button onClick={handleLogout}>Đăng xuất</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline btn-sm">
                Đăng nhập
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
