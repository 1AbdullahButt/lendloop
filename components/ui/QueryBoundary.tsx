"use client";

import { Component, type ReactNode } from "react";
import { errorCode, errorMessage } from "@/lib/errors";
import { ErrorState } from "./States";

type Props = {
  children: ReactNode;
  /** Shown instead of the generic error when the server answers FORBIDDEN. */
  forbidden?: ReactNode;
  /** Replaces the error box entirely (e.g. `null` in the header, where it would not fit). */
  fallback?: ReactNode;
};

type State = { error: unknown; hasError: boolean };

/**
 * Convex `useQuery` throws server errors during render, so every live list sits inside
 * one of these to turn a ConvexError into a readable message with a retry button.
 */
export class QueryBoundary extends Component<Props, State> {
  state: State = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, hasError: true };
  }

  private reset = () => this.setState({ error: null, hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    const { error } = this.state;
    if (errorCode(error) === "FORBIDDEN" && this.props.forbidden) return this.props.forbidden;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return <ErrorState message={errorMessage(error)} onRetry={this.reset} />;
  }
}
