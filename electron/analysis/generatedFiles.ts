// Code that is generated or machine-written repeats by construction and is never edited by hand:
// clone detection and documentation coverage both leave it out.
const GENERATED_PATH =
  /(^|\/)(migrations|generated|__generated__|gen|vendor|third_party)\/|\.pb\.go$|_pb2(_grpc)?\.pyi?$|\.(generated|g|designer)\.[a-z]+$|\.min\.js$/;
const GENERATED_MARKER =
  /@generated|code generated .{0,60}do not edit|do not edit (this file|manually)|auto-?generated (file|code)|this file (is|was) (auto-?)?generated/i;

/** Whether a path names generated code, by folder or file name. */
export const isGeneratedPath = (file: string): boolean =>
  GENERATED_PATH.test(file.replace(/\\/g, '/'));

/** Whether the top of a file says it was generated (`@generated`, `Code generated ... DO NOT EDIT`). */
export const hasGeneratedMarker = (text: string): boolean =>
  GENERATED_MARKER.test(text.slice(0, 600));
