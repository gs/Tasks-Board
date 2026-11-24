/**
 * SPDX-FileCopyrightText: 2026 Sven Würth
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { dayFromCalendarPath, keepTimeOfDay, sameDay, taskFromCalendarLink, taskUrlFromCalendar } from '../../../../src/tb/calendar.js'

import { describe, expect, it } from 'vitest'

describe('calendar - click on a task in the Calendar app', () => {
	it('builds the address of the task in Tasks Board', () => {
		expect(taskUrlFromCalendar({ calendarId: 'personal', taskId: 'abc-123.ics' })).toBe('/apps/tasks_board/calendars/personal/tasks/abc-123.ics')
		expect(taskUrlFromCalendar({ calendarId: 'work_shared_by_max', taskId: 'a b.ics' })).toBe('/apps/tasks_board/calendars/work_shared_by_max/tasks/a%20b.ics')
	})

	it('ignores incomplete events', () => {
		expect(taskUrlFromCalendar({ calendarId: 'personal' })).toBeNull()
		expect(taskUrlFromCalendar({})).toBeNull()
		expect(taskUrlFromCalendar()).toBeNull()
	})
})

describe('calendar - tasks in a dialog of the Calendar app', () => {
	it('finds the task behind a link of the Calendar app', () => {
		expect(taskFromCalendarLink('https://cloud.example/nc/apps/tasks/calendars/personal/tasks/abc-123.ics'))
			.toEqual({ calendarId: 'personal', taskId: 'abc-123.ics' })
		expect(taskFromCalendarLink('/index.php/apps/tasks/calendars/work_shared_by_max/tasks/a%20b.ics?x=1'))
			.toEqual({ calendarId: 'work_shared_by_max', taskId: 'a b.ics' })
	})

	it('leaves other links alone', () => {
		expect(taskFromCalendarLink('/apps/calendar/dayGridMonth/now/edit/popover/abc/123')).toBeNull()
		expect(taskFromCalendarLink('/apps/deck/card/5')).toBeNull()
		expect(taskFromCalendarLink('/apps/tasks/calendars/personal/tasks/%E0%A4%A')).toBeNull()
		expect(taskFromCalendarLink(undefined)).toBeNull()
	})

	it('takes the day from the address of the Calendar app', () => {
		const now = new Date(2026, 4, 5, 15, 30)
		expect(dayFromCalendarPath('/apps/calendar/dayGridMonth/2026-11-24', now)).toEqual(new Date(2026, 10, 24))
		expect(dayFromCalendarPath('/apps/calendar/timeGridWeek/now', now)).toEqual(new Date(2026, 4, 5))
		expect(dayFromCalendarPath('', now)).toEqual(new Date(2026, 4, 5))
	})

	it('compares days and keeps the time of day', () => {
		expect(sameDay(null, null)).toBe(true)
		expect(sameDay(new Date(2026, 0, 1), null)).toBe(false)
		expect(sameDay(new Date(2026, 0, 1, 8), new Date(2026, 0, 1, 20))).toBe(true)
		expect(sameDay(new Date(2026, 0, 1), new Date(2026, 0, 2))).toBe(false)
		expect(keepTimeOfDay(new Date(2026, 0, 9, 12), new Date(2026, 0, 1, 16, 45))).toEqual(new Date(2026, 0, 9, 16, 45))
		expect(keepTimeOfDay(new Date(2026, 0, 9, 12))).toEqual(new Date(2026, 0, 9))
	})
})
