declare module "vue" {
	export type PropType<T> = unknown;

	export interface Ref<T> {
		value: T;
	}

	export function defineComponent<T>(options: T): T;
	export function h(
		type: unknown,
		props?: Record<string, unknown> | null,
		...children: unknown[]
	): unknown;
	export function onMounted(callback: () => void): void;
	export function onBeforeUnmount(callback: () => void): void;
	export function ref<T>(value: T): Ref<T>;
	export function watch<T>(
		source: () => T,
		callback: (value: T, oldValue: T | undefined) => void,
		options?: Record<string, unknown>,
	): void;
}
