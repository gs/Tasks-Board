/**
 * SPDX-FileCopyrightText: 2026 Sven Würth
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Editing a task title where it is shown: the text position under the pointer
 * or in the current selection, and cleaning the new title.
 */

/**
 * Position in the text of an element (counted in characters)
 *
 * @param {Element} element The element with the text
 * @param {Node} node A node inside it
 * @param {number} offset Offset inside that node
 * @return {number|null} The position, null if the node is not inside the element
 */
export function textOffset(element, node, offset) {
	if (!element || !node || !element.contains(node)) {
		return null
	}
	const range = element.ownerDocument.createRange()
	range.selectNodeContents(element)
	range.setEnd(node, offset)
	return range.toString().length
}

/**
 * Position in the text of an element under the pointer
 *
 * @param {Element} element The element with the text
 * @param {number} x Pointer position (client coordinates)
 * @param {number} y Pointer position (client coordinates)
 * @return {number|null}
 */
export function offsetAtPoint(element, x, y) {
	const doc = element?.ownerDocument
	if (!doc) {
		return null
	}
	if (doc.caretPositionFromPoint) {
		const position = doc.caretPositionFromPoint(x, y)
		return position ? textOffset(element, position.offsetNode, position.offset) : null
	}
	if (doc.caretRangeFromPoint) {
		const range = doc.caretRangeFromPoint(x, y)
		return range ? textOffset(element, range.startContainer, range.startOffset) : null
	}
	return null
}

/**
 * The current selection inside an element
 *
 * @param {Element} element The element with the text
 * @return {Array|null} [start, end], null without a selection inside it
 */
export function selectionIn(element) {
	const selection = element?.ownerDocument?.getSelection?.()
	if (!selection || !selection.rangeCount) {
		return null
	}
	const range = selection.getRangeAt(0)
	const start = textOffset(element, range.startContainer, range.startOffset)
	const end = textOffset(element, range.endContainer, range.endOffset)
	return start === null || end === null ? null : [start, end]
}

/**
 * A title as it is stored: one line, no spaces around it
 *
 * @param {string} text The typed text
 * @return {string}
 */
export function cleanTitle(text) {
	return String(text ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim()
}
