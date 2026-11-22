<!--
SPDX-FileCopyrightText: 2026 Sven Würth
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Chain icon on a task that waits for open predecessors (list, table, board).
Red when the dates do not fit a dependency. The status does not change.
-->
<template>
	<span v-if="shown"
		class="tb-dep-badge"
		:class="{ 'tb-dep-badge--conflict': conflicts.length > 0 }"
		role="img"
		:aria-label="title"
		:title="title">
		<LinkVariant :size="16" />
	</span>
</template>

<script>
import { linkConflict, linkTypeLabel } from '../dependencies.js'
import { tbt } from '../l10n.js'

import LinkVariant from 'vue-material-design-icons/LinkVariant.vue'

export default {
	name: 'TbDependencyBadge',
	components: {
		LinkVariant,
	},
	props: {
		task: {
			type: Object,
			required: true,
		},
	},
	computed: {
		predecessors() {
			return this.$store.getters.tbPredecessors(this.task)
		},
		open() {
			return this.predecessors.filter(link => !link.task.closed)
		},
		conflicts() {
			return this.predecessors.filter(link => linkConflict(link.task, this.task, link.type, link.gap))
		},
		shown() {
			return !this.task.closed && (this.open.length > 0 || this.conflicts.length > 0)
		},
		title() {
			const lines = []
			if (this.open.length) {
				lines.push(tbt('Waits for:'), ...this.open.map(link => '• ' + link.task.summary + ' (' + linkTypeLabel(link.type) + ')'))
			}
			if (this.conflicts.length) {
				lines.push(tbt('The dates do not fit:'), ...this.conflicts.map(link => '• ' + link.task.summary))
			}
			return lines.join('\n')
		},
	},
}
</script>

<style lang="scss" scoped>
.tb-dep-badge {
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
	color: var(--color-text-maxcontrast);

	&--conflict {
		color: var(--tb-viz-overdue, var(--color-error));
	}
}
</style>
