import React, { useState } from 'react';
import { Home, Sparkles, ArrowRight, Copy, Check, Users, Link } from 'lucide-react';

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
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  const generateRandomCode = () => {
    const num = Math.floor(1000 + Math.random() * 9000);
    setInputCode(`H-${num}`);
  };

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(currentHouseCode);
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = currentHouseCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?house=${currentHouseCode}`;
    try {
      navigator.clipboard.writeText(shareUrl);
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
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
      background: 'rgba(5, 5, 10, 0.75)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center',
      padding: '16px'
    }}>
      <div style={{
        background: '#12121c', border: '1px solid #3b3b54',
        borderRadius: 0, width: '100%', maxWidth: '380px', padding: '18px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)', color: '#fff',
        display: 'flex', flexDirection: 'column', gap: '12px'
      }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #28283a', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'normal', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Home size={16} /> 하우스 (입장 번호) 변경
          </h3>
          <button 
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', color: '#aaa', border: '1px solid #3b3b54',
              padding: '3px 8px', borderRadius: 0, fontSize: '11px', cursor: 'pointer',
              fontWeight: 'normal'
            }}
          >
            ✕ 닫기
          </button>
        </div>

        <p style={{ margin: 0, fontSize: '11px', color: '#aaa', lineHeight: '1.4' }}>
          동일한 하우스 번호를 입력하면 친구들과 맵과 에셋을 공유합니다.
        </p>

        {/* Current House Banner */}
        <div style={{
          background: '#181826', border: '1px solid #2d2d44',
          borderRadius: 0, padding: '10px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px'
        }}>
          <div>
            <div style={{ fontSize: '10px', color: '#aaa' }}>현재 접속 중인 하우스</div>
            <div style={{ fontSize: '15px', fontWeight: 'normal', color: '#a78bfa', marginTop: '2px', fontFamily: 'monospace' }}>
              🏠 {currentHouseCode}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                padding: '4px 8px', fontSize: '10px', borderRadius: 0,
                background: copied ? 'rgba(16, 185, 129, 0.2)' : '#252538',
                border: copied ? '1px solid #10b981' : '1px solid #3b3b54',
                color: copied ? '#34d399' : '#ccc', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 'normal'
              }}
              title="하우스 코드 복사"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? '복사됨!' : '코드 복사'}
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                padding: '4px 8px', fontSize: '10px', borderRadius: 0,
                background: linkCopied ? 'rgba(167, 139, 250, 0.3)' : '#a78bfa',
                border: 'none',
                color: linkCopied ? '#a78bfa' : '#000', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '3px',
                fontWeight: 'normal'
              }}
              title="친구 초대를 위한 바로가기 URL 복사"
            >
              {linkCopied ? <Check size={11} /> : <Link size={11} />}
              {linkCopied ? '링크 복사됨!' : '🔗 초대 링크'}
            </button>
          </div>
        </div>

        {/* Enter Code Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#ccc', marginBottom: '4px', fontWeight: 'normal' }}>
              이동할 하우스 번호 입력:
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="예: H-1001 또는 MY-ROOM"
                style={{
                  flex: 1, background: '#09090f', border: '1px solid #4a4a6b',
                  borderRadius: 0, padding: '7px 10px', color: '#fff', fontSize: '12px',
                  outline: 'none', fontFamily: 'monospace', fontWeight: 'normal', boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={generateRandomCode}
                title="랜덤 하우스 번호 생성"
                style={{
                  padding: '7px 10px', background: '#252538',
                  border: '1px solid #3b3b54', borderRadius: 0,
                  color: '#ccc', cursor: 'pointer', fontSize: '11px',
                  display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal'
                }}
              >
                <Sparkles size={13} style={{ color: '#f59e0b' }} /> 랜덤
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '7px', borderRadius: 0, border: '1px solid #3b3b54',
                background: '#222233', color: '#ccc', cursor: 'pointer',
                fontSize: '11px', fontWeight: 'normal'
              }}
            >
              취소
            </button>
            <button
              type="submit"
              style={{
                flex: 2, padding: '7px', borderRadius: 0, border: 'none',
                background: '#a78bfa', color: '#000', cursor: 'pointer',
                fontSize: '11px', fontWeight: 'normal', display: 'flex', justifyContent: 'center',
                alignItems: 'center', gap: '4px'
              }}
            >
              <Users size={14} /> 하우스 입장하기 <ArrowRight size={13} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
