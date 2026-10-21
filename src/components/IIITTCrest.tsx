import React from 'react';

interface CrestProps {
  className?: string;
  size?: number;
}

export const IIITTCrest: React.FC<CrestProps> = ({ className = 'w-9 h-9', size = 36 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="IIITT Institutional Crest"
    >
      {/* Outer Shield with Navy Blue Fill */}
      <path
        d="M24 3L6 9.5V22.5C6 33.2 13.8 42.8 24 45C34.2 42.8 42 33.2 42 22.5V9.5L24 3Z"
        fill="#0A192F"
        stroke="#D97706"
        strokeWidth="2"
      />
      
      {/* Inner Accent Line */}
      <path
        d="M24 6L9 11.5V22C9 30.8 15.5 38.8 24 41C32.5 38.8 39 30.8 39 22V11.5L24 6Z"
        stroke="#F59E0B"
        strokeWidth="1"
        strokeOpacity="0.4"
      />

      {/* Center Open Academic Book Motif */}
      <path
        d="M24 23C21 21 16 21 14 22V32C16 31 21 31 24 33C27 31 32 31 34 32V22C32 21 27 21 24 23Z"
        fill="#F8FAFC"
        stroke="#D97706"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <line x1="24" y1="23" x2="24" y2="33" stroke="#D97706" strokeWidth="1.2" />

      {/* Tech / Circuit Nodes (Information Technology) */}
      <circle cx="24" cy="14" r="2.5" fill="#D97706" />
      <line x1="24" y1="16.5" x2="24" y2="21" stroke="#D97706" strokeWidth="1.5" />
      <circle cx="18" cy="17" r="1.8" fill="#F59E0B" />
      <circle cx="30" cy="17" r="1.8" fill="#F59E0B" />
      <line x1="21.5" y1="15.5" x2="19.5" y2="16.5" stroke="#D97706" strokeWidth="1.2" />
      <line x1="26.5" y1="15.5" x2="28.5" y2="16.5" stroke="#D97706" strokeWidth="1.2" />
    </svg>
  );
};
