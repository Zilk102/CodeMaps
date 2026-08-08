// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import ErrorBoundary from '../ErrorBoundary';
import en from '../../i18n/locales/en.json';

// Resolve against the real English catalogue rather than a passthrough stub, so a
// missing translation key fails the test instead of rendering the key name.
const translate = (key: string) =>
  key.split('.').reduce<unknown>((value, segment) => {
    if (value && typeof value === 'object' && segment in value) {
      return (value as Record<string, unknown>)[segment];
    }
    return undefined;
  }, en) as string | undefined;

vi.mock('react-i18next', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTranslation: () => (Component: any) => {
    const TranslatedComponent = (props: Record<string, unknown>) => (
      <Component {...props} t={translate} />
    );
    TranslatedComponent.displayName = `withTranslation(${Component.displayName || Component.name || 'Component'})`;
    return TranslatedComponent;
  },
}));

const ProblemChild = () => {
  throw new Error('Test error');
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Safe Child</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });

  it('renders fallback UI when a child throws an error', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred in the application/)).toBeInTheDocument();
    expect(screen.getByText(/Test error/)).toBeInTheDocument();
  });

  it('calls window.location.reload when reload button is clicked', () => {
    const originalLocation = window.location;
    // @ts-expect-error - overriding readonly location
    window.location = { ...originalLocation, reload: vi.fn() } as unknown as Location;

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByText('Reload App');
    fireEvent.click(reloadButton);

    expect(window.location.reload).toHaveBeenCalled();

    // Restore
    // @ts-expect-error - restoring readonly location
    window.location = originalLocation;
  });
});
