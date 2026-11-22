import tasksModule from '../../../../src/store/tasks.js'
import tbBoard from '../../../../src/tb/store/board.js'
import templatesModule from '../../../../src/tb/store/templates.js'
import {
	gapDays,
	linkConflict,
	linkIndex,
	linkProblem,
	linkType,
	pushPlan,
	readLinks,
	remapLinks,
	sameProject,
	spanShift,
	writeLinks,
} from '../../../../src/tb/dependencies.js'
import { linkPath, taskSpan } from '../../../../src/tb/timeline.js'
import { link, makeCalendar, makeTask } from './helpers.js'

import moment from '@nextcloud/moment'
import { describe, expect, it } from 'vitest'

const day = (offset) => moment('2026-11-20').add(offset, 'days')

/**
 * @param {Array} tasks The tasks of the list
 * @return {object} Lookups like the store has them
 */
function graph(tasks) {
	const index = linkIndex(tasks)
	return {
		parentOf: task => tasks.find(other => other.uid === task.related) || null,
		successorsOf: task => index.successors.get(task.key) || [],
		predecessorsOf: task => index.predecessors.get(task.key) || [],
	}
}

describe('dependencies - stored like RFC 9253', () => {
	it('reads the links of the predecessor, the parent stays apart', () => {
		const cal = makeCalendar('r')
		const task = makeTask(cal, { uid: 'a', related: 'p', lines: ['RELATED-TO;RELTYPE=FINISHTOSTART:b', 'RELATED-TO;RELTYPE=startToStart;GAP=P2D:c', 'RELATED-TO;RELTYPE=SIBLING:x'] })
		expect(task.related).toBe('p')
		expect(task._tbLinks).toEqual([
			{ type: 'FINISHTOSTART', uid: 'b', gap: null },
			{ type: 'STARTTOSTART', uid: 'c', gap: 'P2D' },
		])
		expect(gapDays('P2D')).toBe(2)
		expect(gapDays('-P1D')).toBe(-1)
	})

	it('writes the links and keeps the other relations', () => {
		const cal = makeCalendar('w')
		const task = makeTask(cal, { uid: 'a', related: 'p', lines: ['RELATED-TO;RELTYPE=FINISHTOSTART:b'] })
		writeLinks(task.vtodo, [{ type: 'FINISHTOFINISH', uid: 'c', gap: 'P1D' }])
		const ics = task.vCalendar.toString()
		expect(ics).toContain('RELATED-TO;RELTYPE=FINISHTOFINISH;GAP=P1D:c')
		expect(ics).not.toContain('FINISHTOSTART')
		expect(ics).toMatch(/RELATED-TO(;RELTYPE=PARENT)?:p\r/)
		expect(readLinks(task.vtodo)).toEqual([{ type: 'FINISHTOFINISH', uid: 'c', gap: 'P1D' }])
	})

	it('maps the two ends to the four kinds', () => {
		expect(linkType('end', 'start')).toBe('FINISHTOSTART')
		expect(linkType('start', 'start')).toBe('STARTTOSTART')
		expect(linkType('end', 'end')).toBe('FINISHTOFINISH')
		expect(linkType('start', 'end')).toBe('STARTTOFINISH')
	})
})

describe('dependencies - dates', () => {
	const a = { start: day(0), end: day(4) }
	const b = { start: day(2), end: day(6) }

	it('says how many days the successor has to move for each kind', () => {
		expect(spanShift(a, b, 'FINISHTOSTART')).toBe(2)
		expect(spanShift(a, { start: day(4), end: day(6) }, 'FINISHTOSTART')).toBe(0)
		expect(spanShift(a, b, 'STARTTOSTART')).toBe(0)
		expect(spanShift(b, a, 'STARTTOSTART')).toBe(2)
		expect(spanShift(a, { start: day(0), end: day(3) }, 'FINISHTOFINISH')).toBe(1)
		expect(spanShift({ start: day(5), end: day(8) }, b, 'STARTTOFINISH')).toBe(0)
		expect(spanShift({ start: day(8), end: day(9) }, b, 'STARTTOFINISH')).toBe(2)
		expect(spanShift(a, b, 'FINISHTOSTART', 'P1D')).toBe(3)
		expect(spanShift(null, b, 'FINISHTOSTART')).toBe(0)
	})

	it('marks dates that do not fit, not for closed tasks', () => {
		const cal = makeCalendar('c')
		const pred = makeTask(cal, { uid: 'a', start: day(0), due: day(4) })
		const succ = makeTask(cal, { uid: 'b', start: day(2), due: day(6) })
		const done = makeTask(cal, { uid: 'd', start: day(0), due: day(4), status: 'COMPLETED', percent: 100, completed: day(0) })
		expect(linkConflict(pred, succ, 'FINISHTOSTART')).toBe(true)
		expect(linkConflict(done, succ, 'FINISHTOSTART')).toBe(false)
		expect(linkConflict(pred, succ, 'STARTTOSTART')).toBe(false)
	})
})

describe('dependencies - same project only', () => {
	const setup = () => {
		const cal = makeCalendar('p')
		const other = makeCalendar('o')
		const t = {
			p: makeTask(cal, { uid: 'p' }),
			a: makeTask(cal, { uid: 'a', related: 'p' }),
			b: makeTask(cal, { uid: 'b', related: 'p' }),
			b1: makeTask(cal, { uid: 'b1', related: 'b' }),
			q: makeTask(cal, { uid: 'q' }),
			q1: makeTask(cal, { uid: 'q1', related: 'q' }),
			x: makeTask(other, { uid: 'x' }),
		}
		link(t.p, t.a)
		link(t.p, t.b)
		link(t.b, t.b1)
		link(t.q, t.q1)
		return t
	}

	it('allows subtasks of one project (any level) and main tasks of one list', () => {
		const t = setup()
		const { parentOf } = graph(Object.values(t))
		expect(sameProject(t.a, t.b, parentOf)).toBe(true)
		expect(sameProject(t.a, t.b1, parentOf)).toBe(true)
		expect(sameProject(t.p, t.q, parentOf)).toBe(true)
		expect(sameProject(t.b, t.b1, parentOf)).toBe(false)
		expect(sameProject(t.p, t.a, parentOf)).toBe(false)
		expect(sameProject(t.a, t.q1, parentOf)).toBe(false)
		expect(sameProject(t.p, t.x, parentOf)).toBe(false)
	})

	it('names why a link is not possible: itself, other project, twice, loop', () => {
		const t = setup()
		t.a._tbLinks = [{ type: 'FINISHTOSTART', uid: 'b', gap: null }]
		t.b._tbLinks = [{ type: 'FINISHTOSTART', uid: 'b1', gap: null }]
		const lookups = graph(Object.values(t))
		expect(linkProblem(t.a, t.a, lookups)).toBe('self')
		expect(linkProblem(t.a, t.q1, lookups)).toBe('project')
		expect(linkProblem(t.a, t.b, lookups)).toBe('exists')
		expect(linkProblem(t.b, t.a, lookups)).toBe('exists')
		expect(linkProblem(t.b1, t.a, lookups)).toBe('cycle')
		expect(linkProblem(t.p, t.q, lookups)).toBeNull()
	})
})

describe('dependencies - moving along', () => {
	it('moves the chain of successors only as far as needed, a main task with its subtasks', () => {
		const cal = makeCalendar('m')
		const a = makeTask(cal, { uid: 'a', start: day(0), due: day(10), lines: ['RELATED-TO;RELTYPE=FINISHTOSTART:b'] })
		const b = makeTask(cal, { uid: 'b', start: day(5), due: day(8), lines: ['RELATED-TO;RELTYPE=FINISHTOSTART:c'] })
		const b1 = makeTask(cal, { uid: 'b1', related: 'b', start: day(5), due: day(6) })
		const c = makeTask(cal, { uid: 'c', start: day(20), due: day(22) })
		link(b, b1)
		const done = makeTask(cal, { uid: 'd', start: day(1), due: day(2), status: 'COMPLETED', percent: 100, completed: day(0) })
		a._tbLinks.push({ type: 'STARTTOSTART', uid: 'd', gap: null })
		const { successorsOf } = graph([a, b, b1, c, done])
		const plan = pushPlan([a], { successorsOf })
		expect(plan.map(({ task, days }) => [task.uid, days])).toEqual([['b', 5], ['b1', 5]])
		// c starts on day 20, b now ends on day 13: no need to move
		const late = pushPlan([a], { successorsOf: task => task.uid === 'b' ? [{ task: c, type: 'FINISHTOSTART', gap: 'P10D' }] : successorsOf(task) })
		expect(late.map(({ task, days }) => [task.uid, days])).toEqual([['b', 5], ['b1', 5], ['c', 3]])
		const fixed = pushPlan([a], { successorsOf, canMove: task => task.uid !== 'b1' })
		expect(fixed.map(({ task }) => task.uid)).toEqual(['b'])
	})

	it('copies keep the links inside the copy only', () => {
		const uids = new Map([['a', 'A'], ['b', 'B']])
		expect(remapLinks([{ type: 'FINISHTOSTART', uid: 'b', gap: null }, { type: 'STARTTOSTART', uid: 'z', gap: null }], uids))
			.toEqual([{ type: 'FINISHTOSTART', uid: 'B', gap: null }])
	})

	it('draws arrows with right angles, around the bar when needed', () => {
		expect(linkPath({ x: 100, y: 18, out: 1 }, { x: 160, y: 54, entry: 1 })).toBe('M 100 18 H 110 V 54 H 160')
		expect(linkPath({ x: 100, y: 18, out: 1 }, { x: 90, y: 54, entry: 1 })).toBe('M 100 18 H 110 V 36 H 80 V 54 H 90')
		expect(linkPath({ x: 100, y: 18, out: 1 }, { x: 140, y: 54, entry: -1 })).toBe('M 100 18 H 110 V 36 H 150 V 54 H 140')
		expect(linkPath({ x: 100, y: 54, out: -1 }, { x: 140, y: 18, entry: 1 })).toBe('M 100 54 H 90 V 18 H 140')
	})
})

describe('dependencies - store', () => {
	/**
	 * @param {Array} calendars The lists
	 * @return {object} A store context with the real mutations and getters
	 */
	function context(calendars) {
		const dispatched = []
		const rootGetters = {
			getSortedCalendars: calendars,
			getParentTask: task => Object.values(task.calendar.tasks).find(other => other.uid === task.related) || null,
		}
		const getters = {}
		for (const [name, getter] of Object.entries(tbBoard.getters)) {
			Object.defineProperty(getters, name, { get: () => getter({}, getters, {}, rootGetters) })
		}
		return {
			dispatched,
			getters,
			commit: (name, payload) => (tasksModule.mutations[name] || tbBoard.mutations[name])({}, payload),
			dispatch: async (name, payload) => { dispatched.push([name, payload.uid || payload.task?.uid]) },
		}
	}

	it('adds a link in the predecessor, moves the successor along from the timeline', async () => {
		const cal = makeCalendar('s')
		const a = makeTask(cal, { uid: 'a', start: day(0), due: day(6) })
		const b = makeTask(cal, { uid: 'b', start: day(2), due: day(4) })
		const ctx = context([cal])
		const result = await tbBoard.actions.tbAddLink(ctx, { from: a, to: b, type: 'FINISHTOSTART', push: true })
		expect(result).toEqual({ problem: null, pushed: 1 })
		expect(a.vCalendar.toString()).toContain('RELATED-TO;RELTYPE=FINISHTOSTART:b')
		expect(taskSpan(b).start.format('YYYY-MM-DD')).toBe(day(6).format('YYYY-MM-DD'))
		expect(taskSpan(b).end.format('YYYY-MM-DD')).toBe(day(8).format('YYYY-MM-DD'))
		expect(ctx.getters.tbPredecessors(b).map(item => item.task.uid)).toEqual(['a'])
		expect((await tbBoard.actions.tbAddLink(ctx, { from: b, to: a, type: 'FINISHTOSTART' })).problem).toBe('exists')
	})

	it('from the sidebar only marks, changes the kind, removes', async () => {
		const cal = makeCalendar('t')
		const a = makeTask(cal, { uid: 'a', start: day(0), due: day(6) })
		const b = makeTask(cal, { uid: 'b', start: day(2), due: day(4) })
		const ctx = context([cal])
		await tbBoard.actions.tbAddLink(ctx, { from: a, to: b, type: 'FINISHTOSTART' })
		expect(taskSpan(b).start.format('YYYY-MM-DD')).toBe(day(2).format('YYYY-MM-DD'))
		expect(linkConflict(a, b, 'FINISHTOSTART')).toBe(true)
		await tbBoard.actions.tbSetLinkType(ctx, { from: a, to: b, type: 'STARTTOSTART' })
		expect(a._tbLinks).toEqual([{ type: 'STARTTOSTART', uid: 'b', gap: null }])
		await tbBoard.actions.tbRemoveLink(ctx, { from: a, to: b })
		expect(a._tbLinks).toEqual([])
		expect(a.vCalendar.toString()).not.toContain('RELTYPE=STARTTOSTART')
	})

	it('moving a bar on the timeline moves dependent tasks along', async () => {
		const cal = makeCalendar('u')
		const a = makeTask(cal, { uid: 'a', start: day(0), due: day(3), lines: ['RELATED-TO;RELTYPE=FINISHTOSTART:b'] })
		const b = makeTask(cal, { uid: 'b', start: day(4), due: day(6) })
		const ctx = context([cal])
		const result = await tbBoard.actions.tbShiftDates(ctx, { task: a, days: 3, pushSuccessors: true })
		expect(result).toEqual({ changed: 1, pushed: 1 })
		expect(taskSpan(b).start.format('YYYY-MM-DD')).toBe(day(6).format('YYYY-MM-DD'))
		const quiet = await tbBoard.actions.tbShiftDates(ctx, { task: a, days: 2 })
		expect(quiet).toEqual({ changed: 1, pushed: 0 })
	})

	it('a template copy keeps its links between the copied tasks', async () => {
		const templates = makeCalendar('tpl')
		const target = makeCalendar('target', { dav: { createVObject: async (ics) => ({ ics }) } })
		const p = makeTask(templates, { uid: 'p' })
		const a = makeTask(templates, { uid: 'a', related: 'p', lines: ['RELATED-TO;RELTYPE=FINISHTOSTART:b', 'RELATED-TO;RELTYPE=FINISHTOSTART:outside'] })
		const b = makeTask(templates, { uid: 'b', related: 'p' })
		link(p, a)
		link(p, b)
		const created = []
		const ctx = { commit: (name, payload) => name === 'appendTask' && created.push(payload), getters: { getTaskByUid: () => null } }
		const result = await templatesModule.actions.createFromTemplate(ctx, { template: p, calendar: target, summary: 'Neu' })
		expect(result.count).toBe(3)
		const [copyA, copyB] = [created.find(task => task.summary === 'a'), created.find(task => task.summary === 'b')]
		expect(copyA._tbLinks).toEqual([{ type: 'FINISHTOSTART', uid: copyB.uid, gap: null }])
		expect(copyA.uid).not.toBe('a')
	})
})
