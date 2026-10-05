'use client';

import React from 'react';

interface AppChurchLogoProps {
  className?: string;
  variant?: 'white' | 'dark';
  withSubtext?: boolean;
}

export const AppChurchLogo: React.FC<AppChurchLogoProps> = ({
  className = 'w-auto h-auto',
  variant = 'dark',
  withSubtext = false,
}) => {
  const fillColor = variant === 'white' ? '#FFFFFF' : '#1e2433';

  if (!withSubtext) {
    return (
      <svg
        viewBox="0 0 280 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="Logo AppChurch"
      >
        {/* Texto app */}
        <text
          x="140"
          y="48"
          textAnchor="middle"
          fill={fillColor}
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fontWeight="900"
          fontSize="56"
          letterSpacing="-2px"
        >
          app
        </text>

        {/* Texto Church */}
        <text
          x="140"
          y="100"
          textAnchor="middle"
          fill={fillColor}
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fontWeight="900"
          fontSize="60"
          letterSpacing="-2.5px"
        >
          Church
        </text>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 280 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo AppChurch Tesouraria"
    >
      {/* Texto app */}
      <text
        x="140"
        y="50"
        textAnchor="middle"
        fill={fillColor}
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontWeight="900"
        fontSize="54"
        letterSpacing="-2px"
      >
        app
      </text>

      {/* Texto Church */}
      <text
        x="140"
        y="98"
        textAnchor="middle"
        fill={fillColor}
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontWeight="900"
        fontSize="58"
        letterSpacing="-2.5px"
      >
        Church
      </text>

      {/* Texto TESOURARIA */}
      <text
        x="140"
        y="126"
        textAnchor="middle"
        fill={fillColor}
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontWeight="800"
        fontSize="17"
        letterSpacing="5px"
      >
        TESOURARIA
      </text>
    </svg>
  );
};
