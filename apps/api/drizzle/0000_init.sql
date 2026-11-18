CREATE TABLE `vm_audit` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`username` varchar(50),
	`action` varchar(40) NOT NULL,
	`resource` varchar(40) NOT NULL,
	`resource_id` varchar(128),
	`details` json,
	`ip` varchar(45),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vm_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vm_endpoint_meta` (
	`endpoint_id` varchar(40) NOT NULL,
	`type` enum('extension','trunk') NOT NULL,
	`display_name` varchar(60) NOT NULL DEFAULT '',
	`description` varchar(255),
	`context` varchar(40) NOT NULL DEFAULT '',
	`mode` enum('ip','credentials'),
	`config` json NOT NULL,
	`snapshot` json,
	`created_by` varchar(50),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` datetime,
	CONSTRAINT `vm_endpoint_meta_endpoint_id` PRIMARY KEY(`endpoint_id`)
);
--> statement-breakpoint
CREATE TABLE `vm_queue_meta` (
	`queue_name` varchar(128) NOT NULL,
	`description` varchar(255),
	`config` json NOT NULL,
	`created_by` varchar(50),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vm_queue_meta_queue_name` PRIMARY KEY(`queue_name`)
);
--> statement-breakpoint
CREATE TABLE `vm_refresh_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime NOT NULL,
	`revoked_at` datetime,
	`ip` varchar(45),
	`user_agent` varchar(255),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vm_refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `vm_refresh_tokens_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `vm_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(50) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`full_name` varchar(100) NOT NULL,
	`email` varchar(255),
	`role` enum('admin','operator','viewer') NOT NULL DEFAULT 'viewer',
	`active` boolean NOT NULL DEFAULT true,
	`last_login_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vm_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `vm_users_username_uq` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE INDEX `vm_audit_created_idx` ON `vm_audit` (`created_at`);--> statement-breakpoint
CREATE INDEX `vm_audit_resource_idx` ON `vm_audit` (`resource`,`resource_id`);--> statement-breakpoint
CREATE INDEX `vm_endpoint_meta_type_idx` ON `vm_endpoint_meta` (`type`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `vm_endpoint_meta_ctx_idx` ON `vm_endpoint_meta` (`context`);--> statement-breakpoint
CREATE INDEX `vm_refresh_tokens_user_idx` ON `vm_refresh_tokens` (`user_id`);