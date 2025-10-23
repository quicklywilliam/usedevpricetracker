import React from 'react';
import './NoTeslaToggle.css';

export default function NoTeslaToggle({ enabled, onChange }) {
  return (
    <div className="no-tesla-toggle">
      <label className="toggle-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="toggle-checkbox"
        />
        <span className="toggle-switch"></span>
        <span className="toggle-text">NO TESLA</span>
      </label>
    </div>
  );
}
