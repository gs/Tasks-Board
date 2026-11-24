/**
 * SPDX-FileCopyrightText: 2026 Sven Würth
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Loaded on the pages of the Calendar app (see BeforeTemplateRenderedListener):
 * a click on a task opens it in a dialog right there, and a button (key A)
 * adds a task. The page of Tasks Board is one click further (or Ctrl+click).
 *
 * The Calendar app links a task to the Tasks app and, on a click, announces it
 * on the event bus before it follows that link. The click is caught before the
 * Calendar app sees it; where that does not work (another markup, a click with
 * a modifier key) the task opens in Tasks Board as before.
 */

import store from './store/store.js'
import { dayFromCalendarPath, taskFromCalendarLink, taskUrlFromCalendar } from './tb/calendar.js'
import TbCalendarTaskDialog from './tb/components/TbCalendarTaskDialog.vue'
import { tbt } from './tb/l10n.js'

import { subscribe } from '@nextcloud/event-bus'
import { generateUrl } from '@nextcloud/router'

import { createApp } from 'vue'

let dialog = null

/**
 * Opens the dialog for a task of the Calendar app, or for a new one
 *
 * @param {object} props calendarId and taskUri of the task, or day for a new one
 */
function openDialog(props) {
	if (dialog) {
		return
	}
	const container = document.createElement('div')
	document.body.append(container)
	dialog = createApp(TbCalendarTaskDialog, {
		...props,
		onClose(changed) {
			dialog.unmount()
			container.remove()
			dialog = null
			// The Calendar app does not notice changes to its tasks, it has to load them again
			if (changed) {
				window.location.reload()
			}
		},
	})
	dialog.use(store)
	dialog.mount(container)
}

/**
 * Whether typing or an open dialog owns the keyboard
 *
 * @param {KeyboardEvent} event The event
 * @return {boolean}
 */
function keyboardTaken(event) {
	return event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat
		|| !!event.target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable=true], [role=dialog], [role=menu], [role=listbox]')
		|| !!document.querySelector('.modal-mask, [role=dialog][aria-modal=true], .v-popper__popper--shown')
}

document.addEventListener('click', (event) => {
	// With a modifier key the task opens in Tasks Board (the Calendar app goes on, see below)
	if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
		return
	}
	const task = taskFromCalendarLink(event.target?.closest?.('a[href]')?.getAttribute('href'))
	if (!task) {
		return
	}
	event.preventDefault()
	event.stopImmediatePropagation()
	openDialog({ calendarId: task.calendarId, taskUri: task.taskId })
}, true)

document.addEventListener('keydown', (event) => {
	if (event.key !== 'a' || keyboardTaken(event)) {
		return
	}
	event.preventDefault()
	openDialog({ day: dayFromCalendarPath(window.location.pathname) })
})

subscribe('calendar:handle-todo-click', (event) => {
	const path = taskUrlFromCalendar(event)
	if (!path) {
		return
	}
	const url = generateUrl(path)
	// After the Calendar app has set its own address in the same click
	queueMicrotask(() => {
		window.location.href = url
	})
})

window.addEventListener('DOMContentLoaded', () => {
	const button = document.createElement('button')
	button.type = 'button'
	button.className = 'tb-calendar-add'
	button.textContent = '+ ' + tbt('Task')
	button.title = tbt('Add a task') + ' (A)'
	button.addEventListener('click', () => openDialog({ day: dayFromCalendarPath(window.location.pathname) }))
	document.body.append(button)
})
