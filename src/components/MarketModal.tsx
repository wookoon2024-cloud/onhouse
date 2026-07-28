import React, { useState, useEffect } from 'react';
import {
  fetchMarketItems,
  importMarketItemToMyHouse,
  incrementMarketLike,
  getSavedHouseCode,
  type MarketItem
} from '../services/HouseService';

interface MarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemImported: (item: MarketItem, resultId?: string) => void;
}

export const MarketModal: React.FC<MarketModalProps> = ({
  isOpen,
  onClose,
  onItemImported
}) => {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'character' | 'map_tileset' | 'map'>('all');
  const [sortBy, setSortBy] = useState<'popular' | 'latest'>('popular');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string>('');
  const [likedItemIds, setLikedItemIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      loadMarketData();
    }
  }, [isOpen]);

  const loadMarketData = async () => {
    setIsLoading(true);
    const data = await fetchMarketItems();
    setItems(data);
    setIsLoading(false);
  };

  if (!isOpen) return null;

  const currentHouseCode = getSavedHouseCode();

  // Filter items
  const filteredItems = items
    .filter((item) => {
      if (activeCategory !== 'all' && item.type !== activeCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchCreator = item.creatorName.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        return matchTitle || matchCreator || matchDesc;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'popular') {
        return ((b.downloadsCount || 0) + (b.likesCount || 0) * 2) - ((a.downloadsCount || 0) + (a.likesCount || 0) * 2);
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  const handleLike = async (item: MarketItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (likedItemIds[item.id]) return;
    setLikedItemIds((prev) => ({ ...prev, [item.id]: true }));
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, likesCount: (i.likesCount || 0) + 1 } : i))
    );
    await incrementMarketLike(item.id);
  };

  const handleImport = async (item: MarketItem) => {
    try {
      setImportingId(item.id);
      setImportProgress('⏳ 내 하우스 DB로 복사 및 독립 에셋화 처리 중...');

      const res = await importMarketItemToMyHouse(currentHouseCode, item);

      if (res.success) {
        setImportProgress('✅ 내 하우스로 복사 완료!');
        setTimeout(() => {
          setImportingId(null);
          setImportProgress('');
          onItemImported(item, res.resultId);
        }, 600);
      } else {
        alert(res.error || '마켓 에셋 가져오기 실패');
        setImportingId(null);
        setImportProgress('');
      }
    } catch (err: any) {
      alert('가져오기 중 오류 발생: ' + (err?.message || err));
      setImportingId(null);
      setImportProgress('');
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 5, 10, 0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '16px'
    }}>
      <div style={{
        width: '1180px', maxWidth: '96vw', maxHeight: '92vh',
        background: '#0d0d14', border: '1px solid #3b3b54',
        borderRadius: 0, display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.8)', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', background: '#13131c', borderBottom: '1px solid #3b3b54',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#fff', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🛒 오픈 마켓 상점 <span style={{ fontSize: '12px', color: '#a78bfa', background: 'rgba(167,139,250,0.15)', padding: '2px 8px', border: '1px solid #4a4a6b' }}>GLOBAL MARKET</span>
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#aaa', fontWeight: 'normal' }}>
              다른 하우스 크리에이터들이 공유한 캐릭터, 타일셋, 완성형 맵을 내 하우스로 가져와 자유롭게 소장하고 마음껏 편집해보세요!
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #4a4a6b', color: '#ccc',
              fontSize: '16px', padding: '4px 12px', cursor: 'pointer', borderRadius: 0
            }}
          >
            ✕ 닫기
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{
          padding: '12px 20px', background: '#101018', borderBottom: '1px solid #28283a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px'
        }}>
          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { id: 'all', label: '🌐 전체 보기' },
              { id: 'character', label: '👤 캐릭터 에셋' },
              { id: 'map_tileset', label: '🗺️ 맵 타일셋' },
              { id: 'map', label: '🏰 완성형 맵' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id as any)}
                style={{
                  padding: '6px 14px', fontSize: '12px', borderRadius: 0, cursor: 'pointer',
                  background: activeCategory === tab.id ? '#a78bfa' : '#1c1c2b',
                  color: activeCategory === tab.id ? '#000' : '#ccc',
                  border: '1px solid #3b3b54', fontWeight: 'normal'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Sort Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              placeholder="🔍 에셋/맵 이름 또는 크리에이터 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '240px', background: '#0a0a0f', border: '1px solid #4a4a6b',
                padding: '6px 10px', fontSize: '11px', color: '#fff', borderRadius: 0, outline: 'none'
              }}
            />

            <div style={{ display: 'flex', border: '1px solid #4a4a6b' }}>
              <button
                type="button"
                onClick={() => setSortBy('popular')}
                style={{
                  padding: '5px 10px', fontSize: '11px', border: 'none', cursor: 'pointer',
                  background: sortBy === 'popular' ? '#a78bfa' : '#1c1c2b',
                  color: sortBy === 'popular' ? '#000' : '#ccc'
                }}
              >
                🔥 인기 순
              </button>
              <button
                type="button"
                onClick={() => setSortBy('latest')}
                style={{
                  padding: '5px 10px', fontSize: '11px', border: 'none', cursor: 'pointer',
                  background: sortBy === 'latest' ? '#a78bfa' : '#1c1c2b',
                  color: sortBy === 'latest' ? '#000' : '#ccc'
                }}
              >
                ✨ 최신 순
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#09090e' }}>
          {isLoading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
              ⏳ 오픈 마켓 에셋 데이터를 불러오는 중입니다...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#777', fontSize: '13px' }}>
              🛒 등록된 마켓 에셋이 없습니다. 내가 직접 만든 에셋과 맵을 먼저 마켓에 등록해보세요!
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px'
            }}>
              {filteredItems.map((item) => {
                const isImporting = importingId === item.id;
                const bundledCount = item.payload.bundledTilesets?.length || 0;

                return (
                  <div
                    key={item.id}
                    style={{
                      background: '#12121c', border: '1px solid #3b3b54',
                      borderRadius: 0, padding: '12px', display: 'flex',
                      flexDirection: 'column', gap: '10px', position: 'relative',
                      transition: 'border-color 0.2s ease'
                    }}
                  >
                    {/* Item Type Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '10px', padding: '2px 6px', border: '1px solid #4a4a6b',
                        background: item.type === 'character' ? 'rgba(255,121,198,0.2)' : item.type === 'map_tileset' ? 'rgba(139,92,246,0.2)' : 'rgba(50,205,50,0.2)',
                        color: item.type === 'character' ? '#ff79c6' : item.type === 'map_tileset' ? '#a78bfa' : '#50fa7b'
                      }}>
                        {item.type === 'character' ? '👤 캐릭터' : item.type === 'map_tileset' ? '🗺️ 타일셋' : '🏰 완성 맵'}
                      </span>

                      <span style={{ fontSize: '10px', color: '#888' }}>
                        {item.originalHouseCode}
                      </span>
                    </div>

                    {/* Preview Box */}
                    <div style={{
                      width: '100%', height: '140px', background: '#08080d',
                      border: '1px solid #28283a', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', position: 'relative'
                    }}>
                      {item.previewDataUrl ? (
                        <img
                          src={item.previewDataUrl}
                          alt={item.title}
                          style={{
                            maxWidth: '100%', maxHeight: '100%',
                            objectFit: 'contain', imageRendering: 'pixelated'
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: '11px', color: '#555' }}>미리보기 없음</span>
                      )}

                      {/* Bundled Tilesets Badge for Maps */}
                      {item.type === 'map' && bundledCount > 0 && (
                        <div style={{
                          position: 'absolute', bottom: '6px', left: '6px',
                          fontSize: '10px', background: 'rgba(0,0,0,0.85)', color: '#ffb86c',
                          padding: '2px 6px', border: '1px solid #ffb86c'
                        }}>
                          📦 커스텀 타일셋 {bundledCount}개 포함
                        </div>
                      )}
                    </div>

                    {/* Meta Details */}
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#fff', fontWeight: 'normal' }}>
                        {item.title}
                      </h4>
                      {item.description && (
                        <p style={{ margin: '0 0 6px 0', fontSize: '11px', color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.description}
                        </p>
                      )}
                      <div style={{ fontSize: '10px', color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>👤 {item.creatorName || '익명 크리에이터'}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span>📥 {item.downloadsCount || 0}</span>
                          <button
                            type="button"
                            onClick={(e) => handleLike(item, e)}
                            style={{
                              background: 'transparent', border: 'none',
                              color: likedItemIds[item.id] ? '#ff5555' : '#aaa',
                              cursor: 'pointer', fontSize: '11px', padding: 0
                            }}
                          >
                            ❤️ {item.likesCount || 0}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Import Action Button */}
                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={() => handleImport(item)}
                      style={{
                        marginTop: 'auto', width: '100%', padding: '8px',
                        fontSize: '11px', background: isImporting ? '#3b3b54' : '#a78bfa',
                        color: isImporting ? '#aaa' : '#000', border: 'none',
                        cursor: isImporting ? 'not-allowed' : 'pointer', borderRadius: 0,
                        fontWeight: 'normal', transition: 'all 0.15s ease'
                      }}
                    >
                      {isImporting ? importProgress || '⏳ 복사 중...' : '📥 내 하우스로 가져오기 (복사 & 편집)'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
