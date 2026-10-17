const fmt = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
// RFC 5545: se escapan \ ; , y saltos de línea; las líneas largas se pliegan a 75 octetos.
const esc = (s: string) =>
  s.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => line.replace(/(.{73})(?=.)/g, "$1\r\n ");

/** Invitación de calendario (.ics) que se adjunta al correo, sirve en Google, Outlook y Apple Calendar. */
export function buildIcs(e: {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location?: string;
  url?: string;
  cancel?: boolean;
  sequence?: number;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ATS//Entrevistas//ES",
    `METHOD:${e.cancel ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(e.start)}`,
    `DTEND:${fmt(e.end)}`,
    `SUMMARY:${esc(e.summary)}`,
    `DESCRIPTION:${esc(e.description)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    `SEQUENCE:${e.sequence ?? 0}`,
    `STATUS:${e.cancel ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
