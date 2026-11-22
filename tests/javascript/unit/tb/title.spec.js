import { cleanTitle, selectionIn, textOffset } from '../../../../src/tb/title.js'

import { describe, expect, it } from 'vitest'

describe('title - editing in place', () => {
	it('counts the position over text and links', () => {
		const element = document.createElement('span')
		element.innerHTML = 'Mail an <a href="https://example.com">example.com</a> schicken'
		document.body.appendChild(element)
		const link = element.querySelector('a').firstChild
		const last = element.lastChild
		expect(textOffset(element, element.firstChild, 3)).toBe(3)
		expect(textOffset(element, link, 4)).toBe(12)
		expect(textOffset(element, last, 1)).toBe(20)
		expect(textOffset(element, document.body, 0)).toBeNull()
		const range = document.createRange()
		range.setStart(element.firstChild, 0)
		range.setEnd(element.firstChild, 4)
		document.getSelection().removeAllRanges()
		document.getSelection().addRange(range)
		expect(selectionIn(element)).toEqual([0, 4])
		element.remove()
	})

	it('keeps one line without spaces around it', () => {
		expect(cleanTitle('  Server\n einrichten \r\n und testen ')).toBe('Server einrichten und testen')
		expect(cleanTitle('\n ')).toBe('')
	})
})
