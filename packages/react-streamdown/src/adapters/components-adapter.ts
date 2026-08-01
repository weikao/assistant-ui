"use client";

import { useMemo } from "react";
import type { StreamdownProps } from "streamdown";
import { createCodeAdapter, shouldUseCodeAdapter } from "./code-adapter";
import { PreOverride } from "./PreOverride";
import type { ComponentsByLanguage, StreamdownTextComponents } from "../types";

interface UseAdaptedComponentsOptions {
  components?: StreamdownTextComponents | undefined;
  componentsByLanguage?: ComponentsByLanguage | undefined;
}

/**
 * Hook that adapts assistant-ui component API to streamdown's component API.
 *
 * Handles:
 * - SyntaxHighlighter -> custom code component
 * - CodeHeader -> custom code component
 * - componentsByLanguage -> custom code component with language dispatch
 * - PreOverride -> streamdown-style data-block marking plus pre props context
 */
export function useAdaptedComponents({
  components,
  componentsByLanguage,
}: UseAdaptedComponentsOptions): StreamdownProps["components"] {
  return useMemo(() => {
    const { SyntaxHighlighter, CodeHeader, ...htmlComponents } =
      components ?? {};

    const codeAdapterOptions = {
      SyntaxHighlighter,
      CodeHeader,
      componentsByLanguage,
    };

    if (!shouldUseCodeAdapter(codeAdapterOptions)) {
      // Respect a user-provided `pre` override (e.g. custom code block action
      // bars). The custom component is then responsible for marking the child
      // code element with data-block, mirroring PreOverride's behavior.
      return { ...htmlComponents, pre: htmlComponents.pre ?? PreOverride };
    }

    const AdaptedCode = createCodeAdapter(codeAdapterOptions);

    return {
      ...htmlComponents,
      // The code adapter relies on PreOverride's data-block marking and
      // PreContext, so a user `pre` override cannot be honored here.
      pre: PreOverride,
      code: AdaptedCode,
    };
  }, [components, componentsByLanguage]);
}
