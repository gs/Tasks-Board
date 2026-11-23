import { homeChanges, LiveSync, normalizeHref, parseSyncResponse, parseTokens, planChanges, showsList } from '../../../../src/tb/live.js'

import Axios from '@nextcloud/axios'
import { listen } from '@nextcloud/notify_push'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@nextcloud/notify_push', () => ({ listen: vi.fn(() => true) }))
vi.mock('@nextcloud/axios', () => ({ default: vi.fn() }))

const XML = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns">
 <d:response>
  <d:href>/remote.php/dav/calendars/admin/work/a.ics</d:href>
  <d:propstat><d:prop><d:getetag>"e1"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
 </d:response>
 <d:response>
  <d:href>/remote.php/dav/calendars/admin/work/M%C3%BCll.ics</d:href>
  <d:propstat><d:prop><d:getetag>"e2"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
 </d:response>
 <d:response>
  <d:href>/remote.php/dav/calendars/admin/work/gone.ics</d:href>
  <d:status>HTTP/1.1 404 Not Found</d:status>
 </d:response>
 <d:sync-token>http://sabre.io/ns/sync/42</d:sync-token>
</d:multistatus>`

const task = (url, etag, uid = url) => ({ uid, key: uid + '~work', dav: { url, etag } })

describe('live updates', () => {
	it('reads the sync answer', () => {
		const report = parseSyncResponse(XML)
		expect(report.token).toBe('http://sabre.io/ns/sync/42')
		expect(report.changed).toEqual([
			{ href: '/remote.php/dav/calendars/admin/work/a.ics', etag: '"e1"' },
			{ href: '/remote.php/dav/calendars/admin/work/M%C3%BCll.ics', etag: '"e2"' },
		])
		expect(report.removed).toEqual(['/remote.php/dav/calendars/admin/work/gone.ics'])
	})

	it('compares hrefs decoded and without the host', () => {
		expect(normalizeHref('https://cloud.example.com/remote.php/dav/calendars/admin/work/M%C3%BCll.ics')).toBe('/remote.php/dav/calendars/admin/work/Müll.ics')
	})

	it('fetches only tasks whose ETag changed and removes deleted ones', () => {
		const report = parseSyncResponse(XML)
		const same = task('/remote.php/dav/calendars/admin/work/a.ics', '"e1"')
		const changed = task('/remote.php/dav/calendars/admin/work/Müll.ics', '"old"')
		const gone = task('/remote.php/dav/calendars/admin/work/gone.ics', '"x"')
		const plan = planChanges([same, changed, gone], report)
		expect(plan.fetch).toEqual(['/remote.php/dav/calendars/admin/work/M%C3%BCll.ics'])
		expect(plan.remove).toEqual([gone])
	})

	it('treats missing tasks as deleted after a full sync and keeps pending ones', () => {
		const report = { token: 't', changed: [{ href: '/c/a.ics', etag: '"1"' }], removed: [] }
		const a = task('/c/a.ics', '"1"')
		const b = task('/c/b.ics', '"1"')
		expect(planChanges([a, b], report, { full: true })).toEqual({ fetch: [], remove: [b] })
		expect(planChanges([a, b], { token: 't', changed: [], removed: [] }, { pending: ['/c/b.ics'] })).toEqual({ fetch: ['/c/b.ics'], remove: [] })
	})

	it('reads the sync tokens of all lists, without the ones in the trash bin', () => {
		const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:nc="http://nextcloud.com/ns">
 <d:response><d:href>/remote.php/dav/calendars/admin/</d:href><d:propstat><d:prop/><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/calendars/admin/work/</d:href><d:propstat><d:prop><d:sync-token>http://sabre.io/ns/sync/7</d:sync-token></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><nc:deleted-at/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/calendars/admin/old/</d:href><d:propstat><d:prop><d:sync-token>http://sabre.io/ns/sync/3</d:sync-token><nc:deleted-at>2026-10-27T14:01:47+00:00</nc:deleted-at></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/calendars/admin/M%C3%BCll_shared_by_max/</d:href><d:propstat><d:prop><d:sync-token>http://sabre.io/ns/sync/9</d:sync-token></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`
		const tokens = parseTokens(xml)
		// Collections without a token (here the home itself) are kept with null
		expect([...tokens.entries()]).toEqual([
			['/remote.php/dav/calendars/admin/', null],
			['/remote.php/dav/calendars/admin/work/', 'http://sabre.io/ns/sync/7'],
			['/remote.php/dav/calendars/admin/Müll_shared_by_max/', 'http://sabre.io/ns/sync/9'],
		])
	})

	it('finds new lists and lists that are gone below a calendar home', () => {
		const home = '/remote.php/dav/calendars/admin/'
		const list = (id, supportsTasks = true) => ({ id, supportsTasks, dav: { url: 'https://cloud.example.com' + home + id + '/' } })
		const work = list('work')
		const old = list('old')
		const events = list('events', false)
		const current = new Map([[home + 'work/', 't1'], [home + 'new_shared_by_max/', 't2'], [home + 'inbox/', 't3']])
		expect(homeChanges(current, [work, old, events], new Set([home + 'inbox/']))).toEqual({ added: [home + 'new_shared_by_max/'], removed: [old] })
		// An answer without any known list removes nothing
		expect(homeChanges(new Map([[home + 'other/', 't']]), [work, old]).removed).toEqual([])
	})

	it('compares right away when the server pushes a new activity', () => {
		const sync = new LiveSync({ subscribeAction: () => () => {}, state: { calendars: { calendars: [] } } })
		const run = vi.spyOn(sync, 'sync').mockResolvedValue()
		sync.start()
		expect(listen).toHaveBeenCalledWith('notify_activity', sync.onPush)
		expect(sync.push).toBe(true)
		sync.onPush()
		expect(run).toHaveBeenCalledWith({ force: true, wake: true })
		sync.stop()
	})

	it('compares only lists with tasks, not calendars with events only', async () => {
		const home = '/remote.php/dav/calendars/admin/'
		const list = (id, supportsTasks) => ({ id, supportsTasks, tasks: {}, dav: { url: home + id + '/', syncToken: 'old' } })
		const work = list('work', true)
		const events = list('events', false)
		Axios.mockResolvedValue({
			data: `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>${home}work/</d:href><d:propstat><d:prop><d:sync-token>new1</d:sync-token></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>${home}events/</d:href><d:propstat><d:prop><d:sync-token>new2</d:sync-token></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`,
		})
		const sync = new LiveSync({ state: { calendars: { calendars: [work, events] } } })
		expect(await sync.changedCalendars([work, events])).toEqual([work])
	})

	it('keeps lists without a sync token (Deck boards), removes only lists that are gone', () => {
		const home = '/remote.php/dav/calendars/admin/'
		const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:nc="http://nextcloud.com/ns">
 <d:response><d:href>${home}</d:href><d:propstat><d:prop/><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>${home}work/</d:href><d:propstat><d:prop><d:sync-token>http://sabre.io/ns/sync/7</d:sync-token></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>${home}app-generated--deck--board-3/</d:href><d:propstat><d:prop/><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><d:sync-token/><nc:deleted-at/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>
</d:multistatus>`
		const current = parseTokens(xml)
		expect(current.get(home + 'app-generated--deck--board-3/')).toBeNull()
		const list = id => ({ id, supportsTasks: true, dav: { url: home + id + '/' } })
		const work = list('work')
		const deck = list('app-generated--deck--board-3')
		const gone = list('app-generated--deck--board-31')
		const changes = homeChanges(current, [work, deck, gone], new Set([home]))
		expect(changes.removed).toEqual([gone])
		expect(changes.added).toEqual([])
	})

	it('knows whether a page shows a list by the whole path part', () => {
		const path = '/index.php/apps/tasks_board/calendars/app-generated--deck--board-31/tasks/card-6.ics'
		expect(showsList(path, 'app-generated--deck--board-31')).toBe(true)
		expect(showsList(path, 'app-generated--deck--board-3')).toBe(false)
		expect(showsList('/index.php/apps/tasks_board/calendars/work', 'work')).toBe(true)
		expect(showsList('/index.php/apps/tasks_board/collections/all', 'work')).toBe(false)
	})

	it('compares lists without a sync token by ETags: on waking up, when open, every few minutes', async () => {
		const home = '/remote.php/dav/calendars/admin/'
		const deck = { id: 'app-generated--deck--board-2', supportsTasks: true, tasks: {}, dav: { url: home + 'app-generated--deck--board-2/' } }
		const work = { id: 'work', supportsTasks: true, tasks: {}, dav: { url: home + 'work/', syncToken: 't1' } }
		Axios.mockResolvedValue({
			data: `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>${home}work/</d:href><d:propstat><d:prop><d:sync-token>t1</d:sync-token></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>${home}app-generated--deck--board-2/</d:href><d:propstat><d:prop/><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`,
		})
		const store = { state: { calendars: { calendars: [work, deck] } }, commit: vi.fn() }
		const sync = new LiveSync(store)
		// First time: compared, the list stays
		expect(await sync.changedCalendars([work, deck])).toEqual([deck])
		expect(store.commit).not.toHaveBeenCalled()
		sync.withoutToken.set(deck.id, Date.now())
		expect(await sync.changedCalendars([work, deck])).toEqual([])
		expect(await sync.changedCalendars([work, deck], { wake: true })).toEqual([deck])

		// The comparison: a PROPFIND with ETags, changed and new entries are fetched, missing ones removed
		const old = { uid: 'old', key: 'old~deck', dav: { url: home + 'app-generated--deck--board-2/card-1.ics', etag: '"a"' } }
		const same = { uid: 'same', key: 'same~deck', dav: { url: home + 'app-generated--deck--board-2/card-2.ics', etag: '"b"' } }
		deck.tasks = { old, same }
		deck.dav.calendarMultiget = vi.fn().mockResolvedValue([])
		Axios.mockReset()
		Axios.mockResolvedValue({
			data: `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>${home}app-generated--deck--board-2/</d:href><d:propstat><d:prop/><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>${home}app-generated--deck--board-2/card-2.ics</d:href><d:propstat><d:prop><d:getetag>"b"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>${home}app-generated--deck--board-2/card-3.ics</d:href><d:propstat><d:prop><d:getetag>"c"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`,
		})
		const removed = vi.spyOn(sync, 'removeTask').mockImplementation(() => {})
		await sync.syncCalendar(deck)
		expect(Axios.mock.calls[0][0].method).toBe('PROPFIND')
		expect(removed).toHaveBeenCalledWith(old)
		expect(deck.dav.calendarMultiget).toHaveBeenCalledWith([home + 'app-generated--deck--board-2/card-3.ics'])
		expect(sync.tokens.has(deck.id)).toBe(false)
	})
})
