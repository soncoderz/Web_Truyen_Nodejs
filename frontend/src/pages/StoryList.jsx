import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BookmarkIcon from '../components/BookmarkIcon';
import { useAuth } from '../context/AuthContext';
import useBookmarks, { getBookmarkLocation } from '../hooks/useBookmarks';
import { getCategories, getStories, searchStories } from '../services/api';

export default function StoryList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getStoryBookmark } = useBookmarks(user);
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
      alert('Vui long dang nhap!');
      return;
    }

    const bookmark = getStoryBookmark(story.id);
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

  return (
    <div className="container">
      <h1 className="page-title">
        {type === 'MANGA'
          ? 'Truyen Tranh'
          : type === 'NOVEL'
            ? 'Light Novel'
            : 'Tat ca truyen'}
      </h1>

      <div className="search-bar">
        <input
          className="form-control"
          placeholder="Tim kiem truyen..."
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <select className="form-control" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">Tat ca loai</option>
          <option value="MANGA">Truyen Tranh</option>
          <option value="NOVEL">Light Novel</option>
        </select>
        <select
          className="form-control"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Tat ca the loai</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select className="form-control" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Tat ca trang thai</option>
          <option value="ONGOING">Dang tien hanh</option>
          <option value="COMPLETED">Hoan thanh</option>
          <option value="DROPPED">Ngung</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
          Dang tai...
        </div>
      ) : stories.length > 0 ? (
        <div className="story-grid">
          {stories.map((story) => {
            const bookmarked = Boolean(getStoryBookmark(story.id));
            return (
              <div key={story.id} className="story-card">
                <button
                  type="button"
                  className={`story-bookmark-btn ${bookmarked ? 'active' : ''}`}
                  aria-pressed={bookmarked}
                  aria-label={bookmarked ? `Mo bookmark ${story.title}` : `Mo reader de dat bookmark cho ${story.title}`}
                  title={bookmarked ? 'Mo bookmark' : 'Bookmark trong reader'}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleStoryBookmark(story);
                  }}
                >
                  <BookmarkIcon filled={bookmarked} className="story-bookmark-icon" />
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
                      'Truyen'
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
                      <span>Views {story.views || 0}</span>
                      <span>Rating {story.averageRating || 0}</span>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="icon">Tim</div>
          <p>Khong tim thay truyen nao.</p>
        </div>
      )}
    </div>
  );
}
