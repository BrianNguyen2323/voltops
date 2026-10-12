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
--> statement-breakpoint
ALTER TABLE `sites` ADD `battery_count` integer;--> statement-breakpoint
ALTER TABLE `sites` ADD `battery_model` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `max_power_w` integer;--> statement-breakpoint
ALTER TABLE `sites` ADD `firmware` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `installed_on` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `backfill_from` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `backfill_cursor` text;