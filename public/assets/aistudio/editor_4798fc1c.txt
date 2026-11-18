<?php
// ============================================================
//  MRMS UNIVERSAL CODE EDITOR & 2-STEP SMART PATCHER — editor.php
//  Standalone cPanel Code Updater (Works on MRMS Mart & Any Website!)
//  1-Click File Upload & Replace + 2-Step Highlight Patcher + Terminal
// ============================================================

declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Automatically load config.php if present in the same folder; otherwise work standalone on any cPanel website!
if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
}

if (!defined('SITE_NAME'))  define('SITE_NAME', 'MRMS Code Patcher');
if (!defined('ADMIN_USER')) define('ADMIN_USER', 'admin');
if (!defined('ADMIN_PASS')) define('ADMIN_PASS', 'admin123');

function editorJsonResponse(array $data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function isEditorLoggedIn(): bool {
    return !empty($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true;
}

// Auto-discover all editable code files in the current cPanel folder (Prioritizes MRMS files first, then any website files)
function getEditableFilesList(): array {
    $priorityLabels = [
        'index.php'  => 'Customer Storefront (index.php)',
        'admin.php'  => 'Admin Control Panel (admin.php)',
        'api.php'    => 'Master API Engine (api.php)',
        'db.php'     => 'Database & Schema (db.php)',
        'config.php' => 'Configuration (config.php)',
        'editor.php' => 'Standalone Code Editor (editor.php)',
    ];

    $files = [];
    foreach ($priorityLabels as $fn => $label) {
        if (file_exists(__DIR__ . '/' . $fn)) {
            $files[$fn] = $label;
        }
    }

    $allowedExts = ['php', 'html', 'htm', 'js', 'css', 'json', 'txt', 'xml', 'sql', 'htaccess', 'env'];
    $scan = @scandir(__DIR__);
    if (is_array($scan)) {
        foreach ($scan as $item) {
            if ($item === '.' || $item === '..' || isset($files[$item])) continue;
            $full = __DIR__ . '/' . $item;
            if (!is_file($full)) continue;
            if (str_ends_with($item, '.bak')) continue;
            $ext = strtolower(pathinfo($item, PATHINFO_EXTENSION));
            if ($item === '.htaccess' || $item === '.env' || in_array($ext, $allowedExts, true)) {
                $files[$item] = $item . ' (' . number_format((int)@filesize($full)) . ' B)';
            }
        }
    }

    return $files;
}

$editableFiles = getEditableFilesList();

if (isset($_GET['logout'])) {
    unset($_SESSION['admin_logged_in']);
    header('Location: editor.php');
    exit;
}

// ── 1-CLICK DOWNLOAD ALL UPDATED FILES (SINGLE .TXT BUNDLE OR .ZIP) ──
if (isset($_GET['export_all']) && isEditorLoggedIn()) {
    $filesToExport = array_keys($editableFiles);
    $mode = $_GET['export_all'];

    if ($mode === 'zip' && class_exists('ZipArchive')) {
        $tmpZip = tempnam(sys_get_temp_dir(), 'mrms_zip_');
        $zip = new ZipArchive();
        if ($zip->open($tmpZip, ZipArchive::OVERWRITE) === true) {
            foreach ($filesToExport as $fn) {
                $p = __DIR__ . '/' . $fn;
                if (file_exists($p)) $zip->addFile($p, $fn);
            }
            $zip->close();
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="Website_All_Files_' . date('Y-m-d_H-i') . '.zip"');
            header('Content-Length: ' . filesize($tmpZip));
            readfile($tmpZip);
            @unlink($tmpZip);
            exit;
        }
    }

    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: attachment; filename="Website_All_Files_' . date('Y-m-d_H-i') . '.txt"');
    foreach ($filesToExport as $fn) {
        $p = __DIR__ . '/' . $fn;
        if (file_exists($p)) {
            echo "--- START OF FILE {$fn} ---\n\n";
            echo file_get_contents($p) . "\n\n";
        }
    }
    exit;
}

$loginError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['admin_login'])) {
    $u = trim($_POST['username'] ?? '');
    $p = trim($_POST['password'] ?? '');
    if ($u === ADMIN_USER && $p === ADMIN_PASS) {
        $_SESSION['admin_logged_in'] = true;
        header('Location: editor.php');
        exit;
    }
    $loginError = 'Invalid Admin username or password!';
}

// ============================================================
//  CODE EDITOR & PATCHER AJAX API HANDLER
// ============================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['admin_action'])) {
    if (!isEditorLoggedIn()) {
        editorJsonResponse(['success' => false, 'error' => 'Unauthorized Access'], 403);
    }
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    $act = $_POST['admin_action'];

    // 1. DIRECT FILE UPLOAD & REPLACE
    if ($act === 'upload_replace_file') {
        $targetFile = basename(trim($_POST['target_file'] ?? ''));
        if ($targetFile === '' || !isset($editableFiles[$targetFile])) {
            editorJsonResponse(['success' => false, 'error' => 'Invalid target file selected.']);
        }
        if (empty($_FILES['code_file']['tmp_name'])) {
            editorJsonResponse(['success' => false, 'error' => 'Please choose a file from your device first!']);
        }

        $uploadedContent = file_get_contents($_FILES['code_file']['tmp_name']);
        if ($uploadedContent === false || strlen(trim($uploadedContent)) < 5) {
            editorJsonResponse(['success' => false, 'error' => 'Selected file is empty or unreadable!']);
        }

        $destPath = __DIR__ . '/' . $targetFile;
        if (file_exists($destPath)) @copy($destPath, $destPath . '.bak');

        $bytes = @file_put_contents($destPath, $uploadedContent, LOCK_EX);
        if ($bytes === false) editorJsonResponse(['success' => false, 'error' => 'Failed to write file on server.']);
        if (function_exists('opcache_invalidate')) @opcache_invalidate($destPath, true);

        editorJsonResponse([
            'success' => true,
            'message' => "$targetFile uploaded & replaced! (" . number_format($bytes) . " bytes)",
        ]);
    }

    // 2. QUICK FIND & REPLACE SNIPPET
    if ($act === 'find_replace_code') {
        $file    = basename(trim($_POST['filename'] ?? ''));
        $find    = (string)($_POST['find_text'] ?? '');
        $replace = (string)($_POST['replace_text'] ?? '');

        if (!isset($editableFiles[$file])) editorJsonResponse(['success' => false, 'error' => 'Invalid file selected.']);
        if (trim($find) === '') editorJsonResponse(['success' => false, 'error' => 'Please enter the code lines you want to find!']);

        $path = __DIR__ . '/' . $file;
        if (!file_exists($path)) editorJsonResponse(['success' => false, 'error' => 'File not found on server.']);

        $content     = (string)file_get_contents($path);
        $normContent = str_replace("\r\n", "\n", $content);
        $normFind    = str_replace("\r\n", "\n", $find);
        $normReplace = str_replace("\r\n", "\n", $replace);

        $count = substr_count($normContent, $normFind);
        if ($count === 0) {
            editorJsonResponse(['success' => false, 'error' => 'Exact code snippet not found in ' . $file . '!']);
        }

        @copy($path, $path . '.bak');
        $newContent = str_replace($normFind, $normReplace, $normContent);
        $written    = @file_put_contents($path, $newContent, LOCK_EX);

        if ($written === false) editorJsonResponse(['success' => false, 'error' => 'Failed to save changes!']);
        if (function_exists('opcache_invalidate')) @opcache_invalidate($path, true);

        editorJsonResponse([
            'success' => true,
            'message' => "Replaced $count match(es) in $file & saved!",
            'content' => $newContent
        ]);
    }

    // 3. LIVE CODE EDITOR: LOAD FILE
    if ($act === 'load_file') {
        $file = basename(trim($_POST['filename'] ?? ''));
        if (!isset($editableFiles[$file])) editorJsonResponse(['success' => false, 'error' => 'File not allowed.']);
        $path = __DIR__ . '/' . $file;
        if (!file_exists($path)) editorJsonResponse(['success' => false, 'error' => 'File not found.']);
        $content = file_get_contents($path);
        editorJsonResponse([
            'success'    => true,
            'filename'   => $file,
            'content'    => $content,
            'size'       => number_format(strlen((string)$content)) . ' bytes',
            'modified'   => date('Y-m-d H:i:s', (int)filemtime($path)),
            'has_backup' => file_exists($path . '.bak')
        ]);
    }

    // 4. LIVE CODE EDITOR: SAVE FILE
    if ($act === 'save_file') {
        $file    = basename(trim($_POST['filename'] ?? ''));
        $content = (string)($_POST['content'] ?? '');
        if (!isset($editableFiles[$file])) editorJsonResponse(['success' => false, 'error' => 'Not permitted.']);
        if (strlen(trim($content)) < 5) editorJsonResponse(['success' => false, 'error' => 'Code is empty!']);

        $path = __DIR__ . '/' . $file;
        if (file_exists($path)) @copy($path, $path . '.bak');

        $written = @file_put_contents($path, $content, LOCK_EX);
        if ($written === false) editorJsonResponse(['success' => false, 'error' => 'Write failed!']);
        if (function_exists('opcache_invalidate')) @opcache_invalidate($path, true);

        editorJsonResponse(['success' => true, 'message' => "$file saved! (" . number_format($written) . " bytes)"]);
    }

    // 5. RESTORE BACKUP
    if ($act === 'restore_backup') {
        $file = basename(trim($_POST['filename'] ?? ''));
        if (!isset($editableFiles[$file])) editorJsonResponse(['success' => false, 'error' => 'Invalid file.']);
        $path = __DIR__ . '/' . $file;
        $bak  = $path . '.bak';
        if (!file_exists($bak)) editorJsonResponse(['success' => false, 'error' => 'No backup found.']);
        @copy($bak, $path);
        if (function_exists('opcache_invalidate')) @opcache_invalidate($path, true);
        editorJsonResponse(['success' => true, 'message' => "Restored backup of $file!"]);
    }
}

$isAdmin = isEditorLoggedIn();
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
$firstFile = array_key_first($editableFiles) ?: 'index.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title><?= htmlspecialchars(SITE_NAME) ?> — Code Patcher & File Updater</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root{
  --bg:#f8fafc;
  --surface:rgba(255,255,255,.92);
  --surface-solid:#ffffff;
  --surface-alt:#f8fafc;
  --primary:#2563eb;
  --primary-dark:#1d4ed8;
  --primary-light:#eff6ff;
  --primary-border:#bfdbfe;
  --aqua:#0ea5e9;
  --text:#0f172a;
  --muted:#475569;
  --light:#94a3b8;
  --border:#e2e8f0;
  --success:#10b981;
  --success-bg:#ecfdf5;
  --warning:#f59e0b;
  --warning-bg:#fffbeb;
  --danger:#ef4444;
  --danger-bg:#fef2f2;
  --radius:14px;
  --shadow-float:0 8px 24px -4px rgba(15,23,42,.06), 0 2px 6px rgba(15,23,42,.04);
}
html{scroll-behavior:smooth}
body{
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;
  background:var(--bg);
  color:var(--text);min-height:100vh;padding-bottom:40px;overflow-x:hidden;
}
code,pre,.mono{font-family:'JetBrains Mono',monospace}
i{line-height:1;vertical-align:middle}

@keyframes autoHideSplash{
  0%,65%{opacity:1;visibility:visible}
  100%{opacity:0;visibility:hidden;pointer-events:none}
}
.splash-screen{
  position:fixed;inset:0;z-index:99999;
  background:#f8fafc;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  animation:autoHideSplash .85s ease forwards;
}
.splash-screen.hide{opacity:0;visibility:hidden;pointer-events:none}
.splash-logo-box{
  width:60px;height:60px;border-radius:18px;
  background:#eef2ff;border:1px solid #c7d2fe;
  color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:28px;
  box-shadow:0 8px 20px rgba(79,70,229,.12);
}
.splash-title{margin-top:12px;font-size:18px;font-weight:800;color:var(--text)}
.splash-bar{width:130px;height:4px;background:#dbeafe;border-radius:99px;margin-top:12px;overflow:hidden;position:relative}
.splash-fill{position:absolute;top:0;left:0;bottom:0;width:55%;background:linear-gradient(90deg,#2563eb,#0ea5e9);border-radius:99px;animation:splashSlide .6s ease-in-out infinite alternate}

.top-loader{
  position:fixed;top:0;left:0;height:3px;width:0%;z-index:9000;
  background:linear-gradient(90deg,#2563eb,#0ea5e9,#38bdf8);
  box-shadow:0 0 10px rgba(14,165,233,.8);
  transition:width .28s ease, opacity .28s ease;opacity:0;
}
.top-loader.active{width:82%;opacity:1}
.top-loader.done{width:100%;opacity:0}

@keyframes splashSlide{0%{left:-10%}100%{left:65%}}
@keyframes pageEnter{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}
@keyframes springModal{
  0%{opacity:0;transform:scale(.86) translateY(12px)}
  70%{transform:scale(1.02) translateY(-2px)}
  100%{opacity:1;transform:scale(1) translateY(0)}
}
@keyframes rippleWave{to{transform:scale(3.4);opacity:0}}

/* ── STYLE 4: CLEAN SOLID PILL BUTTONS, NAVBAR & CARDS ── */
.btn{
  padding:6px 11px;border-radius:9px;font-size:11.5px;font-weight:700;
  font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  gap:4px;text-decoration:none;white-space:nowrap;position:relative;overflow:hidden;
  transition:transform .16s cubic-bezier(.34,1.56,.64,1), opacity .16s ease, background .16s ease;user-select:none;line-height:1.2;
}
.btn-primary{
  background:#2563eb;color:#ffffff;border:1px solid #1d4ed8;
  box-shadow:0 2px 6px rgba(37,99,235,.18);
}
.btn-primary:hover{background:#1d4ed8;transform:translateY(-1px)}
.btn-primary:active{transform:translateY(1px) scale(.96)}

.btn-success{
  background:#10b981;color:#ffffff;border:1px solid #059669;
  box-shadow:0 2px 6px rgba(16,185,129,.18);
}
.btn-success:hover{background:#059669;transform:translateY(-1px)}
.btn-success:active{transform:scale(.96)}

.btn-outline{
  background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;
  box-shadow:none;
}
.btn-outline:hover{background:#f1f5f9;border-color:#94a3b8;transform:translateY(-1px)}
.btn-outline:active{transform:scale(.96)}

.btn-danger{
  background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;
  box-shadow:none;
}
.btn-danger:active{transform:scale(.96)}

.ripple-effect{
  position:absolute;border-radius:50%;background:rgba(255,255,255,.55);
  transform:scale(0);animation:rippleWave .5s linear;pointer-events:none;
}

.navbar{
  position:sticky;top:0;z-index:100;height:52px;
  background:#ffffff;border-bottom:1px solid #e2e8f0;
  box-shadow:0 1px 3px rgba(15,23,42,.03);
}
.nav-inner{
  max-width:1140px;margin:0 auto;padding:0 10px;height:100%;
  display:flex;align-items:center;justify-content:space-between;gap:6px;
}
.nav-left{display:flex;align-items:center;gap:7px}
.brand{display:flex;align-items:center;gap:6px;cursor:pointer;text-decoration:none;color:var(--text)}
.brand-ico{
  width:30px;height:30px;border-radius:9px;
  background:#eef2ff;border:1px solid #c7d2fe;color:#4f46e5;
  display:flex;align-items:center;justify-content:center;font-size:15px;
}
.brand-title{font-size:14.5px;font-weight:800;letter-spacing:-.02em;color:#0f172a}

.main{max-width:1140px;width:100%;margin:0 auto;padding:12px 10px}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}
.topbar h2{font-size:15.5px;font-weight:800;display:flex;align-items:center;gap:6px}
.topbar h2 i{color:#4f46e5;font-size:18px}

.card{
  background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;
  box-shadow:0 2px 8px rgba(15,23,42,.04);margin-bottom:12px;overflow:hidden;
}
.card-head{
  padding:10px 13px;border-bottom:1px solid #f1f5f9;background:#ffffff;
  display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;
}
.card-head h3{font-size:13px;font-weight:800;display:flex;align-items:center;gap:6px}
.card-head h3 i{color:var(--primary);font-size:15px}
.card-body{padding:13px}

.fg{margin-bottom:9px}
.fg label{display:block;font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px;text-transform:uppercase}
.fg input,.fg select,.fg textarea{
  width:100%;padding:7px 10px;border-radius:8px;border:1px solid #cbd5e1;
  font-size:12px;font-family:inherit;outline:none;background:#fff;transition:.16s;
}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(37,99,235,.12)}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}

.badge{padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;display:inline-flex;align-items:center;gap:3px}
.b-ok{background:var(--success-bg);color:#059669;border:1px solid #a7f3d0}
.b-warn{background:var(--warning-bg);color:#d97706;border:1px solid #fde68a}
.b-err{background:var(--danger-bg);color:#e11d48;border:1px solid #fecdd3}
.b-blue{background:var(--primary-light);color:var(--primary);border:1px solid var(--primary-border)}

.code-editor-box{
  width:100%;height:380px;background:#0f172a;color:#e2e8f0;
  padding:12px;border-radius:10px;border:1px solid #334155;
  font-family:'JetBrains Mono',monospace;font-size:11.5px;line-height:1.5;outline:none;resize:vertical;
}
.code-editor-box::selection{background:#2563eb;color:#ffffff}

.modal-ov{
  position:fixed;inset:0;background:rgba(15,23,42,.52);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);
  z-index:500;display:none;align-items:center;justify-content:center;padding:14px;
}
.modal-ov.show{display:flex}
.modal{
  background:#ffffff;border-radius:18px;width:100%;max-width:370px;
  overflow:hidden;border:1px solid #e2e8f0;
  box-shadow:0 24px 60px rgba(15,23,42,.22);
  animation:springModal .3s cubic-bezier(.34,1.56,.64,1);
}
.modal-head{
  padding:12px 15px;background:#ffffff;
  border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;
}
.modal-head h3{font-size:13.5px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:6px}
.modal-body{padding:15px}

.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.login-card{background:#fff;width:100%;max-width:360px;padding:26px;border-radius:18px;box-shadow:0 20px 50px rgba(15,23,42,.1);border:1px solid #e2e8f0;animation:springModal .35s ease}

.toast{
  position:fixed;top:60px;right:12px;z-index:600;background:#0f172a;color:#fff;
  padding:8px 13px;border-radius:10px;font-size:11.5px;font-weight:700;
  display:none;align-items:center;gap:6px;box-shadow:0 10px 25px rgba(0,0,0,.25);
  animation:springModal .25s ease;
}
.toast.show{display:flex}

@media(max-width:768px){
  .grid-2{grid-template-columns:1fr}
}
</style>
</head>
<body>

<div class="splash-screen" id="splashScreen" onclick="this.classList.add('hide')">
  <div class="splash-logo-box"><i class="ri-file-code-fill"></i></div>
  <div class="splash-title"><?= htmlspecialchars(SITE_NAME) ?> — Code Editor</div>
  <div class="splash-bar"><div class="splash-fill"></div></div>
</div>

<div class="top-loader" id="topLoader"></div>

<?php if (!$isAdmin): ?>
<div class="login-wrap">
  <div class="login-card">
    <div class="splash-logo-box" style="margin:0 auto 12px;width:50px;height:50px;font-size:24px"><i class="ri-file-code-fill"></i></div>
    <h2 style="text-align:center;font-size:17px;font-weight:800;margin-bottom:4px"><?= htmlspecialchars(SITE_NAME) ?></h2>
    <p style="text-align:center;color:var(--muted);font-size:11.5px;margin-bottom:16px">Standalone Code Patcher & File Updater</p>
    <?php if ($loginError): ?>
      <div style="background:var(--danger-bg);color:var(--danger);padding:8px 10px;border-radius:8px;font-size:11.5px;font-weight:700;margin-bottom:10px">
        <i class="ri-error-warning-line"></i> <?= htmlspecialchars($loginError) ?>
      </div>
    <?php endif; ?>
    <form method="POST">
      <div class="fg"><label>Admin Username</label><input type="text" name="username" required autofocus></div>
      <div class="fg"><label>Admin Password</label><input type="password" name="password" required></div>
      <button type="submit" name="admin_login" class="btn btn-primary" style="width:100%;padding:9px;margin-top:4px">
        <i class="ri-login-circle-line"></i> Sign In to Code Editor
      </button>
    </form>
  </div>
</div>
<?php else: ?>

<!-- STICKY COMPACT TOP NAVBAR (STYLE 4 CLEAN SOLID PILL) -->
<header class="navbar">
  <div class="nav-inner">
    <div class="nav-left">
      <a href="editor.php" class="brand">
        <div class="brand-ico"><i class="ri-code-s-slash-fill"></i></div>
        <span class="brand-title"><?= htmlspecialchars(SITE_NAME) ?></span>
        <span class="badge" style="background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe">Code Patcher</span>
      </a>
    </div>

    <div style="display:flex;align-items:center;gap:5px">
      <?php if (file_exists(__DIR__ . '/admin.php')): ?>
        <a href="admin.php" class="btn btn-outline"><i class="ri-shield-keyhole-fill" style="color:#2563eb"></i> Admin</a>
      <?php endif; ?>
      <?php if (file_exists(__DIR__ . '/index.php')): ?>
        <a href="index.php" target="_blank" class="btn btn-primary"><i class="ri-external-link-line"></i> Store</a>
      <?php endif; ?>
      <a href="?logout=1" class="btn btn-danger"><i class="ri-shut-down-line"></i></a>
    </div>
  </div>
</header>

<main class="main">

  <!-- ORDERED: 1. FILE UPLOADER -> 2. FIND & REPLACE -> 3. TERMINAL -->
  <section id="sec-editor" style="animation:pageEnter .25s ease">
    <div class="topbar">
      <h2><i class="ri-file-code-fill"></i> Code Patcher & File Updater</h2>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <a href="editor.php?export_all=txt" class="btn btn-primary" title="Download all files in 1 .TXT file"><i class="ri-file-download-fill"></i> Download All (.TXT)</a>
        <a href="editor.php?export_all=zip" class="btn btn-outline" title="Download all files as .ZIP"><i class="ri-folder-zip-fill" style="color:#d97706"></i> Backup (.ZIP)</a>
        <select id="editorFileSelect" onchange="loadServerFile()" style="padding:5px 9px;border-radius:8px;border:1px solid #cbd5e1;font-weight:800;font-size:11.5px;color:#0f172a;background:#fff">
          <?php foreach ($editableFiles as $fn => $label): ?>
            <option value="<?= htmlspecialchars($fn) ?>"><?= htmlspecialchars($label) ?></option>
          <?php endforeach; ?>
        </select>
        <button class="btn btn-danger" id="btnRestoreBak" style="display:none" onclick="askRestoreBackup()"><i class="ri-history-line"></i> Undo</button>
      </div>
    </div>

    <!-- 1. TOP: DIRECT FILE UPLOAD & REPLACE -->
    <div class="card">
      <div class="card-head">
        <h3>
          <span style="width:24px;height:24px;border-radius:6px;background:#eff6ff;border:1px solid #bfdbfe;color:#2563eb;display:inline-flex;align-items:center;justify-content:center;font-size:13px">
            <i class="ri-upload-cloud-2-fill" style="color:#2563eb;font-size:13px"></i>
          </span>
          1. Direct File Upload & Replace (<span id="lblCurrentFile" style="color:var(--primary)"><?= htmlspecialchars($firstFile) ?></span>)
        </h3>
      </div>
      <div class="card-body">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="file" id="upCodeFileInput" accept=".php,.txt,.html,.htm,.js,.css,.json,.sql,.xml" style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;background:#fff">
          <button class="btn btn-primary" style="padding:8px 14px" id="btnUploadReplace" onclick="uploadAndReplaceFile()">
            <i class="ri-rocket-2-fill"></i> Upload & Replace File
          </button>
        </div>
      </div>
    </div>

    <!-- 2. MIDDLE (ABOVE TERMINAL): SMART 1-BUTTON FIND -> REPLACE PATCHER -->
    <div class="card">
      <div class="card-head">
        <h3>
          <span style="width:24px;height:24px;border-radius:6px;background:#ecfdf5;border:1px solid #a7f3d0;color:#059669;display:inline-flex;align-items:center;justify-content:center;font-size:13px">
            <i class="ri-find-replace-fill" style="color:#059669;font-size:13px"></i>
          </span>
          2. Quick Find & Replace (2-Step Safe Patcher)
        </h3>
      </div>
      <div class="card-body">
        <div class="grid-2">
          <div class="fg" style="margin:0">
            <label>Find Specific Code Lines (Old Code)</label>
            <textarea id="findCodeInput" rows="3" class="mono" oninput="resetFindReplaceState()" placeholder="Paste the 1-3 lines you want to find..."></textarea>
          </div>
          <div class="fg" style="margin:0">
            <label>Replace With New Code Lines</label>
            <textarea id="replaceCodeInput" rows="3" class="mono" placeholder="Paste the new replacement lines here..."></textarea>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-primary" id="btnSmartPatch" style="flex:1;padding:9px" onclick="handleSmartPatchBtn()">
            <i class="ri-search-eye-fill"></i> Find & Highlight in Terminal
          </button>
          <button class="btn btn-danger" id="btnCancelPatch" style="display:none;padding:9px 14px" onclick="cancelPatchSelection()">
            <i class="ri-close-circle-line"></i> Cancel
          </button>
        </div>
        <div id="findMatchStatus" style="display:none;margin-top:8px;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:700"></div>
      </div>
    </div>

    <!-- 3. BOTTOM: SELECTABLE & HIGHLIGHTABLE CODE TERMINAL -->
    <div class="card">
      <div class="card-head">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <h3>
            <span style="width:24px;height:24px;border-radius:6px;background:#f5f3ff;border:1px solid #ddd6fe;color:#7c3aed;display:inline-flex;align-items:center;justify-content:center;font-size:13px">
              <i class="ri-terminal-box-fill" style="color:#7c3aed;font-size:13px"></i>
            </span>
            3. Source Terminal (Selectable & Copyable)
          </h3>
          <span class="badge b-blue"><i class="ri-cursor-fill"></i> Select & Copy Enabled</span>
          <span id="editorFileInfo" class="mono" style="font-size:10.5px;color:var(--muted)"></span>
        </div>
        <button class="btn btn-outline" onclick="navigator.clipboard.writeText(window.rawTerminalCode||'');toast('Full code copied!')"><i class="ri-file-copy-line"></i> Copy All</button>
      </div>
      <div class="card-body">
        <pre id="codeEditorArea" class="code-editor-box" style="overflow:auto;white-space:pre-wrap;word-break:break-all;user-select:text;-webkit-user-select:text;cursor:text"></pre>
      </div>
    </div>
  </section>

</main>

<!-- CONFIRM MODAL -->
<div class="modal-ov" id="confirmModal">
  <div class="modal" style="max-width:340px">
    <div class="modal-head">
      <h3 id="confTitle"><i class="ri-question-line"></i> Confirm Action</h3>
      <button class="btn btn-outline" style="padding:3px 7px" onclick="closeModal('confirmModal')"><i class="ri-close-line"></i></button>
    </div>
    <div class="modal-body" style="text-align:center">
      <div style="width:46px;height:46px;border-radius:14px;background:var(--danger-bg);color:var(--danger);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 10px">
        <i class="ri-alert-line"></i>
      </div>
      <p id="confMessage" style="font-size:12.5px;color:var(--muted);line-height:1.5;margin-bottom:14px"></p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline" style="flex:1;padding:8px" onclick="closeModal('confirmModal')">Cancel</button>
        <button class="btn btn-danger" style="flex:1;padding:8px" id="btnConfYes"><i class="ri-check-line"></i> Yes, Proceed</button>
      </div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  const sp = document.createElement('span');
  const sz = Math.max(r.width, r.height);
  sp.style.width = sp.style.height = sz + 'px';
  sp.style.left = (e.clientX - r.left - sz / 2) + 'px';
  sp.style.top  = (e.clientY - r.top - sz / 2) + 'px';
  sp.className  = 'ripple-effect';
  btn.appendChild(sp);
  setTimeout(() => sp.remove(), 500);
});

function startLoad() { document.getElementById('topLoader').className = 'top-loader active'; }
function endLoad() {
  const l = document.getElementById('topLoader');
  l.className = 'top-loader done';
  setTimeout(() => l.className = 'top-loader', 280);
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function openConfirmModal(title, message, onConfirmCallback) {
  document.getElementById('confTitle').innerHTML = `<i class="ri-alert-line"></i> ` + title;
  document.getElementById('confMessage').textContent = message;
  const yesBtn = document.getElementById('btnConfYes');
  yesBtn.onclick = () => {
    closeModal('confirmModal');
    onConfirmCallback();
  };
  document.getElementById('confirmModal').classList.add('show');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('splashScreen').classList.add('hide');
  loadServerFile();
});

function toast(msg, err = false) {
  const t = document.getElementById('toast');
  t.style.background = err ? '#e11d48' : '#0f172a';
  t.innerHTML = `<i class="${err ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'}"></i> ` + msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

async function post(obj) {
  startLoad();
  const fd = new FormData();
  for (const k in obj) fd.append(k, obj[k]);
  try {
    const r = await fetch('editor.php', { method: 'POST', body: fd });
    endLoad();
    return await r.json();
  } catch (e) {
    endLoad();
    return { success: false, error: 'Network error' };
  }
}

function escCode(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ── 2-STEP SMART PATCHER (STEP 1: FIND & HIGHLIGHT -> STEP 2: REPLACE OR CANCEL) ──
let isPatchReadyToReplace = false;

function resetFindReplaceState() {
  isPatchReadyToReplace = false;
  const btn = document.getElementById('btnSmartPatch');
  const cancelBtn = document.getElementById('btnCancelPatch');
  const status = document.getElementById('findMatchStatus');
  if (btn) {
    btn.className = 'btn btn-primary';
    btn.innerHTML = '<i class="ri-search-eye-line"></i> Find & Highlight in Terminal';
  }
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (status) status.style.display = 'none';
}

function cancelPatchSelection() {
  resetFindReplaceState();
  const area = document.getElementById('codeEditorArea');
  if (area && window.rawTerminalCode !== undefined) {
    area.textContent = window.rawTerminalCode;
  }
  document.getElementById('findCodeInput').value = '';
  document.getElementById('replaceCodeInput').value = '';
  toast('Cancelled! Highlight cleared.');
}

function handleSmartPatchBtn() {
  if (!isPatchReadyToReplace) {
    highlightInTerminal();
  } else {
    runFindReplace();
  }
}

function highlightInTerminal() {
  const findRaw   = document.getElementById('findCodeInput').value;
  const area      = document.getElementById('codeEditorArea');
  const status    = document.getElementById('findMatchStatus');
  const btn       = document.getElementById('btnSmartPatch');
  const cancelBtn = document.getElementById('btnCancelPatch');

  if (!findRaw.trim()) return toast('Paste the code lines to find first!', true);

  const content = (window.rawTerminalCode || '').replace(/\r\n/g, '\n');
  const target  = findRaw.replace(/\r\n/g, '\n');

  const idx = content.indexOf(target);
  status.style.display = 'block';

  if (idx === -1) {
    isPatchReadyToReplace   = false;
    area.textContent        = content;
    status.style.background = 'var(--danger-bg)';
    status.style.color      = 'var(--danger)';
    status.innerHTML        = '<i class="ri-close-circle-line"></i> Not found in terminal! Check spaces or selected file.';
    return toast('Code snippet not found in terminal!', true);
  }

  const before     = content.substring(0, idx);
  const match      = content.substring(idx, idx + target.length);
  const after      = content.substring(idx + target.length);
  const lineNum    = before.split('\n').length;
  const totalLines = target.split('\n').length;

  area.innerHTML = escCode(before) +
    `<mark id="hlMarkBox" style="background:#facc15;color:#0f172a;font-weight:700;padding:2px 4px;border-radius:4px;box-shadow:0 0 12px rgba(250,204,21,.8)">${escCode(match)}</mark>` +
    escCode(after);

  isPatchReadyToReplace = true;
  btn.className = 'btn btn-success';
  btn.innerHTML = `<i class="ri-magic-line"></i> Confirm Replace & Save (Line ${lineNum})`;
  cancelBtn.style.display = 'inline-flex';

  status.style.background = 'var(--success-bg)';
  status.style.color      = '#059669';
  status.innerHTML        = `<i class="ri-checkbox-circle-line"></i> Match highlighted at Line ${lineNum} (${totalLines} lines). Click green button above to Replace or Cancel!`;

  const markEl = document.getElementById('hlMarkBox');
  if (markEl) {
    markEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  toast(`Found at Line ${lineNum}! Ready to replace.`);
}

async function runFindReplace() {
  const file    = document.getElementById('editorFileSelect').value;
  const find    = document.getElementById('findCodeInput').value;
  const replace = document.getElementById('replaceCodeInput').value;

  if (!find.trim()) return toast('Paste the code lines to find first!', true);

  const d = await post({
    admin_action: 'find_replace_code',
    filename: file,
    find_text: find,
    replace_text: replace
  });

  if (!d.success) return toast(d.error, true);
  toast(d.message);
  window.rawTerminalCode = d.content;
  document.getElementById('codeEditorArea').textContent = d.content;
  document.getElementById('findCodeInput').value = '';
  document.getElementById('replaceCodeInput').value = '';
  resetFindReplaceState();
  document.getElementById('btnRestoreBak').style.display = 'inline-flex';
}

async function uploadAndReplaceFile() {
  const target = document.getElementById('editorFileSelect').value;
  const fInput = document.getElementById('upCodeFileInput');
  if (!fInput.files.length) return toast('Choose a downloaded file first!', true);

  const btn = document.getElementById('btnUploadReplace');
  btn.disabled = true; startLoad();

  const fd = new FormData();
  fd.append('admin_action', 'upload_replace_file');
  fd.append('target_file', target);
  fd.append('code_file', fInput.files[0]);

  try {
    const r = await fetch('editor.php', { method: 'POST', body: fd });
    const d = await r.json();
    endLoad(); btn.disabled = false;
    if (!d.success) return toast(d.error, true);
    toast(d.message);
    fInput.value = '';
    loadServerFile();
  } catch (e) {
    endLoad(); btn.disabled = false;
  }
}

async function loadServerFile() {
  const sel = document.getElementById('editorFileSelect');
  if (!sel || !sel.value) return;
  const file = sel.value;
  document.getElementById('lblCurrentFile').textContent = file;
  const area = document.getElementById('codeEditorArea');
  const info = document.getElementById('editorFileInfo');
  area.textContent = 'Loading ' + file + '...';
  resetFindReplaceState();

  const d = await post({ admin_action: 'load_file', filename: file });
  if (!d.success) { area.textContent = ''; return toast(d.error, true); }
  window.rawTerminalCode = d.content;
  area.textContent = d.content;
  info.textContent = `${d.size} • ${d.modified}`;
  document.getElementById('btnRestoreBak').style.display = d.has_backup ? 'inline-flex' : 'none';
}

function askRestoreBackup() {
  const file = document.getElementById('editorFileSelect').value;
  openConfirmModal('Restore Backup?', `Revert ${file} to its previous backup version?`, async () => {
    const d = await post({ admin_action: 'restore_backup', filename: file });
    if (!d.success) return toast(d.error, true);
    toast(d.message);
    loadServerFile();
  });
}
</script>
<?php endif; ?>
</body>
</html>
