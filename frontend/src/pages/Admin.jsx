import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getAdminStats, getManageStories, getCategories, getAuthors, getReports, getManageChaptersByStory,
  getStoriesForReview, getChaptersForReview,
  createStory, updateStory, deleteStory,
  createCategory, updateCategory, deleteCategory,
  createChapter, updateChapter, deleteChapter, generateChapterSummary,
  reviewStory, reviewChapter,
  importRemoteMangaPages, scanRemoteMangaSource, updateReportStatus, uploadImage, uploadMangaPages
} from '../services/api';
import api from '../services/api';
import { toast, toastFromError } from '../services/toast';
import Statistics from './Statistics';

function getApprovedStoriesByUploader(stories) {
  const groups = new Map();

  stories
    .filter((story) => (story.approvalStatus || 'APPROVED') === 'APPROVED' && story.uploaderId)
    .forEach((story) => {
      const groupKey = story.uploaderId;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          uploaderId: story.uploaderId,
          uploaderUsername: story.uploaderUsername || 'Người dùng',
          stories: [],
        });
      }

      groups.get(groupKey).stories.push(story);
    });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      stories: group.stories.sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      }),
    }))
    .sort((a, b) => {
      if (b.stories.length !== a.stories.length) {
        return b.stories.length - a.stories.length;
      }
      return a.uploaderUsername.localeCompare(b.uploaderUsername);
    });
}

const EMPTY_STORY_FORM = {
  title: '',
  description: '',
  status: 'ONGOING',
  coverImage: '',
  categoryIds: [],
  authorIds: [],
  type: 'NOVEL',
  relatedStoryIds: [],
  licensed: false,
  unlockPrice: 0,
  rentalEnabled: false,
  rentalPrice: 0,
  chapterBundleEnabled: false,
  chapterBundleSize: 3,
  chapterBundleDiscountPercent: 15,
  supportEnabled: false,
};

const EMPTY_SCAN_RESULT = {
  title: '',
  totalImages: 0,
  images: [],
  puppeteerAvailable: false,
  failures: [],
};

export default function Admin() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const [stats, setStats] = useState({});
  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [reports, setReports] = useState([]);
  const [pendingStories, setPendingStories] = useState([]);
  const [pendingChapters, setPendingChapters] = useState([]);
  const [loading, setLoading] = useState(true);

  // Story
  const [showStoryForm, setShowStoryForm] = useState(false);
  const [storyForm, setStoryForm] = useState(EMPTY_STORY_FORM);
  const [editStoryId, setEditStoryId] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverPreview, setCoverPreview] = useState('');
  const coverInputRef = useRef(null);

  // Category
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [editCategoryId, setEditCategoryId] = useState(null);

  // Author
  const [showAuthorForm, setShowAuthorForm] = useState(false);
  const [authorForm, setAuthorForm] = useState({ name: '', description: '' });
  const [editAuthorId, setEditAuthorId] = useState(null);

  // Chapter
  const [showChapterForm, setShowChapterForm] = useState(false);
  const [chapterForm, setChapterForm] = useState({
    storyId: '',
    chapterNumber: 1,
    title: '',
    content: '',
    pages: [],
    accessMode: 'FREE',
    accessPrice: 0,
  });
  const [editChapterId, setEditChapterId] = useState(null);
  const [summaryGeneratingChapterIds, setSummaryGeneratingChapterIds] = useState([]);
  const [selectedStoryChapters, setSelectedStoryChapters] = useState([]);
  const [selectedStoryId, setSelectedStoryId] = useState('');
  const [mangaFiles, setMangaFiles] = useState([]);
  const [mangaPreviews, setMangaPreviews] = useState([]);
  const [pagesUploading, setPagesUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [importSourceUrl, setImportSourceUrl] = useState('');
  const [scanUsePuppeteer, setScanUsePuppeteer] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [remoteImportBusy, setRemoteImportBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanResult, setScanResult] = useState({ ...EMPTY_SCAN_RESULT });
  const [selectedScannedImages, setSelectedScannedImages] = useState([]);
  const mangaInputRef = useRef(null);

  useEffect(() => {
    // Đợi AuthContext load xong trước khi kiểm tra user
    if (authLoading) return;
    
    if (!user || !isAdmin()) { navigate('/'); return; }
    loadData();
  }, [user, authLoading]);

  const notifyApiError = (error, fallbackMessage = 'Không thực hiện được thao tác này.') => {
    toastFromError(error, fallbackMessage);
  };

  const notifySuccess = (message) => {
    toast.success(message);
  };

  const resetScanState = () => {
    setImportSourceUrl('');
    setScanUsePuppeteer(false);
    setScanBusy(false);
    setRemoteImportBusy(false);
    setScanMessage('');
    setScanResult({ ...EMPTY_SCAN_RESULT });
    setSelectedScannedImages([]);
  };

  const toggleScannedImageSelection = (imageUrl) => {
    setSelectedScannedImages((prev) =>
      prev.includes(imageUrl)
        ? prev.filter((value) => value !== imageUrl)
        : [...prev, imageUrl],
    );
  };

  const selectAllScannedImages = () => {
    setSelectedScannedImages(Array.isArray(scanResult.images) ? [...scanResult.images] : []);
  };

  const clearScannedImageSelection = () => {
    setSelectedScannedImages([]);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, storiesRes, catsRes, authorsRes, reportsRes, pendingStoriesRes, pendingChaptersRes] = await Promise.all([
        getAdminStats(), getManageStories(), getCategories(), getAuthors(), getReports(),
        getStoriesForReview(), getChaptersForReview()
      ]);
      setStats(statsRes.data); setStories(storiesRes.data); setCategories(catsRes.data);
      setAuthors(authorsRes.data); setReports(reportsRes.data);
      setPendingStories(pendingStoriesRes.data); setPendingChapters(pendingChaptersRes.data);
    } catch (e) {
      console.error(e);
      notifyApiError(e, 'Không tải được dữ liệu quản trị.');
    } finally {
      setLoading(false);
    }
  };

  // ===== COVER IMAGE UPLOAD =====
  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverPreview(URL.createObjectURL(file));
    setCoverUploading(true);
    try {
      const res = await uploadImage(file);
      setStoryForm(prev => ({ ...prev, coverImage: res.data.url }));
    } catch (err) {
      notifyApiError(err, 'Không upload được ảnh bìa.');
    }
    setCoverUploading(false);
  };

  // ===== MANGA PAGES UPLOAD =====
  const handleMangaFilesSelect = (e) => {
    const files = Array.from(e.target.files);
    setMangaFiles(files);
    setMangaPreviews(files.map(f => URL.createObjectURL(f)));
  };

  const handleUploadMangaPages = async () => {
    if (mangaFiles.length === 0) return;
    setPagesUploading(true);
    setUploadProgress(`Đang upload ${mangaFiles.length} ảnh...`);
    try {
      const res = await uploadMangaPages(mangaFiles);
      setChapterForm(prev => ({
        ...prev,
        pages: Array.from(new Set([...(prev.pages || []), ...(res.data.urls || [])])),
      }));
      setUploadProgress(`✅ Upload ${res.data.urls.length} ảnh thành công!`);
      setMangaFiles([]); setMangaPreviews([]);
      if (mangaInputRef.current) {
        mangaInputRef.current.value = '';
      }
    } catch (err) {
      setUploadProgress('❌ Upload thất bại: ' + (err.response?.data?.message || err.message));
    }
    setPagesUploading(false);
  };

  const handleScanRemotePages = async () => {
    const sourceUrl = importSourceUrl.trim();
    if (!sourceUrl) {
      alert('Hay nhap URL chuong manga can quet.');
      return;
    }

    setScanBusy(true);
    setScanMessage('Dang quet anh tu trang nguon...');
    setScanResult({ ...EMPTY_SCAN_RESULT });
    setSelectedScannedImages([]);

    try {
      const response = await scanRemoteMangaSource({
        url: sourceUrl,
        usePuppeteer: scanUsePuppeteer,
      });
      const result = response.data || EMPTY_SCAN_RESULT;
      const nextImages = Array.isArray(result.images) ? result.images : [];

      setScanResult({
        title: result.title || '',
        totalImages: Number(result.totalImages || nextImages.length || 0),
        images: nextImages,
        puppeteerAvailable: Boolean(result.puppeteerAvailable),
        failures: [],
      });
      setSelectedScannedImages(nextImages);

      if (!chapterForm.title.trim() && result.title && result.title !== 'manga-chapter') {
        setChapterForm(prev => ({ ...prev, title: result.title }));
      }

      if (nextImages.length > 0) {
        setScanMessage(
          `Da quet duoc ${nextImages.length} anh${
            scanUsePuppeteer && !result.puppeteerAvailable
              ? ' (Puppeteer chua duoc cai, da dung che do HTML thuong).'
              : '.'
          }`,
        );
      } else {
        setScanMessage('Khong tim thay anh phu hop tren trang nay.');
      }
    } catch (err) {
      setScanResult({ ...EMPTY_SCAN_RESULT });
      setSelectedScannedImages([]);
      setScanMessage(err.response?.data?.message || err.message);
      notifyApiError(err, 'KhÃ´ng quÃ©t Ä‘Æ°á»£c áº£nh tá»« URL nÃ y.');
    } finally {
      setScanBusy(false);
    }
  };

  const handleImportRemotePages = async () => {
    const sourceUrl = importSourceUrl.trim();
    const scannedImages = Array.isArray(selectedScannedImages) ? selectedScannedImages : [];

    if (!sourceUrl) {
      alert('Hay nhap URL nguon truoc.');
      return;
    }

    if (!scannedImages.length) {
      alert('Chua co anh nao de import.');
      return;
    }

    setRemoteImportBusy(true);
    setScanMessage('Dang import anh len web cua ban...');
    try {
      const response = await importRemoteMangaPages(sourceUrl, scannedImages, {
        onBatchComplete: ({ batchIndex, totalBatches, uploadedCount, totalImages }) => {
          setScanMessage(
            `Dang import lo ${batchIndex + 1}/${totalBatches} (${uploadedCount}/${totalImages} anh)...`,
          );
        },
      });

      const importedUrls = response.data?.urls || [];
      const failures = response.data?.failures || [];

      if (importedUrls.length) {
        setChapterForm(prev => ({
          ...prev,
          pages: Array.from(new Set([...(prev.pages || []), ...importedUrls])),
        }));
      }

      setScanResult(prev => ({
        ...prev,
        failures,
      }));

      if (failures.length > 0) {
        setScanMessage(
          `Da import ${importedUrls.length} anh. Loi ${failures.length} anh, xem chi tiet ben duoi.`,
        );
      } else {
        setScanMessage(`Da import ${importedUrls.length} anh len web cua ban.`);
      }

      if (importedUrls.length > 0) {
        notifySuccess(`ÄÃ£ import ${importedUrls.length} áº£nh manga.`);
      }
    } catch (err) {
      setScanMessage(err.response?.data?.message || err.message);
      notifyApiError(err, 'KhÃ´ng import Ä‘Æ°á»£c áº£nh tá»« web khÃ¡c.');
    } finally {
      setRemoteImportBusy(false);
    }
  };

  // ===== STORY =====
  const handleSaveStory = async () => {
    const payload = {
      ...storyForm,
      chapterBundleEnabled: false,
      chapterBundleSize: 3,
      chapterBundleDiscountPercent: 15,
      unlockPrice: storyForm.licensed
        ? Math.max(Number(storyForm.unlockPrice) || 0, 1000)
        : 0,
      rentalPrice: storyForm.rentalEnabled
        ? Math.max(Number(storyForm.rentalPrice) || 0, 1000)
        : 0,
    };

    if (payload.rentalEnabled && payload.rentalPrice < 1000) {
      alert('Gia thue toi thieu la 1.000 VND.');
      return;
    }

    if (payload.licensed && payload.unlockPrice < 1000) {
      alert('Giá mở khóa tối thiểu là 1.000 VND.');
      return;
    }

    try {
      if (editStoryId) await updateStory(editStoryId, payload);
      else await createStory(payload);
      setShowStoryForm(false); setEditStoryId(null); setCoverPreview('');
      setStoryForm(EMPTY_STORY_FORM);
      loadData();
      notifySuccess(editStoryId ? 'Đã cập nhật truyện.' : 'Đã tạo truyện mới.');
    } catch (e) {
      notifyApiError(e, 'Không lưu được truyện.');
    }
  };
  const handleEditStory = (s) => {
    setStoryForm({
      title: s.title, description: s.description || '', status: s.status,
      coverImage: s.coverImage || '', type: s.type || 'NOVEL',
      categoryIds: s.categories?.map(c => c.id) || [], authorIds: s.authors?.map(a => a.id) || [],
      relatedStoryIds: s.relatedStoryIds || [],
      licensed: Boolean(s.licensed),
      unlockPrice: s.unlockPrice || 0,
      rentalEnabled: Boolean(s.rentalEnabled),
      rentalPrice: s.rentalPrice || 0,
      chapterBundleEnabled: Boolean(s.chapterBundleEnabled),
      chapterBundleSize: s.chapterBundleSize || 3,
      chapterBundleDiscountPercent: s.chapterBundleDiscountPercent ?? 15,
      supportEnabled: Boolean(s.supportEnabled),
    });
    setCoverPreview(s.coverImage || '');
    setEditStoryId(s.id); setShowStoryForm(true);
  };
  const handleDeleteStory = async (id) => {
    if (!confirm('Xóa truyện?')) return;
    try {
      await deleteStory(id);
      loadData();
      notifySuccess('Đã xóa truyện.');
    } catch (e) {
      notifyApiError(e, 'Không xóa được truyện.');
    }
  };

  // ===== CATEGORY =====
  const handleSaveCategory = async () => {
    try {
      if (editCategoryId) await updateCategory(editCategoryId, categoryForm);
      else await createCategory(categoryForm);
      setShowCategoryForm(false); setEditCategoryId(null);
      setCategoryForm({ name: '', description: '' }); loadData();
      notifySuccess(editCategoryId ? 'Đã cập nhật thể loại.' : 'Đã tạo thể loại mới.');
    } catch (e) {
      notifyApiError(e, 'Không lưu được thể loại.');
    }
  };
  const handleDeleteCategory = async (id) => {
    if (!confirm('Xóa?')) return;
    try {
      await deleteCategory(id);
      loadData();
      notifySuccess('Đã xóa thể loại.');
    } catch (e) {
      notifyApiError(e, 'Không xóa được thể loại.');
    }
  };

  // ===== AUTHOR =====
  const handleSaveAuthor = async () => {
    try {
      if (editAuthorId) await api.put(`/authors/${editAuthorId}`, authorForm);
      else await api.post('/authors', authorForm);
      setShowAuthorForm(false); setEditAuthorId(null);
      setAuthorForm({ name: '', description: '' }); loadData();
      notifySuccess(editAuthorId ? 'Đã cập nhật tác giả.' : 'Đã tạo tác giả mới.');
    } catch (e) {
      notifyApiError(e, 'Không lưu được tác giả.');
    }
  };
  const handleDeleteAuthor = async (id) => {
    if (!confirm('Xóa?')) return;
    try {
      await api.delete(`/authors/${id}`);
      loadData();
      notifySuccess('Đã xóa tác giả.');
    } catch (e) {
      notifyApiError(e, 'Không xóa được tác giả.');
    }
  };

  // ===== CHAPTER =====
  const handleLoadChapters = async (storyId) => {
    setSelectedStoryId(storyId);
    const res = await getManageChaptersByStory(storyId);
    setSelectedStoryChapters(res.data);
  };
  const getSelectedStoryType = () => stories.find(s => s.id === (chapterForm.storyId || selectedStoryId))?.type;

  const handleSaveChapter = async () => {
    try {
      const formData = {
        ...chapterForm,
        accessPrice:
          chapterForm.accessMode === 'FREE'
            ? 0
            : Math.max(Number(chapterForm.accessPrice) || 0, 1000),
      };
      if (formData.accessMode !== 'FREE' && formData.accessPrice < 1000) {
        alert('Gia chuong toi thieu la 1.000 VND.');
        return;
      }
      if (getSelectedStoryType() === 'MANGA') {
        formData.content = null;
      } else {
        formData.pages = [];
      }
      if (editChapterId) await updateChapter(editChapterId, formData);
      else await createChapter(formData);
      setShowChapterForm(false); setEditChapterId(null);
      setChapterForm({
        storyId: '',
        chapterNumber: 1,
        title: '',
        content: '',
        pages: [],
        accessMode: 'FREE',
        accessPrice: 0,
      });
      setMangaFiles([]); setMangaPreviews([]); setUploadProgress('');
      resetScanState();
      if (mangaInputRef.current) {
        mangaInputRef.current.value = '';
      }
      if (selectedStoryId) handleLoadChapters(selectedStoryId);
      loadData();
      notifySuccess(editChapterId ? 'Đã cập nhật chương.' : 'Đã tạo chương mới.');
    } catch (e) {
      notifyApiError(e, 'Không lưu được chương.');
    }
  };
  const handleDeleteChapter = async (id) => {
    if (!confirm('Xóa?')) return;
    try {
      await deleteChapter(id);
      if (selectedStoryId) handleLoadChapters(selectedStoryId);
      notifySuccess('Đã xóa chương.');
    } catch (e) {
      notifyApiError(e, 'Không xóa được chương.');
    }
  };

  const handleGenerateChapterSummary = async (chapter) => {
    if (!chapter?.id) {
      return;
    }

    setSummaryGeneratingChapterIds((prev) =>
      prev.includes(chapter.id) ? prev : [...prev, chapter.id],
    );

    try {
      const response = await generateChapterSummary(chapter.id);
      const nextChapter = response.data;

      setSelectedStoryChapters((prev) =>
        prev.map((item) => (item.id === nextChapter.id ? nextChapter : item)),
      );

      notifySuccess(`Đã tạo tóm tắt cho Ch.${chapter.chapterNumber}.`);
    } catch (e) {
      notifyApiError(e, 'Không tạo được tóm tắt AI cho chương này.');
    } finally {
      setSummaryGeneratingChapterIds((prev) => prev.filter((id) => id !== chapter.id));
    }
  };

  const handleRemovePage = (idx) => {
    setChapterForm(prev => ({ ...prev, pages: prev.pages.filter((_, i) => i !== idx) }));
  };

  // ===== MODERATION =====
  const handleReviewStory = async (id, approvalStatus) => {
    try {
      await reviewStory(id, approvalStatus);
      loadData();
      notifySuccess(
        approvalStatus === 'APPROVED' ? 'Đã duyệt truyện.' : 'Đã từ chối truyện.',
      );
    } catch (e) {
      notifyApiError(e, 'Không cập nhật được trạng thái duyệt truyện.');
    }
  };

  const handleReviewChapter = async (id, approvalStatus) => {
    try {
      await reviewChapter(id, approvalStatus);
      loadData();
      notifySuccess(
        approvalStatus === 'APPROVED' ? 'Đã duyệt chương.' : 'Đã từ chối chương.',
      );
    } catch (e) {
      notifyApiError(e, 'Không cập nhật được trạng thái duyệt chương.');
    }
  };

  // ===== REPORTS =====
  const handleReportStatus = async (id, status) => {
    try {
      await updateReportStatus(id, status);
      loadData();
      notifySuccess(status === 'RESOLVED' ? 'Đã xử lý báo lỗi.' : 'Đã bỏ qua báo lỗi.');
    } catch (e) {
      notifyApiError(e, 'Không cập nhật được trạng thái báo lỗi.');
    }
  };

  const approvedStoryGroups = getApprovedStoriesByUploader(stories);

  if (loading) return <div className="loading"><div className="spinner" />Đang tải...</div>;

  return (
    <div className="container">
      <h1 className="page-title">⚙️ Quản trị hệ thống</h1>
      <div className="tabs">
        {['dashboard', 'statistics', 'moderation', 'approvedUsers', 'stories', 'categories', 'authors', 'chapters', 'reports'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'moderation' && `Duyệt (${pendingStories.length + pendingChapters.length})`}
            {t === 'approvedUsers' && `Đã duyệt theo user (${approvedStoryGroups.length})`}
            {t === 'dashboard' && '📊 Dashboard'}
            {t === 'statistics' && '📈 Thống kê'}
            {t === 'stories' && `📚 Truyện (${stories.length})`}
            {t === 'categories' && `📁 Thể loại (${categories.length})`}
            {t === 'authors' && `✍️ Tác giả (${authors.length})`}
            {t === 'chapters' && '📖 Chương'}
            {t === 'reports' && `⚠️ Báo lỗi (${reports.filter(r => r.status === 'PENDING').length})`}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-value">{stats.pendingStories || 0}</div><div className="stat-label">Truyện chờ duyệt</div></div>
          <div className="stat-card"><div className="stat-value">{stats.pendingChapters || 0}</div><div className="stat-label">Chương chờ duyệt</div></div>
          <div className="stat-card"><div className="stat-value">{stats.totalStories || 0}</div><div className="stat-label">Truyện</div></div>
          <div className="stat-card"><div className="stat-value">{stats.totalUsers || 0}</div><div className="stat-label">Người dùng</div></div>
          <div className="stat-card"><div className="stat-value">{stats.totalChapters || 0}</div><div className="stat-label">Chương</div></div>
          <div className="stat-card"><div className="stat-value">{stats.totalComments || 0}</div><div className="stat-label">Bình luận</div></div>
          <div className="stat-card"><div className="stat-value">{stats.pendingReports || 0}</div><div className="stat-label">Báo lỗi chờ</div></div>
        </div>
      )}

      {tab === 'statistics' && <Statistics embedded />}

      {tab === 'moderation' && (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div className="card">
            <h2 style={{ marginBottom: '1rem' }}>Truyện chờ duyệt</h2>
            {pendingStories.length > 0 ? (
              <div className="table-container"><table>
                <thead><tr><th>Truyện</th><th>Người gửi</th><th>Loại</th><th>Ngày gửi</th><th>Hành động</th></tr></thead>
                <tbody>{pendingStories.map(s => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{s.uploaderUsername || s.uploaderId || '-'}</td>
                    <td>{s.type === 'MANGA' ? 'Manga' : 'Novel'}</td>
                    <td>{new Date(s.createdAt).toLocaleString('vi-VN')}</td>
                    <td><div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => handleReviewStory(s.id, 'APPROVED')}>Duyệt</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleReviewStory(s.id, 'REJECTED')}>Từ chối</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <div className="empty-state"><p>Không có truyện nào đang chờ.</p></div>}
          </div>

          <div className="card">
            <h2 style={{ marginBottom: '1rem' }}>Chương chờ duyệt</h2>
            {pendingChapters.length > 0 ? (
              <div className="table-container"><table>
                <thead><tr><th>Truyện</th><th>Chương</th><th>Người gửi</th><th>Ngày gửi</th><th>Hành động</th></tr></thead>
                <tbody>{pendingChapters.map(ch => (
                  <tr key={ch.id}>
                    <td>{stories.find(s => s.id === ch.storyId)?.title || ch.storyId}</td>
                    <td>Ch.{ch.chapterNumber}: {ch.title}</td>
                    <td>{ch.uploaderUsername || ch.uploaderId || '-'}</td>
                    <td>{new Date(ch.createdAt).toLocaleString('vi-VN')}</td>
                    <td><div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => handleReviewChapter(ch.id, 'APPROVED')}>Duyệt</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleReviewChapter(ch.id, 'REJECTED')}>Từ chối</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <div className="empty-state"><p>Không có chương nào đang chờ.</p></div>}
          </div>
        </div>
      )}

      {tab === 'approvedUsers' && (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ marginBottom: '0.35rem' }}>Tất cả truyện đã duyệt theo người đăng</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                  Admin có thể xem từng tài khoản đang có bao nhiêu truyện đã được phê duyệt.
                </p>
              </div>
              <span className="category-tag">
                {approvedStoryGroups.reduce((sum, group) => sum + group.stories.length, 0)} truyện đã duyệt
              </span>
            </div>
          </div>

          {approvedStoryGroups.length > 0 ? (
            <div className="approved-user-groups">
              {approvedStoryGroups.map((group) => (
                <div key={group.uploaderId} className="approved-user-card">
                  <div className="approved-user-card-header">
                    <div>
                      <h3>{group.uploaderUsername}</h3>
                      <p>{group.uploaderId}</p>
                    </div>
                    <span className="approved-user-count">{group.stories.length} truyện</span>
                  </div>

                  <div className="approved-user-story-list">
                    {group.stories.map((story) => (
                      <div key={story.id} className="approved-user-story-row">
                        <div className="approved-user-story-main">
                          {story.coverImage ? (
                            <img src={story.coverImage} alt="" className="approved-user-story-cover" />
                          ) : (
                            <div className="approved-user-story-cover approved-user-story-cover-fallback">ðŸ“š</div>
                          )}
                          <div>
                            <div className="approved-user-story-title">{story.title}</div>
                            <div className="approved-user-story-meta">
                              <span>{story.type === 'MANGA' ? 'Manga' : 'Novel'}</span>
                              <span>{story.status}</span>
                              <span>{'\u{1F441}'} {story.views || 0}</span>
                              <span>{'\u2B50'} {story.averageRating || 0}</span>
                            </div>
                          </div>
                        </div>
                        <div className="approved-user-story-side">
                          <span className="status-badge status-APPROVED">APPROVED</span>
                          <small>{new Date(story.updatedAt || story.createdAt).toLocaleString('vi-VN')}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <div className="empty-state">
                <p>ChÆ°a cÃ³ truyá»‡n nÃ o cá»§a nguoi dung duoc phe duyet.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'stories' && (
        <div>
          <button className="btn btn-primary" onClick={() => { setShowStoryForm(true); setEditStoryId(null); setCoverPreview('');
            setStoryForm(EMPTY_STORY_FORM); }}
            style={{ marginBottom: '1rem' }}>+ Thêm truyện</button>
          <div className="table-container"><table>
            <thead><tr><th>Tên truyện</th><th>Loại</th><th>Trạng thái</th><th>Lượt xem</th><th>Đánh giá</th><th>Hành động</th></tr></thead>
            <tbody>{stories.map(s => (
              <tr key={s.id}>
                <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {s.coverImage && <img src={s.coverImage} alt="" style={{ width: '32px', height: '44px', objectFit: 'cover', borderRadius: '4px' }} />}
                  {s.title}
                </td>
                <td><span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                  background: s.type === 'MANGA' ? 'var(--badge-manga-bg)' : 'var(--badge-novel-bg)',
                  color: s.type === 'MANGA' ? 'var(--warning)' : 'var(--accent)'
                }}>{s.type === 'MANGA' ? '🎨 Manga' : '📝 Novel'}</span></td>
                <td><div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <span className={`status-badge status-${s.status}`}>{s.status}</span>
                  <span className={`status-badge status-${s.approvalStatus || 'APPROVED'}`}>{s.approvalStatus || 'APPROVED'}</span>
                  {s.licensed && (
                    <span className="status-badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                      Tính phí · {(s.unlockPrice || 0).toLocaleString('vi-VN')} VND
                    </span>
                  )}
                  {s.rentalEnabled && (
                    <span className="status-badge" style={{ background: 'var(--accent-soft-2)', color: 'var(--accent)' }}>
                      Thue 7 ngay Â· {(s.rentalPrice || 0).toLocaleString('vi-VN')} VND
                    </span>
                  )}
                  {s.supportEnabled && (
                    <span className="status-badge" style={{ background: 'var(--bg-glass)', color: 'var(--text-primary)' }}>
                      Mo ung ho
                    </span>
                  )}
                </div></td>
                <td>👁 {s.views || 0}</td>
                <td>⭐ {s.averageRating || 0}</td>
                <td><div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => handleEditStory(s)}>Sửa</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteStory(s.id)}>Xóa</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {tab === 'categories' && (
        <div>
          <button className="btn btn-primary" onClick={() => { setShowCategoryForm(true); setEditCategoryId(null); setCategoryForm({ name: '', description: '' }); }}
            style={{ marginBottom: '1rem' }}>+ Thêm thể loại</button>
          <div className="table-container"><table>
            <thead><tr><th>Tên</th><th>Mô tả</th><th>Hành động</th></tr></thead>
            <tbody>{categories.map(c => (
              <tr key={c.id}><td>{c.name}</td><td>{c.description || '—'}</td>
                <td><div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => { setCategoryForm({ name: c.name, description: c.description || '' }); setEditCategoryId(c.id); setShowCategoryForm(true); }}>Sửa</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteCategory(c.id)}>Xóa</button>
                </div></td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {tab === 'authors' && (
        <div>
          <button className="btn btn-primary" onClick={() => { setShowAuthorForm(true); setEditAuthorId(null); setAuthorForm({ name: '', description: '' }); }}
            style={{ marginBottom: '1rem' }}>+ Thêm tác giả</button>
          <div className="table-container"><table>
            <thead><tr><th>Tên tác giả</th><th>Mô tả</th><th>Hành động</th></tr></thead>
            <tbody>{authors.map(a => (
              <tr key={a.id}><td>{a.name}</td><td>{a.description || '—'}</td>
                <td><div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => { setAuthorForm({ name: a.name, description: a.description || '' }); setEditAuthorId(a.id); setShowAuthorForm(true); }}>Sửa</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteAuthor(a.id)}>Xóa</button>
                </div></td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {tab === 'chapters' && (
        <div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
            <select className="form-control" style={{ maxWidth: '300px' }} value={selectedStoryId}
              onChange={e => { setSelectedStoryId(e.target.value); if (e.target.value) handleLoadChapters(e.target.value); }}>
              <option value="">Chọn truyện...</option>
              {stories.map(s => <option key={s.id} value={s.id}>{s.type === 'MANGA' ? '🎨' : '📝'} {s.title}</option>)}
            </select>
            {selectedStoryId && (
              <button className="btn btn-primary" onClick={() => {
                setShowChapterForm(true); setEditChapterId(null);
                setMangaFiles([]); setMangaPreviews([]); setUploadProgress('');
                resetScanState();
                if (mangaInputRef.current) {
                  mangaInputRef.current.value = '';
                }
                setChapterForm({
                  storyId: selectedStoryId,
                  chapterNumber: selectedStoryChapters.length + 1,
                  title: '',
                  content: '',
                  pages: [],
                  accessMode: 'FREE',
                  accessPrice: 0,
                });
              }}>+ Thêm chương</button>
            )}
          </div>
          {selectedStoryId && (
            <div className="card">
              {selectedStoryChapters.length > 0 ? (
                <ul className="chapter-list">{selectedStoryChapters.map(ch => (
                  <li key={ch.id} className="chapter-item">
                    <span className="chapter-title">Ch.{ch.chapterNumber}: {ch.title} {ch.pages?.length > 0 ? `(${ch.pages.length} trang ảnh)` : ''}</span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleGenerateChapterSummary(ch)}
                        disabled={summaryGeneratingChapterIds.includes(ch.id)}
                        title="Tạo lại tóm tắt AI cho chương"
                      >
                        {summaryGeneratingChapterIds.includes(ch.id) ? 'Đang tóm tắt...' : 'Tóm tắt'}
                      </button>
                      <Link
                        to={`/story/${ch.storyId}/chapter/${ch.id}`}
                        className="btn btn-sm btn-outline"
                        title="Xem chương"
                      >
                        Xem
                      </Link>
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
                          ? `Early access · ${(ch.accessPrice || 0).toLocaleString('vi-VN')} VND`
                          : ch.accessMode === 'PURCHASE'
                            ? `Mua rieng · ${(ch.accessPrice || 0).toLocaleString('vi-VN')} VND`
                            : 'FREE'}
                      </span>
                      <button className="btn btn-sm btn-outline" onClick={() => {
                        setChapterForm({
                          storyId: ch.storyId,
                          chapterNumber: ch.chapterNumber,
                          title: ch.title,
                          content: ch.content || '',
                          pages: ch.pages || [],
                          accessMode: ch.accessMode || 'FREE',
                          accessPrice: ch.accessPrice || 0,
                        });
                        setMangaFiles([]); setMangaPreviews([]); setUploadProgress('');
                        resetScanState();
                        if (mangaInputRef.current) {
                          mangaInputRef.current.value = '';
                        }
                        setEditChapterId(ch.id); setShowChapterForm(true);
                      }}>Sửa</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeleteChapter(ch.id)}>Xóa</button>
                    </div>
                  </li>
                ))}</ul>
              ) : <div className="empty-state"><p>Chưa có chương nào.</p></div>}
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <div className="table-container"><table>
          <thead><tr><th>Truyện</th><th>Lý do</th><th>Trạng thái</th><th>Ngày</th><th>Hành động</th></tr></thead>
          <tbody>{reports.map(r => (
            <tr key={r.id}>
              <td>{stories.find(s => s.id === r.storyId)?.title || r.storyId}</td>
              <td>{r.reason}</td>
              <td><span className={`status-badge status-${r.status === 'PENDING' ? 'ONGOING' : r.status === 'RESOLVED' ? 'COMPLETED' : 'DROPPED'}`}>{r.status}</span></td>
              <td>{new Date(r.createdAt).toLocaleDateString('vi-VN')}</td>
              <td>{r.status === 'PENDING' && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-sm btn-primary" onClick={() => handleReportStatus(r.id, 'RESOLVED')}>Xử lý</button>
                  <button className="btn btn-sm btn-outline" onClick={() => handleReportStatus(r.id, 'DISMISSED')}>Bỏ qua</button>
                </div>
              )}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {/* ===== STORY FORM MODAL ===== */}
      {showStoryForm && (
        <div className="modal-overlay" onClick={() => setShowStoryForm(false)}>
          <div className="modal admin-story-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editStoryId ? 'Sửa truyện' : 'Thêm truyện mới'}</h2>
            <div className="form-group"><label>Loại truyện *</label>
              <select className="form-control" value={storyForm.type} onChange={e => setStoryForm({ ...storyForm, type: e.target.value })}>
                <option value="NOVEL">📝 Light Novel (Chữ)</option>
                <option value="MANGA">🎨 Truyện Tranh (Ảnh)</option>
              </select></div>
            <div className="form-group"><label>Tên truyện *</label>
              <input className="form-control" value={storyForm.title} onChange={e => setStoryForm({ ...storyForm, title: e.target.value })} /></div>
            <div className="form-group"><label>Mô tả</label>
              <textarea className="form-control" value={storyForm.description} onChange={e => setStoryForm({ ...storyForm, description: e.target.value })} /></div>

            {/* Cover Image Upload */}
            <div className="form-group"><label>📷 Ảnh bìa</label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: '120px', height: '160px', borderRadius: '8px', overflow: 'hidden',
                  border: '2px dashed var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', background: 'var(--accent-soft-2)', flexShrink: 0
                }} onClick={() => coverInputRef.current?.click()}>
                  {(coverPreview || storyForm.coverImage) ? (
                    <img src={coverPreview || storyForm.coverImage} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.3rem' }}>📷</div>
                      Chọn ảnh
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
                  <button className="btn btn-outline" onClick={() => coverInputRef.current?.click()} disabled={coverUploading} style={{ marginBottom: '0.5rem' }}>
                    {coverUploading ? '⏳ Đang upload...' : '📁 Chọn từ máy'}
                  </button>
                  {storyForm.coverImage && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--success)', wordBreak: 'break-all' }}>✅ {storyForm.coverImage}</p>
                  )}
                  <div style={{ marginTop: '0.3rem' }}>
                    <input className="form-control" style={{ fontSize: '0.8rem' }} placeholder="Hoặc nhập URL ảnh..."
                      value={storyForm.coverImage} onChange={e => { setStoryForm({ ...storyForm, coverImage: e.target.value }); setCoverPreview(e.target.value); }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group"><label>Trạng thái</label>
              <select className="form-control" value={storyForm.status} onChange={e => setStoryForm({ ...storyForm, status: e.target.value })}>
                <option value="ONGOING">Đang tiến hành</option><option value="COMPLETED">Hoàn thành</option><option value="DROPPED">Ngừng</option>
              </select></div>
            <div className="form-group">
              <label>Kiểu bán</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={Boolean(storyForm.licensed)}
                  onChange={e => setStoryForm(prev => ({
                    ...prev,
                    licensed: e.target.checked,
                    unlockPrice: e.target.checked
                      ? Math.max(Number(prev.unlockPrice) || 0, 1000)
                      : 0,
                  }))}
                />
                Truyện tính phí
              </label>
              {storyForm.licensed && (
                <div>
                  <label>Giá mua trọn bộ (VND)</label>
                  <input
                    className="form-control"
                    type="number"
                    min="1000"
                    step="1000"
                    value={storyForm.unlockPrice}
                    onChange={e => setStoryForm({ ...storyForm, unlockPrice: Number(e.target.value) || 0 })}
                  />
                </div>
              )}
            </div>
            <div className="form-group"><label>Thể loại</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {categories.map(c => (
                  <label key={c.id} style={{ padding: '0.3rem 0.6rem', background: storyForm.categoryIds.includes(c.id) ? 'var(--accent)' : 'var(--bg-glass)', borderRadius: '16px', cursor: 'pointer', fontSize: '0.8rem', color: storyForm.categoryIds.includes(c.id) ? 'var(--text-inverse)' : 'var(--text-primary)' }}>
                    <input type="checkbox" checked={storyForm.categoryIds.includes(c.id)} onChange={e => {
                      const ids = e.target.checked ? [...storyForm.categoryIds, c.id] : storyForm.categoryIds.filter(x => x !== c.id);
                      setStoryForm({ ...storyForm, categoryIds: ids });
                    }} style={{ display: 'none' }} />{c.name}
                  </label>
                ))}
              </div></div>
            <div className="form-group"><label>Tác giả</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {authors.map(a => (
                  <label key={a.id} style={{ padding: '0.3rem 0.6rem', background: storyForm.authorIds.includes(a.id) ? 'var(--success)' : 'var(--bg-glass)', borderRadius: '16px', cursor: 'pointer', fontSize: '0.8rem', color: storyForm.authorIds.includes(a.id) ? 'var(--text-inverse)' : 'var(--text-primary)' }}>
                    <input type="checkbox" checked={storyForm.authorIds.includes(a.id)} onChange={e => {
                      const ids = e.target.checked ? [...storyForm.authorIds, a.id] : storyForm.authorIds.filter(x => x !== a.id);
                      setStoryForm({ ...storyForm, authorIds: ids });
                    }} style={{ display: 'none' }} />{a.name}
                  </label>
                ))}
              </div></div>
            <div className="form-group"><label>🔗 Liên kết truyện</label>
              <select className="form-control" multiple style={{ height: '80px' }} value={storyForm.relatedStoryIds}
                onChange={e => setStoryForm({ ...storyForm, relatedStoryIds: Array.from(e.target.selectedOptions, o => o.value) })}>
                {stories.filter(s => s.id !== editStoryId).map(s => (
                  <option key={s.id} value={s.id}>{s.type === 'MANGA' ? '🎨' : '📝'} {s.title}</option>
                ))}
              </select></div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={Boolean(storyForm.rentalEnabled)}
                  onChange={e => setStoryForm(prev => ({
                    ...prev,
                    rentalEnabled: e.target.checked,
                    rentalPrice: e.target.checked
                      ? Math.max(Number(prev.rentalPrice) || 0, 1000)
                      : 0,
                  }))}
                />
                Thue truyện 7 ngay
              </label>
              {storyForm.rentalEnabled && (
                <div>
                  <label>Gia thue 7 ngay (VND)</label>
                  <input
                    className="form-control"
                    type="number"
                    min="1000"
                    step="1000"
                    value={storyForm.rentalPrice}
                    onChange={e => setStoryForm({ ...storyForm, rentalPrice: Number(e.target.value) || 0 })}
                  />
                </div>
              )}
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={Boolean(storyForm.supportEnabled)}
                  onChange={e => setStoryForm({ ...storyForm, supportEnabled: e.target.checked })}
                />
                Mo ung ho tac gia
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowStoryForm(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSaveStory} disabled={coverUploading}>Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CATEGORY FORM ===== */}
      {showCategoryForm && (
        <div className="modal-overlay" onClick={() => setShowCategoryForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editCategoryId ? 'Sửa thể loại' : 'Thêm thể loại'}</h2>
            <div className="form-group"><label>Tên *</label><input className="form-control" value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} /></div>
            <div className="form-group"><label>Mô tả</label><textarea className="form-control" value={categoryForm.description} onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })} /></div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCategoryForm(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSaveCategory}>Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== AUTHOR FORM ===== */}
      {showAuthorForm && (
        <div className="modal-overlay" onClick={() => setShowAuthorForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editAuthorId ? 'Sửa tác giả' : 'Thêm tác giả'}</h2>
            <div className="form-group"><label>Tên *</label><input className="form-control" value={authorForm.name} onChange={e => setAuthorForm({ ...authorForm, name: e.target.value })} /></div>
            <div className="form-group"><label>Mô tả</label><textarea className="form-control" value={authorForm.description} onChange={e => setAuthorForm({ ...authorForm, description: e.target.value })} /></div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowAuthorForm(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSaveAuthor}>Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CHAPTER FORM MODAL ===== */}
      {showChapterForm && (
        <div className="modal-overlay" onClick={() => { setShowChapterForm(false); resetScanState(); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editChapterId ? 'Sửa chương' : 'Thêm chương mới'}
              <span style={{
                marginLeft: '0.5rem', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem',
                background: getSelectedStoryType() === 'MANGA' ? 'var(--badge-manga-bg)' : 'var(--badge-novel-bg)',
                color: getSelectedStoryType() === 'MANGA' ? 'var(--warning)' : 'var(--accent)'
              }}>{getSelectedStoryType() === 'MANGA' ? '🎨 Manga' : '📝 Novel'}</span>
            </h2>
            <div className="form-group"><label>Số chương</label>
              <input className="form-control" type="number" value={chapterForm.chapterNumber}
                onChange={e => setChapterForm({ ...chapterForm, chapterNumber: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Tiêu đề *</label>
              <input className="form-control" value={chapterForm.title} onChange={e => setChapterForm({ ...chapterForm, title: e.target.value })} /></div>

            <div className="form-group">
              <label>Che do mo khoa</label>
              <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div>
                  <select
                    className="form-control"
                    value={chapterForm.accessMode}
                    onChange={e => setChapterForm(prev => ({
                      ...prev,
                      accessMode: e.target.value,
                      accessPrice: e.target.value === 'FREE'
                        ? 0
                        : Math.max(Number(prev.accessPrice) || 0, 1000),
                    }))}
                  >
                    <option value="FREE">FREE</option>
                    <option value="PURCHASE">Mua rieng chuong</option>
                    <option value="EARLY_ACCESS">Early access</option>
                  </select>
                </div>
                {chapterForm.accessMode !== 'FREE' && (
                  <div>
                    <input
                      className="form-control"
                      type="number"
                      min="1000"
                      step="1000"
                      value={chapterForm.accessPrice}
                      onChange={e => setChapterForm({ ...chapterForm, accessPrice: Number(e.target.value) || 0 })}
                      placeholder="Gia mo khoa (VND)"
                    />
                  </div>
                )}
              </div>
            </div>
            {getSelectedStoryType() === 'MANGA' ? (
              /* MANGA: Image Pages Upload */
              <div className="form-group">
                <label>🎨 Trang ảnh chương manga</label>

                <div style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Quet va import anh tu URL ngoai
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 320px' }}>
                      <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.82rem' }}>
                        URL chuong manga tu web khac
                      </label>
                      <input
                        className="form-control"
                        placeholder="https://..."
                        value={importSourceUrl}
                        onChange={e => setImportSourceUrl(e.target.value)}
                      />
                    </div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        minHeight: '42px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={scanUsePuppeteer}
                        onChange={e => setScanUsePuppeteer(e.target.checked)}
                      />
                      Thu Puppeteer
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={handleScanRemotePages}
                      disabled={scanBusy || remoteImportBusy || pagesUploading}
                    >
                      {scanBusy ? 'Dang quet...' : 'Quet anh tu URL'}
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={handleImportRemotePages}
                      disabled={
                        scanBusy ||
                        remoteImportBusy ||
                        pagesUploading ||
                        !Array.isArray(selectedScannedImages) ||
                        selectedScannedImages.length === 0
                      }
                    >
                      {remoteImportBusy
                        ? 'Dang import...'
                        : `Import ${selectedScannedImages.length} anh len web`}
                    </button>
                  </div>
                  {scanMessage && (
                    <p style={{ margin: '0.75rem 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      {scanMessage}
                    </p>
                  )}
                  {scanResult.title && (
                    <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      Tieu de quet duoc: <strong style={{ color: 'var(--text-primary)' }}>{scanResult.title}</strong>
                    </p>
                  )}
                  {Array.isArray(scanResult.images) && scanResult.images.length > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          Da tim thay {scanResult.images.length} anh. Da chon {selectedScannedImages.length} anh de import.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button className="btn btn-outline btn-sm" type="button" onClick={selectAllScannedImages}>
                            Chon tat ca
                          </button>
                          <button className="btn btn-outline btn-sm" type="button" onClick={clearScannedImageSelection}>
                            Bo chon het
                          </button>
                        </div>
                      </div>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Bam vao tung anh de chon hoac bo chon truoc khi import.
                      </p>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                          gap: '0.5rem',
                          maxHeight: '360px',
                          overflowY: 'auto',
                          paddingRight: '0.25rem',
                        }}
                      >
                        {scanResult.images.map((imageUrl, index) => {
                          const isSelected = selectedScannedImages.includes(imageUrl);
                          return (
                            <button
                              key={`${imageUrl}-${index}`}
                              type="button"
                              onClick={() => toggleScannedImageSelection(imageUrl)}
                              style={{
                                border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                background: 'var(--bg-primary)',
                                padding: 0,
                                cursor: 'pointer',
                                textAlign: 'left',
                                boxShadow: isSelected ? '0 0 0 2px rgba(99, 102, 241, 0.15)' : 'none',
                              }}
                            >
                              <img
                                src={imageUrl}
                                alt={`Scanned page ${index + 1}`}
                                style={{
                                  width: '100%',
                                  height: '110px',
                                  objectFit: 'cover',
                                  display: 'block',
                                  opacity: isSelected ? 1 : 0.45,
                                }}
                                loading="lazy"
                              />
                              <div
                                style={{
                                  padding: '0.35rem',
                                  fontSize: '0.72rem',
                                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: '0.35rem',
                                  alignItems: 'center',
                                }}
                              >
                                <span>Trang {index + 1}</span>
                                <span style={{ color: isSelected ? 'var(--success)' : 'var(--text-secondary)' }}>
                                  {isSelected ? 'Da chon' : 'Bo chon'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {Array.isArray(scanResult.failures) && scanResult.failures.length > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <p style={{ margin: '0 0 0.45rem', color: 'var(--warning)', fontSize: '0.82rem' }}>
                        Mot so anh import loi:
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {scanResult.failures.slice(0, 5).map((failure, index) => (
                          <div
                            key={`${failure.url || 'failure'}-${index}`}
                            style={{
                              fontSize: '0.76rem',
                              color: 'var(--text-secondary)',
                              padding: '0.55rem 0.7rem',
                              borderRadius: '8px',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border)',
                              wordBreak: 'break-word',
                            }}
                          >
                            {failure.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Upload area */}
                <div style={{
                  border: '2px dashed var(--badge-manga-bg)', borderRadius: '12px', padding: '1.5rem',
                  textAlign: 'center', cursor: 'pointer', background: 'var(--accent-soft-2)', marginBottom: '1rem'
                }} onClick={() => mangaInputRef.current?.click()}>
                  <input ref={mangaInputRef} type="file" accept="image/*" multiple onChange={handleMangaFilesSelect} style={{ display: 'none' }} />
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📁</div>
                  <p style={{ color: 'var(--warning)', fontWeight: 600 }}>Chọn nhiều ảnh từ máy tính</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Hỗ trợ JPG, PNG, WEBP. Mỗi file tối đa 10MB.</p>
                </div>

                {/* Selected files preview */}
                {mangaPreviews.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>📸 {mangaFiles.length} ảnh đã chọn</p>
                      <button className="btn btn-primary btn-sm" onClick={handleUploadMangaPages} disabled={pagesUploading || scanBusy || remoteImportBusy}>
                        {pagesUploading ? '⏳ Đang upload...' : `☁️ Upload lên Cloudinary`}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {mangaPreviews.map((p, i) => (
                        <img key={i} src={p} alt={`Preview ${i + 1}`}
                          style={{ width: '60px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border)' }} />
                      ))}
                    </div>
                  </div>
                )}

                {uploadProgress && <p style={{ fontSize: '0.8rem', color: uploadProgress.startsWith('✅') ? 'var(--success)' : uploadProgress.startsWith('❌') ? 'var(--danger)' : 'var(--text-secondary)' }}>{uploadProgress}</p>}

                {/* Uploaded pages list */}
                {chapterForm.pages.length > 0 && (
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>✅ {chapterForm.pages.length} trang đã upload:</p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {chapterForm.pages.map((url, idx) => (
                        <div key={idx} style={{ position: 'relative', width: '70px' }}>
                          <img src={url} alt={`Page ${idx + 1}`}
                            style={{ width: '70px', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                          <button onClick={() => handleRemovePage(idx)}
                            style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--danger)', color: 'var(--text-inverse)', border: 'none', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                          <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Trang {idx + 1}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* NOVEL: Text Content */
              <div className="form-group"><label>📝 Nội dung chương</label>
                <textarea className="form-control" style={{ minHeight: '300px' }} value={chapterForm.content}
                  onChange={e => setChapterForm({ ...chapterForm, content: e.target.value })} /></div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setShowChapterForm(false); resetScanState(); }}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSaveChapter} disabled={pagesUploading || scanBusy || remoteImportBusy}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
