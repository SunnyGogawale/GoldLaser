import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  TrendingUp, 
  Mail, 
  ChevronLeft,
  X,
  Sun,
  Moon
} from 'lucide-react';

const ForgotPassword = ({ theme, toggleTheme }) => {
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle password reset logic here
    alert('Password reset link sent to your email!');
    navigate('/login');
  };

  return (
    <div className="login-page-container">
      {/* Theme Toggle Button */}
      <button className="theme-toggle-btn" onClick={toggleTheme}>
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>

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
            <h1>Reset Password</h1>
            <p>Enter your email and we'll send you a link to reset your password.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-input-group">
              <div className="login-input-wrapper">
                <Mail size={18} className="input-icon" />
                <input type="email" placeholder="Email Address" required />
              </div>
            </div>

            <button type="submit" className="login-submit-btn">
              Send Reset Link
            </button>

            <div className="login-footer">
              <Link to="/login" className="signup-link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <ChevronLeft size={16} />
                Back to Sign In
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
