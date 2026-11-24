<?php
/**
 * SPDX-FileCopyrightText: 2026 Sven Würth
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\TasksBoard\Command;

use OCA\DAV\CalDAV\CalDavBackend;
use OCA\TasksBoard\Service\DemoData;
use OCA\TasksBoard\Service\WaitingTag;
use OCP\IConfig;
use OCP\IUserManager;
use Sabre\CalDAV\Xml\Property\SupportedCalendarComponentSet;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * occ tasks_board:demo <user> [--people=a,b,c]
 *
 * Creates sample lists and tasks to try Tasks Board (see DemoData), with all
 * dates relative to today. Existing lists are never changed: if one of the
 * sample lists already exists, nothing is created.
 */
class Demo extends Command {
	public function __construct(
		private IUserManager $userManager,
		private IConfig $config,
		private CalDavBackend $calDav,
	) {
		parent::__construct();
	}

	protected function configure(): void {
		$this->setName('tasks_board:demo')
			->setDescription('Creates sample lists and tasks to try Tasks Board (dates relative to today)')
			->addArgument('user', InputArgument::REQUIRED, 'The user who gets the lists')
			->addOption('people', null, InputOption::VALUE_REQUIRED, 'Up to three more users (comma separated) to assign tasks to');
	}

	protected function execute(InputInterface $input, OutputInterface $output): int {
		$uid = (string)$input->getArgument('user');
		$user = $this->userManager->get($uid);
		if ($user === null) {
			$output->writeln("<error>Unknown user: $uid</error>");
			return self::FAILURE;
		}
		$people = ['me' => $this->person($uid)];
		$others = array_values(array_filter(array_map('trim', explode(',', (string)$input->getOption('people')))));
		if (count($others) > 3) {
			$output->writeln('<error>At most three more people</error>');
			return self::FAILURE;
		}
		foreach ($others as $index => $other) {
			if ($this->userManager->get($other) === null) {
				$output->writeln("<error>Unknown user: $other</error>");
				return self::FAILURE;
			}
			$people[['a', 'b', 'c'][$index]] = $this->person($other);
		}

		$principal = 'principals/users/' . $uid;
		$lists = DemoData::lists($this->today($uid), $people, WaitingTag::get($this->config));
		$existing = array_column($this->calDav->getCalendarsForUser($principal), 'uri');
		$taken = array_intersect(array_column($lists, 'uri'), $existing);
		if ($taken) {
			$output->writeln('<error>These lists already exist, nothing was created: ' . implode(', ', $taken) . '</error>');
			return self::FAILURE;
		}

		$count = 0;
		foreach ($lists as $list) {
			$calendarId = $this->calDav->createCalendar($principal, $list['uri'], [
				'{DAV:}displayname' => $list['name'],
				'{http://apple.com/ns/ical/}calendar-color' => $list['color'],
				'{urn:ietf:params:xml:ns:caldav}supported-calendar-component-set' => new SupportedCalendarComponentSet(['VTODO']),
			]);
			foreach ($list['tasks'] as $file => $data) {
				$this->calDav->createCalendarObject($calendarId, $file, $data);
				$count++;
			}
		}
		$output->writeln(sprintf('Created %d lists with %d tasks for %s.', count($lists), $count, $uid));
		return self::SUCCESS;
	}

	/**
	 * @return array{uid: string, name: string, email: string}
	 */
	private function person(string $uid): array {
		$user = $this->userManager->get($uid);
		return ['uid' => $uid, 'name' => $user?->getDisplayName() ?: $uid, 'email' => (string)($user?->getEMailAddress() ?? '')];
	}

	/**
	 * Today in the time zone of the user
	 */
	private function today(string $uid): \DateTimeImmutable {
		$timezone = $this->config->getUserValue($uid, 'core', 'timezone', date_default_timezone_get());
		try {
			$zone = new \DateTimeZone($timezone !== '' ? $timezone : 'UTC');
		} catch (\Throwable $e) {
			$zone = new \DateTimeZone('UTC');
		}
		return new \DateTimeImmutable('today', $zone);
	}
}
