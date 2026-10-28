import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

/** Add the small OS behaviours that a shared browser shell cannot provide. */
export function configureNativeShell(): void {
  const isMobile = Capacitor.isNativePlatform();
  const isDesktop = '__TAURI_INTERNALS__' in window;
  if (!isMobile && !isDesktop) return;

  if (isMobile) {
    void App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const destination = new URL(anchor.href, window.location.href);
    if (
      destination.origin === window.location.origin ||
      (destination.protocol !== 'https:' && destination.protocol !== 'http:')
    ) {
      return;
    }

    event.preventDefault();
    if (isMobile) {
      void Browser.open({ url: destination.toString() });
    } else {
      void import('@tauri-apps/plugin-opener').then(({ openUrl }) =>
        openUrl(destination.toString()),
      );
    }
  });
}
