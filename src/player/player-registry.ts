export interface ControllerRegistryEntry {
	instanceId: number;
	pause(): void;
}

let instanceCounter = 0;
let activeKeyboardInstanceId: number | null = null;
const controllerRegistry = new Set<ControllerRegistryEntry>();

export function allocateInstanceId(): number {
	const nextInstanceId = instanceCounter;
	instanceCounter += 1;
	return nextInstanceId;
}

export function setActiveKeyboardController(instanceId: number): void {
	activeKeyboardInstanceId = instanceId;
}

export function clearActiveKeyboardController(instanceId: number): void {
	if (activeKeyboardInstanceId === instanceId) {
		activeKeyboardInstanceId = null;
	}
}

export function isKeyboardControllerActive(instanceId: number): boolean {
	return activeKeyboardInstanceId === instanceId;
}

export function registerController(controller: ControllerRegistryEntry): void {
	controllerRegistry.add(controller);
}

export function unregisterController(
	controller: ControllerRegistryEntry,
): void {
	clearActiveKeyboardController(controller.instanceId);
	controllerRegistry.delete(controller);
}

export function pauseOtherControllers(
	controller: ControllerRegistryEntry,
): void {
	controllerRegistry.forEach((entry) => {
		if (entry !== controller) {
			entry.pause();
		}
	});
}
