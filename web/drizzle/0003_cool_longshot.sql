ALTER TABLE `risk_evaluations` ADD `water_risk_level` text;--> statement-breakpoint
ALTER TABLE `risk_evaluations` ADD `water_risk_confidence` real;--> statement-breakpoint
ALTER TABLE `risk_evaluations` ADD `heat_risk_level` text;--> statement-breakpoint
ALTER TABLE `risk_evaluations` ADD `heat_risk_confidence` real;--> statement-breakpoint
ALTER TABLE `risk_evaluations` ADD `overall_risk_level` text;--> statement-breakpoint
ALTER TABLE `risk_evaluations` ADD `overall_risk_type` text;