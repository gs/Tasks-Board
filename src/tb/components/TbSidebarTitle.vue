<!--
SPDX-FileCopyrightText: 2026 Sven Würth
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Title in the sidebar header: the whole title over several lines. A click
edits it right there, with the caret where it was clicked (links stay links).
-->
<template>
	<div class="tb-sidebar-title">
		<TbTitleField v-if="editing"
			:value="task.summary"
			:selection="selection"
			@save="save"
			@cancel="editing = false" />
		<h2 v-else
			ref="text"
			class="tb-sidebar-title__text"
			:class="{ 'tb-sidebar-title__text--editable': !readOnly }"
			:title="readOnly ? null : tbt('Click to change the title')"
			@click="onClick">
			<span v-linkify="{ text: task.summary, linkify: true }" />
		</h2>
	</div>
</template>

<script>
import { tbt } from '../l10n.js'
import { offsetAtPoint } from '../title.js'
import TbTitleField from './TbTitleField.vue'

import { showError } from '@nextcloud/dialogs'
import Linkify from '@nextcloud/vue/directives/Linkify'

export default {
	name: 'TbSidebarTitle',
	components: {
		TbTitleField,
	},
	directives: {
		Linkify,
	},
	props: {
		task: {
			type: Object,
			required: true,
		},
		readOnly: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			editing: false,
			selection: null,
		}
	},
	watch: {
		'task.key'() {
			this.editing = false
		},
	},
	methods: {
		tbt,
		onClick(event) {
			if (this.readOnly || event.target.closest('a')) {
				return
			}
			const offset = offsetAtPoint(this.$refs.text, event.clientX, event.clientY)
			this.start(offset === null ? null : [offset, offset])
		},
		/**
		 * Starts editing
		 *
		 * @param {Array|null} selection [start, end] in the title, null: caret at the end
		 */
		start(selection) {
			if (this.readOnly) {
				return
			}
			this.selection = selection
			this.editing = true
		},
		async save(summary) {
			this.editing = false
			try {
				await this.$store.dispatch('setSummary', { task: this.task, summary })
			} catch (error) {
				console.error(error)
				showError(tbt('Could not change the task.'))
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.tb-sidebar-title {
	order: -1;
	flex: 1 1 auto;
	min-width: 0;
	// The field takes over the font (inherit)
	font-size: 18px;
	font-weight: 600;
	line-height: 1.35;

	&__text {
		margin: 0;
		padding: 2px 6px;
		border: 2px solid transparent;
		border-radius: var(--border-radius-element, 8px);
		font: inherit;
		overflow-wrap: anywhere;
		white-space: normal;

		&--editable {
			cursor: text;

			&:hover {
				background-color: var(--color-background-hover);
			}
		}
	}
}
</style>
