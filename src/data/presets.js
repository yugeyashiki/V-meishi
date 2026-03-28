/**
 * data/presets.js
 * カラープリセット定義（仕様書 section 4 に準拠）
 */

export const COLOR_PRESETS = [
  {
    id: 'dark',
    label: 'ダーク',
    bgType: 'solid',
    bgColor: '#0D0D0D',
    bgGradient: ['#1a1a2e', '#16213e'],
    textColor: '#FFFFFF',
    accentColor: '#9B59B6',
  },
  {
    id: 'dark-gradient',
    label: 'グラデーション',
    bgType: 'gradient',
    bgColor: '#1a1a2e',
    bgGradient: ['#1a1a2e', '#16213e'],
    textColor: '#FFFFFF',
    accentColor: '#9B59B6',
  },
  {
    id: 'neon',
    label: 'ネオン',
    bgType: 'solid',
    bgColor: '#0A0A0A',
    bgGradient: ['#0A0A0A', '#001a1a'],
    textColor: '#FFFFFF',
    accentColor: '#00FFFF',
  },
  {
    id: 'light',
    label: 'ライト',
    bgType: 'solid',
    bgColor: '#FFFFFF',
    bgGradient: ['#FFFFFF', '#F0F0F0'],
    textColor: '#222222',
    accentColor: '#FF6B9D',
  },
  {
    id: 'natural',
    label: 'ナチュラル',
    bgType: 'solid',
    bgColor: '#F5F0E8',
    bgGradient: ['#F5F0E8', '#EDE8DC'],
    textColor: '#3D2B1F',
    accentColor: '#8B6F47',
  },
];
