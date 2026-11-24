/**
 * SPDX-FileCopyrightText: 2026 Sven Würth
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Keyboard shortcuts: which key does what, and when they are ignored.
 */

/** Selector of the task rows and cards that can be focused with the keyboard */
export const TASK_SELECTOR = '.task-item__body[data-task-key], .tb-card[data-task-key], .tb-table__row[data-task-key]'

/** Where typing or an open menu/dialog owns the keyboard */
const OWNER_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable=true], .v-popper__popper, .modal-mask, [role=dialog], [role=menu], [role=listbox]'

/** Columns a task is moved through with the keyboard (never into "Cancelled") */
export const MOVE_COLUMNS = ['open', 'inProgress', 'waiting', 'done']

/** Keys that may repeat while they are held down */
const REPEATING_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'j', 'k', 'h', 'l']

/** The view each number key switches to */
const VIEW_KEYS = { 1: 'list', 2: 'board', 3: 'table', 4: 'timeline' }

/** Where the arrow keys already have a meaning of their own */
const ARROW_OWNER_SELECTOR = '.app-sidebar, #app-sidebar-vue, select, video, audio, [role=tablist], [role=tab], [role=radiogroup], [role=radio], [role=slider], [role=tree], [role=grid], [role=combobox]'

/**
 * Whether the arrow keys may move between tasks: not where they do something else
 * (the sidebar, tabs, sliders …). A focused button or link does not use them.
 *
 * @param {EventTarget} target The element that has the focus
 * @return {boolean}
 */
export function arrowsFree(target) {
	return !target?.closest?.(ARROW_OWNER_SELECTOR)
}

/**
 * The arrow key J or K stands for in an open menu, so its entries can be reached like tasks
 *
 * @param {KeyboardEvent} event The event
 * @return {string|null} ArrowDown, ArrowUp or null
 */
export function menuArrowKey(event) {
	if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
		return null
	}
	const target = event.target
	if (!target?.closest?.('.v-popper__popper') || target.closest('input, textarea, select, [contenteditable=""], [contenteditable=true]')) {
		return null
	}
	return { j: 'ArrowDown', k: 'ArrowUp' }[event.key] || null
}

/**
 * Maps a key event to a shortcut action
 *
 * @param {KeyboardEvent} event The event
 * @param {object} context Destructuring object
 * @param {boolean} context.onTask Whether a task row/card has the focus
 * @return {string|null} newTask, next, previous, first, last, columnLeft, columnRight, previousLane, nextLane,
 * reorderUp, reorderDown, moveLeft, moveRight, startStop, view, open, toggle, select, rename, board, help, add,
 * moveList, due, actions, delete, zoom, today, week or null
 */
export function shortcutAction(event, { onTask = false } = {}) {
	if (event.ctrlKey || event.metaKey || event.altKey) {
		return null
	}
	switch (event.key) {
	case 'n':
	case 'N':
		return event.shiftKey ? null : 'newTask'
	case 'j':
		return 'next'
	case 'k':
		return 'previous'
	case 'J':
		return onTask ? 'reorderDown' : null
	case 'K':
		return onTask ? 'reorderUp' : null
	case 'ArrowDown':
		if (event.shiftKey) {
			return onTask ? 'reorderDown' : null
		}
		return 'next'
	case 'ArrowUp':
		if (event.shiftKey) {
			return onTask ? 'reorderUp' : null
		}
		return 'previous'
	case 'h':
		return 'columnLeft'
	case 'l':
		return 'columnRight'
	case 'H':
		return onTask ? 'moveLeft' : null
	case 'L':
		return onTask ? 'moveRight' : null
	case 'ArrowLeft':
		if (event.shiftKey) {
			return onTask ? 'moveLeft' : null
		}
		return 'columnLeft'
	case 'ArrowRight':
		if (event.shiftKey) {
			return onTask ? 'moveRight' : null
		}
		return 'columnRight'
	case 'g':
		return 'first'
	case 'G':
		return 'last'
	case '[':
		return 'previousLane'
	case ']':
		return 'nextLane'
	case 's':
		return onTask ? 'startStop' : null
	case '1':
	case '2':
	case '3':
	case '4':
		return 'view'
	case 'Enter':
	case 'o':
		return onTask ? 'open' : null
	case 'e':
		return 'rename'
	case 'a':
		return 'add'
	case 'm':
		return onTask ? 'moveList' : null
	case 'd':
		return onTask ? 'due' : null
	case ';':
		return onTask ? 'actions' : null
	case 'Backspace':
	case 'Delete':
		return onTask ? 'delete' : null
	case 'z':
		return 'zoom'
	case 'T':
		return 'today'
	case 'W':
		return 'week'
	case ' ':
		return onTask ? 'toggle' : null
	case 'x':
	case 'X':
		return onTask ? 'select' : null
	case 'F2':
		return 'rename'
	case 'b':
	case 'B':
		return event.shiftKey ? null : 'board'
	case '?':
		return 'help'
	default:
		return null
	}
}

/**
 * Whether the shortcuts are off for this event (typing, open menu or dialog)
 *
 * @param {KeyboardEvent} event The event
 * @param {Document} doc The document
 * @return {boolean}
 */
export function shortcutsBlocked(event, doc = document) {
	if (event.isComposing || (event.repeat && !REPEATING_KEYS.includes(event.key))) {
		return true
	}
	const target = event.target
	if (target?.closest?.(OWNER_SELECTOR) || target?.isContentEditable) {
		return true
	}
	// An open dialog or menu anywhere on the page
	return !!doc.querySelector('.modal-mask, [role=dialog][aria-modal=true], .v-popper__popper--shown')
}

/**
 * The next view for the key B: list → board → table → list
 *
 * @param {string} mode The current view
 * @return {string}
 */
export function nextViewMode(mode) {
	return { list: 'board', board: 'table', table: 'timeline', timeline: 'list' }[mode] || 'list'
}

/**
 * The view a number key switches to
 *
 * @param {string} key The key
 * @return {string|null}
 */
export function viewModeForKey(key) {
	return VIEW_KEYS[key] || null
}

/**
 * The column a task goes to when it is moved one column with the keyboard
 *
 * @param {string} column Its current column
 * @param {number} step +1 (right) or -1 (left)
 * @return {string|null} The target column, null at the edge
 */
export function neighbourColumn(column, step) {
	// A cancelled task comes back through "Done"
	if (column === 'cancelled') {
		return step < 0 ? 'done' : null
	}
	const index = MOVE_COLUMNS.indexOf(column)
	if (index < 0) {
		return null
	}
	return MOVE_COLUMNS[index + step] || null
}

/**
 * The column the key S moves a task to: it starts an open task and puts a started one back
 *
 * @param {string} column Its current column
 * @return {string|null}
 */
export function startStopColumn(column) {
	return { open: 'inProgress', inProgress: 'open' }[column] || null
}

/**
 * The next column or row that has cards, empty ones are skipped
 *
 * @param {number[]} counts Number of cards per column or row
 * @param {number} current Index of the current one (-1: none)
 * @param {number} step +1 or -1
 * @return {number} Its index (-1 if there is none)
 */
export function nextFilled(counts, current, step) {
	const start = current < 0 ? (step > 0 ? 0 : counts.length - 1) : current + step
	for (let index = start; index >= 0 && index < counts.length; index += step) {
		if (counts[index] > 0) {
			return index
		}
	}
	return -1
}

/**
 * Next element to focus in a list
 *
 * @param {number} current Index of the focused element (-1: none)
 * @param {number} count Number of elements
 * @param {number} step +1 or -1
 * @return {number} New index (-1 if there is nothing)
 */
export function moveIndex(current, count, step) {
	if (count <= 0) {
		return -1
	}
	if (current < 0) {
		return step > 0 ? 0 : count - 1
	}
	return Math.min(count - 1, Math.max(0, current + step))
}

/**
 * Shortcut overview (labels are translated in the component)
 */
export const SHORTCUTS = [
	{ keys: ['N'], label: 'New task' },
	{ keys: ['↓', 'J'], label: 'Next task, or entry of an open menu' },
	{ keys: ['↑', 'K'], label: 'Previous task, or entry of an open menu' },
	{ keys: ['G'], label: 'First task' },
	{ keys: ['Shift+G'], label: 'Last task' },
	{ keys: ['←', 'H'], label: 'Column to the left (board)' },
	{ keys: ['→', 'L'], label: 'Column to the right (board)' },
	{ keys: ['[', ']'], label: 'Previous or next row of the board' },
	{ keys: ['Shift+←', 'Shift+H'], label: 'Move the task one column to the left' },
	{ keys: ['Shift+→', 'Shift+L'], label: 'Move the task one column to the right' },
	{ keys: ['Shift+↑', 'Shift+K'], label: 'Move the card up (manual order)' },
	{ keys: ['Shift+↓', 'Shift+J'], label: 'Move the card down (manual order)' },
	{ keys: ['S'], label: 'Start the task or put it back to open' },
	{ keys: ['Enter', 'O'], label: 'Open the task' },
	{ keys: ['Space'], label: 'Complete / reopen the task' },
	{ keys: ['X'], label: 'Select the task' },
	{ keys: ['F2', 'E'], label: 'Rename the task' },
	{ keys: ['A'], label: 'Add a task to this column or list' },
	{ keys: ['D'], label: 'Set the due date' },
	{ keys: ['M'], label: 'Move to another list' },
	{ keys: [';'], label: 'Actions for the task' },
	{ keys: ['Backspace'], label: 'Delete the task' },
	{ keys: ['Z'], label: 'Widen the column of the board, again to go back' },
	{ keys: ['Shift+T', 'Shift+W'], label: 'Go to Today or Week' },
	{ keys: ['Esc'], label: 'Clear the selection' },
	{ keys: ['B'], label: 'Switch between list, board, table and timeline' },
	{ keys: ['1', '2', '3', '4'], label: 'Show the list, board, table or timeline' },
	{ keys: ['?'], label: 'Show the keyboard shortcuts' },
]
