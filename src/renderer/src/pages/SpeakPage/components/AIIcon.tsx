import React, { useMemo } from 'react'

export interface AIIconProps {
  isRecording?: boolean
  isProcessing?: boolean
  size?: number
  className?: string
}

export const AIIcon: React.FC<AIIconProps> = ({
  isRecording = false,
  isProcessing = false,
  size = 200,
  className = ''
}) => {
  // Calculate responsive sizes based on the main size
  const dimensions = useMemo(() => {
    const scale = size / 200
    return {
      width: size,
      height: size,
      centerX: size / 2,
      centerY: size / 2,
      outerRadius: 90 * scale,
      middleRadius: 75 * scale,
      innerRadius: 60 * scale,
      coreRadius: 40 * scale,
      strokeWidth: 2 * scale,
      glowRadius: 110 * scale
    }
  }, [size])

  const animationClass = isRecording
    ? 'animate-recording'
    : isProcessing
      ? 'animate-processing'
      : 'animate-idle'

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Custom CSS for animations */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.3; transform: scale(0.95); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }

        @keyframes rotate-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes rotate-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }

        @keyframes wave-scale {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 0.4; }
        }

        @keyframes core-pulse {
          0%, 100% { opacity: 0.9; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }

        @keyframes recording-pulse {
          0%, 100% {
            fill: rgba(239, 68, 68, 0.8);
            filter: drop-shadow(0 0 20px rgba(239, 68, 68, 0.6));
          }
          50% {
            fill: rgba(239, 68, 68, 1);
            filter: drop-shadow(0 0 30px rgba(239, 68, 68, 0.9));
          }
        }

        .animate-idle #outer-ring { animation: rotate-slow 20s linear infinite; }
        .animate-idle #middle-ring { animation: rotate-reverse 15s linear infinite; }
        .animate-idle #inner-ring { animation: rotate-slow 10s linear infinite; }
        .animate-idle #core-circle { animation: core-pulse 4s ease-in-out infinite; }

        .animate-processing #outer-ring { animation: rotate-slow 3s linear infinite; }
        .animate-processing #middle-ring { animation: rotate-reverse 2s linear infinite; }
        .animate-processing #inner-ring { animation: rotate-slow 1s linear infinite; }
        .animate-processing #wave-1 { animation: wave-scale 2s ease-in-out infinite; }
        .animate-processing #wave-2 { animation: wave-scale 2s ease-in-out 0.5s infinite; }
        .animate-processing #wave-3 { animation: wave-scale 2s ease-in-out 1s infinite; }
        .animate-processing #core-circle { animation: core-pulse 1s ease-in-out infinite; }

        .animate-recording #outer-ring { animation: rotate-slow 2s linear infinite; }
        .animate-recording #middle-ring { animation: rotate-reverse 1.5s linear infinite; }
        .animate-recording #inner-ring { animation: rotate-slow 1s linear infinite; }
        .animate-recording #core-circle { animation: recording-pulse 1s ease-in-out infinite; }
        .animate-recording #glow { animation: pulse-glow 1s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .animate-idle #outer-ring,
          .animate-idle #middle-ring,
          .animate-idle #inner-ring,
          .animate-processing #outer-ring,
          .animate-processing #middle-ring,
          .animate-processing #inner-ring,
          .animate-recording #outer-ring,
          .animate-recording #middle-ring,
          .animate-recording #inner-ring { animation: none; }

          .animate-idle #core-circle,
          .animate-processing #core-circle,
          .animate-recording #core-circle { animation: core-pulse 4s ease-in-out infinite; }
        }
      `
        }}
      />

      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className={animationClass}
        role="img"
        aria-label={`AI ${isRecording ? 'recording' : isProcessing ? 'processing' : 'idle'}`}
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="gradient-blue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="1" />
          </linearGradient>

          <linearGradient id="gradient-purple" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C084FC" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#A855F7" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#9333EA" stopOpacity="1" />
          </linearGradient>

          <radialGradient id="gradient-core" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="#F0F9FF" stopOpacity="1" />
            <stop offset="30%" stopColor="#DBEAFE" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#93C5FD" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.6" />
          </radialGradient>

          <radialGradient id="gradient-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </radialGradient>

          {/* Filters */}
          <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>

          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.1" />
          </filter>

          {/* Patterns */}
          <pattern id="dots" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="#3B82F6" opacity="0.3" />
          </pattern>
        </defs>

        {/* Background glow (only visible when recording) */}
        <circle
          id="glow"
          cx={dimensions.centerX}
          cy={dimensions.centerY}
          r={dimensions.glowRadius}
          fill="url(#gradient-glow)"
          opacity={isRecording ? 1 : 0}
          className="transition-opacity duration-500"
        />

        {/* Outer decorative ring */}
        <g
          id="outer-ring"
          style={{ transformOrigin: `${dimensions.centerX}px ${dimensions.centerY}px` }}
        >
          <circle
            cx={dimensions.centerX}
            cy={dimensions.centerY}
            r={dimensions.outerRadius}
            fill="none"
            stroke="url(#gradient-blue)"
            strokeWidth={dimensions.strokeWidth}
            strokeDasharray="20 10 5 10"
            opacity="0.6"
          />
          {/* Decorative dots */}
          {[...Array(8)].map((_, i) => {
            const angle = (i * 45 * Math.PI) / 180
            const x = dimensions.centerX + dimensions.outerRadius * Math.cos(angle)
            const y = dimensions.centerY + dimensions.outerRadius * Math.sin(angle)
            return (
              <circle
                key={`outer-dot-${i}`}
                cx={x}
                cy={y}
                r={dimensions.strokeWidth * 2}
                fill="#3B82F6"
                opacity="0.8"
              />
            )
          })}
        </g>

        {/* Middle ring */}
        <g
          id="middle-ring"
          style={{ transformOrigin: `${dimensions.centerX}px ${dimensions.centerY}px` }}
        >
          <circle
            cx={dimensions.centerX}
            cy={dimensions.centerY}
            r={dimensions.middleRadius}
            fill="none"
            stroke="url(#gradient-purple)"
            strokeWidth={dimensions.strokeWidth * 1.5}
            strokeDasharray="30 15"
            opacity="0.5"
          />
        </g>

        {/* Inner ring */}
        <g
          id="inner-ring"
          style={{ transformOrigin: `${dimensions.centerX}px ${dimensions.centerY}px` }}
        >
          <circle
            cx={dimensions.centerX}
            cy={dimensions.centerY}
            r={dimensions.innerRadius}
            fill="none"
            stroke="#60A5FA"
            strokeWidth={dimensions.strokeWidth}
            strokeDasharray="10 5"
            opacity="0.4"
          />
        </g>

        {/* Wave circles (visible when processing) */}
        {isProcessing && (
          <>
            <circle
              id="wave-1"
              cx={dimensions.centerX}
              cy={dimensions.centerY}
              r={dimensions.coreRadius + 10}
              fill="none"
              stroke="#3B82F6"
              strokeWidth={dimensions.strokeWidth}
              opacity="0"
            />
            <circle
              id="wave-2"
              cx={dimensions.centerX}
              cy={dimensions.centerY}
              r={dimensions.coreRadius + 20}
              fill="none"
              stroke="#60A5FA"
              strokeWidth={dimensions.strokeWidth * 0.75}
              opacity="0"
            />
            <circle
              id="wave-3"
              cx={dimensions.centerX}
              cy={dimensions.centerY}
              r={dimensions.coreRadius + 30}
              fill="none"
              stroke="#93C5FD"
              strokeWidth={dimensions.strokeWidth * 0.5}
              opacity="0"
            />
          </>
        )}

        {/* Core circle with glass morphism effect */}
        <g filter="url(#shadow)">
          {/* Background blur circle */}
          <circle
            cx={dimensions.centerX}
            cy={dimensions.centerY}
            r={dimensions.coreRadius}
            fill="white"
            opacity="0.1"
            filter="url(#blur)"
          />

          {/* Main core circle */}
          <circle
            id="core-circle"
            cx={dimensions.centerX}
            cy={dimensions.centerY}
            r={dimensions.coreRadius}
            fill="url(#gradient-core)"
            filter="url(#glow)"
          />

          {/* Inner highlight */}
          <circle
            cx={dimensions.centerX - dimensions.coreRadius * 0.3}
            cy={dimensions.centerY - dimensions.coreRadius * 0.3}
            r={dimensions.coreRadius * 0.4}
            fill="white"
            opacity="0.5"
            filter="url(#blur)"
          />

          {/* AI symbol or pattern in the center */}
          <g opacity="0.3">
            <rect
              x={dimensions.centerX - dimensions.coreRadius * 0.6}
              y={dimensions.centerY - dimensions.coreRadius * 0.6}
              width={dimensions.coreRadius * 1.2}
              height={dimensions.coreRadius * 1.2}
              fill="url(#dots)"
            />
          </g>
        </g>

        {/* Status indicator dot */}
        <circle
          cx={dimensions.centerX + dimensions.coreRadius * 0.7}
          cy={dimensions.centerY - dimensions.coreRadius * 0.7}
          r={dimensions.strokeWidth * 3}
          fill={isRecording ? '#EF4444' : isProcessing ? '#10B981' : '#6B7280'}
          className="transition-all duration-300"
        >
          {(isRecording || isProcessing) && (
            <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
          )}
        </circle>
      </svg>

      {/* Accessibility status text (screen reader only) */}
      <span className="sr-only">
        {isRecording ? 'Recording audio' : isProcessing ? 'Processing request' : 'AI ready'}
      </span>
    </div>
  )
}
