import React, { useState } from 'react';
import type { PlayerState } from '../game/syncManager';
import { User, Palette } from 'lucide-react';

interface CustomizerProps {
  player: PlayerState;
  onChange: (updates: Partial<PlayerState>) => void;
  onClose: () => void;
}

const DEFAULT_CHARACTERS = [
  { id: 'ninja_blue', name: '🥷 닌자 (Ninja)' },
  { id: 'samurai_blue', name: '⚔️ 블루 무사' },
  { id: 'samurai_green', name: '🌿 그린 무사' },
  { id: 'pig', name: '🐷 아기 돼지' },
];

export const Customizer: React.FC<CustomizerProps> = ({ player, onChange, onClose }) => {
  // Load custom created character sprites from localStorage
  const [customChars] = useState<Array<{ id: string; name: string }>>(() => {
    try {
      const saved = localStorage.getItem('on_house_custom_char_sprites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const allCharOptions = [...DEFAULT_CHARACTERS, ...customChars];

  return (
    <div className="glass-panel" style={{
      position: 'absolute', 
      right: window.innerWidth < 768 ? '15px' : '20px',
      left: window.innerWidth < 768 ? '15px' : 'auto',
      top: window.innerWidth < 768 ? '70px' : '80px',
      width: window.innerWidth < 768 ? 'auto' : '320px',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px',
      zIndex: 100, border: '1px solid rgba(255, 255, 255, 0.15)',
      animation: 'pulse-glow 3s infinite'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="pixel-text" style={{ fontSize: '18px', color: 'var(--accent)' }}>
          캐릭터 꾸미기
        </h3>
        <button 
          onClick={onClose}
          style={{
            background: 'rgba(0,0,0,0.3)', color: 'var(--text-secondary)',
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none'
          }}
        >
          닫기
        </button>
      </div>

      {/* Nickname input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label className="pixel-text" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          닉네임 변경
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={player.nickname}
            onChange={(e) => onChange({ nickname: e.target.value.substring(0, 12) })}
            style={{ width: '100%', padding: '10px 12px 10px 36px', fontSize: '13px' }}
            placeholder="닉네임 입력..."
          />
          <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Sprite Type selection (Includes ALL custom & default characters!) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="pixel-text" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            캐릭터 베이스 외형 선택
          </label>
          <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 'bold' }}>
            총 {allCharOptions.length}종
          </span>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
          maxHeight: '200px', overflowY: 'auto', paddingRight: '4px'
        }}>
          {allCharOptions.map((char) => (
            <button
              key={char.id}
              onClick={() => onChange({ spriteType: char.id })}
              style={{
                padding: '10px', borderRadius: '6px',
                background: player.spriteType === char.id ? 'var(--primary)' : 'rgba(0,0,0,0.3)',
                color: '#fff', border: player.spriteType === char.id ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}
              title={char.name}
            >
              {char.name.startsWith('👤') || char.name.startsWith('⚔️') || char.name.startsWith('🥷') || char.name.startsWith('🌿') || char.name.startsWith('🐷') || char.name.startsWith('🐶')
                ? char.name
                : `👤 ${char.name}`}
            </button>
          ))}
        </div>
      </div>

      {/* Color Dye (Hue Slider) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="pixel-text" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            의상/머리 염색
          </label>
          <span className="pixel-text" style={{ fontSize: '11px', color: 'var(--accent)' }}>
            {player.hue}°
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Palette size={18} style={{ color: 'var(--text-muted)' }} />
          <input
            type="range"
            min="0"
            max="360"
            value={player.hue}
            onChange={(e) => onChange({ hue: parseInt(e.target.value) })}
            style={{
              flex: 1, accentColor: 'var(--primary)', cursor: 'pointer',
              height: '6px', borderRadius: '3px', background: 'linear-gradient(to right, red, yellow, green, cyan, blue, magenta, red)'
            }}
          />
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
          * 캐릭터 옷과 깃털의 색상이 염색됩니다. 피부와 머리카락의 톤은 자연스럽게 보존됩니다.
        </p>
      </div>
    </div>
  );
};
