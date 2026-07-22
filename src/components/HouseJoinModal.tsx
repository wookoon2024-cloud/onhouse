import React, { useState } from 'react';
import { Home, Sparkles, X, ArrowRight, Copy, Check, Users } from 'lucide-react';

interface HouseJoinModalProps {
  currentHouseCode: string;
  onJoinHouse: (newHouseCode: string) => void;
  onClose: () => void;
}

export const HouseJoinModal: React.FC<HouseJoinModalProps> = ({
  currentHouseCode,
  onJoinHouse,
  onClose
}) => {
  const [inputCode, setInputCode] = useState<string>(currentHouseCode);
  const [copied, setCopied] = useState<boolean>(false);

  const generateRandomCode = () => {
    const num = Math.floor(1000 + Math.random() * 9000);
    setInputCode(`H-${num}`);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentHouseCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = inputCode.trim().toUpperCase();
    if (!formatted) return;
    onJoinHouse(formatted);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)',
      zIndex: 300, display: 'flex', justifyContent: 'center', alignItems: 'center',
      padding: '16px'
    }}>
      <div style={{
        background: '#12121a', border: '1px solid var(--border-glass)',
        borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '24px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)', color: '#fff',
        position: 'relative'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer', padding: '4px'
          }}
        >
          <X size={18} />
        </button>

        {/* Header Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'rgba(139, 92, 246, 0.2)', border: '1px solid var(--accent)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            color: 'var(--accent)'
          }}>
            <Home size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
              하우스 (입장 번호) 변경
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              동일한 하우스 번호를 입력하면 친구들과 맵/에셋을 공유합니다.
            </p>
          </div>
        </div>

        {/* Current House Banner */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-glass)',
          borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>현재 접속 중인 하우스 번호</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent)', marginTop: '2px', fontFamily: 'monospace' }}>
              🏠 {currentHouseCode}
            </div>
          </div>
          <button
            onClick={handleCopy}
            style={{
              padding: '6px 12px', fontSize: '11px', borderRadius: '6px',
              background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.08)',
              border: copied ? '1px solid #10b981' : '1px solid var(--border-glass)',
              color: copied ? '#34d399' : '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? '복사됨!' : '코드 복사'}
          </button>
        </div>

        {/* Enter Code Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#ddd', marginBottom: '6px', fontWeight: 'bold' }}>
              이동할 하우스 번호 입력
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="예: H-1001 또는 MY-ROOM"
                style={{
                  flex: 1, background: '#0a0a0f', border: '1px solid var(--border-glass)',
                  borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px',
                  outline: 'none', fontFamily: 'monospace', fontWeight: 'bold'
                }}
              />
              <button
                type="button"
                onClick={generateRandomCode}
                title="랜덤 하우스 번호 생성"
                style={{
                  padding: '10px 12px', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border-glass)', borderRadius: '8px',
                  color: '#fff', cursor: 'pointer', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '4px'
                }}
              >
                <Sparkles size={14} style={{ color: '#f59e0b' }} /> 랜덤
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)',
                background: 'rgba(255,255,255,0.05)', color: '#ccc', cursor: 'pointer',
                fontSize: '13px', fontWeight: 'bold'
              }}
            >
              취소
            </button>
            <button
              type="submit"
              style={{
                flex: 2, padding: '12px', borderRadius: '8px', border: 'none',
                background: 'var(--primary)', color: '#fff', cursor: 'pointer',
                fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyContent: 'center',
                alignItems: 'center', gap: '6px', boxShadow: '0 4px 16px rgba(139, 92, 246, 0.4)'
              }}
            >
              <Users size={16} /> 하우스 입장하기 <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
