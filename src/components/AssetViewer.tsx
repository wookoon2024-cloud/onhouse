import React, { useState } from 'react';
import interiorUrl from '../assets/interior_tiles.png';
import outdoorUrl from '../assets/outdoor_tiles.png';
import ninjaUrl from '../assets/ninja_blue.png';
import samuraiUrl from '../assets/samurai_blue.png';

interface AssetViewerProps {
  onClose: () => void;
  onSelectTile?: (index: number) => void;
}

export const AssetViewer: React.FC<AssetViewerProps> = ({ onClose, onSelectTile }) => {
  const [selectedAsset, setSelectedAsset] = useState<'interior' | 'outdoor' | 'ninja' | 'samurai'>('interior');
  const [hoveredTile, setHoveredTile] = useState<{ col: number; row: number; index: number } | null>(null);

  const getAssetDetails = () => {
    switch (selectedAsset) {
      case 'interior':
        return { url: interiorUrl, cols: 22, rows: 17, size: 16 };
      case 'outdoor':
        return { url: outdoorUrl, cols: 22, rows: 26, size: 16 };
      case 'ninja':
        return { url: ninjaUrl, cols: 4, rows: 7, size: 16 };
      case 'samurai':
        return { url: samuraiUrl, cols: 4, rows: 7, size: 16 };
    }
  };

  const { url, cols, rows, size } = getAssetDetails();

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Scale factor of the image in the UI is 2x for readability
    const scale = 2;
    const col = Math.floor(x / (size * scale));
    const row = Math.floor(y / (size * scale));

    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      const index = row * cols + col;
      setHoveredTile({ col, row, index });
    } else {
      setHoveredTile(null);
    }
  };

  return (
    <div className="glass-panel" style={{
      position: 'absolute', left: '5%', top: '5%', width: '90%', height: '90%',
      zIndex: 150, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px',
      border: '1px solid rgba(255,255,255,0.2)', background: 'var(--bg-panel-solid)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <h3 className="pixel-text" style={{ fontSize: '18px', color: 'var(--accent)', margin: 0 }}>
            🔍 에셋 타일 뷰어 (Developer Tool)
          </h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['interior', 'outdoor', 'ninja', 'samurai'] as const).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setSelectedAsset(type);
                  setHoveredTile(null);
                }}
                style={{
                  padding: '6px 12px', fontSize: '11px', borderRadius: '4px',
                  background: selectedAsset === type ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                  color: '#fff', border: '1px solid var(--border-glass)'
                }}
              >
                {type.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'var(--danger)', color: '#fff',
            padding: '6px 14px', borderRadius: '6px', fontSize: '12px'
          }}
        >
          닫기
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', gap: '20px', overflow: 'hidden' }}>
        {/* Left Side: Image grid */}
        <div style={{
          flex: 1, overflow: 'auto', background: '#0a0a0f', borderRadius: '8px',
          border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'flex-start', padding: '10px', position: 'relative'
        }}>
          <div 
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredTile(null)}
            onClick={() => {
              if (hoveredTile && onSelectTile) {
                onSelectTile(hoveredTile.index);
                onClose();
              }
            }}
            style={{
              position: 'relative',
              width: `${cols * size * 2}px`,
              height: `${rows * size * 2}px`,
              backgroundImage: `url(${url})`,
              backgroundSize: '100% 100%',
              imageRendering: 'pixelated',
              cursor: 'crosshair'
            }}
          >
            {/* Grid overlay */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
              backgroundSize: `${size * 2}px ${size * 2}px`
            }} />

            {/* Hover highlight */}
            {hoveredTile && (
              <div style={{
                position: 'absolute',
                left: `${hoveredTile.col * size * 2}px`,
                top: `${hoveredTile.row * size * 2}px`,
                width: `${size * 2}px`,
                height: `${size * 2}px`,
                border: '2px solid var(--accent)',
                boxSizing: 'border-box',
                pointerEvents: 'none',
                background: 'rgba(245, 194, 231, 0.15)'
              }} />
            )}
          </div>
        </div>

        {/* Right Side: Details panel */}
        <div style={{
          width: '280px', display: 'flex', flexDirection: 'column', gap: '16px',
          background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px',
          border: '1px solid var(--border-glass)'
        }}>
          <h4 className="pixel-text" style={{ fontSize: '13px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px' }}>
            선택된 타일 정보
          </h4>
          {hoveredTile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>인덱스 ID:</span>
                <span className="pixel-text" style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '13px' }}>
                  {hoveredTile.index}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>열 (Column):</span>
                <span>{hoveredTile.col}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>행 (Row):</span>
                <span>{hoveredTile.row}</span>
              </div>
              
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '10px', marginTop: '10px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: '1.4' }}>
                  이 인덱스 ID를 복사하여 <code>MapData.ts</code> 파일의 맵 구성 배열에 할당하면 해당 위치에 이 타일이 그려집니다.
                </p>
              </div>

              {/* Live Preview of the Tile scaled */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>타일 미리보기 (4x)</span>
                <div style={{
                  width: '64px',
                  height: '64px',
                  backgroundImage: `url(${url})`,
                  backgroundPosition: `-${hoveredTile.col * size}px -${hoveredTile.row * size}px`,
                  backgroundSize: `${cols * 100}% ${rows * 100}%`,
                  imageRendering: 'pixelated',
                  border: '1px solid var(--border-glass)'
                }} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
              마우스를 타일 위에 올리면<br />상세 정보가 표시됩니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
