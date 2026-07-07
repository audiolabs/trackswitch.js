// Embedded SVG path data in this file is derived from Font Awesome Free 7.2.0.
// Font Awesome Free icons are licensed under CC BY 4.0:
// https://creativecommons.org/licenses/by/4.0/

export type TrackSwitchIconName =
	| "loop-a"
	| "loop-b"
	| "play"
	| "pause"
	| "stop"
	| "repeat"
	| "rotate-right"
	| "xmark"
	| "power-off"
	| "spinner"
	| "exclamation"
	| "circle-info"
	| "triangle-exclamation"
	| "circle"
	| "circle-check"
	| "circle-dot"
	| "volume-xmark"
	| "volume"
	| "volume-low"
	| "volume-high"
	| "gear"
	| "upload"
	| "file-audio"
	| "file-code"
	| "trash";

const ICON_SVG_BY_NAME: Record<TrackSwitchIconName, string> = {
	"loop-a":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="2.75" ry="2.75" fill="none" stroke="currentColor" stroke-width="1.5"></rect><path d="M8.3 17.2L12 6.8L15.7 17.2M9.4 13.9H14.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
	"loop-b":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="2.75" ry="2.75" fill="none" stroke="currentColor" stroke-width="1.5"></rect><path d="M8.8 6.9V17.1M8.8 6.9H12.7C14.4 6.9 15.5 7.9 15.5 9.4C15.5 10.8 14.5 11.7 12.9 11.8M8.8 11.8H13.2C15 11.8 16.1 12.8 16.1 14.5C16.1 16.1 14.8 17.1 12.8 17.1H8.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
	play: '<svg class="ts-icon-svg" role="img" viewBox="32 36 416 440" aria-hidden="true"><path fill="currentColor" d="M91.2 36.9c-12.4-6.8-27.4-6.5-39.6 .7S32 57.9 32 72l0 368c0 14.1 7.5 27.2 19.6 34.4s27.2 7.5 39.6 .7l336-184c12.8-7 20.8-20.5 20.8-35.1s-8-28.1-20.8-35.1l-336-184z"></path></svg>',
	pause:
		'<svg class="ts-icon-svg" role="img" viewBox="0 32 384 448" aria-hidden="true"><path fill="currentColor" d="M48 32C21.5 32 0 53.5 0 80L0 432c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48L48 32zm224 0c-26.5 0-48 21.5-48 48l0 352c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48l-64 0z"></path></svg>',
	stop: '<svg class="ts-icon-svg" role="img" viewBox="0 32 448 448" aria-hidden="true"><path fill="currentColor" d="M64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32z"></path></svg>',
	repeat:
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M470.6 118.6c12.5-12.5 12.5-32.8 0-45.3l-64-64c-9.2-9.2-22.9-11.9-34.9-6.9S352 19.1 352 32l0 32-160 0C86 64 0 150 0 256 0 273.7 14.3 288 32 288s32-14.3 32-32c0-70.7 57.3-128 128-128l160 0 0 32c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l64-64zM41.4 393.4c-12.5 12.5-12.5 32.8 0 45.3l64 64c9.2 9.2 22.9 11.9 34.9 6.9S160 492.9 160 480l0-32 160 0c106 0 192-86 192-192 0-17.7-14.3-32-32-32s-32 14.3-32 32c0 70.7-57.3 128-128 128l-160 0 0-32c0-12.9-7.8-24.6-19.8-29.6s-25.7-2.2-34.9 6.9l-64 64z"></path></svg>',
	"rotate-right":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M488 192l-144 0c-9.7 0-18.5-5.8-22.2-14.8s-1.7-19.3 5.2-26.2l46.7-46.7c-75.3-58.6-184.3-53.3-253.5 15.9-75 75-75 196.5 0 271.5s196.5 75 271.5 0c8.2-8.2 15.5-16.9 21.9-26.1 10.1-14.5 30.1-18 44.6-7.9s18 30.1 7.9 44.6c-8.5 12.2-18.2 23.8-29.1 34.7-100 100-262.1 100-362 0S-25 175 75 75c94.3-94.3 243.7-99.6 344.3-16.2L471 7c6.9-6.9 17.2-8.9 26.2-5.2S512 14.3 512 24l0 144c0 13.3-10.7 24-24 24z"></path></svg>',
	xmark:
		'<svg class="ts-icon-svg" role="img" viewBox="0 73 384 366" aria-hidden="true"><path fill="currentColor" d="M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z"></path></svg>',
	"power-off":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M288 0c0-17.7-14.3-32-32-32S224-17.7 224 0l0 256c0 17.7 14.3 32 32 32s32-14.3 32-32L288 0zM146.3 98.4c14.5-10.1 18-30.1 7.9-44.6s-30.1-18-44.6-7.9C43.4 92.1 0 169 0 256 0 397.4 114.6 512 256 512S512 397.4 512 256c0-87-43.4-163.9-109.7-210.1-14.5-10.1-34.4-6.6-44.6 7.9s-6.6 34.4 7.9 44.6c49.8 34.8 82.3 92.4 82.3 157.6 0 106-86 192-192 192S64 362 64 256c0-65.2 32.5-122.9 82.3-157.6z"></path></svg>',
	spinner:
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M208 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm0 416a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM48 208a48 48 0 1 1 0 96 48 48 0 1 1 0-96zm368 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM75 369.1A48 48 0 1 1 142.9 437 48 48 0 1 1 75 369.1zM75 75A48 48 0 1 1 142.9 142.9 48 48 0 1 1 75 75zM437 369.1A48 48 0 1 1 369.1 437 48 48 0 1 1 437 369.1z"></path></svg>',
	exclamation:
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 128 512" aria-hidden="true"><path fill="currentColor" d="M64 432c22.1 0 40 17.9 40 40s-17.9 40-40 40-40-17.9-40-40c0-22.1 17.9-40 40-40zM64 0c26.5 0 48 21.5 48 48 0 .6 0 1.1 0 1.7l-16 304c-.9 17-15 30.3-32 30.3S33 370.7 32 353.7L16 49.7c0-.6 0-1.1 0-1.7 0-26.5 21.5-48 48-48z"></path></svg>',
	"circle-info":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM224 160a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm-8 64l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z"></path></svg>',
	"triangle-exclamation":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M256 0c14.7 0 28.2 8.1 35.2 21l216 400c6.7 12.4 6.4 27.4-.8 39.5S486.1 480 472 480L40 480c-14.1 0-27.2-7.4-34.4-19.5s-7.5-27.1-.8-39.5l216-400c7-12.9 20.5-21 35.2-21zm0 352a32 32 0 1 0 0 64 32 32 0 1 0 0-64zm0-192c-18.2 0-32.7 15.5-31.4 33.7l7.4 104c.9 12.5 11.4 22.3 23.9 22.3 12.6 0 23-9.7 23.9-22.3l7.4-104c1.3-18.2-13.1-33.7-31.4-33.7z"></path></svg>',
	circle:
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M464 256a208 208 0 1 0 -416 0 208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0z"></path></svg>',
	"circle-check":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M256 512a256 256 0 1 1 0-512 256 256 0 1 1 0 512zm0-464a208 208 0 1 0 0 416 208 208 0 1 0 0-416zm70.7 121.9c7.8-10.7 22.8-13.1 33.5-5.3 10.7 7.8 13.1 22.8 5.3 33.5L243.4 366.1c-4.1 5.7-10.5 9.3-17.5 9.8-7 .5-13.9-2-18.8-6.9l-55.9-55.9c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l36 36 105.6-145.2z"></path></svg>',
	"circle-dot":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M256 512a256 256 0 1 1 0-512 256 256 0 1 1 0 512zm0-464a208 208 0 1 0 0 416 208 208 0 1 0 0-416zm0 304a96 96 0 1 1 0-192 96 96 0 1 1 0 192z"></path></svg>',
	"volume-xmark":
		'<svg preserveAspectRatio="xMinYMid meet" class="ts-icon-svg" role="img" viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM367 175c-9.4 9.4-9.4 24.6 0 33.9l47 47-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l47-47 47 47c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-47-47 47-47c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-47 47-47-47c-9.4-9.4-24.6-9.4-33.9 0z"></path></svg>',
	volume:
		'<svg preserveAspectRatio="xMinYMid meet" class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM441.1 107c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C443.3 170.7 464 210.9 464 256s-20.7 85.3-53.2 111.8c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5c43.2-35.2 70.9-88.9 70.9-149s-27.7-113.8-70.9-149zm-60.5 74.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C361.1 227.6 368 241 368 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C402.1 312.9 416 286.1 416 256s-13.9-56.9-35.5-74.5z"></path></svg>',
	"volume-low":
		'<svg preserveAspectRatio="xMinYMid meet" class="ts-icon-svg" role="img" viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM380.6 181.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C361.1 227.6 368 241 368 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C402.1 312.9 416 286.1 416 256s-13.9-56.9-35.5-74.5z"></path></svg>',
	"volume-high":
		'<svg preserveAspectRatio="xMinYMid meet" class="ts-icon-svg" role="img" viewBox="0 0 640 512" aria-hidden="true"><path fill="currentColor" d="M533.6 32.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C557.5 113.8 592 180.8 592 256s-34.5 142.2-88.7 186.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C598.5 426.7 640 346.2 640 256S598.5 85.2 533.6 32.5zM473.1 107c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C475.3 170.7 496 210.9 496 256s-20.7 85.3-53.2 111.8c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5c43.2-35.2 70.9-88.9 70.9-149s-27.7-113.8-70.9-149zm-60.5 74.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C393.1 227.6 400 241 400 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C434.1 312.9 448 286.1 448 256s-13.9-56.9-35.4-74.5zM80 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L128 160 80 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48z"></path></svg>',
	gear: '<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z"></path></svg>',
	upload:
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M288 109.3L288 352c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-242.7-73.4 73.4c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l128-128c12.5-12.5 32.8-12.5 45.3 0l128 128c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L288 109.3zM64 352l128 0c0 35.3 28.7 64 64 64s64-28.7 64-64l128 0c35.3 0 64 28.7 64 64l0 32c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64l0-32c0-35.3 28.7-64 64-64zm368 56a24 24 0 1 0 0 48 24 24 0 1 0 0-48z"></path></svg>',
	"file-audio":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-288-128 0c-17.7 0-32-14.3-32-32L224 0 64 0zM256 0l0 128 128 0L256 0zM192 352l0-64c0-6.5-3.9-12.3-9.9-14.8s-12.9-1.1-17.4 3.5L129.2 312 112 312c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l17.2 0 35.5 35.3c4.6 4.6 11.5 5.9 17.4 3.5s9.9-8.3 9.9-14.8zm43-45.6c14.5 11.2 24 28.9 24 48.6s-9.5 37.4-24 48.6c-7 5.4-17.1 4.1-22.5-2.9s-4.1-17.1 2.9-22.5c7.2-5.6 11.6-14.2 11.6-23.2s-4.4-17.6-11.6-23.2c-7-5.4-8.4-15.5-2.9-22.5s15.5-8.4 22.5-2.9zm60.6-29c24.2 18.6 40.4 48.5 40.4 81.6s-16.2 63-40.4 81.6c-7 5.4-17.1 4.1-22.5-2.9s-4.1-17.1 2.9-22.5c16.9-13 27.6-33.2 27.6-56.2s-10.7-43.2-27.6-56.2c-7-5.4-8.4-15.5-2.9-22.5s15.5-8.4 22.5-2.9z"></path></svg>',
	"file-code":
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-288-128 0c-17.7 0-32-14.3-32-32L224 0 64 0zM256 0l0 128 128 0L256 0zM153 289l-31 31 31 31c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0L71 337c-9.4-9.4-9.4-24.6 0-33.9l48-48c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9zM265 255l48 48c9.4 9.4 9.4 24.6 0 33.9l-48 48c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l31-31-31-31c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0z"></path></svg>',
	trash:
		'<svg class="ts-icon-svg" role="img" viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M135.2 17.7L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-7.2-14.3C307.4 6.8 296.3 0 284.2 0L163.8 0c-12.1 0-23.2 6.8-28.6 17.7zM416 128L32 128 53.2 467c1.6 25.3 22.6 45 47.9 45l245.8 0c25.3 0 46.3-19.7 47.9-45L416 128z"></path></svg>',
};

export function renderIconSlotHtml(
	iconName: TrackSwitchIconName,
	extraClassName = "",
): string {
	const className = extraClassName
		? `ts-icon-slot ${extraClassName}`
		: "ts-icon-slot";
	return (
		'<span class="' +
		className +
		'" data-icon="' +
		iconName +
		'" aria-hidden="true">' +
		ICON_SVG_BY_NAME[iconName] +
		"</span>"
	);
}

export function getHostIconSlot(host: HTMLElement): HTMLElement | null {
	const slot = host.querySelector(".ts-icon-slot");
	return slot instanceof HTMLElement ? slot : null;
}

export function setIconSlot(
	slot: HTMLElement,
	iconName: TrackSwitchIconName,
): void {
	if (slot.getAttribute("data-icon") === iconName) {
		return;
	}

	slot.setAttribute("data-icon", iconName);
	slot.innerHTML = ICON_SVG_BY_NAME[iconName];
}

export function setHostIcon(
	host: HTMLElement,
	iconName: TrackSwitchIconName,
): void {
	let slot = getHostIconSlot(host);
	if (!slot) {
		slot = host.ownerDocument.createElement("span");
		slot.className = "ts-icon-slot";
		slot.setAttribute("aria-hidden", "true");
		host.prepend(slot);
	}

	setIconSlot(slot, iconName);
}
