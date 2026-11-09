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

export function stageAccent(stage: string): { ring: string; wash: string } {
  switch (stage) {
    case 'sprout':
      return { ring: '#34D399', wash: '#ECFDF5' };
    case 'sapling':
      return { ring: '#059669', wash: '#D1FAE5' };
    case 'tree':
      return { ring: '#047857', wash: '#A7F3D0' };
    case 'mature':
      return { ring: '#F97066', wash: '#FFF1F0' };
    default:
      return { ring: '#A8A29E', wash: '#EAE4D6' };
  }
}
