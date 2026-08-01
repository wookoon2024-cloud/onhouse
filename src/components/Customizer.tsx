import React, { useState, useEffect } from 'react';
import type { PlayerState } from '../game/syncManager';
import { User, Trash2 } from 'lucide-react';
import { deleteHouseAssetFromDB, getSavedHouseCode } from '../services/HouseService';
import { supabase } from '../lib/supabase';
import { getCharDisplaySize } from '../game/MapData';

interface CustomizerProps {
  player: PlayerState;
  customCharSprites?: Array<{ id: string; name: string }>;
  onChange: (updates: Partial<PlayerState>) => void;
  onClose: () => void;
}

const DEFAULT_CHARACTERS = [
  { id: 'ninja_blue', name: '🥷 닌자 (Ninja)' },
  { id: 'samurai_blue', name: '⚔️ 블루 무사' },
  { id: 'samurai_green', name: '🌿 그린 무사' },
  { id: 'pig', name: '🐷 아기 돼지' },
];

export const Customizer: React.FC<CustomizerProps> = ({ player, customCharSprites, onChange, onClose }) => {
  // Always use DB customCharSprites as primary source of truth!
  const [customChars, setCustomChars] = useState<Array<{ id: string; name: string }>>(() => {
    if (customCharSprites && Array.isArray(customCharSprites) && customCharSprites.length > 0) {
      return customCharSprites;
    }
    try {
      const saved = localStorage.getItem('on_house_custom_char_sprites');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  // Re-sync character options dynamically whenever DB sprites are updated
  useEffect(() => {
    if (customCharSprites && Array.isArray(customCharSprites)) {
      setCustomChars(customCharSprites);
    }
  }, [customCharSprites]);

  const handleDeleteCustomChar = async (e: React.MouseEvent, charId: string, charName: string) => {
    e.stopPropagation();
    if (!window.confirm(`[${charName}] 커스텀 캐릭터를 삭제하시겠습니까?`)) return;

    const nextCustoms = customChars.filter((c) => c.id !== charId);
    setCustomChars(nextCustoms);
    localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(nextCustoms));

    try {
      const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
      if (overridesSaved) {
        const overrides = JSON.parse(overridesSaved);
        delete overrides[charId];
        localStorage.setItem('on_house_char_image_overrides', JSON.stringify(overrides));
      }
    } catch (err) {}

    if (player.spriteType === charId) {
      onChange({ spriteType: 'ninja_blue' });
    }

    const currentHouseCode = getSavedHouseCode();
    await deleteHouseAssetFromDB(currentHouseCode, 'char_sprite', charId);
    await deleteHouseAssetFromDB(currentHouseCode, 'char_image_override', charId);
    await deleteHouseAssetFromDB(currentHouseCode, 'char_row_actions', charId);

    try {
      supabase.channel(`house:${currentHouseCode}`).send({
        type: 'broadcast',
        event: 'asset_delete',
        payload: { assetType: 'char_sprite', assetId: charId }
      });
    } catch (e) {}

    window.dispatchEvent(new Event('on_house_sprites_updated'));
  };

  const allCharOptions = Array.from(
    new Map([...DEFAULT_CHARACTERS, ...customChars].map((c) => [c.id, c])).values()
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 5, 10, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px'
    }}>
      <div style={{
        width: '380px', maxWidth: '92vw', background: '#12121c',
        border: '1px solid #3b3b54', padding: '18px', display: 'flex',
        flexDirection: 'column', gap: '14px', boxShadow: '0 20px 50px rgba(0,0,0,0.85)',
        color: '#ffffff', borderRadius: 0
      }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #28283a', paddingBottom: '10px' }}>
          <h3 style={{ fontSize: '15px', color: '#a78bfa', margin: 0, fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
            👤 캐릭터 커스텀 설정
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

        {/* Nickname input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', color: '#ccc', fontWeight: 'normal' }}>
            👤 닉네임 변경:
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={player.nickname}
              onChange={(e) => onChange({ nickname: e.target.value.substring(0, 12) })}
              style={{
                width: '100%', padding: '7px 10px 7px 32px', fontSize: '12px',
                background: '#09090f', border: '1px solid #4a4a6b', color: '#fff',
                borderRadius: 0, outline: 'none', fontWeight: 'normal', boxSizing: 'border-box'
              }}
              placeholder="닉네임 입력..."
            />
            <User size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#aaa' }} />
          </div>
        </div>

        {/* Sprite Type selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '11px', color: '#ccc', fontWeight: 'normal' }}>
              🥷 캐릭터 베이스 외형:
            </label>
            <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 'normal' }}>
              총 {allCharOptions.length}종
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select
              value={player.spriteType}
              onChange={(e) => onChange({ spriteType: e.target.value })}
              style={{
                flex: 1, background: '#09090f', border: '1px solid #4a4a6b',
                borderRadius: 0, padding: '7px 10px', color: '#fff', fontSize: '12px',
                fontWeight: 'normal', outline: 'none', cursor: 'pointer'
              }}
            >
              {allCharOptions.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name.startsWith('👤') || char.name.startsWith('⚔️') || char.name.startsWith('🥷') || char.name.startsWith('🌿') || char.name.startsWith('🐷') || char.name.startsWith('🐶')
                    ? char.name
                    : `👤 ${char.name}`}
                </option>
              ))}
            </select>

            {!DEFAULT_CHARACTERS.some(d => d.id === player.spriteType) && (
              <button
                type="button"
                onClick={(e) => {
                  const currentObj = allCharOptions.find(c => c.id === player.spriteType);
                  if (currentObj) handleDeleteCustomChar(e, currentObj.id, currentObj.name);
                }}
                style={{
                  padding: '7px 10px', background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444', color: '#ff6b6b',
                  borderRadius: 0, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}
                title="선택된 커스텀 캐릭터 삭제"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Personal Map Display Size Setting */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid #28283a', paddingTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '11px', color: '#ccc', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '4px' }}>
              📏 개인 맵 출력 크기 설정:
            </label>
            <span style={{ fontSize: '10px', color: player.personalCharSize ? '#a78bfa' : '#888', fontWeight: 'normal' }}>
              {player.personalCharSize ? `⭐ 개인 크기 (${player.charSize || player.personalCharSize}px)` : `캐릭터 기본값 (${getCharDisplaySize(player.spriteType)}px)`}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                const currentSize = player.charSize || getCharDisplaySize(player.spriteType);
                const nextSize = Math.max(8, currentSize - 2);
                onChange({
                  personalCharSize: nextSize,
                  charSize: nextSize
                });
                try {
                  localStorage.setItem('on_house_personal_char_size', String(nextSize));
                } catch (e) {}
              }}
              style={{
                width: '26px', height: '26px', background: '#252538', border: '1px solid #4a4a6b',
                color: '#fff', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0
              }}
              title="크기 줄이기 (-2px)"
            >
              -
            </button>

            <input
              type="number"
              min={8}
              max={128}
              value={player.charSize || getCharDisplaySize(player.spriteType)}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 8 && val <= 128) {
                  onChange({
                    personalCharSize: val,
                    charSize: val
                  });
                  try {
                    localStorage.setItem('on_house_personal_char_size', String(val));
                  } catch (err) {}
                }
              }}
              style={{
                width: '50px', textAlign: 'center', padding: '4px', fontSize: '12px',
                background: '#09090f', border: '1px solid #4a4a6b', color: '#fff',
                outline: 'none', borderRadius: 0
              }}
            />
            <span style={{ fontSize: '11px', color: '#aaa' }}>px</span>

            <button
              type="button"
              onClick={() => {
                const currentSize = player.charSize || getCharDisplaySize(player.spriteType);
                const nextSize = Math.min(128, currentSize + 2);
                onChange({
                  personalCharSize: nextSize,
                  charSize: nextSize
                });
                try {
                  localStorage.setItem('on_house_personal_char_size', String(nextSize));
                } catch (e) {}
              }}
              style={{
                width: '26px', height: '26px', background: '#252538', border: '1px solid #4a4a6b',
                color: '#fff', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0
              }}
              title="크기 늘리기 (+2px)"
            >
              +
            </button>

            <button
              type="button"
              onClick={() => {
                const baseSize = getCharDisplaySize(player.spriteType);
                onChange({
                  personalCharSize: null,
                  charSize: baseSize
                });
                try {
                  localStorage.removeItem('on_house_personal_char_size');
                } catch (e) {}
              }}
              style={{
                marginLeft: 'auto', padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid #4a4a6b', color: '#aaa', fontSize: '10px', cursor: 'pointer',
                borderRadius: 0
              }}
              title="캐릭터 기본 맵 출력 크기로 복원"
            >
              🔄 기본값 복원
            </button>
          </div>

          <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#7a7a9a', lineHeight: '1.4' }}>
            {player.personalCharSize
              ? '⭐ 개인별 크기가 설정되어 픽셀에디터 변경보다 본인 개인 크기가 항상 우선 적용됩니다.'
              : '💡 픽셀에디터에서 맵 출력 크기를 지정한 캐릭터 기본값을 사용 중입니다.'}
          </p>
        </div>
      </div>
    </div>
  );
};
