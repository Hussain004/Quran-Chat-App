export type Colors = {
  bg: string; surface: string; surfaceDeep: string;
  border: string; borderFaint: string;
  accent: string; accentBg: string; accentBorder: string;
  text: string; textSecondary: string; textMuted: string; textFaint: string; textVeryFaint: string;
  primary: string; primaryBorder: string;
  inputBg: string; placeholder: string;
  sendIconActive: string; sendIconDisabled: string;
  aiBubbleBorder: string;
  errorBg: string; errorBorder: string;
  signOutBg: string; signOutBorder: string; signOutText: string;
  warningText: string; errorText: string;
  statusBar: 'light' | 'dark';
}

export const dark: Colors = {
  bg: '#0D1B14',
  surface: '#152B1F',
  surfaceDeep: '#0D2218',
  border: '#2D4A38',
  borderFaint: '#1E3525',
  accent: '#C9A84C',
  accentBg: 'rgba(201,168,76,0.12)',
  accentBorder: 'rgba(201,168,76,0.25)',
  text: '#F8F4ED',
  textSecondary: '#D1CEC8',
  textMuted: '#9CA3AF',
  textFaint: '#6B7280',
  textVeryFaint: '#4B6858',
  primary: '#1A4731',
  primaryBorder: '#2D6A4F',
  inputBg: '#152B1F',
  placeholder: '#4B6858',
  sendIconActive: '#1A4731',
  sendIconDisabled: '#4B6858',
  aiBubbleBorder: '#C9A84C',
  errorBg: '#3B1A1A',
  errorBorder: '#7A2A2A',
  signOutBg: '#3B1212',
  signOutBorder: '#6B2121',
  signOutText: '#FF6B6B',
  warningText: '#F5A623',
  errorText: '#F87171',
  statusBar: 'light',
}

export const light: Colors = {
  bg: '#F0EBE0',
  surface: '#E5DFD0',
  surfaceDeep: '#DDD5C2',
  border: '#C5BAA5',
  borderFaint: '#D4CDB8',
  accent: '#7A5C0F',
  accentBg: 'rgba(122,92,15,0.12)',
  accentBorder: 'rgba(122,92,15,0.25)',
  text: '#1C2B20',
  textSecondary: '#3A4A40',
  textMuted: '#5A6868',
  textFaint: '#7A8A88',
  textVeryFaint: '#8A9490',
  primary: '#1A4731',
  primaryBorder: '#2D6A4F',
  inputBg: '#E5DFD0',
  placeholder: '#8A9490',
  sendIconActive: '#F0EBE0',
  sendIconDisabled: '#8A9490',
  aiBubbleBorder: '#7A5C0F',
  errorBg: '#3B1A1A',
  errorBorder: '#7A2A2A',
  signOutBg: '#F0E0DC',
  signOutBorder: '#D4B0A8',
  signOutText: '#CC3333',
  warningText: '#8B5E00',
  errorText: '#CC2222',
  statusBar: 'dark',
}
