import test from "node:test";
import assert from "node:assert/strict";

import {
	clamp,
	describeFailure,
	formatBytes,
	formatDuration,
	formatLatency,
} from "../dist/index.js";

test("formatDuration pads seconds and grows into hours", () => {
	assert.equal(formatDuration(0), "0:00");
	assert.equal(formatDuration(7), "0:07");
	assert.equal(formatDuration(59.9), "0:59");
	assert.equal(formatDuration(271), "4:31");
	assert.equal(formatDuration(3600), "1:00:00");
	assert.equal(formatDuration(3723), "1:02:03");
});

test("formatDuration reports zero for values a media element has not resolved", () => {
	assert.equal(formatDuration(Number.NaN), "0:00");
	assert.equal(formatDuration(Number.POSITIVE_INFINITY), "0:00");
	assert.equal(formatDuration(-5), "0:00");
});

test("formatBytes uses decimal units because it reports wire traffic", () => {
	assert.equal(formatBytes(0), "0 B");
	assert.equal(formatBytes(512), "512 B");
	assert.equal(formatBytes(999), "999 B");
	assert.equal(formatBytes(1000), "1.0 KB");
	assert.equal(formatBytes(1234), "1.2 KB");
	assert.equal(formatBytes(12345), "12 KB");
	assert.equal(formatBytes(1_500_000), "1.5 MB");
	assert.equal(formatBytes(2_500_000_000), "2.5 GB");
});

test("formatBytes reports zero for missing or negative accounting", () => {
	assert.equal(formatBytes(Number.NaN), "0 B");
	assert.equal(formatBytes(-1), "0 B");
});

test("formatLatency switches to seconds past a thousand milliseconds", () => {
	assert.equal(formatLatency(0), "0 ms");
	assert.equal(formatLatency(412.4), "412 ms");
	assert.equal(formatLatency(999), "999 ms");
	assert.equal(formatLatency(1350), "1.35 s");
	assert.equal(formatLatency(Number.NaN), "0 ms");
	assert.equal(formatLatency(-1), "0 ms");
});

test("clamp maps anything non-finite to the floor", () => {
	assert.equal(clamp(0.5, 0, 1), 0.5);
	assert.equal(clamp(5, 0, 1), 1);
	assert.equal(clamp(-2, 0, 1), 0);
	assert.equal(clamp(Number.NaN, 0, 1), 0);
	assert.equal(clamp(Number.POSITIVE_INFINITY, 0, 100), 100);
	assert.equal(clamp(Number.NEGATIVE_INFINITY, 0, 100), 0);
});

test("describeFailure prefers the message a human can act on", () => {
	assert.equal(describeFailure(new Error("HTTP 416")), "HTTP 416");
	assert.equal(describeFailure(new Error("")), "Error");
	assert.equal(describeFailure("plain text"), "plain text");
	assert.equal(describeFailure("   "), "unknown");
	assert.equal(describeFailure(undefined), "unknown");
	assert.equal(describeFailure(42), "42");
	assert.equal(describeFailure({ code: 4 }), '{"code":4}');
});

test("describeFailure survives a value that cannot be serialized", () => {
	const circular = {};
	circular.self = circular;
	assert.equal(describeFailure(circular), "unknown");
});
