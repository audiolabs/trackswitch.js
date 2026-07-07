import type { LoopMarker, PlayerState } from "./types";

export type PlayerAction =
	| { type: "set-playing"; playing: boolean }
	| { type: "toggle-repeat" }
	| { type: "set-repeat"; enabled: boolean }
	| { type: "set-position"; position: number }
	| { type: "set-start-time"; startTime: number }
	| { type: "set-seeking"; seeking: boolean }
	| { type: "set-volume"; volume: number }
	| {
			type: "set-loop-point";
			marker: LoopMarker;
			position: number;
			minDistance: number;
	  }
	| { type: "toggle-loop" }
	| { type: "clear-loop" };

function clamp01(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, Math.min(1, value));
}

export function createInitialPlayerState(repeat: boolean): PlayerState {
	return {
		playing: false,
		repeat: repeat,
		position: 0,
		startTime: 0,
		currentlySeeking: false,
		loop: {
			pointA: null,
			pointB: null,
			enabled: false,
		},
		volume: 1,
	};
}

function clampNonNegative(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, value);
}

function withLoopState(
	state: PlayerState,
	loop: PlayerState["loop"],
): PlayerState {
	return {
		...state,
		loop: loop,
	};
}

function applyLoopPoint(
	state: PlayerState,
	action: Extract<PlayerAction, { type: "set-loop-point" }>,
): PlayerState {
	const nextLoop = {
		...state.loop,
	};

	if (action.marker === "A") {
		nextLoop.pointA = clampNonNegative(action.position);
	} else {
		nextLoop.pointB = clampNonNegative(action.position);
	}

	if (
		nextLoop.pointA !== null &&
		nextLoop.pointB !== null &&
		nextLoop.pointA > nextLoop.pointB
	) {
		const swap = nextLoop.pointA;
		nextLoop.pointA = nextLoop.pointB;
		nextLoop.pointB = swap;
	}

	if (
		nextLoop.pointA !== null &&
		nextLoop.pointB !== null &&
		nextLoop.pointB - nextLoop.pointA < action.minDistance
	) {
		if (action.marker === "A") {
			nextLoop.pointA = null;
		} else {
			nextLoop.pointB = null;
		}
		nextLoop.enabled = false;
	}

	return withLoopState(state, nextLoop);
}

function toggleLoop(state: PlayerState): PlayerState {
	if (state.loop.pointA === null || state.loop.pointB === null) {
		return state;
	}

	return withLoopState(state, {
		...state.loop,
		enabled: !state.loop.enabled,
	});
}

function clearLoop(state: PlayerState): PlayerState {
	return withLoopState(state, {
		pointA: null,
		pointB: null,
		enabled: false,
	});
}

export function playerStateReducer(
	state: PlayerState,
	action: PlayerAction,
): PlayerState {
	switch (action.type) {
		case "set-playing":
			return {
				...state,
				playing: action.playing,
			};

		case "toggle-repeat":
			return {
				...state,
				repeat: !state.repeat,
			};

		case "set-repeat":
			return {
				...state,
				repeat: action.enabled,
			};

		case "set-position":
			return {
				...state,
				position: clampNonNegative(action.position),
			};

		case "set-start-time":
			return {
				...state,
				startTime: action.startTime,
			};

		case "set-seeking":
			return {
				...state,
				currentlySeeking: action.seeking,
			};

		case "set-volume":
			return {
				...state,
				volume: clamp01(action.volume),
			};

		case "set-loop-point":
			return applyLoopPoint(state, action);

		case "toggle-loop":
			return toggleLoop(state);

		case "clear-loop":
			return clearLoop(state);

		default:
			return state;
	}
}
