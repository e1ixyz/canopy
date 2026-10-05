/** Set by electron.vite.config.ts: the debug server exists only in dev and ORCH_DEBUG_BUILD=1 builds */
declare const __DEBUG_SERVER__: boolean
/** The commit HEAD pointed at when the app was built ('' when git wasn't available) */
declare const __BUILD_SHA__: string
/** The checkout an install-app build came from, for the self-updater ('' in dev and release builds) */
declare const __SOURCE_DIR__: string
