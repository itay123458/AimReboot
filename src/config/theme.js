// Shared message palette. Discord owns the card background and button colors.
export const theme = Object.freeze({
  brand: 'AimReboot',
  gold: '#D4AF37',
  mutedGold: '#B89B56',
  success: '#65B88A',
  warning: '#E5B95C',
  error: '#D96C75',
  white: '#F5F1E8',
  dark: '#202225',
});

// Older built-in messages use literals rather than semantic color names.
// Normalize those through the same palette without replacing arbitrary colors.
export const legacyColors = new Map([
  ...['336699', '3498DB', '5865F2', '0099FF', '7289DA', '9B59B6', 'E91E63', 'FF69B4', 'EB459E', 'F1C40F']
    .map(hex => [parseInt(hex, 16), theme.gold]),
  ...['2F3136', '99AAB5', '95A5A6'].map(hex => [parseInt(hex, 16), theme.mutedGold]),
  ...['57F287', '00FF00', '2ECC71'].map(hex => [parseInt(hex, 16), theme.success]),
  ...['ED4245', 'FF0000', 'E74C3C', '8B0000'].map(hex => [parseInt(hex, 16), theme.error]),
  ...['FEE75C', 'FFFF00', 'FFA500', 'FAA61A', 'F39C12', 'FF6600'].map(hex => [parseInt(hex, 16), theme.warning]),
]);
