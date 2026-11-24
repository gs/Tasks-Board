/**
 * SPDX-FileCopyrightText: 2026 Sven Würth
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Address in Tasks Board for a task clicked in the Calendar app. The Calendar
 * app sends the last two parts of the task's DAV address: the list (its URI,
 * which is also the list id in Tasks Board) and the file of the task.
 *
 * @param {object} event The event of the Calendar app
 * @param {string} event.calendarId The URI of the list
 * @param {string} event.taskId The file name of the task
 * @return {string|null} The path below the web root, or null
 */
export function taskUrlFromCalendar({ calendarId, taskId } = {}) {
	if (typeof calendarId !== 'string' || typeof taskId !== 'string' || !calendarId || !taskId) {
		return null
	}
	return '/apps/tasks_board/calendars/' + encodeURIComponent(calendarId) + '/tasks/' + encodeURIComponent(taskId)
}

/**
 * The task behind a link of the Calendar app (it links tasks to the Tasks app)
 *
 * @param {string} href The address of the link
 * @return {{calendarId: string, taskId: string}|null} List and file of the task, or null for other links
 */
export function taskFromCalendarLink(href) {
	const match = /\/apps\/tasks\/calendars\/([^/?#]+)\/tasks\/([^/?#]+)/.exec(href || '')
	if (!match) {
		return null
	}
	try {
		return { calendarId: decodeURIComponent(match[1]), taskId: decodeURIComponent(match[2]) }
	} catch (error) {
		return null
	}
}

/**
 * The day shown in the Calendar app (the last part of its address), today otherwise
 *
 * @param {string} pathname The path of the page
 * @param {Date} now The current time
 * @return {Date} The start of that day
 */
export function dayFromCalendarPath(pathname, now = new Date()) {
	const match = /\/(\d{4})-(\d{2})-(\d{2})\/?$/.exec(pathname || '')
	const day = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(now)
	day.setHours(0, 0, 0, 0)
	return day
}

/**
 * Whether two days of the dialog are the same (both may be empty)
 *
 * @param {Date|null} a One day
 * @param {Date|null} b The other day
 * @return {boolean}
 */
export function sameDay(a, b) {
	if (!a || !b) {
		return !a && !b
	}
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * The time of day of a due date moved to another day (the dialog only changes the day)
 *
 * @param {Date} day The chosen day
 * @param {Date|null} current The current due date with its time, null for a task without time
 * @return {Date}
 */
export function keepTimeOfDay(day, current = null) {
	const date = new Date(day)
	if (current) {
		date.setHours(current.getHours(), current.getMinutes(), current.getSeconds(), 0)
	} else {
		date.setHours(0, 0, 0, 0)
	}
	return date
}
