CREATE TABLE `fleet_requests` (
	`month` text PRIMARY KEY NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`backfill` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_events` (
	`site_id` integer NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	PRIMARY KEY(`site_id`, `at`, `kind`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
