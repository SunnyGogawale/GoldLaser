import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { 
  TrendingUp, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  User,
  X,
  Sun,
  Moon
} from 'lucide-react';
import MotionButton from '../../../components/MotionButton'
import { sanitizeClientErrorMessage } from '../../../utils/api'
import { handleApiError, showSuccessToast } from '../../../utils/toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '');

const SignUp = ({ theme, toggleTheme }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/signup`, {
        fullName,
        email,
        password,
        roll: 'user'
      });
      
      console.log('Signup successful:', response.data);
      showSuccessToast('Account created successfully! Redirecting to login...');
      navigate('/login');
    } catch (err) {
      const errorMessage = sanitizeClientErrorMessage(err.response?.data?.message || 'Something went wrong. Please try again.', 'Something went wrong. Please try again.');
      handleApiError(err, errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const isPasswordMatch = password.length > 0 && password === confirmPassword;

  return (
    <div className="login-page-container">
      {/* Theme Toggle Button */}
      <MotionButton className="theme-toggle-btn" onClick={toggleTheme}>
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </MotionButton>

      <div className="login-bg-blur">
        <div className="blur-circle primary"></div>
        <div className="blur-circle accent"></div>
      </div>

      <div className="login-card-wrapper">
        <div className="login-card">
          <Link to="/login" className="login-close-btn"><X size={18} /></Link>
          
          <div className="login-header">
            <div className="login-logo">
              <TrendingUp size={28} color="var(--primary)" />
              <span>GoldFlow</span>
            </div>
            <h1>Create Account</h1>
            <p>Join GoldFlow to manage your jewelry business effectively.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="error-message" style={{ textAlign: 'center', marginBottom: '1rem', background: '#fef2f2', padding: '0.75rem', borderRadius: '8px' }}>
                {error}
              </div>
            )}
            
            <div className="login-input-group">
              <div className="login-input-wrapper">
                <User size={18} className="input-icon" />
                <input 
                  type="text" 
                  placeholder="Full Name" 
                  value={fullName || ''}
                  onChange={(e) => setFullName(e.target.value)}
                  required 
                />
              </div>
            </div>

            <div className="login-input-group">
              <div className="login-input-wrapper">
                <Mail size={18} className="input-icon" />
                <input 
                  type="email" 
                  placeholder="Email Address" 
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
                <MotionButton 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </MotionButton>
              </div>
            </div>

            <div className="login-input-group">
              <div className="login-input-wrapper">
                <Lock size={18} className="input-icon" />
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  placeholder="Confirm Password" 
                  value={confirmPassword || ''}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required 
                />
                <MotionButton 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </MotionButton>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <span className="error-message">Passwords do not match</span>
              )}
            </div>

            <MotionButton 
              type="submit" 
              className="login-submit-btn"
              disabled={!isPasswordMatch || loading}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </MotionButton>

            <div className="login-footer">
              <span>Already have an account?</span>
              <Link to="/login" className="signup-link">Sign In</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
