import {
  KeyRound,
  Globe,
  Mail,
  Settings,
  Monitor,
  Folder,
  FolderOpen,
  Home,
  Star,
  ShieldCheck,
  Server,
  Lock,
  Wifi,
  Smartphone,
  Database,
  FileText,
  CreditCard,
  ShoppingCart,
  Gamepad2,
  Music,
  Camera,
  Banknote,
  Terminal,
  Clock
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<number, LucideIcon> = {
  0: KeyRound,
  1: Globe,
  3: Server,
  5: Globe,
  8: Wifi,
  9: Smartphone,
  11: Camera,
  18: Monitor,
  19: Mail,
  20: Settings,
  21: FileText,
  22: FileText,
  25: Mail,
  26: Database,
  34: Settings,
  35: Globe,
  38: Monitor,
  39: Clock,
  48: Folder,
  49: FolderOpen,
  56: FileText,
  58: KeyRound,
  60: Home,
  61: Star,
  66: Banknote,
  67: ShieldCheck,
  70: CreditCard,
  71: ShoppingCart,
  72: Gamepad2,
  73: Music,
  74: Terminal
}

export function entryIcon(icon: number | undefined): LucideIcon {
  if (icon == null) return KeyRound
  return ICON_MAP[icon] ?? KeyRound
}
