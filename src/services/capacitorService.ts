import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const getPlatform = (): string => {
  return Capacitor.getPlatform();
};

/**
 * Initialize status bar styling for mobile devices
 */
export async function initCapacitorStatusBar(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0f172a' });
  } catch (err) {
    console.warn('Capacitor StatusBar başlatılamadı:', err);
  }
}

/**
 * Request notification permissions on native devices or fallback to browser Notification API
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      const status = await LocalNotifications.requestPermissions();
      return status.display === 'granted';
    } catch (err) {
      console.warn('Capacitor bildirim izni hatası:', err);
      return false;
    }
  } else if ('Notification' in window) {
    try {
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Send local notification on native device or browser
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  id: number = Math.floor(Math.random() * 100000)
): Promise<void> {
  if (isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id,
            schedule: { at: new Date(Date.now() + 500) },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_icon_config_sample',
          },
        ],
      });
    } catch (err) {
      console.warn('Capacitor bildirim gönderilemedi:', err);
    }
  } else if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
      });
    } catch {
      // Ignore fallback error
    }
  }
}
