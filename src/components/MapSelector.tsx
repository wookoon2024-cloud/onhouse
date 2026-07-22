import React from 'react';
import { Map } from 'lucide-react';
import { type MapDefinition } from '../game/MapData';

interface MapSelectorProps {
  currentMapId: string;
  availableMapIds: string[];
  activeMaps: Record<string, MapDefinition>;
  onMapChange: (mapId: string) => void;
}

export const MapSelector: React.FC<MapSelectorProps> = ({
  currentMapId,
  availableMapIds,
  activeMaps,
  onMapChange
}) => {
  return (
    <div className="glass-panel" style={{
      position: 'absolute', left: '15px', top: '15px',
      padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '8px',
      zIndex: 100, border: '1px solid rgba(255, 255, 255, 0.15)',
      background: 'rgba(30, 30, 46, 0.85)', maxWidth: 'calc(100vw - 110px)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
    }}>
      <Map size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span className="pixel-text" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: '4px', flexShrink: 0 }}>
        이동:
      </span>

      <div style={{
        display: 'flex', gap: '6px', overflowX: 'auto', overflowY: 'hidden',
        flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', paddingBottom: '2px',
        alignItems: 'center'
      }}>
        {availableMapIds.map((mId) => {
          const mapObj = activeMaps[mId];
          const mapName = mapObj ? mapObj.name : mId;
          const isCurrent = currentMapId === mId;

          return (
            <button
              key={mId}
              onClick={() => onMapChange(mId)}
              style={{
                padding: '5px 10px', fontSize: '11px', borderRadius: '6px',
                background: isCurrent ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                color: '#fff', border: isCurrent ? '1px solid var(--primary-hover)' : '1px solid var(--border-glass)',
                whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
                fontWeight: isCurrent ? 'bold' : 'normal', transition: 'all 0.15s ease'
              }}
            >
              {mapName}
            </button>
          );
        })}
      </div>
    </div>
  );
};
