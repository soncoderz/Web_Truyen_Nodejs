import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { forgotPassword } from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await forgotPassword(email);
      setMessage(res.data?.message || 'Email khôi phục mật khẩu đã được gửi!');
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại!');
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>📧 Quên Mật Khẩu</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success" style={{ backgroundColor: 'var(--success)', color: 'var(--text-inverse)', padding: '0.8rem', borderRadius: '4px', marginBottom: '1rem' }}>{message}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nhập Email của bạn</label>
            <input 
              className="form-control" 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Đang gửi...' : 'Gửi Yêu Cầu'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Nhớ mật khẩu? <Link to="/login">Đăng nhập ngay</Link>
        </p>
      </div>
    </div>
  );
}
