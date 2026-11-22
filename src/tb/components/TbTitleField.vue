<!--
SPDX-FileCopyrightText: 2026 Sven Würth
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Field to change a task title where it is shown (sidebar, list row, table).
Grows with the text, starts with the caret or selection given. Enter saves,
Esc cancels, leaving the field saves. Line breaks become spaces; an empty
title is not saved.
-->
<template>
	<textarea ref="field"
		v-model="text"
		class="tb-title-field no-nav"
		rows="1"
		:aria-label="tbt('Title')"
		@input="resize"
		@keydown="onKeydown"
		@blur="finish(true)"
		@click.stop
		@dblclick.stop
		@pointerdown.stop
		@mousedown.stop />
</template>

<script>
import { tbt } from '../l10n.js'
import { cleanTitle } from '../title.js'

export default {
	name: 'TbTitleField',
	props: {
		value: {
			type: String,
			required: true,
		},
		/** [start, end] in the text; null puts the caret at the end */
		selection: {
			type: Array,
			default: null,
		},
	},
	emits: ['save', 'cancel'],
	data() {
		return {
			text: this.value,
			done: false,
		}
	},
	mounted() {
		const field = this.$refs.field
		this.resize()
		field.focus({ preventScroll: true })
		const length = this.text.length
		const [start, end] = this.selection
			? this.selection.map(value => Math.min(Math.max(value, 0), length))
			: [length, length]
		field.setSelectionRange(start, end)
	},
	methods: {
		tbt,
		resize() {
			const field = this.$refs.field
			if (!field) {
				return
			}
			field.style.height = 'auto'
			field.style.height = field.scrollHeight + 'px'
		},
		onKeydown(event) {
			// Keys belong to the field (no shortcuts, Esc does not close the sidebar)
			event.stopPropagation()
			if (event.isComposing) {
				return
			}
			if (event.key === 'Enter') {
				event.preventDefault()
				this.finish(true)
			} else if (event.key === 'Escape') {
				event.preventDefault()
				this.finish(false)
			}
		},
		/**
		 * @param {boolean} save Save the text (Enter, leaving) or drop it (Esc)
		 */
		finish(save) {
			if (this.done) {
				return
			}
			this.done = true
			const text = cleanTitle(this.text)
			if (save && text && text !== this.value) {
				this.$emit('save', text)
			} else {
				this.$emit('cancel')
			}
		},
	},
}
</script>

<style lang="scss" scoped>
// Twice: the textarea rules of the server are more specific
.tb-title-field.tb-title-field {
	display: block;
	width: 100%;
	min-height: 0;
	margin: 0;
	padding: 2px 6px;
	overflow: hidden;
	resize: none;
	border: 2px solid var(--color-primary-element);
	border-radius: var(--border-radius-element, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font: inherit;
	line-height: inherit;
	box-shadow: none;
	cursor: text;
}
</style>
