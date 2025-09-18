import React, { useState } from 'react';
import { submitForm } from '../../services/firebaseService';
import { useAuth } from '../../contexts/AuthContext';

const EmailStep = ({ formData, onFinish }) => {
  const { userId } = useAuth();
  const [email, setEmail] = useState(formData.email || '');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const validateEmail = (e) => {
    if (!e) return null; // email is optional
    const m = /^\S+@\S+\.\S+$/.test(e);
    return m ? null : 'Enter a valid email.';
  };

  const handleSubmit = async () => {
    const err = validateEmail(email);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      // submit the combined form data with email
  const payload = { ...formData, submittedAt: new Date() };
  if (email) payload.email = email;
  if (userId) payload.userId = userId;
      const res = await submitForm(payload);
      if (res && res.success) {
        // show success animation then finish
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          if (typeof onFinish === 'function') onFinish();
        }, 1800);
      } else {
        setError(res.message || 'Submission failed');
      }
    } catch (err) {
      console.error('submit error', err);
      setError('Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2>Enter Email to receive form submission</h2>

      <div className="form-group">
        <label className="form-label">(optional)</label>
        <input
          className={`form-input ${error ? 'has-error' : ''}`}
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
        />
        {error && <div className="form-error" role="alert">{error}</div>}
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" disabled={isSubmitting} onClick={handleSubmit}>
          {isSubmitting ? 'Sending...' : 'Submit'}
        </button>
      </div>

      {showSuccess && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <div className="success-animation">✓</div>
          <div>Report is being prepared — redirecting...</div>
        </div>
      )}

      <style>{`
        .success-animation{
          display:inline-block;
          width:72px;
          height:72px;
          line-height:72px;
          border-radius:50%;
          background:linear-gradient(135deg,#28a745,#4bbf60);
          color:white;
          font-size:36px;
          animation: pop 0.6s ease;
        }
        @keyframes pop{0%{transform:scale(0)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
      `}</style>
    </div>
  );
};

export default EmailStep;
