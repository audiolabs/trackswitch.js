import type { WaveformPlaybackFollowMode } from "../core-adapter";

export interface PlayerSettingsMenuState {
	waveformAlignedPlayhead: boolean;
	waveformShowAlignmentPoints: boolean;
	showWarpingMatrix: boolean;
	playbackFollowMode: WaveformPlaybackFollowMode;
}

const PLAYBACK_FOLLOW_MODE_OPTIONS: Array<{
	value: WaveformPlaybackFollowMode;
	label: string;
}> = [
	{ value: "off", label: "Off" },
	{ value: "center", label: "Center" },
	{ value: "jump", label: "Jump" },
];

export function buildPlayerSettingsMenuHtml(
	state: PlayerSettingsMenuState,
): string {
	return (
		'<div class="ts-player-settings-menu" role="dialog" aria-label="Player settings">' +
		'<div class="ts-player-settings-title">Display</div>' +
		'<div class="ts-player-settings-group">' +
		buildToggleRowHtml(
			"aligned-playhead",
			"Aligned playhead",
			state.waveformAlignedPlayhead,
		) +
		buildToggleRowHtml(
			"show-alignment-points",
			"Show all alignment points",
			state.waveformShowAlignmentPoints,
		) +
		buildToggleRowHtml(
			"show-warping-matrix",
			"Show warping matrix",
			state.showWarpingMatrix,
		) +
		buildSelectRowHtml(
			"playback-follow-mode",
			"Follow playback",
			PLAYBACK_FOLLOW_MODE_OPTIONS,
			state.playbackFollowMode,
		) +
		"</div>" +
		'<div class="ts-player-settings-footer">' +
		'<button class="ts-player-settings-action" type="button" data-settings-action="export-csv">' +
		"Export CSV" +
		"</button>" +
		'<button class="ts-player-settings-action" type="button" data-settings-action="alignment-setup">' +
		"Back to alignment setup" +
		"</button>" +
		"</div>" +
		"</div>"
	);
}

function buildSelectRowHtml(
	id: string,
	title: string,
	options: Array<{ value: string; label: string }>,
	selectedValue: string,
): string {
	const optionsHtml = options
		.map(
			(option) =>
				'<option value="' +
				option.value +
				'"' +
				(option.value === selectedValue ? " selected" : "") +
				">" +
				option.label +
				"</option>",
		)
		.join("");

	return (
		'<label class="ts-player-settings-row">' +
		'<span class="ts-player-settings-label">' +
		title +
		"</span>" +
		'<select class="ts-player-settings-select" data-setting-id="' +
		id +
		'">' +
		optionsHtml +
		"</select>" +
		"</label>"
	);
}

function buildToggleRowHtml(
	id: string,
	title: string,
	checked: boolean,
): string {
	return (
		'<label class="ts-player-settings-row">' +
		'<span class="ts-player-settings-label">' +
		title +
		"</span>" +
		'<span class="ts-player-settings-switch">' +
		'<input class="ts-player-settings-input" type="checkbox" data-setting-id="' +
		id +
		'"' +
		(checked ? " checked" : "") +
		">" +
		'<span class="ts-player-settings-knob" aria-hidden="true"></span>' +
		"</span>" +
		"</label>"
	);
}
