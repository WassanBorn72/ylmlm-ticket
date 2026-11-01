import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../node_modules/expo/bin/cli',import.meta.url));
const config=JSON.parse(execFileSync(process.execPath,[cli,'config','--type','introspect','--json'],{encoding:'utf8',env:{...process.env,EXPO_OFFLINE:'1',EXPO_NO_TELEMETRY:'1'}}));
const mods=config._internal.modResults;
assert.ok(!('aps-environment' in mods.ios.entitlements),'Local notifications must not require an APNs entitlement');
assert.ok(!(mods.ios.infoPlist.UIBackgroundModes ?? []).includes('remote-notification'),'No remote notification background mode');
const entries=mods.android.manifest.manifest['uses-permission'] ?? [];
const allowed=name=>entries.some(entry=>entry.$['android:name']===name&&entry.$['tools:node']!=='remove');
assert.ok(allowed('android.permission.POST_NOTIFICATIONS'),'Local notifications need Android notification permission');
for(const permission of ['READ_CALENDAR','WRITE_CALENDAR','SCHEDULE_EXACT_ALARM'])assert.ok(!allowed(`android.permission.${permission}`),`Unexpected ${permission} permission`);
console.log('PASS: local notifications without APNs/exact-alarm entitlement; calendar access stays blocked');

const autolinking=fileURLToPath(new URL('../node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js',import.meta.url));
const linked=JSON.parse(execFileSync(process.execPath,[autolinking,'resolve','--platform','android','--json'],{encoding:'utf8'}));
assert.ok(linked.modules.some(module=>module.packageName==='ticket-widget'&&module.projects.some(project=>project.modules.some(item=>item.classifier==='jp.ylmlm.unofficial.ticket.widget.TicketWidgetModule'))),'Widget module must be linked into Android');
console.log('PASS: Android home widgets module is autolinked');
