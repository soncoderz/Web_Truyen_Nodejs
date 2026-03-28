import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HeartIcon from '../components/HeartIcon';
import { useAuth } from '../context/AuthContext';
import useFollowedStories from '../hooks/useFollowedStories';
import { getCategories, getStories, searchStories } from '../services/api';

export default function StoryList() {
  const { user } = useAuth();
  const { isFollowingStory, isProcessing, toggleFollow } = useFollowedStories(user);
  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [searchParams] = useSearchParams();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getCategories().then((response) => setCategories(response.data)).catch(() => {});

    const category = searchParams.get('category');
    const initialType = searchParams.get('type');

    if (category) {
      setCategoryId(category);
    }
    if (initialType) {
      setType(initialType);
    }

    setReady(true);
  }, [searchParams]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    setLoading(true);

    const params = {};
    if (keyword) {
      params.keyword = keyword;
    }
    if (categoryId) {
      params.categoryId = categoryId;
    }
    if (status) {
      params.status = status;
    }
    if (type) {
      params.type = type;
    }

    const request = Object.keys(params).length > 0 ? searchStories(params) : getStories();
    request
      .then((response) => setStories(response.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [keyword, categoryId, status, type, ready]);

  const handleStoryBookmark = async (story) => {
    if (!user) {
      alert('Vui lòng đăng nhập!');
      return;
    }

    toggleFollow(story.id)
      .then((result) => {
        if (result.requiresAuth) {
          alert('Vui lòng đăng nhập để theo dõi truyện.');
        }
      })
      .catch(() => {
        alert('Không cập nhật được trạng thái theo dõi.');
      });
  };

  return (
    <div className="container">
      <h1 className="page-title">
        {type === 'MANGA'
          ? 'Truyện Tranh'
          : type === 'NOVEL'
            ? 'Light Novel'
            : 'Tat ca truyen'}
      </h1>

      <div className="search-bar">
        <input
          className="form-control"
          placeholder="Tìm kiếm truyện..."
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <select className="form-control" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">Tất cả loại</option>
          <option value="MANGA">Truyện Tranh</option>
          <option value="NOVEL">Light Novel</option>
        </select>
        <select
          className="form-control"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Tất cả thể loại</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select className="form-control" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="ONGOING">Đang tiến hành</option>
          <option value="COMPLETED">Hoàn thành</option>
          <option value="DROPPED">Ngung</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
          Đang tải...
        </div>
      ) : stories.length > 0 ? (
        <div className="story-grid">
          {stories.map((story) => {
            const bookmarked = isFollowingStory(story.id);
            const bookmarkBusy = isProcessing(story.id);
            return (
              <div key={story.id} className="story-card">
                <button
                  type="button"
                  className={`story-bookmark-btn story-follow-btn ${bookmarked ? 'active' : ''}`}
                  aria-pressed={bookmarked}
                  aria-label={bookmarked ? `Bỏ theo dõi ${story.title}` : `Theo dõi ${story.title}`}
                  title={bookmarked ? 'Bỏ theo dõi truyện' : 'Theo dõi truyện'}
                  disabled={bookmarkBusy}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleStoryBookmark(story);
                  }}
                >
                  <HeartIcon filled={bookmarked} className="story-follow-icon" />
                </button>

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
                          color:
                            story.type === 'MANGA' ? 'var(--warning)' : 'var(--accent)',
                        }}
                      >
                        {story.type === 'MANGA' ? 'Manga' : 'Novel'}
                      </span>
                      <span>Lượt xem {story.views || 0}</span>
                      <span>Đánh giá {story.averageRating || 0}</span>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="icon">Tìm</div>
          <p>Không tìm thấy truyện nào.</p>
        </div>
      )}
    </div>
  );
}
