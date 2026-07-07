(function () {
	"use strict";

	var MODE_DEFAULT = "default";
	var MODE_SYNC = "sync";
	var MODE_INTERACTIVE = "interactive";
	function createBaseTracks(basePath) {
		return [
			{
				title: "Violins",
				image: basePath + "/violins.png",
				presets: [0, 1],
				sources: [{ src: basePath + "/violins.mp3" }],
			},
			{
				title: "Synths",
				image: basePath + "/synth.png",
				presets: [0, 1],
				sources: [{ src: basePath + "/synth.mp3" }],
			},
			{
				title: "Bass",
				image: basePath + "/bass.png",
				presets: [0, 2],
				sources: [{ src: basePath + "/bass.mp3" }],
			},
			{
				title: "Drums",
				image: basePath + "/drums.png",
				presets: [0, 2, 3],
				sources: [{ src: basePath + "/drums.mp3" }],
			},
		];
	}

	function createAlignmentTracks(basePath) {
		return [
			{
				title: "Schubert: Winterreise, D. 911: No. 3 - HU33",
				sources: [{ src: basePath + "/Schubert_D911-03_HU33.wav" }],
				alignment: {
					column: "time_Schubert_D911-03_HU33",
					synchronizedSources: [
						{ src: basePath + "/Schubert_D911-03_HU33.wav" },
					],
				},
			},
			{
				title: "Schubert: Winterreise, D. 911: No. 3 - SC06",
				sources: [{ src: basePath + "/Schubert_D911-03_SC06.wav" }],
				alignment: {
					column: "time_Schubert_D911-03_SC06",
					synchronizedSources: [
						{ src: basePath + "/Schubert_D911-03_SC06_syncronized.wav" },
					],
				},
			},
		];
	}

	function stripSnippetPath(value) {
		return value.replace(/^\//, "");
	}

	function createAlignmentSnippetTracks() {
		return createAlignmentTracks("").map(function (track) {
			var normalizedTrack = Object.assign({}, track);
			normalizedTrack.sources = track.sources.map(function (source) {
				return { src: stripSnippetPath(source.src) };
			});
			normalizedTrack.alignment = Object.assign({}, track.alignment, {
				synchronizedSources: track.alignment.synchronizedSources.map(
					function (source) {
						return { src: stripSnippetPath(source.src) };
					},
				),
			});
			return normalizedTrack;
		});
	}

	function createBaseSnippetTracks(options) {
		return createBaseTracks("").map(function (track) {
			var normalizedTrack = Object.assign({}, track);
			normalizedTrack.sources = track.sources.map(function (source) {
				return { src: stripSnippetPath(source.src) };
			});

			if (options.includeImages && normalizedTrack.image) {
				normalizedTrack.image = stripSnippetPath(normalizedTrack.image);
			} else {
				delete normalizedTrack.image;
			}

			if (!options.includePresets) {
				delete normalizedTrack.presets;
			}

			return normalizedTrack;
		});
	}

	var CONTROL_NAMES = [
		"looping",
		"globalVolume",
		"trackVolumeControls",
		"trackPanControls",
		"customizablePanelOrder",
		"presets",
		"seekBar",
		"timer",
		"keyboard",
		"waveform",
		"midi",
		"text",
		"waveformPlaybackFollowMode",
		"alignedPlayhead",
		"showAlignmentPoints",
		"sheetNotePreview",
		"warpingMatrix",
		"customImage",
		"seekableImage",
		"trackImageBySolo",
		"exclusiveSolo",
		"tabView",
		"muteOtherPlayerInstances",
		"iosAudioUnlock",
		"repeatEnabled",
	];

	var REBUILD_TOGGLE_NAMES = [
		"looping",
		"globalVolume",
		"trackVolumeControls",
		"trackPanControls",
		"customizablePanelOrder",
		"presets",
		"seekBar",
		"timer",
		"keyboard",
		"waveform",
		"midi",
		"text",
		"waveformPlaybackFollowMode",
		"alignedPlayhead",
		"showAlignmentPoints",
		"sheetNotePreview",
		"warpingMatrix",
		"customImage",
		"seekableImage",
		"trackImageBySolo",
		"exclusiveSolo",
		"tabView",
		"muteOtherPlayerInstances",
		"iosAudioUnlock",
	];

	var MODE_DISABLED_CONTROLS = {
		default: [
			"sheetNotePreview",
			"midi",
			"warpingMatrix",
			"alignedPlayhead",
			"showAlignmentPoints",
		],
		sync: [
			"customImage",
			"seekableImage",
			"presets",
			"exclusiveSolo",
			"trackImageBySolo",
		],
		interactive: CONTROL_NAMES.slice(),
	};
	var MODE_HIDDEN_GROUPS = {
		default: [],
		sync: [],
		interactive: ["playback", "visualizations", "utils"],
	};

	var DEFAULT_MODEL = {
		looping: true,
		globalVolume: true,
		trackVolumeControls: true,
		trackPanControls: true,
		customizablePanelOrder: false,
		presets: true,
		seekBar: true,
		timer: true,
		keyboard: true,
		waveform: true,
		midi: false,
		text: false,
		waveformPlaybackFollowMode: "off",
		alignedPlayhead: false,
		showAlignmentPoints: false,
		sheetNotePreview: false,
		warpingMatrix: false,
		customImage: false,
		seekableImage: false,
		trackImageBySolo: false,
		exclusiveSolo: false,
		tabView: false,
		muteOtherPlayerInstances: true,
		iosAudioUnlock: true,
		repeatEnabled: false,
	};

	var ALIGNMENT_DEFAULT_MODEL = Object.assign({}, DEFAULT_MODEL, {
		presets: false,
		customImage: false,
		seekableImage: false,
		trackImageBySolo: false,
		midi: false,
		sheetNotePreview: true,
		warpingMatrix: false,
		exclusiveSolo: true,
	});
	var INTERACTIVE_DEFAULT_MODEL = Object.assign({}, ALIGNMENT_DEFAULT_MODEL, {
		looping: true,
		globalVolume: true,
		trackVolumeControls: true,
		trackPanControls: true,
		seekBar: true,
		timer: true,
		keyboard: true,
	});

	document.addEventListener("DOMContentLoaded", function () {
		var SVG_NS = "http://www.w3.org/2000/svg";
		var showcaseRoot = document.querySelector(".ts-showcase");
		var playerRoot = document.getElementById("ts-showcase-player");
		var controlsRoot = document.getElementById("ts-showcase-controls");
		var codeCallout = document.querySelector(".ts-showcase__code-callout");
		var snippetPanel = document.querySelector(".ts-showcase__snippet-panel");
		var guideArrow = document.querySelector(".ts-showcase__guide-arrow");
		var noteElement = document.getElementById("ts-showcase-note");
		var quickstartElement = document.getElementById("ts-dynamic-quickstart");
		var copyQuickstartButton = document.getElementById("ts-copy-quickstart");
		var modeButtons = [];
		var defaultBasePath;
		var alignmentBasePath;
		var interactiveWorkerPath;
		var currentMode = MODE_DEFAULT;
		var modelByMode;
		var controller = null;
		var controllerMode = null;
		var rebuildDebounceTimer = null;
		var rebuildToken = 0;
		var quickstartText = "";
		var snippetPreviewHideTimer = null;
		var arrowFrame = null;
		var arrowPath = null;
		var arrowHeadPath = null;

		if (
			!playerRoot ||
			!controlsRoot ||
			typeof window.TrackSwitch === "undefined" ||
			typeof window.TrackSwitch.createDefaultTrackSwitch !== "function" ||
			typeof window.TrackSwitch.createTrackSwitchSyncPlayer !== "function" ||
			typeof window.TrackSwitch.createTrackSwitchSyncInteractive !==
				"function"
		) {
			return;
		}

		defaultBasePath =
			playerRoot.getAttribute("data-ts-default-base") ||
			playerRoot.getAttribute("data-ts-base") ||
			"assets/multitracks";
		alignmentBasePath =
			playerRoot.getAttribute("data-ts-sync-base") || "assets/alignment";
		interactiveWorkerPath =
			playerRoot.getAttribute("data-ts-interactive-worker") ||
			"js/trackswitch-interactive-worker.js";

		modeButtons = Array.prototype.slice.call(
			controlsRoot.querySelectorAll("[data-ts-mode-button]"),
		);

		modelByMode = {
			default: Object.assign({}, DEFAULT_MODEL),
			sync: Object.assign({}, ALIGNMENT_DEFAULT_MODEL),
			interactive: Object.assign({}, INTERACTIVE_DEFAULT_MODEL),
		};

		function isAlignmentMode(mode) {
			return mode === MODE_SYNC;
		}

		function isInteractiveMode(mode) {
			return mode === MODE_INTERACTIVE;
		}

		function getBasePathForMode(mode) {
			return isAlignmentMode(mode) ? alignmentBasePath : defaultBasePath;
		}

		function getControl(name) {
			return controlsRoot.querySelector(
				'input[name="' + name + '"], select[name="' + name + '"]',
			);
		}

		function getModeDisabledControlNames(mode) {
			return MODE_DISABLED_CONTROLS[mode] || [];
		}

		function getModeHiddenGroupNames(mode) {
			return MODE_HIDDEN_GROUPS[mode] || [];
		}

		function isControlUnavailableInMode(name, mode) {
			return getModeDisabledControlNames(mode).indexOf(name) !== -1;
		}

		function isControlDisabled(name, model, mode) {
			if (isControlUnavailableInMode(name, mode)) {
				return true;
			}

			if (name === "waveformPlaybackFollowMode" && !model.waveform) {
				return true;
			}

			if (name === "alignedPlayhead" && !model.waveform) {
				return true;
			}

			if (name === "showAlignmentPoints" && !model.waveform) {
				return true;
			}

			if (name === "seekableImage" && !model.customImage) {
				return true;
			}

			if (name === "trackImageBySolo" && !model.exclusiveSolo) {
				return true;
			}

			if (name === "presets" && model.exclusiveSolo) {
				return true;
			}

			return false;
		}

		function syncModeTabs() {
			modeButtons.forEach(function (button) {
				var modeName = button.getAttribute("data-ts-mode") || MODE_DEFAULT;
				var isActive = modeName === currentMode;
				button.classList.toggle("is-active", isActive);
				button.setAttribute("aria-selected", isActive ? "true" : "false");
			});
		}

		function setNote(messages) {
			if (!noteElement) {
				return;
			}
			var hasMessages = Array.isArray(messages) && messages.length > 0;
			noteElement.textContent = hasMessages ? messages.join(" ") : "";
			noteElement.classList.toggle("is-visible", hasMessages);
		}

		function setSnippetPreviewVisible(isVisible) {
			if (!showcaseRoot || !snippetPanel) {
				return;
			}

			showcaseRoot.classList.toggle("is-snippet-preview-visible", isVisible);
		}

		function clearSnippetPreviewHideTimer() {
			if (!snippetPreviewHideTimer) {
				return;
			}

			clearTimeout(snippetPreviewHideTimer);
			snippetPreviewHideTimer = null;
		}

		function scheduleSnippetPreviewHide() {
			clearSnippetPreviewHideTimer();
			snippetPreviewHideTimer = setTimeout(function () {
				setSnippetPreviewVisible(false);
				snippetPreviewHideTimer = null;
			}, 100);
		}

		function bindSnippetPreviewHover() {
			if (!codeCallout || !snippetPanel) {
				return;
			}

			[codeCallout, snippetPanel].forEach(function (element) {
				element.addEventListener("mouseenter", function () {
					clearSnippetPreviewHideTimer();
					setSnippetPreviewVisible(true);
				});

				element.addEventListener("mouseleave", function () {
					scheduleSnippetPreviewHide();
				});

				element.addEventListener("focusin", function () {
					clearSnippetPreviewHideTimer();
					setSnippetPreviewVisible(true);
				});

				element.addEventListener("focusout", function () {
					setTimeout(function () {
						if (
							codeCallout.contains(document.activeElement) ||
							snippetPanel.contains(document.activeElement)
						) {
							return;
						}

						scheduleSnippetPreviewHide();
					}, 0);
				});
			});
		}

		function updateGuideArrowGeometry() {
			var showcaseRect;
			var playerRect;
			var codeRect;
			var startX;
			var startY;
			var endX;
			var endY;
			var control1X;
			var control1Y;
			var control2X;
			var control2Y;
			var tangentX;
			var tangentY;
			var tangentLength;
			var directionX;
			var directionY;
			var headLength = 11;
			var headWidth = 5.5;
			var headBaseX;
			var headBaseY;
			var leftX;
			var leftY;
			var rightX;
			var rightY;

			arrowFrame = null;
			if (!guideArrow || !showcaseRoot || !codeCallout) {
				return;
			}

			ensureGuideArrowSvg();
			if (!arrowPath || !arrowHeadPath) {
				return;
			}

			if (window.matchMedia("(max-width: 1360px)").matches) {
				arrowPath.setAttribute("d", "");
				arrowHeadPath.setAttribute("d", "");
				return;
			}

			showcaseRect = showcaseRoot.getBoundingClientRect();
			playerRect = playerRoot.getBoundingClientRect();
			codeRect = codeCallout.getBoundingClientRect();

			if (!showcaseRect.width || !playerRect.width || !codeRect.width) {
				arrowPath.setAttribute("d", "");
				arrowHeadPath.setAttribute("d", "");
				return;
			}

			startX = codeRect.left - showcaseRect.left + 8;
			startY = codeRect.top - showcaseRect.top + 8;
			endX = playerRect.left - showcaseRect.left - 12;
			endY = playerRect.top - showcaseRect.top + playerRect.height * 0.5;

			if (endX <= startX) {
				endX = startX + 36;
			}

			control1X = Math.max(8, startX - 250);
			control1Y = startY - 100;
			control2X = endX - 350;
			control2Y = endY + 130;

			arrowPath.setAttribute(
				"d",
				"M " +
					startX +
					" " +
					startY +
					" C " +
					control1X +
					" " +
					control1Y +
					", " +
					control2X +
					" " +
					control2Y +
					", " +
					endX +
					" " +
					endY,
			);

			tangentX = endX - control2X;
			tangentY = endY - control2Y;
			tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY) || 1;
			directionX = tangentX / tangentLength;
			directionY = tangentY / tangentLength;
			headBaseX = endX - directionX * headLength;
			headBaseY = endY - directionY * headLength;
			leftX = headBaseX - directionY * headWidth;
			leftY = headBaseY + directionX * headWidth;
			rightX = headBaseX + directionY * headWidth;
			rightY = headBaseY - directionX * headWidth;

			arrowHeadPath.setAttribute(
				"d",
				"M " +
					leftX +
					" " +
					leftY +
					" L " +
					endX +
					" " +
					endY +
					" L " +
					rightX +
					" " +
					rightY,
			);
		}

		function ensureGuideArrowSvg() {
			var svg;

			if (!guideArrow || arrowPath || arrowHeadPath) {
				return;
			}

			svg = document.createElementNS(SVG_NS, "svg");
			svg.setAttribute("aria-hidden", "true");
			svg.setAttribute("focusable", "false");

			arrowPath = document.createElementNS(SVG_NS, "path");
			arrowPath.setAttribute("class", "ts-showcase__guide-path");
			svg.appendChild(arrowPath);

			arrowHeadPath = document.createElementNS(SVG_NS, "path");
			arrowHeadPath.setAttribute("class", "ts-showcase__guide-head");
			svg.appendChild(arrowHeadPath);

			guideArrow.innerHTML = "";
			guideArrow.appendChild(svg);
		}

		function scheduleGuideArrowUpdate() {
			if (!guideArrow) {
				return;
			}
			if (arrowFrame) {
				cancelAnimationFrame(arrowFrame);
			}
			arrowFrame = requestAnimationFrame(updateGuideArrowGeometry);
		}

		function syncControlUi(model) {
			Array.prototype.slice
				.call(controlsRoot.querySelectorAll("[data-ts-control-group]"))
				.forEach(function (group) {
					var groupName = group.getAttribute("data-ts-control-group") || "";
					var isHidden =
						getModeHiddenGroupNames(currentMode).indexOf(groupName) !== -1;
					group.classList.toggle("is-hidden", isHidden);
				});

			CONTROL_NAMES.forEach(function (name) {
				var control = getControl(name);
				var row;
				var hidden;
				var disabled;
				if (!control) {
					return;
				}

				if (control.type === "checkbox") {
					control.checked = Boolean(model[name]);
				} else {
					control.value = typeof model[name] === "string" ? model[name] : "";
				}
				disabled = isControlDisabled(name, model, currentMode);
				control.disabled = disabled;

				row = control.closest(".ts-control-row");
				if (row) {
					hidden = isControlUnavailableInMode(name, currentMode);
					row.classList.toggle("is-hidden", hidden);
					row.classList.toggle("is-disabled", disabled);
				}
			});
		}

		function readControls() {
			var fallbackModel = modelByMode[currentMode] || DEFAULT_MODEL;
			var model = {};
			CONTROL_NAMES.forEach(function (name) {
				var control = getControl(name);
				if (!control) {
					model[name] = fallbackModel[name];
					return;
				}

				model[name] =
					control.type === "checkbox" ? control.checked : control.value;
			});
			return model;
		}

		function normalizeControlState(model, mode) {
			var normalized = Object.assign({}, model);
			var notes = [];

			if (
				normalized.waveformPlaybackFollowMode !== "center" &&
				normalized.waveformPlaybackFollowMode !== "jump"
			) {
				normalized.waveformPlaybackFollowMode = "off";
			}

			if (isInteractiveMode(mode)) {
				return {
					model: normalized,
					notes: notes,
				};
			}

			if (isAlignmentMode(mode)) {
				if (normalized.customImage) {
					normalized.customImage = false;
					notes.push("Custom cover image is unavailable in sync mode.");
				}

				if (normalized.seekableImage) {
					normalized.seekableImage = false;
					notes.push("Seekable cover image is unavailable in sync mode.");
				}

				if (normalized.presets) {
					normalized.presets = false;
					notes.push("Presets are unavailable in sync mode.");
				}

				if (!normalized.exclusiveSolo) {
					normalized.exclusiveSolo = true;
					notes.push("Single solo mode is enforced in sync mode.");
				}
			} else {
				if (normalized.sheetNotePreview) {
					normalized.sheetNotePreview = false;
					notes.push("Score preview is only available in sync mode.");
				}
				if (normalized.warpingMatrix) {
					normalized.warpingMatrix = false;
					notes.push("Warping matrix is only available in sync mode.");
				}
			}

			if (normalized.exclusiveSolo && normalized.presets) {
				normalized.presets = false;
				notes.push(
					"Presets were turned off because single solo mode disables presets.",
				);
			}

			if (!normalized.customImage && normalized.seekableImage) {
				normalized.seekableImage = false;
				notes.push(
					"Seekable cover image requires custom cover image to be enabled.",
				);
			}

			if (!normalized.exclusiveSolo && normalized.trackImageBySolo) {
				normalized.trackImageBySolo = false;
				notes.push("Track-based cover image requires single solo mode.");
			}

			return {
				model: normalized,
				notes: notes,
			};
		}

		function renderQuickstartSnippet(model, mode) {
			if (isInteractiveMode(mode)) {
				renderInteractiveQuickstartSnippet();
			} else if (isAlignmentMode(mode)) {
				renderAlignmentQuickstartSnippet(model);
			} else {
				renderDefaultQuickstartSnippet(model);
			}
		}

		function renderInteractiveQuickstartSnippet() {
			var snippetText = renderDeclarativeElementSnippet(
				"dist/js/trackswitch.js",
				"trackswitch-sync-interactive",
				{
					workerUrl: "dist/js/trackswitch-interactive-worker.js",
					algorithm: "mrmsdtw",
				},
			);
			quickstartText = snippetText;
			if (!quickstartElement) {
				return;
			}
			quickstartElement.innerHTML = highlightSnippet(snippetText);
			quickstartElement.className = "language-html";
		}

		function renderDefaultQuickstartSnippet(model) {
			var config;
			var trackGroup;
			var uiConfig = [];
			var imageConfig;
			var features;
			var snippetText;

			if (model.customImage) {
				imageConfig = {
					type: "image",
					src: "cover.png",
					style: "margin: 12px auto;",
				};
				if (model.seekableImage) {
					imageConfig.seekable = true;
				}
				uiConfig.push(imageConfig);
			}

			if (model.trackImageBySolo) {
				uiConfig.push({ type: "perTrackImage", seekable: true });
			}

			if (model.text) {
				uiConfig.push({
					type: "text",
					text: "Choose which parts of the arrangement you want to hear.",
					bold: true,
					fontSize: 18,
				});
			}

			if (model.waveform) {
				var waveformConfig = {
					type: "waveform",
				};
				if (model.waveformPlaybackFollowMode !== "off") {
					waveformConfig.playbackFollowMode =
						model.waveformPlaybackFollowMode;
				}
				uiConfig.push(waveformConfig);
			}

			trackGroup = createBaseSnippetTracks({
				includeImages: Boolean(model.trackImageBySolo),
				includePresets: Boolean(model.presets),
			});
			uiConfig.push({
				type: "trackGroup",
				trackGroup: trackGroup,
			});

			config = {};
			if (model.presets) {
				config.presetNames = [
					"All Tracks",
					"Violins & Synths",
					"Drums & Bass",
					"Drums Only",
				];
			}
			config.ui = uiConfig;
			features = buildSnippetFeatures(model, MODE_DEFAULT);
			if (Object.keys(features).length > 0) {
				config.features = features;
			}

			snippetText = renderDeclarativeElementSnippet(
				"dist/js/trackswitch.js",
				"trackswitch-player",
				config,
			);
			quickstartText = snippetText;
			if (!quickstartElement) {
				return;
			}
			quickstartElement.innerHTML = highlightSnippet(snippetText);
			quickstartElement.className = "language-html";
		}

		function renderAlignmentQuickstartSnippet(model) {
			var config;
			var uiConfig = [];
			var trackGroup;
			var features;
			var snippetText;

			if (model.sheetNotePreview) {
				uiConfig.push({
					type: "sheetMusic",
					src: "Schubert_D911-03.xml",
					measureColumn: "measure_Schubert_D911-03_2",
					maxHeight: 370,
					renderScale: 0.65,
					cursorColor: "#999999",
					style: "margin: 0px;",
				});
			}

			if (model.midi) {
				uiConfig.push({
					type: "midi",
					src: "Schubert_D911-03.mid",
					alignmentColumn: "time_Schubert_D911-03",
					playbackFollowMode: "center",
					timer: true,
				});
			}

			if (model.text) {
				uiConfig.push({
					type: "text",
					text: "Compare aligned performances on the shared score timeline.",
					bold: true,
					fontSize: 18,
				});
			}

			if (model.waveform) {
				var waveformOne = { type: "waveform", height: 100, waveformSource: 0 };
				var waveformTwo = { type: "waveform", height: 100, waveformSource: 1 };
				if (model.waveformPlaybackFollowMode !== "off") {
					waveformOne.playbackFollowMode = model.waveformPlaybackFollowMode;
					waveformTwo.playbackFollowMode = model.waveformPlaybackFollowMode;
				}
				if (model.alignedPlayhead) {
					waveformOne.alignedPlayhead = true;
					waveformTwo.alignedPlayhead = true;
				}
				if (model.showAlignmentPoints) {
					waveformOne.showAlignmentPoints = true;
					waveformTwo.showAlignmentPoints = true;
				}
				uiConfig.push(waveformOne);
				uiConfig.push(waveformTwo);
			}

			if (model.warpingMatrix) {
				var warpingMatrixConfig = {
					type: "warpingMatrix",
					height: 200,
				};
				if (model.sheetNotePreview) {
					warpingMatrixConfig.bpm = "infer_score";
				}
				uiConfig.push(warpingMatrixConfig);
			}

			if (model.trackImageBySolo) {
				uiConfig.push({ type: "perTrackImage", seekable: true });
			}

			trackGroup = createAlignmentSnippetTracks();
			uiConfig.push({
				type: "trackGroup",
				trackGroup: trackGroup,
			});

			config = {
				alignment: {
					csv: "alignment.csv",
					referenceTimeColumn: "time_sync_reference",
					referenceTimeColumnSync: "time_sync_reference",
					outOfRange: "clamp",
				},
				ui: uiConfig,
			};
			features = buildSnippetFeatures(model, MODE_SYNC);
			if (Object.keys(features).length > 0) {
				config.features = features;
			}

			snippetText = renderDeclarativeElementSnippet(
				"dist/js/trackswitch.js",
				"trackswitch-sync-player",
				config,
			);
			quickstartText = snippetText;
			if (!quickstartElement) {
				return;
			}
			quickstartElement.innerHTML = highlightSnippet(snippetText);
			quickstartElement.className = "language-html";
		}

		function buildSnippetFeatures(model, mode) {
			var defaultFeatures = {
				looping: false,
				repeat: false,
				globalVolume: false,
				muteOtherPlayerInstances: true,
				trackVolumeControls: false,
				trackPanControls: false,
				customizablePanelOrder: false,
				presets: true,
				seekBar: true,
				timer: true,
				keyboard: true,
				exclusiveSolo: false,
				tabView: false,
				iosAudioUnlock: true,
			};
			if (isAlignmentMode(mode)) {
				defaultFeatures.exclusiveSolo = true;
				defaultFeatures.presets = false;
			}
			var selectedFeatures = {
				looping: Boolean(model.looping),
				repeat: Boolean(model.repeatEnabled),
				globalVolume: Boolean(model.globalVolume),
				muteOtherPlayerInstances: Boolean(model.muteOtherPlayerInstances),
				trackVolumeControls: Boolean(model.trackVolumeControls),
				trackPanControls: Boolean(model.trackPanControls),
				customizablePanelOrder: Boolean(model.customizablePanelOrder),
				presets: Boolean(model.presets),
				seekBar: Boolean(model.seekBar),
				timer: Boolean(model.timer),
				keyboard: Boolean(model.keyboard),
				exclusiveSolo: Boolean(model.exclusiveSolo),
				tabView: Boolean(model.tabView),
				iosAudioUnlock: Boolean(model.iosAudioUnlock),
			};
			var snippetFeatures = {};

			Object.keys(selectedFeatures).forEach(function (featureName) {
				if (featureName === "presets" && selectedFeatures.exclusiveSolo) {
					return;
				}
				if (selectedFeatures[featureName] !== defaultFeatures[featureName]) {
					snippetFeatures[featureName] = selectedFeatures[featureName];
				}
			});

			return snippetFeatures;
		}

		function renderDeclarativeElementSnippet(scriptSrc, tagName, config) {
			return [
				'<script src="' + scriptSrc + '"></script>',
				"",
				"<" + tagName + ' id="player">',
				'  <script type="application/json">',
				JSON.stringify(config, null, 2)
					.split("\n")
					.map(function (line) {
						return "  " + line;
					})
					.join("\n"),
				"  </script>",
				"</" + tagName + ">",
			].join("\n");
		}

		function applyModeModel(mode) {
			var sourceModel = modelByMode[mode] || DEFAULT_MODEL;
			var result = normalizeControlState(sourceModel, mode);
			modelByMode[mode] = result.model;
			syncControlUi(result.model);
			setNote(result.notes);
			renderQuickstartSnippet(result.model, mode);
		}

		function normalizeAndSyncControls() {
			var result = normalizeControlState(readControls(), currentMode);
			modelByMode[currentMode] = result.model;
			syncControlUi(result.model);
			syncModeTabs();
			setNote(result.notes);
			renderQuickstartSnippet(result.model, currentMode);
			return result.model;
		}

		function escapeHtml(value) {
			return value
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");
		}

		function highlightSnippet(source) {
			return source
				.split("\n")
				.map(function (line) {
					var escaped = escapeHtml(line);
					return /^\s*&lt;/.test(escaped)
						? highlightHtmlLine(escaped)
						: highlightJsonLine(escaped);
				})
				.join("\n");
		}

		function highlightHtmlLine(escapedLine) {
			return escapedLine.replace(
				/(&lt;\/?)([a-zA-Z0-9-]+)([^&]*?)(\/?&gt;)/g,
				function (_, open, tag, attrs, close) {
					var highlightedAttrs = attrs.replace(
						/([a-zA-Z-:]+)(=)("[^"]*"|'[^']*')/g,
						'<span class="ts-code-attr">$1</span>$2<span class="ts-code-string">$3</span>',
					);
					return (
						open +
						'<span class="ts-code-tag">' +
						tag +
						"</span>" +
						highlightedAttrs +
						close
					);
				},
			);
		}

		function highlightJsonLine(escapedLine) {
			var placeholders = [];
			var highlighted = escapedLine;
			var stash = function (html) {
				var token = "\ue000" + String.fromCharCode(0xe100 + placeholders.length);
				placeholders.push(html);
				return token;
			};

			highlighted = highlighted.replace(
				/("(?:\\.|[^"\\])*")(\s*:)/g,
				function (_, key, suffix) {
					return stash('<span class="ts-code-key">' + key + "</span>") + suffix;
				},
			);
			highlighted = highlighted.replace(
				/"(?:\\.|[^"\\])*"/g,
				function (value) {
					return stash('<span class="ts-code-string">' + value + "</span>");
				},
			);
			highlighted = highlighted.replace(
				/\b(true|false)\b/g,
				'<span class="ts-code-bool">$1</span>',
			);
			highlighted = highlighted.replace(
				/\bnull\b/g,
				'<span class="ts-code-null">null</span>',
			);
			highlighted = highlighted.replace(
				/(-?\b\d+(?:\.\d+)?\b)/g,
				'<span class="ts-code-number">$1</span>',
			);

			return highlighted.replace(/\ue000([\ue100-\ue1ff])/g, function (_, code) {
				return placeholders[code.charCodeAt(0) - 0xe100];
			});
		}

		function copyTextToClipboard(value) {
			if (
				navigator.clipboard &&
				typeof navigator.clipboard.writeText === "function"
			) {
				return navigator.clipboard.writeText(value);
			}

			return new Promise(function (resolve, reject) {
				var textArea = document.createElement("textarea");
				textArea.value = value;
				textArea.setAttribute("readonly", "");
				textArea.style.position = "fixed";
				textArea.style.left = "-9999px";
				document.body.appendChild(textArea);
				textArea.select();
				textArea.setSelectionRange(0, textArea.value.length);
				try {
					if (document.execCommand("copy")) {
						resolve();
					} else {
						reject(new Error("Copy command failed"));
					}
				} catch (error) {
					reject(error);
				} finally {
					document.body.removeChild(textArea);
				}
			});
		}

		function bindCopyButton() {
			var defaultCopyLabel = "Copy to clipboard";

			if (!copyQuickstartButton) {
				return;
			}

			copyQuickstartButton.addEventListener("click", function () {
				if (!quickstartText) {
					return;
				}
				copyTextToClipboard(quickstartText)
					.then(function () {
						copyQuickstartButton.textContent = "Copied to clipboard";
						setTimeout(function () {
							copyQuickstartButton.textContent = defaultCopyLabel;
						}, 1200);
					})
					.catch(function () {
						copyQuickstartButton.textContent = "Copy failed";
						setTimeout(function () {
							copyQuickstartButton.textContent = defaultCopyLabel;
						}, 1400);
					});
			});
		}

		function buildInitFromModel(model) {
			var basePath = getBasePathForMode(currentMode);
			var uiConfig = [];
			var init;

			if (isInteractiveMode(currentMode)) {
				return {
					workerUrl: interactiveWorkerPath,
					alignmentMethod: "mrmsdtw",
				};
			}

			if (model.customImage && !isAlignmentMode(currentMode)) {
				uiConfig.push({
					type: "image",
					src: basePath + "/cover.png",
					seekable: Boolean(model.seekableImage),
				});
			}

			if (model.trackImageBySolo) {
				uiConfig.push({
					type: "perTrackImage",
					seekable: true,
				});
			}

			if (isAlignmentMode(currentMode) && model.sheetNotePreview) {
				uiConfig.push({
					type: "sheetMusic",
					src: basePath + "/Schubert_D911-03.xml",
					measureColumn: "measure_Schubert_D911-03_2",
					maxHeight: 370,
					renderScale: 0.65,
					followPlayback: true,
					cursorColor: "#999999",
					cursorAlpha: 0.4,
				});
			}

			if (isAlignmentMode(currentMode) && model.midi) {
				uiConfig.push({
					type: "midi",
					src: basePath + "/Schubert_D911-03.mid",
					alignmentColumn: "time_Schubert_D911-03",
					height: 180,
					maxZoom: 5,
					playbackFollowMode: "center",
					timer: true,
				});
			}

			if (model.text) {
				uiConfig.push({
					type: "text",
					text: isAlignmentMode(currentMode)
						? "Compare aligned performances on the shared score timeline."
						: "Choose which parts of the arrangement you want to hear.",
					bold: true,
					fontSize: 18,
				});
			}

			if (model.waveform) {
				if (isAlignmentMode(currentMode)) {
					var alignmentWaveformOne = {
						type: "waveform",
						height: 100,
						waveformSource: 0,
					};
					var alignmentWaveformTwo = {
						type: "waveform",
						height: 100,
						waveformSource: 1,
					};

					if (model.waveformPlaybackFollowMode !== "off") {
						alignmentWaveformOne.playbackFollowMode =
							model.waveformPlaybackFollowMode;
						alignmentWaveformTwo.playbackFollowMode =
							model.waveformPlaybackFollowMode;
					}

					if (model.alignedPlayhead) {
						alignmentWaveformOne.alignedPlayhead = true;
						alignmentWaveformTwo.alignedPlayhead = true;
					}

					if (model.showAlignmentPoints) {
						alignmentWaveformOne.showAlignmentPoints = true;
						alignmentWaveformTwo.showAlignmentPoints = true;
					}

					uiConfig.push(alignmentWaveformOne);
					uiConfig.push(alignmentWaveformTwo);
				} else {
					var waveformConfig = {
						type: "waveform",
						height: 150,
					};

					if (model.waveformPlaybackFollowMode !== "off") {
						waveformConfig.playbackFollowMode =
							model.waveformPlaybackFollowMode;
					}

					uiConfig.push(waveformConfig);
				}
			}

			if (isAlignmentMode(currentMode) && model.warpingMatrix) {
				uiConfig.push({
					type: "warpingMatrix",
					height: 200,
					bpm: model.sheetMusic ? "infer_score" : null,
				});
			}

			init = {
				ui: uiConfig,
				features: {
					looping: model.looping,
					repeat: model.repeatEnabled,
					globalVolume: model.globalVolume,
					muteOtherPlayerInstances: model.muteOtherPlayerInstances,
					trackVolumeControls: model.trackVolumeControls,
					trackPanControls: model.trackPanControls,
					customizablePanelOrder: model.customizablePanelOrder,
					presets: model.presets,
					seekBar: model.seekBar,
					timer: model.timer,
					keyboard: model.keyboard,
					exclusiveSolo: model.exclusiveSolo,
					tabView: model.tabView,
					iosAudioUnlock: model.iosAudioUnlock,
				},
			};

			if (isAlignmentMode(currentMode)) {
				uiConfig.push({
					type: "trackGroup",
					trackGroup: createAlignmentTracks(basePath),
				});

				init.alignment = {
					csv: basePath + "/alignment.csv",
					referenceTimeColumn: "time_sync_reference",
					referenceTimeColumnSync: "time_sync_reference",
					outOfRange: "clamp",
				};
			} else {
				uiConfig.push({
					type: "trackGroup",
					trackGroup: createBaseTracks(basePath),
				});

				init.presetNames = [
					"All Tracks",
					"Violins & Synths",
					"Drums & Bass",
					"Drums Only",
				];
			}

			return init;
		}

		function snapshotControllerState(activeController) {
			if (
				!activeController ||
				typeof activeController.getState !== "function"
			) {
				return null;
			}

			var snapshot = activeController.getState();
			var playbackState = snapshot && snapshot.state ? snapshot.state : {};

			return {
				isLoaded: Boolean(snapshot && snapshot.isLoaded),
				playing: Boolean(playbackState.playing),
				position:
					typeof playbackState.position === "number"
						? playbackState.position
						: 0,
				volume:
					typeof playbackState.volume === "number" ? playbackState.volume : 1,
				repeat: Boolean(playbackState.repeat),
			};
		}

		function restoreState(nextController, stateSnapshot, model) {
			if (!nextController) {
				return;
			}

			if (!stateSnapshot || !stateSnapshot.isLoaded) {
				nextController.setRepeat(Boolean(model.repeatEnabled));
				if (model.globalVolume) {
					nextController.setVolume(1);
				}
				return;
			}

			nextController.setRepeat(
				Boolean(stateSnapshot.repeat || model.repeatEnabled),
			);

			if (model.globalVolume && typeof stateSnapshot.volume === "number") {
				nextController.setVolume(stateSnapshot.volume);
			}

			if (typeof stateSnapshot.position === "number") {
				nextController.seekTo(stateSnapshot.position);
			}

			if (stateSnapshot.playing) {
				nextController.play();
			}
		}

		function createPlayer(model, snapshot) {
			var currentToken;
			var loadPromise;

			if (controller && typeof controller.destroy === "function") {
				controller.destroy();
			}

			playerRoot.innerHTML = "";
			if (isInteractiveMode(currentMode)) {
				controller = window.TrackSwitch.createTrackSwitchSyncInteractive(
					playerRoot,
					buildInitFromModel(model),
				);
				controllerMode = currentMode;
				controller.initialize();
				scheduleGuideArrowUpdate();
				return;
			}

			if (isAlignmentMode(currentMode)) {
				controller = window.TrackSwitch.createTrackSwitchSyncPlayer(
					playerRoot,
					buildInitFromModel(model),
				);
			} else {
				controller = window.TrackSwitch.createDefaultTrackSwitch(
					playerRoot,
					buildInitFromModel(model),
				);
			}
			controllerMode = currentMode;
			controller.setRepeat(Boolean(model.repeatEnabled));
			scheduleGuideArrowUpdate();

			currentToken = rebuildToken + 1;
			rebuildToken = currentToken;
			loadPromise = controller.load();

			if (!loadPromise || typeof loadPromise.then !== "function") {
				restoreState(controller, snapshot, model);
				return;
			}

			loadPromise
				.then(function () {
					if (currentToken !== rebuildToken) {
						return;
					}
					restoreState(controller, snapshot, model);
					scheduleGuideArrowUpdate();
				})
				.catch(function () {
					if (currentToken !== rebuildToken) {
						return;
					}
				});
		}

		function canHotReloadPlayer() {
			return (
				controller &&
				controllerMode === currentMode &&
				!isInteractiveMode(currentMode) &&
				typeof controller.updateConfig === "function"
			);
		}

		function rebuildPlayer(options) {
			var preserveState = !options || options.preserveState !== false;
			var hotReload = preserveState && (!options || options.hotReload !== false);
			var model = normalizeAndSyncControls();
			var snapshot = preserveState ? snapshotControllerState(controller) : null;
			var currentToken;
			var updatePromise;

			if (!hotReload || !canHotReloadPlayer()) {
				createPlayer(model, snapshot);
				return;
			}

			currentToken = rebuildToken + 1;
			rebuildToken = currentToken;
			updatePromise = controller.updateConfig(buildInitFromModel(model));

			if (!updatePromise || typeof updatePromise.then !== "function") {
				controller.setRepeat(Boolean(model.repeatEnabled));
				scheduleGuideArrowUpdate();
				return;
			}

			updatePromise
				.then(function () {
					if (currentToken !== rebuildToken) {
						return;
					}
					controller.setRepeat(Boolean(model.repeatEnabled));
					scheduleGuideArrowUpdate();
				})
				.catch(function () {
					if (currentToken !== rebuildToken) {
						return;
					}
					createPlayer(model, snapshot);
				});
		}

		function scheduleRebuild() {
			if (rebuildDebounceTimer) {
				clearTimeout(rebuildDebounceTimer);
			}
			rebuildDebounceTimer = setTimeout(function () {
				rebuildDebounceTimer = null;
				rebuildPlayer({ preserveState: true });
			}, 100);
		}

		function bindModeTabs() {
			modeButtons.forEach(function (button) {
				button.addEventListener("click", function () {
					var nextMode = button.getAttribute("data-ts-mode") || MODE_DEFAULT;
					if (
						nextMode !== MODE_DEFAULT &&
						nextMode !== MODE_SYNC &&
						nextMode !== MODE_INTERACTIVE
					) {
						return;
					}
					if (nextMode === currentMode) {
						return;
					}

					modelByMode[currentMode] = normalizeControlState(
						readControls(),
						currentMode,
					).model;

					currentMode = nextMode;
					syncModeTabs();
					applyModeModel(currentMode);
					rebuildPlayer({ preserveState: false });
				});
			});
		}

		function bindControlEvents() {
			REBUILD_TOGGLE_NAMES.forEach(function (name) {
				var control = getControl(name);
				if (!control) {
					return;
				}
				control.addEventListener("change", function () {
					normalizeAndSyncControls();
					scheduleRebuild();
				});
			});

			var repeatControl = getControl("repeatEnabled");
			if (repeatControl) {
				repeatControl.addEventListener("change", function () {
					var model = normalizeAndSyncControls();
					if (controller && typeof controller.setRepeat === "function") {
						controller.setRepeat(Boolean(model.repeatEnabled));
					}
				});
			}
		}

		syncModeTabs();
		applyModeModel(currentMode);
		bindCopyButton();
		bindSnippetPreviewHover();
		bindModeTabs();
		bindControlEvents();
		rebuildPlayer({ preserveState: false });
		scheduleGuideArrowUpdate();
		window.addEventListener("resize", scheduleGuideArrowUpdate);
	});
})();
