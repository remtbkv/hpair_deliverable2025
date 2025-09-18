import React, { useState, useEffect, useRef } from 'react';
import FormGroup from '../shared/FormGroup';
import { uploadFile } from '../../services/firebaseService';


const PersonalInfoStep = ({ formData, setFormData, onNext }) => {
  const formatBytes = (bytes) => {
    if (bytes == null) return '';
    if (bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]); // { id, name, size, progress, url, error }
  // whether any file is currently uploading (progress between 1 and 99)
  const isUploading = (uploadedFiles || []).some(f => f.progress > 0 && f.progress < 100 && !f.error);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [dob, setDob] = useState({ day: '', month: '', year: '' });
  const [lastSaved, setLastSaved] = useState(null);
  const autosaveRef = useRef(null);
  // required fields are validated inline; helper list removed

  const hasValidationErrors = () => {
    // run validation against current formData and uploadedFiles
    const fields = ['firstName', 'lastName', 'dateOfBirth', 'phone', 'linkedin', 'preferredLanguage', 'cv'];
    return fields.some(f => {
      const val = formData[f] || '';
      const err = validateField(f, val);
      return Boolean(err);
    });
  };
  const cvInputRef = useRef(null);
  const uploadedFilesRef = useRef(uploadedFiles);
  const [waitingUploads, setWaitingUploads] = useState(false);

  const aggregatedProgress = (uploadedFiles && uploadedFiles.length) ? Math.round(uploadedFiles.reduce((acc, f) => acc + (f.progress || 0), 0) / uploadedFiles.length) : 0;

  // keep ref in sync so polling sees latest state
  useEffect(() => { uploadedFilesRef.current = uploadedFiles; }, [uploadedFiles]);

  // restore draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('personalInfoDraft');
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && typeof draft === 'object') {
          // merge draft into formData
          setFormData(prev => ({ ...prev, ...draft }));
          // restore uploadedFiles metadata if present (avoid restoring fileObj)
          if (draft.uploadedFiles && Array.isArray(draft.uploadedFiles)) {
            setUploadedFiles(draft.uploadedFiles.map(f => ({ ...f, fileObj: null })));
          }
          if (draft.dateOfBirth) {
            const parts = draft.dateOfBirth.split('-');
            if (parts.length === 3) setDob({ year: parts[0], month: parseInt(parts[1], 10), day: parseInt(parts[2], 10) });
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore draft', err);
    }
  }, [setFormData]);

  useEffect(() => {
    // autosave every 30s
    autosaveRef.current = setInterval(() => {
      try {
        // sanitize uploadedFiles for storage (remove fileObj)
        const sanitizedFiles = (uploadedFiles || []).map(f => ({ id: f.id, name: f.name, size: f.size, progress: f.progress, url: f.url, error: f.error }));
        const toSave = { ...formData, uploadedFiles: sanitizedFiles };
        localStorage.setItem('personalInfoDraft', JSON.stringify(toSave));
        setLastSaved(new Date());
      } catch (err) {
        console.error('Autosave failed', err);
      }
    }, 30000);

    return () => clearInterval(autosaveRef.current);
  }, [formData, uploadedFiles]);

  const handleInputChange = async (e) => {
    const { name, value, files, type } = e.target;

    if (type === 'file') {
      const fileList = Array.from(files || []);
      if (!fileList.length) return;

      const MAX_BYTES = 10 * 1024 * 1024;
      const newFiles = fileList.map((file, idx) => {
        return {
          id: `${Date.now()}_${idx}_${file.name}`,
          name: file.name,
          size: file.size || 0,
          progress: 0,
          url: null,
          error: null,
          fileObj: file,
        };
      });

      // optimistic add to UI, append only files that are not already present (by name+size)
      setUploadedFiles(prev => {
        const existing = prev || [];
        const existingKeys = new Set(existing.map(e => `${e.name}:${e.size}`));
        const seen = new Set();
        const uniqueNew = [];
        for (const nf of newFiles) {
          const key = `${nf.name}:${nf.size}`;
          if (existingKeys.has(key) || seen.has(key)) continue;
          seen.add(key);
          uniqueNew.push(nf);
        }
        return ([...existing, ...uniqueNew]);
      });

      // upload each file sequentially (or in parallel)
      await Promise.all(newFiles.map(async (nf) => {
        if (nf.size > MAX_BYTES) {
          setUploadedFiles(prev => prev.map(f => f.id === nf.id ? { ...f, error: 'File too large (max 10 MB)' } : f));
          setErrors(prev => ({ ...prev, cv: 'One or more files exceed the 10MB limit.' }));
          return;
        }

        try {
          const destination = `cvs/${Date.now()}_${nf.name}`;
          const url = await uploadFile(nf.fileObj, destination, (percent) => {
            setUploadedFiles(prev => prev.map(f => f.id === nf.id ? { ...f, progress: percent } : f));
          });

          setUploadedFiles(prev => prev.map(f => f.id === nf.id ? { ...f, url, progress: 100 } : f));
          // append to formData.cvUrls
          setFormData(prev => ({ ...prev, cvUrls: [...(prev.cvUrls || []), url] }));
        } catch (err) {
          console.error('Upload failed', err);
          setUploadedFiles(prev => prev.map(f => f.id === nf.id ? { ...f, error: 'Upload failed' } : f));
          setErrors(prev => ({ ...prev, cv: 'Upload failed for one or more files.' }));
        }
      }));

      return;
    }

    // Names: prevent leading/trailing spaces, disallow numbers and odd chars (allow letters, space, hyphen)
    if (name === 'firstName' || name === 'lastName') {
      const prevVal = formData[name] || '';
      // if user types a single space into an empty field, ignore it
      if (value === ' ' && (!prevVal || prevVal === '')) return;

      // remove disallowed characters but allow spaces and hyphen
      let filtered = value.replace(/[^A-Za-z\- ]+/g, '');
      // prevent leading spaces (user shouldn't start with a space)
      filtered = filtered.replace(/^\s+/, '');
      // allow trailing/internal spaces while typing; we'll trim on blur

      setFormData(prev => ({ ...prev, [name]: filtered }));
      const nameError = validateField(name, filtered);
      setErrors(prev => ({ ...prev, [name]: nameError }));
      return;
    }

    // Date of Birth is handled by the DOB selects; ignore direct changes
    if (name === 'dateOfBirth') return;

    // default handler for other fields
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // real-time validation
    const otherError = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: otherError }));
  };

  const validateField = (name, value) => {
    const requiredFields = new Set(['firstName', 'lastName', 'phone']);
    if (name === 'cv') {
        // CV is optional. Block only if a selected file has an error
        // or has intermediate progress (not 0 or 100).
        const hasUrls = formData.cvUrls && formData.cvUrls.length > 0;
        const hasSelectedFiles = uploadedFiles && uploadedFiles.length > 0;
        if (!hasUrls && !hasSelectedFiles) return null; // not required
        // if any file has an error, block
        if (uploadedFiles && uploadedFiles.some(f => f.error)) return 'One or more files failed to upload.';
        // allow progress values of 0 (selected but not started) or 100 (completed). Block intermediate progress
        if (uploadedFiles && uploadedFiles.some(f => !(f.progress === 0 || f.progress === 100))) return 'Please wait for uploads to finish.';
        return null;
    }
    if (requiredFields.has(name) && (!value || String(value).trim() === '')) {
      return 'Please fill out this field.';
    }

    switch (name) {
      case 'firstName':
      case 'lastName':
        if (!value || value.trim().length < 2) return 'Must be at least 2 characters.';
        return null;
      case 'phone':
        // basic phone validation (digits, +, spaces, dashes)
        if (!value || !/^[+\d\s()-]{7,20}$/.test(value)) return 'Enter a valid phone number.';
        return null;
      case 'address':
        // address validation removed per request
        return null;
      case 'dateOfBirth':
        if (!value) return 'Please fill out this field.';
        // expect YYYY-MM-DD
        const yearMatch = value.match(/^(\d{4})-/);
        if (!yearMatch) return 'Enter a valid date.';
        const year = parseInt(yearMatch[1], 10);
        if (isNaN(year) || year < 1930 || year > 2020) return 'Year must be between 1930 and 2020.';
        return null;
      case 'linkedin':
        if (value && !/^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(value)) return 'Enter a valid LinkedIn URL.';
        return null;
      case 'preferredLanguage':
        // not required, but if provided ensure it's a valid option
        if (value && value !== '' && !['english','spanish','chinese_simplified','french','russian','hindi','korean','67'].includes(value)) return 'Select a valid language.';
        return null;
      default:
        return null;
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    let val = value;
    if ((name === 'firstName' || name === 'lastName') && typeof val === 'string') {
      val = val.trim();
      setFormData(prev => ({ ...prev, [name]: val }));
    }
    setTouched(prev => ({ ...prev, [name]: true }));
    const error = validateField(name, val);
    setErrors(prev => ({ ...prev, [name]: error }));
  };

  // eslint-disable-next-line no-unused-vars
  const handleRemoveCV = () => {
    setFormData(prev => ({ ...prev, cvUrls: [] }));
    // clear uploadedFiles state and any progress
    setUploadedFiles([]);
    setUploadProgress(0);
    if (cvInputRef && cvInputRef.current) {
      try { cvInputRef.current.value = ''; } catch (e) {}
    }
  };

  return (
    <div>
      <FormGroup
        label="First Name"
        name="firstName"
        value={formData.firstName || ''}
        onChange={handleInputChange}
        onBlur={handleBlur}
        error={touched.firstName ? errors.firstName : null}
        placeholder="Enter your full name"
        required
      />
      <FormGroup
        label="Last Name"
        name="lastName"
        value={formData.lastName || ''}
        onChange={handleInputChange}
        onBlur={handleBlur}
        error={touched.lastName ? errors.lastName : null}
        placeholder="Enter your last name"
        required
      />
      <div className="form-group">
        <label className="form-label">Date of Birth *</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            name="dobDay"
            value={dob.day}
            onChange={(e) => {
              const day = e.target.value;
              const newDob = { ...dob, day };
              setDob(newDob);
              if (newDob.year && newDob.month && newDob.day) {
                const dobStr = `${newDob.year}-${String(newDob.month).padStart(2,'0')}-${String(newDob.day).padStart(2,'0')}`;
                setFormData(prev => ({ ...prev, dateOfBirth: dobStr }));
                const err = validateField('dateOfBirth', dobStr);
                setErrors(prev => ({ ...prev, dateOfBirth: err }));
              }
            }}
            className="form-input"
          >
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            name="dobMonth"
            value={dob.month}
            onChange={(e) => {
              const month = e.target.value;
              const newDob = { ...dob, month };
              setDob(newDob);
              if (newDob.year && newDob.month && newDob.day) {
                const dobStr = `${newDob.year}-${String(newDob.month).padStart(2,'0')}-${String(newDob.day).padStart(2,'0')}`;
                setFormData(prev => ({ ...prev, dateOfBirth: dobStr }));
                const err = validateField('dateOfBirth', dobStr);
                setErrors(prev => ({ ...prev, dateOfBirth: err }));
              }
            }}
            className="form-input"
          >
            <option value="">Month</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            name="dobYear"
            value={dob.year}
            onChange={(e) => {
              const year = e.target.value;
              const newDob = { ...dob, year };
              setDob(newDob);
              if (newDob.year && newDob.month && newDob.day) {
                const dobStr = `${newDob.year}-${String(newDob.month).padStart(2,'0')}-${String(newDob.day).padStart(2,'0')}`;
                setFormData(prev => ({ ...prev, dateOfBirth: dobStr }));
                const err = validateField('dateOfBirth', dobStr);
                setErrors(prev => ({ ...prev, dateOfBirth: err }));
              }
            }}
            className="form-input"
          >
            <option value="">Year</option>
            {Array.from({ length: 2020 - 1950 + 1 }, (_, i) => 2020 - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        {errors.dateOfBirth && <div className="form-error">{errors.dateOfBirth}</div>}
      </div>


      {/* Gender removed as requested */}

      <FormGroup
        label="Address"
        name="address"
        value={formData.address || ''}
        onChange={handleInputChange}
        onBlur={handleBlur}
        error={touched.address ? errors.address : null}
        placeholder="Street, City, ZIP"
      />

      <FormGroup
        label="CV"
        name="cv"
        onChange={handleInputChange}
        onBlur={handleBlur}
        error={touched.cv ? errors.cv : null}
        type="file"
        accept=".pdf,.doc,.docx"
        // show first uploaded file metadata if available
        value={(uploadedFiles && uploadedFiles.length > 0) ? { name: uploadedFiles[0].name, size: uploadedFiles[0].size } : null}
      >
        {/* children override: show upload progress and remove button */}
        <div>
          <input
            id="cv"
            name="cv"
            type="file"
            onChange={handleInputChange}
            ref={cvInputRef}
            className="form-input"
            accept=".pdf,.doc,.docx"
            multiple
          />
          <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>Max file size: 10 MB</div>
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          {uploadedFiles.length > 0 && (
            <div className="file-list">
              {uploadedFiles.map(f => (
                <div className="file-item" key={f.id}>
                  <div className="file-info">
                    <span className="file-name">{f.name}</span>
                    <span className="file-size"> {formatBytes(f.size)}</span>
                    {f.progress > 0 && f.progress < 100 && (
                      <div className="progress-bar" style={{ marginLeft: 12, width: 120 }}>
                        <div className="progress-fill" style={{ width: `${f.progress}%` }} />
                      </div>
                    )}
                    {f.error && <div className="form-error">{f.error}</div>}
                  </div>
                  <button type="button" className="remove-file" onClick={() => {
                    // remove file from state and formData
                    setUploadedFiles(prev => prev.filter(x => x.id !== f.id));
                    setFormData(prev => ({ ...prev, cvUrls: (prev.cvUrls || []).filter(url => url !== f.url) }));
                  }}>&times;</button>
                </div>
              ))}
            </div>
          )}
          {/* removed debug UI */}
        </div>
      </FormGroup>

      <FormGroup
        label="Phone Number"
        name="phone"
        value={formData.phone || ''}
        onChange={handleInputChange}
        onBlur={handleBlur}
        error={touched.phone ? errors.phone : null}
        placeholder="+1 555 555 5555"
        type="tel"
      />
      <FormGroup
        label="LinkedIn URL"
        name="linkedin"
        value={formData.linkedin || ''}
        onChange={handleInputChange}
        onBlur={handleBlur}
        error={touched.linkedin ? errors.linkedin : null}
        placeholder="https://linkedin.com/in/your-profile"
        type="url"
      />

      <FormGroup
        label="Preferred Language"
        name="preferredLanguage"
        value={formData.preferredLanguage || 'english'}
        onChange={handleInputChange}
        onBlur={handleBlur}
        error={touched.preferredLanguage ? errors.preferredLanguage : null}
        type="select"
        options={[
          { value: '', label: 'Select language' },
          { value: 'english', label: 'English' },
          { value: 'spanish', label: 'Spanish' },
          { value: 'chinese_simplified', label: 'Chinese (simplified)' },
          { value: 'french', label: 'French' },
          { value: 'russian', label: 'Russian' },
          { value: 'hindi', label: 'Hindi' },
          { value: 'korean', label: 'Korean' },
          { value: '67', label: '67' },
        ]}
      />
      
      <div className="form-actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastSaved && (
            <div style={{ color: '#666', fontSize: 13 }}>Last saved: {lastSaved.toLocaleTimeString()}</div>
          )}
        </div>
        {/* validation diagnostic removed per request */}

        <button
          type="button"
          className="btn btn-primary"
          disabled={isUploading || hasValidationErrors() || waitingUploads}
          onClick={async () => {
            // validate all fields
            const fieldsToValidate = [
              'firstName', 'lastName', 'dateOfBirth', 'address', 'phone', 'linkedin', 'preferredLanguage', 'cv'
            ];
            const newErrors = {};
            fieldsToValidate.forEach((f) => {
              const val = formData[f] || '';
              newErrors[f] = validateField(f, val);
            });
            setErrors(newErrors);
            const allTouched = fieldsToValidate.reduce((acc, f) => ({ ...acc, [f]: true }), {});
            setTouched(allTouched);

            const hasError = Object.values(newErrors).some(Boolean);
                if (hasError) {
                  // focus the first invalid field but keep all errors visible
                  const firstInvalid = fieldsToValidate.find(f => newErrors[f]);
                  try {
                    const el = document.getElementsByName(firstInvalid)[0];
                    if (el && typeof el.focus === 'function') el.focus();
                  } catch (err) {
                    // ignore focus errors
                  }
                  // If the CV input is empty/cleared, clear the file input display
                  if (cvInputRef && cvInputRef.current && (!formData.cvUrls || formData.cvUrls.length === 0)) {
                    try { cvInputRef.current.value = ''; } catch (e) { /* ignore */ }
                  }
                  return;
                }

                // If some uploads are in progress, wait for them to finish before proceeding
                const anyUploading = (uploadedFilesRef.current || []).some(f => f.progress > 0 && f.progress < 100 && !f.error);
                if (anyUploading) {
                  setWaitingUploads(true);
                  const waitForUploads = () => new Promise((resolve, reject) => {
                    const start = Date.now();
                      const interval = setInterval(() => {
                      const current = uploadedFilesRef.current || [];
                      // if any file has error, stop
                      if (current.some(f => f.error)) {
                        clearInterval(interval);
                        resolve({ success: false, reason: 'upload-error' });
                        return;
                      }
                      const stillUploading = current.some(f => f.progress > 0 && f.progress < 100);
                      if (!stillUploading) {
                        clearInterval(interval);
                        resolve({ success: true });
                        return;
                      }
                      if (Date.now() - start > 30000) { // timeout 30s
                        clearInterval(interval);
                        resolve({ success: false, reason: 'timeout' });
                        return;
                      }
                    }, 500);
                  });

                      const result = await waitForUploads();
                  setWaitingUploads(false);
                  if (!result.success) {
                    setErrors(prev => ({ ...prev, cv: result.reason === 'upload-error' ? 'One or more files failed to upload.' : 'Upload timeout. Please try again.' }));
                    return;
                  }
                }

            // proceed to next step
            try {
              localStorage.removeItem('personalInfoDraft');
            } catch (err) {
              console.error('Failed to clear draft', err);
            }
            if (typeof onNext === 'function') onNext();
          }}
        >
          {waitingUploads ? (
            <>
              <span className="spinner" style={{ marginRight: 8 }} />
              Waiting ({aggregatedProgress}%)
            </>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </div>
  );
};

export default PersonalInfoStep;
