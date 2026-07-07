export interface PlayerSettingsMenuState {
	waveformAlignedPlayhead: boolean;
	waveformShowAlignmentPoints: boolean;
	showWarpingMatrix: boolean;
}

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
