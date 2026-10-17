export interface CalendarEventInput {
  title: string;
  description: string;
  start: Date;
  end: Date;
  location?: string;
  attendees: string[];
  /** Pide un enlace de reunión (Google Meet) si no se aporta uno propio. */
  wantsMeetingLink: boolean;
}

export interface CalendarProvider {
  createEvent(e: CalendarEventInput): Promise<{ eventId: string; meetingUrl?: string }>;
  cancelEvent(eventId: string): Promise<void>;
}

/** Sin calendario conectado: el candidato recibe igualmente la invitación .ics adjunta al correo. */
export const noCalendar: CalendarProvider = {
  async createEvent() {
    return { eventId: "" };
  },
  async cancelEvent() {},
};

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId?: string;
  fetch?: typeof fetch;
}

// shortcut: adaptador implementado contra la documentación pública de Google Calendar API v3 (events.insert con
// conferenceData); no se probó contra el servicio real. Outlook (Microsoft Graph) llegará como otro adaptador del puerto.
export function googleCalendar(cfg: GoogleCalendarConfig): CalendarProvider {
  const doFetch = cfg.fetch ?? fetch;
  const cal = encodeURIComponent(cfg.calendarId ?? "primary");
  async function token(): Promise<string> {
    const res = await doFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: cfg.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error(`Google OAuth: HTTP ${res.status}`);
    return ((await res.json()) as { access_token: string }).access_token;
  }
  return {
    async createEvent(e) {
      const res = await doFetch(
        `https://www.googleapis.com/calendar/v3/calendars/${cal}/events?conferenceDataVersion=${e.wantsMeetingLink ? 1 : 0}&sendUpdates=none`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
          body: JSON.stringify({
            summary: e.title,
            description: e.description,
            location: e.location,
            start: { dateTime: e.start.toISOString() },
            end: { dateTime: e.end.toISOString() },
            attendees: e.attendees.map((email) => ({ email })),
            ...(e.wantsMeetingLink
              ? {
                  conferenceData: {
                    createRequest: {
                      requestId: crypto.randomUUID(),
                      conferenceSolutionKey: { type: "hangoutsMeet" },
                    },
                  },
                }
              : {}),
          }),
        },
      );
      if (!res.ok) throw new Error(`Google Calendar: HTTP ${res.status}`);
      const j = (await res.json()) as { id: string; hangoutLink?: string };
      return { eventId: j.id, meetingUrl: j.hangoutLink };
    },
    async cancelEvent(eventId) {
      const res = await doFetch(
        `https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${await token()}` },
        },
      );
      if (!res.ok && res.status !== 410 && res.status !== 404)
        throw new Error(`Google Calendar: HTTP ${res.status}`);
    },
  };
}
