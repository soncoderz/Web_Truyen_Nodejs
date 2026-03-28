import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { getDistributionData, getHotStories, getTrendStats } from '../services/api';

const PIE_COLORS_BY_TYPE = ['var(--warning)', 'var(--accent)'];
const PIE_COLORS_BY_STATUS = ['var(--success)', 'var(--accent)', 'var(--danger)'];
const PIE_COLORS_BY_ROLE = ['var(--warning)', 'var(--accent-strong)'];

const TYPE_COLORS = {
  MANGA: { bg: 'var(--badge-manga-bg)', color: 'var(--warning)' },
  NOVEL: { bg: 'var(--badge-novel-bg)', color: 'var(--accent)' },
};

const STATUS_COLORS = {
  ONGOING: { bg: 'var(--success-bg)', color: 'var(--success)' },
  COMPLETED: { bg: 'var(--accent-bg)', color: 'var(--accent)' },
  DROPPED: { bg: 'var(--danger-bg)', color: 'var(--danger)' },
};

const STATUS_LABELS = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
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
      {[...Array(full)].map((_, i) => (
        <span key={`f${i}`} className="star full">
          ★
        </span>
      ))}
      {[...Array(half)].map(() => (
        <span key="h" className="star half">
          ★
        </span>
      ))}
      {[...Array(5 - full - half)].map((_, i) => (
        <span key={`e${i}`} className="star empty">
          ★
        </span>
      ))}
      <span className="score-num">{score.toFixed(1)}</span>
    </span>
  );
}

function HotStoryItem({ story, rank, index }) {
  const typeStyle = TYPE_COLORS[story.type] || TYPE_COLORS.NOVEL;
  const statusStyle = STATUS_COLORS[story.status] || STATUS_COLORS.ONGOING;

  return (
    <div
      className="hot-story-item"
      onClick={() => {
        window.location.href = `/story/${story.id}`;
      }}
    >
      <span
        className="rank-badge"
        style={{
          background:
            index === 0
              ? 'var(--rank-1-bg)'
              : index === 1
                ? 'var(--rank-2-bg)'
                : index === 2
                  ? 'var(--rank-3-bg)'
                  : 'var(--rank-default-bg)',
          color: index < 3 ? 'var(--rank-top-text)' : 'var(--rank-default-text)',
        }}
      >
        #{rank}
      </span>
      <div className="hot-story-cover">
        {story.coverImage ? (
          <img src={story.coverImage} alt={story.title} />
        ) : (
          <div className="cover-placeholder">{story.type === 'MANGA' ? 'M' : 'N'}</div>
        )}
      </div>
      <div className="hot-story-info">
        <div className="hot-story-title">{story.title}</div>
        <div className="hot-story-meta">
          <span className="pill" style={{ background: typeStyle.bg, color: typeStyle.color }}>
            {story.type === 'MANGA' ? 'Manga' : 'Novel'}
          </span>
          <span className="pill" style={{ background: statusStyle.bg, color: statusStyle.color }}>
            {STATUS_LABELS[story.status] || story.status}
          </span>
        </div>
        <div className="hot-story-stats">
          <span>Lượt xem {story.views?.toLocaleString() || 0}</span>
          <span>
            Đánh giá <StarRating score={story.averageRating || 0} />
          </span>
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
      <div className="pie-tooltip-value">
        {payload[0].value}{' '}
        <span>
          ({((payload[0].value / (payload[0].payload.total || 1)) * 100).toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

function PieChartCard({ title, data, colors }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const enriched = data.map((item) => ({ ...item, total }));

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
              {enriched.map((entry, index) => (
                <Cell key={entry.label} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomPieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pie-legend">
          {enriched.map((item, index) => (
            <div key={item.label} className="legend-item">
              <span
                className="legend-dot"
                style={{ background: colors[index % colors.length] }}
              />
              <span className="legend-label">{item.label}</span>
              <span className="legend-value">{item.value}</span>
              <span className="legend-pct">
                {total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%
              </span>
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
    if (!user || !isAdmin()) {
      navigate('/');
      return;
    }
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [trendResponse, hotResponse, distributionResponse] = await Promise.all([
        getTrendStats(),
        getHotStories(),
        getDistributionData(),
      ]);
      setTrends(trendResponse.data);
      setHotStories(hotResponse.data);
      setDistribution(distributionResponse.data);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className={embedded ? 'statistics-embedded-loading' : 'loading'}>
        <div className="spinner" />
        Đang tải thống kê...
      </div>
    );
  }

  const tabs = [
    { id: 'trends', label: 'Xu hướng', icon: '📈' },
    { id: 'hot', label: 'Hot', icon: '🔥' },
    { id: 'distribution', label: 'Phân bố', icon: '📊' },
  ];

  const wrapperClass = embedded ? 'statistics-embedded' : 'container';

  return (
    <div className={wrapperClass}>
      {!embedded && <h1 className="page-title">📊 Thống kê và phân tích</h1>}

      <div className="stat-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`stat-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'trends' && trends && (
        <div className="stats-section fade-in">
          <SectionTitle icon="📈" title="Thống kê xu hướng theo thời gian" />

          <div className="trend-group">
            <h3 className="group-title">👥 Người dùng mới</h3>
            <div className="trend-stats-grid trend-stats-grid-3">
              <StatCard icon="📅" label="Hôm nay" value={trends.newUsersToday} accent="var(--accent)" />
              <StatCard icon="📆" label="Tuần nay" value={trends.newUsersThisWeek} accent="var(--success)" />
              <StatCard icon="🗓" label="Tháng nay" value={trends.newUsersThisMonth} accent="var(--warning)" />
            </div>
          </div>

          <div className="trend-group">
            <h3 className="group-title">📚 Truyện mới</h3>
            <div className="trend-stats-grid trend-stats-grid-2">
              <StatCard icon="📆" label="Tuần nay" value={trends.newStoriesThisWeek} accent="var(--warning)" />
              <StatCard icon="🗓" label="Tháng nay" value={trends.newStoriesThisMonth} accent="var(--danger)" />
            </div>
          </div>

          <div className="trend-group">
            <h3 className="group-title">📖 Chương mới</h3>
            <div className="trend-stats-grid trend-stats-grid-2">
              <StatCard icon="📆" label="Tuần nay" value={trends.newChaptersThisWeek} accent="var(--accent-strong)" />
              <StatCard icon="🗓" label="Tháng nay" value={trends.newChaptersThisMonth} accent="var(--accent)" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'hot' && hotStories && (
        <div className="stats-section fade-in">
          <SectionTitle icon="🔥" title="Nội dung hot - Top 10" />

          <div className="hot-lists-grid">
            <div className="hot-list-col">
              <div className="hot-list-header">
                <span className="hot-list-icon">👁</span>
                <h3>Top 10 lượt xem</h3>
              </div>
              <div className="hot-list">
                {hotStories.topByViews?.map((story, index) => (
                  <HotStoryItem key={story.id} story={story} rank={index + 1} index={index} />
                ))}
                {(!hotStories.topByViews || hotStories.topByViews.length === 0) && (
                  <div className="empty-state">
                    <p>Chưa có dữ liệu.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="hot-list-col">
              <div className="hot-list-header">
                <span className="hot-list-icon">★</span>
                <h3>Top 10 rating cao nhất</h3>
              </div>
              <div className="hot-list">
                {hotStories.topByRating?.map((story, index) => (
                  <HotStoryItem key={story.id} story={story} rank={index + 1} index={index} />
                ))}
                {(!hotStories.topByRating || hotStories.topByRating.length === 0) && (
                  <div className="empty-state">
                    <p>Chưa có dữ liệu.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'distribution' && distribution && (
        <div className="stats-section fade-in">
          <SectionTitle icon="📊" title="Phân bố du lieu" />

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
