import {
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  Clock,
  EyeOff,
  FileSearch,
  Globe,
  Handshake,
  History,
  Inbox,
  PlugZap,
  Scale,
  ShieldCheck,
  Sparkles,
  Undo2,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

const map: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  calendar: CalendarClock,
  clipboard: ClipboardCheck,
  clock: Clock,
  "eye-off": EyeOff,
  "file-search": FileSearch,
  globe: Globe,
  handshake: Handshake,
  history: History,
  inbox: Inbox,
  plug: PlugZap,
  scale: Scale,
  shield: ShieldCheck,
  sparkles: Sparkles,
  undo: Undo2,
  "user-check": UserCheck,
  users: Users,
};

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const C = map[name] ?? Sparkles;
  return <C size={size} className={className} aria-hidden />;
}
