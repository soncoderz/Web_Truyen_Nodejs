import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      setError('Token không hợp lệ hoặc đã hết hạn!');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp!');
      return;
    }
    
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await resetPassword(token, newPassword);
      setMessage('Đổi mật khẩu thành công! Chuyển hướng tới đăng nhập...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra, có thể Token đã hết hạn!');
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>🔑 Đặt lại Mật Khẩu</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success" style={{ backgroundColor: 'var(--success)', color: 'white', padding: '0.8rem', borderRadius: '4px', marginBottom: '1rem' }}>{message}</div>}
        
        {!token ? (
          <div className="alert alert-error">Link không hợp lệ! Thiếu Token xác nhận.</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Mật khẩu mới</label>
              <input 
                className="form-control" 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                required 
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label>Xác nhận mật khẩu</label>
              <input 
                className="form-control" 
                type="password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                required 
                minLength={6}
              />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Đang xử lý...' : 'Đổi Mật Khẩu'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
