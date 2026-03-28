import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login, googleLogin } from '../services/api';

const GOOGLE_CLIENT_ID = '1046290597450-hea7uomj629tv6arefmvpnjutc87jfbe.apps.googleusercontent.com';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
            text: 'signin_with',
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
      setError(err.response?.data?.message || 'Đăng nhập bằng Google thất bại!');
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await login(username, password);
      loginUser(res.data);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại!');
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>🔐 Đăng nhập</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tên đăng nhập</label>
            <input
              className="form-control"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Mật khẩu</label>
            <input
              className="form-control"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Đang xử lý...' : 'Đăng nhập'}
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider">
          <span>hoặc</span>
        </div>

        {/* Google button */}
        <div className="google-btn-wrapper" ref={googleBtnRef}></div>

        {/* Bottom links */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '1.5rem',
            fontSize: '0.9rem',
            color: 'var(--text-secondary)'
          }}
        >
          <Link to="/forgot-password">Quên mật khẩu?</Link>
          <span>
            Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
          </span>
        </div>
      </div>
    </div>
  );
}