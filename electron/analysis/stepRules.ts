/** A rule that yields one next-step sentence, or null when it does not apply. */
export type StepRule<I> = (input: I) => string | null;

/** The rule yields `step` (fixed text, or built from the input) when `applies` holds. */
export function stepWhen<I>(
  applies: (input: I) => boolean,
  step: string | ((input: I) => string)
): StepRule<I> {
  return (input) => {
    if (!applies(input)) return null;
    return typeof step === 'string' ? step : step(input);
  };
}

/** The rule yields `step` while `select` finds something (a non-empty list). */
export function stepIfAny<I>(
  select: (input: I) => readonly unknown[],
  step: string | ((input: I) => string)
): StepRule<I> {
  return stepWhen((input) => select(input).length > 0, step);
}

/** Runs the rules in order and keeps the steps of those that applied. */
export function applyStepRules<I>(rules: Array<StepRule<I>>, input: I): string[] {
  return rules.map((rule) => rule(input)).filter((step): step is string => step !== null);
}
