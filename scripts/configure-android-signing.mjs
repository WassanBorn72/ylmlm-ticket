import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Applied after Expo prebuild. Keys/passwords stay in process env, never in Gradle files.
for (const name of ['YURU_ANDROID_KEYSTORE_PATH', 'YURU_ANDROID_KEYSTORE_PASSWORD', 'YURU_ANDROID_KEY_ALIAS', 'YURU_ANDROID_KEY_PASSWORD']) {
  if (!process.env[name]) throw new Error(`${name} を設定してください。署名なし・debug鍵での正式リリースは行いません。`);
}
if (!existsSync(process.env.YURU_ANDROID_KEYSTORE_PATH)) throw new Error('署名用 keystore が見つかりません');
const file = 'android/app/build.gradle';
let gradle = readFileSync(file, 'utf8');
const marker = '// YuruTicket release signing';
if (!gradle.includes(marker)) {
  const start = gradle.indexOf('buildTypes {');
  const release = gradle.indexOf('release {', start);
  const signing = gradle.indexOf('signingConfig signingConfigs.debug', release);
  if (start < 0 || release < 0 || signing < 0) throw new Error('Expo の Gradle 形式が変わりました。署名設定を確認してください。');
  gradle = gradle.slice(0, signing) + gradle.slice(signing).replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.yuruRelease');
  // Create signing config before buildTypes refers to it.
  const config = `
    ${marker}
    signingConfigs {
        yuruRelease {
            storeFile file(System.getenv("YURU_ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("YURU_ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("YURU_ANDROID_KEY_ALIAS")
            keyPassword System.getenv("YURU_ANDROID_KEY_PASSWORD")
        }
    }
    `;
  gradle = gradle.slice(0, start) + config + gradle.slice(start);
  writeFileSync(file, gradle);
}
console.log('Android release signing configured (credential values are not stored).');
