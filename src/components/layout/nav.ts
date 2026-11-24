import { ChartColumn, GraduationCap, Info, LayoutDashboard, Layers, Settings, SquarePlus, Upload, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/decks', label: 'My Decks', icon: Layers, end: true },
  { to: '/decks/new', label: 'Create Deck', icon: SquarePlus },
  { to: '/import', label: 'Import Cards', icon: Upload },
  { to: '/study', label: 'Study', icon: GraduationCap },
  { to: '/stats', label: 'Statistics', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/about', label: 'About Foundy', icon: Info },
];
