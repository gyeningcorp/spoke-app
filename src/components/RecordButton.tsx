interface RecordButtonProps {
  recording: boolean;
  onClick: () => void;
}

// Giant circular record button, 60% of screen width. Tap to start/stop.
export function RecordButton({ recording, onClick }: RecordButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={recording ? 'Stop recording' : 'Start recording'}
      aria-pressed={recording}
      style={{
        width: '60vw',
        height: '60vw',
        maxWidth: 340,
        maxHeight: 340,
        borderRadius: '50%',
        background: recording ? 'var(--bg-elev)' : 'var(--record)',
        border: recording ? '6px solid var(--record)' : '6px solid transparent',
        boxShadow: recording
          ? '0 0 0 0 rgba(255,59,48,0.5)'
          : '0 10px 40px var(--shadow)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        transition: 'background 0.2s ease',
        animation: recording ? 'pulse 1.6s ease-in-out infinite' : 'none',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'block',
          background: 'var(--record)',
          width: recording ? '34%' : '0',
          height: recording ? '34%' : '0',
          borderRadius: recording ? 14 : '50%',
          transition: 'all 0.25s ease',
        }}
      />
      {!recording && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            color: '#fff',
            fontWeight: 700,
            fontSize: 'clamp(18px, 5vw, 26px)',
            letterSpacing: 0.5,
          }}
        >
          REC
        </span>
      )}
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(255,59,48,0.45); }
          70% { box-shadow: 0 0 0 26px rgba(255,59,48,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,59,48,0); }
        }
      `}</style>
    </button>
  );
}
