import React from 'react';
import { Map } from 'lucide-react';

interface MapSelectorProps {
  currentMapId: string;
  onMapChange: (mapId: string) => void;
}

const MAP_LIST = [
  { id: 'room', name: '🏠 마이 룸' },
  { id: 'subway', name: '🚇 지하철역' },
  { id: 'park', name: '🌳 호수공원' },
  { id: 'apt', name: '🏢 아파트 단지' }
];

export const MapSelector: React.FC<MapSelectorProps> = ({ currentMapId, onMapChange }) => {
  return (
    <div className="glass-panel" style={{
      position: 'absolute', left: '15px', top: '15px',
      padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '8px',
      zIndex: 100, border: '1px solid rgba(255, 255, 255, 0.15)',
      background: 'rgba(30, 30, 46, 0.8)', maxWidth: 'calc(100vw - 110px)'
    }}>
      <Map size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span className="pixel-text" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: '4px', flexShrink: 0 }}>
        이동:
      </span>
      <div style={{
        display: 'flex', gap: '6px', overflowX: 'auto', overflowY: 'hidden',
        flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', paddingBottom: '2px'
      }}>
        {MAP_LIST.map((m) => (
          <button
            key={m.id}
            onClick={() => onMapChange(m.id)}
            style={{
              padding: '5px 10px', fontSize: '11px', borderRadius: '6px',
              background: currentMapId === m.id ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
              color: '#fff', border: currentMapId === m.id ? '1px solid var(--primary-hover)' : '1px solid var(--border-glass)',
              whiteSpace: 'nowrap', flexShrink: 0
            }}
          >
            {m.name}
          </button>
        ))}
      </div>
    </div>
  );
};
