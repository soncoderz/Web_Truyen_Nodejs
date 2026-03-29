import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProfileReadmeCard from "../components/ProfileReadmeCard";
import RankedAvatar from "../components/RankedAvatar";
import { getPublicUserProfile } from "../services/api";
import { repairMojibakeText } from "../utils/textRepair";

function formatJoinedDate(value) {
  if (!value) {
    return "Chưa rõ";
  }

  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getPublicBio(profile) {
  const customBio = String(profile?.bio || "").trim();
  if (customBio) {
    return repairMojibakeText(customBio);
  }

  return "Hồ sơ công khai được trang trí theo skin đang trang bị. Bấm vào avatar ở bình luận để xem nhanh rank frame, streak và dấu ấn đọc truyện.";
}

export default function UserProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [recentStories, setRecentStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await getPublicUserProfile(id);
        if (cancelled) {
          return;
        }

        setProfile(response.data?.profile || null);
        setRecentStories(response.data?.recentStories || []);
      } catch (loadError) {
        if (!cancelled) {
          setProfile(null);
          setRecentStories([]);
          setError(loadError?.response?.data?.message || "Không tải được hồ sơ này.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Đang tải hồ sơ...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container">
        <div className="card">
          <p>{error || "Không tìm thấy hồ sơ người dùng."}</p>
        </div>
      </div>
    );
  }

  const publicAccentColor = profile.accentColor || profile.activeSkin?.accent;
  const publicBio = getPublicBio(profile);
  const publicHeadline = String(profile.headline || "").trim();
  const publicReadme = String(profile.readme || "").trim();

  return (
    <div className="container">
      <div
        className="public-profile-hero"
        style={{
          "--public-hero-bg": profile.activeSkin?.background,
          "--public-hero-border": profile.activeSkin?.border,
          "--public-hero-accent": publicAccentColor,
          "--public-hero-secondary": profile.activeSkin?.secondaryAccent,
          "--public-hero-text": profile.activeSkin?.textColor,
        }}
      >
        <div className="public-profile-hero-main">
          <RankedAvatar
            user={{ username: profile.username, avatar: profile.avatar }}
            skin={profile.activeSkin}
            size="xl"
            showRibbon
          />
          <div className="public-profile-hero-copy">
            <div className="public-profile-chip-row">
              <span className="public-profile-rank-chip">
                {profile.activeSkin?.tier || "Starter"}
              </span>
              <span className="public-profile-rank-chip muted">
                Thành viên từ {formatJoinedDate(profile.createdAt)}
              </span>
            </div>
            <h1>{repairMojibakeText(profile.username || "")}</h1>
            {publicHeadline && (
              <div className="public-profile-headline">
                {repairMojibakeText(publicHeadline)}
              </div>
            )}
            <p>{publicBio}</p>
          </div>
        </div>

        <div className="public-profile-stats">
          <div className="public-profile-stat">
            <span>Streak hiện tại</span>
            <strong>{profile.stats?.readingStreak || 0} ngày</strong>
          </div>
          <div className="public-profile-stat">
            <span>Streak cao nhất</span>
            <strong>{profile.stats?.longestReadingStreak || 0} ngày</strong>
          </div>
          <div className="public-profile-stat">
            <span>Đã theo dõi</span>
            <strong>{profile.stats?.followingCount || 0} truyện</strong>
          </div>
          <div className="public-profile-stat">
            <span>Đã mua</span>
            <strong>{profile.stats?.purchasedCount || 0} truyện</strong>
          </div>
          <div className="public-profile-stat">
            <span>Bình luận</span>
            <strong>{profile.stats?.commentCount || 0}</strong>
          </div>
          <div className="public-profile-stat">
            <span>Truyện đã đăng</span>
            <strong>{profile.stats?.publishedStoryCount || 0}</strong>
          </div>
        </div>
      </div>

      <ProfileReadmeCard
        ownerLabel={profile.username}
        content={publicReadme}
        placeholder="Người dùng này chưa thêm README cho profile."
      />

      <div className="public-profile-grid">
        {(publicHeadline || profile.bio || profile.accentColor) && (
          <div className="card public-profile-panel public-profile-about-panel">
            <div className="public-profile-panel-head">
              <div>
                <h2>Dấu ấn cá nhân</h2>
                <p>Phần này do chính người dùng tự tùy biến trên hồ sơ của họ.</p>
              </div>
              {profile.accentColor && (
                <span className="public-profile-accent-pill">
                  <span
                    className="public-profile-accent-dot"
                    style={{ background: publicAccentColor }}
                  />
                  {profile.accentColor}
                </span>
              )}
            </div>
            <div className="public-profile-about-copy">
              {publicHeadline && (
                <strong>{repairMojibakeText(publicHeadline)}</strong>
              )}
              <p>{publicBio}</p>
            </div>
          </div>
        )}

        <div className="card public-profile-panel">
          <div className="public-profile-panel-head">
            <div>
              <h2>Khung hồ sơ hiện tại</h2>
              <p>{repairMojibakeText(profile.activeSkin?.description || "")}</p>
            </div>
            <span className="category-tag">
              {repairMojibakeText(profile.activeSkin?.name || "Starter")}
            </span>
          </div>
          <div className="public-profile-skin-showcase">
            <RankedAvatar
              user={{ username: profile.username, avatar: profile.avatar }}
              skin={profile.activeSkin}
              size="lg"
              showRibbon
            />
            <div className="public-profile-skin-copy">
              <strong>{repairMojibakeText(profile.activeSkin?.name || "")}</strong>
              <span>{profile.activeSkin?.tier || "Starter"} Frame</span>
              <p>
                Viền này sẽ xuất hiện xuyên suốt ở hồ sơ công khai và phần bình luận
                dưới truyện.
              </p>
            </div>
          </div>
        </div>

        <div className="card public-profile-panel">
          <div className="public-profile-panel-head">
            <div>
              <h2>Huy hiệu đã mở</h2>
              <p>Các cột mốc streak nổi bật của người dùng này.</p>
            </div>
            <span className="category-tag">
              {profile.badges?.length || 0} huy hiệu
            </span>
          </div>
          {profile.badges?.length ? (
            <div className="public-badge-grid">
              {profile.badges.map((badge) => (
                <div key={badge.id} className="public-badge-card">
                  <small>{badge.requiredStreak} ngày</small>
                  <strong>{repairMojibakeText(badge.name || "")}</strong>
                  <p>{repairMojibakeText(badge.description || "")}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>Người dùng này chưa mở huy hiệu nào.</p>
            </div>
          )}
        </div>
      </div>

      <div className="card public-profile-panel">
        <div className="public-profile-panel-head">
          <div>
            <h2>Truyện gần đây</h2>
            <p>Các truyện mới nhất mà người dùng này đã đăng hoặc cập nhật.</p>
          </div>
        </div>
        {recentStories.length ? (
          <div className="story-grid">
            {recentStories.map((story) => (
              <div key={story.id} className="story-card">
                <Link
                  to={`/story/${story.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="story-cover">
                    {story.coverImage ? (
                      <img
                        src={story.coverImage}
                        alt={story.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      "Truyện"
                    )}
                  </div>
                  <div className="story-info">
                    <h3>{repairMojibakeText(story.title || "")}</h3>
                    <div className="story-meta">
                      <span>{story.type === "MANGA" ? "Manga" : "Novel"}</span>
                      <span>{story.followers || 0} theo dõi</span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Chưa có truyện công khai nào để hiển thị.</p>
          </div>
        )}
      </div>
    </div>
  );
}
