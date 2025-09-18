import React from 'react';

const FormGroup = ({
  label,
  name,
  value,
  onChange,
  onBlur,
  error,
  type = 'text',
  required = false,
  placeholder,
  className = 'form-input',
  options = [],
  accept,
  multiple = false,
  children,
  ...rest
}) => {
  const hasError = Boolean(error);
  const errorId = `${name}-error`;
  const renderControl = () => {
    if (type === 'select') {
      return (
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          className={`${className} ${hasError ? 'has-error' : ''}`}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value || opt} value={opt.value || opt}>
              {opt.label || opt}
            </option>
          ))}
        </select>
      );
    }

    if (type === 'file') {
      return (
        <div className={`file-upload-area ${hasError ? 'has-error' : ''}`}>
          <input
            id={name}
            name={name}
            type="file"
            onChange={onChange}
            onBlur={onBlur}
            className={`${className} ${hasError ? 'has-error' : ''}`}
            aria-invalid={hasError}
            aria-describedby={hasError ? errorId : undefined}
            accept={accept}
            multiple={multiple}
            {...rest}
          />
          {value && value.name && (
            <div className="file-list">
              <div className="file-item">
                <div className="file-info">
                  <span className="file-name">{value.name}</span>
                  <span className="file-size">{` ${(
                    value.size / 1024
                  ).toFixed(1)} KB`}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className={className}
        placeholder={placeholder}
        required={required}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        {...rest}
      />
    );
  };

  return (
      <div className="form-group">
      {label && (
        <label className="form-label" htmlFor={name}>
          {label}
          {required && <span style={{ color: 'red' }}> *</span>}
        </label>
      )}
      {children ? children : renderControl()}
      {error && (
        <div id={errorId} className="form-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
    </div>
  );
};

export default FormGroup;
