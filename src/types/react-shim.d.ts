declare module "react" {
	export type ReactElement = unknown;
	export type CSSProperties = Record<string, string | number | undefined>;

	export interface MutableRefObject<T> {
		current: T;
	}

	export type RefCallback<T> = (instance: T | null) => void;
	export type Ref<T> = RefCallback<T> | MutableRefObject<T | null> | null;

	export interface RefAttributes<T> {
		ref?: Ref<T>;
	}

	export type ForwardRefExoticComponent<P> = (props: P) => ReactElement | null;

	export function createElement(
		type: unknown,
		props?: Record<string, unknown> | null,
		...children: unknown[]
	): ReactElement;

	export function forwardRef<T, P = Record<PropertyKey, never>>(
		render: (props: P, ref: Ref<T>) => ReactElement | null,
	): ForwardRefExoticComponent<P & RefAttributes<T>>;

	export function useEffect(
		// biome-ignore lint/suspicious/noConfusingVoidType: React effects may return no value or a cleanup callback.
		effect: () => void | (() => void),
		deps?: readonly unknown[],
	): void;

	export function useImperativeHandle<T, R extends T>(
		ref: Ref<T> | undefined,
		init: () => R | null,
		deps?: readonly unknown[],
	): void;

	export function useRef<T>(initialValue: T): MutableRefObject<T>;
}
