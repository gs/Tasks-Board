import { SHORTCUTS, moveIndex, neighbourColumn, nextFilled, shortcutAction, shortcutsBlocked, startStopColumn, viewModeForKey } from '../../../../src/tb/shortcuts.js'

import { describe, expect, it } from 'vitest'

const key = (value, extra = {}) => ({ key: value, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra })

describe('shortcuts', () => {
	it('maps keys to actions', () => {
		expect(shortcutAction(key('n'))).toBe('newTask')
		expect(shortcutAction(key('j'))).toBe('next')
		expect(shortcutAction(key('ArrowUp'))).toBe('previous')
		expect(shortcutAction(key('b'))).toBe('board')
		expect(shortcutAction(key('?', { shiftKey: true }))).toBe('help')
		expect(shortcutAction(key('n', { ctrlKey: true }))).toBe(null)
		expect(shortcutAction(key('q'))).toBe(null)
	})

	it('Enter, Space and X only act on a focused task', () => {
		expect(shortcutAction(key('Enter'))).toBe(null)
		expect(shortcutAction(key(' '))).toBe(null)
		expect(shortcutAction(key('x'))).toBe(null)
		expect(shortcutAction(key('Enter'), { onTask: true })).toBe('open')
		expect(shortcutAction(key(' '), { onTask: true })).toBe('toggle')
		expect(shortcutAction(key('x'), { onTask: true })).toBe('select')
	})

	it('is off while typing or with an open menu', () => {
		document.body.innerHTML = '<input id="i"><div id="d" tabindex="0"></div>'
		const input = document.getElementById('i')
		const div = document.getElementById('d')
		expect(shortcutsBlocked({ ...key('n'), target: input })).toBe(true)
		expect(shortcutsBlocked({ ...key('n'), target: div })).toBe(false)
		expect(shortcutsBlocked({ ...key('n'), target: div, isComposing: true })).toBe(true)
		expect(shortcutsBlocked({ ...key('n'), target: div, repeat: true })).toBe(true)
		expect(shortcutsBlocked({ ...key('j'), target: div, repeat: true })).toBe(false)
		document.body.insertAdjacentHTML('beforeend', '<div class="modal-mask"></div>')
		expect(shortcutsBlocked({ ...key('n'), target: div })).toBe(true)
		document.body.innerHTML = ''
	})

	it('moves the focus within the list', () => {
		expect(moveIndex(-1, 3, 1)).toBe(0)
		expect(moveIndex(-1, 3, -1)).toBe(2)
		expect(moveIndex(1, 3, 1)).toBe(2)
		expect(moveIndex(2, 3, 1)).toBe(2)
		expect(moveIndex(0, 3, -1)).toBe(0)
		expect(moveIndex(0, 0, 1)).toBe(-1)
	})

	it('maps the navigation keys of the board', () => {
		expect(shortcutAction(key('h'))).toBe('columnLeft')
		expect(shortcutAction(key('ArrowRight'))).toBe('columnRight')
		expect(shortcutAction(key('g'))).toBe('first')
		expect(shortcutAction(key('G', { shiftKey: true }))).toBe('last')
		expect(shortcutAction(key('['))).toBe('previousLane')
		expect(shortcutAction(key(']'))).toBe('nextLane')
		expect(shortcutAction(key('3'))).toBe('view')
		expect(viewModeForKey('1')).toBe('list')
		expect(viewModeForKey('4')).toBe('timeline')
		expect(viewModeForKey('5')).toBe(null)
	})

	it('moves and reorders only a focused task', () => {
		const shift = { shiftKey: true }
		for (const [value, action] of [['H', 'moveLeft'], ['L', 'moveRight'], ['ArrowLeft', 'moveLeft'], ['ArrowRight', 'moveRight'],
			['J', 'reorderDown'], ['K', 'reorderUp'], ['ArrowDown', 'reorderDown'], ['ArrowUp', 'reorderUp']]) {
			expect(shortcutAction(key(value, shift))).toBe(null)
			expect(shortcutAction(key(value, shift), { onTask: true })).toBe(action)
		}
		expect(shortcutAction(key('s'))).toBe(null)
		expect(shortcutAction(key('s'), { onTask: true })).toBe('startStop')
	})

	it('does not repeat a move while the key is held down', () => {
		document.body.innerHTML = '<div id="d" tabindex="0"></div>'
		const div = document.getElementById('d')
		expect(shortcutsBlocked({ ...key('L', { shiftKey: true }), target: div, repeat: true })).toBe(true)
		expect(shortcutsBlocked({ ...key('s'), target: div, repeat: true })).toBe(true)
		expect(shortcutsBlocked({ ...key('l'), target: div, repeat: true })).toBe(false)
		document.body.innerHTML = ''
	})

	it('moves a task column by column, never into cancelled', () => {
		expect(neighbourColumn('open', 1)).toBe('inProgress')
		expect(neighbourColumn('inProgress', 1)).toBe('waiting')
		expect(neighbourColumn('waiting', 1)).toBe('done')
		expect(neighbourColumn('done', 1)).toBe(null)
		expect(neighbourColumn('open', -1)).toBe(null)
		expect(neighbourColumn('done', -1)).toBe('waiting')
		expect(neighbourColumn('cancelled', -1)).toBe('done')
		expect(neighbourColumn('cancelled', 1)).toBe(null)
	})

	it('starts an open task and puts a started one back', () => {
		expect(startStopColumn('open')).toBe('inProgress')
		expect(startStopColumn('inProgress')).toBe('open')
		expect(startStopColumn('waiting')).toBe(null)
		expect(startStopColumn('done')).toBe(null)
	})

	it('skips empty columns and rows', () => {
		expect(nextFilled([2, 0, 3], 0, 1)).toBe(2)
		expect(nextFilled([2, 0, 3], 2, -1)).toBe(0)
		expect(nextFilled([2, 0, 0], 0, 1)).toBe(-1)
		expect(nextFilled([0, 4], -1, 1)).toBe(1)
		expect(nextFilled([4, 0], -1, -1)).toBe(0)
		expect(nextFilled([], -1, 1)).toBe(-1)
	})

	it('maps the task actions', () => {
		for (const [value, action] of [['o', 'open'], ['m', 'moveList'], ['d', 'due'], [';', 'actions'], ['Backspace', 'delete'], ['Delete', 'delete']]) {
			expect(shortcutAction(key(value))).toBe(null)
			expect(shortcutAction(key(value), { onTask: true })).toBe(action)
		}
		expect(shortcutAction(key('e'))).toBe('rename')
		expect(shortcutAction(key('a'))).toBe('add')
		expect(shortcutAction(key('z'))).toBe('zoom')
		expect(shortcutAction(key('T', { shiftKey: true }))).toBe('today')
		expect(shortcutAction(key('W', { shiftKey: true }))).toBe('week')
		expect(shortcutAction(key('t'))).toBe(null)
		expect(shortcutAction(key('w'))).toBe(null)
	})

	it('lists every key once in the overview', () => {
		const keys = SHORTCUTS.flatMap(entry => entry.keys)
		expect(new Set(keys).size).toBe(keys.length)
		for (const expected of ['H', 'L', 'G', 'Shift+G', 'Shift+H', 'Shift+L', 'Shift+J', 'Shift+K', 'S', '[', ']', '1', '4']) {
			expect(keys).toContain(expected)
		}
	})
})
