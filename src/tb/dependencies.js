/**
 * SPDX-FileCopyrightText: 2026 Sven Würth
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Dependencies between tasks (pure, no store), stored as in RFC 9253: the
 * predecessor A carries RELATED-TO;RELTYPE=<type>:<UID of the successor B>,
 * optionally with GAP=<duration>.
 *
 *   FINISHTOSTART   B starts when A is finished       (end of A → start of B)
 *   STARTTOSTART    B starts once A has started       (start of A → start of B)
 *   FINISHTOFINISH  B finishes once A is finished     (end of A → end of B)
 *   STARTTOFINISH   B finishes once A has started     (start of A → end of B)
 *
 * Only within one project: subtasks of the same main task, or main tasks of
 * the same list. Dates are compared by day; the same day is fine.
 */

import { tbt } from './l10n.js'
import { taskSpan } from './timeline.js'

import ICAL from 'ical.js'
import { toRaw } from 'vue'

export const LINK_TYPES = Object.freeze(['FINISHTOSTART', 'STARTTOSTART', 'FINISHTOFINISH', 'STARTTOFINISH'])

export const DEFAULT_LINK_TYPE = 'FINISHTOSTART'

/** Which end of A leads to which end of B */
export const LINK_ENDS = Object.freeze({
	FINISHTOSTART: ['end', 'start'],
	STARTTOSTART: ['start', 'start'],
	FINISHTOFINISH: ['end', 'end'],
	STARTTOFINISH: ['start', 'end'],
})

/**
 * @param {string} fromEnd 'start' or 'end' of the predecessor
 * @param {string} toEnd 'start' or 'end' of the successor
 * @return {string} The type
 */
export function linkType(fromEnd, toEnd) {
	return LINK_TYPES.find(type => LINK_ENDS[type][0] === fromEnd && LINK_ENDS[type][1] === toEnd) || DEFAULT_LINK_TYPE
}

/**
 * The dependencies a task carries as predecessor
 *
 * @param {object} vtodo The VTODO (ICAL.js)
 * @return {Array} [{ type, uid, gap }] (gap: duration text or null)
 */
export function readLinks(vtodo) {
	const links = []
	for (const property of toRaw(vtodo).getAllProperties('related-to')) {
		const type = String(property.getParameter('reltype') || '').toUpperCase()
		const uid = property.getFirstValue()
		if (LINK_TYPES.includes(type) && uid) {
			links.push({ type, uid: String(uid), gap: property.getParameter('gap') || null })
		}
	}
	return links
}

/**
 * Replaces the dependencies a task carries (other RELATED-TO stay)
 *
 * @param {object} vtodo The VTODO (ICAL.js)
 * @param {Array} links [{ type, uid, gap }]
 */
export function writeLinks(vtodo, links) {
	const raw = toRaw(vtodo)
	for (const property of raw.getAllProperties('related-to')) {
		if (LINK_TYPES.includes(String(property.getParameter('reltype') || '').toUpperCase())) {
			raw.removeProperty(property)
		}
	}
	for (const { type, uid, gap } of links) {
		const property = new ICAL.Property('related-to')
		property.setParameter('reltype', type)
		if (gap) {
			property.setParameter('gap', gap)
		}
		property.setValue(uid)
		raw.addProperty(property)
	}
}

/**
 * @param {string|null} gap A duration like P1D or -PT12H
 * @return {number} Whole days (0 without a gap)
 */
export function gapDays(gap) {
	if (!gap) {
		return 0
	}
	try {
		return Math.round(ICAL.Duration.fromString(gap).toSeconds() / 86400)
	} catch {
		return 0
	}
}

/**
 * Days the successor has to move later so the link holds (0: it holds or dates are missing)
 *
 * @param {object|null} predSpan Span of the predecessor ({ start, end })
 * @param {object|null} succSpan Span of the successor
 * @param {string} type The type
 * @param {string|null} gap The gap
 * @return {number}
 */
export function spanShift(predSpan, succSpan, type, gap = null) {
	if (!predSpan || !succSpan || !LINK_ENDS[type]) {
		return 0
	}
	const [fromEnd, toEnd] = LINK_ENDS[type]
	const anchor = (fromEnd === 'end' ? predSpan.end : predSpan.start).clone().add(gapDays(gap), 'days')
	const target = toEnd === 'start' ? succSpan.start : succSpan.end
	return Math.max(anchor.diff(target, 'days'), 0)
}

/**
 * Whether the dates of two open tasks do not fit their link
 *
 * @param {object} pred The predecessor
 * @param {object} succ The successor
 * @param {string} type The type
 * @param {string|null} gap The gap
 * @return {boolean}
 */
export function linkConflict(pred, succ, type, gap = null) {
	return !pred.closed && !succ.closed && spanShift(taskSpan(pred), taskSpan(succ), type, gap) > 0
}

/**
 * @param {object} task A task
 * @param {Function} parentOf task => parent or null
 * @return {Array} Its parents, nearest first
 */
function ancestors(task, parentOf) {
	const result = []
	const seen = new Set([task.key])
	let parent = parentOf(task)
	while (parent && !seen.has(parent.key)) {
		seen.add(parent.key)
		result.push(parent)
		parent = parentOf(parent)
	}
	return result
}

/**
 * Whether two tasks belong to the same project: subtasks (any level) of the
 * same main task, or main tasks of the same list; never a task and one of its
 * own parents or subtasks
 *
 * @param {object} a A task
 * @param {object} b Another task
 * @param {Function} parentOf task => parent or null
 * @return {boolean}
 */
export function sameProject(a, b, parentOf) {
	if (!a || !b || a.key === b.key || a.calendar?.id !== b.calendar?.id) {
		return false
	}
	const upA = ancestors(a, parentOf)
	const upB = ancestors(b, parentOf)
	if (upA.some(task => task.key === b.key) || upB.some(task => task.key === a.key)) {
		return false
	}
	if (!upA.length && !upB.length) {
		return true
	}
	if (!upA.length || !upB.length) {
		return false
	}
	return upA[upA.length - 1].key === upB[upB.length - 1].key
}

/**
 * The links between all tasks given, both ways
 *
 * @param {Array} tasks The tasks (links to tasks of other lists or missing tasks are left out)
 * @return {object} { successors: Map(key → [{ task, type, gap }]), predecessors: Map(key → [{ task, type, gap }]) }
 */
export function linkIndex(tasks) {
	const byUid = new Map()
	for (const task of tasks) {
		byUid.set(task.calendar?.id + '/' + task.uid, task)
	}
	const successors = new Map()
	const predecessors = new Map()
	for (const pred of tasks) {
		for (const { type, uid, gap } of pred._tbLinks || []) {
			const succ = byUid.get(pred.calendar?.id + '/' + uid)
			if (!succ || succ.key === pred.key) {
				continue
			}
			if (!successors.has(pred.key)) {
				successors.set(pred.key, [])
			}
			if (!predecessors.has(succ.key)) {
				predecessors.set(succ.key, [])
			}
			successors.get(pred.key).push({ task: succ, type, gap })
			predecessors.get(succ.key).push({ task: pred, type, gap })
		}
	}
	return { successors, predecessors }
}

/**
 * Whether b can be reached from a along the links
 *
 * @param {object} a The start
 * @param {object} b The goal
 * @param {Function} successorsOf task => [{ task }]
 * @return {boolean}
 */
export function reaches(a, b, successorsOf) {
	const seen = new Set()
	const stack = [a]
	while (stack.length) {
		const task = stack.pop()
		if (task.key === b.key) {
			return true
		}
		if (seen.has(task.key)) {
			continue
		}
		seen.add(task.key)
		stack.push(...successorsOf(task).map(link => link.task))
	}
	return false
}

/**
 * Why a link from a to b is not possible
 *
 * @param {object} a The predecessor
 * @param {object} b The successor
 * @param {object} context Destructuring object
 * @param {Function} context.parentOf task => parent or null
 * @param {Function} context.successorsOf task => [{ task, type }]
 * @return {string|null} 'self', 'project', 'exists', 'cycle' or null if it is possible
 */
export function linkProblem(a, b, { parentOf, successorsOf }) {
	if (!a || !b || a.key === b.key) {
		return 'self'
	}
	if (!sameProject(a, b, parentOf)) {
		return 'project'
	}
	if (successorsOf(a).some(link => link.task.key === b.key) || successorsOf(b).some(link => link.task.key === a.key)) {
		return 'exists'
	}
	if (reaches(b, a, successorsOf)) {
		return 'cycle'
	}
	return null
}

/**
 * The tasks that have to move later after some tasks moved, so that no link
 * is broken; a main task takes its subtasks along. Closed tasks hold nothing.
 *
 * @param {Array} moved The tasks that moved (with their new dates)
 * @param {object} context Destructuring object
 * @param {Function} context.successorsOf task => [{ task, type, gap }]
 * @param {Function} context.canMove task => whether its dates can be changed
 * @return {Array} [{ task, days }] in the order to apply
 */
export function pushPlan(moved, { successorsOf, canMove = () => true }) {
	const shifts = new Map()
	const tasks = new Map()
	const spanOf = task => {
		const span = taskSpan(task)
		const days = shifts.get(task.key) || 0
		return span && days ? { start: span.start.clone().add(days, 'days'), end: span.end.clone().add(days, 'days') } : span
	}
	const shift = (task, days) => {
		const all = [task]
		for (let i = 0; i < all.length; i++) {
			all.push(...Object.values(all[i].subTasks || {}).filter(sub => !all.includes(sub)))
		}
		for (const item of all) {
			if (canMove(item)) {
				shifts.set(item.key, (shifts.get(item.key) || 0) + days)
				tasks.set(item.key, item)
			}
		}
		return all
	}
	const queue = [...moved]
	let steps = 0
	while (queue.length && steps++ < 2000) {
		const pred = queue.shift()
		if (pred.closed) {
			continue
		}
		for (const { task: succ, type, gap } of successorsOf(pred)) {
			if (succ.closed || !canMove(succ)) {
				continue
			}
			const days = spanShift(spanOf(pred), spanOf(succ), type, gap)
			if (days > 0) {
				queue.push(...shift(succ, days))
			}
		}
	}
	return [...shifts].filter(([, days]) => days).map(([key, days]) => ({ task: tasks.get(key), days }))
}

/**
 * The links after copying tasks with new UIDs: links inside the copy follow,
 * all others are dropped
 *
 * @param {Array} links [{ type, uid, gap }]
 * @param {Map} uids Old UID → new UID
 * @return {Array}
 */
export function remapLinks(links, uids) {
	return links.filter(link => uids.has(link.uid)).map(link => ({ ...link, uid: uids.get(link.uid) }))
}

/**
 * @param {string} type The type
 * @return {string} Short name, e.g. "Finish → start"
 */
export function linkTypeLabel(type) {
	return {
		FINISHTOSTART: tbt('Finish → start'),
		STARTTOSTART: tbt('Start → start'),
		FINISHTOFINISH: tbt('Finish → finish'),
		STARTTOFINISH: tbt('Start → finish'),
	}[type] || type
}

/**
 * What a link means for the successor
 *
 * @param {string} type The type
 * @param {string} predecessor Title of the predecessor
 * @return {string}
 */
export function successorSentence(type, predecessor) {
	const vars = { task: predecessor }
	return {
		FINISHTOSTART: tbt('Starts when "{task}" is finished', vars),
		STARTTOSTART: tbt('Starts once "{task}" has started', vars),
		FINISHTOFINISH: tbt('Finishes once "{task}" is finished', vars),
		STARTTOFINISH: tbt('Finishes once "{task}" has started', vars),
	}[type] || ''
}

/**
 * What a link means, seen from the predecessor
 *
 * @param {string} type The type
 * @param {string} successor Title of the successor
 * @return {string}
 */
export function predecessorSentence(type, successor) {
	const vars = { task: successor }
	return {
		FINISHTOSTART: tbt('"{task}" starts when this task is finished', vars),
		STARTTOSTART: tbt('"{task}" starts once this task has started', vars),
		FINISHTOFINISH: tbt('"{task}" finishes once this task is finished', vars),
		STARTTOFINISH: tbt('"{task}" finishes once this task has started', vars),
	}[type] || ''
}

/**
 * @param {string} problem See linkProblem (or 'readonly')
 * @return {string} Why a link is not possible
 */
export function linkProblemText(problem) {
	return {
		self: tbt('Not with itself'),
		project: tbt('Only within the same project'),
		exists: tbt('Already linked'),
		cycle: tbt('That would make a loop'),
		readonly: tbt('The list cannot be changed'),
	}[problem] || ''
}
