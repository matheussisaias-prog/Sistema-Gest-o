<?php
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/api(/|$)#', $p)) { require '/home/claude/sistema-gest-o/api/index.php'; return true; }
return false;
