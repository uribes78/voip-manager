-- Permisos para conexiones desde cualquier host (Asterisk y la API corren fuera del contenedor de MariaDB).
CREATE DATABASE IF NOT EXISTS asterisk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'asterisk'@'%' IDENTIFIED BY 'asterisk';
GRANT ALL PRIVILEGES ON asterisk.* TO 'asterisk'@'%';
FLUSH PRIVILEGES;
