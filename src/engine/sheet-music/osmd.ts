import osmdPackage from "opensheetmusicdisplay";

type OpenSheetMusicDisplayModule = typeof import("opensheetmusicdisplay");

const osmdInterop = osmdPackage as unknown as OpenSheetMusicDisplayModule;

export const CursorType = osmdInterop.CursorType;
export const GraphicalMeasure = osmdInterop.GraphicalMeasure;
export const OpenSheetMusicDisplay = osmdInterop.OpenSheetMusicDisplay;
export const PointF2D = osmdInterop.PointF2D;

export type GraphicalMeasureType =
	import("opensheetmusicdisplay").GraphicalMeasure;
export type OpenSheetMusicDisplayType =
	import("opensheetmusicdisplay").OpenSheetMusicDisplay;
export type PointF2DType = import("opensheetmusicdisplay").PointF2D;
