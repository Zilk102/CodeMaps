// JS/TS (`x.test.ts`, `__tests__/`), Go (`x_test.go`), Python (`test_x.py`, `x_test.py`),
// Java/Kotlin (`XTest.java`) and Rust (`tests/`).
const TEST_PATH = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[a-z]+$/i;
const TEST_FILE_NAME = /_test\.(go|py|rs)$|(^|\/)test_[^/]+\.py$|(Test|Tests|IT)\.(java|kt)$/;

/** Whether a path names a test file, in any of the supported languages. */
export const isTestFile = (file: string): boolean => {
  const normalized = file.replace(/\\/g, '/');
  return TEST_PATH.test(normalized) || TEST_FILE_NAME.test(normalized);
};
