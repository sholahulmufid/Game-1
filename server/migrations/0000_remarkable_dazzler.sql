CREATE TABLE `cn_players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`seat` text NOT NULL,
	`nickname` text NOT NULL,
	`nickname_key` text NOT NULL,
	`token_hash` text NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`connected` integer DEFAULT 1 NOT NULL,
	`last_seen` integer NOT NULL,
	`packet` text,
	`packet_epoch` text,
	`packet_sequence` integer DEFAULT -1 NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `cn_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cn_players_seat_check" CHECK("cn_players"."seat" IN ('a', 'b')),
	CONSTRAINT "cn_players_ready_check" CHECK("cn_players"."ready" IN (0, 1)),
	CONSTRAINT "cn_players_connected_check" CHECK("cn_players"."connected" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cn_players_seat_unique` ON `cn_players` (`room_id`,`seat`);--> statement-breakpoint
CREATE UNIQUE INDEX `cn_players_nickname_unique` ON `cn_players` (`room_id`,`nickname_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `cn_players_token_unique` ON `cn_players` (`room_id`,`token_hash`);--> statement-breakpoint
CREATE TABLE `cn_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`current_level` integer DEFAULT 0 NOT NULL,
	`checkpoint` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`snapshot` text,
	CONSTRAINT "cn_rooms_status_check" CHECK("cn_rooms"."status" IN ('lobby', 'playing', 'complete')),
	CONSTRAINT "cn_rooms_level_check" CHECK("cn_rooms"."current_level" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cn_rooms_code_unique` ON `cn_rooms` (`code`);--> statement-breakpoint
CREATE INDEX `cn_rooms_expiry_index` ON `cn_rooms` (`expires_at`);