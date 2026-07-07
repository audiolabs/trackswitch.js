import { playerStateReducer } from "../domain/state";
import type { TrackRuntime } from "../domain/types";
import { clamp } from "../shared/math";
import { getSeekMetrics } from "../shared/seek";
import { pauseOtherControllers, unregisterController } from "./player-registry";

function getLoadErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	const fallback = String(error ?? "").trim();
	if (fallback.length > 0 && fallback !== "[object Object]") {
		return fallback;
	}

	return "Unexpected error while loading TrackSwitch.";
}

export function load(ctx: any): any {
	return async function (this: any) {
		if (this.isDestroyed || this.isLoaded || this.isLoading) {
			return;
		}

		this.isLoading = true;
		this.renderer.setOverlayLoading(true);
		try {
			const prepared = await this.audioEngine.prepareForPlaybackStart();
			if (!prepared) {
				this.isLoading = false;
				this.renderer.setOverlayLoading(false);
				this.handleError(
					"Web Audio API is not supported in your browser. Please consider upgrading.",
				);
				return;
			}

			if (!this.iOSPlaybackUnlocked) {
				this.iOSPlaybackUnlocked = true;
				await this.audioEngine.unlockIOSPlayback();
			}

			this.globalSyncEnabled = false;
			this.syncLockedTrackIndexes.clear();
			this.preSyncSoloTrackIndex = null;
			this.effectiveSingleSoloMode = this.isAlignmentMode()
				? true
				: this.features.exclusiveSolo;

			this.runtimes.forEach((runtime: TrackRuntime) => {
				runtime.successful = false;
				runtime.errored = false;
				runtime.buffer = null;
				runtime.gainNode = null;
				runtime.pannerNode = null;
				runtime.timing = null;
				runtime.activeSource = null;
				runtime.sourceIndex = -1;
				runtime.activeVariant = "base";
				runtime.baseSource = {
					buffer: null,
					timing: null,
					sourceIndex: -1,
					waveformSummary: null,
				};
				runtime.syncedSource = null;
				runtime.waveformSummary = null;
			});

			await this.audioEngine.loadTracks(this.runtimes);

			if (this.isDestroyed) {
				return;
			}

			this.runtimes.forEach((runtime: TrackRuntime) => {
				if (runtime.baseSource.buffer) {
					runtime.baseSource.waveformSummary =
						this.waveformEngine.createSummary(runtime.baseSource.buffer);
				}

				if (runtime.syncedSource?.buffer) {
					runtime.syncedSource.waveformSummary =
						this.waveformEngine.createSummary(runtime.syncedSource.buffer);
				}

				const activeSource =
					runtime.activeVariant === "synced"
						? runtime.syncedSource
						: runtime.baseSource;
				runtime.waveformSummary = activeSource
					? activeSource.waveformSummary
					: null;
			});

			this.isLoading = false;
			this.renderer.setOverlayLoading(false);

			const erroredTracks = this.runtimes.filter(
				(runtime: TrackRuntime) => runtime.errored,
			);

			if (erroredTracks.length > 0) {
				this.handleError("One or more audio files failed to load.");
				return;
			}

			this.longestDuration = this.findLongestDuration();
			this.alignmentContext = null;
			this.alignmentPlaybackTrackIndex = null;

			if (this.isAlignmentMode()) {
				const alignmentError = await this.initializeAlignmentMode();
				if (alignmentError) {
					this.handleError(alignmentError);
					return;
				}
			}

			if (this.isDestroyed) {
				return;
			}

			await this.initializeSheetMusic();

			if (this.isDestroyed) {
				return;
			}

			await this.renderer.initializeMidiDisplays(
				this.longestDuration,
				this.isAlignmentMode(),
			);

			if (this.isDestroyed) {
				return;
			}

			this.isLoaded = true;
			this.renderer.hideOverlayOnLoaded();

			this.updateMainControls();
			this.applyTrackProperties();

			this.emit("loaded", {
				longestDuration: this.longestDuration,
			});
		} catch (error) {
			if (this.isDestroyed) {
				return;
			}

			this.isLoading = false;
			this.renderer.setOverlayLoading(false);
			this.handleError(getLoadErrorMessage(error));
		}
	}.call(ctx);
}

export function destroy(ctx: any): any {
	return function (this: any) {
		if (this.isDestroyed) {
			return;
		}
		this.isDestroyed = true;

		if (this.timerMonitorPosition) {
			clearInterval(this.timerMonitorPosition);
			this.timerMonitorPosition = null;
		}
		if (this.resizeDebounceTimer) {
			clearTimeout(this.resizeDebounceTimer);
			this.resizeDebounceTimer = null;
		}
		if (this.waveformRenderFrameId !== null) {
			cancelAnimationFrame(this.waveformRenderFrameId);
			this.waveformRenderFrameId = null;
		}
		this.seekingElement = null;
		this.rightClickDragging = false;
		this.loopDragStart = null;
		this.draggingMarker = null;
		this.pinchZoomState = null;
		this.pendingWaveformTouchSeek = null;
		this.waveformMinimapDragState = null;

		if (this.state.playing) {
			this.stopAudio();
		}

		this.inputBinder.unbind();
		this.sheetMusicEngine.destroy();
		this.renderer.destroy();
		this.audioEngine.disconnect();

		this.listeners.loaded.clear();
		this.listeners.error.clear();
		this.listeners.position.clear();
		this.listeners.trackState.clear();

		unregisterController(this);
	}.call(ctx);
}

export function togglePlay(ctx: any): any {
	return function (this: any) {
		if (this.state.playing) {
			this.pause();
		} else {
			this.play();
		}
	}.call(ctx);
}

export function play(ctx: any): any {
	return function (this: any) {
		if (this.isDestroyed || !this.isLoaded) {
			return;
		}
		if (this.state.playing) {
			return;
		}

		let startPosition = this.state.position;

		if (
			this.features.looping &&
			this.state.loop.enabled &&
			this.state.loop.pointA !== null &&
			this.state.loop.pointB !== null &&
			(this.state.position < this.state.loop.pointA ||
				this.state.position > this.state.loop.pointB)
		) {
			startPosition = this.state.loop.pointA;
		}

		this.startAudio(startPosition);
		this.pauseOthers();
		this.dispatch({ type: "set-playing", playing: true });
		this.updatePlaybackPositionUi();
	}.call(ctx);
}

export function pause(ctx: any): any {
	return function (this: any) {
		if (!this.state.playing) {
			return;
		}

		const position = this.currentPlaybackReferencePosition();
		this.stopAudio();

		this.dispatch({ type: "set-position", position: position });
		this.dispatch({ type: "set-playing", playing: false });

		this.updateMainControls();
	}.call(ctx);
}

export function stop(ctx: any): any {
	return function (this: any) {
		if (this.state.playing) {
			this.stopAudio();
		}

		this.dispatch({ type: "set-position", position: 0 });
		this.dispatch({ type: "set-playing", playing: false });
		this.updateMainControls();
	}.call(ctx);
}

export function seekTo(ctx: any, seconds: any): any {
	return function (this: any, seconds: any) {
		const nextPosition = clamp(seconds, 0, this.longestDuration);

		if (this.state.playing) {
			this.stopAudio();
			this.startAudio(nextPosition);
		} else {
			this.dispatch({ type: "set-position", position: nextPosition });
		}

		this.updateMainControls();
	}.call(ctx, seconds);
}

export function seekRelative(ctx: any, seconds: any): any {
	return function (this: any, seconds: any) {
		let nextPosition = this.state.position + seconds;
		nextPosition = clamp(nextPosition, 0, this.longestDuration);

		if (
			this.features.looping &&
			this.state.loop.enabled &&
			this.state.loop.pointA !== null &&
			this.state.loop.pointB !== null
		) {
			const loopStart = this.state.loop.pointA;
			const loopEnd = this.state.loop.pointB;
			const loopLength = loopEnd - loopStart;
			if (loopLength > 0) {
				let relative = nextPosition - loopStart;
				relative = ((relative % loopLength) + loopLength) % loopLength;
				nextPosition = loopStart + relative;
			}
		}

		if (this.state.playing) {
			this.stopAudio();
			this.startAudio(nextPosition);
		} else {
			this.dispatch({ type: "set-position", position: nextPosition });
		}

		this.updateMainControls();
	}.call(ctx, seconds);
}

export function setRepeat(ctx: any, enabled: any): any {
	return function (this: any, enabled: any) {
		this.dispatch({ type: "set-repeat", enabled: enabled });
		this.updateMainControls();
	}.call(ctx, enabled);
}

export function setVolume(ctx: any, volumeZeroToOne: any): any {
	return function (this: any, volumeZeroToOne: any) {
		if (!this.features.globalVolume) {
			this.dispatch({ type: "set-volume", volume: 1 });
			this.audioEngine.setMasterVolume(1);
			this.renderer.setVolumeSlider(1);
			return;
		}

		this.dispatch({ type: "set-volume", volume: volumeZeroToOne });
		this.audioEngine.setMasterVolume(this.state.volume);
		this.renderer.setVolumeSlider(this.state.volume);
	}.call(ctx, volumeZeroToOne);
}

export function setTrackVolume(
	ctx: any,
	trackIndex: any,
	volumeZeroToOne: any,
): any {
	return function (this: any, trackIndex: any, volumeZeroToOne: any) {
		if (
			!Number.isInteger(trackIndex) ||
			trackIndex < 0 ||
			trackIndex >= this.runtimes.length
		) {
			return;
		}

		if (this.isTrackSyncLocked(trackIndex)) {
			return;
		}

		const runtime = this.runtimes[trackIndex];
		runtime.state.volume = clamp(volumeZeroToOne, 0, 1);
		this.applyTrackProperties();
	}.call(ctx, trackIndex, volumeZeroToOne);
}

export function setTrackPan(
	ctx: any,
	trackIndex: any,
	panMinusOneToOne: any,
): any {
	return function (this: any, trackIndex: any, panMinusOneToOne: any) {
		if (
			!Number.isInteger(trackIndex) ||
			trackIndex < 0 ||
			trackIndex >= this.runtimes.length
		) {
			return;
		}

		if (this.isTrackSyncLocked(trackIndex)) {
			return;
		}

		const runtime = this.runtimes[trackIndex];
		runtime.state.pan = this.audioEngine.supportsStereoPanning()
			? clamp(panMinusOneToOne, -1, 1)
			: 0;
		this.applyTrackProperties();
	}.call(ctx, trackIndex, panMinusOneToOne);
}

export function setLoopPoint(ctx: any, marker: any): any {
	return function (this: any, marker: any) {
		if (!this.features.looping) {
			return false;
		}

		const position = this.state.playing
			? this.currentPlaybackReferencePosition()
			: this.state.position;
		const currentPoint =
			marker === "A" ? this.state.loop.pointA : this.state.loop.pointB;
		if (
			currentPoint !== null &&
			Math.abs(currentPoint - position) < this.loopMinDistance
		) {
			this.state = {
				...this.state,
				loop: {
					...this.state.loop,
					enabled: false,
					pointA: marker === "A" ? null : this.state.loop.pointA,
					pointB: marker === "B" ? null : this.state.loop.pointB,
				},
			};
			this.updateMainControls();
			return false;
		}

		this.dispatch({
			type: "set-loop-point",
			marker: marker,
			position: position,
			minDistance: this.loopMinDistance,
		});

		const nextPoint =
			marker === "A" ? this.state.loop.pointA : this.state.loop.pointB;
		if (nextPoint === null) {
			this.updateMainControls();
			return false;
		}

		if (this.state.loop.pointA !== null && this.state.loop.pointB !== null) {
			const loopA = this.state.loop.pointA;
			const loopB = this.state.loop.pointB;
			activateLoopRange(this, loopA, loopB);
		}

		this.updateMainControls();
		return true;
	}.call(ctx, marker);
}

export function activateLoopRange(ctx: any, loopA: any, loopB: any): any {
	return function (this: any, loopA: any, loopB: any) {
		this.state = {
			...this.state,
			loop: {
				...this.state.loop,
				enabled: true,
			},
		};

		if (
			this.state.playing &&
			(this.state.position < loopA || this.state.position > loopB)
		) {
			this.stopAudio();
			this.startAudio(loopA);
		}
	}.call(ctx, loopA, loopB);
}

export function toggleLoop(ctx: any): any {
	return function (this: any) {
		if (!this.features.looping) {
			return false;
		}

		if (this.state.loop.pointA === null || this.state.loop.pointB === null) {
			return false;
		}

		this.dispatch({ type: "toggle-loop" });

		if (
			this.state.loop.enabled &&
			this.state.loop.pointA !== null &&
			this.state.loop.pointB !== null &&
			(this.state.position < this.state.loop.pointA ||
				this.state.position > this.state.loop.pointB)
		) {
			if (this.state.playing) {
				this.stopAudio();
				this.startAudio(this.state.loop.pointA);
			} else {
				this.dispatch({
					type: "set-position",
					position: this.state.loop.pointA,
				});
			}
		}

		this.updateMainControls();
		return true;
	}.call(ctx);
}

export function clearLoop(ctx: any): any {
	return function (this: any) {
		this.dispatch({ type: "clear-loop" });
		this.rightClickDragging = false;
		this.loopDragStart = null;
		this.draggingMarker = null;
		this.updateMainControls();
	}.call(ctx);
}

export function toggleSolo(ctx: any, trackIndex: any, exclusive: any): any {
	return function (this: any, trackIndex: any, exclusive: any) {
		const runtime = this.runtimes[trackIndex];
		if (!runtime) {
			return;
		}

		if (this.isTrackSyncLocked(trackIndex)) {
			return;
		}

		const previousActiveTrackIndex = this.getActiveSoloTrackIndex();

		const currentState = runtime.state.solo;

		if (exclusive || this.effectiveSingleSoloMode) {
			this.runtimes.forEach((entry: TrackRuntime) => {
				entry.state.solo = false;
			});
		}

		if ((exclusive || this.effectiveSingleSoloMode) && currentState) {
			runtime.state.solo = true;
		} else {
			runtime.state.solo = !currentState;
		}

		this.applyTrackProperties();

		const nextActiveTrackIndex = this.getActiveSoloTrackIndex();
		const shouldHandleAlignmentSwitch =
			this.isAlignmentMode() &&
			this.alignmentContext &&
			this.effectiveSingleSoloMode &&
			previousActiveTrackIndex !== nextActiveTrackIndex &&
			nextActiveTrackIndex >= 0;
		if (shouldHandleAlignmentSwitch) {
			this.handleAlignmentTrackSwitch(nextActiveTrackIndex);
			return;
		}

		this.updateMainControls();
	}.call(ctx, trackIndex, exclusive);
}

export function applyPreset(ctx: any, presetIndex: any): any {
	return function (this: any, presetIndex: any) {
		if (!this.features.presets) {
			return;
		}

		this.runtimes.forEach((runtime: TrackRuntime) => {
			const presets = runtime.definition.presets ?? [];
			runtime.state.solo = presets.indexOf(presetIndex) !== -1;
		});

		this.applyTrackProperties();
	}.call(ctx, presetIndex);
}

export function initializeSheetMusic(ctx: any): any {
	return async function (this: any) {
		const hosts = this.renderer
			.getPreparedSheetMusicHosts()
			.map(
				(host: {
					host: HTMLElement;
					scrollContainer: HTMLElement | null;
					source: string;
					measureColumn: string | null;
					renderScale: number | null;
					followPlayback: boolean;
					cursorColor: string;
					cursorAlpha: number;
				}) => {
					const measureColumn =
						typeof host.measureColumn === "string"
							? host.measureColumn.trim()
							: "";
					const measureMapsPromise = this.buildSheetMusicMeasureMaps(
						measureColumn,
						host.source,
					);

					return {
						...host,
						measureMapsPromise: measureMapsPromise.catch((error: unknown) => {
							if (!measureColumn) {
								return {
									base: null,
									sync: null,
								};
							}

							throw error;
						}),
					};
				},
			);

		if (hosts.length === 0) {
			this.sheetMusicEngine.destroy();
			return;
		}

		await this.sheetMusicEngine.initialize(hosts);
		this.sheetMusicEngine.updatePosition(
			this.state.position,
			this.isSyncReferenceAxisActive(),
		);
	}.call(ctx);
}

export function dispatch(ctx: any, action: any): any {
	return function (this: any, action: any) {
		this.state = playerStateReducer(this.state, action);
	}.call(ctx, action);
}

export function pauseOthers(ctx: any): any {
	return function (this: any) {
		if (!this.features.muteOtherPlayerInstances) {
			return;
		}

		pauseOtherControllers(this);
	}.call(ctx);
}

export function startAudio(
	ctx: any,
	newPosition: any,
	snippetDuration: any,
): any {
	return function (this: any, newPosition: any, snippetDuration: any) {
		const requestedPosition =
			typeof newPosition === "number" ? newPosition : this.state.position;
		let enginePosition = requestedPosition;
		let nextReferencePosition = requestedPosition;

		if (this.isAlignmentMode() && this.alignmentContext) {
			const activeTrackIndex = this.getAlignmentPlaybackTrackIndex();
			if (activeTrackIndex < 0) {
				return;
			}

			enginePosition = this.referenceToTrackTime(
				activeTrackIndex,
				requestedPosition,
			);
			nextReferencePosition = this.trackToReferenceTime(
				activeTrackIndex,
				enginePosition,
			);
			this.alignmentPlaybackTrackIndex = activeTrackIndex;
		} else {
			this.alignmentPlaybackTrackIndex = null;
		}

		const startResult = this.audioEngine.start(
			this.runtimes,
			enginePosition,
			snippetDuration,
		);
		if (!startResult) {
			this.alignmentPlaybackTrackIndex = null;
			return;
		}

		this.dispatch({
			type: "set-position",
			position: clamp(nextReferencePosition, 0, this.longestDuration),
		});
		this.dispatch({ type: "set-start-time", startTime: startResult.startTime });

		if (this.timerMonitorPosition) {
			clearInterval(this.timerMonitorPosition);
		}

		this.timerMonitorPosition = setInterval(() => {
			this.monitorPosition();
		}, 16);
	}.call(ctx, newPosition, snippetDuration);
}

export function stopAudio(ctx: any): any {
	return function (this: any) {
		this.audioEngine.stop(this.runtimes);
		this.alignmentPlaybackTrackIndex = null;
		if (this.timerMonitorPosition) {
			clearInterval(this.timerMonitorPosition);
			this.timerMonitorPosition = null;
		}
	}.call(ctx);
}

export function monitorPosition(ctx: any): any {
	return function (this: any) {
		if (this.isDestroyed) {
			return;
		}

		if (this.state.playing && !this.state.currentlySeeking) {
			const currentPosition = this.currentPlaybackReferencePosition();
			this.dispatch({ type: "set-position", position: currentPosition });
		}

		if (
			this.features.looping &&
			this.state.loop.enabled &&
			this.state.loop.pointB !== null &&
			this.state.position >= this.state.loop.pointB &&
			!this.state.currentlySeeking
		) {
			this.stopAudio();
			this.startAudio(this.state.loop.pointA ?? 0);
			return;
		}

		if (
			this.state.position >= this.longestDuration &&
			!this.state.currentlySeeking
		) {
			this.dispatch({ type: "set-position", position: 0 });
			this.stopAudio();

			if (this.state.repeat) {
				this.startAudio(0);
				this.dispatch({ type: "set-playing", playing: true });
			} else {
				this.dispatch({ type: "set-playing", playing: false });
			}
		}

		this.updateMainControls();
	}.call(ctx);
}

export function seekFromEvent(
	ctx: any,
	event: any,
	usePreviewSnippet: any,
): any {
	return function (this: any, event: any, usePreviewSnippet: any) {
		const seekTimelineContext = this.getSeekTimelineContext(
			this.seekingElement,
		);
		const metrics = getSeekMetrics(
			this.seekingElement,
			event,
			seekTimelineContext.duration,
		);
		if (!metrics) {
			return;
		}

		const newPosition = seekTimelineContext.toReferenceTime(metrics.time);

		if (metrics.posXRel >= 0 && metrics.posXRel <= metrics.seekWidth) {
			if (this.state.playing) {
				this.stopAudio();
				this.startAudio(newPosition, usePreviewSnippet ? 0.03 : undefined);
			} else {
				this.dispatch({ type: "set-position", position: newPosition });
			}
		} else {
			this.dispatch({ type: "set-position", position: newPosition });
		}

		this.updateMainControls();
	}.call(ctx, event, usePreviewSnippet);
}

export function findLongestDuration(ctx: any): any {
	return function (this: any) {
		let longest = 0;

		this.runtimes.forEach((runtime: TrackRuntime) => {
			const duration = (ctx.constructor as any).getRuntimeDuration(runtime);

			if (duration > longest) {
				longest = duration;
			}
		});

		return longest;
	}.call(ctx);
}

export function handleError(ctx: any, message: any): any {
	return function (this: any, message: any) {
		this.isLoaded = false;
		this.isLoading = false;
		this.alignmentContext = null;
		this.alignmentPlaybackTrackIndex = null;
		this.globalSyncEnabled = false;
		this.syncLockedTrackIndexes.clear();
		this.preSyncSoloTrackIndex = null;
		this.effectiveSingleSoloMode = this.isAlignmentMode()
			? true
			: this.features.exclusiveSolo;

		this.stopAudio();

		if (this.resizeDebounceTimer) {
			clearTimeout(this.resizeDebounceTimer);
			this.resizeDebounceTimer = null;
		}
		if (this.waveformRenderFrameId !== null) {
			cancelAnimationFrame(this.waveformRenderFrameId);
			this.waveformRenderFrameId = null;
		}
		this.pinchZoomState = null;
		this.waveformMinimapDragState = null;
		this.sheetMusicEngine.destroy();
		this.renderer.destroyMidiDisplays();

		this.renderer.showError(message, this.runtimes);
		this.emit("error", { message: message });
	}.call(ctx, message);
}
