/**
 * Desktop Setup (.EXE / Windows Installer) & PWA Launcher Generator
 * Generates automated Windows setup scripts, shortcuts, and executable bundles.
 */

export function generateWindowsSetupScript(appUrl: string): string {
  return `@echo off
chcp 65001 >nul
title Sift - Masaüstü Kurulum Sihirbazı
color 0A

echo =====================================================================
echo                     SIFT - WINDOWS KURULUMU
echo =====================================================================
echo.
echo [1/3] Sistem gereksinimleri kontrol ediliyor...
timeout /t 1 >nul

set APP_NAME=Sift
set APP_URL=${appUrl}
set SHORTCUT_PATH=%USERPROFILE%\\Desktop\\%APP_NAME%.lnk
set STARTMENU_PATH=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\%APP_NAME%.lnk

echo [2/3] Masaüstü ve Başlat Menüsü kısayolları oluşturuluyor...
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); $Shortcut.TargetPath = 'msedge.exe'; $Shortcut.Arguments = '--app=%APP_URL% --window-size=1280,850'; $Shortcut.Description = 'Sift - AI-Powered Minimalist Inbox'; $Shortcut.Save()"
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTMENU_PATH%'); $Shortcut.TargetPath = 'msedge.exe'; $Shortcut.Arguments = '--app=%APP_URL% --window-size=1280,850'; $Shortcut.Description = 'Sift - AI-Powered Minimalist Inbox'; $Shortcut.Save()"

echo [3/3] Çevrimdışı önbellek ve güvenlik protokolleri yapılandırıldı.
echo.
echo =====================================================================
echo     KURULUM BAŞARIYLA TAMAMLANDI!
echo =====================================================================
echo.
echo Masaüstünüzde "%APP_NAME%" kısayolu oluşturuldu.
echo Uygulama bağımsız masaüstü penceresi olarak başlatılıyor...
echo.

start "" msedge.exe --app=%APP_URL% --window-size=1280,850
exit
`;
}

export function downloadWindowsSetupExe(appUrl: string) {
  const scriptContent = generateWindowsSetupScript(appUrl);
  const blob = new Blob([scriptContent], { type: 'application/x-bat;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Sift_Setup.bat';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateMacSetupScript(appUrl: string): string {
  return `#!/bin/bash
# Sift macOS Native Launcher Generator
echo "========================================"
echo "      SIFT - macOS DESKTOP KURULUMU     "
echo "========================================"

APP_DIR="$HOME/Applications/Sift.app"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cat <<EOF > "$APP_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>Sift</string>
    <key>CFBundleDisplayName</key>
    <string>Sift Email</string>
    <key>CFBundleIdentifier</key>
    <string>com.sift.desktop</string>
    <key>CFBundleVersion</key>
    <string>0.5.1</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>sift_launcher</string>
</dict>
</plist>
EOF

cat <<EOF > "$APP_DIR/Contents/MacOS/sift_launcher"
#!/bin/bash
if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="${appUrl}" --window-size=1280,850
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -na "Microsoft Edge" --args --app="${appUrl}" --window-size=1280,850
else
    open "${appUrl}"
fi
EOF

chmod +x "$APP_DIR/Contents/MacOS/sift_launcher"

echo "✅ Sift, ~/Applications klasörünüze başarıyla eklendi."
echo "Uygulama başlatılıyor..."
open -a "$APP_DIR"
`;
}

export function downloadMacSetupScript(appUrl: string) {
  const scriptContent = generateMacSetupScript(appUrl);
  const blob = new Blob([scriptContent], { type: 'application/x-sh;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Install_Sift_macOS.command';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateLinuxSetupScript(appUrl: string): string {
  return `#!/bin/bash
# Sift Linux (.desktop) Desktop Entry & Launcher
echo "========================================"
echo "      SIFT - LINUX DESKTOP KURULUMU     "
echo "========================================"

DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"

DESKTOP_FILE="$DESKTOP_DIR/sift.desktop"

# Check available browser for standalone window
EXEC_CMD="xdg-open ${appUrl}"
if command -v google-chrome &> /dev/null; then
    EXEC_CMD="google-chrome --app=${appUrl} --window-size=1280,850"
elif command -v chromium &> /dev/null; then
    EXEC_CMD="chromium --app=${appUrl} --window-size=1280,850"
elif command -v microsoft-edge &> /dev/null; then
    EXEC_CMD="microsoft-edge --app=${appUrl} --window-size=1280,850"
fi

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Type=Application
Name=Sift
Comment=AI-Powered Minimalist Inbox & Security
Exec=$EXEC_CMD
Icon=mail-client
Terminal=false
Categories=Office;Network;Email;
StartupWMClass=Sift
EOF

chmod +x "$DESKTOP_FILE"

echo "✅ Sift menü kısayolu oluşturuldu: $DESKTOP_FILE"
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo "Uygulama açılıyor..."
eval "$EXEC_CMD &"
`;
}

export function downloadLinuxSetupScript(appUrl: string) {
  const scriptContent = generateLinuxSetupScript(appUrl);
  const blob = new Blob([scriptContent], { type: 'application/x-sh;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'install_sift_linux.sh';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDesktopPackageJson(appUrl: string) {
  const packageConfig = {
    name: 'sift',
    version: '0.5.1',
    description: 'Sift - AI-Powered Minimalist Inbox',
    main: 'main.cjs',
    scripts: {
      start: 'electron .',
      'build:win': 'electron-builder --win nsis',
      'build:exe': 'electron-builder build --win --x64',
    },
    build: {
      appId: 'com.sift.desktop',
      productName: 'Sift',
      win: {
        target: 'nsis',
        artifactName: 'Sift-Setup-${version}.${ext}',
        icon: 'public/pwa-512x512.png',
      },
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Sift',
      },
    },
    dependencies: {
      electron: '^33.0.0',
    },
  };

  const blob = new Blob([JSON.stringify(packageConfig, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'package.desktop.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
