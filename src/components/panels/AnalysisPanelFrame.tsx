/**
 * The shell shared by the tool panels that run one analysis on demand: the intro card, the
 * analyze button with its hint, the error banner and the place for the result below them.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalysisRunner } from '../../hooks/useAnalysisRunner';
import { useFileSelection, type FileSelectionHandlers } from '../../hooks/useFileSelection';
import { ErrorBanner, PanelCard, PanelHeader } from './PanelParts';

/** The two shapes of an IPC answer: the data, or the reason it failed. */
type IpcResponse<T> = { success: true; data: T } | { success: false; error: string };

/** The data of a successful IPC answer; a failed one throws with its error message. */
export function unwrapResponse<T>(response: IpcResponse<T>): T {
  if (!response.success) throw new Error(response.error || 'Unknown error');
  return response.data;
}

interface AnalysisPanelFrameProps {
  eyebrow: string;
  title: string;
  description: string;
  /** One line beside the analyze button saying what the analysis does. */
  hint: string;
  analyzeLabel: string;
  analyzingLabel: string;
  isRunning: boolean;
  error: string | null;
  onAnalyze: () => void;
  /** The result view; rendered below the error banner once there is a result. */
  children?: React.ReactNode;
}

/** Layout of an on-demand analysis panel around its result. */
export const AnalysisPanelFrame: React.FC<AnalysisPanelFrameProps> = ({
  eyebrow,
  title,
  description,
  hint,
  analyzeLabel,
  analyzingLabel,
  isRunning,
  error,
  onAnalyze,
  children,
}) => (
  <div className="space-y-4 p-4">
    <PanelHeader eyebrow={eyebrow} title={title} description={description} />

    <PanelCard className="flex items-center justify-between gap-3 p-4">
      <div className="text-[13px] text-(--t2)">{hint}</div>
      <button
        type="button"
        onClick={onAnalyze}
        disabled={isRunning}
        className="shrink-0 rounded-xl bg-(--acc) px-4 py-2.5 text-sm font-semibold text-(--bg0) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRunning ? analyzingLabel : analyzeLabel}
      </button>
    </PanelCard>

    {error && <ErrorBanner className="px-4 py-3 text-sm text-(--red)">{error}</ErrorBanner>}

    {children}
  </div>
);

/** The locale sections whose keys name the texts of an analysis panel. */
type PanelNamespace = 'duplicates' | 'documentation';

/** The intro texts that live outside the panel's own locale section, by panel. */
const INTRO_KEYS = {
  duplicates: {
    eyebrow: 'tools.quickActions.cleanup',
    description: 'tools.quickActions.duplicatesDescription',
  },
  documentation: {
    eyebrow: 'tools.quickActions.docs',
    description: 'tools.quickActions.documentationDescription',
  },
} as const satisfies Record<PanelNamespace, { eyebrow: string; description: string }>;

interface AnalysisPanelProps<T> {
  /** Locale section holding `title`, `hint`, `analyze`, `analyzing` and `error`. */
  namespace: PanelNamespace;
  /** Runs the analysis in the main process. */
  request: () => Promise<T>;
  /** Draws the result once it arrived; `selection` selects a file of the result in the graph. */
  children: (result: T, selection: FileSelectionHandlers) => React.ReactNode;
}

/** An on-demand analysis panel: runs `request` on click and shows the result or the error. */
export function AnalysisPanel<T>({ namespace, request, children }: AnalysisPanelProps<T>) {
  const { t } = useTranslation();
  const { isRunning, result, error, run } = useAnalysisRunner<T>();
  const selection = useFileSelection();
  return (
    <AnalysisPanelFrame
      eyebrow={t(INTRO_KEYS[namespace].eyebrow)}
      title={t(`${namespace}.title`)}
      description={t(INTRO_KEYS[namespace].description)}
      hint={t(`${namespace}.hint`)}
      analyzeLabel={t(`${namespace}.analyze`)}
      analyzingLabel={t(`${namespace}.analyzing`)}
      isRunning={isRunning}
      error={error}
      onAnalyze={() => run(request, t(`${namespace}.error`))}
    >
      {result && children(result, selection)}
    </AnalysisPanelFrame>
  );
}
