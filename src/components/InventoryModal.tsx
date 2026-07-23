import React, { useState } from 'react';
import { Briefcase, X, FileText, Trash2, MapPin } from 'lucide-react';
import type { InventoryItem } from '../types/memo';

interface InventoryModalProps {
  inventory: InventoryItem[];
  onDropToMap: (item: InventoryItem) => void;
  onDeleteItem: (itemId: string) => void;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  inventory,
  onDropToMap,
  onDeleteItem,
  onClose
}) => {
  const [inspectingItem, setInspectingItem] = useState<InventoryItem | null>(null);

  // Total 20 inventory slots (4 rows x 5 columns RPG Grid)
  const TOTAL_SLOTS = 20;
  const slots = Array.from({ length: TOTAL_SLOTS }, (_, idx) => inventory[idx] || null);

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(6px)',
        zIndex: 1500, display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#181825', border: '1px solid var(--accent)',
          borderRadius: '16px', padding: '20px', width: '420px', maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.95)', color: '#fff',
          display: 'flex', flexDirection: 'column', gap: '14px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Briefcase size={20} /> 🎒 장비함
            <span style={{ fontSize: '11px', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '10px' }}>
              {inventory.length} / {TOTAL_SLOTS}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* RPG Game Inventory Slot Grid (5 Columns x 4 Rows) */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px',
          background: '#0d0d12', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px', padding: '14px'
        }}>
          {slots.map((item, idx) => {
            if (!item) {
              return (
                <div
                  key={`empty_${idx}`}
                  style={{
                    aspectRatio: '1', background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                />
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => setInspectingItem(item)}
                style={{
                  aspectRatio: '1', background: 'rgba(139, 92, 246, 0.18)',
                  border: '1px solid var(--accent)', borderRadius: '10px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: '4px', position: 'relative',
                  transition: 'all 0.15s ease', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}
                className="hover-highlight"
              >
                <div style={{ fontSize: '24px' }}>
                  {item.imageUrl ? '📷' : '📝'}
                </div>
                <div style={{
                  fontSize: '9px', fontWeight: 'bold', color: '#fff',
                  width: '100%', whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis', textAlign: 'center', marginTop: '2px'
                }}>
                  {item.title || item.content || '메모'}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: '11px', color: '#888', textAlign: 'center' }}>
          💡 아이템을 클릭하면 내용을 확인하거나 맵에 내려놓을 수 있습니다.
        </div>

        {/* Action Popup Modal when clicking an item slot */}
        {inspectingItem && (
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
              zIndex: 1600, display: 'flex', justifyContent: 'center', alignItems: 'center',
              padding: '16px'
            }}
            onClick={() => setInspectingItem(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#181825', border: '1px solid var(--accent)',
                borderRadius: '16px', padding: '20px', width: '360px', maxWidth: '90vw',
                boxShadow: '0 20px 60px rgba(0,0,0,0.95)', color: '#fff',
                display: 'flex', flexDirection: 'column', gap: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={16} /> 📝 메모 내용 확인
                </div>
                <button onClick={() => setInspectingItem(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ fontSize: '11px', color: '#aaa', display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: '6px' }}>
                <div>작성자: <strong style={{ color: '#fff' }}>{inspectingItem.authorName}</strong></div>
                <div>습득일: <span style={{ color: '#ccc' }}>{inspectingItem.receivedAt}</span></div>
              </div>

              {inspectingItem.content && (
                <div style={{
                  background: '#0d0d12', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px', padding: '12px', color: '#fff', fontSize: '13px',
                  lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: '160px', overflowY: 'auto'
                }}>
                  {inspectingItem.content}
                </div>
              )}

              {inspectingItem.imageUrl && (
                <div style={{ textAlign: 'center' }}>
                  <img src={inspectingItem.imageUrl} alt="Attached" style={{ width: '100%', maxHeight: '160px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-glass)' }} />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                <button
                  onClick={() => {
                    onDropToMap(inspectingItem);
                    setInspectingItem(null);
                  }}
                  style={{
                    padding: '10px', background: 'var(--primary)',
                    border: 'none', color: '#fff', borderRadius: '8px',
                    fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  <MapPin size={14} /> 📍 이 위치 맵에 내려놓기
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('정말로 이 아이템을 장비함에서 버리시겠습니까?')) {
                      onDeleteItem(inspectingItem.id);
                      setInspectingItem(null);
                    }
                  }}
                  style={{
                    padding: '8px', background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid var(--danger)', color: '#ff6b6b',
                    borderRadius: '8px', fontSize: '11px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                  }}
                >
                  <Trash2 size={13} /> 🗑️ 버리기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
