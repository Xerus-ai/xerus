// Snapshot Source Fetchers
// Raw API calls to fetch data from connected apps. No LLM involvement.
// Each fetcher returns formatted markdown sections for snapshot injection.

import { SnapshotSource, SourceFetchResult, DEFAULT_SOURCE_TIMEOUT_MS } from './snapshot.types';

type SourceFetcher = (
    source: SnapshotSource,
    lastProcessedIds: Record<string, string>
) => Promise<SourceFetchResult>;

const fetcherRegistry: Record<string, SourceFetcher> = {
    gmail: fetchGmail,
    github: fetchGithub,
    calendar: fetchCalendar,
    weather: fetchWeather,
};

export function getRegisteredApps(): string[] {
    return Object.keys(fetcherRegistry);
}

export function hasFetcher(app: string): boolean {
    return app in fetcherRegistry;
}

export async function fetchSource(
    source: SnapshotSource,
    lastProcessedIds: Record<string, string>
): Promise<SourceFetchResult> {
    const fetcher = fetcherRegistry[source.app];
    if (!fetcher) {
        throw new Error(`No fetcher registered for app: ${source.app}`);
    }
    const timeoutMs = source.timeout_ms || DEFAULT_SOURCE_TIMEOUT_MS;
    return executeWithTimeout(() => fetcher(source, lastProcessedIds), timeoutMs, source.app);
}

// Gmail fetcher - lists and summarizes emails via Gmail API
async function fetchGmail(
    source: SnapshotSource,
    lastProcessedIds: Record<string, string>
): Promise<SourceFetchResult> {
    const params = source.params as {
        filter?: 'unread' | 'important' | 'recent';
        max_results?: number;
        access_token?: string;
    };
    const accessToken = params.access_token;
    if (!accessToken) throw new Error('Gmail fetcher requires access_token in source params');

    const filter = params.filter || 'unread';
    const maxResults = params.max_results || 10;
    let gmailQuery = filter === 'unread' ? 'is:unread' : filter === 'important' ? 'is:important is:unread' : '';
    if (lastProcessedIds.gmail) gmailQuery += ` after:${lastProcessedIds.gmail}`;

    const searchUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    searchUrl.searchParams.set('q', gmailQuery);
    searchUrl.searchParams.set('maxResults', String(maxResults));

    const searchResponse = await fetch(searchUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!searchResponse.ok) {
        throw new Error(`Gmail API error: ${searchResponse.status} ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json() as {
        messages?: Array<{ id: string; threadId: string }>;
    };
    const messages = searchData.messages || [];
    if (messages.length === 0) {
        return { app: 'gmail', status: 'ok', fetched_at: new Date(), data: 'No new emails.', item_ids: [] };
    }

    const emailSummaries: string[] = [];
    const itemIds: string[] = [];

    const fetchResults = await Promise.allSettled(
        messages.slice(0, maxResults).map(async (msg) => {
            const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
            const msgResponse = await fetch(msgUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!msgResponse.ok) {
                throw new Error(`Gmail message fetch failed: ${msgResponse.status} for ${msg.id}`);
            }
            return { msg, data: await msgResponse.json() as {
                id: string; snippet: string; labelIds: string[];
                payload: { headers: Array<{ name: string; value: string }> };
            }};
        })
    );

    for (const result of fetchResults) {
        if (result.status === 'rejected') {
            console.warn(`[SnapshotFetcher] Gmail message fetch failed: ${result.reason}`);
            continue;
        }
        const { msg, data: msgData } = result.value;
        const hdr = (name: string) => msgData.payload.headers.find(h => h.name === name)?.value || '';
        const labels = (msgData.labelIds || []).map(l => l.toLowerCase()).join(', ');

        emailSummaries.push(
            `### From: ${hdr('From') || 'Unknown'}\n- Subject: ${hdr('Subject') || '(no subject)'}\n` +
            `- Snippet: "${msgData.snippet}"\n- Labels: ${labels}\n- Received: ${hdr('Date')}\n- Message ID: ${msg.id}`
        );
        itemIds.push(msg.id);
    }

    const count = messages.length;
    return {
        app: 'gmail', status: 'ok', fetched_at: new Date(),
        data: `${count} ${filter} email${count !== 1 ? 's' : ''}:\n\n${emailSummaries.join('\n\n')}`,
        item_ids: itemIds,
    };
}

// GitHub fetcher - lists notifications via GitHub API
async function fetchGithub(
    source: SnapshotSource,
    _lastProcessedIds: Record<string, string>
): Promise<SourceFetchResult> {
    const params = source.params as {
        type?: 'notifications';
        since_hours?: number;
        access_token?: string;
    };
    const accessToken = params.access_token;
    if (!accessToken) throw new Error('GitHub fetcher requires access_token in source params');

    const type = params.type || 'notifications';
    const since = new Date(Date.now() - (params.since_hours || 24) * 3600000).toISOString();

    if (type === 'notifications') {
        const url = new URL('https://api.github.com/notifications');
        url.searchParams.set('since', since);
        url.searchParams.set('all', 'false');

        const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
        });
        if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);

        const notifications = await response.json() as Array<{
            id: string;
            subject: { title: string; type: string };
            repository: { full_name: string };
            reason: string;
            updated_at: string;
        }>;

        if (notifications.length === 0) {
            return { app: 'github', status: 'ok', fetched_at: new Date(), data: 'No new notifications.', item_ids: [] };
        }

        const summaries = notifications.map(n =>
            `### ${n.subject.type}: ${n.subject.title}\n- Repo: ${n.repository.full_name}\n- Reason: ${n.reason}\n- Updated: ${n.updated_at}`
        );
        return {
            app: 'github', status: 'ok', fetched_at: new Date(),
            data: `${notifications.length} notification${notifications.length !== 1 ? 's' : ''}:\n\n${summaries.join('\n\n')}`,
            item_ids: notifications.map(n => n.id),
        };
    }

    throw new Error(`GitHub fetcher does not support type '${type}'. Supported: notifications`);
}

// Calendar fetcher - lists events via Google Calendar API
async function fetchCalendar(
    source: SnapshotSource,
    _lastProcessedIds: Record<string, string>
): Promise<SourceFetchResult> {
    const params = source.params as {
        range?: 'today' | 'tomorrow' | 'week';
        access_token?: string;
        calendar_id?: string;
    };
    const accessToken = params.access_token;
    if (!accessToken) throw new Error('Calendar fetcher requires access_token in source params');

    const range = params.range || 'today';
    const calendarId = params.calendar_id || 'primary';
    const now = new Date();
    const timeMin = new Date(now);
    const timeMax = new Date(now);

    if (range === 'today') {
        timeMin.setHours(0, 0, 0, 0);
        timeMax.setHours(23, 59, 59, 999);
    } else if (range === 'tomorrow') {
        timeMin.setDate(timeMin.getDate() + 1);
        timeMin.setHours(0, 0, 0, 0);
        timeMax.setDate(timeMax.getDate() + 1);
        timeMax.setHours(23, 59, 59, 999);
    } else {
        timeMin.setHours(0, 0, 0, 0);
        timeMax.setDate(timeMax.getDate() + 7);
        timeMax.setHours(23, 59, 59, 999);
    }

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('timeMin', timeMin.toISOString());
    url.searchParams.set('timeMax', timeMax.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '20');

    const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Calendar API error: ${response.status} ${response.statusText}`);

    const data = await response.json() as {
        items?: Array<{
            id: string; summary: string;
            start: { dateTime?: string; date?: string };
            end: { dateTime?: string; date?: string };
            location?: string;
            attendees?: Array<{ email: string }>;
        }>;
    };

    const events = data.items || [];
    if (events.length === 0) {
        return { app: 'calendar', status: 'ok', fetched_at: new Date(), data: `No events ${range}.`, item_ids: [] };
    }

    const summaries = events.map(e => {
        const start = e.start.dateTime || e.start.date || 'TBD';
        const lines = [`### ${e.summary}`, `- Start: ${start}`];
        if (e.end.dateTime || e.end.date) lines.push(`- End: ${e.end.dateTime || e.end.date}`);
        if (e.location) lines.push(`- Location: ${e.location}`);
        if (e.attendees?.length) lines.push(`- Attendees: ${e.attendees.map(a => a.email).join(', ')}`);
        return lines.join('\n');
    });

    return {
        app: 'calendar', status: 'ok', fetched_at: new Date(),
        data: `${events.length} event${events.length !== 1 ? 's' : ''} ${range}:\n\n${summaries.join('\n\n')}`,
        item_ids: events.map(e => e.id),
    };
}

// Weather fetcher - current conditions via OpenWeatherMap API
async function fetchWeather(
    source: SnapshotSource,
    _lastProcessedIds: Record<string, string>
): Promise<SourceFetchResult> {
    const params = source.params as { location?: string; include_forecast?: boolean; api_key?: string };
    const location = params.location || 'San Francisco';
    const apiKey = params.api_key;
    if (!apiKey) throw new Error('Weather fetcher requires api_key in source params');

    const currentUrl = new URL('https://api.openweathermap.org/data/2.5/weather');
    currentUrl.searchParams.set('q', location);
    currentUrl.searchParams.set('appid', apiKey);
    currentUrl.searchParams.set('units', 'imperial');

    const response = await fetch(currentUrl.toString());
    if (!response.ok) throw new Error(`Weather API error: ${response.status} ${response.statusText}`);

    const wd = await response.json() as {
        main: { temp: number; humidity: number };
        weather: Array<{ description: string }>;
        wind: { speed: number };
        name: string;
    };

    let resultData = `- Location: ${wd.name}\n- Current: ${Math.round(wd.main.temp)}F, ${wd.weather[0]?.description || 'unknown'}\n` +
        `- Humidity: ${wd.main.humidity}%\n- Wind: ${Math.round(wd.wind.speed)} mph`;

    if (params.include_forecast) {
        const fUrl = new URL('https://api.openweathermap.org/data/2.5/forecast');
        fUrl.searchParams.set('q', location);
        fUrl.searchParams.set('appid', apiKey);
        fUrl.searchParams.set('units', 'imperial');
        fUrl.searchParams.set('cnt', '4');

        const fResponse = await fetch(fUrl.toString());
        if (fResponse.ok) {
            const fData = await fResponse.json() as {
                list: Array<{ dt_txt: string; main: { temp: number }; weather: Array<{ description: string }> }>;
            };
            const forecasts = fData.list.map(f => `  - ${f.dt_txt}: ${Math.round(f.main.temp)}F, ${f.weather[0]?.description || ''}`);
            resultData += `\n- Forecast:\n${forecasts.join('\n')}`;
        }
    }

    return { app: 'weather', status: 'ok', fetched_at: new Date(), data: resultData };
}

// Executes a fetcher with a timeout using Promise.race (safe from double-resolve)
async function executeWithTimeout(
    fn: () => Promise<SourceFetchResult>,
    timeoutMs: number,
    app: string
): Promise<SourceFetchResult> {
    return Promise.race([
        fn(),
        new Promise<never>((_resolve, reject) => {
            setTimeout(
                () => reject(new Error(`Source fetch timed out after ${timeoutMs}ms for ${app}`)),
                timeoutMs
            );
        }),
    ]);
}
