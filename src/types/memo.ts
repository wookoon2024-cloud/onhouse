export type MemoType = 'one_time' | 'notice';

export interface MapMemo {
  id: string;
  mapId: string;
  x: number;
  y: number;
  authorId: string;
  authorName: string;
  memoType: MemoType; // 'one_time' (1회성, 주우면 가방 보관) | 'notice' (공지, 계속 유지됨)
  content: string;
  imageUrl?: string;
  createdAt: string; // e.g. "2026-07-23 16:40"
}

export interface InventoryItem {
  id: string;
  title: string;
  itemType: 'memo' | 'item';
  memoType?: MemoType;
  content?: string;
  imageUrl?: string;
  authorName: string;
  createdAt: string;
  receivedAt: string;
}
