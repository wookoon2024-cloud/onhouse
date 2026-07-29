import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface CustomAlertModalProps {
  isOpen: boolean;
  message: string;
  title?: string;
  icon?: string;
  onClose: () => void;
}

export const CustomAlertModal: React.FC<CustomAlertModalProps> = ({
  isOpen,
  message,
  title = '안내',
  icon = '💡',
  onClose
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        zIndex: 999999, background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        userSelect: 'none'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '380px', maxWidth: '90vw', background: 'rgba(20, 20, 32, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.22)', borderRadius: '12px',
          padding: '20px 24px', boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85)',
          display: 'flex', flexDirection: 'column', gap: '14px', color: '#fff',
          fontFamily: 'var(--font-pixel)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#a78bfa', fontWeight: 'normal' }}>
            <span style={{ fontSize: '16px' }}>{icon}</span>
            <span>{title}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.5)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Message */}
        <div style={{
          fontSize: '12px', color: '#e0e0e0', lineHeight: '1.5',
          whiteSpace: 'pre-line', wordBreak: 'break-word',
          background: 'rgba(255, 255, 255, 0.04)', padding: '12px 14px',
          borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          {message}
        </div>

        {/* Confirm Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
          <button
            onClick={onClose}
            autoFocus
            style={{
              background: '#89b4fa', color: '#11111b', border: 'none',
              padding: '7px 22px', borderRadius: '6px', fontSize: '12px',
              fontWeight: 'normal', cursor: 'pointer', transition: 'all 0.15s ease'
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
