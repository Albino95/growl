import type { SeedStage } from '../../services/api/seeds';

export const STAGE_ORDER: SeedStage[] = ['seed', 'sprout', 'sapling', 'tree', 'mature'];

export function stageLabel(stage: string): string {
  switch (stage) {
    case 'sprout':
      return 'Sprout';
    case 'sapling':
      return 'Sapling';
    case 'tree':
      return 'Tree';
    case 'mature':
      return 'Mature';
    default:
      return 'Seed';
  }
}

export function stageEmoji(stage: string): string {
  switch (stage) {
    case 'sprout':
      return '🌱';
    case 'sapling':
      return '🌿';
    case 'tree':
      return '🌳';
    case 'mature':
      return '🌲';
    default:
      return '🌰';
  }
}

/** ring = brand stroke (same in both schemes); wash = light hex; washTw = tw colour key for the disc (scheme-aware). */
export function stageAccent(stage: string): { ring: string; wash: string; washTw: string } {
  switch (stage) {
    case 'sprout':
      return { ring: '#34D399', wash: '#ECFDF5', washTw: 'emerald-50' };
    case 'sapling':
      return { ring: '#059669', wash: '#D1FAE5', washTw: 'emerald-100' };
    case 'tree':
      return { ring: '#047857', wash: '#A7F3D0', washTw: 'emerald-200' };
    case 'mature':
      return { ring: '#F97066', wash: '#FFF1F0', washTw: 'energy-50' };
    default:
      return { ring: '#A8A29E', wash: '#EAE4D6', washTw: 'raised' };
  }
}
