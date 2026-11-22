<!--
SPDX-FileCopyrightText: 2026 Sven Würth
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Dependencies in the sidebar: what the task waits for and what comes after it,
each with its kind and what it means. Links are added here without moving
any dates; dates that do not fit are marked red.
-->
<template>
	<div v-if="visible" class="tb-group tb-group--dependencies tb-deps" :data-title="tbt('Dependencies')">
		<div v-for="part in parts" :key="part.key" class="tb-deps__part">
			<div class="tb-deps__label">
				{{ part.label }}
			</div>
			<ul v-if="part.links.length" class="tb-deps__list">
				<li v-for="link in part.links"
					:key="link.other.key"
					class="tb-deps__item"
					:class="{ 'tb-deps__item--conflict': link.conflict, 'tb-deps__item--closed': link.other.closed }">
					<LinkVariant :size="18" class="tb-deps__icon" />
					<div class="tb-deps__text">
						<button type="button"
							class="tb-deps__task"
							:title="link.other.summary"
							@click="openTask(link.other)">
							{{ link.other.summary }}
						</button>
						<span class="tb-deps__sentence">
							{{ link.sentence }}<template v-if="link.conflict"> · {{ tbt('The dates do not fit') }}</template>
						</span>
					</div>
					<select class="tb-deps__type"
						:value="link.type"
						:disabled="readOnly"
						:aria-label="tbt('Kind of dependency')"
						@change="setType(link, $event.target.value)">
						<option v-for="type in types" :key="type.value" :value="type.value">
							{{ type.label }}
						</option>
					</select>
					<NcButton v-if="!readOnly"
						variant="tertiary"
						size="small"
						:aria-label="tbt('Remove the dependency')"
						:title="tbt('Remove the dependency')"
						@click="remove(link)">
						<template #icon>
							<Close :size="18" />
						</template>
					</NcButton>
				</li>
			</ul>
			<NcSelect v-if="!readOnly && part.choices.length"
				class="tb-deps__add"
				:input-label="part.addLabel"
				:label-outside="true"
				:placeholder="part.addLabel"
				:options="part.choices"
				label="summary"
				:model-value="null"
				@update:model-value="add(part.key, $event)" />
		</div>
	</div>
</template>

<script>
import { DEFAULT_LINK_TYPE, LINK_TYPES, linkConflict, linkProblemText, linkTypeLabel, predecessorSentence, successorSentence } from '../dependencies.js'
import { tbt } from '../l10n.js'

import { showError } from '@nextcloud/dialogs'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcSelect from '@nextcloud/vue/components/NcSelect'

import Close from 'vue-material-design-icons/Close.vue'
import LinkVariant from 'vue-material-design-icons/LinkVariant.vue'

export default {
	name: 'TbDependencies',
	components: {
		Close,
		LinkVariant,
		NcButton,
		NcSelect,
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
	computed: {
		types() {
			return LINK_TYPES.map(value => ({ value, label: linkTypeLabel(value) }))
		},
		/**
		 * Other tasks of the list that could be linked (same project, no loop, not yet linked)
		 *
		 * @return {Array}
		 */
		candidates() {
			return Object.values(this.task.calendar?.tasks || {})
				.filter(other => other.key !== this.task.key && !other.closed && !other.deleted)
				.sort((a, b) => a.summary.localeCompare(b.summary))
		},
		parts() {
			const problem = this.$store.getters.tbLinkProblem
			const plain = task => ({ key: task.key, summary: task.summary })
			return [
				{
					key: 'before',
					label: tbt('Waits for'),
					addLabel: tbt('Add a predecessor…'),
					links: this.$store.getters.tbPredecessors(this.task).map(link => ({
						from: link.task,
						to: this.task,
						other: link.task,
						type: link.type,
						sentence: successorSentence(link.type, link.task.summary),
						conflict: linkConflict(link.task, this.task, link.type, link.gap),
					})),
					choices: this.readOnly ? [] : this.candidates.filter(other => !problem(other, this.task)).map(plain),
				},
				{
					key: 'after',
					label: tbt('Then'),
					addLabel: tbt('Add a successor…'),
					links: this.$store.getters.tbSuccessors(this.task).map(link => ({
						from: this.task,
						to: link.task,
						other: link.task,
						type: link.type,
						sentence: predecessorSentence(link.type, link.task.summary),
						conflict: linkConflict(this.task, link.task, link.type, link.gap),
					})),
					choices: this.readOnly ? [] : this.candidates.filter(other => !problem(this.task, other)).map(plain),
				},
			]
		},
		visible() {
			return this.parts.some(part => part.links.length || part.choices.length)
		},
	},
	methods: {
		tbt,
		findTask(key) {
			return this.candidates.find(task => task.key === key) || null
		},
		async add(direction, choice) {
			const other = choice && this.findTask(choice.key)
			if (!other) {
				return
			}
			const [from, to] = direction === 'before' ? [other, this.task] : [this.task, other]
			try {
				const { problem } = await this.$store.dispatch('tbAddLink', { from, to, type: DEFAULT_LINK_TYPE })
				if (problem) {
					showError(linkProblemText(problem))
				}
			} catch (error) {
				console.error(error)
				showError(tbt('Could not change the dependency.'))
			}
		},
		async setType(link, type) {
			try {
				await this.$store.dispatch('tbSetLinkType', { from: link.from, to: link.to, type })
			} catch (error) {
				console.error(error)
				showError(tbt('Could not change the dependency.'))
			}
		},
		async remove(link) {
			try {
				await this.$store.dispatch('tbRemoveLink', { from: link.from, to: link.to })
			} catch (error) {
				console.error(error)
				showError(tbt('Could not change the dependency.'))
			}
		},
		async openTask(task) {
			if (this.$route.params.calendarId) {
				await this.$router.push({ name: 'calendarsTask', params: { calendarId: this.$route.params.calendarId, taskId: task.uri } })
			} else if (this.$route.params.collectionId) {
				await this.$router.push({ name: 'collectionsTask', params: { collectionId: this.$route.params.collectionId, taskId: task.uri } })
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.tb-deps {
	&__part {
		padding: 6px 6px 8px;
	}

	&__label {
		margin-bottom: 4px;
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-maxcontrast);
	}

	&__list {
		margin: 0 0 4px;
		padding: 0;
		list-style: none;
	}

	&__item {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 2px 0;

		&--closed .tb-deps__task {
			text-decoration: line-through;
			color: var(--color-text-maxcontrast);
		}

		&--conflict {
			.tb-deps__icon,
			.tb-deps__sentence {
				color: var(--tb-viz-overdue, var(--color-error));
			}
		}
	}

	&__icon {
		flex: 0 0 auto;
		color: var(--color-text-maxcontrast);
	}

	&__text {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-width: 0;
	}

	// Twice: the button rule of the server (margin: 3px) is more specific
	&__task.tb-deps__task {
		min-height: 0;
		margin: 0;
		padding: 0;
		overflow: hidden;
		border: none;
		background: none;
		color: var(--color-main-text);
		font: inherit;
		font-weight: 500;
		text-align: start;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;

		&:hover {
			text-decoration: underline;
		}
	}

	// The whole sentence, so the meaning is clear
	&__sentence {
		font-size: 12px;
		line-height: 1.3;
		color: var(--color-text-maxcontrast);
		overflow-wrap: anywhere;
	}

	&__type.tb-deps__type {
		flex: 0 0 auto;
		width: auto;
		min-height: 30px;
		margin: 0;
		padding: 0 6px;
		font-size: 12px;
	}

	&__add {
		width: 100%;
	}
}
</style>
