import React, { useState } from 'react';
import { Smile, HelpCircle } from 'lucide-react';

interface StatusPickerProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
}

const PRESETS = ['일하는중', '출근중', '식사중', '공부중', '휴식중', '회의중', '자리비움'];

export const StatusPicker: React.FC<StatusPickerProps> = ({ currentStatus, onStatusChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);

  const handleSelect = (status: string) => {
    onStatusChange(status);
    setIsOpen(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customText.trim()) {
      onStatusChange(customText.trim().substring(0, 10));
      setCustomText('');
      setIsOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Current status display button - Flat sharp translucent style */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px',
            color: '#fff', border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '3px', fontSize: '11px', background: 'rgba(0, 0, 0, 0.45)',
            cursor: 'pointer', outline: 'none'
          }}
        >
          <Smile size={14} style={{ color: '#fab387' }} />
          <span>상태: {currentStatus || '설정없음'}</span>
        </button>

        {/* Info button */}
        <div 
          style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <HelpCircle size={14} style={{ color: 'rgba(255, 255, 255, 0.4)' }} />
          
          {showTooltip && (
            <div style={{
              position: 'absolute', bottom: '26px', left: '50%', transform: 'translateX(-50%)',
              width: '220px', padding: '10px', zIndex: 130, fontSize: '11px', lineHeight: '1.4',
              color: '#cdd6f4', background: 'rgba(15, 15, 25, 0.95)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '3px', pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
            }}>
              💡 <strong>오프라인 상태 유지</strong>: 브라우저를 닫더라도 설정하신 상태가 오프라인 캐릭터 머리 위에 계속 유지됩니다!
            </div>
          )}
        </div>
      </div>

      {/* Preset select dropdown - Flat sharp panel */}
      {isOpen && (
        <div 
          style={{
            position: 'absolute', bottom: '38px', left: 0, width: '220px',
            padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px',
            zIndex: 120, border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: '3px', background: 'rgba(20, 20, 30, 0.95)',
            backdropFilter: 'blur(10px)', boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
          }}
        >
          <div className="pixel-text" style={{ fontSize: '11px', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
            나의 상태 설정
          </div>

          {/* Presets */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => handleSelect(preset)}
                style={{
                  padding: '4px 6px', fontSize: '10px', borderRadius: '2px',
                  background: currentStatus === preset ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                  color: '#fff', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer'
                }}
              >
                {preset}
              </button>
            ))}
            <button
              onClick={() => handleSelect('')}
              style={{
                padding: '4px 6px', fontSize: '10px', borderRadius: '2px',
                background: currentStatus === '' ? 'var(--primary)' : 'rgba(243, 139, 168, 0.15)',
                color: 'var(--danger)', border: '1px solid rgba(243, 139, 168, 0.3)', cursor: 'pointer'
              }}
            >
              지우기
            </button>
          </div>

          {/* Custom entry */}
          <form onSubmit={handleCustomSubmit} style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            <input
              type="text"
              placeholder="직접 입력..."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              style={{
                flex: 1, padding: '4px 6px', fontSize: '11px', borderRadius: '2px',
                background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', outline: 'none'
              }}
            />
            <button
              type="submit"
              style={{
                padding: '4px 8px', fontSize: '11px', borderRadius: '2px',
                background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer'
              }}
            >
              설정
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
