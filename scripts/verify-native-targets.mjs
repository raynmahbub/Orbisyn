import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mobileRoot = resolve(root, 'apps/mobile');
const desktopRoot = resolve(root, 'apps/desktop/src-tauri');
const mobileConfig = readFileSync(resolve(mobileRoot, 'capacitor.config.ts'), 'utf8');
const desktopConfig = JSON.parse(readFileSync(resolve(desktopRoot, 'tauri.conf.json'), 'utf8'));

for (const [platform, path] of [
  ['iOS Xcode project', 'ios/App/App.xcodeproj/project.pbxproj'],
  ['Android Gradle application', 'android/app/build.gradle'],
]) {
  assert.ok(existsSync(resolve(mobileRoot, path)), `${platform} scaffold is missing`);
}
assert.match(mobileConfig, /appId:\s*'org\.orbisyn\.store'/);
assert.match(mobileConfig, /iosScheme:\s*'capacitor'/);
assert.match(mobileConfig, /androidScheme:\s*'https'/);
assert.ok(existsSync(resolve(desktopRoot, 'Cargo.toml')), 'Tauri Rust package is missing');
assert.ok(existsSync(resolve(desktopRoot, 'src/main.rs')), 'Tauri entrypoint is missing');
assert.equal(desktopConfig.identifier, 'org.orbisyn.store');
assert.equal(desktopConfig.bundle.targets, 'all');
assert.equal(
  resolve(desktopRoot, desktopConfig.build.frontendDist),
  resolve(root, 'apps/web/dist'),
  'desktop shell must bundle the shared storefront output',
);

console.log('Native target scaffolds verified: iOS, Android, Windows, macOS and Linux.');
