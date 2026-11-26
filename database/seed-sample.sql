-- Optional sample data (fake). Run after schema.sql:  mysql -u user -p cspc_hiramhub < database/seed-sample.sql
USE cspc_hiramhub;
INSERT IGNORE INTO categories (id, department_id, name) VALUES
 (1, (SELECT id FROM departments WHERE code='CCS'),  'Audio-Visual'),
 (2, (SELECT id FROM departments WHERE code='CCS'),  'Networking Tools'),
 (3, (SELECT id FROM departments WHERE code='CEA'),  'Surveying'),
 (4, (SELECT id FROM departments WHERE code='GEN'),  'Event Equipment');
INSERT IGNORE INTO equipment (id, category_id, name, description, total_qty, available_qty, status) VALUES
 (1, 1, 'LCD Projector', 'XGA projector with HDMI and VGA inputs.', 6, 6, 'available'),
 (2, 1, 'Portable Speaker', 'Rechargeable PA speaker with wireless mic.', 4, 4, 'available'),
 (3, 2, 'Crimping Tool Kit', 'RJ45 crimper, tester and cable stripper.', 5, 5, 'available'),
 (4, 3, 'Total Station', 'Electronic theodolite with tripod.', 2, 2, 'maintenance'),
 (5, 4, 'Folding Tables', 'Set of 4 folding tables.', 10, 10, 'available');
