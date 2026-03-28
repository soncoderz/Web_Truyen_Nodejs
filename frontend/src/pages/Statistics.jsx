import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTrendStats, getHotStories, getDistributionData } from '../services/api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const PIE_COLORS_BY_TYPE = ['#ffb347', '#6c63ff'];
const PIE_COLORS_BY_STATUS = ['#52c7ea', '#4caf50', '#f44336'];
const PIE_COLORS_BY_ROLE = ['#ff9800', '#2196f3'];

const TYPE_COLORS = {
  MANGA: { bg: 'var(--badge-manga-bg)', color: 'var(--warning)' },
  NOVEL: { bg: 'var(--badge-novel-bg)', color: 'var(--accent)' },
};

const STATUS_COLORS = {
  ONGOING: { bg: 'rgba(82,199,234,0.15)', color: '#52c7ea' },
  COMPLETED: { bg: 'rgba(76,175,80,0.15)', color: '#4caf50' },
  DROPPED: { bg: 'rgba(244,67,54,0.15)', color: '#f44336' },
};

const STATUS_LABELS = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Đã hoàn thành',
  DROPPED: 'Đã drop',
};

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className="trend-stat-card" style={{ '--accent-color': accent }}>
      <div className="trend-stat-icon">{icon}</div>
      <div className="trend-stat-body">
        <div className="trend-stat-value">{value}</div>
        <div className="trend-stat-label">{label}</div>
        {sub && <div className="trend-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div className="section-title">
      <span className="section-icon">{icon}</span>
      <h2>{title}</h2>
    </div>
  );
}

function StarRating({ score }) {
  const full = Math.floor(score);
  const half = score - full >= 0.5 ? 1 : 0;
  return (
    <span className="star-display">
      {[...Array(full)].map((_, i) => <span key={`f${i}`} className="star full">★</span>)}
      {[...Array(half)].map((_, i) => <span key="h" className="star half">★</span>)}
      {[...Array(5 - full - half)].map((_, i) => <span key={`e${i}`} className="star empty">★</span>)}
      <span className="score-num">{score.toFixed(1)}</span>
    </span>
  );
}

function HotStoryItem({ story, rank, index }) {
  const typeStyle = TYPE_COLORS[story.type] || TYPE_COLORS.NOVEL;
  const statusStyle = STATUS_COLORS[story.status] || STATUS_COLORS.ONGOING;

  return (
    <div className="hot-story-item" onClick={() => window.location.href = `/story/${story.id}`}>
      <span className="rank-badge" style={{
        background: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : 'rgba(255,255,255,0.1)',
        color: index < 3 ? '#1a1a2e' : 'rgba(255,255,255,0.5)'
      }}>#{rank}</span>
      <div className="hot-story-cover">
        {story.coverImage ? (
          <img src={story.coverImage} alt={story.title} />
        ) : (
          <div className="cover-placeholder">{story.type === 'MANGA' ? '🎨' : '📝'}</div>
        )}
      </div>
      <div className="hot-story-info">
        <div className="hot-story-title">{story.title}</div>
        <div className="hot-story-meta">
          <span className="pill" style={{ background: typeStyle.bg, color: typeStyle.color }}>
            {story.type === 'MANGA' ? '🎨 Manga' : '📝 Novel'}
          </span>
          <span className="pill" style={{ background: statusStyle.bg, color: statusStyle.color }}>
            {STATUS_LABELS[story.status] || story.status}
          </span>
        </div>
        <div className="hot-story-stats">
          <span>👁 {story.views?.toLocaleString() || 0}</span>
          <span>⭐ <StarRating score={story.averageRating || 0} /></span>
        </div>
      </div>
    </div>
  );
}

function CustomPieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pie-tooltip">
      <div className="pie-tooltip-label">{payload[0].name}</div>
      <div className="pie-tooltip-value">{payload[0].value} <span>({((payload[0].value / (payload[0].payload.total || 1)) * 100).toFixed(1)}%)</span></div>
    </div>
  );
}

function PieChartCard({ title, data, colors }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const enriched = data.map(d => ({ ...d, total }));

  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={enriched}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              nameKey="label"
            >
              {enriched.map((entry, i) => (
                <Cell key={entry.label} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomPieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pie-legend">
          {enriched.map((d, i) => (
            <div key={d.label} className="legend-item">
              <span className="legend-dot" style={{ background: colors[i % colors.length] }} />
              <span className="legend-label">{d.label}</span>
              <span className="legend-value">{d.value}</span>
              <span className="legend-pct">{total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Statistics({ embedded = false }) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [trends, setTrends] = useState(null);
  const [hotStories, setHotStories] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('trends');

  useEffect(() => {
    if (!user || !isAdmin()) { navigate('/'); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, hRes, dRes] = await Promise.all([
        getTrendStats(),
        getHotStories(),
        getDistributionData(),
      ]);
      setTrends(tRes.data);
      setHotStories(hRes.data);
      setDistribution(dRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className={embedded ? 'statistics-embedded-loading' : 'loading'}>
        <div className="spinner" />Đang tải thống kê...
      </div>
    );
  }

  const tabs = [
    { id: 'trends', label: ' Xu hướng', icon: '📈' },
    { id: 'hot', label: ' Hot', icon: '🔥' },
    { id: 'distribution', label: 'Phân bổ', icon: '📊' },
  ];

  const wrapperClass = embedded ? 'statistics-embedded' : 'container';

  return (
    <div className={wrapperClass}>
      {!embedded && <h1 className="page-title">📊 Thống kê & Phân tích</h1>}

      <div className="stat-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`stat-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ===== TREND STATS ===== */}
      {activeTab === 'trends' && trends && (
        <div className="stats-section fade-in">
          <SectionTitle icon="📈" title="Thống kê xu hướng theo thời gian" />

          <div className="trend-group">
            <h3 className="group-title">👥 Người dùng mới</h3>
            <div className="trend-stats-grid trend-stats-grid-3">
              <StatCard icon="📅" label="Hôm nay" value={trends.newUsersToday} accent="#2196f3" />
              <StatCard icon="📆" label="Tuần này" value={trends.newUsersThisWeek} accent="#00bcd4" />
              <StatCard icon="🗓️" label="Tháng này" value={trends.newUsersThisMonth} accent="#009688" />
            </div>
          </div>

          <div className="trend-group">
            <h3 className="group-title">📚 Truyện mới</h3>
            <div className="trend-stats-grid trend-stats-grid-2">
              <StatCard icon="📆" label="Tuần này" value={trends.newStoriesThisWeek} accent="#ff9800" />
              <StatCard icon="🗓️" label="Tháng này" value={trends.newStoriesThisMonth} accent="#ff5722" />
            </div>
          </div>

          <div className="trend-group">
            <h3 className="group-title">📖 Chương mới</h3>
            <div className="trend-stats-grid trend-stats-grid-2">
              <StatCard icon="📆" label="Tuần này" value={trends.newChaptersThisWeek} accent="#9c27b0" />
              <StatCard icon="🗓️" label="Tháng này" value={trends.newChaptersThisMonth} accent="#673ab7" />
            </div>
          </div>
        </div>
      )}

      {/* ===== HOT STORIES ===== */}
      {activeTab === 'hot' && hotStories && (
        <div className="stats-section fade-in">
          <SectionTitle icon="🔥" title="Nội dung hot - Top 10" />

          <div className="hot-lists-grid">
            <div className="hot-list-col">
              <div className="hot-list-header">
                <span className="hot-list-icon">👁</span>
                <h3>Top 10 Lượt xem</h3>
              </div>
              <div className="hot-list">
                {hotStories.topByViews?.map((s, i) => (
                  <HotStoryItem key={s.id} story={s} rank={i + 1} index={i} />
                ))}
                {(!hotStories.topByViews || hotStories.topByViews.length === 0) && (
                  <div className="empty-state"><p>Chưa có dữ liệu.</p></div>
                )}
              </div>
            </div>

            <div className="hot-list-col">
              <div className="hot-list-header">
                <span className="hot-list-icon">⭐</span>
                <h3>Top 10 Rating cao nhất</h3>
              </div>
              <div className="hot-list">
                {hotStories.topByRating?.map((s, i) => (
                  <HotStoryItem key={s.id} story={s} rank={i + 1} index={i} />
                ))}
                {(!hotStories.topByRating || hotStories.topByRating.length === 0) && (
                  <div className="empty-state"><p>Chưa có dữ liệu.</p></div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DISTRIBUTION ===== */}
      {activeTab === 'distribution' && distribution && (
        <div className="stats-section fade-in">
          <SectionTitle icon="📊" title="Phân bổ dữ liệu" />

          <div className="charts-grid">
            <PieChartCard
              title="Loại truyện"
              data={distribution.byType || []}
              colors={PIE_COLORS_BY_TYPE}
            />
            <PieChartCard
              title="Trạng thái truyện"
              data={distribution.byStatus || []}
              colors={PIE_COLORS_BY_STATUS}
            />
            <PieChartCard
              title="Vai trò người dùng"
              data={distribution.byRole || []}
              colors={PIE_COLORS_BY_ROLE}
            />
          </div>
        </div>
      )}
    </div>
  );
}
