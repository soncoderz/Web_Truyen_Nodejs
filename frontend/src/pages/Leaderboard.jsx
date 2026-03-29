import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import RankedAvatar from '../components/RankedAvatar';
import { getTopCoins } from '../services/api';

// Danh mục skin giống rewardService để resolve skin theo equippedProfileSkinId
const SKIN_CATALOG = [
  { id: 'default', background: 'radial-gradient(circle at 50% 0%, rgba(149,76,233,0.34), rgba(12,13,28,0.96) 62%), linear-gradient(145deg, rgba(80,72,160,0.7), rgba(11,14,31,0.95))', border: 'rgba(145,92,255,0.42)', accent: '#8b5cf6', secondaryAccent: '#c4b5fd', glow: 'rgba(139,92,246,0.32)', ribbon: 'Mac dinh', textColor: '#f5f3ff', crest: 'I', frameVariant: 'royal', tier: 'Starter', name: 'Khoi Nguyen' },
  { id: 'bronze_vanguard', background: 'radial-gradient(circle at 50% 14%, rgba(255,190,92,0.38), rgba(46,20,18,0.98) 58%), linear-gradient(145deg, rgba(153,77,45,0.88), rgba(46,20,18,0.98))', border: 'rgba(255,168,95,0.45)', accent: '#f97316', secondaryAccent: '#fdba74', glow: 'rgba(249,115,22,0.28)', ribbon: 'Dong', textColor: '#fff7ed', crest: 'III', frameVariant: 'horned', tier: 'Bronze', name: 'Dong Ve Binh' },
  { id: 'silver_court', background: 'radial-gradient(circle at 50% 10%, rgba(241,245,249,0.42), rgba(20,24,41,0.98) 54%), linear-gradient(145deg, rgba(126,142,171,0.88), rgba(20,24,41,0.98))', border: 'rgba(196,207,224,0.52)', accent: '#cbd5f5', secondaryAccent: '#60a5fa', glow: 'rgba(148,163,184,0.3)', ribbon: 'Bac', textColor: '#f8fbff', crest: 'II', frameVariant: 'winged', tier: 'Silver', name: 'Bac Nguyet Dien' },
  { id: 'gold_lion', background: 'radial-gradient(circle at 50% 12%, rgba(255,226,122,0.5), rgba(79,29,12,0.98) 56%), linear-gradient(145deg, rgba(212,139,47,0.92), rgba(79,29,12,0.98))', border: 'rgba(250,204,21,0.58)', accent: '#facc15', secondaryAccent: '#fb7185', glow: 'rgba(250,204,21,0.32)', ribbon: 'Vang', textColor: '#fffbea', crest: 'I', frameVariant: 'solar', tier: 'Gold', name: 'Vuong Su Hoang Kim' },
  { id: 'emerald_vernal', background: 'radial-gradient(circle at 50% 12%, rgba(110,231,183,0.38), rgba(6,42,30,0.98) 58%), linear-gradient(145deg, rgba(20,130,86,0.92), rgba(6,42,30,0.98))', border: 'rgba(74,222,128,0.5)', accent: '#4ade80', secondaryAccent: '#86efac', glow: 'rgba(34,197,94,0.28)', ribbon: 'Luc bao', textColor: '#ecfdf5', crest: 'E', frameVariant: 'verdant', tier: 'Emerald', name: 'Luc Bao Mua Xuan' },
  { id: 'platinum_crown', background: 'radial-gradient(circle at 50% 10%, rgba(153,246,228,0.38), rgba(7,39,54,0.98) 58%), linear-gradient(145deg, rgba(45,156,173,0.9), rgba(7,39,54,0.98))', border: 'rgba(94,234,212,0.5)', accent: '#2dd4bf', secondaryAccent: '#67e8f9', glow: 'rgba(45,212,191,0.3)', ribbon: 'Bach kim', textColor: '#ecfeff', crest: 'P', frameVariant: 'tech', tier: 'Platinum', name: 'Bach Kim Thien Tru' },
  { id: 'diamond_astral', background: 'radial-gradient(circle at 50% 6%, rgba(191,219,254,0.42), rgba(28,25,68,0.98) 56%), linear-gradient(145deg, rgba(59,130,246,0.88), rgba(28,25,68,0.98))', border: 'rgba(147,197,253,0.56)', accent: '#60a5fa', secondaryAccent: '#a78bfa', glow: 'rgba(96,165,250,0.34)', ribbon: 'Kim cuong', textColor: '#eef4ff', crest: 'D', frameVariant: 'crystal', tier: 'Diamond', name: 'Kim Cuong Tinh Gioi' },
  { id: 'lunar_seraph', background: 'radial-gradient(circle at 50% 8%, rgba(216,180,254,0.36), rgba(24,19,52,0.99) 56%), linear-gradient(145deg, rgba(129,140,248,0.88), rgba(24,19,52,0.99))', border: 'rgba(196,181,253,0.54)', accent: '#c4b5fd', secondaryAccent: '#e9d5ff', glow: 'rgba(168,85,247,0.3)', ribbon: 'Nguyet', textColor: '#faf5ff', crest: 'L', frameVariant: 'lunar', tier: 'Mythic', name: 'Nguyet Seraph' },
  { id: 'blossom_matsuri', background: 'radial-gradient(circle at 50% 8%, rgba(251,182,206,0.42), rgba(56,18,56,0.98) 56%), linear-gradient(145deg, rgba(236,72,153,0.88), rgba(56,18,56,0.98))', border: 'rgba(244,114,182,0.56)', accent: '#fb7185', secondaryAccent: '#c084fc', glow: 'rgba(244,114,182,0.3)', ribbon: 'Le hoi', textColor: '#fff1f8', crest: 'B', frameVariant: 'blossom', tier: 'Festival', name: 'Hoa Le Le Hoi' },
  { id: 'master_abyss', background: 'radial-gradient(circle at 50% 6%, rgba(244,114,182,0.34), rgba(39,11,56,0.99) 54%), linear-gradient(145deg, rgba(109,40,217,0.92), rgba(39,11,56,0.99))', border: 'rgba(217,70,239,0.52)', accent: '#d946ef', secondaryAccent: '#fb7185', glow: 'rgba(217,70,239,0.34)', ribbon: 'Cao thu', textColor: '#fff1ff', crest: 'M', frameVariant: 'infernal', tier: 'Master', name: 'Cao Thu Hu Khong' },
  { id: 'void_mecha', background: 'radial-gradient(circle at 50% 6%, rgba(125,211,252,0.34), rgba(15,18,40,0.99) 56%), linear-gradient(145deg, rgba(58,82,160,0.92), rgba(15,18,40,0.99))', border: 'rgba(125,211,252,0.48)', accent: '#7dd3fc', secondaryAccent: '#60a5fa', glow: 'rgba(96,165,250,0.32)', ribbon: 'Hu vo', textColor: '#f0f9ff', crest: 'V', frameVariant: 'mecha', tier: 'Cosmic', name: 'Co Gioi Hu Vo' },
  { id: 'challenger_solaris', background: 'radial-gradient(circle at 50% 4%, rgba(255,255,255,0.6), rgba(18,35,72,0.99) 52%), linear-gradient(145deg, rgba(34,211,238,0.88), rgba(18,35,72,0.99))', border: 'rgba(255,255,255,0.72)', accent: '#f8fafc', secondaryAccent: '#facc15', glow: 'rgba(250,204,21,0.38)', ribbon: 'Thach dau', textColor: '#f8fbff', crest: 'C', frameVariant: 'crown', tier: 'Challenger', name: 'Thach Dau Thien Nhat' },
];

function getSkinById(skinId) {
  return SKIN_CATALOG.find((s) => s.id === skinId) || SKIN_CATALOG[0];
}

const RANK_CONFIG = {
  1: {
    emoji: '🥇',
    label: 'Top 1',
    gradient: 'linear-gradient(135deg, rgba(250,204,21,0.22), rgba(251,146,60,0.14))',
    border: 'rgba(250,204,21,0.5)',
    glow: '0 0 32px rgba(250,204,21,0.22)',
    rankColor: '#facc15',
    badge: 'VƯƠNG',
  },
  2: {
    emoji: '🥈',
    label: 'Top 2',
    gradient: 'linear-gradient(135deg, rgba(203,213,225,0.18), rgba(148,163,184,0.10))',
    border: 'rgba(203,213,225,0.45)',
    glow: '0 0 24px rgba(203,213,225,0.18)',
    rankColor: '#cbd5e1',
    badge: 'Á QUÂN',
  },
  3: {
    emoji: '🥉',
    label: 'Top 3',
    gradient: 'linear-gradient(135deg, rgba(253,186,116,0.18), rgba(234,88,12,0.10))',
    border: 'rgba(253,186,116,0.4)',
    glow: '0 0 20px rgba(253,186,116,0.18)',
    rankColor: '#fdba74',
    badge: 'HẠng 3',
  },
};

function PodiumCard({ entry }) {
  const cfg = RANK_CONFIG[entry.rank];
  const skin = getSkinById(entry.equippedProfileSkinId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1.5rem 1rem 1.25rem',
        borderRadius: '20px',
        border: `1px solid ${cfg.border}`,
        background: cfg.gradient,
        boxShadow: cfg.glow,
        flex: entry.rank === 1 ? '0 0 280px' : '0 0 220px',
        position: 'relative',
        transition: 'transform 0.18s',
        cursor: 'default',
        order: entry.rank === 1 ? 0 : entry.rank === 2 ? -1 : 1,
      }}
    >
      {/* Badge */}
      <span
        style={{
          position: 'absolute',
          top: '-14px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: cfg.rankColor,
          color: '#1a1a1a',
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          padding: '2px 12px',
          borderRadius: '99px',
          boxShadow: `0 2px 8px ${cfg.border}`,
          whiteSpace: 'nowrap',
        }}
      >
        {cfg.emoji} {cfg.badge}
      </span>

      <RankedAvatar
        user={{ username: entry.username, avatar: entry.avatar }}
        skin={skin}
        size={entry.rank === 1 ? 'lg' : 'md'}
        showRibbon
      />

      <div style={{ textAlign: 'center' }}>
        <Link
          to={`/users/${entry.id}`}
          style={{
            fontWeight: 700,
            fontSize: entry.rank === 1 ? '1.1rem' : '1rem',
            color: 'var(--text-primary)',
            textDecoration: 'none',
          }}
        >
          {entry.username}
        </Link>
        <div
          style={{
            marginTop: '0.35rem',
            fontWeight: 800,
            fontSize: entry.rank === 1 ? '1.45rem' : '1.25rem',
            color: cfg.rankColor,
            textShadow: `0 0 12px ${cfg.border}`,
          }}
        >
          {entry.coinBalance.toLocaleString('vi-VN')}
          <span style={{ fontSize: '0.75rem', marginLeft: '4px', fontWeight: 600, opacity: 0.8 }}>xu</span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
          {skin.name} · {skin.tier}
        </div>
      </div>
    </div>
  );
}

function LeaderboardRow({ entry }) {
  const skin = getSkinById(entry.equippedProfileSkinId);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.85rem 1.25rem',
        borderRadius: '14px',
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      className="leaderboard-row"
    >
      {/* Rank number */}
      <div
        style={{
          minWidth: '36px',
          textAlign: 'center',
          fontWeight: 800,
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}
      >
        {entry.rank}
      </div>

      {/* Avatar */}
      <RankedAvatar
        user={{ username: entry.username, avatar: entry.avatar }}
        skin={skin}
        size="sm"
      />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          to={`/users/${entry.id}`}
          style={{
            fontWeight: 700,
            fontSize: '0.95rem',
            color: 'var(--text-primary)',
            textDecoration: 'none',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.username}
        </Link>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
          {skin.tier} — {skin.name}
        </div>
      </div>

      {/* Coin */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--warning)' }}>
          {entry.coinBalance.toLocaleString('vi-VN')}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>xu</div>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getTopCoins()
      .then((res) => {
        if (!cancelled) setEntries(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setError('Không tải được dữ liệu bảng xếp hạng. Vui lòng thử lại.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const podium = entries.filter((e) => e.rank <= 3);
  const rest = entries.filter((e) => e.rank > 3);

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
        <h1
          style={{
            fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #facc15, #f97316, #a855f7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '0.4rem',
          }}
        >
          Bảng Xếp Hạng Đại Gia
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Top 10 người dùng sở hữu nhiều xu nhất trên TruyệnHub
        </p>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
          Đang tải bảng xếp hạng...
        </div>
      ) : error ? (
        <div className="card">
          <div className="empty-state">
            <p style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>Chưa có dữ liệu xếp hạng. Hãy kiếm xu để lên bảng!</p>
          </div>
        </div>
      ) : (
        <>
          {/* Podium — Top 3 */}
          {podium.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                gap: '1rem',
                marginBottom: '2rem',
                flexWrap: 'wrap',
              }}
            >
              {podium.map((entry) => (
                <PodiumCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {/* Divider */}
          {rest.length > 0 && (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <span style={{ flex: 1, height: '1px', background: 'var(--border)', display: 'block' }} />
              Hạng 4 – {entries.length}
              <span style={{ flex: 1, height: '1px', background: 'var(--border)', display: 'block' }} />
            </div>
          )}

          {/* Rank 4–10 list */}
          {rest.length > 0 && (
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {rest.map((entry) => (
                <LeaderboardRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer CTA */}
      <div
        style={{
          marginTop: '2.5rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
        }}
      >
        Kiếm xu qua{' '}
        <Link to="/profile?tab=rewards" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          nhiệm vụ hằng ngày
        </Link>{' '}
        và{' '}
        <Link to="/profile?tab=rewards" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          điểm danh mỗi ngày
        </Link>{' '}
        để leo bảng xếp hạng!
      </div>
    </div>
  );
}
