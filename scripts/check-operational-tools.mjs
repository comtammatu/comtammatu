#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const EXTENSION_ROOTS = [
  "tools/grab-pos-relay-extension",
  "tools/shopeefood-pos-relay-extension",
];
const MATU_AGENT_ROOT = path.join(REPO_ROOT, "tools", "matu-agent");
const MATU_AGENT_SETTINGS = path.join(MATU_AGENT_ROOT, "settings.gradle.kts");
const MATU_AGENT_COMPANION_BUILD = path.join(
  MATU_AGENT_ROOT,
  "sunmi-compat",
  "build.gradle.kts",
);
const MATU_AGENT_QUEUE_SOURCE = path.join(
  MATU_AGENT_ROOT,
  "app",
  "src",
  "main",
  "java",
  "com",
  "comtammatu",
  "relay",
  "OrderQueueDbHelper.kt",
);
const MATU_AGENT_ACTIVITY_SOURCE = path.join(
  MATU_AGENT_ROOT,
  "app",
  "src",
  "main",
  "java",
  "com",
  "comtammatu",
  "relay",
  "MainActivity.kt",
);
const MATU_AGENT_RECEIPT_INSPECTOR_SOURCE = path.join(
  MATU_AGENT_ROOT,
  "app",
  "src",
  "main",
  "java",
  "com",
  "comtammatu",
  "relay",
  "ReceiptDataInspector.kt",
);
const MATU_AGENT_BOOT_SOURCE = path.join(
  MATU_AGENT_ROOT,
  "app",
  "src",
  "main",
  "java",
  "com",
  "comtammatu",
  "relay",
  "BootCompletedReceiver.kt",
);
const MATU_AGENT_SERVICE_SOURCE = path.join(
  MATU_AGENT_ROOT,
  "app",
  "src",
  "main",
  "java",
  "com",
  "comtammatu",
  "relay",
  "PrintIntakeService.kt",
);
const MATU_AGENT_NOTIFICATION_SOURCE = path.join(
  MATU_AGENT_ROOT,
  "app",
  "src",
  "main",
  "java",
  "com",
  "comtammatu",
  "relay",
  "AgentNotifications.kt",
);
const MATU_AGENT_MANIFEST = path.join(
  MATU_AGENT_ROOT,
  "app",
  "src",
  "main",
  "AndroidManifest.xml",
);
const GRADLE_WRAPPER_JAR = path.join(
  MATU_AGENT_ROOT,
  "gradle",
  "wrapper",
  "gradle-wrapper.jar",
);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function extensionJavaScriptFiles() {
  const files = [];
  for (const relativeRoot of EXTENSION_ROOTS) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    if (!fs.existsSync(absoluteRoot)) {
      fail(`Missing operational extension root: ${relativeRoot}`);
    }
    const stack = [absoluteRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(absolute);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          files.push(absolute);
        }
      }
    }
  }
  return files.sort();
}

for (const file of extensionJavaScriptFiles()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    fail(`Operational extension syntax check failed: ${path.relative(REPO_ROOT, file)}`);
  }
}

if (!fs.existsSync(GRADLE_WRAPPER_JAR)) {
  fail("Missing Má Tư Agent Gradle wrapper JAR");
}

const matuAgentSettings = fs.readFileSync(MATU_AGENT_SETTINGS, "utf8");
if (matuAgentSettings.includes('include(":sunmi-compat")')) {
  fail(
    "Má Tư Agent must build exactly one APK; remove the SUNMI compatibility application module",
  );
}
if (fs.existsSync(MATU_AGENT_COMPANION_BUILD)) {
  fail("Má Tư Agent must not ship a separate SUNMI compatibility APK");
}

const queueSource = fs.readFileSync(MATU_AGENT_QUEUE_SOURCE, "utf8");
const dismissStart = queueSource.indexOf("fun dismissWaitingOrder(");
const dismissEnd = queueSource.indexOf("fun compactResolvedOrders(", dismissStart);
const dismissImplementation = queueSource.slice(dismissStart, dismissEnd);
if (
  dismissStart < 0 ||
  dismissEnd < 0 ||
  !dismissImplementation.includes("COLUMN_STATUS, STATUS_DISMISSED") ||
  dismissImplementation.includes(".delete(")
) {
  fail(
    "Manual-entry resolution must retain the queue identity row in DISMISSED state",
  );
}

const activitySource = fs.readFileSync(MATU_AGENT_ACTIVITY_SOURCE, "utf8");
const bootSource = fs.readFileSync(MATU_AGENT_BOOT_SOURCE, "utf8");
const serviceSource = fs.readFileSync(MATU_AGENT_SERVICE_SOURCE, "utf8");
const manifestSource = fs.readFileSync(MATU_AGENT_MANIFEST, "utf8");
if (activitySource.includes("scrollLogs.fullScroll(")) {
  fail("Má Tư Agent log scrolling must not steal focus from the queue-first home viewport");
}
if (!bootSource.includes("KEY_AGENT_ENABLED")) {
  fail("Má Tư Agent boot recovery must respect the operator's persisted stopped state");
}
if (
  !manifestSource.includes("android.permission.POST_NOTIFICATIONS") ||
  !manifestSource.includes('android:foregroundServiceType="specialUse"') ||
  !manifestSource.includes("android.intent.action.MY_PACKAGE_REPLACED") ||
  !bootSource.includes("Intent.ACTION_MY_PACKAGE_REPLACED")
) {
  fail("Má Tư Agent must recover after boot and APK replacement with an Android 15-safe foreground service");
}
if (
  !fs.existsSync(MATU_AGENT_NOTIFICATION_SOURCE) ||
  !serviceSource.includes("PowerManager.PARTIAL_WAKE_LOCK") ||
  !serviceSource.includes("AgentNotifications.showIncomingOrder") ||
  !serviceSource.includes("restartServerAfterFailure()") ||
  !serviceSource.includes("receivedAnyBytes") ||
  !serviceSource.includes("IntakeListenPolicy.shouldRebindAll")
) {
  fail("Má Tư Agent must hold its intake runtime awake and surface each new order through a dedicated alert channel");
}
if (
  !activitySource.includes("ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS") ||
  !activitySource.includes("AutoStartManagementActivity") ||
  !activitySource.includes("POST_NOTIFICATIONS")
) {
  fail("Má Tư Agent must guide Redmi operators through autostart, battery, and notification permissions");
}
if (
  !fs.existsSync(MATU_AGENT_RECEIPT_INSPECTOR_SOURCE) ||
  !activitySource.includes("BottomNavigationView") ||
  !activitySource.includes("NavigationRailView") ||
  !activitySource.includes("TabLayout") ||
  !activitySource.includes("BottomSheetDialog")
) {
  fail("Má Tư Agent must use adaptive Material navigation and separate bitmap, text, and OCR receipt inspection");
}

const markSentStart = queueSource.indexOf("fun markOrderSent(");
const markSentEnd = queueSource.indexOf("private fun sentMappingValues(");
const markSent = markSentStart >= 0 && markSentEnd > markSentStart
  ? queueSource.slice(markSentStart, markSentEnd)
  : "";
if (
  !markSent ||
  markSent.includes("putNull(COLUMN_RECEIPT_TEXT)") ||
  /put\(COLUMN_RAW_BASE64,\s*""\)/.test(markSent)
) {
  fail("Sending to POS must keep receipt bitmap and OCR for operator inspection; only compactResolvedOrders may drop diagnostic payloads");
}
if (
  !queueSource.includes("fun compactResolvedOrders") ||
  !queueSource.includes("putNull(COLUMN_RECEIPT_TEXT)")
) {
  fail("Resolved-history cleanup must still drop heavy receipt payloads after the cashier no longer needs them");
}

const gradle = spawnSync(
  "java",
  [
    "-classpath",
    GRADLE_WRAPPER_JAR,
    "org.gradle.wrapper.GradleWrapperMain",
    "test",
    "--no-daemon",
  ],
  {
    cwd: MATU_AGENT_ROOT,
    encoding: "utf8",
    stdio: "inherit",
  },
);

if (gradle.error) {
  fail(`Could not start Má Tư Agent tests: ${gradle.error.message}`);
}
if (gradle.status !== 0) {
  fail(`Má Tư Agent tests failed with exit status ${gradle.status}`);
}

console.log("Operational tools: extension syntax and Má Tư Agent tests passed.");
