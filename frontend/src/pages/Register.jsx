import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { register, googleLogin } from '../services/api';

const GOOGLE_CLIENT_ID = '1046290597450-hea7uomj629tv6arefmvpnjutc87jfbe.apps.googleusercontent.com';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);

  useEffect(() => {
    const initGoogle = () => {
      if (window.google && window.google.accounts) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCallback,
        });
        window.google.accounts.id.renderButton(
          googleBtnRef.current,
          {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'signup_with',
            shape: 'rectangular',
            logo_alignment: 'left',
          }
        );
      }
    };

    if (window.google && window.google.accounts) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google && window.google.accounts) {
          clearInterval(interval);
          initGoogle();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  const handleGoogleCallback = async (response) => {
    setLoading(true);
    setError('');
    try {
      const res = await googleLogin(response.credential);
      loginUser(res.data);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký bằng Google thất bại!');
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(username, email, password);
      setSuccess('Đăng ký thành công! Đang chuyển hướng...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký thất bại!');
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>✨ Đăng ký</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tên đăng nhập</label>
            <input className="form-control" value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Mật khẩu</label>
            <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Đăng ký'}
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider">
          <span>hoặc</span>
        </div>

        {/* Google Sign-Up Button */}
        <div className="google-btn-wrapper" ref={googleBtnRef}></div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
