export default function HeartIcon({ filled = false, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.25 4.93 13.8a5.55 5.55 0 0 1-1.93-4.18c0-3.02 2.31-5.37 5.3-5.37 1.55 0 3.04.71 4.01 1.93a5.2 5.2 0 0 1 4.01-1.93c2.99 0 5.3 2.35 5.3 5.37 0 1.65-.69 3.14-1.93 4.18L12 20.25Z" />
    </svg>
  );
}
