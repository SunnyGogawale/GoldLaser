import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { 
  TrendingUp, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  X,
  Sun,
  Moon
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '');

const Login = ({ setIsLoggedIn, theme, toggleTheme }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminLink, setShowAdminLink] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/signin`, {
        email,
        password,
        requiredRole: 'user' // Flag for User Login
      });

      console.log('Login successful:', response.data);
      
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userRole', response.data?.user?.roll || response.data?.user?.role || 'user');
      localStorage.setItem('userFullName', response.data?.user?.fullName || '');
      localStorage.setItem('userEmail', response.data?.user?.email || '');
      setIsLoggedIn(true);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('Login error:', err.response?.data || err.message);
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      {/* Theme Toggle Button */}
      <button className="theme-toggle-btn" onClick={toggleTheme}>
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>

      {/* Blurred Background Elements */}
      <div className="login-bg-blur">
        <div className="blur-circle primary"></div>
        <div className="blur-circle accent"></div>
      </div>

      <div className="login-card-wrapper">
        <div className="login-card">
          <Link to="/" className="login-close-btn"><X size={18} /></Link>
          
          <div className="login-header">
            <div className="login-logo">
              <TrendingUp size={28} color="var(--primary)" />
              <span>GoldFlow</span>
            </div>
            <h1 onDoubleClick={() => setShowAdminLink(!showAdminLink)} style={{ cursor: 'pointer', userSelect: 'none' }}>
              Sign in with email
            </h1>
            <p>Access your personalized jewelry management assistant.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="error-message" style={{ textAlign: 'center', marginBottom: '1rem', background: '#fef2f2', padding: '0.75rem', borderRadius: '8px' }}>
                {error}
              </div>
            )}
            
            <div className="login-input-group">
              <div className="login-input-wrapper">
                <Mail size={18} className="input-icon" />
                <input 
                  type="email" 
                  placeholder="Email" 
                  value={email || ''}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>
            </div>

            <div className="login-input-group">
              <div className="login-input-wrapper">
                <Lock size={18} className="input-icon" />
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Password" 
                  value={password || ''}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                />
                <button 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="login-extra">
              <Link to="/forgot-password" name="forgot-password" className="forgot-password">Forgot password?</Link>
            </div>

            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Get Started'}
            </button>

            {showAdminLink && (
              <div className="login-footer">
                <span>Are you an admin?</span>
                <Link to="/admin" className="signup-link">Admin Login</Link>
              </div>
            )}
            
            <div className="login-footer">
              <span>Don't have an account?</span>
              <Link to="/signup" className="signup-link">Sign Up</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
