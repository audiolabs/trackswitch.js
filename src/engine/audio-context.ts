let sharedAudioContext: AudioContext | null | undefined;

export function getAudioContext(): AudioContext | null {
	if (sharedAudioContext !== undefined) {
		return sharedAudioContext;
	}

	if (typeof AudioContext === "undefined") {
		sharedAudioContext = null;
		return sharedAudioContext;
	}

	sharedAudioContext = new AudioContext();
	return sharedAudioContext;
}
