CREATE TABLE `admin` (
	`id` integer PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer,
	CONSTRAINT "admin_single_row" CHECK("admin"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` integer PRIMARY KEY NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`iv` text NOT NULL,
	`scope` text,
	`access_token_expires_at` integer,
	`updated_at` integer,
	CONSTRAINT "credentials_single_row" CHECK("credentials"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text,
	`timezone` text,
	`latitude` real,
	`longitude` real,
	`usable_capacity_wh` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_external_id_unique` ON `sites` (`external_id`);--> statement-breakpoint
CREATE TABLE `tariff_schedule` (
	`site_id` integer PRIMARY KEY NOT NULL,
	`tariff_id` text,
	`name` text,
	`utility` text,
	`currency` text,
	`content` text,
	`updated_at` integer,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
