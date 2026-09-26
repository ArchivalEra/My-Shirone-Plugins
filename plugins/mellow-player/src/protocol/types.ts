/**
 * @shirone-plugins/mellow-player — the public configuration surface.
 *
 * The plugin renders structure and never copy: every string a reader can see
 * arrives through `PlayerLabels`, which the host resolves from its own locale
 * modules. A surface mounted without a complete label set would ship blank
 * accessibility names, so `resolvePlayerConfig` reports the gap and leaves the
 * host site untouched instead of degrading silently.
 */

/** Which playback engine drives a surface. */
export type EngineName = "native" | "mellow";

/** How an embed picks its engine when it does not name one. */
export type EnginePreference = "auto" | "native" | "mellow";

/** Every reader-visible string the player renders. */
export interface PlayerLabels {
	play: string;
	pause: string;
	mute: string;
	unmute: string;
	seek: string;
	volume: string;
	rate: string;
	fullscreen: string;
	exitFullscreen: string;
	loading: string;
	error: string;
	diagnostics: string;
	engine: string;
	engineNative: string;
	engineMellow: string;
	requests: string;
	transferred: string;
	hardware: string;
	hardwareEnabled: string;
	hardwareDisabled: string;
	startup: string;
	seekLatency: string;
}

/**
 * The label keys a host must supply, kept as data so the resolution result can
 * name exactly which ones are missing.
 */
export const PLAYER_LABEL_KEYS: readonly (keyof PlayerLabels)[] = [
	"play",
	"pause",
	"mute",
	"unmute",
	"seek",
	"volume",
	"rate",
	"fullscreen",
	"exitFullscreen",
	"loading",
	"error",
	"diagnostics",
	"engine",
	"engineNative",
	"engineMellow",
	"requests",
	"transferred",
	"hardware",
	"hardwareEnabled",
	"hardwareDisabled",
	"startup",
	"seekLatency",
];

/** Raw configuration as an `astro.config.mjs` author writes it. */
export interface PlayerOptionsInput {
	enabled?: boolean;
	engine?: EnginePreference;
	/**
	 * URL of an ES module whose namespace exports `HeadlessPlayer`. It must be
	 * site-root absolute (`/vendor/…`) or an absolute `http(s):` URL, because
	 * the runtime hands it straight to a dynamic `import()`. `null` — or any
	 * other value — leaves the Mellow engine unavailable while the native
	 * engine keeps working.
	 */
	engineUrl?: string | null;
	/** How long to wait for the Mellow module before failing the load. */
	engineTimeoutMs?: number;
	/** Show the transport-accounting panel. Off by default. */
	diagnostics?: boolean;
	labels?: Partial<PlayerLabels>;
	/** Path prefixes the runtime is allowed to enhance. Empty means everywhere. */
	routeFilter?: string[];
}

/** Configuration after defaults, validation and label normalisation. */
export interface ResolvedPlayerConfig {
	engine: EnginePreference;
	engineUrl: string | null;
	engineTimeoutMs: number;
	diagnostics: boolean;
	labels: PlayerLabels;
	routeFilter: string[];
}

/** Why the plugin declined to install itself. */
export type PlayerDisableReason = "disabled" | "incomplete-labels";

export interface PlayerConfigResolution {
	enabled: boolean;
	reason: PlayerDisableReason | null;
	missingLabels: (keyof PlayerLabels)[];
	config: ResolvedPlayerConfig | null;
}

export const DEFAULT_ENGINE_TIMEOUT_MS = 15_000;
