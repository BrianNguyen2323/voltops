CREATE TABLE `energy_intervals` (
	`site_id` integer NOT NULL,
	`start` integer NOT NULL,
	`solar_wh` integer NOT NULL,
	`load_wh` integer NOT NULL,
	`grid_import_wh` integer NOT NULL,
	`grid_export_wh` integer NOT NULL,
	`battery_charge_wh` integer NOT NULL,
	`battery_discharge_wh` integer NOT NULL,
	PRIMARY KEY(`site_id`, `start`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `samples` (
	`site_id` integer NOT NULL,
	`ts` integer NOT NULL,
	`solar_w` integer NOT NULL,
	`load_w` integer NOT NULL,
	`battery_w` integer NOT NULL,
	`grid_w` integer NOT NULL,
	`soc_pct` real NOT NULL,
	`grid_status` text NOT NULL,
	PRIMARY KEY(`site_id`, `ts`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `weather_forecast` (
	`site_id` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`hour` integer NOT NULL,
	`temp_c` real NOT NULL,
	`cloud_pct` real NOT NULL,
	`ghi_wm2` real NOT NULL,
	`precip_mm` real NOT NULL,
	`precip_prob_pct` real NOT NULL,
	PRIMARY KEY(`site_id`, `issued_at`, `hour`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `weather_observed` (
	`site_id` integer NOT NULL,
	`hour` integer NOT NULL,
	`temp_c` real NOT NULL,
	`cloud_pct` real NOT NULL,
	`ghi_wm2` real NOT NULL,
	`precip_mm` real NOT NULL,
	PRIMARY KEY(`site_id`, `hour`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `sites` ADD `backup_reserve_pct` integer;--> statement-breakpoint
ALTER TABLE `sites` ADD `temperature_unit` text;