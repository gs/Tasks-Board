import TbShortcuts from '../../../../src/tb/components/TbShortcuts.vue'
import { makeCalendar, makeTask } from './helpers.js'

import { subscribe, unsubscribe } from '@nextcloud/event-bus'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showInfo: vi.fn() }))

/**
 * A board with one row per entry, each row with the columns open, inProgress and waiting
 *
 * @param {Array<object>} rows Tasks per column, for each row
 * @return {string} The markup
 */
function boardMarkup(rows) {
	const column = (name, tasks = []) => `<ol class="tb-board__cards" data-column="${name}">`
		+ tasks.map(task => `<li class="tb-card" data-task-key="${task.key}" tabindex="0"></li>`).join('') + '</ol>'
	return '<div class="app-content">' + rows.map(row => '<div class="tb-board__lane"><div class="tb-board__columns">'
		+ ['open', 'inProgress', 'waiting'].map(name => column(name, row[name])).join('') + '</div></div>').join('') + '</div>'
}

describe('shortcuts on the board', () => {
	let wrapper
	let selected
	let router

	/**
	 * @param {object} calendar The list
	 * @param {Array<object>} rows Tasks per column, for each row
	 * @param {object} view The view settings
	 * @return {object} The mocked store
	 */
	function setup(calendar, rows, view = { mode: 'board', boardOrder: 'sort' }) {
		document.body.innerHTML = boardMarkup(rows)
		selected = []
		router = { push: vi.fn() }
		const store = {
			getters: { getSortedCalendars: [calendar], tbView: () => view, isTbSelected: key => selected.includes(key) },
			dispatch: vi.fn(() => Promise.resolve()),
			commit: vi.fn(),
		}
		wrapper = mount(TbShortcuts, {
			global: {
				mocks: { $store: store, $route: { params: { calendarId: calendar.id } }, $router: router },
				stubs: { NcDialog: true, TbWaitDialog: true },
			},
		})
		return store
	}

	const card = task => document.querySelector(`[data-task-key="${task.key}"]`)

	/**
	 * @param {object} task The task whose card gets the key
	 * @param {string} key The key
	 * @param {boolean} shiftKey With Shift
	 */
	function press(task, key, shiftKey = false) {
		card(task).focus()
		card(task).dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
	}

	afterEach(() => {
		wrapper.unmount()
		document.body.innerHTML = ''
	})

	it('focuses the next column that has cards, at the same height if possible', () => {
		const calendar = makeCalendar('cal')
		const [a, b, c] = ['a', 'b', 'c'].map(uid => makeTask(calendar, { uid }))
		setup(calendar, [{ open: [a, b], waiting: [c] }])
		press(b, 'l')
		expect(document.activeElement).toBe(card(c))
		press(c, 'ArrowLeft')
		expect(document.activeElement).toBe(card(a))
		press(a, 'h')
		expect(document.activeElement).toBe(card(a))
	})

	it('focuses the first and last card of the column and the neighbouring row', () => {
		const calendar = makeCalendar('cal')
		const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(uid => makeTask(calendar, { uid }))
		setup(calendar, [{ open: [a, b], waiting: [c] }, { waiting: [d] }])
		press(a, 'G', true)
		expect(document.activeElement).toBe(card(b))
		press(b, 'g')
		expect(document.activeElement).toBe(card(a))
		press(a, ']')
		expect(document.activeElement).toBe(card(d))
		press(d, '[')
		expect(document.activeElement).toBe(card(a))
	})

	it('moves the task one column and starts it', () => {
		const calendar = makeCalendar('cal')
		const task = makeTask(calendar, { uid: 'a' })
		const store = setup(calendar, [{ open: [task] }])
		press(task, 'L', true)
		expect(store.dispatch).toHaveBeenCalledWith('moveTaskToBoardColumn', { task, column: 'inProgress', waitUntil: null })
		store.dispatch.mockClear()
		press(task, 'H', true)
		expect(store.dispatch).not.toHaveBeenCalled()
		press(task, 's')
		expect(store.dispatch).toHaveBeenCalledWith('moveTaskToBoardColumn', { task, column: 'inProgress', waitUntil: null })
	})

	it('asks for the follow-up date before a task waits', () => {
		const calendar = makeCalendar('cal')
		const task = makeTask(calendar, { uid: 'a', status: 'IN-PROCESS' })
		const store = setup(calendar, [{ inProgress: [task] }])
		press(task, 'ArrowRight', true)
		expect(store.dispatch).not.toHaveBeenCalled()
		// The component keeps the task in its (reactive) data
		expect(wrapper.vm.pendingWait.task.key).toBe(task.key)
		const date = new Date(2030, 0, 1)
		wrapper.vm.confirmWait(date)
		const [action, move] = store.dispatch.mock.calls[0]
		expect(action).toBe('moveTaskToBoardColumn')
		expect(move.task.key).toBe(task.key)
		expect(move.column).toBe('waiting')
		expect(move.waitUntil).toBe(date)
		expect(wrapper.vm.pendingWait).toBe(null)
	})

	it('leaves a read-only task alone', () => {
		const calendar = makeCalendar('cal', { readOnly: true })
		const [a, b] = ['a', 'b'].map(uid => makeTask(calendar, { uid }))
		const store = setup(calendar, [{ open: [a, b] }], { mode: 'board', boardOrder: 'manual' })
		press(a, 'L', true)
		press(a, 's')
		press(a, 'J', true)
		expect(store.dispatch).not.toHaveBeenCalled()
	})

	it('reorders cards only with the manual order', () => {
		const calendar = makeCalendar('cal')
		const [a, b] = ['a', 'b'].map(uid => makeTask(calendar, { uid }))
		const sorted = setup(calendar, [{ open: [a, b] }])
		press(a, 'J', true)
		expect(sorted.dispatch).not.toHaveBeenCalled()
		wrapper.unmount()

		const manual = setup(calendar, [{ open: [a, b] }], { mode: 'board', boardOrder: 'manual' })
		press(a, 'ArrowDown', true)
		const orders = new Map([[a, a.sortOrder], [b, b.sortOrder]])
		for (const [action, change] of manual.dispatch.mock.calls) {
			expect(action).toBe('setSortOrder')
			orders.set(change.task, change.order)
		}
		expect(manual.dispatch).toHaveBeenCalled()
		expect(orders.get(a)).toBeGreaterThan(orders.get(b))
		manual.dispatch.mockClear()
		press(a, 'K', true)
		expect(manual.dispatch).not.toHaveBeenCalled()
	})

	it('switches the view with the number keys', () => {
		const calendar = makeCalendar('cal')
		const task = makeTask(calendar, { uid: 'a' })
		const store = setup(calendar, [{ open: [task] }])
		press(task, '3')
		expect(store.dispatch).toHaveBeenCalledWith('setTbView', { key: 'calendar:cal', patch: { mode: 'table' } })
	})

	it('asks before it deletes a task', async () => {
		const calendar = makeCalendar('cal')
		const task = makeTask(calendar, { uid: 'a' })
		const store = setup(calendar, [{ open: [task] }])
		press(task, 'Backspace')
		expect(store.dispatch).not.toHaveBeenCalled()
		expect(wrapper.vm.pendingDelete.task.key).toBe(task.key)
		wrapper.vm.cancelDelete()
		expect(store.dispatch).not.toHaveBeenCalled()
		press(task, 'Delete')
		await wrapper.vm.confirmDelete()
		const [action, data] = store.dispatch.mock.calls[0]
		expect(action).toBe('deleteTask')
		expect(data.task.key).toBe(task.key)
		expect(wrapper.vm.pendingDelete).toBe(null)
	})

	it('does not offer to delete or change a read-only task', () => {
		const calendar = makeCalendar('cal', { readOnly: true })
		const task = makeTask(calendar, { uid: 'a' })
		const store = setup(calendar, [{ open: [task] }])
		const requests = []
		const listener = request => requests.push(request)
		subscribe('tb:selection-menu', listener)
		press(task, 'Backspace')
		press(task, 'd')
		press(task, 'm')
		unsubscribe('tb:selection-menu', listener)
		expect(wrapper.vm.pendingDelete).toBe(null)
		expect(requests).toEqual([])
		expect(store.commit).not.toHaveBeenCalled()
	})

	it('opens the menus of the selection bar for the focused task', () => {
		const calendar = makeCalendar('cal')
		const [a, b] = ['a', 'b'].map(uid => makeTask(calendar, { uid }))
		const store = setup(calendar, [{ open: [a, b] }])
		const requests = []
		const listener = request => requests.push(request)
		subscribe('tb:selection-menu', listener)
		press(a, 'd')
		expect(store.commit).toHaveBeenCalledWith('setTbSelection', [a.key])
		// A task of the selection: the action is for all of them, the selection stays
		selected = [a.key, b.key]
		store.commit.mockClear()
		press(a, 'm')
		press(b, ';')
		unsubscribe('tb:selection-menu', listener)
		expect(store.commit).not.toHaveBeenCalled()
		expect(requests).toEqual([
			{ menu: 'due', key: a.key, release: true },
			{ menu: 'move', key: a.key, release: false },
			{ menu: 'bar', key: b.key, release: false },
		])
	})

	it('adds a task in the column of the focused card', () => {
		const calendar = makeCalendar('cal')
		const task = makeTask(calendar, { uid: 'a' })
		setup(calendar, [{ open: [task] }])
		const list = card(task).parentElement
		const section = document.createElement('section')
		section.className = 'tb-board__column'
		list.replaceWith(section)
		section.innerHTML = '<button class="tb-board__add-button"></button>'
		section.append(list)
		const click = vi.fn()
		section.querySelector('button').addEventListener('click', click)
		press(task, 'a')
		expect(click).toHaveBeenCalledTimes(1)
	})

	it('asks the board to widen the column and goes to Today and Week', () => {
		const calendar = makeCalendar('cal')
		const task = makeTask(calendar, { uid: 'a' })
		setup(calendar, [{ waiting: [task] }])
		card(task).parentElement.dataset.lane = 'all'
		const requests = []
		const listener = request => requests.push(request)
		subscribe('tb:zoom-column', listener)
		press(task, 'z')
		unsubscribe('tb:zoom-column', listener)
		expect(requests).toEqual([{ lane: 'all', column: 'waiting' }])
		press(task, 'T', true)
		press(task, 'W', true)
		expect(router.push.mock.calls.map(([to]) => to.params.collectionId)).toEqual(['today', 'week'])
	})
})
