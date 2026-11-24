<!--
SPDX-FileCopyrightText: 2026 Sven Würth
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Keyboard shortcuts for lists and boards, "?" shows the overview.
-->
<template>
	<NcDialog v-if="helpOpen"
		:name="tbt('Keyboard shortcuts')"
		:open="true"
		size="small"
		class="tb-shortcuts"
		@update:open="helpOpen = $event">
		<table class="tb-shortcuts__table">
			<tbody>
				<tr v-for="entry in shortcuts" :key="entry.label">
					<td class="tb-shortcuts__keys">
						<template v-for="(key, index) in entry.keys" :key="key">
							<span v-if="index" class="tb-shortcuts__or">{{ tbt('or') }}</span>
							<kbd>{{ keyLabel(key) }}</kbd>
						</template>
					</td>
					<td>{{ tbt(entry.label) }}</td>
				</tr>
			</tbody>
		</table>
		<p class="tb-shortcuts__hint">
			{{ tbt('Shortcuts do not apply while you type in a field or a menu is open.') }}
		</p>
	</NcDialog>
	<NcDialog v-if="pendingDelete"
		:name="tbt('Delete the task')"
		:open="true"
		size="small"
		:buttons="deleteButtons"
		@update:open="cancelDelete">
		<p class="tb-shortcuts__task">
			{{ pendingDelete.task.summary }}
		</p>
		<p v-if="pendingDelete.subtasks" class="tb-shortcuts__hint">
			{{ tbt('Its subtasks ({count}) are deleted as well.', { count: pendingDelete.subtasks }) }}
		</p>
	</NcDialog>
	<TbWaitDialog v-if="pendingWait"
		:task="pendingWait.task"
		@confirm="confirmWait"
		@cancel="cancelWait" />
</template>

<script>
import { MANUAL_COLUMNS, boardColumn, manualOrderChanges, viewKeyForRoute } from '../board.js'
import { tbt } from '../l10n.js'
import {
	moveIndex,
	neighbourColumn,
	nextFilled,
	nextViewMode,
	shortcutAction,
	shortcutsBlocked,
	startStopColumn,
	viewModeForKey,
	SHORTCUTS,
	TASK_SELECTOR,
} from '../shortcuts.js'
import { isTaskReadOnly } from '../store/board.js'
import TbWaitDialog from './TbWaitDialog.vue'

import { showError, showInfo } from '@nextcloud/dialogs'
import { emit, subscribe, unsubscribe } from '@nextcloud/event-bus'
import NcDialog from '@nextcloud/vue/components/NcDialog'

const CARD_SELECTOR = '.tb-card[data-task-key]'

export default {
	name: 'TbShortcuts',
	components: {
		NcDialog,
		TbWaitDialog,
	},
	data() {
		return {
			pendingWait: null,
			pendingDelete: null,
			helpOpen: false,
			shortcuts: SHORTCUTS,
		}
	},
	computed: {
		deleteButtons() {
			return [
				{ label: tbt('Cancel'), callback: () => this.cancelDelete() },
				{ label: tbt('Delete'), variant: 'error', callback: () => this.confirmDelete() },
			]
		},
	},
	mounted() {
		window.addEventListener('keydown', this.onKeydown)
		subscribe('tasks_board:show-shortcuts', this.showHelp)
		subscribe('tb:focus-task', this.onFocusRequest)
	},
	beforeUnmount() {
		window.removeEventListener('keydown', this.onKeydown)
		unsubscribe('tasks_board:show-shortcuts', this.showHelp)
		unsubscribe('tb:focus-task', this.onFocusRequest)
	},
	methods: {
		tbt,
		keyLabel(key) {
			return { Space: tbt('Space'), Enter: tbt('Enter') }[key] || key
		},
		showHelp() {
			this.helpOpen = true
		},
		/** Task rows and cards that are visible, in page order */
		items() {
			return [...document.querySelectorAll('.app-content ' + TASK_SELECTOR.split(', ').join(', .app-content '))]
				.filter(element => element.offsetParent !== null || element.tagName === 'TR')
		},
		findTask(key) {
			for (const calendar of this.$store.getters.getSortedCalendars) {
				for (const task of Object.values(calendar.tasks)) {
					if (task.key === key) {
						return task
					}
				}
			}
			return null
		},
		focusItem(element) {
			if (!element) {
				return
			}
			if (!element.hasAttribute('tabindex')) {
				element.setAttribute('tabindex', '-1')
			}
			element.focus()
			element.scrollIntoView({ block: 'nearest' })
		},
		/**
		 * Focuses the task again after the list was updated (or the one at its place)
		 *
		 * @param {string} key Key of the task
		 * @param {number} index Its position before
		 */
		refocus(key, index) {
			setTimeout(() => {
				const items = this.items()
				const same = items.find(element => element.dataset.taskKey === key)
				this.focusItem(same || items[Math.min(index, items.length - 1)])
			}, 150)
		},
		/**
		 * The cards of a board column, without the subtasks shown inside them
		 *
		 * @param {Element} list The column's list
		 * @return {Element[]}
		 */
		cards(list) {
			return [...list.children].filter(element => element.matches(CARD_SELECTOR))
		},
		/**
		 * Focuses a card in the neighbouring column of the same row, at the same height if possible
		 *
		 * @param {Element|null} item The current card
		 * @param {number} step +1 (right) or -1 (left)
		 * @return {boolean} Whether this is a board
		 */
		focusColumn(item, step) {
			const list = item?.closest('.tb-board__cards')
			if (!list) {
				const first = document.querySelector('.app-content ' + CARD_SELECTOR)
				this.focusItem(first)
				return !!first
			}
			const lists = [...list.closest('.tb-board__columns').querySelectorAll('.tb-board__cards')]
			const target = lists[nextFilled(lists.map(other => this.cards(other).length), lists.indexOf(list), step)]
			if (target) {
				const cards = this.cards(target)
				this.focusItem(cards[Math.min(this.cards(list).indexOf(item), cards.length - 1)])
			}
			return true
		},
		/**
		 * Focuses the first card of the previous or next board row
		 *
		 * @param {Element|null} item The current card
		 * @param {number} step +1 (down) or -1 (up)
		 * @return {boolean} Whether this is a board
		 */
		focusLane(item, step) {
			const lanes = [...document.querySelectorAll('.app-content .tb-board__lane')]
			if (!lanes.length) {
				return false
			}
			const firstCards = lanes.map(lane => lane.querySelector(CARD_SELECTOR))
			const current = item ? lanes.indexOf(item.closest('.tb-board__lane')) : -1
			this.focusItem(firstCards[nextFilled(firstCards.map(card => card ? 1 : 0), current, step)])
			return true
		},
		/**
		 * Moves the focused task to another board column (status), asking for the follow-up date first if it waits
		 *
		 * @param {Element} item The focused row or card
		 * @param {Function} target Returns the target column for the current one
		 */
		moveTask(item, target) {
			const task = this.findTask(item.dataset.taskKey)
			if (!task || isTaskReadOnly(task)) {
				return
			}
			const column = target(boardColumn(task))
			if (!column) {
				return
			}
			const index = this.items().indexOf(item)
			if (column === 'waiting') {
				this.pendingWait = { task, index }
				return
			}
			this.moveTo(task, column, index)
		},
		async moveTo(task, column, index, waitUntil = null) {
			try {
				await this.$store.dispatch('moveTaskToBoardColumn', { task, column, waitUntil })
			} catch (error) {
				console.error(error)
				showError(tbt('Could not move the task.'))
			}
			this.refocus(task.key, index)
		},
		confirmWait(date) {
			const { task, index } = this.pendingWait
			this.pendingWait = null
			this.moveTo(task, 'waiting', index, date)
		},
		cancelWait() {
			const { task, index } = this.pendingWait
			this.pendingWait = null
			this.refocus(task.key, index)
		},
		/**
		 * Moves the focused card up or down in its column (manual board order only)
		 *
		 * @param {Element} item The focused card
		 * @param {number} step +1 (down) or -1 (up)
		 */
		reorder(item, step) {
			const list = item.closest('.tb-board__cards')
			if (!list) {
				return
			}
			const viewKey = viewKeyForRoute(this.$route)
			const manual = !!viewKey && this.$store.getters.tbView(viewKey).boardOrder === 'manual'
			if (!manual || !MANUAL_COLUMNS.includes(list.dataset.column)) {
				showInfo(tbt('Cards can only be moved up or down here with the manual order of the board.'))
				return
			}
			const tasks = this.cards(list).map(card => this.findTask(card.dataset.taskKey)).filter(Boolean)
			const task = tasks.find(other => other.key === item.dataset.taskKey)
			const index = tasks.indexOf(task) + step
			if (!task || isTaskReadOnly(task) || index < 0 || index >= tasks.length) {
				return
			}
			for (const change of manualOrderChanges(tasks, task, index)) {
				if (!isTaskReadOnly(change.task)) {
					this.$store.dispatch('setSortOrder', change)
				}
			}
			this.refocus(task.key, this.items().indexOf(item) + step)
		},
		onFocusRequest(key) {
			this.refocus(key, 0)
		},
		/**
		 * Opens a menu of the selection bar for the focused task, or for the selection it belongs to
		 *
		 * @param {Element} item The focused row or card
		 * @param {string} menu due, move or bar (the bar itself)
		 */
		selectionMenu(item, menu) {
			const key = item.dataset.taskKey
			const task = this.findTask(key)
			if (!task || isTaskReadOnly(task)) {
				return
			}
			// A task selected just for this is released again afterwards
			const own = !this.$store.getters.isTbSelected(key)
			if (own) {
				this.$store.commit('setTbSelection', [key])
			}
			emit('tb:selection-menu', { menu, key, release: own && menu !== 'bar' })
		},
		/**
		 * Starts a new task in the column of the focused card, otherwise in the input of the header
		 *
		 * @param {Element|null} item The current row or card
		 * @return {boolean} Whether there is a place to add a task
		 */
		addHere(item) {
			const target = item?.closest('.tb-board__column')?.querySelector('.tb-board__add-button')
				|| document.querySelector('.header__input input')
			if (target?.matches('input')) {
				target.focus()
			} else {
				target?.click()
			}
			return !!target
		},
		askDelete(item) {
			const task = this.findTask(item.dataset.taskKey)
			if (!task || isTaskReadOnly(task)) {
				return
			}
			this.pendingDelete = { task, index: this.items().indexOf(item), subtasks: Object.keys(task.subTasks || {}).length }
		},
		async confirmDelete() {
			const { task, index } = this.pendingDelete
			this.pendingDelete = null
			try {
				await this.$store.dispatch('deleteTask', { task, dav: true })
			} catch (error) {
				console.error(error)
				showError(tbt('Could not delete the task.'))
			}
			this.refocus(task.key, index)
		},
		cancelDelete() {
			if (!this.pendingDelete) {
				return
			}
			const { task, index } = this.pendingDelete
			this.pendingDelete = null
			this.refocus(task.key, index)
		},
		onKeydown(event) {
			if (this.helpOpen || this.pendingWait || this.pendingDelete || shortcutsBlocked(event)) {
				return
			}
			const item = event.target?.closest?.(TASK_SELECTOR) || null
			const onTask = !!item && event.target === item
			const action = shortcutAction(event, { onTask })
			if (!action) {
				return
			}
			// Arrow keys only move between tasks when no other element has the focus
			const free = onTask || event.target === document.body || event.target === document.documentElement
			if (event.key.startsWith('Arrow') && !free) {
				return
			}
			// The focused task, otherwise the open one
			const currentItem = () => item && onTask
				? item
				: this.items().find(element => element.matches('.task-item__body--active, .tb-card--active, .tb-table__row--active')) || null
			switch (action) {
			case 'columnLeft':
			case 'columnRight':
				if (this.focusColumn(currentItem(), action === 'columnRight' ? 1 : -1)) {
					event.preventDefault()
				}
				break
			case 'previousLane':
			case 'nextLane':
				if (this.focusLane(currentItem(), action === 'nextLane' ? 1 : -1)) {
					event.preventDefault()
				}
				break
			case 'first':
			case 'last': {
				// On a board within the column, otherwise in the whole list
				const list = currentItem()?.closest('.tb-board__cards')
				const items = list ? this.cards(list) : this.items()
				if (items.length) {
					event.preventDefault()
					this.focusItem(items[action === 'first' ? 0 : items.length - 1])
				}
				break
			}
			case 'moveLeft':
			case 'moveRight':
				event.preventDefault()
				this.moveTask(item, column => neighbourColumn(column, action === 'moveRight' ? 1 : -1))
				break
			case 'startStop':
				event.preventDefault()
				this.moveTask(item, startStopColumn)
				break
			case 'reorderUp':
			case 'reorderDown':
				event.preventDefault()
				this.reorder(item, action === 'reorderDown' ? 1 : -1)
				break
			case 'add':
				if (this.addHere(currentItem())) {
					event.preventDefault()
				}
				break
			case 'due':
				event.preventDefault()
				this.selectionMenu(item, 'due')
				break
			case 'moveList':
				event.preventDefault()
				this.selectionMenu(item, 'move')
				break
			case 'actions':
				event.preventDefault()
				this.selectionMenu(item, 'bar')
				break
			case 'delete':
				event.preventDefault()
				this.askDelete(item)
				break
			case 'zoom': {
				// The board decides: it restores a widened column, otherwise widens this one
				const list = currentItem()?.closest('.tb-board__cards')
				emit('tb:zoom-column', list ? { lane: list.dataset.lane, column: list.dataset.column } : null)
				break
			}
			case 'today':
			case 'week':
				event.preventDefault()
				this.$router.push({ name: 'collections', params: { collectionId: action } })
				break
			case 'view': {
				const key = viewKeyForRoute(this.$route)
				if (key) {
					event.preventDefault()
					this.$store.dispatch('setTbView', { key, patch: { mode: viewModeForKey(event.key) } })
				}
				break
			}
			case 'newTask': {
				const input = document.querySelector('.header__input input')
				if (input) {
					event.preventDefault()
					input.focus()
				}
				break
			}
			case 'next':
			case 'previous': {
				const items = this.items()
				if (!items.length) {
					return
				}
				const current = currentItem()
				const index = moveIndex(current ? items.indexOf(current) : -1, items.length, action === 'next' ? 1 : -1)
				event.preventDefault()
				this.focusItem(items[index])
				break
			}
			case 'open':
				// Board cards open themselves on Enter
				if (event.key !== 'Enter' || !item.classList.contains('tb-card')) {
					event.preventDefault()
					item.click()
				}
				break
			case 'toggle': {
				event.preventDefault()
				const task = this.findTask(item.dataset.taskKey)
				if (task && !isTaskReadOnly(task)) {
					const index = this.items().indexOf(item)
					this.$store.dispatch('toggleCompleted', task)
					this.refocus(task.key, index)
				}
				break
			}
			case 'select':
				event.preventDefault()
				this.$store.commit('toggleTbSelected', item.dataset.taskKey)
				break
			case 'rename': {
				// The focused row, otherwise the open task: in its row if shown, else in the sidebar
				const key = item?.dataset.taskKey || this.$store.getters.getTaskByUri(this.$route.params.taskId)?.key
				if (!key) {
					break
				}
				event.preventDefault()
				const request = { key, handled: false }
				emit('tb:rename-task', request)
				if (!request.handled && this.$route.params.taskId) {
					emit('tasks:edit-appsidebar-summary', true)
				}
				break
			}
			case 'board': {
				const key = viewKeyForRoute(this.$route)
				if (key) {
					event.preventDefault()
					const mode = nextViewMode(this.$store.getters.tbView(key).mode)
					this.$store.dispatch('setTbView', { key, patch: { mode } })
				}
				break
			}
			case 'help':
				event.preventDefault()
				this.helpOpen = true
				break
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.tb-shortcuts {
	&__table {
		width: 100%;
		border-collapse: collapse;

		td {
			padding: 6px 4px;
			border-bottom: 1px solid var(--color-border);
			vertical-align: middle;
		}

		tr:last-child td {
			border-bottom: none;
		}
	}

	&__keys {
		width: 1%;
		white-space: nowrap;
		padding-inline-end: 16px !important;
	}

	&__or {
		margin: 0 4px;
		color: var(--color-text-maxcontrast);
		font-size: 12px;
	}

	kbd {
		display: inline-block;
		min-width: 24px;
		padding: 2px 6px;
		border: 1px solid var(--color-border-dark);
		border-bottom-width: 2px;
		border-radius: 6px;
		background: var(--color-background-hover);
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		text-align: center;
	}

	&__task {
		font-weight: 600;
	}

	&__hint {
		margin-top: calc(2 * var(--default-grid-baseline));
		color: var(--color-text-maxcontrast);
		font-size: 13px;
	}
}
</style>
