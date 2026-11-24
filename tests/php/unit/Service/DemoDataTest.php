<?php
/**
 * SPDX-FileCopyrightText: 2026 Sven Würth
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\TasksBoard\Tests\Unit\Service;

use OCA\TasksBoard\Service\DemoData;
use PHPUnit\Framework\TestCase;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;

class DemoDataTest extends TestCase {
	private const PEOPLE = [
		'me' => ['uid' => 'alex', 'name' => 'Alex Morgan', 'email' => 'alex@example.com'],
		'a' => ['uid' => 'emma', 'name' => 'Emma Clark', 'email' => ''],
	];

	private function lists(): array {
		return DemoData::lists(new \DateTimeImmutable('2026-11-24 15:30', new \DateTimeZone('Europe/Berlin')), self::PEOPLE, 'waiting');
	}

	private function todo(string $key): \Sabre\VObject\Component {
		foreach ($this->lists() as $list) {
			$data = $list['tasks'][DemoData::UID_PREFIX . $key . '.ics'] ?? null;
			if ($data !== null) {
				/** @var VCalendar $calendar */
				$calendar = Reader::read($data);
				return $calendar->VTODO;
			}
		}
		$this->fail("No task $key");
	}

	public function testListsAndValidTasks(): void {
		$lists = $this->lists();
		$this->assertSame(['it-operations', 'website-relaunch', 'office', 'templates'], array_column($lists, 'uri'));
		$this->assertSame('Templates', $lists[3]['name']);
		foreach ($lists as $list) {
			foreach ($list['tasks'] as $file => $data) {
				$calendar = Reader::read($data);
				$errors = array_filter($calendar->validate(), fn ($message) => $message['level'] > 1);
				$this->assertSame([], $errors, $file);
				$this->assertSame($file, $calendar->VTODO->UID . '.ics');
			}
		}
	}

	public function testDatesAreRelativeToToday(): void {
		$mail = $this->todo('mail');
		$this->assertSame('20261112', (string)$mail->DTSTART);
		$this->assertSame('20261203', (string)$mail->DUE);
		$this->assertSame('20261124', (string)$this->todo('coffee')->DUE);
	}

	public function testWaitingTaskHasTagAndFollowUpReminder(): void {
		$laptops = $this->todo('laptops');
		$this->assertContains('waiting', $laptops->CATEGORIES->getParts());
		$alarm = $laptops->VALARM;
		$this->assertSame('1', (string)$alarm->{'X-TASKS-BOARD-FOLLOW-UP'});
		// 8 o'clock in Berlin, in UTC
		$this->assertSame('20261130T070000Z', (string)$alarm->TRIGGER);
		$this->assertFalse(isset($laptops->DTSTART));
	}

	public function testSubtasksAndDependencies(): void {
		$dns = $this->todo('mail-3');
		$relations = [];
		foreach ($dns->select('RELATED-TO') as $property) {
			$relations[] = ((string)($property['RELTYPE'] ?? 'PARENT')) . ':' . $property;
		}
		$this->assertSame(['PARENT:' . DemoData::UID_PREFIX . 'mail', 'FINISHTOSTART:' . DemoData::UID_PREFIX . 'mail-4'], $relations);
	}

	public function testOnlyGivenPeopleAreAssigned(): void {
		$wiki = $this->todo('wiki');
		$this->assertSame('alex', (string)$wiki->ATTENDEE['X-NC-USERID']);
		$this->assertSame('mailto:alex@example.com', (string)$wiki->ATTENDEE);
		$this->assertSame('alex', (string)$wiki->ATTENDEE['X-TASKS-BOARD-ASSIGNED-BY']);
		$ssl = $this->todo('ssl');
		$this->assertSame('urn:x-nextcloud:user:emma', (string)$ssl->ATTENDEE);
		// "b" was not given: the task stays unassigned
		$this->assertFalse(isset($this->todo('fw')->ATTENDEE));
	}
}
