CREATE TABLE `discussions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`question` text NOT NULL,
	`status` enum('active','completed','archived') NOT NULL DEFAULT 'active',
	`guestModels` json NOT NULL,
	`judgeModel` varchar(64) NOT NULL,
	`confidenceThreshold` float NOT NULL DEFAULT 0.8,
	`enableDynamicAgent` boolean NOT NULL DEFAULT false,
	`dataReadLimit` int NOT NULL DEFAULT 100,
	`finalVerdict` text,
	`confidenceScores` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discussions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discussionId` int NOT NULL,
	`role` enum('host','guest','judge','system') NOT NULL,
	`modelName` varchar(64),
	`content` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modelConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`modelProvider` varchar(64) NOT NULL,
	`apiKey` text NOT NULL,
	`baseUrl` varchar(255),
	`isEnabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modelConfigs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`defaultJudgeModel` varchar(64) DEFAULT 'deepseek',
	`defaultConfidenceThreshold` float DEFAULT 0.8,
	`defaultEnableDynamicAgent` boolean DEFAULT false,
	`defaultDataReadLimit` int DEFAULT 100,
	`enterpriseApiUrl` varchar(255),
	`enterpriseApiKey` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `userSettings_userId_unique` UNIQUE(`userId`)
);
