interface Props {
  feature?: string;
  compact?: boolean;
}

export default function PremiumBadge({ feature, compact }: Props) {
  if (compact) {
    return (
      <span style={{
        display: 'inline-block', padding: '1px 5px',
        background: 'var(--accent)', color: '#fff',
        borderRadius: 3, fontSize: 9, fontWeight: 700,
        letterSpacing: 0.5, verticalAlign: 'middle',
        marginLeft: 6
      }}>
        PRO
      </span>
    );
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', background: 'var(--accent)', color: '#fff',
      borderRadius: 4, fontSize: 10, fontWeight: 700,
      letterSpacing: 0.5
    }}>
      {feature && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
        </svg>
      )}
      PRO
    </span>
  );
}
