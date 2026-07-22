import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  X,
  Sun,
  Moon
} from 'lucide-react';
import { setAuthSession } from '../../../utils/authStorage';
import MotionButton from '../../../components/MotionButton'
import { sanitizeClientErrorMessage } from '../../../utils/api'
import { handleApiError, showSuccessToast } from '../../../utils/toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '');

const AdminLogin = ({ setIsLoggedIn, theme, toggleTheme }) => {
  const [showPassword, setShowPassword] = useState(false);
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
        requiredRole: 'admin' // Flag for Admin Login
      });

      console.log('Admin login successful:', response.data);
      showSuccessToast('Admin login successful! Redirecting to dashboard...');
      
      setAuthSession({
        token: response.data.token,
        role: response.data?.user?.roll || response.data?.user?.role || 'admin',
        fullName: response.data?.user?.fullName || '',
        email: response.data?.user?.email || ''
      });
      setIsLoggedIn(true);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const errorMessage = sanitizeClientErrorMessage(err.response?.data?.message || 'Invalid admin credentials', 'Invalid admin credentials');
      handleApiError(err, errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container admin-theme">
      {/* Theme Toggle Button */}
      <MotionButton className="theme-toggle-btn" onClick={toggleTheme}>
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </MotionButton>

      {/* Blurred Background Elements */}
      <div className="login-bg-blur">
        <div className="blur-circle admin-primary"></div>
        <div className="blur-circle admin-accent"></div>
      </div>

      <div className="login-card-wrapper">
        <div className="login-card">
          <Link to="/" className="login-close-btn"><X size={18} /></Link>
          
          <div className="login-header">
            <div className="login-logo">
              <ShieldCheck size={28} color="#ef4444" />
              <span style={{ color: '#ef4444' }}>Admin Panel</span>
            </div>
            <h1>Admin Login</h1>
            <p>Enter your credentials to access the administrative dashboard.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="error-message" style={{ textAlign: 'center', marginBottom: '1rem', background: '#fef2f2', padding: '0.75rem', borderRadius: '8px', color: '#dc2626', fontWeight: '500' }}>
                {error}
              </div>
            )}
            
            <div className="login-input-group">
              <div className="login-input-wrapper">
                <Mail size={18} className="input-icon" />
                <input 
                  type="email" 
                  placeholder="Admin Email" 
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
                  placeholder="Admin Password" 
                  value={password || ''}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                />
                <MotionButton 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </MotionButton>
              </div>
            </div>

            <MotionButton type="submit" className="login-submit-btn admin-btn" disabled={loading}>
              {loading ? 'Authenticating...' : 'Access Admin Dashboard'}
            </MotionButton>

            <div className="login-footer">
              <span>Not an admin?</span>
              <Link to="/login" className="signup-link">User Login</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
