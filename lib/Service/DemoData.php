<?php
/**
 * SPDX-FileCopyrightText: 2026 Sven Würth
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\TasksBoard\Service;

use Sabre\VObject\Component\VCalendar;

/**
 * Sample lists and tasks to try Tasks Board (occ tasks_board:demo, Nextcloud
 * Playground): projects with subtasks, people, priorities and tags, waiting
 * tasks with a follow-up, dependencies, closed tasks for the overview and a
 * template list. All dates are relative to the given day.
 */
final class DemoData {
	/** Start of the UIDs of the sample tasks */
	public const UID_PREFIX = 'tasks-board-demo-';

	/**
	 * The lists: uri => [name, colour]
	 */
	private const LISTS = [
		'it-operations' => ['IT Operations', '#0082C9'],
		'website-relaunch' => ['Website Relaunch', '#8E44AD'],
		'office' => ['Office', '#2E8B57'],
		'templates' => ['Templates', '#7B8794'],
	];

	private const MAIL_NOTE = "Move all mailboxes to the new server **before** the end of the month.\n\n"
		. "- [x] List all mailboxes and aliases\n- [x] Test migration with two accounts\n"
		. "- [ ] Tell everyone about the downtime\n- [ ] Switch the MX record\n\n"
		. 'Old server stays read-only for 30 days.';

	/**
	 * The tasks: [list, key, fields]. Days are relative to today; "who" is
	 * "me" (the owner) or "a", "b", "c" (the other people).
	 */
	private static function tasks(): array {
		$it = 'it-operations';
		$web = 'website-relaunch';
		$office = 'office';
		$tpl = 'templates';
		$tasks = [
			[$it, 'mail', ['summary' => 'Migrate mail server', 'status' => 'IN-PROCESS', 'priority' => 1, 'tags' => ['Network'], 'start' => -12, 'due' => 9, 'who' => 'b', 'percent' => 50, 'created' => -24, 'modified' => -1, 'note' => self::MAIL_NOTE, 'order' => 10]],
			[$it, 'mail-1', ['summary' => 'Export mailboxes', 'status' => 'COMPLETED', 'priority' => 1, 'tags' => ['Network'], 'start' => -12, 'due' => -4, 'who' => 'b', 'parent' => 'mail', 'done' => -3, 'created' => -24, 'order' => 11]],
			[$it, 'mail-2', ['summary' => 'Set up new server', 'status' => 'COMPLETED', 'priority' => 1, 'tags' => ['Network'], 'start' => -6, 'due' => -1, 'who' => 'b', 'parent' => 'mail', 'done' => -1, 'created' => -24, 'order' => 12]],
			[$it, 'mail-3', ['summary' => 'Switch DNS records', 'priority' => 1, 'tags' => ['Network'], 'start' => -1, 'due' => 7, 'who' => 'b', 'parent' => 'mail', 'created' => -24, 'order' => 13, 'links' => [['FINISHTOSTART', 'mail-4']]]],
			[$it, 'mail-4', ['summary' => 'Shut down old server', 'priority' => 1, 'tags' => ['Network'], 'start' => 8, 'due' => 14, 'who' => 'a', 'parent' => 'mail', 'created' => -24, 'order' => 14]],
			[$it, 'ssl', ['summary' => 'Renew SSL certificates', 'priority' => 2, 'tags' => ['Security'], 'due' => 2, 'who' => 'a', 'created' => -9, 'order' => 20]],
			[$it, 'fw', ['summary' => 'Replace firewall', 'status' => 'IN-PROCESS', 'priority' => 3, 'tags' => ['Network', 'Hardware'], 'start' => -8, 'due' => 20, 'who' => 'b', 'percent' => 40, 'created' => -30, 'modified' => -2, 'order' => 30]],
			[$it, 'laptops', ['summary' => 'Quote for new laptops', 'priority' => 5, 'tags' => ['Purchasing'], 'waiting' => 6, 'who' => 'c', 'created' => -12, 'note' => 'Waiting for the offer from the vendor.', 'order' => 40]],
			[$it, 'restore', ['summary' => 'Backup restore test', 'priority' => 1, 'tags' => ['Backup'], 'due' => -2, 'who' => 'a', 'created' => -15, 'order' => 50]],
			[$it, 'printer', ['summary' => 'Printer on 2nd floor jams', 'priority' => 5, 'tags' => ['Support', 'Hardware'], 'created' => -3, 'order' => 60]],
			[$it, 'wiki', ['summary' => 'Update VPN guide in the wiki', 'priority' => 3, 'tags' => ['Support'], 'who' => 'me', 'created' => -40, 'modified' => -21, 'order' => 70]],
			[$it, 'rights', ['summary' => 'Review admin rights', 'priority' => 2, 'tags' => ['Security'], 'waiting' => -1, 'who' => 'me', 'created' => -18, 'order' => 80]],
			[$it, 'onb', ['summary' => 'Onboarding Jamie', 'status' => 'IN-PROCESS', 'priority' => 5, 'tags' => ['Support'], 'start' => -6, 'due' => 5, 'who' => 'c', 'percent' => 33, 'created' => -6, 'order' => 90]],
			[$it, 'onb-1', ['summary' => 'Create accounts', 'status' => 'COMPLETED', 'priority' => 5, 'tags' => ['Support'], 'start' => -6, 'due' => -4, 'who' => 'c', 'parent' => 'onb', 'done' => -4, 'created' => -6, 'order' => 91]],
			[$it, 'onb-2', ['summary' => 'Prepare laptop', 'status' => 'IN-PROCESS', 'priority' => 5, 'tags' => ['Support'], 'start' => -3, 'due' => 3, 'who' => 'c', 'parent' => 'onb', 'created' => -6, 'order' => 92, 'links' => [['FINISHTOSTART', 'onb-3']]]],
			[$it, 'onb-3', ['summary' => 'Order phone', 'priority' => 5, 'tags' => ['Purchasing'], 'due' => 4, 'who' => 'c', 'parent' => 'onb', 'created' => -6, 'order' => 93]],
			[$it, 'patch10', ['summary' => 'Patch day', 'status' => 'COMPLETED', 'priority' => 2, 'tags' => ['Security'], 'who' => 'b', 'done' => -6, 'created' => -10]],
			[$it, 'ups', ['summary' => 'Replace UPS battery', 'status' => 'COMPLETED', 'priority' => 3, 'tags' => ['Hardware'], 'who' => 'b', 'done' => -17, 'created' => -28]],
			[$it, 'patch9', ['summary' => 'Patch day (last month)', 'status' => 'COMPLETED', 'priority' => 2, 'tags' => ['Security'], 'who' => 'b', 'done' => -36, 'created' => -41]],
			[$it, 'nas', ['summary' => 'Expand NAS storage', 'status' => 'COMPLETED', 'priority' => 5, 'tags' => ['Backup', 'Hardware'], 'who' => 'a', 'done' => -52, 'created' => -70]],
			[$it, 'vpn', ['summary' => 'Set up VPN for home office', 'status' => 'COMPLETED', 'priority' => 3, 'tags' => ['Network'], 'who' => 'b', 'done' => -64, 'created' => -80]],
			[$it, 'av', ['summary' => 'Roll out new antivirus', 'status' => 'COMPLETED', 'priority' => 2, 'tags' => ['Security'], 'who' => 'a', 'done' => -75, 'created' => -83]],
			[$it, 'wifi', ['summary' => 'Guest Wi-Fi password', 'status' => 'COMPLETED', 'priority' => 6, 'tags' => ['Network'], 'who' => 'a', 'done' => -45, 'created' => -47]],
			[$it, 'mon', ['summary' => 'Monitoring for disk space', 'status' => 'CANCELLED', 'priority' => 5, 'tags' => ['Backup'], 'created' => -33, 'modified' => -20]],
			[$web, 'design', ['summary' => 'Design new start page', 'status' => 'IN-PROCESS', 'priority' => 2, 'tags' => ['Website'], 'start' => -14, 'due' => 10, 'who' => 'c', 'percent' => 60, 'created' => -21, 'modified' => -1, 'order' => 10]],
			[$web, 'texts', ['summary' => 'Write texts for product pages', 'priority' => 5, 'tags' => ['Content'], 'start' => -7, 'due' => 12, 'who' => 'a', 'created' => -14, 'order' => 20]],
			[$web, 'texts-1', ['summary' => 'Product overview', 'status' => 'COMPLETED', 'priority' => 5, 'tags' => ['Content'], 'start' => -7, 'due' => -2, 'who' => 'a', 'parent' => 'texts', 'done' => -2, 'created' => -14, 'order' => 21]],
			[$web, 'texts-2', ['summary' => 'Pricing page', 'priority' => 5, 'tags' => ['Content'], 'start' => -1, 'due' => 11, 'who' => 'a', 'parent' => 'texts', 'created' => -14, 'order' => 22]],
			[$web, 'a11y', ['summary' => 'Accessibility check', 'priority' => 1, 'tags' => ['Website'], 'due' => 4, 'who' => 'me', 'created' => -8, 'order' => 30]],
			[$web, 'images', ['summary' => 'Choose image licenses', 'priority' => 6, 'tags' => ['Content'], 'waiting' => 3, 'created' => -11, 'order' => 40]],
			[$web, 'cookie', ['summary' => 'Cookie banner', 'priority' => 5, 'tags' => ['Website', 'Security'], 'start' => -2, 'due' => 15, 'created' => -5, 'order' => 50]],
			[$web, 'staging', ['summary' => 'Set up staging server', 'status' => 'COMPLETED', 'priority' => 3, 'tags' => ['Website'], 'who' => 'b', 'done' => -8, 'created' => -25]],
			[$web, 'brief', ['summary' => 'Agree on design brief', 'status' => 'COMPLETED', 'priority' => 2, 'tags' => ['Website'], 'who' => 'c', 'done' => -26, 'created' => -40]],
			[$web, 'domains', ['summary' => 'Register new domains', 'status' => 'COMPLETED', 'priority' => 5, 'tags' => ['Website'], 'who' => 'me', 'done' => -58, 'created' => -60]],
			[$office, 'coffee', ['summary' => 'Order coffee beans', 'priority' => 6, 'tags' => ['Purchasing'], 'due' => 0, 'created' => -2, 'order' => 10]],
			[$office, 'event', ['summary' => 'Plan team event', 'priority' => 7, 'due' => 30, 'who' => 'me', 'created' => -16, 'order' => 20]],
			[$office, 'room', ['summary' => 'Book room for the quarterly review', 'status' => 'COMPLETED', 'priority' => 5, 'who' => 'me', 'done' => -2, 'created' => -9]],
			[$office, 'chairs', ['summary' => 'New office chairs', 'status' => 'COMPLETED', 'priority' => 5, 'tags' => ['Purchasing'], 'who' => 'me', 'done' => -30, 'created' => -50]],
			[$tpl, 't-onb', ['summary' => 'Onboarding new employee', 'priority' => 5, 'tags' => ['Support'], 'created' => -60, 'order' => 10]],
			[$tpl, 't-off', ['summary' => 'Offboarding', 'priority' => 5, 'tags' => ['Support'], 'created' => -60, 'order' => 20]],
		];
		foreach (['Create accounts', 'Prepare laptop', 'Order phone', 'Hand over keys'] as $index => $summary) {
			$tasks[] = [$tpl, 't-onb-' . ($index + 1), ['summary' => $summary, 'priority' => 5, 'tags' => ['Support'], 'parent' => 't-onb', 'created' => -60, 'order' => 11 + $index]];
		}
		foreach (['Disable accounts', 'Collect hardware', 'Archive mailbox'] as $index => $summary) {
			$tasks[] = [$tpl, 't-off-' . ($index + 1), ['summary' => $summary, 'priority' => 5, 'tags' => ['Support'], 'parent' => 't-off', 'created' => -60, 'order' => 21 + $index]];
		}
		return $tasks;
	}

	/**
	 * The sample lists with their tasks
	 *
	 * @param \DateTimeImmutable $today Today, in the time zone of the owner (follow-ups are at 8 o'clock there)
	 * @param array $people Who the tasks are assigned to: 'me' (the owner) and 'a', 'b', 'c' (up to three
	 *                      more people), each ['uid' => …, 'name' => …, 'email' => …]; tasks of missing
	 *                      people stay unassigned
	 * @param string $waitingTag The waiting tag of the instance
	 * @return list<array{uri: string, name: string, color: string, tasks: array<string, string>}> Lists with their tasks (file name => iCalendar)
	 */
	public static function lists(\DateTimeImmutable $today, array $people, string $waitingTag): array {
		$today = $today->setTime(0, 0);
		$owner = $people['me']['uid'] ?? '';
		$lists = [];
		foreach (self::LISTS as $uri => [$name, $color]) {
			$lists[$uri] = ['uri' => $uri, 'name' => $name, 'color' => $color, 'tasks' => []];
		}
		foreach (self::tasks() as [$list, $key, $fields]) {
			$uid = self::UID_PREFIX . $key;
			$lists[$list]['tasks'][$uid . '.ics'] = self::task($uid, $fields, $today, $people[$fields['who'] ?? ''] ?? null, $owner, $waitingTag);
		}
		return array_values($lists);
	}

	/**
	 * @param \DateTimeImmutable $today Today, midnight
	 * @param int $days Days from today
	 * @param int $hour Hour of the day (in the time zone of today)
	 * @return \DateTimeImmutable The moment in UTC
	 */
	private static function moment(\DateTimeImmutable $today, int $days, int $hour): \DateTimeImmutable {
		return $today->modify(sprintf('%+d days', $days))->setTime($hour, 0)->setTimezone(new \DateTimeZone('UTC'));
	}

	/**
	 * One task as iCalendar
	 *
	 * @param string $uid The UID
	 * @param array $fields The fields (see tasks())
	 * @param \DateTimeImmutable $today Today, midnight
	 * @param array|null $person Who it is assigned to
	 * @param string $owner The owner of the lists
	 * @param string $waitingTag The waiting tag of the instance
	 * @return string
	 */
	private static function task(string $uid, array $fields, \DateTimeImmutable $today, ?array $person, string $owner, string $waitingTag): string {
		$status = $fields['status'] ?? 'NEEDS-ACTION';
		$created = self::moment($today, $fields['created'] ?? -20, 8);
		$modified = self::moment($today, $fields['modified'] ?? $fields['done'] ?? ($fields['created'] ?? -20), 10);
		$calendar = new VCalendar(['PRODID' => '-//Tasks Board//demo//EN']);
		$todo = $calendar->add('VTODO', [
			'UID' => $uid,
			'SUMMARY' => $fields['summary'],
			'STATUS' => $status,
			'CREATED' => $created,
			'DTSTAMP' => $created,
			'LAST-MODIFIED' => $modified,
		]);
		if (isset($fields['priority'])) {
			$todo->add('PRIORITY', $fields['priority']);
		}
		$tags = $fields['tags'] ?? [];
		if (isset($fields['waiting'])) {
			$tags[] = $waitingTag;
		}
		if ($tags) {
			$todo->add('CATEGORIES', $tags);
		}
		foreach (['start' => 'DTSTART', 'due' => 'DUE'] as $field => $property) {
			if (isset($fields[$field])) {
				$todo->add($property, $today->modify(sprintf('%+d days', $fields[$field])), ['VALUE' => 'DATE']);
			}
		}
		if ($person !== null) {
			$address = $person['email'] !== '' ? 'mailto:' . $person['email'] : 'urn:x-nextcloud:user:' . $person['uid'];
			$todo->add('ATTENDEE', $address, [
				'CN' => $person['name'],
				'CUTYPE' => 'INDIVIDUAL',
				'ROLE' => 'REQ-PARTICIPANT',
				'PARTSTAT' => 'NEEDS-ACTION',
				'SCHEDULE-AGENT' => 'CLIENT',
				'X-NC-USERID' => $person['uid'],
				'X-TASKS-BOARD-ASSIGNED-BY' => $owner,
			]);
		}
		if (isset($fields['parent'])) {
			$todo->add('RELATED-TO', self::UID_PREFIX . $fields['parent']);
		}
		// Dependencies (RFC 9253): this task is the predecessor of the target
		foreach ($fields['links'] ?? [] as [$type, $target]) {
			$todo->add('RELATED-TO', self::UID_PREFIX . $target, ['RELTYPE' => $type]);
		}
		if ($status === 'COMPLETED') {
			$todo->add('PERCENT-COMPLETE', 100);
			$todo->add('COMPLETED', self::moment($today, $fields['done'] ?? -1, 15));
		} elseif (!empty($fields['percent'])) {
			$todo->add('PERCENT-COMPLETE', $fields['percent']);
		}
		if (isset($fields['note'])) {
			$todo->add('DESCRIPTION', $fields['note']);
		}
		if (isset($fields['order'])) {
			$todo->add('X-APPLE-SORT-ORDER', $fields['order']);
		}
		if (isset($fields['waiting'])) {
			// Follow-up: a marked reminder at 8 o'clock (see src/tb/waiting.js)
			$alarm = $todo->add('VALARM', ['ACTION' => 'DISPLAY', 'DESCRIPTION' => 'Follow-up']);
			$alarm->add('TRIGGER', self::moment($today, $fields['waiting'], 8), ['VALUE' => 'DATE-TIME']);
			$alarm->add('X-TASKS-BOARD-FOLLOW-UP', '1');
		}
		return $calendar->serialize();
	}
}
