/**
 * @shirone-plugins/mellow-player
 *
 * A Material 3 Expressive playback surface for Shirone, and the engine seam
 * underneath it: the native video element by default, Mellow-Player's bounded
 * range WebCodecs pipeline when the source is Matroska and an engine module is
 * configured.
 */

export * from "./config.js";
export * from "./format.js";
export * from "./protocol/types.js";

export * from "./engine/engine.js";
export * from "./engine/mellow.js";
export * from "./engine/native.js";
export * from "./engine/probe.js";
export * from "./engine/selection.js";
export * from "./engine/ticket.js";

export * from "./runtime/enhance.js";

export * from "./integration.js";
export { default } from "./integration.js";
