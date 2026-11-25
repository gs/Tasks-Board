<!--
SPDX-FileCopyrightText: 2026 Sven Würth
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
A task in a dialog on the pages of the Calendar app (see calendar.js):
change, complete or delete a task of the calendar, or add a new one,
without leaving the calendar.
-->
<template>
	<NcDialog :name="taskUri ? tbt('Task') : tbt('Add a task')"
		:open="true"
		size="normal"
		:buttons="buttons"
		class="tb-calendar-task"
		@update:open="onOpen">
		<div v-if="loading" class="tb-calendar-task__state">
			<NcLoadingIcon :size="40" />
		</div>
		<p v-else-if="failed" class="tb-calendar-task__state">
			{{ failed }}
		</p>
		<form v-else
			class="tb-calendar-task__form"
			@submit.prevent="save"
			@keydown.esc="onEscape">
			<NcTextField ref="summary"
				v-model="summary"
				:label="tbt('Task')"
				:disabled="readOnly || busy" />
			<p v-if="task" class="tb-calendar-task__list">
				<span class="tb-calendar-task__bullet" :style="{ 'background-color': task.calendar.color }" />
				{{ task.calendar.displayName }}
				<span v-if="readOnly">· {{ tbt('Read-only') }}</span>
			</p>
			<CalendarPickerItem v-else
				:disabled="busy"
				:calendar="calendar"
				:calendars="writableCalendars"
				@change-calendar="calendar = $event" />
			<div class="tb-calendar-task__status" role="group" :aria-label="tbt('Status')">
				<NcButton v-for="option in statusOptions"
					:key="option.id"
					:variant="status === option.id ? 'primary' : 'secondary'"
					:pressed="status === option.id"
					:disabled="readOnly || busy || option.fixed"
					@click="status = option.id">
					{{ option.label }}
				</NcButton>
			</div>
			<div class="tb-calendar-task__due">
				<NcDateTimePickerNative id="tb-calendar-task-due"
					v-model="due"
					type="date"
					:label="tbt('Due')"
					:disabled="readOnly || busy" />
				<NcButton v-if="due && !readOnly"
					variant="tertiary"
					:disabled="busy"
					@click="due = null">
					{{ tbt('No due date') }}
				</NcButton>
			</div>
			<label class="tb-calendar-task__label" for="tb-calendar-task-note">{{ tbt('Notes') }}</label>
			<!-- A note with text is shown rendered, links can be opened; a click elsewhere edits it -->
			<!-- eslint-disable vue/no-v-html -- sanitized by DOMPurify in renderNoteView() -->
			<div v-if="showNoteView"
				class="tb-calendar-task__note-view tb-note"
				:class="{ 'tb-calendar-task__note-view--editable': !readOnly && !busy }"
				:title="readOnly ? '' : tbt('Click to edit')"
				@click="onNoteViewClick"
				v-html="noteHtml" />
			<!-- eslint-enable vue/no-v-html -->
			<textarea v-else
				id="tb-calendar-task-note"
				ref="note"
				v-model="note"
				class="tb-calendar-task__note"
				rows="5"
				:disabled="readOnly || busy" />
		</form>
	</NcDialog>
</template>

<script>
import CalendarPickerItem from '../../components/AppSidebar/CalendarPickerItem.vue'
import client from '../../services/cdav.js'
import { boardColumn } from '../board.js'
import { keepTimeOfDay, sameDay, taskUrlFromCalendar } from '../calendar.js'
import { tbt } from '../l10n.js'
import { renderNoteView } from '../markdown.js'
import '../note.scss'
import { isTaskReadOnly } from '../store/board.js'

import { showError } from '@nextcloud/dialogs'
import moment from '@nextcloud/moment'
import { generateUrl } from '@nextcloud/router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDateTimePickerNative from '@nextcloud/vue/components/NcDateTimePickerNative'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcTextField from '@nextcloud/vue/components/NcTextField'

/** The states that can be chosen here ("Waiting" needs its follow-up date, that is done in Tasks Board) */
const CHOICES = ['open', 'inProgress', 'done']

export default {
	name: 'TbCalendarTaskDialog',
	components: {
		CalendarPickerItem,
		NcButton,
		NcDateTimePickerNative,
		NcDialog,
		NcLoadingIcon,
		NcTextField,
	},
	props: {
		/** The list of the task (its URI), empty for a new task */
		calendarId: {
			type: String,
			default: null,
		},
		/** The file name of the task, empty for a new task */
		taskUri: {
			type: String,
			default: null,
		},
		/** The due date of a new task */
		day: {
			type: Date,
			default: null,
		},
	},
	emits: ['close'],
	data() {
		return {
			loading: true,
			failed: null,
			busy: false,
			confirmDelete: false,
			done: false,
			task: null,
			calendar: null,
			summary: '',
			note: '',
			noteEditing: false,
			status: 'open',
			due: this.day,
		}
	},
	computed: {
		writableCalendars() {
			return this.$store.getters.getSortedWritableCalendars
		},
		/** The note is shown rendered until it is edited (an empty note is edited right away) */
		showNoteView() {
			return !this.noteEditing && !!this.note.trim()
		},
		noteHtml() {
			return renderNoteView(this.note, { disableCheckboxes: true })
		},
		readOnly() {
			return !!this.task && isTaskReadOnly(this.task)
		},
		/** The column the task is in now, so only a change is saved */
		column() {
			return this.task ? boardColumn(this.task) : 'open'
		},
		statusOptions() {
			const labels = { open: tbt('Open'), inProgress: tbt('In progress'), waiting: tbt('Waiting'), done: tbt('Done'), cancelled: tbt('Cancelled') }
			const options = CHOICES.map(id => ({ id, label: labels[id] }))
			if (!CHOICES.includes(this.column)) {
				options.push({ id: this.column, label: labels[this.column], fixed: true })
			}
			return options
		},
		/** The dialog closes itself once a change is saved: the buttons must not close it before (return false) */
		buttons() {
			const stay = action => () => {
				action()
				return false
			}
			if (this.loading || this.failed) {
				return [{ label: tbt('Close'), callback: () => this.finish(false) }]
			}
			const buttons = []
			if (this.task && !this.readOnly) {
				buttons.push({
					label: this.confirmDelete ? tbt('Really delete?') : tbt('Delete'),
					variant: 'error',
					disabled: this.busy,
					callback: stay(() => this.remove()),
				})
			}
			if (this.task) {
				buttons.push({ label: tbt('Open in Tasks Board'), disabled: this.busy, callback: stay(() => this.openInTasksBoard()) })
			}
			if (!this.readOnly) {
				buttons.push({
					label: this.task ? tbt('Save') : tbt('Add a task'),
					variant: 'primary',
					disabled: this.busy || !this.summary.trim() || (!this.task && !this.calendar),
					callback: stay(() => this.save()),
				})
			}
			return buttons
		},
	},
	async mounted() {
		try {
			await client.connect({ enableCalDAV: true })
			await this.$store.dispatch('fetchCurrentUserPrincipal')
			await this.$store.dispatch('getCalendarsAndTrashBin')
			if (this.taskUri) {
				await this.loadTask()
			} else {
				this.calendar = this.writableCalendars[0] || null
			}
		} catch (error) {
			console.error(error)
			this.failed = tbt('Could not load the task.')
		}
		this.loading = false
		await this.$nextTick()
		this.$refs.summary?.focus?.()
	},
	methods: {
		tbt,
		/**
		 * A click on a link opens it (new tab), a click elsewhere edits the note
		 *
		 * @param {MouseEvent} $event The click
		 */
		async onNoteViewClick($event) {
			if ($event.target.closest?.('a') || this.readOnly || this.busy) {
				return
			}
			this.noteEditing = true
			await this.$nextTick()
			this.$refs.note?.focus?.()
		},
		async loadTask() {
			const calendar = this.$store.getters.getCalendarById(this.calendarId)
			const task = calendar && await this.$store.dispatch('getTaskByUri', { calendar, taskUri: this.taskUri })
			if (!task) {
				this.failed = tbt('Could not load the task.')
				return
			}
			this.task = task
			this.summary = task.summary || ''
			this.note = task.note || ''
			this.status = this.column
			this.due = task.dueMoment.isValid() ? task.dueMoment.toDate() : null
		},
		/** @return {Date|null} The due date of the task as it is stored */
		storedDue() {
			return this.task?.dueMoment.isValid() ? this.task.dueMoment.toDate() : null
		},
		async save() {
			if (this.busy || this.readOnly || !this.summary.trim()) {
				return
			}
			this.busy = true
			try {
				if (this.task) {
					await this.saveTask()
				} else {
					await this.createTask()
				}
				this.finish(true)
			} catch (error) {
				console.error(error)
				showError(tbt('Could not change the task.'))
				this.busy = false
			}
		},
		async saveTask() {
			const task = this.task
			const summary = this.summary.trim()
			let changed = false
			if (summary !== task.summary) {
				this.$store.commit('setSummary', { task, summary })
				changed = true
			}
			if (this.note !== (task.note || '')) {
				this.$store.commit('setNote', { task, note: this.note })
				changed = true
			}
			const stored = this.storedDue()
			if (!sameDay(this.due, stored)) {
				// Only the day changes: a task with a time keeps it
				const timed = stored && !task.allDay
				const due = this.due ? moment(keepTimeOfDay(this.due, timed ? stored : null)) : null
				this.$store.commit('setDue', { task, due, allDay: this.due ? !timed : task.allDay })
				changed = true
			}
			if (changed) {
				await this.$store.dispatch('updateTask', task)
			}
			if (this.status !== this.column) {
				await this.$store.dispatch('moveTaskToBoardColumn', { task, column: this.status })
			}
		},
		async createTask() {
			const created = await this.$store.dispatch('createTask', {
				summary: this.summary.trim(),
				note: this.note,
				calendar: this.calendar,
				...(this.due && { due: moment(this.due).startOf('day').format('YYYY-MM-DDTHH:mm:ss'), allDay: true }),
			})
			// createTask returns the plain object, changes must go through the store's (reactive) copy
			const task = created && (this.$store.getters.getTaskByUid(created.uid) || created)
			if (task && this.status !== 'open') {
				await this.$store.dispatch('moveTaskToBoardColumn', { task, column: this.status })
			}
		},
		async remove() {
			if (!this.confirmDelete) {
				this.confirmDelete = true
				return
			}
			this.busy = true
			try {
				await this.$store.dispatch('deleteTask', { task: this.task, dav: true })
				this.finish(true)
			} catch (error) {
				console.error(error)
				showError(tbt('Could not delete the task.'))
				this.busy = false
			}
		},
		openInTasksBoard() {
			window.location.href = generateUrl(taskUrlFromCalendar({ calendarId: this.calendarId, taskId: this.taskUri }))
		},
		finish(changed) {
			if (this.done) {
				return
			}
			this.done = true
			this.$emit('close', changed)
		},
		/**
		 * Esc in a field does not reach the dialog, so it is closed here (an open list of the picker closes first)
		 *
		 * @param {KeyboardEvent} event The event
		 */
		onEscape(event) {
			if (this.busy || event.target.closest('.vs--open')) {
				return
			}
			event.stopPropagation()
			this.finish(false)
		},
		onOpen(open) {
			if (!open && !this.busy) {
				this.finish(false)
			}
		},
	},
}
</script>

<style lang="scss">
// The button of calendar.js sits outside of this component, on the page of the Calendar app
.tb-calendar-add {
	position: fixed;
	inset-inline-end: 20px;
	bottom: 20px;
	z-index: 1500;
	min-height: var(--default-clickable-area, 34px);
	padding: 0 16px;
	border: none;
	border-radius: var(--border-radius-element, 8px);
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text);
	font-weight: 600;
	cursor: pointer;
	box-shadow: 0 2px 8px rgba(0, 0, 0, .2);

	&:hover,
	&:focus-visible {
		background-color: var(--color-primary-element-hover);
	}
}

.tb-calendar-task {
	&__state {
		display: flex;
		justify-content: center;
		padding: 24px 0;
		color: var(--color-text-maxcontrast);
	}

	&__form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 6px;
	}

	&__list {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		color: var(--color-text-maxcontrast);
	}

	&__bullet {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	&__status,
	&__due {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 6px;
	}

	&__label {
		margin-bottom: -8px;
		color: var(--color-text-maxcontrast);
		font-size: 13px;
	}

	&__note {
		width: 100%;
		resize: vertical;
	}

	&__note-view {
		min-height: 2.5em;
		max-height: 40vh;
		overflow: auto;
		padding: 6px 10px;
		border: 2px solid var(--color-border-maxcontrast);
		border-radius: var(--border-radius-large);

		&--editable {
			cursor: text;
		}

		p:last-child {
			margin-bottom: 0;
		}
	}
}
</style>
