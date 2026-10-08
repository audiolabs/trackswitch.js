(function () {
	"use strict";

	var MODE_DEFAULT = "default";
	var MODE_SYNC = "sync";

	function readControl(root, name, fallback) {
		var control = root.querySelector(
			'input[name="' + name + '"], select[name="' + name + '"]',
		);
		if (!control) return fallback;
		return control.type === "checkbox" ? control.checked : control.value;
	}

	function markerLayer(sequence) {
		return { sequence: sequence, color: "#ed8c01", line: "dashed" };
	}

	/** Omits `markerLayers` entirely when there are none, rather than sending `[]`. */
	function withMarkerLayers(view, layers) {
		if (layers.length > 0) view.markerLayers = layers;
		return view;
	}

	/**
	 * What the player already assumes when an option is absent. The snippet is
	 * meant to read as the configuration someone would have to write themselves,
	 * so an option that only restates a default is noise. Pruning applies to the
	 * preview alone — the player is still handed every option explicitly, so the
	 * two can never disagree about behaviour.
	 */
	var OPTION_DEFAULTS = {
		features: {
			muteOtherPlayerInstances: true,
			customizablePanelOrder: false,
			tabView: false,
			keyboard: true,
		},
		// Nothing for `alignment`: outsideCoverage and duplicateAnchors both
		// default to "error", so the values the showcase sets are load-bearing.
		markerLayer: { line: "dashed", foldToReference: false },
		view: {
			navigationBar: { repeatEnabled: false, globalPanControl: "balance" },
			trackList: {
				trackVolumeControls: false,
				trackPanControls: false,
			},
			waveform: {
				height: 150,
				waveformBarWidth: 1,
				maxZoom: 5,
				playbackFollowMode: "center",
				timeAxis: "shared",
				alignedPlayhead: false,
				// No `timer`: a waveform reads `config.timer ?? isAlignmentMode()`, so
				// omitting it is not the same as setting it false once aligned.
			},
			pianoRoll: {
				height: 180,
				maxZoom: 5,
				playbackFollowMode: "center",
				timer: false,
			},
			sheetMusic: {
				maxWidth: 1000,
				maxHeight: 380,
				renderScale: 0.7,
				followPlayback: true,
				cursorAlpha: 0.4,
			},
			image: { seekable: false },
			perTrackImage: { seekable: false },
			text: { bold: false, italic: false, align: "center" },
			separator: { thickness: 2 },
		},
	};

	function withoutDefaults(source, defaults) {
		var result = {};
		Object.keys(source).forEach(function (key) {
			if (defaults && source[key] === defaults[key]) return;
			result[key] = source[key];
		});
		return result;
	}

	function prunedView(view) {
		var result = withoutDefaults(view, OPTION_DEFAULTS.view[view.type]);
		if (!result.markerLayers) return result;
		result.markerLayers = result.markerLayers.map(function (layer) {
			return withoutDefaults(layer, OPTION_DEFAULTS.markerLayer);
		});
		return result;
	}

	function prunedConfig(config) {
		var result = withoutDefaults(config, null);
		result.views = config.views.map(prunedView);
		if (config.features) {
			var features = withoutDefaults(config.features, OPTION_DEFAULTS.features);
			if (Object.keys(features).length === 0) delete result.features;
			else result.features = features;
		}
		return result;
	}

	function buildDefaultConfig(basePath, controls) {
		var stems = [
			{ id: "violins", title: "Violins", file: "violins" },
			{ id: "synths", title: "Synths", file: "synth" },
			{ id: "bass", title: "Bass", file: "bass" },
			{ id: "drums", title: "Drums", file: "drums" },
		];
		var media = {};

		// A stem's figure only means anything to a perTrackImage view, so neither
		// the image entries nor the imageID references exist without one.
		stems.forEach(function (stem) {
			media[stem.id] = {
				type: "audio",
				title: stem.title,
				src: basePath + "/" + stem.file + ".mp3",
			};
			if (controls.trackImageBySolo) {
				media[stem.id].imageID = stem.id + "Fig";
			}
		});
		if (controls.trackImageBySolo) {
			stems.forEach(function (stem) {
				media[stem.id + "Fig"] = {
					type: "image",
					src: basePath + "/" + stem.file + ".png",
				};
			});
		}
		if (controls.customImage) {
			media.cover = { type: "image", src: basePath + "/cover.png" };
		}

		var views = [];

		if (controls.customImage) {
			views.push({
				type: "image",
				mediaID: "cover",
				seekable: true,
			});
		}
		if (controls.trackImageBySolo) {
			views.push({ type: "perTrackImage", seekable: true });
		}
		if (controls.waveform) {
			views.push(
				withMarkerLayers(
					{ type: "waveform", playbackFollowMode: controls.playbackFollowMode },
					controls.markers ? [markerLayer("sections")] : [],
				),
			);
		}
		if (controls.text) {
			views.push({
				type: "text",
				text: "Choose which parts of the arrangement you want to hear.",
				bold: true,
				fontSize: 18,
			});
		}
		views.push({
			type: "trackList",
			tracks: ["violins", "synths", "bass", "drums"],
			// `comparisonGroup` names the selection the list belongs to, which lets one of
			// its tracks sound at a time. Without one the stems mix freely.
			comparisonGroup: controls.exclusiveSolo ? 0 : undefined,
			trackVolumeControls: controls.trackVolumeControls,
			trackPanControls: controls.trackPanControls,
		});
		views.unshift(buildNavigationBar(controls, true));

		var config = {
			media: media,
			views: views,
			features: buildFeatures(controls),
		};
		if (controls.markers) {
			config.markers = {
				sections: {
					type: "segments",
					src: basePath + "/showcase-markers.csv",
					timeCol: "time",
					labelCol: "label",
				},
			};
		}
		if (controls.presets) {
			config.presets = {
				all: {
					label: "All Tracks",
					tracks: ["violins", "synths", "bass", "drums"],
				},
				strings: {
					label: "Violins & Synths",
					tracks: ["violins", "synths"],
				},
				rhythm: { label: "Drums & Bass", tracks: ["bass", "drums"] },
				drumsOnly: { label: "Drums Only", tracks: ["drums"] },
			};
		}
		return config;
	}

	function buildAlignedConfig(basePath, controls) {
		var media = {};

		// The score and the MIDI only exist for the views that display them —
		// carrying either without its view would download and align a medium
		// nothing ever shows.
		if (controls.sheetNotePreview) {
			media.score = {
				type: "musicxml",
				src: basePath + "/Schubert_D911-03.xml",
			};
		}
		if (controls.pianoRoll) {
			media.midi = { type: "midi", src: basePath + "/Schubert_D911-03.mid" };
		}
		Object.assign(media, {
			hu33: {
				type: "audio",
				title: "Schubert: Winterreise, D. 911: No. 3 - HU33",
				src: basePath + "/Schubert_D911-03_HU33.wav",
				startOffsetMs: 200,
				endOffsetMs: 5800,
				srcTimeScaled: {
					src: basePath + "/Schubert_D911-03_HU33.wav",
					startOffsetMs: 200,
					endOffsetMs: 5800,
				},
			},
			sc06: {
				type: "audio",
				title: "Schubert: Winterreise, D. 911: No. 3 - SC06",
				src: basePath + "/Schubert_D911-03_SC06.wav",
				startOffsetMs: 600,
				endOffsetMs: 300,
				srcTimeScaled: {
					src: basePath + "/Schubert_D911-03_SC06_syncronized.wav",
						startOffsetMs: 300,
						endOffsetMs: 5800,
					},
				},
		});
		var views = [];
		var markerLayersA = controls.markers ? [markerLayer("hu33Measures")] : [];
		var markerLayersB = controls.markers ? [markerLayer("sc06Structure")] : [];

		if (controls.sheetNotePreview) {
			views.push({
				type: "sheetMusic",
				mediaID: "score",
				maxHeight: 370,
				renderScale: 0.65,
				followPlayback: true,
				cursorColor: "#999999",
				cursorAlpha: 0.4,
			});
		}
		if (controls.pianoRoll) {
			views.push(
				withMarkerLayers(
					{
						type: "pianoRoll",
						mediaID: "midi",
						height: 180,
						maxZoom: 5,
						pianoKeyboard: true,
						colorPerChannel: true,
						timer: true,
					},
					markerLayersA,
				),
			);
		}
		if (controls.text) {
			views.push({
				type: "text",
				text: "Compare these two aligned musical performances.",
				bold: true,
				fontSize: 18,
			});
		}
		if (controls.waveform) {
			var alignmentLayer = [
				{ sequence: "alignment", line: "dashed", foldToReference: true },
			];
			[
				{ track: "hu33", layers: markerLayersA },
				{ track: "sc06", layers: markerLayersB },
			].forEach(function (performance) {
				views.push(
					withMarkerLayers(
						{
							type: "waveform",
							tracks: [performance.track],
							height: 100,
							playbackFollowMode: controls.playbackFollowMode,
							timeAxis: controls.waveformTimeAxis,
							alignedPlayhead: controls.alignedPlayhead,
						},
						controls.showAlignmentPoints
							? performance.layers.concat(alignmentLayer)
							: performance.layers,
					),
				);
			});
		}
		if (controls.warpingMatrix) {
			views.push({ type: "warpingMatrix", x: "hu33", y: "sc06", height: 200 });
		}
		views.push({
			// The two performances sit on their own alignment timelines, so only one
			// of them can sound at a time.
			type: "trackList",
			tracks: ["hu33", "sc06"],
			comparisonGroup: 0,
			trackVolumeControls: controls.trackVolumeControls,
			trackPanControls: controls.trackPanControls,
		});
		views.unshift(buildNavigationBar(controls, false));

		// A timeline is only worth declaring for a medium the config still carries.
		var timelines = {};
		if (media.score) timelines.score = "measure_Schubert_D911-03_2";
		if (media.midi) timelines.midi = "time_Schubert_D911-03";
		timelines.hu33 = "time_Schubert_D911-03_HU33";
		timelines.sc06 = "time_Schubert_D911-03_SC06";

		var config = {
			media: media,
			alignment: {
				src: basePath + "/alignment.csv",
				referenceTimeline: "hu33",
				timelines: timelines,
				outsideCoverage: "hold",
				duplicateAnchors: "average",
			},
			views: views,
			features: buildFeatures(controls),
		};
		if (controls.markers) {
			config.markers = {
				hu33Measures: {
					type: "points",
					src: basePath + "/HU33-markers.csv",
					timeline: "hu33",
					timeCol: "start",
					labelCol: "label",
				},
				sc06Structure: {
					type: "segments",
					src: basePath + "/SC06-markers.csv",
					timeline: "sc06",
					timeCol: "start",
					labelCol: "structure",
					colors: {
						I: "var(--ts-color-channel-1)",
						A: "var(--ts-color-channel-2)",
						B: "var(--ts-color-channel-3)",
						C: "var(--ts-color-channel-4)",
					},
				},
			};
		}
		return config;
	}

	function buildFeatures(controls) {
		return {
			muteOtherPlayerInstances: controls.muteOtherPlayerInstances,
			customizablePanelOrder: controls.customizablePanelOrder,
			tabView: controls.tabView,
			keyboard: controls.keyboard,
		};
	}

	function buildNavigationBar(controls, includePresets) {
		return {
			type: "navigationBar",
			controls: [
				"playback",
				controls.globalVolume && "globalVolume",
				controls.globalPan && "globalPan",
				controls.markers && "markerNavigation",
				controls.looping && "looping",
				"sync",
				includePresets && controls.presets && "presets",
				controls.timer && "timer",
				controls.seekBar && "seekBar",
			].filter(Boolean),
			repeatEnabled: controls.repeatEnabled,
			globalPanControl: controls.globalPanControl,
		};
	}

	document.addEventListener("DOMContentLoaded", function () {
		var playerRoot = document.getElementById("ts-showcase-player");
		var controlsRoot = document.getElementById("ts-showcase-controls");
		var quickstart = document.getElementById("ts-dynamic-quickstart");
		var copyButton = document.getElementById("ts-copy-quickstart");
		var showcase = playerRoot ? playerRoot.closest(".ts-showcase") : null;
		var codeCallout = showcase
			? showcase.querySelector(".ts-showcase__code-callout")
			: null;
		var snippetPanel = showcase
			? showcase.querySelector(".ts-showcase__snippet-panel")
			: null;
		var modeButtons = document.querySelectorAll("[data-ts-mode-button]");
		var note = document.getElementById("ts-showcase-note");
		var mode = MODE_DEFAULT;
		var controller = null;
		var rebuildTimer = null;
		var previewHideTimer = null;

		if (!playerRoot || !controlsRoot || !window.TrackSwitch) return;

		function setSnippetPreviewVisible(visible) {
			if (showcase) {
				showcase.classList.toggle("is-snippet-preview-visible", visible);
			}
		}

		function cancelSnippetPreviewHide() {
			clearTimeout(previewHideTimer);
			previewHideTimer = null;
		}

		function scheduleSnippetPreviewHide() {
			cancelSnippetPreviewHide();
			previewHideTimer = setTimeout(function () {
				setSnippetPreviewVisible(false);
			}, 120);
		}

		function bindSnippetPreview(target) {
			target.addEventListener("mouseenter", function () {
				cancelSnippetPreviewHide();
				setSnippetPreviewVisible(true);
			});
			target.addEventListener("mouseleave", function () {
				scheduleSnippetPreviewHide();
			});
			target.addEventListener("focusin", function () {
				cancelSnippetPreviewHide();
				setSnippetPreviewVisible(true);
			});
			target.addEventListener("focusout", function (event) {
				if (!target.contains(event.relatedTarget)) {
					scheduleSnippetPreviewHide();
				}
			});
		}

		if (codeCallout) {
			bindSnippetPreview(codeCallout);
		}
		if (snippetPanel) {
			bindSnippetPreview(snippetPanel);
		}

		function controls() {
			var names = [
				"looping", "globalVolume", "trackVolumeControls",
				"customizablePanelOrder", "presets", "seekBar", "timer", "keyboard",
				"waveform", "pianoRoll", "text", "alignedPlayhead", "showAlignmentPoints",
				"markers", "sheetNotePreview", "warpingMatrix", "customImage",
				"trackImageBySolo", "exclusiveSolo", "tabView",
				"muteOtherPlayerInstances", "repeatEnabled"
			];
			// Controls the showcase does not expose keep the player's own default,
			// rather than being forced off by a blanket `false`.
			var fallbacks = { muteOtherPlayerInstances: true };
			var result = {};
			names.forEach(function (name) {
				result[name] = readControl(
					controlsRoot,
					name,
					fallbacks[name] === undefined ? false : fallbacks[name],
				);
			});
			result.playbackFollowMode = readControl(
				controlsRoot,
				"playbackFollowMode",
				"center",
			);
			result.waveformTimeAxis = readControl(
				controlsRoot,
				"waveformTimeAxis",
				"shared",
			);
			var trackPanControls = readControl(
				controlsRoot,
				"trackPanControls",
				"balance",
			);
			result.trackPanControls =
				trackPanControls === "off" ? false : trackPanControls;
			var globalPanControl = readControl(
				controlsRoot,
				"globalPanControl",
				"off",
			);
			result.globalPan = globalPanControl !== "off";
			result.globalPanControl =
				globalPanControl === "off" ? "balance" : globalPanControl;
			return result;
		}

		function configForCurrentMode() {
			var values = controls();
			var defaultBase =
				playerRoot.getAttribute("data-ts-default-base") ||
				playerRoot.getAttribute("data-ts-base") ||
				"assets/multitracks";
			var syncBase =
				playerRoot.getAttribute("data-ts-sync-base") || "assets/alignment";
			return mode === MODE_SYNC
				? buildAlignedConfig(syncBase, values)
				: buildDefaultConfig(defaultBase, values);
		}

		function updateWaveformTimeAxisAvailability() {
			var control = controlsRoot.querySelector(
				'select[name="waveformTimeAxis"]',
			);
			if (!control) return;
			var waveformEnabled = readControl(controlsRoot, "waveform", false);
			var disabled = mode !== MODE_SYNC || !waveformEnabled;
			control.disabled = disabled;
			var row = control.closest(".ts-control-row");
			if (row) row.classList.toggle("is-disabled", disabled);
		}

		function updateSoloModeVisibility() {
			var control = controlsRoot.querySelector('input[name="exclusiveSolo"]');
			if (!control) return;
			var row = control.closest(".ts-control-row");
			if (row) row.classList.toggle("is-hidden", mode === MODE_SYNC);
		}

		function updatePresetVisibility() {
			var control = controlsRoot.querySelector('input[name="presets"]');
			if (!control) return;
			var row = control.closest(".ts-control-row");
			if (row) row.classList.toggle("is-hidden", mode === MODE_SYNC);
		}

		function updateDefaultVisualizationControlVisibility() {
			["customImage", "trackImageBySolo"].forEach(
				function (name) {
					var control = controlsRoot.querySelector(
						'input[name="' + name + '"]',
					);
					if (!control) return;
					var row = control.closest(".ts-control-row");
					if (row) row.classList.toggle("is-hidden", mode === MODE_SYNC);
				},
			);
		}

		function updateAlignmentControlVisibility() {
			[
				"alignedPlayhead",
				"showAlignmentPoints",
				"waveformTimeAxis",
				"pianoRoll",
				"sheetNotePreview",
				"warpingMatrix",
			].forEach(function (name) {
				var control = controlsRoot.querySelector(
					'input[name="' + name + '"], select[name="' + name + '"]',
				);
				if (!control) return;
				var row = control.closest(".ts-control-row");
				if (row) row.classList.toggle("is-hidden", mode !== MODE_SYNC);
			});
		}

		function updateTrackBasedImageAvailability() {
			var control = controlsRoot.querySelector(
				'input[name="trackImageBySolo"]',
			);
			if (!control) return;
			var disabled = !readControl(controlsRoot, "exclusiveSolo", false);
			control.disabled = disabled;
			if (disabled) control.checked = false;
			var row = control.closest(".ts-control-row");
			if (row) {
				row.classList.toggle("is-disabled", disabled);
				row.title = disabled ? "Solo Mode needs to be activated." : "";
			}
		}

		function escapeHtml(value) {
			return value
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");
		}

		function highlightJson(value) {
			return escapeHtml(value).replace(
				/("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
				function (match, key, string, booleanValue, nullValue, number) {
					if (key) return '<span class="ts-code-key">' + key + "</span>";
					if (string) return '<span class="ts-code-string">' + string + "</span>";
					if (booleanValue) return '<span class="ts-code-bool">' + booleanValue + "</span>";
					if (nullValue) return '<span class="ts-code-null">' + nullValue + "</span>";
					return '<span class="ts-code-number">' + number + "</span>";
				},
			);
		}

		function highlightedConfig(config) {
			return highlightJson(JSON.stringify(prunedConfig(config), null, 2));
		}

		function render(createNewPlayer) {
			var config;
			config = configForCurrentMode();
			if (createNewPlayer && controller) {
				controller.destroy();
				playerRoot.replaceChildren();
				controller = null;
			}
			if (controller) {
				controller.setRepeat(readControl(controlsRoot, "repeatEnabled", false));
				controller.updateConfig(config);
			} else {
				controller = window.TrackSwitch.createTrackSwitch(playerRoot, config);
				controller.load();
			}
			if (quickstart) {
				quickstart.innerHTML = highlightedConfig(config);
				quickstart.className = "language-json";
			}
			if (note) note.textContent = "";
		}

		function scheduleRender() {
			clearTimeout(rebuildTimer);
			rebuildTimer = setTimeout(render, 120);
		}

		controlsRoot.addEventListener("change", function () {
			updateWaveformTimeAxisAvailability();
			updateSoloModeVisibility();
			updatePresetVisibility();
			updateDefaultVisualizationControlVisibility();
			updateAlignmentControlVisibility();
			updateTrackBasedImageAvailability();
			scheduleRender();
		});
		Array.prototype.forEach.call(
			modeButtons,
			function (button) {
				button.addEventListener("click", function () {
					mode = button.getAttribute("data-ts-mode") || MODE_DEFAULT;
					Array.prototype.forEach.call(
						modeButtons,
						function (entry) {
							var active = entry === button;
							entry.classList.toggle("is-active", active);
							entry.setAttribute("aria-selected", String(active));
						},
					);
					updateWaveformTimeAxisAvailability();
					updateSoloModeVisibility();
					updatePresetVisibility();
					updateDefaultVisualizationControlVisibility();
					updateAlignmentControlVisibility();
					updateTrackBasedImageAvailability();
					render(true);
				});
			},
		);

		if (copyButton) {
			copyButton.addEventListener("click", function () {
				var text = quickstart ? quickstart.textContent || "" : "";
				navigator.clipboard.writeText(text).then(function () {
					copyButton.textContent = "Copied";
					setTimeout(function () { copyButton.textContent = "Copy to clipboard"; }, 1200);
				});
			});
		}

		updateWaveformTimeAxisAvailability();
		updateSoloModeVisibility();
		updatePresetVisibility();
		updateDefaultVisualizationControlVisibility();
		updateAlignmentControlVisibility();
		updateTrackBasedImageAvailability();
		render();
	});
})();
