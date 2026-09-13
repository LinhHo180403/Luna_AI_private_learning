import React, { useState } from 'react';

function PlanCard({ plan, onClose }) {
  const [checkedSteps, setCheckedSteps] = useState({});

  if (!plan) return null;

  const { title, steps = [], estimatedTime, generatedBy } = plan;
  const totalSteps = steps.length;
  const completedCount = Object.values(checkedSteps).filter(Boolean).length;

  const toggleStep = (index) => {
    setCheckedSteps((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="plan-card" role="region" aria-label="Kế hoạch từ Luna">
      <div className="plan-card-header">
        <h3 className="plan-card-title">{title}</h3>
        {onClose && (
          <button type="button" className="plan-card-close-btn" onClick={onClose} aria-label="Đóng kế hoạch">✕</button>
        )}
      </div>

      {totalSteps > 0 && (
        <div className="plan-card-progress">
          <div className="plan-card-progress-bar">
            <div className="plan-card-progress-fill" style={{ width: `${(completedCount / totalSteps) * 100}%` }} />
          </div>
          <span className="plan-card-progress-label">{completedCount}/{totalSteps} bước</span>
        </div>
      )}

      <ol className="plan-card-steps">
        {steps.map((step, index) => (
          <li key={index} className={`plan-card-step${checkedSteps[index] ? ' plan-card-step-done' : ''}`}>
            <label className="plan-card-step-label">
              <input
                type="checkbox"
                checked={Boolean(checkedSteps[index])}
                onChange={() => toggleStep(index)}
                className="plan-card-step-checkbox"
              />
              <span className="plan-card-step-title">{step.title}</span>
            </label>
            {step.detail && <p className="plan-card-step-detail">{step.detail}</p>}
          </li>
        ))}
      </ol>

      {estimatedTime && (
        <div className="plan-card-footer">
          <span className="plan-card-time-icon" aria-hidden="true">⏱️</span>
          <span>Ước lượng: {estimatedTime}</span>
        </div>
      )}

      {generatedBy && generatedBy !== 'nara' && (
        <div className="plan-card-badge" title="Kế hoạch được sinh bằng template offline, không phải AI thật">offline</div>
      )}
    </div>
  );
}

export default PlanCard;
