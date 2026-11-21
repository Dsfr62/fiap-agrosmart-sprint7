CREATE TABLE `risk_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`aggregates` text NOT NULL,
	`risk_level` text NOT NULL,
	`risk_score` real,
	`risk_confidence` real,
	`action` text NOT NULL,
	`action_confidence` real,
	`probabilities` text,
	`decided_by` text NOT NULL,
	`model` text,
	`cost_usd` real,
	`recommendation` text,
	`recommendation_model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `fields`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `risk_evaluations_field_window_idx` ON `risk_evaluations` (`field_id`,`window_end`);--> statement-breakpoint
CREATE INDEX `risk_evaluations_window_idx` ON `risk_evaluations` (`window_end`);--> statement-breakpoint
CREATE TABLE `sensor_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`station_id` text NOT NULL,
	`ts` integer NOT NULL,
	`temperature_c` real NOT NULL,
	`air_humidity_pct` real NOT NULL,
	`soil_moisture_pct` real NOT NULL,
	`luminosity_lux` integer NOT NULL,
	`event` text,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `fields`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sensor_readings_field_ts_idx` ON `sensor_readings` (`field_id`,`ts`);--> statement-breakpoint
CREATE INDEX `sensor_readings_ts_idx` ON `sensor_readings` (`ts`);