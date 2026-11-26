-- CSPC EquiHub demo database (catalog only).
-- Personal data removed: users, sessions, activity_logs, borrow_requests, notifications.
-- Import into an empty `cspc_hiramhub` database, then run: npm run seed:admin

-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 21, 2026 at 02:50 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `cspc_hiramhub`
--

-- --------------------------------------------------------

--
-- Table structure for table `activity_logs`
--

CREATE TABLE `activity_logs` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `actor_role` enum('user','admin','guest') NOT NULL DEFAULT 'guest',
  `action` varchar(60) NOT NULL,
  `details` varchar(255) DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------

--
-- Table structure for table `borrow_requests`
--

CREATE TABLE `borrow_requests` (
  `id` int(11) NOT NULL,
  `reference_no` varchar(24) NOT NULL,
  `user_id` int(11) NOT NULL,
  `equipment_id` int(11) NOT NULL,
  `quantity` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `borrow_date` date NOT NULL,
  `return_date` date NOT NULL,
  `purpose` varchar(255) NOT NULL,
  `status` enum('pending','approved','return_submitted','returned','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `admin_note` varchar(255) DEFAULT NULL,
  `return_proof` varchar(160) DEFAULT NULL,
  `returned_at` datetime DEFAULT NULL,
  `last_reminder_at` date DEFAULT NULL,
  `reminder_count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `categories`
--

CREATE TABLE `categories` (
  `id` int(11) NOT NULL,
  `department_id` int(11) NOT NULL,
  `name` varchar(80) NOT NULL,
  `image` varchar(160) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `categories`
--

INSERT INTO `categories` (`id`, `department_id`, `name`, `image`, `created_at`) VALUES
(1, 1, 'Laptops & Computers', 'dc17ccd34064b29c18f81d25ea2efcaf.webp', '2026-10-20 11:13:23'),
(2, 1, 'Laboratory Instruments', 'c2d98fbf4e496d45d59f7e319a0f53c9.webp', '2026-10-20 11:13:56'),
(3, 1, 'Projectors & Displays', 'ca1c3637116fd1985927b123d71970d8.webp', '2026-10-20 11:14:20'),
(4, 1, 'Audio Equipment', 'a516dd96c731d6c3ee0494140abac73c.jpg', '2026-10-20 11:14:39'),
(5, 1, 'Cameras', '987d7d93a62f25f2fae61f38adf99b7a.jpg', '2026-10-20 11:14:58'),
(6, 2, 'Laboratory Instruments', '7316dac09f3e71bc52123b2b7e436e1d.webp', '2026-10-20 11:17:37'),
(7, 2, 'Cameras', 'c3924baa44729391abca879dd9819c74.jpg', '2026-10-20 11:18:57'),
(8, 3, 'Projectors & Displays', 'c0bca786126ceb948031aba8f88ec615.webp', '2026-10-20 11:19:25'),
(9, 3, 'Cameras', '4a33d8a9f350eb3ddcad46e1e1f06ba7.jpg', '2026-10-20 11:19:40'),
(10, 3, 'Laboratory Instruments', 'e365c1acd397fb3192f8aeac41b1b201.webp', '2026-10-20 11:20:06'),
(11, 3, 'Audio Equipment', 'b1543c3350c59e6882f9c825d0857052.jpg', '2026-10-20 11:20:26'),
(12, 15, 'Audio Equipment', '0d619e8f32ef1026ef936ada686dca6f.jpg', '2026-10-20 11:21:12'),
(13, 15, 'Projectors & Displays', 'c6cac53ee848df7eeade948e2c22f90a.webp', '2026-10-20 11:21:28'),
(14, 15, 'Teaching Aids', 'f31196aeb37b18ecf6df642e3ec9c8e3.webp', '2026-10-20 11:23:28'),
(15, 15, 'Sports', 'e370117277e6d2745ab9aca484f04745.jpg', '2026-10-20 11:24:46'),
(16, 13, 'Laboratory Instruments', 'e842c59906cd882fcf417ac2c9b1e8f0.webp', '2026-10-20 13:56:49');

-- --------------------------------------------------------

--
-- Table structure for table `departments`
--

CREATE TABLE `departments` (
  `id` int(11) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `logo` varchar(160) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `departments`
--

INSERT INTO `departments` (`id`, `code`, `name`, `logo`) VALUES
(1, 'CCS', 'College of Computer Studies', '76b5ab91b071c75343cf1b01102bcd44.png'),
(2, 'CEA', 'College of Engineering and Architecture', '914a7a88948d2dae8c6c8c6aab8b2b61.jpg'),
(3, 'CAS', 'College of Arts and Sciences', '115713bacec4de892f68a2ab1af2d4bc.png'),
(13, 'CHS', 'College of Health Sciences', '812b42e0f130deacb4376ecf27feaa1a.jpg'),
(14, 'CTHBM', 'College of Tourism, Hospitality, and Business Management', 'afc233ca3f0182808bcd0d8a71539249.jpg'),
(15, 'CTDE', 'College of Technological, Developmental Education', '9144a65638afaf5ef6a2900425a83363.jpg');

-- --------------------------------------------------------

--
-- Table structure for table `equipment`
--

CREATE TABLE `equipment` (
  `id` int(11) NOT NULL,
  `category_id` int(11) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` varchar(500) NOT NULL DEFAULT '',
  `image` varchar(160) DEFAULT NULL,
  `total_qty` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `available_qty` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `status` enum('available','maintenance','unavailable') NOT NULL DEFAULT 'available',
  `featured` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

--
-- Dumping data for table `equipment`
--

INSERT INTO `equipment` (`id`, `category_id`, `name`, `description`, `image`, `total_qty`, `available_qty`, `status`, `featured`, `created_at`, `updated_at`) VALUES
(1, 1, 'Dell Latitude Laptop', 'Laptop for programming, documents, and class presentations.', 'e18098285c7bff4f5362205f998944e8.jpg', 10, 10, 'available', 0, '2026-10-20 11:39:28', '2026-10-20 11:39:28'),
(2, 1, 'Networks & Switches', '24-port gigabit switch for networking laboratory exercises.', '60f809e4e9fdd7765bb281668198a6cb.jpg', 8, 8, 'maintenance', 0, '2026-10-20 11:46:46', '2026-10-20 11:46:46'),
(3, 1, 'Mechanical Keyboard', 'Hot-swappable mechanical keyboard for programming labs.', '779a5000e2b8ac097510dc99c755a0bb.jpg', 5, 5, 'unavailable', 0, '2026-10-20 11:49:35', '2026-10-20 11:49:35'),
(4, 1, 'Graphics Tablet', 'Pen display tablet for digital art and design courses.', '372992ebfed083abfec6821607d22876.jpg', 3, 3, 'available', 0, '2026-10-20 11:58:08', '2026-10-20 11:58:08'),
(5, 1, 'Samsung Portable External SSD', '1TB portable SSD for fast file transfers and backups.', '4e63509f8e83409e236b02b02d7c7aac.jpg', 4, 4, 'available', 0, '2026-10-20 12:00:16', '2026-10-20 12:00:16'),
(6, 2, 'Raspberry-Pi-Kit', 'Complete starter kit for electronics and coding projects.', '0a9859cc7ec24dd1bfeed3023e5b6f1d.jpg', 7, 7, 'available', 0, '2026-10-20 12:02:34', '2026-10-20 12:05:07'),
(7, 3, 'Interactive Smartboard', 'Touch-enabled smartboard for collaborative lessons.', '125fbce0893bebf69d7c2f53cd2f216c.jpg', 3, 3, 'available', 0, '2026-10-20 12:06:34', '2026-10-20 12:06:34'),
(8, 5, 'Webcams', '1080p webcam for streaming and online class setups.', '7e6bf85e084537c52a487306fabd0882.jpg', 15, 15, 'available', 0, '2026-10-20 12:07:38', '2026-10-20 12:07:38'),
(9, 5, 'PTZ Camera', 'Pan-tilt-zoom camera for recording lectures and webinars.', 'fb37eb4ffc43870f6f72431ba8bd34d1.jpg', 13, 13, 'available', 0, '2026-10-20 12:09:05', '2026-10-20 12:09:05'),
(10, 4, 'Studio Microphone', 'Condenser mic with boom arm for podcasting and voice recording.', 'cae34d825706a9cc6dd6a53e18f2b642.jpg', 5, 5, 'available', 0, '2026-10-20 12:10:15', '2026-10-20 12:10:15'),
(11, 6, 'Multimeter', 'Measures voltage, current and resistance for lab work.', '48245fc504d2ba107a8661af025882d1.jpg', 10, 10, 'available', 0, '2026-10-20 12:12:02', '2026-10-20 12:46:40'),
(12, 6, 'Oscilloscope', 'Bench oscilloscope for analyzing electronic waveforms.', 'fcb208978cbccc60fd25cfb57c66a07c.jpg', 12, 12, 'available', 0, '2026-10-20 12:46:14', '2026-10-20 12:46:14'),
(13, 6, 'Digital Caliper', 'Precision caliper measuring to 0.01 mm for shop work.', '22e42e87f80e2b0ddad1d3881cf2f018.jpg', 6, 6, 'available', 0, '2026-10-20 12:50:00', '2026-10-20 13:03:13'),
(14, 6, 'Soldering Station Kit', 'Temperature-controlled station for circuit assembly.', 'bed2afb81117239d1e4f6677f468a8f1.jpg', 5, 5, 'available', 0, '2026-10-20 12:53:19', '2026-10-20 13:02:54'),
(15, 6, 'Function Generator', 'Produces waveforms for testing circuits and signals.', '0cfb57feb31b09be6b502dd43ffabb9b.jpg', 3, 3, 'available', 0, '2026-10-20 12:55:27', '2026-10-20 13:03:31'),
(16, 6, '3D Printer', 'FDM printer for prototyping parts and models.', '687e851d62fc1f2027c50558bf057848.jpg', 6, 6, 'available', 0, '2026-10-20 12:57:37', '2026-10-20 13:02:25'),
(17, 6, 'DC Power Supply', 'Adjustable bench supply powering student circuit builds.', '7392eeac38d299ee6f977e97cd82fe96.jpg', 5, 5, 'available', 0, '2026-10-20 13:02:10', '2026-10-20 13:02:10'),
(18, 6, 'Logic Analyzer', 'Capture digital signals for debugging embedded projects.', '3ec0bc281bf756a05007b7f8cd61409f.jpg', 8, 8, 'available', 0, '2026-10-20 13:05:35', '2026-10-20 13:05:35'),
(19, 6, 'Sound Level Meter', 'Measures noise levels for acoustics experiments.', '95b923be0a64c936c742677a076bbca7.jpg', 5, 5, 'available', 0, '2026-10-20 13:06:41', '2026-10-20 13:06:41'),
(20, 6, 'Thermal Camera', 'Infrared camera for heat-distribution studies.', '1de5efa0c32d4ec3d9dced4b801166a8.jpg', 6, 6, 'available', 0, '2026-10-20 13:07:40', '2026-10-20 13:07:40'),
(21, 10, 'Compound Microscope', 'Binocular microscope up to 1000x for biology labs.', 'e05ba605d3354410d3ceba85a3446bb1.jpg', 3, 3, 'available', 0, '2026-10-20 13:12:06', '2026-10-20 13:12:06'),
(22, 10, 'Skeleton Model', 'Life-size anatomical model for anatomy observations.', 'f294a1f054eda39b0c27a44ee1fab7f4.jpg', 4, 4, 'available', 0, '2026-10-20 13:13:14', '2026-10-20 13:13:14'),
(23, 10, 'Glassware Set', 'Beakers, flasks, and cylinders for chemistry experiments.', '4b80eb0887be021aadbd00f80a44c7c3.jpg', 10, 10, 'available', 0, '2026-10-20 13:14:19', '2026-10-20 13:14:19'),
(24, 10, 'Centrifuge', 'Benchtop centrifuge for sample separation in chemistry and biology.', '05962a02e338e7975080d58d4f0c55c0.jpg', 6, 6, 'available', 0, '2026-10-20 13:15:23', '2026-10-20 13:15:23'),
(25, 10, 'Spectrophometer', 'Measures light absorption for quantitative analysis.', '1aadfeea04640c10c5de4a80de555d1f.jpg', 5, 5, 'available', 0, '2026-10-20 13:16:32', '2026-10-20 13:16:32'),
(26, 8, 'Projector', 'Full HD projectors for lectures, seminars, defense presentations.', '94a11d78ac32acf131cc1ba51641e05a.jpg', 5, 5, 'available', 0, '2026-10-20 13:17:36', '2026-10-20 13:17:36'),
(27, 9, 'DSLR Camera', 'Professional DSLR for photography classes and campus events.', '695e22afaab002c9b7626931ca478852.jpg', 4, 4, 'available', 1, '2026-10-20 13:19:09', '2026-10-20 14:07:41'),
(28, 9, 'Digital Microscope Camera', 'Camera adapter that turns any microscope into a digital one.', '522226d07b028f1d8b09027319094996.jpg', 5, 5, 'available', 0, '2026-10-20 13:20:17', '2026-10-20 13:20:17'),
(29, 11, 'Audio Recorder', 'Portable recorder for field interviews and language labs.', '2855c3cc7858aa338e06c9ecbbe7dff4.jpg', 6, 6, 'available', 0, '2026-10-20 13:21:32', '2026-10-20 13:21:32'),
(30, 14, 'Classroom Globe', 'Illuminate globe for geography and social study lessons.', '1056c78f70fabd05e6a069a592248b74.jpg', 7, 7, 'available', 0, '2026-10-20 13:26:11', '2026-10-20 13:26:11'),
(31, 14, 'Abacus', 'Wooden counting frame for teaching early arithmetic.', '4beb26c96937156aebc0e6d75e689394.jpg', 3, 3, 'available', 0, '2026-10-20 13:27:08', '2026-10-20 13:27:08'),
(32, 14, 'Magnetic Whiteboard', 'Double-sided whiteboard for demo teaching and practice.', 'e3ecbf4e0d5b5a9a4ec69ba5309dc38c.jpg', 5, 5, 'available', 0, '2026-10-20 13:28:16', '2026-10-20 13:28:16'),
(33, 13, 'Document Camera', 'Overhead camera for displaying documents live in class.', '7d69773b286a752bd4b1f72d6b06ef44.jpg', 3, 3, 'available', 0, '2026-10-20 13:29:11', '2026-10-20 13:29:11'),
(34, 12, 'Wireless Microphone', 'Dual wireless earphones for events and recordings.', '1a63214db0c2d399eda5532841fe9034.jpg', 6, 6, 'available', 0, '2026-10-20 13:30:05', '2026-10-20 13:30:05'),
(35, 12, 'PA Speaker', 'Portable PA system for demonstrations and school programs.', '22cb8681f403b2ba437d07fa44ac4596.jpg', 4, 4, 'available', 0, '2026-10-20 13:31:14', '2026-10-20 13:31:14'),
(36, 15, 'Basketball Set', 'Official size ball set for PE and intramural games.', '5ef05489d52103a5c6ccf12a5324b992.jpg', 5, 5, 'available', 0, '2026-10-20 13:32:24', '2026-10-20 13:33:40'),
(37, 15, 'Volleyball Set', 'Ball and net set for PE and intramural games.', 'd0433431256140fe62bd9dac20cf6b8d.jpg', 5, 5, 'available', 0, '2026-10-20 13:34:29', '2026-10-20 13:42:46'),
(38, 15, 'Table Tennis Set', 'Paddles, balls, and net for table tennis practice', 'bb19a510a1511ab9b9e265449ead6e68.jpg', 5, 5, 'available', 0, '2026-10-20 13:36:11', '2026-10-20 13:42:27'),
(39, 15, 'Badminton Set', 'Rackets, shuttlecocks, and net for badminton lessons.', '6b0978a5e8533603f7699f86978ddc15.jpg', 5, 5, 'available', 0, '2026-10-20 13:37:58', '2026-10-20 13:42:02'),
(40, 16, 'Stethoscope', 'Stainless steel chest piece with black tubing for basic patient assessment and vital-signs practice.', '388bfebc63cc90ce2f1cc3cd5065f06a.jpg', 6, 6, 'available', 0, '2026-10-20 14:00:36', '2026-10-20 14:00:36'),
(41, 16, 'Nursing Mannequin', 'Life-size CPR and patient-care simulator torso for hands-on nursing laboratory sessions.', '007b6d9c2f3cba6edf52c87096a45791.jpg', 5, 5, 'available', 0, '2026-10-20 14:02:13', '2026-10-20 14:02:13'),
(42, 16, 'Blood Pressure Monitor', 'Automatic upper-arm BP monitor with cuff and digital display for clinical skills training.', '850d65582a5e5ddd415d22f3c6809b2e.jpg', 5, 5, 'available', 0, '2026-10-20 14:03:55', '2026-10-20 14:03:55'),
(43, 16, 'Otoscope Set', 'Handheld-ear examination kit with speculum tips in a carry case for health assessment classes.', '46991882c768007482b19977f7033561.jpg', 6, 6, 'available', 0, '2026-10-20 14:05:23', '2026-10-20 14:05:23');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `message` varchar(255) NOT NULL,
  `link` varchar(160) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int(11) UNSIGNED NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------

--
-- Table structure for table `site_settings`
--

CREATE TABLE `site_settings` (
  `setting_key` varchar(40) NOT NULL,
  `setting_value` varchar(600) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `google_id` varchar(64) DEFAULT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `verify_token` char(64) DEFAULT NULL,
  `verify_expires` datetime DEFAULT NULL,
  `user_type` enum('student','faculty','employee') NOT NULL DEFAULT 'student',
  `id_number` varchar(30) DEFAULT NULL,
  `department_id` int(11) DEFAULT NULL,
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  `is_blocked` tinyint(1) NOT NULL DEFAULT 0,
  `block_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


--
-- Indexes for dumped tables
--

--
-- Indexes for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_log_user` (`user_id`),
  ADD KEY `idx_log_created` (`created_at`);

--
-- Indexes for table `borrow_requests`
--
ALTER TABLE `borrow_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `reference_no` (`reference_no`),
  ADD KEY `fk_br_eq` (`equipment_id`),
  ADD KEY `idx_br_user_status` (`user_id`,`status`),
  ADD KEY `idx_br_status` (`status`);

--
-- Indexes for table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cat_dept_name` (`department_id`,`name`);

--
-- Indexes for table `departments`
--
ALTER TABLE `departments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `equipment`
--
ALTER TABLE `equipment`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_eq_cat_status` (`category_id`,`status`);
ALTER TABLE `equipment` ADD FULLTEXT KEY `ft_eq` (`name`,`description`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_n_user_read` (`user_id`,`is_read`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`session_id`);

--
-- Indexes for table `site_settings`
--
ALTER TABLE `site_settings`
  ADD PRIMARY KEY (`setting_key`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `google_id` (`google_id`),
  ADD KEY `fk_user_dept` (`department_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `activity_logs`
--
ALTER TABLE `activity_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `borrow_requests`
--
ALTER TABLE `borrow_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `departments`
--
ALTER TABLE `departments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `equipment`
--
ALTER TABLE `equipment`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD CONSTRAINT `fk_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `borrow_requests`
--
ALTER TABLE `borrow_requests`
  ADD CONSTRAINT `fk_br_eq` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_br_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `categories`
--
ALTER TABLE `categories`
  ADD CONSTRAINT `fk_cat_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `equipment`
--
ALTER TABLE `equipment`
  ADD CONSTRAINT `fk_eq_cat` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_n_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `fk_user_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
