interface Props {
  current: 1 | 2 | 3;
}

const labels = ['Sign in', 'Company', 'Financial year'];

export default function SetupSteps({ current }: Props) {
  return (
    <div className="wizard-steps" style={{ maxWidth: 420, margin: '0 auto 1.5rem' }}>
      {labels.map((label, i) => {
        const step = i + 1;
        return (
          <div
            key={label}
            className={`wizard-step ${current === step ? 'active' : ''} ${current > step ? 'done' : ''}`}
          >
            {step}. {label}
          </div>
        );
      })}
    </div>
  );
}
