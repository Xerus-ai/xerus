/**
 * Google Calendar Tool - Real API Implementation
 * Simple, direct Google Calendar API integration for Xerus
 */

const { google } = require('googleapis');

class GoogleCalendarTool {
  constructor() {
    this.calendar = null;
  }

  /**
   * Initialize Google Calendar API client with OAuth token
   */
  async initializeAuth(accessToken) {
    try {
      // Create OAuth2 client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({
        access_token: accessToken
      });

      // Create Calendar API instance
      this.calendar = google.calendar({
        version: 'v3',
        auth: oauth2Client
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to initialize Google Calendar auth: ${error.message}`);
    }
  }

  /**
   * List upcoming calendar events
   */
  async listEvents(parameters = {}) {
    try {
      if (!this.calendar) {
        throw new Error('Calendar not initialized. Call initializeAuth first.');
      }

      const {
        maxResults = 10,
        timeMin = new Date().toISOString(),
        timeMax = null,
        calendarId = 'primary',
        singleEvents = true,
        orderBy = 'startTime'
      } = parameters;

      const requestParams = {
        calendarId,
        timeMin,
        maxResults,
        singleEvents,
        orderBy
      };

      if (timeMax) {
        requestParams.timeMax = timeMax;
      }

      const response = await this.calendar.events.list(requestParams);
      
      const events = response.data.items || [];
      
      // Format events for easier consumption
      const formattedEvents = events.map(event => ({
        id: event.id,
        summary: event.summary || 'Untitled Event',
        description: event.description || '',
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location || '',
        attendees: event.attendees?.map(a => a.email) || [],
        creator: event.creator?.email || '',
        htmlLink: event.htmlLink
      }));

      return {
        success: true,
        events: formattedEvents,
        count: formattedEvents.length,
        message: `Retrieved ${formattedEvents.length} events`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        events: [],
        count: 0
      };
    }
  }

  /**
   * Create a new calendar event
   */
  async createEvent(parameters = {}) {
    try {
      if (!this.calendar) {
        throw new Error('Calendar not initialized. Call initializeAuth first.');
      }

      const {
        summary,
        description = '',
        startDateTime,
        endDateTime,
        location = '',
        attendees = [],
        calendarId = 'primary'
      } = parameters;

      if (!summary) {
        throw new Error('Event summary is required');
      }

      if (!startDateTime || !endDateTime) {
        throw new Error('Start and end date/time are required');
      }

      const eventData = {
        summary,
        description,
        start: {
          dateTime: startDateTime,
          timeZone: 'UTC'
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'UTC'
        }
      };

      if (location) {
        eventData.location = location;
      }

      if (attendees.length > 0) {
        eventData.attendees = attendees.map(email => ({ email }));
      }

      const response = await this.calendar.events.insert({
        calendarId,
        resource: eventData
      });

      return {
        success: true,
        event: {
          id: response.data.id,
          summary: response.data.summary,
          start: response.data.start.dateTime,
          end: response.data.end.dateTime,
          htmlLink: response.data.htmlLink
        },
        message: 'Event created successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        event: null
      };
    }
  }

  /**
   * Get details of a specific event
   */
  async getEvent(parameters = {}) {
    try {
      if (!this.calendar) {
        throw new Error('Calendar not initialized. Call initializeAuth first.');
      }

      const { eventId, calendarId = 'primary' } = parameters;

      if (!eventId) {
        throw new Error('Event ID is required');
      }

      const response = await this.calendar.events.get({
        calendarId,
        eventId
      });

      const event = response.data;

      return {
        success: true,
        event: {
          id: event.id,
          summary: event.summary || 'Untitled Event',
          description: event.description || '',
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          location: event.location || '',
          attendees: event.attendees?.map(a => a.email) || [],
          creator: event.creator?.email || '',
          htmlLink: event.htmlLink,
          status: event.status
        },
        message: 'Event retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        event: null
      };
    }
  }

  /**
   * Test calendar connection
   */
  async testConnection() {
    try {
      if (!this.calendar) {
        throw new Error('Calendar not initialized. Call initializeAuth first.');
      }

      // Try to get calendar info
      const response = await this.calendar.calendars.get({
        calendarId: 'primary'
      });

      return {
        success: true,
        message: 'Successfully connected to Google Calendar',
        calendar: {
          id: response.data.id,
          summary: response.data.summary,
          timeZone: response.data.timeZone
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to Google Calendar'
      };
    }
  }

  /**
   * Get available calendar operations
   */
  getAvailableOperations() {
    return [
      {
        name: 'listEvents',
        description: 'List upcoming calendar events',
        parameters: {
          maxResults: 'Number of events to return (default: 10)',
          timeMin: 'Start time for event search (ISO string)',
          timeMax: 'End time for event search (ISO string, optional)',
          calendarId: 'Calendar ID (default: primary)'
        }
      },
      {
        name: 'createEvent',
        description: 'Create a new calendar event',
        parameters: {
          summary: 'Event title (required)',
          description: 'Event description',
          startDateTime: 'Event start time (ISO string, required)',
          endDateTime: 'Event end time (ISO string, required)',
          location: 'Event location',
          attendees: 'Array of attendee email addresses'
        }
      },
      {
        name: 'getEvent',
        description: 'Get details of a specific event',
        parameters: {
          eventId: 'Calendar event ID (required)',
          calendarId: 'Calendar ID (default: primary)'
        }
      },
      {
        name: 'testConnection',
        description: 'Test calendar connection and permissions',
        parameters: {}
      }
    ];
  }
}

module.exports = GoogleCalendarTool;