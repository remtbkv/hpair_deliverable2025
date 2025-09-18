import React, { useState, useEffect, useRef, useCallback } from 'react';
import PersonalInfoStep from './steps/PersonalInfoStep';
import EmailStep from './steps/EmailStep';
import { getFormSubmissions, getSubmissionCount } from '../services/firebaseService';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { signOutUser } from '../services/authService';

const MultiStepForm = () => {
  const [formData, setFormData] = useState({});
  // submission state removed (not used here)
  const [submissions, setSubmissions] = useState([]);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '' });
  const { user, userId } = useAuth();
  const [step, setStep] = useState('landing'); // landing | personal | email | done
  const [hasDraft, setHasDraft] = useState(false);
  const [isFormDataOpen, setIsFormDataOpen] = useState(false);
  const [lastSubmission, setLastSubmission] = useState(null);
  const panelRef = useRef(null);
  const printAreaRef = useRef(null);
  const [currentPreviewSubmission, setCurrentPreviewSubmission] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // generate preview when requested
  useEffect(() => {
    let mounted = true;
    const gen = async () => {
      if (!isGeneratingPreview || !currentPreviewSubmission) return;
      try {
        // populate hidden print area (it already reads from currentPreviewSubmission)
        await new Promise(r => setTimeout(r, 50)); // allow DOM to update
        const el = printAreaRef.current;
        if (!el) throw new Error('print area not found');
        const canvas = await html2canvas(el, { scale: 2 });
        if (!mounted) return;
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        setPreviewImage(imgData);
        setShowPreviewModal(true);
      } catch (err) {
        console.error('Preview generation failed', err);
        alert('Failed to generate preview');
      } finally {
        if (mounted) setIsGeneratingPreview(false);
      }
    };
    gen();
    return () => { mounted = false; };
  }, [isGeneratingPreview, currentPreviewSubmission]);

  const generatePaginatedPdf = (imgData, filename) => {
    const pdf = new jsPDF('p', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // create an image object to get natural size
    const img = new Image();
    img.src = imgData;
    img.onload = () => {
      const imgW = img.width;
      const imgH = img.height;
      const ratio = imgW / pageWidth;
      const renderedHeight = imgH / ratio;

      if (renderedHeight <= pageHeight) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, renderedHeight);
        pdf.save(filename);
        return;
      }

      // paginate: draw slices of the canvas for each page
      let remainingHeight = imgH;
      let offsetY = 0;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const sx = 0;
      const sWidth = imgW;
      const perPagePx = pageHeight * ratio; // pixels from source per PDF page

      while (remainingHeight > 0) {
        const sHeight = Math.min(perPagePx, remainingHeight);
        canvas.width = sWidth;
        canvas.height = sHeight;
        ctx.clearRect(0, 0, sWidth, sHeight);
        ctx.drawImage(img, sx, offsetY, sWidth, sHeight, 0, 0, sWidth, sHeight);
        const pageData = canvas.toDataURL('image/jpeg', 0.95);
        const renderedH = (sHeight / ratio);
        pdf.addImage(pageData, 'JPEG', 0, 0, pageWidth, renderedH);
        remainingHeight -= sHeight;
        offsetY += sHeight;
        if (remainingHeight > 0) pdf.addPage();
      }
      pdf.save(filename);
    };
  };

  const handleLogout = async () => {
    await signOutUser();
  };

  // Load user's submissions (stable callback to satisfy hooks lint)
  const loadSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      const [submissionsResult, countResult] = await Promise.all([
        getFormSubmissions(),
        getSubmissionCount()
      ]);

      if (countResult && countResult.success) {
        setSubmissionCount(countResult.count);
      }

      if (submissionsResult && submissionsResult.success) {
        const userSubmissions = submissionsResult.data.filter(
          submission => submission.userId === userId
        );
        setSubmissions(userSubmissions);
        return userSubmissions;
      }

      if (submissionsResult && !submissionsResult.success) {
        setError(submissionsResult.message);
      }

      return [];
    } catch (err) {
      setError('Failed to load submissions');
      console.error('Error loading submissions:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load submissions and restore UI state
  useEffect(() => {
    loadSubmissions();
    try {
      const d = localStorage.getItem('personalInfoDraft');
      setHasDraft(Boolean(d));
    } catch (e) {
      setHasDraft(false);
    }
    try {
      const open = localStorage.getItem('isFormDataOpen');
      if (open === 'true') setIsFormDataOpen(true);
    } catch (e) {}
  }, [userId, loadSubmissions]);

  // TODO: Implement form validation using Formik and Yup
  // TODO: Implement form data handling

  // submission handled in child steps; no top-level submit handler needed

  return (
    <div className="container">
      <div className="form-container">
        <div style={{ marginBottom: '12px' }}>
          <div style={{ marginBottom: '6px', padding: '8px', backgroundColor: '#e3f2fd', borderRadius: '4px', fontSize: '14px' }}>
            <strong>Logged in as:</strong> {user.email}
          </div>
          {/* top logout removed; moved to fixed bottom-right */}
          </div>
        
        {step === 'landing' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <h2>Welcome</h2>
            <button className="btn btn-primary" onClick={() => setStep('personal')}>{hasDraft ? 'Continue' : 'Start'}</button>
          </div>
        )}

        {step === 'personal' && (
          <div>
            <PersonalInfoStep
              formData={formData}
              setFormData={setFormData}
              onNext={() => setStep('email')}
            />
          </div>
        )}

        {step === 'email' && (
          <div>
            <EmailStep
              formData={formData}
              onFinish={async () => {
                try {
                  const userSubs = await loadSubmissions();
                  // set last submission to the most recent after reload
                  if (userSubs && userSubs.length) {
                    setLastSubmission(userSubs[0]);
                  }
                  // open the panel and scroll into view
                  setIsFormDataOpen(true);
                  try { localStorage.setItem('isFormDataOpen', 'true'); } catch(e){}
                  setTimeout(() => { panelRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 120);
                  // show toast
                  setToast({ show: true, message: 'Form submitted' });
                  setTimeout(() => setToast({ show: false, message: '' }), 2000);
                } catch (e) {
                  console.error('Failed to refresh submissions after submit', e);
                }
                setFormData({});
                setStep('done');
              }}
            />
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <h2>Submitted!</h2>
            <br />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setStep('landing')}>Home</button>
              <button className="btn btn-secondary" onClick={() => setStep('personal')}>Start a new form</button>
            </div>
          </div>
        )}

        {/* Admin Panel - moved under See Form Data panel */}
        <div style={{ marginTop: '40px', paddingTop: '40px', borderTop: '2px solid #e0e0e0' }}>
          <div style={{ marginBottom: 16 }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const recent = submissions && submissions.length ? submissions[0] : null;
                setLastSubmission(recent);
                setIsFormDataOpen(prev => {
                  const next = !prev;
                  try { localStorage.setItem('isFormDataOpen', next ? 'true' : 'false'); } catch (e) {}
                  return next;
                });
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {isFormDataOpen ? 'Hide Form Data' : 'See Form Data'}
                <span className={`caret ${isFormDataOpen ? 'open' : ''}`} aria-hidden>▾</span>
              </span>
            </button>
          </div>

          {error && (
            <div className="submit-message error">
              {error}
            </div>
          )}

          <div ref={panelRef} className={`panel ${isFormDataOpen ? 'panel-open' : 'panel-closed'}`} style={{ marginTop: 20 }} aria-hidden={!isFormDataOpen}>
              <div className="panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <strong>Recent Form Data</strong>
                  <span style={{ color: '#666' }}>{submissions.length ? `${submissions.length} submissions` : 'No submissions'}</span>
                </div>
                <div>
                  <button className="btn btn-secondary" onClick={() => setIsFormDataOpen(false)}>Minimize</button>
                </div>
              </div>
              <div className="panel-body">
                <h3>Your Form Submissions</h3>
                <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                  <p><strong>Total submissions:</strong> {submissionCount}</p>
                  <p><strong>Your submissions:</strong> {submissions.length}</p>
                </div>
                {lastSubmission ? (
                  <div>
                    <p><strong>ID:</strong> {lastSubmission.id}</p>
                    <p><strong>Name:</strong> {lastSubmission.firstName} {lastSubmission.lastName}</p>
                    <p><strong>Date:</strong> {formatDate(lastSubmission.submittedAt)}</p>
                    <div style={{ marginTop: 12 }}>
                      <button className="btn btn-primary" onClick={() => {
                        // start preview flow for lastSubmission
                        setCurrentPreviewSubmission(lastSubmission);
                        setIsGeneratingPreview(true);
                      }}>Download PDF</button>
                    </div>
                  </div>
                ) : (
                  <p>No recent submission available.</p>
                )}

                {loading ? (
                  <p>Loading submissions...</p>
                ) : submissions.length === 0 ? (
                  <p>No submissions yet. Fill out the form above to get started!</p>
                ) : (
                  <div className="submissions-list">
                    {submissions.map((submission) => (
                      <div key={submission.id} className="submission-item">
                        <div className="submission-header">
                          <h3>Submission #{submission.id.slice(-8)}</h3>
                          <span className="submission-date">
                            {formatDate(submission.submittedAt)}
                          </span>
                        </div>
                        <div className="submission-details">
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => {
                              setCurrentPreviewSubmission(submission);
                              setIsGeneratingPreview(true);
                            }}>Download PDF</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
        </div>

        {/* Hidden print area for PDF generation - renders full form layout */}
        <div ref={printAreaRef} style={{ position: 'absolute', left: -9999, top: 0, width: 600, padding: 24, background: '#fff' }} aria-hidden>
          {currentPreviewSubmission && (
            <div style={{ fontFamily: 'Arial, sans-serif', color: '#111', lineHeight: 1.5 }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h1 style={{ margin: 0 }}>Personal Information Form</h1>
                <div style={{ marginTop: 6, color: '#666' }}>Submitted: {formatDate(currentPreviewSubmission.submittedAt)}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>First Name</div>
                <div style={{ padding: '6px 0' }}>{currentPreviewSubmission.firstName || ''}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>Last Name</div>
                <div style={{ padding: '6px 0' }}>{currentPreviewSubmission.lastName || ''}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>Date of Birth</div>
                <div style={{ padding: '6px 0' }}>{currentPreviewSubmission.dateOfBirth || ''}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>Phone</div>
                <div style={{ padding: '6px 0' }}>{currentPreviewSubmission.phone || ''}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>Address</div>
                <div style={{ padding: '6px 0' }}>{currentPreviewSubmission.address || ''}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>LinkedIn</div>
                <div style={{ padding: '6px 0' }}>{currentPreviewSubmission.linkedin || ''}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>Preferred Language</div>
                <div style={{ padding: '6px 0' }}>{currentPreviewSubmission.preferredLanguage || ''}</div>
              </div>

              <div style={{ marginTop: 18 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Uploaded CVs</div>
                {(currentPreviewSubmission.cvUrls && currentPreviewSubmission.cvUrls.length) ? (
                  <ol style={{ paddingLeft: 18 }}>
                    {currentPreviewSubmission.cvUrls.map((u, i) => (
                      <li key={i}><a href={u} target="_blank" rel="noreferrer">{u}</a></li>
                    ))}
                  </ol>
                ) : (
                  <div style={{ color: '#666' }}>No CVs uploaded</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Preview modal */}
        {showPreviewModal && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal-content">
              <div className="modal-body">
                {previewImage ? (
                  <img src={previewImage} alt="Preview" style={{ width: '100%' }} />
                ) : (
                  <p>Generating preview...</p>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowPreviewModal(false); setPreviewImage(null); setCurrentPreviewSubmission(null); }}>Close</button>
                <button className="btn btn-primary" onClick={() => {
                  try {
                    generatePaginatedPdf(previewImage, `submission_${currentPreviewSubmission.id}.pdf`);
                  } catch (err) {
                    console.error('PDF save failed', err);
                    alert('Failed to save PDF');
                  }
                }}>Download PDF</button>
              </div>
            </div>
          </div>
        )}
        {/* Toast */}
        {toast.show && (
          <div style={{ position: 'fixed', bottom: 20, left: 20, background: '#333', color: '#fff', padding: '10px 14px', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }}>
            {toast.message}
          </div>
        )}

        {/* fixed logout button bottom-right */}
        <button
          onClick={handleLogout}
          className="btn btn-secondary"
          style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1200 }}
        >
          Logout
        </button>
      </div>
    </div>
  );
};

const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp.seconds * 1000).toLocaleString();
};

export default MultiStepForm;
